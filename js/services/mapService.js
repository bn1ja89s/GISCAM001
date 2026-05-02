import { appConfig } from "../config.js";
import { derivePointAttributes, nowIso, roundNumber, toNullableNumber } from "../core/helpers.js";

const ARCGIS_BASE_URL = "https://js.arcgis.com/4.33/@arcgis/core";

const mapState = {
  view: null,
  collarsLayer: null,
  overlayLayer: null,
  captureEnabled: false,
  captureHandler: null,
  selectHandler: null,
  draftGraphic: null,
  currentLocationGraphic: null,
  gpsWatchId: null,
  searchWidget: null,
  drawingClickHandler: null,
};

const elevationCache = {
  globalGround: null,
  projectGrounds: new Map(),
};

const arcgisState = {
  modules: null,
  loadPromise: null,
};

export function getArcGISModules() {
  return arcgisState.modules;
}

export function getMapView() {
  return mapState.view;
}

export function setMapDrawingClickHandler(handler) {
  mapState.drawingClickHandler = handler || null;
}

async function ensureArcGISModules() {
  if (arcgisState.modules) {
    return arcgisState.modules;
  }

  if (!arcgisState.loadPromise) {
    arcgisState.loadPromise = Promise.all([
      import(`${ARCGIS_BASE_URL}/config.js`),
      import(`${ARCGIS_BASE_URL}/Map.js`),
      import(`${ARCGIS_BASE_URL}/WebMap.js`),
      import(`${ARCGIS_BASE_URL}/views/MapView.js`),
      import(`${ARCGIS_BASE_URL}/Graphic.js`),
      import(`${ARCGIS_BASE_URL}/Ground.js`),
      import(`${ARCGIS_BASE_URL}/geometry/Point.js`),
      import(`${ARCGIS_BASE_URL}/layers/ElevationLayer.js`),
      import(`${ARCGIS_BASE_URL}/layers/GraphicsLayer.js`),
      import(`${ARCGIS_BASE_URL}/widgets/Search.js`),
      import(`${ARCGIS_BASE_URL}/geometry/support/webMercatorUtils.js`),
    ]).then(([
      { default: esriConfig },
      { default: ArcGISMap },
      { default: WebMap },
      { default: MapView },
      { default: Graphic },
      { default: Ground },
      { default: Point },
      { default: ElevationLayer },
      { default: GraphicsLayer },
      { default: Search },
      webMercatorUtils,
    ]) => {
      arcgisState.modules = {
        esriConfig,
        Map: ArcGISMap,
        WebMap,
        MapView,
        Graphic,
        Ground,
        Point,
        ElevationLayer,
        GraphicsLayer,
        Search,
        webMercatorUtils,
      };

      return arcgisState.modules;
    }).catch((error) => {
      arcgisState.loadPromise = null;
      throw new Error(error?.message || "No fue posible cargar ArcGIS JS API.");
    });
  }

  return arcgisState.loadPromise;
}

function supportsWebGL2() {
  const canvas = document.createElement("canvas");
  return Boolean(canvas.getContext("webgl2"));
}

function getMapPadding() {
  return window.matchMedia("(max-width: 767px)").matches
    ? { top: 96, right: 68, bottom: 280, left: 16 }
    : { top: 96, right: 104, bottom: 36, left: 24 };
}

async function buildMap() {
  const { Map, WebMap } = await ensureArcGISModules();
  const preset = appConfig.maps[0];
  if (preset?.id) {
    return new WebMap({
      portalItem: { id: preset.id },
    });
  }

  return new Map({
    basemap: appConfig.map.basemap,
  });
}

function createCollarGraphic(collar, { selected = false } = {}) {
  const { Graphic } = getArcGISModules() || {};
  const geometry = createPointGeometry(collar);
  if (!geometry || !Graphic) {
    return null;
  }

  const color = collar.estado_sync === appConfig.status.error
    ? [216, 93, 113, 0.92]
    : collar.estado_sync === appConfig.status.synced
      ? [73, 182, 132, 0.92]
      : [96, 132, 196, 0.92];

  return new Graphic({
    geometry,
    symbol: {
      type: "simple-marker",
      style: "circle",
      size: selected ? 11 : 7,
      color,
      outline: {
        width: selected ? 2.6 : 1.25,
        color: selected ? [255, 255, 255, 0.98] : [8, 16, 28, 0.95],
      },
    },
    attributes: collar,
    popupTemplate: {
      title: `{hole_id}`,
      content: `Proyecto: ${collar.proyecto_uuid}<br>Profundidad: ${collar.prof_total} m<br>Estado: ${collar.estado_sync}`,
    },
  });
}

