import { escapeHtml, formatDateTime, generarIdDesdeTecnicoYCollar } from "../core/helpers.js";
import { renderIcon } from "../ui/icons.js";

function renderNumberStepper({ name, label, value, min = "", max = "", step = "0.1", required = false }) {
  return `
    <label class="field numeric-field">
      <span>${escapeHtml(label)}</span>
      <div class="number-stepper">
        <input class="input number-stepper__input" name="${escapeHtml(name)}" type="number" inputmode="decimal" step="any" data-step-increment="${escapeHtml(step)}" ${min !== "" ? `min="${escapeHtml(min)}"` : ""} ${max !== "" ? `max="${escapeHtml(max)}"` : ""} value="${escapeHtml(String(value ?? ""))}" ${required ? "required" : ""}>
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

function renderOptions(options, selectedValue) {
  return options
    .map((option) => `<option value="${escapeHtml(option)}" ${String(selectedValue) === String(option) ? "selected" : ""}>${escapeHtml(option)}</option>`)
    .join("");
}

function getNextMuestraId(activeProject, collar, assays) {
  const base = generarIdDesdeTecnicoYCollar(activeProject?.tecnico || "", collar?.hole_id || "") || "MS000";
  const usedNumbers = assays
    .filter((assay) => assay.collar_uuid === collar?.uuid)
    .map((assay) => String(assay.muestra_id || "").trim().match(new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-(\\d+)$`, "i")))
    .filter(Boolean)
    .map((match) => Number.parseInt(match[1], 10))
    .filter((value) => Number.isFinite(value));
  const nextNumber = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 1;

  return `${base}-${String(nextNumber).padStart(2, "0")}`;
}

