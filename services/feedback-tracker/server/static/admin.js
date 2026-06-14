/* Feedback Tracker admin — app registry & key management */

let adminToken = sessionStorage.getItem('ft_admin_token') || '';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
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
  const resp = await fetch(path, {method, headers,
    body: body === undefined ? undefined : JSON.stringify(body)});
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

const COLLECTOR = location.origin;

function authStatusHTML(data) {
  const on = data.auth_required;
  const badge = on ? '<span class="badge badge-green">required</span>'
                   : '<span class="badge badge-gray">open mode</span>';
  let html = `<div class="form-row" style="margin-bottom:10px">Ingest authentication: ${badge}</div>`;
  if (on) {
    html += `<div class="notice">Submissions must send <code>Authorization: Bearer &lt;key&gt;</code>
      and each item's <code>app</code> must match the key's app. Browser widgets use the
      <b>publishable</b> key; the server SDK uses the <b>secret</b> token.</div>`;
  } else {
    html += `<div class="notice">Any app can send feedback without a key; new apps appear
      automatically on their first submission. Registering apps and issuing keys here is optional
      until you enable enforcement with <code>FEEDBACK_TRACKER_AUTH=required</code> on the
      collector — keys issued now keep working when you flip it on.</div>`;
  }
  return html;
}

function keyControls(a, field, label) {
  if (!a.registered) return '<span class="panel-sub">–</span>';
  return `
    <span class="token-box token-mask" data-app="${esc(a.app)}" data-field="${field}" data-shown="0">••••••••</span>
    <button class="linklike" data-act="show" data-app="${esc(a.app)}" data-field="${field}">Show</button>
    <button class="linklike" data-act="copy" data-app="${esc(a.app)}" data-field="${field}">Copy</button>
    <button class="linklike" data-act="rotate-${label}" data-app="${esc(a.app)}">Rotate</button>`;
}
function statusCell(a) {
  if (a.env_managed) return '<span class="badge badge-amber">env-managed</span>';
  if (a.registered) return '<span class="badge badge-green">registered</span>';
  return '<span class="badge badge-gray">unregistered</span>';
}
function actionsCell(a) {
  if (a.env_managed) return '<span class="panel-sub">edit via env var</span>';
  if (!a.registered) return `<button class="btn btn-quiet btn-sm" data-act="register" data-app="${esc(a.app)}">Register</button>`;
  return `<button class="btn btn-danger btn-sm" data-act="remove" data-app="${esc(a.app)}">Remove</button>`;
}

let appsCache = [];
function appByName(name) { return appsCache.find((a) => a.app === name); }

async function load() {
  const data = await api('GET', '/v1/admin/apps');
  appsCache = data.apps;
  document.getElementById('adminTokenPanel').style.display = 'none';
  document.getElementById('authStatusBody').innerHTML = authStatusHTML(data);
  const tbody = document.querySelector('#appsTable tbody');
  if (!data.apps.length) {
    tbody.innerHTML = '<tr><td colspan="8">No apps yet — add one below, or send feedback.</td></tr>';
    return;
  }
  tbody.innerHTML = data.apps.map((a) => `
    <tr>
      <td><span class="tag">${esc(a.app)}</span></td>
      <td>${statusCell(a)}</td>
      <td class="r">${a.items.toLocaleString('en-US')}</td>
      <td>${relTime(a.last_seen)}</td>
      <td>${keyControls(a, 'publishable_key', 'pk')}</td>
      <td>${keyControls(a, 'secret_token', 'sek')}</td>
      <td>${esc(a.note) || '<span class="panel-sub">–</span>'}
          ${a.registered && !a.env_managed
            ? `<button class="linklike" data-act="note" data-app="${esc(a.app)}">Edit</button>` : ''}</td>
      <td>${actionsCell(a)}</td>
    </tr>`).join('');
}

