'use strict';

// All built-in listings are fictional. Non-demo imports must refer to the Diocese of Bridgeport parish registry.
const DEMO_CENTER = { lat: 41.1954, lng: -73.4379, label: 'Wilton, CT (sample center)' };
const STORAGE_KEY = 'the_bridgeport_catholic_import_v1';
const DIOCESE_ID = 'diocese-of-bridgeport';
const OFFICIAL_PARISHES = new Map(BRIDGEPORT_REGISTRY.map(parish => [parish.id, parish]));
// Approximate town-center points for manual distance browsing (not church coordinates).
const TOWN_CENTERS = {
  'Bethel': [41.371, -73.414], 'Bridgeport': [41.187, -73.195], 'Brookfield': [41.482, -73.409],
  'Danbury': [41.394, -73.454], 'Darien': [41.078, -73.470], 'Easton': [41.253, -73.298],
  'Fairfield': [41.141, -73.263], 'Greenwich': [41.026, -73.628], 'Monroe': [41.333, -73.208],
  'New Canaan': [41.146, -73.495], 'New Fairfield': [41.466, -73.486], 'Newtown': [41.414, -73.303],
  'Norwalk': [41.117, -73.408], 'Redding': [41.304, -73.393], 'Ridgefield': [41.281, -73.500],
  'Shelton': [41.316, -73.093], 'Stamford': [41.053, -73.539], 'Stratford': [41.184, -73.133],
  'Trumbull': [41.242, -73.201], 'Weston': [41.200, -73.380], 'Westport': [41.141, -73.357],
  'Wilton': [41.1954, -73.4379]
};
const SERVICE_NAMES = { mass: 'Mass', confession: 'Confession', adoration: 'Adoration', event: 'Event' };
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const state = {
  dataset: null,
  type: 'mass',
  location: { ...DEMO_CENTER },
  locationIsActual: false,
  view: 'list',
  map: null,
  mapMarkers: null,
  toastTimer: null,
  expanded: new Set(),
};

