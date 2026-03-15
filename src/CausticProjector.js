/**
 * CausticProjector
 *
 * Computes physically-inspired caustic light patterns cast by an arbitrary
 * refractive mesh onto arbitrary receiver surfaces, using Three.js.
 *
 * Extends martinRenou/threejs-caustics to support:
 *   - Any caster geometry (not just flat water)
 *   - N-pass chromatic dispersion with full colour control
 *   - Temporal accumulation (motion trails)
 *   - Two-pass Gaussian blur (soft caustic edges)
 *   - Animated UV warp + flicker post-effects
 *   - Dynamic light position and angle
 *
 * Pipeline per frame:
 *   1. ENV PASS    — render receivers from light POV → world XYZ + depth texture
 *   2. CAUSTICS    — N passes, each with a slightly different eta and hue,
 *                    additive-blended into cauRT using area-ratio intensity
 *   3. ACCUMULATE  — ping-pong blend of cauRT with previous frame (trails)
 *   4. BLUR H/V    — separable Gaussian blur on the accumulated texture
 *   5. MAIN SCENE  — receivers sample the final caustics texture
 *
 * Usage:
 *   const projector = new CausticProjector(renderer, { eta: 0.75, passes: 16 })
 *   projector.addCaster(myMesh)
 *   projector.addReceiver(floorMesh)
 *   // in animate loop:
 *   projector.update(lightPosition, lightDirection)
 *   renderer.render(scene, camera)
 */

import * as THREE from 'three';
import { CausticMaterial }  from './CausticMaterial.js';
import { ReceiverMaterial } from './ReceiverMaterial.js';
import { PostProcess }      from './PostProcess.js';

export class CausticProjector {
  /**
   * @param {THREE.WebGLRenderer} renderer
   * @param {object} options
   * @param {number}  [options.eta=0.75]          Refractive index
   * @param {number}  [options.spread=4.0]         Ray travel distance / defocus
   * @param {number}  [options.passes=16]          Number of chromatic dispersion passes
   * @param {number}  [options.dispersion=0.04]    Eta spread across passes
   * @param {number}  [options.intensity=0.02]     Caustic brightness
   * @param {number}  [options.hueRange=0.5]       0=mono, 1=full spectrum
   * @param {number}  [options.hueStart=0.0]       Spectrum rotation
   * @param {number}  [options.trails=0.6]         Temporal accumulation blend
   * @param {number}  [options.blur=1.5]           Gaussian blur radius
   * @param {number}  [options.gamma=1.0]          Contrast curve
   * @param {number}  [options.warp=0.0]           UV noise warp amount
   * @param {number}  [options.warpSpeed=0.2]      Warp animation speed
   * @param {number}  [options.flicker=0.0]        Random intensity flicker
   * @param {number}  [options.dispersionMode=0]   0=radial, 1=tangent edge-aligned
   * @param {number}  [options.tangentStrength=0.3] Tangent dispersion strength
   * @param {number}  [options.waveAmp=0.0]         Wave displacement amplitude (0 = off)
   * @param {number}  [options.waveFreq=4.0]        Wave spatial frequency
   * @param {number}  [options.waveSpeed=0.5]       Wave animation speed
   * @param {number}  [options.envSize=2048]        Env map resolution
   * @param {number}  [options.causticSize=2048]    Caustic texture resolution
   */
  constructor(renderer, options = {}) {
    this.renderer = renderer;

    // ── Options with defaults ────────────────────────────────────────────────
    this.opts = {
      eta:              0.75,
      spread:           4.0,
      passes:           16,
      dispersion:       0.04,
      intensity:        0.02,
      hueRange:         0.5,
      hueStart:         0.0,
      trails:           0.6,
      blur:             1.5,
      gamma:            1.0,
      warp:             0.0,
      warpSpeed:        0.2,
      flicker:          0.0,
      dispersionMode:   0,
      tangentStrength:  0.3,
      waveAmp:          0.0,
      waveFreq:         4.0,
      waveSpeed:        0.5,
      envSize:          2048,
      causticSize:      2048,
      ...options,
    };

    // ── Render targets ───────────────────────────────────────────────────────
    const envSize = this.opts.envSize;
    const cauSize = this.opts.causticSize;
    const rtOpts  = { type: THREE.FloatType };

    this.envRT      = new THREE.WebGLRenderTarget(envSize, envSize, rtOpts);
    this.cauRT      = new THREE.WebGLRenderTarget(cauSize, cauSize, rtOpts);
    this.cauRTA     = new THREE.WebGLRenderTarget(cauSize, cauSize, rtOpts); // ping
    this.cauRTB     = new THREE.WebGLRenderTarget(cauSize, cauSize, rtOpts); // pong
    this.cauAccumRead  = this.cauRTA;
    this.cauAccumWrite = this.cauRTB;

    // ── Light camera ─────────────────────────────────────────────────────────
    this.projCam = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 50);
    this.projCam.position.set(0, 8, 0);
    this.projCam.lookAt(0, 0, 0);
    this.projCam.updateMatrixWorld(true);

    // ── Internal scenes ──────────────────────────────────────────────────────
    this.envScene      = new THREE.Scene(); // receivers rendered for env map
    this.cauScene      = new THREE.Scene(); // caster rendered for caustics

