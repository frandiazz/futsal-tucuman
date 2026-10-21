/* ==========================================================================
   FUTSAL TUCUMÁN — RESULTS VIEW
   Timeline of matches with status badges, filtering
   ========================================================================== */

import { api, endpoints } from '../api.js';
import { state } from '../state.js';
import { createSkeleton, escapeHtml, formatDate, formatTime, generateAvatarColor, getInitials } from '../components/index.js';

export async function renderResultsView(params = {}) {
  const container = document.createElement('div');
  container.className = 'results-view';
  
  // Load comps for filter
  if (!state.comps.value.length) {
    const comps = await endpoints.comps();
    state.comps.value = comps;
  }
  
  const comps = state.comps.value;
  const divisions = [...new Set(comps.map(c => c.division))];
  
  container.innerHTML = `
    <div class="container">
      <header class="page-header">
        <div class="page-header__inner">
          <div>
            <h1 class="page-header__title display-lg">Resultados</h1>
            <p class="page-header__subtitle body-sm">Partidos jugados, programados y reprogramados</p>
          </div>
        </div>
        
        <!-- Filter Bar -->
        <div class="filter-bar" id="results-filter">
          <div class="filter-bar__group">
            <label class="filter-bar__label" for="results-div">División</label>
            <select class="form-select" id="results-div" name="div">
              <option value="">Todas las divisiones</option>
              ${divisions.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('')}
            </select>
          </div>
          <div class="filter-bar__group">
            <label class="filter-bar__label" for="results-status">Estado</label>
            <select class="form-select" id="results-status" name="status">
              <option value="">Todos</option>
              <option value="jugado">Jugados</option>
              <option value="programado">Programados</option>
              <option value="reprogramado">Reprogramados</option>
              <option value="suspendido">Suspendidos</option>
            </select>
          </div>
          <button class="btn btn--outline btn--sm" id="results-clear">Limpiar filtros</button>
        </div>
      </header>
      
      <!-- Results List -->
      <div id="results-list" class="results-list">
        <div class="table-skeleton"></div>
      </div>
    </div>
  `;
  
  // Load results
  await loadResults(container);
  
  // Filter events
  const filterDiv = container.querySelector('#results-div');
  const filterStatus = container.querySelector('#results-status');
  const clearBtn = container.querySelector('#results-clear');
  
  const applyFilter = () => {
    container._currentFilter = { div: filterDiv.value, status: filterStatus.value };
    filterResults(container);
  };
  
  filterDiv.addEventListener('change', applyFilter);
  filterStatus.addEventListener('change', applyFilter);
  clearBtn.addEventListener('click', () => {
    filterDiv.value = '';
    filterStatus.value = '';
    applyFilter();
  });
  
  // Store reference for filtering
  container._allResults = [];
  container._currentFilter = { div: '', status: '' };
  
  return container;
}

async function loadResults(container) {
  const list = container.querySelector('#results-list');
  
  try {
    const [partidos, fixtures] = await Promise.all([
      endpoints.partidos(),
      Promise.all(state.comps.value.map(c => endpoints.fixtures(c.id).catch(() => []))).then(arrays => arrays.flat()),
    ]);
    
    // Enrich with division/zona from comps
    const comps = state.comps.value;
    const compMap = new Map(comps.map(c => [c.id, { division: c.division, zona: c.zona }]));
    
    const enriched = partidos.map(p => ({
      ...p,
      ...compMap.get(p.comp_id),
      fechaFormateada: formatDate(p.creado),
      horaFormateada: formatTime(p.creado),
    }));
    
    // Add scheduled/reprogrammed fixtures
    const fixtureMatches = fixtures
      .filter(f => f.estado !== 'jugado' && f.fecha)
      .map(f => ({
        id: `fx-${f.id}`,
        comp_id: f.comp_id,
        gl: f.gl,
        gv: f.gv,
        creado: f.fecha,
        local: f.local,
        visitante: f.visitante,
        estado: f.estado,
        ...compMap.get(f.comp_id),
        fechaFormateada: formatDate(f.fecha),
        horaFormateada: f.hora || '',
      }));
    
    container._allResults = [...fixtureMatches, ...enriched];
    filterResults(container);
    
  } catch (error) {
    console.error('Results load error:', error);
    list.innerHTML = `
      <div class="empty-state">
        <svg class="empty-state__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        <h2 class="empty-state__title">Error al cargar resultados</h2>
        <p class="empty-state__desc">${escapeHtml(error.message)}</p>
        <button class="btn btn--primary" onclick="location.reload()">Reintentar</button>
      </div>
    `;
  }
}

function filterResults(container) {
  const list = container.querySelector('#results-list');
  const { div, status } = container._currentFilter || { div: '', status: '' };
  
  let filtered = container._allResults;
  
  if (div) filtered = filtered.filter(p => p.division === div);
  if (status) filtered = filtered.filter(p => p.estado === status);
  
  if (!filtered.length) {
    list.innerHTML = `
      <div class="empty-state">
        <svg class="empty-state__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
        <h2 class="empty-state__title">No hay resultados</h2>
        <p class="empty-state__desc">No se encontraron partidos con los filtros actuales.</p>
      </div>
    `;
    return;
  }
  
  // Group by date
  const grouped = {};
  for (const match of filtered) {
    const dateKey = match.fechaFormateada || 'Sin fecha';
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(match);
  }
  
  // Sort dates descending
  const sortedDates = Object.keys(grouped).sort((a, b) => {
    if (a === 'Sin fecha') return 1;
    if (b === 'Sin fecha') return -1;
    return new Date(b.split('/').reverse().join('-')) - new Date(a.split('/').reverse().join('-'));
  });
  
  list.innerHTML = sortedDates.map(date => `
    <div class="results-date-group">
      <h3 class="results-date-title">${escapeHtml(date)}</h3>
      <div class="results-date-matches">
        ${grouped[date].map(match => renderMatchCard(match)).join('')}
      </div>
    </div>
  `).join('');
}

function renderMatchCard(match) {
  const estado = match.estado || 'jugado';
  const estadoClass = `match-card--${estado}`;
  const estadoLabel = { 
    jugado: 'Finalizado', 
    programado: 'Programado', 
    reprogramado: 'Reprogramado', 
    suspendido: 'Suspendido' 
  }[estado] || estado;
  
  const score = match.gl !== null && match.gv !== null 
    ? `<span class="match-card__score">${match.gl} - ${match.gv}</span>`
    : '<span class="match-card__score match-card__score--scheduled">-</span>';
  
  return `
    <article class="match-card ${estadoClass}">
      <span class="match-card__status" aria-label="${estadoLabel}"></span>
      <div class="match-card__teams">
        <div class="match-card__team match-card__team--home">
          <span class="match-card__name">${escapeHtml(match.local)}</span>
          <div class="match-card__avatar avatar avatar--sm" style="background:${generateAvatarColor(match.local)};color:#07130C">${getInitials(match.local)}</div>
        </div>
        ${score}
        <div class="match-card__team match-card__team--away">
          <div class="match-card__avatar avatar avatar--sm" style="background:${generateAvatarColor(match.visitante)};color:#07130C">${getInitials(match.visitante)}</div>
          <span class="match-card__name">${escapeHtml(match.visitante)}</span>
        </div>
      </div>
      <div class="match-card__meta">
        <span class="badge badge--neutral">${escapeHtml(match.division)}${match.zona ? ` · ${escapeHtml(match.zona)}` : ''}</span>
        ${match.horaFormateada ? `<span>${match.horaFormateada}</span>` : ''}
        <span class="badge badge--outline">${estadoLabel}</span>
      </div>
    </article>
  `;
}

