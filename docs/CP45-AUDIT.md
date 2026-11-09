# Guía para defender el módulo sin IA

## React y formularios

Cada página es un componente React. Sus estados (`useState`) describen lo que se dibuja: resultados, búsqueda, formulario, recorte, progreso, error o conflicto. React vuelve a renderizar al cambiar el estado. Las listas usan claves estables: el ID del servidor o un UUID por selección de fotografía, por lo que dos archivos con el mismo nombre no comparten una subida accidentalmente.

Los campos son controlados: `value` viene del estado y `onChange` actualiza ese estado. El navegador valida `required`, longitudes y patrones antes del envío. El reporte verifica además 1–3 fotografías confirmadas y mantiene su estado si falla POST. Una referencia `lock` evita dos solicitudes simultáneas incluso antes del siguiente render; `busy` deshabilita los controles visibles.

## Efectos, cancelación y versiones

`useEffect` sincroniza recursos externos: HTTP, suscripción a eventos, canvas y canales de pestañas. Su limpieza cancela requests con `AbortController`, cierra bitmaps, revoca object URLs y elimina suscripciones. La búsqueda espera 350 ms antes de cambiar la URL; al cambiar los filtros, `useResource` aborta el request anterior e ignora cualquier resultado cuyo signal ya esté cancelado. Los filtros y paginación se leen de la URL y se envían al servidor; no se descarga el directorio entero para paginarlo localmente.

La caché de refinadores compara `version`, no tiempos locales. Un HTTP atrasado no sustituye un expediente más nuevo recibido por eventos. Tampoco se conserva un ETag viejo junto a un expediente nuevo: se devuelve sin ETag y se impide escribir con una versión que no se leyó. El cliente HTTP y la deduplicación del stream pertenecen a CP1.

## Imágenes

`createImageBitmap` decodifica JPEG/PNG/WebP. El recorte usa coordenadas del original, un cuadrado y zoom; el canvas visible se mueve con Pointer Events, flechas o sliders. El procesamiento vuelve a dibujar los píxeles en un canvas nuevo: el fotocheck sale a 512×512 y la incidencia mantiene su proporción dentro de 800–1600 en el lado mayor.

`toBlob(..., 'image/webp', calidad)` convierte a WebP. Se verifica el MIME porque algunos navegadores podrían devolver PNG. Se reduce la calidad y, para incidencias complejas, también la resolución sin bajar de 800. Si el tamaño final sigue siendo excesivo, se muestra error y no se pide ticket. El resultado se decodifica nuevamente para comprobar sus dimensiones reales.

Redibujar los píxeles deja atrás los metadatos del archivo original, pero la prueba en Chrome mostró que su codificador añade un perfil ICC. Por ello `stripWebPMetadata` también recorre RIFF, retira ICCP/EXIF/XMP, reconstruye el tamaño y limpia esos indicadores en VP8X, conservando los demás bits. `verifyWebP` comprueba de nuevo estructura, tamaño y ausencia de esos chunks. La implementación sigue la [especificación del contenedor WebP](https://developers.google.com/speed/webp/docs/riff_container).

`crypto.subtle.digest('SHA-256', await blob.arrayBuffer())` calcula el hash de los **bytes finales ya limpiados**, no de la imagen original. El mismo Blob se usa para la subida. El backend puede descargar el archivo y comparar el hash; el hash detecta diferencias de contenido, no es una contraseña ni cifra la imagen.

## Tickets y progreso

El ticket declara purpose, MIME, tamaño, dimensiones y SHA-256. El servidor entrega una ruta autorizada y un vencimiento. El navegador sube directamente a Supabase o Cloudinary con configuración pública; no expone credenciales privadas. Después confirma la URL con la API. Solo la respuesta de confirmación habilita el mediaId para PATCH o para crear un reporte.

XHR se usa porque `xhr.upload.onprogress` informa bytes enviados; no hay temporizadores fabricando porcentajes en la aplicación. Un 100% de transporte no significa que el servidor verificó la imagen: la UI distingue «subiendo», «verificando» y «confirmada». Se puede cancelar el XHR. Si falla la confirmación, se conserva la URL y se reintenta esa operación idempotente. Si la subida quedó incompleta o el ticket expiró, el reintento pide otro destino para evitar sobrescrituras. `Retry-After` impide insistir antes del plazo informado.

## Concurrencia

GET entrega un ETag, por ejemplo `"4"`. PATCH envía literalmente ese valor en `If-Match`. El backend solo escribe si todavía coincide; de lo contrario, responde 412. No se usa `*`.

Ante 412, se conserva el borrador, se lee el expediente actual y se muestran original, cambio local y servidor por cada campo editado. El usuario elige por campo. Los campos conservados del servidor se omiten del nuevo PATCH; las elecciones locales se mandan con el nuevo ETag. Si hay otro cambio concurrente, puede aparecer otro 412 y se vuelve a resolver. Si llega `refiner.updated` durante la edición, se muestra un aviso sin borrar lo escrito.

## Contingencias y accesibilidad

CP1 entrega eventos tipados por un único bus SSE. Este módulo no abre otra conexión. Una contingencia para el usuario actual abre un `dialog` nativo con nombre y descripción accesibles, vuelve inerte el fondo, atrapa Tab/Shift+Tab y bloquea Escape. Tras cerrar restaura el foco anterior.

Un `BroadcastChannel` acotado a sesión/usuario reparte activaciones y confirmaciones; una pestaña nueva pide el estado a las abiertas. Se guardan IDs resueltos para que una activación duplicada o atrasada no reabra el modal. Si falla el ack, sigue abierto y muestra el error. Solo un ack aceptado o `contingency.resolved` lo cierra. CP1 procesa la revocación de sesión.

## Seguridad y límites de la validación

React muestra textos externos como texto. No hay `dangerouslySetInnerHTML`. Los enlaces externos solo admiten esquemas HTTP/HTTPS, y usan `noopener noreferrer`. Los permisos se consultan antes de montar páginas que hacen solicitudes. Las claves del storage se limitan a publicables/anon.

Las pruebas de transporte usan respuestas controladas y las de Chrome usan una fixture separada del bundle. La conversión real, el foco, la resolución 412, la búsqueda y el intercambio entre pestañas sí se ejercitaron en Chrome. La validación completa con el backend requiere que CP1 entregue la sesión y que el equipo tenga clearance y storage verificado; esas condiciones no estaban disponibles en esta rama.
