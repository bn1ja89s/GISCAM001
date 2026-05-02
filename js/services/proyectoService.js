import { appConfig } from "../config.js";
import { createUuid, nowIso } from "../core/helpers.js";
import { deleteAssayByLocalId, listAssaysByCollar } from "../db/assayRepository.js";
import { validateProject } from "../core/validators.js";
import { deleteCollarByLocalId, listCollarsByProject } from "../db/collarRepository.js";
import { deleteLaboratorioByLocalId, listLaboratoriosByAssay } from "../db/laboratorioRepository.js";
import { deleteProjectByLocalId, getProjectByUuid, listProjects, saveProject } from "../db/proyectoRepository.js";
import { deleteSurveyByLocalId, listSurveysByCollar } from "../db/surveyRepository.js";
import { removeSyncItemsByEntity } from "../db/syncRepository.js";
import { enqueueChange } from "./syncService.js";
import { getStoredActiveProjectUuid, setStoredActiveProjectUuid } from "./storageService.js";

async function queueRemoteDelete(entityType, record) {
  await removeSyncItemsByEntity(entityType, record.uuid);

  if (record.global_id_remoto || record.remote_object_id) {
    await enqueueChange(entityType, record.uuid, "delete", record);
  }
}

async function deleteProjectCascade(project, collars) {
  const [surveysByCollar, assaysByCollar] = await Promise.all([
    Promise.all(collars.map((collar) => listSurveysByCollar(collar.uuid))),
    Promise.all(collars.map((collar) => listAssaysByCollar(collar.uuid))),
  ]);

  const surveys = surveysByCollar.flat();
  const assays = assaysByCollar.flat();
  const laboratoriosByAssay = await Promise.all(assays.map((assay) => listLaboratoriosByAssay(assay.uuid)));
  const laboratorios = laboratoriosByAssay.flat();

  for (const laboratorio of laboratorios) {
    await queueRemoteDelete("laboratorio", laboratorio);
    await deleteLaboratorioByLocalId(laboratorio.id_local);
  }

  for (const assay of assays) {
    await queueRemoteDelete("assay", assay);
    await deleteAssayByLocalId(assay.id_local);
  }

  for (const survey of surveys) {
    await queueRemoteDelete("survey", survey);
    await deleteSurveyByLocalId(survey.id_local);
  }

  for (const collar of collars) {
    await queueRemoteDelete("collar", collar);
    await deleteCollarByLocalId(collar.id_local);
  }

  await queueRemoteDelete("proyecto", project);
  await deleteProjectByLocalId(project.id_local);

  return {
    laboratorios: laboratorios.length,
    assays: assays.length,
    surveys: surveys.length,
    collars: collars.length,
  };
}

export async function resolveActiveProjectUuid() {
  const projects = await listProjects();
  const storedUuid = getStoredActiveProjectUuid();
  const storedProject = projects.find((project) => project.uuid === storedUuid);

  if (storedProject && storedProject.estado_sync !== appConfig.status.inactive) {
    return storedProject.uuid;
  }

  if (storedUuid) {
    setStoredActiveProjectUuid("");
  }

  const flaggedProject = projects.find((project) => project.activo && project.estado_sync !== appConfig.status.inactive);
  if (flaggedProject) {
    setStoredActiveProjectUuid(flaggedProject.uuid);
    return flaggedProject.uuid;
  }

  const firstAvailableProject = projects.find((project) => project.estado_sync !== appConfig.status.inactive);
  if (firstAvailableProject) {
    setStoredActiveProjectUuid(firstAvailableProject.uuid);
    return firstAvailableProject.uuid;
  }

  return "";
}

export async function selectActiveProject(uuid) {
  const projects = await listProjects();

  for (const project of projects) {
    if (project.activo === (project.uuid === uuid)) {
      continue;
    }

    await saveProject({
      ...project,
      activo: project.uuid === uuid,
      fecha_modificacion: nowIso(),
    });
  }

  setStoredActiveProjectUuid(uuid);
  return getProjectByUuid(uuid);
}

export async function createProject(data) {
  const now = nowIso();
  const project = {
    uuid: createUuid(),
    global_id_remoto: "",
    remote_object_id: "",
    cod_exploracion: data.cod_exploracion.trim(),
    concesion_area: data.concesion_area.trim(),
    cod_catastral: data.cod_catastral.trim(),
    localizacion: data.localizacion.trim(),
    tecnico: data.tecnico.trim(),
    sr_proyecto: data.sr_proyecto.trim(),
    dem_source_type: data.dem_source_type?.trim() || appConfig.elevation.defaultSourceType,
    dem_service_url: data.dem_service_url?.trim() || "",
    fecha_creacion: now,
    fecha_modificacion: now,
    estado_sync: appConfig.status.pending,
    activo: false,
  };

  const errors = validateProject(project);
  if (errors.length) {
    throw new Error(errors.join(" "));
  }

  const savedProject = await saveProject(project);
  await enqueueChange("proyecto", savedProject.uuid, "create", savedProject);

  const projects = await listProjects();
  if (data.set_active || projects.length === 1) {
    await selectActiveProject(savedProject.uuid);
  }

  return savedProject;
}

export async function updateProject(uuid, data) {
  const existingProject = await getProjectByUuid(uuid);
  if (!existingProject) {
    throw new Error("No se encontro el proyecto a editar.");
  }

  const nextProject = {
    ...existingProject,
    cod_exploracion: data.cod_exploracion.trim(),
    concesion_area: data.concesion_area.trim(),
    cod_catastral: data.cod_catastral.trim(),
    localizacion: data.localizacion.trim(),
    tecnico: data.tecnico.trim(),
    sr_proyecto: data.sr_proyecto.trim(),
    dem_source_type: data.dem_source_type?.trim() || appConfig.elevation.defaultSourceType,
    dem_service_url: data.dem_service_url?.trim() || "",
    fecha_modificacion: nowIso(),
    estado_sync: appConfig.status.pending,
  };

  const errors = validateProject(nextProject);
  if (errors.length) {
    throw new Error(errors.join(" "));
  }

  await saveProject(nextProject);
  await enqueueChange("proyecto", nextProject.uuid, "update", nextProject);

  if (data.set_active) {
    await selectActiveProject(nextProject.uuid);
  }

  return nextProject;
}

export async function deleteOrDeactivateProject(uuid) {
  const project = await getProjectByUuid(uuid);
  if (!project) {
    throw new Error("No se encontro el proyecto.");
  }

  const relatedCollars = await listCollarsByProject(uuid);

  const cascade = await deleteProjectCascade(project, relatedCollars);
  const activeUuid = getStoredActiveProjectUuid();
  if (activeUuid === uuid) {
    setStoredActiveProjectUuid("");
  }
  return { mode: "deleted", project, cascade };
}