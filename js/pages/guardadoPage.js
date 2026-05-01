import { escapeHtml, formatDateTime } from "../core/helpers.js";
import { renderIcon } from "../ui/icons.js";

// ─── Utility: file download ────────────────────────────────────────────────
export function descargarArchivo(nombre, contenido, tipo) {
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(new Blob([contenido], { type: tipo })),
    download: nombre,
  });
  a.click();
  URL.revokeObjectURL(a.href);
}

// ─── Utility: GeoJSON export ──────────────────────────────────────────────
export function exportarGeoJSON(item) {
  let geometry;
  if (item.tipo === "foto") {
    geometry = { type: "Point", coordinates: [item.lon, item.lat] };
  } else if (item.tipo === "area") {
    const c = (item.vertices || []).map((v) => [v.lon, v.lat]);
    if (c.length > 0) c.push(c[0]);
    geometry = { type: "Polygon", coordinates: [c] };
  } else {
    geometry = { type: "LineString", coordinates: (item.puntos || []).map((p) => [p.lon, p.lat]) };
  }
  const geojson = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      geometry,
      properties: { titulo: item.titulo, notas: item.notas || "", fecha: item.fecha },
    }],
  };
  descargarArchivo(`${item.titulo || "guardado"}.geojson`, JSON.stringify(geojson, null, 2), "application/json");
}

// ─── Utility: KML export ──────────────────────────────────────────────────
export function exportarKML(item) {
  let coordStr = "";
  if (item.tipo === "foto") {
    coordStr = `${item.lon},${item.lat},0`;
  } else if (item.tipo === "area") {
    coordStr = (item.vertices || []).map((v) => `${v.lon},${v.lat},0`).join(" ");
  } else {
    coordStr = (item.puntos || []).map((p) => `${p.lon},${p.lat},0`).join(" ");
  }
  const tag = item.tipo === "foto"
    ? `<Point><coordinates>${coordStr}</coordinates></Point>`
    : item.tipo === "area"
      ? `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordStr}</coordinates></LinearRing></outerBoundaryIs></Polygon>`
      : `<LineString><coordinates>${coordStr}</coordinates></LineString>`;

  const kml = `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${escapeHtml(item.titulo || "guardado")}</name><Placemark><name>${escapeHtml(item.titulo || "guardado")}</name><description>${escapeHtml(item.notas || "")}</description>${tag}</Placemark></Document></kml>`;
  descargarArchivo(`${item.titulo || "guardado"}.kml`, kml, "application/vnd.google-earth.kml+xml");
}

// ─── Haversine ────────────────────────────────────────────────────────────
export function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dL = (lat2 - lat1) * Math.PI / 180;
  const dO = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dL / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dO / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calcularRumbo(lat1, lon1, lat2, lon2) {
  const dO = (lon2 - lon1) * Math.PI / 180;
  return ((Math.atan2(
    Math.sin(dO) * Math.cos(lat2 * Math.PI / 180),
    Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180)
    - Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dO),
  ) * 180 / Math.PI) + 360) % 360;
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return "Sin fecha";
  try {
    return new Date(iso).toLocaleDateString("es-EC", { dateStyle: "long" });
  } catch {
    return iso.slice(0, 10);
  }
}

function fmtDT(iso) {
  if (!iso) return "-";
  try {
    return formatDateTime(iso);
  } catch {
    return iso;
  }
}

function renderActionRow(icon, label, action, dataId) {
  return `
    <button class="guardado-action-row" type="button" data-action="${action}" data-id="${escapeHtml(dataId)}">
      <span>${icon} ${escapeHtml(label)}</span>
      <span class="guardado-action-row__chevron">›</span>
    </button>`;
}

// ─── Area SVG mini-preview ────────────────────────────────────────────────
const AREA_COLORS_DETAIL = ["#2d5a27", "#1a56db", "#c81e1e", "#7e3af2", "#ff8a00", "#0694a2", "#d97706", "#065f46"];

