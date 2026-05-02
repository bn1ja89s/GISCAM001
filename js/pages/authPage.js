export function renderAuthPage() {
  return `
  <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#f5f5f5;padding:24px;box-sizing:border-box;">
    <div style="text-align:center;margin-bottom:28px;">
      <div style="width:64px;height:64px;background:#2d5a27;border-radius:16px;margin:0 auto 12px;display:flex;align-items:center;justify-content:center;font-size:32px;">&#x1F33F;</div>
      <h1 style="color:#2d5a27;font-size:20px;margin:0;">Exploracion Field PWA</h1>
      <p style="color:#888;font-size:13px;margin:4px 0 0;">Captura geoespacial offline</p>
    </div>

    <div style="background:white;border-radius:16px;padding:28px;width:100%;max-width:380px;box-shadow:0 2px 12px rgba(0,0,0,0.1);box-sizing:border-box;">
      <div style="display:flex;margin-bottom:24px;gap:4px;">
        <button id="tab-login" style="flex:1;padding:10px;border:none;border-radius:8px;background:#2d5a27;color:white;font-weight:600;font-size:14px;cursor:pointer;">Iniciar sesion</button>
        <button id="tab-registro" style="flex:1;padding:10px;border:none;border-radius:8px;background:#f5f5f5;color:#888;font-weight:600;font-size:14px;cursor:pointer;">Registrarse</button>
      </div>

      <div id="form-login">
        <div style="margin-bottom:14px;">
          <label style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Correo electronico</label>
          <input id="login-email" type="email" placeholder="correo@ejemplo.com" style="width:100%;padding:12px;border:1.5px solid #e0e0e0;border-radius:8px;margin-top:4px;font-size:15px;box-sizing:border-box;outline:none;">
        </div>
        <div style="margin-bottom:20px;">
          <label style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Contrasena</label>
          <input id="login-password" type="password" placeholder="Minimo 6 caracteres" style="width:100%;padding:12px;border:1.5px solid #e0e0e0;border-radius:8px;margin-top:4px;font-size:15px;box-sizing:border-box;outline:none;">
          <label style="display:flex;align-items:center;gap:8px;margin-top:10px;color:#5f5f5f;font-size:13px;font-weight:500;cursor:pointer;">
            <input type="checkbox" data-password-toggle="login-password" style="width:16px;height:16px;accent-color:#2d5a27;">
            <span>Mostrar contrasena</span>
          </label>
        </div>
        <button id="btn-login" style="width:100%;padding:14px;background:#2d5a27;color:white;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;">Entrar</button>
        <p id="login-error" style="color:#c62828;font-size:13px;text-align:center;margin-top:8px;display:none;"></p>
      </div>

      <div id="form-registro" style="display:none;">
        <div style="margin-bottom:14px;">
          <label style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Nombre completo</label>
          <input id="reg-nombre" type="text" placeholder="Tu nombre completo" style="width:100%;padding:12px;border:1.5px solid #e0e0e0;border-radius:8px;margin-top:4px;font-size:15px;box-sizing:border-box;outline:none;">
        </div>
        <div style="margin-bottom:14px;">
          <label style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Correo electronico</label>
          <input id="reg-email" type="email" placeholder="correo@ejemplo.com" style="width:100%;padding:12px;border:1.5px solid #e0e0e0;border-radius:8px;margin-top:4px;font-size:15px;box-sizing:border-box;outline:none;">
        </div>
        <div style="margin-bottom:20px;">
          <label style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.5px;">Contrasena</label>
          <input id="reg-password" type="password" placeholder="Minimo 6 caracteres" style="width:100%;padding:12px;border:1.5px solid #e0e0e0;border-radius:8px;margin-top:4px;font-size:15px;box-sizing:border-box;outline:none;">
          <label style="display:flex;align-items:center;gap:8px;margin-top:10px;color:#5f5f5f;font-size:13px;font-weight:500;cursor:pointer;">
            <input type="checkbox" data-password-toggle="reg-password" style="width:16px;height:16px;accent-color:#2d5a27;">
            <span>Mostrar contrasena</span>
          </label>
        </div>
        <button id="btn-registro" style="width:100%;padding:14px;background:#2d5a27;color:white;border:none;border-radius:10px;font-size:16px;font-weight:600;cursor:pointer;">Crear cuenta</button>
        <p id="reg-error" style="color:#c62828;font-size:13px;text-align:center;margin-top:8px;display:none;"></p>
      </div>
    </div>
  </div>`;
}
