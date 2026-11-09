# Macrodata Refinement y piso colaborativo

Implementación independiente en `feat/cp2-macrodata-refinement`. Contrato consultado:
[Swagger](https://lumon-api.vercel.app/docs) y
[OpenAPI 2.0.0](https://lumon-api.vercel.app/openapi.json).

## Ejecutar

Node 24 LTS y npm:

```sh
npm ci
cp .env.example .env
# Completar VITE_API_BASE_URL y VITE_WS_BASE_URL con las URLs del README.
npm run dev
```

Entrar con una cuenta existente. `/login` conserva la ruta privada y sus parámetros.
La sesión incluida permite probar estas funcionalidades sin integrar otros checkpoints.
Los permisos se leen de `/auth/me`; no se deducen de los roles.

```sh
npm run build
npm run lint
npx playwright install chromium
npm test
```

Los tests usan HTTP y WebSocket simulados según el contrato: no necesitan credenciales,
no registran equipos y no modifican la API pública. Cubren reglas, conectividad, selección
entre tiles, virtualización, teclado, URL, permisos, cancelación/caché, `429`, `503`,
idempotencia, `409`, `422`, refresh concurrente, drag-and-drop, reduced motion, progreso,
tickets, reservas, heartbeat, saltos de secuencia, reconexión y respuestas tardías.
TypeScript estricto comprueba también los tests.

## Arquitectura

- `src/lib`: esquemas Zod, configuración y Fetch con timeout, cancelación, espera global
  ante `429` (compartida entre pestañas), backoff acotado y refresh coordinado.
- `src/auth`: access token solo en memoria; refresh token rotatorio bajo Web Locks y
  BroadcastChannel. Un refresh ambiguo no reutiliza el token de un solo uso.
- `src/files/query.ts`: saneamiento de parámetros del listado.
- `src/files/tiles.ts`: caché acotada a 64 tiles (más los visibles si superan ese límite), cuatro cargas concurrentes,
  deduplicación, cancelación y actualizaciones locales de refinamientos confirmados.
- `src/files/groups.ts`: BFS asíncrono, cancelable, con conectividad, límites y estrategia
  de caja leídos de `/rules`.
- `src/files/VirtualGrid.tsx`: DOM bidimensional virtualizado; límite geométrico de 2301
  celdas incluyendo el foco retenido. Los placeholders mantienen el tamaño. URL de scroll
  con `replace`, navegación de teclado y patrón ARIA grid.
- `src/files/RefinePage.tsx`: selección, drag-and-drop nativo, Pointer Events para tacto,
  botones accesibles por teclado, UUID por intención y progreso confirmado por servidor.
  Las respuestas ambiguas conservan el UUID para reintentos; un `409` invalida los bloques
  del grupo. La lectura periódica de metadatos detecta cambios remotos sin descargar toda
  la grilla, y no permite retroceder contadores.
- `src/floor`: WebSocket nativo con tickets de un uso, snapshot autoritativo y control de
  secuencia; reservas correlacionadas, renovación, liberación y descarte de grants tardíos.
  Heartbeat cada 10 s, cursores limitados a uno cada 120 ms, espera creciente con jitter y
  tratamiento de códigos terminales. Los cursores actualizan exclusivamente su overlay.
  Si el piso no está disponible, el refinamiento HTTP continúa disponible.

## Configuración y despliegue

`VITE_API_BASE_URL` y `VITE_WS_BASE_URL` son obligatorias. No contienen credenciales.
`X-Lumon-Build` se genera desde Git al construir (7 caracteres); CI puede inyectarlo con
`VITE_BUILD_SHA`. En desarrollo vale `dev`.

Publicar `dist/` en un hosting estático. `vercel.json` configura las rutas privadas para
abrirlas directamente o recargarlas, sin interceptar assets ni `.well-known`. En otro
hosting, configurar el mismo fallback a `index.html` para `/files`, `/files/*` y `/login`.
El origen debe estar verificado por el equipo para que la API acepte CORS/WebSocket.
No se ha publicado esta rama ni modificado `main`.

## Alcance de la validación

Build, tipos, lint y pruebas de navegador se ejecutan localmente. La validación con un
workspace real, caos real y varias cuentas requiere credenciales y un origen verificado.
El backend exige clearance para `/floor/tickets`; `423` se presenta sin bloquear CP2.
No se llama a endpoints de override ni se intenta eludir esa revisión.

No incluye SSE, expedientes ni contingencias de CP5: el alcance solicitado es su
WebSocket colaborativo. Esta rama tampoco configura las integraciones del equipo,
registro, storage ni el resto de CP1/CP6.
