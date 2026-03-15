// GLSL shader strings loaded as JS globals. Order matters: referenced by main.js.
// envMap → caustics → blend/blur (temporal accumulation) → receiver → glass → rim → _disp (export)

// Writes world-space XYZ + light-space depth into a float render target.
// The caustics vertex shader samples this to find where refracted rays land.
const envMapVert = `
varying vec4 wPos;
varying float dep;
void main() {
  wPos = modelMatrix * vec4(position, 1.0);
  vec4 p = projectionMatrix * viewMatrix * wPos;
  dep = p.z;
  gl_Position = p;
}`;

const envMapFrag = `
varying vec4 wPos;
varying float dep;
void main() { gl_FragColor = vec4(wPos.xyz, dep); }`;

// Photon projection: refracts each vertex through the glass surface (via Snell's law),
// ray-marches the env map to find the landing point, then projects there.
// Fragment computes area ratio (old vs new) to get intensity — no texture lookups needed.
const causticsVert = `
uniform vec3  light;
uniform float eta;
uniform float spread;
uniform float tangentOffset;
uniform int   dispersionMode;
uniform sampler2D envMap;
uniform mat4  lProjMat;
uniform mat4  lViewMat;
uniform vec2  envTexelSize;
uniform float waveAmp;
uniform float waveFreq;
uniform float waveTime;
varying vec3 oldPos;
varying vec3 newPos;

// Sample the env map to find where a world-space ray hits the receivers
vec3 rayMarchEnv(vec3 origin, vec3 dir) {
  vec4 lp = lProjMat * lViewMat * vec4(origin, 1.0);
  vec2 uv = lp.xy / lp.w * 0.5 + 0.5;
  vec3 bestHit = origin + dir * spread; // fallback
  float bestDepth = 1e9;
  for (int i = 1; i <= 24; i++) {
    float t = float(i) * spread / 24.0;
    vec3 p = origin + dir * t;
    vec4 lp2 = lProjMat * lViewMat * vec4(p, 1.0);
    vec2 uv2 = lp2.xy / lp2.w * 0.5 + 0.5;
    if (uv2.x < 0.0 || uv2.x > 1.0 || uv2.y < 0.0 || uv2.y > 1.0) continue;
    vec4 envSample = texture2D(envMap, uv2);
    float envDepth = envSample.w;
    float rayDepth = lp2.z;
    if (rayDepth >= envDepth && envDepth > 0.0) {
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

  // Wave displacement — caustic mesh only, not visible glass object.
  // Four plane waves at non-orthogonal angles interfere into organic oval pools.
  // Analytical gradient keeps normals physically consistent.
  if (waveAmp > 0.0) {
    float ct = cos(waveTime), st = sin(waveTime);
    float f2 = waveFreq * 1.29;  // incommensurate ratio → no repeating grid
    // directions: 0°, 43°, 86°, 126° — none parallel, none perpendicular
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
    vec3 wUp = abs(wn.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 wT  = normalize(cross(wn, wUp));
    vec3 wB  = cross(wn, wT);
    wn = normalize(wn - wT * (gx * waveAmp) - wB * (gz * waveAmp));
  }

  vec3 refractNormal = wn;
  if (dispersionMode == 1) {
    vec3 up = abs(wn.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 tangent = normalize(cross(wn, up));
    refractNormal = normalize(wn + tangent * tangentOffset);
  }

  vec3 refr = refract(light, refractNormal, eta);
  newPos = rayMarchEnv(wp, refr);

  vec4 ep = projectionMatrix * viewMatrix * vec4(newPos, 1.0);
  gl_Position = ep;
}`;

const causticsFrag = `
uniform int   channel;
uniform float causticsFactor;
uniform vec3  chanColor; // color for this dispersion pass
varying vec3 oldPos;
varying vec3 newPos;
void main() {
  float oldA = length(dFdx(oldPos)) * length(dFdy(oldPos));
  float newA = length(dFdx(newPos)) * length(dFdy(newPos));
  // Clamp ratio to prevent degenerate triangles from spiking to extreme brightness
  float ratio = oldA / max(newA, oldA * 0.015);
  ratio = min(ratio, 64.0);
  float intensity = causticsFactor * ratio;
  gl_FragColor = vec4(chanColor * intensity, 1.0);
}`;

