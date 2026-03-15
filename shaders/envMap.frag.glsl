varying vec4 wPos;
varying float dep;
void main() { gl_FragColor = vec4(wPos.xyz, dep); }
