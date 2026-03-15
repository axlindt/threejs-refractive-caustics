/**
 * CausticMaterial
 *
 * The ShaderMaterial applied to the caster mesh during caustic rendering.
 * Uses additive blending so N passes accumulate into a single texture.
 *
 * Each pass uses a slightly different eta and hue, building up chromatic
 * dispersion across the full N-pass rainbow.
 */

import * as THREE from 'three';

function hsvToRgb(h, s, v) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  const m = i % 6;
  if (m === 0) return [v, t, p];
  if (m === 1) return [q, v, p];
  if (m === 2) return [p, v, t];
  if (m === 3) return [p, q, v];
  if (m === 4) return [t, p, v];
  return [v, p, q];
}

export class CausticMaterial {
  constructor(opts = {}) {
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        light:          { value: new THREE.Vector3(0, -1, 0) },
        eta:            { value: opts.eta ?? 0.75 },
        spread:         { value: opts.spread ?? 4.0 },
        causticsFactor: { value: 0.02 },
        chanColor:      { value: new THREE.Vector3(1, 0, 0) },
        tangentOffset:  { value: 0.0 },
        dispersionMode: { value: 0 },
        envMap:         { value: null },
        lProjMat:       { value: new THREE.Matrix4() },
        lViewMat:       { value: new THREE.Matrix4() },
        waveAmp:        { value: 0.0 },
        waveFreq:       { value: 4.0 },
        waveTime:       { value: 0.0 },
      },
      vertexShader: /* glsl */`
        uniform vec3  light;
        uniform float eta;
        uniform float spread;
        uniform float tangentOffset;
        uniform int   dispersionMode;
        uniform sampler2D envMap;
        uniform mat4  lProjMat;
        uniform mat4  lViewMat;
        uniform float waveAmp;
        uniform float waveFreq;
        uniform float waveTime;
        varying vec3 oldPos;
        varying vec3 newPos;

        vec3 rayMarchEnv(vec3 origin, vec3 dir) {
          vec3 bestHit = origin + dir * spread;
          for (int i = 1; i <= 24; i++) {
            float t = float(i) * spread / 24.0;
            vec3 p = origin + dir * t;
            vec4 lp = lProjMat * lViewMat * vec4(p, 1.0);
            vec2 uv = lp.xy / lp.w * 0.5 + 0.5;
            if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) continue;
            vec4 envSample = texture2D(envMap, uv);
            if (lp.z >= envSample.w && envSample.w > 0.0) {
              bestHit = envSample.xyz;
              break;
            }
          }
          return bestHit;
        }

        void main() {
          vec3 wp = (modelMatrix * vec4(position, 1.0)).xyz;
          vec3 wn = normalize(mat3(modelMatrix) * normal);
          oldPos = wp;
          // Four plane waves at non-orthogonal angles — organic interference, no grid
          if (waveAmp > 0.0) {
            float ct = cos(waveTime), st = sin(waveTime);
            float f2 = waveFreq * 1.29;
            float p0 = waveFreq * wp.x                              + ct * 2.8;
            float p1 = waveFreq * (wp.x * 0.731 + wp.z * 0.682)    + st * 1.7;
            float p2 = f2       * (wp.x * 0.070 + wp.z * 0.998)    - ct * 2.3;
            float p3 = f2       * (wp.x *-0.588 + wp.z * 0.809)    + st * 3.1;
            float d  = sin(p0) + 0.68*sin(p1) + 0.45*sin(p2) + 0.28*sin(p3);
            float gx = waveFreq*cos(p0)
                     + 0.68*waveFreq*0.731*cos(p1)
                     + 0.45*f2*0.070*cos(p2)
                     - 0.28*f2*0.588*cos(p3);
            float gz = 0.68*waveFreq*0.682*cos(p1)
                     + 0.45*f2*0.998*cos(p2)
                     + 0.28*f2*0.809*cos(p3);
            wp += wn * (d * waveAmp);
            vec3 wUp = abs(wn.y) < 0.9 ? vec3(0.0,1.0,0.0) : vec3(1.0,0.0,0.0);
            vec3 wT  = normalize(cross(wn, wUp));
            vec3 wB  = cross(wn, wT);
            wn = normalize(wn - wT*(gx*waveAmp) - wB*(gz*waveAmp));
          }
          vec3 refractNormal = wn;
          if (dispersionMode == 1) {
            vec3 up = abs(wn.y) < 0.99 ? vec3(0,1,0) : vec3(1,0,0);
            refractNormal = normalize(wn + normalize(cross(wn, up)) * tangentOffset);
          }
          vec3 refr = refract(light, refractNormal, eta);
          newPos = rayMarchEnv(wp, refr);
          gl_Position = projectionMatrix * viewMatrix * vec4(newPos, 1.0);
        }`,

