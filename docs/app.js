import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Colores estándar (esquema occidental) y normal de cada cara. Ejes: x→R, y→U, z→F.
const COLORS = { U: '#f4f6fb', D: '#ffd23f', F: '#16a34a', B: '#2563eb', R: '#dc2626', L: '#f97316' };
const NORMALS = { U: [0, 1, 0], D: [0, -1, 0], R: [1, 0, 0], L: [-1, 0, 0], F: [0, 0, 1], B: [0, 0, -1] };
// Giro horario de cada cara (visto de frente): eje, capa y signo del ángulo.
// M es la capa central entre L y R, y gira en el mismo sentido que L.
const TURNS = { U: ['y', 1, -1], D: ['y', -1, 1], R: ['x', 1, -1], L: ['x', -1, 1], F: ['z', 1, -1], B: ['z', -1, 1], M: ['x', 0, 1] };
const MOVE_RE = /^[URFDLBM](2|'|2')?$/;

// ---------- escena ----------
const stage = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const key = new THREE.DirectionalLight(0xffffff, 1.2);
key.position.set(5, 8, 6);
scene.add(key);
// Relleno suave cielo/suelo: la luz principal sigue viniendo de arriba, pero la cara D no queda negra.
scene.add(new THREE.HemisphereLight(0xffffff, 0xd6dae3, 1.8));

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(5.2, 4.4, 6.6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 5;
controls.maxDistance = 16;

function resize() {
  const { clientWidth: w, clientHeight: h } = stage;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

// ---------- cubo: 26 piezas con cuerpo redondeado y stickers ----------
const cube = new THREE.Group();
scene.add(cube);
const bodyGeo = new RoundedBoxGeometry(0.97, 0.97, 0.97, 4, 0.1);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0d0f14, roughness: 0.45, metalness: 0.1 });
const stickerGeo = (() => {
  const s = 0.4, r = 0.1, sh = new THREE.Shape();
  sh.moveTo(-s + r, -s); sh.lineTo(s - r, -s); sh.quadraticCurveTo(s, -s, s, -s + r);
  sh.lineTo(s, s - r); sh.quadraticCurveTo(s, s, s - r, s); sh.lineTo(-s + r, s);
  sh.quadraticCurveTo(-s, s, -s, s - r); sh.lineTo(-s, -s + r); sh.quadraticCurveTo(-s, -s, -s + r, -s);
  return new THREE.ShapeGeometry(sh, 6);
})();
const stickerMats = Object.fromEntries(Object.entries(COLORS).map(([f, c]) =>
  [f, new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15 })]));

let cubies = [];
function build() {
  cube.clear();
  cubies = [];
  for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
    if (!x && !y && !z) continue;
    const c = new THREE.Mesh(bodyGeo, bodyMat);
    c.position.set(x, y, z);
    for (const [f, n] of Object.entries(NORMALS)) {
      if (x * n[0] + y * n[1] + z * n[2] !== 1) continue;
      const s = new THREE.Mesh(stickerGeo, stickerMats[f]);
      s.position.set(n[0] * 0.487, n[1] * 0.487, n[2] * 0.487);
      s.lookAt(n[0] * 2, n[1] * 2, n[2] * 2);
      s.userData.color = f;
      c.add(s);
    }
    cube.add(c);
    cubies.push(c);
  }
}
build();

// Etiquetas flotantes con la letra de cada cara (los centros no se mueven con giros de cara).
for (const [f, n] of Object.entries(NORMALS)) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.font = '700 84px Inter, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(232,236,248,.85)';
  g.fillText(f, 64, 70);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthWrite: false }));
  sp.position.set(n[0] * 2.6, n[1] * 2.6, n[2] * 2.6);
  sp.scale.setScalar(0.55);
  scene.add(sp);
}

renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

// ---------- giros animados ----------
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const snapM = new THREE.Matrix4();

