import { escapeHtml } from "../core/helpers.js";
import { getCurrentUser } from "../services/backendService.js";
import { renderIcon } from "../ui/icons.js";

export const navItems = [
  { route: "mapa", label: "Mapa", icon: "map", mobilePrimary: true },
  { route: "proyectos", label: "Proyectos", icon: "projects", mobilePrimary: true },
  { route: "collars", label: "Collars", icon: "collar", mobilePrimary: true },
  { route: "survey", label: "Survey", icon: "survey", mobilePrimary: false },
  { route: "assay", label: "Assay", icon: "assay", mobilePrimary: false },
  { route: "laboratorio", label: "Laboratorio", icon: "laboratorio", mobilePrimary: false },
  { route: "sync", label: "Sync", icon: "sync", mobilePrimary: true },
  { route: "guardado", label: "Guardado", icon: "bookmark", mobilePrimary: false },
  { route: "dashboard", label: "Dashboard", icon: "dashboard", mobilePrimary: false },
];

function renderBrandLogo() {
  return `
    <div class="sidebar__brand-mark" aria-hidden="true">
      <svg viewBox="0 0 48 48" class="sidebar__brand-svg" focusable="false">
        <path d="M10 32c6-12 12-18 14-18s7 6 14 18" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
        <path d="M16 34c4-7 7-11 8-11 1 0 4 4 8 11" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></path>
        <path d="M24 10v6" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"></path>
      </svg>
    </div>
  `;
}

function renderNavLink(item, isActive, extraClass = "") {
  return `
    <a class="nav-link ${isActive ? "is-active" : ""} ${extraClass}" href="#/${item.route}" data-route="${item.route}" aria-label="${escapeHtml(item.label)}">
      <span class="nav-link__icon">${renderIcon(item.icon)}</span>
      <span class="nav-link__label">${escapeHtml(item.label)}</span>
    </a>
  `;
}

export function renderSidebar({ route }) {
  const user = getCurrentUser();
  return `
    <div class="sidebar__content">
      <div class="sidebar__brand">
        ${renderBrandLogo()}
      </div>
      <nav class="sidebar__nav" aria-label="Navegacion principal">
        ${navItems.map((item) => renderNavLink(item, route === item.route)).join("")}
      </nav>
      <div style="margin-top:auto;padding-top:12px;">
        <p id="sidebar-usuario" class="muted" style="font-size:12px;margin:0 0 8px;">${escapeHtml(user?.displayName || user?.email || "")}</p>
        <button id="btn-cerrar-sesion" type="button" data-action="cerrar-sesion" style="width:100%;padding:10px;background:none;border:1.5px solid #c62828;color:#c62828;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;">
          Cerrar sesion
        </button>
      </div>
    </div>
  `;
}

export function renderMobileNav({ route, mobileDrawerOpen }) {
  const primaryItems = navItems.filter((item) => item.mobilePrimary);
  const secondaryRoutes = new Set(navItems.filter((item) => !item.mobilePrimary).map((item) => item.route));

  return `
    <nav class="mobile-nav" aria-label="Navegacion movil">
      ${primaryItems.map((item) => renderNavLink(item, route === item.route, "nav-link--mobile")).join("")}
      <button class="nav-link nav-link--mobile ${mobileDrawerOpen || secondaryRoutes.has(route) ? "is-active" : ""}" type="button" data-action="toggle-mobile-drawer" aria-label="Mas secciones" aria-expanded="${mobileDrawerOpen ? "true" : "false"}">
        <span class="nav-link__icon">${renderIcon("more")}</span>
        <span class="nav-link__label">Mas</span>
      </button>
    </nav>
  `;
}

export function renderMobileDrawer({ route, activeProject }) {
  const secondaryItems = navItems.filter((item) => !item.mobilePrimary);
  const user = getCurrentUser();

  return `
    <div class="mobile-drawer">
      <div class="mobile-drawer__header">
        <div>
          <p class="eyebrow">Exploracion de campo</p>
          <strong>${escapeHtml(activeProject?.cod_exploracion || "Sin proyecto activo")}</strong>
        </div>
        <button class="icon-button icon-button--ghost" type="button" data-action="close-mobile-drawer" aria-label="Cerrar secciones secundarias">
          ${renderIcon("close")}
        </button>
      </div>
      <div class="mobile-drawer__nav">
        ${secondaryItems.map((item) => renderNavLink(item, route === item.route, "nav-link--drawer")).join("")}
        <button id="btn-cerrar-sesion-mobile" class="ghost-button" type="button" data-action="cerrar-sesion" style="width:100%;border-color:#c62828;color:#c62828;">
          Cerrar sesion
        </button>
        <p id="topbar-usuario" class="muted" style="font-size:12px;margin:8px 0 0;">${escapeHtml(user?.displayName || user?.email || "")}</p>
      </div>
    </div>
  `;
}
