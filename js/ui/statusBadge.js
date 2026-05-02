import { escapeHtml } from "../core/helpers.js";

export function renderSyncBadge(status) {
  const safeStatus = status || "pendiente";
  return `<span class="status-badge status-badge--${escapeHtml(safeStatus)}">${escapeHtml(safeStatus)}</span>`;
}

export function renderConnectionBadge(online) {
  const label = online ? "online" : "offline";
  return `<span class="connection-badge connection-badge--${label}">${online ? "Online" : "Offline"}</span>`;
}