// Solvers del 2x2, Pyraminx y Megaminx en segundo plano (el 3x3 usa solver-worker.js con Kociemba).
import { makePuzzle } from './geom.js';
import { solveCube2, solvePyraminx, solveMegaminx } from './solvers.js';

const puzzles = {};
const solvers = { cube2: solveCube2, pyraminx: solvePyraminx, megaminx: solveMegaminx };

onmessage = ({ data: { kind, state } }) => {
  try {
    const P = (puzzles[kind] ??= makePuzzle(kind));
    postMessage({ moves: solvers[kind](P, Uint8Array.from(state)) });
  } catch (e) {
    postMessage({ error: e.message });
  }
};
