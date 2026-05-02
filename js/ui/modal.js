import { qs, setHTML } from "../core/dom.js";
import { escapeHtml } from "../core/helpers.js";

export function closeModal() {
  const modal = qs("#app-modal");
  if (modal?.open) {
    modal.close();
  }
}

export function confirmDialog({ title, description, confirmLabel = "Confirmar", cancelLabel = "Cancelar" }) {
  const modal = qs("#app-modal");
  const fallbackMessage = [title, description].filter(Boolean).join("\n\n");

  if (!modal || typeof modal.showModal !== "function") {
    return Promise.resolve(window.confirm(fallbackMessage || confirmLabel));
  }

  if (modal.open) {
    modal.close();
  }

  setHTML(
    modal,
    `
      <form method="dialog" class="card">
        <div class="card__body stack">
          <h3 class="title-md">${escapeHtml(title)}</h3>
          <p class="muted">${escapeHtml(description)}</p>
          <div class="inline-row">
            <button class="ghost-button" type="submit" value="cancel">${escapeHtml(cancelLabel)}</button>
            <button class="button" type="submit" value="confirm">${escapeHtml(confirmLabel)}</button>
          </div>
        </div>
      </form>
    `,
  );

  modal.returnValue = "";

  try {
    modal.showModal();
  } catch {
    return Promise.resolve(window.confirm(fallbackMessage || confirmLabel));
  }

  return new Promise((resolve) => {
    modal.addEventListener(
      "close",
      () => {
        resolve(modal.returnValue === "confirm");
      },
      { once: true },
    );
  });
}