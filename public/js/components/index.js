/* ==========================================================================
   FUTSAL TUCUMÁN — UI COMPONENTS
   Reusable Web Components / Functions for premium UI
   ========================================================================== */

import { state, showToast, dismissToast } from '../state.js';
import { api, endpoints } from '../api.js';

/* ────────────────────────────────────────────────────────────────────────
   TOAST SYSTEM
   ──────────────────────────────────────────────────────────────────────── */

let toastContainer = null;

function ensureToastContainer() {
  if (!toastContainer) {
    toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.id = 'toast-container';
      toastContainer.className = 'toast-container';
      toastContainer.setAttribute('aria-live', 'polite');
      toastContainer.setAttribute('aria-label', 'Notificaciones');
      document.body.appendChild(toastContainer);
    }
  }
  return toastContainer;
}

function createToastElement(toast) {
  const el = document.createElement('div');
  el.className = `toast toast--${toast.type}`;
  el.dataset.toastId = toast.id;
  el.innerHTML = `
    <svg class="toast__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
      ${toast.type === 'success' ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>' : ''}
      ${toast.type === 'error' ? '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>' : ''}
      ${toast.type === 'warning' ? '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>' : ''}
      ${toast.type === 'info' ? '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>' : ''}
    </svg>
    <div class="toast__content">
      ${toast.title ? `<div class="toast__title">${escapeHtml(toast.title)}</div>` : ''}
      <div class="toast__message">${escapeHtml(toast.message)}</div>
    </div>
    <button class="toast__close" aria-label="Cerrar notificación">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
    </button>
  `;
  
  el.querySelector('.toast__close').addEventListener('click', () => dismissToast(toast.id));
  
  // Animate in
  requestAnimationFrame(() => {
    el.style.animation = 'toast-in 200ms cubic-bezier(0.16, 1, 0.3, 1) forwards';
  });
  
  return el;
}

// Subscribe to toast state
state.toasts.subscribe((toasts) => {
  const container = ensureToastContainer();
  const existingIds = new Set(Array.from(container.children).map(el => el.dataset.toastId));
  const currentIds = new Set(toasts.map(t => String(t.id)));
  
  // Remove dismissed
  for (const el of container.children) {
    if (!currentIds.has(el.dataset.toastId)) {
      el.style.animation = 'toast-out 150ms cubic-bezier(0.4, 0, 0.2, 1) forwards';
      setTimeout(() => el.remove(), 150);
    }
  }
  
  // Add new
  for (const toast of toasts) {
    if (!existingIds.has(String(toast.id))) {
      container.appendChild(createToastElement(toast));
    }
  }
});

/* ────────────────────────────────────────────────────────────────────────
   MODAL SYSTEM
   ──────────────────────────────────────────────────────────────────────── */

let modalRoot = null;
let activeModal = null;
let focusStack = [];

function ensureModalRoot() {
  if (!modalRoot) {
    modalRoot = document.getElementById('modal-root');
    if (!modalRoot) {
      modalRoot = document.createElement('div');
      modalRoot.id = 'modal-root';
      document.body.appendChild(modalRoot);
    }
  }
  return modalRoot;
}