function todayAtMidnight() { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }
function addDays(base, count) { const d = new Date(base); d.setDate(d.getDate() + count); return d; }
function dateISO(d) { return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); }
function parseISO(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const [y, m, d] = day.split('-').map(Number);
  const out = new Date(y, m - 1, d);
  return out.getFullYear() === y && out.getMonth() === m - 1 && out.getDate() === d ? out : null;
}
function withTime(date, time) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) return null; const d = new Date(date); const [h, m] = time.split(':').map(Number); d.setHours(h, m, 0, 0); return d; }
function timeText(time) { const dt = withTime(new Date(), time); return dt ? dt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : time; }
function dayText(d) { return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
function onlyDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function haversine(a, b) { const toRad = Math.PI / 180; const dLat = (b.lat - a.lat) * toRad, dLon = (b.lng - a.lng) * toRad; const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad) * Math.sin(dLon / 2) ** 2; return 3958.76 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)); }
function safeUrl(s) { try { const u = new URL(s); return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : null; } catch (_) { return null; } }
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function sampleData() {
  const p = (id, name, town, lat, lng, services, events = []) => ({ id, name, town, lat, lng, services, events: events.map(e => ({ ...e, date: dateISO(addDays(todayAtMidnight(), e.dayOffset)) })) });
  const s = (type, days, time, end, language = 'English') => ({ type, days, time, end, language });
  const e = (title, dayOffset, time, category) => ({ title, dayOffset, time, category });
  return { meta: { title: 'Illustrative Bridgeport-area demo', dioceseId: DIOCESE_ID, demo: true }, parishes: [
    p('demo-1', 'St. Gabriel Parish (Sample)', 'Wilton', 41.196, -73.438,
      [s('mass', [0], '08:00'), s('mass', [0], '10:30'), s('mass', [1, 2, 3, 4, 5], '07:30'), s('mass', [6], '17:00'), s('confession', [6], '15:30', '16:30'), s('adoration', [4], '18:00', '19:30')],
      [e('Family Rosary Night', 2, '18:30', 'Prayer'), e('Fall Food Drive', 6, '10:00', 'Service')]),
    p('demo-2', 'Our Lady of Hope (Sample)', 'Weston', 41.205, -73.381,
      [s('mass', [0], '09:00'), s('mass', [0], '11:00'), s('mass', [2, 4, 6], '08:30'), s('confession', [6], '16:00', '16:45'), s('adoration', [3], '09:30', '12:00')],
      [e('Bible Study & Coffee', 4, '09:30', 'Faith Formation')]),
    p('demo-3', 'Holy Cross Chapel (Sample)', 'Ridgefield', 41.276, -73.493,
      [s('mass', [0], '07:30'), s('mass', [0], '12:00'), s('mass', [1, 2, 3, 4, 5], '09:00'), s('confession', [3], '18:00', '19:00'), s('adoration', [5], '12:00', '17:00')],
      [e('Youth Ministry Gathering', 3, '19:00', 'Youth')]),
    p('demo-4', 'St. Catherine Parish (Sample)', 'Norwalk', 41.120, -73.418,
      [s('mass', [0], '08:30'), s('mass', [0], '10:00', null, 'Spanish'), s('mass', [0], '12:30'), s('mass', [1, 3, 5], '08:00'), s('confession', [2], '19:00', '20:00'), s('adoration', [2], '17:00', '19:00')],
      [e('Parish Volunteer Fair', 8, '11:30', 'Community')]),
    p('demo-5', 'St. Joseph the Worker (Sample)', 'New Canaan', 41.146, -73.493,
      [s('mass', [0], '09:00'), s('mass', [0], '11:30'), s('mass', [6], '16:30'), s('confession', [6], '14:45', '15:45'), s('adoration', [1], '17:00', '20:00')],
      [e('Evening of Eucharistic Praise', 5, '19:00', 'Prayer')]),
    p('demo-6', 'St. Elizabeth Parish (Sample)', 'Westport', 41.148, -73.349,
      [s('mass', [0], '08:00'), s('mass', [0], '10:00'), s('mass', [1, 2, 3, 4, 5], '07:00'), s('confession', [4], '18:00', '19:00'), s('adoration', [5], '09:00', '11:30')],
      [e('Community Service Day', 10, '09:00', 'Service')]),
    p('demo-7', 'St. Dominic Church (Sample)', 'Stamford', 41.076, -73.518,
      [s('mass', [0], '09:00', null, 'Latin'), s('mass', [0], '11:00'), s('mass', [6], '17:30'), s('confession', [1, 6], '17:00', '17:30'), s('adoration', [3], '18:30', '20:30')],
      [e('Adult Faith Formation', 11, '19:00', 'Faith Formation')]),
    p('demo-8', 'St. Michael Parish (Sample)', 'Danbury', 41.389, -73.451,
      [s('mass', [0], '08:00'), s('mass', [0], '12:00', null, 'Spanish'), s('mass', [1, 3, 5], '07:30'), s('confession', [6], '15:00', '16:00'), s('adoration', [2], '18:00', '20:00')],
      [e('Parish Community Dinner', 7, '18:00', 'Community')])
  ] };
}

