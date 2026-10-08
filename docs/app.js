import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { makePuzzle, isSolved, facelets } from './geom.js';
import { scramble } from './solvers.js';

// Datos de cada variante: etiqueta, distancia de cámara, largo de la mezcla y textos.
const VARIANTS = {
  cube3: {
    label: '3×3', dist: 9.6, keys: 'UDLRFBM',
    notation: "<code>U</code> arriba · <code>D</code> abajo · <code>F</code> frente · <code>B</code> atrás · <code>L</code> izquierda · <code>R</code> derecha. La letra sola gira la cara 90° en sentido horario mirándola de frente; <code>'</code> es antihorario y <code>2</code> es 180°. <code>M</code> gira la capa central entre L y R, en el mismo sentido que <code>L</code>.",
    solver: 'Solver: algoritmo de dos fases de Herbert Kociemba (<a href="https://github.com/ldez/cubejs" target="_blank" rel="noopener">cubejs</a>, MIT). Resuelve cualquier estado en 22 movimientos o menos.',
  },
  cube2: {
    label: '2×2', dist: 7.2, keys: 'UDLRFB', scrambleLen: 15,
    notation: "Igual que el 3×3: <code>U D F B L R</code>, con <code>'</code> (antihorario) y <code>2</code> (180°). El solver solo usa <code>U</code>, <code>R</code> y <code>F</code>, así la esquina de atrás-abajo-izquierda queda fija.",
    solver: 'Solver: búsqueda bidireccional exacta, entrega siempre la solución más corta (como máximo 11 movimientos).',
  },
  pyraminx: {
    label: 'Pyraminx', dist: 10.8, keys: 'ULRB', scrambleLen: 12,
    notation: "Cada letra es un vértice: <code>U</code> arriba, <code>L</code> izquierda, <code>R</code> derecha, <code>B</code> atrás. En mayúscula gira la punta y la capa de debajo 120° en sentido horario mirando el vértice de frente; en minúscula (<code>u l r b</code>) solo la punta. <code>'</code> es antihorario.",
    solver: 'Solver: búsqueda bidireccional exacta para el cuerpo (como máximo 11 movimientos) y luego las puntas.',
  },
  megaminx: {
    label: 'Megaminx', dist: 11.8, keys: 'UFRLDB', scrambleLen: 50,
    notation: "12 caras: <code>U</code> arriba, <code>F</code> frente, <code>R</code>/<code>L</code> a sus lados, <code>BR</code>/<code>BL</code> atrás arriba, <code>D</code> abajo, <code>B</code> atrás abajo y <code>DR DL DBR DBL</code> en el anillo inferior. La letra sola gira la cara 72° en sentido horario; <code>'</code> es antihorario, <code>2</code> son 144° y <code>2'</code> 144° antihorario.",
    solver: 'Solver: coloca las piezas una a una, primero con giros cortos y al final con conmutadores puros (ciclos de 3 piezas y giros de orientación). Siempre llega, pero en cientos de movimientos: sube la velocidad para verlo completo.',
  },
};

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
// Relleno suave cielo/suelo: la luz principal sigue viniendo de arriba, pero la cara inferior no queda negra.
scene.add(new THREE.HemisphereLight(0xffffff, 0xd6dae3, 1.8));

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
camera.position.set(5.2, 4.4, 6.6);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.enablePan = false;

function resize() {
  const { clientWidth: w, clientHeight: h } = stage;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });

// ---------- construcción de piezas ----------
const world = new THREE.Group();
scene.add(world);
const V3 = a => new THREE.Vector3(...a);
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0d0f14, roughness: 0.45, metalness: 0.1 });
const stickerMat = {};
const matFor = color => (stickerMat[color] ??= new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15 }));
const roundedBox = new RoundedBoxGeometry(0.97, 0.97, 0.97, 4, 0.1);
const roundedSquare = (() => {
  const s = 0.4, r = 0.1, sh = new THREE.Shape();
  sh.moveTo(-s + r, -s); sh.lineTo(s - r, -s); sh.quadraticCurveTo(s, -s, s, -s + r);
  sh.lineTo(s, s - r); sh.quadraticCurveTo(s, s, s - r, s); sh.lineTo(-s + r, s);
  sh.quadraticCurveTo(-s, s, -s, s - r); sh.lineTo(-s, -s + r); sh.quadraticCurveTo(-s, -s, -s + r, -s);
  return new THREE.ShapeGeometry(sh, 6);
})();

