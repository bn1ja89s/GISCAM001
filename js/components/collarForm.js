import { escapeHtml, formatDateTime, todayValue } from "../core/helpers.js";
import { renderIcon } from "../ui/icons.js";

function getElevationStatusLabel(collar) {
  if (!collar) {
    return "Sin dato";
  }

  return collar.elevation_status === "resolved" || collar.elevacion != null
    ? "Resuelta"
    : "Pendiente por conexion";
}

function getElevationSourceLabel(collar) {
  if (!collar) {
    return "-";
  }

  if (collar.elevation_status !== "resolved" && collar.elevacion == null) {
    return collar.elevation_source === "project-dem" ? "DEM del proyecto" : "DEM global";
  }

  if (collar.elevation_source === "project-dem") {
    return "DEM del proyecto";
  }

  if (collar.elevation_source === "global-dem") {
    return "DEM global";
  }

  if (collar.elevation_source === "gps-device") {
    return "GPS";
  }

  if (collar.elevation_source === "remote-sync") {
    return "Dato sincronizado";
  }

  return "-";
}

function getCaptureSourceLabel(collar) {
  if (!collar) {
    return "-";
  }

  if (collar.capture_source === "gps") {
    return "GPS promediado";
  }

  if (collar.capture_source === "manual") {
    return "Coordenadas manuales";
  }

  if (collar.capture_source === "map") {
    return "Seleccion en mapa";
  }

  return "-";
}

function hasCoordinates(collar, editingCollar) {
  const latitude = collar?.latitude ?? editingCollar?.latitude;
  const longitude = collar?.longitude ?? editingCollar?.longitude;
  return latitude != null && longitude != null;
}

function renderModeTabs(captureMode) {
  return `
    <div class="capture-mode-tabs" role="group" aria-label="Modo de captura">
      <button class="mode-pill ${captureMode === "map" ? "is-active" : ""}" type="button" data-action="set-capture-mode" data-mode="map">Por mapa</button>
      <button class="mode-pill ${captureMode === "gps" ? "is-active" : ""}" type="button" data-action="set-capture-mode" data-mode="gps">Por GPS</button>
    </div>
  `;
}

function renderCoordinateRow(collar) {
  return `
    <div class="capture-coordinate-strip" aria-label="Resumen de coordenadas capturadas">
      <span class="capture-coordinate-pill"><strong>Lat</strong>${escapeHtml(String(collar.latitude ?? "-"))}</span>
      <span class="capture-coordinate-pill"><strong>Lon</strong>${escapeHtml(String(collar.longitude ?? "-"))}</span>
      <span class="capture-coordinate-pill"><strong>${renderIcon("mountain")} Z</strong>${escapeHtml(String(collar.elevacion ?? "-"))} m</span>
    </div>
  `;
}

