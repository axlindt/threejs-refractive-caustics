uniform sampler2D causticsTex;
uniform vec3  baseColor;
uniform int   paletteMode;
uniform float gamma;
uniform float warp;
uniform float warpTime;
uniform float flicker;
uniform float floorSize; // half-extent of floor for outline calc

varying float lInt;
varying vec3  lPos;
varying vec3  vWorld;

vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
  return a + b * cos(6.28318 * (c * t + d));
}

vec3 applyPalette(float intensity) {
  float t = clamp(intensity * 6.0, 0.0, 1.0);
  if (paletteMode == 1) return palette(t, vec3(0.5,0.2,0.1), vec3(0.5,0.3,0.1), vec3(1.0,0.8,0.5), vec3(0.0,0.1,0.3));
  if (paletteMode == 2) return palette(t, vec3(0.1,0.3,0.5), vec3(0.1,0.3,0.4), vec3(0.8,0.6,1.0), vec3(0.3,0.5,0.6));
  if (paletteMode == 3) return palette(t, vec3(0.5,0.5,0.5), vec3(0.5,0.5,0.5), vec3(1.0,1.0,1.0), vec3(0.0,0.33,0.67));
  if (paletteMode == 4) return palette(t, vec3(0.4,0.2,0.4), vec3(0.4,0.3,0.2), vec3(0.8,0.7,0.5), vec3(0.0,0.15,0.3));
  if (paletteMode == 5) return palette(t, vec3(0.5,0.5,0.0), vec3(0.5,0.5,0.3), vec3(1.0,0.7,0.4), vec3(0.0,0.2,0.5));
  if (paletteMode == 6) return palette(t, vec3(0.5,0.3,0.4), vec3(0.5,0.3,0.3), vec3(1.0,0.8,0.9), vec3(0.0,0.2,0.4));
  if (paletteMode == 7) return palette(t, vec3(0.3,0.5,0.6), vec3(0.3,0.3,0.2), vec3(0.6,0.8,1.0), vec3(0.5,0.6,0.7));
  if (paletteMode == 8) return palette(t, vec3(0.5,0.4,0.1), vec3(0.5,0.4,0.1), vec3(1.0,0.9,0.6), vec3(0.0,0.05,0.15));
  return vec3(1.0);
}

float hash(float n) { return fract(sin(n) * 43758.5453); }
float vnoise(float t) { float i = floor(t); float f = fract(t); return mix(hash(i), hash(i+1.0), f*f*(3.0-2.0*f)); }

void main() {
  vec2 border = min(vWorld.xz + floorSize, floorSize - vWorld.xz);
  float outline = 1.0 - smoothstep(0.0, 0.08, min(border.x, border.y));
  float gridAlpha = outline * 0.4;

  vec2 cauUV = lPos.xy;
  if (warp > 0.0) {
    float nx = sin(cauUV.x * 8.3 + warpTime * 0.7) * cos(cauUV.y * 6.1 + warpTime * 0.5);
    float ny = cos(cauUV.x * 7.1 - warpTime * 0.6) * sin(cauUV.y * 9.2 + warpTime * 0.8);
    cauUV += vec2(nx, ny) * warp;
  }

  vec3 s = texture2D(causticsTex, cauUV).rgb;
  vec2 inRange = step(vec2(0.0), cauUV) * step(cauUV, vec2(1.0));
  float mask = inRange.x * inRange.y * smoothstep(0.0, 0.6, lInt + 0.2);
  float flickerVal = 1.0 - flicker * 0.5 * (vnoise(warpTime * 2.3) + vnoise(warpTime * 5.7 + 1.3));
  s *= flickerVal;
  float intensity = (s.r + s.g + s.b) / 3.0;
  s = pow(max(s, vec3(0.0)), vec3(gamma));

  vec3 cCol = paletteMode == 0
    ? s * mask
    : applyPalette(intensity) * (0.7 + 0.3 * s / max(intensity, 0.001)) * intensity * mask * 8.0;

  vec3 gridColor = vec3(0.78, 0.795, 0.84);
  gl_FragColor = vec4(mix(baseColor + cCol, gridColor + cCol, gridAlpha), 1.0);
}
