import { renderAssayForm } from "../components/assayForm.js";
import { renderAssayList } from "../components/assayList.js";

export function renderAssayPage({ activeProject, activeProjectCollars, activeProjectAssays, editingAssay, captureFlow }) {
  return `
    <section class="page-grid page-grid--2">
      <article class="card">
        <div class="card__header">
          <p class="eyebrow">Tabla ASSAY</p>
          <h2 class="title-md">${editingAssay ? "Editar assay" : "Nuevo assay"}</h2>
        </div>
        <div class="card__body">
          ${renderAssayForm({ activeProject, activeProjectCollars, activeProjectAssays, editingAssay, captureFlow })}
        </div>
      </article>

      <article class="card">
        <div class="card__header">
          <p class="eyebrow">Listado local</p>
          <h2 class="title-md">Assay del proyecto activo</h2>
        </div>
        <div class="card__body">
          ${renderAssayList(activeProjectAssays)}
        </div>
      </article>
    </section>
  `;
}