      fragmentShader: /* glsl */`
        uniform float causticsFactor;
        uniform vec3  chanColor;
        varying vec3 oldPos;
        varying vec3 newPos;
        void main() {
          float oldA = length(dFdx(oldPos)) * length(dFdy(oldPos));
          float newA = length(dFdx(newPos)) * length(dFdy(newPos));
          float ratio = oldA / max(newA, oldA * 0.015);
          ratio = min(ratio, 64.0);
          gl_FragColor = vec4(chanColor * causticsFactor * ratio, 1.0);
        }`,

      transparent:        true,
      blending:           THREE.CustomBlending,
      blendEquation:      THREE.AddEquation,
      blendSrc:           THREE.OneFactor,
      blendDst:           THREE.OneFactor,
      blendEquationAlpha: THREE.AddEquation,
      blendSrcAlpha:      THREE.OneFactor,
      blendDstAlpha:      THREE.ZeroFactor,
      side:               THREE.DoubleSide,
      extensions:         { derivatives: true },
      depthWrite:         false,
    });
  }

  /** Called once per frame before the N-pass loop */
  update(lightDir, envTexture, projCam, opts, time = 0) {
    const u = this.material.uniforms;
    u.light.value.copy(lightDir);
    u.spread.value         = opts.spread;
    u.envMap.value         = envTexture;
    u.dispersionMode.value = opts.dispersionMode ?? 0;
    u.lProjMat.value.copy(projCam.projectionMatrix);
    u.lViewMat.value.copy(projCam.matrixWorldInverse);
    u.waveAmp.value        = opts.waveAmp   ?? 0.0;
    u.waveFreq.value       = opts.waveFreq  ?? 4.0;
    u.waveTime.value       = time * (opts.waveSpeed ?? 0.5);
  }

  setPass(i, N, opts, time = 0) {
    const t   = N === 1 ? 0 : i / (N - 1);

    // Pulse — animate base eta with a slow sine wave so the whole caustic pattern
    // breathes in and out. pulseAmt controls depth, pulseSpeed controls rate.
    const pulseAmt   = opts.pulse      ?? 0.0;
    const pulseSpeed = opts.pulseSpeed ?? 0.5;
    const pulsedEta  = opts.eta * (1.0 + pulseAmt * Math.sin(time * pulseSpeed * Math.PI * 2));

    const eta = pulsedEta * (1 - (opts.dispersion ?? 0.04) * t);
    const hue = ((opts.hueStart ?? 0) + t * (opts.hueRange ?? 0.5)) % 1.0;
    const bri = 0.7 + 0.3 * Math.sin(Math.PI * t);
    const [r, g, b] = hsvToRgb(hue, 1.0, bri);

    const u = this.material.uniforms;
    u.eta.value            = eta;
    u.causticsFactor.value = (opts.intensity ?? 0.02) / N * 3;
    u.chanColor.value.set(r, g, b);
    u.tangentOffset.value  = (t - 0.5) * (opts.tangentStrength ?? 0.3);
  }

  dispose() {
    this.material.dispose();
  }
}
