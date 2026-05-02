const knownRoutes = ["dashboard", "proyectos", "collars", "survey", "assay", "laboratorio", "mapa", "sync", "guardado"];

export function getCurrentRoute(hash = window.location.hash) {
  const rawRoute = hash.replace(/^#\/?/, "").trim();
  return knownRoutes.includes(rawRoute) ? rawRoute : "dashboard";
}

export function navigate(route) {
  const nextRoute = knownRoutes.includes(route) ? route : "dashboard";
  window.location.hash = `#/${nextRoute}`;
}

export function initRouter(onRouteChange) {
  const emitRoute = () => onRouteChange(getCurrentRoute());
  window.addEventListener("hashchange", emitRoute);
  emitRoute();
}

export function isKnownRoute(route) {
  return knownRoutes.includes(route);
}