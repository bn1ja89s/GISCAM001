import { appConfig } from "../config.js";
import { createUuid, formatDateOnlyFromMillis, nowIso, toNullableNumber } from "../core/helpers.js";
import { getAssayByUuid, listAssays, saveAssay } from "../db/assayRepository.js";
import { getCollarByUuid, listCollars, saveCollar } from "../db/collarRepository.js";
import { getLaboratorioByUuid, listLaboratorios, saveLaboratorio } from "../db/laboratorioRepository.js";
import { getProjectByUuid, listProjects, saveProject } from "../db/proyectoRepository.js";
import { enqueueSync, listSyncQueue, removeSyncItem, updateSyncItem } from "../db/syncRepository.js";
import { getSurveyByUuid, listSurveys, saveSurvey } from "../db/surveyRepository.js";
import { showToast } from "../ui/notifications.js";
import {
  API,
  cerrarSesion,
  eliminarEnNube,
  estaLogueado,
  getCurrentUser,
  getToken,
  initAuth,
  login,
  obtenerDeIndexedDB,
  registrar,
  traducirErrorAutenticacion,
} from "./backendService.js";
import { syncLaboratorioSurvey123Submissions } from "./survey123LaboratorioService.js";

export {
  cerrarSesion,
  estaLogueado,
  getCurrentUser,
  getToken,
  initAuth,
  login,
  registrar,
  traducirErrorAutenticacion,
};

const BACKEND_TABLE_BY_ENTITY = {
  proyecto: "proyectos",
  collar: "collars",
  survey: "surveys",
  assay: "assays",
  laboratorio: "laboratorios",
};

const BACKEND_SYNC_TABLES = ["proyectos", "collars", "surveys", "assays", "laboratorios", "guardado"];

function normalizeBackendSyncItems(items) {
  return items
    .map((item) => ({
      ...item,
      id: item.id || item.uuid || item.id_local,
    }))
    .filter((item) => item.id);
}

const entityAdapters = {
  proyecto: {
    getByUuid: getProjectByUuid,
    save: saveProject,
  },
  collar: {
    getByUuid: getCollarByUuid,
    save: saveCollar,
  },
  survey: {
    getByUuid: getSurveyByUuid,
    save: saveSurvey,
  },
  assay: {
    getByUuid: getAssayByUuid,
    save: saveAssay,
  },
  laboratorio: {
    getByUuid: getLaboratorioByUuid,
    save: saveLaboratorio,
  },
};

function getBackendEndpoint(entityType) {
  const baseUrl = appConfig.sync.backend.baseUrl || API;
  const table = BACKEND_TABLE_BY_ENTITY[entityType];
  return table ? `${baseUrl.replace(/\/+$/, "")}/${table}` : "";
}

export function hasSyncBackend() {
  return Boolean(
    appConfig.sync.enabled &&
      appConfig.sync.provider === "backend" &&
      (appConfig.sync.backend.baseUrl || API) &&
      estaLogueado(),
  );
}

export function hasArcGISFeatureServiceSync() {
  return Boolean(
    appConfig.sync.enabled &&
      appConfig.sync.provider === "arcgis-feature-service" &&
      appConfig.sync.arcgis.layers.proyecto &&
      appConfig.sync.arcgis.layers.collar,
  );
}

function getArcGISLayerUrl(entityType) {
  return appConfig.sync.arcgis.layers[entityType] || "";
}

function getArcGISFieldMap(entityType) {
  return appConfig.sync.arcgis.fields[entityType] || {};
}

function hasArcGISLayer(entityType) {
  return Boolean(getArcGISLayerUrl(entityType));
}

function normalizeLayerUrl(layerUrl) {
  return String(layerUrl || "").replace(/\/+$/, "");
}

function buildProjectFeature(payload) {
  const fields = getArcGISFieldMap("proyecto");
  return {
    attributes: {
      [fields.codExploracion]: payload.cod_exploracion || "",
      [fields.concesionArea]: payload.concesion_area || "",
      [fields.codCatastral]: payload.cod_catastral || "",
      [fields.localizacion]: payload.localizacion || "",
      [fields.tecnico]: payload.tecnico || "",
      [fields.srProyecto]: payload.sr_proyecto || "",
    },
  };
}

function buildCollarFeature(payload) {
  const fields = getArcGISFieldMap("collar");
  const dateValue = payload.fecha ? new Date(`${payload.fecha}T00:00:00Z`).getTime() : null;
  const geometryElevation = toNullableNumber(payload.elevacion ?? payload.geometry?.z);
  return {
    geometry: payload.geometry
      ? {
          x: payload.longitude ?? payload.geometry.x,
          y: payload.latitude ?? payload.geometry.y,
          ...(geometryElevation != null ? { z: geometryElevation } : {}),
          spatialReference: { wkid: 4326 },
        }
      : null,
    attributes: {
      [fields.proyectoGuid]: payload.proyecto_global_id_remoto || payload.global_id_proyecto || "",
      [fields.holeId]: payload.hole_id || "",
      [fields.este]: payload.este ?? null,
      [fields.norte]: payload.norte ?? null,
      [fields.elevacion]: geometryElevation,
      [fields.profTotal]: payload.prof_total ?? null,
      [fields.tipo]: payload.tipo || "",
      [fields.localizacion]: payload.localizacion || "",
      [fields.fecha]: Number.isFinite(dateValue) ? dateValue : null,
      [fields.latitud]: payload.latitude ?? null,
      [fields.longitud]: payload.longitude ?? null,
      [fields.palabra]: null,
    },
  };
}

function buildSurveyFeature(payload) {
  const fields = getArcGISFieldMap("survey");
  return {
    attributes: {
      [fields.collarGuid]: payload.collar_global_id_remoto || "",
      [fields.holeId]: payload.hole_id || "",
      [fields.profundidad]: payload.profundidad ?? null,
      [fields.dip]: payload.dip ?? null,
      [fields.azimut]: payload.azimut ?? null,
      [fields.instrumento]: payload.instrumento || "",
    },
  };
}

