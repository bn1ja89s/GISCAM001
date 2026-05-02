import { escapeHtml, formatDateTime } from "../core/helpers.js";
import { renderSyncBadge } from "../ui/statusBadge.js";

export function renderSurveyList(surveys) {
  if (!surveys.length) {
    return '<div class="empty-state">No hay survey registrados para el proyecto activo.</div>';
  }

  return `
    <div class="list">
      ${surveys
        .map(
          (survey) => `
            <article class="list-item stack">
              <div class="section-head">
                <div>
                  <h3 class="title-sm">${escapeHtml(survey.hole_id || "SIN COLLAR")}</h3>
                  <p class="muted">Prof: ${escapeHtml(String(survey.profundidad ?? "-"))}</p>
                </div>
                ${renderSyncBadge(survey.estado_sync)}
              </div>
              <div class="list-item__meta">
                <span>DIP: ${escapeHtml(String(survey.dip ?? "-"))}</span>
                <span>Azimut: ${escapeHtml(String(survey.azimut ?? "-"))}</span>
                <span>Instrumento: ${escapeHtml(survey.instrumento || "-")}</span>
              </div>
              <div class="record-audit record-audit--compact">
                <span>Creado: ${escapeHtml(formatDateTime(survey.fecha_creacion))}</span>
                <span>Modificado: ${escapeHtml(formatDateTime(survey.fecha_modificacion))}</span>
              </div>
              <div class="inline-row">
                <button class="ghost-button" type="button" data-action="edit-survey" data-uuid="${survey.uuid}">Editar</button>
                <button class="ghost-button" type="button" data-action="remove-survey" data-uuid="${survey.uuid}">Eliminar</button>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}