function renderAreaSvgPreview(item) {
  const verts = item.vertices || [];
  const color = item.color || "#2d5a27";
  if (verts.length < 3) {
    return `<div style="height:180px;background:${escapeHtml(color)}22;border-radius:12px;border:2px solid ${escapeHtml(color)};display:flex;align-items:center;justify-content:center"><span style="color:${escapeHtml(color)};opacity:0.6;font-size:0.9rem">Sin suficientes vértices</span></div>`;
  }
  const lats = verts.map((v) => v.lat);
  const lons = verts.map((v) => v.lon);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLon = Math.min(...lons), maxLon = Math.max(...lons);
  const spanLat = maxLat - minLat || 0.0001;
  const spanLon = maxLon - minLon || 0.0001;
  const W = 320, H = 180, PAD = 18;
  const scale = Math.min((W - 2 * PAD) / spanLon, (H - 2 * PAD) / spanLat);
  const pts = verts.map((v) => ({ x: PAD + (v.lon - minLon) * scale, y: H - PAD - (v.lat - minLat) * scale }));
  const polyPoints = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const dots = pts.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="${escapeHtml(color)}" opacity="0.85"/>`).join("");
  return `<div style="border-radius:12px;overflow:hidden;border:2px solid ${escapeHtml(color)};background:#edf3ed">
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="display:block;width:100%;height:180px">
      <polygon points="${polyPoints}" fill="${escapeHtml(color)}" fill-opacity="0.22" stroke="${escapeHtml(color)}" stroke-width="2.5" stroke-linejoin="round"/>
      ${dots}
    </svg>
  </div>`;
}

// ─── Export modal ─────────────────────────────────────────────────────────
function renderExportModal(item) {
  return `
    <div class="guardado-export-modal" role="dialog" aria-modal="true" aria-label="Exportar ${escapeHtml(item.titulo || "")}">
      <button class="guardado-export-modal__backdrop" type="button" data-action="close-guardado-export-modal" aria-label="Cerrar"></button>
      <div class="guardado-export-modal__sheet">
        <div class="guardado-export-modal__header">
          <strong>Exportar "${escapeHtml(item.titulo || "elemento")}"</strong>
          <button class="icon-button icon-button--ghost" type="button" data-action="close-guardado-export-modal" aria-label="Cerrar">${renderIcon("close")}</button>
        </div>
        <div class="guardado-export-modal__body">
          <button class="guardado-action-row" type="button" data-action="export-guardado-item-geojson" data-id="${escapeHtml(item.id)}">
            <span>📄 GeoJSON</span><span class="guardado-action-row__chevron">›</span>
          </button>
          <button class="guardado-action-row" type="button" data-action="export-guardado-item-kml" data-id="${escapeHtml(item.id)}">
            <span>🌐 KML</span><span class="guardado-action-row__chevron">›</span>
          </button>
        </div>
      </div>
    </div>`;
}

// ─── FOTO detail ──────────────────────────────────────────────────────────
function renderFotoDetail(item, exportModalOpen) {
  return `
    ${exportModalOpen ? renderExportModal(item) : ""}
    <div class="guardado-detail stack">
      <div class="guardado-detail__header">
        <button class="icon-button icon-button--ghost" type="button" data-action="close-guardado-detail" aria-label="Volver">${renderIcon("back")}</button>
        <h2 class="title-sm" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(item.titulo || "Foto")}</h2>
        <button class="icon-button icon-button--ghost" type="button" data-action="edit-guardado-title" data-id="${escapeHtml(item.id)}" aria-label="Editar título">${renderIcon("edit")}</button>
      </div>

      <div class="guardado-detail__preview">
        ${item.imagen_base64
    ? `<img src="${escapeHtml(item.imagen_base64)}" alt="Foto capturada" class="guardado-foto-full">`
    : `<div style="height:200px;background:#f0f0f0;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#999;font-size:0.9rem;">Sin imagen</div>`}
      </div>

      <div class="card">
        <div class="card__body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
            <div class="metric"><span class="eyebrow">Latitud</span><strong>${Number(item.lat || 0).toFixed(6)}</strong></div>
            <div class="metric"><span class="eyebrow">Longitud</span><strong>${Number(item.lon || 0).toFixed(6)}</strong></div>
            <div class="metric"><span class="eyebrow">Elevación</span><strong>${item.elevacion != null ? `${Number(item.elevacion).toFixed(1)} m` : "—"}</strong></div>
            <div class="metric"><span class="eyebrow">Fecha</span><strong>${escapeHtml(fmtDate(item.fecha))}</strong></div>
          </div>
          ${item.lat && item.lon ? `<p id="guardado-dist-rumbo" class="muted" style="margin-top:var(--space-3);font-size:0.85rem;text-align:center">Calculando distancia desde GPS…</p>` : ""}
        </div>
      </div>

      <div class="card">
        <div class="card__body stack" style="gap:var(--space-2)">
          <label class="eyebrow" for="guardado-notes-input">Notas</label>
          <textarea class="input textarea" id="guardado-notes-input" rows="3" placeholder="Añadir notas…" data-item-id="${escapeHtml(item.id)}">${escapeHtml(item.notas || "")}</textarea>
          <div style="display:flex;justify-content:flex-end">
            <button class="button button--compact" type="button" data-action="save-guardado-notes" data-id="${escapeHtml(item.id)}">Guardar notas</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__body" style="padding:0">
          ${renderActionRow("📍", "Mostrar en mapa", "show-guardado-on-map", item.id)}
          ${renderActionRow("✏️", "Editar ubicación", "edit-guardado-location", item.id)}
          ${renderActionRow("🧭", "Guíame", "guide-to-guardado", item.id)}
          ${renderActionRow("📤", "Exportar", "export-guardado-modal", item.id)}
          ${item.elevacion == null ? renderActionRow("🔍", "Buscar elevación", "query-guardado-elevation", item.id) : ""}
        </div>
      </div>

      <button class="ghost-button ghost-button--danger" type="button" data-action="delete-guardado" data-id="${escapeHtml(item.id)}" style="width:100%;min-height:44px">
        Eliminar foto
      </button>
    </div>`;
}

// ─── ÁREA detail ──────────────────────────────────────────────────────────
function renderAreaDetail(item, exportModalOpen) {
  const areaHa = Number(item.area_ha || 0);
  const areaM2 = Math.round(areaHa * 10000);
  const areaAcres = (areaHa * 2.47105).toFixed(3);
  const perimM = Number(item.perimetro_m || 0);
  const perimStr = perimM >= 1000 ? `${(perimM / 1000).toFixed(2)} km` : `${Math.round(perimM)} m`;
  const verts = item.vertices || [];
  const centLat = verts.length ? (verts.reduce((s, v) => s + v.lat, 0) / verts.length).toFixed(6) : "—";
  const centLon = verts.length ? (verts.reduce((s, v) => s + v.lon, 0) / verts.length).toFixed(6) : "—";

  return `
    ${exportModalOpen ? renderExportModal(item) : ""}
    <div class="guardado-detail stack">
      <div class="guardado-detail__header">
        <button class="icon-button icon-button--ghost" type="button" data-action="close-guardado-detail" aria-label="Volver">${renderIcon("back")}</button>
        <h2 class="title-sm" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(item.titulo || "Área")}</h2>
        <button class="icon-button icon-button--ghost" type="button" data-action="edit-guardado-title" data-id="${escapeHtml(item.id)}" aria-label="Editar título">${renderIcon("edit")}</button>
      </div>

      ${renderAreaSvgPreview(item)}

      <div class="card">
        <div class="card__body stack" style="gap:var(--space-2)">
          <span class="eyebrow">Color del área</span>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${AREA_COLORS_DETAIL.map((c) => `<button type="button" class="color-swatch${(item.color || "#2d5a27") === c ? " is-active" : ""}" style="background:${c};width:28px;height:28px;border-radius:50%;border:2px solid ${(item.color || "#2d5a27") === c ? "#333" : "transparent"};cursor:pointer" data-action="change-guardado-color" data-id="${escapeHtml(item.id)}" data-color="${c}" aria-label="Color ${c}"></button>`).join("")}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
            <div class="metric"><span class="eyebrow">Área</span><strong>${areaHa.toFixed(3)} ha</strong></div>
            <div class="metric"><span class="eyebrow">Área (m²)</span><strong>${areaM2.toLocaleString("es")}</strong></div>
            <div class="metric"><span class="eyebrow">Área (acres)</span><strong>${areaAcres}</strong></div>
            <div class="metric"><span class="eyebrow">Perímetro</span><strong>${perimStr}</strong></div>
            <div class="metric"><span class="eyebrow">Centroide lat</span><strong>${centLat}</strong></div>
            <div class="metric"><span class="eyebrow">Centroide lon</span><strong>${centLon}</strong></div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__body stack" style="gap:var(--space-2)">
          <label class="eyebrow" for="guardado-notes-input">Notas</label>
          <textarea class="input textarea" id="guardado-notes-input" rows="3" placeholder="Añadir notas…" data-item-id="${escapeHtml(item.id)}">${escapeHtml(item.notas || "")}</textarea>
          <div style="display:flex;justify-content:flex-end">
            <button class="button button--compact" type="button" data-action="save-guardado-notes" data-id="${escapeHtml(item.id)}">Guardar notas</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__body" style="padding:0">
          ${renderActionRow("🗺️", "Mostrar en mapa", "show-guardado-on-map", item.id)}
          ${renderActionRow("✏️", "Editar", "edit-guardado-area", item.id)}
          ${renderActionRow("📊", "Estadísticas", "guardado-area-stats", item.id)}
          ${renderActionRow("📤", "Exportar", "export-guardado-modal", item.id)}
          ${renderActionRow("🗺️", "Descargar mapa de la zona", "download-guardado-area-tiles", item.id)}
        </div>
      </div>

      <button class="ghost-button ghost-button--danger" type="button" data-action="delete-guardado" data-id="${escapeHtml(item.id)}" style="width:100%;min-height:44px">
        Eliminar área
      </button>
    </div>`;
}

// ─── LÍNEA detail ─────────────────────────────────────────────────────────
function renderLineaDetail(item, exportModalOpen) {
  const distM = Number(item.distancia_m || 0);
  const distKm = (distM / 1000).toFixed(3);
  const distFt = (distM * 3.28084).toFixed(1);
  const distMi = (distM / 1609.34).toFixed(3);

  return `
    ${exportModalOpen ? renderExportModal(item) : ""}
    <div class="guardado-detail stack">
      <div class="guardado-detail__header">
        <button class="icon-button icon-button--ghost" type="button" data-action="close-guardado-detail" aria-label="Volver">${renderIcon("back")}</button>
        <h2 class="title-sm" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(item.titulo || "Línea")}</h2>
        <button class="icon-button icon-button--ghost" type="button" data-action="edit-guardado-title" data-id="${escapeHtml(item.id)}" aria-label="Editar título">${renderIcon("edit")}</button>
      </div>

      <div style="height:200px;background:var(--color-primary-light);border-radius:12px;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px">
        <span style="font-size:2.2rem;color:var(--color-primary)">${renderIcon("ruler")}</span>
        <p style="color:var(--color-primary);font-weight:700;font-size:1.1rem">${item.unidad_display || `${distM.toFixed(1)} m`}</p>
      </div>

      <div class="card">
        <div class="card__body">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-3)">
            <div class="metric"><span class="eyebrow">Metros</span><strong>${distM.toFixed(1)} m</strong></div>
            <div class="metric"><span class="eyebrow">Kilómetros</span><strong>${distKm} km</strong></div>
            <div class="metric"><span class="eyebrow">Pies</span><strong>${distFt} ft</strong></div>
            <div class="metric"><span class="eyebrow">Millas</span><strong>${distMi} mi</strong></div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__body stack" style="gap:var(--space-2)">
          <label class="eyebrow" for="guardado-notes-input">Notas</label>
          <textarea class="input textarea" id="guardado-notes-input" rows="3" placeholder="Añadir notas…" data-item-id="${escapeHtml(item.id)}">${escapeHtml(item.notas || "")}</textarea>
          <div style="display:flex;justify-content:flex-end">
            <button class="button button--compact" type="button" data-action="save-guardado-notes" data-id="${escapeHtml(item.id)}">Guardar notas</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__body" style="padding:0">
          ${renderActionRow("🗺️", "Mostrar en mapa", "show-guardado-on-map", item.id)}
          ${renderActionRow("📤", "Exportar", "export-guardado-modal", item.id)}
        </div>
      </div>

      <button class="ghost-button ghost-button--danger" type="button" data-action="delete-guardado" data-id="${escapeHtml(item.id)}" style="width:100%;min-height:44px">
        Eliminar línea
      </button>
    </div>`;
}

// ─── Public detail renderer ───────────────────────────────────────────────
export function renderGuardadoDetail(item, exportModalOpen = false) {
  if (!item) {
    return `<div class="card"><div class="card__body"><p class="muted">Elemento no encontrado.</p><button class="ghost-button ghost-button--compact" type="button" data-action="close-guardado-detail">Volver</button></div></div>`;
  }
  if (item.tipo === "foto") return renderFotoDetail(item, exportModalOpen);
  if (item.tipo === "area") return renderAreaDetail(item, exportModalOpen);
  if (item.tipo === "linea") return renderLineaDetail(item, exportModalOpen);
  return `<div class="card"><div class="card__body"><p class="muted">Tipo desconocido.</p></div></div>`;
}

// ─── List helpers ─────────────────────────────────────────────────────────
function renderItem(item) {
  if (item.tipo === "area") {
    return `
      <div class="list-item" data-action="view-guardado" data-id="${escapeHtml(item.id)}" style="cursor:pointer">
        <div class="list-item__icon" style="background:${escapeHtml(item.color || "#2d5a27")}22;color:${escapeHtml(item.color || "#2d5a27")}">
          ${renderIcon("area")}
        </div>
        <div class="list-item__body">
          <strong>${escapeHtml(item.titulo || "Área")}</strong>
          <p class="muted">${escapeHtml(fmtDT(item.fecha))} · ${Number(item.area_ha || 0).toFixed(3)} ha</p>
        </div>
        <button class="icon-button icon-button--ghost" type="button" data-action="delete-guardado" data-id="${escapeHtml(item.id)}" aria-label="Eliminar">
          ${renderIcon("trash")}
        </button>
      </div>`;
  }

  if (item.tipo === "linea") {
    return `
      <div class="list-item" data-action="view-guardado" data-id="${escapeHtml(item.id)}" style="cursor:pointer">
        <div class="list-item__icon" style="color:var(--color-primary)">
          ${renderIcon("ruler")}
        </div>
        <div class="list-item__body">
          <strong>${escapeHtml(item.titulo || "Línea")}</strong>
          <p class="muted">${escapeHtml(fmtDT(item.fecha))} · ${escapeHtml(item.unidad_display || "-")}</p>
        </div>
        <button class="icon-button icon-button--ghost" type="button" data-action="delete-guardado" data-id="${escapeHtml(item.id)}" aria-label="Eliminar">
          ${renderIcon("trash")}
        </button>
      </div>`;
  }

  if (item.tipo === "foto") {
    return `
      <div class="list-item" data-action="view-guardado" data-id="${escapeHtml(item.id)}" style="cursor:pointer">
        ${item.imagen_base64
    ? `<img class="list-item__thumb" src="${escapeHtml(item.imagen_base64)}" alt="Foto capturada" loading="lazy">`
    : `<div class="list-item__icon" style="color:var(--color-primary)">${renderIcon("camera")}</div>`}
        <div class="list-item__body">
          <strong>${escapeHtml(item.titulo || "Foto")}</strong>
          <p class="muted">${escapeHtml(fmtDT(item.fecha))} · ${Number(item.lat || 0).toFixed(5)}, ${Number(item.lon || 0).toFixed(5)}</p>
        </div>
        <button class="icon-button icon-button--ghost" type="button" data-action="delete-guardado" data-id="${escapeHtml(item.id)}" aria-label="Eliminar">
          ${renderIcon("trash")}
        </button>
      </div>`;
  }

  return "";
}

function groupByDate(items) {
  const groups = {};
  for (const item of items) {
    const key = (item.fecha || "").slice(0, 10) || "sin-fecha";
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
}

// ─── Page root ────────────────────────────────────────────────────────────
export function renderGuardadoPage({ guardados = [], guardadoDetailId = "", guardadoExportModalId = "" }) {
  // ── Detail view ──
  if (guardadoDetailId) {
    const item = guardados.find((g) => g.id === guardadoDetailId) || null;
    const exportOpen = guardadoExportModalId === (item?.id || "");
    return `<section class="guardado-detail-wrapper">${renderGuardadoDetail(item, exportOpen)}</section>`;
  }

  // ── List view ──
  const groups = groupByDate(guardados);
  return `
    <section class="stack">
      <div class="section-head">
        <div>
          <p class="eyebrow">Elementos guardados</p>
          <h2 class="title-md">Guardado</h2>
        </div>
        <div class="inline-row">
          <button class="ghost-button ghost-button--compact" type="button" data-action="export-guardado-geojson" ${guardados.length === 0 ? "disabled" : ""}>
            ${renderIcon("upload")}<span>GeoJSON</span>
          </button>
          <button class="ghost-button ghost-button--compact ghost-button--danger" type="button" data-action="clear-all-guardado" ${guardados.length === 0 ? "disabled" : ""}>
            ${renderIcon("trash")}<span>Eliminar todo</span>
          </button>
        </div>
      </div>
      ${guardados.length === 0
    ? `<div class="card">
            <div class="card__body" style="text-align:center;padding:var(--space-7)">
              <p class="eyebrow">Sin registros</p>
              <p class="muted">Usa el mapa para crear áreas, medir distancias o capturar fotos.</p>
            </div>
          </div>`
    : `<div class="card">
            <div class="card__body stack" style="gap:0">
              ${groups.map(([key, items]) => `
                <div class="guardado-group">
                  <p class="eyebrow guardado-group__date">${escapeHtml(fmtDate(key))}</p>
                  ${items.map(renderItem).join("")}
                </div>
              `).join("")}
            </div>
          </div>`}
    </section>`;
}