function buildAssayFeature(payload) {
  const fields = getArcGISFieldMap("assay");
  return {
    attributes: {
      [fields.collarGuid]: payload.collar_global_id_remoto || "",
      [fields.holeId]: payload.hole_id || "",
      [fields.desde]: payload.desde ?? null,
      [fields.hasta]: payload.hasta ?? null,
      [fields.material]: payload.material || "",
      [fields.descripcion]: payload.descripcion || "",
      [fields.categoria]: payload.categoria ?? null,
      [fields.color]: payload.color || "",
      [fields.grano]: payload.grano || "",
      [fields.dureza]: payload.dureza || "",
      [fields.humedad]: payload.humedad || "",
      [fields.presenciaCaolinitica]: payload.presencia_caolinitica || "",
      [fields.contaminantes]: payload.contaminantes || "",
      [fields.muestraId]: payload.muestra_id || "",
    },
  };
}

function buildLaboratorioFeature(payload) {
  const fields = getArcGISFieldMap("laboratorio");
  const fechaRecepcion = payload.fecha_recepcion ? new Date(`${payload.fecha_recepcion}T00:00:00Z`).getTime() : null;
  return {
    attributes: {
      [fields.assayGuid]: payload.assay_global_id_remoto || "",
      [fields.muestraId]: payload.muestra_id || "",
      [fields.fechaRecepcion]: Number.isFinite(fechaRecepcion) ? fechaRecepcion : null,
      [fields.laboratorio]: payload.laboratorio || "",
      [fields.contraccion]: payload.contraccion ?? null,
      [fields.absorcion]: payload.absorcion ?? null,
      [fields.colorQ]: payload.color_q || "",
      [fields.observaciones]: payload.observaciones || "",
    },
  };
}

function buildFeatureByEntityType(entityType, payload) {
  if (entityType === "proyecto") {
    return buildProjectFeature(payload);
  }

  if (entityType === "collar") {
    return buildCollarFeature(payload);
  }

  if (entityType === "survey") {
    return buildSurveyFeature(payload);
  }

  if (entityType === "assay") {
    return buildAssayFeature(payload);
  }

  return buildLaboratorioFeature(payload);
}

function attachRemoteIdentifiers(feature, payload) {
  if (payload.remote_object_id) {
    feature.attributes.OBJECTID = Number(payload.remote_object_id);
  }

  if (payload.global_id_remoto) {
    feature.attributes.GlobalID = String(payload.global_id_remoto);
  }

  return feature;
}

