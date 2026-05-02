import { appConfig } from "./config.js";
import { qs, formToObject, setHTML } from "./core/dom.js";
import { clone, createUuid, enrichPointForProject, formatDateTime, formatDecimalInput, nowIso, toNullableNumber } from "./core/helpers.js";
import { createStore } from "./core/state.js";
import { getOnlineStatus, watchNetworkStatus } from "./core/network.js";
import { initDB } from "./db/indexeddb.js";
import { listAssays } from "./db/assayRepository.js";
import { getCollarByUuid, listCollars } from "./db/collarRepository.js";
import { listLaboratorios } from "./db/laboratorioRepository.js";
import { getProjectByUuid, listProjects } from "./db/proyectoRepository.js";
import { listSurveys } from "./db/surveyRepository.js";
import { listSyncQueue } from "./db/syncRepository.js";
import { createProject, deleteOrDeactivateProject, resolveActiveProjectUuid, selectActiveProject, updateProject } from "./services/proyectoService.js";
import { createCollar, deleteCollar, updateCollar } from "./services/collarService.js";
import { adjustMapZoom, focusCollar, getCaptureEnabled, getMapView, initMap, renderCollars, resetMapNorth, resolvePointElevation, setCaptureEnabled, setCurrentLocationPoint, setDraftPoint, startGpsNavigation, stopGpsNavigation } from "./services/mapService.js";
import { exportBackup, importBackup } from "./services/backupService.js";
import { resolveDraftCollarElevation, resolvePendingCollarElevations } from "./services/elevationService.js";
import { adjustOfflineMapZoom, cancelOfflineDrawing, clearInvalidTiles, clearOfflineMap, cycleOfflineLineUnit, downloadVisibleArea, focusOfflineCollar, focusOfflineSavedItem, formatOfflineLineDistance, getOfflineDrawingMode, getOfflineDrawingState, getOfflineMeasurements, getOfflineMapDiagnostics, hasOfflineTiles, initOfflineMap, renderOfflineCollars, renderOfflineSavedItems, resetOfflineMapNorth, setOfflineCaptureEnabled, setOfflineCurrentLocationPoint, setOfflineDraftPoint, startOfflineDrawingMode, undoOfflineLastVertex } from "./services/offlineMapService.js";
import {
  bootstrapArcGISData,
  cerrarSesion,
  descargarDatosDelServidor,
  estaLogueado,
  initAuth,
  login,
  registrar,
  sincronizarColaPendienteBackend,
  sincronizarConNube,
  syncAll,
  traducirErrorAutenticacion,
} from "./services/syncService.js";
import { getCurrentRoute, initRouter, navigate } from "./router.js";
import { renderDashboardPage } from "./pages/dashboardPage.js";
import { renderProyectoPage } from "./pages/proyectoPage.js";
import { renderCollarPage } from "./pages/collarPage.js";
import { renderSurveyPage } from "./pages/surveyPage.js";
import { renderAssayPage } from "./pages/assayPage.js";
import { renderLaboratorioPage } from "./pages/laboratorioPage.js";
import { renderCurrentLocationSummary, renderDraftCollarSummary, renderDrawingOverlay, renderDrawingSaveModal, renderImportDataModal, renderMapCaptureSheet, renderMapaPage, renderMapFab, renderMapLayersPanel, renderMapProjectBanner, renderMapSearchBar, renderMapStatusLabel, renderSelectedCollarPanel } from "./pages/mapaPage.js";
import { renderSyncPage } from "./pages/syncPage.js";
import { renderMapToolbar, toggleToolbarExpanded } from "./components/mapToolbar.js";
import { renderMobileDrawer, renderMobileNav, renderSidebar } from "./components/sidebar.js";
import { renderTopbar } from "./components/topbar.js";
import { showToast } from "./ui/notifications.js";
import { getStoredCaptureMode, getStoredDraftCollar, getStoredDraftHintDismissed, setStoredArcGISMapCache, setStoredCaptureMode, setStoredDraftCollar, setStoredDraftHintDismissed } from "./services/storageService.js";
import { createSurvey, deleteSurvey, updateSurvey } from "./services/surveyService.js";
import { createAssay, deleteAssay, updateAssay } from "./services/assayService.js";
import { importAssaysFromCsv, importSurveysFromCsv } from "./services/csvImportService.js";
import { createLaboratorio, deleteLaboratorio, obtenerLaboratoriosLocales, updateLaboratorio } from "./services/laboratorioService.js";
import { enqueueLaboratorioSurvey123Submission, syncLaboratorioSurvey123Submissions } from "./services/survey123LaboratorioService.js";
import { listGuardado, deleteGuardadoById, clearAllGuardado, saveGuardado } from "./db/guardadoRepository.js";
import { saveAreaGuardado, saveFotoGuardado, saveLineaGuardado } from "./services/guardadoService.js";
import { cancelDrawing, cycleLineUnit, getDrawingMode, getDrawingState, getMeasurements, formatLineDistance, highlightSavedItem, startDrawingMode, undoLastVertex, addPhotoMarkerToMap, loadVerticesIntoDrawing, addSavedAreaToMap, addSavedLineaToMap, loadAllSavedItemsOnMap, removeSavedItemFromMap, updateSavedItemColor, cycleEditorMode, getEditorMode, resetEditorMode } from "./services/mapDrawingService.js";
import { renderGuardadoPage, renderGuardadoDetail, exportarGeoJSON, exportarKML } from "./pages/guardadoPage.js";
import { renderAuthPage } from "./pages/authPage.js";

function createGpsCaptureState(overrides = {}) {
  return {
    navigationMode: "free",
    inProgress: false,
    targetSamples: appConfig.map.gpsSampleCount,
    meanAccuracy: null,
    bestAccuracy: null,
    samplesCollected: 0,
    message: "GPS listo para navegacion libre.",
    ...overrides,
  };
}

function createDefaultMapOverlays() {
  return {
    collars: true,
    labels: true,
    cadastralGrid: false,
    basemap: true,
  };
}

const store = createStore({
  route: "dashboard",
  online: getOnlineStatus(),
  projects: [],
  collars: [],
  surveys: [],
  assays: [],
  laboratorios: [],
  syncQueue: [],
  activeProjectUuid: "",
  draftCollar: null,
  currentLocation: null,
  captureMode: getStoredCaptureMode(),
  gpsCapture: createGpsCaptureState(),
  editingProjectUuid: "",
  editingCollarUuid: "",
  editingSurveyUuid: "",
  editingAssayUuid: "",
  editingLaboratorioUuid: "",
  pendingFocusCollarUuid: "",
  sidebarOpen: false,
  mobileDrawerOpen: false,
  isSyncing: false,
  syncMessage: "",
  deferredPrompt: null,
  mapReady: true,
  mapEngine: "arcgis",
  mapFallbackMessage: "",
  mapDraftHintDismissed: getStoredDraftHintDismissed(),
  layersPanelOpen: false,
  importModalOpen: false,
  selectedMapCollarUuid: "",
  selectedAssayCollarUuid: "",
  mapOverlays: createDefaultMapOverlays(),
  drawingMode: null,
  fabMenuOpen: false,
  drawingSaveModalOpen: false,
  drawingMeasurement: "",
  editingAreaId: "",
  editingAreaFecha: "",
  guardados: [],
  pendingFocusGuardadoId: "",
  guardadoDetailId: "",
  guardadoExportModalId: "",
  captureFlow: {
    active: false,
    step: "",
    collarUuid: "",
    holeId: "",
  },
});

let eventsBound = false;
let installPromptRegistered = false;
let serviceWorkerRegistered = false;
let routerStarted = false;
let networkWatcherStarted = false;
let bidirectionalSyncHandlersRegistered = false;
let bidirectionalSyncInProgress = false;

function getDerivedState() {
  const state = store.getState();
  const activeProject = state.projects.find((project) => project.uuid === state.activeProjectUuid) || null;
  const activeProjectCollars = activeProject
    ? state.collars.filter((collar) => collar.proyecto_uuid === activeProject.uuid)
    : [];
  const activeProjectCollarIds = new Set(activeProjectCollars.map((collar) => collar.uuid));
  const activeProjectSurveys = state.surveys.filter((survey) => activeProjectCollarIds.has(survey.collar_uuid));
  const activeProjectAssays = state.assays.filter((assay) => activeProjectCollarIds.has(assay.collar_uuid));
  const activeProjectAssayIds = new Set(activeProjectAssays.map((assay) => assay.uuid));
  const activeProjectAssayKeys = new Set(
    activeProjectAssays
      .flatMap((assay) => [assay.uuid, assay.global_id_remoto, assay.remote_object_id, assay.muestra_id, assay.hole_id])
      .map((value) => String(value || "").trim())
      .filter(Boolean),
  );
  const activeProjectLaboratorios = activeProject
    ? state.laboratorios.filter((laboratorio) => (
      activeProjectAssayIds.has(laboratorio.assay_uuid)
      || (
        laboratorio.fuente === "survey123"
        && [laboratorio.assay_uuid, laboratorio.survey123_assay_id, laboratorio.muestra_id, laboratorio.assay_global_id_remoto]
          .map((value) => String(value || "").trim())
          .some((value) => value && activeProjectAssayKeys.has(value))
      )
    ))
    : [];
  const pendingQueue = state.syncQueue.filter((item) => item.status !== appConfig.status.synced);
  const editingProject = state.projects.find((project) => project.uuid === state.editingProjectUuid) || null;
  const editingCollar = state.collars.find((collar) => collar.uuid === state.editingCollarUuid) || null;
  const editingSurvey = state.surveys.find((survey) => survey.uuid === state.editingSurveyUuid) || null;
  const editingAssay = state.assays.find((assay) => assay.uuid === state.editingAssayUuid) || null;
  const editingLaboratorio = state.laboratorios.find((laboratorio) => laboratorio.uuid === state.editingLaboratorioUuid) || null;
  const selectedMapCollar = state.collars.find((collar) => collar.uuid === state.selectedMapCollarUuid) || null;

  return {
    ...state,
    activeProject,
    activeProjectCollars,
    activeProjectSurveys,
    activeProjectAssays,
    activeProjectLaboratorios,
    pendingQueue,
    editingProject,
    editingCollar,
    editingSurvey,
    editingAssay,
    editingLaboratorio,
    selectedMapCollar,
  };
}

function renderShell() {
  const app = qs("#app");
  if (!app) {
    return;
  }

  setHTML(
    app,
    `
      <aside id="sidebar" class="sidebar"></aside>
      <div class="app-content">
        <header id="topbar" class="topbar"></header>
        <main id="page-root" class="main-content"></main>
      </div>
      <div id="mobile-nav-root" class="mobile-nav-root"></div>
      <button id="mobile-drawer-backdrop" class="mobile-drawer-backdrop" type="button" data-action="close-mobile-drawer" aria-label="Cerrar menu movil"></button>
      <div id="mobile-drawer-root" class="mobile-drawer-root"></div>
    `,
  );
}

function refreshChrome() {
  const state = getDerivedState();
  const sidebar = qs("#sidebar");
  const topbar = qs("#topbar");
  const mobileNavRoot = qs("#mobile-nav-root");
  const mobileDrawerRoot = qs("#mobile-drawer-root");
  const mobileDrawerBackdrop = qs("#mobile-drawer-backdrop");

  if (sidebar) {
    setHTML(sidebar, renderSidebar(state));
  }

  if (topbar) {
    setHTML(
      topbar,
      renderTopbar({
        appName: appConfig.appName,
        online: state.online,
        activeProject: state.activeProject,
        pendingCount: state.pendingQueue.length,
        canInstall: Boolean(state.deferredPrompt),
        isSyncing: state.isSyncing,
      }),
    );
  }

  if (mobileNavRoot) {
    setHTML(mobileNavRoot, renderMobileNav(state));
  }

  if (mobileDrawerRoot) {
    mobileDrawerRoot.classList.toggle("is-open", state.mobileDrawerOpen);
    setHTML(mobileDrawerRoot, renderMobileDrawer(state));
  }

  if (mobileDrawerBackdrop) {
    mobileDrawerBackdrop.classList.toggle("is-open", state.mobileDrawerOpen);
  }

  renderCaptureFlowIndicator(state.captureFlow);
}

function renderCaptureFlowIndicator(flow = {}) {
  const existing = document.getElementById("flujo-indicador");
  if (!flow?.active || !flow.step) {
    existing?.remove();
    return;
  }

  const stepMap = { collar: 1, survey: 2, assay: 3 };
  const currentStep = stepMap[flow.step] || 1;
  const steps = ["Collar", "Survey", "Assay"];
  const html = steps.map((step, index) => {
    const stepNumber = index + 1;
    const isActive = stepNumber === currentStep;
    const isDone = stepNumber < currentStep;
    return `<span style="padding:2px 8px;border-radius:10px;font-size:11px;background:${isActive ? "#2d5a27" : "#e8f5e9"};color:${isActive ? "white" : "#2d5a27"};font-weight:${isActive ? "bold" : "normal"};">${isDone ? "✓ " : ""}${step}</span>`;
  }).join('<span style="color:#999;padding:0 2px">›</span>');

  const closeButton = '<button type="button" data-action="cancel-capture-flow" aria-label="Cancelar flujo de registro" title="Cancelar flujo" style="width:24px;height:24px;border:0;border-radius:50%;background:#fdecea;color:#b42318;font-weight:700;line-height:1;cursor:pointer;">x</button>';
  const indicator = existing || document.createElement("div");
  indicator.id = "flujo-indicador";
  indicator.style.cssText = "position:fixed;top:54px;left:50%;transform:translateX(-50%);background:white;border-radius:20px;padding:4px 12px;z-index:500;box-shadow:0 2px 8px rgba(0,0,0,0.15);display:flex;align-items:center;gap:4px;";
  indicator.innerHTML = `${html}${closeButton}`;
  if (!existing) {
    document.body.appendChild(indicator);
  }
}

function clearCaptureFlow() {
  store.setState({
    captureFlow: {
      active: false,
      step: "",
      collarUuid: "",
      holeId: "",
    },
  });
  renderCaptureFlowIndicator(null);
}

function renderCurrentPage() {
  const state = getDerivedState();
  const pageRoot = qs("#page-root");
  if (!pageRoot) {
    return;
  }

  const pageContext = clone({
    ...state,
    appName: appConfig.appName,
  });

  const pageTemplates = {
    dashboard: renderDashboardPage(pageContext),
    proyectos: renderProyectoPage(pageContext),
    collars: renderCollarPage(pageContext),
    survey: renderSurveyPage(pageContext),
    assay: renderAssayPage(pageContext),
    laboratorio: renderLaboratorioPage(pageContext),
    mapa: renderMapaPage({
      ...pageContext,
      captureEnabled: getCaptureEnabled(),
      fabMenuOpen: state.fabMenuOpen,
      drawingMode: state.drawingMode,
      drawingSaveModalOpen: state.drawingSaveModalOpen,
      drawingMeasurement: state.drawingMeasurement,
    }),
    sync: renderSyncPage(pageContext),
    guardado: renderGuardadoPage({
      guardados: pageContext.guardados,
      guardadoDetailId: pageContext.guardadoDetailId,
      guardadoExportModalId: pageContext.guardadoExportModalId,
    }),
  };

  pageRoot.classList.toggle("main-content--map", state.route === "mapa");
  setHTML(pageRoot, pageTemplates[state.route] || pageTemplates.dashboard);
  renderCaptureFlowIndicator(state.captureFlow);

  if (state.route === "mapa") {
    mountMapPage();
  }
}

