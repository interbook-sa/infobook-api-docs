# Análisis de la API externa

Fecha de lectura del código: noviembre de 2026. Fuente: el repo `Interbook_Dev`, proyectos `Interbook.Infobook.WebApi.Externa` y `Interbook.Infobook.WebApi.Common` (`jwtAuth`, `GenerateToken`, `DataBase.EjecutarDataTable`). No se modificó la API.

La base de producción usada por los clientes es `https://apiexterna.interbook.com.ar`. Está referenciada en el código (por ejemplo el redirect de Shopify) y no hay una segunda URL de pruebas en ese repositorio.

## Criterio

Se documenta la API genérica con la que un sistema externo opera su cuenta: autenticarse y trabajar pedidos, tracking, costos, stock, etiquetas, documentos e ingresos.

Queda afuera todo lo que es un canal ya construido (la tienda o el transporte llama a Interbook), un producto interno (TMS, colectores, moderación, tableros) o una herramienta peligrosa sin contrato de integración.

`ApiExplorerSettings(IgnoreApi = true)` no se usó como filtro. `track_orders` y `getDeliveryDate` lo tienen y igual son parte del contrato. `POST /api/auth/token/` también lo tiene, y se excluye porque emite un JWT sin contraseña.

## Autenticación real

`POST /api/auth/login/` recibe `username`, `password` y `remeberme` (con esa grafía). Compara la contraseña con el hash del usuario. Si cierra, devuelve un JWT como string JSON. Dura 1440 minutos, o 43200 si `remeberme` es true. Si las credenciales fallan, responde HTTP 200 con `Wrong username/password.`. Un body vacío termina en HTTP 500 porque lee `remeberme` sin comprobar el objeto.

Las operaciones de `wmsController` pasan por `jwtAuth`. Pide `Authorization: Bearer <token>`. Si falta, no verifica o está vencido, responde HTTP 401 sin cuerpo. Los métodos `[AllowAnonymous]` saltean ese filtro y después resuelven el usuario ellos mismos: `GetShippingCost`, `GetStock` y `Getlabel`.

El login viejo `POST /api/interfaces/pedidos/Login` no es este contrato. Devuelve un token de memoria de 30 minutos, con el header `tokken`, no un JWT.

## Operaciones documentadas

Todas son POST. El cuerpo es JSON.

| Operación | Ruta | Auth | Qué hace el código |
|---|---|---|---|
| Login | `/api/auth/login/` | No | Emite el JWT o el texto de credenciales inválidas. |
| Alta sincrónica | `/api/wms/expressOrders` | Bearer | Valida cada `Shipment`, lo registra y espera la generación. Puede devolver `id`, `uid`, `trackingCode` y `sla`. |
| Alta asincrónica | `/api/wms/orders` | Bearer | Misma validación. No devuelve `id` ni `uid`. Si no hay tracking, `message` es el texto en español de reintento, no el nombre del enum. Dispara la generación después de responder. |
| Anulación | `/api/wms/cancelOrder` | Bearer | Manda `deliveryNumber` y `deliveryNumberOr`. `isModelValid()` existe y no se llama. `resultado = 1` es el default del objeto, no un éxito confirmado. |
| Consulta de pedidos | `/api/wms/GetOrders` | Bearer | Filtra por `deliveryNumber`, fechas y `page`. El JSON de cada pedido sale de una columna del procesamiento. El mapeo C# está comentado y no corre. |
| Tracking | `/api/wms/track_orders` | Bearer | Lee `trackingCode`. Renombra columnas solo si existen. Sin filas, código ajeno o error de consulta: `[]`. Body nulo: HTTP 500. |
| Tracking anterior | `/api/wms/tracking` y `/api/wms/track` | Bearer | Misma consulta, campo `codigoTracking`, respuesta `{ resultado, Error }` y nombres de columna originales. |
| Costo de envío | `/api/wms/GetShippingCost` | Opcional | No valida campos. `pais` default `AR`. `serviceCode` está en el modelo y no se envía al procesamiento. El detalle de la tarifa no está en el C#. |
| Fecha de entrega | `/api/wms/getDeliveryDate` | Bearer | Exige `cp4`, `grams`, `cm3` y `quantity`, con los rangos que están en el método. El éxito es el escalar del procesamiento, sin un objeto definido en la API. |
| Stock | `/api/wms/GetStock/{k?}` | Opcional | Sin usuario resoluble responde `success: true` y `response: []`, no 401. El esquema de cada artículo no está en el C#. La respuesta no copia los filtros. |
| Etiqueta | `/api/wms/Getlabel/{q?}/{t?}` | Token o segmento `q` | Array de `deliveryNumber`. Sin usuario y sin `q`: `status = Unauthorized User` en HTTP 200. El primer pedido inexistente corta el lote. `links` y `base64` no se completan en este método. |
| Documentos | `/api/wms/Documents` | Bearer | Alta de documentos, no consulta. Body nulo: la acción devuelve null (HTTP 204). |
| Comprobantes | `/api/wms/ConsignmentDetails` | Bearer | Por `deliveryNumber` o `id`. Arma cabecera y `details` con los campos asignados en el método. Sin filas: `[]`. |
| Ingresos | `/api/wms/getIngresos` | Bearer | Filtros `id`, `code`, `dateFrom`, `dateTo`. El sobre es `{ resultado, error }`. Las demás columnas las define el procesamiento. La cabecera tiene que traer `id` para poder colgar `detalle`. |

La validación del alta exige `serviceCode` y `deliveryNumber`. Si viene un domicilio, exige `name`, `street`, `city` y `state`. No exige destino, detalle, bultos, transporte ni código postal: esas reglas están comentadas en `Shipment.isModelValid()`. `apartment` se copia a `appartment` antes de guardar.

Los errores de negocio del alta viajan en `messages.code` (número) y `messages.message`, con HTTP 200. La tabla está en `public/content/shared/error-codes.json` y separa lo que el C# emite, lo que puede devolver el procesamiento y lo que el enum define pero la validación actual no usa.

## Qué no se publica y por qué

| Grupo | Motivo |
|---|---|
| Webhooks de tiendas y transportes | Los llama el canal, con su propio cuerpo. No son la forma de integrar un sistema nuevo. |
| TMS, mobile, balanza, logger, utils, test | Productos o herramientas internas. |
| Moderación de domicilios y sitio institucional | Pantallas o consultas sin el JWT de la cuenta integradora. |
| Power BI, Looker, WhatsApp, reCAPTCHA | Reporting o servicios de plataforma. |
| `EjecutarSP` | No es un contrato: ejecuta el procedimiento que le pasen. |
| `api/auth/token/` | Emite un JWT sin verificar la contraseña. |
| Hojas de ruta `roadMap` y `cancelRoadMap` | Operación interna. El C# puede responder `NO_ERROR` sin leer el error del procedimiento. |
| `pedidos` / `binit` / inventario de interfaces | Contratos anteriores o de un cliente. El alta genérica reemplaza ese camino. |

## Huecos que el código no cierra

Quedan explícitos en cada página, no como datos inventados:

- Esquema de `response` en costo de envío, consulta de pedidos y stock.
- Catálogo de textos de `event` en el tracking.
- Significado numérico de `resultado` en la anulación.
- Valores de `serviceCode`, `type` de notas y contactos, `paymentType`, `typeShippingCost` y la unidad de `m3`.
- Si existe un ambiente de pruebas distinto de producción.
