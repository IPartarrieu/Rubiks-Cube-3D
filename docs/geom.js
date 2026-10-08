// Geometría y modelo lógico de cada rompecabezas, sin three.js: se usa en la página, en el worker y en Node.
// Cada puzzle se describe por sus caras (planos exteriores) y sus capas de giro. De ahí salen las piezas,
// los stickers ("slots") y, para cada movimiento, la permutación de slots que produce.

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => mul(a, 1 / Math.hypot(...a));
const mean = P => mul(P.reduce(add, [0, 0, 0]), 1 / P.length);
const dist2 = (a, b) => { const d = sub(a, b); return dot(d, d); };

// Rotación de v en torno al eje unitario k (regla de la mano derecha).
export function rotate(v, k, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
}

// Vértices del poliedro convexo {x : n·x <= d para cada [n, d] de H}.
function vertsOf(H) {
  const V = [];
  for (let i = 0; i < H.length; i++) for (let j = i + 1; j < H.length; j++) for (let k = j + 1; k < H.length; k++) {
    const [a, da] = H[i], [b, db] = H[j], [c, dc] = H[k];
    const bc = cross(b, c), det = dot(a, bc);
    if (Math.abs(det) < 1e-9) continue;
    const p = mul(add(add(mul(bc, da), mul(cross(c, a), db)), mul(cross(a, b), dc)), 1 / det);
    if (H.every(([n, d]) => dot(n, p) <= d + 1e-7) && !V.some(q => dist2(p, q) < 1e-12)) V.push(p);
  }
  return V;
}

// Corta el sólido con todos los planos de giro y devuelve las celdas (piezas) con sus vértices.
function carve(faces, cuts) {
  let cells = [faces.map(f => [f.n, f.d])].map(H => ({ H, V: vertsOf(H) }));
  for (const [n, c] of cuts) {
    const next = [];
    for (const cell of cells) {
      const s = cell.V.map(v => dot(n, v) - c);
      if (Math.max(...s) <= 1e-7 || Math.min(...s) >= -1e-7) { next.push(cell); continue; }
      for (const H of [[...cell.H, [n, c]], [...cell.H, [mul(n, -1), -c]]]) {
        const V = vertsOf(H);
        if (V.length >= 4) next.push({ H, V });
      }
    }
    cells = next;
  }
  return cells;
}

// Polígono (ordenado) de la celda sobre la cara f, o null si la celda no toca esa cara.
function facePolygon(V, f) {
  const P = V.filter(v => Math.abs(dot(f.n, v) - f.d) < 1e-6);
  if (P.length < 3) return null;
  const m = mean(P), u = norm(sub(P[0], m)), w = cross(f.n, u);
  const ang = p => Math.atan2(dot(sub(p, m), w), dot(sub(p, m), u));
  return P.sort((a, b) => ang(a) - ang(b));
}

function piecesFromCells(faces, cuts) {
  return carve(faces, cuts).map(({ V }) => {
    const stickers = faces.map((f, fi) => [facePolygon(V, f), fi]).filter(([p]) => p)
      .map(([poly, fi]) => ({ face: fi, center: mean(poly), poly }));
    return { center: mean(V), verts: V, stickers };
  }).filter(p => p.stickers.length);
}

// ---------- definición de cada puzzle ----------

const CUBE_FACES = [
  ['U', [0, 1, 0], '#f4f6fb'], ['R', [1, 0, 0], '#dc2626'], ['F', [0, 0, 1], '#16a34a'],
  ['D', [0, -1, 0], '#ffd23f'], ['L', [-1, 0, 0], '#f97316'], ['B', [0, 0, -1], '#2563eb'],
];

function cube(N) {
  const h = (N - 1) / 2; // coordenada de la capa exterior (1 en 3x3, 0.5 en 2x2)
  const faces = CUBE_FACES.map(([name, n, color]) => ({ name, n, d: h + 0.5, color }));
  const pieces = [];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
    const c = [i - h, j - h, k - h];
    const stickers = faces.map((f, fi) => [f, fi]).filter(([f]) => Math.abs(dot(c, f.n) - h) < 1e-9)
      .map(([f, fi]) => ({ face: fi, center: add(c, mul(f.n, 0.5)) }));
    if (stickers.length) pieces.push({ center: c, stickers });
  }
  // Capa exterior: piezas con n·c > h - 0.5. M (solo 3x3): capa central en x, mismo sentido que L.
  const layers = faces.map(f => ({ name: f.name, axis: f.n, lo: h - 0.5, order: 4 }));
  if (N === 3) layers.push({ name: 'M', axis: [-1, 0, 0], lo: -0.5, hi: 0.5, order: 4 });
  return { faces, pieces, layers, snap: true };
}

