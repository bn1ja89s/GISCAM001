import { parseCsvText, normalizeCsvToken } from "../core/csv.js";
import { createAssay } from "./assayService.js";
import { createSurvey } from "./surveyService.js";

const ASSAY_COLUMNS = {
  collar: { label: "Collar", aliases: ["collar", "holeid"] },
  muestraId: { label: "Muestra ID", aliases: ["muestraid", "muestra"] },
  desde: { label: "Desde", aliases: ["desde"] },
  hasta: { label: "Hasta", aliases: ["hasta"] },
  material: { label: "Material", aliases: ["material"] },
  descripcion: { label: "Descripcion", aliases: ["descripcion"] },
  categoria: { label: "Categoria", aliases: ["categoria"] },
  color: { label: "Color", aliases: ["color"] },
  grano: { label: "Grano", aliases: ["grano"] },
  dureza: { label: "Dureza", aliases: ["dureza"] },
  humedad: { label: "Humedad", aliases: ["humedad"] },
  caolinitica: { label: "Caolinitica", aliases: ["caolinitica", "presenciacaolinitica"] },
  contaminantes: { label: "Contaminante", aliases: ["contaminante", "contaminantes"] },
};

const SURVEY_COLUMNS = {
  collar: { label: "Collar", aliases: ["collar", "holeid"] },
  profundidad: { label: "Profundidad", aliases: ["profundidad"] },
  dip: { label: "DIP", aliases: ["dip"] },
  azimut: { label: "Azimut", aliases: ["azimut"] },
  instrumento: { label: "Instrumento", aliases: ["instrumento"] },
};

const ASSAY_CATEGORY_MAP = new Map([
  ["0", "0"],
  ["esterilsuelo", "0"],
  ["esteril", "0"],
  ["suelo", "0"],
  ["1", "1"],
  ["bajointeres", "1"],
  ["2", "2"],
  ["interesmedio", "2"],
  ["3", "3"],
  ["altointeres", "3"],
]);

const GRAIN_MAP = new Map([
  ["fino", "FINO"],
  ["medio", "MEDIO"],
  ["grueso", "GRUESO"],
]);

const LEVEL_MAP = new Map([
  ["baja", "Baja"],
  ["media", "Media"],
  ["alta", "Alta"],
]);

const KAOLINITE_MAP = new Map([
  ["alta", "ALTA"],
  ["media", "MEDIA"],
  ["baja", "BAJA"],
  ["nula", "NULA"],
]);

function getColumnValue(values, config) {
  for (const alias of config.aliases) {
    if (values[alias] !== undefined) {
      return values[alias];
    }
  }

  return "";
}

function assertRequiredHeaders(parsed, columns, label) {
  const missing = Object.values(columns)
    .filter((column) => !column.aliases.some((alias) => parsed.normalizedHeaders.includes(alias)))
    .map((column) => column.label);

  if (missing.length) {
    throw new Error(`El CSV de ${label} debe incluir las columnas: ${missing.join(", ")}.`);
  }
}

function assertRows(parsed, label) {
  if (!parsed.rows.length) {
    throw new Error(`El CSV de ${label} no contiene filas de datos.`);
  }
}

function buildCollarLookup(collars) {
  const lookup = new Map();

  collars.forEach((collar) => {
    const key = normalizeCsvToken(collar.hole_id);
    if (key) {
      lookup.set(key, collar);
    }
  });

  return lookup;
}

function resolveCollar(values, lineNumber, collarLookup, config) {
  const rawCollar = getColumnValue(values, config);
  if (!rawCollar) {
    throw new Error(`Fila ${lineNumber}: la columna "${config.label}" es obligatoria.`);
  }

  const collar = collarLookup.get(normalizeCsvToken(rawCollar));
  if (!collar) {
    throw new Error(`Fila ${lineNumber}: el collar "${rawCollar}" no existe en el proyecto activo.`);
  }

  return collar;
}

function normalizeMappedValue(rawValue, mapping, lineNumber, label) {
  const token = normalizeCsvToken(rawValue);
  if (!token) {
    return "";
  }

  const normalized = mapping.get(token);
  if (!normalized) {
    throw new Error(`Fila ${lineNumber}: el valor "${rawValue}" no es valido para "${label}".`);
  }

  return normalized;
}

