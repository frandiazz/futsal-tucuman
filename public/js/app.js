/* ==========================================================================
   FUTSAL TUCUMÁN — APP BOOTSTRAP
   Main entry point, router setup, global listeners
   ========================================================================== */

import { router } from './router.js';
import { state, checkAuth, flushOfflineQueue } from './state.js';
import { api, endpoints } from './api.js';
import { showToast, closeModal } from './components/index.js';
import { renderHomeView } from './views/HomeView.js';
import { renderTablesView } from './views/TablesView.js';
import { renderResultsView } from './views/ResultsView.js';
import { renderSelectionView } from './views/SelectionView.js';
import { renderVenuesView } from './views/VenuesView.js';
import { renderLoginView } from './views/LoginView.js';

// ────────────────────────────────────────────────────────────────────────
// ROUTE DEFINITIONS
// ────────────────────────────────────────────────────────────────────────

// Public routes
router.add('/', renderHomeView);
router.add('/tablas', renderTablesView);
router.add('/resultados', renderResultsView);
router.add('/seleccion', renderSelectionView);
router.add('/sedes', renderVenuesView);

// Auth routes
router.add('/panel', renderLoginView);

// ────────────────────────────────────────────────────────────────────────
// MIDDLEWARE
// ────────────────────────────────────────────────────────────────────────

// Check auth on panel routes
router.before(async (path) => {
  if (path.startsWith('/panel')) {
    const authed = await checkAuth();
    if (!authed && path !== '/panel') {
      // Redirect to login with return path
      location.hash = '#/panel';
      return false;
    }
  }
  return true;
});

// Update active nav on route change
router.after((path) => {
  const navLinks = document.querySelectorAll('.nav__link[data-nav]');
  const currentView = path.split('?')[0].split('/')[1] || 'inicio';
  
  navLinks.forEach(link => {
    const isActive = link.dataset.nav === currentView;
    link.classList.toggle('nav__link--active', isActive);
    link.setAttribute('aria-current', isActive ? 'page' : 'false');
  });
  
  // CTA del nav: "Ingresar" / "Panel" segun la sesion
  const cta = document.getElementById('nav-cta');
  if (cta) {
    const label = state.isAuthenticated.value ? 'Mi panel' : 'Ingresar';
    if (cta.textContent.trim() !== label) cta.textContent = label;
    cta.classList.toggle('nav__cta--active', currentView === 'panel');
  }
  
  state.currentView.value = currentView;
});

// ────────────────────────────────────────────────────────────────────────
// GLOBAL EVENT LISTENERS
// ────────────────────────────────────────────────────────────────────────

// Mobile nav toggle
const navToggle = document.getElementById('nav-toggle');
const navMenu = document.getElementById('nav-menu');

if (navToggle && navMenu) {
  navToggle.addEventListener('click', () => {
    const isOpen = navMenu.classList.toggle('nav__menu--open');
    navToggle.setAttribute('aria-expanded', isOpen);
    navToggle.innerHTML = isOpen
      ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
      : '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>';
  });
  
  // Close menu on link click
  navMenu.querySelectorAll('.nav__link').forEach(link => {
    link.addEventListener('click', () => {
      navMenu.classList.remove('nav__menu--open');
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>';
    });
  });
}

// Nav scroll effect
const nav = document.getElementById('nav');
let lastScroll = 0;
window.addEventListener('scroll', () => {
  const currentScroll = window.scrollY;
  if (currentScroll > 20) {
    nav.classList.add('nav--scrolled');
  } else {
    nav.classList.remove('nav--scrolled');
  }
  lastScroll = currentScroll;
}, { passive: true });

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // ESC closes modals
  if (e.key === 'Escape') {
    closeModal();
  }
  
  // Ctrl/Cmd + K for search (future)
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    // TODO: Open search modal
  }
});

// Cambio de sesion: re-renderizar la vista actual.
// Necesario porque al login/logout desde #/panel el hash no cambia
// y el evento 'hashchange' no se dispara.
window.addEventListener('auth:changed', () => {
  router.handleRoute(location.hash.slice(1) || '/');
});

// Handle hash links with smooth scroll for same-page anchors
document.addEventListener('click', (e) => {
  const link = e.target.closest('a[href^="#"]:not([href="#"])');
  if (link) {
    const href = link.getAttribute('href');
    if (href.startsWith('#/')) return; // Let router handle
    
    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      target.focus({ preventScroll: true });
    }
  }
});

// ────────────────────────────────────────────────────────────────────────
// INITIALIZATION
// ────────────────────────────────────────────────────────────────────────

async function init() {
  try {
    // Check initial auth
    await checkAuth();
    
    // Flush any offline queue
    await flushOfflineQueue();
    
    // Start router
    router.start();
    
    // Load fonts (preload already in HTML, but ensure)
    if ('fonts' in document) {
      await document.fonts.ready;
    }
    
    // Mark as loaded for CSS transitions
    document.body.classList.add('app-loaded');
    
    console.log('🏆 Futsal Tucumán initialized');
    
  } catch (error) {
    console.error('Init error:', error);
    showToast('Error al inicializar la aplicación', 'error');
  }
}

// DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// ────────────────────────────────────────────────────────────────────────
// GLOBAL EXPORTS (for debugging / console access)
// ────────────────────────────────────────────────────────────────────────

window.FutsalApp = {
  router,
  state,
  api,
  endpoints,
  checkAuth,
};

export { router, state, api, endpoints };