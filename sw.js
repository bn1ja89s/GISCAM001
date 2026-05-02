const APP_CACHE_NAME = "pwa-exploracion-app-v56";
const ARCGIS_CACHE_NAME = "pwa-exploracion-arcgis-v56";
const CACHE_PREFIX = "pwa-exploracion-";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  // CSS
  "./css/reset.css",
  "./css/variables.css",
  "./css/layout.css",
  "./css/components.css",
  "./css/app.css",
  // Core JS
  "./js/app.js",
  "./js/router.js",
  "./js/config.js",
  // Core utilities
  "./js/core/network.js",
  "./js/core/helpers.js",
  "./js/core/dom.js",
  "./js/core/state.js",
  "./js/core/validators.js",
  "./js/core/csv.js",
  // DB repositories
  "./js/db/indexeddb.js",
  "./js/db/collarRepository.js",
  "./js/db/proyectoRepository.js",
  "./js/db/surveyRepository.js",
  "./js/db/assayRepository.js",
  "./js/db/laboratorioRepository.js",
  "./js/db/syncRepository.js",
  "./js/db/guardadoRepository.js",
  "./js/db/offlineTilesRepository.js",
  // Services
  "./js/services/mapService.js",
  "./js/services/elevationService.js",
  "./js/services/offlineMapService.js",
  "./js/services/syncService.js",
  "./js/services/storageService.js",
  "./js/services/backendService.js",
  "./js/services/assayService.js",
  "./js/services/backupService.js",
  "./js/services/collarService.js",
  "./js/services/csvImportService.js",
  "./js/services/guardadoService.js",
  "./js/services/laboratorioService.js",
  "./js/services/survey123LaboratorioService.js",
  "./js/services/mapDrawingService.js",
  "./js/services/proyectoService.js",
  "./js/services/surveyService.js",
  // UI components
  "./js/ui/icons.js",
  "./js/ui/loaders.js",
  "./js/ui/modal.js",
  "./js/ui/notifications.js",
  "./js/ui/statusBadge.js",
  // Page components
  "./js/components/sidebar.js",
  "./js/components/topbar.js",
  "./js/components/mapToolbar.js",
  "./js/components/projectForm.js",
  "./js/components/projectList.js",
  "./js/components/collarForm.js",
  "./js/components/collarList.js",
  "./js/components/surveyForm.js",
  "./js/components/surveyList.js",
  "./js/components/assayForm.js",
  "./js/components/assayList.js",
  "./js/components/laboratorioForm.js",
  "./js/components/laboratorioList.js",
  // Pages
  "./js/pages/dashboardPage.js",
  "./js/pages/proyectoPage.js",
  "./js/pages/collarPage.js",
  "./js/pages/surveyPage.js",
  "./js/pages/assayPage.js",
  "./js/pages/laboratorioPage.js",
  "./js/pages/authPage.js",
  "./js/pages/mapaPage.js",
  "./js/pages/syncPage.js",
  "./js/pages/guardadoPage.js",
  // Assets
  "./docs/assay_template.csv",
  "./docs/survey_template.csv",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-192.svg",
  "./assets/icons/icon-512.svg",
  "./js/vendor/proj4.js",
];

function isCacheableResponse(response) {
  return Boolean(response) && (response.ok || response.type === "opaque");
}

function isArcGISRequest(url) {
  return url.hostname.endsWith(".arcgis.com") || url.hostname.endsWith(".arcgisonline.com");
}

async function putInCache(cacheName, request, response) {
  if (!isCacheableResponse(response)) {
    return response;
  }

  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
  return response;
}

async function cacheFirst(request, cacheName) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    return await putInCache(cacheName, request, networkResponse);
  } catch {
    return new Response("", { status: 504, statusText: "Gateway Timeout" });
  }
}

async function networkFirst(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    return await putInCache(cacheName, request, networkResponse);
  } catch {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    return new Response("", { status: 504, statusText: "Gateway Timeout" });
  }
}

async function networkFirstNoStore(request, cacheName) {
  try {
    const networkResponse = await fetch(new Request(request, { cache: "no-store" }));
    return await putInCache(cacheName, request, networkResponse);
  } catch {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    return new Response("", { status: 504, statusText: "Gateway Timeout" });
  }
}

async function navigationStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    if (isCacheableResponse(networkResponse)) {
      const cache = await caches.open(APP_CACHE_NAME);
      await cache.put("./index.html", networkResponse.clone());
    }
    return networkResponse;
  } catch {
    return (
      await caches.match("./index.html") ||
      await caches.match("./") ||
      new Response("App offline no disponible en cache.", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      })
    );
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cachedResponse = await caches.match(request);
  const networkResponsePromise = fetch(request)
    .then((response) => putInCache(cacheName, request, response))
    .catch(() => cachedResponse || new Response("", { status: 504, statusText: "Gateway Timeout" }));

  return cachedResponse || networkResponsePromise;
}

async function syncPendingCollars() {
  const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of allClients) {
    client.postMessage({ type: "BACKGROUND_SYNC", tag: "sync-collars" });
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_CACHE_NAME).then((cache) =>
      Promise.all(
        APP_SHELL.map((url) =>
          cache.add(url).catch((error) => {
            console.warn("[sw] recurso opcional no cacheado", url, error);
          }),
        ),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith(CACHE_PREFIX) && ![APP_CACHE_NAME, ARCGIS_CACHE_NAME].includes(key))
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  if (event.request.method !== "GET") {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(navigationStrategy(event.request));
    return;
  }

  // Assets del origen local → Network First con fallback a cache
  if (
    requestUrl.origin === self.location.origin
    && (
      requestUrl.pathname.endsWith("/js/config.js")
      || requestUrl.pathname.endsWith("/js/services/offlineMapService.js")
    )
  ) {
    event.respondWith(networkFirstNoStore(event.request, APP_CACHE_NAME));
    return;
  }

  if (requestUrl.origin === self.location.origin) {
    if (
      requestUrl.pathname.endsWith(".woff2")
      || requestUrl.pathname.includes("logo-")
    ) {
      event.respondWith(fetch(event.request));
      return;
    }

    event.respondWith(networkFirst(event.request, APP_CACHE_NAME));
    return;
  }

  // Resto de peticiones ArcGIS (JS, CSS, assets) → Stale-While-Revalidate
  if (isArcGISRequest(requestUrl)) {
    event.respondWith(staleWhileRevalidate(event.request, ARCGIS_CACHE_NAME));
    return;
  }

  // Cualquier otra peticion de red → Network First con fallback
  event.respondWith(networkFirst(event.request, APP_CACHE_NAME));
});

self.addEventListener("sync", (event) => {
  if (event.tag === "sync-collars") {
    event.waitUntil(syncPendingCollars());
  }
});
