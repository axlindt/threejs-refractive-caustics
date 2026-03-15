/**
 * ReceiverMaterial
 *
 * Applied to every receiver mesh. Projects the caustics texture onto the
 * surface using the light camera's projection matrix, with optional
 * Quilez palette colourmaps, gamma, UV warp, and flicker.
 */

import * as THREE from 'three';

export class ReceiverMaterial {
  /**
   * @param {THREE.OrthographicCamera} projCam
   * @param {object} opts
   * @param {number[]} [opts.baseColor=[0.76,0.78,0.83]]  RGB surface colour
   */
  constructor(projCam, opts = {}) {
    const [r, g, b] = opts.baseColor ?? [0.76, 0.78, 0.83];

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        lProjMat:    { value: new THREE.Matrix4() },
        lViewMat:    { value: new THREE.Matrix4() },
        causticsTex:  { value: null },
        baseColor:    { value: new THREE.Vector3(r, g, b) },
        paletteMode:  { value: 0 },
        palShift:     { value: 0.0 },
        gamma:        { value: 1.0 },
        warp:         { value: 0.0 },
        warpTime:     { value: 0.0 },
        flicker:      { value: 0.0 },
        iridescence:  { value: 0.0 },  // 0 = off, 1 = full soap-bubble hue shift
        iridScale:    { value: 1.0 },  // scale of the iridescence frequency
      },

      vertexShader: /* glsl */`
        uniform mat4 lProjMat;
        uniform mat4 lViewMat;
        varying float lInt;
        varying vec3  lPos;
        varying float vFresnel;
        void main() {
          vec3 wn  = normalize(mat3(modelMatrix) * normal);
          vec3 wp  = (modelMatrix * vec4(position, 1.0)).xyz;
          lInt = max(0.0, dot(wn, vec3(0.0, 1.0, 0.0)));
          vec4 lr = lProjMat * lViewMat * modelMatrix * vec4(position, 1.0);
          lPos = lr.xyz / lr.w * 0.5 + 0.5;
          // Fresnel-like term for iridescence — angle between surface normal and view
          vec3 viewDir = normalize(cameraPosition - wp);
          vFresnel = 1.0 - abs(dot(wn, viewDir));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,

      fragmentShader: /* glsl */`
        uniform sampler2D causticsTex;
        uniform vec3  baseColor;
        uniform int   paletteMode;
        uniform float palShift;
        uniform float gamma;
        uniform float warp;
        uniform float warpTime;
        uniform float flicker;
        uniform float iridescence;
        uniform float iridScale;
        varying float lInt;
        varying vec3  lPos;
        varying float vFresnel;

        vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
          return a + b * cos(6.28318 * (c * t + d));
        }
        vec3 applyPalette(float intensity) {
          float t = clamp(intensity * 6.0 + palShift, 0.0, 1.0);
          if (paletteMode == 1) return palette(t, vec3(0.5,0.2,0.1), vec3(0.5,0.3,0.1), vec3(1.0,0.8,0.5), vec3(0.0,0.1,0.3));
          if (paletteMode == 2) return palette(t, vec3(0.1,0.3,0.5), vec3(0.1,0.3,0.4), vec3(0.8,0.6,1.0), vec3(0.3,0.5,0.6));
          if (paletteMode == 3) return palette(t, vec3(0.5,0.5,0.5), vec3(0.5,0.5,0.5), vec3(1.0,1.0,1.0), vec3(0.0,0.33,0.67));
          if (paletteMode == 4) return palette(t, vec3(0.4,0.2,0.4), vec3(0.4,0.3,0.2), vec3(0.8,0.7,0.5), vec3(0.0,0.15,0.3));
          if (paletteMode == 5) return palette(t, vec3(0.5,0.5,0.0), vec3(0.5,0.5,0.3), vec3(1.0,0.7,0.4), vec3(0.0,0.2,0.5));
          return vec3(1.0);
        }

        // Iridescence — thin-film style hue shift based on view angle
        // Simulates the colour banding of soap bubbles or oil on water
        vec3 iridColor(float fresnel, float scale) {
          float t = fresnel * scale;
          // Cosine palette tuned to give vivid soap-bubble hues
          return palette(t,
            vec3(0.5, 0.5, 0.5),
            vec3(0.5, 0.5, 0.5),
            vec3(1.0, 0.7, 0.4),
            vec3(0.0, 0.15, 0.3)
          );
        }

        float hash(float n) { return fract(sin(n) * 43758.5453); }
        float vnoise(float t) {
          float i = floor(t); float f = fract(t);
          return mix(hash(i), hash(i+1.0), f*f*(3.0-2.0*f));
        }

        void main() {
          vec2 cauUV = lPos.xy;
          if (warp > 0.0) {
            float nx = sin(cauUV.x * 8.3 + warpTime * 0.7) * cos(cauUV.y * 6.1 + warpTime * 0.5);
            float ny = cos(cauUV.x * 7.1 - warpTime * 0.6) * sin(cauUV.y * 9.2 + warpTime * 0.8);
            cauUV += vec2(nx, ny) * warp;
          }
          float amb = 0.38 + 0.35 * lInt;
          vec3 s = texture2D(causticsTex, cauUV).rgb;
          vec2 inRange = step(vec2(0.0), cauUV) * step(cauUV, vec2(1.0));
          float mask = inRange.x * inRange.y * smoothstep(0.0, 0.6, lInt + 0.2);
          s *= 1.0 - flicker * 0.5 * (vnoise(warpTime * 2.3) + vnoise(warpTime * 5.7 + 1.3));
          float intensity = (s.r + s.g + s.b) / 3.0;
          s = pow(max(s, vec3(0.0)), vec3(gamma));
          vec3 cCol = (paletteMode == 0)
            ? s * mask
            : applyPalette(intensity) * (0.7 + 0.3 * s / max(intensity, 0.001)) * intensity * mask * 8.0;

          // Iridescence — modulate surface base colour by view angle
          vec3 irid = iridColor(vFresnel, iridScale);
          vec3 surfCol = mix(baseColor, baseColor * irid * 2.0, iridescence * vFresnel);

          gl_FragColor = vec4(surfCol * amb + cCol, 1.0);
        }`,
    });
  }

  /** Called every frame to keep projection matrices and uniforms in sync */
  update(projCam, causticsTex, opts, time) {
    const u = this.material.uniforms;
    u.lProjMat.value.copy(projCam.projectionMatrix);
    u.lViewMat.value.copy(projCam.matrixWorldInverse);
    u.causticsTex.value  = causticsTex;
    u.paletteMode.value  = opts.palette      ?? 0;
    u.palShift.value     = opts.palShift     ?? 0;
    u.gamma.value        = opts.gamma        ?? 1.0;
    u.warp.value         = opts.warp         ?? 0;
    u.warpTime.value     = time * (opts.warpSpeed ?? 0.2);
    u.flicker.value      = opts.flicker      ?? 0;
    u.iridescence.value  = opts.iridescence  ?? 0;
    u.iridScale.value    = opts.iridScale    ?? 1.0;
  }

  setBaseColor(r, g, b) {
    this.material.uniforms.baseColor.value.set(r, g, b);
  }

  dispose() {
    this.material.dispose();
  }
}