function turn(move, ms) {
  const [axis, layer, sign] = TURNS[move[0]];
  const q = move.includes('2') ? 2 : move.includes("'") ? -1 : 1;
  const angle = sign * q * Math.PI / 2;
  const dur = ms * (q === 2 ? 1.5 : 1);
  const pivot = new THREE.Group();
  cube.add(pivot);
  const layerCubies = cubies.filter(c => Math.round(c.position[axis]) === layer);
  layerCubies.forEach(c => pivot.attach(c));
  return new Promise(resolve => {
    const t0 = performance.now();
    const step = now => {
      const t = Math.min(1, (now - t0) / dur);
      pivot.rotation[axis] = angle * ease(t);
      if (t < 1) return requestAnimationFrame(step);
      pivot.updateMatrixWorld(true);
      for (const c of layerCubies) {
        cube.attach(c);
        c.position.round();
        // Redondea la rotación a múltiplos exactos de 90° para que no se acumule error numérico.
        snapM.makeRotationFromQuaternion(c.quaternion);
        snapM.elements = snapM.elements.map(Math.round);
        c.quaternion.setFromRotationMatrix(snapM);
      }
      cube.remove(pivot);
      resolve();
    };
    requestAnimationFrame(step);
  });
}

// Estado como string de 54 facelets en el orden de Kociemba (U R F D L B), leído de la geometría.
const v = new THREE.Vector3();
function facelets() {
  const out = { U: [], R: [], F: [], D: [], L: [], B: [] };
  for (const c of cubies) {
    const { x, y, z } = c.position;
    for (const s of c.children) {
      s.getWorldDirection(v).round();
      const face = Object.keys(NORMALS).find(f => NORMALS[f].every((k, i) => k === v.getComponent(i)));
      const idx = {
        U: (z + 1) * 3 + (x + 1), D: (1 - z) * 3 + (x + 1),
        F: (1 - y) * 3 + (x + 1), B: (1 - y) * 3 + (1 - x),
        R: (1 - y) * 3 + (1 - z), L: (1 - y) * 3 + (z + 1),
      }[face];
      out[face][idx] = s.userData.color;
    }
  }
  // M mueve los centros: cada color se nombra según la cara donde está hoy su centro.
  const faceOf = Object.fromEntries('URFDLB'.split('').map(f => [out[f][4], f]));
  return 'URFDLB'.split('').map(f => out[f].map(c => faceOf[c]).join('')).join('');
}
const SOLVED = 'URFDLB'.split('').map(f => f.repeat(9)).join('');

// ---------- interfaz ----------
const $ = id => document.getElementById(id);
const ui = { status: $('status'), seq: $('seq'), title: $('seqTitle'), alg: $('alg'), speed: $('speed') };
const speedMs = () => 980 - +ui.speed.value; // izquierda = lento, derecha = rápido
const setSpeedLbl = () => ($('speedLbl').textContent = `${speedMs()} ms por giro`);
ui.speed.oninput = setSpeedLbl;
setSpeedLbl();

let busy = false, solverReady = false;
function status(text, cls = '') { ui.status.textContent = text; ui.status.className = cls; }
function refresh() {
  document.querySelectorAll('aside button').forEach(b => (b.disabled = busy));
  $('btnRandom').disabled = busy || !solverReady;
  $('btnSolve').disabled = busy || !solverReady;
  $('btnSolve').textContent = solverReady ? 'Resolver' : 'Preparando solver…';
  ui.alg.disabled = busy;
}

function showSeq(title, moves) {
  ui.title.textContent = moves.length ? `${title} · ${moves.length} movimientos` : title;
  ui.seq.replaceChildren(...moves.map(m => Object.assign(document.createElement('span'), { textContent: m })));
}

async function run(moves, title) {
  busy = true; refresh();
  showSeq(title, moves);
  const chips = ui.seq.children;
  for (let i = 0; i < moves.length; i++) {
    chips[i].className = 'now';
    await turn(moves[i], speedMs());
    chips[i].className = 'done';
  }
  busy = false; refresh();
}

