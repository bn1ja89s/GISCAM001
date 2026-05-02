import { renderSurveyForm } from "../components/surveyForm.js";
import { renderSurveyList } from "../components/surveyList.js";

export function renderSurveyPage({ activeProject, activeProjectCollars, activeProjectSurveys, editingSurvey, captureFlow }) {
  return `
    <section class="page-grid page-grid--2">
      <article class="card">
        <div class="card__header">
          <p class="eyebrow">Tabla SURVEY</p>
          <h2 class="title-md">${editingSurvey ? "Editar survey" : "Nuevo survey"}</h2>
        </div>
        <div class="card__body">
          ${renderSurveyForm({ activeProject, activeProjectCollars, activeProjectSurveys, editingSurvey, captureFlow })}
        </div>
      </article>

      <article class="card">
        <div class="card__header">
          <p class="eyebrow">Listado local</p>
          <h2 class="title-md">Survey del proyecto activo</h2>
        </div>
        <div class="card__body">
          ${renderSurveyList(activeProjectSurveys)}
        </div>
      </article>
    </section>
  `;
}
