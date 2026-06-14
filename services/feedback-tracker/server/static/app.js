/* User Feedback Tracker dashboard + explorer */

const REFRESH_MS = 5000;
const PAGE_SIZE = 25;
const PALETTE = ['#006a4d', '#11b67a', '#649c00', '#024731', '#0d5595',
                 '#a19fff', '#dc5309', '#9de7de', '#f5b2f2', '#6cf479',
                 '#767676', '#db0f30'];
const SENTIMENT_COLOR = {positive: '#11b67a', neutral: '#767676',
                         negative: '#db0f30', unknown: '#c9c9c9'};

const state = {
  range: '7d',
  group: 'sentiment',
  apps: new Set(),
  sentiments: new Set(),
  kinds: new Set(),
  statuses: new Set(),
  q: '',
  offset: 0,
  total: 0,
  meta: null,
  colorMap: new Map(),
  lastUpdated: null,
  lastTopId: null,
  triaging: null,   // feedback_id of an open triage editor — pauses list refresh
};

Chart.defaults.color = '#505050';
Chart.defaults.borderColor = '#e0dfde';
Chart.defaults.font.family = "'Asap', -apple-system, 'Segoe UI', Roboto, sans-serif";
Chart.defaults.animation = false;

// ---------------------------------------------------------------- helpers
function colorFor(key) {
  if (SENTIMENT_COLOR[key]) return SENTIMENT_COLOR[key];
  if (!state.colorMap.has(key)) {
    state.colorMap.set(key, PALETTE[state.colorMap.size % PALETTE.length]);
  }
  return state.colorMap.get(key);
}
function fmtNum(v) {
  if (v == null) return '–';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(v);
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
}
function bucketLabel(b) {
  const d = new Date(b.includes('T') ? b + ':00Z' : b + 'T00:00:00Z');
  const mon = d.toLocaleString('en-US', {month: 'short', timeZone: 'UTC'});
  const day = d.getUTCDate();
  if (b.includes('T')) return `${mon} ${day} ${String(d.getUTCHours()).padStart(2, '0')}:00`;
  return `${mon} ${day}`;
}
function relTime(ts) {
  const d = new Date(ts.replace(' ', 'T') + 'Z');
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (s < 60) return Math.floor(s) + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
function rangeParams() {
  const now = new Date();
  const iso = (d) => d.toISOString().slice(0, 19) + 'Z';
  const ago = (ms) => new Date(now.getTime() - ms);
  const H = 3600e3, D = 24 * H;
  switch (state.range) {
    case '24h': return {from: iso(ago(24 * H)), bucket: 'hour'};
    case '7d': return {from: iso(ago(7 * D)), bucket: 'hour'};
    case '30d': return {from: iso(ago(30 * D)), bucket: 'day'};
    case '90d': return {from: iso(ago(90 * D)), bucket: 'day'};
    case 'all': {
      const lo = state.meta && state.meta.min_ts
        ? state.meta.min_ts.replace(' ', 'T') + 'Z' : iso(ago(90 * D));
      return {from: lo, bucket: 'day'};
    }
  }
}
function filterParams() {
  const p = {};
  if (state.apps.size) p.apps = [...state.apps].join(',');
  if (state.sentiments.size) p.sentiments = [...state.sentiments].join(',');
  if (state.kinds.size) p.kinds = [...state.kinds].join(',');
  if (state.statuses.size) p.statuses = [...state.statuses].join(',');
  if (state.q.trim()) p.q = state.q.trim();
  return p;
}
async function getJSON(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const resp = await fetch(path + (qs ? '?' + qs : ''));
  if (!resp.ok) throw new Error(`${path}: ${resp.status}`);
  return resp.json();
}
async function sendJSON(method, path, body) {
  const resp = await fetch(path, {method, headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body)});
  if (!resp.ok) throw new Error(`${path}: ${resp.status}`);
  return resp.json();
}

