/* Kaartenkluis — collectietracker met booster pack opener.
   Kaartdata, afbeeldingen en prijzen: TCGdex (https://tcgdex.dev), geen API-sleutel nodig. */
(() => {
'use strict';

const API = 'https://api.tcgdex.net/v2';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- opslag ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('kk.' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('kk.' + k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem('kk.' + k); } catch {} },
};
let collection = store.get('collection', {});   // id -> kaart
let pack = store.get('pack', []);               // kaarten die wachten in het pakje
let settings = Object.assign({ lang: 'en' }, store.get('settings', {}));
const saveCollection = () => { if (!store.set('collection', collection)) toast('Opslaan mislukt: opslag is vol'); };
const savePack = () => store.set('pack', pack);

/* ---------- API ---------- */
const mem = new Map();
async function api(path, { cache = false, ttl = 7 * 864e5 } = {}) {
  const key = settings.lang + path;
  if (mem.has(key)) return mem.get(key);
  const ck = 'cache.' + key;
  const hit = cache ? store.get(ck, null) : null;
  if (hit && Date.now() - hit.t < ttl) { mem.set(key, hit.d); return hit.d; }
  try {
    const res = await fetch(`${API}/${settings.lang}${path}`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    mem.set(key, d);
    if (cache) store.set(ck, { t: Date.now(), d });
    return d;
  } catch (e) {
    if (hit) { mem.set(key, hit.d); return hit.d; }   // offline: gebruik oude kopie
    throw e;
  }
}
const setIdOf = id => id.slice(0, id.lastIndexOf('-'));
const imgUrl = (c, q = 'low') => c.image ? `${c.image}/${q}.webp` : null;
let setsCache = null;
async function getSets() {
  if (!setsCache) setsCache = (await api('/sets', { cache: true, ttl: 864e5 })).filter(s => s && s.id);
  return setsCache;
}
const setName = id => (setsCache && setsCache.find(s => s.id === id)?.name) || id;

function pickPrice(p) {
  const cm = p && p.cardmarket;
  if (cm) {
    const v = cm.trend || cm.avg || cm.avg30 || cm['trend-holo'] || cm['avg-holo'] || cm['avg30-holo'];
    if (v) return { v, unit: 'EUR' };
  }
  const tp = p && p.tcgplayer;
  if (tp) for (const k of Object.keys(tp)) {
    const m = tp[k] && (tp[k].marketPrice || tp[k].midPrice);
    if (m) return { v: m, unit: 'USD' };
  }
  return null;
}
function fromDetail(d) {
  return {
    id: d.id, name: d.name, image: d.image || null, localId: d.localId,
    setId: (d.set && d.set.id) || setIdOf(d.id), setName: (d.set && d.set.name) || setName(setIdOf(d.id)),
    rarity: d.rarity || '', price: pickPrice(d.pricing), priceAt: Date.now(),
  };
}
const fromBrief = b => ({ id: b.id, name: b.name, image: b.image || null, localId: b.localId, setId: setIdOf(b.id), setName: setName(setIdOf(b.id)), rarity: '', price: null, priceAt: 0 });

/* zeldzaamheid -> effectniveau 0..3 */
function tier(r) {
  r = (r || '').toLowerCase();
  if (!r || r === 'none' || /^(common|uncommon|one diamond|two diamond|three diamond)$/.test(r)) return 0;
  if (/special|hyper|secret|ultra|illustration|shiny|gold|rainbow|crown|amazing|radiant|ace spec|mega|star/.test(r)) return 3;
  if (r === 'rare') return 1;
  return 2;
}
const money = (v, unit = 'EUR') => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: unit }).format(v);
const priceText = c => c.price ? money(c.price.v, c.price.unit) : '';

/* ---------- kaart-element ---------- */
function cardHTML(c, { q = 'low', cls = '' } = {}) {
  const src = imgUrl(c, q);
  return `<div class="card tier-${tier(c.rarity)} ${cls}">
    <div class="card-face">${src ? `<img src="${esc(src)}" alt="${esc(c.name)}" loading="lazy" draggable="false">` : `<div class="card-ph">${esc(c.name)}</div>`}
      <div class="shine"></div><div class="sparkle"></div><div class="glare"></div></div></div>`;
}

