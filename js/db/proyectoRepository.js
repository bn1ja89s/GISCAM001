import { sortByDate } from "../core/helpers.js";
import { eliminarDocumento, guardarYSincronizar, obtenerDocumento, obtenerDocumentos } from "../services/backendService.js";

const STORE = "proyectos";

export async function listProjects() {
  return sortByDate(await obtenerDocumentos(STORE));
}

export function getProjectByUuid(uuid) {
  return obtenerDocumento(STORE, uuid);
}

export async function saveProject(project) {
  const id = project.uuid || project.id || project.id_local;
  const record = { ...project, id_local: project.id_local || id };
  return guardarYSincronizar(STORE, record);
}

export function deleteProjectByLocalId(idLocal) {
  return eliminarDocumento(STORE, idLocal);
}

export async function getProjectByRemoteIds(globalId, objectId) {
  const items = await listProjects();
  return (
    items.find(
      (item) =>
        (globalId && item.global_id_remoto === globalId) ||
        (objectId && String(item.remote_object_id || "") === String(objectId)),
    ) || null
  );
}