export function openModal(content, options = {}) {
  const { size = 'md', closeOnOverlay = true, closeOnEscape = true, onClose } = options;
  
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal--${size}" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      ${content}
    </div>
  `;
  
  const modal = overlay.querySelector('.modal');
  
  // Focus management
  const previousActive = document.activeElement;
  focusStack.push(previousActive);
  
  const close = () => {
    overlay.classList.remove('modal-overlay--open');
    modal.style.transform = 'scale(0.95) translateY(20px)';
    setTimeout(() => {
      overlay.remove();
      activeModal = null;
      if (focusStack.length) {
        const prev = focusStack.pop();
        if (prev && typeof prev.focus === 'function') prev.focus();
      }
      if (onClose) onClose();
    }, 200);
  };
  
  // Close handlers
  if (closeOnOverlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  }
  
  if (closeOnEscape) {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', handleEscape);
        close();
      }
    };
    document.addEventListener('keydown', handleEscape);
    overlay._escapeHandler = handleEscape;
  }
  
  // Trap focus
  const focusable = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
  const firstFocusable = focusable[0];
  const lastFocusable = focusable[focusable.length - 1];
  
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      if (e.shiftKey && document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable.focus();
      } else if (!e.shiftKey && document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable.focus();
      }
    }
  });
  
  const root = ensureModalRoot();
  root.appendChild(overlay);
  activeModal = { close, overlay };
  
  // Animate in
  requestAnimationFrame(() => {
    overlay.classList.add('modal-overlay--open');
    firstFocusable?.focus();
  });
  
  return { close };
}

export function closeModal() {
  if (activeModal) activeModal.close();
}

export function confirmModal(message, title = 'Confirmar', options = {}) {
  return new Promise((resolve) => {
    openModal(`
      <div class="modal__header">
        <h2 class="modal__title" id="modal-title">${escapeHtml(title)}</h2>
        <button class="modal__close" aria-label="Cerrar"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
      </div>
      <div class="modal__body">
        <p>${escapeHtml(message)}</p>
      </div>
      <div class="modal__footer">
        <button class="btn btn--ghost" data-action="cancel">Cancelar</button>
        <button class="btn btn--${options.danger ? 'danger' : 'primary'}" data-action="confirm">${options.confirmText || 'Confirmar'}</button>
      </div>
    `, { onClose: () => resolve(false) });
    
    const overlay = document.querySelector('.modal-overlay');
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => { closeModal(); resolve(false); });
    overlay.querySelector('[data-action="confirm"]').addEventListener('click', () => { closeModal(); resolve(true); });
  });
}

export function promptModal(message, title = '', defaultValue = '', options = {}) {
  return new Promise((resolve) => {
    openModal(`
      <div class="modal__header">
        <h2 class="modal__title" id="modal-title">${escapeHtml(title)}</h2>
        <button class="modal__close" aria-label="Cerrar"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>
      </div>
      <div class="modal__body">
        <p>${escapeHtml(message)}</p>
        <div class="form-field form-field--floating" style="margin-top: var(--space-4);">
          <input type="${options.type || 'text'}" class="form-input" id="prompt-input" value="${escapeHtml(defaultValue)}" autocomplete="off">
          <label class="form-label" for="prompt-input">${options.label || 'Valor'}</label>
        </div>
      </div>
      <div class="modal__footer">
        <button class="btn btn--ghost" data-action="cancel">Cancelar</button>
        <button class="btn btn--primary" data-action="confirm">${options.confirmText || 'Aceptar'}</button>
      </div>
    `, { onClose: () => resolve(null) });
    
    const overlay = document.querySelector('.modal-overlay');
    const input = overlay.querySelector('#prompt-input');
    input.focus();
    input.select();
    
    const submit = () => {
      closeModal();
      resolve(input.value);
    };
    
    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => { closeModal(); resolve(null); });
    overlay.querySelector('[data-action="confirm"]').addEventListener('click', submit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  });
}

/* ────────────────────────────────────────────────────────────────────────
   TABLE COMPONENT — Virtualizable, sortable
   ──────────────────────────────────────────────────────────────────────── */

export function createTable({ 
  columns, 
  data, 
  keyField = 'id',
  sortable = true,
  responsive = true,
  className = '',
  rowClass = () => '',
  renderRow,
  emptyMessage = 'No hay datos para mostrar',
  loading = false,
}) {
  // En mobile la tabla se convierte en cards (el wrapper lleva el modificador
  // para que el CSS pueda cambiar el layout: .table-wrapper--cards .table)
  const wrapper = document.createElement('div');
  wrapper.className = `table-wrapper ${responsive ? 'table-wrapper--cards' : ''} ${className}`;
  
  if (loading) {
    wrapper.innerHTML = '<div class="table-skeleton"></div>';
    return wrapper;
  }
  
  if (!data.length) {
    wrapper.innerHTML = `
      <div class="empty-state" style="padding: var(--space-12);">
        <svg class="empty-state__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
        <p class="empty-state__desc">${escapeHtml(emptyMessage)}</p>
      </div>
    `;
    return wrapper;
  }
  
  const table = document.createElement('table');
  table.className = 'table';
  
  // Header
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>${columns.map(col => `
    <th 
      scope="col" 
      ${col.sortable && sortable ? `aria-sort="none" style="cursor:pointer" data-sort="${col.key}"` : ''}
      ${col.width ? `style="width:${col.width}"` : ''}
      ${col.align ? `style="text-align:${col.align}"` : ''}
    >
      ${escapeHtml(col.label)}
      ${col.sortable && sortable ? '<span class="sort-indicator" aria-hidden="true"></span>' : ''}
    </th>
  `).join('')}</tr>`;
  table.appendChild(thead);
  
  // Body
  const tbody = document.createElement('tbody');
  
  const render = () => {
    tbody.innerHTML = data.map((item, index) => {
      const rowClassName = rowClass(item, index);
      const cells = columns.map(col => {
        const value = col.render ? col.render(item, col.key) : item[col.key];
        const attrs = [];
        if (col.align) attrs.push(`style="text-align:${col.align}"`);
        attrs.push(`data-label="${escapeHtml(col.label)}"`);
        return `<td ${attrs.join(' ')}>${value ?? ''}</td>`;
      }).join('');
      
      if (renderRow) {
        return renderRow(item, index);
      }
      
      return `<tr class="${rowClassName}" data-${keyField}="${item[keyField]}">${cells}</tr>`;
    }).join('');
  };
  
  render();
  table.appendChild(tbody);
  wrapper.appendChild(table);
  
  // Sort handlers
  if (sortable) {
    thead.querySelectorAll('[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        const currentSort = th.getAttribute('aria-sort');
        const newSort = currentSort === 'ascending' ? 'descending' : 'ascending';
        
        // Update all headers
        thead.querySelectorAll('[data-sort]').forEach(h => h.setAttribute('aria-sort', 'none'));
        th.setAttribute('aria-sort', newSort);
        
        // Sort data
        data.sort((a, b) => {
          const av = a[key], bv = b[key];
          if (av === bv) return 0;
          const dir = newSort === 'ascending' ? 1 : -1;
          if (av === null || av === undefined) return dir;
          if (bv === null || bv === undefined) return -dir;
          return (av > bv ? 1 : -1) * dir;
        });
        
        render();
      });
    });
  }
  
  // Update method
  wrapper.update = (newData) => {
    data.length = 0;
    data.push(...newData);
    render();
  };
  
  wrapper.append = (item) => {
    data.push(item);
    render();
  };
  
  wrapper.remove = (keyValue) => {
    const idx = data.findIndex(d => d[keyField] === keyValue);
    if (idx !== -1) {
      data.splice(idx, 1);
      render();
    }
  };
  
  return wrapper;
}

