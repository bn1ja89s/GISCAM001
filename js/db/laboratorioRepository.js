import { sortByDate } from "../core/helpers.js";
import { eliminarDocumento, guardarDocumento, obtenerDocumento, obtenerDocumentos } from "../services/backendService.js";

const STORE = "laboratorios";

export async function listLaboratorios() {
  return sortByDate(await obtenerDocumentos(STORE));
}

export function getLaboratorioByUuid(uuid) {
  return obtenerDocumento(STORE, uuid);
}

export async function listLaboratoriosByAssay(assayUuid) {
  return (await listLaboratorios()).filter((laboratorio) => laboratorio.assay_uuid === assayUuid);
}

export async function saveLaboratorio(laboratorio) {
  const id = laboratorio.uuid || laboratorio.id || laboratorio.id_local;
  const record = { ...laboratorio, id_local: laboratorio.id_local || id };
  await guardarDocumento(STORE, id, record);
  return record;
}

export function deleteLaboratorioByLocalId(idLocal) {
  return eliminarDocumento(STORE, idLocal);
}
