import { createUuid, nowIso } from "../core/helpers.js";
import { saveGuardado } from "../db/guardadoRepository.js";

export async function saveAreaGuardado({ titulo, notas, color, vertices, perimeterM, areaHa }) {
  const item = {
    id: createUuid(),
    tipo: "area",
    titulo: titulo || "Área",
    notas: notas || "",
    color: color || "#2d5a27",
    vertices,
    perimetro_m: perimeterM,
    area_ha: areaHa,
    fecha: nowIso(),
  };
  await saveGuardado(item);
  return item;
}

export async function saveLineaGuardado({ titulo, puntos, distanciaM, unidadDisplay }) {
  const item = {
    id: createUuid(),
    tipo: "linea",
    titulo: titulo || "Línea",
    puntos,
    distancia_m: distanciaM,
    unidad_display: unidadDisplay,
    fecha: nowIso(),
  };
  await saveGuardado(item);
  return item;
}

export async function saveFotoGuardado({ imagenBase64, lat, lon, elevacion }) {
  const now = new Date();
  const titulo = `Foto ${now.toLocaleDateString("es-EC")} ${now.toLocaleTimeString("es-EC", { timeStyle: "short" })}`;
  const item = {
    id: createUuid(),
    tipo: "foto",
    titulo,
    imagen_base64: imagenBase64,
    lat,
    lon,
    elevacion: elevacion || null,
    fecha: nowIso(),
  };
  await saveGuardado(item);
  return item;
}
