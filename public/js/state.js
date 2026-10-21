/* ==========================================================================
   FUTSAL TUCUMÁN — STATE MANAGEMENT
   Lightweight reactive signals (no dependencies)
   ========================================================================== */

// Simple signal implementation
export function signal(initialValue) {
  let value = initialValue;
  const subscribers = new Set();

  const subscribe = (fn) => {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  };

  const notify = () => subscribers.forEach(fn => fn(value));

  return {
    get value() { return value; },
    set value(v) {
      if (v !== value) {
        value = v;
        notify();
      }
    },
    subscribe,
    peek: () => value,
  };
}

export function computed(fn) {
  const sig = signal(fn());
  let dirty = true;
  
  const update = () => {
    if (dirty) {
      sig.value = fn();
      dirty = false;
    }
  };
  
  // Subscribe to all signals accessed during fn()
  // Simple approach: recompute on any signal change globally
  // In production, you'd track dependencies precisely
  
  return {
    get value() { 
      if (dirty) update();
      return sig.value; 
    },
    subscribe: sig.subscribe,
  };
}

// Global app state
export const state = {
  // Auth
  user: signal(null),
  isAuthenticated: signal(false),
  debeCambiar: signal(false),

  // Data
  comps: signal([]),
  currentComp: signal(null),
  currentZona: signal(''),
  
  // UI
  currentView: signal('inicio'),
  loading: signal(false),
  toasts: signal([]),

  // Panel
  panelTab: signal('res'),
  panelComp: signal(null),

  // Selection
  selectedTeam: signal(null),
  
  // Offline queue
  offlineQueue: signal([]),
};

// Auth helpers
export async function checkAuth() {
  try {
    const { endpoints } = await import('./api.js');
    const data = await endpoints.me();
    state.user.value = data.usuario ? data : null;
    state.isAuthenticated.value = !!data.usuario;
    state.debeCambiar.value = !!data.debe_cambiar;
    return state.isAuthenticated.value;
  } catch {
    state.user.value = null;
    state.isAuthenticated.value = false;
    return false;
  }
}

export function logout() {
  state.user.value = null;
  state.isAuthenticated.value = false;
  state.debeCambiar.value = false;
}

// Toast helpers
export function showToast(message, type = 'info', title = '') {
  const id = Date.now() + Math.random();
  const toast = { id, message, type, title, timestamp: Date.now() };
  state.toasts.value = [...state.toasts.value, toast];
  
  // Auto-dismiss
  setTimeout(() => dismissToast(id), type === 'error' ? 8000 : 5000);
  return id;
}

export function dismissToast(id) {
  state.toasts.value = state.toasts.value.filter(t => t.id !== id);
}

export function success(msg, title) { return showToast(msg, 'success', title); }
export function error(msg, title) { return showToast(msg, 'error', title); }
export function warning(msg, title) { return showToast(msg, 'warning', title); }
export function info(msg, title) { return showToast(msg, 'info', title); }

// Offline queue for planilleros
export function queueOffline(action, data) {
  const item = { id: Date.now(), action, data, timestamp: Date.now(), retries: 0 };
  state.offlineQueue.value = [...state.offlineQueue.value, item];
  persistOfflineQueue();
}

export function persistOfflineQueue() {
  try {
    localStorage.setItem('futsal_offline_queue', JSON.stringify(state.offlineQueue.value));
  } catch {}
}

export function loadOfflineQueue() {
  try {
    const data = localStorage.getItem('futsal_offline_queue');
    if (data) state.offlineQueue.value = JSON.parse(data);
  } catch {}
}

export async function flushOfflineQueue() {
  const { endpoints } = await import('./api.js');
  const queue = [...state.offlineQueue.value];
  
  for (const item of queue) {
    try {
      await endpoints[item.action](item.data);
      state.offlineQueue.value = state.offlineQueue.value.filter(i => i.id !== item.id);
    } catch (err) {
      if (item.retries >= 3) {
        state.offlineQueue.value = state.offlineQueue.value.filter(i => i.id !== item.id);
      } else {
        item.retries++;
      }
    }
  }
  persistOfflineQueue();
}

// Initialize offline queue on load
if (typeof window !== 'undefined') {
  loadOfflineQueue();
  
  // Flush when online
  window.addEventListener('online', flushOfflineQueue);
  
  // Handle auth expiry
  window.addEventListener('auth:expired', () => {
    logout();
    showToast('Tu sesión ha expirado. Inicia sesión nuevamente.', 'warning');
    setTimeout(() => location.hash = '#/panel', 1500);
  });
}