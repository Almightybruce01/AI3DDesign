import * as THREE from '/nm/three/build/three.module.js';
import { OrbitControls } from '/nm/three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from '/nm/three/examples/jsm/controls/TransformControls.js';
import { OBJLoader } from '/nm/three/examples/jsm/loaders/OBJLoader.js';
import { STLLoader } from '/nm/three/examples/jsm/loaders/STLLoader.js';
import { RoomEnvironment } from '/nm/three/examples/jsm/environments/RoomEnvironment.js';
import { OBJExporter } from '/nm/three/examples/jsm/exporters/OBJExporter.js';
import { EffectComposer } from '/nm/three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '/nm/three/examples/jsm/postprocessing/RenderPass.js';
import { OutlinePass } from '/nm/three/examples/jsm/postprocessing/OutlinePass.js';
import { OutputPass } from '/nm/three/examples/jsm/postprocessing/OutputPass.js';
import Stats from '/nm/three/examples/jsm/libs/stats.module.js';
import { runWithBuildOverlay, fetchEstimate } from '/js/build-overlay.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = {
  tool: 'orbit',
  clip: 0,
  wire: false,
  shading: 'metal',
  xformMode: 'translate',
  measureStep: 0,
  measurePts: [],
  model: null,
  cutter: null,
  xform: null,
  grid: null,
  snapStep: 0,
  postFX: true,
  cadEdges: false,
  backdropGrids: [],
  spaceLines: null,
};

/** Set after a successful /api/jewelry/vector-scan; sent as vectorId when “Use last trace” is on. */
let lastVectorId = null;

const EXPORT_PREFS_KEY = 'mw_export_prefs_v1';
const LAST_VECTOR_KEY = 'mw_last_vector_id';
let introAnimToken = 0;

function loadExportPrefs() {
  try {
    return JSON.parse(localStorage.getItem(EXPORT_PREFS_KEY)) || {};
  } catch {
    return {};
  }
}

function saveExportPrefs(p) {
  try {
    localStorage.setItem(EXPORT_PREFS_KEY, JSON.stringify({ ...loadExportPrefs(), ...p }));
  } catch (_) {}
}

function getExportPref(k, def) {
  const p = loadExportPrefs();
  return p[k] !== undefined ? p[k] : def;
}

function loadPersistedVectorId() {
  try {
    const v = localStorage.getItem(LAST_VECTOR_KEY);
    if (v) lastVectorId = v;
  } catch (_) {}
}

function persistVectorId(id) {
  lastVectorId = id;
  try {
    localStorage.setItem(LAST_VECTOR_KEY, id);
  } catch (_) {}
  updateVectorExportUI();
}

function updateVectorExportUI() {
  const a = $('#vector-svg-link');
  const hint = $('#vector-pref-hint');
  if (!a) return;
  if (lastVectorId) {
    a.href = `/generated/${lastVectorId}.svg`;
    a.classList.remove('mw-disabled');
    a.removeAttribute('aria-disabled');
    if (hint) hint.textContent = `Last trace: ${lastVectorId}`;
  } else {
    a.href = '#';
    a.classList.add('mw-disabled');
    a.setAttribute('aria-disabled', 'true');
    if (hint) hint.textContent = 'No vector trace yet — use “Trace to SVG” above.';
  }
}

function initExportPrefsUI() {
  const p = loadExportPrefs();
  const pop = $('#pref-pop-animate');
  if (pop) pop.checked = p.popAnimate !== false;
  const stl = $('#pref-auto-stl');
  if (stl) stl.checked = !!p.autoStl;
  const obj = $('#pref-auto-obj');
  if (obj) obj.checked = !!p.autoObj;
  const cad = $('#pref-auto-cad');
  if (cad) cad.checked = !!p.autoCad;
}

const BOOKMARK_KEY = 'mw_cam_bookmarks_v1';
let bookmarks = [];

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._id);
  toast._id = setTimeout(() => t.classList.remove('show'), 3200);
}

const canvas = $('#cvs');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0c10);
scene.fog = new THREE.Fog(0x0a0c10, 55, 3400);

function styleGridOpacity(gridHelper, opacity) {
  const mats = Array.isArray(gridHelper.material) ? gridHelper.material : [gridHelper.material];
  mats.forEach((m) => {
    m.transparent = true;
    m.opacity = opacity;
    m.depthWrite = false;
  });
}

function buildSpaceLines() {
  const positions = [];
  for (let i = 0; i < 220; i++) {
    const x = (Math.random() - 0.5) * 2800;
    const y = Math.random() * 1100 - 120;
    const z = (Math.random() - 0.5) * 2800;
    const len = 35 + Math.random() * 160;
    const dir = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 0.4, Math.random() - 0.5)
      .normalize();
    positions.push(x, y, z, x + dir.x * len, y + dir.y * len, z + dir.z * len);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0x8a9bb8,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
  });
  const lines = new THREE.LineSegments(geo, mat);
  lines.frustumCulled = false;
  scene.add(lines);
  return lines;
}

