import { escapeHtml } from "../core/helpers.js";

export function renderDashboardPage({ activeProject, projects, activeProjectCollars, activeProjectSurveys, activeProjectAssays, activeProjectLaboratorios, pendingQueue, online }) {
  return `
    <section class="page-grid stack">
      <header class="stack">
        <p class="eyebrow">Resumen operativo</p>
        <h2 class="title-lg">Control de exploracion de campo</h2>
        <p class="muted">Gestiona proyectos, collars y sincronizacion manteniendo operacion offline y trazabilidad local.</p>
      </header>

      <section class="summary-grid">
        <article class="card metric card__body">
          <span class="eyebrow">Proyecto activo</span>
          <strong>${escapeHtml(activeProject?.cod_exploracion || "0")}</strong>
          <p class="muted">${escapeHtml(activeProject?.concesion_area || "Sin seleccion")}</p>
        </article>
        <article class="card metric card__body">
          <span class="eyebrow">Proyectos</span>
          <strong>${projects.length}</strong>
          <p class="muted">Registros almacenados localmente</p>
        </article>
        <article class="card metric card__body">
          <span class="eyebrow">Collars del activo</span>
          <strong>${activeProjectCollars.length}</strong>
          <p class="muted">Capturas vinculadas al proyecto actual</p>
        </article>
        <article class="card metric card__body">
          <span class="eyebrow">Survey del activo</span>
          <strong>${activeProjectSurveys.length}</strong>
          <p class="muted">Levantamientos por collar</p>
        </article>
        <article class="card metric card__body">
          <span class="eyebrow">Assay del activo</span>
          <strong>${activeProjectAssays.length}</strong>
          <p class="muted">Muestras registradas</p>
        </article>
        <article class="card metric card__body">
          <span class="eyebrow">Laboratorio</span>
          <strong>${activeProjectLaboratorios.length}</strong>
          <p class="muted">Resultados asociados al proyecto</p>
        </article>
        <article class="card metric card__body">
          <span class="eyebrow">Pendientes</span>
          <strong>${pendingQueue.length}</strong>
          <p class="muted">Estado de red: ${online ? "online" : "offline"}</p>
        </article>
      </section>

      <section class="page-grid page-grid--2">
        <article class="card">
          <div class="card__header">
            <p class="eyebrow">Proyecto activo</p>
            <h3 class="title-md">${escapeHtml(activeProject?.cod_exploracion || "Todavia no has seleccionado proyecto")}</h3>
          </div>
          <div class="card__body stack">
            <p class="muted">${escapeHtml(activeProject?.concesion_area || "Crea un proyecto y dejas uno activo antes de capturar collars.")}</p>
            <div class="list-item__meta">
              <span>Tecnico: ${escapeHtml(activeProject?.tecnico || "-")}</span>
              <span>SR: ${escapeHtml(activeProject?.sr_proyecto || "-")}</span>
            </div>
            <div class="inline-row">
              <a class="button" href="#/proyectos">Gestionar proyectos</a>
              <a class="ghost-button" href="#/mapa">Abrir mapa</a>
              <a class="ghost-button" href="#/survey">Ir a tablas</a>
            </div>
          </div>
        </article>

        <article class="card">
          <div class="card__header">
            <p class="eyebrow">Cola de sincronizacion</p>
            <h3 class="title-md">Ultimos pendientes</h3>
          </div>
          <div class="card__body stack">
            ${pendingQueue.length
              ? pendingQueue
                  .slice(0, 5)
                  .map(
                    (item) => `
                      <div class="list-item queue-item">
                        <div class="queue-item__head">
                          <strong>${escapeHtml(item.entity_type)}</strong>
                          <span class="chip">${escapeHtml(item.action)}</span>
                        </div>
                        <p class="muted">UUID: ${escapeHtml(item.entity_uuid)}</p>
                      </div>
                    `,
                  )
                  .join("")
              : '<div class="empty-state">No hay elementos pendientes de sincronizacion.</div>'}
          </div>
        </article>
      </section>
    </section>
  `;
}