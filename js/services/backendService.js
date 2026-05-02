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
const DOWNLOAD_TABLES = ["proyectos", "collars", "surveys", "assays", "laboratorios", "guardado"];
const BACKEND_PENDING_ENTITY = "backend-upsert";
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

function getRecordId(datos = {}) {
  return datos.id || datos.uuid || datos.id_local || crypto.randomUUID();
}

function getPendingUploadId(tabla, id) {
  return `backend-${tabla}-${String(id).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

async function subirRegistroAlServidor(tabla, datos) {
  const id = getRecordId(datos);
  const response = await fetch(`${API}/${tabla}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
    },
    body: JSON.stringify({ ...datos, id }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.error || `Error HTTP ${response.status}`);
  }

  return result;
}

async function agregarAColaPendientes(tabla, datos, error = null) {
  const id = getRecordId(datos);
  const now = new Date().toISOString();
  const queueId = getPendingUploadId(tabla, id);
  const pendingItem = {
    id: queueId,
    entity_type: BACKEND_PENDING_ENTITY,
    entity_uuid: String(id),
    operation: "upsert",
    tabla,
    datos: { ...datos, id },
    payload: { ...datos, id },
    status: "pendiente",
    attempts: 0,
    last_error: error?.message || "",
    created_at: now,
    updated_at: now,
  };

  await guardarDocumento("sync_queue", queueId, pendingItem, { skipAutoSync: true });
  return pendingItem;
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

export async function guardarDocumento(coleccion, id, datos, options = {}) {
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

  if (!options.skipAutoSync) {
    scheduleCloudSync(coleccion);
  }

  return record;
}

export async function guardarYSincronizar(tabla, datos, options = {}) {
  const id = getRecordId(datos);
  const record = await guardarDocumento(tabla, id, { ...datos, id }, {
    ...options,
    skipAutoSync: true,
  });

  if (options.skipRemoteSync || !DOWNLOAD_TABLES.includes(tabla)) {
    return record;
  }

  if (!navigator.onLine || !estaLogueado()) {
    await agregarAColaPendientes(tabla, record);
    return record;
  }

  try {
    await subirRegistroAlServidor(tabla, record);
    await eliminarDocumento("sync_queue", getPendingUploadId(tabla, id));
  } catch (error) {
    await agregarAColaPendientes(tabla, record, error);
  }

  return record;
}

export async function sincronizarColaPendienteBackend() {
  if (!navigator.onLine || !estaLogueado()) {
    return { ok: false, synced: 0, errors: 0, message: "Sin conexion o sin sesion activa." };
  }

  const pendientes = (await obtenerDocumentos("sync_queue"))
    .filter((item) => item.entity_type === BACKEND_PENDING_ENTITY && item.tabla && item.datos);
  let synced = 0;
  let errors = 0;

  for (const item of pendientes) {
    try {
      await subirRegistroAlServidor(item.tabla, item.datos);
      await eliminarDocumento("sync_queue", item.id);
      synced += 1;
    } catch (error) {
      errors += 1;
      await guardarDocumento("sync_queue", item.id, {
        ...item,
        attempts: Number(item.attempts || 0) + 1,
        last_error: error.message || "No se pudo subir el pendiente.",
        updated_at: new Date().toISOString(),
      }, { skipAutoSync: true });
    }
  }

  return {
    ok: errors === 0,
    synced,
    errors,
    message: `Pendientes backend sincronizados: ${synced}. Errores: ${errors}.`,
  };
}

async function guardarEnIndexedDB(tabla, item) {
  const id = item?.id || item?.uuid || item?.id_local;
  if (!id) {
    return null;
  }

  return guardarDocumento(tabla, id, item, { skipAutoSync: true });
}

export async function descargarDatosDelServidor() {
  if (!navigator.onLine || !estaLogueado()) {
    return {
      ok: false,
      skipped: true,
      total: 0,
      message: "Sin conexion o sin sesion activa.",
    };
  }

  let total = 0;

  try {
    for (const tabla of DOWNLOAD_TABLES) {
      const res = await fetch(`${API}/${tabla}`, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

      if (!res.ok) {
        continue;
      }

      const datos = await res.json();
      if (!Array.isArray(datos)) {
        continue;
      }

      for (const item of datos) {
        const saved = await guardarEnIndexedDB(tabla, item);
        if (saved) {
          total += 1;
        }
      }
    }

    return {
      ok: true,
      skipped: false,
      total,
      message: `Datos descargados del servidor: ${total} registros.`,
    };
  } catch (err) {
    console.warn("No se pudieron descargar datos del servidor:", err);
    return {
      ok: false,
      skipped: false,
      total,
      message: err.message || "No se pudieron descargar datos del servidor.",
    };
  }
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
