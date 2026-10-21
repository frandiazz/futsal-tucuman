/* ==========================================================================
   FUTSAL TUCUMÁN — LOGIN / PANEL VIEW
   Split-screen login, change password, panel tabs
   ========================================================================== */

import { api, endpoints } from '../api.js';
import { state } from '../state.js';
import { confirmModal, escapeHtml, formFieldHtml, formatDate, generateAvatarColor, getInitials, openModal, promptModal, showToast, validateForm } from '../components/index.js';

export async function renderLoginView(params = {}) {
  const container = document.createElement('div');
  container.className = 'login-view';

  // Check if authenticated
  const isAuthed = state.isAuthenticated.value;

  if (isAuthed) {
    return renderPanelView(container);
  }

  // Check if debe_cambiar
  if (state.debeCambiar.value) {
    return renderChangePasswordView(container);
  }

  // Regular login
  return renderLoginForm(container);
}

function renderLoginForm(container) {
  container.innerHTML = `
    <div class="login-split">
      <!-- Brand Side -->
      <div class="login-brand">
        <div class="login-brand__content">
          <div class="login-brand__logo nav__logo" style="width:64px;height:64px;font-size:1.5rem;" aria-hidden="true">FT</div>
          <h1 class="login-brand__title display-md">
            Bienvenido a<br><span>Futsal Tucumán</span>
          </h1>
          <p class="login-brand__desc body-lg">
            Panel de gestión para la Asociación Tucumana de Fútbol de Salón
          </p>
          <div class="login-brand__features">
            <div class="login-brand__feature">
              <svg class="login-brand__feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 11l3 3L22 4"></path><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>
              <span>Cargar resultados en segundos</span>
            </div>
            <div class="login-brand__feature">
              <svg class="login-brand__feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><path d="M8 21h8M12 17v4"></path></svg>
              <span>Tablas automáticas en tiempo real</span>
            </div>
            <div class="login-brand__feature">
              <svg class="login-brand__feature-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
              <span>Seguridad bancaria (scrypt + cookies firmadas)</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Form Side -->
      <div class="login-form">
        <header class="login-form__header">
          <h2 class="login-form__title display-md">Iniciar sesión</h2>
          <p class="login-form__subtitle body-sm">Ingresá tus credenciales para acceder al panel</p>
        </header>

        <form class="login-form__body" id="login-form" novalidate>
          ${formFieldHtml({
            type: 'text',
            label: 'Usuario',
            name: 'usuario',
            placeholder: 'admin',
            required: true,
            autocomplete: 'username',
            floating: true,
          })}

          ${formFieldHtml({
            type: 'password',
            label: 'Clave',
            name: 'clave',
            placeholder: '••••••••',
            required: true,
            autocomplete: 'current-password',
            floating: true,
          })}

          <button type="submit" class="btn btn--primary btn--lg btn--block login-form__submit">
            <span class="btn-text">Entrar al panel</span>
            <span class="btn-loading" hidden>Cargando...</span>
          </button>
        </form>

        <footer class="login-form__footer">
          <a href="#/panel" class="login-form__link" id="forgot-link">¿Olvidaste tu clave?</a>
          <div class="login-form__divider"><span>Sitio no oficial ATFUTS</span></div>
        </footer>
      </div>
    </div>
  `;

  // Form handler
  const form = container.querySelector('#login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleLogin(form);
  });

  // Forgot password
  container.querySelector('#forgot-link').addEventListener('click', async (e) => {
    e.preventDefault();
    await handleForgotPassword();
  });

  // Focus first input
  setTimeout(() => form.querySelector('input').focus(), 100);

  return container;
}

async function handleLogin(form) {
  const submitBtn = form.querySelector('button[type="submit"]');
  const btnText = submitBtn.querySelector('.btn-text');
  const btnLoading = submitBtn.querySelector('.btn-loading');

  submitBtn.disabled = true;
  btnText.hidden = true;
  btnLoading.hidden = false;

  const formData = new FormData(form);
  const data = {
    usuario: formData.get('usuario'),
    clave: formData.get('clave'),
  };

  try {
    const result = await endpoints.login(data);
    state.user.value = { usuario: result.usuario, rol: result.rol };
    state.isAuthenticated.value = true;
    state.debeCambiar.value = result.debe_cambiar || false;

    showToast(`Bienvenido, ${result.usuario}`, 'success');

    // Re-renderizar la vista actual (puede que ya estemos en #/panel y el
    // hash no cambie, por eso no sirve solo con location.hash = ...)
    window.dispatchEvent(new CustomEvent('auth:changed'));
  } catch (error) {
    showToast(error.message || 'Credenciales inválidas', 'error');
    submitBtn.disabled = false;
    btnText.hidden = false;
    btnLoading.hidden = true;
  }
}

