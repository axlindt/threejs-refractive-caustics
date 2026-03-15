// ── Renderer ──────────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.autoClear = false;

// ── Cameras ───────────────────────────────────────────────────────────────────
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 100);
camera.position.set(0, 6, 13);
camera.lookAt(0, 0, 0);

const controls = new THREE.OrbitControls(camera, canvas);
controls.target.set(0, 0, 0);
controls.minDistance = 2; controls.maxDistance = 28;
controls.update();

// Light shoots straight down
const lightCam = new THREE.OrthographicCamera(-0.9, 0.9, 0.9, -0.9, 0.1, 30);
lightCam.position.set(0, 8, 0);
lightCam.lookAt(0, 0, 0);
lightCam.updateMatrixWorld(true);
lightCam.updateProjectionMatrix();

// Separate wide camera just for projecting caustics onto receivers
const projCam = new THREE.OrthographicCamera(-6, 6, 6, -6, 0.1, 30);
projCam.position.copy(lightCam.position);
projCam.lookAt(0, 0, 0);
projCam.updateMatrixWorld(true);
projCam.updateProjectionMatrix();

// ── Parameters ────────────────────────────────────────────────────────────────
let pEta = 0.75, pDisp = 0.04, pInt = 0.02, pSpd = 0.1, pSpread = 4.0;
let pPalette = 0, pPasses = 16, pHueRange = 0.5, pHueStart = 0.0;
let pDispersionMode = 0, pTangentStr = 0.3, pCasterShape = 0, pTrails = 0.6, pBlur = 1.5;
let pLightX = 0, pLightZ = 0, pLightPX = 0, pLightPZ = 0, pDrift = 0, pGamma = 1.0;
let pWarp = 0, pWarpSpd = 0.2, pShimmer = 0, pScale = 1.0, pStartRot = 0;
let pWaveAmp = 0, pWaveFreq = 4.0, pWaveSpd = 0.5;

// Floor / export aspect ratio presets
const ASPECT_PRESETS = {
  '1:1':  { worldW: 12, worldH: 12, recW: 1024, recH: 1024, dlW: 2048, dlH: 2048 },
  '4:3':  { worldW: 12, worldH:  9, recW: 1440, recH: 1080, dlW: 2048, dlH: 1536 },
  '16:9': { worldW: 16, worldH:  9, recW: 1920, recH: 1080, dlW: 2048, dlH: 1152 },
  '2:1':  { worldW: 16, worldH:  8, recW: 1920, recH:  960, dlW: 2048, dlH: 1024 },
};
let pFloorW = 12, pFloorH = 12;

function toggleGroup(id) {
  document.getElementById(id).classList.toggle('open');
}
function bind(id, valId, setter) {
  const el = document.getElementById(id);
  const vl = document.getElementById(valId);
  if (!el || !vl) { console.warn('bind: missing element', id, valId); return; }
  el.addEventListener('input', () => {
    setter(parseFloat(el.value));
    vl.textContent = parseFloat(el.value).toFixed(2);
  });
  setter(parseFloat(el.value)); // apply default value on init
}
bind('sEta',       'vEta',       v => pEta        = v);
bind('sDisp',      'vDisp',      v => pDisp       = v);
bind('sInt',       'vInt',       v => pInt        = v);
bind('sSpd',       'vSpd',       v => pSpd        = v);
bind('sSpread',    'vSpread',    v => pSpread     = v);
bind('sPasses',    'vPasses',    v => pPasses      = Math.round(v));
bind('sHueRange',  'vHueRange',  v => pHueRange   = v);
bind('sHueStart',  'vHueStart',  v => pHueStart   = v);
bind('sTangentStr','vTangentStr',v => pTangentStr  = v);
bind('sTrails',    'vTrails',    v => pTrails      = v);
bind('sBlur',      'vBlur',      v => pBlur        = v);
bind('sLightPX',   'vLightPX',   v => pLightPX     = v);
bind('sLightPZ',   'vLightPZ',   v => pLightPZ     = v);