/* ---------- holografische tilt (muis + vinger) ---------- */
let tiltEl = null;
function resetTilt(el) {
  el.classList.remove('tilting');
  for (const p of ['--rx', '--ry', '--mx', '--my']) el.style.removeProperty(p);
}
document.addEventListener('pointermove', e => {
  const el = e.target.closest ? e.target.closest('.tiltable') : null;
  if (tiltEl && tiltEl !== el) { resetTilt(tiltEl); tiltEl = null; }
  if (!el) return;
  if (e.pointerType === 'touch' && !el.classList.contains('touch-tilt')) return;
  const r = el.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  const max = el.classList.contains('touch-tilt') ? 22 : 14;
  el.style.setProperty('--mx', (x * 100).toFixed(1));
  el.style.setProperty('--my', (y * 100).toFixed(1));
  el.style.setProperty('--rx', ((0.5 - y) * max).toFixed(2) + 'deg');
  el.style.setProperty('--ry', ((x - 0.5) * max).toFixed(2) + 'deg');
  el.classList.add('tilting');
  tiltEl = el;
}, { passive: true });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) {
  document.addEventListener(ev, e => { if (tiltEl && (e.pointerType === 'touch' || ev === 'pointerleave')) { resetTilt(tiltEl); tiltEl = null; } }, true);
}

/* ---------- toast / modal ---------- */
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => t.hidden = true, 2200);
}
function openModal(html) {
  $('#modal-box').innerHTML = `<button class="x" data-close aria-label="Sluiten">×</button>` + html;
  $('#modal').hidden = false;
  return $('#modal-box');
}
const closeModal = () => { $('#modal').hidden = true; $('#modal-box').innerHTML = ''; };
$('#modal').addEventListener('click', e => { if (e.target.closest('[data-close]')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (!$('#opener').hidden) closeOpener(); else closeModal(); } });

/* ---------- navigatie ---------- */
function show(view) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + view));
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  if (view === 'collection') renderCollection();
  if (view === 'sets') renderSets();
  if (view === 'add') setTimeout(() => $('#add-search').focus({ preventScroll: true }), 50);
  window.scrollTo(0, 0);
}
$('#tabs').addEventListener('click', e => { const b = e.target.closest('button'); if (b) show(b.dataset.view); });
document.addEventListener('click', e => { const g = e.target.closest('[data-goto]'); if (g) show(g.dataset.goto); });

/* =====================================================
   COLLECTIE
   ===================================================== */
function totals() {
  const cards = Object.values(collection);
  let count = 0, eur = 0, usd = 0, unpriced = 0;
  const sets = new Set();
  for (const c of cards) {
    count += c.qty; sets.add(c.setId);
    if (!c.price) unpriced++; else if (c.price.unit === 'USD') usd += c.price.v * c.qty; else eur += c.price.v * c.qty;
  }
  return { unique: cards.length, count, eur, usd, unpriced, sets: sets.size };
}
function renderCollection() {
  const t = totals();
  const val = money(t.eur) + (t.usd ? ' + ' + money(t.usd, 'USD') : '');
  $('#stats').innerHTML = `
    <div class="stat hero"><b>${val}</b><span>Geschatte waarde${t.unpriced ? ` · ${t.unpriced} zonder prijs` : ''}</span></div>
    <div class="stat"><b>${t.count}</b><span>Kaarten totaal</span></div>
    <div class="stat"><b>${t.unique}</b><span>Unieke kaarten</span></div>
    <div class="stat"><b>${t.sets}</b><span>Sets</span></div>`;
  const q = $('#col-search').value.trim().toLowerCase();
  const sort = $('#col-sort').value;
  let cards = Object.values(collection);
  if (q) cards = cards.filter(c => (c.name + ' ' + c.setName + ' ' + c.rarity + ' ' + c.localId).toLowerCase().includes(q));
  const num = c => parseInt(c.localId, 10) || 0;
  const by = {
    recent: (a, b) => b.addedAt - a.addedAt,
    value: (a, b) => (b.price ? b.price.v : 0) - (a.price ? a.price.v : 0),
    name: (a, b) => a.name.localeCompare(b.name),
    set: (a, b) => a.setName.localeCompare(b.setName) || num(a) - num(b),
    rarity: (a, b) => tier(b.rarity) - tier(a.rarity) || (b.price ? b.price.v : 0) - (a.price ? a.price.v : 0),
  }[sort];
  cards.sort(by);
  $('#col-empty').hidden = Object.keys(collection).length > 0;
  $('.toolbar', $('#view-collection')).hidden = Object.keys(collection).length === 0;
  $('#col-grid').innerHTML = cards.map(c => `
    <div class="tile" data-id="${esc(c.id)}">
      ${c.qty > 1 ? `<span class="badge">×${c.qty}</span>` : ''}
      ${cardHTML(c, { cls: 'tiltable' })}
      <div class="meta"><b>${esc(c.name)}</b><span>${esc(c.setName)} · ${esc(c.localId)}<em>${priceText(c)}</em></span></div>
    </div>`).join('');
}
$('#col-search').addEventListener('input', renderCollection);
$('#col-sort').addEventListener('change', renderCollection);
$('#col-grid').addEventListener('click', e => { const t = e.target.closest('.tile'); if (t) openDetail(t.dataset.id); });

