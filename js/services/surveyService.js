import { appConfig } from "../config.js";
import { createUuid, nowIso, toNumber } from "../core/helpers.js";
import { validateSurvey } from "../core/validators.js";
import { deleteSurveyByLocalId, getSurveyByUuid, saveSurvey } from "../db/surveyRepository.js";
import { removeSyncItemsByEntity } from "../db/syncRepository.js";
import { enqueueChange } from "./syncService.js";

function buildSurvey(data, collar) {
  return {
    collar_uuid: collar.uuid,
    collar_global_id_remoto: collar.global_id_remoto || "",
    hole_id: data.hole_id?.trim() || "",
    profundidad: toNumber(data.profundidad),
    dip: toNumber(data.dip),
    azimut: toNumber(data.azimut),
    instrumento: data.instrumento?.trim() || "",
  };
}

export async function createSurvey(data, collars) {
  const collar = collars.find((item) => item.uuid === data.collar_uuid);
  if (!collar) {
    throw new Error("Debes seleccionar un collar valido para el survey.");
  }

  const now = nowIso();
  const survey = {
    uuid: createUuid(),
    global_id_remoto: "",
    remote_object_id: "",
    ...buildSurvey(data, collar),
    estado_sync: appConfig.status.pending,
    fecha_creacion: now,
    fecha_modificacion: now,
  };

  const errors = validateSurvey(survey);
  if (errors.length) {
    throw new Error(errors.join(" "));
  }

  const saved = await saveSurvey(survey);
  await enqueueChange("survey", saved.uuid, "create", saved);
  return saved;
}

export async function updateSurvey(uuid, data, collars) {
  const existing = await getSurveyByUuid(uuid);
  if (!existing) {
    throw new Error("No se encontro el survey a editar.");
  }

  const collar = collars.find((item) => item.uuid === data.collar_uuid);
  if (!collar) {
    throw new Error("Debes seleccionar un collar valido para el survey.");
  }

  const nextSurvey = {
    ...existing,
    ...buildSurvey(data, collar),
    estado_sync: appConfig.status.pending,
    fecha_modificacion: nowIso(),
  };

  const errors = validateSurvey(nextSurvey);
  if (errors.length) {
    throw new Error(errors.join(" "));
  }

  await saveSurvey(nextSurvey);
  await enqueueChange("survey", nextSurvey.uuid, "update", nextSurvey);
  return nextSurvey;
}

export async function deleteSurvey(uuid) {
  const existing = await getSurveyByUuid(uuid);
  if (!existing) {
    throw new Error("No se encontro el survey a eliminar.");
  }

  await removeSyncItemsByEntity("survey", existing.uuid);
  if (existing.global_id_remoto || existing.remote_object_id) {
    await enqueueChange("survey", existing.uuid, "delete", existing);
  }

  await deleteSurveyByLocalId(existing.id_local);
  return existing;
}