async function pushToBackend(entityType, queueItem) {
  const endpoint = getBackendEndpoint(entityType);

  if (!hasSyncBackend() || !endpoint) {
    return {
      skipped: true,
      reason: "Backend de sincronizacion no configurado.",
    };
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), appConfig.sync.timeoutMs);

  try {
    if (queueItem.action === "delete") {
      const id = queueItem.payload?.uuid || queueItem.payload?.id || queueItem.entity_uuid;
      const result = await eliminarEnNube(BACKEND_TABLE_BY_ENTITY[entityType], id);
      return {
        skipped: false,
        remoteId: id,
        remoteObjectId: "",
        result,
      };
    }

    const id = queueItem.payload?.uuid || queueItem.payload?.id || queueItem.payload?.id_local || queueItem.entity_uuid;
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify({
        ...queueItem.payload,
        id,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Error HTTP ${response.status}`);
    }

    const result = await response.json().catch(() => ({}));
    return {
      skipped: false,
      remoteId: result.globalId || result.global_id || result.id || id || "",
      remoteObjectId: result.objectId || result.object_id || "",
      result,
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

async function pushToArcGISFeatureService(entityType, queueItem) {
  const layerUrl = normalizeLayerUrl(getArcGISLayerUrl(entityType));

  if (!hasArcGISFeatureServiceSync() || !layerUrl) {
    return {
      skipped: true,
      reason: "Capas ArcGIS Feature Service no configuradas.",
    };
  }

  if (queueItem.action === "delete") {
    const body = new URLSearchParams({ f: "json" });

    if (appConfig.sync.arcgis.token) {
      body.set("token", appConfig.sync.arcgis.token);
    }

    if (queueItem.payload.remote_object_id) {
      body.set("objectIds", String(queueItem.payload.remote_object_id));
    } else if (queueItem.payload.global_id_remoto) {
      body.set("where", `GlobalID='${queueItem.payload.global_id_remoto}'`);
    } else {
      return {
        skipped: true,
        reason: "No existe identificador remoto para eliminar el registro.",
      };
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), appConfig.sync.timeoutMs);

    try {
      const response = await fetch(`${layerUrl}/deleteFeatures`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`ArcGIS HTTP ${response.status}`);
      }

      const result = await response.json();
      const rowResult = result.deleteResults?.[0];

      if (!rowResult?.success) {
        throw new Error(rowResult?.error?.description || rowResult?.error?.message || "ArcGIS deleteFeatures fallo.");
      }

      return {
        skipped: false,
        remoteId: queueItem.payload.global_id_remoto || "",
        remoteObjectId: queueItem.payload.remote_object_id || "",
        result,
      };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  const feature = attachRemoteIdentifiers(buildFeatureByEntityType(entityType, queueItem.payload), queueItem.payload);
  const isUpdate = queueItem.action === "update" && (queueItem.payload.remote_object_id || queueItem.payload.global_id_remoto);
  const body = new URLSearchParams({ f: "json" });

  if (appConfig.sync.arcgis.token) {
    body.set("token", appConfig.sync.arcgis.token);
  }

  body.set("features", JSON.stringify([feature]));

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), appConfig.sync.timeoutMs);
  const operationUrl = isUpdate ? `${layerUrl}/updateFeatures` : `${layerUrl}/addFeatures`;

  try {
    const response = await fetch(operationUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`ArcGIS HTTP ${response.status}`);
    }

    const result = await response.json();
    const rowResult = result.addResults?.[0] || result.updateResults?.[0] || result[0];

    if (!rowResult?.success) {
      throw new Error(rowResult?.error?.description || rowResult?.error?.message || "ArcGIS add/updateFeatures fallo.");
    }

    return {
      skipped: false,
      remoteId: rowResult.globalId || queueItem.payload.global_id_remoto || "",
      remoteObjectId: rowResult.objectId || queueItem.payload.remote_object_id || "",
      result,
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function enqueueChange(entityType, entityUuid, action, payload) {
  if (action !== "delete") {
    const queue = await listSyncQueue();
    const pendingUpserts = queue.filter(
      (item) => item.entity_type === entityType && item.entity_uuid === entityUuid && item.status !== appConfig.status.synced && item.action !== "delete",
    );

    if (pendingUpserts.length) {
      const [currentItem, ...duplicates] = pendingUpserts;

      if (duplicates.length) {
        await Promise.all(duplicates.map((item) => removeSyncItem(item.id)));
      }

      return updateSyncItem({
        ...currentItem,
        action: currentItem.action === "create" ? "create" : action,
        payload,
        status: appConfig.status.pending,
        last_error: "",
      });
    }
  }

  return enqueueSync({
    entity_type: entityType,
    entity_uuid: entityUuid,
    action,
    payload,
  });
}

async function hydrateQueuePayload(entityType, record) {
  if (!record) {
    return null;
  }

  if (entityType === "collar") {
    const project = record.proyecto_uuid ? await getProjectByUuid(record.proyecto_uuid) : null;
    return {
      ...record,
      proyecto_global_id_remoto: record.proyecto_global_id_remoto || project?.global_id_remoto || "",
    };
  }

  if (entityType === "survey") {
    const collar = record.collar_uuid ? await getCollarByUuid(record.collar_uuid) : null;
    return {
      ...record,
      collar_global_id_remoto: record.collar_global_id_remoto || collar?.global_id_remoto || "",
      hole_id: record.hole_id || collar?.hole_id || "",
    };
  }

  if (entityType === "assay") {
    const collar = record.collar_uuid ? await getCollarByUuid(record.collar_uuid) : null;
    return {
      ...record,
      collar_global_id_remoto: record.collar_global_id_remoto || collar?.global_id_remoto || "",
      hole_id: record.hole_id || collar?.hole_id || "",
    };
  }

  if (entityType === "laboratorio") {
    const assay = record.assay_uuid ? await getAssayByUuid(record.assay_uuid) : null;
    return {
      ...record,
      assay_global_id_remoto: record.assay_global_id_remoto || assay?.global_id_remoto || "",
      muestra_id: record.muestra_id || assay?.muestra_id || "",
    };
  }

  return record;
}

async function propagateRemoteReferences(entityType, record) {
  if (!record) {
    return;
  }

  if (entityType === "proyecto") {
    const projectRemoteId = record.global_id_remoto || "";
    const collars = await listCollars();
    const updates = collars
      .filter((collar) => collar.proyecto_uuid === record.uuid && collar.proyecto_global_id_remoto !== projectRemoteId)
      .map((collar) => saveCollar({
        ...collar,
        proyecto_global_id_remoto: projectRemoteId,
        fecha_modificacion: nowIso(),
      }));

    await Promise.all(updates);
    return;
  }

  if (entityType === "collar") {
    const collarRemoteId = record.global_id_remoto || "";
    const holeId = record.hole_id || "";
    const [surveys, assays] = await Promise.all([listSurveys(), listAssays()]);
    const updates = [
      ...surveys
        .filter((survey) => survey.collar_uuid === record.uuid && (survey.collar_global_id_remoto !== collarRemoteId || survey.hole_id !== holeId))
        .map((survey) => saveSurvey({
          ...survey,
          collar_global_id_remoto: collarRemoteId,
          hole_id: holeId || survey.hole_id || "",
          fecha_modificacion: nowIso(),
        })),
      ...assays
        .filter((assay) => assay.collar_uuid === record.uuid && (assay.collar_global_id_remoto !== collarRemoteId || assay.hole_id !== holeId))
        .map((assay) => saveAssay({
          ...assay,
          collar_global_id_remoto: collarRemoteId,
          hole_id: holeId || assay.hole_id || "",
          fecha_modificacion: nowIso(),
        })),
    ];

    await Promise.all(updates);
    return;
  }

  if (entityType === "assay") {
    const assayRemoteId = record.global_id_remoto || "";
    const sampleId = record.muestra_id || "";
    const laboratorios = await listLaboratorios();
    const updates = laboratorios
      .filter((laboratorio) => laboratorio.assay_uuid === record.uuid && (laboratorio.assay_global_id_remoto !== assayRemoteId || laboratorio.muestra_id !== sampleId))
      .map((laboratorio) => saveLaboratorio({
        ...laboratorio,
        assay_global_id_remoto: assayRemoteId,
        muestra_id: sampleId || laboratorio.muestra_id || "",
        fecha_modificacion: nowIso(),
      }));

    await Promise.all(updates);
  }
}

async function ensureParentRemoteReference(entityType, record) {
  if (!record) {
    return { record, error: "" };
  }

  if (entityType === "collar") {
    const project = record.proyecto_uuid ? await getProjectByUuid(record.proyecto_uuid) : null;
    const projectRemoteId = project?.global_id_remoto || record.proyecto_global_id_remoto || "";

    if (!projectRemoteId) {
      return {
        record,
        error: "El proyecto vinculado aun no tiene GlobalID remoto. Sincroniza el proyecto antes de enviar el collar.",
      };
    }

    if (record.proyecto_global_id_remoto !== projectRemoteId) {
      const nextRecord = {
        ...record,
        proyecto_global_id_remoto: projectRemoteId,
        fecha_modificacion: nowIso(),
      };

      await saveCollar(nextRecord);
      return { record: nextRecord, error: "" };
    }

    return { record, error: "" };
  }

  if (entityType === "survey" || entityType === "assay") {
    const collar = record.collar_uuid ? await getCollarByUuid(record.collar_uuid) : null;
    const collarRemoteId = collar?.global_id_remoto || record.collar_global_id_remoto || "";
    const holeId = collar?.hole_id || record.hole_id || "";

    if (!collarRemoteId) {
      return {
        record,
        error: "El collar vinculado aun no tiene GlobalID remoto. Sincroniza el collar antes de enviar este registro.",
      };
    }

    if (record.collar_global_id_remoto !== collarRemoteId || record.hole_id !== holeId) {
      const nextRecord = {
        ...record,
        collar_global_id_remoto: collarRemoteId,
        hole_id: holeId,
        fecha_modificacion: nowIso(),
      };

      await entityAdapters[entityType].save(nextRecord);
      return { record: nextRecord, error: "" };
    }

    return { record, error: "" };
  }

  if (entityType === "laboratorio") {
    const assay = record.assay_uuid ? await getAssayByUuid(record.assay_uuid) : null;
    const assayRemoteId = assay?.global_id_remoto || record.assay_global_id_remoto || "";
    const sampleId = assay?.muestra_id || record.muestra_id || "";

    if (!assayRemoteId) {
      return {
        record,
        error: "El assay vinculado aun no tiene GlobalID remoto. Sincroniza el assay antes de enviar laboratorio.",
      };
    }

    if (record.assay_global_id_remoto !== assayRemoteId || record.muestra_id !== sampleId) {
      const nextRecord = {
        ...record,
        assay_global_id_remoto: assayRemoteId,
        muestra_id: sampleId,
        fecha_modificacion: nowIso(),
      };

      await saveLaboratorio(nextRecord);
      return { record: nextRecord, error: "" };
    }

    return { record, error: "" };
  }

  return { record, error: "" };
}

function normalizeRemoteSyncError(entityType, errorMessage) {
  const message = String(errorMessage || "").trim();

  if (entityType === "collar" && /FOREIGN KEY constraint|REL_FK_EXPLORACION_CAMPO_COLLAR_3/i.test(message)) {
    return "El proyecto remoto asociado al collar no existe o aun no termino de sincronizarse. Sincroniza el proyecto y vuelve a enviar el collar.";
  }

  return message || "Error de sincronizacion no identificado.";
}

function isMissingRemoteProjectError(errorMessage) {
  return /FOREIGN KEY constraint|REL_FK_EXPLORACION_CAMPO_COLLAR_3/i.test(String(errorMessage || ""));
}

async function requeueProjectForRemoteRecovery(collar) {
  if (!collar?.proyecto_uuid) {
    return false;
  }

  const project = await getProjectByUuid(collar.proyecto_uuid);
  if (!project) {
    return false;
  }

  const repairedProject = {
    ...project,
    global_id_remoto: "",
    remote_object_id: "",
    estado_sync: appConfig.status.pending,
    last_error: "",
    fecha_modificacion: nowIso(),
  };

  const repairedCollar = {
    ...collar,
    proyecto_global_id_remoto: "",
    estado_sync: appConfig.status.pending,
    last_error: "",
    fecha_modificacion: nowIso(),
  };

  await saveProject(repairedProject);
  await saveCollar(repairedCollar);
  await enqueueChange("proyecto", repairedProject.uuid, "create", repairedProject);
  return true;
}

export async function markAsSynced(entityType, entityUuid, remoteId = "", remoteObjectId = "") {
  const adapter = entityAdapters[entityType];
  const record = await adapter?.getByUuid(entityUuid);

  if (!record) {
    return null;
  }

  const nextRecord = {
    ...record,
    global_id_remoto: remoteId || record.global_id_remoto || "",
    remote_object_id: remoteObjectId || record.remote_object_id || "",
    estado_sync: appConfig.status.synced,
    fecha_modificacion: nowIso(),
  };

  await adapter.save(nextRecord);
  await propagateRemoteReferences(entityType, nextRecord);
  return nextRecord;
}

export async function markAsError(entityType, entityUuid, message) {
  const adapter = entityAdapters[entityType];
  const record = await adapter?.getByUuid(entityUuid);

  if (!record) {
    return null;
  }

  const nextRecord = {
    ...record,
    estado_sync: appConfig.status.error,
    fecha_modificacion: nowIso(),
    last_error: message,
  };

  await adapter.save(nextRecord);
  return nextRecord;
}

export async function pushRecord(entityType, queueItem) {
  if (!appConfig.sync.enabled || appConfig.sync.provider === "none") {
    return {
      skipped: true,
      reason: "Sincronizacion remota no configurada.",
    };
  }

  if (appConfig.sync.provider === "backend") {
    return pushToBackend(entityType, queueItem);
  }

  if (appConfig.sync.provider === "arcgis-feature-service") {
    return pushToArcGISFeatureService(entityType, queueItem);
  }

  return {
    skipped: true,
    reason: `Proveedor de sync no soportado: ${appConfig.sync.provider}`,
  };
}

export async function sincronizarConNube() {
  if (!navigator.onLine || !estaLogueado()) {
    return {
      ok: false,
      total: 0,
      message: "Sin conexion o sin sesion activa.",
    };
  }

  try {
    const data = Object.fromEntries(
      await Promise.all(
        BACKEND_SYNC_TABLES.map(async (tabla) => [tabla, normalizeBackendSyncItems(await obtenerDeIndexedDB(tabla))]),
      ),
    );

    const res = await fetch(`${(appConfig.sync.backend.baseUrl || API).replace(/\/+$/, "")}/sync/completa`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(data),
    });

    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(result.error || `Error HTTP ${res.status}`);
    }

    if (result.ok) {
      showToast(`${result.total} registros sincronizados con la nube`, "success");
      localStorage.setItem("ultima_sync", new Date().toISOString());
    }

    return result;
  } catch (err) {
    console.warn("Sync fallo; se reintentara cuando haya conexion:", err);
    return {
      ok: false,
      total: 0,
      message: err.message || "No fue posible sincronizar con la nube.",
    };
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    if (!estaLogueado()) return;
    showToast("Conexion restaurada. Sincronizando...", "info");
    window.setTimeout(sincronizarConNube, 1000);
  });
}

function shouldSkipRemoteOverwrite(record) {
  return record && [appConfig.status.pending, appConfig.status.error].includes(record.estado_sync);
}

function findRecordByRemoteIds(items, globalId, objectId) {
  return (
    items.find(
      (item) =>
        (globalId && item.global_id_remoto === globalId) ||
        (objectId && String(item.remote_object_id || "") === String(objectId)),
    ) || null
  );
}

async function queryArcGISLayer(entityType, returnGeometry = false) {
  const layerUrl = normalizeLayerUrl(getArcGISLayerUrl(entityType));
  if (!layerUrl || !navigator.onLine) {
    return [];
  }

  const params = new URLSearchParams({
    f: "json",
    where: "1=1",
    outFields: "*",
    returnGeometry: returnGeometry ? "true" : "false",
  });

  if (appConfig.sync.arcgis.token) {
    params.set("token", appConfig.sync.arcgis.token);
  }

  const response = await fetch(`${layerUrl}/query?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`No se pudo consultar ${entityType} en ArcGIS.`);
  }

  const data = await response.json();
  return data.features || [];
}