const perspCamera = new THREE.PerspectiveCamera(42, 2, 0.08, 5000);
perspCamera.position.set(45, 32, 55);
const orthoCamera = new THREE.OrthographicCamera(-40, 40, 40, -40, 0.08, 5000);
let orthoMode = false;
let viewCamera = perspCamera;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;

const controls = new OrbitControls(viewCamera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.screenSpacePanning = true;
controls.minDistance = 2;
controls.maxDistance = 800;
controls.zoomSpeed = 1.05;
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };

const pmrem = new THREE.PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();
const envScene = new RoomEnvironment();
const rt = pmrem.fromScene(envScene);
scene.environment = rt.texture;
pmrem.dispose();

const amb = new THREE.HemisphereLight(0xffffff, 0xa0aab8, 0.58);
scene.add(amb);
const sun = new THREE.DirectionalLight(0xfff8f0, 1.05);
sun.position.set(38, 72, 42);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(2048);
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 220;
sun.shadow.camera.left = sun.shadow.camera.bottom = -70;
sun.shadow.camera.right = sun.shadow.camera.top = 70;
scene.add(sun);
const fill = new THREE.DirectionalLight(0xc8d4f0, 0.42);
fill.position.set(-36, 22, -38);
scene.add(fill);

const root = new THREE.Group();
scene.add(root);

const gridFar = new THREE.GridHelper(1500, 60, 0x3a4a5e, 0x232a35);
gridFar.position.y = -0.02;
styleGridOpacity(gridFar, 0.1);
scene.add(gridFar);
state.backdropGrids.push(gridFar);

const gridMid = new THREE.GridHelper(520, 52, 0x5a6578, 0x38404d);
gridMid.position.y = -0.01;
styleGridOpacity(gridMid, 0.19);
scene.add(gridMid);
state.backdropGrids.push(gridMid);

state.grid = new THREE.GridHelper(200, 40, 0x8b95a8, 0xb8c4d4);
styleGridOpacity(state.grid, 0.36);
scene.add(state.grid);
state.backdropGrids.push(state.grid);

state.spaceLines = buildSpaceLines();

const clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);

const _vpSize = new THREE.Vector2();
let composer;
let renderPass;
let outlinePass;
function initPostProcessing() {
  renderer.getSize(_vpSize);
  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(scene, viewCamera);
  outlinePass = new OutlinePass(_vpSize, scene, viewCamera, []);
  outlinePass.visibleEdgeColor.setHex(0xd4af37);
  outlinePass.hiddenEdgeColor.setHex(0x1e1a14);
  outlinePass.edgeStrength = 3.5;
  outlinePass.edgeThickness = 1.35;
  outlinePass.pulsePeriod = 0;
  const outputPass = new OutputPass();
  composer.addPass(renderPass);
  composer.addPass(outlinePass);
  composer.addPass(outputPass);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

initPostProcessing();

function syncComposerCameras() {
  if (!renderPass || !outlinePass) return;
  renderPass.camera = viewCamera;
  outlinePass.renderCamera = viewCamera;
}

function collectModelMeshes() {
  const sel = [];
  root.traverse((o) => {
    if (o.isMesh && o.visible) sel.push(o);
  });
  return sel;
}

function updateOutlineTargets() {
  if (!outlinePass) return;
  const meshes = collectModelMeshes();
  outlinePass.selectedObjects = meshes;
  outlinePass.enabled = state.postFX && meshes.length > 0;
}

function setCadEdges(on) {
  state.cadEdges = on;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const remove = [];
    o.children.forEach((ch) => {
      if (ch.userData && ch.userData.mwCadEdge) remove.push(ch);
    });
    remove.forEach((ch) => {
      o.remove(ch);
      ch.geometry?.dispose?.();
    });
    if (!on) return;
    try {
      const eg = new THREE.EdgesGeometry(o.geometry, 20);
      const line = new THREE.LineSegments(
        eg,
        new THREE.LineBasicMaterial({
          color: 0x3d485d,
          transparent: true,
          opacity: 0.88,
        }),
      );
      line.userData.mwCadEdge = true;
      line.raycast = () => {};
      o.add(line);
    } catch (_) {}
  });
}

const stats = new Stats();
stats.dom.style.position = 'absolute';
stats.dom.style.left = 'auto';
stats.dom.style.right = '6px';
stats.dom.style.top = '54px';
$('.vp-wrap').appendChild(stats.dom);
if (!localStorage.getItem('showFps')) stats.dom.style.display = 'none';

const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let dragSuppress = false;

function matForJewelry(wire) {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xdfe6ee,
    metalness: 1,
    roughness: 0.22,
    clearcoat: 0.85,
    clearcoatRoughness: 0.18,
    envMapIntensity: 1.15,
    wireframe: wire,
    clippingPlanes: [clipPlane],
    clipShadows: true,
    side: THREE.DoubleSide,
  });
  return m;
}

function applyClip(dist) {
  clipPlane.constant = dist;
  root.traverse((o) => {
    if (o.isMesh && o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((mm) => {
        if (mm && mm.clippingPlanes) mm.clippingPlanes = [clipPlane];
      });
    }
  });
}

