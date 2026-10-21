/* ==========================================================================
   FUTSAL TUCUMÁN — VENUES VIEW
   Map + list layout with venue cards
   ========================================================================== */

import { api, endpoints } from '../api.js';
import { state } from '../state.js';
import { escapeHtml, generateAvatarColor, getInitials } from '../components/index.js';

export async function renderVenuesView(params = {}) {
  const container = document.createElement('div');
  container.className = 'venues-view';
  
  container.innerHTML = `
    <div class="container">
      <header class="page-header venues-view__header">
        <div class="page-header__inner">
          <div>
            <h1 class="page-header__title display-lg">Sedes</h1>
            <p class="page-header__subtitle body-sm">Canchas, horarios y disponibilidad</p>
          </div>
        </div>
      </header>
      
      <div class="venues-layout">
        <!-- Map -->
        <div class="venues-map" id="venues-map" role="application" aria-label="Mapa de sedes">
          <div class="map-placeholder">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 2v20M2 12h20"></path></svg>
            <p>Mapa interactivo</p>
            <p class="text-muted" style="font-size:var(--text-sm);margin-top:var(--space-2)">Integración MapLibre GL pendiente</p>
          </div>
        </div>
        
        <!-- List -->
        <aside class="venues-list" id="venues-list" aria-label="Lista de sedes">
          <div class="skeleton skeleton--card"></div>
          <div class="skeleton skeleton--card"></div>
          <div class="skeleton skeleton--card"></div>
          <div class="skeleton skeleton--card"></div>
        </aside>
      </div>
    </div>
  `;
  
  await loadVenuesData(container);
  return container;
}

async function loadVenuesData(container) {
  try {
    const list = container.querySelector('#venues-list');
    const sedes = await endpoints.sedes();
    
    // Default sedes if empty
    const defaultSedes = [
      { id: 1, nombre: 'La Usina', canchas: 2, direccion: 'Av. Belgrano 1200', horarios: '19:00 - 23:00' },
      { id: 2, nombre: 'La Diagonal', canchas: 2, direccion: 'Av. Mate de Luna 800', horarios: '19:00 - 23:00' },
      { id: 3, nombre: 'Complejo Avellaneda', canchas: 2, direccion: 'Av. Avellaneda 500', horarios: '19:00 - 23:00' },
      { id: 4, nombre: 'Complejo Natalio Mirkin', canchas: 2, direccion: 'Parque 9 de Julio', horarios: '19:00 - 23:00' },
    ];
    
    const data = sedes.length ? sedes : defaultSedes;
    
    list.innerHTML = data.map(sede => `
      <article class="venue-card" data-sede="${escapeHtml(sede.nombre)}" tabindex="0">
        <div class="venue-card__media">
          <div class="skeleton skeleton--card" style="width:100%;height:100%;background:linear-gradient(135deg,var(--color-primary-800),var(--color-primary-700))"></div>
          <span class="venue-card__badge badge badge--primary">Sede Oficial</span>
        </div>
        <div class="venue-card__info">
          <h3 class="venue-card__name">${escapeHtml(sede.nombre)}</h3>
          <div class="venue-card__meta">
            <span>📍 ${escapeHtml(sede.direccion || 'Dirección no disponible')}</span>
            <span>🕐 ${escapeHtml(sede.horarios || 'Horarios no disponibles')}</span>
          </div>
          <div class="venue-card__courts">
            ${Array.from({ length: sede.canchas || 2 }, (_, i) => `
              <span class="venue-card__court venue-card__court--available">Cancha ${i + 1}</span>
            `).join('')}
          </div>
        </div>
      </article>
    `).join('');
    
    // Click handlers for venue cards
    list.querySelectorAll('.venue-card').forEach(card => {
      card.addEventListener('click', () => {
        list.querySelectorAll('.venue-card').forEach(c => c.classList.remove('venue-card--active'));
        card.classList.add('venue-card--active');
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          card.click();
        }
      });
    });
    
  } catch (error) {
    console.error('Venues load error:', error);
    const list = container.querySelector('#venues-list');
    list.innerHTML = `
      <div class="empty-state">
        <svg class="empty-state__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        <h2 class="empty-state__title">Error al cargar sedes</h2>
        <p class="empty-state__desc">${escapeHtml(error.message)}</p>
      </div>
    `;
  }
}
