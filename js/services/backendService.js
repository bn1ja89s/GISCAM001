import { addRecord, deleteRecord, getAllRecords, getRecordByIndex, getRecordByKey, putRecord } from "../db/indexeddb.js";

export const API = "https://backend-pwa-production.up.railway.app";

let currentUser = normalizeUser(readStoredUser());
const authListeners = new Set();

const STORE_KEY_FIELDS = {
  proyectos: "id_local",
  collars: "id_local",
  surveys: "id_local",
  assays: "id_local",
  laboratorios: "id_local",
  guardado: "id",
  sync_queue: "id",
};

const UUID_INDEX_STORES = new Set(["proyectos", "collars", "surveys", "assays", "laboratorios"]);
const AUTO_SYNC_STORES = new Set(["proyectos", "collars", "surveys", "assays", "laboratorios", "guardado"]);
let autoSyncTimer = 0;

function readStoredUser() {
  try {
    const raw = localStorage.getItem("pwa_usuario");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function normalizeUser(user) {
  if (!user) return null;
  return {
    ...user,
    uid: user.uid || user.id || "",
    displayName: user.displayName || user.nombre || "",
  };
}

function notifyAuthListeners(user) {
  for (const listener of authListeners) {
    listener(user);
  }
}

function setSession(token, user) {
  currentUser = normalizeUser(user);
  localStorage.setItem("pwa_token", token);
  localStorage.setItem("pwa_usuario", JSON.stringify(currentUser));
  notifyAuthListeners(currentUser);
}

async function apiFetch(path, options = {}) {
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...options.headers,
  };
  const token = getToken();

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API}${path}`, {
    ...options,
    headers,
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || `Error HTTP ${response.status}`);
    error.status = response.status;
    error.code = data.code || String(response.status);
    throw error;
  }

  return data;
}

function normalizeRegistro(storeName, id, datos) {
  const keyField = STORE_KEY_FIELDS[storeName] || "id";
  const uid = getCurrentUser()?.uid || "";
  const docId = String(id || datos.uuid || datos.id || datos.id_local || crypto.randomUUID());
  return {
    ...datos,
    id: datos.id || docId,
    [keyField]: datos[keyField] || docId,
    uid,
    _actualizadoEn: new Date().toISOString(),
  };
}

function belongsToCurrentUser(record) {
  const uid = getCurrentUser()?.uid;
  if (!uid) return false;
  return !record.uid || record.uid === uid;
}

function scheduleCloudSync(coleccion) {
  if (!AUTO_SYNC_STORES.has(coleccion) || !navigator.onLine || !estaLogueado()) {
    return;
  }

  window.clearTimeout(autoSyncTimer);
  autoSyncTimer = window.setTimeout(async () => {
    const { sincronizarConNube } = await import("./syncService.js");
    await sincronizarConNube();
  }, 1200);
}

export function getToken() {
  return localStorage.getItem("pwa_token");
}

export function getCurrentUser() {
  return currentUser;
}

export function estaLogueado() {
  return Boolean(getToken() && getCurrentUser());
}

export function initAuth(onLogin, onLogout) {
  const listener = (user) => {
    if (user) {
      onLogin(user);
      return;
    }
    onLogout();
  };

  authListeners.add(listener);

  if (currentUser && getToken()) {
    listener(currentUser);

    if (navigator.onLine) {
      apiFetch("/auth/verificar")
        .then((data) => {
          currentUser = normalizeUser(data.user || currentUser);
          localStorage.setItem("pwa_usuario", JSON.stringify(currentUser));
        })
        .catch((error) => {
          if (error.status === 401) {
            cerrarSesion();
          }
        });
    }
  } else {
    listener(null);
  }

  return () => authListeners.delete(listener);
}

export async function login(email, password) {
  const data = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setSession(data.token, data.user);
  return currentUser;
}

export async function registrar(arg1, arg2, arg3) {
  const looksLikeEmailFirst = String(arg1 || "").includes("@");
  const nombre = looksLikeEmailFirst ? arg3 : arg1;
  const email = looksLikeEmailFirst ? arg1 : arg2;
  const password = looksLikeEmailFirst ? arg2 : arg3;

  const data = await apiFetch("/auth/registro", {
    method: "POST",
    body: JSON.stringify({ nombre, email, password }),
  });
  setSession(data.token, data.user);
  return currentUser;
}

export async function cerrarSesion() {
  localStorage.removeItem("pwa_token");
  localStorage.removeItem("pwa_usuario");
  currentUser = null;
  notifyAuthListeners(null);
}

export async function guardarDocumento(coleccion, id, datos) {
  const existing = UUID_INDEX_STORES.has(coleccion) && datos.uuid
    ? await getRecordByIndex(coleccion, "uuid", datos.uuid).catch(() => null)
    : null;
  const record = normalizeRegistro(coleccion, existing?.id_local || id, {
    ...datos,
    id_local: existing?.id_local || datos.id_local,
  });

  try {
    await putRecord(coleccion, record);
  } catch (error) {
    if (error?.name !== "DataError" && error?.name !== "ConstraintError") {
      throw error;
    }
    await addRecord(coleccion, record);
  }

  scheduleCloudSync(coleccion);
  return record;
}

export async function obtenerDocumentos(coleccion) {
  const records = await getAllRecords(coleccion);
  return records.filter(belongsToCurrentUser);
}

export async function obtenerDocumento(coleccion, id) {
  if (!id) return null;

  let record = await getRecordByKey(coleccion, id);

  if (!record && UUID_INDEX_STORES.has(coleccion)) {
    record = await getRecordByIndex(coleccion, "uuid", id).catch(() => null);
  }

  if (!record || !belongsToCurrentUser(record)) {
    return null;
  }

  return record;
}

export async function eliminarDocumento(coleccion, id) {
  if (!id) return;

  const keyField = STORE_KEY_FIELDS[coleccion] || "id";
  const record = await obtenerDocumento(coleccion, id);
  const key = record?.[keyField] || id;
  await deleteRecord(coleccion, key);
  scheduleCloudSync(coleccion);
}

export function obtenerDeIndexedDB(coleccion) {
  return obtenerDocumentos(coleccion);
}

export async function guardarEnNube(coleccion, item) {
  const id = item.id || item.uuid || item.id_local;
  if (!id) throw new Error("ID requerido");
  return apiFetch(`/${coleccion}`, {
    method: "POST",
    body: JSON.stringify({ ...item, id }),
  });
}

export async function eliminarEnNube(coleccion, id) {
  return apiFetch(`/${coleccion}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function sincronizarColeccionEnNube(coleccion, registros) {
  return apiFetch(`/${coleccion}/sync`, {
    method: "POST",
    body: JSON.stringify(registros),
  });
}

export function traducirErrorAutenticacion(errorOrCode) {
  const code = typeof errorOrCode === "string" ? errorOrCode : errorOrCode?.code;
  const message = typeof errorOrCode === "string" ? "" : errorOrCode?.message;
  const errores = {
    "400": message || "Datos incompletos o invalidos",
    "401": message || "Correo o contrasena incorrectos",
    "409": "Este correo ya esta registrado",
    "500": "Error del servidor",
    "Failed to fetch": "No se pudo conectar con el backend",
  };

  if (message && !code) return message;
  return errores[code] || message || `Error al autenticar (${code || "sin codigo"}). Intenta de nuevo`;
}