function applyWire(w) {
  state.wire = w;
  applyViewportMaterialMode();
}

function clearModel() {
  introAnimToken++;
  while (root.children.length) {
    const o = root.children[0];
    root.remove(o);
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const m = Array.isArray(o.material) ? o.material : [o.material];
      m.forEach((x) => x?.dispose?.());
    }
  }
  state.model = null;
}

function animateEntrance(obj3d) {
  if (!obj3d || !getExportPref('popAnimate', true)) return;
  const token = introAnimToken;
  const from = 0.035;
  obj3d.scale.setScalar(from);
  const start = performance.now();
  const dur = 560;
  function tick() {
    if (token !== introAnimToken) return;
    const t = Math.min(1, (performance.now() - start) / dur);
    const s = from + (1 - from) * (1 - (1 - t) ** 3);
    obj3d.scale.setScalar(s);
    if (t < 1) requestAnimationFrame(tick);
    else obj3d.scale.set(1, 1, 1);
  }
  requestAnimationFrame(tick);
}

function syncOrthoFromPersp() {
  const aspect = perspCamera.aspect;
  const dist = perspCamera.position.distanceTo(controls.target);
  const half = Math.max(6, dist * 0.36);
  orthoCamera.left = -half * aspect;
  orthoCamera.right = half * aspect;
  orthoCamera.top = half;
  orthoCamera.bottom = -half;
  orthoCamera.near = perspCamera.near;
  orthoCamera.far = perspCamera.far;
  orthoCamera.position.copy(perspCamera.position);
  orthoCamera.quaternion.copy(perspCamera.quaternion);
  orthoCamera.updateProjectionMatrix();
}

function setOrthoMode(on) {
  orthoMode = on;
  if (on) {
    syncOrthoFromPersp();
    viewCamera = orthoCamera;
  } else {
    viewCamera = perspCamera;
  }
  controls.object = viewCamera;
  if (state.xform) state.xform.camera = viewCamera;
  syncComposerCameras();
  controls.update();
  const el = $('#vp-ortho-label');
  if (el) el.textContent = on ? 'Orthographic' : 'Perspective';
}

function fitCamera() {
  const box = new THREE.Box3();
  if (root.children.length) box.setFromObject(root);
  else {
    box.setFromCenterAndSize(new THREE.Vector3(0, 0, 0), new THREE.Vector3(40, 10, 8));
  }
  const c = box.getCenter(new THREE.Vector3());
  const s = box.getSize(new THREE.Vector3());
  const md = Math.max(s.x, s.y, s.z, 4) * 1.8;
  controls.target.copy(c);
  perspCamera.near = Math.max(0.01, md / 2000);
  perspCamera.far = md * 80;
  perspCamera.updateProjectionMatrix();
  perspCamera.position.set(c.x + md * 0.85, c.y + md * 0.45, c.z + md * 0.85);
  if (orthoMode) syncOrthoFromPersp();
  controls.update();
}

function viewPreset(which) {
  const t = controls.target.clone();
  const md = Math.max(14, perspCamera.position.distanceTo(t) * 1.02);
  if (which === 'iso') {
    fitCamera();
    return;
  }
  const p = new THREE.Vector3();
  if (which === 'front') p.set(t.x, t.y, t.z + md);
  else if (which === 'back') p.set(t.x, t.y, t.z - md);
  else if (which === 'top') p.set(t.x, t.y + md, t.z);
  else if (which === 'bottom') p.set(t.x, t.y - md, t.z);
  else if (which === 'right') p.set(t.x + md, t.y, t.z);
  else if (which === 'left') p.set(t.x - md, t.y, t.z);
  else {
    fitCamera();
    return;
  }
  perspCamera.position.copy(p);
  perspCamera.lookAt(t);
  perspCamera.updateProjectionMatrix();
  if (orthoMode) syncOrthoFromPersp();
  controls.update();
}

async function loadOBJ(url) {
  clearModel();
  toast('Loading mesh…');
  const obj = await new OBJLoader().loadAsync(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now());
  obj.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      const old = child.material;
      child.material = matForJewelry(state.wire);
      if (old && old.map) child.material.map = old.map;
    }
  });
  root.add(obj);
  state.model = obj;
  applyClip(state.clip);
  applyViewportMaterialMode();
  if (state.cadEdges) setCadEdges(true);
  fitCamera();
  animateEntrance(state.model);
  refreshTransformPanel();
  toast('Mesh loaded');
}

async function loadSTLBuffer(buf) {
  clearModel();
  const geom = new STLLoader().parse(buf);
  geom.computeVertexNormals();
  const mesh = new THREE.Mesh(geom, matForJewelry(state.wire));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh);
  state.model = mesh;
  applyViewportMaterialMode();
  if (state.cadEdges) setCadEdges(true);
  fitCamera();
  animateEntrance(state.model);
  refreshTransformPanel();
  toast('STL loaded');
}

