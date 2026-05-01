import { escapeHtml, formatDateTime } from "../core/helpers.js";
import { renderIcon } from "../ui/icons.js";

function renderNumberStepper({ name, label, value, min = "", max = "", step = "0.1", required = false }) {
  return `
    <label class="field numeric-field">
      <span>${escapeHtml(label)}</span>
      <div class="number-stepper">
        <input class="input number-stepper__input" name="${escapeHtml(name)}" type="number" inputmode="decimal" step="${escapeHtml(step)}" ${min !== "" ? `min="${escapeHtml(min)}"` : ""} ${max !== "" ? `max="${escapeHtml(max)}"` : ""} value="${escapeHtml(String(value ?? ""))}" ${required ? "required" : ""}>
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
    <div class="record-audit" aria-label="Fechas del assay">
      <span>Creado: ${escapeHtml(formatDateTime(record.fecha_creacion))}</span>
      <span>Modificado: ${escapeHtml(formatDateTime(record.fecha_modificacion))}</span>
    </div>
  `;
}

export function renderAssayForm({ activeProject, activeProjectCollars, activeProjectAssays = [], editingAssay, captureFlow }) {
  if (!activeProject) {
    return '<div class="notice">Debes tener un proyecto activo antes de registrar assay.</div>';
  }

  if (!activeProjectCollars.length) {
    return '<div class="notice">Primero registra al menos un collar para poder asociar assay.</div>';
  }

  const assay = editingAssay || {};
  const flowActive = Boolean(captureFlow?.active && captureFlow.step === "assay" && captureFlow.collarUuid && !editingAssay);
  const selectedCollarUuid = assay.collar_uuid || (flowActive ? captureFlow.collarUuid : "") || activeProjectCollars[0]?.uuid || "";
  const categoria = assay.categoria ?? "";
  const grano = assay.grano || "";
  const dureza = assay.dureza || "";
  const humedad = assay.humedad || "";
  const presenciaCaolinitica = assay.presencia_caolinitica || "";
  const colorOptions = ["Blanco", "Gris", "Negro", "Cafe", "Rojizo", "Verde", "Otros"];
  const currentColor = assay.color || "";
  const isCustomColor = currentColor && !colorOptions.includes(currentColor);
  const selectedColor = isCustomColor ? "Otros" : currentColor;

  return `
    <form id="assay-form" class="stack" autocomplete="off">
      <input type="hidden" name="uuid" value="${escapeHtml(assay.uuid || "")}">
      <div class="panel-tile stack">
        <p class="eyebrow">Importar CSV</p>
        <p class="muted">Columnas requeridas: Collar, Muestra ID, Desde, Hasta, Material, Descripcion, Categoria, Color, Grano, Dureza, Humedad, Caolinitica, Contaminante.</p>
        <input id="assay-csv-input" class="hidden" type="file" accept=".csv,text/csv">
        <div class="inline-row">
          <button class="ghost-button" type="button" data-action="import-assay-csv">Cargar CSV</button>
          <a class="ghost-button" href="./docs/assay_template.csv" download="assay_template.csv">Descargar plantilla</a>
        </div>
      </div>
      <div class="grid-fields">
        <label class="field">
          <span>Collar</span>
          <select class="select" name="collar_uuid" required>
            ${activeProjectCollars
              .map(
                (collar) => `<option value="${escapeHtml(collar.uuid)}" ${collar.uuid === selectedCollarUuid ? "selected" : ""}>${escapeHtml(collar.hole_id)} - ${escapeHtml(collar.tipo || "-")}</option>`,
              )
              .join("")}
          </select>
        </label>
        <label class="field">
          <span>Muestra ID</span>
          <input id="assay-muestra-id" class="input" name="muestra_id" value="${escapeHtml(assay.muestra_id || "")}" placeholder="Escribe la muestra si aplica">
        </label>
      </div>
      <div class="grid-fields grid-fields--3">
        ${renderNumberStepper({ name: "desde", label: "Desde", value: assay.desde, min: "0", required: true })}
        ${renderNumberStepper({ name: "hasta", label: "Hasta", value: assay.hasta, min: "0", required: true })}
        <label class="field">
          <span>Material</span>
          <input class="input" name="material" value="${escapeHtml(assay.material || "")}">
        </label>
      </div>
      <label class="field">
        <span>Descripcion</span>
        <textarea class="textarea" name="descripcion">${escapeHtml(assay.descripcion || "")}</textarea>
      </label>
      <div class="grid-fields grid-fields--3">
        <label class="field">
          <span>Categoria</span>
          <select class="select" name="categoria">
            <option value="" ${categoria === "" ? "selected" : ""}>Selecciona</option>
            <option value="0" ${String(categoria) === "0" ? "selected" : ""}>ESTERIL/SUELO</option>
            <option value="1" ${String(categoria) === "1" ? "selected" : ""}>BAJO_INTERES</option>
            <option value="2" ${String(categoria) === "2" ? "selected" : ""}>INTERES_MEDIO</option>
            <option value="3" ${String(categoria) === "3" ? "selected" : ""}>ALTO_INTERES</option>
          </select>
        </label>
        <label class="field">
          <span>Color</span>
          <input type="hidden" name="color" value="${escapeHtml(currentColor)}" data-custom-value="color">
          <select class="select" data-custom-select="color">
            <option value="" ${selectedColor === "" ? "selected" : ""}>Selecciona</option>
            ${colorOptions.map((option) => `<option value="${escapeHtml(option)}" ${selectedColor === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
          </select>
          <input class="input ${isCustomColor || selectedColor === "Otros" ? "" : "hidden"}" data-custom-input="color" value="${escapeHtml(isCustomColor ? currentColor : "")}" placeholder="Escribe otro color">
        </label>
        <label class="field">
          <span>Grano</span>
          <select class="select" name="grano">
            <option value="" ${grano === "" ? "selected" : ""}>Selecciona</option>
            <option value="FINO" ${grano === "FINO" ? "selected" : ""}>FINO</option>
            <option value="MEDIO" ${grano === "MEDIO" ? "selected" : ""}>MEDIO</option>
            <option value="GRUESO" ${grano === "GRUESO" ? "selected" : ""}>GRUESO</option>
          </select>
        </label>
      </div>
      <div class="grid-fields grid-fields--3">
        <label class="field">
          <span>Dureza</span>
          <select class="select" name="dureza">
            <option value="" ${dureza === "" ? "selected" : ""}>Selecciona</option>
            <option value="Baja" ${dureza === "Baja" ? "selected" : ""}>Baja</option>
            <option value="Media" ${dureza === "Media" ? "selected" : ""}>Media</option>
            <option value="Alta" ${dureza === "Alta" ? "selected" : ""}>Alta</option>
          </select>
        </label>
        <label class="field">
          <span>Humedad</span>
          <select class="select" name="humedad">
            <option value="" ${humedad === "" ? "selected" : ""}>Selecciona</option>
            <option value="Baja" ${humedad === "Baja" ? "selected" : ""}>Baja</option>
            <option value="Media" ${humedad === "Media" ? "selected" : ""}>Media</option>
            <option value="Alta" ${humedad === "Alta" ? "selected" : ""}>Alta</option>
          </select>
        </label>
        <label class="field">
          <span>Caolinitica</span>
          <select class="select" name="presencia_caolinitica">
            <option value="" ${presenciaCaolinitica === "" ? "selected" : ""}>Selecciona</option>
            <option value="ALTA" ${presenciaCaolinitica === "ALTA" ? "selected" : ""}>ALTA</option>
            <option value="MEDIA" ${presenciaCaolinitica === "MEDIA" ? "selected" : ""}>MEDIA</option>
            <option value="BAJA" ${presenciaCaolinitica === "BAJA" ? "selected" : ""}>BAJA</option>
            <option value="NULA" ${presenciaCaolinitica === "NULA" ? "selected" : ""}>NULA</option>
          </select>
        </label>
      </div>
      <label class="field">
        <span>Contaminantes</span>
        <input class="input" name="contaminantes" value="${escapeHtml(assay.contaminantes || "")}">
      </label>
      ${renderAuditMeta(assay)}
      <div class="inline-row">
        <button class="button" type="submit">${editingAssay ? "Actualizar assay" : "Guardar assay"}</button>
        <button class="ghost-button" type="button" data-action="reset-assay-form">${editingAssay ? "Cancelar edicion" : "Limpiar"}</button>
        ${flowActive ? '<button class="ghost-button" type="button" data-action="skip-capture-flow-step">Saltar</button>' : ""}
      </div>
    </form>
  `;
}
