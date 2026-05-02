import { renderProjectForm } from "../components/projectForm.js";
import { renderProjectList } from "../components/projectList.js";

export function renderProyectoPage({ projects, activeProjectUuid, editingProject }) {
  return `
    <section class="page-grid page-grid--2">
      <article class="card">
        <div class="card__header">
          <p class="eyebrow">Gestion de proyectos</p>
          <h2 class="title-md">${editingProject ? "Editar proyecto" : "Nuevo proyecto"}</h2>
        </div>
        <div class="card__body">
          ${renderProjectForm(editingProject)}
        </div>
      </article>

      <article class="card">
        <div class="card__header">
          <p class="eyebrow">Catalogo local</p>
          <h2 class="title-md">Proyectos almacenados</h2>
        </div>
        <div class="card__body">
          ${renderProjectList(projects, activeProjectUuid)}
        </div>
      </article>
    </section>
  `;
}