async function loadAppData() {
  const [projects, collars, surveys, assays, laboratorios, syncQueue, guardados] = await Promise.all([
    listProjects(),
    listCollars(),
    listSurveys(),
    listAssays(),
    listLaboratorios(),
    listSyncQueue(),
    listGuardado(),
  ]);
  const activeProjectUuid = await resolveActiveProjectUuid();
  store.setState({
    projects,
    collars,
    surveys,
    assays,
    laboratorios,
    syncQueue,
    activeProjectUuid,
    guardados,
  });
}

async function cargarLaboratorios({ render = true } = {}) {
  try {
    const locales = await obtenerLaboratoriosLocales();
    const laboratorios = locales
      .sort((left, right) => new Date(right.fecha_modificacion || right.fecha_creacion || 0) - new Date(left.fecha_modificacion || left.fecha_creacion || 0));

    store.setState({ laboratorios });
  } catch (error) {
    console.error("Error al cargar laboratorios:", error);
    showToast("Error al cargar laboratorios", "error");
    store.setState({ laboratorios: await obtenerLaboratoriosLocales() });
  }

  if (render) {
    renderCurrentPage();
  }
}

async function rerenderAll() {
  await loadAppData();
  refreshChrome();
  renderCurrentPage();
}

async function refrescarVistaActual() {
  await rerenderAll();
}

function shouldPreserveOpenForm() {
  return Boolean(qs("#project-form, #collar-form, #survey-form, #assay-form, #laboratorio-form, #offline-point-form, #drawing-save-form"));
}

async function refreshAfterBackgroundWork() {
  await loadAppData();
  refreshChrome();
  refreshActiveMapCollars();

  if (!shouldPreserveOpenForm()) {
    renderCurrentPage();
  }
}

function mostrarSincronizando() {
  const chip = qs("#chip-pendientes");
  if (chip) {
    chip.textContent = "⟳ Sync...";
  }
}

function ocultarSincronizando() {
  refreshChrome();
}

async function sincronizarBidireccional({ uploadPending = false, refresh = true } = {}) {
  if (bidirectionalSyncInProgress || !estaLogueado() || !navigator.onLine) {
    return;
  }

  bidirectionalSyncInProgress = true;
  store.setState({ isSyncing: true, online: true });
  refreshChrome();
  mostrarSincronizando();

  try {
    if (uploadPending) {
      await sincronizarColaPendienteBackend();
    }

    await descargarDatosDelServidor();

    if (refresh) {
      await refreshAfterBackgroundWork();
    }
  } catch (error) {
    console.warn("No se pudo completar la sincronizacion bidireccional:", error);
  } finally {
    bidirectionalSyncInProgress = false;
    store.setState({ isSyncing: false });
    ocultarSincronizando();
  }
}

function registerBidirectionalSyncHandlers() {
  if (bidirectionalSyncHandlersRegistered) {
    return;
  }

  bidirectionalSyncHandlersRegistered = true;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      void sincronizarBidireccional({ uploadPending: true });
    }
  });

  window.setInterval(() => {
    void sincronizarBidireccional();
  }, 30000);
}

function setSidebarOpen(isOpen) {
  store.setState({ sidebarOpen: isOpen, mobileDrawerOpen: isOpen });
  refreshChrome();
}

