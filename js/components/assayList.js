import { escapeHtml, formatDateTime } from "../core/helpers.js";
import { renderSyncBadge } from "../ui/statusBadge.js";

export function renderAssayList(assays) {
  if (!assays.length) {
    return '<div class="empty-state">No hay assay registrados para el proyecto activo.</div>';
  }

  return `
    <div class="list">
      ${assays
        .map(
          (assay) => `
            <article class="list-item stack">
              <div class="section-head">
                <div>
                  <h3 class="title-sm">${escapeHtml(assay.muestra_id || "SIN MUESTRA")}</h3>
                  <p class="muted">${escapeHtml(assay.hole_id || "-")}</p>
                </div>
                ${renderSyncBadge(assay.estado_sync)}
              </div>
              <div class="list-item__meta">
                <span>Desde: ${escapeHtml(String(assay.desde ?? "-"))}</span>
                <span>Hasta: ${escapeHtml(String(assay.hasta ?? "-"))}</span>
                <span>Material: ${escapeHtml(assay.material || "-")}</span>
              </div>
              <div class="record-audit record-audit--compact">
                <span>Creado: ${escapeHtml(formatDateTime(assay.fecha_creacion))}</span>
                <span>Modificado: ${escapeHtml(formatDateTime(assay.fecha_modificacion))}</span>
              </div>
              <div class="inline-row">
                <button class="ghost-button" type="button" data-action="edit-assay" data-uuid="${assay.uuid}">Editar</button>
                <button class="ghost-button" type="button" data-action="remove-assay" data-uuid="${assay.uuid}">Eliminar</button>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}