bind('sLightX',    'vLightX',    v => pLightX      = v);
bind('sLightZ',    'vLightZ',    v => pLightZ      = v);
bind('sDrift',     'vDrift',     v => pDrift       = v);
bind('sGamma',     'vGamma',     v => pGamma       = v);
bind('sWarp',      'vWarp',      v => pWarp        = v);
bind('sWarpSpd',   'vWarpSpd',   v => pWarpSpd     = v);
bind('sShimmer',   'vShimmer',   v => pShimmer     = v);
bind('sWaveAmp',   'vWaveAmp',   v => pWaveAmp     = v);
bind('sWaveFreq',  'vWaveFreq',  v => pWaveFreq    = v);
bind('sWaveSpd',   'vWaveSpd',   v => pWaveSpd     = v);
bind('sScale',     'vScale',     v => pScale       = v);
bind('sStartRot',  'vStartRot',  v => pStartRot    = v);
document.getElementById('sDispersionMode')?.addEventListener('change',e => pDispersionMode = parseInt(e.target.value));
document.getElementById('sCasterShape')?.addEventListener('change',   e => { pCasterShape  = parseInt(e.target.value); switchCaster(pCasterShape); });
document.getElementById('sHideObj')?.addEventListener('change', e => { pHideObj = !e.target.checked; casterVisible.visible = !pHideObj; });

// ── Render Targets ────────────────────────────────────────────────────────────
const ENV_SIZE = 2048;
const CAU_SIZE = 2048;
const envRT  = new THREE.WebGLRenderTarget(ENV_SIZE, ENV_SIZE, { type: THREE.FloatType });
const cauRT  = new THREE.WebGLRenderTarget(CAU_SIZE, CAU_SIZE, { type: THREE.FloatType });
const cauRTA = new THREE.WebGLRenderTarget(CAU_SIZE, CAU_SIZE, { type: THREE.FloatType }); // accumulation ping
const cauRTB = new THREE.WebGLRenderTarget(CAU_SIZE, CAU_SIZE, { type: THREE.FloatType }); // accumulation pong
let cauAccumRead = cauRTA, cauAccumWrite = cauRTB;


// ── Materials ─────────────────────────────────────────────────────────────────
const envMapMat = new THREE.ShaderMaterial({
  vertexShader: envMapVert, fragmentShader: envMapFrag
});

const causticsMat = new THREE.ShaderMaterial({
  uniforms: {
    light:          { value: new THREE.Vector3(0, -1, 0) },
    time:           { value: 0.0 },
    eta:            { value: 0.75 },
    spread:         { value: 4.0 },
    channel:        { value: 0 },
    causticsFactor: { value: 0.02 },
    chanColor:      { value: new THREE.Vector3(1, 0, 0) },
    tangentOffset:  { value: 0.0 },
    dispersionMode: { value: 0 },
    envMap:         { value: null },
    lProjMat:       { value: new THREE.Matrix4() },
    lViewMat:       { value: new THREE.Matrix4() },
    envTexelSize:   { value: new THREE.Vector2(1/2048, 1/2048) },
    waveAmp:        { value: 0.0 },
    waveFreq:       { value: 4.0 },
    waveTime:       { value: 0.0 },
  },
  vertexShader: causticsVert,
  fragmentShader: causticsFrag,
  transparent: true,
  blending: THREE.CustomBlending,
  blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
  blendEquationAlpha: THREE.AddEquation,
  blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.ZeroFactor,
  side: THREE.DoubleSide,
  extensions: { derivatives: true },
  depthWrite: false,
});

function makeReceiverMat(r, g, b) {
  return new THREE.ShaderMaterial({
    uniforms: {
      lProjMat:    { value: new THREE.Matrix4() },
      lViewMat:    { value: new THREE.Matrix4() },
      causticsTex:  { value: null },
      baseColor:    { value: new THREE.Vector3(r, g, b) },
      paletteMode:  { value: 0 },
      palShift:     { value: 0.0 },
      gamma:        { value: 1.0 },
      warp:         { value: 0.0 },
      warpTime:     { value: 0.0 },
      shimmer:      { value: 0.0 },
      floorHalfW:   { value: 6.0 },
      floorHalfH:   { value: 6.0 },
    },
    vertexShader: receiverVert,
    fragmentShader: receiverFrag,
  });
}