/* ────────────────────────────────────────────────────────────────────────
   FORM HELPERS
   ──────────────────────────────────────────────────────────────────────── */

export function createFormField({ 
  type = 'text', 
  label, 
  name, 
  value = '', 
  placeholder = '',
  required = false,
  disabled = false,
  readonly = false,
  error = null,
  hint = null,
  floating = true,
  options = [], // for select
  autocomplete = 'off',
  inputMode = null,
  min = null,
  max = null,
  step = null,
  maxLength = null,
  pattern = null,
}) {
  const wrapper = document.createElement('div');
  wrapper.className = `form-field ${floating ? 'form-field--floating' : ''}`;
  
  let inputHtml = '';
  const attrs = [
    `type="${type}"`,
    `class="form-input${error ? ' form-input--invalid' : ''}"`,
    `id="${name}"`,
    `name="${name}"`,
    `value="${escapeHtml(value)}"`,
    placeholder ? `placeholder="${escapeHtml(placeholder)}"` : '',
    required ? 'required' : '',
    disabled ? 'disabled' : '',
    readonly ? 'readonly' : '',
    autocomplete ? `autocomplete="${autocomplete}"` : '',
    inputMode ? `inputmode="${inputMode}"` : '',
    min !== null ? `min="${min}"` : '',
    max !== null ? `max="${max}"` : '',
    step !== null ? `step="${step}"` : '',
    maxLength !== null ? `maxlength="${maxLength}"` : '',
    pattern ? `pattern="${pattern}"` : '',
  ].filter(Boolean).join(' ');
  
  if (type === 'select') {
    inputHtml = `<select ${attrs.replace('class="form-input', 'class="form-select form-input')}>`;
    if (placeholder) inputHtml += `<option value="" disabled selected hidden>${escapeHtml(placeholder)}</option>`;
    inputHtml += options.map(opt => `<option value="${escapeHtml(opt.value)}" ${opt.value === value ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`).join('');
    inputHtml += '</select>';
  } else if (type === 'textarea') {
    inputHtml = `<textarea ${attrs.replace('class="form-input', 'class="form-input"').replace(/type="textarea"/, '')}>${escapeHtml(value)}</textarea>`;
  } else {
    inputHtml = `<input ${attrs}>`;
  }
  
  wrapper.innerHTML = `
    ${inputHtml}
    ${floating && label ? `<label class="form-label" for="${name}">${escapeHtml(label)}</label>` : ''}
    ${!floating && label ? `<label class="form-label">${escapeHtml(label)}</label>` : ''}
    ${error ? `<div class="form-message form-message--error" aria-live="polite">${escapeHtml(error)}</div>` : ''}
    ${hint && !error ? `<div class="form-message form-message--hint">${escapeHtml(hint)}</div>` : ''}
  `;
  
  return wrapper;
}

