// node docs/tests/puzzles.test.mjs — cada solver resuelve mezclas aleatorias de su puzzle
import { makePuzzle, applyMoves, isSolved } from '../geom.js';
import { solveCube2, solvePyraminx, solveMegaminx, scramble } from '../solvers.js';

const cases = [['cube2', solveCube2, 30, 25], ['pyraminx', solvePyraminx, 30, 25], ['megaminx', solveMegaminx, 25, 70]];
for (const [kind, solve, n, len] of cases) {
  const P = makePuzzle(kind);
  let t = Date.now(); const lens = [];
  for (let i = 0; i < n; i++) {
    const s = applyMoves(P, P.home, scramble(P, len));
    const t0 = Date.now(), sol = solve(P, s);
    if (!isSolved(P, applyMoves(P, s, sol))) throw new Error(`${kind}: no resolvió`);
    lens.push(`${sol.length}${kind === 'megaminx' ? `(${Date.now() - t0}ms)` : ''}`);
  }
  console.log(`${kind}: ${n}/${n} OK en ${Date.now() - t} ms · movimientos: ${lens.join(' ')}`);
}

// Megaminx a pocos giros: la solución no debe ser más larga que la mezcla.
{
  const P = makePuzzle('megaminx');
  for (let n = 1; n <= 5; n++) {
    const mix = scramble(P, n), s = applyMoves(P, P.home, mix), sol = solveMegaminx(P, s);
    if (!isSolved(P, applyMoves(P, s, sol)) || sol.length > n) throw new Error(`megaminx corto: ${mix} → ${sol}`);
  }
  console.log('megaminx a 1–5 giros: solución óptima OK');
}