// Temporal accumulation blend shader
const blendVert = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const blendFrag = `
uniform sampler2D tNew;
uniform sampler2D tOld;
uniform float blend;
varying vec2 vUv;
void main() {
  vec4 n = texture2D(tNew, vUv);
  vec4 o = texture2D(tOld, vUv);
  gl_FragColor = mix(n, o, blend);
}`;

// Gaussian blur shaders (two-pass: horizontal then vertical)
const blurVert = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const blurFrag = `
uniform sampler2D tInput;
uniform vec2 direction;  // (1,0) or (0,1)
uniform float radius;
uniform vec2 texelSize;
varying vec2 vUv;
void main() {
  vec4 col = vec4(0.0);
  // 9-tap gaussian weights
  float weights[9];
  weights[0] = 0.0539; weights[1] = 0.1216; weights[2] = 0.1953;
  weights[3] = 0.2256; weights[4] = 0.2256; weights[5] = 0.1953;
  weights[6] = 0.1216; weights[7] = 0.0539; weights[8] = 0.0270;
  vec4 result = vec4(0.0);
  for (int i = 0; i < 9; i++) {
    float offset = float(i - 4) * radius;
    vec2 uv = vUv + direction * texelSize * offset;
    result += texture2D(tInput, uv) * weights[i];
  }
  gl_FragColor = result;
}`;


// Samples the accumulated caustic texture and composites it onto receiver geometry.
// Includes Quilez cosine palette remapping, gamma, noise warp, and shimmer.
const receiverVert = `
uniform mat4 lProjMat;
uniform mat4 lViewMat;
varying float lInt;
varying vec3  lPos;
varying vec3  vWorld;
void main() {
  vec3 wn = normalize(mat3(modelMatrix) * normal);
  lInt = max(0.0, dot(wn, vec3(0.0, 1.0, 0.0)));
  vec4 lr = lProjMat * lViewMat * modelMatrix * vec4(position, 1.0);
  lPos = lr.xyz / lr.w * 0.5 + 0.5;
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const receiverFrag = `
uniform sampler2D causticsTex;
uniform vec3 baseColor;
uniform int  paletteMode;
uniform float palShift;
varying float lInt;
varying vec3  lPos;
varying vec3  vWorld;

// Quilez cosine palette
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}

vec3 applyPalette(float intensity) {
  float t = clamp(intensity * 6.0, 0.0, 1.0);
  if (paletteMode == 1) // fire
    return palette(t, vec3(0.5,0.2,0.1), vec3(0.5,0.3,0.1), vec3(1.0,0.8,0.5), vec3(0.0,0.1,0.3));
  if (paletteMode == 2) // ocean
    return palette(t, vec3(0.1,0.3,0.5), vec3(0.1,0.3,0.4), vec3(0.8,0.6,1.0), vec3(0.3,0.5,0.6));
  if (paletteMode == 3) // spectral
    return palette(t, vec3(0.5,0.5,0.5), vec3(0.5,0.5,0.5), vec3(1.0,1.0,1.0), vec3(0.0,0.33,0.67));
  if (paletteMode == 4) // dusk
    return palette(t, vec3(0.4,0.2,0.4), vec3(0.4,0.3,0.2), vec3(0.8,0.7,0.5), vec3(0.0,0.15,0.3));
  if (paletteMode == 5) // acid
    return palette(t, vec3(0.5,0.5,0.0), vec3(0.5,0.5,0.3), vec3(1.0,0.7,0.4), vec3(0.0,0.2,0.5));
  if (paletteMode == 6) // rose
    return palette(t, vec3(0.5,0.3,0.4), vec3(0.5,0.3,0.3), vec3(1.0,0.8,0.9), vec3(0.0,0.2,0.4));
  if (paletteMode == 7) // arctic
    return palette(t, vec3(0.3,0.5,0.6), vec3(0.3,0.3,0.2), vec3(0.6,0.8,1.0), vec3(0.5,0.6,0.7));
  if (paletteMode == 8) // gold
    return palette(t, vec3(0.5,0.4,0.1), vec3(0.5,0.4,0.1), vec3(1.0,0.9,0.6), vec3(0.0,0.05,0.15));
  return vec3(1.0); // none — white passthrough
}

