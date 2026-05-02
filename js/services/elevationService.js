import { appConfig } from "../config.js";
import { enrichPointForProject, nowIso, toNullableNumber } from "../core/helpers.js";
import { listCollars, saveCollar } from "../db/collarRepository.js";
import { listProjects } from "../db/proyectoRepository.js";
import { resolvePointElevation } from "./mapService.js";
import { enqueueChange } from "./syncService.js";

function normalizeNullableValue(value) {
  return value === "" || value === undefined ? null : value;
}

function getProjectForRecord(projectByUuid, record, fallbackProject = null) {
  return projectByUuid.get(record?.proyecto_uuid) || fallbackProject;
}

function mergeResolvedPoint(record, resolvedPoint, project) {
  const enrichedPoint = project ? enrichPointForProject(resolvedPoint, project.sr_proyecto) : resolvedPoint;
  const elevationStatus = enrichedPoint?.elevation_status || (enrichedPoint?.elevacion != null ? "resolved" : "pending");

  return {
    ...record,
    latitude: enrichedPoint?.latitude ?? record?.latitude ?? null,
    longitude: enrichedPoint?.longitude ?? record?.longitude ?? null,
    este: enrichedPoint?.este ?? record?.este ?? null,
    norte: enrichedPoint?.norte ?? record?.norte ?? null,
    elevacion: enrichedPoint?.elevacion ?? null,
    geometry: enrichedPoint?.geometry || record?.geometry || null,
    elevation_status: elevationStatus,
    elevation_source: enrichedPoint?.elevation_source || record?.elevation_source || "",
    elevation_resolved_at: elevationStatus === "resolved"
      ? enrichedPoint?.elevation_resolved_at || record?.elevation_resolved_at || nowIso()
      : "",
  };
}

function didElevationChange(currentRecord, nextRecord) {
  return (
    normalizeNullableValue(toNullableNumber(currentRecord?.elevacion)) !== normalizeNullableValue(toNullableNumber(nextRecord?.elevacion)) ||
    String(currentRecord?.elevation_status || "") !== String(nextRecord?.elevation_status || "") ||
    String(currentRecord?.elevation_source || "") !== String(nextRecord?.elevation_source || "") ||
    normalizeNullableValue(toNullableNumber(currentRecord?.geometry?.z)) !== normalizeNullableValue(toNullableNumber(nextRecord?.geometry?.z))
  );
}

export function hasPendingElevation(record) {
  if (!record) {
    return false;
  }

  if (record.elevation_status === "pending") {
    return true;
  }

  const hasCoordinates = record.latitude != null && record.longitude != null;
  return hasCoordinates && toNullableNumber(record.elevacion) == null;
}

export async function resolveDraftCollarElevation(draftCollar, activeProject, options = {}) {
  if (!draftCollar || !hasPendingElevation(draftCollar)) {
    return draftCollar;
  }

  const online = options.online ?? navigator.onLine;
  if (!appConfig.elevation.enabled || !online) {
    return draftCollar;
  }

  const resolvedPoint = await resolvePointElevation(draftCollar, {
    project: activeProject,
    online,
    preferExistingElevation: false,
  });

  if (!resolvedPoint) {
    return draftCollar;
  }

  return mergeResolvedPoint(draftCollar, resolvedPoint, activeProject);
}

export async function resolvePendingCollarElevations(options = {}) {
  const online = options.online ?? navigator.onLine;
  if (!appConfig.elevation.enabled || !online) {
    return {
      attempted: 0,
      resolved: 0,
      pending: 0,
      errors: 0,
      skipped: 0,
    };
  }

  const [projects, collars] = await Promise.all([listProjects(), listCollars()]);
  const projectByUuid = new Map(projects.map((project) => [project.uuid, project]));
  let attempted = 0;
  let resolved = 0;
  let pending = 0;
  let errors = 0;
  let skipped = 0;

  for (const collar of collars) {
    if (!hasPendingElevation(collar)) {
      continue;
    }

    const project = getProjectForRecord(projectByUuid, collar);
    if (!project) {
      skipped += 1;
      continue;
    }

    attempted += 1;

    try {
      const resolvedPoint = await resolvePointElevation(collar, {
        project,
        online,
        preferExistingElevation: false,
      });

      if (!resolvedPoint) {
        pending += 1;
        continue;
      }

      const nextCollar = {
        ...mergeResolvedPoint(collar, resolvedPoint, project),
        fecha_modificacion: nowIso(),
      };

      if (!didElevationChange(collar, nextCollar)) {
        if (hasPendingElevation(nextCollar)) {
          pending += 1;
        } else {
          resolved += 1;
        }
        continue;
      }

      nextCollar.estado_sync = appConfig.status.pending;
      nextCollar.last_error = "";

      await saveCollar(nextCollar);
      await enqueueChange(
        "collar",
        nextCollar.uuid,
        nextCollar.global_id_remoto || nextCollar.remote_object_id ? "update" : "create",
        nextCollar,
      );

      if (hasPendingElevation(nextCollar)) {
        pending += 1;
      } else {
        resolved += 1;
      }
    } catch {
      errors += 1;
    }
  }

  return {
    attempted,
    resolved,
    pending,
    errors,
    skipped,
  };
}