async function bootstrapProjectsFromArcGIS(features) {
  const localProjects = await listProjects();
  const savedProjects = [];
  const fields = getArcGISFieldMap("proyecto");

  for (const feature of features) {
    const attributes = feature.attributes || {};
    const existing = findRecordByRemoteIds(localProjects, attributes.GlobalID, attributes.OBJECTID);

    if (shouldSkipRemoteOverwrite(existing)) {
      savedProjects.push(existing);
      continue;
    }

    const saved = await saveProject({
      ...existing,
      uuid: existing?.uuid || attributes.GlobalID || createUuid(),
      global_id_remoto: attributes.GlobalID || existing?.global_id_remoto || "",
      remote_object_id: attributes.OBJECTID || existing?.remote_object_id || "",
      cod_exploracion: attributes[fields.codExploracion] || "",
      concesion_area: attributes[fields.concesionArea] || "",
      cod_catastral: attributes[fields.codCatastral] || "",
      localizacion: attributes[fields.localizacion] || "",
      tecnico: attributes[fields.tecnico] || "",
      sr_proyecto: attributes[fields.srProyecto] || "WGS84_UTM_17S",
      dem_source_type: existing?.dem_source_type || appConfig.elevation.defaultSourceType,
      dem_service_url: existing?.dem_service_url || "",
      fecha_creacion: existing?.fecha_creacion || nowIso(),
      fecha_modificacion: nowIso(),
      estado_sync: appConfig.status.synced,
      activo: existing?.activo || false,
    });

    savedProjects.push(saved);
  }

  return savedProjects;
}

