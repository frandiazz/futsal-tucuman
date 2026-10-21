/* ==========================================================================
   FUTSAL TUCUMÁN — HOME VIEW
   Hero, featured match, top 5 table, sponsors
   ========================================================================== */

import { api, endpoints } from '../api.js';
import { state } from '../state.js';
import { createAvatar, createCountdown, createSkeleton, createTable, escapeHtml, formatDate, generateAvatarColor, getInitials, showToast } from '../components/index.js';

export async function renderHomeView() {
  const container = document.createElement('div');
  container.className = 'home-view';
  
  // Hero Section
  const hero = document.createElement('section');
  hero.className = 'home-hero section section--flush';
  hero.setAttribute('aria-labelledby', 'hero-title');
  
  hero.innerHTML = `
    <div class="container">
      <div class="home-hero__grid">
        <div class="home-hero__content">
          <span class="home-hero__tag badge badge--primary">Torneo Clausura 2026</span>
          <h1 id="hero-title" class="home-hero__title display-xl">
            El futsal<br>tucumano,<br><span>en un solo lugar</span>
          </h1>
          <p class="home-hero__subtitle body-lg text-secondary">
            Tablas automáticas, resultados en vivo, fixture oficial y la Selección — todo desde tu celular.
          </p>
          <div class="home-hero__actions">
            <a href="#/tablas" class="btn btn--primary btn--lg">Ver tablas de posiciones</a>
            <a href="#/resultados" class="btn btn--outline btn--lg">Últimos resultados</a>
          </div>
          <dl class="home-hero__stats">
            <div class="home-hero__stat">
              <dt class="home-hero__stat-label">Equipos</dt>
              <dd class="home-hero__stat-value" data-count="83">83</dd>
            </div>
            <div class="home-hero__stat">
              <dt class="home-hero__stat-label">Divisiones</dt>
              <dd class="home-hero__stat-value">5</dd>
            </div>
            <div class="home-hero__stat">
              <dt class="home-hero__stat-label">Partidos jugados</dt>
              <dd class="home-hero__stat-value" data-count="0">0</dd>
            </div>
            <div class="home-hero__stat">
              <dt class="home-hero__stat-label">Cálculo de tablas</dt>
              <dd class="home-hero__stat-value">0 seg</dd>
            </div>
          </dl>
        </div>

        <!-- Partido destacado -->
        <div class="home-hero__aside">
          <div class="home-featured-match">
            <div class="home-featured-match__media">
              <div class="skeleton skeleton--card" style="width:100%;height:100%"></div>
            </div>
            <div class="home-featured-match__overlay">
              <div class="home-featured-match__meta">
                <div id="featured-countdown" class="home-featured-match__countdown"></div>
                <div class="home-featured-match__teams" id="featured-teams">
                  <div class="home-featured-match__team">
                    <div class="home-featured-match__team-avatar skeleton skeleton--avatar"></div>
                    <span class="home-featured-match__team-name skeleton skeleton--text" style="width:80px"></span>
                  </div>
                  <span class="home-featured-match__vs">VS</span>
                  <div class="home-featured-match__team">
                    <div class="home-featured-match__team-avatar skeleton skeleton--avatar"></div>
                    <span class="home-featured-match__team-name skeleton skeleton--text" style="width:80px"></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  container.appendChild(hero);
  
  // Elite 1 Top 5
  const top5Section = document.createElement('section');
  top5Section.className = 'section';
  top5Section.innerHTML = `
    <div class="container">
      <div class="home-table__header">
        <h2 class="home-table__title display-md">Elite 1 · Top 5</h2>
        <a href="#/tablas" class="home-table__link" data-comp="elite1">Ver tabla completa →</a>
      </div>
      <div id="home-top5-table" class="home-table"></div>
    </div>
  `;
  container.appendChild(top5Section);
  
  // Sponsors
  const sponsorsSection = document.createElement('section');
  sponsorsSection.className = 'section section--flush';
  sponsorsSection.innerHTML = `
    <div class="container">
      <h3 class="home-sponsors__title">Auspiciantes</h3>
      <div class="sponsors" id="sponsors-list">
        <div class="sponsors__placeholder">Sponsor principal</div>
        <div class="sponsors__placeholder">Sponsor</div>
        <div class="sponsors__placeholder">Sponsor</div>
        <div class="sponsors__placeholder">Sponsor</div>
      </div>
    </div>
  `;
  container.appendChild(sponsorsSection);
  
  // Follow
  const followSection = document.createElement('section');
  followSection.className = 'section section--flush';
  followSection.innerHTML = `
    <div class="container" style="text-align:center">
      <h2 class="title-md" style="margin-bottom:var(--space-3)">Seguinos</h2>
      <a href="https://www.instagram.com/tucumanfutsal/" target="_blank" rel="noopener" class="btn btn--primary btn--lg">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg>
        📸 @tucumanfutsal
      </a>
    </div>
  `;
  container.appendChild(followSection);
  
  // Load data
  await loadHomeData(container);
  
  return container;
}

async function loadHomeData(container) {
  try {
    // Load comps first to find Elite 1
    const comps = await endpoints.comps();
    state.comps.value = comps;
    
    const elite1 = comps.find(c => c.division === 'Elite 1' && c.zona === '');
    if (!elite1) return;
    
    // Load tabla for Elite 1
    const tabla = await endpoints.tabla(elite1.id);
    
    // Render top 5 table
    const tableContainer = container.querySelector('#home-top5-table');
    if (tableContainer) {
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
        { key: 'dg', label: 'DG', width: '56px', align: 'center', sortable: false, render: (item) => `<span class="num-cell ${item.dg > 0 ? 'num-cell--positive' : item.dg < 0 ? 'num-cell--negative' : ''}">${item.dg > 0 ? '+' : ''}${item.dg}</span>` },
      ];
      
      const top5 = tabla.slice(0, 5).map((item, i) => ({ ...item, pos: i + 1 }));
      
      const table = createTable({
        columns,
        data: top5,
        keyField: 'id',
        responsive: true,
        rowClass: (item, i) => i < 4 ? 'tr--highlight' : '',
      });
      
      tableContainer.innerHTML = '';
      tableContainer.appendChild(table);
    }
    
    // Load featured match - get next fixture
    const fixtures = await endpoints.fixtures(elite1.id);
    const nextMatch = fixtures
      .filter(f => f.estado === 'programado' || f.estado === 'reprogramado')
      .sort((a, b) => (a.fecha_num || 0) - (b.fecha_num || 0))[0];
    
    if (nextMatch) {
      renderFeaturedMatch(container, nextMatch);
    }
    
    // Cargar estadisticas reales
    try {
      const resumen = await endpoints.resumen();
      const stats = container.querySelectorAll('.home-hero__stat-value[data-count]');
      if (stats.length) {
        const values = [resumen.equipos, resumen.jugados];
        stats.forEach((el, i) => {
          if (values[i] !== undefined) el.textContent = values[i];
        });
      }
    } catch {}
    
  } catch (error) {
    console.error('Home load error:', error);
    showToast('No se pudieron cargar los datos de inicio', 'error');
  }
}

function renderFeaturedMatch(container, match) {
  const media = container.querySelector('.home-featured-match__media');
  const teams = container.querySelector('#featured-teams');
  const countdown = container.querySelector('#featured-countdown');
  
  if (media) {
    // Fondo de marca: gradiente + grilla de cancha (sin texto para que no choque)
    media.innerHTML = `
      <div style="position:absolute;inset:0;background:
        radial-gradient(ellipse 60% 60% at 70% 30%, rgba(25,195,125,.18), transparent 65%),
        repeating-linear-gradient(0deg, rgba(25,195,125,.05) 0 1px, transparent 1px 44px),
        repeating-linear-gradient(90deg, rgba(25,195,125,.05) 0 1px, transparent 1px 44px),
        linear-gradient(160deg, var(--color-primary-700), var(--color-primary-900))"></div>
      <span class="badge badge--primary" style="position:absolute;top:var(--space-3);left:var(--space-3);z-index:2">Próximo partido</span>
    `;
  }
  
  if (teams) {
    const formatTeam = (team) => `
      <div class="home-featured-match__team">
        <div class="home-featured-match__team-avatar avatar avatar--md" style="background:${generateAvatarColor(team)};color:#07130C">${getInitials(team)}</div>
        <span class="home-featured-match__team-name">${escapeHtml(team)}</span>
      </div>
    `;
    teams.innerHTML = formatTeam(match.local) + '<span class="home-featured-match__vs">VS</span>' + formatTeam(match.visitante);
  }
  
  if (countdown && match.fecha) {
    const target = match.hora ? `${match.fecha}T${match.hora}` : match.fecha;
    const cd = createCountdown(target, { 
      compact: false,
      onEnd: () => countdown.innerHTML = '<span class="countdown__value countdown__value--ended">¡EN VIVO!</span>'
    });
    countdown.appendChild(cd);
  }
}

