import { renderIcon } from "../ui/icons.js";

let toolbarExpanded = true;

export function toggleToolbarExpanded() {
  toolbarExpanded = !toolbarExpanded;
}

export function isToolbarExpanded() {
  return toolbarExpanded;
}

function renderToolButton({ action, icon, label, active = false, disabled = false, extraAttributes = "" }) {
  return `
    <button
      class="map-tool-button ${active ? "is-active" : ""}"
      type="button"
      data-action="${action}"
      ${disabled ? "disabled" : ""}
      ${extraAttributes}
      aria-label="${label}"
      title="${label}"
    >
      ${renderIcon(icon)}
    </button>
  `;
}

export function renderMapToolbar({
  captureEnabled,
  hasActiveProject,
  captureMode,
  gpsCapture,
  hasCurrentLocation,
  mapAvailable = true,
  layersPanelOpen = false,
}) {
  const canMapCapture = mapAvailable && hasActiveProject;
  const canFixGpsPoint = captureMode === "gps" && hasCurrentLocation && hasActiveProject && gpsCapture?.navigationMode !== "fixed";

  return `
    <div class="map-tool-panel ${toolbarExpanded ? "" : "map-tool-panel--collapsed"}" role="toolbar" aria-label="Herramientas del mapa">
      <button class="map-tool-toggle" type="button" data-action="toggle-toolbar-collapse" aria-label="${toolbarExpanded ? "Colapsar panel" : "Expandir panel"}" title="${toolbarExpanded ? "Colapsar" : "Expandir"}">
        ${renderIcon(toolbarExpanded ? "chevronRight" : "chevronLeft")}
      </button>
      <div class="map-tool-buttons${toolbarExpanded ? "" : " hidden"}">
        ${renderToolButton({
          action: "activate-map-navigation",
          icon: "hand",
          label: "Navegacion libre",
          active: captureMode === "map" && !captureEnabled,
        })}
        ${renderToolButton({
          action: "activate-map-capture",
          icon: "collar",
          label: "Captura activa",
          active: captureMode === "map" && captureEnabled,
          disabled: !canMapCapture,
        })}
        ${renderToolButton({
          action: "activate-gps-mode",
          icon: "gps",
          label: "Navegacion GPS",
          active: captureMode === "gps",
        })}
        ${renderToolButton({ action: "toggle-layers-panel", icon: "layers", label: "Capas", active: layersPanelOpen })}
        ${renderToolButton({
          action: "gps-fix-point",
          icon: "capture",
          label: "Fijar punto GPS",
          disabled: !canFixGpsPoint,
        })}
      </div>
    </div>
  `;
}