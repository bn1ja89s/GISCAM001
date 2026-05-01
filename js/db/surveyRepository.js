import { sortByDate } from "../core/helpers.js";
import { eliminarDocumento, guardarDocumento, obtenerDocumento, obtenerDocumentos } from "../services/backendService.js";

const STORE = "surveys";

export async function listSurveys() {
  return sortByDate(await obtenerDocumentos(STORE));
}

export function getSurveyByUuid(uuid) {
  return obtenerDocumento(STORE, uuid);
}

export async function listSurveysByCollar(collarUuid) {
  return (await listSurveys()).filter((survey) => survey.collar_uuid === collarUuid);
}

export async function saveSurvey(survey) {
  const id = survey.uuid || survey.id || survey.id_local;
  const record = { ...survey, id_local: survey.id_local || id };
  await guardarDocumento(STORE, id, record);
  return record;
}

export function deleteSurveyByLocalId(idLocal) {
  return eliminarDocumento(STORE, idLocal);
}