// ---------------------------------------------------------------- charts
function makeTsChart() {
  return new Chart(document.getElementById('tsChart'), {
    type: 'bar',
    data: {labels: [], datasets: []},
    options: {
      maintainAspectRatio: false,
      interaction: {mode: 'index', intersect: false},
      plugins: {
        legend: {position: 'bottom', labels: {boxWidth: 10, boxHeight: 10, padding: 14}},
        tooltip: {callbacks: {
          footer: (items) => 'Total ' + items.reduce((a, i) => a + i.parsed.y, 0),
          label: (i) => ` ${i.dataset.label}: ${i.parsed.y}`}},
      },
      scales: {
        x: {stacked: true, grid: {display: false}, ticks: {maxTicksLimit: 14, maxRotation: 0}},
        y: {stacked: true, beginAtZero: true, ticks: {precision: 0}, grid: {color: '#ececec'}},
      },
    },
  });
}
function makeDonut(elId) {
  return new Chart(document.getElementById(elId), {
    type: 'doughnut',
    data: {labels: [], datasets: [{data: [], backgroundColor: [], borderWidth: 0}]},
    options: {
      maintainAspectRatio: false, cutout: '62%',
      plugins: {
        legend: {position: 'right', labels: {boxWidth: 10, boxHeight: 10, padding: 10}},
        tooltip: {callbacks: {label: (i) => ` ${i.label}: ${i.parsed}`}},
      },
    },
  });
}
const charts = {
  ts: makeTsChart(),
  sentimentDonut: makeDonut('sentimentDonut'),
  appDonut: makeDonut('appDonut'),
  kindDonut: makeDonut('kindDonut'),
};

// ---------------------------------------------------------------- renderers
function renderCards(c) {
  const set = (id, text) => { document.getElementById(id).textContent = text; };
  set('cToday', fmtNum(c.today.count));
  set('c7d', fmtNum(c.last_7d.count));
  set('c30d', fmtNum(c.last_30d.count));
  set('cNps', c.nps.score == null ? '–' : c.nps.score);
  set('cNpsSub', c.nps.responses ? `${c.nps.responses} responses` : 'no NPS yet');
  set('cCsat', c.csat.avg == null ? '–' : c.csat.avg.toFixed(1));
  set('cCsatSub', c.csat.responses ? `${c.csat.responses} ratings` : 'no CSAT yet');
  set('cUntriaged', fmtNum(c.untriaged.count));
  const untriagedEl = document.getElementById('cUntriaged');
  untriagedEl.classList.toggle('warn', c.untriaged.count > 0);

  const minTs = state.meta && state.meta.min_ts
    ? new Date(state.meta.min_ts.replace(' ', 'T') + 'Z') : null;
  const haveSince = (days) => minTs && (Date.now() - minTs.getTime()) >= days * 864e5;
  const delta = (id, cur, prev, label, daysNeeded) => {
    const el = document.getElementById(id);
    if (!prev || !haveSince(daysNeeded)) { el.textContent = ''; el.className = 'card-delta muted'; return; }
    const pct = ((cur - prev) / prev) * 100;
    const arrow = pct >= 0 ? '▲' : '▼';
    el.textContent = `${arrow} ${Math.abs(pct).toFixed(0)}% vs ${label}`;
    el.className = 'card-delta ' + (pct >= 0 ? 'up' : 'down');
  };
  delta('cTodayDelta', c.today.count, c.yesterday_same_time.count, 'yesterday', 1);
  delta('c7dDelta', c.last_7d.count, c.prior_7d.count, 'prior 7d', 14);
  delta('c30dDelta', c.last_30d.count, c.prior_30d.count, 'prior 30d', 60);
}

function renderTimeseries(ts) {
  const chart = charts.ts;
  chart.data.labels = ts.buckets.map(bucketLabel);
  chart.data.datasets = ts.series.map((s) => ({
    label: s.key, data: s.values, backgroundColor: colorFor(s.key),
    borderRadius: 2, stack: 'count',
  }));
  chart.update('none');
  const total = ts.series.reduce((a, s) => a + s.total, 0);
  document.getElementById('tsSub').textContent =
    `${fmtNum(total)} items · ${ts.bucket === 'hour' ? 'hourly' : 'daily'} buckets · grouped by ${state.group}`;
}