// Retorna el HTML de un campo de formulario (para usar dentro de template strings)
export function formFieldHtml(props) {
  return createFormField(props).outerHTML;
}

export function serializeForm(form) {
  const data = {};
  new FormData(form).forEach((value, key) => {
    if (data[key]) {
      // Handle multiple values (checkboxes, multi-select)
      if (!Array.isArray(data[key])) data[key] = [data[key]];
      data[key].push(value);
    } else {
      data[key] = value;
    }
  });
  return data;
}

export function validateForm(form, rules) {
  const data = serializeForm(form);
  const errors = {};
  
  for (const [field, rule] of Object.entries(rules)) {
    const value = data[field];
    
    if (rule.required && (!value || (Array.isArray(value) && !value.length))) {
      errors[field] = rule.message || 'Este campo es obligatorio';
      continue;
    }
    
    if (value && rule.minLength && value.length < rule.minLength) {
      errors[field] = rule.message || `Mínimo ${rule.minLength} caracteres`;
    }
    
    if (value && rule.maxLength && value.length > rule.maxLength) {
      errors[field] = rule.message || `Máximo ${rule.maxLength} caracteres`;
    }
    
    if (value && rule.pattern && !rule.pattern.test(value)) {
      errors[field] = rule.message || 'Formato inválido';
    }
    
    if (value && rule.custom) {
      const customError = rule.custom(value, data);
      if (customError) errors[field] = customError;
    }
  }
  
  // Apply errors to form
  for (const [field, error] of Object.entries(errors)) {
    const input = form.querySelector(`[name="${field}"]`);
    if (input) {
      input.classList.add('form-input--invalid');
      input.classList.remove('form-input--valid');
      let msg = input.parentElement.querySelector('.form-message--error');
      if (!msg) {
        msg = document.createElement('div');
        msg.className = 'form-message form-message--error';
        input.parentElement.appendChild(msg);
      }
      msg.textContent = error;
    }
  }
  
  // Clear valid fields
  form.querySelectorAll('.form-input:not(.form-input--invalid)').forEach(input => {
    input.classList.add('form-input--valid');
    input.classList.remove('form-input--invalid');
    const msg = input.parentElement.querySelector('.form-message--error');
    if (msg) msg.remove();
  });
  
  return { valid: Object.keys(errors).length === 0, errors, data };
}