function createCollarLabelGraphic(collar) {
  const { Graphic } = getArcGISModules() || {};
  const geometry = createPointGeometry(collar);
  if (!geometry || !Graphic || !collar?.hole_id) {
    return null;
  }

  return new Graphic({
    geometry,
    symbol: {
      type: "text",
      color: [45, 90, 39, 1],
      haloColor: [255, 255, 255, 0.95],
      haloSize: 1.5,
      text: String(collar.hole_id),
      yoffset: 16,
      font: {
        size: 11,
        family: "Inter",
        weight: "600",
      },
    },
    attributes: collar,
  });
}

function createPointGeometry(point) {
  if (!point) {
    return null;
  }

  const geometry = point.geometry || point;
  if (geometry?.declaredClass === "esri.geometry.Point") {
    return geometry;
  }

  const x = Number(geometry?.x ?? geometry?.longitude ?? point?.longitude ?? point?.x);
  const y = Number(geometry?.y ?? geometry?.latitude ?? point?.latitude ?? point?.y);
  const zValue = geometry?.z ?? point?.elevacion ?? point?.z ?? null;

  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  const { Point } = getArcGISModules() || {};
  const geometryData = {
    type: "point",
    x,
    y,
    z: Number.isFinite(Number(zValue)) ? Number(zValue) : null,
    spatialReference: geometry?.spatialReference || point?.spatialReference || { wkid: 4326 },
  };

  return Point ? new Point(geometryData) : geometryData;
}

function getProjectDemServiceUrl(project) {
  return String(project?.dem_service_url || "").trim();
}

function getPreferredElevationSource(project) {
  return project?.dem_source_type === "project" && getProjectDemServiceUrl(project)
    ? "project-dem"
    : "global-dem";
}

function getGroundFromServiceUrl(serviceUrl) {
  const { Ground, ElevationLayer } = getArcGISModules() || {};
  const normalizedUrl = String(serviceUrl || "").trim();
  if (!normalizedUrl || !Ground || !ElevationLayer) {
    return null;
  }

  if (!elevationCache.projectGrounds.has(normalizedUrl)) {
    elevationCache.projectGrounds.set(normalizedUrl, new Ground({
      layers: [new ElevationLayer({ url: normalizedUrl })],
    }));
  }

  return elevationCache.projectGrounds.get(normalizedUrl);
}

function getGlobalElevationGround() {
  const { Ground, ElevationLayer } = getArcGISModules() || {};
  const configuredUrl = String(appConfig.elevation?.globalServiceUrl || "").trim();

  if (!configuredUrl || !Ground || !ElevationLayer) {
    return mapState.view?.map?.ground || null;
  }

  if (!elevationCache.globalGround) {
    elevationCache.globalGround = new Ground({
      layers: [new ElevationLayer({ url: configuredUrl })],
    });
  }

  return elevationCache.globalGround;
}

function getElevationQueryTarget(project) {
  const source = getPreferredElevationSource(project);
  if (source === "project-dem") {
    return {
      source,
      ground: getGroundFromServiceUrl(getProjectDemServiceUrl(project)) || getGlobalElevationGround(),
    };
  }

  return {
    source,
    ground: getGlobalElevationGround(),
  };
}

function applyResolvedElevation(point, elevacion, geometry = null, metadata = {}) {
  const normalizedElevation = toNullableNumber(elevacion);
  const sourceGeometry = geometry || point?.geometry || point;
  const x = Number(sourceGeometry?.x ?? point?.longitude ?? point?.x);
  const y = Number(sourceGeometry?.y ?? point?.latitude ?? point?.y);
  const elevationStatus = metadata.elevation_status || (normalizedElevation != null ? "resolved" : "pending");
  const elevationResolvedAt = elevationStatus === "resolved" && normalizedElevation != null
    ? metadata.elevation_resolved_at || point?.elevation_resolved_at || nowIso()
    : "";

  return {
    ...point,
    elevacion: normalizedElevation == null ? null : roundNumber(normalizedElevation, 2),
    elevation_status: elevationStatus,
    elevation_source: metadata.elevation_source ?? point?.elevation_source ?? "",
    elevation_resolved_at: elevationResolvedAt,
    geometry: Number.isFinite(x) && Number.isFinite(y)
      ? {
          x,
          y,
          z: normalizedElevation,
          spatialReference: sourceGeometry?.spatialReference || point?.spatialReference || { wkid: 4326 },
        }
      : point?.geometry || null,
  };
}