function fillLaboratorioFromSelectedAssay(select) {
  const form = select.closest("#laboratorio-form");
  const option = select.selectedOptions?.[0];
  if (!form || !option) {
    return;
  }

  const values = {
    muestra_id: option.dataset.muestraId || option.dataset.defaultMuestraId || "",
    fecha_recepcion: option.dataset.fechaRecepcion || "",
    laboratorio: option.dataset.laboratorio || "",
    color_q: option.dataset.colorQ || "",
    contraccion: option.dataset.contraccion || "",
    absorcion: option.dataset.absorcion || "",
    observaciones: option.dataset.observaciones || "",
  };

  Object.entries(values).forEach(([name, value]) => {
    const field = form.elements.namedItem(name);
    if (!field || !(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) {
      return;
    }

    field.value = value;
  });
}

function fillSurveyFromSelectedCollar(select) {
  const form = select.closest("#survey-form");
  const holeIdInput = form?.querySelector("#survey-hole-id");
  const profundidadInput = form?.elements?.namedItem("profundidad");
  const holeId = select.selectedOptions?.[0]?.dataset.holeId || "";
  const profTotal = select.selectedOptions?.[0]?.dataset.profTotal || "";

  if (holeIdInput instanceof HTMLInputElement) {
    holeIdInput.value = holeId;
  }

  if (profundidadInput instanceof HTMLInputElement) {
    profundidadInput.value = profTotal;
  }
}

function refreshAssayMuestraOptions(select) {
  const form = select.closest("#assay-form");
  const muestraSelect = form?.querySelector("#assay-muestra-id");
  const desdeInput = form?.elements?.namedItem("desde");
  const nextMuestraId = select.selectedOptions?.[0]?.dataset.nextMuestraId || "";
  const nextDesde = select.selectedOptions?.[0]?.dataset.nextDesde || "0";

  if (!(muestraSelect instanceof HTMLSelectElement) || !nextMuestraId) {
    return;
  }

  muestraSelect.innerHTML = `
    <option value="${nextMuestraId}">${nextMuestraId}</option>
    <option value="NO HAY">NO HAY</option>
  `;
  if (desdeInput instanceof HTMLInputElement) {
    desdeInput.value = nextDesde;
  }
  applyAssayMuestraState(muestraSelect);
}

function applyAssayMuestraState(select) {
  const form = select.closest("#assay-form");
  if (!form) {
    return;
  }

  const hasNoSample = select.value === "NO HAY";
  const notice = form.querySelector("#assay-no-sample-notice");
  notice?.classList.toggle("hidden", !hasNoSample);

  const submitButton = form.querySelector('button[type="submit"]');
  if (submitButton) {
    submitButton.textContent = form.elements.namedItem("uuid")?.value ? "Actualizar assay" : "Guardar assay";
  }
}

function buildHoleIdPrefix(project) {
  const source = String(project?.cod_exploracion || project?.concesion_area || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  const parts = source.match(/[A-Z0-9]+/g) || [];

  if (!parts.length) {
    return "PR";
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).padEnd(2, parts[0][0] || "P");
  }

  return `${parts[0][0] || "P"}${parts[1][0] || "R"}`;
}

function extractHoleIdSequence(holeId, prefix) {
  const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(holeId || "").toUpperCase().match(new RegExp(`^${escapedPrefix}-(\\d+)$`));
  return match ? Number(match[1]) || 0 : 0;
}

function getNextDraftHoleId(state) {
  const prefix = buildHoleIdPrefix(state.activeProject);
  const previousDraft = state.draftCollar?.proyecto_uuid === state.activeProject?.uuid ? state.draftCollar : null;

  if (previousDraft?.hole_id?.trim()) {
    return previousDraft.hole_id.trim().toUpperCase();
  }

  const maxSequence = state.activeProjectCollars.reduce((currentMax, collar) => {
    return Math.max(currentMax, extractHoleIdSequence(collar.hole_id, prefix));
  }, 0);

  return `${prefix}-${String(maxSequence + 1).padStart(3, "0")}`;
}

function getElevationStateLabel(record) {
  if (!record) {
    return "sin dato";
  }

  return record.elevation_status === "resolved" || record.elevacion != null
    ? "resuelta"
    : "pendiente";
}

function buildSyncErrorPreview(syncQueue) {
  const errorItems = syncQueue.filter((item) => item.status === appConfig.status.error);
  if (!errorItems.length) {
    return "";
  }

  const item = errorItems[0];
  const identifier = item?.payload?.hole_id || item?.payload?.guia_ensayo || item?.payload?.cod_exploracion || item?.entity_uuid || "sin identificador";
  const errorMessage = item?.last_error || "Sin detalle remoto.";
  return ` Primer error: ${item.entity_type} ${identifier}. ${errorMessage}`;
}

const PROJECT_AREA_DEFAULTS = {
  "CHILCAY 05": {
    codExploracion: "CH05",
    codCatastral: "791195",
    localizacion: "Chillanes",
  },
  CAPRICHO: {
    codExploracion: "CAP",
    codCatastral: "4490.1",
    localizacion: "Capricho",
  },
};

function applyProjectAreaDefaults(select) {
  const form = select.closest("#project-form");
  const defaults = PROJECT_AREA_DEFAULTS[select.value];
  if (!form || !defaults) {
    return;
  }

  form.elements.cod_exploracion.value = defaults.codExploracion;
  form.elements.cod_catastral.value = defaults.codCatastral;
  form.elements.localizacion.value = defaults.localizacion;
}

function syncCustomSelectField(fieldName, form) {
  if (!fieldName || !form) {
    return;
  }

  const select = form.querySelector(`[data-custom-select="${fieldName}"]`);
  const input = form.querySelector(`[data-custom-input="${fieldName}"]`);
  const hidden = form.querySelector(`[data-custom-value="${fieldName}"]`);
  if (!(select instanceof HTMLSelectElement) || !(input instanceof HTMLInputElement) || !(hidden instanceof HTMLInputElement)) {
    return;
  }

  const useCustomValue = select.value === "Otros";
  input.classList.toggle("hidden", !useCustomValue);
  if (useCustomValue) {
    hidden.value = input.value.trim() || "Otros";
    return;
  }

  input.value = "";
  hidden.value = select.value;
}

function decimalsFromStep(stepValue) {
  const step = String(stepValue || "1");
  return step.includes(".") ? step.split(".")[1].length : 0;
}

function stepNumberInput(source) {
  const form = source.closest("form");
  const fieldName = source.dataset.field;
  const input = form?.elements?.[fieldName];
  if (!(input instanceof HTMLInputElement)) {
    return;
  }

  const direction = source.dataset.direction === "down" ? -1 : 1;
  const minValue = input.dataset.min ?? input.min;
  const maxValue = input.dataset.max ?? input.max;
  const min = minValue === "" ? null : toNullableNumber(minValue);
  const max = maxValue === "" ? null : toNullableNumber(maxValue);
  const stepValue = input.dataset.stepIncrement || input.step || "1";
  const step = toNullableNumber(stepValue) || 1;
  const decimals = decimalsFromStep(stepValue);
  const current = input.value === "" ? (direction > 0 ? (min ?? 0) - step : (max ?? min ?? 0) + step) : toNullableNumber(input.value);
  let next = Number.isFinite(current) ? current + (step * direction) : (min ?? 0);

  if (min !== null) {
    next = Math.max(min, next);
  }

  if (max !== null) {
    next = Math.min(max, next);
  }

  input.value = next.toFixed(decimals).replace(".", ",");
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function buildMapFallbackMessage(error, online) {
  if (!online) {
    return "Sin conexion. Se activara el mapa offline local para seguir capturando puntos por mapa.";
  }

  if (/webgl/i.test(String(error?.message || ""))) {
    return "El dispositivo no pudo iniciar ArcGIS. Se activara el mapa offline local para seguir capturando puntos.";
  }

  return error?.message || "No fue posible cargar ArcGIS. Se activara el mapa offline local para seguir capturando puntos.";
}

function rememberArcGISCache() {
  const currentMap = appConfig.maps[0] || {};
  setStoredArcGISMapCache({
    warmedAt: new Date().toISOString(),
    mapId: currentMap.id || "",
    mapTitle: currentMap.title || "",
  });
}

function isOfflineMapActive(state = getDerivedState()) {
  return state.mapEngine === "offline";
}

async function buildOfflineMapMessage() {
  return (await hasOfflineTiles())
    ? "Mapa offline listo desde tiles guardados en IndexedDB."
    : "No hay mapa offline descargado para esta zona";
}

function getActiveDrawingMode() {
  return isOfflineMapActive() ? getOfflineDrawingMode() : getDrawingMode();
}

function getActiveDrawingState() {
  return isOfflineMapActive() ? getOfflineDrawingState() : getDrawingState();
}

function getActiveMeasurements() {
  return isOfflineMapActive() ? getOfflineMeasurements() : getMeasurements();
}

function formatActiveLineDistance(meters, unit) {
  return isOfflineMapActive() ? formatOfflineLineDistance(meters, unit) : formatLineDistance(meters, unit);
}

function cancelActiveDrawing() {
  if (isOfflineMapActive()) {
    cancelOfflineDrawing();
    return;
  }

  cancelDrawing();
}

function setMapCaptureEnabled(enabled) {
  setCaptureEnabled(enabled);
  setOfflineCaptureEnabled(enabled);
}

function getVisibleMapCollars(state = getDerivedState()) {
  return state.mapOverlays?.collars ? state.activeProjectCollars : [];
}

function renderActiveMapCollars(collars, options = {}) {
  const mapOptions = {
    showLabels: Boolean(options.showLabels),
    selectedUuid: options.selectedUuid || "",
  };

  if (isOfflineMapActive()) {
    renderOfflineCollars(collars, mapOptions);
    return;
  }

  renderCollars(collars, mapOptions);
}

function refreshActiveMapCollars() {
  if (store.getState().route !== "mapa") {
    return;
  }

  const state = getDerivedState();
  renderActiveMapCollars(getVisibleMapCollars(state), {
    showLabels: Boolean(state.mapOverlays?.labels),
    selectedUuid: state.selectedMapCollarUuid,
  });
}

function setActiveDraftPoint(point) {
  if (isOfflineMapActive()) {
    setOfflineDraftPoint(point);
    return;
  }

  setDraftPoint(point);
}

function setActiveCurrentLocationPoint(point) {
  if (isOfflineMapActive()) {
    setOfflineCurrentLocationPoint(point);
    return;
  }

  setCurrentLocationPoint(point);
}

async function focusActiveCollar(collar) {
  if (isOfflineMapActive()) {
    await focusOfflineCollar(collar);
    return;
  }

  await focusCollar(collar);
}

async function reconcileDraftElevationIfNeeded(online = store.getState().online) {
  const state = getDerivedState();
  const draftCollar = state.draftCollar;

  if (!draftCollar) {
    return false;
  }

  const draftProject = state.projects.find((project) => project.uuid === draftCollar.proyecto_uuid)
    || (state.activeProject?.uuid === draftCollar.proyecto_uuid ? state.activeProject : null);

  if (!draftProject) {
    return false;
  }

  const nextDraft = await resolveDraftCollarElevation(draftCollar, draftProject, { online });
  if (!nextDraft) {
    return false;
  }

  const changed = (
    nextDraft.elevacion !== draftCollar.elevacion ||
    nextDraft.elevation_status !== draftCollar.elevation_status ||
    nextDraft.elevation_source !== draftCollar.elevation_source ||
    nextDraft.geometry?.z !== draftCollar.geometry?.z
  );

  if (!changed) {
    return false;
  }

  setStoredDraftCollar(nextDraft);
  store.setState({ draftCollar: nextDraft });

  if (store.getState().route === "mapa") {
    setActiveDraftPoint(nextDraft);
    refreshMapDraftSummary();
  }

  return true;
}

async function persistDraftCollar(pointData, captureSource) {
  const state = getDerivedState();

  if (!state.activeProject) {
    showToast("Debes seleccionar un proyecto activo antes de capturar un collar.", "error", 4200);
    return null;
  }

  const resolvedPoint = await resolvePointElevation(pointData, {
    project: state.activeProject,
    online: state.online,
    preferExistingElevation: false,
  });
  const pointWithElevation = resolvedPoint || pointData;
  const enrichedPoint = state.activeProject ? enrichPointForProject(pointWithElevation, state.activeProject.sr_proyecto) : pointWithElevation;
  const previousDraft = state.draftCollar?.proyecto_uuid === state.activeProject.uuid ? state.draftCollar : null;
  const draftCollar = {
    ...enrichedPoint,
    proyecto_uuid: state.activeProject.uuid,
    capture_source: captureSource,
    fecha: previousDraft?.fecha || new Date().toISOString().slice(0, 10),
    localizacion: previousDraft?.localizacion || "",
    hole_id: previousDraft?.hole_id || getNextDraftHoleId(state),
    tipo: previousDraft?.tipo || "RC",
    prof_total: previousDraft?.prof_total ?? 0,
    elevation_status: enrichedPoint?.elevation_status || (enrichedPoint?.elevacion != null ? "resolved" : "pending"),
    elevation_source: enrichedPoint?.elevation_source || "",
    elevation_resolved_at: enrichedPoint?.elevation_resolved_at || "",
  };

  setStoredDraftCollar(draftCollar);
  store.setState({ draftCollar });
  return draftCollar;
}

function refreshMapDraftSummary() {
  const state = getDerivedState();
  if (state.route !== "mapa") {
    return;
  }

  const draftSummary = qs("#map-draft-summary");
  if (!draftSummary) {
    return;
  }

  setHTML(
    draftSummary,
    renderDraftCollarSummary({
      draftCollar: state.draftCollar,
      captureMode: state.captureMode,
      dismissed: state.mapDraftHintDismissed,
    }),
  );

  draftSummary.classList.toggle("hidden", !state.draftCollar && state.mapDraftHintDismissed);

  refreshMapCaptureSheet();
}

function refreshMapToolbarSection() {
  const state = getDerivedState();
  if (state.route !== "mapa") {
    return;
  }

  const toolbarRoot = qs("#map-toolbar-root");
  if (!toolbarRoot) {
    return;
  }

  setHTML(toolbarRoot, renderMapToolbar({
    captureEnabled: getCaptureEnabled(),
    hasActiveProject: Boolean(state.activeProject),
    captureMode: state.captureMode,
    gpsCapture: state.gpsCapture,
    hasCurrentLocation: Boolean(state.currentLocation),
    mapAvailable: state.mapReady,
    layersPanelOpen: state.layersPanelOpen,
  }));
}

function refreshMapDrawingSection() {
  const state = getDerivedState();
  if (state.route !== "mapa") {
    return;
  }
  const fabRoot = qs("#map-fab-root");
  const overlayRoot = qs("#map-drawing-overlay-root");
  const modalRoot = qs("#map-drawing-modal-root");
  if (fabRoot) {
    setHTML(fabRoot, renderMapFab({ fabMenuOpen: state.fabMenuOpen, drawingMode: state.drawingMode }));
  }
  if (overlayRoot) {
    setHTML(overlayRoot, renderDrawingOverlay({ drawingMode: state.drawingMode, drawingMeasurement: state.drawingMeasurement, editorMode: getEditorMode() }));
    attachDragToDrawingPanel();
  }
  if (modalRoot) {
    setHTML(modalRoot, renderDrawingSaveModal({ drawingSaveModalOpen: state.drawingSaveModalOpen, drawingMode: state.drawingMode }));
  }
  // BUG 3+4: hide GPS panel, capture sheet and status chip during drawing
  const isDrawing = Boolean(state.drawingMode);
  qs(".map-floating-bottom")?.classList.toggle("hidden", isDrawing);
  qs("#map-capture-sheet-root")?.classList.toggle("hidden", isDrawing);
  qs(".map-status-chip-host")?.classList.toggle("hidden", isDrawing || Boolean(state.draftCollar));
}

// ── Drawing panel drag state (MEJORA 1) ──────────────────────────────────
const _panelDrag = { active: false, el: null, startX: 0, startY: 0, initLeft: 0, initTop: 0 };

function attachDragToDrawingPanel() {
  const panel = qs(".map-drawing-topbar");
  if (!panel) return;
  const handle = panel.querySelector(".map-drawing-topbar__drag-handle") || panel;
  handle.addEventListener("mousedown", (e) => {
    const rect = panel.getBoundingClientRect();
    Object.assign(_panelDrag, { active: true, el: panel, startX: e.clientX, startY: e.clientY, initLeft: rect.left, initTop: rect.top });
    e.preventDefault();
  });
  handle.addEventListener("touchstart", (e) => {
    const rect = panel.getBoundingClientRect();
    panel.style.transition = "none";
    Object.assign(_panelDrag, { active: true, el: panel, startX: e.touches[0].clientX, startY: e.touches[0].clientY, initLeft: rect.left, initTop: rect.top });
  }, { passive: true });
}

function refreshMapCurrentLocationSummary() {
  const state = getDerivedState();
  if (state.route !== "mapa") {
    return;
  }

  const currentLocationSummary = qs("#map-current-location-summary");
  if (!currentLocationSummary) {
    return;
  }

  currentLocationSummary.classList.toggle("is-gps-active", state.captureMode === "gps");

  setHTML(currentLocationSummary, renderCurrentLocationSummary({
    captureMode: state.captureMode,
    gpsCapture: state.gpsCapture,
    currentLocation: state.currentLocation,
    hasActiveProject: Boolean(state.activeProject),
  }));
}

function refreshMapStatusChip() {
  const state = getDerivedState();
  if (state.route !== "mapa") {
    return;
  }

  const chipHost = qs(".map-status-chip-host");
  if (chipHost) {
    // BUG 3+4: hide chip during drawing mode or while collar form is open
    chipHost.classList.toggle("hidden", Boolean(state.drawingMode) || Boolean(state.draftCollar));
  }

  const statusChip = qs("#map-status-chip");
  if (!statusChip) {
    return;
  }

  setHTML(statusChip, renderMapStatusLabel({
    captureMode: state.captureMode,
    captureEnabled: getCaptureEnabled(),
    gpsCapture: state.gpsCapture,
    mapAvailable: state.mapReady,
    mapEngine: state.mapEngine,
    online: state.online,
  }));
}

function refreshMapProjectBanner() {
  const state = getDerivedState();
  if (state.route !== "mapa") {
    return;
  }

  const bannerRoot = qs("#map-project-banner");
  if (!bannerRoot) {
    return;
  }

  setHTML(bannerRoot, renderMapProjectBanner({
    activeProject: state.activeProject,
    activeProjectCollars: getVisibleMapCollars(state),
    mapEngine: state.mapEngine,
    online: state.online,
    mapFallbackMessage: state.mapFallbackMessage,
  }));
}

function refreshMapSearchBar(force = false) {
  const state = getDerivedState();
  if (state.route !== "mapa") {
    return;
  }

  const searchRoot = qs("#map-search-root");
  if (!searchRoot) {
    return;
  }

  if (!force && state.mapEngine === "arcgis") {
    return;
  }

  setHTML(searchRoot, renderMapSearchBar({ mapEngine: state.mapEngine }));
}

function refreshMapLayersPanel() {
  const state = getDerivedState();
  if (state.route !== "mapa") {
    return;
  }

  const layersRoot = qs("#map-layers-panel-root");
  if (!layersRoot) {
    return;
  }

  setHTML(layersRoot, renderMapLayersPanel({
    layersPanelOpen: state.layersPanelOpen,
    mapOverlays: state.mapOverlays,
  }));
}

function refreshMapImportModal() {
  const state = getDerivedState();
  if (state.route !== "mapa") {
    return;
  }

  const modalRoot = qs("#map-import-modal-root");
  if (!modalRoot) {
    return;
  }

  setHTML(modalRoot, renderImportDataModal({ importModalOpen: state.importModalOpen }));
}

function refreshFabMenu() {
  const state = getDerivedState();
  if (state.route !== "mapa") return;
  const fabRoot = qs("#map-fab-root");
  if (!fabRoot) return;
  // Re-render via full page rebuild — simpler since FAB is cheap
  const fabEl = qs(".map-fab-wrap", fabRoot);
  if (fabEl) {
    fabEl.innerHTML = "";
  }
  setHTML(fabRoot, renderMapFab({ fabMenuOpen: state.fabMenuOpen, drawingMode: state.drawingMode }));
}

function refreshDrawingOverlay() {
  const state = getDerivedState();
  if (state.route !== "mapa") return;
  const overlayRoot = qs("#map-drawing-overlay-root");
  if (!overlayRoot) return;
  // Inline rendering of drawing overlay
  const { drawingMode, drawingMeasurement } = state;
  if (!drawingMode) {
    overlayRoot.innerHTML = "";
    return;
  }
  const title = drawingMode === "area" ? "Creando área" : "Midiendo distancia";
  overlayRoot.innerHTML = `
    <div class="map-drawing-topbar">
      <span class="map-drawing-topbar__title">${title}</span>
      <button class="ghost-button ghost-button--compact" type="button" data-action="undo-drawing-vertex"><span>Deshacer</span></button>
      <button class="ghost-button ghost-button--compact" type="button" data-action="prompt-save-drawing"><span>Guardar</span></button>
      <button class="ghost-button ghost-button--compact ghost-button--danger" type="button" data-action="cancel-drawing"><span>Cancelar</span></button>
    </div>
    <div class="map-drawing-bottombar">
      <span id="map-drawing-measurement" class="muted" style="font-size:0.88rem">${drawingMeasurement || ""}</span>
      ${drawingMode === "line" ? `<button class="ghost-button ghost-button--compact" type="button" data-action="cycle-line-unit">Cambiar unidad</button>` : ""}
    </div>`;
}

function refreshDrawingSaveModal() {
  const state = getDerivedState();
  if (state.route !== "mapa") return;
  const modalRoot = qs("#map-drawing-modal-root");
  if (!modalRoot) return;
  renderCurrentPage(); // full re-render for modal since it has a form
}

function buildDrawingMeasurementLabel() {
  const m = getActiveMeasurements();
  const mode = getActiveDrawingMode();
  if (mode === "area") {
    return `Perímetro: ${m.perimeterM ? (m.perimeterM < 1000 ? `${Math.round(m.perimeterM)} m` : `${(m.perimeterM / 1000).toFixed(2)} km`) : "-"} · Área: ${m.areaHa ? `${m.areaHa.toFixed(3)} ha` : "-"}`;
  }
  if (mode === "line") {
    const dm = m.distanceM || 0;
    return formatActiveLineDistance(dm);
  }
  return "";
}

function refreshMapCaptureSheet() {
  const state = getDerivedState();
  if (state.route !== "mapa") {
    return;
  }

  const sheetRoot = qs("#map-capture-sheet-root");
  if (!sheetRoot) {
    return;
  }

  setHTML(sheetRoot, renderMapCaptureSheet({
    activeProject: state.activeProject,
    draftCollar: state.draftCollar,
    captureMode: state.captureMode,
  }));
}

function refreshSelectedMapCollarPanel() {
  const state = getDerivedState();
  if (state.route !== "mapa") {
    return;
  }

  const panelRoot = qs("#map-selected-collar-root");
  if (!panelRoot) {
    return;
  }

  setHTML(panelRoot, renderSelectedCollarPanel({
    selectedMapCollar: state.selectedMapCollar,
  }));
}

function refreshMapOverlayVisuals() {
  const state = getDerivedState();
  if (state.route !== "mapa") {
    return;
  }

  const cadastralGrid = qs("#map-cadastral-grid");
  if (cadastralGrid) {
    cadastralGrid.classList.toggle("is-active", Boolean(state.mapOverlays?.cadastralGrid));
  }

  const mapViewShell = qs("#map-view-shell");
  if (mapViewShell) {
    mapViewShell.classList.toggle("is-basemap-muted", !state.mapOverlays?.basemap);
  }
}

function refreshMapPanels() {
  refreshMapProjectBanner();
  refreshMapLayersPanel();
  refreshMapImportModal();
  refreshSelectedMapCollarPanel();
  refreshMapCaptureSheet();
  refreshMapOverlayVisuals();
}

async function handleOfflinePointSubmit(form) {
  const data = formToObject(form);
  const latitude = toNullableNumber(data.latitude);
  const longitude = toNullableNumber(data.longitude);
  const elevacion = toNullableNumber(data.elevacion);

  if (latitude == null || latitude < -90 || latitude > 90) {
    throw new Error("La latitud manual debe estar entre -90 y 90.");
  }

  if (longitude == null || longitude < -180 || longitude > 180) {
    throw new Error("La longitud manual debe estar entre -180 y 180.");
  }

  const draftCollar = await persistDraftCollar({
    latitude,
    longitude,
    elevacion,
    spatialReference: { wkid: 4326 },
  }, "manual");

  if (!draftCollar) {
    return;
  }

  if (store.getState().mapReady) {
    setActiveDraftPoint(draftCollar);
  }

  refreshMapDraftSummary();
  showToast(
    draftCollar.elevation_status === "pending"
      ? "Punto manual guardado. La elevacion queda pendiente hasta recuperar conexion."
      : "Punto manual guardado localmente como borrador.",
    "success",
    4200,
  );
}

function refreshMapGpsUi() {
  refreshMapToolbarSection();
  refreshMapCurrentLocationSummary();
  refreshMapStatusChip();
}

function handleGpsLocationUpdate(point) {
  const state = getDerivedState();
  if (state.captureMode !== "gps") {
    return;
  }

  store.setState({
    currentLocation: point,
    gpsCapture: {
      ...state.gpsCapture,
      navigationMode: "free",
      meanAccuracy: point.gps_accuracy_meters,
      bestAccuracy: point.gps_accuracy_meters,
      samplesCollected: 1,
      message: point.gps_accuracy_meters
        ? `GPS en navegacion libre. Precision actual: ${point.gps_accuracy_meters} m.`
        : "GPS en navegacion libre.",
    },
  });
  setActiveCurrentLocationPoint(point);
  refreshMapGpsUi();
}

function handleGpsNavigationError(error) {
  setActiveCurrentLocationPoint(null);
  store.setState({
    currentLocation: null,
    gpsCapture: createGpsCaptureState({
      navigationMode: "free",
      message: error.message || "No fue posible obtener la ubicacion GPS del dispositivo.",
    }),
  });
  refreshMapGpsUi();
  showToast(error.message || "No fue posible obtener la ubicacion GPS del dispositivo.", "error", 5200);
}

async function activateGpsFreeNavigation() {
  await startGpsNavigation({
    onLocation: handleGpsLocationUpdate,
    onError: handleGpsNavigationError,
    centerOnFirstFix: true,
  });
}

function activateMapInteractionMode({ captureEnabled = false } = {}) {
  const state = getDerivedState();

  setStoredCaptureMode("map");
  stopGpsNavigation({ clearGraphic: true });
  setMapCaptureEnabled(captureEnabled);
  store.setState({
    captureMode: "map",
    gpsCapture: createGpsCaptureState({
      navigationMode: "free",
      meanAccuracy: state.currentLocation?.gps_accuracy_meters ?? null,
      bestAccuracy: state.currentLocation?.gps_accuracy_meters ?? null,
      samplesCollected: state.currentLocation ? 1 : 0,
      message: state.currentLocation
        ? "Seleccion en mapa lista. Ultima ubicacion GPS disponible para referencia."
        : "Seleccion en mapa lista para usarse.",
    }),
  });
}

function refreshMapInteractionUi() {
  if (store.getState().route === "mapa") {
    refreshMapToolbarSection();
    refreshMapDraftSummary();
    refreshMapCurrentLocationSummary();
    refreshMapStatusChip();
    return;
  }

  renderCurrentPage();
}

function handleMapCollarSelection(collar) {
  const nextUuid = collar?.uuid || "";
  store.setState({ selectedMapCollarUuid: nextUuid });
  refreshSelectedMapCollarPanel();
  renderActiveMapCollars(getVisibleMapCollars(), {
    showLabels: Boolean(getDerivedState().mapOverlays?.labels),
    selectedUuid: nextUuid,
  });
}

function handleMapCapture(pointData) {
  const state = getDerivedState();
  if (state.captureMode !== "map") {
    return;
  }

  void persistDraftCollar(pointData, "map")
    .then((draftCollar) => {
      if (!draftCollar) {
        return;
      }

      store.setState({ selectedMapCollarUuid: "" });
      setActiveDraftPoint(draftCollar);
      refreshMapDraftSummary();
      refreshSelectedMapCollarPanel();
      showToast(
        draftCollar.elevation_status === "pending"
          ? "Punto capturado. La elevacion queda pendiente hasta recuperar conexion."
          : "Punto capturado en el mapa y guardado localmente como borrador.",
        "success",
      );
    })
    .catch((error) => {
      showToast(error.message || "No fue posible capturar el punto del mapa.", "error", 5200);
    });
}

async function mountMapPage() {
  const state = getDerivedState();
  const container = qs("#map-view");

  if (!container) {
    return;
  }

  let mapLoaded = false;

  if (state.online) {
    try {
      refreshMapSearchBar(true);
      await initMap(container, { onCapture: handleMapCapture, onSelectCollar: handleMapCollarSelection });
      mapLoaded = true;
      rememberArcGISCache();

      store.setState({
        mapReady: true,
        mapEngine: "arcgis",
        mapFallbackMessage: "",
      });
      refreshMapSearchBar();
    } catch (error) {
      const fallbackMessage = buildMapFallbackMessage(error, state.online);
      refreshMapSearchBar(true);
      await initOfflineMap(container, { onCapture: handleMapCapture, onSelectCollar: handleMapCollarSelection });
      mapLoaded = true;
      store.setState({ mapReady: true, mapEngine: "offline", mapFallbackMessage: fallbackMessage });
      refreshMapSearchBar(true);
      showToast(fallbackMessage, "error", 5200);
    }
  } else {
    const offlineMessage = await buildOfflineMapMessage();
    refreshMapSearchBar(true);
    await initOfflineMap(container, { onCapture: handleMapCapture, onSelectCollar: handleMapCollarSelection });
    mapLoaded = true;
    store.setState({ mapReady: true, mapEngine: "offline", mapFallbackMessage: offlineMessage });
    refreshMapSearchBar(true);
  }

  refreshMapToolbarSection();
  refreshMapStatusChip();
  refreshMapPanels();
  renderActiveMapCollars(getVisibleMapCollars(), {
    showLabels: Boolean(store.getState().mapOverlays?.labels),
    selectedUuid: store.getState().selectedMapCollarUuid,
  });
  if (isOfflineMapActive(store.getState())) {
    renderOfflineSavedItems(getDerivedState().guardados);
  }

  if (state.captureMode === "gps" && state.gpsCapture.navigationMode === "fixed") {
    setActiveCurrentLocationPoint(null);
  } else if (state.currentLocation) {
    setActiveCurrentLocationPoint(state.currentLocation);
  } else {
    setActiveCurrentLocationPoint(null);
  }

  if (state.draftCollar) {
    setActiveDraftPoint(state.draftCollar);
  } else {
    setActiveDraftPoint(null);
  }

  if (state.pendingFocusCollarUuid) {
    const collar = await getCollarByUuid(state.pendingFocusCollarUuid);
    await focusActiveCollar(collar);
    store.setState({ pendingFocusCollarUuid: "" });
  }

  if (state.pendingFocusGuardadoId) {
    const item = getDerivedState().guardados.find((g) => g.id === state.pendingFocusGuardadoId);
    if (item) {
      if (isOfflineMapActive(store.getState())) {
        await focusOfflineSavedItem(item).catch(() => {});
      } else {
        await highlightSavedItem(item).catch(() => {});
      }
    }
    store.setState({ pendingFocusGuardadoId: "" });
  }

  // BUG 1 fix: load all saved areas/lines as persistent graphics
  if (!isOfflineMapActive(store.getState())) {
    await loadAllSavedItemsOnMap(getDerivedState().guardados).catch(() => {});
  }

  if (state.captureMode === "gps" && state.gpsCapture.navigationMode === "free") {
    try {
      await activateGpsFreeNavigation();
    } catch (error) {
      handleGpsNavigationError(error);
    }
  } else {
    stopGpsNavigation({ clearGraphic: mapLoaded && !isOfflineMapActive(store.getState()) });
  }
}

async function handleRouteChange(route) {
  const state = getDerivedState();
  if (state.route === "mapa" && route !== "mapa") {
    stopGpsNavigation({ clearGraphic: true });
    if (state.drawingMode) {
      cancelActiveDrawing();
    }
  }
  if (state.route === "guardado" && route !== "guardado") {
    clearGuardadoDistInterval();
  }

  store.setState({ route, sidebarOpen: false, mobileDrawerOpen: false, layersPanelOpen: false, importModalOpen: false, fabMenuOpen: false, drawingMode: null, drawingSaveModalOpen: false, drawingMeasurement: "", guardadoDetailId: "", guardadoExportModalId: "" });
  refreshChrome();
  if (route === "laboratorio") {
    await cargarLaboratorios();
    return;
  }

  renderCurrentPage();
}

async function handleProjectSubmit(form) {
  const data = formToObject(form);

  if (data.uuid) {
    await updateProject(data.uuid, data);
    showToast("Proyecto actualizado localmente.", "success");
  } else {
    await createProject(data);
    showToast("Proyecto creado correctamente.", "success");
  }

  store.setState({ editingProjectUuid: "" });
  await rerenderAll();
  triggerAutoSyncAfterSave();
}

async function handleCollarSubmit(form) {
  const state = getDerivedState();
  const data = formToObject(form);
  const capturedPoint = state.editingCollar ? state.editingCollar : state.draftCollar;
  let savedCollar = null;

  if (!state.activeProject) {
    throw new Error("Debes seleccionar un proyecto activo antes de guardar collars.");
  }

  if (data.uuid) {
    savedCollar = await updateCollar(data.uuid, data, state.activeProject, capturedPoint);
    showToast("Collar actualizado localmente.", "success");
  } else {
    savedCollar = await createCollar(data, state.activeProject, capturedPoint);
    showToast("Collar registrado y agregado a la cola de sync.", "success");
  }

  store.setState({
    editingCollarUuid: "",
    draftCollar: null,
    selectedMapCollarUuid: "",
  });
  setStoredDraftCollar(null);

  if (!data.uuid && savedCollar?.uuid) {
    await loadAppData();
    store.setState({
      captureFlow: {
        active: true,
        step: "survey",
        collarUuid: savedCollar.uuid,
        holeId: "",
      },
    });
    refreshChrome();
    navigate("survey");
    triggerAutoSyncAfterSave();
    return;
  }

  await rerenderAll();
  triggerAutoSyncAfterSave();
}

async function handleSurveySubmit(form) {
  const state = getDerivedState();
  const data = formToObject(form);
  const isAutomaticFlow = state.captureFlow.active && state.captureFlow.step === "survey" && !data.uuid;

  if (data.uuid) {
    await updateSurvey(data.uuid, data, state.activeProjectCollars);
    showToast("Survey actualizado localmente.", "success");
  } else {
    await createSurvey(data, state.activeProjectCollars);
    showToast("Survey registrado correctamente.", "success");
  }

  store.setState({ editingSurveyUuid: "" });

  if (isAutomaticFlow) {
    await loadAppData();
    store.setState({
      captureFlow: {
        ...state.captureFlow,
        step: "assay",
      },
      selectedAssayCollarUuid: state.captureFlow.collarUuid,
    });
    refreshChrome();
    navigate("assay");
    triggerAutoSyncAfterSave();
    return;
  }

  await rerenderAll();
  triggerAutoSyncAfterSave();
}

async function handleAssaySubmit(form) {
  const state = getDerivedState();
  const data = formToObject(form);
  const isAutomaticFlow = state.captureFlow.active && state.captureFlow.step === "assay" && !data.uuid;
  let savedAssay = null;

  if (data.uuid) {
    savedAssay = await updateAssay(data.uuid, data, state.activeProjectCollars);
    showToast("Assay actualizado localmente.", "success");
  } else {
    savedAssay = await createAssay(data, state.activeProjectCollars);
    showToast(isAutomaticFlow ? "Registro completo." : "Assay registrado correctamente.", "success");
  }

  if (!data.uuid && savedAssay) {
    const linkedCollar = state.activeProjectCollars.find((collar) => collar.uuid === savedAssay.collar_uuid);
    await queueLaboratorioSurvey123Sync(savedAssay, linkedCollar);
  }

  store.setState({ editingAssayUuid: "", selectedAssayCollarUuid: savedAssay?.collar_uuid || data.collar_uuid || "" });
  await rerenderAll();

  if (isAutomaticFlow) {
    navigate("assay");
  }

  triggerAutoSyncAfterSave();
}

async function handleSurveyCsvImport(file) {
  const state = getDerivedState();

  if (!state.activeProject) {
    throw new Error("Debes seleccionar un proyecto activo antes de importar survey desde CSV.");
  }

  const importedCount = await importSurveysFromCsv(await file.text(), state.activeProjectCollars);
  store.setState({ editingSurveyUuid: "" });
  await rerenderAll();
  triggerAutoSyncAfterSave();

  showToast(`${importedCount} survey importados desde CSV.`, "success", 5200);
}

async function handleAssayCsvImport(file) {
  const state = getDerivedState();

  if (!state.activeProject) {
    throw new Error("Debes seleccionar un proyecto activo antes de importar assay desde CSV.");
  }

  const importedCount = await importAssaysFromCsv(await file.text(), state.activeProjectCollars);
  store.setState({ editingAssayUuid: "" });
  await rerenderAll();
  triggerAutoSyncAfterSave();

  showToast(`${importedCount} assay importados desde CSV.`, "success", 5200);
}

async function handleLaboratorioSubmit(form) {
  const state = getDerivedState();
  const data = formToObject(form);

  if (data.uuid) {
    await updateLaboratorio(data.uuid, data, state.activeProjectAssays);
    showToast("Laboratorio actualizado localmente.", "success");
  } else {
    await createLaboratorio(data, state.activeProjectAssays);
    showToast("Laboratorio registrado correctamente.", "success");
  }

  store.setState({ editingLaboratorioUuid: "" });
  await rerenderAll();
  triggerAutoSyncAfterSave();
}

function shouldAutoSyncAfterSave() {
  return store.getState().online && appConfig.sync.enabled && appConfig.sync.autoSyncAfterSave;
}

function triggerAutoSyncAfterSave() {
  if (!shouldAutoSyncAfterSave()) {
    return;
  }

  void runSync("auto-save").catch((error) => {
    console.warn("No se pudo completar la sincronizacion automatica despues del guardado:", error);
  });
}

async function queueLaboratorioSurvey123Sync(savedAssay, linkedCollar) {
  if (!savedAssay || !linkedCollar) {
    return;
  }

  try {
    await enqueueLaboratorioSurvey123Submission(savedAssay, linkedCollar);
    showToast("Respuesta de Survey123 en cola para sincronizar.", "info", 4200);

    void syncLaboratorioSurvey123Submissions("upsert")
      .then((summary) => {
        if (summary.synced) {
          showToast("Respuesta de Survey123 creada con los datos del assay.", "success");
        } else if (summary.errors) {
          showToast("La respuesta de Survey123 quedo en cola con error. Revisa Sincronizacion.", "warning", 5200);
        }
      })
      .catch((error) => {
        console.warn("Error sincronizando Survey123 en segundo plano:", error);
      });
  } catch (error) {
    console.error("Error preparando Survey123:", error);
    showToast(error.message || "No se pudo preparar la respuesta Survey123.", "warning", 5200);
  }
}

async function runSync(trigger = "manual") {
  if (!store.getState().online) {
    // Sin conexion: registrar Background Sync para cuando vuelva la red
    if ("serviceWorker" in navigator && "SyncManager" in window) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register("sync-collars");
        showToast("Sin conexion. La sincronizacion se ejecutara automaticamente al recuperar internet.", "info", 4800);
      } catch {
        showToast("Sin conexion. La sincronizacion se ejecutara cuando vuelvas a estar online.", "info", 4800);
      }
    } else {
      showToast("Sin conexion. La sincronizacion se ejecutara cuando vuelvas a estar online.", "info", 4800);
    }

    return;
  }

  const messages = {
    auto: "Auto sync al recuperar conexion.",
    "auto-save": "Sincronizacion automatica despues del guardado.",
    manual: "Sincronizacion manual en progreso.",
  };
  store.setState({ isSyncing: true, syncMessage: messages[trigger] || messages.manual });
  refreshChrome();
  mostrarSincronizando();
  if (!shouldPreserveOpenForm()) {
    renderCurrentPage();
  }

  try {
    let elevationSummary = {
      attempted: 0,
      resolved: 0,
      pending: 0,
      errors: 0,
      skipped: 0,
    };

    if (store.getState().online && appConfig.elevation.enabled && appConfig.elevation.autoResolveOnReconnect) {
      await reconcileDraftElevationIfNeeded(true);
      elevationSummary = await resolvePendingCollarElevations({ online: true });
    }

    const summary = await syncAll();
    const nextSyncQueue = await listSyncQueue();
    const elevationMessage = elevationSummary.attempted
      ? ` Elevaciones resueltas: ${elevationSummary.resolved}. Pendientes: ${elevationSummary.pending}. Errores elevacion: ${elevationSummary.errors}.`
      : "";
    const errorPreview = buildSyncErrorPreview(nextSyncQueue);
    store.setState({ syncMessage: `${summary.message} Sincronizados: ${summary.synced}. Errores: ${summary.errors}. Omitidos: ${summary.skipped}.${elevationMessage}${errorPreview}`, syncQueue: nextSyncQueue });
    showToast(store.getState().syncMessage, summary.errors || elevationSummary.errors ? "error" : "success", 4800);
  } finally {
    store.setState({ isSyncing: false });
    ocultarSincronizando();
    await refreshAfterBackgroundWork();
  }
}