async function handleForgotPassword() {
  const { value: usuario } = await promptModal(
    'Ingresá tu usuario para que el administrador pueda resetearte la clave',
    'Recuperar clave',
    '',
    { label: 'Usuario', confirmText: 'Continuar' }
  );

  if (!usuario) return;

  try {
    await endpoints.resetClave({ usuario });
    showToast('Se generó una clave temporal. Pedila al administrador.', 'success');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderChangePasswordView(container) {
  container.innerHTML = `
    <div class="login-split">
      <div class="login-brand">
        <div class="login-brand__content">
          <div class="login-brand__logo nav__logo" style="width:64px;height:64px;font-size:1.5rem;" aria-hidden="true">FT</div>
          <h1 class="login-brand__title display-md">Cambiar <span>clave inicial</span></h1>
          <p class="login-brand__desc body-lg">Por seguridad, debés establecer una nueva clave personal</p>
        </div>
      </div>

      <div class="login-form">
        <header class="login-form__header">
          <h2 class="login-form__title display-md">Nueva clave</h2>
          <p class="login-form__subtitle body-sm">Mínimo 8 caracteres</p>
        </header>

        <form class="login-form__body" id="change-pwd-form" novalidate>
          ${formFieldHtml({
            type: 'password',
            label: 'Clave actual',
            name: 'actual',
            placeholder: 'Clave temporal',
            required: true,
            autocomplete: 'current-password',
            floating: true,
          })}

          ${formFieldHtml({
            type: 'password',
            label: 'Nueva clave',
            name: 'nueva',
            placeholder: 'Mín. 8 caracteres',
            required: true,
            autocomplete: 'new-password',
            floating: true,
          })}

          ${formFieldHtml({
            type: 'password',
            label: 'Confirmar clave',
            name: 'confirmar',
            placeholder: 'Repetí la nueva clave',
            required: true,
            autocomplete: 'new-password',
            floating: true,
          })}

          <div id="pwd-strength" class="password-strength" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="margin:var(--space-3) 0">
            <div class="password-strength__bar" style="width:0%"></div>
          </div>
          <div class="password-strength__labels">
            <span>Débil</span><span>Justa</span><span>Buena</span><span>Fuerte</span>
          </div>

          <button type="submit" class="btn btn--primary btn--lg btn--block login-form__submit">
            <span class="btn-text">Actualizar clave</span>
            <span class="btn-loading" hidden>Guardando...</span>
          </button>
        </form>
      </div>
    </div>
  `;

  const form = container.querySelector('#change-pwd-form');
  const nuevaInput = form.querySelector('[name="nueva"]');
  const strengthBar = container.querySelector('.password-strength__bar');
  const strengthLabels = container.querySelectorAll('.password-strength__labels span');

  // Password strength meter
  nuevaInput.addEventListener('input', () => {
    const val = nuevaInput.value;
    let score = 0;
    if (val.length >= 8) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[a-z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;

    const pct = (score / 5) * 100;
    strengthBar.style.width = `${pct}%`;
    strengthBar.style.background = score <= 1 ? 'var(--color-error)' : score <= 2 ? 'var(--color-warning)' : score <= 3 ? 'var(--color-accent-green)' : 'var(--color-accent-yellow)';

    strengthLabels.forEach((label, i) => {
      label.style.color = i < score ? 'var(--color-text-primary)' : 'var(--color-text-muted)';
      label.style.fontWeight = i < score ? '600' : '400';
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const actual = form.querySelector('[name="actual"]').value;
    const nueva = nuevaInput.value;
    const confirmar = form.querySelector('[name="confirmar"]').value;

    if (nueva !== confirmar) {
      showToast('Las claves no coinciden', 'error');
      return;
    }

    if (nueva.length < 8) {
      showToast('La clave debe tener al menos 8 caracteres', 'error');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.querySelector('.btn-text').hidden = true;
    submitBtn.querySelector('.btn-loading').hidden = false;

    try {
      await endpoints.changePassword({ actual, nueva });
      state.debeCambiar.value = false;
      showToast('Clave actualizada correctamente', 'success');
      window.dispatchEvent(new CustomEvent('auth:changed'));
    } catch (error) {
      showToast(error.message, 'error');
      submitBtn.disabled = false;
      submitBtn.querySelector('.btn-text').hidden = false;
      submitBtn.querySelector('.btn-loading').hidden = true;
    }
  });

  setTimeout(() => form.querySelector('[name="actual"]').focus(), 100);

  return container;
}

async function renderPanelView(container) {
  // Load comps for selectors
  if (!state.comps.value.length) {
    const comps = await endpoints.comps();
    state.comps.value = comps;
  }

  const comps = state.comps.value;
  const currentCompId = state.panelComp.value || comps[0]?.id;
  const currentComp = comps.find(c => c.id === currentCompId);
  const equipos = currentComp ? await endpoints.equipos(currentCompId) : [];
  const isAdmin = state.user.value?.rol === 'admin';

  container.innerHTML = `
    <div class="container">
      <header class="panel-view__header">
        <div>
          <h1 class="panel-view__title display-md">Panel de <span class="text-accent-y">gestión</span></h1>
        </div>
        <div class="panel-view__user">
          ${state.user.value ? `
            <div class="avatar avatar--sm" style="background:${generateAvatarColor(state.user.value.usuario)};color:#07130C">${getInitials(state.user.value.usuario)}</div>
            <div class="panel-view__user-info">
              <span class="panel-view__user-name">${escapeHtml(state.user.value.usuario)}</span>
              <span class="panel-view__user-role badge badge--${isAdmin ? 'primary' : 'neutral'}">${state.user.value.rol}</span>
            </div>
          ` : ''}
          <button class="btn btn--ghost btn--sm" data-action="logout">Salir</button>
        </div>
      </header>

      <!-- Tabs -->
      <nav class="panel-tabs" role="tablist" aria-label="Secciones del panel">
        <button class="panel-tabs__trigger" role="tab" aria-selected="true" data-tab="res">Cargar resultado</button>
        ${isAdmin ? `
          <button class="panel-tabs__trigger" role="tab" aria-selected="false" data-tab="eq">Inscribir equipo</button>
          <button class="panel-tabs__trigger" role="tab" aria-selected="false" data-tab="rs">Reservas</button>
          <button class="panel-tabs__trigger" role="tab" aria-selected="false" data-tab="co">Cobros</button>
          <button class="panel-tabs__trigger" role="tab" aria-selected="false" data-tab="us">Usuarios</button>
          <button class="panel-tabs__trigger" role="tab" aria-selected="false" data-tab="media">Medios</button>
        ` : ''}
      </nav>

      <!-- Panel Content -->
      <div class="panel-content" id="panel-content">
        ${renderPanelTab('res', { comps, currentComp, equipos })}
      </div>
    </div>
  `;

  // Tab switching
  container.querySelector('.panel-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;

    const tab = btn.dataset.tab;
    container.querySelectorAll('.panel-tabs__trigger').forEach(b => {
      b.setAttribute('aria-selected', b === btn);
    });

    const content = container.querySelector('#panel-content');
    content.innerHTML = renderPanelTab(tab, { comps, currentComp, equipos });

    // Re-attach form handlers
    attachPanelFormHandlers(content, { comps, currentComp, equipos });
  });

  // Logout
  container.querySelector('[data-action="logout"]').addEventListener('click', async (e) => {
    e.preventDefault();
    await endpoints.logout();
    state.user.value = null;
    state.isAuthenticated.value = false;
    state.debeCambiar.value = false;
    showToast('Sesión cerrada', 'success');
    window.dispatchEvent(new CustomEvent('auth:changed'));
  });

  // Initial form handlers
  attachPanelFormHandlers(container.querySelector('#panel-content'), { comps, currentComp, equipos });

  return container;
}

function renderPanelTab(tab, { comps, currentComp, equipos }) {
  const compOptions = comps.map(c => `<option value="${c.id}">${escapeHtml(c.division)}${c.zona ? ` · ${escapeHtml(c.zona)}` : ''}</option>`).join('');
  const eqOpts = equipos.map(e => ({ value: e.id, label: e.nombre }));

  const sel = `<div class="form-field" style="margin-bottom:var(--space-4)"><label class="form-label" for="panel-comp">División</label><select class="form-select" id="panel-comp" name="comp">${compOptions}</select></div>`;

  switch (tab) {
    case 'res':
      return `
        <div class="panel-form">${sel}</div>
        <form class="panel-form" id="panel-res-form">
          <div class="panel-form__grid">
            ${formFieldHtml({ type: 'select', label: 'Local', name: 'local', required: true, options: eqOpts, floating: false })}
            ${formFieldHtml({ type: 'number', label: 'Goles local', name: 'gl', min: 0, max: 99, value: 0, inputMode: 'numeric', floating: false })}
            ${formFieldHtml({ type: 'select', label: 'Visitante', name: 'visitante', required: true, options: eqOpts, floating: false })}
            ${formFieldHtml({ type: 'number', label: 'Goles visitante', name: 'gv', min: 0, max: 99, value: 0, inputMode: 'numeric', floating: false })}
          </div>
          <div class="panel-form__actions">
            <button type="submit" class="btn btn--primary">Guardar resultado</button>
          </div>
        </form>
        <div class="panel-list" id="recent-results">
          <h3 class="title-sm" style="padding:var(--space-4) var(--space-6); border-bottom:1px solid var(--color-border-subtle)">Últimos cargados</h3>
        </div>
      `;

    case 'eq':
      return `
        <div class="panel-form">${sel}</div>
        <form class="panel-form" id="panel-eq-form">
          <div class="panel-form__grid">
            ${formFieldHtml({ type: 'text', label: 'Nombre del equipo', name: 'nombre', required: true, maxLength: 80, floating: false })}
          </div>
          <div class="panel-form__actions">
            <button type="submit" class="btn btn--primary">Inscribir equipo</button>
          </div>
        </form>
      `;

    case 'rs':
      return `
        <form class="panel-form" id="panel-rs-form">
          <div class="panel-form__grid">
            ${formFieldHtml({ type: 'select', label: 'Sede', name: 'sede', required: true, options: ['La Usina', 'La Diagonal', 'Complejo Avellaneda', 'Complejo Natalio Mirkin'].map(s => ({ value: s, label: s })), floating: false })}
            ${formFieldHtml({ type: 'select', label: 'Cancha', name: 'cancha', required: true, options: [{ value: 'Cancha 1', label: 'Cancha 1' }, { value: 'Cancha 2', label: 'Cancha 2' }], floating: false })}
            ${formFieldHtml({ type: 'date', label: 'Fecha', name: 'fecha', required: true, floating: false })}
            ${formFieldHtml({ type: 'time', label: 'Horario', name: 'hora', required: true, floating: false })}
            ${formFieldHtml({ type: 'text', label: 'Detalle', name: 'detalle', maxLength: 120, placeholder: 'Opcional', floating: false })}
          </div>
          <div class="panel-form__actions">
            <button type="submit" class="btn btn--primary">Reservar</button>
          </div>
        </form>
        <div class="panel-list" id="reservas-list">
          <h3 class="title-sm" style="padding:var(--space-4) var(--space-6); border-bottom:1px solid var(--color-border-subtle)">Reservas existentes</h3>
        </div>
      `;

    case 'co':
      return `
        <div class="panel-form">${sel}</div>
        <form class="panel-form" id="panel-co-form">
          <div class="panel-form__grid">
            ${formFieldHtml({ type: 'select', label: 'Equipo', name: 'equipo', required: true, options: eqOpts, floating: false })}
            ${formFieldHtml({ type: 'select', label: 'Concepto', name: 'concepto', required: true, options: [{ value: 'Inscripción', label: 'Inscripción' }, { value: 'Pago por partido', label: 'Pago por partido' }], floating: false })}
            ${formFieldHtml({ type: 'number', label: 'Monto ($)', name: 'monto', min: 1, step: 100, required: true, inputMode: 'numeric', floating: false })}
          </div>
          <div class="panel-form__actions">
            <button type="submit" class="btn btn--primary">Registrar pago</button>
          </div>
        </form>
        <div class="panel-list" id="pagos-list">
          <h3 class="title-sm" style="padding:var(--space-4) var(--space-6); border-bottom:1px solid var(--color-border-subtle)">Pagos registrados</h3>
        </div>
      `;

    case 'us':
      return `
        <form class="panel-form" id="panel-us-form">
          <div class="panel-form__grid">
            ${formFieldHtml({ type: 'text', label: 'Usuario', name: 'usuario', required: true, maxLength: 30, floating: false })}
            ${formFieldHtml({ type: 'password', label: 'Clave (mín. 8)', name: 'clave', required: true, floating: false })}
            ${formFieldHtml({ type: 'select', label: 'Rol', name: 'rol', required: true, options: [{ value: 'planillero', label: 'Planillero' }, { value: 'admin', label: 'Admin' }], floating: false })}
          </div>
          <div class="panel-form__actions">
            <button type="submit" class="btn btn--primary">Crear usuario</button>
          </div>
        </form>
        <div class="panel-list" id="usuarios-list">
          <h3 class="title-sm" style="padding:var(--space-4) var(--space-6); border-bottom:1px solid var(--color-border-subtle)">Usuarios</h3>
        </div>
      `;

    case 'media':
      return `
        <div class="media-admin">
          <header class="media-admin__header">
            <h2 class="media-admin__title display-md">Gestión de medios</h2>
            <div id="media-upload"></div>
          </header>
          <div class="media-admin__grid" id="media-grid"></div>
        </div>
      `;

    default:
      return '';
  }
}

function attachPanelFormHandlers(content, context) {
  // Resultado form
  const resForm = content.querySelector('#panel-res-form');
  if (resForm) {
    resForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(resForm);
      const compSelect = content.querySelector('#panel-comp');
      try {
        await endpoints.crearResultado({
          comp: +(compSelect?.value || data.get('comp') || context.currentComp?.id),
          local: +data.get('local'),
          visitante: +data.get('visitante'),
          gl: +data.get('gl'),
          gv: +data.get('gv'),
        });
        showToast('Resultado guardado', 'success');
        resForm.reset();
        loadRecentResults(content);
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
    loadRecentResults(content);
  }

  // Equipo form
  const eqForm = content.querySelector('#panel-eq-form');
  if (eqForm) {
    eqForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(eqForm);
      const compSelect = content.querySelector('#panel-comp');
      try {
        await endpoints.crearEquipo({
          comp: +(compSelect?.value || data.get('comp') || context.currentComp?.id),
          nombre: data.get('nombre'),
        });
        showToast('Equipo inscripto', 'success');
        eqForm.reset();
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
  }

  // Reserva form
  const rsForm = content.querySelector('#panel-rs-form');
  if (rsForm) {
    rsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(rsForm);
      try {
        await endpoints.crearReserva({
          sede: data.get('sede'),
          cancha: data.get('cancha'),
          fecha: data.get('fecha'),
          hora: data.get('hora'),
          detalle: data.get('detalle') || '',
        });
        showToast('Reserva confirmada', 'success');
        rsForm.reset();
        loadReservasList(content);
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
    loadReservasList(content);
  }

  // Pago form
  const coForm = content.querySelector('#panel-co-form');
  if (coForm) {
    coForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(coForm);
      try {
        await endpoints.crearPago({
          equipo: +data.get('equipo'),
          concepto: data.get('concepto'),
          monto: +data.get('monto'),
        });
        showToast('Pago registrado', 'success');
        coForm.reset();
        loadPagosList(content);
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
    loadPagosList(content);
  }

  // Usuario form
  const usForm = content.querySelector('#panel-us-form');
  if (usForm) {
    usForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const data = new FormData(usForm);
      try {
        await endpoints.crearUsuario({
          usuario: data.get('usuario'),
          clave: data.get('clave'),
          rol: data.get('rol'),
        });
        showToast('Usuario creado', 'success');
        usForm.reset();
        loadUsuariosList(content);
      } catch (error) {
        showToast(error.message, 'error');
      }
    });
    loadUsuariosList(content);
  }

  // Media upload
  const mediaUpload = content.querySelector('#media-upload');
  if (mediaUpload) {
    import('../components/index.js').then(({ createImageUpload }) => {
      const upload = createImageUpload({
        multiple: true,
        maxFiles: 10,
        onUpload: (files) => {
          showToast(`${files.length} imagen(es) lista(s) para subir`, 'success');
        },
      });
      mediaUpload.appendChild(upload);
    });
  }
}

async function loadRecentResults(content) {
  const list = content.querySelector('#recent-results');
  if (!list) return;

  try {
    const data = await endpoints.partidos();
    list.innerHTML = data.slice(0, 8).map(p => `
      <div class="panel-list__item">
        <div class="panel-list__info">
          <span class="panel-list__name">${escapeHtml(p.local)} ${p.gl} - ${p.gv} ${escapeHtml(p.visitante)}</span>
          <div class="panel-list__meta">${escapeHtml(p.division)} · ${formatDate(p.creado)}</div>
        </div>
      </div>
    `).join('') || '<p class="text-muted" style="padding:var(--space-4) var(--space-6)">Todavía no se cargaron resultados.</p>';
  } catch {}
}

async function loadReservasList(content) {
  const list = content.querySelector('#reservas-list');
  if (!list) return;

  try {
    const data = await endpoints.reservas();
    list.innerHTML = data.map(r => `
      <div class="panel-list__item">
        <div class="panel-list__info">
          <span class="panel-list__name">${escapeHtml(r.sede)} · ${escapeHtml(r.cancha)}</span>
          <div class="panel-list__meta">${r.fecha} ${r.hora} — ${escapeHtml(r.detalle || 'sin detalle')}</div>
        </div>
      </div>
    `).join('') || '<p class="text-muted" style="padding:var(--space-4) var(--space-6)">No hay reservas cargadas.</p>';
  } catch {}
}

async function loadPagosList(content) {
  const list = content.querySelector('#pagos-list');
  if (!list) return;

  try {
    const data = await endpoints.pagos();
    list.innerHTML = data.map(p => `
      <div class="panel-list__item">
        <div class="panel-list__info">
          <span class="panel-list__name">${escapeHtml(p.equipo)} · ${escapeHtml(p.division)}</span>
          <div class="panel-list__meta">${escapeHtml(p.concepto)} · $${p.monto} · ${p.habilitado ? '<span class="badge badge--success">Habilitado</span>' : '<span class="badge badge--error">Sin inscripción</span>'}</div>
        </div>
      </div>
    `).join('') || '<p class="text-muted" style="padding:var(--space-4) var(--space-6)">No hay pagos registrados.</p>';
  } catch {}
}

async function loadUsuariosList(content) {
  const list = content.querySelector('#usuarios-list');
  if (!list) return;

  try {
    const data = await endpoints.usuarios();
    list.innerHTML = data.map(u => `
      <div class="panel-list__item">
        <div class="panel-list__info">
          <span class="panel-list__name">${escapeHtml(u.usuario)}</span>
          <div class="panel-list__meta"><span class="badge badge--${u.rol === 'admin' ? 'primary' : 'neutral'}">${escapeHtml(u.rol)}</span> ${u.debe_cambiar ? '<span class="badge badge--warning">Cambiar clave</span>' : ''}</div>
        </div>
        <div class="panel-list__actions">
          <button class="btn btn--ghost btn--sm" data-action="reset" data-user="${escapeHtml(u.usuario)}">Reset clave</button>
        </div>
      </div>
    `).join('');

    // Reset handlers
    list.querySelectorAll('[data-action="reset"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const confirmed = await confirmModal(
          `¿Resetear la clave de ${btn.dataset.user}? Se generará una clave temporal.`,
          'Confirmar reset'
        );
        if (confirmed) {
          try {
            const { clave } = await endpoints.resetClave({ usuario: btn.dataset.user });
            showToast(`Clave nueva para ${btn.dataset.user}: ${clave}`, 'success', 'Clave generada');
          } catch (error) {
            showToast(error.message, 'error');
          }
        }
      });
    });
  } catch {}
}

