import { escapeHtml, formatDateTime } from "../core/helpers.js";
import { renderSyncBadge } from "../ui/statusBadge.js";

export function renderProjectList(projects, activeProjectUuid) {
  if (!projects.length) {
    return '<div class="empty-state">Todavia no existen proyectos. Crea el primero para empezar.</div>';
  }

  return `
    <div class="list">
      ${projects
        .map(
          (project) => `
            <article class="list-item stack">
              <div class="section-head">
                <div>
                  <h3 class="title-sm">${escapeHtml(project.cod_exploracion)}</h3>
                  <p class="muted">${escapeHtml(project.concesion_area)}</p>
                </div>
                <div class="inline-row">
                  ${renderSyncBadge(project.estado_sync)}
                  ${project.uuid === activeProjectUuid ? '<span class="chip">Activo</span>' : ""}
                </div>
              </div>
              <div class="list-item__meta">
                <span>Tecnico: ${escapeHtml(project.tecnico || "-")}</span>
                <span>SR: ${escapeHtml(project.sr_proyecto || "-")}</span>
              </div>
              <div class="record-audit record-audit--compact">
                <span>Creado: ${escapeHtml(formatDateTime(project.fecha_creacion))}</span>
                <span>Modificado: ${escapeHtml(formatDateTime(project.fecha_modificacion))}</span>
              </div>
              <div class="inline-row">
                <button class="ghost-button" type="button" data-action="select-project" data-uuid="${project.uuid}">Seleccionar</button>
                <button class="ghost-button" type="button" data-action="edit-project" data-uuid="${project.uuid}">Editar</button>
                <button class="ghost-button" type="button" data-action="remove-project" data-uuid="${project.uuid}">Eliminar / Inactivar</button>
              </div>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}