    // ── Shader modules ───────────────────────────────────────────────────────
    this.causticMat = new CausticMaterial(this.opts);
    this.post       = new PostProcess(renderer, cauSize, this.opts);

    // ── Tracked meshes ───────────────────────────────────────────────────────
    this._casters   = [];
    this._receivers = [];

    // Env map material — writes world XYZ + depth
    this._envMapMat = new THREE.ShaderMaterial({
      vertexShader:   /* glsl */`
        varying vec4 wPos;
        varying float dep;
        void main() {
          wPos = modelMatrix * vec4(position, 1.0);
          vec4 p = projectionMatrix * viewMatrix * wPos;
          dep = p.z;
          gl_Position = p;
        }`,
      fragmentShader: /* glsl */`
        varying vec4 wPos;
        varying float dep;
        void main() { gl_FragColor = vec4(wPos.xyz, dep); }`,
    });
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Add a mesh as a refractive caster.
   * The mesh will be rendered into the caustics texture each frame.
   * @param {THREE.Mesh} mesh
   */
  addCaster(mesh) {
    const cauMesh = new THREE.Mesh(mesh.geometry, this.causticMat.material);
    cauMesh.position.copy(mesh.position);
    cauMesh.rotation.copy(mesh.rotation);
    cauMesh.scale.copy(mesh.scale);
    cauMesh.userData._sourceMesh = mesh; // keep reference for transform sync
    this.cauScene.add(cauMesh);
    this._casters.push(cauMesh);
    return this;
  }

  /**
   * Add a mesh as a caustic receiver.
   * The mesh will have caustics projected onto it.
   * @param {THREE.Mesh} mesh
   * @param {object} [matOptions]  Options passed to ReceiverMaterial
   */
  addReceiver(mesh, matOptions = {}) {
    const recMat = new ReceiverMaterial(this.projCam, matOptions);
    mesh.material = recMat.material;
    mesh.userData._receiverMat = recMat;

    // Mirror into env scene
    const envMesh = new THREE.Mesh(mesh.geometry, this._envMapMat);
    envMesh.position.copy(mesh.position);
    envMesh.rotation.copy(mesh.rotation);
    envMesh.scale.copy(mesh.scale);
    envMesh.userData._sourceMesh = mesh;
    this.envScene.add(envMesh);

    this._receivers.push(mesh);
    return this;
  }

  /**
   * Update and render all caustic passes.
   * Call this once per frame before rendering your main scene.
   *
   * @param {THREE.Vector3} lightPos  World-space light position
   * @param {THREE.Vector3} lightDir  Normalised light direction (should point downward)
   * @param {number}        time      Elapsed time in seconds (for animation)
   */
  update(lightPos, lightDir, time = 0) {
    const cam = this.projCam;

    // Update light camera — always look straight down so the env map is a top-down
    // depth capture regardless of where the scene objects are in world space.
    // lookAt(x, 0, z) keeps x/z the same as the light, only changes y → pure downward.
    cam.position.copy(lightPos);
    cam.lookAt(lightPos.x, 0, lightPos.z);

    // Frustum covers the area directly below the light.
    // Camera always looks straight down; spread bounds how far rays can
    // project laterally, so use it as the frustum half-width base.
    const f = Math.max(6, this.opts.spread) + Math.abs(lightPos.x) * 1.2;
    cam.left = -f; cam.right = f; cam.top = f; cam.bottom = -f;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);

    // Sync caster transforms from source meshes
    this._casters.forEach(c => {
      const src = c.userData._sourceMesh;
      if (src) {
        c.position.copy(src.position);
        c.rotation.copy(src.rotation);
        c.scale.copy(src.scale);
      }
    });

    // Sync env scene transforms
    this.envScene.children.forEach(e => {
      const src = e.userData._sourceMesh;
      if (src) {
        e.position.copy(src.position);
        e.rotation.copy(src.rotation);
        e.scale.copy(src.scale);
      }
    });

    // 1. Render env map
    this._renderEnvMap();

    // 2. Update caustic material uniforms and render N passes
    this.causticMat.update(lightDir, this.envRT.texture, cam, this.opts, time);
    this._renderCaustics(time);

    // 3. Post-process (accumulate + blur)
    const finalTex = this.post.render(this.cauRT, this.opts, time);

    // 4. Update receiver uniforms
    this._receivers.forEach(m => {
      const mat = m.userData._receiverMat;
      if (mat) mat.update(cam, finalTex, this.opts, time);
    });
  }

  /**
   * Update a specific option at runtime (e.g. from a UI slider).
   * @param {string} key
   * @param {*}      value
   */
  set(key, value) {
    this.opts[key] = value;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  _renderEnvMap() {
    const r = this.renderer;
    r.setRenderTarget(this.envRT);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(this.envScene, this.projCam);
  }

  _renderCaustics(time) {
    const r   = this.renderer;
    const mat = this.causticMat;

    r.setRenderTarget(this.cauRT);
    r.setClearColor(0x000000, 0);
    r.clear();

    const N = this.opts.passes;
    for (let i = 0; i < N; i++) {
      mat.setPass(i, N, this.opts, time);
      r.render(this.cauScene, this.projCam);
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  dispose() {
    this.envRT.dispose();
    this.cauRT.dispose();
    this.cauRTA.dispose();
    this.cauRTB.dispose();
    this.causticMat.dispose();
    this.post.dispose();
  }
}