async function bootstrapCollarsFromArcGIS(features, projects) {
  const localCollars = await listCollars();
  const projectByGuid = new Map(projects.map((project) => [project.global_id_remoto, project]));
  const savedCollars = [];
  const fields = getArcGISFieldMap("collar");

  for (const feature of features) {
    const attributes = feature.attributes || {};
    const existing = findRecordByRemoteIds(localCollars, attributes.GlobalID, attributes.OBJECTID);

    if (shouldSkipRemoteOverwrite(existing)) {
      savedCollars.push(existing);
      continue;
    }

    const project = projectByGuid.get(attributes[fields.proyectoGuid]) || null;
    const saved = await saveCollar({
      ...existing,
      uuid: existing?.uuid || attributes.GlobalID || createUuid(),
      global_id_remoto: attributes.GlobalID || existing?.global_id_remoto || "",
      remote_object_id: attributes.OBJECTID || existing?.remote_object_id || "",
      proyecto_uuid: project?.uuid || existing?.proyecto_uuid || "",
      proyecto_global_id_remoto: attributes[fields.proyectoGuid] || existing?.proyecto_global_id_remoto || "",
      hole_id: attributes[fields.holeId] || "",
      este: attributes[fields.este] ?? null,
      norte: attributes[fields.norte] ?? null,
      elevacion: attributes[fields.elevacion] ?? null,
      prof_total: attributes[fields.profTotal] ?? null,
      tipo: attributes[fields.tipo] || "",
      localizacion: attributes[fields.localizacion] || "",
      fecha: formatDateOnlyFromMillis(attributes[fields.fecha]),
      latitude: attributes[fields.latitud] ?? feature.geometry?.y ?? null,
      longitude: attributes[fields.longitud] ?? feature.geometry?.x ?? null,
      geometry: feature.geometry
        ? {
            ...feature.geometry,
            spatialReference: feature.geometry.spatialReference || { wkid: 4326 },
          }
        : existing?.geometry || null,
      elevation_status: attributes[fields.elevacion] == null ? existing?.elevation_status || "pending" : "resolved",
      elevation_source: attributes[fields.elevacion] == null ? existing?.elevation_source || "" : existing?.elevation_source || "remote-sync",
      elevation_resolved_at: attributes[fields.elevacion] == null ? existing?.elevation_resolved_at || "" : nowIso(),
      fecha_creacion: existing?.fecha_creacion || nowIso(),
      fecha_modificacion: nowIso(),
      estado_sync: appConfig.status.synced,
    });

    savedCollars.push(saved);
  }

  return savedCollars;
}