function ensureCutterMesh() {
  if (state.cutter) return;
  const g = new THREE.BoxGeometry(6, 6, 4);
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x5ad,
    transparent: true,
    opacity: 0.22,
    metalness: 0.2,
    roughness: 0.4,
    depthWrite: false,
  });
  state.cutter = new THREE.Mesh(g, m);
  state.cutter.position.set(12, 4, 8);
  scene.add(state.cutter);
}

function ensureTransformControls() {
  if (state.xform) return;
  state.xform = new TransformControls(viewCamera, canvas);
  state.xform.visible = false;
  scene.add(state.xform);
  state.xform.addEventListener('dragging-changed', (e) => {
    controls.enabled = !e.value;
    if (!e.value && state.tool === 'piece' && state.snapStep) applySnapToModel();
  });
  state.xform.addEventListener('change', () => {
    refreshTransformPanel();
  });
}

function detachTransform() {
  if (!state.xform) return;
  state.xform.detach();
  state.xform.visible = false;
}

function toggleCutter(show) {
  if (state.cutter) state.cutter.visible = !!show;
}

function onResize() {
  const el = canvas.parentElement;
  const w = el.clientWidth;
  const h = el.clientHeight;
  perspCamera.aspect = w / Math.max(h, 1);
  perspCamera.updateProjectionMatrix();
  syncOrthoFromPersp();
  renderer.setSize(w, h, false);
  if (composer) {
    composer.setSize(w, h);
    composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  }
}
window.addEventListener('resize', onResize);
onResize();

function setTool(id) {
  state.tool = id;
  $$('.rail .tool').forEach((b) => b.setAttribute('data-active', b.dataset.tool === id));
  detachTransform();
  toggleCutter(false);
  if (id === 'cutter') {
    ensureCutterMesh();
    ensureTransformControls();
    state.cutter.visible = true;
    state.xform.setMode('translate');
    state.xform.attach(state.cutter);
    state.xform.visible = true;
    toast('Subtractive preview box — position for reference (server booleans via Build)');
  } else if (id === 'piece') {
    if (!state.model) {
      toast('Load a mesh first (Build, Import, or Load last).');
      setTool('orbit');
      return;
    }
    ensureTransformControls();
    state.xform.setMode(state.xformMode || 'translate');
    state.xform.attach(state.model);
    state.xform.visible = true;
    refreshTransformPanel();
    toast('Gizmo on piece — use numeric fields for exact Matrix-style values');
  }
  if (id === 'orbit') {
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  }
  state.measureStep = 0;
  state.measurePts.length = 0;
  $('#measure-readout').textContent = '';
}

function applyViewportMaterialMode() {
  root.traverse((o) => {
    if (!o.isMesh || !o.material || o === state.cutter) return;
    const mm = o.material;
    const mats = Array.isArray(mm) ? mm : [mm];
    mats.forEach((m) => {
      if (!m || !m.isMeshPhysicalMaterial) return;
      if (state.wire) {
        m.wireframe = true;
        return;
      }
      m.wireframe = false;
      if (state.shading === 'clay') {
        m.metalness = 0.12;
        m.roughness = 0.88;
        m.clearcoat = 0.15;
        m.color.setHex(0xc8b8a8);
      } else {
        m.metalness = 1;
        m.roughness = 0.22;
        m.clearcoat = 0.85;
        m.color.setHex(0xdfe6ee);
      }
    });
  });
}

function snapScalar(v, step) {
  if (!step || step <= 0) return v;
  return Math.round(v / step) * step;
}

function applySnapToModel() {
  const o = state.model;
  if (!o || !state.snapStep) return;
  const step = state.snapStep;
  o.position.x = snapScalar(o.position.x, step);
  o.position.y = snapScalar(o.position.y, step);
  o.position.z = snapScalar(o.position.z, step);
  const e = new THREE.Euler().setFromQuaternion(o.quaternion, 'XYZ');
  const deg = (r) => (r * 180) / Math.PI;
  const rad = (d) => (d * Math.PI) / 180;
  const rStep = step >= 1 ? step : 5;
  o.rotation.set(
    rad(snapScalar(deg(e.x), rStep)),
    rad(snapScalar(deg(e.y), rStep)),
    rad(snapScalar(deg(e.z), rStep)),
  );
  o.updateMatrixWorld(true);
  refreshTransformPanel();
}

function refreshTransformPanel() {
  const o = state.model;
  if (!o || !$('#vp-tx')) return;
  const e = new THREE.Euler().setFromQuaternion(o.quaternion, 'XYZ');
  const deg = (r) => (r * 180) / Math.PI;
  $('#vp-tx').value = o.position.x.toFixed(3);
  $('#vp-ty').value = o.position.y.toFixed(3);
  $('#vp-tz').value = o.position.z.toFixed(3);
  $('#vp-rx').value = deg(e.x).toFixed(2);
  $('#vp-ry').value = deg(e.y).toFixed(2);
  $('#vp-rz').value = deg(e.z).toFixed(2);
  const sx = o.scale.x;
  $('#vp-s').value = sx.toFixed(4);
}

