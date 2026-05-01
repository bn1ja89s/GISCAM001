import { escapeHtml, formatDateTime } from "../core/helpers.js";
import { renderSyncBadge } from "../ui/statusBadge.js";

function renderSourceBadge(laboratorio) {
  if (laboratorio.fuente === "survey123") {
    return '<span style="background:#e8f0fe;color:#1a73e8;font-size:10px;padding:2px 7px;border-radius:8px;font-weight:600;">Survey123</span>';
  }

  return '<span style="background:#e8f5e9;color:#2d5a27;font-size:10px;padding:2px 7px;border-radius:8px;font-weight:600;">Local</span>';
}

export function renderLaboratorioList(laboratorios) {
  if (!laboratorios.length) {
    return '<div class="empty-state">No hay registros de laboratorio para el proyecto activo.</div>';
  }

  return `
    <div class="list">
      ${laboratorios
        .map(
          (laboratorio) => `
            <article class="list-item stack">
              <div class="section-head">
                <div>
                  <div class="inline-row">
                    <h3 class="title-sm">${escapeHtml(laboratorio.laboratorio || "SIN LAB")}</h3>
                    ${renderSourceBadge(laboratorio)}
                  </div>
                  <p class="muted">Muestra: ${escapeHtml(laboratorio.muestra_id || "-")}</p>
                </div>
                ${renderSyncBadge(laboratorio.estado_sync)}
              </div>
              <div class="list-item__meta">
                <span>Fecha: ${escapeHtml(laboratorio.fecha_recepcion || "-")}</span>
                <span>Contraccion: ${escapeHtml(String(laboratorio.contraccion ?? "-"))}</span>
                <span>Absorcion: ${escapeHtml(String(laboratorio.absorcion ?? "-"))}</span>
                <span>Actualizado: ${escapeHtml(formatDateTime(laboratorio.fecha_modificacion))}</span>
              </div>
              ${laboratorio.fuente === "survey123"
                ? ""
                : `<div class="inline-row">
                    <button class="ghost-button" type="button" data-action="edit-laboratorio" data-uuid="${laboratorio.uuid}">Editar</button>
                    <button class="ghost-button" type="button" data-action="remove-laboratorio" data-uuid="${laboratorio.uuid}">Eliminar</button>
                  </div>`}
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}
