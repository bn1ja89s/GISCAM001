import { appConfig } from "../config.js";
import { nowIso } from "../core/helpers.js";
import { enqueueSync, listSyncQueue, updateSyncItem } from "../db/syncRepository.js";

const ENTITY_TYPE = "survey123_laboratorio";

function normalizeLayerUrl(layerUrl) {
  return String(layerUrl || "").replace(/\/+$/, "");
}

function dateToMillis(value) {
  if (!value) {
    return null;
  }

  const date = new Date(`${value}T00:00:00Z`);
  const millis = date.getTime();
  return Number.isFinite(millis) ? millis : null;
}

function getSurvey123Config() {
  return appConfig.sync.arcgis.survey123 || {};
}

function getSurvey123Field(name, fallback = "") {
  const fields = getSurvey123Config().fields || {};
  return fields[name] || fallback;
}

function setAttribute(attributes, fieldName, value) {
  if (fieldName) {
    attributes[fieldName] = value;
  }
}

function extractLabSequence(value) {
  const match = String(value || "").trim().match(/^LAB-(\d+)$/i);
  return match ? Number.parseInt(match[1], 10) : 0;
}

function getNextLaboratorioId(queue) {
  const maxSequence = queue
    .filter((item) => item.entity_type === ENTITY_TYPE)
    .map((item) => extractLabSequence(item.payload?.laboratorio_id))
    .reduce((max, value) => Math.max(max, value || 0), 0);

  return `LAB-${String(maxSequence + 1).padStart(3, "0")}`;
}

function buildSurvey123Feature(payload) {
  const longitude = Number(payload.longitude);
  const latitude = Number(payload.latitude);
  const hasGeometry = Number.isFinite(longitude) && Number.isFinite(latitude);
  const attributes = {};

  setAttribute(attributes, getSurvey123Field("laboratorioId"), payload.laboratorio_id || "");
  setAttribute(attributes, getSurvey123Field("codigoAssay", getSurvey123Field("guiaEnsayo")), payload.codigo_assay || payload.guia_ensayo || "");
  if (getSurvey123Field("guiaEnsayo") !== getSurvey123Field("codigoAssay")) {
    setAttribute(attributes, getSurvey123Field("guiaEnsayo"), payload.guia_ensayo || payload.codigo_assay || "");
  }
  setAttribute(attributes, getSurvey123Field("idMuestra", getSurvey123Field("muestraId")), payload.muestra_id || "");
  if (getSurvey123Field("muestraId") !== getSurvey123Field("idMuestra")) {
    setAttribute(attributes, getSurvey123Field("muestraId"), payload.muestra_id || "");
  }
  setAttribute(attributes, getSurvey123Field("desde"), payload.desde ?? null);
  setAttribute(attributes, getSurvey123Field("hasta"), payload.hasta ?? null);
  setAttribute(attributes, getSurvey123Field("fechaRecepcion"), dateToMillis(payload.fecha_recepcion));

  return {
    geometry: hasGeometry ? {
      x: longitude,
      y: latitude,
      spatialReference: { wkid: 4326 },
    } : null,
    attributes,
  };
}

function buildSurvey123Payload(assay, collar, laboratorioId) {
  const codigoAssay = collar.hole_id || assay.hole_id || "";

  return {
    assay_uuid: assay.uuid,
    collar_uuid: collar.uuid,
    laboratorio_id: laboratorioId,
    codigo_assay: codigoAssay,
    guia_ensayo: codigoAssay,
    muestra_id: assay.muestra_id || "",
    desde: assay.desde ?? null,
    hasta: assay.hasta ?? null,
    fecha_recepcion: collar.fecha || "",
    latitude: collar.latitude ?? collar.geometry?.y ?? null,
    longitude: collar.longitude ?? collar.geometry?.x ?? null,
  };
}

