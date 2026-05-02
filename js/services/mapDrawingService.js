import { getMapView, getArcGISModules, setMapDrawingClickHandler } from "./mapService.js";

const EARTH_R = 6371000;
const drawState = { mode: null, vertices: [], unit: "m" };
let drawLayer = null;
let labelLayer = null;
let photoLayer = null;
let highlightLayer = null;
let savedLayer = null;
let onVertexCallback = null;

// ─── Vertex editor state ─────────────────────────────────────────────────
let editorMode = "draw"; // 'draw' | 'edit' | 'delete'
let selectedVertexIndex = -1;

export function getEditorMode() { return editorMode; }

export function resetEditorMode() {
  editorMode = "draw";
  selectedVertexIndex = -1;
}

export function cycleEditorMode() {
  if (editorMode === "draw") editorMode = "edit";
  else if (editorMode === "edit") editorMode = "delete";
  else editorMode = "draw";
  selectedVertexIndex = -1;
  rebuildGraphics();
  return editorMode;
}

// ─── Vertex editor helpers ───────────────────────────────────────────────
function findNearest(verts, lat, lon, threshold) {
  let idx = -1, best = threshold;
  for (let i = 0; i < verts.length; i++) {
    const d = Math.hypot(verts[i].lat - lat, verts[i].lon - lon);
    if (d < best) { best = d; idx = i; }
  }
  return idx;
}

function getMidpoints(verts) {
  return verts.map((v, i) => {
    const n = verts[(i + 1) % verts.length];
    return { lat: (v.lat + n.lat) / 2, lon: (v.lon + n.lon) / 2 };
  });
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

function polygonAreaHa(verts) {
  if (verts.length < 3) return 0;
  const ref = verts[0];
  const mLat = 111320;
  const mLon = 111320 * Math.cos((ref.lat * Math.PI) / 180);
  const pts = verts.map((v) => ({
    x: (v.lon - ref.lon) * mLon,
    y: (v.lat - ref.lat) * mLat,
  }));
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area / 2) / 10000;
}

function lineDistM(verts) {
  let d = 0;
  for (let i = 1; i < verts.length; i++) {
    d += haversine(verts[i - 1].lat, verts[i - 1].lon, verts[i].lat, verts[i].lon);
  }
  return d;
}

function perimM(verts) {
  if (verts.length < 2) return 0;
  let d = lineDistM(verts);
  if (verts.length >= 3) {
    d += haversine(
      verts[verts.length - 1].lat,
      verts[verts.length - 1].lon,
      verts[0].lat,
      verts[0].lon,
    );
  }
  return d;
}