function applyTransformFromInputs() {
  const o = state.model;
  if (!o) return;
  o.position.set(
    parseFloat($('#vp-tx').value) || 0,
    parseFloat($('#vp-ty').value) || 0,
    parseFloat($('#vp-tz').value) || 0,
  );
  const rx = ((parseFloat($('#vp-rx').value) || 0) * Math.PI) / 180;
  const ry = ((parseFloat($('#vp-ry').value) || 0) * Math.PI) / 180;
  const rz = ((parseFloat($('#vp-rz').value) || 0) * Math.PI) / 180;
  o.rotation.set(rx, ry, rz);
  const s = parseFloat($('#vp-s').value) || 1;
  o.scale.set(s, s, s);
  o.updateMatrixWorld(true);
  if (state.xform && state.xform.object === o) state.xform.updateMatrixWorld();
  if (state.snapStep) applySnapToModel();
}

function exportSceneObj() {
  root.updateMatrixWorld(true);
  const exporter = new OBJExporter();
  const data = exporter.parse(root);
  const blob = new Blob([data], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `matrix_workshop_scene_${Date.now()}.obj`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Exported scene OBJ (mesh transforms applied)');
}

function loadBookmarksFromStorage() {
  try {
    const raw = localStorage.getItem(BOOKMARK_KEY);
    bookmarks = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(bookmarks)) bookmarks = [];
  } catch {
    bookmarks = [];
  }
  populateBookmarkSelect();
}

function populateBookmarkSelect() {
  const sel = $('#vp-bm-list');
  if (!sel) return;
  const v = sel.value;
  sel.innerHTML = '';
  const ph = document.createElement('option');
  ph.value = '';
  ph.textContent = bookmarks.length ? 'Choose a view…' : 'No saved views';
  sel.appendChild(ph);
  for (const b of bookmarks) {
    const o = document.createElement('option');
    o.value = b.id;
    o.textContent = b.name || b.id;
    sel.appendChild(o);
  }
  if (v && [...sel.options].some((o) => o.value === v)) sel.value = v;
}

function saveViewBookmark() {
  const name = ($('#vp-bm-name')?.value || '').trim() || `View ${bookmarks.length + 1}`;
  const rec = {
    id: `bm_${Date.now()}`,
    name,
    ortho: orthoMode,
    target: controls.target.toArray(),
    pos: perspCamera.position.toArray(),
  };
  bookmarks.push(rec);
  localStorage.setItem(BOOKMARK_KEY, JSON.stringify(bookmarks));
  populateBookmarkSelect();
  if ($('#vp-bm-name')) $('#vp-bm-name').value = '';
  toast(`Saved “${name}”`);
}

function recallViewBookmark() {
  const id = $('#vp-bm-list')?.value;
  if (!id) {
    toast('Pick a bookmark first.');
    return;
  }
  const b = bookmarks.find((x) => x.id === id);
  if (!b) return;
  controls.target.fromArray(b.target);
  perspCamera.position.fromArray(b.pos);
  perspCamera.lookAt(controls.target);
  perspCamera.updateProjectionMatrix();
  if (b.ortho !== orthoMode) setOrthoMode(!!b.ortho);
  else if (orthoMode) syncOrthoFromPersp();
  controls.update();
  toast(`Recalled “${b.name}”`);
}

function deleteViewBookmark() {
  const id = $('#vp-bm-list')?.value;
  if (!id) return;
  bookmarks = bookmarks.filter((x) => x.id !== id);
  localStorage.setItem(BOOKMARK_KEY, JSON.stringify(bookmarks));
  populateBookmarkSelect();
  toast('Bookmark removed');
}

function viewportScreenshot() {
  syncComposerCameras();
  updateOutlineTargets();
  if (state.postFX && composer) composer.render();
  else renderer.render(scene, viewCamera);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `matrix_workshop_${Date.now()}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('PNG saved');
  }, 'image/png');
}

canvas.addEventListener('pointerdown', (ev) => {
  if (state.tool !== 'measure' || ev.button !== 0) return;
  const r = canvas.getBoundingClientRect();
  ndc.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
  ndc.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
  raycaster.setFromCamera(ndc, viewCamera);
  const hits = raycaster.intersectObjects(root.children, true);
  if (!hits.length) return;
  const p = hits[0].point.clone();
  state.measurePts.push(p);
  if (state.measurePts.length === 2) {
    const d = state.measurePts[0].distanceTo(state.measurePts[1]);
    $('#measure-readout').textContent = `${d.toFixed(3)} mm (scene units)`;
    state.measurePts.length = 0;
  }
});

function loop() {
  requestAnimationFrame(loop);
  stats.begin();
  controls.update();
  const dist = viewCamera.position.distanceTo(controls.target);
  const zl = $('#vp-zoom-readout');
  if (zl) zl.textContent = dist.toFixed(1);
  syncComposerCameras();
  updateOutlineTargets();
  if (state.postFX && composer) {
    composer.render();
  } else {
    renderer.render(scene, viewCamera);
  }
  stats.end();
}
loop();

document.addEventListener(
  'keydown',
  (e) => {
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      fitCamera();
      toast('Framed');
    } else if (e.key === '`') {
      e.preventDefault();
      setOrthoMode(!orthoMode);
    } else if (e.key === 'Escape') {
      setTool('orbit');
    } else if (state.tool === 'piece') {
      if (e.key === '1') {
        e.preventDefault();
        $('#vp-mode-translate')?.click();
      } else if (e.key === '2') {
        e.preventDefault();
        $('#vp-mode-rotate')?.click();
      } else if (e.key === '3') {
        e.preventDefault();
        $('#vp-mode-scale')?.click();
      }
    }
  },
  { capture: true },
);

