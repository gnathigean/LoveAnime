/* ============================================
   LoveAnime — Application Logic
   Jikan API v4 + AniWatch Streaming API
   ============================================ */

const API_BASE = 'https://api.jikan.moe/v4';
const STREAM_API = 'http://localhost:4000/api/v2/hianime';

// ---- State ----
const state = {
  currentView: 'home',
  previousView: 'home',
  favorites: JSON.parse(localStorage.getItem('loveanime_favorites') || '[]'),
  heroAnime: null,
  currentDetailAnime: null,
  browseGenre: '',
  searchDebounce: null,
  // Player state
  playerAnimeId: null,       // HiAnime anime ID (slug)
  playerEpisodes: [],        // Episodes from HiAnime
  playerCurrentEp: null,     // Current episode index
  playerCategory: 'sub',     // sub or dub
  playerIntro: null,         // {start, end}
  playerOutro: null,         // {start, end}
  hlsInstance: null,
};

// ---- DOM Elements ----
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const views = {
  home: $('#homeView'),
  browse: $('#browseView'),
  favorites: $('#favoritesView'),
  search: $('#searchView'),
  detail: $('#detailView'),
};

// ---- API Helpers ----
async function apiFetch(endpoint, retries = 2) {
  try {
    const res = await fetch(`${API_BASE}${endpoint}`);
    if (res.status === 429) {
      if (retries > 0) {
        await sleep(1500);
        return apiFetch(endpoint, retries - 1);
      }
      throw new Error('Rate limited');
    }
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error('API fetch error:', err);
    return null;
  }
}