function normalizeDataset(raw) {
  if (!raw || !raw.meta || raw.meta.dioceseId !== DIOCESE_ID) throw new Error('Only Diocese of Bridgeport data is accepted (meta.dioceseId).');
  if (!Array.isArray(raw.parishes) || raw.parishes.length > 10000) throw new Error('JSON must contain a parishes array (up to 10,000).');
  const isDemo = raw.meta.demo === true;
  const parishes = raw.parishes.map((p, i) => {
    if (!p || typeof p.name !== 'string' || p.name.trim().length < 2 || !Number.isFinite(Number(p.lat)) || !Number.isFinite(Number(p.lng)) || Math.abs(Number(p.lat)) > 90 || Math.abs(Number(p.lng)) > 180) throw new Error(`Parish #${i + 1} needs a name and valid lat/lng.`);
    const official = !isDemo ? OFFICIAL_PARISHES.get(p.registryId) : null;
    if (!isDemo && !official) throw new Error(`Parish #${i + 1} is not in the Diocese of Bridgeport registry. Supply a valid registryId.`);
    // All demo and imported locations must stay in the Bridgeport region. This is not an affiliation test.
    if (Number(p.lat) < 40.95 || Number(p.lat) > 41.56 || Number(p.lng) < -73.80 || Number(p.lng) > -73.00) {
      throw new Error(`Parish #${i + 1} coordinates are outside the Bridgeport diocesan region.`);
    }
    if (isDemo && !Object.hasOwn(TOWN_CENTERS, p.town)) {
      throw new Error(`Demo parish #${i + 1} must use a Fairfield County town.`);
    }
    const services = (Array.isArray(p.services) ? p.services : []).filter(s => s && ['mass', 'confession', 'adoration'].includes(s.type) && Array.isArray(s.days) && s.days.every(d => Number.isInteger(d) && d >= 0 && d <= 6) && withTime(new Date(), s.time)).map(s => ({ type: s.type, days: s.days, time: s.time, end: withTime(new Date(), s.end) ? s.end : null, language: String(s.language || 'English'), sourceUrl: safeUrl(s.sourceUrl) }));
    const events = (Array.isArray(p.events) ? p.events : []).filter(e => e && typeof e.title === 'string' && parseISO(e.date) && withTime(new Date(), e.time)).map(e => ({ title: e.title, date: e.date, time: e.time, category: String(e.category || 'Parish event'), sourceUrl: safeUrl(e.sourceUrl) }));
    return { id: String(p.id || `parish-${i}`), registryId: official?.id || null, name: official?.name || p.name, town: official?.town || String(p.town || ''), lat: Number(p.lat), lng: Number(p.lng), address: String(p.address || ''), website: safeUrl(p.website), services, events };
  });
  return { meta: { demo: isDemo, dioceseId: DIOCESE_ID }, parishes };
}

function matchesDay(date, filter) {
  const today = todayAtMidnight(), diff = Math.round((onlyDay(date) - today) / 86400000);
  if (filter === 'today') return diff === 0;
  if (filter === 'tomorrow') return diff === 1;
  if (filter === 'saturday') return date.getDay() === 6;
  if (filter === 'sunday') return date.getDay() === 0;
  if (filter === 'weekend') return (date.getDay() === 6 || date.getDay() === 0) && diff >= 0 && diff <= 7;
  return true;
}

function getOccurrences(parish, filter, lang) {
  const now = new Date(), list = [], first = todayAtMidnight();
  for (let offset = 0; offset < 14; offset++) {
    const day = addDays(first, offset);
    if (!matchesDay(day, filter)) continue;
    for (const service of parish.services) {
      if (state.type !== 'all' && state.type !== service.type) continue;
      if (lang !== 'all' && service.language.toLowerCase() !== lang.toLowerCase()) continue;
      if (!service.days.includes(day.getDay())) continue;
      const start = withTime(day, service.time), end = service.end ? withTime(day, service.end) : null;
      if (end && end <= start) end.setDate(end.getDate() + 1);
      // Include an ongoing adoration/confession window, otherwise upcoming starts only.
      if ((end || start) < now) continue;
      list.push({ ...service, date: day, start, end, itemType: service.type });
    }
  }
  return list.sort((a, b) => a.start - b.start);
}

function getEvents(parish, filter) {
  if (!['all', 'event'].includes(state.type)) return [];
  const now = new Date();
  return parish.events.map(e => ({ ...e, start: withTime(parseISO(e.date), e.time), itemType: 'event' }))
    .filter(e => e.start && e.start >= now && e.start <= addDays(now, 14) && matchesDay(e.start, filter))
    .sort((a, b) => a.start - b.start);
}