function openDetail(id) {
  const c = collection[id]; if (!c) return;
  const box = openModal(`
    <div class="detail">
      <div>${cardHTML(c, { q: 'high', cls: 'tiltable touch-tilt idle-shine' })}<p class="hint" style="text-align:center;margin-top:10px">Beweeg je muis of vinger over de kaart</p></div>
      <div>
        <h2>${esc(c.name)}</h2>
        <div class="price">${priceText(c) || '<span class="hint">Geen prijs bekend</span>'}</div>
        <dl>
          <dt>Set</dt><dd>${esc(c.setName)}</dd>
          <dt>Nummer</dt><dd>${esc(c.localId)}</dd>
          <dt>Zeldzaamheid</dt><dd>${esc(c.rarity || 'Onbekend')}</dd>
          <dt>Toegevoegd</dt><dd>${new Date(c.addedAt).toLocaleDateString('nl-NL')}</dd>
        </dl>
        <div class="stepper"><button data-q="-1" aria-label="Minder">−</button><b id="d-qty">${c.qty}</b><button data-q="1" aria-label="Meer">+</button></div>
        <p class="hint" style="margin-top:14px">Zet het aantal op 0 om de kaart te verwijderen.</p>
      </div>
    </div>`);
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-q]'); if (!b) return;
    c.qty += +b.dataset.q;
    if (c.qty <= 0) { delete collection[id]; saveCollection(); closeModal(); renderCollection(); toast('Kaart verwijderd'); return; }
    $('#d-qty').textContent = c.qty; saveCollection(); renderCollection();
  });
}

/* =====================================================
   PAKJE VULLEN
   ===================================================== */
const pending = new Map();   // id -> promise van detail-ophalen
function addToPack(brief) {
  const entry = fromBrief(brief);
  entry.key = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  pack.push(entry); savePack(); updateFab(true);
  if (!pending.has(entry.id)) {
    pending.set(entry.id, api('/cards/' + encodeURIComponent(entry.id)).then(fromDetail).catch(() => null));
  }
  pending.get(entry.id).then(d => {
    if (!d) return;
    const e = pack.find(p => p.key === entry.key);
    if (e) { Object.assign(e, d); savePack(); }
  });
  toast(`${brief.name} zit in je pakje`);
}
const inPack = id => pack.filter(p => p.id === id).length;
function updateFab(bump) {
  const f = $('#fab'); f.hidden = pack.length === 0;
  $('#fab-label').textContent = `Pakje openen (${pack.length})`;
  if (bump) { f.classList.remove('bump'); void f.offsetWidth; f.classList.add('bump'); }
}
$('#fab').addEventListener('click', openPackSheet);
function openPackSheet() {
  const render = () => {
    if (!pack.length) { closeModal(); updateFab(); return; }
    const box = openModal(`<h2>Je pakje</h2><p>${pack.length} ${pack.length === 1 ? 'kaart wacht' : 'kaarten wachten'} om onthuld te worden.</p>
      <div class="packlist">${pack.map(p => `<div class="packitem">${imgUrl(p) ? `<img src="${esc(imgUrl(p))}" alt="">` : '<span class="thumb-ph"></span>'}
        <div><b>${esc(p.name)}</b><span>${esc(p.setName)} · ${esc(p.localId)}</span></div><button data-rm="${esc(p.key)}" aria-label="Uit pakje halen">×</button></div>`).join('')}</div>
      <button class="btn primary big" id="go-open">Scheur het pakje open</button>`);
    box.onclick = e => {
      const rm = e.target.closest('[data-rm]');
      if (rm) { pack = pack.filter(p => p.key !== rm.dataset.rm); savePack(); updateFab(); render(); refreshBadges(); }
      if (e.target.closest('#go-open')) { closeModal(); startOpener(); }
    };
  };
  render();
}