export async function resolvePointElevation(point, options = {}) {
  if (!point) {
    return null;
  }

  const {
    project = null,
    online = navigator.onLine,
    preferExistingElevation = false,
  } = options;

  const existingElevation = toNullableNumber(point?.elevacion ?? point?.geometry?.z ?? point?.z);
  const geometry = createPointGeometry(point);

  if (point?.elevation_status === "resolved" && existingElevation != null) {
    return applyResolvedElevation(point, existingElevation, geometry, {
      elevation_status: "resolved",
      elevation_source: point?.elevation_source || "global-dem",
      elevation_resolved_at: point?.elevation_resolved_at || nowIso(),
    });
  }

  if (preferExistingElevation && existingElevation != null) {
    return applyResolvedElevation(point, existingElevation, geometry, {
      elevation_status: "resolved",
      elevation_source: point?.elevation_source || "gps-device",
      elevation_resolved_at: point?.elevation_resolved_at || nowIso(),
    });
  }

  if (!geometry) {
    return applyResolvedElevation(point, null, null, {
      elevation_status: "pending",
      elevation_source: getPreferredElevationSource(project),
    });
  }

  let elevationTarget = {
    source: getPreferredElevationSource(project),
    ground: null,
  };

  if (!appConfig.elevation?.enabled || !appConfig.elevation?.deferWhenOffline && !online) {
    return applyResolvedElevation(point, null, geometry, {
      elevation_status: "pending",
      elevation_source: elevationTarget.source,
    });
  }

  if (!online || !navigator.onLine) {
    return applyResolvedElevation(point, null, geometry, {
      elevation_status: "pending",
      elevation_source: elevationTarget.source,
    });
  }

  try {
    await ensureArcGISModules();
    elevationTarget = getElevationQueryTarget(project);
  } catch {
    if (preferExistingElevation && existingElevation != null) {
      return applyResolvedElevation(point, existingElevation, geometry, {
        elevation_status: "resolved",
        elevation_source: point?.elevation_source || "gps-device",
        elevation_resolved_at: point?.elevation_resolved_at || nowIso(),
      });
    }

    return applyResolvedElevation(point, null, geometry, {
      elevation_status: "pending",
      elevation_source: elevationTarget.source,
    });
  }

  const queryElevation = elevationTarget.ground?.queryElevation;
  if (typeof queryElevation !== "function") {
    return applyResolvedElevation(point, null, geometry, {
      elevation_status: "pending",
      elevation_source: elevationTarget.source,
    });
  }

  try {
    if (typeof elevationTarget.ground.load === "function") {
      await elevationTarget.ground.load();
    }

    const queryResult = await queryElevation.call(elevationTarget.ground, geometry);
    const elevatedGeometry = queryResult?.geometry || queryResult;
    const resolvedElevation = toNullableNumber(elevatedGeometry?.z ?? elevatedGeometry?.points?.[0]?.[2]);
    if (resolvedElevation != null) {
      return applyResolvedElevation(point, resolvedElevation, elevatedGeometry || geometry, {
        elevation_status: "resolved",
        elevation_source: elevationTarget.source,
        elevation_resolved_at: nowIso(),
      });
    }
  } catch {
    if (preferExistingElevation && existingElevation != null) {
      return applyResolvedElevation(point, existingElevation, geometry, {
        elevation_status: "resolved",
        elevation_source: point?.elevation_source || "gps-device",
        elevation_resolved_at: point?.elevation_resolved_at || nowIso(),
      });
    }
  }

  return applyResolvedElevation(point, null, geometry, {
    elevation_status: "pending",
    elevation_source: elevationTarget.source,
  });
}