function buildResults() {
  const filter = document.getElementById('day-filter').value,
    distance = Number(document.getElementById('distance-filter').value),
    lang = document.getElementById('language-filter').value,
    query = document.getElementById('search-input').value.trim().toLowerCase(),
    sort = document.getElementById('sort-filter').value;
  let rows = state.dataset.parishes.map(parish => {
    const miles = haversine(state.location, parish);
    if (miles > distance) return null;
    const services = state.type === 'event' ? [] : getOccurrences(parish, filter, lang);
    const events = getEvents(parish, filter);
    if (state.type === 'event' && lang !== 'all') return null;
    const searchable = `${parish.name} ${parish.town} ${parish.address} ${events.map(e => e.title + ' ' + e.category).join(' ')}`.toLowerCase();
    if (query && !searchable.includes(query)) return null;
    const items = [...services, ...events].sort((a, b) => a.start - b.start);
    if (!items.length) return null;
    return { parish, miles, items, first: items[0].start };
  }).filter(Boolean);
  if (sort === 'nearest') rows.sort((a, b) => a.miles - b.miles || a.first - b.first);
  else if (sort === 'name') rows.sort((a, b) => a.parish.name.localeCompare(b.parish.name));
  else rows.sort((a, b) => a.first - b.first || a.miles - b.miles);
  return rows;
}

function renderItem(item) {
  if (item.itemType === 'event') {
    return `<div class="event-main"><div class="event-date"><span>${escapeHtml(item.start.toLocaleDateString('en-US', { month: 'short' }).toUpperCase())}</span><strong>${item.start.getDate()}</strong></div><div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.category)} · ${escapeHtml(timeText(item.time))}</p></div></div>`;
  }
  const ongoing = item.start <= new Date() && item.end && item.end >= new Date();
  const time = `${timeText(item.time)}${item.end ? ' – ' + item.end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''}`;
  return `<div class="schedule-row"><span class="schedule-day">${escapeHtml(DAY_NAMES[item.date.getDay()])} ${item.date.getDate()}</span><span class="schedule-time">${ongoing ? '● Now · ' : ''}${escapeHtml(time)}</span><span class="schedule-type">${escapeHtml(SERVICE_NAMES[item.itemType])}${item.language && item.language !== 'English' ? ' · ' + escapeHtml(item.language) : ''}</span></div>`;
}

function renderCard(row) {
  const p = row.parish, types = [...new Set(row.items.map(i => i.itemType))];
  const source = p.website || row.items.find(i => i.sourceUrl)?.sourceUrl;
  const demo = state.dataset.meta.demo;
  const website = source ? `<a class="card-link" href="${escapeHtml(source)}" rel="noopener noreferrer" target="_blank">Parish source ↗</a>` : `<span class="card-link disabled">No website linked</span>`;
  const directions = demo ? '' : `<a class="card-link" href="https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent(`${p.lat},${p.lng}`)}" target="_blank" rel="noopener noreferrer">Directions ↗</a>`;
  const subtitle = [p.town, p.address].filter(Boolean).join(' · ');
  const showAll = state.type === 'event' || state.expanded.has(p.id);
  const visible = showAll ? row.items : row.items.slice(0, 2);
  const more = state.type !== 'event' && row.items.length > 2 ? `<button type="button" class="show-more" data-expand="${escapeHtml(p.id)}">${showAll ? 'Show fewer times ↑' : 'See all ' + row.items.length + ' upcoming listings ↓'}</button>` : '';
  return `<article class="result-card"><div class="card-upper"><span class="church-icon" aria-hidden="true">✝</span><div class="card-title-area"><div class="card-heading"><h3>${escapeHtml(p.name)}</h3><span class="card-distance">⌖ ${row.miles.toFixed(1)} mi</span></div><div class="card-town">${escapeHtml(subtitle)}</div></div></div><div class="card-tags">${types.map(type => `<span class="tag ${type}">${escapeHtml(SERVICE_NAMES[type])}</span>`).join('')}${demo ? '<span class="tag">DEMO</span>' : ''}</div><div class="schedule-list">${visible.map(renderItem).join('')}${more}</div><div class="card-footer"><div class="source-label">${demo ? 'Illustrative times · not verified' : 'Confirm latest times with the parish'}</div><div class="card-links">${website}${directions}</div></div></article>`;
}