async function bootstrapSurveysFromArcGIS(features, collars) {
  const localSurveys = await listSurveys();
  const collarByGuid = new Map(collars.map((collar) => [collar.global_id_remoto, collar]));
  const fields = getArcGISFieldMap("survey");

  for (const feature of features) {
    const attributes = feature.attributes || {};
    const existing = findRecordByRemoteIds(localSurveys, attributes.GlobalID, attributes.OBJECTID);

    if (shouldSkipRemoteOverwrite(existing)) {
      continue;
    }

    const collar = collarByGuid.get(attributes[fields.collarGuid]) || null;
    await saveSurvey({
      ...existing,
      uuid: existing?.uuid || attributes.GlobalID || createUuid(),
      global_id_remoto: attributes.GlobalID || existing?.global_id_remoto || "",
      remote_object_id: attributes.OBJECTID || existing?.remote_object_id || "",
      collar_uuid: collar?.uuid || existing?.collar_uuid || "",
      collar_global_id_remoto: attributes[fields.collarGuid] || "",
      hole_id: attributes[fields.holeId] || "",
      profundidad: attributes[fields.profundidad] ?? null,
      dip: attributes[fields.dip] ?? null,
      azimut: attributes[fields.azimut] ?? null,
      instrumento: attributes[fields.instrumento] || "",
      fecha_creacion: existing?.fecha_creacion || nowIso(),
      fecha_modificacion: nowIso(),
      estado_sync: appConfig.status.synced,
    });
  }
}

async function bootstrapAssaysFromArcGIS(features, collars) {
  const localAssays = await listAssays();
  const collarByGuid = new Map(collars.map((collar) => [collar.global_id_remoto, collar]));
  const fields = getArcGISFieldMap("assay");
  const savedAssays = [];

  for (const feature of features) {
    const attributes = feature.attributes || {};
    const existing = findRecordByRemoteIds(localAssays, attributes.GlobalID, attributes.OBJECTID);

    if (shouldSkipRemoteOverwrite(existing)) {
      savedAssays.push(existing);
      continue;
    }

    const collar = collarByGuid.get(attributes[fields.collarGuid]) || null;
    const saved = await saveAssay({
      ...existing,
      uuid: existing?.uuid || attributes.GlobalID || createUuid(),
      global_id_remoto: attributes.GlobalID || existing?.global_id_remoto || "",
      remote_object_id: attributes.OBJECTID || existing?.remote_object_id || "",
      collar_uuid: collar?.uuid || existing?.collar_uuid || "",
      collar_global_id_remoto: attributes[fields.collarGuid] || "",
      hole_id: attributes[fields.holeId] || "",
      desde: attributes[fields.desde] ?? null,
      hasta: attributes[fields.hasta] ?? null,
      material: attributes[fields.material] || "",
      descripcion: attributes[fields.descripcion] || "",
      categoria: attributes[fields.categoria] ?? null,
      color: attributes[fields.color] || "",
      grano: attributes[fields.grano] || "",
      dureza: attributes[fields.dureza] || "",
      humedad: attributes[fields.humedad] || "",
      presencia_caolinitica: attributes[fields.presenciaCaolinitica] || "",
      contaminantes: attributes[fields.contaminantes] || "",
      muestra_id: attributes[fields.muestraId] || "",
      fecha_creacion: existing?.fecha_creacion || nowIso(),
      fecha_modificacion: nowIso(),
      estado_sync: appConfig.status.synced,
    });

    savedAssays.push(saved);
  }

  return savedAssays;
}

async function bootstrapLaboratoriosFromArcGIS(features, assays) {
  const localLaboratorios = await listLaboratorios();
  const assayByGuid = new Map(assays.map((assay) => [assay.global_id_remoto, assay]));
  const fields = getArcGISFieldMap("laboratorio");

  for (const feature of features) {
    const attributes = feature.attributes || {};
    const existing = findRecordByRemoteIds(localLaboratorios, attributes.GlobalID, attributes.OBJECTID);

    if (shouldSkipRemoteOverwrite(existing)) {
      continue;
    }

    const assay = assayByGuid.get(attributes[fields.assayGuid]) || null;
    await saveLaboratorio({
      ...existing,
      uuid: existing?.uuid || attributes.GlobalID || createUuid(),
      global_id_remoto: attributes.GlobalID || existing?.global_id_remoto || "",
      remote_object_id: attributes.OBJECTID || existing?.remote_object_id || "",
      assay_uuid: assay?.uuid || existing?.assay_uuid || "",
      assay_global_id_remoto: attributes[fields.assayGuid] || "",
      muestra_id: attributes[fields.muestraId] || "",
      fecha_recepcion: formatDateOnlyFromMillis(attributes[fields.fechaRecepcion]),
      laboratorio: attributes[fields.laboratorio] || "",
      contraccion: attributes[fields.contraccion] ?? null,
      absorcion: attributes[fields.absorcion] ?? null,
      color_q: attributes[fields.colorQ] || "",
      observaciones: attributes[fields.observaciones] || "",
      fecha_creacion: existing?.fecha_creacion || nowIso(),
      fecha_modificacion: nowIso(),
      estado_sync: appConfig.status.synced,
    });
  }
}