function pyraminx() {
  const rho = 2.7; // distancia del centro a cada vértice
  const s = Math.sqrt;
  const verts = { U: [0, 1, 0], L: [-s(2 / 3), -1 / 3, s(2 / 9)], R: [s(2 / 3), -1 / 3, s(2 / 9)], B: [0, -1 / 3, -s(8 / 9)] };
  // Cada cara es opuesta a un vértice: F (opuesta a B), L (opuesta a R), R (opuesta a L), D (opuesta a U).
  const faces = [['F', 'B', '#16a34a'], ['L', 'R', '#dc2626'], ['R', 'L', '#2563eb'], ['D', 'U', '#ffd23f']]
    .map(([name, opp, color]) => ({ name, n: mul(verts[opp], -1), d: rho / 3, color }));
  const tipCut = 5 * rho / 9, midCut = rho / 9; // la altura (4ρ/3) se divide en tres capas iguales
  const cuts = Object.values(verts).flatMap(v => [[v, tipCut], [v, midCut]]);
  const layers = Object.entries(verts).flatMap(([name, v]) => [
    { name, axis: v, lo: midCut, order: 3 },                     // U L R B: punta + capa media
    { name: name.toLowerCase(), axis: v, lo: tipCut, order: 3 }, // u l r b: solo la punta
  ]);
  return { faces, pieces: piecesFromCells(faces, cuts), layers, labels: Object.entries(verts).map(([n, v]) => [n, mul(v, rho * 1.18)]) };
}

const MEGA_COLORS = {
  U: '#f4f6fb', F: '#16a34a', R: '#dc2626', L: '#7c3aed', BR: '#ffd23f', BL: '#2563eb',
  D: '#9ca3af', B: '#a3e635', DR: '#f472b6', DL: '#fb923c', DBR: '#22d3ee', DBL: '#fde68a',
};

function megaminx() {
  const PHI = (1 + Math.sqrt(5)) / 2, r = 2.25; // r: distancia del centro a cada cara
  const ADJ = 1 / Math.sqrt(5);                 // coseno entre normales de caras vecinas
  let N = [];
  for (const a of [1, -1]) for (const b of [1, -1]) N.push([0, a, b * PHI], [a, b * PHI, 0], [b * PHI, 0, a]);
  N = N.map(norm);
  // Orienta: una cara arriba (U) y la cara vecina más cercana al observador exactamente al frente (F).
  const up = N[0];
  N = N.map(n => rotate(n, norm(cross(up, [0, 1, 0])), Math.acos(dot(up, [0, 1, 0]))));
  const U = N.find(n => n[1] > 0.99);
  const ring = N.filter(n => Math.abs(dot(n, U) - ADJ) < 1e-6);
  const front = ring.reduce((a, b) => (b[2] > a[2] ? b : a));
  N = N.map(n => rotate(n, [0, 1, 0], -Math.atan2(front[0], front[2])));
  const nb = (a, b) => Math.abs(dot(a, b) - ADJ) < 1e-6;
  const U2 = N.find(n => n[1] > 0.99), ring2 = N.filter(n => nb(n, U2));
  const F = ring2.find(n => n[2] > 0.8);
  const R = ring2.find(n => n !== F && nb(n, F) && n[0] > 0), L = ring2.find(n => n !== F && nb(n, F) && n[0] < 0);
  const BR = ring2.find(n => n !== F && nb(n, R)), BL = ring2.find(n => n !== F && nb(n, L));
  const opp = n => N.find(m => dot(n, m) < -0.99);
  const named = { U: U2, F, R, L, BR, BL, D: opp(U2), B: opp(F), DR: opp(BL), DL: opp(BR), DBR: opp(L), DBL: opp(R) };
  const faces = Object.entries(named).map(([name, n]) => ({ name, n, d: r, color: MEGA_COLORS[name] }));
  // Corte de cada cara: plano paralelo a distancia w (medida sobre las caras vecinas) de la arista común.
  const fv = vertsOf(faces.map(f => [f.n, f.d])).filter(v => Math.abs(dot(v, U2) - r) < 1e-6);
  const apothem = Math.hypot(...sub(fv[0], mul(U2, r))) * Math.cos(Math.PI / 5);
  const cutC = r - 0.42 * apothem * Math.sqrt(1 - ADJ * ADJ);
  const cuts = faces.map(f => [f.n, cutC]);
  const layers = faces.map(f => ({ name: f.name, axis: f.n, lo: cutC, order: 5 }));
  return { faces, pieces: piecesFromCells(faces, cuts), layers };
}

