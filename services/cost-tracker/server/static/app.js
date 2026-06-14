/* LLM Cost Tracker dashboard */

const REFRESH_MS = 5000;
// Lloyds brand palette — heritage greens first, then brand accent tints.
const PALETTE = ['#006a4d', '#11b67a', '#649c00', '#024731', '#0d5595',
                 '#a19fff', '#dc5309', '#9de7de', '#f5b2f2', '#6cf479',
                 '#767676', '#db0f30'];

const state = {
  range: '7d',
  group: 'app',
  apps: new Set(),     // empty = all
  models: new Set(),
  meta: null,
  colorMap: new Map(),
  lastUpdated: null,
  lastRecentTop: null,
};

Chart.defaults.color = '#505050';
Chart.defaults.borderColor = '#e0dfde';
Chart.defaults.font.family = "'Asap', -apple-system, 'Segoe UI', Roboto, sans-serif";
Chart.defaults.animation = false;

// ---------------------------------------------------------------- helpers

function colorFor(key) {
  if (!state.colorMap.has(key)) {
    state.colorMap.set(key, PALETTE[state.colorMap.size % PALETTE.length]);
  }
  return state.colorMap.get(key);
}

function fmtUSD(v) {
  if (v == null) return '–';
  if (v >= 1000) return '$' + v.toLocaleString('en-US', {maximumFractionDigits: 0});
  if (v >= 100) return '$' + v.toFixed(1);
  if (v >= 1) return '$' + v.toFixed(2);
  if (v >= 0.01) return '$' + v.toFixed(3);
  if (v === 0) return '$0.00';
  return '$' + v.toPrecision(2);
}

function fmtNum(v) {
  if (v == null) return '–';
  if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(v);
}

function shortModel(m) {
  return m.replace(/^claude-/, '').replace(/-\d{8}$/, '');
}

function bucketLabel(b) {
  // "2026-06-10" or "2026-06-10T14:00"
  const d = new Date(b.includes('T') ? b + ':00Z' : b + 'T00:00:00Z');
  const mon = d.toLocaleString('en-US', {month: 'short', timeZone: 'UTC'});
  const day = d.getUTCDate();
  if (b.includes('T')) {
    return `${mon} ${day} ${String(d.getUTCHours()).padStart(2, '0')}:00`;
  }
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
        ? state.meta.min_ts.replace(' ', 'T') + 'Z'
        : iso(ago(90 * D));
      return {from: lo, bucket: 'day'};
    }
  }
}

function filterParams() {
  const p = {};
  if (state.apps.size) p.apps = [...state.apps].join(',');
  if (state.models.size) p.models = [...state.models].join(',');
  return p;
}

async function getJSON(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const resp = await fetch(path + (qs ? '?' + qs : ''));
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
        tooltip: {
          callbacks: {
            footer: (items) => 'Total ' + fmtUSD(items.reduce((a, i) => a + i.parsed.y, 0)),
            label: (i) => ` ${i.dataset.label}: ${fmtUSD(i.parsed.y)}`,
          },
        },
      },
      scales: {
        x: {stacked: true, grid: {display: false}, ticks: {maxTicksLimit: 14, maxRotation: 0}},
        y: {stacked: true, ticks: {callback: (v) => fmtUSD(v)}, grid: {color: '#ececec'}},
      },
    },
  });
}

function makeDonut(elId) {
  return new Chart(document.getElementById(elId), {
    type: 'doughnut',
    data: {labels: [], datasets: [{data: [], backgroundColor: [], borderWidth: 0}]},
    options: {
      maintainAspectRatio: false,
      cutout: '62%',
      plugins: {
        legend: {position: 'right', labels: {boxWidth: 10, boxHeight: 10, padding: 10}},
        tooltip: {callbacks: {label: (i) => ` ${i.label}: ${fmtUSD(i.parsed)}`}},
      },
    },
  });
}

