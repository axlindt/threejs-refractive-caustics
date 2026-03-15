/**
 * PostProcess
 *
 * Handles temporal accumulation (motion trails) and two-pass Gaussian blur
 * on the raw caustics texture.
 *
 * Pipeline:
 *   cauRT (raw frame) → blend with previous → blurH → blurV → final texture
 */

import * as THREE from 'three';

const quadVert = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

export class PostProcess {
  constructor(renderer, size, opts = {}) {
    this.renderer = renderer;
    const rtOpts  = { type: THREE.FloatType };

    // Ping-pong accumulation targets
    this.accumA = new THREE.WebGLRenderTarget(size, size, rtOpts);
    this.accumB = new THREE.WebGLRenderTarget(size, size, rtOpts);
    this.accumRead  = this.accumA;
    this.accumWrite = this.accumB;

    // Blur intermediary
    this.blurRT1 = new THREE.WebGLRenderTarget(size, size, rtOpts);
    this.blurRT2 = new THREE.WebGLRenderTarget(size, size, rtOpts);

    // Fullscreen quad setup
    this._cam   = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const plane = new THREE.PlaneGeometry(2, 2);

    // Blend material
    this._blendMat = new THREE.ShaderMaterial({
      uniforms: { tNew: { value: null }, tOld: { value: null }, blend: { value: 0.6 } },
      vertexShader: quadVert,
      fragmentShader: /* glsl */`
        uniform sampler2D tNew;
        uniform sampler2D tOld;
        uniform float blend;
        varying vec2 vUv;
        void main() { gl_FragColor = mix(texture2D(tNew, vUv), texture2D(tOld, vUv), blend); }`,
    });

    // Blur materials (H and V share same shader, different direction uniform)
    const blurFrag = /* glsl */`
      uniform sampler2D tInput;
      uniform vec2 direction;
      uniform float radius;
      uniform vec2 texelSize;
      varying vec2 vUv;
      void main() {
        float w[9];
        w[0]=0.0539; w[1]=0.1216; w[2]=0.1953; w[3]=0.2256; w[4]=0.2256;
        w[5]=0.1953; w[6]=0.1216; w[7]=0.0539; w[8]=0.0270;
        vec4 result = vec4(0.0);
        for (int i = 0; i < 9; i++) {
          result += texture2D(tInput, vUv + direction * texelSize * (float(i - 4) * radius)) * w[i];
        }
        gl_FragColor = result;
      }`;

    const ts = new THREE.Vector2(1 / size, 1 / size);
    this._blurMatH = new THREE.ShaderMaterial({
      uniforms: { tInput: { value: null }, direction: { value: new THREE.Vector2(1, 0) }, radius: { value: 1.5 }, texelSize: { value: ts } },
      vertexShader: quadVert, fragmentShader: blurFrag,
    });
    this._blurMatV = new THREE.ShaderMaterial({
      uniforms: { tInput: { value: null }, direction: { value: new THREE.Vector2(0, 1) }, radius: { value: 1.5 }, texelSize: { value: ts } },
      vertexShader: quadVert, fragmentShader: blurFrag,
    });

    // Interference RT — result of cancellation pass
    this.interfRT = new THREE.WebGLRenderTarget(size, size, rtOpts);

    // Interference material
    // Subtracts a time-offset, spatially-shifted copy of the caustic texture
    // from itself — simulates wave cancellation between two coherent light sources.
    // Where the two copies are in phase → bright. Out of phase → dark bands.
    this._interfMat = new THREE.ShaderMaterial({
      uniforms: {
        tInput:    { value: null },
        amount:    { value: 0.0 },  // 0 = off, 1 = full cancellation
        scale:     { value: 3.0 },  // spatial frequency of interference bands
        speed:     { value: 0.4 },  // animation speed
        time:      { value: 0.0 },
        texelSize: { value: ts },
      },
      vertexShader: quadVert,
      fragmentShader: /* glsl */`
        uniform sampler2D tInput;
        uniform float amount;
        uniform float scale;
        uniform float speed;
        uniform float time;
        uniform vec2  texelSize;
        varying vec2  vUv;
        void main() {
          if (amount < 0.001) { gl_FragColor = texture2D(tInput, vUv); return; }
          // Offset UV by a slowly drifting amount — second "virtual" light source
          vec2 offset = vec2(
            sin(time * speed * 0.7) * scale * texelSize.x * 80.0,
            cos(time * speed * 0.5) * scale * texelSize.y * 60.0
          );
          vec4 a = texture2D(tInput, vUv);
          vec4 b = texture2D(tInput, vUv + offset);
          // Interference: |a - b| gives cancellation bands, mix controls strength
          vec4 diff = abs(a - b);
          gl_FragColor = mix(a, diff, amount);
        }`,
    });

    // Scenes
    this._blendScene  = new THREE.Scene(); this._blendScene.add(new THREE.Mesh(plane, this._blendMat));
    this._blurSceneH  = new THREE.Scene(); this._blurSceneH.add(new THREE.Mesh(plane, this._blurMatH));
    this._blurSceneV  = new THREE.Scene(); this._blurSceneV.add(new THREE.Mesh(plane, this._blurMatV));
    this._interfScene = new THREE.Scene(); this._interfScene.add(new THREE.Mesh(plane, this._interfMat));
  }