function confirmNative(title, description) {
  return window.confirm([title, description].filter(Boolean).join("\n\n"));
}

// ── GPS distance/bearing live update for guardado foto detail ──────────────
let _guardadoDistInterval = null;

function clearGuardadoDistInterval() {
  if (_guardadoDistInterval) {
    clearInterval(_guardadoDistInterval);
    _guardadoDistInterval = null;
  }
}

function startGuardadoDistUpdate(item) {
  clearGuardadoDistInterval();
  if (item?.tipo !== "foto" || !item.lat || !item.lon) return;
  _guardadoDistInterval = setInterval(() => {
    const gps = getDerivedState().currentLocation;
    const el = document.querySelector("#guardado-dist-rumbo");
    if (!el) { clearGuardadoDistInterval(); return; }
    if (!gps) { el.textContent = "GPS no disponible"; return; }
    const R = 6371000;
    const dL = (item.lat - gps.latitude) * Math.PI / 180;
    const dO = (item.lon - gps.longitude) * Math.PI / 180;
    const a = Math.sin(dL / 2) ** 2 + Math.cos(gps.latitude * Math.PI / 180) * Math.cos(item.lat * Math.PI / 180) * Math.sin(dO / 2) ** 2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const dOr = (item.lon - gps.longitude) * Math.PI / 180;
    const bearing = ((Math.atan2(
      Math.sin(dOr) * Math.cos(item.lat * Math.PI / 180),
      Math.cos(gps.latitude * Math.PI / 180) * Math.sin(item.lat * Math.PI / 180)
        - Math.sin(gps.latitude * Math.PI / 180) * Math.cos(item.lat * Math.PI / 180) * Math.cos(dOr),
    ) * 180 / Math.PI) + 360) % 360;
    const distStr = dist >= 1000 ? `${(dist / 1000).toFixed(2)} km` : `${Math.round(dist)} m`;
    el.textContent = `📍 ${distStr} · 🧭 ${bearing.toFixed(0)}°`;
  }, 3000);
}