function createCurrentLocationGraphic(point) {
  const { Graphic } = getArcGISModules() || {};
  const accuracy = point?.gps_accuracy_meters ? `${point.gps_accuracy_meters} m` : "-";
  const geometry = createPointGeometry(point);

  if (!geometry || !Graphic) {
    return null;
  }

  return new Graphic({
    geometry,
    symbol: {
      type: "simple-marker",
      style: "circle",
      size: 14,
      color: [77, 163, 255, 0.4],
      outline: {
        width: 2,
        color: [77, 163, 255, 0.95],
      },
    },
    attributes: {
      latitude: point?.latitude,
      longitude: point?.longitude,
      accuracy,
    },
    popupTemplate: {
      title: "Ubicacion actual",
      content: `Lat: ${point?.latitude ?? "-"}<br>Lon: ${point?.longitude ?? "-"}<br>Precision: ${accuracy}`,
    },
  });
}

function getTransientGraphicsTarget() {
  return mapState.view?.graphics || mapState.overlayLayer;
}

function removeTransientGraphic(graphic) {
  const target = getTransientGraphicsTarget();
  if (!graphic || !target?.remove) {
    return;
  }

  target.remove(graphic);
}

function addTransientGraphic(graphic) {
  const target = getTransientGraphicsTarget();
  if (!graphic || !target?.add) {
    return;
  }

  target.add(graphic);
}

function drawDraftPoint(point) {
  const { Graphic } = getArcGISModules() || {};
  if (!getTransientGraphicsTarget()) {
    return;
  }

  if (mapState.draftGraphic) {
    removeTransientGraphic(mapState.draftGraphic);
    mapState.draftGraphic = null;
  }

  if (!point) {
    return;
  }

  const geometry = createPointGeometry(point);
  if (!geometry || !Graphic) {
    return;
  }

  mapState.draftGraphic = new Graphic({
    geometry,
    symbol: {
      type: "simple-marker",
      style: "diamond",
      size: 12,
      color: [77, 163, 255, 0.95],
      outline: {
        width: 1.5,
        color: [255, 255, 255, 0.9],
      },
    },
  });

  addTransientGraphic(mapState.draftGraphic);
}

function drawCurrentLocation(point) {
  if (!getTransientGraphicsTarget()) {
    return;
  }

  if (mapState.currentLocationGraphic) {
    removeTransientGraphic(mapState.currentLocationGraphic);
    mapState.currentLocationGraphic = null;
  }

  if (!point) {
    return;
  }

  mapState.currentLocationGraphic = createCurrentLocationGraphic(point);
  if (!mapState.currentLocationGraphic) {
    return;
  }

  addTransientGraphic(mapState.currentLocationGraphic);
}

function normalizeGpsError(error) {
  if (!error) {
    return "No se pudo leer el GPS del dispositivo.";
  }

  if (error.code === 1) {
    return "El permiso de ubicacion fue denegado en el dispositivo.";
  }

  if (error.code === 2) {
    return "No fue posible determinar la ubicacion GPS actual.";
  }

  if (error.code === 3) {
    return "La captura GPS agoto el tiempo de espera antes de completar las lecturas.";
  }

  return error.message || "No se pudo leer el GPS del dispositivo.";
}

function buildGpsPoint(latitude, longitude, elevacion = null, accuracy = null) {
  const point = derivePointAttributes({
    x: longitude,
    y: latitude,
    z: elevacion,
    spatialReference: { wkid: 4326 },
  });

  return {
    ...point,
    gps_accuracy_meters: accuracy != null ? roundNumber(accuracy, 2) : null,
  };
}

function clearGpsWatch() {
  if (mapState.gpsWatchId != null && navigator.geolocation) {
    navigator.geolocation.clearWatch(mapState.gpsWatchId);
    mapState.gpsWatchId = null;
  }
}

export function stopGpsNavigation({ clearGraphic = false } = {}) {
  clearGpsWatch();

  if (clearGraphic) {
    drawCurrentLocation(null);
  }
}

export async function startGpsNavigation({ onLocation, onError, centerOnFirstFix = true } = {}) {
  if (!navigator.geolocation) {
    throw new Error("El navegador no expone geolocalizacion.");
  }

  clearGpsWatch();
  let hasCentered = false;

  mapState.gpsWatchId = navigator.geolocation.watchPosition(
    (position) => {
      const point = buildGpsPoint(
        Number(position.coords.latitude),
        Number(position.coords.longitude),
        Number.isFinite(position.coords.altitude) ? Number(position.coords.altitude) : null,
        position.coords.accuracy ?? null,
      );

      drawCurrentLocation(point);

      if (centerOnFirstFix && mapState.view && !hasCentered) {
        mapState.view.goTo({
          target: createPointGeometry(point),
          zoom: 17,
        }).catch(() => {});
        hasCentered = true;
      }

      onLocation?.(point);
    },
    (error) => {
      clearGpsWatch();
      onError?.(new Error(normalizeGpsError(error)));
    },
    {
      enableHighAccuracy: true,
      maximumAge: appConfig.map.gpsMaximumAgeMs,
      timeout: Math.min(appConfig.map.gpsTimeoutMs, 12000),
    },
  );

  return mapState.gpsWatchId;
}