function renderMap(rows) {
  if (!window.L) { document.getElementById('map-error').hidden = false; return; }
  if (!state.map) {
    state.map = L.map('map', { scrollWheelZoom: false }).setView([state.location.lat, state.location.lng], 11);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(state.map);
    state.mapMarkers = L.layerGroup().addTo(state.map);
  }
  state.map.invalidateSize();
  state.mapMarkers.clearLayers();
  const bounds = [];
  for (const r of rows) {
    const p = r.parish;
    const popup = `<strong>${escapeHtml(p.name)}</strong><br>${escapeHtml(p.town)}<br>${r.miles.toFixed(1)} mi · ${escapeHtml(SERVICE_NAMES[r.items[0].itemType])} ${escapeHtml(dayText(r.first))}`;
    L.marker([p.lat, p.lng]).bindPopup(popup).addTo(state.mapMarkers);
    bounds.push([p.lat, p.lng]);
  }
  const myIcon = L.divIcon({ className: 'user-marker', html: '<div style="background:#b78842;border:3px solid white;box-shadow:0 0 0 2px #b78842;width:15px;height:15px;border-radius:50%"></div>', iconSize: [15, 15] });
  L.marker([state.location.lat, state.location.lng], { icon: myIcon }).bindPopup(escapeHtml(state.location.label)).addTo(state.mapMarkers);
  bounds.push([state.location.lat, state.location.lng]);
  if (bounds.length > 1) state.map.fitBounds(bounds, { padding: [35, 35], maxZoom: 12 });
  else state.map.setView([state.location.lat, state.location.lng], 12);
}

function render() {
  const rows = buildResults(), count = rows.length;
  const type = state.type === 'all' ? 'parishes with upcoming opportunities' : `parishes with ${SERVICE_NAMES[state.type].toLowerCase()} opportunities`;
  const headings = {mass:'Upcoming Masses',confession:'Upcoming Confessions',adoration:'Upcoming Adoration',event:'Parish Events',all:'All Upcoming Opportunities'};
  const heroHeadings = {mass:'Find Mass near you.',confession:'Find Confession near you.',adoration:'Find Adoration near you.',event:'Find parish events.',all:'Find what matters to you.'};
  document.getElementById('results-title').textContent = headings[state.type];
  document.getElementById('hero-heading').textContent = heroHeadings[state.type];
  const eventsCount = rows.reduce((sum, r) => sum + r.items.filter(i => i.itemType === 'event').length, 0);
  document.getElementById('result-count').textContent = state.type === 'event' ? `${eventsCount} upcoming events across ${count} parishes` : `${count} ${type}`;
  document.getElementById('location-summary').textContent = state.locationIsActual ? 'Near your location' : `Near ${state.location.label.replace(' (approximate town center)', '').replace(' (sample center)', '')}`;
  const results = document.getElementById('results'), mapPanel = document.getElementById('map-panel');
  results.innerHTML = rows.map(renderCard).join('');
  const empty = count === 0;
  document.getElementById('empty-state').hidden = !empty;
  results.hidden = empty || state.view === 'map';
  mapPanel.hidden = empty || state.view !== 'map';
  if (!empty && state.view === 'map') renderMap(rows);
  document.getElementById('data-indicator').innerHTML = state.dataset.meta.demo ? '<span class="status-dot"></span> Illustrative sample data' : '<span class="status-dot"></span> Bridgeport-only import · verify schedules';
  document.getElementById('demo-notice').textContent = state.dataset.meta.demo ? ' All parish schedules and events shown are fictional examples, not live information.' : ' Imported schedules are not automatically verified. Confirm with the parish.';
  document.getElementById('map-note-text').textContent = state.dataset.meta.demo ? 'All parish pins are fictional demo locations.' : 'Map pins use imported coordinates. Verify addresses before traveling.';
}

