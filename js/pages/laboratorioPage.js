import { renderLaboratorioForm } from "../components/laboratorioForm.js";
import { renderLaboratorioList } from "../components/laboratorioList.js";

export function renderLaboratorioPage({ activeProject, activeProjectAssays, activeProjectLaboratorios, editingLaboratorio }) {
  return `
    <section class="page-grid page-grid--2">
      <article class="card">
        <div class="card__header">
          <p class="eyebrow">Tabla LABORATORIO</p>
          <h2 class="title-md">${editingLaboratorio ? "Editar laboratorio" : "Nuevo laboratorio"}</h2>
        </div>
        <div class="card__body">
          ${renderLaboratorioForm({ activeProject, activeProjectAssays, activeProjectLaboratorios, editingLaboratorio })}
        </div>
      </article>

      <article class="card">
        <div class="card__header">
          <p class="eyebrow">Listado local</p>
          <div class="section-head">
            <h2 class="title-md">Laboratorio del proyecto activo</h2>
            <button id="btn-sync-laboratorio" type="button" data-action="sync-laboratorio" style="background:none;border:1.5px solid #2d5a27;color:#2d5a27;border-radius:8px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer;">
              &#x1F504; Actualizar
            </button>
          </div>
        </div>
        <div class="card__body">
          ${renderLaboratorioList(activeProjectLaboratorios)}
        </div>
      </article>
    </section>
  `;
}