function fillDonut(chart, entries) {
  chart.data.labels = entries.map(([k]) => k);
  chart.data.datasets[0].data = entries.map(([, v]) => v);
  chart.data.datasets[0].backgroundColor = entries.map(([k]) => colorFor(k));
  chart.update('none');
}
function renderDonuts(breakdown) {
  const agg = (keyFn) => {
    const m = new Map();
    for (const r of breakdown.rows) m.set(keyFn(r), (m.get(keyFn(r)) || 0) + r.count);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  };
  const sent = new Map([['positive', 0], ['neutral', 0], ['negative', 0]]);
  for (const r of breakdown.rows) {
    sent.set('positive', sent.get('positive') + r.positive);
    sent.set('neutral', sent.get('neutral') + r.neutral);
    sent.set('negative', sent.get('negative') + r.negative);
  }
  fillDonut(charts.sentimentDonut, [...sent.entries()].filter(([, v]) => v > 0));
  fillDonut(charts.appDonut, agg((r) => r.app));
  fillDonut(charts.kindDonut, agg((r) => r.kind));
}

function renderBreakdown(breakdown) {
  const tbody = document.querySelector('#breakdownTable tbody');
  if (!breakdown.rows.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="panel-sub">No feedback in this range.</td></tr>';
    return;
  }
  tbody.innerHTML = breakdown.rows.map((r) => `
    <tr>
      <td><span class="tag" style="border-color:${colorFor(r.app)}55">${esc(r.app)}</span></td>
      <td><span class="badge badge-kind">${esc(r.kind)}</span></td>
      <td class="r">${fmtNum(r.count)}</td>
      <td class="r" style="color:var(--everyday-green)">${fmtNum(r.positive)}</td>
      <td class="r" style="color:var(--red)">${fmtNum(r.negative)}</td>
      <td class="r">${r.avg_rating == null ? '–' : r.avg_rating}</td>
      <td class="r"><span class="share-bar" style="width:${Math.max(2, r.share * 60)}px"></span>${(r.share * 100).toFixed(1)}%</td>
    </tr>`).join('');
}

function starsDisplay(rating) {
  if (rating == null) return '';
  let out = '';
  for (let i = 1; i <= 5; i++) out += `<span class="${i <= rating ? '' : 'off'}">★</span>`;
  return `<span class="stars-display">${out}</span>`;
}
function sentimentBadge(s) {
  const v = s || 'unknown';
  return `<span class="sentiment ${v}"><span class="dot"></span>${v}</span>`;
}
function ratingLabel(it) {
  if (it.rating == null) return '';
  if (it.kind === 'csat') return starsDisplay(it.rating);
  if (it.kind === 'nps') return `<span class="badge badge-kind">NPS ${it.rating}</span>`;
  if (it.kind === 'thumb') return it.rating > 0 ? '👍' : '👎';
  return `<span class="badge badge-kind">${it.rating}</span>`;
}

function feedItemHTML(it, isNew) {
  const ctx = it.meta && (it.meta.page || it.meta.feature || it.meta.app_version);
  const ctxStr = ctx ? `<div class="feed-ctx">${
    it.meta.page ? `<code>${esc(it.meta.page)}</code> ` : ''}${
    it.meta.feature ? `· ${esc(it.meta.feature)} ` : ''}${
    it.meta.app_version ? `· v${esc(it.meta.app_version)}` : ''}</div>` : '';
  const tags = (it.tags || []).map((t) => `<span class="tag-chip">${esc(t)}</span>`).join('');
  return `
    <div class="feed-item s-${it.sentiment || 'unknown'} ${isNew ? 'flash' : ''}" data-id="${esc(it.feedback_id)}">
      <div class="feed-top">
        <span class="tag" style="border-color:${colorFor(it.app)}55">${esc(it.app)}</span>
        <span class="badge badge-kind">${esc(it.kind)}</span>
        ${ratingLabel(it)}
        ${sentimentBadge(it.sentiment)}
        <span class="badge badge-status-${esc(it.status)}">${esc(it.status)}</span>
        <span class="when" title="${esc(it.ts)} UTC">${relTime(it.ts)}</span>
      </div>
      <div class="feed-text ${it.text ? '' : 'empty'}">${it.text ? esc(it.text) : '(rating only — no comment)'}</div>
      ${ctxStr}
      <div>${tags}</div>
      <div class="feed-actions"><button class="linklike" data-act="triage" data-id="${esc(it.feedback_id)}">Triage ▾</button></div>
    </div>`;
}

