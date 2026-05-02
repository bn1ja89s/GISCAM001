import { renderCollarForm } from "../components/collarForm.js";
import { renderCollarList } from "../components/collarList.js";

export function renderCollarPage({ activeProject, activeProjectCollars, draftCollar, editingCollar }) {
  return `
    <section class="page-grid page-grid--2">
      <article class="card">
        <div class="card__header">
          <p class="eyebrow">Registro de collars</p>
          <h2 class="title-md">${editingCollar ? "Editar collar" : "Nuevo collar"}</h2>
        </div>
        <div class="card__body">
          ${renderCollarForm({ activeProject, draftCollar, editingCollar })}
        </div>
      </article>

      <article class="card">
        <div class="card__header">
          <p class="eyebrow">Listado por proyecto</p>
          <h2 class="title-md">Collars del proyecto activo</h2>
        </div>
        <div class="card__body">
          ${renderCollarList(activeProjectCollars)}
        </div>
      </article>
    </section>
  `;
}