async function upsertQueueItem(payload) {
  const queue = await listSyncQueue();
  const existingPending = queue.find(
    (item) => item.entity_type === ENTITY_TYPE &&
      item.entity_uuid === payload.assay_uuid &&
      item.status !== appConfig.status.synced,
  );

  if (existingPending) {
    return updateSyncItem({
      ...existingPending,
      payload,
      action: "create",
      status: appConfig.status.pending,
      last_error: "",
    });
  }

  return enqueueSync({
    entity_type: ENTITY_TYPE,
    entity_uuid: payload.assay_uuid,
    action: "create",
    payload,
  });
}

async function pushSurvey123QueueItem(queueItem) {
  const layerUrl = normalizeLayerUrl(getSurvey123Config().laboratorioForm);

  if (!appConfig.sync.enabled || !layerUrl) {
    return {
      skipped: true,
      reason: "Formulario Survey123 de laboratorio no configurado.",
    };
  }

  const body = new URLSearchParams({ f: "json" });
  if (appConfig.sync.arcgis.token) {
    body.set("token", appConfig.sync.arcgis.token);
  }
  body.set("features", JSON.stringify([buildSurvey123Feature(queueItem.payload)]));

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), appConfig.sync.timeoutMs);

  try {
    const response = await fetch(`${layerUrl}/addFeatures`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      },
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Survey123 HTTP ${response.status}`);
    }

    const result = await response.json();
    const rowResult = result.addResults?.[0] || result[0];

    if (!rowResult?.success) {
      throw new Error(rowResult?.error?.description || rowResult?.error?.message || "Survey123 addFeatures fallo.");
    }

    return {
      skipped: false,
      remoteId: rowResult.globalId || "",
      remoteObjectId: rowResult.objectId || "",
      result,
    };
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function enqueueLaboratorioSurvey123Submission(assay, collar) {
  if (!assay?.uuid || !collar?.uuid) {
    throw new Error("No se pudo preparar la respuesta Survey123: falta el assay o el collar.");
  }

  const queue = await listSyncQueue();
  const existing = queue.find((item) => item.entity_type === ENTITY_TYPE && item.entity_uuid === assay.uuid);
  const laboratorioId = existing?.payload?.laboratorio_id || getNextLaboratorioId(queue);
  const payload = buildSurvey123Payload(assay, collar, laboratorioId);
  if (!payload.codigo_assay || !payload.muestra_id || !payload.fecha_recepcion) {
    throw new Error("No se pudo preparar la respuesta Survey123: faltan codigo assay, muestra o fecha.");
  }
  if (!Number.isFinite(Number(payload.longitude)) || !Number.isFinite(Number(payload.latitude))) {
    throw new Error("No se pudo preparar la respuesta Survey123: el collar no tiene coordenadas validas.");
  }

  return upsertQueueItem(payload);
}

export async function syncLaboratorioSurvey123Submissions(actionMode = "all") {
  if (!navigator.onLine) {
    return { synced: 0, errors: 0, skipped: 0 };
  }

  const queue = await listSyncQueue();
  const items = queue.filter((item) => {
    const actionMatches = actionMode === "delete"
      ? item.action === "delete"
      : actionMode === "upsert"
        ? item.action !== "delete"
        : true;

    return item.entity_type === ENTITY_TYPE && item.status !== appConfig.status.synced && actionMatches;
  });

  let synced = 0;
  let errors = 0;
  let skipped = 0;

  for (const item of items) {
    try {
      const result = await pushSurvey123QueueItem(item);

      if (result.skipped) {
        skipped += 1;
        continue;
      }

      await updateSyncItem({
        ...item,
        payload: {
          ...item.payload,
          survey123_global_id: result.remoteId,
          survey123_object_id: result.remoteObjectId,
        },
        status: appConfig.status.synced,
        attempts: item.attempts + 1,
        last_error: "",
        synced_at: nowIso(),
      });
      synced += 1;
    } catch (error) {
      errors += 1;
      await updateSyncItem({
        ...item,
        status: appConfig.status.error,
        attempts: item.attempts + 1,
        last_error: error.message || "Error enviando respuesta Survey123.",
      });
    }
  }

  return { synced, errors, skipped };
}

export async function createLaboratorioSurvey123Submission(assay, collar) {
  await enqueueLaboratorioSurvey123Submission(assay, collar);
  return syncLaboratorioSurvey123Submissions("upsert");
}