function renderFeed(list) {
  state.total = list.total;
  const feed = document.getElementById('feedList');
  const topId = list.items[0] ? list.items[0].feedback_id : null;
  const newArrival = state.lastTopId !== null && topId !== state.lastTopId && state.offset === 0;
  if (!list.items.length) {
    feed.innerHTML = '<div class="feed-empty">No feedback matches these filters.</div>';
  } else {
    feed.innerHTML = list.items.map((it, i) => feedItemHTML(it, newArrival && i === 0)).join('');
  }
  state.lastTopId = topId;

  const from = list.total ? state.offset + 1 : 0;
  const to = Math.min(state.offset + list.items.length, list.total);
  document.getElementById('pagerInfo').textContent = `${from}–${to} of ${fmtNum(list.total)}`;
  document.getElementById('prevPage').disabled = state.offset === 0;
  document.getElementById('nextPage').disabled = to >= list.total;
  const filtered = Object.keys(filterParams()).length;
  document.getElementById('explorerSub').textContent =
    filtered ? 'individual feedback · filtered' : 'individual feedback · newest first';
}

// ---------------------------------------------------------------- triage
function openTriage(id) {
  const item = document.querySelector(`.feed-item[data-id="${CSS.escape(id)}"]`);
  if (!item || item.querySelector('.triage')) return;
  state.triaging = id;
  const curStatus = item.querySelector('.badge[class*="badge-status-"]').textContent.trim();
  const curTags = [...item.querySelectorAll('.tag-chip')].map((c) => c.textContent).join(', ');
  const row = document.createElement('div');
  row.className = 'triage';
  row.innerHTML = `
    <select class="input" data-f="status">
      ${['new', 'triaged', 'resolved', 'archived'].map((s) =>
        `<option ${s === curStatus ? 'selected' : ''}>${s}</option>`).join('')}
    </select>
    <input class="input" data-f="tags" placeholder="tags, comma-separated" value="${esc(curTags)}" style="flex:1;min-width:160px">
    <input class="input" data-f="note" placeholder="internal note" style="flex:2;min-width:180px">
    <button class="btn btn-primary btn-sm" data-act="save" data-id="${esc(id)}">Save</button>
    <button class="btn btn-quiet btn-sm" data-act="cancel" data-id="${esc(id)}">Cancel</button>`;
  item.appendChild(row);
}
async function saveTriage(id) {
  const item = document.querySelector(`.feed-item[data-id="${CSS.escape(id)}"]`);
  const status = item.querySelector('[data-f="status"]').value;
  const tagsRaw = item.querySelector('[data-f="tags"]').value;
  const note = item.querySelector('[data-f="note"]').value;
  const tags = tagsRaw.split(',').map((t) => t.trim()).filter(Boolean);
  await sendJSON('PATCH', `/v1/feedback/${encodeURIComponent(id)}`, {status, tags, note: note || null});
  state.triaging = null;
  refresh();
}

document.getElementById('feedList').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  const id = btn.dataset.id;
  if (btn.dataset.act === 'triage') openTriage(id);
  else if (btn.dataset.act === 'cancel') { state.triaging = null; refresh(); }
  else if (btn.dataset.act === 'save') saveTriage(id).catch((err) => alert(err.message));
});

