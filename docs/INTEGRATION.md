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
