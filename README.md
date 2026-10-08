# Rubiks-Cube-3D

Rompecabezas 3D interactivos: **cubo 3×3, cubo 2×2, Pyraminx y Megaminx**. Gira las caras con la notación estándar, mézclalos al azar o con tu propia secuencia, y mira cómo se resuelven paso a paso, con un solver que **siempre** llega a la solución.

🔗 **Demo en vivo:** [ipartarrieu.github.io/Rubiks-Cube-3D](https://ipartarrieu.github.io/Rubiks-Cube-3D/)

## Qué hace

- **Cuatro variantes** en 3D (three.js); arrastra para rotar la vista.
- **Giros por botón, teclado o secuencia escrita**, con la notación de cada puzzle (`U R F D L B M` en el cubo, `U L R B` y puntas `u l r b` en el Pyraminx, las 12 caras del Megaminx con giros de 72° y 144°).
- **Mezcla aleatoria** (siempre estados alcanzables; en el 3×3, un estado uniformemente aleatorio como en las competencias WCA).
- **Resolver**: el solver corre en un Web Worker y la solución se anima giro a giro.

| Variante | Solver | Largo típico |
|---|---|---|
| 3×3 | Algoritmo de dos fases de Kociemba ([cubejs](https://github.com/ldez/cubejs), MIT) | ≤ 22 |
| 2×2 | Búsqueda bidireccional exacta (solo `U R F`) | óptimo, ≤ 11 |
| Pyraminx | Búsqueda bidireccional exacta del cuerpo + puntas | óptimo, ≤ 15 |
| Megaminx | Colocación pieza a pieza: giros cortos y, al final, conmutadores puros (ciclos de 3 piezas y giros de orientación de 2) | 300–500 |

El Megaminx no tiene un solver óptimo práctico (su espacio de estados es ~10⁶⁸), así que se resuelve como lo haría una persona: pieza a pieza, sin tocar lo ya resuelto. Cada paso deja al menos una pieza más en su lugar, por eso siempre termina. Si el estado está a 5 giros o menos de resolverse, se usa búsqueda exacta.

## Cómo está construido (`docs/`)

- **`geom.js`**: geometría y modelo lógico, sin dependencias. Cada puzzle se define por sus caras y planos de corte; de ahí salen las piezas (cortando el sólido), los stickers y la permutación de cada giro. La vista 3D y los solvers usan exactamente el mismo modelo.
- **`app.js`**: escena 3D, giros animados e interfaz. El estado se lee de la posición real de los stickers, así lo que se resuelve es lo que se ve.
- **`solvers.js`** + **`puzzle-worker.js`**: solvers del 2×2, Pyraminx y Megaminx. **`solver-worker.js`**: Kociemba para el 3×3.
- **Tests**: `node docs/tests/solver.test.js` (3×3, 200 estados aleatorios) y `node docs/tests/puzzles.test.mjs` (2×2, Pyraminx y Megaminx).

Para correrlo en local: `cd docs && python3 -m http.server`, y abre `http://localhost:8000`.

## Versión anterior: Simulated Annealing (`rubik/`)

Primera versión del proyecto: el cubo resuelto con **Simulated Annealing**, siguiendo [Saeidi (2018)](https://doi.org/10.5815/ijeme.2018.01.01), en una app de Streamlit ([demo](https://rubiks-cube-simulated-annealin-swrgpzutprn7ysd3gyhu7p.streamlit.app/)). Se mantiene como comparación: es una metaheurística sin garantía de llegar a la solución, que fue justamente la motivación para la versión con Kociemba.

### Qué hace

Mezcla el cubo con un número de movimientos al azar y aprieta "Resolver con SA": el algoritmo prueba movimientos aleatorios entre los 18 posibles (girar cualquiera de las 6 caras 90°, -90° o 180°), aceptando cada uno si mejora la solución o, si no, con una probabilidad que baja a medida que el sistema se "enfría". Se puede volver a apretar "Resolver" para seguir intentando desde donde quedó.

### Cómo está construido

- **`rubik/cube.py`** — motor del cubo: en vez de tablas de permutación escritas a mano, cada movimiento rota geométricamente las piezas de una capa en coordenadas 3D. Verificado con tests algebraicos, incluida la identidad clásica de teoría de grupos `(R U R' U')⁶ = identidad`.
- **`rubik/sa_solver.py`** — Simulated Annealing fiel al pseudocódigo del paper, con la fitness corregida (el paper define fitness = piezas *fuera* de lugar en el texto, pero la Ec. 2-3 la define al revés — un error que el propio documento reconoce) y la temperatura inicial recalibrada empíricamente (el valor del paper, 1000-5000, resulta demasiado alto frente a la escala real de los saltos de fitness en este cubo).
- **`rubik/render.py`** — render 3D con matplotlib, compartiendo la misma estructura de piezas que el motor.
- **`rubik/app.py`** — interfaz interactiva en Streamlit.

**Nota honesta:** Simulated Annealing con esta función de fitness (número de piezas mal ubicadas) es un método relativamente débil para el cubo — el propio paper reporta necesitar hasta 358 movimientos para resolverlo, y mezclas profundas pueden no resolverse del todo dentro del presupuesto de cómputo de la demo. Esto no es un bug: es una limitación conocida del método, documentada en la interfaz.

### Correr en local

```bash
cd rubik
pip install -r requirements.txt
streamlit run app.py
```

### Tests

```bash
cd rubik
python tests/test_cube.py
python tests/test_sa_solver.py
python tests/test_render.py
```

