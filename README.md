# Rubiks-Cube-3D

Cubo Rubik 3D interactivo: gira las caras con la notación estándar (`U D L R F B`, con `'` y `2`), mézclalo al azar o con tu propia secuencia, y mira cómo se resuelve paso a paso con el **algoritmo de dos fases de Kociemba**, que **siempre** llega a la solución en 22 movimientos o menos.

🔗 **Demo en vivo:** [ipartarrieu.github.io/Rubiks-Cube-3D](https://ipartarrieu.github.io/Rubiks-Cube-3D/)

## Qué hace

- **Cubo 3D** (three.js) con piezas redondeadas; arrastra para rotar la vista.
- **Giros por botón o teclado**: `U R F D L B` giran 90° en sentido horario; con Shift, antihorario. `M` gira la capa central (mismo sentido que `L`).
- **Mezcla aleatoria por estado**: se elige un estado uniformemente al azar entre los ~4,3·10¹⁹ posibles (nunca uno imposible, como una esquina torcida) y se llega a él con una secuencia real de giros, igual que en las competencias oficiales (WCA).
- **Mezcla propia**: escribe una secuencia como `R U R' U' F2 D L2`.
- **Resolver**: el solver corre en un Web Worker y la solución se anima giro a giro, resaltando el movimiento actual.

## Cómo está construido (`docs/`)

- **`app.js`**: escena 3D, giros animados y lectura del estado. El estado se lee de la propia geometría (54 stickers → string de facelets), así lo que se resuelve es exactamente lo que se ve.
- **`solver-worker.js`**: Kociemba vía [cubejs](https://github.com/ldez/cubejs) (MIT, en `vendor/`). Entrega primero una solución garantizada (≤ 22) y luego busca otras más cortas durante 2 s como máximo.
- **`tests/solver.test.js`**: 200 estados aleatorios, todos resueltos (`node docs/tests/solver.test.js`). Los 18 giros de la vista 3D se verificaron contra el modelo de cubejs.

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