uniform float gamma;
uniform float warp;
uniform float warpTime;
uniform float shimmer;
uniform float floorHalfW;
uniform float floorHalfH;

// 2D value noise for spatially-varying shimmer flicker
float _fh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float _fn2(vec2 p) { vec2 i=floor(p); vec2 f=fract(p); vec2 u=f*f*(3.0-2.0*f); return mix(mix(_fh(i),_fh(i+vec2(1,0)),u.x),mix(_fh(i+vec2(0,1)),_fh(i+vec2(1,1)),u.x),u.y); }
float _shimmer(vec2 uv, float t) { return 0.6*_fn2(uv*3.0+t*0.6)+0.3*_fn2(uv*7.5-t*1.0)+0.1*_fn2(uv*16.0+t*1.7); }

void main() {
  // floor edge outline
  vec2 border = min(vWorld.xz + vec2(floorHalfW, floorHalfH), vec2(floorHalfW, floorHalfH) - vWorld.xz);
  float outline = 1.0 - smoothstep(0.0, 0.08, min(border.x, border.y));
  float gridAlpha = outline * 0.4;

  // Gaussian noise warp on caustic UV
  vec2 cauUV = lPos.xy;
  if (warp > 0.0) {
    float nx = sin(cauUV.x * 8.3 + warpTime * 0.7) * cos(cauUV.y * 6.1 + warpTime * 0.5);
    float ny = cos(cauUV.x * 7.1 - warpTime * 0.6) * sin(cauUV.y * 9.2 + warpTime * 0.8);
    cauUV += vec2(nx, ny) * warp;
  }

  float light = 1.0; // flat — no darkening so floor shows true color
  vec3 cCol = vec3(0.0);
  vec3 s = texture2D(causticsTex, cauUV).rgb;
  vec2 inRange = step(vec2(0.0), cauUV) * step(cauUV, vec2(1.0));
  float mask = inRange.x * inRange.y * smoothstep(0.0, 0.6, lInt + 0.2);

  // Shimmer — spatially-varying Perlin modulation (brightens & dims different zones)
  float shimmerVal = max(0.0, 1.0 + shimmer * (_shimmer(cauUV, warpTime) - 0.5) * 4.0);
  s *= shimmerVal;

  float intensity = (s.r + s.g + s.b) / 3.0;
  // Gamma remap
  s = pow(max(s, vec3(0.0)), vec3(gamma));

  if (paletteMode == 0) {
    cCol = s * mask;
  } else {
    vec3 mapped = applyPalette(intensity) * (0.7 + 0.3 * s / max(intensity, 0.001));
    cCol = mapped * intensity * mask * 8.0;
  }

  vec3 gridColor = vec3(0.78, 0.795, 0.84);
  vec3 finalCol  = mix(baseColor * light + cCol, gridColor + cCol, gridAlpha);
  gl_FragColor = vec4(finalCol, 1.0);
}`;


// Screen-space refraction with chromatic dispersion and Schlick Fresnel.
// Renders scene to FBO first, then offsets UV per R/G/B channel by refract() direction.
// Fresnel blend + thin-film iridescence at glancing angles. Technique adapted from
// Maxime Heckel's glass refraction writeup (blog.maximeheckel.com).
const glassVert = `
uniform float waveAmp;
uniform float waveFreq;
uniform float waveTime;
uniform int   waveOnObj;
varying vec3 vWorldNormal;
varying vec3 vEyeVector;
varying vec4 vScreenPos;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vec3 wn = normalize(mat3(modelMatrix) * normal);
  if (waveOnObj == 1 && waveAmp > 0.0) {
    vec3 wp = worldPos.xyz;
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
    worldPos.xyz += wn * (d * waveAmp);
    vec3 wUp = abs(wn.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 wT  = normalize(cross(wn, wUp));
    vec3 wB  = cross(wn, wT);
    wn = normalize(wn - wT * (gx * waveAmp) - wB * (gz * waveAmp));
  }
  vWorldNormal  = wn;
  vEyeVector    = normalize(worldPos.xyz - cameraPosition);
  gl_Position   = projectionMatrix * viewMatrix * worldPos;
  vScreenPos    = gl_Position;
}`;

const glassFrag = `
uniform sampler2D uSceneTex;  // FBO — scene behind the glass
uniform vec2      uResolution;
uniform float     eta;
uniform float     dispersion;
uniform float     fresnelPow;
uniform float     refrStrength; // how much the UV gets bent
uniform float uGlowStrength;
uniform vec3  uGlowColor;
uniform float uLightStrength;
varying vec3 vWorldNormal;
varying vec3 vEyeVector;
varying vec4 vScreenPos;

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 I = normalize(vEyeVector);

  vec2 screenUV = (vScreenPos.xy / vScreenPos.w) * 0.5 + 0.5;

  // R/G/B chromatic dispersion at three IORs
  float etaR = eta - dispersion;
  float etaG = eta;
  float etaB = eta + dispersion;

  vec3 rDir = refract(I, N, etaR);
  vec3 gDir = refract(I, N, etaG);
  vec3 bDir = refract(I, N, etaB);

  vec2 rOffset = rDir.xy * refrStrength;
  vec2 gOffset = gDir.xy * refrStrength;
  vec2 bOffset = bDir.xy * refrStrength;

  float r = texture2D(uSceneTex, screenUV + rOffset).r;
  float g = texture2D(uSceneTex, screenUV + gOffset).g;
  float b = texture2D(uSceneTex, screenUV + bOffset).b;
  vec3 refractCol = vec3(r, g, b);

  // Fresnel — Schlick approximation
  float cosTheta = max(0.0, dot(-I, N));
  float F0 = pow((1.0 - eta) / (1.0 + eta), 2.0);
  float fresnel = F0 + (1.0 - F0) * pow(1.0 - cosTheta, fresnelPow);

  // Thin-film iridescence at glancing angles
  float iri = pow(1.0 - cosTheta, 3.0);
  vec3 iriCol = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + iri * 2.0));

  // Specular highlight
  vec3 lightDir = normalize(vec3(0.2, 1.0, 0.1));
  vec3 reflDir  = reflect(I, N);
  float spec    = pow(max(0.0, dot(reflDir, lightDir)), 96.0);

  // inner glow (inverse of fresnel — peaks at center)
  float glow     = pow(cosTheta, 2.0) * uGlowStrength;
  vec3  glowCol  = uGlowColor * glow;

  // Scene light — diffuse + specular from a fixed above-front position
  vec3  sceneLight = normalize(vec3(0.5, 1.5, 1.0));
  float diff       = max(0.0, dot(N, sceneLight));
  float sceneSpec  = pow(max(0.0, dot(reflDir, sceneLight)), 64.0);
  vec3  lighting   = vec3(diff * 0.6 + sceneSpec * 0.8) * uLightStrength;

  vec3 col = refractCol + iriCol * iri * 0.3 + spec * 0.8 + glowCol + lighting;

  // Alpha: fresnel rim + glow center + thin base
  float alpha = clamp(fresnel * 1.8 + glow * 0.6 + 0.05, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}`;


// Additive silhouette glow — bright at grazing angles, transparent at center.
const rimVert = `
varying vec3 vWorldNormal;
varying vec3 vEyeVector;
void main() {
  vec4 worldPos    = modelMatrix * vec4(position, 1.0);
  vWorldNormal     = normalize(mat3(modelMatrix) * normal);
  vEyeVector       = normalize(worldPos.xyz - cameraPosition);
  gl_Position      = projectionMatrix * viewMatrix * worldPos;
}`;

const rimFrag = `
uniform vec3  rimColor;
uniform float rimPow;
uniform float rimStrength;
varying vec3 vWorldNormal;
varying vec3 vEyeVector;
void main() {
  vec3  N        = normalize(vWorldNormal);
  vec3  I        = normalize(vEyeVector);
  float cosTheta = max(0.0, dot(-I, N));
  // Rim = bright at silhouette (cosTheta~0), dark at center (cosTheta~1)
  float rim      = pow(1.0 - cosTheta, rimPow) * rimStrength;
  gl_FragColor   = vec4(rimColor * rim, rim);
}`;

// Flat-quad display shader used by the PNG download and video recording paths.
// Mirrors the palette/gamma/warp logic from receiverFrag but renders to a 2D plane.
const _dispFrag = `
uniform sampler2D tCaustics;
uniform vec3  baseColor;
uniform int   paletteMode;
uniform float gamma;
uniform float warp;
uniform float warpTime;
uniform float shimmer;
varying vec2  vUv;
vec3 _pal(float t, vec3 a, vec3 b, vec3 c, vec3 d) { return a + b * cos(6.28318*(c*t+d)); }
vec3 _applyPal(float intensity) {
  float t = clamp(intensity * 6.0, 0.0, 1.0);
  if (paletteMode == 1) return _pal(t, vec3(0.5,0.2,0.1), vec3(0.5,0.3,0.1), vec3(1.0,0.8,0.5), vec3(0.0,0.1,0.3));
  if (paletteMode == 2) return _pal(t, vec3(0.1,0.3,0.5), vec3(0.1,0.3,0.4), vec3(0.8,0.6,1.0), vec3(0.3,0.5,0.6));
  if (paletteMode == 3) return _pal(t, vec3(0.5,0.5,0.5), vec3(0.5,0.5,0.5), vec3(1.0,1.0,1.0), vec3(0.0,0.33,0.67));
  if (paletteMode == 4) return _pal(t, vec3(0.4,0.2,0.4), vec3(0.4,0.3,0.2), vec3(0.8,0.7,0.5), vec3(0.0,0.15,0.3));
  if (paletteMode == 5) return _pal(t, vec3(0.5,0.5,0.0), vec3(0.5,0.5,0.3), vec3(1.0,0.7,0.4), vec3(0.0,0.2,0.5));
  if (paletteMode == 6) return _pal(t, vec3(0.5,0.3,0.4), vec3(0.5,0.3,0.3), vec3(1.0,0.8,0.9), vec3(0.0,0.2,0.4));
  if (paletteMode == 7) return _pal(t, vec3(0.3,0.5,0.6), vec3(0.3,0.3,0.2), vec3(0.6,0.8,1.0), vec3(0.5,0.6,0.7));
  if (paletteMode == 8) return _pal(t, vec3(0.5,0.4,0.1), vec3(0.5,0.4,0.1), vec3(1.0,0.9,0.6), vec3(0.0,0.05,0.15));
  return vec3(1.0);
}
float _dh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)))*43758.5453); }
float _dn2(vec2 p) { vec2 i=floor(p); vec2 f=fract(p); vec2 u=f*f*(3.0-2.0*f); return mix(mix(_dh(i),_dh(i+vec2(1,0)),u.x),mix(_dh(i+vec2(0,1)),_dh(i+vec2(1,1)),u.x),u.y); }
float _dshim(vec2 uv, float t) { return 0.6*_dn2(uv*3.0+t*0.6)+0.3*_dn2(uv*7.5-t*1.0)+0.1*_dn2(uv*16.0+t*1.7); }
void main() {
  vec2 uv = vUv;
  if (warp > 0.0) {
    float nx = sin(uv.x*8.3+warpTime*0.7)*cos(uv.y*6.1+warpTime*0.5);
    float ny = cos(uv.x*7.1-warpTime*0.6)*sin(uv.y*9.2+warpTime*0.8);
    uv += vec2(nx,ny)*warp;
  }
  vec3 s = texture2D(tCaustics, uv).rgb;
  float fv = max(0.0, 1.0 + shimmer*(_dshim(uv, warpTime)-0.5)*4.0);
  s *= fv;
  float intensity = (s.r+s.g+s.b)/3.0;
  s = pow(max(s, vec3(0.0)), vec3(gamma));
  vec3 cCol;
  if (paletteMode == 0) { cCol = s; }
  else { vec3 m = _applyPal(intensity)*(0.7+0.3*s/max(intensity,0.001)); cCol = m*intensity*8.0; }
  gl_FragColor = vec4(clamp(baseColor + cCol, 0.0, 1.0), 1.0);
}`;
