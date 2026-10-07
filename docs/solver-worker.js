// Kociemba en segundo plano: la inicialización (~4 s) y la búsqueda no congelan la animación.
importScripts('vendor/cube.js', 'vendor/solve.js');
Cube.initSolver();
postMessage({ cmd: 'ready' });

const len = s => (s ? s.split(' ').length : 0);

onmessage = ({ data }) => {
  if (data.cmd === 'random') {
    // Estado uniformemente aleatorio (siempre alcanzable); la mezcla es la inversa de su solución.
    postMessage({ cmd: 'random', moves: Cube.inverse(Cube.random().solve()) });
    return;
  }
  // 'solve': primero la solución garantizada (≤ 22), luego se buscan otras más cortas bajando
  // el límite de profundidad. Esa búsqueda puede tardar mucho; la página corta por tiempo.
  const cube = Cube.fromString(data.facelets);
  let best = cube.isSolved() ? '' : cube.solve();
  postMessage({ cmd: 'solution', moves: best });
  while (len(best) > 1) {
    let s = null;
    try { s = cube.solve(len(best) - 1); } catch { /* sin solución con ese límite */ }
    if (!s || len(s) >= len(best)) break;
    postMessage({ cmd: 'solution', moves: (best = s) });
  }
  postMessage({ cmd: 'done' });
};