function averageGpsSamples(samples) {
  let sumLat = 0;
  let sumLon = 0;
  let sumElev = 0;
  let totalWeight = 0;
  let totalElevationWeight = 0;

  for (const sample of samples) {
    const accuracy = Math.max(sample.accuracy || 1, 1);
    const weight = 1 / accuracy;
    sumLat += sample.latitude * weight;
    sumLon += sample.longitude * weight;
    totalWeight += weight;

    const sampleElevation = toNullableNumber(sample.elevacion);
    if (sampleElevation != null) {
      sumElev += sampleElevation * weight;
      totalElevationWeight += weight;
    }
  }

  const meanAccuracy = roundNumber(samples.reduce((total, sample) => total + (sample.accuracy || 0), 0) / samples.length, 2);
  const bestAccuracy = roundNumber(Math.min(...samples.map((sample) => sample.accuracy || 9999)), 2);

  return {
    latitude: roundNumber(sumLat / totalWeight, 6),
    longitude: roundNumber(sumLon / totalWeight, 6),
    elevacion: totalElevationWeight ? roundNumber(sumElev / totalElevationWeight, 2) : null,
    meanAccuracy,
    bestAccuracy,
    sampleCount: samples.length,
  };
}

export async function initMap(container, { onCapture, onSelectCollar } = {}) {
  if (!supportsWebGL2()) {
    throw new Error("Este navegador o dispositivo no soporta WebGL2.");
  }

  if (!container) {
    throw new Error("No existe contenedor disponible para renderizar el mapa.");
  }

  const { esriConfig, GraphicsLayer, MapView, Search, webMercatorUtils } = await ensureArcGISModules();

  if (appConfig.portalUrl) {
    esriConfig.portalUrl = appConfig.portalUrl;
  }

  if (appConfig.apiKey) {
    esriConfig.apiKey = appConfig.apiKey;
  }

  // Configuracion para modo offline: timeout corto para no bloquear si no hay red
  esriConfig.request.timeout = 5000;

  // Preservar posicion del mapa si ya estaba inicializado
  let savedCenter = null;
  let savedZoom = null;

  if (mapState.view) {
    try {
      const zoom = mapState.view.zoom;
      const center = mapState.view.center;
      if (Number.isFinite(zoom) && zoom > 0 && center && Number.isFinite(center.longitude)) {
        savedCenter = { longitude: center.longitude, latitude: center.latitude };
        savedZoom = zoom;
      }
    } catch {
      // Vista en estado inconsistente; se usara posicion por defecto
    }
    mapState.view.container = null;
    mapState.view.destroy();
    mapState.view = null;
    mapState.collarsLayer = null;
    mapState.overlayLayer = null;
    mapState.draftGraphic = null;
    mapState.currentLocationGraphic = null;
  }

  if (mapState.searchWidget?.destroy) {
    mapState.searchWidget.destroy();
    mapState.searchWidget = null;
  }

  const map = await buildMap();
  const collarsLayer = new GraphicsLayer({ id: "collars-layer" });
  const overlayLayer = new GraphicsLayer({ id: "capture-overlay-layer" });
  map.addMany([collarsLayer, overlayLayer]);

  const view = new MapView({
    container,
    map,
    zoom: appConfig.map.defaultZoom,
    padding: getMapPadding(),
    ui: {
      components: [],
    },
    popup: {
      dockEnabled: true,
      dockOptions: {
        breakpoint: false,
      },
    },
  });

  view.popup.autoOpenEnabled = false;

  mapState.view = view;
  mapState.collarsLayer = collarsLayer;
  mapState.overlayLayer = overlayLayer;
  mapState.captureHandler = onCapture || null;
  mapState.selectHandler = onSelectCollar || null;

  await map.load();

  if (appConfig.map.basemap) {
    try {
      map.basemap = appConfig.map.basemap;
    } catch {
      // Basemap no disponible offline; se continuara sin tiles de fondo
    }
  }

  if (typeof map.reorder === "function") {
    map.reorder(collarsLayer, map.layers.length - 1);
    map.reorder(overlayLayer, map.layers.length - 1);
  }

  await view.when();
  await Promise.all([
    view.whenLayerView(collarsLayer),
    view.whenLayerView(overlayLayer),
  ]);

  // Restaurar posicion previa si el mapa ya habia sido inicializado
  if (savedCenter && savedZoom) {
    try {
      view.goTo({ center: savedCenter, zoom: savedZoom }, { animate: false });
    } catch {
      // Ignorar error al restaurar posicion
    }
  }

  const searchHost = document.querySelector("#map-search-slot");
  if (searchHost) {
    mapState.searchWidget = new Search({
      view,
      container: searchHost,
      allPlaceholder: "Buscar direccion o lugar",
      popupEnabled: false,
      includeDefaultSources: true,
    });
  }

  view.on("click", async (event) => {
    if (mapState.drawingClickHandler) {
      const rawPoint = event.mapPoint?.spatialReference?.isWebMercator
        ? webMercatorUtils.webMercatorToGeographic(event.mapPoint)
        : event.mapPoint;
      const pointData = derivePointAttributes(rawPoint);
      try {
        await mapState.drawingClickHandler(pointData);
      } catch {
        // drawing handler errors are non-fatal; vertex may not have been added
      }
      return;
    }

    const hitTest = await view.hitTest(event, { include: [collarsLayer] }).catch(() => null);
    const selectedGraphic = hitTest?.results
      ?.map((result) => result.graphic)
      .find((graphic) => graphic?.attributes?.uuid);

    if (selectedGraphic) {
      mapState.selectHandler?.(selectedGraphic.attributes);
      return;
    }

    mapState.selectHandler?.(null);

    if (!mapState.captureEnabled || !mapState.captureHandler) {
      return;
    }

    const rawPoint = event.mapPoint?.spatialReference?.isWebMercator
      ? webMercatorUtils.webMercatorToGeographic(event.mapPoint)
      : event.mapPoint;
    const pointData = derivePointAttributes(rawPoint);
    drawDraftPoint(pointData);
    mapState.captureHandler(pointData);
  });

  return view;
}

