export function renderInlineLoader(message = "Procesando...") {
  return `
    <div class="stack">
      <div class="loading-bar"></div>
      <p class="muted">${message}</p>
    </div>
  `;
}