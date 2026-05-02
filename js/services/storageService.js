import { appConfig } from "../config.js";
import { getCurrentUser } from "./backendService.js";

const ALLOWED_CAPTURE_MODES = new Set(["map", "gps"]);

function userScopedKey(key) {
  const uid = getCurrentUser()?.uid;
  return uid ? `${key}:${uid}` : key;
}

export function getStoredActiveProjectUuid() {
  return localStorage.getItem(userScopedKey(appConfig.storageKeys.activeProjectUuid)) || "";
}

export function setStoredActiveProjectUuid(uuid) {
  const key = userScopedKey(appConfig.storageKeys.activeProjectUuid);
  if (!uuid) {
    localStorage.removeItem(key);
    return;
  }

  localStorage.setItem(key, uuid);
}

export function getStoredDraftCollar() {
  try {
    const raw = localStorage.getItem(userScopedKey(appConfig.storageKeys.draftCollar));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredDraftCollar(draftCollar) {
  const key = userScopedKey(appConfig.storageKeys.draftCollar);
  if (!draftCollar) {
    localStorage.removeItem(key);
    return;
  }

  localStorage.setItem(key, JSON.stringify(draftCollar));
}

export function getStoredCaptureMode() {
  const mode = localStorage.getItem(appConfig.storageKeys.captureMode) || "map";
  return ALLOWED_CAPTURE_MODES.has(mode) ? mode : "map";
}

export function setStoredCaptureMode(mode) {
  const normalizedMode = ALLOWED_CAPTURE_MODES.has(mode) ? mode : "map";
  localStorage.setItem(appConfig.storageKeys.captureMode, normalizedMode);
}

export function getStoredArcGISMapCache() {
  try {
    const raw = localStorage.getItem(appConfig.storageKeys.arcgisMapCache);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredArcGISMapCache(cacheMeta) {
  if (!cacheMeta || !cacheMeta.warmedAt) {
    localStorage.removeItem(appConfig.storageKeys.arcgisMapCache);
    return;
  }

  localStorage.setItem(appConfig.storageKeys.arcgisMapCache, JSON.stringify({
    warmedAt: cacheMeta.warmedAt,
    mapId: cacheMeta.mapId || "",
    mapTitle: cacheMeta.mapTitle || "",
  }));
}

export function getStoredDraftHintDismissed() {
  return localStorage.getItem(appConfig.storageKeys.draftHintDismissed) === "1";
}

export function setStoredDraftHintDismissed(dismissed) {
  if (!dismissed) {
    localStorage.removeItem(appConfig.storageKeys.draftHintDismissed);
    return;
  }

  localStorage.setItem(appConfig.storageKeys.draftHintDismissed, "1");
}