const parse = str => str.replace(/[’´`]/g, "'").trim().split(/\s+/).filter(Boolean);

// Botonera de giros
for (const f of 'UDLRFBM') for (const mod of ['', "'", '2']) {
  const b = Object.assign(document.createElement('button'), { textContent: f + mod, title: `Girar ${f + mod}` });
  b.dataset.face = f;
  b.style.setProperty('--c', COLORS[f] || '#8e98b8');
  b.onclick = () => single(f + mod);
  $('pad').appendChild(b);
}
async function single(m) {
  if (busy) return;
  status(`Giro manual: ${m}`);
  busy = true; refresh();
  await turn(m, speedMs());
  busy = false; refresh();
  if (facelets() === SOLVED) status('Cubo resuelto ✓', 'ok');
}

addEventListener('keydown', e => {
  if (e.target === ui.alg || e.ctrlKey || e.metaKey || e.altKey) return;
  const f = e.code.startsWith('Key') && e.code.slice(3);
  if (f && 'UDLRFBM'.includes(f)) { e.preventDefault(); single(f + (e.shiftKey ? "'" : '')); }
});

$('btnApply').onclick = async () => {
  const moves = parse(ui.alg.value);
  const bad = moves.filter(m => !MOVE_RE.test(m));
  if (!moves.length) return status('Escribe una secuencia, por ejemplo: R U R\' U\'', 'err');
  if (bad.length) return status(`Movimiento no válido: ${bad.join(', ')}. Usa U D L R F B M con ' o 2.`, 'err');
  status('Aplicando mezcla…', 'busy');
  await run(moves.map(m => m.replace("2'", '2')), 'Mezcla');
  status('Mezcla aplicada. Aprieta "Resolver".');
};
ui.alg.addEventListener('keydown', e => e.key === 'Enter' && $('btnApply').click());

$('btnReset').onclick = () => {
  if (busy) return;
  build();
  showSeq('Secuencia', []);
  status('Cubo reiniciado.');
};

// ---------- solver (Web Worker) ----------
const OPTIMIZE_MS = 2000; // tiempo extra para buscar una solución más corta que la primera
let worker, loaded = false, onMsg = () => {};
function startWorker() {
  solverReady = false;
  worker = new Worker('solver-worker.js');
  worker.onmessage = ({ data }) => {
    if (data.cmd !== 'ready') return onMsg(data);
    if (!loaded) status('Listo. Mezcla el cubo o gíralo a mano.');
    solverReady = loaded = true; refresh();
  };
}
startWorker();
status('Cargando el solver de Kociemba (unos segundos)…', 'busy');

const randomScramble = () => new Promise(r => { onMsg = d => d.cmd === 'random' && r(d.moves); worker.postMessage({ cmd: 'random' }); });

function solveState(facelets) {
  return new Promise(resolve => {
    let best = null, timer;
    const finish = searching => {
      clearTimeout(timer);
      onMsg = () => {};
      if (searching) { worker.terminate(); startWorker(); } // corta la búsqueda en curso
      resolve(best);
    };
    onMsg = d => {
      if (d.cmd === 'done') return finish(false);
      if (best === null) timer = setTimeout(() => finish(true), OPTIMIZE_MS);
      best = d.moves;
    };
    worker.postMessage({ cmd: 'solve', facelets });
  });
}

$('btnRandom').onclick = async () => {
  busy = true; refresh();
  status('Generando estado aleatorio…', 'busy');
  const moves = parse(await randomScramble());
  status('Mezclando…', 'busy');
  await run(moves, 'Mezcla aleatoria');
  status('Mezcla aleatoria lista. Aprieta "Resolver".');
};

$('btnSolve').onclick = async () => {
  const state = facelets();
  if (state === SOLVED) return status('El cubo ya está resuelto.', 'ok');
  busy = true; refresh();
  status('Buscando solución…', 'busy');
  const t0 = performance.now();
  const moves = parse(await solveState(state));
  const secs = ((performance.now() - t0) / 1000).toFixed(2);
  status(`Solución de ${moves.length} movimientos (búsqueda: ${secs} s). Resolviendo…`, 'busy');
  await run(moves, 'Solución');
  const ok = facelets() === SOLVED;
  status(ok ? `¡Resuelto en ${moves.length} movimientos!` : 'Error: el cubo no quedó resuelto.', ok ? 'ok' : 'err');
};

refresh();
window.rubik = { turn, facelets, SOLVED, camera }; // para pruebas desde la consola
