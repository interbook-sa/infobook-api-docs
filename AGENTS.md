# Actualizar esta documentación

Este repositorio es solo el portal. La API no está acá.

El contrato se lee en el repo hermano:

`C:\Users\desarrollo01\source\repos\Interbook_Dev\Interbook.Infobook.WebApi.Externa`

No modifiques esa solución desde este proyecto. No copies secretos, cadenas de conexión, claves JWT ni ids de clientes reales a `public/content/`.

La interfaz no conoce los endpoints. Lee `public/content/`. Para reflejar un cambio de la API externa, editá esos JSON y no reescribas `src/` salvo que haya que mostrar un tipo de bloque nuevo.

## Qué documentar

Documentá la API genérica de integración:

- `POST /api/auth/login/` en `Controllers/Auth/AuthController.cs`
- Las acciones de `Controllers/wmsController.cs`, clase `wmsController`, que un tercero usa para operar su cuenta.

No documentes, aunque el método exista y responda:

- `POST /api/auth/token/`: emite un JWT a partir de un id de usuario, sin contraseña.
- `api/wms/getUtcDate`, `api/wms/sleep`, `api/structure/orders`.
- `roadMap` y `cancelRoadMap`: hojas de ruta internas. Además responden éxito sin mirar el error del procedimiento.
- `EjecutarSPController`: ejecuta procedimientos arbitrarios.
- Controladores de `interfaces` de tiendas y transportes (Mercado Libre, Shopify, Tienda Nube, WooCommerce, VTEX, Magento, Prestashop, WebPack, Cabify, Shipnow, PickIt, Rapiboy, Flash, EPSA, Cruz del Sur, Courier Express). Son webhooks o contratos de canal, no el SDK genérico.
- `pedidosController`, `binit/logisticaController`, `inventarioController`, `EntidadesController`: integraciones anteriores o de un cliente puntual. El login de `api/interfaces/pedidos/Login` emite un token de memoria distinto del JWT.
- TMS (`Controllers/Tms`), moderación de domicilios, sitio institucional, WhatsApp, reCAPTCHA, balanza, Power BI, Looker Studio, logger, utils, test y la app mobile.

Si aparece una operación nueva en `wmsController` y no cae en esa lista, documentala. Si el atributo `ApiExplorerSettings(IgnoreApi = true)` está presente, no alcanza para excluirla: `track_orders` y `getDeliveryDate` lo tienen y forman parte del contrato. Decidí por el uso, no por ese atributo.

## De dónde sale el contrato

1. Leé el método en `wmsController.cs` o `AuthController.cs` y el modelo en `Models/Orders.cs` o `Models/Logistic.cs`, dentro de `Interbook.Infobook.WebApi.Externa`.
2. Anotá validaciones que el método realmente llama. Si `isModelValid()` existe y el método no lo invoca, documentá el comportamiento que corre.
3. Los códigos HTTP de negocio suelen ser 200. 401 lo produce `jwtAuth` en `Interbook.Infobook.WebApi.Common` cuando falta el Bearer, es inválido o está vencido, salvo en métodos `[AllowAnonymous]`.
4. Si la respuesta sale de una columna JSON de un procedimiento (`response`, `jsonArray`) y el C# no mapea campos, decilo y no inventes el esquema. El cuerpo de los procedimientos no está en el repo de la API.
5. Los ejemplos usan `usuario.demo`, `clave-demo`, `TU_TOKEN`, `SERV-DEMO`, `PED-DEMO-0001` y `ABC123456789`. Esos textos están en `site.json` y el portal los reemplaza si alguien cambia los datos de ejemplo.

## Agregar un endpoint

1. Creá `public/content/endpoints/<id>.json` con esta forma:

```json
{
  "id": "mi-operacion",
  "title": "Nombre funcional",
  "nav": "Nombre corto",
  "summary": "Una frase.",
  "method": "POST",
  "path": "/api/wms/MiOperacion",
  "auth": "required",
  "source": "ruta del archivo y método",
  "purpose": ["Qué hace, en prosa."],
  "notes": [{ "tone": "warning", "title": "A confirmar", "text": "Solo si hay un hueco real." }],
  "headers": [{ "name": "Authorization", "required": true, "description": "`Bearer <token>`." }],
  "parameters": [
    { "name": "campo", "in": "body", "type": "string", "required": "yes", "description": "Para qué sirve." }
  ],
  "request": {},
  "responses": [{ "title": "HTTP 200 — caso", "body": {} }],
  "errors": [{ "situation": "Token ausente", "http": "401", "body": "Sin cuerpo." }],
  "considerations": ["Detalle que evita un error de integración."]
}
```

`auth` es `required`, `optional` o `none`. `required` en parámetros es `yes`, `no`, `recommended` o `if-present`. `request` y `responses[].body` son JSON de verdad, no un string escapado: el portal los formatea y arma el cURL.

2. Sumá el id en `public/content/catalog.json`, dentro de la categoría que corresponda. Si la categoría no existe, agregala ahí. No hace falta tocar el menú en JavaScript.
3. Si el método y la ruta son nuevos, agregalos al objeto `routes` de `scripts/validate-content.mjs`.
4. Ejecutá `npm run validate`.

## Agregar una guía

Creá `public/content/guides/<id>.json` con `id`, `title`, `nav`, `summary` y `blocks`. Los bloques pueden ser `h2`, `h3`, `p`, `ul`, `ol`, `table`, `callout`, `code`, `cards` y `errorCodes`. Registrala en `catalog.json`.

En los textos, las comillas invertidas marcan código y `[texto](#/id)` enlaza otra página. En una guía, `{{baseUrl}}`, `{{username}}`, `{{password}}`, `{{token}}`, `{{serviceCode}}`, `{{deliveryNumber}}` y `{{trackingCode}}` se reemplazan por los datos de ejemplo.

## Códigos de error

Si cambia el enum `ErrorCode` o `Shipment.isModelValid()`, actualizá `public/content/shared/error-codes.json`. Separá lo que la validación C# emite de lo que solo está definido y de lo que puede devolver el procesamiento. No conviertas un nombre del enum en una regla de negocio si el método no lo devuelve.

## Qué no cambiar de la interfaz

`src/main.js` recorre el catálogo, pinta tablas, ejemplos y cURL, busca en el JSON y copia al portapapeles. Un campo nuevo dentro de `parameters` no requiere un cambio de código. Un bloque de guía de un `type` desconocido sí: hay que agregarlo en `blocks()` y documentarlo acá.