async function handleAction(action, source) {
  const state = getDerivedState();
  const uuid = source.dataset.uuid || "";

  switch (action) {
    case "step-number":
      stepNumberInput(source);
      break;
    case "toggle-sidebar":
      setSidebarOpen(!state.mobileDrawerOpen);
      break;
    case "toggle-mobile-drawer":
      store.setState({ mobileDrawerOpen: !state.mobileDrawerOpen });
      refreshChrome();
      break;
    case "close-mobile-drawer":
      store.setState({ mobileDrawerOpen: false });
      refreshChrome();
      break;
    case "cerrar-sesion":
      if (confirmNative("Cerrar sesion", "¿Quieres cerrar la sesion actual?")) {
        await cerrarSesion();
      }
      break;
    case "select-project":
      await selectActiveProject(uuid);
      if (state.captureMode === "map") {
        setMapCaptureEnabled(false);
      }
      store.setState({ editingProjectUuid: "", editingCollarUuid: "", editingSurveyUuid: "", editingAssayUuid: "", editingLaboratorioUuid: "", captureFlow: { active: false, step: "", collarUuid: "", holeId: "" } });
      await rerenderAll();
      showToast("Proyecto activo actualizado.", "success");
      break;
    case "edit-project":
      store.setState({ editingProjectUuid: uuid });
      renderCurrentPage();
      break;
    case "reset-project-form":
      store.setState({ editingProjectUuid: "" });
      renderCurrentPage();
      break;
    case "remove-project": {
      const confirmed = confirmNative(
        "Eliminar proyecto",
        "Se eliminara el proyecto en cascada junto con sus collars, surveys, assays y laboratorios vinculados.",
      );

      if (!confirmed) {
        return;
      }

      const result = await deleteOrDeactivateProject(uuid);
      await rerenderAll();
      triggerAutoSyncAfterSave();
      showToast("Proyecto eliminado correctamente.", "success");
      break;
    }
    case "go-to-map":
      navigate("mapa");
      break;
    case "dismiss-draft-hint":
      store.setState({ mapDraftHintDismissed: true });
      setStoredDraftHintDismissed(true);
      refreshMapDraftSummary();
      break;
    case "clear-draft-collar":
      store.setState({ draftCollar: null, editingCollarUuid: "", pendingFocusCollarUuid: "", gpsCapture: createGpsCaptureState(), selectedMapCollarUuid: "" });
      setStoredDraftCollar(null);
      setActiveDraftPoint(null);
      if (store.getState().route === "mapa") {
        refreshMapDraftSummary();
        refreshMapGpsUi();
        refreshSelectedMapCollarPanel();
      } else {
        renderCurrentPage();
      }
      break;
    case "edit-collar":
      store.setState({ editingCollarUuid: uuid });
      if (store.getState().route === "collars") {
        renderCurrentPage();
      } else {
        navigate("collars");
      }
      break;
    case "reset-collar-form":
      store.setState({ editingCollarUuid: "", pendingFocusCollarUuid: "" });
      renderCurrentPage();
      break;
    case "edit-survey":
      store.setState({ editingSurveyUuid: uuid });
      if (store.getState().route === "survey") {
        renderCurrentPage();
      } else {
        navigate("survey");
      }
      break;
    case "reset-survey-form":
      store.setState({ editingSurveyUuid: "" });
      renderCurrentPage();
      break;
    case "skip-capture-flow-step": {
      const flow = store.getState().captureFlow;
      if (!flow.active) {
        return;
      }

      if (flow.step === "survey") {
        store.setState({ captureFlow: { ...flow, step: "assay" }, editingSurveyUuid: "", selectedAssayCollarUuid: flow.collarUuid });
        refreshChrome();
        navigate("assay");
        break;
      }

      if (flow.step === "assay") {
        clearCaptureFlow();
        store.setState({ editingAssayUuid: "" });
        showToast("Registro completado.", "success", 3600);
        navigate("mapa");
      }
      break;
    }
    case "cancel-capture-flow":
      clearCaptureFlow();
      store.setState({
        editingSurveyUuid: "",
        editingAssayUuid: "",
        selectedAssayCollarUuid: "",
      });
      showToast("Flujo de registro cancelado.", "info", 3200);
      if (store.getState().route === "survey" || store.getState().route === "assay") {
        navigate("mapa");
      } else {
        refreshChrome();
        renderCurrentPage();
      }
      break;
    case "finish-assay-samples":
      clearCaptureFlow();
      store.setState({
        editingAssayUuid: "",
        selectedAssayCollarUuid: "",
      });
      await rerenderAll();
      showToast("Registro de muestras finalizado.", "success", 3200);
      navigate("mapa");
      break;
    case "import-survey-csv":
      qs("#survey-csv-input")?.click();
      break;
    case "remove-survey": {
      const confirmed = confirmNative(
        "Eliminar survey",
        "Se eliminara localmente y, si ya existe en ArcGIS, se enviara la eliminacion remota.",
      );

      if (!confirmed) {
        return;
      }

      await deleteSurvey(uuid);
      store.setState({ editingSurveyUuid: "" });
      await rerenderAll();
      triggerAutoSyncAfterSave();
      showToast("Survey eliminado correctamente.", "success");
      break;
    }
    case "edit-assay":
      store.setState({ editingAssayUuid: uuid });
      if (store.getState().route === "assay") {
        renderCurrentPage();
      } else {
        navigate("assay");
      }
      break;
    case "reset-assay-form":
      store.setState({ editingAssayUuid: "" });
      renderCurrentPage();
      break;
    case "import-assay-csv":
      qs("#assay-csv-input")?.click();
      break;
    case "remove-assay": {
      const confirmed = confirmNative(
        "Eliminar assay",
        "Se eliminara localmente y, si ya existe en ArcGIS, se enviara la eliminacion remota.",
      );

      if (!confirmed) {
        return;
      }

      await deleteAssay(uuid);
      store.setState({ editingAssayUuid: "" });
      await rerenderAll();
      triggerAutoSyncAfterSave();
      showToast("Assay eliminado correctamente.", "success");
      break;
    }
    case "edit-laboratorio":
      store.setState({ editingLaboratorioUuid: uuid });
      if (store.getState().route === "laboratorio") {
        renderCurrentPage();
      } else {
        navigate("laboratorio");
      }
      break;
    case "reset-laboratorio-form":
      store.setState({ editingLaboratorioUuid: "" });
      renderCurrentPage();
      break;
    case "sync-laboratorio":
      if (!navigator.onLine) {
        showToast("Sin conexion", "warning");
        return;
      }

      showToast("Sincronizando con Survey123...", "info");
      await cargarLaboratorios();
      showToast("Laboratorio actualizado", "success");
      break;
    case "remove-laboratorio": {
      const confirmed = confirmNative(
        "Eliminar laboratorio",
        "Se eliminara localmente y, si ya existe en ArcGIS, se enviara la eliminacion remota.",
      );

      if (!confirmed) {
        return;
      }

      await deleteLaboratorio(uuid);
      store.setState({ editingLaboratorioUuid: "" });
      await rerenderAll();
      triggerAutoSyncAfterSave();
      showToast("Registro de laboratorio eliminado correctamente.", "success");
      break;
    }
    case "remove-collar": {
      const confirmed = confirmNative(
        "Eliminar collar",
        "Se eliminara localmente y, si ya existe en ArcGIS, tambien se enviara la eliminacion remota.",
      );

      if (!confirmed) {
        return;
      }

      await deleteCollar(uuid);
      store.setState({ editingCollarUuid: "", draftCollar: null, pendingFocusCollarUuid: "", selectedMapCollarUuid: "" });
      setStoredDraftCollar(null);
      await rerenderAll();
      triggerAutoSyncAfterSave();
      showToast("Collar eliminado correctamente.", "success");
      break;
    }
    case "focus-collar": {
      store.setState({ pendingFocusCollarUuid: uuid });

      if (store.getState().route !== "mapa") {
        navigate("mapa");
      } else {
        const collar = await getCollarByUuid(uuid);
        await focusActiveCollar(collar);
        store.setState({ pendingFocusCollarUuid: "" });
        handleMapCollarSelection(collar);
      }
      break;
    }
    case "set-capture-mode": {
      const nextMode = source.dataset.mode === "gps" ? "gps" : "map";
      if (nextMode === "map") {
        activateMapInteractionMode({ captureEnabled: false });
      } else {
        setStoredCaptureMode(nextMode);
        setMapCaptureEnabled(false);
        store.setState({
          captureMode: nextMode,
          gpsCapture: createGpsCaptureState({
            navigationMode: "free",
            meanAccuracy: state.currentLocation?.gps_accuracy_meters ?? null,
            bestAccuracy: state.currentLocation?.gps_accuracy_meters ?? null,
            message: "GPS en navegacion libre.",
          }),
        });
      }

      refreshMapInteractionUi();
      showToast(nextMode === "gps" ? "Modo GPS activado." : "Modo mapa activado.", "success");
      break;
    }
    case "activate-map-navigation":
      activateMapInteractionMode({ captureEnabled: false });
      refreshMapInteractionUi();
      break;
    case "activate-map-capture":
      if (!state.activeProject) {
        throw new Error("Debes seleccionar un proyecto activo antes de activar la captura sobre el mapa.");
      }

      if (!state.mapReady) {
        throw new Error("El mapa base no esta disponible. Usa GPS o coordenadas manuales mientras no haya mapa.");
      }

      activateMapInteractionMode({ captureEnabled: true });
      refreshMapInteractionUi();
      break;
    case "activate-gps-mode":
      if (state.captureMode !== "gps") {
        setStoredCaptureMode("gps");
        store.setState({
          captureMode: "gps",
          gpsCapture: createGpsCaptureState({
            navigationMode: "free",
            meanAccuracy: state.currentLocation?.gps_accuracy_meters ?? null,
            bestAccuracy: state.currentLocation?.gps_accuracy_meters ?? null,
            message: "GPS en navegacion libre.",
          }),
        });
      }
      refreshMapToolbarSection();
      // Centrar inmediatamente en la ultima posicion GPS conocida mientras llega el primer fix
      if (state.currentLocation) {
        await focusCollar(state.currentLocation).catch(() => {});
      }
      await activateGpsFreeNavigation();
      refreshMapGpsUi();
      break;
    case "toggle-capture":
      if (state.captureMode !== "map") {
        return;
      }

      if (!state.mapReady) {
        throw new Error("El mapa base no esta disponible. Usa GPS o coordenadas manuales mientras no haya mapa.");
      }

      setMapCaptureEnabled(!getCaptureEnabled());
      refreshMapToolbarSection();
      refreshMapStatusChip();
      break;
    case "map-zoom-in":
      if (isOfflineMapActive()) {
        adjustOfflineMapZoom(1);
      } else {
        await adjustMapZoom(1);
      }
      break;
    case "map-zoom-out":
      if (isOfflineMapActive()) {
        adjustOfflineMapZoom(-1);
      } else {
        await adjustMapZoom(-1);
      }
      break;
    case "map-reset-north":
      if (isOfflineMapActive()) {
        resetOfflineMapNorth();
      } else {
        await resetMapNorth();
      }
      break;
    case "toggle-map-perspective":
      showToast(
        state.mapEngine === "arcgis"
          ? "La escena 3D no esta habilitada en este WebMap. Se mantiene la vista 2D operativa."
          : "La vista 3D no esta disponible en el mapa offline local.",
        "success",
        3600,
      );
      break;
    case "toggle-layers-panel":
      store.setState({ layersPanelOpen: !state.layersPanelOpen, importModalOpen: false });
      refreshMapToolbarSection();
      refreshMapLayersPanel();

      // Actualizar indicador de almacenamiento cuando se abre el panel
      if (store.getState().layersPanelOpen && navigator.storage?.estimate) {
        navigator.storage.estimate().then((estimate) => {
          const usedMb = ((estimate.usage || 0) / 1048576).toFixed(1);
          const quotaMb = ((estimate.quota || 0) / 1048576).toFixed(0);
          const estimateEl = document.querySelector("#tile-storage-estimate");
          if (estimateEl) {
            estimateEl.textContent = `Almacenamiento usado: ${usedMb} MB / ${quotaMb} MB`;
          }
        }).catch(() => {});
      }

      break;
    case "toggle-map-overlay": {
      const overlayKey = source.dataset.overlay || "";
      if (!Object.hasOwn(state.mapOverlays, overlayKey)) {
        return;
      }

      const nextOverlays = {
        ...state.mapOverlays,
        [overlayKey]: !state.mapOverlays[overlayKey],
      };

      store.setState({
        mapOverlays: nextOverlays,
        selectedMapCollarUuid: overlayKey === "collars" && !nextOverlays.collars ? "" : state.selectedMapCollarUuid,
      });
      refreshMapLayersPanel();
      refreshMapOverlayVisuals();
      refreshMapProjectBanner();
      refreshSelectedMapCollarPanel();
      renderActiveMapCollars(getVisibleMapCollars(getDerivedState()), {
        showLabels: Boolean(nextOverlays.labels),
        selectedUuid: getDerivedState().selectedMapCollarUuid,
      });
      break;
    }
    case "open-import-modal":
      store.setState({ importModalOpen: true, layersPanelOpen: false });
      refreshMapToolbarSection();
      refreshMapLayersPanel();
      refreshMapImportModal();
      break;
    case "close-import-modal":
      store.setState({ importModalOpen: false });
      refreshMapImportModal();
      break;
    case "select-import-files":
      qs("#map-import-file-input")?.click();
      break;
    case "clear-selected-map-collar":
      handleMapCollarSelection(null);
      break;
    case "gps-free-navigation":
      if (state.captureMode !== "gps") {
        return;
      }

      store.setState({
        gpsCapture: createGpsCaptureState({
          navigationMode: "free",
          meanAccuracy: state.currentLocation?.gps_accuracy_meters ?? null,
          bestAccuracy: state.currentLocation?.gps_accuracy_meters ?? null,
          message: "GPS en navegacion libre.",
        }),
      });
      await activateGpsFreeNavigation();
      refreshMapGpsUi();
      break;
    case "gps-fix-point": {
      if (state.captureMode !== "gps") {
        return;
      }

      if (!state.activeProject) {
        throw new Error("Debes seleccionar un proyecto activo antes de fijar un collar por GPS.");
      }

      if (!state.currentLocation) {
        throw new Error("Espera a que el GPS obtenga una ubicacion valida antes de fijar el punto.");
      }

      stopGpsNavigation({ clearGraphic: true });
      const draftCollar = await persistDraftCollar(state.currentLocation, "gps");
      if (!draftCollar) {
        return;
      }

      store.setState({
        gpsCapture: createGpsCaptureState({
          navigationMode: "fixed",
          meanAccuracy: state.currentLocation.gps_accuracy_meters,
          bestAccuracy: state.currentLocation.gps_accuracy_meters,
          samplesCollected: 1,
          message: "Punto GPS fijado y listo para guardarse.",
        }),
      });
      setActiveDraftPoint(draftCollar);
      refreshMapDraftSummary();
      refreshMapGpsUi();
      showToast(
        draftCollar.elevation_status === "pending"
          ? `Punto GPS fijado. Precision actual: ${state.currentLocation.gps_accuracy_meters || "-"} m. La elevacion se resolvera al volver online.`
          : `Punto GPS fijado. Precision actual: ${state.currentLocation.gps_accuracy_meters || "-"} m. Elevacion ${getElevationStateLabel(draftCollar)}.`,
        "success",
        5200,
      );
      break;
    }
    case "sync-now":
      await runSync("manual");
      break;
    case "retry-map-load":
      if (!store.getState().online) {
        throw new Error("No puedes recargar el mapa mientras el dispositivo sigue offline.");
      }

      store.setState({ mapReady: true, mapFallbackMessage: "" });
      refreshMapToolbarSection();
      refreshMapStatusChip();
      await mountMapPage();
      break;
    case "download-arcgis": {
      const summary = await bootstrapArcGISData();
      await rerenderAll();
      showToast(summary.message, summary.skipped ? "error" : "success", 5200);
      break;
    }
    case "download-offline-tiles": {
      if (isOfflineMapActive()) {
        showToast("La descarga de tiles solo esta disponible con el mapa ArcGIS activo.", "error", 4200);
        break;
      }

      const progressEl = document.querySelector("#tile-download-progress");
      const statusEl = document.querySelector("#tile-download-status");
      const btnEl = source;
      const view = getMapView();

      if (!view?.extent) {
        showToast("No se pudo leer la zona visible del mapa actual.", "error", 4800);
        break;
      }

      if (progressEl) {
        progressEl.classList.remove("hidden");
        progressEl.value = 0;
        progressEl.max = 100;
      }

      if (statusEl) {
        statusEl.classList.remove("hidden");
        statusEl.textContent = "Calculando tiles...";
      }

      if (btnEl) {
        btnEl.disabled = true;
      }

      let summary = null;
      try {
        summary = await downloadVisibleArea(view, {
          projectId: state.activeProject?.uuid || "",
          onCalculated: ({ total }) => {
            if (statusEl) {
              statusEl.textContent = `${total} tiles calculados. Esperando confirmacion...`;
            }
            return confirmNative("Descargar mapa offline", `Se guardaran aproximadamente ${total} tiles en IndexedDB para la zona visible.`);
          },
          onProgress: ({ processed, downloaded, skipped, errors, blocked, invalid, total }) => {
            if (progressEl) {
              progressEl.max = total;
              progressEl.value = processed;
            }
            if (statusEl) {
              statusEl.textContent = `${processed} de ${total} tiles procesados - ${downloaded} nuevos - ${skipped} existentes${errors ? ` - ${errors} errores` : ""}${blocked ? ` - ${blocked} bloqueados` : ""}${invalid ? ` - ${invalid} invalidos` : ""}`;
            }
          },
        });
      } catch (error) {
        if (progressEl) {
          progressEl.classList.add("hidden");
        }
        if (statusEl) {
          statusEl.classList.remove("hidden");
          statusEl.textContent = error.message || "No se pudo descargar el mapa offline.";
        }
        showToast(error.message || "No se pudo descargar el mapa offline.", "error", 5200);
        break;
      } finally {
        if (btnEl) {
          btnEl.disabled = false;
        }
      }

      if (progressEl) {
        progressEl.classList.add("hidden");
      }

      if (summary?.cancelled) {
        if (statusEl) {
          statusEl.textContent = "Descarga cancelada.";
        }
        break;
      }

      showToast(
        summary?.blocked
          ? summary.lastErrorMessage || "MapTiler rechazo la peticion. Revisa el status en consola."
          : summary?.errors
            ? summary.lastErrorMessage || "Error al descargar tile. Revisa la consola para ver el status real de MapTiler."
            : "Mapa offline descargado correctamente.",
        summary?.blocked || (summary?.errors && summary?.downloaded === 0) ? "error" : "success",
        5200,
      );

      if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        const usedMb = ((estimate.usage || 0) / 1048576).toFixed(1);
        const quotaMb = ((estimate.quota || 0) / 1048576).toFixed(0);
        const estimateEl = document.querySelector("#tile-storage-estimate");
        if (estimateEl) {
          estimateEl.textContent = `Almacenamiento usado: ${usedMb} MB / ${quotaMb} MB`;
        }
      }

      break;
    }
    case "clear-invalid-tiles": {
      const result = await clearInvalidTiles("");
      showToast(`Tiles invalidos eliminados: ${result.removed}. Restantes: ${result.remaining}.`, "success", 4200);
      const output = qs("#pwa-diagnostics-output");
      if (output) {
        output.classList.remove("hidden");
        output.textContent = JSON.stringify(result, null, 2);
      }
      break;
    }
    case "show-pwa-diagnostics": {
      const diagnostics = await getOfflineMapDiagnostics({
        mapEngine: state.mapEngine,
        online: state.online,
      });
      const output = qs("#pwa-diagnostics-output");
      if (output) {
        output.classList.remove("hidden");
        output.textContent = JSON.stringify(diagnostics, null, 2);
      }
      console.log("[pwa-diagnostics]", diagnostics);
      break;
    }
    case "force-app-update": {
      if (navigator.serviceWorker) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }

      if (window.caches) {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));
      }

      showToast("Cache de app eliminado. Recargando...", "success", 1800);
      window.setTimeout(() => window.location.reload(), 500);
      break;
    }
    case "clear-tile-cache": {
      await clearOfflineMap();
      showToast("Mapa offline eliminado de IndexedDB.", "success", 3200);

      if (navigator.storage?.estimate) {
        const estimate = await navigator.storage.estimate();
        const usedMb = ((estimate.usage || 0) / 1048576).toFixed(1);
        const quotaMb = ((estimate.quota || 0) / 1048576).toFixed(0);
        const estimateEl = document.querySelector("#tile-storage-estimate");
        if (estimateEl) {
          estimateEl.textContent = `Almacenamiento usado: ${usedMb} MB / ${quotaMb} MB`;
        }
      }

      break;
    }
    case "export-backup":
      await exportBackup();
      showToast("Respaldo JSON exportado correctamente.", "success");
      break;
    case "import-backup": {
      const input = qs("#backup-file-input");
      input?.click();
      break;
    }
    case "install-app": {
      const promptEvent = store.getState().deferredPrompt;
      if (!promptEvent) {
        showToast("Si no aparece el instalador, abre el menu del navegador y usa Instalar app o Agregar a pantalla principal. Verifica que el sitio este en HTTPS y que no este ya instalado.", "info", 7000);
        return;
      }

      promptEvent.prompt();
      await promptEvent.userChoice;
      store.setState({ deferredPrompt: null });
      refreshChrome();
      break;
    }
    case "toggle-toolbar-collapse":
      toggleToolbarExpanded();
      refreshMapToolbarSection();
      break;
    case "toggle-fab-menu":
      store.setState({ fabMenuOpen: !state.fabMenuOpen });
      refreshMapDrawingSection();
      break;
    case "start-draw-area":
    case "start-draw-line": {
      const drawMode = action === "start-draw-area" ? "area" : "line";
      if (!state.mapReady) {
        throw new Error("Espera a que el mapa termine de cargar.");
      }
      const onVertex = () => {
        const label = buildDrawingMeasurementLabel();
        store.setState({ drawingMeasurement: label });
        const el = qs("#map-drawing-measurement");
        if (el) el.textContent = label;
      };
      if (isOfflineMapActive()) {
        await startOfflineDrawingMode(drawMode, { onVertex });
      } else {
        await startDrawingMode(drawMode, { onVertex });
      }
      store.setState({ drawingMode: drawMode, fabMenuOpen: false, drawingMeasurement: "" });
      refreshMapDrawingSection();
      break;
    }
    case "cancel-drawing":
      cancelActiveDrawing();
      store.setState({ drawingMode: null, drawingSaveModalOpen: false, drawingMeasurement: "", fabMenuOpen: false, editingAreaId: "", editingAreaFecha: "" });
      refreshMapDrawingSection();
      break;
    case "undo-drawing-vertex":
      if (isOfflineMapActive()) {
        await undoOfflineLastVertex();
      } else {
        await undoLastVertex();
      }
      {
        const label = buildDrawingMeasurementLabel();
        store.setState({ drawingMeasurement: label });
        const el = qs("#map-drawing-measurement");
        if (el) el.textContent = label;
      }
      break;
    case "prompt-save-drawing": {
      const drawingState = getActiveDrawingState();
      const minVerts = drawingState.mode === "area" ? 3 : 2;
      if (drawingState.vertices.length < minVerts) {
        throw new Error(`Necesitas al menos ${minVerts} puntos para guardar.`);
      }
      store.setState({ drawingSaveModalOpen: true });
      refreshMapDrawingSection();
      break;
    }
    case "close-drawing-save-modal":
      store.setState({ drawingSaveModalOpen: false });
      refreshMapDrawingSection();
      break;
    case "select-drawing-color": {
      const color = source.dataset.color || "#2d5a27";
      const colorInput = qs("#drawing-color-value");
      if (colorInput) colorInput.value = color;
      // Update swatch active state
      qs("#drawing-color-swatches")?.querySelectorAll(".color-swatch").forEach((el) => {
        el.classList.toggle("is-active", el.dataset.color === color);
      });
      break;
    }
    case "cycle-line-unit": {
      const newUnit = isOfflineMapActive() ? cycleOfflineLineUnit() : cycleLineUnit();
      const m = getActiveMeasurements();
      const label = formatActiveLineDistance(m.distanceM || 0, newUnit);
      store.setState({ drawingMeasurement: label });
      const el = qs("#map-drawing-measurement");
      if (el) el.textContent = label;
      break;
    }
    case "cycle-editor-mode": {
      // MEJORA 2: cycle through draw/edit/delete modes
      cycleEditorMode();
      refreshMapDrawingSection();
      break;
    }
    case "change-guardado-color": {
      // MEJORA 3: update saved area color in DB and on map
      const itemId = source.dataset.id || "";
      const color = source.dataset.color || "#2d5a27";
      const itemForColor = getDerivedState().guardados.find((g) => g.id === itemId);
      if (!itemForColor || itemForColor.tipo !== "area") return;
      const updatedColor = { ...itemForColor, color };
      await saveGuardado(updatedColor);
      const guardadosAfterColor = await listGuardado();
      if (isOfflineMapActive()) {
        renderOfflineSavedItems(guardadosAfterColor);
      } else {
        updateSavedItemColor(itemId, color);
      }
      store.setState({ guardados: guardadosAfterColor });
      renderCurrentPage();
      break;
    }
    case "capture-photo":
      store.setState({ fabMenuOpen: false });
      qs("#map-camera-input")?.click();
      break;
    case "view-guardado": {
      const itemId = source.dataset.id || "";
      const item = getDerivedState().guardados.find((g) => g.id === itemId);
      if (!item) return;
      store.setState({ guardadoDetailId: itemId, guardadoExportModalId: "" });
      renderCurrentPage();
      startGuardadoDistUpdate(item);
      break;
    }
    case "delete-guardado": {
      const itemId = source.dataset.id || "";
      if (!itemId) return;
      const confirmed = confirmNative("Eliminar elemento", "Se eliminará este elemento guardado.");
      if (!confirmed) return;
      clearGuardadoDistInterval();
      await deleteGuardadoById(itemId);
      removeSavedItemFromMap(itemId);
      const guardados = await listGuardado();
      if (isOfflineMapActive()) {
        renderOfflineSavedItems(guardados);
      }
      store.setState({ guardados, guardadoDetailId: "", guardadoExportModalId: "" });
      renderCurrentPage();
      break;
    }
    case "clear-all-guardado": {
      const confirmed = confirmNative("Eliminar todo", "Se eliminarán todos los elementos guardados.");
      if (!confirmed) return;
      clearGuardadoDistInterval();
      await clearAllGuardado();
      await loadAllSavedItemsOnMap([]).catch(() => {});
      if (isOfflineMapActive()) {
        renderOfflineSavedItems([]);
      }
      store.setState({ guardados: [], guardadoDetailId: "", guardadoExportModalId: "" });
      renderCurrentPage();
      break;
    }
    // ── Guardado detail actions ─────────────────────────────────────────
    case "close-guardado-detail":
      clearGuardadoDistInterval();
      store.setState({ guardadoDetailId: "", guardadoExportModalId: "" });
      renderCurrentPage();
      break;
    case "show-guardado-on-map": {
      const itemId = source.dataset.id || "";
      clearGuardadoDistInterval();
      store.setState({ guardadoDetailId: "", guardadoExportModalId: "", pendingFocusGuardadoId: itemId });
      navigate("mapa");
      break;
    }
    case "guide-to-guardado": {
      const itemId = source.dataset.id || "";
      clearGuardadoDistInterval();
      store.setState({ guardadoDetailId: "", guardadoExportModalId: "", pendingFocusGuardadoId: itemId });
      navigate("mapa");
      showToast("Abriendo mapa con la ubicación de la foto.", "success", 3000);
      break;
    }
    case "edit-guardado-title": {
      const itemId = source.dataset.id || "";
      const item = getDerivedState().guardados.find((g) => g.id === itemId);
      if (!item) return;
      const newTitle = window.prompt("Nuevo título:", item.titulo || "");
      if (newTitle === null) return;
      const updated = { ...item, titulo: newTitle.trim() || item.titulo };
      await saveGuardado(updated);
      const guardadosAfterTitle = await listGuardado();
      store.setState({ guardados: guardadosAfterTitle });
      showToast("Título actualizado.", "success");
      renderCurrentPage();
      break;
    }
    case "edit-guardado-location": {
      const itemId = source.dataset.id || "";
      const item = getDerivedState().guardados.find((g) => g.id === itemId);
      if (!item || item.tipo !== "foto") return;
      const rawLat = window.prompt("Nueva latitud:", String(item.lat || ""));
      if (rawLat === null) return;
      const rawLon = window.prompt("Nueva longitud:", String(item.lon || ""));
      if (rawLon === null) return;
      const newLat = toNullableNumber(rawLat);
      const newLon = toNullableNumber(rawLon);
      if (newLat == null || newLon == null) {
        throw new Error("Coordenadas no válidas.");
      }
      const updatedLoc = { ...item, lat: newLat, lon: newLon };
      await saveGuardado(updatedLoc);
      const guardadosAfterLoc = await listGuardado();
      store.setState({ guardados: guardadosAfterLoc });
      showToast("Ubicación actualizada.", "success");
      renderCurrentPage();
      break;
    }
    case "save-guardado-notes": {
      const itemId = source.dataset.id || "";
      const textarea = document.querySelector("#guardado-notes-input");
      const notas = textarea ? textarea.value : "";
      const item = getDerivedState().guardados.find((g) => g.id === itemId);
      if (!item) return;
      await saveGuardado({ ...item, notas });
      const guardadosAfterNotes = await listGuardado();
      store.setState({ guardados: guardadosAfterNotes });
      showToast("Notas guardadas.", "success");
      break;
    }
    case "query-guardado-elevation": {
      const itemId = source.dataset.id || "";
      const item = getDerivedState().guardados.find((g) => g.id === itemId);
      if (!item || item.tipo !== "foto" || !item.lat || !item.lon) return;
      showToast("Consultando elevación…", "info", 2500);
      const elevated = await resolvePointElevation(
        { latitude: item.lat, longitude: item.lon, spatialReference: { wkid: 4326 } },
        { project: getDerivedState().activeProject, online: store.getState().online },
      ).catch(() => null);
      if (elevated?.elevacion != null) {
        await saveGuardado({ ...item, elevacion: elevated.elevacion });
        const guardadosAfterElev = await listGuardado();
        store.setState({ guardados: guardadosAfterElev });
        showToast(`Elevación actualizada: ${formatDecimalInput(Number(elevated.elevacion).toFixed(1))} m`, "success");
        renderCurrentPage();
      } else {
        showToast("No se pudo obtener la elevación. Verifica tu conexión.", "error", 4000);
      }
      break;
    }
    case "export-guardado-modal": {
      const itemId = source.dataset.id || "";
      store.setState({ guardadoExportModalId: itemId });
      renderCurrentPage();
      break;
    }
    case "close-guardado-export-modal":
      store.setState({ guardadoExportModalId: "" });
      renderCurrentPage();
      break;
    case "export-guardado-item-geojson": {
      const itemId = source.dataset.id || "";
      const item = getDerivedState().guardados.find((g) => g.id === itemId);
      if (!item) return;
      exportarGeoJSON(item);
      store.setState({ guardadoExportModalId: "" });
      renderCurrentPage();
      showToast("GeoJSON exportado.", "success");
      break;
    }
    case "export-guardado-item-kml": {
      const itemId = source.dataset.id || "";
      const item = getDerivedState().guardados.find((g) => g.id === itemId);
      if (!item) return;
      exportarKML(item);
      store.setState({ guardadoExportModalId: "" });
      renderCurrentPage();
      showToast("KML exportado.", "success");
      break;
    }
    case "edit-guardado-area": {
      const itemId = source.dataset.id || "";
      const item = getDerivedState().guardados.find((g) => g.id === itemId);
      if (!item || item.tipo !== "area" || !item.vertices?.length) return;
      if (!store.getState().mapReady || store.getState().mapEngine !== "arcgis") {
        throw new Error("La edición de área solo está disponible con el mapa ArcGIS activo.");
      }
      // Navigate to map first, then start drawing mode to avoid destroyed-view errors
      clearGuardadoDistInterval();
      store.setState({ guardadoDetailId: "", guardadoExportModalId: "", editingAreaId: item.id, editingAreaFecha: item.fecha || "" });
      navigate("mapa");
      await new Promise((r) => setTimeout(r, 150));
      await startDrawingMode("area", {
        onVertex: () => {
          const label = buildDrawingMeasurementLabel();
          store.setState({ drawingMeasurement: label });
          const el = qs("#map-drawing-measurement");
          if (el) el.textContent = label;
        },
      });
      await loadVerticesIntoDrawing(item.vertices);
      const editLabel = buildDrawingMeasurementLabel();
      store.setState({ drawingMode: "area", drawingMeasurement: editLabel });
      refreshMapDrawingSection();
      break;
    }
    case "guardado-area-stats": {
      const itemId = source.dataset.id || "";
      const item = getDerivedState().guardados.find((g) => g.id === itemId);
      if (!item || item.tipo !== "area") return;
      const aHa = Number(item.area_ha || 0);
      const aM2 = Math.round(aHa * 10000).toLocaleString("es");
      const aAcres = (aHa * 2.47105).toFixed(3);
      const pM = Number(item.perimetro_m || 0);
      const pStr = pM >= 1000 ? `${(pM / 1000).toFixed(2)} km` : `${Math.round(pM)} m`;
      const verts = item.vertices || [];
      const cLat = verts.length ? (verts.reduce((s, v) => s + v.lat, 0) / verts.length).toFixed(6) : "—";
      const cLon = verts.length ? (verts.reduce((s, v) => s + v.lon, 0) / verts.length).toFixed(6) : "—";
      const minLat = verts.length ? Math.min(...verts.map((v) => v.lat)).toFixed(6) : "—";
      const maxLat = verts.length ? Math.max(...verts.map((v) => v.lat)).toFixed(6) : "—";
      const minLon = verts.length ? Math.min(...verts.map((v) => v.lon)).toFixed(6) : "—";
      const maxLon = verts.length ? Math.max(...verts.map((v) => v.lon)).toFixed(6) : "—";
      window.alert(
        `Estadísticas: ${item.titulo || "Área"}\n\nÁrea: ${aHa.toFixed(3)} ha · ${aM2} m² · ${aAcres} acres\nPerímetro: ${pStr}\nCentroide: ${cLat}, ${cLon}\nBounding box: [${minLat},${minLon}] – [${maxLat},${maxLon}]\nVértices: ${verts.length}`,
      );
      break;
    }
    case "download-guardado-area-tiles":
      showToast("Para descargar tiles de la zona, abre el mapa y usa el panel de capas → Descargar zona visible.", "info", 5000);
      break;
    case "export-guardado-geojson": {
      const currentState = getDerivedState();
      const features = currentState.guardados.map((item) => {
        if (item.tipo === "area" && item.vertices?.length >= 3) {
          const coords = [...item.vertices.map((v) => [v.lon, v.lat]), [item.vertices[0].lon, item.vertices[0].lat]];
          return { type: "Feature", geometry: { type: "Polygon", coordinates: [coords] }, properties: { id: item.id, tipo: item.tipo, titulo: item.titulo, notas: item.notas, color: item.color, perimetro_m: item.perimetro_m, area_ha: item.area_ha, fecha: item.fecha } };
        }
        if (item.tipo === "linea" && item.puntos?.length >= 2) {
          return { type: "Feature", geometry: { type: "LineString", coordinates: item.puntos.map((p) => [p.lon, p.lat]) }, properties: { id: item.id, tipo: item.tipo, titulo: item.titulo, distancia_m: item.distancia_m, unidad_display: item.unidad_display, fecha: item.fecha } };
        }
        if (item.tipo === "foto" && item.lat && item.lon) {
          return { type: "Feature", geometry: { type: "Point", coordinates: [item.lon, item.lat] }, properties: { id: item.id, tipo: item.tipo, titulo: item.titulo, elevacion: item.elevacion, fecha: item.fecha } };
        }
        return null;
      }).filter(Boolean);

      const geojson = { type: "FeatureCollection", features };
      const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `guardado_${new Date().toISOString().slice(0, 10)}.geojson`;
      a.click();
      URL.revokeObjectURL(url);
      showToast("GeoJSON exportado correctamente.", "success");
      break;
    }
    default:
      break;
  }
}