let casterMesh = new THREE.Mesh(casterGeos[0], causticsMat);
casterMesh.position.set(0, 3.5, 0);

// Receivers
function makeReceiver(geo, mat, pos, rotX, rotY) {
  const m = new THREE.Mesh(geo, mat);
  if (pos)  m.position.set(...pos);
  if (rotX) m.rotation.x = rotX;
  if (rotY) m.rotation.y = rotY;
  return m;
}

const floorMesh    = makeReceiver(new THREE.PlaneGeometry(12,12),  makeReceiverMat(0.576, 0.580, 0.682), [0,-1.5,0],  -Math.PI/2, 0);


const receivers = [floorMesh];

// Main scene
const mainScene = new THREE.Scene();
receivers.forEach(m => mainScene.add(m));

// Visible caster in main scene (glass-like)
const casterVisibleMat = new THREE.MeshPhongMaterial({
  color: 0x223344, transparent: true, opacity: 0.85,
  shininess: 60, specular: 0x334455, side: THREE.FrontSide
});

// FBO for glass screen-space refraction
const glassRT = new THREE.WebGLRenderTarget(
  window.innerWidth  * Math.min(window.devicePixelRatio, 2),
  window.innerHeight * Math.min(window.devicePixelRatio, 2)
);

const glassMat = new THREE.ShaderMaterial({
  uniforms: {
    uSceneTex:   { value: glassRT.texture },
    uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    eta:         { value: 0.75 },
    dispersion:  { value: 0.04 },
    fresnelPow:  { value: 4.0 },
    refrStrength:{ value: 0.12 },
    uGlowStrength:{ value: 0.0 },
    uGlowColor:   { value: new THREE.Color(0.8, 0.95, 1.2) },
    uLightStrength:{ value: 3.0 },
    waveAmp:      { value: 0.0 },
    waveFreq:     { value: 4.0 },
    waveTime:     { value: 0.0 },
    waveOnObj:    { value: 0 },
  },
  vertexShader:   glassVert,
  fragmentShader: glassFrag,
  transparent: true,
  side: THREE.FrontSide,
  depthWrite: false,
});


let pGlassOn = true;
let pBgColor = 0x9394ae;
let pHideObj = false;
let pExportBgColor = new THREE.Color('#9394ae');


let casterVisible = new THREE.Mesh(casterGeos[0], glassMat);
casterVisible.position.copy(casterMesh.position);
casterVisible.layers.enable(1);
mainScene.add(casterVisible);
const ambLight = new THREE.AmbientLight(0xffffff, 0.06);


const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(0, 5, 0);
mainScene.add(ambLight);
mainScene.add(dirLight);

// Env map scene — same transforms, envMapMat
let envFloorMesh;
const envScene = new THREE.Scene();
receivers.forEach(r => {
  const em = new THREE.Mesh(r.geometry, envMapMat);
  em.position.copy(r.position);
  em.rotation.copy(r.rotation);
  em.scale.copy(r.scale);
  if (r === floorMesh) envFloorMesh = em;
  envScene.add(em);
});

// Caustics scene — just the caster
const cauScene = new THREE.Scene();
cauScene.add(casterMesh);

// Temporal accumulation blend mesh
const blendMat = new THREE.ShaderMaterial({
  uniforms: {
    tNew:  { value: null },
    tOld:  { value: null },
    blend: { value: 0.6 },
  },
  vertexShader: blendVert,
  fragmentShader: blendFrag,
});
const blendMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blendMat);
const blendScene = new THREE.Scene();
blendScene.add(blendMesh);
const blendCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