// Sticker de un polígono convexo: se encoge hacia su centro y se le recortan las esquinas.
function polySticker(poly, center, normal) {
  const c = V3(center), pts = poly.map(p => V3(p).sub(c).multiplyScalar(0.84));
  let out = [];
  pts.forEach((p, i) => {
    const prev = pts[(i + pts.length - 1) % pts.length], next = pts[(i + 1) % pts.length];
    out.push(p.clone().lerp(prev, 0.16), p.clone().lerp(next, 0.16));
  });
  const facing = new THREE.Vector3().subVectors(out[1], out[0]).cross(new THREE.Vector3().subVectors(out[2], out[0]));
  if (facing.dot(V3(normal)) < 0) out = out.reverse(); // que la cara visible mire hacia afuera
  const pos = [];
  for (let i = 1; i < out.length - 1; i++) pos.push(...out[0].toArray(), ...out[i].toArray(), ...out[i + 1].toArray());
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

function label(text, pos, size) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.font = `700 ${text.length > 2 ? 54 : text.length > 1 ? 66 : 84}px Inter, sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(232,236,248,.85)';
  g.fillText(text, 64, 70);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthWrite: false }));
  sp.position.copy(pos);
  sp.scale.setScalar(size);
  return sp;
}

let P, kind, pieces = [], stickers = [], slotPos = [];
const puzzles = {};

function build() {
  world.clear();
  pieces = []; stickers = [];
  for (const p of P.pieces) {
    let piece;
    if (P.snap) { // cubo: piezas redondeadas en su posición de grilla
      piece = new THREE.Mesh(roundedBox, bodyMat);
      piece.position.copy(V3(p.center));
      piece.userData.center = new THREE.Vector3();
    } else {      // poliedros: la pieza está en el origen y su geometría en coordenadas del mundo
      piece = new THREE.Group();
      const c = V3(p.center);
      piece.add(new THREE.Mesh(new ConvexGeometry(p.verts.map(v => V3(v).sub(c).multiplyScalar(0.965).add(c))), bodyMat));
      piece.userData.center = c;
    }
    for (const s of p.stickers) {
      const n = P.faces[s.face].n, color = P.faces[s.face].color;
      let m;
      if (P.snap) {
        m = new THREE.Mesh(roundedSquare, matFor(color));
        m.position.copy(V3(n).multiplyScalar(0.487));
        m.lookAt(V3(n).multiplyScalar(2).add(m.position));
      } else {
        m = new THREE.Mesh(polySticker(s.poly, s.center, n), matFor(color));
        m.position.copy(V3(s.center).add(V3(n).multiplyScalar(0.012)));
      }
      m.userData.face = s.face;
      piece.add(m);
      stickers.push(m);
    }
    world.add(piece);
    pieces.push(piece);
  }
  // Etiquetas: caras en los cubos y el megaminx, vértices en el pyraminx.
  const marks = P.labels ?? P.faces.map(f => [f.name, V3(f.n).multiplyScalar(f.d + (P.snap ? 1.1 : 1.05))]);
  for (const [name, at] of marks) world.add(label(name, Array.isArray(at) ? V3(at) : at, kind === 'megaminx' ? 0.5 : 0.55));
  slotPos = P.slots.map(s => V3(s.pos));
}

// Estado actual (color de cada slot), leído de la posición real de cada sticker.
const tmp = new THREE.Vector3();
function readState() {
  world.updateMatrixWorld(true);
  const state = new Uint8Array(P.slots.length);
  for (const st of stickers) {
    st.getWorldPosition(tmp);
    let best = 0, bd = Infinity;
    slotPos.forEach((q, j) => { const d = q.distanceToSquared(tmp); if (d < bd) { bd = d; best = j; } });
    state[best] = st.userData.face;
  }
  return state;
}

// ---------- giros animados ----------
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const snapM = new THREE.Matrix4(), rot = new THREE.Quaternion();

function turn(name, ms) {
  const mv = P.moves[name], axis = V3(mv.axis);
  const moving = pieces.filter(p => {
    const t = p.userData.center.clone().applyQuaternion(p.quaternion).add(p.position).dot(axis);
    return t > mv.lo + 1e-3 && (mv.hi === undefined || t < mv.hi - 1e-3);
  });
  const start = moving.map(p => [p.quaternion.clone(), p.position.clone()]);
  const dur = ms * Math.max(1, Math.abs(mv.angle) / (Math.PI / 2)) ** 0.6;
  const setAngle = a => {
    rot.setFromAxisAngle(axis, a);
    moving.forEach((p, i) => { p.quaternion.copy(rot).multiply(start[i][0]); p.position.copy(start[i][1]).applyQuaternion(rot); });
  };
  return new Promise(resolve => {
    const t0 = performance.now();
    const step = now => {
      const t = Math.min(1, (now - t0) / dur);
      setAngle(mv.angle * ease(t));
      if (t < 1) return requestAnimationFrame(step);
      if (P.snap) for (const p of moving) { // en el cubo se redondea a la grilla para no acumular error
        p.position.set(...p.position.toArray().map(x => Math.round(x * 2) / 2));
        snapM.makeRotationFromQuaternion(p.quaternion);
        snapM.elements = snapM.elements.map(Math.round);
        p.quaternion.setFromRotationMatrix(snapM);
      } else moving.forEach(p => p.quaternion.normalize());
      resolve();
    };
    requestAnimationFrame(step);
  });
}

// ---------- interfaz ----------
const $ = id => document.getElementById(id);
const ui = { status: $('status'), seq: $('seq'), title: $('seqTitle'), alg: $('alg'), speed: $('speed') };
const speedMs = () => 930 - +ui.speed.value; // izquierda = lento, derecha = rápido
const setSpeedLbl = () => ($('speedLbl').textContent = `${speedMs()} ms por giro`);
ui.speed.oninput = setSpeedLbl;
setSpeedLbl();

let busy = false, kociembaReady = false;
const solverReady = () => kind !== 'cube3' || kociembaReady;
function status(text, cls = '') { ui.status.textContent = text; ui.status.className = cls; }
function refresh() {
  document.querySelectorAll('aside button').forEach(b => (b.disabled = busy));
  $('btnRandom').disabled = busy || !solverReady();
  $('btnSolve').disabled = busy || !solverReady();
  $('btnSolve').textContent = solverReady() ? 'Resolver' : 'Preparando solver…';
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
    chips[i].scrollIntoView({ block: 'nearest' });
    await turn(moves[i], speedMs());
    chips[i].className = 'done';
  }
  busy = false; refresh();
}

// Acepta ’ y ´ como apóstrofo, y X2' como X2 en el cubo (180° en cualquier sentido es lo mismo).
const parse = str => str.replace(/[’´`]/g, "'").trim().split(/\s+/).filter(Boolean)
  .map(m => (P.snap && /2'$/.test(m) ? m.slice(0, -1) : m));

async function single(m) {
  if (busy) return;
  status(`Giro manual: ${m}`);
  busy = true; refresh();
  await turn(m, speedMs());
  busy = false; refresh();
  if (isSolved(P, readState())) status('Resuelto ✓', 'ok');
}

function buildPad() {
  const pad = $('pad'), layers = P.layers;
  const namesOf = L => Object.keys(P.moves).filter(n => P.moves[n].layer === L.name);
  pad.style.gridTemplateColumns = `repeat(${namesOf(layers[0]).length * 2}, 1fr)`;
  pad.replaceChildren();
  layers.forEach((L, li) => {
    const alone = li === layers.length - 1 && layers.length % 2 === 1;
    const face = kind !== 'pyraminx' && P.faces.find(f => f.name === L.name);
    for (const n of namesOf(L)) {
      const b = Object.assign(document.createElement('button'), { textContent: n, title: `Girar ${n}` });
      b.dataset.face = L.name;
      b.dataset.len = n.length;
      b.style.setProperty('--c', face ? face.color : '#8e98b8');
      if (alone) b.classList.add('wide');
      b.onclick = () => single(n);
      pad.appendChild(b);
    }
  });
}

function select(k) {
  if (busy) return;
  kind = k;
  P = puzzles[k] ??= makePuzzle(k);
  const V = VARIANTS[k];
  build();
  buildPad();
  camera.position.setLength(V.dist);
  controls.minDistance = V.dist * 0.55;
  controls.maxDistance = V.dist * 1.7;
  $('notation').innerHTML = V.notation;
  $('solverInfo').innerHTML = V.solver;
  $('keysHint').textContent = `teclas ${V.keys.split('').join(' ')} (Shift = inverso)`;
  ui.alg.placeholder = { cube3: "Ej: R U R' U' F2 D L2", cube2: "Ej: R U R' U' F2", pyraminx: "Ej: U L' R B' u r'", megaminx: "Ej: R U2' F' BL D2 DR'" }[k];
  document.querySelectorAll('#kinds button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kind === k)));
  showSeq('Secuencia', []);
  if (solverReady()) status('Listo. Mezcla o gira las caras.');
  else status('Cargando el solver de Kociemba (unos segundos)…', 'busy');
  refresh();
  try { localStorage.setItem('rubik-kind', k); } catch { /* sin almacenamiento */ }
}

for (const [k, V] of Object.entries(VARIANTS)) {
  const b = Object.assign(document.createElement('button'), { textContent: V.label });
  b.dataset.kind = k;
  b.onclick = () => select(k);
  $('kinds').appendChild(b);
}

addEventListener('keydown', e => {
  if (e.target === ui.alg || e.ctrlKey || e.metaKey || e.altKey) return;
  const f = e.code.startsWith('Key') && e.code.slice(3);
  if (f && VARIANTS[kind].keys.includes(f) && P.moves[f]) { e.preventDefault(); single(f + (e.shiftKey ? "'" : '')); }
});

$('btnApply').onclick = async () => {
  const moves = parse(ui.alg.value);
  const bad = moves.filter(m => !P.moves[m]);
  if (!moves.length) return status('Escribe una secuencia de giros.', 'err');
  if (bad.length) return status(`Movimiento no válido: ${bad.join(', ')}. Revisa la notación más abajo.`, 'err');
  status('Aplicando mezcla…', 'busy');
  await run(moves, 'Mezcla');
  status('Mezcla aplicada. Aprieta "Resolver".');
};
ui.alg.addEventListener('keydown', e => e.key === 'Enter' && $('btnApply').click());

$('btnReset').onclick = () => {
  if (busy) return;
  build();
  showSeq('Secuencia', []);
  status('Reiniciado.');
};

// ---------- solvers ----------
// 3x3: Kociemba en su worker. Entrega primero una solución garantizada (≤ 22) y luego busca otras más
// cortas; se usa la mejor encontrada en OPTIMIZE_MS y, si sigue buscando, se reinicia el worker.
const OPTIMIZE_MS = 2000;
let kWorker, kLoaded = false, onKMsg = () => {};
function startKociemba() {
  kociembaReady = false;
  kWorker = new Worker('solver-worker.js');
  kWorker.onmessage = ({ data }) => {
    if (data.cmd !== 'ready') return onKMsg(data);
    if (!kLoaded && kind === 'cube3' && !busy) status('Listo. Mezcla o gira las caras.');
    kLoaded = kociembaReady = true;
    refresh();
  };
}
startKociemba();

const kociembaRandom = () => new Promise(r => { onKMsg = d => d.cmd === 'random' && r(d.moves); kWorker.postMessage({ cmd: 'random' }); });
function kociembaSolve(state) {
  return new Promise(resolve => {
    let best = null, timer;
    const finish = searching => {
      clearTimeout(timer);
      onKMsg = () => {};
      if (searching) { kWorker.terminate(); startKociemba(); } // corta la búsqueda en curso
      resolve(best);
    };
    onKMsg = d => {
      if (d.cmd === 'done') return finish(false);
      if (best === null) timer = setTimeout(() => finish(true), OPTIMIZE_MS);
      best = d.moves;
    };
    kWorker.postMessage({ cmd: 'solve', facelets: state });
  });
}

// 2x2, Pyraminx y Megaminx: solvers propios en otro worker.
const pWorker = new Worker('puzzle-worker.js', { type: 'module' });
const puzzleSolve = state => new Promise((resolve, reject) => {
  pWorker.onmessage = ({ data }) => (data.error ? reject(new Error(data.error)) : resolve(data.moves));
  pWorker.postMessage({ kind, state: Array.from(state) });
});

$('btnRandom').onclick = async () => {
  busy = true; refresh();
  status('Generando mezcla…', 'busy');
  const moves = kind === 'cube3' ? parse(await kociembaRandom()) : scramble(P, VARIANTS[kind].scrambleLen);
  status('Mezclando…', 'busy');
  await run(moves, 'Mezcla aleatoria');
  status('Mezcla lista. Aprieta "Resolver".');
};

$('btnSolve').onclick = async () => {
  const state = readState();
  if (isSolved(P, state)) return status('Ya está resuelto.', 'ok');
  busy = true; refresh();
  status('Buscando solución…', 'busy');
  const t0 = performance.now();
  let moves;
  try {
    moves = kind === 'cube3' ? parse(await kociembaSolve(facelets(P, state))) : await puzzleSolve(state);
  } catch (e) {
    busy = false; refresh();
    return status('Error del solver: ' + e.message, 'err');
  }
  const secs = ((performance.now() - t0) / 1000).toFixed(2);
  status(`Solución de ${moves.length} movimientos (búsqueda: ${secs} s). Resolviendo…`, 'busy');
  await run(moves, 'Solución');
  const ok = isSolved(P, readState());
  status(ok ? `¡Resuelto en ${moves.length} movimientos!` : 'Error: no quedó resuelto.', ok ? 'ok' : 'err');
};

let saved = 'cube3';
try { saved = localStorage.getItem('rubik-kind') || saved; } catch { /* sin almacenamiento */ }
select(VARIANTS[saved] ? saved : 'cube3');
window.rubik = { turn, readState, solved: () => isSolved(P, readState()), select, camera, get P() { return P; } }; // para pruebas