export function renderCollars(collars, options = {}) {
  if (!mapState.collarsLayer) {
    return;
  }

  const graphics = collars
    .flatMap((collar) => {
      const markerGraphic = createCollarGraphic(collar, {
        selected: options.selectedUuid === collar.uuid,
      });
      const labelGraphic = options.showLabels ? createCollarLabelGraphic(collar) : null;
      return [markerGraphic, labelGraphic].filter(Boolean);
    })
    .filter(Boolean);

  mapState.collarsLayer.removeAll();
  if (graphics.length) {
    mapState.collarsLayer.addMany(graphics);
  }
}

export function setDraftPoint(point) {
  drawDraftPoint(point);
}

export function setCurrentLocationPoint(point) {
  drawCurrentLocation(point);
}

export function setCaptureEnabled(enabled) {
  mapState.captureEnabled = enabled;
}

export function getCaptureEnabled() {
  return mapState.captureEnabled;
}

export async function focusCollar(collar) {
  const geometry = createPointGeometry(collar);
  if (!mapState.view || !geometry) {
    return;
  }

  await mapState.view.goTo({
    target: geometry,
    zoom: 17,
  });
}

export async function adjustMapZoom(direction) {
  if (!mapState.view || !Number.isFinite(mapState.view.zoom)) {
    return;
  }

  const delta = direction > 0 ? 1 : -1;
  await mapState.view.goTo({ zoom: mapState.view.zoom + delta }).catch(() => {});
}

export async function resetMapNorth() {
  if (!mapState.view) {
    return;
  }

  await mapState.view.goTo({ rotation: 0 }).catch(() => {
    mapState.view.rotation = 0;
  });
}

/**
 * Genera las URLs de tiles del basemap actual para el extent visible
 * en los niveles de zoom indicados, para pre-cacheo offline.
 */
