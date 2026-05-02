import { escapeHtml, formatDateTime, formatDecimalInput } from "../core/helpers.js";
import { renderIcon } from "../ui/icons.js";

function renderNumberStepper({ name, label, value, min = "", max = "", step = "0.1", required = false }) {
  return `
    <label class="field numeric-field">
      <span>${escapeHtml(label)}</span>
      <div class="number-stepper">
        <input class="input number-stepper__input" name="${escapeHtml(name)}" type="text" inputmode="decimal" data-step-increment="${escapeHtml(step)}" ${min !== "" ? `data-min="${escapeHtml(min)}"` : ""} ${max !== "" ? `data-max="${escapeHtml(max)}"` : ""} value="${escapeHtml(formatDecimalInput(value))}" ${required ? "required" : ""}>
        <div class="number-stepper__buttons" aria-hidden="false">
          <button class="number-stepper__button" type="button" data-action="step-number" data-field="${escapeHtml(name)}" data-direction="up" title="Aumentar ${escapeHtml(label)}">${renderIcon("plus")}</button>
          <button class="number-stepper__button" type="button" data-action="step-number" data-field="${escapeHtml(name)}" data-direction="down" title="Disminuir ${escapeHtml(label)}">${renderIcon("minus")}</button>
        </div>
      </div>
    </label>
  `;
}

function renderAuditMeta(record) {
  if (!record?.fecha_creacion && !record?.fecha_modificacion) {
    return "";
  }

  return `
    <div class="record-audit" aria-label="Fechas del survey">
      <span>Creado: ${escapeHtml(formatDateTime(record.fecha_creacion))}</span>
      <span>Modificado: ${escapeHtml(formatDateTime(record.fecha_modificacion))}</span>
    </div>
  `;
}

export function renderSurveyForm({ activeProject, activeProjectCollars, activeProjectSurveys = [], editingSurvey, captureFlow }) {
  if (!activeProject) {
    return '<div class="notice">Debes tener un proyecto activo antes de registrar survey.</div>';
  }

  if (!activeProjectCollars.length) {
    return '<div class="notice">Primero registra al menos un collar para poder asociar survey.</div>';
  }

  const survey = editingSurvey || {};
  const flowActive = Boolean(captureFlow?.active && captureFlow.step === "survey" && captureFlow.collarUuid && !editingSurvey);
  const selectedCollarUuid = survey.collar_uuid || (flowActive ? captureFlow.collarUuid : "") || activeProjectCollars[0]?.uuid || "";
  const selectedCollar = activeProjectCollars.find((collar) => collar.uuid === selectedCollarUuid) || activeProjectCollars[0];
  const holeId = survey.hole_id || selectedCollar?.hole_id || "";
  const profundidadValue = editingSurvey ? survey.profundidad : selectedCollar?.prof_total;
  const instrumentOptions = ["Pico y pala", "Sacabocados", "Excavadora", "Otros"];
  const currentInstrument = survey.instrumento || "";
  const isCustomInstrument = currentInstrument && !instrumentOptions.includes(currentInstrument);
  const selectedInstrument = isCustomInstrument ? "Otros" : currentInstrument;

  return `
    <form id="survey-form" class="stack" autocomplete="off">
      <input type="hidden" name="uuid" value="${escapeHtml(survey.uuid || "")}">
      <div class="panel-tile stack">
        <p class="eyebrow">Importar CSV</p>
        <p class="muted">Columnas requeridas: Collar, Profundidad, DIP, Azimut, Instrumento.</p>
        <input id="survey-csv-input" class="hidden" type="file" accept=".csv,text/csv">
        <div class="inline-row">
          <button class="ghost-button" type="button" data-action="import-survey-csv">Cargar CSV</button>
          <a class="ghost-button" href="./docs/survey_template.csv" download="survey_template.csv">Descargar plantilla</a>
        </div>
      </div>
      <div class="grid-fields">
        <label class="field">
          <span>Collar</span>
          <select class="select" name="collar_uuid" required>
            ${activeProjectCollars
              .map(
                (collar) => `<option value="${escapeHtml(collar.uuid)}" data-hole-id="${escapeHtml(collar.hole_id || "")}" data-prof-total="${escapeHtml(formatDecimalInput(collar.prof_total))}" ${collar.uuid === selectedCollarUuid ? "selected" : ""}>${escapeHtml(collar.hole_id)} - ${escapeHtml(collar.tipo || "-")}</option>`,
              )
              .join("")}
          </select>
        </label>
        <label class="field">
          <span>Hole ID</span>
          <input id="survey-hole-id" class="input" name="hole_id" value="${escapeHtml(holeId)}" readonly>
        </label>
      </div>
      <div class="grid-fields grid-fields--3">
        ${renderNumberStepper({ name: "profundidad", label: "Profundidad", value: profundidadValue, min: "0", required: true })}
        ${renderNumberStepper({ name: "dip", label: "DIP", value: survey.dip, min: "-90", max: "90", required: true })}
        ${renderNumberStepper({ name: "azimut", label: "Azimut", value: survey.azimut, min: "0", max: "360", required: true })}
      </div>
      <label class="field">
        <span>Instrumento</span>
        <input type="hidden" name="instrumento" value="${escapeHtml(currentInstrument)}" data-custom-value="instrumento">
        <select class="select" data-custom-select="instrumento">
          <option value="" ${selectedInstrument === "" ? "selected" : ""}>Selecciona</option>
          ${instrumentOptions.map((option) => `<option value="${escapeHtml(option)}" ${selectedInstrument === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
        </select>
        <input class="input ${isCustomInstrument || selectedInstrument === "Otros" ? "" : "hidden"}" data-custom-input="instrumento" value="${escapeHtml(isCustomInstrument ? currentInstrument : "")}" placeholder="Escribe otro instrumento">
      </label>
      ${renderAuditMeta(survey)}
      <div class="inline-row">
        <button class="button" type="submit">${editingSurvey ? "Actualizar survey" : "Guardar survey"}</button>
        <button class="ghost-button" type="button" data-action="reset-survey-form">${editingSurvey ? "Cancelar edicion" : "Limpiar"}</button>
        ${flowActive ? '<button class="ghost-button" type="button" data-action="skip-capture-flow-step">Saltar</button>' : ""}
      </div>
    </form>
  `;
}