function makeCumChart() {
  return new Chart(document.getElementById('cumChart'), {
    type: 'line',
    data: {labels: [], datasets: [{
      label: 'cumulative', data: [], fill: true, tension: 0.25, pointRadius: 0,
      borderColor: '#006a4d', backgroundColor: 'rgba(0,106,77,.12)', borderWidth: 2,
    }]},
    options: {
      maintainAspectRatio: false,
      plugins: {legend: {display: false},
        tooltip: {callbacks: {label: (i) => ' ' + fmtUSD(i.parsed.y)}}},
      scales: {
        x: {grid: {display: false}, ticks: {maxTicksLimit: 8, maxRotation: 0}},
        y: {ticks: {callback: (v) => fmtUSD(v)}, grid: {color: '#ececec'}},
      },
    },
  });
}

const charts = {
  ts: makeTsChart(),
  appDonut: makeDonut('appDonut'),
  modelDonut: makeDonut('modelDonut'),
  cum: makeCumChart(),
};

// ---------------------------------------------------------------- renderers

function renderCards(c) {
  const set = (id, text) => { document.getElementById(id).textContent = text; };
  set('cToday', fmtUSD(c.today.cost));
  set('c7d', fmtUSD(c.last_7d.cost));
  set('c30d', fmtUSD(c.last_30d.cost));
  set('cBurn', fmtUSD(c.last_hour.cost) + '/hr');
  set('cEvents', fmtNum(c.today.events));
  set('cTokens', fmtNum(c.today.tokens) + ' tokens');

  // only compare when the prior window is fully covered by stored data
  const minTs = state.meta && state.meta.min_ts
    ? new Date(state.meta.min_ts.replace(' ', 'T') + 'Z') : null;
  const haveSince = (days) => minTs && (Date.now() - minTs.getTime()) >= days * 864e5;

  const delta = (id, cur, prev, label, daysNeeded) => {
    const el = document.getElementById(id);
    if (!prev || !haveSince(daysNeeded)) {
      el.textContent = '';
      el.className = 'card-delta muted';
      return;
    }
    const pct = ((cur - prev) / prev) * 100;
    const arrow = pct >= 0 ? '▲' : '▼';
    el.textContent = `${arrow} ${Math.abs(pct).toFixed(0)}% vs ${label}`;
    el.className = 'card-delta ' + (pct >= 0 ? 'up' : 'down');
  };
  delta('cTodayDelta', c.today.cost, c.yesterday_same_time.cost, 'yesterday', 1);
  delta('c7dDelta', c.last_7d.cost, c.prior_7d.cost, 'prior 7d', 14);
  delta('c30dDelta', c.last_30d.cost, c.prior_30d.cost, 'prior 30d', 60);
}

function renderTimeseries(ts) {
  const chart = charts.ts;
  chart.data.labels = ts.buckets.map(bucketLabel);
  chart.data.datasets = ts.series.map((s) => ({
    label: state.group === 'model' ? shortModel(s.key) : s.key,
    data: s.values,
    backgroundColor: colorFor(s.key),
    borderRadius: 2,
    stack: 'cost',
  }));
  chart.update('none');

  const total = ts.series.reduce((a, s) => a + s.total, 0);
  document.getElementById('tsSub').textContent =
    `${fmtUSD(total)} total · ${ts.bucket === 'hour' ? 'hourly' : 'daily'} buckets · grouped by ${state.group}`;

  // cumulative line from the same buckets
  const sums = ts.buckets.map((_, i) => ts.series.reduce((a, s) => a + (s.values[i] || 0), 0));
  let run = 0;
  charts.cum.data.labels = ts.buckets.map(bucketLabel);
  charts.cum.data.datasets[0].data = sums.map((v) => (run += v));
  charts.cum.update('none');
}

function renderDonuts(breakdown) {
  const byKey = (key) => {
    const agg = new Map();
    for (const r of breakdown.rows) {
      agg.set(r[key], (agg.get(r[key]) || 0) + r.cost);
    }
    return [...agg.entries()].sort((a, b) => b[1] - a[1]);
  };
  const fill = (chart, entries, short) => {
    chart.data.labels = entries.map(([k]) => (short ? shortModel(k) : k));
    chart.data.datasets[0].data = entries.map(([, v]) => +v.toFixed(4));
    chart.data.datasets[0].backgroundColor = entries.map(([k]) => colorFor(k));
    chart.update('none');
  };
  fill(charts.appDonut, byKey('app'), false);
  fill(charts.modelDonut, byKey('model'), true);
}

