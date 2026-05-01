import { eliminarDocumento, guardarDocumento, obtenerDocumentos } from "../services/backendService.js";

const STORE = "guardado";

export async function listGuardado() {
  const items = await obtenerDocumentos(STORE);
  return items.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
}

export function saveGuardado(item) {
  return guardarDocumento(STORE, item.id, item);
}

export function deleteGuardadoById(id) {
  return eliminarDocumento(STORE, id);
}

export async function clearAllGuardado() {
  const items = await listGuardado();
  await Promise.all(items.map((item) => eliminarDocumento(STORE, item.id)));
}