async function streamFetch(endpoint) {
  try {
    const res = await fetch(`${STREAM_API}${endpoint}`);
    if (!res.ok) throw new Error(`Stream API error: ${res.status}`);
    const json = await res.json();
    return json;
  } catch (err) {
    console.error('Stream API fetch error:', err);
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---- Anime Card HTML ----
function animeCardHTML(anime) {
  const img = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '';
  const title = anime.title || anime.title_english || 'Sem título';
  const score = anime.score || '—';
  const type = anime.type || '';
  const episodes = anime.episodes ? `${anime.episodes} eps` : '';
  const year = anime.year || (anime.aired?.prop?.from?.year) || '';

  return `
    <div class="anime-card" data-id="${anime.mal_id}" onclick="openDetail(${anime.mal_id})">
      <div class="anime-card-img">
        <img src="${img}" alt="${title}" loading="lazy">
        <div class="card-overlay"></div>
        <div class="card-play-btn">
          <i class="fas fa-play"></i>
        </div>
        ${score !== '—' ? `
        <div class="card-score">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          ${score}
        </div>` : ''}
        ${type ? `<div class="card-type">${type}</div>` : ''}
      </div>
      <div class="anime-card-info">
        <div class="anime-card-title">${title}</div>
        <div class="anime-card-sub">
          ${year ? `<span>${year}</span>` : ''}
          ${episodes ? `<span>${episodes}</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

// ---- Render Row / Grid ----
function renderRow(containerId, animes) {
  const container = document.getElementById(containerId);
  if (!animes || animes.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);padding:20px;">Nenhum anime encontrado.</p>';
    return;
  }
  container.innerHTML = animes.map(a => animeCardHTML(a)).join('');
}

function renderGrid(containerId, animes) {
  const container = document.getElementById(containerId);
  if (!animes || animes.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);padding:20px;">Nenhum anime encontrado.</p>';
    return;
  }
  container.innerHTML = animes.map(a => animeCardHTML(a)).join('');
}

// ---- Hero Section ----
async function loadHero() {
  const data = await apiFetch('/top/anime?limit=10&filter=airing');
  if (!data?.data?.length) return;

  const anime = data.data[Math.floor(Math.random() * data.data.length)];
  state.heroAnime = anime;

  const bgImg = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '';
  $('#heroBg').src = bgImg;
  $('#heroTitle').textContent = anime.title || anime.title_english;

  const year = anime.year || (anime.aired?.prop?.from?.year) || '';
  const episodes = anime.episodes ? `${anime.episodes} Episódios` : 'Em exibição';
  const score = anime.score || '';
  const genres = (anime.genres || []).slice(0, 2);

  let metaHTML = '';
  if (year) metaHTML += `<span>${year}</span>`;
  metaHTML += `<span>${episodes}</span>`;
  genres.forEach(g => {
    metaHTML += `<span class="hero-genre">${g.name}</span>`;
  });
  if (score) {
    metaHTML += `
      <span class="hero-stars">
        ${getStarsHTML(score)}
        <span class="score">${score}</span>
      </span>`;
  }
  $('#heroMeta').innerHTML = metaHTML;

  const synopsis = anime.synopsis || 'Sem descrição disponível.';
  $('#heroDesc').textContent = synopsis;

  // Hero play button opens detail
  $('#heroPlayBtn').onclick = () => openDetail(anime.mal_id);

  updateHeroFavBtn();
}

function getStarsHTML(score) {
  const stars = Math.round((score / 10) * 5);
  let html = '';
  for (let i = 0; i < 5; i++) {
    html += i < stars
      ? '<i class="fas fa-star"></i>'
      : '<i class="far fa-star"></i>';
  }
  return html;
}

function updateHeroFavBtn() {
  if (!state.heroAnime) return;
  const isFav = state.favorites.some(f => f.mal_id === state.heroAnime.mal_id);
  const btn = $('#heroFavBtn');
  btn.innerHTML = isFav
    ? '<i class="fas fa-check"></i>'
    : '<i class="fas fa-plus"></i>';
  btn.classList.toggle('favorited', isFav);
}

// ---- Load Home Sections ----
async function loadHome() {
  loadHero();

  await sleep(400);
  const trending = await apiFetch('/top/anime?limit=15&filter=bypopularity');
  if (trending?.data) renderRow('trendingRow', trending.data);

  await sleep(400);
  const season = await apiFetch('/seasons/now?limit=15');
  if (season?.data) renderRow('seasonRow', season.data);

  await sleep(400);
  const top = await apiFetch('/top/anime?limit=15');
  if (top?.data) renderRow('topRow', top.data);

  await sleep(400);
  const movies = await apiFetch('/top/anime?type=movie&limit=15');
  if (movies?.data) renderRow('moviesRow', movies.data);
}

// ---- Browse View ----
async function loadBrowse(genreId = '') {
  const grid = $('#browseGrid');
  grid.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  let endpoint = '/top/anime?limit=24';
  if (genreId) {
    endpoint = `/anime?genres=${genreId}&order_by=score&sort=desc&limit=24&sfw=true`;
  }

  const data = await apiFetch(endpoint);
  if (data?.data) {
    renderGrid('browseGrid', data.data);
  } else {
    grid.innerHTML = '<p style="color:var(--text-muted);">Erro ao carregar. Tente novamente.</p>';
  }
}

// ---- Detail View ----
async function openDetail(malId) {
  switchView('detail');

  const detailEps = $('#episodesRow');
  detailEps.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  const data = await apiFetch(`/anime/${malId}/full`);
  if (!data?.data) return;

  const anime = data.data;
  state.currentDetailAnime = anime;

  const bgImg = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '';
  const posterImg = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '';

  $('#detailBg').src = bgImg;
  $('#detailPoster').src = posterImg;
  $('#detailTitle').textContent = anime.title || anime.title_english;

  const year = anime.year || (anime.aired?.prop?.from?.year) || '';
  const eps = anime.episodes ? `${anime.episodes} Episódios` : 'Em exibição';
  const status = anime.status || '';
  const score = anime.score || '';

  let metaHTML = '';
  if (year) metaHTML += `<span>${year}</span>`;
  metaHTML += `<span>${eps}</span>`;
  if (status) metaHTML += `<span>${status}</span>`;
  if (score) {
    metaHTML += `<span class="hero-stars">${getStarsHTML(score)} <span class="score">${score}</span></span>`;
  }
  $('#detailMeta').innerHTML = metaHTML;

  const genres = anime.genres || [];
  $('#detailGenres').innerHTML = genres.map(g => `<span class="genre-tag">${g.name}</span>`).join('');

  $('#detailSynopsis').textContent = anime.synopsis || 'Sem descrição disponível.';
  $('#detailSynopsis').style.webkitLineClamp = '10';

  // MAL link
  $('#detailMalBtn').href = anime.url || '#';

  updateDetailFavBtn();

  // Search and load streaming episodes from HiAnime
  await loadStreamingEpisodes(anime);
}

// ---- Stream Integration: Search anime on HiAnime and load episodes ----
async function loadStreamingEpisodes(anime) {
  const detailEps = $('#episodesRow');
  const posterImg = anime.images?.jpg?.large_image_url || anime.images?.jpg?.image_url || '';

  // Search on HiAnime by anime title
  const searchTitle = (anime.title_english || anime.title || '').replace(/[^\w\s]/g, '');
  const searchResult = await streamFetch(`/search?q=${encodeURIComponent(searchTitle)}&page=1`);

  if (!searchResult?.data?.animes?.length) {
    // Fallback: show Jikan episodes without streaming
    await loadJikanEpisodes(anime, posterImg);
    return;
  }

  // Try to find the best match - prefer exact match or first result
  let matchedAnime = searchResult.data.animes[0];

  // Try to match by checking mal_id if available
  for (const a of searchResult.data.animes) {
    const nameNorm = a.name.toLowerCase().trim();
    const titleNorm = (anime.title || '').toLowerCase().trim();
    const titleEngNorm = (anime.title_english || '').toLowerCase().trim();
    if (nameNorm === titleNorm || nameNorm === titleEngNorm) {
      matchedAnime = a;
      break;
    }
  }

  state.playerAnimeId = matchedAnime.id;

  // Fetch episodes from HiAnime
  const epsData = await streamFetch(`/anime/${matchedAnime.id}/episodes`);

  if (!epsData?.data?.episodes?.length) {
    await loadJikanEpisodes(anime, posterImg);
    return;
  }

  state.playerEpisodes = epsData.data.episodes;

  // Render episode cards with play functionality
  detailEps.innerHTML = epsData.data.episodes.slice(0, 30).map((ep, i) => `
    <div class="episode-card" onclick="playEpisode(${i})">
      <div class="episode-card-img">
        <img src="${posterImg}" alt="Ep ${ep.number}" loading="lazy">
        <span class="ep-number">E${ep.number}</span>
        <div class="card-play-btn" style="opacity:0">
          <i class="fas fa-play"></i>
        </div>
      </div>
      <div class="episode-card-title">${ep.title || `Episódio ${ep.number}`}</div>
    </div>
  `).join('');

  // Update play button text
  const playBtn = $('#detailPlayBtn span');
  if (playBtn) playBtn.textContent = 'Assistir Ep 1';
}

async function loadJikanEpisodes(anime, posterImg) {
  const detailEps = $('#episodesRow');
  await sleep(400);
  const epsData = await apiFetch(`/anime/${anime.mal_id}/episodes`);
  if (epsData?.data?.length) {
    detailEps.innerHTML = epsData.data.slice(0, 20).map((ep) => `
      <div class="episode-card">
        <div class="episode-card-img">
          <img src="${posterImg}" alt="Ep ${ep.mal_id}" loading="lazy">
          <span class="ep-number">E${ep.mal_id}</span>
        </div>
        <div class="episode-card-title">Episódio ${ep.mal_id}: ${ep.title || 'Sem título'}</div>
      </div>
    `).join('');
  } else {
    detailEps.innerHTML = '<p style="color:var(--text-muted);padding:8px;">Nenhum episódio disponível.</p>';
  }
}

function updateDetailFavBtn() {
  if (!state.currentDetailAnime) return;
  const isFav = state.favorites.some(f => f.mal_id === state.currentDetailAnime.mal_id);
  const btn = $('#detailFavBtn');
  btn.classList.toggle('favorited', isFav);
}

// ===========================================================
// ---- VIDEO PLAYER ----
// ===========================================================

function playFirstEpisode() {
  if (state.playerEpisodes.length === 0) {
    showToast('Nenhum episódio disponível para streaming.', 'error');
    return;
  }
  playEpisode(0);
}

async function playEpisode(index) {
  if (!state.playerEpisodes[index]) return;

  const ep = state.playerEpisodes[index];
  state.playerCurrentEp = index;

  // Open player modal
  const modal = $('#playerModal');
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  // Update header info
  const animeTitle = state.currentDetailAnime?.title || state.currentDetailAnime?.title_english || '';
  $('#playerTitle').textContent = animeTitle;
  $('#playerSubtitle').textContent = `Episódio ${ep.number}${ep.title ? ' — ' + ep.title : ''}`;

  // Show loading
  $('#playerLoading').style.display = 'flex';
  $('#skipIntroBtn').style.display = 'none';
  $('#skipOutroBtn').style.display = 'none';

  // Render episodes panel
  renderPlayerEpisodesList();

  // Load streaming source
  await loadStreamingSource(ep.episodeId, state.playerCategory);
}

async function loadStreamingSource(episodeId, category = 'sub') {
  const video = $('#videoPlayer');
  const loading = $('#playerLoading');

  loading.style.display = 'flex';

  // Destroy previous HLS instance
  if (state.hlsInstance) {
    state.hlsInstance.destroy();
    state.hlsInstance = null;
  }

  // Get streaming sources
  const sourcesData = await streamFetch(
    `/episode/sources?animeEpisodeId=${episodeId}&server=hd-1&category=${category}`
  );

  if (!sourcesData?.data?.sources?.length) {
    // Try alternate server
    const altData = await streamFetch(
      `/episode/sources?animeEpisodeId=${episodeId}&server=hd-2&category=${category}`
    );
    if (!altData?.data?.sources?.length) {
      loading.innerHTML = `
        <i class="fas fa-exclamation-triangle" style="font-size:32px;color:var(--star-color);"></i>
        <p>Não foi possível carregar este episódio.</p>
        <p style="font-size:12px;color:var(--text-muted);">Tente trocar entre SUB/DUB.</p>
      `;
      return;
    }
    return loadStreamWithData(altData.data, video, loading);
  }

  loadStreamWithData(sourcesData.data, video, loading);
}

const PROXY_BASE = 'http://localhost:4001/proxy';

function loadStreamWithData(data, video, loading) {
  const source = data.sources[0];
  state.playerIntro = data.intro || null;
  state.playerOutro = data.outro || null;

  // Load subtitles
  video.querySelectorAll('track').forEach(t => t.remove());

  if (data.tracks) {
    const subs = data.tracks.filter(t => t.lang !== 'thumbnails');
    subs.forEach(sub => {
      const track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = sub.lang;
      track.srclang = sub.lang.substring(0, 2).toLowerCase();
      track.src = sub.url;
      if (sub.lang === 'Portuguese' || sub.lang === 'English') {
        track.default = true;
      }
      video.appendChild(track);
    });
  }

  // Use Proxy for HLS stream
  if (source.url && Hls.isSupported()) {
    const hls = new Hls({
      maxBufferLength: 30,
      maxMaxBufferLength: 60,
      xhrSetup: function (xhr, url) {
        // Force proxy for everything loaded by HLS.js if not already proxied
        if (!url.includes('/proxy?')) {
          const referer = data.headers?.Referer || 'https://megacloud.blog/';
          const newUrl = `${PROXY_BASE}?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`;
          xhr.open('GET', newUrl, true);
        }
      }
    });
    state.hlsInstance = hls;

    // Construct valid proxy URL for the master playlist
    const referer = data.headers?.Referer || 'https://megacloud.blog/';
    const proxyUrl = `${PROXY_BASE}?url=${encodeURIComponent(source.url)}&referer=${encodeURIComponent(referer)}`;

    console.log('Loading via proxy:', proxyUrl);

    hls.loadSource(proxyUrl);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      loading.style.display = 'none';
      video.play().catch(e => console.log('Autoplay blocked:', e));
    });

    hls.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) {
        console.error('HLS fatal error:', data);
        loading.innerHTML = `
          <i class="fas fa-exclamation-triangle" style="font-size:32px;color:var(--star-color);"></i>
          <p>Erro no stream (Proxy).</p>
        `;
      }
    });
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Safari Native HLS (Proxy needed here too)
    const referer = data.headers?.Referer || 'https://megacloud.blog/';
    const proxyUrl = `${PROXY_BASE}?url=${encodeURIComponent(source.url)}&referer=${encodeURIComponent(referer)}`;

    video.src = proxyUrl;
    video.addEventListener('loadedmetadata', () => {
      loading.style.display = 'none';
      video.play().catch(() => { });
    }, { once: true });
  } else {
    loading.innerHTML = `
      <i class="fas fa-exclamation-triangle" style="font-size:32px;color:var(--star-color);"></i>
      <p>Navegador não suportado.</p>
    `;
  }
}

