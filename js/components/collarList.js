import { escapeHtml, formatDateTime } from "../core/helpers.js";
import { renderSyncBadge } from "../ui/statusBadge.js";

export function renderCollarList(collars) {
  if (!collars.length) {
    return '<div class="empty-state">No hay collars registrados para el proyecto activo.</div>';
  }

  return `
    <div class="list">
      ${collars
        .map(
          (collar) => `
            <article class="list-item stack">
              <div class="section-head">
                <div>
                  <h3 class="title-sm">${escapeHtml(collar.hole_id)}</h3>
                  <p class="muted">${escapeHtml(collar.tipo || "-")}</p>
                </div>
                ${renderSyncBadge(collar.estado_sync)}
              </div>
              <div class="list-item__meta">
                <span>Lat: ${escapeHtml(String(collar.latitude ?? "-"))}</span>
                <span>Lon: ${escapeHtml(String(collar.longitude ?? "-"))}</span>
                <span>Este: ${escapeHtml(String(collar.este ?? "-"))}</span>
                <span>Norte: ${escapeHtml(String(collar.norte ?? "-"))}</span>
                <span>Prof: ${escapeHtml(String(collar.prof_total || 0))} m</span>
              </div>
              <div class="record-audit record-audit--compact">
                <span>Creado: ${escapeHtml(formatDateTime(collar.fecha_creacion))}</span>
                <span>Modificado: ${escapeHtml(formatDateTime(collar.fecha_modificacion))}</span>
              </div>
              <div class="inline-row">
                <button class="ghost-button" type="button" data-action="edit-collar" data-uuid="${collar.uuid}">Editar</button>
                <button class="ghost-button" type="button" data-action="focus-collar" data-uuid="${collar.uuid}">Enfocar mapa</button>
                <button class="ghost-button" type="button" data-action="remove-collar" data-uuid="${collar.uuid}">Eliminar</button>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}