export async function bootstrapArcGISData() {
  if (!hasArcGISFeatureServiceSync() || !navigator.onLine) {
    return {
      skipped: true,
      message: "Sin proveedor ArcGIS o sin conexion disponible.",
    };
  }

  const [projectFeatures, collarFeatures, surveyFeatures, assayFeatures, laboratorioFeatures] = await Promise.all([
    queryArcGISLayer("proyecto", false),
    queryArcGISLayer("collar", true),
    hasArcGISLayer("survey") ? queryArcGISLayer("survey", false) : Promise.resolve([]),
    hasArcGISLayer("assay") ? queryArcGISLayer("assay", false) : Promise.resolve([]),
    hasArcGISLayer("laboratorio") ? queryArcGISLayer("laboratorio", false) : Promise.resolve([]),
  ]);

  const projects = await bootstrapProjectsFromArcGIS(projectFeatures);
  const collars = await bootstrapCollarsFromArcGIS(collarFeatures, projects);
  await bootstrapSurveysFromArcGIS(surveyFeatures, collars);
  const assays = await bootstrapAssaysFromArcGIS(assayFeatures, collars);
  await bootstrapLaboratoriosFromArcGIS(laboratorioFeatures, assays);

  return {
    skipped: false,
    message: `Descarga ArcGIS completada. Proyectos: ${projectFeatures.length}, collars: ${collarFeatures.length}, survey: ${surveyFeatures.length}, assay: ${assayFeatures.length}, laboratorio: ${laboratorioFeatures.length}.`,
  };
}

function matchesActionMode(item, actionMode) {
  if (actionMode === "delete") {
    return item.action === "delete";
  }

  if (actionMode === "upsert") {
    return item.action !== "delete";
  }

  return true;
}

async function syncEntityQueue(entityType, dependencyIds = null, dependencyField = "", actionMode = "all") {
  const queue = await listSyncQueue();
  const items = queue.filter(
    (item) => item.entity_type === entityType && item.status !== appConfig.status.synced && matchesActionMode(item, actionMode),
  );
  const adapter = entityAdapters[entityType];
  let synced = 0;
  let errors = 0;
  let skipped = 0;

  for (const item of items) {
    let record = await adapter.getByUuid(item.entity_uuid);

    if (!record && item.action !== "delete") {
      skipped += 1;
      continue;
    }

    if (item.action !== "delete" && dependencyIds && dependencyField && !dependencyIds.has(record[dependencyField])) {
      skipped += 1;
      continue;
    }

    if (item.action !== "delete") {
      const parentReference = await ensureParentRemoteReference(entityType, record);
      if (parentReference.error) {
        errors += 1;
        await markAsError(entityType, item.entity_uuid, parentReference.error);
        await updateSyncItem({
          ...item,
          payload: item.payload,
          status: appConfig.status.error,
          attempts: item.attempts + 1,
          last_error: parentReference.error,
        });
        continue;
      }

      record = parentReference.record;
    }

    const payload = item.action === "delete" ? item.payload : await hydrateQueuePayload(entityType, record);

    try {
      const result = await pushRecord(entityType, {
        ...item,
        payload,
      });

      if (result.skipped) {
        skipped += 1;
        continue;
      }

      if (item.action !== "delete") {
        await markAsSynced(entityType, item.entity_uuid, result.remoteId, result.remoteObjectId);
      }

      await updateSyncItem({
        ...item,
        payload,
        status: appConfig.status.synced,
        attempts: item.attempts + 1,
        last_error: "",
      });
      synced += 1;
    } catch (error) {
      const normalizedError = normalizeRemoteSyncError(entityType, error.message);
      errors += 1;
      await markAsError(entityType, item.entity_uuid, normalizedError);
      await updateSyncItem({
        ...item,
        payload,
        status: appConfig.status.error,
        attempts: item.attempts + 1,
        last_error: normalizedError,
      });
    }
  }

  return { synced, errors, skipped };
}

export async function syncProjects(actionMode = "all") {
  const queue = await listSyncQueue();
  const projectItems = queue.filter(
    (item) => item.entity_type === "proyecto" && item.status !== appConfig.status.synced && matchesActionMode(item, actionMode),
  );
  let synced = 0;
  let errors = 0;
  let skipped = 0;

  for (const item of projectItems) {
    const record = await getProjectByUuid(item.entity_uuid);
    const payload = item.action === "delete" ? item.payload : await hydrateQueuePayload("proyecto", record);

    if (!record && item.action !== "delete") {
      skipped += 1;
      continue;
    }

    try {
      const result = await pushRecord("proyecto", {
        ...item,
        payload,
      });

      if (result.skipped) {
        skipped += 1;
        continue;
      }

      if (item.action !== "delete") {
        await markAsSynced("proyecto", item.entity_uuid, result.remoteId, result.remoteObjectId);
      }

      await updateSyncItem({
        ...item,
        payload,
        status: appConfig.status.synced,
        attempts: item.attempts + 1,
        last_error: "",
      });
      synced += 1;
    } catch (error) {
      errors += 1;
      await markAsError("proyecto", item.entity_uuid, error.message);
      await updateSyncItem({
        ...item,
        payload,
        status: appConfig.status.error,
        attempts: item.attempts + 1,
        last_error: error.message,
      });
    }
  }

  return { synced, errors, skipped };
}

