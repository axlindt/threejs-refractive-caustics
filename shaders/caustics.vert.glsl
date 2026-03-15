// Reference copy of the CausticMaterial vertex shader.
// modelMatrix, position, normal, projectionMatrix, viewMatrix are Three.js
// built-in uniforms/attributes injected at compile time — GLSL linters will
// flag them as undeclared, but the shader is valid in a Three.js context.

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
    float envDepth = envSample.w;
    float rayDepth = lp.z;
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
    vec3 up = abs(wn.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);
    vec3 tangent = normalize(cross(wn, up));
    refractNormal = normalize(wn + tangent * tangentOffset);
  }
  vec3 refr = refract(light, refractNormal, eta);
  newPos = rayMarchEnv(wp, refr);
  vec4 ep = projectionMatrix * viewMatrix * vec4(newPos, 1.0);
  gl_Position = ep;
}