// ---- Skip Intro/Outro ----
function setupSkipButtons() {
  const video = $('#videoPlayer');
  const introBtn = $('#skipIntroBtn');
  const outroBtn = $('#skipOutroBtn');

  video.addEventListener('timeupdate', () => {
    const t = video.currentTime;

    // Intro
    if (state.playerIntro && state.playerIntro.start > 0) {
      if (t >= state.playerIntro.start && t < state.playerIntro.end) {
        introBtn.style.display = 'block';
      } else {
        introBtn.style.display = 'none';
      }
    }

    // Outro
    if (state.playerOutro && state.playerOutro.start > 0) {
      if (t >= state.playerOutro.start && t < state.playerOutro.end) {
        outroBtn.style.display = 'block';
      } else {
        outroBtn.style.display = 'none';
      }
    }
  });

  introBtn.addEventListener('click', () => {
    if (state.playerIntro) {
      video.currentTime = state.playerIntro.end;
      introBtn.style.display = 'none';
    }
  });

  outroBtn.addEventListener('click', () => {
    // Go to next episode
    const nextIdx = state.playerCurrentEp + 1;
    if (nextIdx < state.playerEpisodes.length) {
      playEpisode(nextIdx);
    }
  });
}

// ---- Player Episodes Panel ----
function renderPlayerEpisodesList() {
  const list = $('#panelEpisodesList');
  list.innerHTML = state.playerEpisodes.map((ep, i) => `
    <div class="panel-ep-item ${i === state.playerCurrentEp ? 'active' : ''}" onclick="playEpisode(${i})">
      <div class="ep-num">${ep.number}</div>
      <div class="ep-info">
        <div class="ep-title">${ep.title || `Episódio ${ep.number}`}</div>
        <div class="ep-meta">${ep.isFiller ? 'Filler' : ''}</div>
      </div>
      <div class="ep-play-icon">
        <i class="fas ${i === state.playerCurrentEp ? 'fa-volume-high' : 'fa-play'}"></i>
      </div>
    </div>
  `).join('');

  // Scroll to active episode
  const activeItem = list.querySelector('.panel-ep-item.active');
  if (activeItem) {
    activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function closePlayer() {
  const modal = $('#playerModal');
  const video = $('#videoPlayer');

  modal.classList.remove('active');
  document.body.style.overflow = '';

  // Stop video
  video.pause();
  video.removeAttribute('src');
  video.querySelectorAll('track').forEach(t => t.remove());

  if (state.hlsInstance) {
    state.hlsInstance.destroy();
    state.hlsInstance = null;
  }

  // Reset loading state
  $('#playerLoading').innerHTML = '<div class="spinner"></div><p>Carregando episódio...</p>';
  $('#skipIntroBtn').style.display = 'none';
  $('#skipOutroBtn').style.display = 'none';
}

// ---- Favorites ----
function toggleFavorite(anime) {
  const idx = state.favorites.findIndex(f => f.mal_id === anime.mal_id);
  if (idx > -1) {
    state.favorites.splice(idx, 1);
    showToast(`"${anime.title}" removido dos favoritos`, 'error');
  } else {
    state.favorites.push({
      mal_id: anime.mal_id,
      title: anime.title || anime.title_english,
      images: anime.images,
      score: anime.score,
      type: anime.type,
      episodes: anime.episodes,
      year: anime.year || anime.aired?.prop?.from?.year,
    });
    showToast(`"${anime.title}" adicionado aos favoritos!`, 'success');
  }
  localStorage.setItem('loveanime_favorites', JSON.stringify(state.favorites));
  updateFavBadge();
  updateHeroFavBtn();
  updateDetailFavBtn();
}

function updateFavBadge() {
  const badge = $('#favBadge');
  const count = state.favorites.length;
  if (count > 0) {
    badge.style.display = 'flex';
    badge.textContent = count;
  } else {
    badge.style.display = 'none';
  }
}

function renderFavorites() {
  const grid = $('#favoritesGrid');
  const empty = $('#favoritesEmpty');

  if (state.favorites.length === 0) {
    grid.innerHTML = '';
    grid.appendChild(empty);
    empty.style.display = 'block';
    return;
  }

  empty.style.display = 'none';
  grid.innerHTML = state.favorites.map(a => animeCardHTML(a)).join('');
}

// ---- Search ----
async function searchAnime(query) {
  if (!query || query.length < 2) return;

  switchView('search');
  $('#searchTitle span').textContent = query;
  const grid = $('#searchGrid');
  grid.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

  const data = await apiFetch(`/anime?q=${encodeURIComponent(query)}&limit=24&sfw=true`);
  if (data?.data) {
    renderGrid('searchGrid', data.data);
  } else {
    grid.innerHTML = '<p style="color:var(--text-muted);">Nenhum resultado encontrado.</p>';
  }
}

// ---- View Switching ----
function switchView(viewName) {
  if (viewName === state.currentView) return;

  state.previousView = state.currentView;
  state.currentView = viewName;

  Object.values(views).forEach(v => {
    v.classList.remove('active');
    if (v.classList.contains('home-view')) {
      v.classList.add('hidden');
    }
  });

  const target = views[viewName];
  if (target) {
    if (target.classList.contains('home-view')) {
      target.classList.remove('hidden');
    } else {
      target.classList.add('active');
    }
  }

  $$('.sidebar-btn[data-view]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.view === viewName);
  });

  $$('.header-nav a[data-view]').forEach(a => {
    a.classList.toggle('active', a.dataset.view === viewName);
  });

  if (viewName === 'browse' || viewName === 'trending') {
    loadBrowse(state.browseGenre);
  } else if (viewName === 'favorites') {
    renderFavorites();
  }

  // Update bottom nav active state
  $$('.bottom-nav .nav-item').forEach(link => {
    link.classList.toggle('active', link.dataset.view === viewName);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ---- Toast ----
function showToast(message, type = 'success') {
  const container = $('#toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' ? 'fa-check-circle' : 'fa-times-circle';
  toast.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(30px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ---- Event Listeners ----
function initEventListeners() {
  // Sidebar navigation
  $$('.sidebar-btn[data-view]').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  // Header navigation
  $$('.header-nav a[data-view]').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      switchView(a.dataset.view);
    });
  });

  // Section "ver todos"
  $$('.section-more[data-view]').forEach(el => {
    el.addEventListener('click', () => switchView(el.dataset.view));
  });

  // Search
  const searchInput = $('#searchInput');
  searchInput.addEventListener('input', () => {
    clearTimeout(state.searchDebounce);
    const query = searchInput.value.trim();
    if (query.length < 2) {
      if (state.currentView === 'search') {
        switchView('home');
      }
      return;
    }
    state.searchDebounce = setTimeout(() => searchAnime(query), 500);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(state.searchDebounce);
      const query = searchInput.value.trim();
      if (query.length >= 2) searchAnime(query);
    }
  });

  // Hero fav button
  $('#heroFavBtn').addEventListener('click', () => {
    if (state.heroAnime) toggleFavorite(state.heroAnime);
  });

  // Hero info button
  $('#heroInfoBtn').addEventListener('click', () => {
    if (state.heroAnime) openDetail(state.heroAnime.mal_id);
  });

  // Detail back button
  $('#detailBack').addEventListener('click', () => {
    switchView(state.previousView || 'home');
  });

  // Detail fav button
  $('#detailFavBtn').addEventListener('click', () => {
    if (state.currentDetailAnime) toggleFavorite(state.currentDetailAnime);
  });

  // Genre filters
  $$('#genreFilters .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('#genreFilters .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.browseGenre = btn.dataset.genre;
      loadBrowse(state.browseGenre);
    });
  });

  // Sidebar logo -> home
  $('.sidebar-logo').addEventListener('click', () => switchView('home'));

  // ---- Player Events ----
  // Close player
  $('#playerCloseBtn').addEventListener('click', closePlayer);

  // Audio toggle (SUB/DUB)
  $$('.audio-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.audio-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.playerCategory = btn.dataset.category;

      // Reload current episode with new category
      if (state.playerCurrentEp !== null && state.playerEpisodes[state.playerCurrentEp]) {
        const ep = state.playerEpisodes[state.playerCurrentEp];
        loadStreamingSource(ep.episodeId, state.playerCategory);
      }
    });
  });

  // Episodes panel toggle
  $('#panelToggle').addEventListener('click', () => {
    const panel = $('#playerEpisodesPanel');
    panel.classList.toggle('collapsed');
    const icon = $('#panelToggle i');
    icon.className = panel.classList.contains('collapsed')
      ? 'fas fa-chevron-left'
      : 'fas fa-chevron-right';
  });

  // Setup skip buttons
  setupSkipButtons();

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Close player with Escape
    if (e.key === 'Escape') {
      if ($('#playerModal').classList.contains('active')) {
        closePlayer();
        return;
      }
      if (state.currentView === 'detail') {
        switchView(state.previousView || 'home');
      } else if (state.currentView === 'search') {
        $('#searchInput').value = '';
        switchView('home');
      }
    }
    // Focus search with /
    if (e.key === '/' && document.activeElement !== $('#searchInput') && !$('#playerModal').classList.contains('active')) {
      e.preventDefault();
      $('#searchInput').focus();
    }
  });
}

// ---- Initialize ----
function init() {
  initEventListeners();
  updateFavBadge();
  loadHome();
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
