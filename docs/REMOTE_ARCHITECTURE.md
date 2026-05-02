# Arquitectura Remota Recomendada

Este documento define la estructura recomendada para llevar la PWA a sincronizacion real entre dispositivos y posterior publicacion en ArcGIS Online.

## Objetivo

Resolver dos necesidades distintas:

1. Persistencia multi-dispositivo con login.
2. Publicacion final de datos operativos en ArcGIS Online.

## Arquitectura recomendada

La opcion mas solida es separar capas:

1. `PWA` en el dispositivo.
2. `Backend con login` para usuarios, control de sesion, auditoria y sincronizacion.
3. `ArcGIS Online Feature Services` como destino geoespacial institucional.

## Flujo recomendado

1. El usuario inicia sesion en la PWA.
2. La PWA sigue trabajando offline con IndexedDB.
3. Cuando hay internet, la PWA envia proyectos y collars al backend autenticado.
4. El backend valida propietario, permisos y consistencia.
5. El backend publica o replica hacia ArcGIS Online usando credenciales seguras del sistema.
6. Otros dispositivos del mismo usuario pueden descargar sus datos sincronizados desde el backend.

## Por que no depender solo de ArcGIS Online publico editable

Publicar capas editables al publico sirve para pruebas, pero no es suficiente como arquitectura final porque:

1. No resuelve login por usuario de la app.
2. No ofrece control de negocio fino sobre quien ve o modifica que datos.
3. Expone mas de la cuenta las capas si se dejan publicas y editables.
4. Complica trazabilidad, auditoria y control operativo.

## Estructura remota recomendada en ArcGIS

Idealmente usa un Feature Service con estas capas o tablas:

1. `PROYECTO`
2. `COLLAR`
3. `SURVEY`
4. `ASSAY`
5. `LABORATORIO`

## Campos recomendados por capa

### PROYECTO

- `GlobalID` gestionado por ArcGIS
- `uuid` texto, unico desde la app
- `cod_exploracion`
- `concesion_area`
- `cod_catastral`
- `localizacion`
- `tecnico`
- `sr_proyecto`
- `estado_sync`
- `activo`
- `fecha_creacion`
- `fecha_modificacion`
- `owner_user_id`
- `device_id`

Recomendacion:
Puede ser tabla no espacial si el proyecto no necesita geometria propia.

### COLLAR

- `GlobalID` gestionado por ArcGIS
- `uuid`
- `proyecto_uuid`
- `proyecto_global_id_remoto`
- `hole_id`
- `este`
- `norte`
- `elevacion`
- `prof_total`
- `tipo`
- `localizacion`
- `fecha`
- `latitude`
- `longitude`
- `estado_sync`
- `fecha_creacion`
- `fecha_modificacion`
- `owner_user_id`
- `device_id`

Recomendacion:
Debe ser capa espacial de puntos.

### SURVEY

- `GlobalID`
- `uuid`
- `collar_uuid`
- `collar_global_id_remoto`
- `profundidad`
- `azimuth`
- `dip`
- `fecha`
- `estado_sync`
- `fecha_creacion`
- `fecha_modificacion`
- `owner_user_id`
- `device_id`

Recomendacion:
Tabla relacionada con `COLLAR`.

### ASSAY

- `GlobalID`
- `uuid`
- `collar_uuid`
- `from_depth`
- `to_depth`
- `sample_id`
- `resultado`
- `unidad`
- `fecha`
- `estado_sync`
- `fecha_creacion`
- `fecha_modificacion`
- `owner_user_id`
- `device_id`

Recomendacion:
Tabla relacionada con `COLLAR`.

### LABORATORIO

- `GlobalID`
- `uuid`
- `assay_uuid`
- `sample_id`
- `laboratorio`
- `metodo`
- `resultado`
- `qa_qc`
- `fecha`
- `estado_sync`
- `fecha_creacion`
- `fecha_modificacion`
- `owner_user_id`
- `device_id`

Recomendacion:
Tabla relacionada con `ASSAY`.

## Backend con login

El backend deberia cubrir al menos:

1. `POST /auth/login`
2. `POST /auth/refresh`
3. `POST /sync/projects`
4. `POST /sync/collars`
5. `GET /sync/bootstrap`
6. `GET /me`

## Responsabilidad del backend

1. Validar identidad del usuario.
2. Asociar datos con `owner_user_id`.
3. Resolver conflictos entre dispositivos.
4. Validar que no se creen collars sin proyecto valido.
5. Escribir en ArcGIS Online usando credenciales seguras del sistema.
6. Devolver datos al iniciar sesion en otro dispositivo.

## Estado actual de la PWA

La PWA ya puede trabajar en dos modos preparados en `js/config.js`:

1. `backend`
2. `arcgis-feature-service`

Para pruebas rapidas puedes usar `arcgis-feature-service` si compartes las URLs de las capas editables.
Para produccion se recomienda `backend` con login.