uniform int   channel;
uniform float causticsFactor;
uniform vec3  chanColor;
varying vec3 oldPos;
varying vec3 newPos;
void main() {
  float oldA = length(dFdx(oldPos)) * length(dFdy(oldPos));
  float newA = length(dFdx(newPos)) * length(dFdy(newPos));
  float ratio = (newA < 0.00001) ? 1.0e4 : oldA / newA;
  float intensity = causticsFactor * ratio;
  gl_FragColor = vec4(chanColor * intensity, 1.0);
}
