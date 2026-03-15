varying vec3 vWorldNormal;
varying vec3 vEyeVector;
varying vec4 vScreenPos;
void main() {
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldNormal  = normalize(mat3(modelMatrix) * normal);
  vEyeVector    = normalize(worldPos.xyz - cameraPosition);
  gl_Position   = projectionMatrix * viewMatrix * worldPos;
  vScreenPos    = gl_Position;
}
