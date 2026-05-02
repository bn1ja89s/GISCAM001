// proj4 is loaded as a global script via index.html (./js/vendor/proj4.js)
const proj4 = globalThis.proj4;

proj4.defs("EPSG:32717", "+proj=utm +zone=17 +south +datum=WGS84 +units=m +no_defs +type=crs");
proj4.defs("EPSG:32718", "+proj=utm +zone=18 +south +datum=WGS84 +units=m +no_defs +type=crs");

export function createUuid() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `uuid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

export function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function normalizeDecimalValue(value) {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  return trimmed.replace(/\s+/g, "").replace(",", ".");
}

export function formatDecimalInput(value) {
  if (value === "" || value === null || value === undefined) {
    return "";
  }

  return String(value).replace(".", ",");
}

export function toNumber(value, fallback = 0) {
  const parsed = Number(normalizeDecimalValue(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toNullableNumber(value) {
  if (value === "" || value === null || value === undefined) {
    return null;
  }

  const parsed = Number(normalizeDecimalValue(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export function roundNumber(value, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round(toNumber(value) * factor) / factor;
}

export function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  try {
    return new Intl.DateTimeFormat("es-EC", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function sortByDate(items, field = "fecha_modificacion") {
  return [...items].sort((left, right) => String(right[field] || "").localeCompare(String(left[field] || "")));
}

export function generarInicialesTecnico(nombreTecnico) {
  if (!nombreTecnico?.trim()) {
    return "XX";
  }

  const palabras = nombreTecnico.trim().toUpperCase().split(/\s+/);
  if (palabras.length === 1) {
    return palabras[0].substring(0, 2).padEnd(2, "X");
  }

  return palabras.slice(0, 2).map((palabra) => palabra[0]).join("");
}

export function generarIdSecuencial(nombreTecnico, coleccionExistente = []) {
  const iniciales = generarInicialesTecnico(nombreTecnico);
  const escapedInitials = iniciales.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patron = new RegExp(`^${escapedInitials}(\\d+)$`, "i");
  const numerosUsados = coleccionExistente
    .map((item) => {
      const sourceId = item?.holeId
        || item?.hole_id
        || item?.sampleId
        || item?.sample_id
        || item?.muestraId
        || item?.muestra_id
        || "";
      const match = String(sourceId).match(patron);
      return match ? Number.parseInt(match[1], 10) : null;
    })
    .filter((numero) => numero !== null);

  const siguiente = numerosUsados.length ? Math.max(...numerosUsados) + 1 : 1;
  return `${iniciales}${String(siguiente).padStart(2, "0")}`;
}

export function extraerNumeroCollar(holeId) {
  const match = String(holeId || "").match(/(\d+)(?!.*\d)/);
  return match ? match[1] : "";
}

export function generarIdDesdeTecnicoYCollar(nombreTecnico, holeIdCollar) {
  const numeroCollar = extraerNumeroCollar(holeIdCollar);
  if (!numeroCollar) {
    return "";
  }

  return `${generarInicialesTecnico(nombreTecnico)}${numeroCollar}`;
}

export function derivePointAttributes(point) {
  const latitude = roundNumber(point?.latitude ?? point?.y, 6);
  const longitude = roundNumber(point?.longitude ?? point?.x, 6);
  const rawElevation = toNullableNumber(point?.elevacion ?? point?.z);
  const elevacion = rawElevation == null ? null : roundNumber(rawElevation, 2);

  return {
    latitude,
    longitude,
    este: null,
    norte: null,
    elevacion,
    geometry: {
      x: point?.x ?? longitude,
      y: point?.y ?? latitude,
      z: toNullableNumber(point?.z ?? point?.elevacion),
      spatialReference: point?.spatialReference || { wkid: 4326 },
    },
  };
}

export function projectCoordinates(latitude, longitude, srProyecto) {
  const target = srProyecto === "WGS84_UTM_18S" ? "EPSG:32718" : "EPSG:32717";
  const [este, norte] = proj4("EPSG:4326", target, [toNumber(longitude), toNumber(latitude)]);

  return {
    este: roundNumber(este, 3),
    norte: roundNumber(norte, 3),
  };
}

export function enrichPointForProject(point, srProyecto) {
  const rawLatitude = toNullableNumber(point?.latitude);
  const rawLongitude = toNullableNumber(point?.longitude);

  if (!Number.isFinite(rawLatitude) || !Number.isFinite(rawLongitude)) {
    return {
      ...point,
      latitude: null,
      longitude: null,
      este: null,
      norte: null,
    };
  }

  const latitude = roundNumber(rawLatitude, 15);
  const longitude = roundNumber(rawLongitude, 15);
  const rawElevation = toNullableNumber(point?.elevacion ?? point?.geometry?.z ?? point?.z);

  return {
    ...point,
    latitude,
    longitude,
    elevacion: rawElevation == null ? null : roundNumber(rawElevation, 2),
    ...projectCoordinates(latitude, longitude, srProyecto),
  };
}

export function formatDateOnlyFromMillis(value) {
  if (!value) {
    return "";
  }

  try {
    return new Date(value).toISOString().slice(0, 10);
  } catch {
    return "";
  }
}
