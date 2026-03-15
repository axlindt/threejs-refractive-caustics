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
}
