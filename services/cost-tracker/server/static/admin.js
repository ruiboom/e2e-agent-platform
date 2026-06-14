/* Cost Tracker admin — app registry & token management */

let adminToken = sessionStorage.getItem('ct_admin_token') || '';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
}

function fmtUSD(v) {
  if (v == null) return '–';
  if (v >= 1000) return '$' + v.toLocaleString('en-US', {maximumFractionDigits: 0});
  if (v >= 1) return '$' + v.toFixed(2);
  if (v === 0) return '$0.00';
  return '$' + v.toPrecision(2);
}

function relTime(ts) {
  if (!ts) return '–';
  const s = Math.max(0, (Date.now() - new Date(ts.replace(' ', 'T') + 'Z').getTime()) / 1000);
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

async function api(method, path, body) {
  const headers = {'Content-Type': 'application/json'};
  if (adminToken) headers['Authorization'] = 'Bearer ' + adminToken;
  const resp = await fetch(path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (resp.status === 401) {
    document.getElementById('adminTokenPanel').style.display = '';
    throw new Error('admin token required');
  }
  if (!resp.ok) {
    let detail = resp.statusText;
    try { detail = (await resp.json()).detail || detail; } catch (e) { /* keep */ }
    throw new Error(detail);
  }
  return resp.json();
}

function authStatusHTML(data) {
  const on = data.auth_required;
  const badge = on
    ? '<span class="badge badge-green">required</span>'
    : '<span class="badge badge-gray">open mode</span>';
  let html = `<div class="form-row" style="margin-bottom:10px">Ingest authentication: ${badge}</div>`;
  if (on) {
    html += `<div class="notice">Apps must send <code>Authorization: Bearer &lt;token&gt;</code>
      and each event's <code>app</code> must match the token's app. Tokens below are live.</div>`;
  } else {
    html += `<div class="notice">Any app can send events without a token; new apps appear
      automatically on their first event. Registering apps and issuing tokens here is optional
      until you enable enforcement by setting <code>COST_TRACKER_AUTH=required</code> on the
      collector — tokens issued now will keep working when you flip it on.</div>`;
  }
  return html;
}

function tokenCell(a) {
  if (a.env_managed) return '<span class="panel-sub">via COST_TRACKER_TOKENS</span>';
  if (!a.registered) return '<span class="panel-sub">–</span>';
  return `
    <span class="token-box token-mask" data-app="${esc(a.app)}" data-shown="0">••••••••••••</span>
    <button class="linklike" data-act="show" data-app="${esc(a.app)}">Show</button>
    <button class="linklike" data-act="copy" data-app="${esc(a.app)}">Copy</button>
    <button class="linklike" data-act="rotate" data-app="${esc(a.app)}">Rotate</button>`;
}

function statusCell(a) {
  if (a.env_managed) return '<span class="badge badge-amber">env-managed</span>';
  if (a.registered) return '<span class="badge badge-green">registered</span>';
  return '<span class="badge badge-gray">unregistered</span>';
}

function actionsCell(a) {
  if (a.env_managed) return '<span class="panel-sub">edit via env var</span>';
  if (!a.registered) {
    return `<button class="btn btn-quiet btn-sm" data-act="register" data-app="${esc(a.app)}">Register</button>`;
  }
  return `<button class="btn btn-danger btn-sm" data-act="remove" data-app="${esc(a.app)}">Remove</button>`;
}

let appsCache = [];

async function load() {
  const data = await api('GET', '/v1/admin/apps');
  appsCache = data.apps;
  document.getElementById('adminTokenPanel').style.display = 'none';
  document.getElementById('authStatusBody').innerHTML = authStatusHTML(data);
  const tbody = document.querySelector('#appsTable tbody');
  if (!data.apps.length) {
    tbody.innerHTML = '<tr><td colspan="8">No apps yet — add one below, or send an event.</td></tr>';
    return;
  }
  tbody.innerHTML = data.apps.map((a) => `
    <tr>
      <td><span class="tag">${esc(a.app)}</span></td>
      <td>${statusCell(a)}</td>
      <td class="r">${a.events.toLocaleString('en-US')}</td>
      <td>${relTime(a.last_seen)}</td>
      <td class="r">${fmtUSD(a.total_cost)}</td>
      <td>${tokenCell(a)}</td>
      <td>${esc(a.note) || '<span class="panel-sub">–</span>'}
          ${a.registered && !a.env_managed
            ? `<button class="linklike" data-act="note" data-app="${esc(a.app)}">Edit</button>` : ''}</td>
      <td>${actionsCell(a)}</td>
    </tr>`).join('');
}

function appByName(name) {
  return appsCache.find((a) => a.app === name);
}

function revealNewToken(app, token) {
  document.getElementById('newTokenReveal').innerHTML = `
    <div class="new-token-reveal">
      Token for <b>${esc(app)}</b>: <span class="token-box">${esc(token)}</span>
      <button class="linklike" onclick="navigator.clipboard.writeText('${esc(token)}')">Copy</button>
      <div class="panel-sub" style="margin-top:6px">
        Set on the app: <code>COST_TRACKER_TOKEN=${esc(token)}</code> ·
        <code>COST_TRACKER_APP=${esc(app)}</code></div>
    </div>`;
}

async function handleAction(act, app) {
  const a = appByName(app);
  if (act === 'show') {
    const box = document.querySelector(`.token-box[data-app="${CSS.escape(app)}"]`);
    const btn = document.querySelector(`[data-act="show"][data-app="${CSS.escape(app)}"]`);
    const shown = box.dataset.shown === '1';
    box.textContent = shown ? '••••••••••••' : a.token;
    box.classList.toggle('token-mask', shown);
    box.dataset.shown = shown ? '0' : '1';
    btn.textContent = shown ? 'Show' : 'Hide';
    return;
  }
  if (act === 'copy') {
    await navigator.clipboard.writeText(a.token);
    return;
  }
  if (act === 'rotate') {
    if (!confirm(`Rotate the token for "${app}"?\n\nThe current token stops working immediately; the app keeps spooling locally until it gets the new one.`)) return;
    const res = await api('POST', `/v1/admin/apps/${encodeURIComponent(app)}/token`);
    revealNewToken(app, res.token);
    await load();
    return;
  }
  if (act === 'register') {
    const res = await api('POST', '/v1/admin/apps', {app});
    revealNewToken(app, res.token);
    await load();
    return;
  }
  if (act === 'note') {
    const note = prompt(`Note for "${app}":`, a.note || '');
    if (note === null) return;
    await api('PUT', `/v1/admin/apps/${encodeURIComponent(app)}`, {note: note || null});
    await load();
    return;
  }
  if (act === 'remove') {
    if (!confirm(`Remove "${app}" from the registry?\n\nIts ingest token stops working immediately.`)) return;
    let purge = false;
    if (a.events > 0) {
      purge = confirm(`"${app}" has ${a.events.toLocaleString('en-US')} stored events.\n\nOK = also DELETE its events from the dashboard (irreversible)\nCancel = keep the history, just unregister`);
    }
    await api('DELETE', `/v1/admin/apps/${encodeURIComponent(app)}?purge_events=${purge}`);
    await load();
  }
}

document.querySelector('#appsTable tbody').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  handleAction(btn.dataset.act, btn.dataset.app).catch((err) => alert(err.message));
});

document.getElementById('addAppBtn').addEventListener('click', () => {
  const name = document.getElementById('newAppName').value.trim();
  const note = document.getElementById('newAppNote').value.trim() || null;
  if (!name) return;
  api('POST', '/v1/admin/apps', {app: name, note})
    .then((res) => {
      document.getElementById('newAppName').value = '';
      document.getElementById('newAppNote').value = '';
      revealNewToken(res.app, res.token);
      return load();
    })
    .catch((err) => alert(err.message));
});

document.getElementById('adminTokenSave').addEventListener('click', () => {
  adminToken = document.getElementById('adminTokenInput').value.trim();
  sessionStorage.setItem('ct_admin_token', adminToken);
  load().catch((err) => alert(err.message));
});

document.getElementById('refreshBtn').addEventListener('click', () => {
  load().catch((err) => alert(err.message));
});

load().catch(() => { /* 401 path shows the token panel */ });
