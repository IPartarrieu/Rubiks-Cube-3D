// Solvers del 2x2, Pyraminx y Megaminx sobre el modelo de slots de geom.js (el 3x3 usa Kociemba).
import { applyPerm, applyMoves } from './geom.js';

// Inverso de un giro: misma capa y ángulo opuesto (en el cubo, el inverso de U2 es U2).
const inverseName = (P, n) => {
  const m = P.moves[n], full = 2 * Math.PI;
  return Object.keys(P.moves).find(k => P.moves[k].layer === m.layer && Math.abs(((P.moves[k].angle + m.angle) % full + full + 1e-9) % full) < 1e-6);
};

// ---------- búsqueda bidireccional (óptima) para 2x2 y Pyraminx ----------
// Expande alternadamente desde el estado actual y desde el objetivo hasta que ambos frentes se tocan.
// `mask` son los slots que importan (en el Pyraminx se ignoran las puntas, que se arreglan aparte).
function bidirectional(P, start, goal, names, mask, maxDepth = 16, soft = false) {
  const key = s => { let k = ''; for (const i of mask) k += String.fromCharCode(48 + s[i]); return k; };
  const ks = key(start), kg = key(goal);
  if (ks === kg) return [];
  const seen = [new Map([[ks, null]]), new Map([[kg, null]])];
  const front = [[start], [goal]];
  const trace = (map, k) => { const out = []; for (let e = map.get(k); e; e = map.get(e[0])) out.push(e[1]); return out; };
  for (let d = 0; d < maxDepth; d++) {
    const side = front[0].length <= front[1].length ? 0 : 1, next = [];
    for (const s of front[side]) {
      const k0 = key(s);
      for (const n of names) {
        const t = applyPerm(s, P.moves[n].perm), kt = key(t);
        if (seen[side].has(kt)) continue;
        seen[side].set(kt, [k0, n]);
        if (seen[1 - side].has(kt)) {
          const fwd = trace(seen[0], kt).reverse();         // inicio → encuentro
          const back = trace(seen[1], kt).map(n => inverseName(P, n)); // encuentro → objetivo
          return [...fwd, ...back];
        }
        next.push(t);
      }
    }
    front[side] = next;
  }
  if (soft) return null;
  throw new Error('sin solución dentro de la profundidad máxima');
}

// 2x2: solo U, R y F, así la esquina DLB nunca se mueve y define la orientación final.
export function solveCube2(P, state) {
  const dlb = P.pieces.findIndex(p => p.center.every(c => c < 0));
  const opp = f => P.faces.findIndex(g => g.n.every((x, i) => Math.abs(x + P.faces[f].n[i]) < 1e-9));
  const colorOfFace = {};
  for (const s of P.pieces[dlb].stickers) {
    colorOfFace[s.face] = state[s.slot];
    colorOfFace[opp(s.face)] = opp(state[s.slot]); // colores = índices de cara, así que el opuesto es la cara opuesta
  }
  const goal = Uint8Array.from(P.slots, s => colorOfFace[s.face]);
  const names = ['U', 'R', 'F'].flatMap(f => [f, f + "'", f + '2']);
  return bidirectional(P, state, goal, names, P.slots.map((_, i) => i));
}

// Pyraminx: el núcleo (U L R B) con búsqueda óptima y luego cada punta con 0 o 1 giro.
export function solvePyraminx(P, state) {
  const tips = ['u', 'l', 'r', 'b'];
  const tipSlots = new Set(tips.flatMap(t => [...P.moves[t].perm].flatMap((v, i) => (v !== i ? [i] : []))));
  const mask = P.slots.map((_, i) => i).filter(i => !tipSlots.has(i));
  const core = bidirectional(P, state, P.home, ['U', "U'", 'L', "L'", 'R', "R'", 'B', "B'"], mask);
  let s = applyMoves(P, state, core);
  const fixes = [];
  for (const t of tips) {
    const slots = [...P.moves[t].perm].flatMap((v, i) => (v !== i ? [i] : []));
    for (const fix of [[], [t], [t + "'"]]) {
      const x = applyMoves(P, s, fix);
      if (slots.every(i => x[i] === P.home[i])) { fixes.push(...fix); s = x; break; }
    }
  }
  return [...core, ...fixes];
}

// ---------- Megaminx ----------
// 1) Coloca piezas una a una (de abajo hacia arriba) con IDA*. La heurística es la mayor distancia
//    individual entre las piezas ya resueltas y la nueva, así que desarmar lo resuelto se paga.
// 2) Lo que falte (en la práctica, la última cara) se resuelve con conmutadores puros —ciclos de
//    3 piezas y giros de orientación de 2 piezas— conjugados con un "setup" que se encuentra por BFS.
//    Cada paso resuelve una pieza más sin tocar las ya resueltas, así que el método siempre termina.