/* ────────────────────────────────────────────────────────────────────────
   IMAGE UPLOAD — Drag & drop, preview, WebP conversion
   ──────────────────────────────────────────────────────────────────────── */

export function createImageUpload({ 
  accept = 'image/*',
  maxSize = 2 * 1024 * 1024, // 2MB
  maxFiles = 1,
  multiple = false,
  onUpload,
  convertToWebP = true,
  webPQuality = 0.85,
}) {
  const wrapper = document.createElement('div');
  wrapper.className = 'upload-zone';
  wrapper.innerHTML = `
    <input type="file" class="upload-zone__input" accept="${accept}" ${multiple ? 'multiple' : ''} aria-label="Seleccionar imágenes">
    <svg class="upload-zone__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
    <div class="upload-zone__title">Arrastra y suelta o haz clic para subir</div>
    <div class="upload-zone__desc">Formatos: JPG, PNG, WebP · Máx. ${Math.round(maxSize / 1024 / 1024)}MB</div>
    <div class="upload-zone__hint"><kbd>Ctrl</kbd> + <kbd>V</kbd> para pegar desde portapapeles</div>
    <div class="upload-preview" role="list" aria-label="Vista previa de imágenes"></div>
  `;
  
  const input = wrapper.querySelector('.upload-zone__input');
  const preview = wrapper.querySelector('.upload-preview');
  let files = [];
  
  const processFile = async (file) => {
    if (!file.type.startsWith('image/')) {
      showToast('Solo se permiten archivos de imagen', 'error');
      return null;
    }
    if (file.size > maxSize) {
      showToast(`El archivo supera los ${Math.round(maxSize / 1024 / 1024)}MB`, 'error');
      return null;
    }
    
    let processedFile = file;
    if (convertToWebP && !file.type.includes('webp')) {
      processedFile = await convertImageToWebP(file, webPQuality);
    }
    
    return processedFile;
  };
  
  const convertImageToWebP = (file, quality) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' }));
        }, 'image/webp', quality);
      };
      img.src = URL.createObjectURL(file);
    });
  };
  
  const addPreview = (file, index) => {
    const item = document.createElement('div');
    item.className = 'upload-preview__item';
    item.dataset.index = index;
    item.innerHTML = `
      <img src="${URL.createObjectURL(file)}" alt="Vista previa">
      <div class="upload-preview__progress"></div>
      <button class="upload-preview__remove" aria-label="Eliminar imagen" type="button">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    `;
    item.querySelector('.upload-preview__remove').addEventListener('click', (e) => {
      e.stopPropagation();
      files = files.filter((_, i) => i !== index);
      renderPreviews();
    });
    preview.appendChild(item);
  };
  
  const renderPreviews = () => {
    preview.innerHTML = '';
    files.forEach((file, i) => addPreview(file, i));
  };
  
  const handleFiles = async (fileList) => {
    const newFiles = Array.from(fileList);
    if (!multiple && newFiles.length > 1) {
      showToast('Solo se permite un archivo', 'warning');
      return;
    }
    if (files.length + newFiles.length > maxFiles) {
      showToast(`Máximo ${maxFiles} archivo${maxFiles > 1 ? 's' : ''}`, 'warning');
      return;
    }
    
    for (const file of newFiles) {
      const processed = await processFile(file);
      if (processed) files.push(processed);
    }
    renderPreviews();
  };
  
  // Events
  wrapper.addEventListener('dragover', (e) => { e.preventDefault(); wrapper.classList.add('upload-zone--dragover'); });
  wrapper.addEventListener('dragleave', () => wrapper.classList.remove('upload-zone--dragover'));
  wrapper.addEventListener('drop', (e) => {
    e.preventDefault();
    wrapper.classList.remove('upload-zone--dragover');
    handleFiles(e.dataTransfer.files);
  });
  wrapper.addEventListener('click', () => input.click());
  input.addEventListener('change', () => handleFiles(input.files));
  input.addEventListener('click', (e) => e.stopPropagation());
  
  // Paste support
  document.addEventListener('paste', (e) => {
    if (document.activeElement === wrapper || wrapper.contains(document.activeElement)) {
      handleFiles(e.clipboardData.files);
    }
  });
  
  wrapper.getFiles = () => files;
  wrapper.clear = () => { files = []; renderPreviews(); input.value = ''; };
  
  return wrapper;
}

