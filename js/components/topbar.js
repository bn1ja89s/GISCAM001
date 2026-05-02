import { escapeHtml } from "../core/helpers.js";
import { renderConnectionBadge } from "../ui/statusBadge.js";
import { renderIcon } from "../ui/icons.js";

export function renderTopbar({ appName, online, activeProject, pendingCount, canInstall, isSyncing }) {
  return `
    <div class="topbar__left">
      <button class="icon-button topbar__menu" type="button" data-action="toggle-sidebar" aria-label="Abrir navegacion">
        ${renderIcon("menu")}
      </button>
    </div>
    <div class="topbar__center">
      <p class="eyebrow">Proyecto activo</p>
      <h1 class="topbar__title" title="${escapeHtml(activeProject?.cod_exploracion || appName)}">${escapeHtml(activeProject?.cod_exploracion || appName)}</h1>
      ${activeProject?.concesion_area ? `<p class="topbar__subtitle">${escapeHtml(activeProject.concesion_area)}</p>` : ""}
    </div>
    <div class="topbar__actions">
      ${renderConnectionBadge(online)}
      <span id="chip-pendientes" class="chip chip--topbar">${isSyncing ? "⟳ Sync..." : `Pend. ${pendingCount}`}</span>
      <button class="button button--topbar" type="button" data-action="sync-now" ${isSyncing || !online ? "disabled" : ""}>
        ${renderIcon("sync")}
        <span>${isSyncing ? "Sync..." : "Sincronizar"}</span>
      </button>
      <button class="ghost-button ghost-button--topbar" type="button" data-action="install-app" title="${canInstall ? "Instalar app" : "Abrir ayuda de instalacion"}">
        ${renderIcon("install")}
        <span>Instalar</span>
      </button>
    </div>
  `;
}