window.__appHandleAction = (action, source) => {
  return handleAction(action, source).catch((error) => {
    showToast(error.message || "No fue posible ejecutar la accion solicitada.", "error", 5200);
  });
};

function bindEvents() {
  if (eventsBound) {
    return;
  }

  eventsBound = true;
  // Evita que el scroll del panel de captura afecte el mapa en iOS
  document.addEventListener("touchmove", (event) => {
    if (event.target.closest(".map-capture-sheet, .map-side-sheet")) {
      event.stopPropagation();
    }
    // Drawing panel drag (MEJORA 1)
    if (_panelDrag.active && _panelDrag.el) {
      const dx = event.touches[0].clientX - _panelDrag.startX;
      const dy = event.touches[0].clientY - _panelDrag.startY;
      _panelDrag.el.style.left = `${Math.max(0, Math.min(window.innerWidth - _panelDrag.el.offsetWidth, _panelDrag.initLeft + dx))}px`;
      _panelDrag.el.style.top = `${Math.max(0, Math.min(window.innerHeight - _panelDrag.el.offsetHeight, _panelDrag.initTop + dy))}px`;
      _panelDrag.el.style.right = "auto";
      _panelDrag.el.style.transform = "none";
      event.preventDefault();
    }
  }, { passive: false });

  // Drawing panel mouse drag (MEJORA 1)
  document.addEventListener("mousemove", (e) => {
    if (!_panelDrag.active || !_panelDrag.el) return;
    _panelDrag.el.style.left = `${Math.max(0, Math.min(window.innerWidth - _panelDrag.el.offsetWidth, _panelDrag.initLeft + e.clientX - _panelDrag.startX))}px`;
    _panelDrag.el.style.top = `${Math.max(0, Math.min(window.innerHeight - _panelDrag.el.offsetHeight, _panelDrag.initTop + e.clientY - _panelDrag.startY))}px`;
    _panelDrag.el.style.right = "auto";
    _panelDrag.el.style.transform = "none";
  });
  document.addEventListener("mouseup", () => { _panelDrag.active = false; });
  document.addEventListener("touchend", () => { _panelDrag.active = false; });

  document.addEventListener("click", async (event) => {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
      return;
    }

    try {
      await handleAction(actionTarget.dataset.action, actionTarget);
    } catch (error) {
      showToast(error.message || "No fue posible ejecutar la accion solicitada.", "error", 5200);
    }
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) {
      return;
    }

    event.preventDefault();

    try {
      if (form.id === "project-form") {
        await handleProjectSubmit(form);
      }

      if (form.id === "collar-form") {
        await handleCollarSubmit(form);
      }

      if (form.id === "survey-form") {
        await handleSurveySubmit(form);
      }

      if (form.id === "assay-form") {
        await handleAssaySubmit(form);
      }

      if (form.id === "laboratorio-form") {
        await handleLaboratorioSubmit(form);
      }

      if (form.id === "offline-point-form") {
        await handleOfflinePointSubmit(form);
      }

      if (form.id === "drawing-save-form") {
        await handleDrawingSaveSubmit(form);
      }
    } catch (error) {
      showToast(error.message || "No fue posible completar la operacion.", "error", 4500);
    }
  });

  document.addEventListener("change", async (event) => {
    const target = event.target;
    if (target instanceof HTMLSelectElement && target.dataset.customSelect) {
      syncCustomSelectField(target.dataset.customSelect, target.closest("form"));
      return;
    }

    if (target instanceof HTMLSelectElement && target.name === "concesion_area" && target.closest("#project-form")) {
      applyProjectAreaDefaults(target);
      return;
    }

    if (target instanceof HTMLSelectElement && target.name === "collar_uuid" && target.closest("#survey-form")) {
      fillSurveyFromSelectedCollar(target);
      return;
    }

    if (target instanceof HTMLSelectElement && target.name === "collar_uuid" && target.closest("#assay-form")) {
      store.setState({ selectedAssayCollarUuid: target.value });
      renderCurrentPage();
      return;
    }

    if (target instanceof HTMLSelectElement && target.name === "muestra_id" && target.closest("#assay-form")) {
      applyAssayMuestraState(target);
      return;
    }

    if (target instanceof HTMLSelectElement && target.name === "assay_uuid" && target.closest("#laboratorio-form")) {
      fillLaboratorioFromSelectedAssay(target);
      return;
    }

    if (!(target instanceof HTMLInputElement)) {
      return;
    }

    const fileInputIds = new Set(["backup-file-input", "survey-csv-input", "assay-csv-input", "map-import-file-input", "map-camera-input"]);
    if (target.type !== "file" || !fileInputIds.has(target.id)) {
      return;
    }

    const fileCount = target.files?.length || 0;
    const file = target.files?.[0];
    target.value = "";

    if (!file) {
      return;
    }

    try {
      if (target.id === "backup-file-input") {
        const summary = await importBackup(file);
        store.setState({
          draftCollar: getStoredDraftCollar(),
          editingCollarUuid: "",
          editingProjectUuid: "",
          editingSurveyUuid: "",
          editingAssayUuid: "",
          editingLaboratorioUuid: "",
        });
        await rerenderAll();
        showToast(
          `Respaldo importado. Proyectos: ${summary.projects}, collars: ${summary.collars}, survey: ${summary.surveys}, assay: ${summary.assays}, laboratorio: ${summary.laboratorios}.`,
          "success",
          5200,
        );
        return;
      }

      if (target.id === "survey-csv-input") {
        await handleSurveyCsvImport(file);
        return;
      }

      if (target.id === "assay-csv-input") {
        await handleAssayCsvImport(file);
        return;
      }

      if (target.id === "map-import-file-input") {
        store.setState({ importModalOpen: false });
        refreshMapImportModal();
        showToast(`UI lista para importar ${fileCount || 1} archivo(s). La ingestion GPX/KML/GeoJSON no se conecto porque pediste no tocar la logica funcional.`, "success", 5200);
      }

      if (target.id === "map-camera-input") {
        await handleCameraCapture(file);
      }
    } catch (error) {
      showToast(error.message || "No fue posible procesar el archivo seleccionado.", "error", 5200);
    }
  });

}