// ---------- modelo lógico común ----------

// Variantes de cada capa: X (horario), X' y, si el orden lo permite, X2 (y X2' en el megaminx).
function variants(layer) {
  const step = 2 * Math.PI / layer.order, out = [[layer.name, -step], [layer.name + "'", step]];
  if (layer.order >= 4) out.push([layer.name + '2', -2 * step]);
  if (layer.order >= 5) out.push([layer.name + "2'", 2 * step]);
  return out;
}

export function makePuzzle(kind) {
  const P = { cube3: () => cube(3), cube2: () => cube(2), pyraminx, megaminx }[kind]();
  P.kind = kind;
  P.slots = [];
  P.pieces.forEach((p, pi) => p.stickers.forEach(s => { s.slot = P.slots.length; P.slots.push({ pos: s.center, face: s.face, piece: pi }); }));
  P.home = Uint8Array.from(P.slots, s => s.face);
  P.moves = {};
  for (const L of P.layers) {
    const inside = c => { const t = dot(c, L.axis); return t > L.lo + 1e-6 && (L.hi === undefined || t < L.hi - 1e-6); };
    const moving = P.pieces.map(p => inside(p.center));
    for (const [name, angle] of variants(L)) {
      const perm = new Int16Array(P.slots.length);
      P.slots.forEach((s, i) => {
        if (!moving[s.piece]) { perm[i] = i; return; }
        const q = rotate(s.pos, L.axis, angle);
        let best = -1, bd = Infinity;
        P.slots.forEach((t, j) => { const d = dist2(q, t.pos); if (d < bd) { bd = d; best = j; } });
        if (bd > 1e-6) throw new Error(`${kind}: ${name} no cae sobre un slot`);
        perm[i] = best;
      });
      P.moves[name] = { layer: L.name, axis: L.axis, angle, lo: L.lo, hi: L.hi, perm };
    }
  }
  return P;
}

// Estado tras un movimiento: el sticker del slot i pasa al slot perm[i].
export function applyPerm(state, perm) {
  const out = new Uint8Array(state.length);
  for (let i = 0; i < state.length; i++) out[perm[i]] = state[i];
  return out;
}

export function applyMoves(P, state, moves) {
  for (const m of moves) state = applyPerm(state, P.moves[m].perm);
  return state;
}

// Resuelto = cada cara de un solo color (en 2x2/3x3 vale en cualquier orientación).
export function isSolved(P, state) {
  const colorOf = {};
  return P.slots.every((s, i) => (colorOf[s.face] ??= state[i]) === state[i]);
}

// String de 54 facelets para Kociemba (solo 3x3), con caras nombradas según sus centros actuales.
export function facelets(P, state) {
  const order = 'URFDLB', out = {};
  for (const f of order) out[f] = [];
  P.slots.forEach((s, i) => {
    const f = P.faces[s.face].name, [x, y, z] = P.pieces[s.piece].center;
    const idx = { U: (z + 1) * 3 + (x + 1), D: (1 - z) * 3 + (x + 1), F: (1 - y) * 3 + (x + 1), B: (1 - y) * 3 + (1 - x), R: (1 - y) * 3 + (1 - z), L: (1 - y) * 3 + (z + 1) }[f];
    out[f][idx] = state[i];
  });
  const faceOf = Object.fromEntries([...order].map(f => [out[f][4], f]));
  return [...order].map(f => out[f].map(c => faceOf[c]).join('')).join('');
}
