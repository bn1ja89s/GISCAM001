import { escapeHtml, todayValue } from "../core/helpers.js";

function formatAssayLabel(assay, match) {
  const collarName = String(assay?.hole_id || "").split("·")[0].trim();
  const baseLabel = collarName || assay?.muestra_id || assay?.uuid || "";
  return `${baseLabel}${match ? " - Survey123" : ""}`;
}

function findSurvey123Match(assay, laboratorios = []) {
  if (!assay) {
    return null;
  }

  const assayKeys = new Set([
    assay.uuid,
    assay.global_id_remoto,
    assay.remote_object_id,
    assay.muestra_id,
    assay.hole_id,
  ].map((value) => String(value || "").trim()).filter(Boolean));

  return laboratorios.find((laboratorio) => {
    if (laboratorio.fuente !== "survey123") {
      return false;
    }

    const keys = [
      laboratorio.assay_uuid,
      laboratorio.survey123_assay_id,
      laboratorio.muestra_id,
      laboratorio.assay_global_id_remoto,
    ].map((value) => String(value || "").trim()).filter(Boolean);

    return keys.some((key) => assayKeys.has(key));
  }) || null;
}

function optionDataAttrs(match) {
  if (!match) {
    return "";
  }

  return [
    ["data-survey123", "1"],
    ["data-muestra-id", match.muestra_id || ""],
    ["data-fecha-recepcion", match.fecha_recepcion || ""],
    ["data-laboratorio", match.laboratorio || ""],
    ["data-color-q", match.color_q || ""],
    ["data-contraccion", match.contraccion ?? ""],
    ["data-absorcion", match.absorcion ?? ""],
    ["data-observaciones", match.observaciones || ""],
  ].map(([key, value]) => `${key}="${escapeHtml(String(value))}"`).join(" ");
}

export function renderLaboratorioForm({ activeProject, activeProjectAssays, activeProjectLaboratorios = [], editingLaboratorio }) {
  if (!activeProject) {
    return '<div class="notice">Debes tener un proyecto activo antes de registrar laboratorio.</div>';
  }

  if (!activeProjectAssays.length) {
    return '<div class="notice">Primero registra al menos un assay para poder asociar laboratorio.</div>';
  }

  const laboratorio = editingLaboratorio || {};
  const selectedAssayUuid = laboratorio.assay_uuid || activeProjectAssays[0]?.uuid || "";
  const selectedAssay = activeProjectAssays.find((item) => item.uuid === selectedAssayUuid) || activeProjectAssays[0];
  const survey123Match = !editingLaboratorio ? findSurvey123Match(selectedAssay, activeProjectLaboratorios) : null;
  const laboratorioValue = laboratorio.laboratorio || survey123Match?.laboratorio || "";
  const colorQValue = laboratorio.color_q || survey123Match?.color_q || "";
  const contraccionValue = laboratorio.contraccion ?? survey123Match?.contraccion ?? "";
  const absorcionValue = laboratorio.absorcion ?? survey123Match?.absorcion ?? "";
  const observacionesValue = laboratorio.observaciones || survey123Match?.observaciones || "";
  const fechaRecepcionValue = laboratorio.fecha_recepcion || survey123Match?.fecha_recepcion || todayValue();
  const muestraIdValue = laboratorio.muestra_id || survey123Match?.muestra_id || selectedAssay?.muestra_id || "";

  return `
    <form id="laboratorio-form" class="stack" autocomplete="off">
      <input type="hidden" name="uuid" value="${escapeHtml(laboratorio.uuid || "")}">
      <div class="grid-fields">
        <label class="field">
          <span>Assay</span>
          <select class="select" name="assay_uuid" required>
            ${activeProjectAssays
              .map(
                (assay) => {
                  const match = findSurvey123Match(assay, activeProjectLaboratorios);
                  const label = formatAssayLabel(assay, match);
                  return `<option value="${escapeHtml(assay.uuid)}" ${assay.uuid === selectedAssayUuid ? "selected" : ""} data-default-muestra-id="${escapeHtml(assay.muestra_id || "")}" ${optionDataAttrs(match)}>${escapeHtml(label)}</option>`;
                },
              )
              .join("")}
          </select>
        </label>
        <label class="field">
          <span>Muestra ID</span>
          <input class="input" name="muestra_id" value="${escapeHtml(muestraIdValue)}">
        </label>
      </div>
      <div class="grid-fields grid-fields--3">
        <label class="field"><span>Fecha recepcion</span><input class="input" name="fecha_recepcion" type="date" value="${escapeHtml(fechaRecepcionValue)}"></label>
        <label class="field"><span>Laboratorio</span><input class="input" name="laboratorio" value="${escapeHtml(laboratorioValue)}" required></label>
        <label class="field"><span>Color Q</span><input class="input" name="color_q" value="${escapeHtml(colorQValue)}"></label>
      </div>
      <div class="grid-fields">
        <label class="field"><span>Contraccion</span><input class="input" name="contraccion" type="number" step="0.01" value="${escapeHtml(String(contraccionValue))}"></label>
        <label class="field"><span>Absorcion</span><input class="input" name="absorcion" type="number" step="0.01" value="${escapeHtml(String(absorcionValue))}"></label>
      </div>
      <label class="field">
        <span>Observaciones</span>
        <textarea class="textarea" name="observaciones">${escapeHtml(observacionesValue)}</textarea>
      </label>
      <div class="inline-row">
        <button class="button" type="submit">${editingLaboratorio ? "Actualizar laboratorio" : "Guardar laboratorio"}</button>
        <button class="ghost-button" type="button" data-action="reset-laboratorio-form">${editingLaboratorio ? "Cancelar edicion" : "Limpiar"}</button>
      </div>
    </form>
  `;
}
