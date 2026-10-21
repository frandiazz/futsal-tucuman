/* ==========================================================================
   FUTSAL TUCUMÁN — API CLIENT
   Typed, cached, with retry & offline support
   ========================================================================== */

const API_BASE = '/api';

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

class ApiClient {
  constructor() {
    this.cache = new Map();
    this.cacheTTL = 30000; // 30s default
    this.pendingRequests = new Map(); // Deduplication
    this.retryConfig = { retries: 2, backoff: 300 };
  }

  async request(endpoint, options = {}) {
    const key = `${options.method || 'GET'}:${endpoint}`;
    
    // Deduplicate simultaneous identical requests
    if (!options.skipDedup && this.pendingRequests.has(key)) {
      return this.pendingRequests.get(key);
    }

    const promise = this._fetchWithRetry(endpoint, options, key);
    this.pendingRequests.set(key, promise);
    
    try {
      return await promise;
    } finally {
      this.pendingRequests.delete(key);
    }
  }

  async _fetchWithRetry(endpoint, options, cacheKey, attempt = 0) {
    const url = `${API_BASE}${endpoint}`;
    const config = {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      credentials: 'include', // Include cookies
      ...options,
    };

    if (options.body && typeof options.body !== 'string') {
      config.body = JSON.stringify(options.body);
    }

    try {
      const response = await fetch(url, config);
      
      // Handle auth errors
      if (response.status === 401) {
        window.dispatchEvent(new CustomEvent('auth:expired'));
        throw new ApiError('Sesión expirada', 401);
      }
      
      if (response.status === 403) {
        throw new ApiError('Sin permisos', 403);
      }

      const data = await response.json().catch(() => ({}));
      
      if (!response.ok) {
        throw new ApiError(data.error || 'Error del servidor', response.status, data);
      }

      // Cache successful GET requests
      if ((config.method === 'GET' || !config.method) && !options.skipCache) {
        this.cache.set(cacheKey, { data, timestamp: Date.now() });
      }

      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      
      // Retry on network errors
      if (attempt < this.retryConfig.retries && !options.method) {
        await new Promise(r => setTimeout(r, this.retryConfig.backoff * (attempt + 1)));
        return this._fetchWithRetry(endpoint, options, cacheKey, attempt + 1);
      }
      
      throw new ApiError(error.message || 'Error de conexión', 0);
    }
  }

  // Cache helpers
  getCached(key) {
    const entry = this.cache.get(key);
    if (entry && Date.now() - entry.timestamp < this.cacheTTL) {
      return entry.data;
    }
    this.cache.delete(key);
    return null;
  }

  invalidate(pattern) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) this.cache.delete(key);
    }
  }

  clearCache() { this.cache.clear(); }

  // Convenience methods
  get(endpoint, options) { return this.request(endpoint, { ...options, method: 'GET' }); }
  post(endpoint, body, options) { this.invalidate(endpoint.split('?')[0]); return this.request(endpoint, { ...options, method: 'POST', body }); }
  patch(endpoint, body, options) { this.invalidate(endpoint.split('/')[1]); return this.request(endpoint, { ...options, method: 'PATCH', body }); }
  delete(endpoint, options) { this.invalidate(endpoint.split('/')[1]); return this.request(endpoint, { ...options, method: 'DELETE' }); }
}

// Singleton instance
export const api = new ApiClient();

// ────────────────────────────────────────────────────────────────────────
// TYPED API ENDPOINTS
// ────────────────────────────────────────────────────────────────────────

export const endpoints = {
  // Auth
  login: (credentials) => api.post('/login', credentials, { skipCache: true, skipDedup: true }),
  logout: () => api.post('/logout', {}, { skipCache: true }),
  me: () => api.get('/me', { skipCache: true }),
  changePassword: (data) => api.post('/cambiar-clave', data, { skipCache: true }),

  // Comps/Divisions
  comps: () => api.get('/comps'),
  equipos: (compId) => api.get(`/equipos?comp=${compId}`),
  crearEquipo: (data) => api.post('/equipos', data),
  editarEquipo: (id, data) => api.patch(`/equipos/${id}`, data),
  borrarEquipo: (id) => api.delete(`/equipos/${id}`),

  // Tablas
  tabla: (compId) => api.get(`/tablas?comp=${compId}`),

  // Partidos / Resultados
  partidos: () => api.get('/partidos'),
  crearResultado: (data) => api.post('/resultados', data),
  borrarResultado: (id) => api.delete(`/resultados/${id}`),

  // Fixtures
  fixtures: (compId) => api.get(`/fixture?comp=${compId}`),
  crearFixture: (data) => api.post('/fixture', data),
  generarFixture: (data) => api.post('/fixture/round', data),
  actualizarFixture: (id, data) => api.patch(`/fixture/${id}`, data),
  borrarFixture: (id) => api.delete(`/fixture/${id}`),

  // Reservas
  reservas: () => api.get('/reservas'),
  crearReserva: (data) => api.post('/reservas', data),
  borrarReserva: (id) => api.delete(`/reservas/${id}`),

  // Pagos
  pagos: () => api.get('/pagos'),
  crearPago: (data) => api.post('/pagos', data),
  borrarPago: (id) => api.delete(`/pagos/${id}`),

  // Usuarios
  usuarios: () => api.get('/usuarios'),
  crearUsuario: (data) => api.post('/usuarios', data),
  resetClave: (data) => api.post('/usuarios/reset', data),
  borrarUsuario: (id) => api.delete(`/usuarios/${id}`),

  // Sedes
  sedes: () => api.get('/sedes'),
  crearSede: (data) => api.post('/sedes', data),
  borrarSede: (id) => api.delete(`/sedes/${id}`),

  // Jugadores
  jugadores: (equipoId) => api.get(`/jugadores?equipo=${equipoId}`),
  crearJugadores: (data) => api.post('/jugadores', data),
  borrarJugador: (id) => api.delete(`/jugadores/${id}`),

  // Utilidades
  duplicados: () => api.get('/duplicados'),
  importar: (data) => api.post('/importar', data),
  backup: () => api.get('/backup'),
  resumen: () => api.get('/resumen', { skipCache: true }),
  equipo: (id) => api.get(`/equipos/${id}`),
  torneos: () => api.get('/torneos'),
  crearTorneo: (data) => api.post('/torneos', data),
  crearDivision: (data) => api.post('/comps', data),
  borrarDivision: (id) => api.delete(`/comps/${id}`),

  // Auditoría
  auditoria: () => api.get('/audit'),

  // Health
  health: () => api.get('/health', { skipCache: true }),
};

export default api;