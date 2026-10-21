/* ==========================================================================
   FUTSAL TUCUMÁN — TABLES VIEW
   Division tabs, zone tabs, sortable table with highlights
   ========================================================================== */

import { api, endpoints } from '../api.js';
import { state } from '../state.js';
import { createTable, escapeHtml, showToast } from '../components/index.js';

export async function renderTablesView(params = {}) {
  const container = document.createElement('div');
  container.className = 'tables-view';
  
  // Load comps if not cached
  if (!state.comps.value.length) {
    const comps = await endpoints.comps();
    state.comps.value = comps;
  }
  
  const comps = state.comps.value;
  const divisions = [...new Set(comps.map(c => c.division))];
  
  // Determine current division
  let currentDiv = params.div || state.currentComp.value || 'Elite 1';
  if (!divisions.includes(currentDiv)) currentDiv = divisions[0];
  state.currentComp.value = currentDiv;
  
  // Get zones for current division
  const zones = comps.filter(c => c.division === currentDiv).map(c => c.zona);
  const currentZone = params.zona || state.currentZona.value || zones[0] || '';
  state.currentZona.value = currentZone;
  
  // Find comp ID
  const comp = comps.find(c => c.division === currentDiv && c.zona === currentZone);
  
  container.innerHTML = `
    <div class="container">
      <header class="page-header">
        <div class="page-header__inner">
          <div>
            <h1 class="page-header__title display-lg">Tablas <span class="text-accent-y">Clausura 2026</span></h1>
            <p class="page-header__subtitle body-sm">
              Victoria 2 pts, empate 1. Orden: puntos, diferencia de gol y goles a favor (a confirmar con el reglamento).
            </p>
          </div>
        </div>
        
        <!-- Division Tabs -->
        <div class="tabs tabs--divisions" id="div-tabs" role="tablist" aria-label="Divisiones">
          ${divisions.map(d => `
            <button class="tabs__trigger ${d === currentDiv ? '' : ''}" role="tab" aria-selected="${d === currentDiv}" data-div="${escapeHtml(d)}">${escapeHtml(d)}</button>
          `).join('')}
        </div>
        
        <!-- Zone Tabs (if applicable) -->
        ${zones.length > 1 && zones[0] !== '' ? `
          <div class="tabs tabs--zones" id="zone-tabs" role="tablist" aria-label="Zonas" style="margin-top:var(--space-2)">
            ${zones.map(z => `
              <button class="tabs__trigger ${z === currentZone ? '' : ''}" role="tab" aria-selected="${z === currentZone}" data-zona="${escapeHtml(z)}">${escapeHtml(z) || 'Única'}</button>
            `).join('')}
          </div>
        ` : ''}
      </header>
      
      <!-- Table -->
      <div id="tables-table-container" class="tables-view__table-wrapper">
        <div class="table-skeleton"></div>
      </div>
    </div>
  `;
  
  // Load table data
  await loadTable(container, comp);
  
  // Event listeners for tabs
  container.querySelector('#div-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-div]');
    if (!btn) return;
    const div = btn.dataset.div;
    navigateToDivision(div);
  });
  
  const zoneTabs = container.querySelector('#zone-tabs');
  if (zoneTabs) {
    zoneTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-zona]');
      if (!btn) return;
      const zona = btn.dataset.zona;
      navigateToZone(zona);
    });
  }
  
  return container;
}

function navigateToDivision(div) {
  const comps = state.comps.value;
  const zones = comps.filter(c => c.division === div).map(c => c.zona);
  const zona = zones[0] || '';
  location.hash = `#/tablas?div=${encodeURIComponent(div)}${zona ? `&zona=${encodeURIComponent(zona)}` : ''}`;
}

function navigateToZone(zona) {
  const div = state.currentComp.value;
  location.hash = `#/tablas?div=${encodeURIComponent(div)}&zona=${encodeURIComponent(zona)}`;
}

async function loadTable(container, comp) {
  const tableContainer = container.querySelector('#tables-table-container');
  if (!comp) {
    tableContainer.innerHTML = `
      <div class="empty-state">
        <svg class="empty-state__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="3" y1="9" x2="21" y2="9"></line><line x1="9" y1="21" x2="9" y2="9"></line></svg>
        <h2 class="empty-state__title">División no encontrada</h2>
        <p class="empty-state__desc">Selecciona una división válida para ver la tabla.</p>
      </div>
    `;
    return;
  }
  
  try {
    const tabla = await endpoints.tabla(comp.id);
    
    const columns = [
      { key: 'pos', label: '#', width: '48px', align: 'center', sortable: false, render: (item) => `<span class="pos-cell ${item.pos <= 4 ? 'pos-cell--top' : ''}">${item.pos}</span>` },
      { key: 'nombre', label: 'Equipo', sortable: true, render: (item) => `
        <div class="team-name">
          <div class="team-info">
            <span class="team-name-text">${escapeHtml(item.nombre)}</span>
            ${item.revisar ? '<span class="badge badge--revisar" title="PJ no coincide con G+E+P">revisar</span>' : ''}
          </div>
        </div>
      ` },
      { key: 'pts', label: 'Pts', width: '56px', align: 'center', sortable: true, render: (item) => `<span class="pts-cell">${item.pts}</span>` },
      { key: 'pj', label: 'PJ', width: '48px', align: 'center', sortable: false, render: (item) => `<span class="num-cell">${item.pj}</span>` },
      { key: 'g', label: 'G', width: '40px', align: 'center', sortable: false, render: (item) => `<span class="num-cell num-cell--positive">${item.g}</span>` },
      { key: 'e', label: 'E', width: '40px', align: 'center', sortable: false, render: (item) => `<span class="num-cell">${item.e}</span>` },
      { key: 'p', label: 'P', width: '40px', align: 'center', sortable: false, render: (item) => `<span class="num-cell num-cell--negative">${item.p}</span>` },
      { key: 'gf', label: 'GF', width: '48px', align: 'center', sortable: false, render: (item) => `<span class="num-cell">${item.gf}</span>` },
      { key: 'gc', label: 'GC', width: '48px', align: 'center', sortable: false, render: (item) => `<span class="num-cell">${item.gc}</span>` },
      { key: 'dg', label: 'DG', width: '56px', align: 'center', sortable: false, render: (item) => `<span class="num-cell ${item.dg > 0 ? 'num-cell--positive' : item.dg < 0 ? 'num-cell--negative' : ''}">${item.dg > 0 ? '+' : ''}${item.dg}</span>` },
    ];
    
    const dataWithPos = tabla.map((item, i) => ({ ...item, pos: i + 1 }));
    
    const table = createTable({
      columns,
      data: dataWithPos,
      keyField: 'id',
      responsive: true,
      rowClass: (item, i) => i < 4 ? 'tr--highlight' : '',
    });
    
    tableContainer.innerHTML = '';
    tableContainer.appendChild(table);
    
    // Update tab active states
    container.querySelectorAll('.tabs__trigger').forEach(btn => {
      const isActive = btn.dataset.div === state.currentComp.value || btn.dataset.zona === state.currentZona.value;
      btn.setAttribute('aria-selected', isActive);
      btn.classList.toggle('tabs__trigger--active', isActive);
    });
    
  } catch (error) {
    console.error('Table load error:', error);
    tableContainer.innerHTML = `
      <div class="empty-state">
        <svg class="empty-state__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="64" height="64"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
        <h2 class="empty-state__title">Error al cargar la tabla</h2>
        <p class="empty-state__desc">${escapeHtml(error.message)}</p>
        <button class="btn btn--primary" onclick="location.reload()">Reintentar</button>
      </div>
    `;
  }
}
