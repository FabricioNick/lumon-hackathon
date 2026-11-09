# Integración CP4 y CP5 — integrante 3

Implementado en `2-featrefiners-media-contingency`. Contrato consultado: [Swagger público](https://lumon-api.vercel.app/docs), esquema `/openapi.json`, descargado el 9 de noviembre de 2026. Copia de referencia en `cp45-openapi.json`; tipos en `src/features/cp45/contracts.ts`.

## Conectar con CP1

El repositorio inicial solo contenía la plantilla Vite. No había cliente HTTP, autenticación, router de la consola ni SSE. No se implementó un segundo sistema de sesión o stream. La entrada actual muestra que falta integrar la sesión; no fabrica acceso ni datos.

`Cp45Runtime`, en `src/features/cp45/context.ts`, es el contrato con el integrante 1:

```tsx
const runtime: Cp45Runtime = {
  request: authenticatedFetch,
  userId: session.user.id,
  sessionKey: sessionScope,
  permissions: me.permissions,
  storage: storageConfigFromEnv(),
  subscribe: floorEventBus.subscribe,
};
// Con el router existente:
<Cp45Provider runtime={runtime}>
  <ExistingRouter />
  <ContingencyModal />
</Cp45Provider>;
// Agregar ...createCp45Routes() a las rutas de ExistingRouter.
// En un host sin router, <App runtime={runtime} /> monta el módulo completo.
```

Los nombres `session`, `me`, `authenticatedFetch`, `floorEventBus` y `ExistingRouter` son adaptadores ilustrativos; no suponen archivos de CP1 que aún no existen. Imports concretos:

- `Cp45Runtime` de `features/cp45/context`.
- `Cp45Provider` de `features/cp45/runtime`.
- `createCp45Routes` de `features/cp45/routeDefinitions`.
- `ContingencyModal` de `features/contingency/ContingencyModal`.
- `storageConfigFromEnv` de `features/media/storageConfig`.

Mantener `runtime`, `request` y `subscribe` estables mediante `useMemo`/`useCallback`. `sessionKey` debe ser un identificador opaco no secreto, compartido entre pestañas del mismo inicio de sesión y diferente tras logout/nuevo login. Nunca usar tokens como identificador del canal. Cambiar `userId`/`sessionKey` remonta las pantallas y limpia el estado anterior. El proveedor limpia la caché de versiones al abandonar la sesión.

`request(path, init)` recibe rutas relativas a `VITE_API_BASE_URL`, devuelve el `Response` original **incluso en errores HTTP**, conserva `AbortSignal` y añade `Authorization` y `X-Lumon-Build`. CP1 debe coordinar el refresh y repetir como máximo lo permitido por el contrato; este módulo no rota tokens. La cabecera de build debe corresponder al SHA inyectado durante el build, `dev` en local. No entregar una función que ya consuma el cuerpo ni que lance los 412 antes de devolver el `Response`.

`subscribe` entrega los eventos tipados de `FloorEvent` y devuelve una función de desuscripción. El stream único, su liderazgo entre pestañas, tickets, reconexión, deduplicación de IDs y logout por `session.revoked` pertenecen a CP1. Entregar los eventos también a pestañas que no sean líderes. `refiner.updated` incluye el expediente completo y su versión; `stream.reset` invalida lecturas y avisa a editores sin borrar el borrador. Las contingencias deben reproducirse al nuevo suscriptor si ya estaban activas antes del montaje del módulo; montar el modal al inicio de la sesión evita perder eventos.

El módulo no abre `EventSource` ni WebSocket. Su `BroadcastChannel` solo sincroniza contingencias entre pestañas de la misma sesión/usuario, incluidas las pestañas nuevas mediante un intercambio de estado. El bus de CP1 sigue siendo la fuente de eventos. Un ack solo se propaga tras la respuesta exitosa del servidor. Una revocación limpia las contingencias; CP1 realiza el cierre de sesión y navegación.

## Rutas y permisos

| Ruta                          | Permisos necesarios antes de montar |
| ----------------------------- | ----------------------------------- |
| `/refiners` y `/refiners/:id` | `refiners:read`                     |
| `/refiners/:id/edit`          | `refiners:read`, `refiners:write`   |
| `/refiners/:id/badge`         | Los anteriores y `media:upload`     |
| `/incidents`                  | `incidents:read`                    |
| `/incidents/new`              | `incidents:create`, `media:upload`  |

Las decisiones usan el array de permisos del servidor. Las rutas protegidas no montan el componente ni consultan sus endpoints si falta un permiso. En una consola existente, usar `createCp45Routes` y envolver el outlet con `Suspense`. El host autónomo ya incluye Suspense y un límite de errores de render.

## HTTP verificado

| Método | Ruta                          | Datos/cabeceras                                                        |
| ------ | ----------------------------- | ---------------------------------------------------------------------- |
| GET    | `/departments`                | Array de `Department`                                                  |
| GET    | `/refiners`                   | `page` desde 0, `size` 10/25/50, `q` hasta 60, `departmentId` positivo |
| GET    | `/refiners/{id}`              | `Refiner`; conservar `ETag` literal                                    |
| PATCH  | `/refiners/{id}`              | Campos de `RefinerPatch`, `If-Match` exacto, nunca comodín             |
| POST   | `/media/tickets`              | `purpose`, `contentType`, `bytes`, `width`, `height`, `sha256`         |
| POST   | `/media/tickets/{id}/confirm` | `{ url }`; mediaId solo tras 200/201                                   |
| GET    | `/incidents`                  | `page`, `size`; el contrato no define filtros                          |
| POST   | `/incidents`                  | `title`, `description`, `severity`, `fileId`, `mediaIds`               |
| POST   | `/contingency/{id}/ack`       | Sin cuerpo; éxito 204                                                  |

Los tipos corresponden al esquema descargado. El servidor debe exponer `ETag` por CORS. Si no se recibe, se bloquea la escritura. Un 412 obtiene el expediente vigente mediante GET y abre resolución explícita; no repite PATCH silenciosamente. El cache de versiones conserva el expediente más nuevo por función request y no asocia un ETag de una respuesta vieja a datos nuevos. El cliente compartido debe respetar `Retry-After` de lecturas ante 429/503; las acciones de subida, creación y ack además impiden reintentar antes del plazo recibido. No hay reintentos automáticos de operaciones que puedan guardar datos.

## Storage

No hay configuración de un proveedor en la rama inicial. La función `storageConfigFromEnv` adapta `.env.example`; también se puede pasar `runtime.storage` directamente desde la integración existente. Solo configurar **el proveedor registrado por el equipo**, sin registrar otro desde este módulo.

- Supabase: `projectUrl` y `publicKey` publicable o JWT `anon`. Se rechazan `sb_secret_` y JWT con un rol distinto a `anon`. Se usa el bucket/ruta del ticket y POST nativo, `x-upsert: false`; no se permite sobrescritura. Para claves `sb_publishable_` se envía `apikey`, sin tratarlas como JWT.
- Cloudinary: `cloudName`, `uploadPreset` unsigned y `uploadUrl` HTTPS. Se envía el `public_id` del ticket; se comprueba `expectedPublicId`, formato y URL HTTPS devueltos. No se usan firmas ni secrets.
- Una cancelación o subida incompleta obtiene un ticket nuevo al reintentar, evitando sobrescribir una ruta posiblemente creada. Si el storage respondió y falla solo la confirmación, se conserva ticket/URL y se reintenta esa confirmación idempotente. Un `TICKET_EXPIRED` o `MEDIA_VERIFICATION_FAILED` descarta el destino y permite empezar con otro ticket. Las imágenes confirmadas se mantienen en el formulario si falla la creación del reporte.

Configurar en el despliegue los orígenes de storage y `blob:` para vistas previas dentro de la CSP de CP1/CP6. Verificar el storage mediante el flujo de integración ya asignado a CP1. No hay subida alternativa a `/media/upload`.

## Ejecutar y validar

```bash
npm ci
npm run dev
npm run build
npm run lint
node --import ./tests/loader.mjs tests/all.mjs
# Con Vite activo en localhost y Chrome instalado:
node tests/browser-check.mjs
```

Las dependencias npm existentes no cambiaron. Vite ahora activa el plugin Tailwind ya declarado; `tsconfig.app.json` habilita strict, que la plantilla no tenía. `App.tsx` acepta el runtime y se retiraron los estilos de ejemplo de `index.css`. Son los únicos ajustes del host; no hay cambios en `src/app`, `src/core`, autenticación, archivos CP2 ni configuración de despliegue.

Las pruebas con Chrome usan exclusivamente `tests/browser.html`/`browser.jsx` y datos controlados, fuera del bundle de producción. No reemplazan pruebas contra una sesión real. El script usa un perfil temporal y lo elimina al salir. En un entorno que exija sandbox del navegador, ajustar sus flags a la política local.

## Dependencias pendientes

Conectar CP1 (runtime autenticado, permisos y bus), abrir clearance mediante la revisión oficial y disponer del storage verificado. Sin eso no puede declararse una subida ni un ack reales exitosos. No se crearon cuentas ni se intentó eludir clearance. Probar con dos usuarios, dos pestañas y modo caos tras integrar. El entorno de esta ejecución dispone de Node 22.23.2; repetir validación con Node 24 LTS, exigido por el curso.

Para integrar con main: revisar los commits de esta rama; conservar el router/auth de CP1 y añadir los adaptadores anteriores; resolver únicamente los puntos compartidos de App/Vite/estilos/strict; ejecutar las validaciones y pruebas reales; el equipo decide y realiza el merge a main y despliegue. Esta ejecución no cambia ni fusiona main.
