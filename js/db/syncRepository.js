import { createUuid, nowIso, sortByDate } from "../core/helpers.js";
import { eliminarDocumento, guardarDocumento, obtenerDocumentos } from "../services/backendService.js";

const STORE = "sync_queue";

export async function listSyncQueue() {
  return sortByDate(await obtenerDocumentos(STORE), "updated_at");
}

export async function enqueueSync(item) {
  const now = nowIso();
  const id = item.id || createUuid();
  const queueRecord = {
    id,
    status: "pendiente",
    attempts: 0,
    last_error: "",
    created_at: now,
    updated_at: now,
    ...item,
  };
  await guardarDocumento(STORE, id, queueRecord);
  return { ...queueRecord, id };
}

export async function updateSyncItem(item) {
  const record = {
    ...item,
    updated_at: nowIso(),
  };
  await guardarDocumento(STORE, record.id, record);
  return record;
}

export async function removeSyncItem(id) {
  return eliminarDocumento(STORE, id);
}

export async function removeSyncItemsByEntity(entityType, entityUuid) {
  const items = await listSyncQueue();
  const matches = items.filter((item) => item.entity_type === entityType && item.entity_uuid === entityUuid);
  await Promise.all(matches.map((item) => eliminarDocumento(STORE, item.id)));
  return matches.length;
}