function widgetSnippet(app, pk) {
  return `<script src="${COLLECTOR}/widget/feedback-widget.js"\n`
    + `        data-app="${app}"\n`
    + `        data-collector-url="${COLLECTOR}"\n`
    + `        data-key="${pk}"><\/script>`;
}
function revealNewApp(app, secret, pk) {
  document.getElementById('newTokenReveal').innerHTML = `
    <div class="new-token-reveal">
      <div><b>${esc(app)}</b> registered. Keys are shown once here — copy them now.</div>
      <div style="margin-top:8px">Publishable (browser widget): <span class="token-box">${esc(pk)}</span></div>
      <div style="margin-top:6px">Secret (server SDK): <span class="token-box">${esc(secret)}</span></div>
      <div class="panel-sub" style="margin-top:10px">Drop this into the app's HTML — that's the whole integration:</div>
      <div class="snippet">${esc(widgetSnippet(app, pk))}</div>
      <div class="panel-sub" style="margin-top:8px">Server SDK instead:
        <code>FEEDBACK_TRACKER_TOKEN=${esc(secret)}</code> · <code>FEEDBACK_TRACKER_APP=${esc(app)}</code></div>
    </div>`;
}

async function handleAction(act, app, field) {
  const a = appByName(app);
  if (act === 'show') {
    const box = document.querySelector(`.token-box[data-app="${CSS.escape(app)}"][data-field="${field}"]`);
    const btn = document.querySelector(`[data-act="show"][data-app="${CSS.escape(app)}"][data-field="${field}"]`);
    const shown = box.dataset.shown === '1';
    box.textContent = shown ? '••••••••' : a[field];
    box.classList.toggle('token-mask', shown);
    box.dataset.shown = shown ? '0' : '1';
    btn.textContent = shown ? 'Show' : 'Hide';
    return;
  }
  if (act === 'copy') { await navigator.clipboard.writeText(a[field]); return; }
  if (act === 'rotate-pk') {
    if (!confirm(`Rotate the publishable key for "${app}"?\n\nThe current key stops working immediately; update the widget embed.`)) return;
    await api('POST', `/v1/admin/apps/${encodeURIComponent(app)}/publishable`);
    await load();
    return;
  }
  if (act === 'rotate-sek') {
    if (!confirm(`Rotate the secret token for "${app}"?\n\nThe current token stops working immediately; the SDK spools locally until it gets the new one.`)) return;
    await api('POST', `/v1/admin/apps/${encodeURIComponent(app)}/token`);
    await load();
    return;
  }
  if (act === 'register') {
    const res = await api('POST', '/v1/admin/apps', {app});
    revealNewApp(app, res.secret_token, res.publishable_key);
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
    if (!confirm(`Remove "${app}" from the registry?\n\nIts keys stop working immediately.`)) return;
    let purge = false;
    if (a.items > 0) {
      purge = confirm(`"${app}" has ${a.items.toLocaleString('en-US')} stored items.\n\nOK = also DELETE its feedback (irreversible)\nCancel = keep the history, just unregister`);
    }
    await api('DELETE', `/v1/admin/apps/${encodeURIComponent(app)}?purge_items=${purge}`);
    await load();
  }
}

document.querySelector('#appsTable tbody').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-act]');
  if (!btn) return;
  handleAction(btn.dataset.act, btn.dataset.app, btn.dataset.field).catch((err) => alert(err.message));
});
document.getElementById('addAppBtn').addEventListener('click', () => {
  const name = document.getElementById('newAppName').value.trim();
  const note = document.getElementById('newAppNote').value.trim() || null;
  if (!name) return;
  api('POST', '/v1/admin/apps', {app: name, note})
    .then((res) => {
      document.getElementById('newAppName').value = '';
      document.getElementById('newAppNote').value = '';
      revealNewApp(res.app, res.secret_token, res.publishable_key);
      return load();
    })
    .catch((err) => alert(err.message));
});
document.getElementById('adminTokenSave').addEventListener('click', () => {
  adminToken = document.getElementById('adminTokenInput').value.trim();
  sessionStorage.setItem('ft_admin_token', adminToken);
  load().catch((err) => alert(err.message));
});
document.getElementById('refreshBtn').addEventListener('click', () => {
  load().catch((err) => alert(err.message));
});

load().catch(() => { /* 401 path shows the token panel */ });
