import { sortByDate } from "../core/helpers.js";
import { eliminarDocumento, guardarDocumento, obtenerDocumento, obtenerDocumentos } from "../services/backendService.js";

const STORE = "collars";

export async function listCollars() {
  return sortByDate(await obtenerDocumentos(STORE));
}

export async function listCollarsByProject(projectUuid) {
  return (await listCollars()).filter((collar) => collar.proyecto_uuid === projectUuid);
}

export function getCollarByUuid(uuid) {
  return obtenerDocumento(STORE, uuid);
}

export async function saveCollar(collar) {
  const id = collar.uuid || collar.id || collar.id_local;
  const record = { ...collar, id_local: collar.id_local || id };
  await guardarDocumento(STORE, id, record);
  return record;
}

export function deleteCollarByLocalId(idLocal) {
  return eliminarDocumento(STORE, idLocal);
}

export async function getCollarByRemoteIds(globalId, objectId) {
  const items = await listCollars();
  return (
    items.find(
      (item) =>
        (globalId && item.global_id_remoto === globalId) ||
        (objectId && String(item.remote_object_id || "") === String(objectId)),
    ) || null
  );
}