export function renderAssayForm({ activeProject, activeProjectCollars, activeProjectAssays = [], editingAssay, captureFlow, selectedAssayCollarUuid = "" }) {
  if (!activeProject) {
    return '<div class="notice">Debes tener un proyecto activo antes de registrar assay.</div>';
  }

  if (!activeProjectCollars.length) {
    return '<div class="notice">Primero registra al menos un collar para poder asociar assay.</div>';
  }

  const assay = editingAssay || {};
  const flowActive = Boolean(captureFlow?.active && captureFlow.step === "assay" && captureFlow.collarUuid && !editingAssay);
  const selectedCollarUuid = assay.collar_uuid || (flowActive ? captureFlow.collarUuid : "") || selectedAssayCollarUuid || activeProjectCollars[0]?.uuid || "";
  const selectedCollar = activeProjectCollars.find((collar) => collar.uuid === selectedCollarUuid) || activeProjectCollars[0];
  const registeredSamples = activeProjectAssays.filter((item) => item.collar_uuid === selectedCollar?.uuid && item.muestra_id && item.muestra_id !== "NO HAY");
  const nextMuestraId = getNextMuestraId(activeProject, selectedCollar, activeProjectAssays);
  const selectedMuestraId = assay.muestra_id || nextMuestraId;
  const categoria = assay.categoria ?? "";
  const grano = assay.grano || "";
  const dureza = assay.dureza || "";
  const humedad = assay.humedad || "";
  const presenciaCaolinitica = assay.presencia_caolinitica || "";
  const materialOptions = [
    "ARCILLA DE INTERES",
    "ARCILLA LIMOSA",
    "ARCILLA OSCURA",
    "ARCILLA RESIDUAL",
    "FELDESPATO",
    "GRANODIORITA ALTERADA",
    "GRANODIORITA MUY ALTERADA",
    "SAPROLITO ARCILLOSO",
    "SAPROLITO GRANODIORITICO",
  ];
  const colorOptions = [
    "AMARILLO CLARO",
    "AMARILLO PARDO",
    "BLANCO CREMOSO",
    "BLANCO GRISACEO",
    "CREMA",
    "GRIS CLARO",
    "GRIS OSCURO",
    "GRIS VERDOSO",
    "MARRON OSCURO",
    "NARANJA PALIDO",
    "NEGRO PARDO",
    "OCRE",
    "ROSA PALIDO",
    "PARDO AMARILLENTO",
    "PARDO OSCURO",
  ];
  const contaminanteOptions = [
    "Cuarzo disperso",
    "Biotita alterada",
    "Cuarzo fino",
    "Cuarzo subordinado",
    "Fragmentos liticos",
    "Fragmentos de roca",
    "Materia organica baja",
    "Materia organica",
    "Oxidos de Fe",
    "Micas alteradas",
    "Oxidos de Fe puntuales",
    "Oxidos de Fe leves",
    "Raicillas",
    "Sin contaminantes visibles",
  ];
  const currentColor = assay.color || "";
  const materialOptionsForRender = assay.material && !materialOptions.includes(assay.material)
    ? [assay.material, ...materialOptions]
    : materialOptions;
  const colorOptionsForRender = currentColor && !colorOptions.includes(currentColor)
    ? [currentColor, ...colorOptions]
    : colorOptions;
  const contaminanteOptionsForRender = assay.contaminantes && !contaminanteOptions.includes(assay.contaminantes)
    ? [assay.contaminantes, ...contaminanteOptions]
    : contaminanteOptions;
  const muestraOptions = [...new Set(
    selectedMuestraId && selectedMuestraId !== nextMuestraId
      ? [selectedMuestraId, nextMuestraId, "NO HAY"]
      : [nextMuestraId, "NO HAY"],
  )];

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
                (collar) => `<option value="${escapeHtml(collar.uuid)}" data-next-muestra-id="${escapeHtml(getNextMuestraId(activeProject, collar, activeProjectAssays))}" ${collar.uuid === selectedCollarUuid ? "selected" : ""}>${escapeHtml(collar.hole_id)} - ${escapeHtml(collar.tipo || "-")}</option>`,
              )
              .join("")}
          </select>
        </label>
        <label class="field">
          <span>Muestra ID</span>
          <select id="assay-muestra-id" class="select" name="muestra_id">
            ${renderOptions(muestraOptions, selectedMuestraId)}
          </select>
        </label>
      </div>
      <div class="panel-tile stack--tight">
        <p class="eyebrow">Muestras del collar</p>
        <div class="list-item__meta">
          <span>${escapeHtml(selectedCollar?.hole_id || "-")}</span>
          <span>${escapeHtml(String(registeredSamples.length))} registradas</span>
          <span>Siguiente ${escapeHtml(nextMuestraId)}</span>
        </div>
      </div>
      <div class="grid-fields grid-fields--3">
        ${renderNumberStepper({ name: "desde", label: "Desde", value: assay.desde, min: "0", required: true })}
        ${renderNumberStepper({ name: "hasta", label: "Hasta", value: assay.hasta, min: "0", required: true })}
        <label class="field">
          <span>Material</span>
          <select class="select" name="material">
            <option value="" ${!assay.material ? "selected" : ""}>Selecciona</option>
            ${renderOptions(materialOptionsForRender, assay.material || "")}
          </select>
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
            <option value="0" ${String(categoria) === "0" ? "selected" : ""}>0</option>
            <option value="1" ${String(categoria) === "1" ? "selected" : ""}>1</option>
            <option value="2" ${String(categoria) === "2" ? "selected" : ""}>2</option>
            <option value="3" ${String(categoria) === "3" ? "selected" : ""}>3</option>
          </select>
        </label>
        <label class="field">
          <span>Color</span>
          <select class="select" name="color">
            <option value="" ${currentColor === "" ? "selected" : ""}>Selecciona</option>
            ${renderOptions(colorOptionsForRender, currentColor)}
          </select>
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
        <select class="select" name="contaminantes">
          <option value="" ${!assay.contaminantes ? "selected" : ""}>Selecciona</option>
          ${renderOptions(contaminanteOptionsForRender, assay.contaminantes || "")}
        </select>
      </label>
      <div id="assay-no-sample-notice" class="notice ${selectedMuestraId === "NO HAY" ? "" : "hidden"}">
        Se guardara el registro con Muestra ID NO HAY y sus parametros.
      </div>
      ${renderAuditMeta(assay)}
      <div class="inline-row">
        <button class="button" type="submit">${editingAssay ? "Actualizar assay" : "Guardar assay"}</button>
        ${flowActive ? '<button class="ghost-button" type="button" data-action="finish-assay-samples">Terminar de registrar muestras</button>' : ""}
        <button class="ghost-button" type="button" data-action="reset-assay-form">${editingAssay ? "Cancelar edicion" : "Limpiar"}</button>
      </div>
    </form>
  `;
}