/* zoek- en setroosters delen dezelfde tegel */
function pickTileHTML(b, { dim = false } = {}) {
  const own = collection[b.id], n = inPack(b.id);
  return `<div class="tile ${dim && !own ? 'missing' : ''}" data-id="${esc(b.id)}">
    ${own ? `<span class="badge have">✓${own.qty > 1 ? ' ' + own.qty : ''}</span>` : ''}
    ${n ? `<span class="badge inpack">+${n}</span>` : ''}
    ${cardHTML(b)}
    <div class="meta"><b>${esc(b.name)}</b><span>${esc(setName(setIdOf(b.id)))} · ${esc(b.localId)}</span></div></div>`;
}
let briefIndex = new Map();
function refreshBadges() {
  $$('#add-grid .tile, #set-grid .tile').forEach(t => {
    const b = briefIndex.get(t.dataset.id); if (!b) return;
    const dim = t.closest('#set-grid') !== null;
    t.outerHTML = pickTileHTML(b, { dim });
  });
}
function onPick(e) {
  const t = e.target.closest('.tile'); if (!t) return;
  const b = briefIndex.get(t.dataset.id); if (!b) return;
  addToPack(b);
  t.outerHTML = pickTileHTML(b, { dim: e.currentTarget.id === 'set-grid' });
}
$('#add-grid').addEventListener('click', onPick);
$('#set-grid').addEventListener('click', onPick);

/* ---------- zoeken ---------- */
let searchState = { q: '', page: 1 };
const PER = 48;
async function runSearch(more) {
  const st = $('#add-status');
  if (!more) { searchState = { q: $('#add-search').value.trim(), page: 1 }; $('#add-grid').innerHTML = ''; }
  else searchState.page++;
  if (!searchState.q) return;
  st.textContent = 'Zoeken…'; $('#add-more').hidden = true;
  try {
    await getSets().catch(() => null);
    const res = await api(`/cards?name=${encodeURIComponent(searchState.q)}&pagination:page=${searchState.page}&pagination:itemsPerPage=${PER}`);
    const list = (Array.isArray(res) ? res : []).filter(b => b && b.id);
    list.forEach(b => briefIndex.set(b.id, b));
    $('#add-grid').insertAdjacentHTML('beforeend', list.map(b => pickTileHTML(b)).join(''));
    const shown = $$('#add-grid .tile').length;
    st.textContent = shown ? `${shown} kaarten gevonden` : 'Niets gevonden. Probeer de Engelse naam, of kies een andere kaarttaal bij Beheer.';
    $('#add-more').hidden = list.length < PER;
  } catch (e) {
    st.textContent = 'Kaarten ophalen lukt niet. Controleer je internetverbinding en probeer opnieuw.';
  }
}
$('#add-form').addEventListener('submit', e => { e.preventDefault(); runSearch(false); $('#add-search').blur(); });
$('#add-more').addEventListener('click', () => runSearch(true));

/* =====================================================
   SETS
   ===================================================== */
function ownedBySet() {
  const m = {};
  for (const c of Object.values(collection)) m[c.setId] = (m[c.setId] || 0) + 1;
  return m;
}
const setTotal = s => (s.cardCount && (s.cardCount.total || s.cardCount.official)) || 0;
async function renderSets() {
  if (!$('#set-detail').hidden) return;
  const st = $('#sets-status');
  let sets;
  try { if (!setsCache) st.textContent = 'Sets laden…'; sets = await getSets(); st.textContent = ''; }
  catch { st.textContent = 'Sets ophalen lukt niet. Controleer je internetverbinding.'; return; }
  const own = ownedBySet();
  const q = $('#sets-search').value.trim().toLowerCase(), mine = $('#sets-mine').checked;
  let list = sets.slice().reverse();   // nieuwste eerst
  if (q) list = list.filter(s => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q));
  if (mine) list = list.filter(s => own[s.id]);
  if (!list.length) st.textContent = mine ? 'Je hebt nog geen kaarten uit een set.' : 'Geen sets gevonden.';
  $('#sets-list').innerHTML = list.map(s => {
    const tot = setTotal(s), have = own[s.id] || 0, pct = tot ? Math.min(100, have / tot * 100) : 0;
    return `<div class="setrow" data-id="${esc(s.id)}">
      <div class="logo">${s.logo ? `<img src="${esc(s.logo)}.webp" alt="" loading="lazy">` : ''}</div>
      <div class="nm">${esc(s.name)}<span>${have} / ${tot || '?'}</span></div>
      <div class="bar ${pct >= 100 ? 'full' : ''}"><i style="width:${pct}%"></i></div></div>`;
  }).join('');
}
$('#sets-search').addEventListener('input', renderSets);
$('#sets-mine').addEventListener('change', renderSets);
$('#sets-list').addEventListener('click', e => { const r = e.target.closest('.setrow'); if (r) openSet(r.dataset.id); });
$('#set-back').addEventListener('click', () => { $('#set-detail').hidden = true; $('#sets-list-wrap').hidden = false; renderSets(); });