// Gaussian blur passes
const blurRT1 = new THREE.WebGLRenderTarget(CAU_SIZE, CAU_SIZE, { type: THREE.FloatType });
const blurRT2 = new THREE.WebGLRenderTarget(CAU_SIZE, CAU_SIZE, { type: THREE.FloatType });
const texelSize = new THREE.Vector2(1.0 / CAU_SIZE, 1.0 / CAU_SIZE);

const blurMatH = new THREE.ShaderMaterial({
  uniforms: {
    tInput:    { value: null },
    direction: { value: new THREE.Vector2(1, 0) },
    radius:    { value: 1.5 },
    texelSize: { value: texelSize },
  },
  vertexShader: blurVert, fragmentShader: blurFrag,
});
const blurMatV = new THREE.ShaderMaterial({
  uniforms: {
    tInput:    { value: null },
    direction: { value: new THREE.Vector2(0, 1) },
    radius:    { value: 1.5 },
    texelSize: { value: texelSize },
  },
  vertexShader: blurVert, fragmentShader: blurFrag,
});
const blurPlane = new THREE.PlaneGeometry(2, 2);
const blurMeshH = new THREE.Mesh(blurPlane, blurMatH);
const blurMeshV = new THREE.Mesh(blurPlane, blurMatV);
const blurSceneH = new THREE.Scene(); blurSceneH.add(blurMeshH);
const blurSceneV = new THREE.Scene(); blurSceneV.add(blurMeshV);

const _dispMat = new THREE.ShaderMaterial({
  uniforms: {
    tCaustics:     { value: null },
    baseColor:     { value: new THREE.Vector3(0.576, 0.580, 0.682) },
    paletteMode:   { value: 0 },
    gamma:         { value: 1.0 },
    warp:          { value: 0.0 },
    warpTime:      { value: 0.0 },
    shimmer:       { value: 0.0 },
  },
  vertexShader: blendVert,
  fragmentShader: _dispFrag,
});
const _dispMesh  = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), _dispMat);
const _dispScene = new THREE.Scene(); _dispScene.add(_dispMesh);


// Shape switcher
function switchCaster(idx) {
  cauScene.remove(casterMesh);
  mainScene.remove(casterVisible);
  casterMesh = new THREE.Mesh(casterGeos[idx], causticsMat);
  casterMesh.position.set(0, 3.5, 0);
  cauScene.add(casterMesh);
  casterVisible = new THREE.Mesh(casterGeos[idx], glassMat);
  casterVisible.position.set(0, 3.5, 0);
  casterVisible.visible = !pHideObj;
  mainScene.add(casterVisible);
}

// ── Render passes ─────────────────────────────────────────────────────────────

function renderEnvMap() {
  renderer.setRenderTarget(envRT);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(envScene, projCam);
}

