import { appConfig } from "../config.js";
import { nowIso } from "../core/helpers.js";
import { listAssays } from "../db/assayRepository.js";
import { listCollars } from "../db/collarRepository.js";
import { listGuardado } from "../db/guardadoRepository.js";
import { listLaboratorios } from "../db/laboratorioRepository.js";
import { listProjects } from "../db/proyectoRepository.js";
import { listSurveys } from "../db/surveyRepository.js";
import { listSyncQueue } from "../db/syncRepository.js";
import { eliminarDocumento, guardarDocumento, obtenerDocumentos } from "./backendService.js";
import { getStoredActiveProjectUuid, getStoredDraftCollar, setStoredActiveProjectUuid, setStoredDraftCollar } from "./storageService.js";

function downloadTextFile(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export async function exportBackup() {
  const [projects, collars, syncQueue, surveys, assays, laboratorios, guardado] = await Promise.all([
    listProjects(),
    listCollars(),
    listSyncQueue(),
    listSurveys(),
    listAssays(),
    listLaboratorios(),
    listGuardado(),
  ]);

  const backup = {
    app: appConfig.appName,
    schema: 1,
    exported_at: nowIso(),
    active_project_uuid: getStoredActiveProjectUuid(),
    draft_collar: getStoredDraftCollar(),
    data: {
      proyectos: projects,
      collars,
      sync_queue: syncQueue,
      surveys,
      assays,
      laboratorios,
      guardado,
    },
  };

  const stamp = backup.exported_at.replaceAll(":", "-").replaceAll(".", "-");
  downloadTextFile(`exploracion-backup-${stamp}.json`, JSON.stringify(backup, null, 2));
  return backup;
}

async function replaceCollection(coleccion, records, idField = "uuid") {
  const existing = await obtenerDocumentos(coleccion);
  await Promise.all(existing.map((item) => eliminarDocumento(coleccion, item.id || item[idField])));
  await Promise.all((records || []).map((item) => guardarDocumento(coleccion, item[idField] || item.id || item.id_local, item)));
}

export async function importBackup(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);

  if (!parsed?.data?.proyectos || !parsed?.data?.collars || !parsed?.data?.sync_queue) {
    throw new Error("El archivo de respaldo no tiene el formato esperado.");
  }

  await replaceCollection("laboratorios", parsed.data.laboratorios || []);
  await replaceCollection("assays", parsed.data.assays || []);
  await replaceCollection("surveys", parsed.data.surveys || []);
  await replaceCollection("sync_queue", parsed.data.sync_queue || [], "id");
  await replaceCollection("collars", parsed.data.collars || []);
  await replaceCollection("proyectos", parsed.data.proyectos || []);
  await replaceCollection("guardado", parsed.data.guardado || [], "id");

  setStoredActiveProjectUuid(parsed.active_project_uuid || "");
  setStoredDraftCollar(parsed.draft_collar || null);

  return {
    projects: parsed.data.proyectos.length,
    collars: parsed.data.collars.length,
    syncQueue: parsed.data.sync_queue.length,
    surveys: (parsed.data.surveys || []).length,
    assays: (parsed.data.assays || []).length,
    laboratorios: (parsed.data.laboratorios || []).length,
  };
}
