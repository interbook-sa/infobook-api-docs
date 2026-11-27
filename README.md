# Interbook API Docs

Portal estático de la API externa de Interbook. El contenido vive en JSON y la interfaz solo lo muestra. No tiene backend ni base de datos.

Este proyecto está fuera de `Interbook_Dev` para versionarlo en su propio repositorio. La API que documenta sigue en `C:\Users\desarrollo01\source\repos\Interbook_Dev\Interbook.Infobook.WebApi.Externa`.

## Requisitos

- Node.js 20 o superior.

## Ejecutar en local

```powershell
cd C:\Users\desarrollo01\source\repos\Interbook.ApiDocs
npm install
npm run dev
```

Abrí `http://localhost:4173`.

## Comprobar el contenido

```powershell
npm run validate
```

El script confirma que cada página del catálogo existe, que el método y la ruta coinciden con el contrato verificado, que los ejemplos son JSON y que los cURL de Bash y PowerShell quedan en una sola línea, con `Content-Type` y con el header `Authorization` solo cuando la operación lo usa.

## Publicar

```powershell
npm run build
```

El resultado queda en `dist/`. Se puede servir con cualquier hosting de archivos estáticos. No hace falta IIS ni la API de Interbook para ver la documentación.

## Datos de ejemplo

El botón **Datos de ejemplo** cambia la URL base, el usuario, la contraseña ilustrativa y el token que aparecen en los cURL. Esos valores se guardan en el navegador y no se envían a Interbook.

En PowerShell usá la pestaña **PowerShell**: el comando llama a `curl.exe`, porque `curl` en Windows es un alias de `Invoke-WebRequest`.

## Administrar el contenido

Abrí `http://localhost:4173/admin.html`. El panel edita el mismo JSON que lee la documentación, pero **no escribe los archivos del sitio**.

Hay tres momentos distintos:

1. **Publicado.** Lo que ven los clientes. Son los archivos de `public/content/`.
2. **Borrador local.** Lo que se edita en el panel. Queda en el navegador (`localStorage`). Otro navegador no lo ve.
3. **Exportación.** Un paquete `interbook-docs.json`, o los archivos sueltos si el navegador permite elegir una carpeta. Publicar es reemplazar `public/content/` con esa copia y volver a desplegar el sitio.

La vista previa con borrador abre la documentación pública en este navegador y lo avisa con una franja. Sin `?preview=draft`, la página pública ignora el borrador.

Antes de importar, el panel valida el JSON y guarda una copia del borrador actual. Una operación que ya está en `src/content/contracts.js` no se puede borrar ni cambiar de método o ruta: ese archivo no es la API. Una operación nueva se agrega sin tocar `src/`.

## Dónde está cada cosa

| Ruta | Rol |
|---|---|
| `public/content/site.json` | URL base y valores ilustrativos |
| `public/content/catalog.json` | Orden del menú |
| `public/content/endpoints/*.json` | Un archivo por operación |
| `public/content/guides/*.json` | Guías |
| `public/content/shared/error-codes.json` | Códigos `messages.code` |
| `src/` | Documentación pública. No lleva el texto de los endpoints |
| `admin.html` y `src/admin/` | Panel. No lo mezcla con la vista pública |
| `src/content/contracts.js` | Método y ruta verificados contra la API |

Para agregar o corregir una operación, seguí `AGENTS.md`. El inventario de lo que se documentó y lo que quedó afuera está en `ANALISIS.md`.