function renderCaustics() {
  // 1. Render new caustics frame into cauRT
  renderer.setRenderTarget(cauRT);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  causticsMat.uniforms.spread.value = pSpread;
  // HSV to RGB helper
  function hsvToRgb(h, s, v) {
    const i = Math.floor(h * 6);
    const f = h * 6 - i;
    const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    const mod = i % 6;
    if (mod === 0) return [v, t, p];
    if (mod === 1) return [q, v, p];
    if (mod === 2) return [p, v, t];
    if (mod === 3) return [p, q, v];
    if (mod === 4) return [t, p, v];
    return [v, p, q];
  }

  const N = pPasses;
  for (let i = 0; i < N; i++) {
    const t = N === 1 ? 0 : i / (N - 1);
    // eta spread across passes
    const etaI = pEta * (1 - pDisp * t);
    // hue goes from hueStart to hueStart+hueRange
    const hue = (pHueStart + t * pHueRange) % 1.0;
    // brightness slightly higher in middle for smooth blending
    const brightness = 0.7 + 0.3 * Math.sin(Math.PI * t);
    const [r, g, b] = hsvToRgb(hue, 1.0, brightness);
    // Scale intensity down per pass so total energy stays consistent
    causticsMat.uniforms.causticsFactor.value = pInt / N * 3;
    causticsMat.uniforms.eta.value = etaI;
    causticsMat.uniforms.channel.value = i % 3;
    causticsMat.uniforms.chanColor.value.set(r, g, b);
    causticsMat.uniforms.dispersionMode.value = pDispersionMode;
    // tangentOffset goes from -0.5 to +0.5 across passes
    causticsMat.uniforms.tangentOffset.value = (t - 0.5) * pTangentStr;
    renderer.render(cauScene, projCam);
  }

  // 2. Blend new frame with accumulated history → write to cauAccumWrite
  blendMat.uniforms.tNew.value  = cauRT.texture;
  blendMat.uniforms.tOld.value  = cauAccumRead.texture;
  blendMat.uniforms.blend.value = pTrails;
  renderer.setRenderTarget(cauAccumWrite);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(blendScene, blendCam);

  // 3. Swap ping-pong buffers
  const tmp = cauAccumRead;
  cauAccumRead = cauAccumWrite;
  cauAccumWrite = tmp;

  // 4. Gaussian blur: horizontal pass
  blurMatH.uniforms.tInput.value  = cauAccumRead.texture;
  blurMatH.uniforms.radius.value  = pBlur;
  renderer.setRenderTarget(blurRT1);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(blurSceneH, blendCam);

  // 5. Gaussian blur: vertical pass
  blurMatV.uniforms.tInput.value  = blurRT1.texture;
  blurMatV.uniforms.radius.value  = pBlur;
  renderer.setRenderTarget(blurRT2);
  renderer.setClearColor(0x000000, 0);
  renderer.clear();
  renderer.render(blurSceneV, blendCam);
}


document.getElementById('sPalette').addEventListener('change', e => pPalette = parseInt(e.target.value));

