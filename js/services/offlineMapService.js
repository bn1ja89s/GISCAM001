import { appConfig, TILE_CONFIG } from "../config.js";
import { qs, setHTML } from "../core/dom.js";
import { roundNumber } from "../core/helpers.js";
import {
  buildTileId,
  clearMetadata,
  clearTiles,
  countTiles,
  deleteTile,
  getMetadata,
  getTile,
  listTiles,
  saveMetadata,
  saveTile,
} from "../db/offlineTilesRepository.js";

const TILE_SIZE = 256;
const MAP_WIDTH = 960;
const MAP_HEIGHT = 640;
const MIN_ZOOM = 2;
const MAX_ZOOM = 19;
const DEFAULT_ZOOM = 10;
const DEFAULT_CENTER = { longitude: -78.5, latitude: -1.8 };
const EARTH_R = 6371000;
const TILE_ERROR_MESSAGE = "Error de red: no se pudo conectar con MapTiler.";
const BLOCKED_TILE_STATUSES = [401, 403, 404, 429, 500];
const TILE_TEMPLATE_PLACEHOLDERS = [
  ["TU", "PROVEEDOR"].join("_"),
  ["TU", "API", "KEY"].join("_"),
];
const AUTHORIZED_TILE_ORIGINS = [
  "http://localhost",
  "http://127.0.0.1",
  "https://bn1ja89s.github.io",
];

const offlineMapState = {
  container: null,
  onCapture: null,
  onSelectCollar: null,
  captureEnabled: false,
  collars: [],
  savedItems: [],
  draftPoint: null,
  currentLocation: null,
  center: { ...DEFAULT_CENTER },
  zoom: DEFAULT_ZOOM,
  metadata: null,
  hasTiles: false,
  message: "",
  listenersBound: false,
  showLabels: true,
  selectedCollarUuid: "",
  tileObjectUrls: [],
  dragging: false,
  dragStart: null,
  drawing: {
    mode: null,
    vertices: [],
    unit: "m",
    onVertex: null,
  },
};

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeAttribute(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function maskTileUrlTemplate(template = "") {
  const value = String(template || "");
  return value.replace(/([?&]key=)([^&]+)/i, (_match, prefix, key) => {
    if (key.length <= 8) {
      return `${prefix}****`;
    }

    return `${prefix}${key.slice(0, 6)}...${key.slice(-4)}`;
  });
}

function getCurrentOriginAuthorization(origin = location.origin) {
  let parsedOrigin = null;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    return {
      origin,
      authorized: false,
      authorizedOrigins: AUTHORIZED_TILE_ORIGINS,
      note: "Origin no valido para comparar con MapTiler.",
    };
  }

  const authorized = AUTHORIZED_TILE_ORIGINS.some((allowedOrigin) => {
    const allowed = new URL(allowedOrigin);
    return allowed.protocol === parsedOrigin.protocol && allowed.hostname === parsedOrigin.hostname;
  });

  return {
    origin,
    authorized,
    authorizedOrigins: AUTHORIZED_TILE_ORIGINS,
    note: authorized
      ? "El origin actual coincide con la lista local de referencia."
      : "El origin actual no coincide con la lista local de referencia. Esto es solo una advertencia.",
  };
}

function getTileDownloadErrorMessage({ status = 0, contentType = "" } = {}) {
  if (status === 401) {
    return "API key invalida.";
  }

  if (status === 403) {
    return "MapTiler rechazo la peticion. Revisa restricciones de dominio o API key.";
  }

  if (status === 404) {
    return "URL mal formada.";
  }

  if (status === 429) {
    return "Limite de uso alcanzado.";
  }

  if (contentType && !isValidTileContentType(contentType)) {
    return "MapTiler devolvio una respuesta que no es imagen.";
  }

  return status
    ? `MapTiler devolvio status ${status}. Revisa la consola para ver el detalle real.`
    : TILE_ERROR_MESSAGE;
}

function logTileDownloadFailure({ response = null, contentType = "", url = "", reason = "" } = {}) {
  console.error("[offline-map] tile fetch failed", {
    reason,
    status: response?.status ?? null,
    statusText: response?.statusText ?? "",
    contentType,
    url,
    origin: location.origin,
    referrer: document.referrer,
  });
}

function normalizeLonLat(longitude, latitude) {
  const lon = Number(longitude);
  const lat = Number(latitude);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return null;
  }

  return {
    longitude: clamp(lon, -180, 180),
    latitude: clamp(lat, -85.05112878, 85.05112878),
  };
}