let curSet = null, setFilter = 'all';
async function openSet(id) {
  $('#sets-list-wrap').hidden = true; $('#set-detail').hidden = false;
  $('#set-grid').innerHTML = ''; $('#set-head').innerHTML = ''; $('#set-status').textContent = 'Set laden…';
  window.scrollTo(0, 0);
  try { curSet = await api('/sets/' + encodeURIComponent(id), { cache: true }); }
  catch { $('#set-status').textContent = 'Set ophalen lukt niet.'; return; }
  (curSet.cards || []).forEach(b => briefIndex.set(b.id, b));
  renderSet();
}
function renderSet() {
  if (!curSet) return;
  const cards = (curSet.cards || []).filter(b => b && b.id);
  const have = cards.filter(b => collection[b.id]).length;
  const pct = cards.length ? have / cards.length * 100 : 0;
  $('#set-head').innerHTML = `<h1>${esc(curSet.name)} <small>${have} van ${cards.length} · ${pct.toFixed(0)}%</small></h1>
    <div class="bar ${pct >= 100 ? 'full' : ''}"><i style="width:${pct}%"></i></div>`;
  const list = cards.filter(b => setFilter === 'all' || (setFilter === 'have') === !!collection[b.id]);
  $('#set-status').textContent = list.length ? 'Tik op een kaart om hem in je pakje te stoppen.' : (setFilter === 'miss' ? 'Set compleet!' : 'Nog geen kaarten uit deze set.');
  $('#set-grid').innerHTML = list.map(b => pickTileHTML(b, { dim: true })).join('');
}
$('#set-filter').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  setFilter = b.dataset.f; $$('#set-filter button').forEach(x => x.classList.toggle('active', x === b)); renderSet();
});

/* =====================================================
   BOOSTER PACK OPENER
   ===================================================== */
