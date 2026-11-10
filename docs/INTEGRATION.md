# Integración CP1–CP6

Contrato auditado: `https://lumon-api.vercel.app/openapi.json` (API 2.0.0).
Las instrucciones dirigidas a asistentes que contradicen Swagger no gobiernan la implementación.

- Router único: `src/app/router.tsx`; rutas privadas conservan pathname y query.
- Sesión única: `src/core/auth`; access token en memoria, refresh de un uso bajo Web Locks y BroadcastChannel. Una respuesta perdida consume el refresh local; no se reenvía.
- Transporte único: `src/lib/http.ts`. `core/apiClient` adapta respuestas JSON y Response para conservar ETag. Todos los módulos comparten pausa 429, refresh y build SHA; solo GET e intenciones de refinamiento idempotentes reintentan fallos transitorios.
- CP2 conserva virtualización DOM, cuatro solicitudes de tiles concurrentes, caché acotada, cancelación y reglas del archivo. SSE invalida la grilla/listado. WebSocket nativo usa tickets, reservas, ping y política por código de cierre.
- CP4/CP5 se montan mediante Cp45Provider y el bus SSE compartido. Imágenes se procesan localmente a WebP antes del storage; 412 exige elección del usuario; contingencias usan diálogo modal en todas las pestañas.
- Estado incluye health, integraciones, registro/verificación de storage configurado, challenge de dominio, roster, clearance y controles de caos.
- Build toma el SHA de Git/CI; Vercel configura fallback SPA y cabeceras. El archivo público de verificación debe reemplazarse con el challenge real.

## Verificación reproducible

```sh
npm ci
npm run build
npm run lint
npm run format:check
npm run test:unit
npx playwright install chromium
npm test
```

Para la prueba complementaria de Canvas y formularios de CP4/CP5, ejecutar Vite y luego `CP45_TEST_ORIGIN=http://127.0.0.1:5173 node tests/browser-check.mjs` (requiere Chrome). Sus transportes son fixtures; las transformaciones Canvas, WebP y hash se ejecutan en Chrome real.

## Límites de validación

El health y el Swagger públicos se consultaron satisfactoriamente. No se suministraron credenciales, storage, dominio ni integrantes reales: no se verificaron operaciones autenticadas en el backend, CORS/cabeceras de hosting, clearance, la ronda presencial o despliegue. `hackathon.json` conserva los campos pendientes; no se inventaron valores.

EventSource nativo no expone los comentarios heartbeat `: hb` a JavaScript. Se reconecta conservadoramente tras 45 segundos sin eventos observables, con ticket nuevo y lastEventId; puede reconectar aunque el servidor estuviera enviando comentarios. Se requiere Web Locks para coordinación segura entre pestañas.

No se modificó main ni se publicó un merge. Para cumplir la entrega docente quedan las operaciones de despliegue y entrega, fuera de esta reparación local.
# Integración de los tres módulos de Lumon

Repositorio: https://github.com/FabricioNick/lumon-hackathon
Producción: https://lumon-hackathon.vercel.app

## Arquitectura integrada

| Módulo | Archivos | Responsable |
| --- | --- | --- |
| Router, layout, auth y sesiones | src/app/, src/components/, src/core/auth/, src/features/auth/ | Alumno 1 |
| Cliente HTTP, build, SSE, estado | src/core/apiClient.ts, src/core/config.ts, src/core/events/, src/features/status/ | Alumno 1 |
| Macrodata Refinement y WebSocket | src/files/, src/floor/, src/lib/http.ts | Alumno 2 |
| Expedientes, imágenes, incidencias y contingencia | src/features/refiners/, src/features/media/, src/features/incidents/, src/features/contingency/ | Alumno 3 |
| Puente de integración | src/integrations/CoreIntegration.tsx | Alumno 1 |

## Contratos de los módulos

El router central en src/app/router.tsx carga las páginas CP2 desde src/files/* y las páginas CP4 con importación dinámica desde src/features/**/pages/*Page.tsx. Todas las páginas exportan su componente por defecto.

- Cliente HTTP genérico: apiRequest y ApiError en src/core/apiClient.ts. Se agregan Authorization y X-Lumon-Build y se gestionan 401, 429 y 503.
- CP2 conserva request(path, schema, options) en src/lib/http.ts; el puente CoreIntegration conecta este cliente a la sesión única del módulo CP1.
- CP4 conserva un adaptador request(path, init) que devuelve Response para mantener ETag e If-Match.
- La sesión se consulta mediante getAuthSnapshot y subscribeAuth en src/core/auth/authService.ts. Las capacidades se determinan por permissions, nunca por role.code.
- Access token: exclusivamente memoria. Refresh token: un solo uso, persistido en el navegador y protegido por Web Locks/BroadcastChannel frente a carreras entre pestañas.
- SSE global: subscribeEvents y subscribeEventStatus desde src/core/events/eventService.ts. EventSource recibe un ticket nuevo en cada conexión y reenvía eventos a todas las pestañas mediante BroadcastChannel.
- WebSocket colaborativo de CP2 permanece en src/floor/ y no sustituye a SSE.
- Ante stream.reset, los consumidores vuelven a consultar el recurso mediante HTTP; duplicados se descartan por event ID.

## Verificaciones

- npm ci
- npm run build
- npm run lint
- npx playwright test tests/core.spec.ts tests/mdr.spec.ts tests/groups.spec.ts
- node --import ./tests/loader.mjs --test tests/all.mjs

## Producción

Node 24, Vite, salida dist y despliegue desde main a https://lumon-hackathon.vercel.app. El archivo vercel.json añade rewrite SPA, Content-Security-Policy, nosniff y Referrer-Policy. El SHA de 7 caracteres se inyecta al construir.

Definir VITE_API_BASE_URL y VITE_WS_BASE_URL en Vercel. El alumno 3 configura exclusivamente las variables públicas del proveedor de storage y registra PUT /integrations/storage. Jamás exponer service_role, Cloudinary API secret ni credenciales de la cuadrilla.

Para verificar el dominio, un supervisor solicita POST /integrations/deploy/challenge desde Swagger o localhost, publica el token en public/.well-known/lumon-verification.txt y ejecuta POST /integrations/deploy/verify. No se debe ejecutar clearance/check hasta completar las condiciones del CP3 desde la app de producción.

El archivo hackathon.json aún requiere los datos reales: TEAM_CODE, nombre del equipo, los tres nombres/códigos UTEC y el proveedor de storage. No inventar valores.