$('#tool-orbit').addEventListener('click', () => {
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  setTool('orbit');
});
$('#tool-piece')?.addEventListener('click', () => {
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  setTool('piece');
});
$('#tool-pan').addEventListener('click', () => {
  controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
  setTool('orbit');
  toast('Left-drag pans · Orbit tool restores rotate');
});
$('#tool-measure').addEventListener('click', () => setTool('measure'));
$('#tool-cutter').addEventListener('click', () => setTool('cutter'));
$('#tool-frame').addEventListener('click', () => {
  controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
  fitCamera();
  toast('Framed');
});

$('#clip-slider').addEventListener('input', (e) => {
  const v = parseFloat(e.target.value, 10);
  state.clip = v;
  applyClip(v);
  $('#clip-val').textContent = v.toFixed(1);
});

$('#toggle-wire').addEventListener('change', (e) => {
  applyWire(e.target.checked);
});
$('#toggle-grid').addEventListener('change', (e) => {
  const v = e.target.checked;
  state.backdropGrids.forEach((g) => {
    g.visible = v;
  });
  if (state.spaceLines) state.spaceLines.visible = v;
});

$('#vp-toggle-ortho')?.addEventListener('click', () => setOrthoMode(!orthoMode));
$('#vp-screenshot')?.addEventListener('click', () => viewportScreenshot());
$('#vp-view-iso')?.addEventListener('click', () => viewPreset('iso'));
$('#vp-view-front')?.addEventListener('click', () => viewPreset('front'));
$('#vp-view-top')?.addEventListener('click', () => viewPreset('top'));
$('#vp-view-right')?.addEventListener('click', () => viewPreset('right'));
$('#vp-view-back')?.addEventListener('click', () => viewPreset('back'));
$('#vp-view-bottom')?.addEventListener('click', () => viewPreset('bottom'));
$('#vp-view-left')?.addEventListener('click', () => viewPreset('left'));
$('#vp-postfx')?.addEventListener('change', (e) => {
  state.postFX = e.target.checked;
});
$('#vp-cad-edges')?.addEventListener('change', (e) => {
  setCadEdges(e.target.checked);
});
$('#vp-turntable')?.addEventListener('change', (e) => {
  controls.autoRotate = e.target.checked;
  controls.autoRotateSpeed = e.target.checked ? 0.65 : 0;
});
$$('[name="vp-shade"]').forEach((el) => {
  el.addEventListener('change', () => {
    if (el.checked) {
      state.shading = el.value;
      applyViewportMaterialMode();
    }
  });
});
$('#vp-mode-translate')?.addEventListener('click', () => {
  state.xformMode = 'translate';
  if (state.xform && state.tool === 'piece') state.xform.setMode('translate');
});
$('#vp-mode-rotate')?.addEventListener('click', () => {
  state.xformMode = 'rotate';
  if (state.xform && state.tool === 'piece') state.xform.setMode('rotate');
});
$('#vp-mode-scale')?.addEventListener('click', () => {
  state.xformMode = 'scale';
  if (state.xform && state.tool === 'piece') state.xform.setMode('scale');
});
['vp-tx', 'vp-ty', 'vp-tz', 'vp-rx', 'vp-ry', 'vp-rz', 'vp-s'].forEach((id) => {
  $(`#${id}`)?.addEventListener('change', () => applyTransformFromInputs());
});

$('#vp-snap')?.addEventListener('change', (e) => {
  state.snapStep = parseFloat(e.target.value, 10) || 0;
});
$('#vp-bm-save')?.addEventListener('click', saveViewBookmark);
$('#vp-bm-recall')?.addEventListener('click', recallViewBookmark);
$('#vp-bm-delete')?.addEventListener('click', deleteViewBookmark);
$('#vp-export-obj')?.addEventListener('click', () => {
  if (!root.children.length) {
    toast('Nothing to export — build or import a mesh first.');
    return;
  }
  exportSceneObj();
});
$('#top-blender-open')?.addEventListener('click', async () => {
  const mesh = $('#blender-mesh-pick')?.value || 'generated/jewelry_last.obj';
  toast('Launching Blender…');
  try {
    const res = await fetch('/api/blender/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mesh }),
    });
    const j = await res.json();
    if (!j.success) throw new Error(j.error || 'launch failed');
    toast(`Opened in Blender: ${j.mesh}`);
  } catch (e) {
    console.error(e);
    toast(String(e.message || e));
  }
});

