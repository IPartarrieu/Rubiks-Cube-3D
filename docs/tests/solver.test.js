// node docs/tests/solver.test.js — Kociemba resuelve siempre y la mezcla inversa reproduce el estado
const Cube = require('../vendor/cube.js'); require('../vendor/solve.js');
Cube.initSolver();
let max = 0;
for (let i = 0; i < 200; i++) {
  const target = Cube.random();
  const sol = target.solve();
  const c = new Cube(target); c.move(sol);
  if (!c.isSolved()) throw new Error('no resuelto: ' + sol);
  const s = new Cube(); s.move(Cube.inverse(sol));            // mezcla = inversa de la solución
  if (s.asString() !== target.asString()) throw new Error('mezcla no reproduce estado');
  max = Math.max(max, sol.split(' ').length);
}
const c = new Cube(); c.move("R U R' U' F2 D L' B");
const f = Cube.fromString(c.asString()); f.move(f.solve());
console.log('200/200 OK, máx movimientos:', max, '| fromString OK:', f.isSolved());