function renderPrimaryFieldSet(collar, currentTipo) {
  const locationOptions = ["Sector", "Plataforma", "Campamento", "Frente de Explotacion", "Otros"];
  const currentLocation = collar.localizacion || "";
  const isCustomLocation = currentLocation && !locationOptions.includes(currentLocation);
  const selectedLocation = isCustomLocation ? "Otros" : currentLocation;

  return `
    <div class="grid-fields">
      <label class="field">
        <span>Hole ID</span>
        <input class="input" name="hole_id" value="${escapeHtml(collar.hole_id || "")}" required>
      </label>
      <label class="field">
        <span>Tipo</span>
        <select class="select" name="tipo">
          <option value="POZO" ${currentTipo === "POZO" ? "selected" : ""}>Exploracion en pozo</option>
          <option value="CALICATA" ${currentTipo === "CALICATA" ? "selected" : ""}>Exploracion en calicata</option>
          <option value="CANALETA" ${currentTipo === "CANALETA" ? "selected" : ""}>Exploracion en canaleta</option>
        </select>
      </label>
    </div>

    <label class="field">
      <span>Localizacion</span>
      <input type="hidden" name="localizacion" value="${escapeHtml(currentLocation)}" data-custom-value="localizacion">
      <select class="select" data-custom-select="localizacion">
        <option value="" ${selectedLocation === "" ? "selected" : ""}>Selecciona</option>
        ${locationOptions.map((option) => `<option value="${escapeHtml(option)}" ${selectedLocation === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
      </select>
      <input class="input ${isCustomLocation || selectedLocation === "Otros" ? "" : "hidden"}" data-custom-input="localizacion" value="${escapeHtml(isCustomLocation ? currentLocation : "")}" placeholder="Escribe otra localizacion">
    </label>
  `;
}

function renderSecondaryFieldSet(collar, lockDate = false) {
  const dateAttrs = lockDate
    ? 'readonly style="pointer-events:none;background:#f5f5f5;color:#888;"'
    : '';
  return `
    <div class="grid-fields">
      <label class="field">
        <span>Profundidad total</span>
        <input class="input" name="prof_total" type="number" step="0.01" value="${escapeHtml(String(collar.prof_total ?? ""))}">
      </label>
      <label class="field">
        <span>Fecha</span>
        <input class="input" name="fecha" type="date" value="${escapeHtml(collar.fecha || todayValue())}" required ${dateAttrs}>
      </label>
    </div>
  `;
}

function renderAuditMeta(record) {
  if (!record?.fecha_creacion && !record?.fecha_modificacion) {
    return "";
  }

  return `
    <div class="record-audit" aria-label="Fechas del collar">
      <span>Creado: ${escapeHtml(formatDateTime(record.fecha_creacion))}</span>
      <span>Modificado: ${escapeHtml(formatDateTime(record.fecha_modificacion))}</span>
    </div>
  `;
}

function renderFieldSet(collar, currentTipo, lockDate = false) {
  return `
    ${renderPrimaryFieldSet(collar, currentTipo)}
    ${renderSecondaryFieldSet(collar, lockDate)}
  `;
}

function renderCoordinatesPanel(collar, activeProject, { compact = false, editable = false } = {}) {
  const coordinateAttrs = editable
    ? 'type="number" step="0.000001" min="-90" max="90" required'
    : "readonly";
  const longitudeAttrs = editable
    ? 'type="number" step="0.000001" min="-180" max="180" required'
    : "readonly";

  return `
    <div class="panel-tile stack ${compact ? "capture-sheet__readonly" : ""}">
      <p class="eyebrow">Coordenadas geograficas</p>
      <div class="grid-fields grid-fields--3">
        <label class="field">
          <span>Latitud</span>
          <input class="input" name="latitude" ${coordinateAttrs} value="${escapeHtml(String(collar.latitude ?? ""))}">
        </label>
        <label class="field">
          <span>Longitud</span>
          <input class="input" name="longitude" ${longitudeAttrs} value="${escapeHtml(String(collar.longitude ?? ""))}">
        </label>
        <label class="field">
          <span>Elevacion</span>
          <input class="input" name="elevacion" readonly value="${escapeHtml(String(collar.elevacion ?? ""))}">
        </label>
      </div>
      <div class="grid-fields">
        <label class="field">
          <span>Este</span>
          <input class="input" name="este" readonly value="${escapeHtml(String(collar.este ?? ""))}">
        </label>
        <label class="field">
          <span>Norte</span>
          <input class="input" name="norte" readonly value="${escapeHtml(String(collar.norte ?? ""))}">
        </label>
      </div>
      <p class="muted">SR del proyecto: ${escapeHtml(activeProject.sr_proyecto || "-")}. Elevacion ${escapeHtml(getElevationStatusLabel(collar))} desde ${escapeHtml(getElevationSourceLabel(collar))}.</p>
    </div>
  `;
}

export function renderCollarForm({ activeProject, draftCollar, editingCollar, captureMode = "map", variant = "page" }) {
  if (!activeProject) {
    return `
      <div class="notice">
        Debes crear o seleccionar un proyecto activo antes de registrar un collar.
      </div>
    `;
  }

  const collar = editingCollar || draftCollar || {};
  const capturedPoint = hasCoordinates(collar, editingCollar);
  const currentTipo = collar.tipo || "POZO";
  const isSheet = variant === "map-sheet";
  const isNewSheet = isSheet && !editingCollar;
  const resetAction = editingCollar ? "reset-collar-form" : "clear-draft-collar";
  const submitLabel = editingCollar ? "Actualizar collar" : "Registrar collar";
  const projectLabel = activeProject.cod_exploracion || activeProject.concesion_area || "Proyecto activo";

  return `
    <form id="collar-form" class="stack collar-form ${isSheet ? "collar-form--sheet" : ""}" autocomplete="off">
      <input type="hidden" name="uuid" value="${escapeHtml(editingCollar?.uuid || "")}">
      <input type="hidden" name="proyecto_uuid" value="${escapeHtml(activeProject.uuid)}">
      <input type="hidden" name="geometry" value='${escapeHtml(JSON.stringify(collar.geometry || editingCollar?.geometry || null))}'>
      <input type="hidden" name="capture_source" value="${escapeHtml(collar.capture_source || "")}">

      ${isSheet ? `
        <div class="capture-sheet__chrome stack--tight">
          <div class="capture-sheet__handle" aria-hidden="true"></div>
          <div class="capture-sheet__header">
            <button class="icon-button icon-button--ghost" type="button" data-action="${resetAction}" aria-label="Volver al mapa">
              ${renderIcon("back")}
            </button>
            <div class="capture-sheet__header-copy">
              <p class="eyebrow">Captura activa</p>
              <h2 class="title-md">${editingCollar ? "Editar collar" : "Nuevo collar"}</h2>
              <p class="capture-sheet__project muted">${escapeHtml(projectLabel)}</p>
            </div>
            <button class="icon-button icon-button--ghost" type="button" data-action="${resetAction}" aria-label="Cerrar panel de captura">
              ${renderIcon("close")}
            </button>
          </div>
          <div class="capture-sheet__summary stack--tight">
            ${renderCoordinateRow(collar)}
            <div class="capture-sheet__meta list-item__meta">
              <span>${escapeHtml(getCaptureSourceLabel(collar))}</span>
              <span>Elevacion ${escapeHtml(getElevationStatusLabel(collar))}</span>
              <span>${escapeHtml(getElevationSourceLabel(collar))}</span>
            </div>
          </div>
          ${renderModeTabs(captureMode)}
        </div>
      ` : `
        <div class="collar-summary panel-tile stack">
          <strong>Proyecto activo ${escapeHtml(activeProject.cod_exploracion)}</strong>
          <p class="muted">El collar siempre se registra vinculado al proyecto seleccionado.</p>
          <div class="list-item__meta">
            <span>Lat ${escapeHtml(String(collar.latitude ?? "-"))}</span>
            <span>Lon ${escapeHtml(String(collar.longitude ?? "-"))}</span>
            <span>Elev ${escapeHtml(String(collar.elevacion ?? "-"))}</span>
            <span>${escapeHtml(getElevationStatusLabel(collar))}</span>
            <span>Fuente ${escapeHtml(getCaptureSourceLabel(collar))}</span>
          </div>
        </div>
      `}

      ${isSheet ? `
        <div class="capture-sheet__body">
          <div class="notice ${capturedPoint ? "hidden" : ""}">
            Captura primero un punto en el mapa para poder registrar este collar.
          </div>
          ${renderFieldSet(collar, currentTipo, isNewSheet)}
          ${renderCoordinatesPanel(collar, activeProject, { compact: true, editable: Boolean(editingCollar) })}
          ${renderAuditMeta(collar)}
        </div>
      ` : `
        <div class="notice ${capturedPoint ? "hidden" : ""}">
          Captura primero un punto en el mapa para poder registrar este collar.
        </div>
        ${renderFieldSet(collar, currentTipo, false)}
        ${renderCoordinatesPanel(collar, activeProject, { editable: Boolean(editingCollar) })}
        ${renderAuditMeta(collar)}
      `}

      <div class="inline-row ${isSheet ? "capture-sheet__actions" : ""}">
        <button class="ghost-button" type="button" data-action="${resetAction}">${editingCollar ? "Cancelar edicion" : "Cancelar"}</button>
        <button class="button" type="submit" ${capturedPoint ? "" : "disabled"}>${submitLabel}</button>
        ${!isSheet ? '<button class="ghost-button" type="button" data-action="go-to-map">Ir al mapa</button>' : ""}
        ${editingCollar && !isSheet ? `<button class="ghost-button ghost-button--danger" type="button" data-action="remove-collar" data-uuid="${escapeHtml(editingCollar.uuid)}">Eliminar</button>` : ""}
      </div>
    </form>
  `;
}
