/* ==========================================================================
   FUTSAL TUCUMÁN — SELECTION VIEW
   Hero, fixtures, roster, history
   ========================================================================== */

import { api, endpoints } from '../api.js';
import { state } from '../state.js';
import { createCountdown, escapeHtml, formatDate, generateAvatarColor, getInitials, parseLocalDate } from '../components/index.js';

export async function renderSelectionView(params = {}) {
  const container = document.createElement('div');
  container.className = 'selection-view';
  
  container.innerHTML = `
    <div class="container">
      <header class="page-header selection-view__hero">
        <div class="page-header__inner">
          <div>
            <span class="selection-view__tag badge badge--primary">Argentino C-17 · 19 al 24 de octubre</span>
            <h1 class="page-header__title display-lg">La <span class="text-accent-g">Naranja</span></h1>
            <p class="page-header__subtitle body-sm" id="selection-meta"></p>
          </div>
        </div>
      </header>
      
      <!-- Fixtures -->
      <section class="section">
        <div class="container">
          <h2 class="section__title display-md">Próximos partidos</h2>
          <div class="selection-fixtures" id="selection-fixtures">
            <div class="skeleton skeleton--card"></div>
            <div class="skeleton skeleton--card"></div>
            <div class="skeleton skeleton--card"></div>
          </div>
        </div>
      </section>
      
      <!-- Roster -->
      <section class="section">
        <div class="container">
          <h2 class="section__title display-md">Plantel</h2>
          <div class="roster__grid" id="selection-roster">
            <!-- Filled dynamically -->
          </div>
        </div>
      </section>
      
      <!-- History -->
      <section class="section">
        <div class="container">
          <h2 class="section__title display-md">Historia <span class="text-accent-y">reciente</span></h2>
          <div class="history__grid">
            <article class="history-card">
              <div class="history-card__year">2022</div>
              <p class="history-card__desc">Subcampeón argentino de mayores, derrota 3-0 ante Mendoza en la final.</p>
            </article>
            <article class="history-card">
              <div class="history-card__year">2023</div>
              <p class="history-card__desc">Campeón argentino por primera vez: 4-3 a Mendoza.</p>
            </article>
          </div>
        </div>
      </section>
    </div>
  `;
  
  await loadSelectionData(container);
  return container;
}

async function loadSelectionData(container) {
  try {
    // Meta info
    const meta = container.querySelector('#selection-meta');
    if (meta) {
      meta.textContent = 'Complejo Natalio Mirkin. Técnico: Enzo Cuevas, con Juan Carrillo y Santiago Tejeda; preparador físico: Eduardo Sal.';
    }
    
    // Fixtures - load from API or use static data
    const fixturesContainer = container.querySelector('#selection-fixtures');
    const fixtures = [
      { fecha: '2026-10-19', hora: '21:30', local: 'Tucumán', visitante: 'Corrientes', localLogo: null, visitanteLogo: null },
      { fecha: '2026-10-20', hora: '21:30', local: 'Tucumán', visitante: 'Comodoro Rivadavia', localLogo: null, visitanteLogo: null },
      { fecha: '2026-10-21', hora: '21:30', local: 'Tucumán', visitante: 'Río Grande', localLogo: null, visitanteLogo: null },
    ];
    
    fixturesContainer.innerHTML = fixtures.map(f => {
      const d = parseLocalDate(f.fecha);
      return `
      <article class="fixture-card">
        <div class="fixture-card__date">
          <div class="fixture-card__day">${d.getDate()}</div>
          <div class="fixture-card__month">${d.toLocaleDateString('es-AR', { month: 'short' }).replace('.', '')}</div>
        </div>
        <div class="fixture-card__teams">
          <div class="fixture-card__team">
            <div class="fixture-card__team-avatar avatar avatar--md" style="background:${generateAvatarColor(f.local)};color:#07130C">${getInitials(f.local)}</div>
            <span class="fixture-card__team-name">${escapeHtml(f.local)}</span>
          </div>
          <span class="fixture-card__vs">VS</span>
          <div class="fixture-card__team">
            <div class="fixture-card__team-avatar avatar avatar--md" style="background:${generateAvatarColor(f.visitante)};color:#07130C">${getInitials(f.visitante)}</div>
            <span class="fixture-card__team-name">${escapeHtml(f.visitante)}</span>
          </div>
        </div>
        <div class="fixture-card__time">${f.hora}</div>
      </article>
    `;
    }).join('');
    
    // Roster
    const rosterContainer = container.querySelector('#selection-roster');
    const jugadores = [
      'Lisandro Toledo','Valentín Abad','Geremias Kahlie','Bautista Cabrera','Mateo Salado',
      'Yulian Núñez','Santiago Aguilar','Enzo Pérez','Mateo Sabate','Facundo Moyano',
      'Juan Ignacio Nanterne','Fabricio Gutiérrez','Benjamín Páez','Santino Jiménez','Ignacio Aragón'
    ];
    
    rosterContainer.innerHTML = jugadores.map((nombre, i) => `
      <article class="roster-card">
        <div class="roster-card__avatar avatar avatar--lg" style="background:${generateAvatarColor(nombre)};color:#07130C">${getInitials(nombre)}</div>
        <span class="roster-card__name">${escapeHtml(nombre)}</span>
        <span class="roster-card__position">${i < 2 ? 'Arquero' : i < 6 ? 'Cierre' : i < 11 ? 'Ala' : 'Pívot'}</span>
        <span class="roster-card__number">${i + 1}</span>
      </article>
    `).join('');
    
  } catch (error) {
    console.error('Selection load error:', error);
  }
}

