varying vec4 wPos;
varying float dep;
void main() {
  wPos = modelMatrix * vec4(position, 1.0);
  vec4 p = projectionMatrix * viewMatrix * wPos;
  dep = p.z;
  gl_Position = p;
}