const STAR = `<svg viewBox="0 0 100 100" aria-hidden="true"><path fill="#fff" d="M50 2 61 39 98 50 61 61 50 98 39 61 2 50 39 39Z"/></svg>`;
const GLOW = ['#ffffff', '#cfe8ff', '#7fd4ff', '#ffd75a'];
let opened = [];
function zigzag(top) {
  const n = 16, pts = [];
  for (let i = 0; i <= n; i++) pts.push(`${(i / n * 100).toFixed(2)}% ${i % 2 ? 15.6 : 12.6}%`);
  return top ? `polygon(0 0,100% 0,${pts.slice().reverse().join(',')})` : `polygon(${pts.join(',')},100% 100%,0 100%)`;
}
function closeOpener() {
  const o = $('#opener'); o.hidden = true; o.innerHTML = ''; o.className = 'opener';
  updateFab(); refreshBadges();
  if ($('#view-collection').classList.contains('active')) renderCollection();
  if ($('#view-sets').classList.contains('active')) { if ($('#set-detail').hidden) renderSets(); else renderSet(); }
}
function commitPack(cards) {
  const now = Date.now();
  cards.forEach((c, i) => {
    const cur = collection[c.id];
    if (cur) { cur.qty++; if (c.price) { cur.price = c.price; cur.priceAt = c.priceAt; } if (c.rarity) cur.rarity = c.rarity; }
    else { const { key, ...rest } = c; collection[c.id] = { ...rest, qty: 1, addedAt: now + i }; }
  });
  pack = []; saveCollection(); savePack();
}
async function startOpener() {
  if (!pack.length) return;
  const o = $('#opener');
  o.className = 'opener'; o.hidden = false;
  o.innerHTML = `<button class="x" id="op-x" aria-label="Sluiten">×</button>
    <div class="stage"><div class="rays" id="rays"></div>
      <div class="pack" id="pack">
        <div class="pack-piece pack-body" style="clip-path:${zigzag(false)}">
          <div class="pack-art"><div class="pack-emblem">${STAR}</div><div class="pack-title">BOOSTER</div>
          <div class="pack-sub">${pack.length} ${pack.length === 1 ? 'kaart' : 'kaarten'} · mijn collectie</div></div>
        </div>
        <div class="pack-piece pack-top" style="clip-path:${zigzag(true)}"></div>
        <div class="tearline">◂ SCHEUR HIER ▸</div>
      </div>
      <div class="deck" id="deck"></div>
    </div>
    <div class="op-hint" id="op-hint">Veeg over de bovenkant of tik om open te scheuren</div>
    <div class="tray" id="tray"></div>
    <div class="summary" id="summary"></div>`;
  $('#op-x').onclick = closeOpener;

  // details (zeldzaamheid, prijs) moeten binnen zijn vóór het onthullen
  await Promise.race([Promise.allSettled(pack.map(p => pending.get(p.id)).filter(Boolean)), sleep(5000)]);
  pack.forEach(p => { if (imgUrl(p)) new Image().src = imgUrl(p, 'high'); });

  const pk = $('#pack');
  let sx = null, moved = 0, torn = false;
  pk.addEventListener('pointerdown', e => { if (torn) return; sx = e.clientX; moved = 0; pk.classList.add('dragging'); pk.setPointerCapture(e.pointerId); });
  pk.addEventListener('pointermove', e => {
    if (sx === null || torn) return;
    moved = Math.abs(e.clientX - sx);
    const p = Math.min(1, moved / (pk.offsetWidth * 0.7));
    pk.style.setProperty('--tear', p.toFixed(3));
    if (p >= 1) tear();
  });
  const up = () => {
    if (sx === null || torn) return;
    const p = parseFloat(pk.style.getPropertyValue('--tear')) || 0;
    sx = null;
    if (moved < 8 || p > 0.45) tear(); else { pk.classList.remove('dragging'); pk.style.setProperty('--tear', 0); }
  };
  pk.addEventListener('pointerup', up); pk.addEventListener('pointercancel', up);

  function tear() {
    if (torn) return; torn = true; sx = null;
    const cards = pack.slice().sort((a, b) => tier(a.rarity) - tier(b.rarity));
    commitPack(cards); opened = cards;
    pk.style.setProperty('--tear', 1); pk.classList.add('torn');
    const fl = document.createElement('div'); fl.className = 'flash'; o.appendChild(fl); setTimeout(() => fl.remove(), 650);
    if (navigator.vibrate) try { navigator.vibrate(30); } catch {}
    buildDeck(cards);
    setTimeout(() => pk.remove(), 1100);
  }
}
function buildDeck(cards) {
  const o = $('#opener'), deck = $('#deck'), hint = $('#op-hint'), tray = $('#tray');
  let idx = 0, busy = false;
  deck.innerHTML = cards.map((c, i) => `<div class="reveal t${tier(c.rarity)}" data-i="${i}" style="z-index:${cards.length - i};--glow:${GLOW[tier(c.rarity)]}">
    <div class="flipper"><div class="flip-back">${STAR}</div><div class="flip-front">${cardHTML(c, { q: 'high' })}</div></div></div>`).join('');
  const layout = () => $$('.reveal', deck).forEach(r => {
    const d = +r.dataset.i - idx; if (d < 0) return;
    r.style.setProperty('--d', Math.min(d, 6)); r.classList.toggle('deep', d > 6);
  });
  layout();
  requestAnimationFrame(() => deck.classList.add('show'));
  const skip = document.createElement('button'); skip.className = 'op-skip'; skip.textContent = 'Alles tonen'; skip.onclick = summary; o.appendChild(skip);
  const setHint = () => hint.textContent = idx >= cards.length ? '' : `Kaart ${idx + 1} van ${cards.length} · tik om te ${$(`.reveal[data-i="${idx}"]`, deck).classList.contains('flipped') ? 'bewaren' : 'onthullen'}`;
  setHint();

  let dn = null;
  deck.addEventListener('pointerdown', e => dn = { x: e.clientX, y: e.clientY });
  deck.addEventListener('pointerup', e => {
    if (!dn || busy) return;
    const far = Math.hypot(e.clientX - dn.x, e.clientY - dn.y) > 10; dn = null;
    if (far) return;                       // dat was kantelen, geen tik
    const r = $(`.reveal[data-i="${idx}"]`, deck); if (!r) return;
    const c = cards[idx], t = tier(c.rarity);
    if (!r.classList.contains('flipped')) {
      busy = true;
      const flip = () => {
        r.classList.remove('charging'); r.classList.add('flipped');
        if (t >= 2) { burst(t); $('#rays').style.setProperty('--glow', GLOW[t]); $('#rays').classList.add('on'); if (navigator.vibrate) try { navigator.vibrate(t === 3 ? [20, 40, 60] : 20); } catch {} }
        setTimeout(() => { $('.card', r).classList.add('tiltable', 'touch-tilt', 'idle-shine'); busy = false; setHint(); if (t >= 2) hint.textContent = (t === 3 ? '✦ ' : '') + (c.rarity || 'Zeldzaam') + (c.price ? ' · ' + priceText(c) : '') + ' · kantel de kaart, tik om te bewaren'; }, 700);
      };
      if (t >= 2) { r.classList.add('charging'); setTimeout(flip, t === 3 ? 900 : 550); } else flip();
    } else {
      r.classList.add('gone'); $('#rays').classList.remove('on');
      const src = imgUrl(c);
      tray.insertAdjacentHTML('beforeend', src ? `<img src="${esc(src)}" alt="">` : '<div></div>');
      while (tray.children.length > 12) tray.firstChild.remove();
      idx++; layout();
      if (idx >= cards.length) setTimeout(summary, 500); else setHint();
    }
  });
  function burst(t) {
    const b = document.createElement('div'); b.className = 'burst'; b.style.setProperty('--glow', GLOW[t]);
    const cols = t === 3 ? ['#ffd75a', '#ff8bd1', '#7fd4ff', '#fff', '#b9ff9c'] : ['#7fd4ff', '#fff', '#cfe8ff'];
    let h = '<span class="ring"></span>';
    const n = t === 3 ? 34 : 18;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = 140 + Math.random() * (t === 3 ? 340 : 220);
      h += `<i style="--x:${(Math.cos(a) * d).toFixed(0)}px;--y:${(Math.sin(a) * d).toFixed(0)}px;--s:${(0.6 + Math.random() * 1.8).toFixed(2)};--c:${cols[i % cols.length]};animation-delay:${(Math.random() * 120).toFixed(0)}ms"></i>`;
    }
    b.innerHTML = h; $('.stage', o).appendChild(b); setTimeout(() => b.remove(), 1500);
  }
}
function summary() {
  const o = $('#opener'); if (o.classList.contains('done')) return;
  const cards = opened.slice().sort((a, b) => tier(b.rarity) - tier(a.rarity) || (b.price ? b.price.v : 0) - (a.price ? a.price.v : 0));
  const eur = cards.reduce((s, c) => s + (c.price && c.price.unit === 'EUR' ? c.price.v : 0), 0);
  $('#summary').innerHTML = `<h2>${cards.length} ${cards.length === 1 ? 'kaart' : 'kaarten'} toegevoegd</h2>
    <p>${eur ? 'Dit pakje is ongeveer ' + money(eur) + ' waard.' : 'Ze staan nu in je collectie.'}</p>
    <div class="grid">${cards.map((c, i) => `<div class="tile" style="--n:${i}">${cardHTML(c, { cls: 'tiltable idle-shine' })}
      <div class="meta"><b>${esc(c.name)}</b><span>${esc(c.rarity || '')}<em>${priceText(c)}</em></span></div></div>`).join('')}</div>
    <button class="btn primary" id="sum-go">Naar mijn collectie</button>`;
  o.classList.add('done');
  $('#sum-go').onclick = () => { closeOpener(); show('collection'); };
}

