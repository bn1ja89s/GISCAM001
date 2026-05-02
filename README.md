# app_PWA

PWA modular para exploracion de campo con captura geoespacial de collars, gestion de proyectos, operacion offline con IndexedDB y sincronizacion desacoplada para una futura integracion remota.

## Alcance funcional

- Gestion local de PROYECTOS.
- Seleccion obligatoria de proyecto activo.
- Captura de puntos COLLAR sobre mapa ArcGIS Online.
- Almacenamiento local con IndexedDB.
- Cola de sincronizacion local en `SYNC_QUEUE`.
- Indicadores online/offline y estados de sincronizacion.
- Instalacion como PWA con `manifest` y `service worker`.

## Reglas de negocio aplicadas

- No se puede registrar un collar sin proyecto activo.
- Todo collar queda vinculado por `proyecto_uuid`.
- La geometria se toma desde el mapa.
- Los registros se guardan localmente aunque no exista backend remoto.
- La sincronizacion remota queda lista por arquitectura, pero desactivada por defecto hasta configurar endpoints reales.

## Configuracion principal

La configuracion central esta en `js/config.js`.

Aspectos clave:

- `maps[0].id`: web map base publicado en ArcGIS Online.
- `sync.enabled`: activa o desactiva sincronizacion remota.
- `sync.provider`: admite `none`, `backend` o `arcgis-feature-service`.
- `sync.backend.endpoints`: placeholders para un backend con login.
- `sync.arcgis.layers`: URLs de capas o tablas ArcGIS para pruebas directas con `applyEdits`.
- `auth`: placeholders para login cuando montemos el backend.

## Estructura

```text
app_PWA/
  index.html
  manifest.webmanifest
  sw.js
  assets/
    icons/
    images/
  css/
    reset.css
    variables.css
    layout.css
    components.css
    app.css
  js/
    app.js
    router.js
    config.js
    core/
    db/
    services/
    ui/
    pages/
    components/
```

## Ejecucion local en VS Code

Usa un servidor local. No abras `index.html` con doble clic.

```powershell
Set-Location "c:\Users\BENJA\Documents\PROYECTOS\PROGRAMAS\ARCGIS PROYECTO\app_PWA"
py -m http.server 8080
```

Luego abre:

```text
http://localhost:8080
```

## Flujo recomendado de uso

1. Ir a `Proyectos`.
2. Crear un proyecto y dejarlo activo.
3. Ir a `Mapa`.
4. Activar `Capturar collar` y tocar el mapa.
5. El punto queda guardado localmente como borrador aunque cambies de vista o recargues la app.
6. Ir a `Collars` y guardar el formulario.
7. Revisar `Sync` para ver pendientes y errores.

## Respaldo y cambio de telefono

Actualmente la app guarda datos en `IndexedDB`, lo cual protege el trabajo en el mismo dispositivo, pero no replica automaticamente los datos a otro telefono o navegador.

Para no perder datos cuando cambies de telefono, reinstales la app o uses otro navegador:

1. Ve al modulo `Sync`.
2. Usa `Exportar respaldo`.
3. Guarda el archivo JSON en un lugar seguro.
4. En el nuevo dispositivo abre la app.
5. Ve al modulo `Sync`.
6. Usa `Importar respaldo` y selecciona el JSON exportado.

## Que necesitas para continuidad real entre dispositivos

Si quieres cambiar de telefono o de instalacion y que los datos aparezcan solos sin importar respaldos manuales, necesitas una persistencia remota real. Las opciones correctas son:

1. Un `Feature Service` editable en ArcGIS Online o ArcGIS Enterprise.
2. O un backend propio que reciba y devuelva proyectos, collars y cola de sincronizacion.
3. Autenticacion de usuario, normalmente con OAuth2, para que cada tecnico pueda sincronizar sus datos.

Sin eso, `IndexedDB` solo conserva datos localmente en ese navegador y en ese dispositivo.

## Integracion remota futura

El modulo `js/services/syncService.js` ya esta desacoplado para que luego puedas reemplazar los placeholders por:

- ArcGIS REST API
- Feature Services propios
- Un backend intermedio en Node, Python o .NET

Ahora la PWA ya puede prepararse en dos rutas:

1. `sync.provider = "arcgis-feature-service"` para pruebas directas si compartes URLs de capas editables.
2. `sync.provider = "backend"` para el enfoque final con login y persistencia multi-dispositivo.

La estructura recomendada para produccion y para las capas `PROYECTO`, `COLLAR`, `SURVEY`, `ASSAY` y `LABORATORIO` esta en `docs/REMOTE_ARCHITECTURE.md`.