function fmtSeg(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

function midPoint(a, b) {
  return { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
}

function parseHexColor(hex) {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

async function rebuildGraphics() {
  const view = getMapView();
  const modules = getArcGISModules();
  if (!view || !modules || !drawLayer) return;
  const { Graphic } = modules;
  const verts = drawState.vertices;

  // Ensure layers are in the current map (guard against stale references after map re-init)
  if (!view.map.findLayerById("drawing-layer")) {
    view.map.add(drawLayer);
  }
  if (!view.map.findLayerById("drawing-label-layer")) {
    view.map.add(labelLayer);
  }

  drawLayer.removeAll();
  labelLayer.removeAll();

  if (verts.length === 0) return;

  // Vertex markers (skip in delete mode — red X drawn below instead)
  if (editorMode !== "delete") {
    for (let i = 0; i < verts.length; i++) {
      const v = verts[i];
      const isSelected = editorMode === "edit" && i === selectedVertexIndex;
      drawLayer.add(
        new Graphic({
          geometry: { type: "point", longitude: v.lon, latitude: v.lat, spatialReference: { wkid: 4326 } },
          symbol: isSelected
            ? { type: "simple-marker", color: [30, 100, 220, 1], outline: { color: [255, 255, 255], width: 2.5 }, size: 14 }
            : { type: "simple-marker", color: [45, 90, 39, 1], outline: { color: [255, 255, 255], width: 2 }, size: 8 },
        }),
      );
    }
  }

  if (verts.length >= 2) {
    const rings = verts.map((v) => [v.lon, v.lat]);

    if (drawState.mode === "line") {
      drawLayer.add(
        new Graphic({
          geometry: { type: "polyline", paths: [rings], spatialReference: { wkid: 4326 } },
          symbol: { type: "simple-line", color: "#2d5a27", width: 2, style: "dash" },
        }),
      );
      for (let i = 0; i < verts.length - 1; i++) {
        const dist = haversine(verts[i].lat, verts[i].lon, verts[i + 1].lat, verts[i + 1].lon);
        const m = midPoint(verts[i], verts[i + 1]);
        labelLayer.add(
          new Graphic({
            geometry: { type: "point", longitude: m.lon, latitude: m.lat, spatialReference: { wkid: 4326 } },
            symbol: { type: "text", text: fmtSeg(dist), color: "#2d5a27", haloColor: "#fff", haloSize: 1.5, font: { size: 10, weight: "bold" }, xoffset: 0, yoffset: 8 },
          }),
        );
      }
    } else {
      // area mode
      if (verts.length >= 3) {
        drawLayer.add(
          new Graphic({
            geometry: { type: "polygon", rings: [[...rings, rings[0]]], spatialReference: { wkid: 4326 } },
            symbol: { type: "simple-fill", color: [45, 90, 39, 0.18], outline: { color: "#2d5a27", width: 2 } },
          }),
        );
      } else {
        drawLayer.add(
          new Graphic({
            geometry: { type: "polyline", paths: [rings], spatialReference: { wkid: 4326 } },
            symbol: { type: "simple-line", color: "#2d5a27", width: 2 },
          }),
        );
      }
      const sv = verts.length >= 3 ? [...verts, verts[0]] : verts;
      for (let i = 0; i < sv.length - 1; i++) {
        const dist = haversine(sv[i].lat, sv[i].lon, sv[i + 1].lat, sv[i + 1].lon);
        const m = midPoint(sv[i], sv[i + 1]);
        labelLayer.add(
          new Graphic({
            geometry: { type: "point", longitude: m.lon, latitude: m.lat, spatialReference: { wkid: 4326 } },
            symbol: { type: "text", text: fmtSeg(dist), color: "#2d5a27", haloColor: "#fff", haloSize: 1.5, font: { size: 10, weight: "bold" }, xoffset: 0, yoffset: 8 },
          }),
        );
      }
    }
  }

  // Edit mode: show midpoints for inserting vertices (area only)
  if (editorMode === "edit" && drawState.mode === "area" && verts.length >= 2) {
    for (const m of getMidpoints(verts)) {
      drawLayer.add(
        new Graphic({
          geometry: { type: "point", longitude: m.lon, latitude: m.lat, spatialReference: { wkid: 4326 } },
          symbol: { type: "simple-marker", color: [45, 90, 39, 0.35], outline: { color: "#2d5a27", width: 1 }, size: 10 },
        }),
      );
    }
  }

  // Delete mode: show red X on each vertex
  if (editorMode === "delete") {
    for (const v of verts) {
      drawLayer.add(
        new Graphic({
          geometry: { type: "point", longitude: v.lon, latitude: v.lat, spatialReference: { wkid: 4326 } },
          symbol: { type: "text", text: "✕", color: [220, 30, 30, 1], haloColor: [255, 255, 255], haloSize: 1.5, font: { size: 13, weight: "bold" } },
        }),
      );
    }
  }
}

function ensureDrawingLayers(view, modules) {
  const { GraphicsLayer } = modules;
  const existDraw = view.map.findLayerById("drawing-layer");
  const existLabel = view.map.findLayerById("drawing-label-layer");
  if (existDraw && existLabel) {
    drawLayer = existDraw;
    labelLayer = existLabel;
    drawLayer.removeAll();
    labelLayer.removeAll();
  } else {
    drawLayer = new GraphicsLayer({ id: "drawing-layer", listMode: "hide" });
    labelLayer = new GraphicsLayer({ id: "drawing-label-layer", listMode: "hide" });
    view.map.addMany([drawLayer, labelLayer]);
  }
}

// Public API

export function getDrawingMode() {
  return drawState.mode;
}

export function getDrawingState() {
  return { mode: drawState.mode, vertices: [...drawState.vertices], unit: drawState.unit };
}

export function getMeasurements() {
  const v = drawState.vertices;
  if (drawState.mode === "area") {
    return { perimeterM: perimM(v), areaHa: polygonAreaHa(v) };
  }
  if (drawState.mode === "line") {
    return { distanceM: lineDistM(v) };
  }
  return {};
}

export function formatLineDistance(meters, unit = drawState.unit) {
  const converters = {
    m: (m) => `${m.toFixed(1)} m`,
    km: (m) => `${(m / 1000).toFixed(3)} km`,
    pies: (m) => `${(m * 3.28084).toFixed(1)} ft`,
    millas: (m) => `${(m / 1609.34).toFixed(3)} mi`,
  };
  return (converters[unit] || converters.m)(meters);
}

export function cycleLineUnit() {
  const units = ["m", "km", "pies", "millas"];
  drawState.unit = units[(units.indexOf(drawState.unit) + 1) % units.length];
  return drawState.unit;
}

export async function startDrawingMode(mode, { onVertex } = {}) {
  const view = getMapView();
  const modules = getArcGISModules();
  if (!view || !modules) {
    throw new Error("Mapa no inicializado. Espera a que el mapa ArcGIS cargue.");
  }

  drawState.mode = mode;
  drawState.vertices = [];
  onVertexCallback = onVertex || null;

  ensureDrawingLayers(view, modules);

  setMapDrawingClickHandler(async (pointData) => {
    const lat = pointData.latitude;
    const lon = pointData.longitude;
    const verts = drawState.vertices;
    const THRESH = 0.0003; // ~33 m at equator

    if (editorMode === "draw") {
      verts.push({ lat, lon });
    } else if (editorMode === "edit") {
      if (selectedVertexIndex >= 0) {
        // Move the selected vertex to the clicked position
        verts[selectedVertexIndex] = { lat, lon };
        selectedVertexIndex = -1;
      } else {
        // Try to select an existing vertex
        const vi = findNearest(verts, lat, lon, THRESH);
        if (vi >= 0) {
          selectedVertexIndex = vi;
        } else if (drawState.mode === "area" && verts.length >= 2) {
          // Try to insert at a midpoint
          const mids = getMidpoints(verts);
          const mi = findNearest(mids, lat, lon, THRESH);
          if (mi >= 0) {
            verts.splice((mi + 1) % verts.length, 0, { lat, lon });
          }
        }
      }
    } else if (editorMode === "delete") {
      if (verts.length <= 3) return; // enforce min 3 vertices
      const vi = findNearest(verts, lat, lon, THRESH);
      if (vi >= 0) verts.splice(vi, 1);
    }

    await rebuildGraphics();
    onVertexCallback?.();
  });
}

export async function loadVerticesIntoDrawing(vertices) {
  drawState.vertices = vertices.map((v) => ({ lat: v.lat, lon: v.lon }));
  await rebuildGraphics();
  onVertexCallback?.();
}

export async function undoLastVertex() {
  if (drawState.vertices.length > 0) {
    drawState.vertices.pop();
    await rebuildGraphics();
    onVertexCallback?.();
  }
}

export function cancelDrawing() {
  drawState.mode = null;
  drawState.vertices = [];
  editorMode = "draw";
  selectedVertexIndex = -1;
  setMapDrawingClickHandler(null);
  if (drawLayer) drawLayer.removeAll();
  if (labelLayer) labelLayer.removeAll();
  drawLayer = null;
  labelLayer = null;
}

// ─── Persistent saved-items layer ────────────────────────────────────────

function ensureSavedLayer(view, modules) {
  const { GraphicsLayer } = modules;
  const existing = view.map.findLayerById("saved-items-layer");
  if (existing) { savedLayer = existing; return; }
  savedLayer = new GraphicsLayer({ id: "saved-items-layer", listMode: "hide" });
  // Add below drawing layer so drawing graphics are always on top
  view.map.add(savedLayer, 0);
}

function buildSavedGraphic(item, Graphic) {
  if (item.tipo === "area" && item.vertices?.length >= 3) {
    const rings = item.vertices.map((v) => [v.lon, v.lat]);
    const rgb = parseHexColor(item.color || "#2d5a27");
    return new Graphic({
      geometry: { type: "polygon", rings: [[...rings, rings[0]]], spatialReference: { wkid: 4326 } },
      symbol: { type: "simple-fill", color: [...rgb, 0.2], outline: { color: item.color || "#2d5a27", width: 2 } },
      attributes: { id: item.id, tipo: "area" },
    });
  }
  if (item.tipo === "linea" && item.puntos?.length >= 2) {
    const paths = item.puntos.map((p) => [p.lon, p.lat]);
    return new Graphic({
      geometry: { type: "polyline", paths: [paths], spatialReference: { wkid: 4326 } },
      symbol: { type: "simple-line", color: "#2d5a27", width: 2 },
      attributes: { id: item.id, tipo: "linea" },
    });
  }
  return null;
}

export async function addSavedAreaToMap(item) {
  const view = getMapView();
  const modules = getArcGISModules();
  if (!view || !modules) return;
  ensureSavedLayer(view, modules);
  const g = buildSavedGraphic(item, modules.Graphic);
  if (g) savedLayer.add(g);
}

export async function addSavedLineaToMap(item) {
  const view = getMapView();
  const modules = getArcGISModules();
  if (!view || !modules) return;
  ensureSavedLayer(view, modules);
  const g = buildSavedGraphic(item, modules.Graphic);
  if (g) savedLayer.add(g);
}

export async function loadAllSavedItemsOnMap(guardados = []) {
  const view = getMapView();
  const modules = getArcGISModules();
  if (!view || !modules) return;
  ensureSavedLayer(view, modules);
  savedLayer.removeAll();
  for (const item of guardados) {
    const g = buildSavedGraphic(item, modules.Graphic);
    if (g) savedLayer.add(g);
  }
}

export function removeSavedItemFromMap(itemId) {
  if (!savedLayer) return;
  const toRemove = savedLayer.graphics.toArray().filter((g) => g.attributes?.id === itemId);
  toRemove.forEach((g) => savedLayer.remove(g));
}

export function updateSavedItemColor(itemId, color) {
  if (!savedLayer) return;
  const rgb = parseHexColor(color);
  const toUpdate = savedLayer.graphics.toArray().filter((g) => g.attributes?.id === itemId);
  toUpdate.forEach((g) => {
    g.symbol = { type: "simple-fill", color: [...rgb, 0.2], outline: { color, width: 2 } };
  });
}

export async function addPhotoMarkerToMap({ lat, lon, id }) {
  const view = getMapView();
  const modules = getArcGISModules();
  if (!view || !modules || !lat || !lon) return;
  const { Graphic, GraphicsLayer } = modules;

  const existing = view.map.findLayerById("photo-markers-layer");
  if (existing) {
    photoLayer = existing;
  } else {
    photoLayer = new GraphicsLayer({ id: "photo-markers-layer", listMode: "hide" });
    view.map.add(photoLayer);
  }

  photoLayer.add(
    new Graphic({
      geometry: { type: "point", longitude: lon, latitude: lat, spatialReference: { wkid: 4326 } },
      symbol: {
        type: "simple-marker",
        color: [45, 90, 39, 1],
        size: 10,
        style: "diamond",
        outline: { color: [255, 255, 255], width: 2 },
      },
      attributes: { id, tipo: "foto" },
    }),
  );
}

export async function highlightSavedItem(item) {
  const view = getMapView();
  const modules = getArcGISModules();
  if (!view || !modules) return;
  const { Graphic, GraphicsLayer } = modules;

  // BUG 2 fix: ensure view is fully ready before calling goTo
  try { await view.when(); } catch { return; }

  const existing = view.map.findLayerById("highlight-layer");
  if (existing) {
    highlightLayer = existing;
  } else {
    highlightLayer = new GraphicsLayer({ id: "highlight-layer", listMode: "hide" });
    view.map.add(highlightLayer);
  }
  highlightLayer.removeAll();

  // Small delay so any ongoing navigation/animation can settle
  await new Promise((r) => setTimeout(r, 120));

  if (item.tipo === "area" && item.vertices?.length >= 3) {
    const rings = item.vertices.map((v) => [v.lon, v.lat]);
    const rgb = parseHexColor(item.color || "#2d5a27");
    highlightLayer.add(
      new Graphic({
        geometry: { type: "polygon", rings: [[...rings, rings[0]]], spatialReference: { wkid: 4326 } },
        symbol: { type: "simple-fill", color: [...rgb, 0.25], outline: { color: item.color || "#2d5a27", width: 2.5 } },
      }),
    );
    const lats = item.vertices.map((v) => v.lat);
    const lons = item.vertices.map((v) => v.lon);
    try {
      await view.goTo({
        target: {
          type: "extent",
          xmin: Math.min(...lons) - 0.001,
          xmax: Math.max(...lons) + 0.001,
          ymin: Math.min(...lats) - 0.001,
          ymax: Math.max(...lats) + 0.001,
          spatialReference: { wkid: 4326 },
        },
      }, { duration: 600 });
    } catch (err) {
      if (!String(err?.message).includes("goto-interrupted")) throw err;
    }
  } else if (item.tipo === "foto" && item.lat && item.lon) {
    try {
      await view.goTo({ center: [item.lon, item.lat], zoom: 17 }, { duration: 600 });
    } catch (err) {
      if (!String(err?.message).includes("goto-interrupted")) throw err;
    }
  } else if (item.tipo === "linea" && item.puntos?.length >= 2) {
    const paths = item.puntos.map((p) => [p.lon, p.lat]);
    highlightLayer.add(
      new Graphic({
        geometry: { type: "polyline", paths: [paths], spatialReference: { wkid: 4326 } },
        symbol: { type: "simple-line", color: "#2d5a27", width: 2.5 },
      }),
    );
    const lats = item.puntos.map((p) => p.lat);
    const lons = item.puntos.map((p) => p.lon);
    try {
      await view.goTo({
        target: {
          type: "extent",
          xmin: Math.min(...lons) - 0.001,
          xmax: Math.max(...lons) + 0.001,
          ymin: Math.min(...lats) - 0.001,
          ymax: Math.max(...lats) + 0.001,
          spatialReference: { wkid: 4326 },
        },
      }, { duration: 600 });
    } catch (err) {
      if (!String(err?.message).includes("goto-interrupted")) throw err;
    }
  }
}