function parseGeometryData(value) {
  if (!value || typeof value !== "string") {
    return value || null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function firstFiniteNumber(...values) {
  for (const value of values) {
    if (value === "" || value === null || value === undefined) {
      continue;
    }

    const number = Number(value);
    if (Number.isFinite(number)) {
      return number;
    }
  }

  return null;
}

function getPointCoordinates(point) {
  const geometry = parseGeometryData(point?.geometry) || {};
  const longitude = firstFiniteNumber(point?.longitude, point?.lon, point?.x, geometry?.x, geometry?.longitude, geometry?.lon);
  const latitude = firstFiniteNumber(point?.latitude, point?.lat, point?.y, geometry?.y, geometry?.latitude, geometry?.lat);
  const coordinates = normalizeLonLat(longitude, latitude);
  if (!coordinates) {
    return null;
  }

  return {
    longitude: roundNumber(coordinates.longitude, 6),
    latitude: roundNumber(coordinates.latitude, 6),
  };
}

function lonLatToWorldPixel(longitude, latitude, zoom) {
  const normalized = normalizeLonLat(longitude, latitude) || DEFAULT_CENTER;
  const sinLat = Math.sin((normalized.latitude * Math.PI) / 180);
  const scale = TILE_SIZE * 2 ** zoom;

  return {
    x: ((normalized.longitude + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

function worldPixelToLonLat(x, y, zoom) {
  const scale = TILE_SIZE * 2 ** zoom;
  const longitude = (x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / scale;
  const latitude = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return {
    longitude: roundNumber(longitude, 6),
    latitude: roundNumber(latitude, 6),
  };
}

export function lonLatToTile(lon, lat, zoom) {
  const pixel = lonLatToWorldPixel(lon, lat, zoom);
  const maxTile = 2 ** zoom - 1;
  return {
    x: clamp(Math.floor(pixel.x / TILE_SIZE), 0, maxTile),
    y: clamp(Math.floor(pixel.y / TILE_SIZE), 0, maxTile),
    z: zoom,
  };
}

export function tileToLonLat(x, y, zoom) {
  return worldPixelToLonLat(x * TILE_SIZE, y * TILE_SIZE, zoom);
}

export function buildTileUrl(z, x, y) {
  return TILE_CONFIG.urlTemplate
    .replaceAll("{z}", encodeURIComponent(z))
    .replaceAll("{x}", encodeURIComponent(x))
    .replaceAll("{y}", encodeURIComponent(y));
}

function getViewportSize() {
  const rect = offlineMapState.container?.getBoundingClientRect();
  return {
    width: Math.max(Math.round(rect?.width || MAP_WIDTH), 320),
    height: Math.max(Math.round(rect?.height || MAP_HEIGHT), 240),
  };
}

function getCenterPixel() {
  return lonLatToWorldPixel(offlineMapState.center.longitude, offlineMapState.center.latitude, offlineMapState.zoom);
}

function pointToScreen(point) {
  const coordinates = getPointCoordinates(point);
  if (!coordinates) {
    return null;
  }

  const viewport = getViewportSize();
  const centerPixel = getCenterPixel();
  const pointPixel = lonLatToWorldPixel(coordinates.longitude, coordinates.latitude, offlineMapState.zoom);
  return {
    x: roundNumber(viewport.width / 2 + pointPixel.x - centerPixel.x, 2),
    y: roundNumber(viewport.height / 2 + pointPixel.y - centerPixel.y, 2),
    longitude: coordinates.longitude,
    latitude: coordinates.latitude,
  };
}

function screenToMap(clientX, clientY, surface) {
  const rect = surface.getBoundingClientRect();
  const centerPixel = getCenterPixel();
  const x = centerPixel.x + (clientX - rect.left) - rect.width / 2;
  const y = centerPixel.y + (clientY - rect.top) - rect.height / 2;
  return worldPixelToLonLat(x, y, offlineMapState.zoom);
}

function getVisibleTileRange(zoom = offlineMapState.zoom) {
  const viewport = getViewportSize();
  const centerPixel = lonLatToWorldPixel(offlineMapState.center.longitude, offlineMapState.center.latitude, zoom);
  const worldSize = TILE_SIZE * 2 ** zoom;
  const maxTile = 2 ** zoom - 1;
  const minPixelX = clamp(centerPixel.x - viewport.width / 2, 0, worldSize);
  const maxPixelX = clamp(centerPixel.x + viewport.width / 2, 0, worldSize);
  const minPixelY = clamp(centerPixel.y - viewport.height / 2, 0, worldSize);
  const maxPixelY = clamp(centerPixel.y + viewport.height / 2, 0, worldSize);

  return {
    minX: clamp(Math.floor(minPixelX / TILE_SIZE), 0, maxTile),
    maxX: clamp(Math.floor(maxPixelX / TILE_SIZE), 0, maxTile),
    minY: clamp(Math.floor(minPixelY / TILE_SIZE), 0, maxTile),
    maxY: clamp(Math.floor(maxPixelY / TILE_SIZE), 0, maxTile),
    centerPixel,
    viewport,
  };
}

function getExtentFromView(view) {
  const extent = view?.extent;
  if (!extent) {
    return null;
  }

  const wkid = extent.spatialReference?.wkid;
  const isWebMercator = extent.spatialReference?.isWebMercator || wkid === 3857 || wkid === 102100 || wkid === 102113;

  if (!isWebMercator) {
    return {
      xmin: Number(extent.xmin),
      ymin: Number(extent.ymin),
      xmax: Number(extent.xmax),
      ymax: Number(extent.ymax),
    };
  }

  const min = webMercatorToLonLat(extent.xmin, extent.ymin);
  const max = webMercatorToLonLat(extent.xmax, extent.ymax);
  return {
    xmin: min.longitude,
    ymin: min.latitude,
    xmax: max.longitude,
    ymax: max.latitude,
  };
}

function webMercatorToLonLat(x, y) {
  const longitude = (Number(x) / 20037508.34) * 180;
  let latitude = (Number(y) / 20037508.34) * 180;
  latitude = (180 / Math.PI) * (2 * Math.atan(Math.exp((latitude * Math.PI) / 180)) - Math.PI / 2);
  return normalizeLonLat(longitude, latitude) || DEFAULT_CENTER;
}

function normalizeExtent(extent) {
  const xmin = Number(extent?.xmin);
  const ymin = Number(extent?.ymin);
  const xmax = Number(extent?.xmax);
  const ymax = Number(extent?.ymax);
  if (![xmin, ymin, xmax, ymax].every(Number.isFinite)) {
    return null;
  }

  return {
    xmin: clamp(Math.min(xmin, xmax), -180, 180),
    ymin: clamp(Math.min(ymin, ymax), -85.05112878, 85.05112878),
    xmax: clamp(Math.max(xmin, xmax), -180, 180),
    ymax: clamp(Math.max(ymin, ymax), -85.05112878, 85.05112878),
  };
}

export function calculateTilesForExtent(extent, minZoom = TILE_CONFIG.offlineMinZoom, maxZoom = TILE_CONFIG.offlineMaxZoom) {
  const normalized = normalizeExtent(extent);
  if (!normalized) {
    return [];
  }

  const tiles = [];
  const minZ = clamp(Number(minZoom) || TILE_CONFIG.offlineMinZoom, MIN_ZOOM, MAX_ZOOM);
  const maxZ = clamp(Number(maxZoom) || TILE_CONFIG.offlineMaxZoom, minZ, MAX_ZOOM);

  for (let z = minZ; z <= maxZ; z++) {
    const northwest = lonLatToTile(normalized.xmin, normalized.ymax, z);
    const southeast = lonLatToTile(normalized.xmax, normalized.ymin, z);
    for (let x = northwest.x; x <= southeast.x; x++) {
      for (let y = northwest.y; y <= southeast.y; y++) {
        tiles.push({ provider: TILE_CONFIG.provider, z, x, y, url: buildTileUrl(z, x, y) });
      }
    }
  }

  return tiles;
}

function getExtentCenter(extent) {
  return {
    longitude: roundNumber((extent.xmin + extent.xmax) / 2, 6),
    latitude: roundNumber((extent.ymin + extent.ymax) / 2, 6),
  };
}

function isTileProviderConfigured() {
  const template = String(TILE_CONFIG.urlTemplate || "").trim();
  return Boolean(template)
    && TILE_TEMPLATE_PLACEHOLDERS.every((placeholder) => !template.includes(placeholder))
    && template.includes("{z}")
    && template.includes("{x}")
    && template.includes("{y}");
}

function isValidTileContentType(contentType = "") {
  const normalized = String(contentType).split(";")[0].trim().toLowerCase();
  return normalized.startsWith("image/");
}

function getStoredTileContentType(tile) {
  return String(tile?.contentType || tile?.blob?.type || "").split(";")[0].trim().toLowerCase();
}

function isValidStoredTile(tile) {
  const contentType = getStoredTileContentType(tile);
  const size = Number(tile?.size ?? tile?.blob?.size ?? 0);
  return Boolean(tile?.blob) && size > 0 && isValidTileContentType(contentType);
}

export async function downloadVisibleArea(view, options = {}) {
  console.log("[offline-map] downloading visible area");
  if (!isTileProviderConfigured()) {
    throw new Error("Configura TILE_CONFIG.urlTemplate con tu proveedor de tiles antes de descargar mapa offline.");
  }

  const extent = normalizeExtent(getExtentFromView(view));
  if (!extent) {
    throw new Error("No se pudo leer la zona visible del mapa.");
  }

  const minZoom = Number(options.minZoom) || TILE_CONFIG.offlineMinZoom;
  const maxZoom = Number(options.maxZoom) || TILE_CONFIG.offlineMaxZoom;
  const tiles = calculateTilesForExtent(extent, minZoom, maxZoom);
  console.log("[offline-map] calculated tiles:", tiles.length);

  if (!tiles.length) {
    throw new Error("No se calcularon tiles para la zona visible.");
  }

  const shouldContinue = await options.onCalculated?.({ total: tiles.length, extent, minZoom, maxZoom });
  if (shouldContinue === false) {
    return {
      total: tiles.length,
      downloaded: 0,
      skipped: 0,
      errors: 0,
      cancelled: true,
      metadata: null,
    };
  }

  let processed = 0;
  let downloaded = 0;
  let skipped = 0;
  let errors = 0;
  let blocked = 0;
  let invalid = 0;
  let lastErrorMessage = "";

  for (const tile of tiles) {
    processed++;
    const url = tile.url;

    const existingTile = await getTile(tile.provider, tile.z, tile.x, tile.y);
    if (existingTile && isValidStoredTile(existingTile)) {
      console.log("[offline-map] tile already exists", tile.z, tile.x, tile.y);
      skipped++;
      options.onProgress?.({ processed, downloaded, skipped, errors, blocked, invalid, total: tiles.length, tile });
      continue;
    }

    if (existingTile && !isValidStoredTile(existingTile)) {
      await deleteTile(existingTile.id);
      invalid++;
      console.warn("[offline-map] invalid stored tile removed", existingTile.id);
    }

    try {
      console.log("[offline-map] attempting tile fetch", {
        origin: location.origin,
        hostname: location.hostname,
        href: location.href,
        url,
      });
      const response = await fetch(url, { mode: "cors" });
      const contentType = response.headers.get("content-type") || "";
      console.log("[offline-map] tile response", {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        contentType,
        url,
      });
      if (!response.ok) {
        lastErrorMessage = getTileDownloadErrorMessage({ status: response.status, contentType });
        logTileDownloadFailure({ response, contentType, url, reason: lastErrorMessage });
        if (BLOCKED_TILE_STATUSES.includes(response.status)) {
          blocked++;
        }
        errors++;
        options.onProgress?.({ processed, downloaded, skipped, errors, blocked, invalid, total: tiles.length, tile });
        continue;
      }

      if (!isValidTileContentType(contentType)) {
        lastErrorMessage = getTileDownloadErrorMessage({ status: response.status, contentType });
        logTileDownloadFailure({ response, contentType, url, reason: lastErrorMessage });
        invalid++;
        errors++;
        options.onProgress?.({ processed, downloaded, skipped, errors, blocked, invalid, total: tiles.length, tile });
        continue;
      }

      const blob = await response.blob();
      if (!blob.size || !isValidTileContentType(blob.type || contentType)) {
        lastErrorMessage = getTileDownloadErrorMessage({ status: response.status, contentType: blob.type || contentType });
        logTileDownloadFailure({ response, contentType: blob.type || contentType, url, reason: lastErrorMessage });
        invalid++;
        errors++;
        options.onProgress?.({ processed, downloaded, skipped, errors, blocked, invalid, total: tiles.length, tile });
        continue;
      }

      console.log("[offline-map] downloaded tile", tile.z, tile.x, tile.y);
      await saveTile({
        id: buildTileId(tile.provider, tile.z, tile.x, tile.y),
        provider: tile.provider,
        z: tile.z,
        x: tile.x,
        y: tile.y,
        blob,
        contentType: blob.type || contentType,
        size: blob.size,
        createdAt: new Date().toISOString(),
        projectId: options.projectId || "",
      });
      console.log("[offline-map] saved tile", tile.z, tile.x, tile.y);
      downloaded++;
    } catch (error) {
      errors++;
      lastErrorMessage = TILE_ERROR_MESSAGE;
      logTileDownloadFailure({ url, reason: error?.message || lastErrorMessage });
      console.warn("[offline-map] missing tile", tile.z, tile.x, tile.y, error);
    }

    options.onProgress?.({ processed, downloaded, skipped, errors, blocked, invalid, total: tiles.length, tile });
  }

  if (!downloaded && errors && !skipped) {
    throw new Error(lastErrorMessage || TILE_ERROR_MESSAGE);
  }

  const metadata = {
    id: "current",
    provider: TILE_CONFIG.provider,
    bbox: extent,
    minZoom,
    maxZoom,
    tileCount: await countTiles(TILE_CONFIG.provider),
    downloadedAt: new Date().toISOString(),
    projectId: options.projectId || "",
    center: getExtentCenter(extent),
    zoom: clamp(Math.round(view?.zoom || maxZoom), minZoom, maxZoom),
  };
  await saveMetadata(metadata);

  return {
    total: tiles.length,
    downloaded,
    skipped,
    errors,
    blocked,
    invalid,
    lastErrorMessage,
    metadata,
  };
}

export async function hasOfflineTiles() {
  const validation = await validateOfflineTiles(TILE_CONFIG.provider);
  return validation.valid > 0;
}

export async function validateOfflineTiles(provider = TILE_CONFIG.provider) {
  const tiles = await listTiles(provider);
  const invalidTiles = tiles.filter((tile) => !isValidStoredTile(tile));
  const totalBytes = tiles.reduce((sum, tile) => sum + Number(tile?.size ?? tile?.blob?.size ?? 0), 0);
  return {
    provider,
    total: tiles.length,
    valid: tiles.length - invalidTiles.length,
    invalid: invalidTiles.length,
    invalidIds: invalidTiles.map((tile) => tile.id),
    totalBytes,
  };
}

export async function clearInvalidTiles(provider = TILE_CONFIG.provider) {
  const validation = await validateOfflineTiles(provider);
  await Promise.all(validation.invalidIds.map((id) => deleteTile(id)));
  const remainingTiles = await countTiles(provider);
  if (!remainingTiles) {
    await clearMetadata("current");
  }
  return {
    ...validation,
    removed: validation.invalidIds.length,
    remaining: remainingTiles,
  };
}

export async function getOfflineMapDiagnostics({ mapEngine = "unknown", online = navigator.onLine } = {}) {
  const metadata = await getMetadata("current");
  const validation = await validateOfflineTiles(TILE_CONFIG.provider);
  const allValidation = await validateOfflineTiles("");
  const registration = navigator.serviceWorker ? await navigator.serviceWorker.getRegistration("./").catch(() => null) : null;
  const standalone = window.matchMedia?.("(display-mode: standalone)")?.matches || navigator.standalone === true;
  const originAuthorization = getCurrentOriginAuthorization(location.origin);

  return {
    url: location.href,
    locationHref: location.href,
    origin: location.origin,
    locationOrigin: location.origin,
    currentOriginAuthorized: originAuthorization.authorized,
    originAuthorizationNote: originAuthorization.note,
    authorizedTileOrigins: originAuthorization.authorizedOrigins,
    pathname: location.pathname,
    serviceWorkerActive: Boolean(registration?.active),
    serviceWorkerScope: registration?.scope || "",
    standalone,
    online,
    mapEngine,
    provider: TILE_CONFIG.provider,
    urlTemplate: maskTileUrlTemplate(TILE_CONFIG.urlTemplate),
    tileProvider: TILE_CONFIG.provider,
    tileUrlTemplate: maskTileUrlTemplate(TILE_CONFIG.urlTemplate),
    providerConfigured: isTileProviderConfigured(),
    offlineMinZoom: TILE_CONFIG.offlineMinZoom,
    offlineMaxZoom: TILE_CONFIG.offlineMaxZoom,
    tileCount: validation.total,
    validTiles: validation.valid,
    invalidTiles: validation.invalid,
    approxSizeMb: roundNumber(validation.totalBytes / 1048576, 2),
    allProvidersTileCount: allValidation.total,
    allProvidersApproxSizeMb: roundNumber(allValidation.totalBytes / 1048576, 2),
    metadata,
  };
}

export async function clearOfflineMap() {
  await clearInvalidTiles("");
  await clearTiles("");
  await clearMetadata("");
  offlineMapState.metadata = null;
  offlineMapState.hasTiles = false;
  offlineMapState.message = "No hay mapa offline descargado para esta zona";
  if (qs("[data-offline-map-shell]", offlineMapState.container)) {
    renderOfflineMap();
  }
}

function revokeTileObjectUrls() {
  offlineMapState.tileObjectUrls.forEach((url) => URL.revokeObjectURL(url));
  offlineMapState.tileObjectUrls = [];
}

function renderGrid() {
  const viewport = getViewportSize();
  const lines = [];
  const verticalCount = 8;
  const horizontalCount = 6;

  for (let i = 0; i <= verticalCount; i++) {
    const x = (viewport.width / verticalCount) * i;
    const top = screenPointToLonLat(x, 0);
    lines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${viewport.height}" class="offline-map-grid-line" />`);
    lines.push(`<text x="${x + 6}" y="${viewport.height - 14}" class="offline-map-grid-label">${roundNumber(top.longitude, 3)}</text>`);
  }

  for (let i = 0; i <= horizontalCount; i++) {
    const y = (viewport.height / horizontalCount) * i;
    const left = screenPointToLonLat(0, y);
    lines.push(`<line x1="0" y1="${y}" x2="${viewport.width}" y2="${y}" class="offline-map-grid-line" />`);
    lines.push(`<text x="12" y="${Math.max(16, y - 6)}" class="offline-map-grid-label">${roundNumber(left.latitude, 3)}</text>`);
  }

  return lines.join("");
}

function screenPointToLonLat(x, y) {
  const viewport = getViewportSize();
  const centerPixel = getCenterPixel();
  return worldPixelToLonLat(centerPixel.x + x - viewport.width / 2, centerPixel.y + y - viewport.height / 2, offlineMapState.zoom);
}

function renderCollarMarkers() {
  return offlineMapState.collars.map((collar) => {
    const point = pointToScreen(collar);
    if (!point) {
      return "";
    }

    const markerClass = collar.estado_sync === appConfig.status.error
      ? "offline-map-marker offline-map-marker--error"
      : collar.estado_sync === appConfig.status.synced
        ? "offline-map-marker offline-map-marker--synced"
        : "offline-map-marker offline-map-marker--pending";
    const isSelected = offlineMapState.selectedCollarUuid === collar.uuid;

    return `
      <g class="offline-map-marker-group" transform="translate(${point.x} ${point.y})">
        <title>${escapeAttribute(collar.hole_id || "Collar")}</title>
        ${isSelected ? '<circle r="10" class="offline-map-marker-ring" />' : ""}
        <circle r="6" class="${markerClass}" />
        ${offlineMapState.showLabels && collar.hole_id ? `<text x="10" y="-10" class="offline-map-marker-label">${escapeAttribute(collar.hole_id)}</text>` : ""}
      </g>
    `;
  }).join("");
}

function renderSavedItems() {
  return offlineMapState.savedItems.map((item) => {
    if (item.tipo === "area" && item.vertices?.length >= 3) {
      const points = item.vertices.map((vertex) => pointToScreen(vertex)).filter(Boolean);
      if (points.length < 3) {
        return "";
      }

      return `<polygon points="${points.map((point) => `${point.x},${point.y}`).join(" ")}" class="offline-map-saved-area" style="--saved-color:${escapeAttribute(item.color || "#2d5a27")}" />`;
    }

    if (item.tipo === "linea" && item.puntos?.length >= 2) {
      const points = item.puntos.map((point) => pointToScreen(point)).filter(Boolean);
      if (points.length < 2) {
        return "";
      }

      return `<polyline points="${points.map((point) => `${point.x},${point.y}`).join(" ")}" class="offline-map-saved-line" />`;
    }

    if (item.tipo === "foto" && item.lat && item.lon) {
      const point = pointToScreen({ lat: item.lat, lon: item.lon });
      if (!point) {
        return "";
      }

      return `<g transform="translate(${point.x} ${point.y})"><rect x="-5" y="-5" width="10" height="10" class="offline-map-photo-marker" /></g>`;
    }

    return "";
  }).join("");
}

function renderDraftMarker() {
  const point = pointToScreen(offlineMapState.draftPoint);
  if (!point) {
    return "";
  }

  return `
    <g transform="translate(${point.x} ${point.y})">
      <path d="M 0 -10 L 10 0 L 0 10 L -10 0 Z" class="offline-map-draft" />
    </g>
  `;
}

function renderCurrentLocationMarker() {
  const point = pointToScreen(offlineMapState.currentLocation);
  if (!point) {
    return "";
  }

  return `
    <g transform="translate(${point.x} ${point.y})">
      <circle r="12" class="offline-map-current-ring" />
      <circle r="4.5" class="offline-map-current-dot" />
    </g>
  `;
}

function renderDrawingOverlaySvg() {
  const vertices = offlineMapState.drawing.vertices;
  if (!offlineMapState.drawing.mode || !vertices.length) {
    return "";
  }

  const points = vertices.map((vertex) => pointToScreen(vertex)).filter(Boolean);
  const markerSvg = points.map((point) => `<circle cx="${point.x}" cy="${point.y}" r="5" class="offline-map-drawing-vertex" />`).join("");
  if (points.length < 2) {
    return markerSvg;
  }

  const pathPoints = points.map((point) => `${point.x},${point.y}`).join(" ");
  if (offlineMapState.drawing.mode === "area" && points.length >= 3) {
    return `<polygon points="${pathPoints}" class="offline-map-drawing-area" />${markerSvg}`;
  }

  return `<polyline points="${pathPoints}" class="offline-map-drawing-line" />${markerSvg}`;
}

function buildPointFromCoordinates(coordinates) {
  return {
    latitude: coordinates.latitude,
    longitude: coordinates.longitude,
    geometry: {
      x: coordinates.longitude,
      y: coordinates.latitude,
      spatialReference: { wkid: 4326 },
    },
  };
}

function findCollarAtPointer(clientX, clientY, surface) {
  const rect = surface.getBoundingClientRect();
  const pointerX = clientX - rect.left;
  const pointerY = clientY - rect.top;

  return offlineMapState.collars.find((collar) => {
    const point = pointToScreen(collar);
    if (!point) {
      return false;
    }

    return Math.hypot(point.x - pointerX, point.y - pointerY) <= 14;
  }) || null;
}

function getStatusMessage() {
  if (offlineMapState.message) {
    return offlineMapState.message;
  }

  return offlineMapState.hasTiles
    ? "Mapa offline listo"
    : "No hay mapa offline descargado para esta zona";
}

function renderOfflineMap() {
  if (!offlineMapState.container) {
    return;
  }

  const viewport = getViewportSize();
  revokeTileObjectUrls();
  setHTML(offlineMapState.container, `
    <div class="offline-map-shell ${offlineMapState.hasTiles ? "has-tiles" : "has-grid-only"}" data-offline-map-shell>
      <div class="offline-map-tile-layer" data-offline-tile-layer></div>
      <svg class="offline-map-surface ${offlineMapState.captureEnabled ? "is-capture-active" : ""}" data-offline-map-surface width="${viewport.width}" height="${viewport.height}" viewBox="0 0 ${viewport.width} ${viewport.height}" aria-label="Mapa offline de captura">
        <rect x="0" y="0" width="${viewport.width}" height="${viewport.height}" class="offline-map-background" />
        ${renderGrid()}
        ${renderSavedItems()}
        ${renderCollarMarkers()}
        ${renderCurrentLocationMarker()}
        ${renderDraftMarker()}
        ${renderDrawingOverlaySvg()}
      </svg>
      <div class="offline-map-banner">
        <strong>${escapeAttribute(getStatusMessage())}</strong>
        <div class="list-item__meta">
          <span>Zoom ${offlineMapState.zoom}</span>
          <span>Lat ${roundNumber(offlineMapState.center.latitude, 5)} | Lon ${roundNumber(offlineMapState.center.longitude, 5)}</span>
        </div>
      </div>
      <div class="offline-map-controls">
        <button type="button" data-offline-map-action="zoom-in" aria-label="Acercar">+</button>
        <button type="button" data-offline-map-action="zoom-out" aria-label="Alejar">-</button>
      </div>
    </div>
  `);
  void renderTileLayer();
}

async function renderTileLayer() {
  const layer = qs("[data-offline-tile-layer]", offlineMapState.container);
  if (!layer || !offlineMapState.hasTiles) {
    return;
  }

  console.log("[offline-map] loading tiles from IndexedDB");
  const range = getVisibleTileRange();
  const fragments = [];
  const { centerPixel, viewport } = range;

  for (let x = range.minX; x <= range.maxX; x++) {
    for (let y = range.minY; y <= range.maxY; y++) {
      const tile = await getTile(TILE_CONFIG.provider, offlineMapState.zoom, x, y);
      if (!isValidStoredTile(tile)) {
        console.log("[offline-map] missing tile", offlineMapState.zoom, x, y);
        continue;
      }

      const url = URL.createObjectURL(tile.blob);
      offlineMapState.tileObjectUrls.push(url);
      const left = x * TILE_SIZE - centerPixel.x + viewport.width / 2;
      const top = y * TILE_SIZE - centerPixel.y + viewport.height / 2;
      fragments.push(`<img class="offline-map-tile" src="${url}" style="left:${left}px;top:${top}px;width:${TILE_SIZE}px;height:${TILE_SIZE}px" alt="">`);
    }
  }

  layer.innerHTML = fragments.join("");
}

function centerOnPoint(point, zoom = offlineMapState.zoom) {
  const coordinates = getPointCoordinates(point);
  if (!coordinates) {
    return;
  }

  offlineMapState.center = coordinates;
  offlineMapState.zoom = clamp(Math.round(zoom), MIN_ZOOM, MAX_ZOOM);
}

function centerOnSavedItem(item) {
  const points = [];
  if (item?.tipo === "area") {
    points.push(...(item.vertices || []));
  } else if (item?.tipo === "linea") {
    points.push(...(item.puntos || []));
  } else if (item?.lat && item?.lon) {
    points.push({ lat: item.lat, lon: item.lon });
  }

  const coords = points.map(getPointCoordinates).filter(Boolean);
  if (!coords.length) {
    return;
  }

  const longitude = coords.reduce((sum, point) => sum + point.longitude, 0) / coords.length;
  const latitude = coords.reduce((sum, point) => sum + point.latitude, 0) / coords.length;
  centerOnPoint({ longitude, latitude }, Math.max(offlineMapState.zoom, 15));
}

function handleMapAction(action) {
  switch (action) {
    case "zoom-in":
      offlineMapState.zoom = clamp(offlineMapState.zoom + 1, MIN_ZOOM, MAX_ZOOM);
      break;
    case "zoom-out":
      offlineMapState.zoom = clamp(offlineMapState.zoom - 1, MIN_ZOOM, MAX_ZOOM);
      break;
    default:
      return;
  }

  renderOfflineMap();
}

function handleContainerClick(event) {
  const actionButton = event.target.closest("[data-offline-map-action]");
  if (actionButton) {
    event.preventDefault();
    handleMapAction(actionButton.dataset.offlineMapAction || "");
    return;
  }

  const surface = event.target.closest("[data-offline-map-surface]");
  if (!surface || offlineMapState.dragging) {
    return;
  }

  const coordinates = screenToMap(event.clientX, event.clientY, surface);

  if (offlineMapState.drawing.mode) {
    offlineMapState.drawing.vertices.push({ lat: coordinates.latitude, lon: coordinates.longitude });
    renderOfflineMap();
    offlineMapState.drawing.onVertex?.();
    return;
  }

  const selectedCollar = findCollarAtPointer(event.clientX, event.clientY, surface);
  if (selectedCollar && !offlineMapState.captureEnabled) {
    offlineMapState.selectedCollarUuid = selectedCollar.uuid || "";
    renderOfflineMap();
    offlineMapState.onSelectCollar?.(selectedCollar);
    return;
  }

  if (!offlineMapState.captureEnabled || typeof offlineMapState.onCapture !== "function") {
    offlineMapState.selectedCollarUuid = "";
    renderOfflineMap();
    offlineMapState.onSelectCollar?.(null);
    return;
  }

  const point = buildPointFromCoordinates(coordinates);
  offlineMapState.selectedCollarUuid = "";
  offlineMapState.draftPoint = point;
  renderOfflineMap();
  offlineMapState.onSelectCollar?.(null);
  offlineMapState.onCapture(point);
}

function handlePointerDown(event) {
  const surface = event.target.closest("[data-offline-map-surface]");
  if (!surface || offlineMapState.drawing.mode) {
    return;
  }

  offlineMapState.dragging = false;
  offlineMapState.dragStart = {
    x: event.clientX,
    y: event.clientY,
    center: { ...offlineMapState.center },
  };
}

function handlePointerMove(event) {
  if (!offlineMapState.dragStart) {
    return;
  }

  const dx = event.clientX - offlineMapState.dragStart.x;
  const dy = event.clientY - offlineMapState.dragStart.y;
  if (Math.abs(dx) + Math.abs(dy) < 4) {
    return;
  }

  offlineMapState.dragging = true;
  const startPixel = lonLatToWorldPixel(
    offlineMapState.dragStart.center.longitude,
    offlineMapState.dragStart.center.latitude,
    offlineMapState.zoom,
  );
  offlineMapState.center = worldPixelToLonLat(startPixel.x - dx, startPixel.y - dy, offlineMapState.zoom);
  renderOfflineMap();
}

function handlePointerUp() {
  window.setTimeout(() => {
    offlineMapState.dragStart = null;
    offlineMapState.dragging = false;
  }, 0);
}

function handleContainerWheel(event) {
  const surface = event.target.closest("[data-offline-map-surface]");
  if (!surface) {
    return;
  }

  event.preventDefault();
  offlineMapState.zoom = clamp(offlineMapState.zoom + (event.deltaY < 0 ? 1 : -1), MIN_ZOOM, MAX_ZOOM);
  renderOfflineMap();
}

function bindContainerEvents() {
  if (!offlineMapState.container || offlineMapState.listenersBound) {
    return;
  }

  offlineMapState.container.addEventListener("click", handleContainerClick);
  offlineMapState.container.addEventListener("pointerdown", handlePointerDown);
  offlineMapState.container.addEventListener("pointermove", handlePointerMove);
  offlineMapState.container.addEventListener("pointerup", handlePointerUp);
  offlineMapState.container.addEventListener("pointercancel", handlePointerUp);
  offlineMapState.container.addEventListener("wheel", handleContainerWheel, { passive: false });
  offlineMapState.listenersBound = true;
}

async function loadMetadataIntoState() {
  offlineMapState.metadata = await getMetadata("current");
  offlineMapState.hasTiles = await hasOfflineTiles();

  if (offlineMapState.metadata?.center) {
    centerOnPoint(offlineMapState.metadata.center, offlineMapState.metadata.zoom || TILE_CONFIG.offlineMaxZoom);
  } else if (offlineMapState.currentLocation) {
    centerOnPoint(offlineMapState.currentLocation, DEFAULT_ZOOM);
  } else if (offlineMapState.collars.length) {
    centerOnPoint(offlineMapState.collars[0], DEFAULT_ZOOM);
  } else {
    const configuredExtent = appConfig.map?.offlineExtent;
    if (configuredExtent) {
      centerOnPoint({
        longitude: (configuredExtent.xmin + configuredExtent.xmax) / 2,
        latitude: (configuredExtent.ymin + configuredExtent.ymax) / 2,
      }, DEFAULT_ZOOM);
    }
  }

  offlineMapState.message = offlineMapState.hasTiles
    ? "Mapa offline listo"
    : "No hay mapa offline descargado para esta zona";
}

export async function loadOfflineMap(container, options = {}) {
  console.log("[offline-map] offline mode");
  if (!container) {
    throw new Error("No existe contenedor disponible para renderizar el mapa offline.");
  }

  if (offlineMapState.container !== container) {
    offlineMapState.listenersBound = false;
    offlineMapState.container = container;
  }

  offlineMapState.onCapture = options.onCapture || null;
  offlineMapState.onSelectCollar = options.onSelectCollar || null;
  await loadMetadataIntoState();

  if (!offlineMapState.hasTiles) {
    console.log("[offline-map] no offline tiles found");
    console.log("[offline-map] using grid fallback");
  }

  bindContainerEvents();
  renderOfflineMap();
  return container;
}

export async function loadGridFallback(container, options = {}) {
  console.log("[offline-map] using grid fallback");
  if (!container) {
    throw new Error("No existe contenedor disponible para renderizar el mapa offline.");
  }

  if (offlineMapState.container !== container) {
    offlineMapState.listenersBound = false;
    offlineMapState.container = container;
  }

  offlineMapState.onCapture = options.onCapture || null;
  offlineMapState.onSelectCollar = options.onSelectCollar || null;
  offlineMapState.hasTiles = false;
  offlineMapState.message = "No hay mapa offline descargado para esta zona";
  bindContainerEvents();
  renderOfflineMap();
  return container;
}

export const initOfflineMap = loadOfflineMap;

export function renderOfflineCollars(collars, options = {}) {
  offlineMapState.collars = Array.isArray(collars) ? collars : [];
  offlineMapState.showLabels = options.showLabels !== false;
  offlineMapState.selectedCollarUuid = options.selectedUuid || "";

  if (!offlineMapState.metadata?.center && offlineMapState.collars.length && !offlineMapState.currentLocation) {
    centerOnPoint(offlineMapState.collars[0], offlineMapState.zoom);
  }

  renderOfflineMap();
}

export function renderOfflineSavedItems(items = []) {
  offlineMapState.savedItems = Array.isArray(items) ? items : [];
  renderOfflineMap();
}

export function setOfflineDraftPoint(point) {
  offlineMapState.draftPoint = point || null;
  renderOfflineMap();
}

export function setOfflineCurrentLocationPoint(point) {
  offlineMapState.currentLocation = point || null;
  if (point && !offlineMapState.metadata?.center && !offlineMapState.collars.length && !offlineMapState.draftPoint) {
    centerOnPoint(point, Math.max(offlineMapState.zoom, 15));
  }
  renderOfflineMap();
}

export function setOfflineCaptureEnabled(enabled) {
  offlineMapState.captureEnabled = Boolean(enabled);
  renderOfflineMap();
}

export async function focusOfflineCollar(collar) {
  if (!collar) {
    return;
  }

  offlineMapState.selectedCollarUuid = collar.uuid || "";
  centerOnPoint(collar, 17);
  renderOfflineMap();
}

export async function focusOfflineSavedItem(item) {
  centerOnSavedItem(item);
  renderOfflineMap();
}

export function resetOfflineMapView() {
  if (offlineMapState.metadata?.center) {
    centerOnPoint(offlineMapState.metadata.center, offlineMapState.metadata.zoom || DEFAULT_ZOOM);
  }
  renderOfflineMap();
}

export function adjustOfflineMapZoom(direction) {
  offlineMapState.zoom = clamp(offlineMapState.zoom + (direction > 0 ? 1 : -1), MIN_ZOOM, MAX_ZOOM);
  renderOfflineMap();
}

export function resetOfflineMapNorth() {
  renderOfflineMap();
}

function haversine(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLon = (lon2 - lon1) * r;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function polygonAreaHa(vertices) {
  if (vertices.length < 3) {
    return 0;
  }

  const ref = vertices[0];
  const mLat = 111320;
  const mLon = 111320 * Math.cos((ref.lat * Math.PI) / 180);
  const points = vertices.map((vertex) => ({
    x: (vertex.lon - ref.lon) * mLon,
    y: (vertex.lat - ref.lat) * mLat,
  }));
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y - points[j].x * points[i].y;
  }

  return Math.abs(area / 2) / 10000;
}

function lineDistM(vertices) {
  let distance = 0;
  for (let i = 1; i < vertices.length; i++) {
    distance += haversine(vertices[i - 1].lat, vertices[i - 1].lon, vertices[i].lat, vertices[i].lon);
  }
  return distance;
}

function perimeterM(vertices) {
  if (vertices.length < 2) {
    return 0;
  }

  let distance = lineDistM(vertices);
  if (vertices.length >= 3) {
    distance += haversine(
      vertices[vertices.length - 1].lat,
      vertices[vertices.length - 1].lon,
      vertices[0].lat,
      vertices[0].lon,
    );
  }
  return distance;
}

export async function startOfflineDrawingMode(mode, { onVertex } = {}) {
  offlineMapState.drawing.mode = mode;
  offlineMapState.drawing.vertices = [];
  offlineMapState.drawing.onVertex = onVertex || null;
  renderOfflineMap();
}

export function getOfflineDrawingMode() {
  return offlineMapState.drawing.mode;
}

export function getOfflineDrawingState() {
  return {
    mode: offlineMapState.drawing.mode,
    vertices: [...offlineMapState.drawing.vertices],
    unit: offlineMapState.drawing.unit,
  };
}

export function getOfflineMeasurements() {
  const vertices = offlineMapState.drawing.vertices;
  if (offlineMapState.drawing.mode === "area") {
    return { perimeterM: perimeterM(vertices), areaHa: polygonAreaHa(vertices) };
  }
  if (offlineMapState.drawing.mode === "line") {
    return { distanceM: lineDistM(vertices) };
  }
  return {};
}

export function formatOfflineLineDistance(meters, unit = offlineMapState.drawing.unit) {
  const converters = {
    m: (m) => `${m.toFixed(1)} m`,
    km: (m) => `${(m / 1000).toFixed(3)} km`,
    pies: (m) => `${(m * 3.28084).toFixed(1)} ft`,
    millas: (m) => `${(m / 1609.34).toFixed(3)} mi`,
  };
  return (converters[unit] || converters.m)(meters);
}

export function cycleOfflineLineUnit() {
  const units = ["m", "km", "pies", "millas"];
  offlineMapState.drawing.unit = units[(units.indexOf(offlineMapState.drawing.unit) + 1) % units.length];
  return offlineMapState.drawing.unit;
}

export async function undoOfflineLastVertex() {
  offlineMapState.drawing.vertices.pop();
  renderOfflineMap();
  offlineMapState.drawing.onVertex?.();
}

export function cancelOfflineDrawing() {
  offlineMapState.drawing.mode = null;
  offlineMapState.drawing.vertices = [];
  offlineMapState.drawing.onVertex = null;
  renderOfflineMap();
}
