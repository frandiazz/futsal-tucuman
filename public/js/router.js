/* ==========================================================================
   FUTSAL TUCUMÁN — ROUTER
   Hash-based SPA router with middleware support
   ========================================================================== */

export class Router {
  constructor() {
    this.routes = new Map();
    this.middlewares = [];
    this.currentRoute = null;
    this.currentParams = {};
    this.beforeHooks = [];
    this.afterHooks = [];
  }

  // Register route: path -> handler(viewName, params) => Promise<HTMLElement|string>
  add(path, handler) {
    // Convert path pattern to regex
    // /path/:param -> /path/([^/]+)
    const pattern = path
      .replace(/:([^/]+)/g, '([^/]+)')
      .replace(/\//g, '\\/');
    const regex = new RegExp(`^${pattern}$`);
    const paramNames = (path.match(/:([^/]+)/g) || []).map(p => p.slice(1));
    
    this.routes.set(path, { handler, regex, paramNames });
    return this;
  }

  // Global middleware
  before(hook) { this.beforeHooks.push(hook); return this; }
  after(hook) { this.afterHooks.push(hook); return this; }

  // Navigate programmatically
  async navigate(path, replace = false) {
    if (replace) {
      history.replaceState(null, '', `#${path}`);
    } else {
      history.pushState(null, '', `#${path}`);
    }
    await this.handleRoute(path);
  }

  // Start listening
  start() {
    window.addEventListener('hashchange', () => this.handleRoute(location.hash.slice(1)));
    window.addEventListener('popstate', () => this.handleRoute(location.hash.slice(1)));
    // Handle initial load
    this.handleRoute(location.hash.slice(1) || '/');
  }

  async handleRoute(rawPath) {
    // Separar path de query string: '/tablas?div=Elite%201' -> path '/tablas', query {div: 'Elite 1'}
    const [pathname, queryString] = String(rawPath || '/').split('?');
    const path = pathname || '/';
    const query = {};
    if (queryString) {
      for (const [k, v] of new URLSearchParams(queryString)) query[k] = v;
    }
    
    // Run before hooks
    for (const hook of this.beforeHooks) {
      const result = await hook(path, this.currentRoute);
      if (result === false) return; // Navigation cancelled
    }

    // Find matching route
    let matched = null;
    let params = {};
    
    for (const [routePath, route] of this.routes) {
      const match = path.match(route.regex);
      if (match) {
        matched = route;
        route.paramNames.forEach((name, i) => {
          params[name] = decodeURIComponent(match[i + 1]);
        });
        break;
      }
    }

    if (!matched) {
      // 404 - redirect to home
      this.navigate('/');
      return;
    }

    this.currentRoute = matched;
    this.currentParams = params;
    this.currentQuery = query;

    try {
      const content = await matched.handler({ ...params, ...query });
      const main = document.getElementById('main-content');
      if (main) {
        main.innerHTML = typeof content === 'string' ? content : '';
        if (content instanceof HTMLElement) {
          main.appendChild(content);
        }
      }
      window.scrollTo(0, 0);
      
      // Run after hooks
      for (const hook of this.afterHooks) {
        await hook(path, params);
      }
    } catch (error) {
      console.error('Route error:', error);
      const main = document.getElementById('main-content');
      if (main) {
        main.innerHTML = `
          <div class="empty-state">
            <svg class="empty-state__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
            <h2 class="empty-state__title">Error al cargar</h2>
            <p class="empty-state__desc">${error.message || 'Ocurrió un error inesperado'}</p>
            <button class="btn btn--primary" onclick="location.hash='/'">Volver al inicio</button>
          </div>
        `;
      }
    }
  }

  getParams() { return { ...this.currentParams }; }
  getQuery() { return { ...this.currentQuery }; }
  getCurrentPath() { return this.currentRoute ? this.currentRoute.regex.source : '/'; }
}

// Singleton
export const router = new Router();