// ── Animate ───────────────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const t = clock.getElapsedTime();

  // Rotation
  casterMesh.rotation.y = t * pSpd * 2.0 + pStartRot;
  casterMesh.rotation.x = t * pSpd * 1.3;
  casterVisible.rotation.y = casterMesh.rotation.y;
  casterVisible.rotation.x = casterMesh.rotation.x;

  // Scale
  casterMesh.scale.setScalar(pScale);
  casterVisible.scale.setScalar(pScale);

  // Light direction — base + drift over time + manual angle
  // Drift animates the angle, not position
  const driftX = Math.sin(t * pDrift * 0.7) * 0.5;
  const driftZ = Math.cos(t * pDrift * 0.5) * 0.5;
  const angleX = pLightX + driftX;
  const angleZ = pLightZ + driftZ;
  // Light direction from angle sliders
  const lightDir = new THREE.Vector3(angleX, -1, angleZ).normalize();
  causticsMat.uniforms.light.value.copy(lightDir);
  causticsMat.uniforms.time.value     = t;
  causticsMat.uniforms.waveAmp.value  = pWaveAmp;
  causticsMat.uniforms.waveFreq.value = pWaveFreq;
  causticsMat.uniforms.waveTime.value = t * pWaveSpd;
  glassMat.uniforms.waveAmp.value     = pWaveAmp;
  glassMat.uniforms.waveFreq.value    = pWaveFreq;
  glassMat.uniforms.waveTime.value    = t * pWaveSpd;
  glassMat.uniforms.waveOnObj.value   = 1;
  // Light position: fixed height=8, XZ from position sliders, plus angle offset so it aims at scene
  const lx = pLightPX + angleX * 3;
  const lz = pLightPZ + angleZ * 3;
  lightCam.position.set(lx, 8, lz);
  projCam.position.set(lx, 8, lz);
  lightCam.lookAt(pLightPX * 0.3, 0, pLightPZ * 0.3);
  projCam.lookAt(pLightPX * 0.3, 0, pLightPZ * 0.3);
  // Dynamically widen frustum so scene never clips when light moves to edge
  const frustumDrift = Math.sqrt(lx * lx + lz * lz) * 1.2;
  projCam.left   = -(pFloorW / 2 + frustumDrift); projCam.right = pFloorW / 2 + frustumDrift;
  projCam.top    =   pFloorH / 2 + frustumDrift;  projCam.bottom = -(pFloorH / 2 + frustumDrift);
  projCam.updateProjectionMatrix();
  lightCam.updateMatrixWorld(true);
  projCam.updateMatrixWorld(true);

  // Update env map uniforms on caustics mat
  causticsMat.uniforms.lProjMat.value.copy(projCam.projectionMatrix);
  causticsMat.uniforms.lViewMat.value.copy(projCam.matrixWorldInverse);
  // Keep receiver projection matrices in sync with light camera
  receivers.forEach(m => {
    m.material.uniforms.lProjMat.value.copy(projCam.projectionMatrix);
    m.material.uniforms.lViewMat.value.copy(projCam.matrixWorldInverse);
  });

  renderEnvMap();
  causticsMat.uniforms.envMap.value = envRT.texture;
  // Keep glass material in sync with caustics parameters
  if (pGlassOn) {
    glassMat.uniforms.eta.value         = pEta;
    glassMat.uniforms.dispersion.value  = pDisp * 0.08;
  }
  renderCaustics();

  const cauTex = pBlur > 0.05 ? blurRT2.texture : cauAccumRead.texture;
  receivers.forEach(m => {
    m.material.uniforms.causticsTex.value = cauTex;
    m.material.uniforms.paletteMode.value = pPalette;
    m.material.uniforms.gamma.value = pGamma;
    m.material.uniforms.warp.value = pWarp;
    m.material.uniforms.warpTime.value = t * pWarpSpd;
    m.material.uniforms.shimmer.value = pShimmer;
  });
  _dispMat.uniforms.tCaustics.value      = cauTex;
  _dispMat.uniforms.paletteMode.value    = pPalette;
  _dispMat.uniforms.gamma.value          = pGamma;
  _dispMat.uniforms.warp.value           = pWarp;
  _dispMat.uniforms.warpTime.value       = t * pWarpSpd;
  _dispMat.uniforms.shimmer.value        = pShimmer;
  _dispMat.uniforms.baseColor.value.set(pExportBgColor.r, pExportBgColor.g, pExportBgColor.b);

  // Glass FBO pass — hide caster, render scene to texture, restore
  if (pGlassOn) {
    casterVisible.visible = false;
    renderer.setRenderTarget(glassRT);
    renderer.setClearColor(pBgColor, 1);
    renderer.clear();
    renderer.render(mainScene, camera);
    renderer.setRenderTarget(null);
    casterVisible.visible = !pHideObj;
    glassMat.uniforms.uSceneTex.value = glassRT.texture;
  }

  renderer.setRenderTarget(null);
  renderer.setClearColor(pBgColor, 1);
  renderer.clear();
  renderer.render(mainScene, camera);

  // ── Recording frame ──────────────────────────────────────────────────────
  if (_mediaRecorder && _mediaRecorder.state === 'recording') {
    renderer.setRenderTarget(_recRT);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(_dispScene, blendCam);
    renderer.setRenderTarget(null);
    renderer.readRenderTargetPixels(_recRT, 0, 0, _recW, _recH, _recPixels);
    flipYInto(_recPixels, _recImgData, _recW, _recH);
    _recCtx.putImageData(_recImgData, 0, 0);
  }

  controls.update();
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Tooltips ──────────────────────────────────────────────────────────────────
const tooltipEl = document.getElementById('tooltip');
const tipData = {
  sLightPX:        'light position X',
  sLightPZ:        'light position Z',
  sLightX:         'light angle X',
  sLightZ:         'light angle Z',
  sDrift:          'animates light angle over time',
  sEta:            'refractive index — lower = more bend',
  sSpread:         'how far refracted rays travel — higher values spread caustics over a wider area',
  sInt:            'linear brightness scale — uniform multiplier on all caustic energy',
  sGamma:          'contrast curve applied after intensity — above 1 sharpens bright hotspots, below 1 lifts dim areas',
  sPasses:         'number of colour passes — more passes give a smoother, finer rainbow',
  sDisp:           'eta variation across passes — how wide the colour spread is',
  sDispersionMode: 'radial: spreads colours by bending angle · tangent: shifts colours along the edge',
  sTangentStr:     'how strongly the edge-aligned tangent dispersion shifts each colour band',
  sHueRange:       '0 = monochrome · 1 = full spectrum across all passes',
  sHueStart:       'rotates the starting point of the colour spectrum',
  sPalette:        'colour map overlay applied on top of the raw caustic colour',
  sBlur:           'gaussian blur radius — softens caustic edges',
  sTrails:         'temporal accumulation — how much of the previous frame bleeds into the current one',
  sWarp:           'bends the caustic texture with animated noise — creates a rippling distortion',
  sWarpSpd:        'speed of the warp noise animation',
  sShimmer:        'perlin noise intensity — modulates brightness unevenly across the surface over time',
  sCasterShape:    'geometry of the refractive object',
  sHideObj:        'show or hide the refractive object in the scene',
  sSpd:            'rotation speed around the Y axis',
  sScale:          'uniform scale of the object',
  sAspect:         'aspect ratio of the floor plane and exported images',
  sStartRot:       'initial rotation angle before animation begins',
  sWaveAmp:        'wave displacement amplitude — how far vertices are pushed by the wave',
  sWaveFreq:       'spatial frequency of the wave pattern',
  sWaveSpd:        'how fast the wave pattern animates',
};
document.querySelectorAll('.tip').forEach(el => {
  const id = el.dataset.for;
  el.addEventListener('mouseenter', () => {
    tooltipEl.textContent = tipData[id] || '';
    tooltipEl.style.display = 'block';
    const r = el.getBoundingClientRect();
    requestAnimationFrame(() => {
      tooltipEl.style.left = (r.left - tooltipEl.offsetWidth - 8) + 'px';
      tooltipEl.style.top  = (r.top + r.height / 2 - tooltipEl.offsetHeight / 2) + 'px';
    });
  });
  el.addEventListener('mouseleave', () => {
    tooltipEl.style.display = 'none';
  });
});