/* ────────────────────────────────────────────────────────────────────────
   SKELETONS
   ──────────────────────────────────────────────────────────────────────── */

export function createSkeleton(type = 'text', options = {}) {
  const el = document.createElement('div');
  el.className = `skeleton skeleton--${type}`;
  if (options.width) el.style.width = options.width;
  if (options.height) el.style.height = options.height;
  return el;
}

export function createTableSkeleton(rows = 5, cols = 6) {
  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrapper';
  wrapper.innerHTML = `
    <table class="table">
      <thead>
        <tr>${Array(cols).fill('<th><div class="skeleton skeleton--text" style="width:80%"></div></th>').join('')}</tr>
      </thead>
      <tbody>
        ${Array(rows).fill(`<tr>${Array(cols).fill('<td><div class="skeleton skeleton--text" style="width:60%"></div></td>').join('')}</tr>`).join('')}
      </tbody>
    </table>
  `;
  return wrapper;
}

export function createCardSkeleton() {
  const el = document.createElement('div');
  el.className = 'card';
  el.innerHTML = `
    <div class="card__media skeleton skeleton--card"></div>
    <div class="card__body">
      <div class="skeleton skeleton--title" style="width:70%"></div>
      <div class="skeleton skeleton--text" style="width:50%; margin-top:var(--space-2)"></div>
      <div class="skeleton skeleton--text" style="width:40%; margin-top:var(--space-2)"></div>
    </div>
  `;
  return el;
}

/* ────────────────────────────────────────────────────────────────────────
   UTILITIES
   ──────────────────────────────────────────────────────────────────────── */

const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[&<>"']/g, c => HTML_ENTITIES[c]);
}

// Parsea 'YYYY-MM-DD' como fecha local (no UTC) para evitar el corrimiento de dia
export function parseLocalDate(date) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(date);
}

export function formatDate(date, options = {}) {
  // Handle 'YYYY-MM-DD' as local date to avoid UTC timezone shift
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      ...options,
    });
  }
  const d = new Date(date);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...options,
  });
}

export function formatTime(date) {
  const d = new Date(date);
  if (isNaN(d)) return '';
  return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
}

export function formatRelativeTime(date) {
  const d = new Date(date);
  if (isNaN(d)) return '';
  const now = new Date();
  const diff = now - d;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (minutes < 1) return 'Ahora mismo';
  if (minutes < 60) return `Hace ${minutes} min`;
  if (hours < 24) return `Hace ${hours} h`;
  if (days < 7) return `Hace ${days} día${days > 1 ? 's' : ''}`;
  return formatDate(d);
}