function renderBreakdown(breakdown) {
  const tbody = document.querySelector('#breakdownTable tbody');
  tbody.innerHTML = breakdown.rows.map((r) => `
    <tr>
      <td><span class="tag" style="border-color:${colorFor(r.app)}55">${r.app}</span></td>
      <td>${shortModel(r.model)}</td>
      <td class="r">${fmtNum(r.events)}</td>
      <td class="r">${fmtNum(r.input_tokens)}</td>
      <td class="r">${fmtNum(r.output_tokens)}</td>
      <td class="r"><b>${fmtUSD(r.cost)}</b></td>
      <td class="r"><span class="share-bar" style="width:${Math.max(2, r.share * 60)}px"></span>${(r.share * 100).toFixed(1)}%</td>
    </tr>`).join('');
}

function renderRecent(recent) {
  const tbody = document.querySelector('#recentTable tbody');
  const top = recent.events[0] ? JSON.stringify(recent.events[0]) : null;
  const isNew = state.lastRecentTop !== null && top !== state.lastRecentTop;
  tbody.innerHTML = recent.events.map((e, i) => `
    <tr class="${isNew && i === 0 ? 'flash' : ''}">
      <td>${relTime(e.ts)}</td>
      <td><span class="tag" style="border-color:${colorFor(e.app)}55">${e.app}</span></td>
      <td>${shortModel(e.model)}</td>
      <td class="r">${fmtNum(e.input_tokens)}</td>
      <td class="r">${fmtNum(e.output_tokens)}</td>
      <td class="r">${fmtUSD(e.cost_usd)}</td>
    </tr>`).join('');
  state.lastRecentTop = top;
}

function renderFilters() {
  const build = (elId, items, selected) => {
    const dd = document.getElementById(elId);
    const menu = dd.querySelector('.dd-menu');
    menu.innerHTML = items.map((it) => `
      <label><input type="checkbox" value="${it}" ${selected.has(it) ? 'checked' : ''}>
      <span class="swatch" style="background:${colorFor(it)}"></span>
      ${elId === 'modelFilter' ? shortModel(it) : it}</label>`).join('');
    dd.querySelector('.dd-count').textContent = selected.size ? `(${selected.size})` : '';
    menu.querySelectorAll('input').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) selected.add(cb.value); else selected.delete(cb.value);
        dd.querySelector('.dd-count').textContent = selected.size ? `(${selected.size})` : '';
        refresh();
      });
    });
  };
  build('appFilter', state.meta.apps, state.apps);
  build('modelFilter', state.meta.models, state.models);
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
      || meta.models.join() !== state.meta.models.join();
    state.meta = meta;
    // stable colors: apps first, then models
    meta.apps.forEach(colorFor);
    meta.models.forEach(colorFor);
    if (metaChanged || firstLoad) renderFilters();

    const {from, bucket} = rangeParams();
    const f = filterParams();
    const [cardsData, ts, breakdown, recent] = await Promise.all([
      getJSON('/v1/stats/cards', f),
      getJSON('/v1/stats/timeseries', {from, bucket, group_by: state.group, ...f}),
      getJSON('/v1/stats/breakdown', {from, ...f}),
      getJSON('/v1/events/recent', {limit: 14, ...f}),
    ]);
    renderCards(cardsData);
    renderTimeseries(ts);
    renderDonuts(breakdown);
    renderBreakdown(breakdown);
    renderRecent(recent);

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
    `live · ${state.meta ? fmtNum(state.meta.total_events) + ' events stored · ' : ''}updated ${s}s ago`;
}

// ---------------------------------------------------------------- wiring

document.getElementById('rangeBar').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  state.range = btn.dataset.range;
  document.querySelectorAll('#rangeBar button').forEach((b) => b.classList.toggle('active', b === btn));
  refresh();
});

document.getElementById('groupBar').addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  state.group = btn.dataset.group;
  document.querySelectorAll('#groupBar button').forEach((b) => b.classList.toggle('active', b === btn));
  refresh();
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