// webgl is y-flipped vs canvas
function flipYInto(srcPixels, dstImageData, width, height) {
  const rowBytes = width * 4;
  for (let y = 0; y < height; y++) {
    dstImageData.data.set(
      srcPixels.subarray((height - 1 - y) * rowBytes, (height - y) * rowBytes),
      y * rowBytes
    );
  }
}

// ── Caustic texture download ───────────────────────────────────────────────
let _dlW = 2048, _dlH = 2048;
let _dlRT = new THREE.WebGLRenderTarget(_dlW, _dlH);
let _dlPixels = new Uint8Array(_dlW * _dlH * 4);
const _dlCanvas = document.createElement('canvas');
_dlCanvas.width = _dlW; _dlCanvas.height = _dlH;
const _dlCtx = _dlCanvas.getContext('2d', { alpha: true });
let _dlImgData = _dlCtx.createImageData(_dlW, _dlH);

document.getElementById('btnDownloadTex').addEventListener('click', () => {
  renderer.setRenderTarget(_dlRT);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  renderer.render(_dispScene, blendCam);
  renderer.setRenderTarget(null);
  renderer.readRenderTargetPixels(_dlRT, 0, 0, _dlW, _dlH, _dlPixels);
  flipYInto(_dlPixels, _dlImgData, _dlW, _dlH);
  _dlCtx.putImageData(_dlImgData, 0, 0);
  const a = document.createElement('a');
  a.href = _dlCanvas.toDataURL('image/png');
  a.download = 'caustics.png';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

// ── Video recording ────────────────────────────────────────────────────────
let _recW = 1024, _recH = 1024;
let _recRT = new THREE.WebGLRenderTarget(_recW, _recH);
const _recCanvas = document.createElement('canvas');
_recCanvas.width = _recW; _recCanvas.height = _recH;
const _recCtx = _recCanvas.getContext('2d', { alpha: true });
let _recPixels = new Uint8Array(_recW * _recH * 4);
let _recImgData = _recCtx.createImageData(_recW, _recH);

const btnRecord = document.getElementById('btnRecord');
let _mediaRecorder = null;
let _recordChunks = [];

const _mimeType = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4']
  .find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';
const _videoExt = _mimeType.includes('mp4') ? 'mp4' : 'webm';

btnRecord.addEventListener('click', () => {
  if (_mediaRecorder && _mediaRecorder.state === 'recording') {
    _mediaRecorder.stop();
  } else {
    _recordChunks = [];
    let stream;
    try {
      stream = _recCanvas.captureStream(30);
      _mediaRecorder = new MediaRecorder(stream, { mimeType: _mimeType, videoBitsPerSecond: 12_000_000 });
    } catch(e) {
      try { _mediaRecorder = new MediaRecorder(stream); } catch(_) {
        alert('Video recording is not supported in this browser.');
        return;
      }
    }
    _mediaRecorder.addEventListener('dataavailable', e => {
      if (e.data.size > 0) _recordChunks.push(e.data);
    });
    _mediaRecorder.addEventListener('stop', () => {
      const blob = new Blob(_recordChunks, { type: _mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `caustics.${_videoExt}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      btnRecord.classList.remove('recording');
      btnRecord.innerHTML = '● record video';
    });
    _mediaRecorder.start();
    btnRecord.classList.add('recording');
    btnRecord.innerHTML = '<span class="rec-dot"></span>stop recording';
  }
});

// ── Aspect ratio ──────────────────────────────────────────────────────────────
function setAspect(name) {
  const p = ASPECT_PRESETS[name];
  if (!p) return;
  pFloorW = p.worldW; pFloorH = p.worldH;

  // Rebuild floor geometry (share between mainScene and envScene)
  floorMesh.geometry.dispose();
  const newGeo = new THREE.PlaneGeometry(pFloorW, pFloorH);
  floorMesh.geometry = newGeo;
  if (envFloorMesh) envFloorMesh.geometry = newGeo;
  floorMesh.material.uniforms.floorHalfW.value = pFloorW / 2;
  floorMesh.material.uniforms.floorHalfH.value = pFloorH / 2;

  // Rebuild download buffers
  _dlW = p.dlW; _dlH = p.dlH;
  _dlRT.dispose();
  _dlRT = new THREE.WebGLRenderTarget(_dlW, _dlH);
  _dlPixels = new Uint8Array(_dlW * _dlH * 4);
  _dlCanvas.width = _dlW; _dlCanvas.height = _dlH;
  _dlImgData = _dlCtx.createImageData(_dlW, _dlH);

  // Rebuild recording buffers
  _recW = p.recW; _recH = p.recH;
  _recRT.dispose();
  _recRT = new THREE.WebGLRenderTarget(_recW, _recH);
  _recPixels = new Uint8Array(_recW * _recH * 4);
  _recCanvas.width = _recW; _recCanvas.height = _recH;
  _recImgData = _recCtx.createImageData(_recW, _recH);
}

document.getElementById('sAspect')?.addEventListener('change', e => setAspect(e.target.value));
document.getElementById('sExportBg')?.addEventListener('input', e => {
  pExportBgColor.set(e.target.value);
  pBgColor = pExportBgColor.getHex();
  receivers.forEach(m => m.material.uniforms.baseColor.value.set(pExportBgColor.r, pExportBgColor.g, pExportBgColor.b));
});

animate();

// ── Panel toggle ───────────────────────────────────────────────────────────
(function () {
  const btn   = document.getElementById('panel-toggle');
  const panel = document.getElementById('panel');
  btn.addEventListener('click', () => {
    const collapsed = panel.classList.toggle('collapsed');
    btn.classList.toggle('collapsed', collapsed);
    btn.innerHTML = collapsed ? '&#8250;' : '&#8249;';
  });
}());