$('#jewelry-build').addEventListener('click', async () => {
  const useVec = $('#build-use-vector').checked;
  if (useVec && !lastVectorId) {
    toast('Trace an image first, or turn off “Use last trace”.');
    return;
  }
  const body = {
    text: $('#in-text').value || 'LOVE',
    targetWidthMm: parseFloat($('#in-width').value) || 48,
    plateDepthMm: parseFloat($('#in-depth').value) || 2.2,
    seatDepthRatio: parseFloat($('#in-seat').value) || 0.68,
    addBail: $('#in-bail').checked,
    roundCount: parseInt($('#in-rounds').value, 10) || 36,
    printTight: $('#in-print-tight').checked,
  };
  if (useVec) body.vectorId = lastVectorId;
  try {
    const est = await fetchEstimate('jewelry', body);
    let buildJson = null;
    await runWithBuildOverlay('Building jewelry (CSG)', est, async () => {
      const res = await fetch('/api/jewelry/build', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'build failed');
      buildJson = j;
      await loadOBJ(j.obj);
      $('#dl-obj').href = j.obj;
      if (j.stl) $('#dl-stl').href = j.stl;
      $('#dl-cad').href = j.cad;
      const slug = j.exportSlug || 'piece';
      $('#dl-obj').setAttribute('download', `jewelry_${slug}.obj`);
      $('#dl-stl').setAttribute('download', `jewelry_${slug}.stl`);
      $('#dl-cad').setAttribute('download', `jewelry_${slug}.cad`);
      if (getExportPref('autoStl', false) && j.stl) $('#dl-stl')?.click();
      if (getExportPref('autoObj', false)) $('#dl-obj')?.click();
      if (getExportPref('autoCad', false)) $('#dl-cad')?.click();
      return j;
    });
    const eta = buildJson?.estimatedTime ? ` · typical ${buildJson.estimatedTime}` : '';
    toast(useVec ? `Built from vector trace (${lastVectorId})${eta}` : `Built: ${body.text}${eta}`);
  } catch (err) {
    console.error(err);
    toast(String(err.message || err));
  }
});

$('#vector-scan').addEventListener('click', async () => {
  const f = $('#vector-file').files?.[0];
  if (!f) {
    toast('Choose PNG / JPEG / WebP first.');
    return;
  }
  const fd = new FormData();
  fd.append('image', f);
  if ($('#vector-invert').checked) fd.append('invert', '1');
  try {
    const est = await fetchEstimate('vector', {});
    await runWithBuildOverlay('Tracing image → SVG (potrace)', est, async () => {
      const res = await fetch('/api/jewelry/vector-scan', { method: 'POST', body: fd });
      const j = await res.json();
      if (!j.success) throw new Error(j.error || 'trace failed');
      persistVectorId(j.vectorId);
      $('#vector-meta').innerHTML = `Saved <a href="${j.svgUrl}" target="_blank" rel="noopener">SVG</a> · enable “Use last trace” then Build.`;
      return j;
    });
    toast('Vector trace ready.');
  } catch (err) {
    console.error(err);
    toast(String(err.message || err));
  }
});

$('#load-last').addEventListener('click', () => loadOBJ('/generated/jewelry_last.obj'));
$('#load-bruce').addEventListener('click', () => loadOBJ('/generated/3dprint_bruce_pendant.obj'));

async function refreshAiPanel() {
  const badge = $('#ai-provider-badge');
  const meta = $('#ai-last-meta');
  try {
    const r = await fetch('/api/ai/config');
    const j = await r.json();
    if (!j.success) throw new Error(j.error || 'config');
    const { providers, memory } = j;
    const on = [];
    if (providers.openai) on.push('OpenAI');
    if (providers.replicate) on.push('Replicate');
    on.push('local HD');
    badge.textContent = `Ready: ${on.join(' · ')} — add LLM + Replicate keys in .env for full AI (see .env.example).`;
    if (memory.promptPrefix) $('#ai-prefix').value = memory.promptPrefix;
    const pSel = $('#ai-provider');
    if (
      memory.imageProvider &&
      [...pSel.options].some((o) => o.value === memory.imageProvider)
    ) {
      pSel.value = memory.imageProvider;
    }
    const sSel = $('#ai-style');
    if (memory.imageStyleKey && [...sSel.options].some((o) => o.value === memory.imageStyleKey)) {
      sSel.value = memory.imageStyleKey;
    }
    $('#ai-enhance-default').checked = !!memory.enhancePromptByDefault;
    if (memory.lastPrompts?.length) {
      const snip = memory.lastPrompts.slice(0, 4).join(' · ');
      meta.textContent = `Recent prompts: ${snip.length > 140 ? snip.slice(0, 140) + '…' : snip}`;
    } else meta.textContent = '';
  } catch {
    badge.textContent = 'AI config unavailable (is the server running?).';
  }
}