export async function syncCollars(actionMode = "all") {
  const [queue, projects] = await Promise.all([listSyncQueue(), listProjects()]);
  const syncedProjectIds = new Set(
    projects
      .filter((project) => project.estado_sync === appConfig.status.synced || project.global_id_remoto)
      .map((project) => project.uuid),
  );

  const collarItems = queue.filter(
    (item) => item.entity_type === "collar" && item.status !== appConfig.status.synced && matchesActionMode(item, actionMode),
  );
  let synced = 0;
  let errors = 0;
  let skipped = 0;

  for (const item of collarItems) {
    let collar = await getCollarByUuid(item.entity_uuid);

    if (!collar && item.action !== "delete") {
      skipped += 1;
      continue;
    }

    if (item.action !== "delete" && !syncedProjectIds.has(collar.proyecto_uuid)) {
      skipped += 1;
      continue;
    }

    if (item.action !== "delete") {
      const parentReference = await ensureParentRemoteReference("collar", collar);
      if (parentReference.error) {
        errors += 1;
        await markAsError("collar", item.entity_uuid, parentReference.error);
        await updateSyncItem({
          ...item,
          payload: item.payload,
          status: appConfig.status.error,
          attempts: item.attempts + 1,
          last_error: parentReference.error,
        });
        continue;
      }

      collar = parentReference.record;
    }

    const payload = item.action === "delete" ? item.payload : await hydrateQueuePayload("collar", collar);

    try {
      const result = await pushRecord("collar", {
        ...item,
        payload,
      });

      if (result.skipped) {
        skipped += 1;
        continue;
      }

      if (item.action !== "delete") {
        await markAsSynced("collar", item.entity_uuid, result.remoteId, result.remoteObjectId);
      }

      await updateSyncItem({
        ...item,
        payload,
        status: appConfig.status.synced,
        attempts: item.attempts + 1,
        last_error: "",
      });
      synced += 1;
    } catch (error) {
      let normalizedError = normalizeRemoteSyncError("collar", error.message);

      if (isMissingRemoteProjectError(error.message)) {
        const repairQueued = await requeueProjectForRemoteRecovery(collar);
        if (repairQueued) {
          normalizedError = "El proyecto remoto asociado al collar no existe en ArcGIS. Se volvio a encolar el proyecto para recrearlo; ejecuta sync nuevamente cuando el proyecto termine de sincronizarse.";
        }
      }

      errors += 1;
      await markAsError("collar", item.entity_uuid, normalizedError);
      await updateSyncItem({
        ...item,
        payload,
        status: appConfig.status.error,
        attempts: item.attempts + 1,
        last_error: normalizedError,
      });
    }
  }

  return { synced, errors, skipped };
}

export async function syncSurveys(actionMode = "all") {
  const collars = await listCollars();
  const syncedCollarIds = new Set(
    collars.filter((collar) => collar.estado_sync === appConfig.status.synced || collar.global_id_remoto).map((collar) => collar.uuid),
  );

  return syncEntityQueue("survey", syncedCollarIds, "collar_uuid", actionMode);
}

export async function syncAssays(actionMode = "all") {
  const collars = await listCollars();
  const syncedCollarIds = new Set(
    collars.filter((collar) => collar.estado_sync === appConfig.status.synced || collar.global_id_remoto).map((collar) => collar.uuid),
  );

  return syncEntityQueue("assay", syncedCollarIds, "collar_uuid", actionMode);
}

export async function syncLaboratorios(actionMode = "all") {
  const assays = await listAssays();
  const syncedAssayIds = new Set(
    assays.filter((assay) => assay.estado_sync === appConfig.status.synced || assay.global_id_remoto).map((assay) => assay.uuid),
  );

  return syncEntityQueue("laboratorio", syncedAssayIds, "assay_uuid", actionMode);
}

export async function syncAll() {
  if (!navigator.onLine) {
    return {
      synced: 0,
      errors: 0,
      skipped: 0,
      message: "Sin conexion. La sincronizacion queda pendiente.",
    };
  }

  const projectUpsertSummary = await syncProjects("upsert");
  const collarsUpsertSummary = await syncCollars("upsert");
  const surveysUpsertSummary = await syncSurveys("upsert");
  const assaysUpsertSummary = await syncAssays("upsert");
  const laboratoriosUpsertSummary = await syncLaboratorios("upsert");
  const survey123LaboratorioUpsertSummary = await syncLaboratorioSurvey123Submissions("upsert");

  const laboratoriosDeleteSummary = await syncLaboratorios("delete");
  const assaysDeleteSummary = await syncAssays("delete");
  const surveysDeleteSummary = await syncSurveys("delete");
  const collarsDeleteSummary = await syncCollars("delete");
  const projectDeleteSummary = await syncProjects("delete");
  const backendFullSummary = appConfig.sync.provider === "backend"
    ? await sincronizarConNube()
    : { ok: false, total: 0 };

  return {
    synced:
      projectUpsertSummary.synced +
      collarsUpsertSummary.synced +
      surveysUpsertSummary.synced +
      assaysUpsertSummary.synced +
      laboratoriosUpsertSummary.synced +
      survey123LaboratorioUpsertSummary.synced +
      laboratoriosDeleteSummary.synced +
      assaysDeleteSummary.synced +
      surveysDeleteSummary.synced +
      collarsDeleteSummary.synced +
      projectDeleteSummary.synced +
      (backendFullSummary.ok ? backendFullSummary.total : 0),
    errors:
      projectUpsertSummary.errors +
      collarsUpsertSummary.errors +
      surveysUpsertSummary.errors +
      assaysUpsertSummary.errors +
      laboratoriosUpsertSummary.errors +
      survey123LaboratorioUpsertSummary.errors +
      laboratoriosDeleteSummary.errors +
      assaysDeleteSummary.errors +
      surveysDeleteSummary.errors +
      collarsDeleteSummary.errors +
      projectDeleteSummary.errors,
    skipped:
      projectUpsertSummary.skipped +
      collarsUpsertSummary.skipped +
      surveysUpsertSummary.skipped +
      assaysUpsertSummary.skipped +
      laboratoriosUpsertSummary.skipped +
      survey123LaboratorioUpsertSummary.skipped +
      laboratoriosDeleteSummary.skipped +
      assaysDeleteSummary.skipped +
      surveysDeleteSummary.skipped +
      collarsDeleteSummary.skipped +
      projectDeleteSummary.skipped,
    message:
      hasSyncBackend() || hasArcGISFeatureServiceSync()
        ? "Sincronizacion finalizada."
        : "No hay destino remoto configurado. Los registros siguen locales y pendientes.",
  };
}
