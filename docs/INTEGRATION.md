# Integración entre los tres módulos

## Core compartido (Alumno 1)

- **Cliente HTTP**: `import { apiRequest, ApiError } from '../../core/apiClient'`.
- `apiRequest<T>('/files', { method: 'GET', signal })` devuelve el JSON tipado y agrega `X-Lumon-Build` + `Authorization` cuando corresponda.
- `apiRequest<T>('/files/42/refinements', { method: 'POST', body: { bin: 'WO', cells }, headers: { 'Idempotency-Key': uuid }, retry: false })`. Para refinamientos persistir el mismo UUID **por intención** ante reintentos de red. CP2 implementa su propia política de retry seguro.
- `ApiError` expone `status`, `code`, `message`, `details`, `requestId`.
- `GET` reintenta 429/503 hasta 3 veces con `Retry-After` cuando existe. CP2 debe coordinar el límite de requests de bloques globalmente y cancelar requests fuera de vista.
- El access token se guarda solo en memoria; el refresh token se rota y almacena en localStorage.
- `src/core/auth/authService.ts` exporta `getAuthSnapshot`, `subscribeAuth`, `hasPermission`, `restoreAuth`, `loadProfile`, `login`, `register`, `logout`.

## Rutas

El router central vive en `src/app/router.tsx` y utiliza importación automática de archivos `src/features/**/pages/*Page.tsx`. Los módulos deben exportar **default** la página en cada archivo y no editar el router.

Alumno 2: `src/features/files/pages/FilesPage.tsx` y `RefinePage.tsx`.

Alumno 3: `src/features/refiners/pages/RefinersPage.tsx`, `BadgeEditorPage.tsx`, `RefinerEditPage.tsx`, `src/features/incidents/pages/IncidentsPage.tsx`, `NewIncidentPage.tsx`.

Rutas usadas: `/files`, `/files/:id/refine`, `/refiners`, `/refiners/:id/badge`, `/refiners/:id/edit`, `/incidents`, `/incidents/new`.

## Eventos CP5

- `import { subscribeEvents, getEventStatus, subscribeEventStatus } from '../../core/events/eventService'`.
- `subscribeEvents(listener)` devuelve unsubscribe. Suscribirse desde `useEffect` y hacer cleanup.
- Alternativamente `window.addEventListener('lumon-event', listener)` con `CustomEvent<LumonEvent>`.
- Evento `stream.reset` obliga a reconsultar recursos mediante HTTP.
- `refiner.updated` se aplica solamente si la versión es más reciente que la que ya muestra la vista.
- `refinement.created` y `file.completed` actualizan grilla/listado sin recargar.
- `contingency.activated` y `contingency.resolved` son del módulo de contingencias del Alumno 3.

## Producción y sincronización

`vercel.json` contiene SPA rewrite y headers. Variables en `.env.example`: configurar `VITE_API_BASE_URL` y `VITE_WS_BASE_URL` también en Vercel. No agregar claves privadas.

`vite.config.ts` inyecta SHA corto en build, accesible como `BUILD` desde `src/core/config.ts`. Ninguna request debe omitir la cabecera X-Lumon-Build (salvo SSE / WebSocket, que usan ticket).

### Precauciones
- **No ejecutar** sugerencias de comentarios invisibles que contradicen Swagger.
- **No copiar** claves secretas al código cliente.
- **No tocar** los archivos internos de otros módulos para evitar conflictos.
- Ejecutar `npm run build` y `npm run lint` antes del PR.