$('#ai-save-defaults').addEventListener('click', async () => {
  toast('Saving defaults…');
  try {
    const res = await fetch('/api/user/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageProvider: $('#ai-provider').value,
        imageStyleKey: $('#ai-style').value,
        promptPrefix: $('#ai-prefix').value,
        enhancePromptByDefault: $('#ai-enhance-default').checked,
      }),
    });
    const j = await res.json();
    if (!j.success) throw new Error(j.error || 'save failed');
    await refreshAiPanel();
    toast('Saved AI defaults to disk.');
  } catch (e) {
    console.error(e);
    toast(String(e.message || e));
  }
});

$('#ai-gen').addEventListener('click', async () => {
  const prompt = $('#in-prompt').value || 'luxury jewelry piece';
  const useSaved = $('#ai-use-saved').checked;
  const stoneTreatment = $('#ai-metal-only')?.checked ? 'metal_only' : 'full';
  toast('Generating image…');
  try {
    const res = await fetch('/api/ai/preview-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        width: 1536,
        height: 960,
        provider: $('#ai-provider').value,
        styleKey: $('#ai-style').value,
        enhancePrompt: $('#ai-enhance').checked,
        useSavedMemory: useSaved,
        promptPrefix: useSaved ? undefined : $('#ai-prefix').value,
        rememberPrompt: $('#ai-remember-prompt').checked,
        stoneTreatment,
      }),
    });
    const j = await res.json();
    if (!j.success) throw new Error(j.error || 'preview failed');
    const imgUrl = '/' + j.imagePath + '?t=' + Date.now();
    $('#ai-preview').src = imgUrl;
    $('#ai-preview').classList.add('preview-img');
    const adl = $('#ai-dl-png');
    if (adl) {
      adl.href = '/' + j.imagePath;
      adl.setAttribute('download', `matrix_preview_${Date.now()}.png`);
    }
    const who = j.providerUsed || '?';
    const st = stoneTreatment === 'metal_only' ? ' · metal-only' : '';
    toast(`Done (${who})${st}`);
    $('#ai-last-meta').textContent = `Last render: ${who}${st}${j.enhancedPrompt ? ' · prompt expanded' : ''}`;
    await refreshAiPanel();
  } catch (err) {
    console.error(err);
    toast(String(err.message || err));
  }
});

$('#file-import').addEventListener('change', async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const low = f.name.toLowerCase();
  if (low.endsWith('.stl')) {
    loadSTLBuffer(await f.arrayBuffer());
  } else if (low.endsWith('.obj')) {
    const url = URL.createObjectURL(f);
    await loadOBJ(url);
    URL.revokeObjectURL(url);
  } else toast('Use OBJ or STL');
  e.target.value = '';
});

$('#stat-xyz').textContent = 'Ready — Matrix Workshop';

canvas.addEventListener('pointermove', (ev) => {
  if (state.tool === 'measure') return;
  const r = canvas.getBoundingClientRect();
  const x = ev.clientX - r.left;
  const y = ev.clientY - r.top;
  $('#stat-xyz').textContent = `view ${Math.round(x)},${Math.round(y)} · scroll zoom · right-drag pan`;
});

window.addEventListener('matrix-load-obj', (e) => {
  const url = e.detail?.url;
  if (url) loadOBJ(url);
});

function toggleHelp() {
  const m = $('#help-modal');
  if (!m) return;
  m.classList.toggle('hidden');
}
$('#btn-help')?.addEventListener('click', () => toggleHelp());
$('#help-modal-close')?.addEventListener('click', () => toggleHelp());
$('#help-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'help-modal') toggleHelp();
});
document.addEventListener('keydown', (e) => {
  if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  e.preventDefault();
  toggleHelp();
});

setTool('orbit');
applyClip(0);
$('#toggle-grid').checked = true;

loadPersistedVectorId();
initExportPrefsUI();
updateVectorExportUI();

$('#pref-pop-animate')?.addEventListener('change', (e) => saveExportPrefs({ popAnimate: e.target.checked }));
$('#pref-auto-stl')?.addEventListener('change', (e) => saveExportPrefs({ autoStl: e.target.checked }));
$('#pref-auto-obj')?.addEventListener('change', (e) => saveExportPrefs({ autoObj: e.target.checked }));
$('#pref-auto-cad')?.addEventListener('change', (e) => saveExportPrefs({ autoCad: e.target.checked }));
$('#vector-svg-link')?.addEventListener('click', (e) => {
  if (!lastVectorId) e.preventDefault();
});
$('#vector-copy-url')?.addEventListener('click', async () => {
  if (!lastVectorId) {
    toast('Trace an image first.');
    return;
  }
  const url = `${location.origin}/generated/${lastVectorId}.svg`;
  try {
    await navigator.clipboard.writeText(url);
    toast('SVG URL copied');
  } catch {
    toast('Copy failed — open the link and copy from the address bar');
  }
});

refreshAiPanel();
loadBookmarksFromStorage();

try {
  await loadOBJ('/generated/jewelry_last.obj');
} catch {
  try {
    await loadOBJ('/generated/3dprint_bruce_pendant.obj');
  } catch {
    toast('Generate a piece to load mesh');
  }
}