async function handleDrawingSaveSubmit(form) {
  const drawingState = getActiveDrawingState();
  const data = new FormData(form);
  // BUG 5: title is optional, default to 'Sin nombre'
  const titulo = String(data.get("titulo") || "").trim() || "Sin nombre";
  const notas = String(data.get("notas") || "").trim();
  const color = String(data.get("color") || "#2d5a27");

  if (drawingState.mode === "area") {
    if (drawingState.vertices.length < 3) {
      throw new Error("Necesitas al menos 3 puntos para guardar un área.");
    }
    const m = getActiveMeasurements();
    // BUG 1: check if editing an existing area
    const currentState = store.getState();
    const isEditing = Boolean(currentState.editingAreaId);
    const item = {
      id: isEditing ? currentState.editingAreaId : createUuid(),
      tipo: "area",
      titulo,
      notas,
      color,
      vertices: drawingState.vertices,
      perimetro_m: m.perimeterM,
      area_ha: m.areaHa,
      fecha: isEditing ? (currentState.editingAreaFecha || nowIso()) : nowIso(),
      fechaModificacion: nowIso(),
    };
    await saveGuardado(item);
    cancelActiveDrawing();
    // Update or add the graphic on the persistent layer
    if (isEditing) {
      removeSavedItemFromMap(item.id);
    }
    if (isOfflineMapActive()) {
      renderOfflineSavedItems([item, ...getDerivedState().guardados.filter((saved) => saved.id !== item.id)]);
    } else {
      await addSavedAreaToMap(item).catch(() => {});
    }
    const guardados = await listGuardado();
    store.setState({ guardados, drawingMode: null, drawingSaveModalOpen: false, drawingMeasurement: "", editingAreaId: "", editingAreaFecha: "" });
    refreshMapDrawingSection();
    showToast(isEditing ? `Área "${titulo}" actualizada.` : `Área "${titulo}" guardada.`, "success", 3500);
  } else if (drawingState.mode === "line") {
    if (drawingState.vertices.length < 2) {
      throw new Error("Necesitas al menos 2 puntos para guardar una línea.");
    }
    const m = getActiveMeasurements();
    const unidadDisplay = formatActiveLineDistance(m.distanceM || 0);
    const item = await saveLineaGuardado({ titulo, puntos: drawingState.vertices, distanciaM: m.distanceM, unidadDisplay });
    cancelActiveDrawing();
    if (isOfflineMapActive()) {
      renderOfflineSavedItems([item, ...getDerivedState().guardados.filter((saved) => saved.id !== item.id)]);
    } else {
      await addSavedLineaToMap(item).catch(() => {})
    }
    const guardados = await listGuardado();
    store.setState({ guardados, drawingMode: null, drawingSaveModalOpen: false, drawingMeasurement: "" });
    refreshMapDrawingSection();
    showToast(`Línea "${titulo}" guardada.`, "success", 3500);
  }
}

