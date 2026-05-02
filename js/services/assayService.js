import { appConfig } from "../config.js";
import { createUuid, nowIso, toNumber } from "../core/helpers.js";
import { validateAssay } from "../core/validators.js";
import { deleteAssayByLocalId, getAssayByUuid, saveAssay } from "../db/assayRepository.js";
import { removeSyncItemsByEntity } from "../db/syncRepository.js";
import { enqueueChange } from "./syncService.js";

function buildAssay(data, collar) {
  const categoria = data.categoria === "" || data.categoria === undefined ? null : Number(data.categoria);

  return {
    collar_uuid: collar.uuid,
    collar_global_id_remoto: collar.global_id_remoto || "",
    hole_id: collar.hole_id || "",
    desde: toNumber(data.desde),
    hasta: toNumber(data.hasta),
    material: data.material?.trim() || "",
    descripcion: data.descripcion?.trim() || "",
    categoria,
    color: data.color?.trim() || "",
    grano: data.grano?.trim() || "",
    dureza: data.dureza?.trim() || "",
    humedad: data.humedad?.trim() || "",
    presencia_caolinitica: data.presencia_caolinitica?.trim() || "",
    contaminantes: data.contaminantes?.trim() || "",
    muestra_id: data.muestra_id?.trim() || "",
  };
}

export async function createAssay(data, collars) {
  const collar = collars.find((item) => item.uuid === data.collar_uuid);
  if (!collar) {
    throw new Error("Debes seleccionar un collar valido para el assay.");
  }

  const now = nowIso();
  const assay = {
    uuid: createUuid(),
    global_id_remoto: "",
    remote_object_id: "",
    ...buildAssay(data, collar),
    estado_sync: appConfig.status.pending,
    fecha_creacion: now,
    fecha_modificacion: now,
  };

  const errors = validateAssay(assay);
  if (errors.length) {
    throw new Error(errors.join(" "));
  }

  const saved = await saveAssay(assay);
  await enqueueChange("assay", saved.uuid, "create", saved);
  return saved;
}

export async function updateAssay(uuid, data, collars) {
  const existing = await getAssayByUuid(uuid);
  if (!existing) {
    throw new Error("No se encontro el assay a editar.");
  }

  const collar = collars.find((item) => item.uuid === data.collar_uuid);
  if (!collar) {
    throw new Error("Debes seleccionar un collar valido para el assay.");
  }

  const nextAssay = {
    ...existing,
    ...buildAssay(data, collar),
    estado_sync: appConfig.status.pending,
    fecha_modificacion: nowIso(),
  };

  const errors = validateAssay(nextAssay);
  if (errors.length) {
    throw new Error(errors.join(" "));
  }

  await saveAssay(nextAssay);
  await enqueueChange("assay", nextAssay.uuid, "update", nextAssay);
  return nextAssay;
}

export async function deleteAssay(uuid) {
  const existing = await getAssayByUuid(uuid);
  if (!existing) {
    throw new Error("No se encontro el assay a eliminar.");
  }

  await removeSyncItemsByEntity("assay", existing.uuid);
  if (existing.global_id_remoto || existing.remote_object_id) {
    await enqueueChange("assay", existing.uuid, "delete", existing);
  }

  await deleteAssayByLocalId(existing.id_local);
  return existing;
}