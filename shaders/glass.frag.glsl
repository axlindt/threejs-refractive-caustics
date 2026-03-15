uniform sampler2D uSceneTex;
uniform vec2      uResolution;
uniform float     eta;
uniform float     dispersion;
uniform float     fresnelPow;
uniform float     refrStrength;
uniform float     uGlowStrength;
uniform vec3      uGlowColor;
uniform float     uLightStrength;
varying vec3 vWorldNormal;
varying vec3 vEyeVector;
varying vec4 vScreenPos;

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 I = normalize(vEyeVector);
  vec2 screenUV = (vScreenPos.xy / vScreenPos.w) * 0.5 + 0.5;

  vec3 rDir = refract(I, N, eta - dispersion);
  vec3 gDir = refract(I, N, eta);
  vec3 bDir = refract(I, N, eta + dispersion);

  float r = texture2D(uSceneTex, screenUV + rDir.xy * refrStrength).r;
  float g = texture2D(uSceneTex, screenUV + gDir.xy * refrStrength).g;
  float b = texture2D(uSceneTex, screenUV + bDir.xy * refrStrength).b;

  float cosTheta = max(0.0, dot(-I, N));
  float F0 = pow((1.0 - eta) / (1.0 + eta), 2.0);
  float fresnel = F0 + (1.0 - F0) * pow(1.0 - cosTheta, fresnelPow);

  float iri = pow(1.0 - cosTheta, 3.0);
  vec3 iriCol = 0.5 + 0.5 * cos(6.28318 * (vec3(0.0, 0.33, 0.67) + iri * 2.0));

  vec3 reflDir = reflect(I, N);
  vec3 lightDir = normalize(vec3(0.2, 1.0, 0.1));
  float spec = pow(max(0.0, dot(reflDir, lightDir)), 96.0);
  float glow = pow(cosTheta, 2.0) * uGlowStrength;

  vec3 sceneLight = normalize(vec3(0.5, 1.5, 1.0));
  float diff = max(0.0, dot(N, sceneLight));
  float sceneSpec = pow(max(0.0, dot(reflDir, sceneLight)), 64.0);
  vec3 lighting = vec3(diff * 0.6 + sceneSpec * 0.8) * uLightStrength;

  vec3 col = vec3(r,g,b) + iriCol * iri * 0.3 + spec * 0.8 + uGlowColor * glow + lighting;
  float alpha = clamp(fresnel * 1.8 + glow * 0.6 + 0.05, 0.0, 1.0);
  gl_FragColor = vec4(col, alpha);
}