export function getInitials(name) {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function generateAvatarColor(name) {
  const colors = [
    'linear-gradient(135deg, #19C37D, #0F9B60)',
    'linear-gradient(135deg, #FFD60A, #E5BF00)',
    'linear-gradient(135deg, #3B82F6, #1D4ED8)',
    'linear-gradient(135deg, #EF4444, #DC2626)',
    'linear-gradient(135deg, #F59E0B, #D97706)',
    'linear-gradient(135deg, #8B5CF6, #7C3AED)',
    'linear-gradient(135deg, #EC4899, #DB2777)',
    'linear-gradient(135deg, #06B6D4, #0891B2)',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

/* ────────────────────────────────────────────────────────────────────────
   AVATAR COMPONENT
   ──────────────────────────────────────────────────────────────────────── */

export function createAvatar({ name, src, size = 'md', alt = '' }) {
  const sizes = { xs: 24, sm: 32, md: 40, lg: 56, xl: 80 };
  const sizePx = sizes[size] || sizes.md;
  
  const el = document.createElement('div');
  el.className = `avatar avatar--${size}`;
  el.style.width = `${sizePx}px`;
  el.style.height = `${sizePx}px`;
  el.style.fontSize = `${Math.round(sizePx * 0.4)}px`;
  
  if (src) {
    el.innerHTML = `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt || name)}" loading="lazy">`;
  } else {
    el.style.background = generateAvatarColor(name);
  el.style.color = '#07130C';
    el.textContent = getInitials(name);
  }
  
  return el;
}

/* ────────────────────────────────────────────────────────────────────────
   COUNTDOWN
   ──────────────────────────────────────────────────────────────────────── */

export function createCountdown(targetDate, options = {}) {
  const { compact = false, onEnd } = options;
  const el = document.createElement('div');
  el.className = `countdown ${compact ? 'countdown--compact' : ''}`;
  
  const update = () => {
    const now = new Date();
    const target = new Date(targetDate);
    const diff = target - now;
    
    if (diff <= 0) {
      el.innerHTML = `<span class="countdown__value countdown__value--ended">¡EN VIVO!</span>`;
      if (onEnd) onEnd();
      return;
    }
    
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    
    const parts = [];
    if (days > 0) parts.push(`<span class="countdown__unit"><span class="countdown__value">${days}</span><span class="countdown__label">días</span></span>`);
    if (hours > 0 || days > 0) parts.push(`<span class="countdown__unit"><span class="countdown__value">${String(hours).padStart(2, '0')}</span><span class="countdown__label">hs</span></span>`);
    parts.push(`<span class="countdown__unit"><span class="countdown__value">${String(minutes).padStart(2, '0')}</span><span class="countdown__label">min</span></span>`);
    if (!compact) parts.push(`<span class="countdown__unit"><span class="countdown__value">${String(seconds).padStart(2, '0')}</span><span class="countdown__label">seg</span></span>`);
    
    el.innerHTML = parts.join('<span class="countdown__separator">:</span>');
  };
  
  update();
  const interval = setInterval(update, 1000);
  
  el.destroy = () => clearInterval(interval);
  return el;
}

/* ────────────────────────────────────────────────────────────────────────
   DROPDOWN
   ──────────────────────────────────────────────────────────────────────── */

export function createDropdown({ trigger, items, align = 'right' }) {
  const wrapper = document.createElement('div');
  wrapper.className = 'dropdown';
  wrapper.innerHTML = `
    ${trigger}
    <div class="dropdown__menu" role="menu" style="${align === 'right' ? 'right:0' : 'left:0'}">
      ${items.map(item => `
        <button class="dropdown__item" role="menuitem" data-value="${escapeHtml(item.value)}" ${item.disabled ? 'disabled' : ''}>
          ${item.icon ? `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">${item.icon}</svg>` : ''}
          ${escapeHtml(item.label)}
          ${item.badge ? `<span class="badge badge--neutral" style="margin-left:auto">${escapeHtml(item.badge)}</span>` : ''}
        </button>
      `).join('')}
      ${items.some(i => i.divider) ? items.map(i => i.divider ? '<div class="dropdown__divider"></div>' : '').join('') : ''}
    </div>
  `;
  
  const menu = wrapper.querySelector('.dropdown__menu');
  const triggerEl = wrapper.querySelector('[data-dropdown-trigger]') || wrapper.firstElementChild;
  
  triggerEl.addEventListener('click', (e) => {
    e.stopPropagation();
    wrapper.classList.toggle('dropdown--open');
  });
  
  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) wrapper.classList.remove('dropdown--open');
  });
  
  menu.querySelectorAll('.dropdown__item:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => {
      wrapper.classList.remove('dropdown--open');
      if (item.onClick) item.onClick(btn.dataset.value);
    });
  });
  
  return wrapper;
}

/* ────────────────────────────────────────────────────────────────────────
   EXPORTS
   ──────────────────────────────────────────────────────────────────────── */

// Re-export de los helpers que vienen de state.js o son funciones internas
export { showToast, dismissToast, escapeHtml };