async function handleCameraCapture(file) {
  if (!file) return;

  const [base64Result, positionResult] = await Promise.allSettled([
    new Promise((res) => {
      const reader = new FileReader();
      reader.onload = (e) => res(e.target.result);
      reader.readAsDataURL(file);
    }),
    new Promise((res, rej) =>
      navigator.geolocation.getCurrentPosition(res, rej, { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }),
    ),
  ]);

  const imagenBase64 = base64Result.status === "fulfilled" ? base64Result.value : null;
  const currentState = getDerivedState();
  const lat = positionResult.status === "fulfilled"
    ? positionResult.value.coords.latitude
    : (currentState.currentLocation?.latitude || null);
  const lon = positionResult.status === "fulfilled"
    ? positionResult.value.coords.longitude
    : (currentState.currentLocation?.longitude || null);

  // Resolve elevation via DEM if online and map is ready
  let elevacion = null;
  if (lat && lon && currentState.online && !isOfflineMapActive()) {
    try {
      const elevated = await resolvePointElevation(
        { latitude: lat, longitude: lon, spatialReference: { wkid: 4326 } },
        { project: currentState.activeProject, online: currentState.online },
      );
      elevacion = elevated?.elevacion ?? null;
    } catch {
      // elevation stays null; non-blocking
    }
  }

  const item = await saveFotoGuardado({ imagenBase64, lat, lon, elevacion });
  const guardados = await listGuardado();
  store.setState({ guardados });

  if (lat && lon && !isOfflineMapActive()) {
    await addPhotoMarkerToMap({ lat, lon, id: item.id }).catch(() => {});
  }

  showToast(
    elevacion != null
      ? `Foto guardada con ubicación. Elevación: ${formatDecimalInput(Number(elevacion).toFixed(1))} m`
      : "Foto guardada con ubicación.",
    "success",
    3200,
  );
}

function registerInstallPrompt() {
  if (installPromptRegistered) {
    return;
  }

  installPromptRegistered = true;
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    store.setState({ deferredPrompt: event });
    refreshChrome();
  });
}

function registerServiceWorker() {
  if (serviceWorkerRegistered || !("serviceWorker" in navigator)) {
    return;
  }

  serviceWorkerRegistered = true;
  const register = async () => {
    try {
      await navigator.serviceWorker.register("./sw.js", { scope: "./" });
    } catch (error) {
      showToast(`No se pudo registrar el service worker: ${error.message}`, "error", 5200);
    }
  };

  if (document.readyState === "complete") {
    register();
  } else {
    window.addEventListener("load", register, { once: true });
  }

  // Escuchar mensajes del SW para Background Sync
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "BACKGROUND_SYNC" && event.data?.tag === "sync-collars") {
      if (store.getState().online && appConfig.sync.enabled && appConfig.sync.autoSyncOnReconnect) {
        runSync("auto").catch(() => {});
      }
    }
  });

  document.addEventListener("input", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.dataset.customInput) {
      syncCustomSelectField(target.dataset.customInput, target.closest("form"));
    }
  });
}

function setAuthTab(mode) {
  const loginForm = document.getElementById("form-login");
  const registroForm = document.getElementById("form-registro");
  const loginTab = document.getElementById("tab-login");
  const registroTab = document.getElementById("tab-registro");
  const isLogin = mode === "login";

  if (loginForm) loginForm.style.display = isLogin ? "block" : "none";
  if (registroForm) registroForm.style.display = isLogin ? "none" : "block";
  if (loginTab) {
    loginTab.style.background = isLogin ? "#2d5a27" : "#f5f5f5";
    loginTab.style.color = isLogin ? "white" : "#888";
  }
  if (registroTab) {
    registroTab.style.background = isLogin ? "#f5f5f5" : "#2d5a27";
    registroTab.style.color = isLogin ? "#888" : "white";
  }
}

function activarListenersAuth() {
  document.getElementById("tab-login")?.addEventListener("click", () => setAuthTab("login"));
  document.getElementById("tab-registro")?.addEventListener("click", () => setAuthTab("registro"));

  document.querySelectorAll("[data-password-toggle]").forEach((toggle) => {
    toggle.addEventListener("change", () => {
      const input = document.getElementById(toggle.dataset.passwordToggle);
      if (input instanceof HTMLInputElement) {
        input.type = toggle.checked ? "text" : "password";
      }
    });
  });

  document.getElementById("btn-login")?.addEventListener("click", async () => {
    const btn = document.getElementById("btn-login");
    const errorEl = document.getElementById("login-error");
    const email = document.getElementById("login-email")?.value.trim() || "";
    const password = document.getElementById("login-password")?.value || "";

    if (!btn || !errorEl) {
      return;
    }

    errorEl.style.display = "none";
    btn.textContent = "Entrando...";
    btn.disabled = true;

    try {
      await login(email, password);
    } catch (error) {
      console.error("[auth] login failed", error);
      errorEl.textContent = traducirErrorAutenticacion(error);
      errorEl.style.display = "block";
      btn.textContent = "Entrar";
      btn.disabled = false;
    }
  });

  document.getElementById("btn-registro")?.addEventListener("click", async () => {
    const btn = document.getElementById("btn-registro");
    const errorEl = document.getElementById("reg-error");
    const nombre = document.getElementById("reg-nombre")?.value.trim() || "";
    const email = document.getElementById("reg-email")?.value.trim() || "";
    const password = document.getElementById("reg-password")?.value || "";

    if (!btn || !errorEl) {
      return;
    }

    errorEl.style.display = "none";
    if (!nombre) {
      errorEl.textContent = "Ingresa tu nombre completo";
      errorEl.style.display = "block";
      return;
    }

    btn.textContent = "Creando cuenta...";
    btn.disabled = true;

    try {
      await registrar(email, password, nombre);
    } catch (error) {
      console.error("[auth] register failed", error);
      errorEl.textContent = traducirErrorAutenticacion(error);
      errorEl.style.display = "block";
      btn.textContent = "Crear cuenta";
      btn.disabled = false;
    }
  });
}

async function iniciarApp() {
  document.title = appConfig.appName;
  try {
  await initDB();
  store.setState({ draftCollar: getStoredDraftCollar(), captureMode: getStoredCaptureMode() });

  if (estaLogueado()) {
    await sincronizarColaPendienteBackend();
    await descargarDatosDelServidor();
  }

  renderShell();
  bindEvents();
  registerBidirectionalSyncHandlers();
  registerInstallPrompt();
  registerServiceWorker();

  if (estaLogueado() && navigator.onLine) {
    setTimeout(sincronizarConNube, 3000);
  }

  if (store.getState().online && appConfig.sync.provider === "arcgis-feature-service" && appConfig.sync.downloadOnStart) {
    try {
      const summary = await bootstrapArcGISData();
      if (!summary.skipped) {
        showToast(summary.message, "success", 4200);
      }
    } catch (error) {
      showToast(error.message || "No fue posible descargar datos de ArcGIS al iniciar.", "error", 5200);
    }
  }

  await rerenderAll();

  if (store.getState().online && appConfig.elevation.enabled) {
    const draftUpdated = await reconcileDraftElevationIfNeeded(true);
    if (draftUpdated) {
      await rerenderAll();
    }
  }

  if (!routerStarted) {
    routerStarted = true;
    initRouter(handleRouteChange);
  } else {
    await handleRouteChange(getCurrentRoute());
  }

  if (!networkWatcherStarted) {
    networkWatcherStarted = true;
    watchNetworkStatus(async (online) => {
    const previousState = store.getState();
    store.setState({ online });
    refreshChrome();

    if (!online) {
      showToast("Sin conexion — trabajando en modo offline.", "info", 4200);
    }

    if (previousState.route === "mapa") {
      if (!online && previousState.mapEngine === "arcgis" && previousState.mapReady) {
        store.setState({ mapFallbackMessage: await buildOfflineMapMessage() });
        renderCurrentPage();
        showToast("Sin conexion. Se activo el mapa offline local.", "info", 4200);
      } else if (online && previousState.mapEngine === "arcgis" && previousState.mapReady) {
        rememberArcGISCache();
        store.setState({ mapFallbackMessage: "" });
        refreshMapToolbarSection();
        refreshMapStatusChip();
        refreshMapProjectBanner();
      } else if (online && previousState.mapEngine === "offline") {
        store.setState({ mapFallbackMessage: "" });
        renderCurrentPage();
      } else {
        renderCurrentPage();
      }
    }

    if (online && appConfig.elevation.enabled && !appConfig.sync.autoSyncOnReconnect) {
      const draftUpdated = await reconcileDraftElevationIfNeeded(true);
      if (draftUpdated && !shouldPreserveOpenForm()) {
        renderCurrentPage();
      }
    }

    if (online) {
      if (appConfig.sync.autoSyncOnReconnect) {
        await runSync("auto");
      }
      await sincronizarBidireccional({ uploadPending: true });
    }
  });
  }

  showToast(`Datos locales cargados. Ultima revision: ${formatDateTime(new Date().toISOString())}`, "success", 2800);
  } catch (err) {
    document.body.innerHTML = `<div style="padding:20px;color:red;font-family:monospace;">
      <b>Error al iniciar la app:</b><br>${err?.message || err}<br>
      <pre style="white-space:pre-wrap;font-size:12px">${err?.stack || ''}</pre>
    </div>`;
  }
}

function resetSessionState() {
  clearCaptureFlow();
  store.setState({
    projects: [],
    collars: [],
    surveys: [],
    assays: [],
    laboratorios: [],
    syncQueue: [],
    activeProjectUuid: "",
    draftCollar: null,
    currentLocation: null,
    editingProjectUuid: "",
    editingCollarUuid: "",
    editingSurveyUuid: "",
    editingAssayUuid: "",
    editingLaboratorioUuid: "",
    selectedMapCollarUuid: "",
    selectedAssayCollarUuid: "",
    guardados: [],
    mobileDrawerOpen: false,
    sidebarOpen: false,
  });
}

async function bootstrap() {
  document.title = appConfig.appName;
  registerInstallPrompt();
  registerServiceWorker();
  const appRoot = document.getElementById("app");
  if (appRoot) {
    appRoot.innerHTML = renderAuthPage();
    activarListenersAuth();
  }

  initAuth(
    async () => {
      document.getElementById("app").innerHTML = "";
      await iniciarApp();
    },
    () => {
      resetSessionState();
      const root = document.getElementById("app");
      if (root) {
        root.innerHTML = renderAuthPage();
        activarListenersAuth();
      }
    },
  );
}

window.addEventListener('error', (e) => {
  console.error("[app] error global", e.error || e.message, e.filename, e.lineno);
  showToast(e.message || "Ocurrio un error inesperado.", "error", 5200);
});

window.addEventListener('unhandledrejection', (e) => {
  console.error("[app] promesa rechazada", e.reason);
  showToast(e.reason?.message || "Ocurrio un error inesperado.", "error", 5200);
});

bootstrap();
