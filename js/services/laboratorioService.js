import { appConfig } from "../config.js";
import { createUuid, nowIso, todayValue, toNumber } from "../core/helpers.js";
import { validateLaboratorio } from "../core/validators.js";
import { deleteLaboratorioByLocalId, getLaboratorioByUuid, listLaboratorios, saveLaboratorio } from "../db/laboratorioRepository.js";
import { removeSyncItemsByEntity } from "../db/syncRepository.js";
import { enqueueChange } from "./syncService.js";

export function obtenerLaboratoriosLocales() {
  return listLaboratorios();
}

export async function obtenerLaboratoriosDeArcGIS() {
  return obtenerLaboratoriosLocales();
}

function buildLaboratorio(data, assay) {
  return {
    assay_uuid: assay.uuid,
    assay_global_id_remoto: assay.global_id_remoto || "",
    muestra_id: data.muestra_id?.trim() || assay.muestra_id || "",
    fecha_recepcion: data.fecha_recepcion || todayValue(),
    laboratorio: data.laboratorio?.trim() || "",
    contraccion: toNumber(data.contraccion),
    absorcion: toNumber(data.absorcion),
    color_q: data.color_q?.trim() || "",
    observaciones: data.observaciones?.trim() || "",
  };
}

export async function createLaboratorio(data, assays) {
  const assay = assays.find((item) => item.uuid === data.assay_uuid);
  if (!assay) {
    throw new Error("Debes seleccionar un assay valido para el laboratorio.");
  }

  const now = nowIso();
  const laboratorio = {
    uuid: createUuid(),
    global_id_remoto: "",
    remote_object_id: "",
    ...buildLaboratorio(data, assay),
    estado_sync: appConfig.status.pending,
    fecha_creacion: now,
    fecha_modificacion: now,
  };

  const errors = validateLaboratorio(laboratorio);
  if (errors.length) {
    throw new Error(errors.join(" "));
  }

  const saved = await saveLaboratorio(laboratorio);
  await enqueueChange("laboratorio", saved.uuid, "create", saved);
  return saved;
}

export async function updateLaboratorio(uuid, data, assays) {
  const existing = await getLaboratorioByUuid(uuid);
  if (!existing) {
    throw new Error("No se encontro el registro de laboratorio a editar.");
  }

  const assay = assays.find((item) => item.uuid === data.assay_uuid);
  if (!assay) {
    throw new Error("Debes seleccionar un assay valido para el laboratorio.");
  }

  const nextLaboratorio = {
    ...existing,
    ...buildLaboratorio(data, assay),
    estado_sync: appConfig.status.pending,
    fecha_modificacion: nowIso(),
  };

  const errors = validateLaboratorio(nextLaboratorio);
  if (errors.length) {
    throw new Error(errors.join(" "));
  }

  await saveLaboratorio(nextLaboratorio);
  await enqueueChange("laboratorio", nextLaboratorio.uuid, "update", nextLaboratorio);
  return nextLaboratorio;
}

export async function deleteLaboratorio(uuid) {
  const existing = await getLaboratorioByUuid(uuid);
  if (!existing) {
    throw new Error("No se encontro el registro de laboratorio a eliminar.");
  }

  await removeSyncItemsByEntity("laboratorio", existing.uuid);
  if (existing.global_id_remoto || existing.remote_object_id) {
    await enqueueChange("laboratorio", existing.uuid, "delete", existing);
  }

  await deleteLaboratorioByLocalId(existing.id_local);
  return existing;
}