function normalizeAssayCategory(rawValue, lineNumber) {
  const token = normalizeCsvToken(rawValue);
  if (!token) {
    return "";
  }

  const normalized = ASSAY_CATEGORY_MAP.get(token);
  if (!normalized) {
    throw new Error(`Fila ${lineNumber}: la categoria "${rawValue}" no es valida.`);
  }

  return normalized;
}

function buildAssayPayloads(parsed, collars) {
  const collarLookup = buildCollarLookup(collars);

  return parsed.rows.map(({ lineNumber, values }) => {
    const collar = resolveCollar(values, lineNumber, collarLookup, ASSAY_COLUMNS.collar);
    const muestraId = getColumnValue(values, ASSAY_COLUMNS.muestraId);

    if (!muestraId) {
      throw new Error(`Fila ${lineNumber}: "Muestra ID" es obligatorio.`);
    }

    return {
      collar_uuid: collar.uuid,
      muestra_id: muestraId,
      desde: getColumnValue(values, ASSAY_COLUMNS.desde),
      hasta: getColumnValue(values, ASSAY_COLUMNS.hasta),
      material: getColumnValue(values, ASSAY_COLUMNS.material),
      descripcion: getColumnValue(values, ASSAY_COLUMNS.descripcion),
      categoria: normalizeAssayCategory(getColumnValue(values, ASSAY_COLUMNS.categoria), lineNumber),
      color: getColumnValue(values, ASSAY_COLUMNS.color),
      grano: normalizeMappedValue(getColumnValue(values, ASSAY_COLUMNS.grano), GRAIN_MAP, lineNumber, "Grano"),
      dureza: normalizeMappedValue(getColumnValue(values, ASSAY_COLUMNS.dureza), LEVEL_MAP, lineNumber, "Dureza"),
      humedad: normalizeMappedValue(getColumnValue(values, ASSAY_COLUMNS.humedad), LEVEL_MAP, lineNumber, "Humedad"),
      presencia_caolinitica: normalizeMappedValue(getColumnValue(values, ASSAY_COLUMNS.caolinitica), KAOLINITE_MAP, lineNumber, "Caolinitica"),
      contaminantes: getColumnValue(values, ASSAY_COLUMNS.contaminantes),
    };
  });
}

function buildSurveyPayloads(parsed, collars) {
  const collarLookup = buildCollarLookup(collars);

  return parsed.rows.map(({ lineNumber, values }) => {
    const collar = resolveCollar(values, lineNumber, collarLookup, SURVEY_COLUMNS.collar);
    const profundidad = getColumnValue(values, SURVEY_COLUMNS.profundidad);

    if (!profundidad) {
      throw new Error(`Fila ${lineNumber}: "Profundidad" es obligatoria.`);
    }

    return {
      collar_uuid: collar.uuid,
      profundidad,
      dip: getColumnValue(values, SURVEY_COLUMNS.dip),
      azimut: getColumnValue(values, SURVEY_COLUMNS.azimut),
      instrumento: getColumnValue(values, SURVEY_COLUMNS.instrumento),
    };
  });
}

export async function importAssaysFromCsv(csvText, collars) {
  if (!collars.length) {
    throw new Error("Primero registra al menos un collar para poder importar assay desde CSV.");
  }

  const parsed = parseCsvText(csvText);
  assertRows(parsed, "assay");
  assertRequiredHeaders(parsed, ASSAY_COLUMNS, "assay");
  const payloads = buildAssayPayloads(parsed, collars);

  for (const payload of payloads) {
    await createAssay(payload, collars);
  }

  return payloads.length;
}

export async function importSurveysFromCsv(csvText, collars) {
  if (!collars.length) {
    throw new Error("Primero registra al menos un collar para poder importar survey desde CSV.");
  }

  const parsed = parseCsvText(csvText);
  assertRows(parsed, "survey");
  assertRequiredHeaders(parsed, SURVEY_COLUMNS, "survey");
  const payloads = buildSurveyPayloads(parsed, collars);

  for (const payload of payloads) {
    await createSurvey(payload, collars);
  }

  return payloads.length;
}