// ---------------------------------------------------------------- filters
function renderFilters() {
  const build = (elId, items, selected) => {
    const dd = document.getElementById(elId);
    const menu = dd.querySelector('.dd-menu');
    if (!items.length) { menu.innerHTML = '<label class="panel-sub" style="padding:8px 10px">none yet</label>'; }
    else {
      menu.innerHTML = items.map((it) => `
        <label><input type="checkbox" value="${esc(it)}" ${selected.has(it) ? 'checked' : ''}>
        <span class="swatch" style="background:${colorFor(it)}"></span>${esc(it)}</label>`).join('');
    }
    dd.querySelector('.dd-count').textContent = selected.size ? `(${selected.size})` : '';
    menu.querySelectorAll('input').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(cb.value); else selected.delete(cb.value);
        dd.querySelector('.dd-count').textContent = selected.size ? `(${selected.size})` : '';
        state.offset = 0;
        refresh();
      });
    });
  };
  build('appFilter', state.meta.apps, state.apps);
  build('sentimentFilter', ['positive', 'neutral', 'negative'], state.sentiments);
  build('kindFilter', state.meta.kinds, state.kinds);
  build('statusFilter', ['new', 'triaged', 'resolved', 'archived'], state.statuses);
}

// ---------------------------------------------------------------- refresh loop
let refreshing = false;
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const firstLoad = !state.meta;
    const meta = await getJSON('/v1/meta');
    const metaChanged = !state.meta
      || meta.apps.join() !== state.meta.apps.join()
      || meta.kinds.join() !== state.meta.kinds.join();
    state.meta = meta;
    meta.apps.forEach(colorFor);
    meta.kinds.forEach(colorFor);
    if (metaChanged || firstLoad) renderFilters();

    const {from, bucket} = rangeParams();
    const f = filterParams();
    const calls = [
      getJSON('/v1/stats/cards', f),
      getJSON('/v1/stats/timeseries', {from, bucket, group_by: state.group, ...f}),
      getJSON('/v1/stats/breakdown', {from, ...f}),
    ];
    // don't clobber an open triage editor with a list re-render
    if (!state.triaging) {
      calls.push(getJSON('/v1/feedback', {...f, limit: PAGE_SIZE, offset: state.offset}));
    }
    const [cardsData, ts, breakdown, list] = await Promise.all(calls);
    renderCards(cardsData);
    renderTimeseries(ts);
    renderDonuts(breakdown);
    renderBreakdown(breakdown);
    if (list) renderFeed(list);

    state.lastUpdated = Date.now();
    document.getElementById('liveDot').classList.remove('stale');
  } catch (err) {
    console.error(err);
    document.getElementById('liveDot').classList.add('stale');
    document.getElementById('liveText').textContent = 'connection lost — retrying';
  } finally {
    refreshing = false;
  }
}
function tickLiveText() {
  if (!state.lastUpdated) return;
  const s = Math.floor((Date.now() - state.lastUpdated) / 1000);
  document.getElementById('liveText').textContent =
    `live · ${state.meta ? fmtNum(state.meta.total_items) + ' stored · ' : ''}updated ${s}s ago`;
}

// ---------------------------------------------------------------- wiring
document.getElementById('rangeBar').addEventListener('click', (e) => {
  const btn = e.target.closest('button'); if (!btn) return;
  state.range = btn.dataset.range; state.offset = 0;
  document.querySelectorAll('#rangeBar button').forEach((b) => b.classList.toggle('active', b === btn));
  refresh();
});
document.getElementById('groupBar').addEventListener('click', (e) => {
  const btn = e.target.closest('button'); if (!btn) return;
  state.group = btn.dataset.group;
  document.querySelectorAll('#groupBar button').forEach((b) => b.classList.toggle('active', b === btn));
  refresh();
});
let searchTimer = null;
document.getElementById('search').addEventListener('input', (e) => {
  state.q = e.target.value; state.offset = 0;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(refresh, 300);
});
document.getElementById('prevPage').addEventListener('click', () => {
  state.offset = Math.max(0, state.offset - PAGE_SIZE); refresh();
});
document.getElementById('nextPage').addEventListener('click', () => {
  if (state.offset + PAGE_SIZE < state.total) { state.offset += PAGE_SIZE; refresh(); }
});
document.querySelectorAll('.dropdown .dd-btn').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const dd = btn.parentElement;
    document.querySelectorAll('.dropdown').forEach((d) => { if (d !== dd) d.classList.remove('open'); });
    dd.classList.toggle('open');
  });
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown')) {
    document.querySelectorAll('.dropdown').forEach((d) => d.classList.remove('open'));
  }
});

setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
setInterval(tickLiveText, 1000);
refresh();