/* =====================================================
   BEHEER
   ===================================================== */
async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); } }));
}
async function refreshPrices(ids, statusEl) {
  let done = 0, fail = 0;
  await pool(ids, 4, async id => {
    try {
      mem.delete(settings.lang + '/cards/' + encodeURIComponent(id));
      const d = fromDetail(await api('/cards/' + encodeURIComponent(id)));
      const c = collection[id];
      if (c) Object.assign(c, { price: d.price, priceAt: d.priceAt, rarity: d.rarity || c.rarity, image: d.image || c.image, setName: d.setName || c.setName });
    } catch { fail++; }
    done++;
    if (statusEl) statusEl.textContent = `${done} / ${ids.length}`;
  });
  saveCollection();
  return fail;
}
$('#btn-prices').addEventListener('click', async e => {
  const ids = Object.keys(collection); if (!ids.length) return toast('Je collectie is nog leeg');
  e.target.disabled = true;
  const fail = await refreshPrices(ids, $('#prices-status'));
  e.target.disabled = false;
  $('#prices-status').textContent = fail ? `Klaar, ${fail} mislukt` : 'Prijzen bijgewerkt';
});
$('#set-lang').value = settings.lang;
$('#set-lang').addEventListener('change', e => {
  settings.lang = e.target.value; store.set('settings', settings);
  setsCache = null; curSet = null; briefIndex = new Map(); $('#add-grid').innerHTML = ''; $('#add-status').textContent = '';
  toast('Kaarttaal aangepast');
});
$('#btn-export').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify({ app: 'kaartenkluis', version: 1, exported: new Date().toISOString(), collection }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `kaartenkluis-${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
});
$('#in-json').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const inc = data.collection; if (!inc || typeof inc !== 'object') throw 0;
    let n = 0;
    for (const [id, c] of Object.entries(inc)) {
      if (!c || !c.name) continue;
      if (collection[id]) collection[id].qty = Math.max(collection[id].qty, c.qty || 1); else collection[id] = { ...c, id, qty: c.qty || 1, addedAt: c.addedAt || Date.now() };
      n++;
    }
    saveCollection(); toast(`${n} kaarten teruggezet`);
  } catch { toast('Dit is geen geldig back-upbestand'); }
});
$('#btn-wipe').addEventListener('click', () => {
  const box = openModal(`<h2>Collectie leegmaken?</h2><p>Alle ${Object.keys(collection).length} kaarten worden van dit apparaat verwijderd. Dit kan niet ongedaan worden.</p>
    <button class="btn" data-close>Annuleren</button> <button class="btn" id="wipe-yes" style="border-color:var(--danger);color:var(--danger)">Ja, alles wissen</button>`);
  $('#wipe-yes', box).onclick = () => { collection = {}; saveCollection(); closeModal(); toast('Collectie gewist'); };
});

/* ---------- CSV-import (experimenteel) ---------- */
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  const delim = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cur); cur = ''; }
    else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else if (ch !== '\r') cur += ch;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => c.trim()));
}
const norm = s => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
const normNum = s => String(s || '').split('/')[0].trim().replace(/^0+(?=.)/, '').toUpperCase();
$('#in-csv').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const st = $('#csv-status');
  try {
    const rows = parseCSV((await f.text()).replace(/^﻿/, ''));
    const head = rows.shift().map(h => h.trim().toLowerCase());
    const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return head.findIndex(h => names.some(n => h.includes(n))); };
    const iName = col('product name', 'card name', 'name', 'naam'), iSet = col('set', 'set name', 'expansion', 'edition'),
      iNum = col('card number', 'number', 'collector number', 'nummer'), iQty = col('quantity', 'qty', 'count', 'aantal'), iCat = col('category', 'game');
    if (iSet < 0 || (iNum < 0 && iName < 0)) { st.textContent = 'Geen bruikbare kolommen gevonden (nodig: set + kaartnummer of naam).'; return; }
    st.textContent = 'Sets laden…';
    const sets = await getSets();
    const setBy = new Map(sets.map(s => [norm(s.name), s]));
    const findSet = n => setBy.get(norm(n)) || sets.find(s => norm(n) && (norm(n).endsWith(norm(s.name)) || norm(s.name).endsWith(norm(n)))) || null;
    let ok = 0, miss = [], added = [];
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (iCat >= 0 && row[iCat] && !/pok/i.test(row[iCat])) continue;
      st.textContent = `Bezig… ${r + 1} / ${rows.length}`;
      const s = findSet(row[iSet]); let hit = null;
      if (s) {
        try {
          const det = await api('/sets/' + encodeURIComponent(s.id), { cache: true });
          const num = iNum >= 0 ? normNum(row[iNum]) : '', nm = iName >= 0 ? norm(row[iName]) : '';
          hit = (num && det.cards.find(c => normNum(c.localId) === num)) || (nm && det.cards.find(c => norm(c.name) === nm)) || null;
        } catch {}
      }
      if (!hit) { miss.push((iName >= 0 ? row[iName] : row[iNum]) + ' (' + row[iSet] + ')'); continue; }
      const qty = Math.max(1, parseInt(iQty >= 0 ? row[iQty] : '1', 10) || 1);
      if (collection[hit.id]) collection[hit.id].qty += qty;
      else { collection[hit.id] = { ...fromBrief(hit), qty, addedAt: Date.now() + r }; added.push(hit.id); }
      ok++;
    }
    saveCollection();
    st.textContent = `${ok} rijen geïmporteerd, prijzen ophalen…`;
    await refreshPrices(added, null);
    st.textContent = `${ok} rijen geïmporteerd` + (miss.length ? `, ${miss.length} niet gevonden: ${miss.slice(0, 8).join('; ')}${miss.length > 8 ? '…' : ''}` : '.');
  } catch (err) { st.textContent = 'Importeren mislukt: ' + (err && err.message || 'onbekende fout'); }
});

/* ---------- start ---------- */
updateFab();
renderCollection();
getSets().then(() => { if ($('#view-collection').classList.contains('active')) renderCollection(); }).catch(() => {});
// details ophalen voor kaarten die na een herstart nog in het pakje zitten
pack.filter(p => !p.priceAt).forEach(p => {
  if (!pending.has(p.id)) pending.set(p.id, api('/cards/' + encodeURIComponent(p.id)).then(fromDetail).catch(() => null));
  pending.get(p.id).then(d => { if (d) { Object.assign(p, d); savePack(); } });
});
if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