  /**
   * Run post-processing pipeline.
   * @param  {THREE.WebGLRenderTarget} cauRT  Raw caustics frame
   * @param  {object}                  opts
   * @param  {number}                  time   Elapsed seconds (unused here, passed for future use)
   * @returns {THREE.Texture}                 Final texture to pass to receivers
   */
  render(cauRT, opts, time) {
    const r = this.renderer;

    // 1. Temporal blend
    this._blendMat.uniforms.tNew.value   = cauRT.texture;
    this._blendMat.uniforms.tOld.value   = this.accumRead.texture;
    this._blendMat.uniforms.blend.value  = opts.trails ?? 0.6;
    r.setRenderTarget(this.accumWrite);
    r.setClearColor(0, 0); r.clear();
    r.render(this._blendScene, this._cam);
    [this.accumRead, this.accumWrite] = [this.accumWrite, this.accumRead];

    // 2. Blur (skip if radius ≈ 0)
    const blur = opts.blur ?? 1.5;
    let finalTex = this.accumRead.texture;

    if (blur >= 0.05) {
      this._blurMatH.uniforms.tInput.value = finalTex;
      this._blurMatH.uniforms.radius.value = blur;
      r.setRenderTarget(this.blurRT1);
      r.setClearColor(0, 0); r.clear();
      r.render(this._blurSceneH, this._cam);

      this._blurMatV.uniforms.tInput.value = this.blurRT1.texture;
      this._blurMatV.uniforms.radius.value = blur;
      r.setRenderTarget(this.blurRT2);
      r.setClearColor(0, 0); r.clear();
      r.render(this._blurSceneV, this._cam);
      finalTex = this.blurRT2.texture;
    }

    // 3. Interference (skip if amount ≈ 0)
    if ((opts.interference ?? 0) >= 0.01) {
      finalTex = this._runInterference(finalTex, opts, time);
    }

    return finalTex;
  }

  _runInterference(inputTex, opts, time) {
    const r = this.renderer;
    const u = this._interfMat.uniforms;
    u.tInput.value  = inputTex;
    u.amount.value  = opts.interference     ?? 0.0;
    u.scale.value   = opts.interfScale      ?? 3.0;
    u.speed.value   = opts.interfSpeed      ?? 0.4;
    u.time.value    = time;
    r.setRenderTarget(this.interfRT);
    r.setClearColor(0, 0); r.clear();
    r.render(this._interfScene, this._cam);
    return this.interfRT.texture;
  }

  dispose() {
    this.accumA.dispose(); this.accumB.dispose();
    this.blurRT1.dispose(); this.blurRT2.dispose();
    this.interfRT.dispose();
    this._blendMat.dispose(); this._blurMatH.dispose(); this._blurMatV.dispose();
    this._interfMat.dispose();
  }
}