const MEGA = new WeakMap();
const compose = (a, b) => { const c = new Int16Array(a.length); for (let i = 0; i < a.length; i++) c[i] = b[a[i]]; return c; };
const invPerm = a => { const c = new Int16Array(a.length); for (let i = 0; i < a.length; i++) c[a[i]] = i; return c; };
const identity = n => Int16Array.from({ length: n }, (_, i) => i);

function megaPrep(P) {
  if (MEGA.has(P)) return MEGA.get(P);
  const names = Object.keys(P.moves), nS = P.slots.length;
  const perm = names.map(n => P.moves[n].perm);
  const pinv = perm.map(invPerm);
  const inv = names.map(n => names.indexOf(inverseName(P, n)));
  const layerIdx = names.map(n => P.layers.findIndex(L => L.name === P.moves[n].layer));
  // Capas que no comparten piezas conmutan: se fija un orden para no explorar ambos.
  const touched = P.layers.map((_, li) => new Set(perm.flatMap((p, mi) => (layerIdx[mi] === li ? [...p].flatMap((v, i) => (v !== i ? [P.slots[i].piece] : [])) : []))));
  const commute = touched.map((A, a) => touched.map((B, b) => a !== b && ![...A].some(x => B.has(x))));
  const movable = P.pieces.map((_, i) => i).filter(i => P.pieces[i].stickers.length > 1);
  const ref = movable.map(i => P.pieces[i].stickers[0].slot); // slot de referencia de cada pieza
  const locOfSlot = Int16Array.from(P.slots, s => s.piece);
  // Giros mínimos para llevar el sticker de referencia de cada pieza a su lugar (BFS hacia atrás).
  const dist = ref.map(target => {
    const d = new Int8Array(nS).fill(-1);
    d[target] = 0;
    for (let q = [target], k = 0; q.length; k++) {
      const nq = [];
      for (const x of q) for (const p of pinv) { const y = p[x]; if (d[y] < 0) { d[y] = k + 1; nq.push(y); } }
      q = nq;
    }
    return d;
  });
  const prep = { names, perm, pinv, inv, layerIdx, commute, movable, ref, locOfSlot, dist };
  prep.macros = findMacros(P, prep);
  const quarter = names.map((_, i) => i).filter(i => /^[A-Z]+'?$/.test(names[i]));
  const asMacro = seq => ({ seq, perm: seq.reduce((acc, m) => compose(acc, perm[m]), identity(nS)) });
  prep.cheap = [
    ...names.map((_, m) => asMacro([m])),
    ...quarter.flatMap(x => quarter.filter(z => layerIdx[z] !== layerIdx[x]).map(z => asMacro([x, z, inv[x]]))),
  ];
  MEGA.set(P, prep);
  return prep;
}

// Conmutadores puros del megaminx (hallados por búsqueda exhaustiva sobre este mismo modelo).
// Al cargar se verifica que cada uno toque solo las piezas que dice.
const MEGA_MACROS = {
  ciclo3: "U F U' F' BR F U F' U' BR'",                    // 3 esquinas
  ciclo2: "U B' BL B U' BR U B' BL' B U' BR'",             // 3 aristas
  giro3: "U F U' F' U F U' F' BR F U F' U' F U F' U' BR'", // gira 2 esquinas en su lugar
  giro2: "U B' BL B U' BR U B' BL' B U' BR' U' BR' BL' U B' BL B U' BR U B' BL' B U' BR' BL BR U", // voltea 2 aristas
};

function findMacros(P, { names, perm, inv, locOfSlot }) {
  const nS = P.slots.length, size = loc => P.pieces[loc].stickers.length;
  return Object.entries(MEGA_MACROS).flatMap(([type, text]) => {
    const seq = text.split(' ').map(n => names.indexOf(n));
    const p = seq.reduce((acc, m) => compose(acc, perm[m]), identity(nS));
    const locs = new Set();
    for (let i = 0; i < nS; i++) if (p[i] !== i) locs.add(locOfSlot[i]);
    const inPlace = [...locs].every(l => P.pieces[l].stickers.every(st => locOfSlot[p[st.slot]] === l));
    const want = { ciclo3: [3, 3, false], ciclo2: [3, 2, false], giro3: [2, 3, true], giro2: [2, 2, true] }[type];
    if (locs.size !== want[0] || [...locs].some(l => size(l) !== want[1]) || inPlace !== want[2]) throw new Error('macro inválida: ' + type);
    return [{ seq, perm: p }, { seq: [...seq].reverse().map(m => inv[m]), perm: invPerm(p) }];
  });
}

export function solveMegaminx(P, state) {
  // Si está a pocos giros de resolverse (p. ej. unos giros a mano), la búsqueda exacta da la solución óptima.
  const near = bidirectional(P, state, P.home, Object.keys(P.moves), P.slots.map((_, i) => i), 5, true);
  if (near) return near;
  const prep = megaPrep(P), { names, perm, inv, layerIdx, commute, movable, ref, locOfSlot, dist } = prep;
  const nS = P.slots.length;
  // Dónde está hoy el sticker de referencia de cada pieza (las piezas se reconocen por sus colores).
  const pos = new Int16Array(movable.length);
  movable.forEach((pi, k) => {
    const colors = P.pieces[pi].stickers.map(s => s.face), want = [...colors].sort().join();
    const loc = movable.find(l => P.pieces[l].stickers.map(s => state[s.slot]).sort().join() === want);
    pos[k] = P.pieces[loc].stickers.find(s => state[s.slot] === colors[0]).slot;
  });
  const out = [];
  const apply = m => { for (let k = 0; k < pos.length; k++) pos[k] = perm[m][pos[k]]; out.push(m); };
  const solved = k => pos[k] === ref[k];
  const homeOfLoc = new Map(movable.map((pi, k) => [pi, k]));

  // Biblioteca: giros sueltos y triggers X Y X' (baratos, sirven mientras no toquen piezas resueltas)
  // y los conmutadores puros (siempre sirven, para el final).
  const y = k => P.pieces[movable[k]].center[1];
  const macros = [...prep.cheap, ...prep.macros.map(M => ({ ...M, pure: true }))].map(M => {
    const supp = [];
    for (let i = 0; i < nS; i++) if (M.perm[i] !== i) supp.push(i);
    return { ...M, locs: [...new Set(supp.map(i => locOfSlot[i]))], supp };
  });
  const targets = new Map(); // par (a, M(a)) → macros que lo realizan
  macros.forEach((M, mi) => M.supp.forEach(a => {
    const key = a * nS + M.perm[a];
    if (!targets.has(key)) targets.set(key, []);
    targets.get(key).push(mi);
  }));
  const locSolved = loc => solved(homeOfLoc.get(loc));

  const { pinv } = prep;
  const atLoc = new Int16Array(P.pieces.length); // pieza que ocupa cada ubicación (se actualiza en cada paso)
  // Efecto de T = S·M·S⁻¹: -1 si toca alguna pieza ya resuelta; si no, cuántas piezas deja resueltas.
  const evaluate = (S, M) => {
    const fwd = x => { for (let i = 0; i < S.length; i++) x = perm[S[i]][x]; return x; };
    const bwd = x => { for (let i = S.length - 1; i >= 0; i--) x = pinv[S[i]][x]; return x; };
    let gain = 0;
    for (const l of M.locs) {
      const j = atLoc[locOfSlot[bwd(P.pieces[l].stickers[0].slot)]];
      if (solved(j)) return -1;
      if (bwd(M.perm[fwd(pos[j])]) === ref[j]) gain++;
    }
    return gain;
  };
  const conj = (S, M) => [...S, ...M.seq, ...[...S].reverse().map(m => inv[m])];
  const pathTo = (prev, key) => { const S = []; for (let e = prev.get(key); e; e = prev.get(e[0])) S.push(e[1]); return S.reverse(); };

  // BFS sobre pares de slots: un setup S con S(s) = a y S(h) = M(a) hace que S·M·S⁻¹ lleve la pieza de s
  // a su lugar h. Entre los candidatos de largo similar se prefiere el que resuelve más piezas a la vez.
  const placeOne = k => {
    const s = pos[k], hh = ref[k], start = s * nS + hh;
    const prev = new Map([[start, null]]);
    let best = null, stopDepth = Infinity;
    const MAXD = 4; // setups más largos no convienen frente a un conmutador directo
    for (let q = [start], d = 0; q.length && d <= Math.min(stopDepth, MAXD); d++) {
      const nq = [];
      for (const key of q) {
        for (const mi of targets.get(key) || []) {
          const S = pathTo(prev, key), gain = evaluate(S, macros[mi]);
          if (gain < 1) continue;
          const seq = conj(S, macros[mi]), score = gain * 14 - seq.length;
          if (!best || score > best.score) best = { seq, score };
          stopDepth = Math.min(stopDepth, d + 1);
        }
        const u = (key / nS) | 0, v = key % nS;
        for (let m = 0; m < names.length; m++) {
          const nk = perm[m][u] * nS + perm[m][v];
          if (!prev.has(nk)) { prev.set(nk, [key, m]); nq.push(nk); }
        }
      }
      q = nq;
    }
    return best;
  };

  // Respaldo: BFS sobre tríos de slots, fijando además cuál es la tercera pieza afectada.
  let seen3 = null, from3 = null, move3 = null;
  const placeTriple = k => {
    const s = pos[k], hh = ref[k], size = P.pieces[movable[k]].stickers.length, n3 = nS * nS * nS;
    seen3 ??= new Uint8Array(n3); from3 ??= new Int32Array(n3); move3 ??= new Int8Array(n3);
    const thirds = movable.filter(l => l !== locOfSlot[s] && l !== locOfSlot[hh] && P.pieces[l].stickers.length === size && !locSolved(l));
    for (const L3 of thirds) {
      const goals = new Map();
      macros.forEach((M, mi) => {
        if (!M.pure || P.pieces[M.locs[0]].stickers.length !== size) return;
        for (const a of M.supp) {
          const la = locOfSlot[a], lb = locOfSlot[M.perm[a]];
          for (const l of M.locs) if (l !== la && l !== lb) for (const st of P.pieces[l].stickers) goals.set((a * nS + M.perm[a]) * nS + st.slot, mi);
        }
      });
      seen3.fill(0);
      const start = (s * nS + hh) * nS + P.pieces[L3].stickers[0].slot;
      seen3[start] = 1;
      let q = [start];
      while (q.length) {
        const nq = [];
        for (const key of q) {
          if (goals.has(key)) {
            const S = [];
            for (let e = key; e !== start; e = from3[e]) S.push(move3[e]);
            S.reverse();
            const M = macros[goals.get(key)];
            if (evaluate(S, M) >= 1) return conj(S, M);
          }
          const w = key % nS, v = ((key / nS) | 0) % nS, u = (key / (nS * nS)) | 0;
          for (let m = 0; m < names.length; m++) {
            const nk = (perm[m][u] * nS + perm[m][v]) * nS + perm[m][w];
            if (!seen3[nk]) { seen3[nk] = 1; from3[nk] = key; move3[nk] = m; nq.push(nk); }
          }
        }
        q = nq;
      }
    }
    return null;
  };

  for (let guard = 0; guard < 300; guard++) {
    const pending = movable.map((_, k) => k).filter(k => !solved(k));
    if (!pending.length) break;
    pos.forEach((p, j) => { atLoc[locOfSlot[p]] = j; });
    // Se prueban las piezas pendientes más bajas y se elige la jugada con mejor puntaje.
    pending.sort((a, b) => y(a) - y(b));
    let best = null;
    for (const k of pending.slice(0, 8)) { const c = placeOne(k); if (c && (!best || c.score > best.score)) best = c; }
    for (let i = 8; !best && i < pending.length; i++) best = placeOne(pending[i]);
    let seq = best && best.seq;
    if (!seq) for (const k of pending) if ((seq = placeTriple(k))) break;
    if (!seq) throw new Error('megaminx: no encontré conmutador');
    seq.forEach(apply);
  }
  if (!movable.every((_, k) => solved(k))) throw new Error('megaminx: quedó sin resolver');
  return simplify(P, out.map(m => names[m]));
}

// Junta giros seguidos de la misma capa (R R → R2, R R' → nada).
export function simplify(P, moves) {
  const orderOf = L => P.layers.find(x => x.name === L).order;
  const amount = n => Math.round(-P.moves[n].angle / (2 * Math.PI / orderOf(P.moves[n].layer)));
  const named = (L, k) => {
    const o = orderOf(L);
    k = ((k % o) + o) % o;
    if (!k) return null;
    const half = o >= 4 && k === 2 ? L + '2' : null;
    return k === 1 ? L : k === o - 1 ? L + "'" : half ?? (o === 5 && k === 3 ? L + "2'" : null);
  };
  const out = [];
  for (const n of moves) {
    const L = P.moves[n].layer, last = out[out.length - 1];
    if (last && P.moves[last].layer === L) {
      out.pop();
      const merged = named(L, amount(last) + amount(n));
      if (merged) out.push(merged);
    } else out.push(n);
  }
  return out;
}

// Mezcla aleatoria por giros (siempre estados alcanzables), sin repetir capa dos veces seguidas.
export function scramble(P, length) {
  const names = Object.keys(P.moves).filter(n => !n.startsWith('M'));
  const out = [];
  while (out.length < length) {
    const n = names[Math.random() * names.length | 0];
    if (out.length && P.moves[out[out.length - 1]].layer === P.moves[n].layer) continue;
    out.push(n);
  }
  return out;
}