function toast(message) {
  const node = document.getElementById('toast');
  node.textContent = message; node.hidden = false;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { node.hidden = true; }, 4500);
}
function setView(view) {
  state.view = view;
  for (const v of ['list', 'map']) {
    const button = document.getElementById(`${v}-view-btn`);
    button.classList.toggle('chosen', v === view);
    button.setAttribute('aria-pressed', String(v === view));
  }
  render();
}
function loadDataset(raw, persist) {
  state.dataset = normalizeDataset(raw);
  if (persist) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(raw)); } catch (_) { toast('Imported for this session, but local storage is unavailable.'); }
  }
  render();
}
function bindEvents() {
  document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => {
    state.type = button.dataset.type;
    if (state.type === 'event') document.getElementById('language-filter').value = 'all';
    document.querySelectorAll('.tab').forEach(b => { const active = b === button; b.classList.toggle('active', active); b.setAttribute('aria-pressed', String(active)); });
    render();
  }));
  const moreFiltersButton = document.getElementById('more-filters-btn');
  moreFiltersButton.addEventListener('click', () => {
    const expanded = moreFiltersButton.getAttribute('aria-expanded') !== 'true';
    moreFiltersButton.setAttribute('aria-expanded', String(expanded));
    document.getElementById('advanced-filters').hidden = !expanded;
  });
  for (const id of ['day-filter', 'distance-filter', 'language-filter', 'search-input', 'sort-filter']) document.getElementById(id).addEventListener(id === 'search-input' ? 'input' : 'change', render);
  document.getElementById('results').addEventListener('click', e => { const b = e.target.closest('[data-expand]'); if (!b) return; const id = b.getAttribute('data-expand'); if (state.expanded.has(id)) state.expanded.delete(id); else state.expanded.add(id); render(); });
  document.getElementById('list-view-btn').addEventListener('click', () => setView('list'));
  document.getElementById('map-view-btn').addEventListener('click', () => setView('map'));
  document.getElementById('locate-btn').addEventListener('click', () => {
    if (!navigator.geolocation) { toast('Location is unavailable in this browser.'); return; }
    const label = document.getElementById('location-label');
    label.textContent = 'Locating...';
    navigator.geolocation.getCurrentPosition(pos => {
      state.location = { lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'your current location' };
      state.locationIsActual = true;
      document.getElementById('town-picker').value = '';
      label.textContent = 'Using my location';
      render(); toast('Location updated. Distance uses straight-line miles, not driving distance.');
    }, err => { label.textContent = 'Use my location'; toast(err.code === 1 ? 'Location was not enabled. You can still explore the sample area.' : 'Unable to determine your location. Try again or explore the demo.'); }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 });
  });
  const townPicker = document.getElementById('town-picker');
  for (const town of Object.keys(TOWN_CENTERS).sort()) {
    const opt = document.createElement('option'); opt.value = town; opt.textContent = town + ', CT'; townPicker.appendChild(opt);
  }
  townPicker.value = 'Wilton';
  townPicker.addEventListener('change', () => {
    const town = townPicker.value;
    if (!TOWN_CENTERS[town]) return;
    const [lat, lng] = TOWN_CENTERS[town];
    state.location = { lat, lng, label: `${town}, CT (approximate town center)` };
    state.locationIsActual = false;
    document.getElementById('location-label').textContent = 'Use my location';
    render(); toast(`Showing distances from the approximate center of ${town}.`);
  });
  document.getElementById('import-trigger').addEventListener('click', () => document.getElementById('data-file').click());
  document.getElementById('data-file').addEventListener('change', async event => {
    const file = event.target.files?.[0]; if (!file) return;
    try { if (file.size > 5_000_000) throw new Error('Choose a JSON file under 5 MB.'); const data = JSON.parse(await file.text()); loadDataset(data, true); toast(`Imported ${state.dataset.parishes.length} parishes. Check that all times are accurate before using them.`); }
    catch (err) { toast(`Import failed: ${err.message}`); }
    event.target.value = '';
  });
  document.getElementById('reset-data').addEventListener('click', () => { try { localStorage.removeItem(STORAGE_KEY); } catch (_) {} loadDataset(sampleData(), false); toast('Bridgeport-area fictional demo data restored.'); });
  document.getElementById('clear-btn').addEventListener('click', () => {
    state.type = 'mass'; document.querySelector('[data-type="mass"]').click();
    document.getElementById('search-input').value = '';
    document.getElementById('day-filter').value = 'any';
    document.getElementById('distance-filter').value = '999';
    document.getElementById('language-filter').value = 'all';
    render();
  });
}

bindEvents();
let initial = sampleData();
try { const imported = localStorage.getItem(STORAGE_KEY); if (imported) initial = JSON.parse(imported); } catch (_) {}
try { loadDataset(initial, false); } catch (_) { loadDataset(sampleData(), false); }