export async function generateTileUrls(minZoom = 10, maxZoom = 16) {
  const view = mapState.view;
  if (!view?.extent || !view?.map?.basemap) {
    return [];
  }

  try {
    const basemap = view.map.basemap;
    if (!basemap.loaded) {
      await basemap.load();
    }

    const layer = basemap.baseLayers.getItemAt(0);
    if (!layer) {
      return [];
    }

    if (!layer.loaded) {
      await layer.load();
    }

    const tileInfo = layer.tileInfo;
    const layerUrl = layer.url;
    if (!tileInfo || !layerUrl) {
      return [];
    }

    const origin = tileInfo.origin;
    const tileSize = tileInfo.rows || 256;
    const ext = view.extent;
    const urls = [];

    for (const lod of tileInfo.lods) {
      if (lod.level < minZoom || lod.level > maxZoom) {
        continue;
      }

      const resolution = lod.resolution;
      const minCol = Math.max(0, Math.floor((ext.xmin - origin.x) / (tileSize * resolution)));
      const maxCol = Math.floor((ext.xmax - origin.x) / (tileSize * resolution));
      const minRow = Math.max(0, Math.floor((origin.y - ext.ymax) / (tileSize * resolution)));
      const maxRow = Math.floor((origin.y - ext.ymin) / (tileSize * resolution));

      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          urls.push(`${layerUrl}/tile/${lod.level}/${row}/${col}`);
        }
      }
    }

    return urls;
  } catch {
    return [];
  }
}

export async function locateUser() {
  if (!navigator.geolocation) {
    throw new Error("El navegador no expone geolocalizacion.");
  }

  const position = await new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 15000,
      timeout: 10000,
    });
  });

  const point = buildGpsPoint(
    position.coords.latitude,
    position.coords.longitude,
    Number.isFinite(position.coords.altitude) ? Number(position.coords.altitude) : null,
    position.coords.accuracy ?? null,
  );

  drawCurrentLocation(point);

  if (mapState.view) {
    await mapState.view.goTo({
      target: createPointGeometry(point),
      zoom: 16,
    });
  }

  return point;
}

export async function captureGpsAverage({ sampleCount, timeoutMs, maximumAgeMs } = {}) {
  if (!navigator.geolocation) {
    throw new Error("El navegador no expone geolocalizacion.");
  }

  const targetSamples = Number(sampleCount) || appConfig.map.gpsSampleCount;
  const maxDuration = Number(timeoutMs) || appConfig.map.gpsTimeoutMs;
  const maximumAge = Number(maximumAgeMs) || appConfig.map.gpsMaximumAgeMs;

  return new Promise((resolve, reject) => {
    const samples = [];
    let watchId = null;
    let timerId = null;
    let settled = false;

    const cleanup = () => {
      if (watchId != null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }

      if (timerId != null) {
        window.clearTimeout(timerId);
        timerId = null;
      }
    };

    const finalize = () => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();

      if (!samples.length) {
        reject(new Error("No se recibieron lecturas GPS para promediar la ubicacion."));
        return;
      }

      const average = averageGpsSamples(samples);
      const point = buildGpsPoint(average.latitude, average.longitude, average.elevacion, average.meanAccuracy);
      point.gps_best_accuracy_meters = average.bestAccuracy;
      point.gps_samples_used = average.sampleCount;
      drawCurrentLocation(point);
      drawDraftPoint(point);

      if (mapState.view) {
        mapState.view.goTo({
          target: createPointGeometry(point),
          zoom: 17,
        }).catch(() => {});
      }

      resolve(point);
    };

    watchId = navigator.geolocation.watchPosition(
      (position) => {
        const sample = {
          latitude: Number(position.coords.latitude),
          longitude: Number(position.coords.longitude),
          elevacion: Number.isFinite(position.coords.altitude) ? Number(position.coords.altitude) : null,
          accuracy: roundNumber(position.coords.accuracy ?? 0, 2),
        };
        samples.push(sample);
        drawCurrentLocation(buildGpsPoint(sample.latitude, sample.longitude, sample.elevacion, sample.accuracy));

        if (samples.length >= targetSamples) {
          finalize();
        }
      },
      (error) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        reject(new Error(normalizeGpsError(error)));
      },
      {
        enableHighAccuracy: true,
        maximumAge,
        timeout: Math.min(maxDuration, 12000),
      },
    );

    timerId = window.setTimeout(() => {
      finalize();
    }, maxDuration);
  });
}
