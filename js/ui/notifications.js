import { escapeHtml } from "../core/helpers.js";

export function showToast(message, type = "info", duration = 3000) {
  document.getElementById("toast-activo")?.remove();

  const colors = {
    success: { bg: "#e8f5e9", border: "#2d5a27", text: "#2d5a27", icon: "✅" },
    error: { bg: "#ffebee", border: "#c62828", text: "#c62828", icon: "❌" },
    info: { bg: "#e3f2fd", border: "#1565c0", text: "#1565c0", icon: "ℹ️" },
    warning: { bg: "#fff8e1", border: "#f57f17", text: "#f57f17", icon: "⚠️" },
  };
  const color = colors[type] || colors.info;

  const toast = document.createElement("div");
  toast.id = "toast-activo";
  toast.setAttribute("role", "status");
  toast.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: ${color.bg};
    border: 1.5px solid ${color.border};
    color: ${color.text};
    border-radius: 12px;
    padding: 10px 16px;
    font-size: 13px;
    font-weight: 500;
    z-index: 9999;
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 220px;
    max-width: 85vw;
    box-shadow: 0 4px 12px rgba(0,0,0,0.12);
    animation: toastIn 0.2s ease;
  `;

  let dismissTimer = null;
  const dismissToast = () => {
    if (!toast.isConnected) {
      return;
    }

    if (dismissTimer) {
      window.clearTimeout(dismissTimer);
    }

    toast.style.animation = "toastOut 0.2s ease forwards";
    window.setTimeout(() => toast.remove(), 200);
  };

  const timerSvg = `
    <svg width="20" height="20" viewBox="0 0 36 36" style="flex-shrink:0; transform:rotate(-90deg)">
      <circle cx="18" cy="18" r="15"
        fill="none" stroke="${color.border}22" stroke-width="3"/>
      <circle id="toast-timer-circle" cx="18" cy="18" r="15"
        fill="none" stroke="${color.border}" stroke-width="3"
        stroke-dasharray="94.2" stroke-dashoffset="0"
        style="transition: stroke-dashoffset linear ${duration}ms"/>
    </svg>
  `;

  toast.innerHTML = `
    <span style="font-size:16px">${color.icon}</span>
    <span style="flex:1">${escapeHtml(message)}</span>
    ${timerSvg}
    <button type="button" aria-label="Cerrar notificacion" data-toast-close style="width:26px;height:26px;border:0;border-radius:999px;background:${color.border}18;color:${color.text};font-weight:700;line-height:1;cursor:pointer;display:grid;place-items:center;flex-shrink:0;">x</button>
  `;

  if (!document.getElementById("toast-styles")) {
    const style = document.createElement("style");
    style.id = "toast-styles";
    style.textContent = `
      @keyframes toastIn {
        from { opacity: 0; transform: translateX(-50%) translateY(10px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
      @keyframes toastOut {
        from { opacity: 1; transform: translateX(-50%) translateY(0); }
        to { opacity: 0; transform: translateX(-50%) translateY(10px); }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);
  toast.querySelector("[data-toast-close]")?.addEventListener("click", dismissToast);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const circle = toast.querySelector("#toast-timer-circle");
      if (circle) {
        circle.style.strokeDashoffset = "94.2";
      }
    });
  });

  dismissTimer = window.setTimeout(dismissToast, duration);
}

export const showNotification = showToast;
