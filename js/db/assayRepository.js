import { sortByDate } from "../core/helpers.js";
import { eliminarDocumento, guardarYSincronizar, obtenerDocumento, obtenerDocumentos } from "../services/backendService.js";

const STORE = "assays";

export async function listAssays() {
  return sortByDate(await obtenerDocumentos(STORE));
}

export function getAssayByUuid(uuid) {
  return obtenerDocumento(STORE, uuid);
}

export async function listAssaysByCollar(collarUuid) {
  return (await listAssays()).filter((assay) => assay.collar_uuid === collarUuid);
}

export async function saveAssay(assay) {
  const id = assay.uuid || assay.id || assay.id_local;
  const record = { ...assay, id_local: assay.id_local || id };
  return guardarYSincronizar(STORE, record);
}

export function deleteAssayByLocalId(idLocal) {
  return eliminarDocumento(STORE, idLocal);
}
