import { escapeHtml, formatDateTime } from "../core/helpers.js";
import { renderInlineLoader } from "../ui/loaders.js";
import { renderSyncBadge } from "../ui/statusBadge.js";

export function renderSyncPage({ syncQueue, isSyncing, syncMessage }) {
  return `
    <section class="page-grid stack">
      <article class="card">
        <div class="card__header">
          <p class="eyebrow">Sincronizacion</p>
          <h2 class="title-md">Cola de envio y reintentos</h2>
        </div>
        <div class="card__body stack">
          <div class="inline-row sync-actions">
            <button class="button" type="button" data-action="sync-now" ${isSyncing ? "disabled" : ""}>${isSyncing ? "Sincronizando" : "Ejecutar sync"}</button>
            <button class="ghost-button" type="button" data-action="download-arcgis" ${isSyncing ? "disabled" : ""}>Descargar ArcGIS</button>
            <button class="ghost-button" type="button" data-action="export-backup">Exportar respaldo</button>
            <button class="ghost-button" type="button" data-action="import-backup">Importar respaldo</button>
            <input id="backup-file-input" class="hidden" type="file" accept="application/json,.json">
          </div>
          <p class="muted sync-inline-message">${escapeHtml(syncMessage || "La sincronizacion automatica esta desactivada. Los registros quedan en cola y se envian cuando pulses Ejecutar sync.")}</p>
          ${isSyncing ? renderInlineLoader("Procesando proyectos y luego collars vinculados...") : ""}
          <div class="notice notice--compact">
            Para cambiar de telefono o reinstalar la app sin perder datos, exporta un respaldo JSON y luego importalo en el nuevo dispositivo. Para continuidad automatica entre equipos necesitas un backend real o un Feature Service editable con autenticacion.
          </div>
        </div>
      </article>

      <article class="card">
        <div class="card__header">
          <p class="eyebrow">SYNC_QUEUE</p>
          <h2 class="title-md">Elementos pendientes y errores</h2>
        </div>
        <div class="card__body stack">
          ${syncQueue.length
            ? syncQueue
                .map(
                  (item) => `
                    <div class="list-item queue-item">
                      <div class="queue-item__head">
                        <strong>${escapeHtml(item.entity_type)} · ${escapeHtml(item.action)}</strong>
                        ${renderSyncBadge(item.status)}
                      </div>
                      <div class="list-item__meta">
                        <span>Ref: ${escapeHtml(item.payload?.hole_id || item.payload?.guia_ensayo || item.payload?.cod_exploracion || "-")}</span>
                        <span>UUID: ${escapeHtml(item.entity_uuid)}</span>
                        <span>Intentos: ${escapeHtml(String(item.attempts || 0))}</span>
                        <span>Actualizado: ${escapeHtml(formatDateTime(item.updated_at))}</span>
                      </div>
                      <p class="muted">${escapeHtml(item.last_error || "Sin error registrado")}</p>
                    </div>
                  `,
                )
                .join("")
            : '<div class="empty-state">La cola de sincronizacion esta vacia.</div>'}
        </div>
      </article>
    </section>
  `;
}
