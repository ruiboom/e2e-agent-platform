/* feedback-widget.js — drop-in user-feedback widget.
 *
 * Renders a floating "Feedback" button + a small form, and POSTs submissions to
 * the central collector's /v1/feedback endpoint. Nothing is lost on failure: a
 * submission is queued in localStorage and retried with backoff until the
 * collector acknowledges it. No dependencies, no build step.
 *
 * Zero-JS embed (reads data-* from its own <script> tag):
 *   <script src="https://feedback.internal:8788/widget/feedback-widget.js"
 *           data-app="support-bot"
 *           data-collector-url="https://feedback.internal:8788"
 *           data-key="pk_..."></script>
 *
 * Programmatic:
 *   FeedbackWidget.init({app, collectorUrl, publishableKey, accent, meta});
 *   FeedbackWidget.open();                       // open the panel
 *   FeedbackWidget.submit({kind, rating, text}); // send without the UI
 */
(function () {
  "use strict";

  var QUEUE_KEY = "feedback_tracker_queue";
  var RETRY_MS = 15000;
  var cfg = {
    app: "unknown",
    collectorUrl: "",
    publishableKey: "",
    accent: "#006a4d",
    title: "Send feedback",
    prompt: "How's your experience?",
    meta: {},
  };
  var started = false;

  // ------------------------------------------------------------- utilities
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "fb-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }
  function nowIso() { return new Date().toISOString().slice(0, 19) + "Z"; }

  function loadQueue() {
    try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]"); }
    catch (e) { return []; }
  }
  function saveQueue(q) {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)); } catch (e) { /* full/blocked */ }
  }
  function enqueue(item) { var q = loadQueue(); q.push(item); saveQueue(q); }

  // Drain the queue to the collector. Items the collector accepts (or rejects
  // as a 4xx validation error — poison, not retryable) are removed; transient
  // failures keep the item for the next attempt.
  function collectorBase() {
    // empty collectorUrl means "this origin" — the common same-origin embed
    return (cfg.collectorUrl || location.origin).replace(/\/$/, "");
  }
  function drain() {
    var q = loadQueue();
    if (!q.length) return Promise.resolve();
    var batch = q.slice(0, 50);
    var headers = { "Content-Type": "application/json" };
    if (cfg.publishableKey) headers["Authorization"] = "Bearer " + cfg.publishableKey;
    return fetch(collectorBase() + "/v1/feedback", {
      method: "POST", headers: headers, body: JSON.stringify({ items: batch }),
    }).then(function (resp) {
      if (resp.ok || (resp.status >= 400 && resp.status < 500)) {
        // 2xx = stored; 4xx = rejected as invalid and never going to succeed.
        // Either way, drop this batch so the queue can't wedge.
        saveQueue(loadQueue().slice(batch.length));
        if (loadQueue().length) return drain();
      }
      // 5xx / network: leave the queue intact for the next retry tick.
    }).catch(function () { /* offline: keep the queue, retry later */ });
  }

  // --------------------------------------------------------------- send API
  function send(item) {
    var full = {
      feedback_id: item.feedback_id || uuid(),
      app: item.app || cfg.app,
      kind: item.kind || "freeform",
      ts: item.ts || nowIso(),
    };
    if (item.rating !== undefined && item.rating !== null) full.rating = item.rating;
    if (item.sentiment) full.sentiment = item.sentiment;
    if (item.text) full.text = item.text;
    if (item.user_id) full.user_id = item.user_id;
    if (item.session_id) full.session_id = item.session_id;
    var meta = Object.assign({ page: location.pathname }, cfg.meta, item.meta || {});
    if (Object.keys(meta).length) full.meta = meta;
    enqueue(full);
    return drain();
  }

  // ----------------------------------------------------------------- styles
  function injectStyles() {
    if (document.getElementById("ft-widget-styles")) return;
    var css = [
      ".ft-fab{position:fixed;right:20px;bottom:20px;z-index:2147483000;",
      "background:var(--ft-accent);color:#fff;border:none;border-radius:48px;",
      "padding:12px 18px;font:600 14px/1 system-ui,sans-serif;cursor:pointer;",
      "box-shadow:0 6px 20px rgba(0,0,0,.18)}",
      ".ft-fab:hover{filter:brightness(1.08)}",
      ".ft-overlay{position:fixed;inset:0;background:rgba(0,0,0,.28);z-index:2147483001;",
      "display:flex;align-items:flex-end;justify-content:flex-end;padding:20px}",
      ".ft-panel{background:#fff;border-radius:16px;width:340px;max-width:100%;",
      "padding:20px;box-shadow:0 16px 48px rgba(0,0,0,.25);font:14px/1.5 system-ui,sans-serif;color:#111}",
      ".ft-panel h3{margin:0 0 4px;font-size:17px}",
      ".ft-panel .ft-sub{color:#666;font-size:13px;margin-bottom:14px}",
      ".ft-stars{display:flex;gap:6px;margin-bottom:14px}",
      ".ft-star{font-size:26px;cursor:pointer;color:#d0d0d0;line-height:1}",
      ".ft-star.on{color:#f5a623}",
      ".ft-cats{display:flex;gap:8px;margin-bottom:12px}",
      ".ft-cat{flex:1;padding:7px 0;border:1px solid #ccc;border-radius:8px;background:#fff;",
      "cursor:pointer;font:500 13px system-ui;color:#444}",
      ".ft-cat.on{border-color:var(--ft-accent);color:var(--ft-accent);background:#f4faf7}",
      ".ft-text{width:100%;min-height:74px;border:1px solid #ccc;border-radius:8px;",
      "padding:9px;font:inherit;resize:vertical;box-sizing:border-box}",
      ".ft-text:focus{outline:none;border-color:var(--ft-accent)}",
      ".ft-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}",
      ".ft-btn{border-radius:48px;padding:9px 18px;font:600 14px system-ui;cursor:pointer;border:1px solid transparent}",
      ".ft-btn-primary{background:var(--ft-accent);color:#fff}",
      ".ft-btn-quiet{background:#fff;border-color:#ccc;color:#333}",
      ".ft-thanks{text-align:center;padding:24px 8px;color:var(--ft-accent);font-weight:600}",
    ].join("");
    var el = document.createElement("style");
    el.id = "ft-widget-styles";
    el.textContent = css;
    document.head.appendChild(el);
  }

  // ------------------------------------------------------------------- UI
  var overlay = null;

  function close() { if (overlay) { overlay.remove(); overlay = null; } }

  function open() {
    injectStyles();
    close();
    var state = { rating: null, category: "general" };

    overlay = document.createElement("div");
    overlay.className = "ft-overlay";
    overlay.style.setProperty("--ft-accent", cfg.accent);
    overlay.addEventListener("click", function (e) { if (e.target === overlay) close(); });

    var panel = document.createElement("div");
    panel.className = "ft-panel";
    panel.innerHTML =
      '<h3>' + esc(cfg.title) + '</h3>' +
      '<div class="ft-sub">' + esc(cfg.prompt) + '</div>' +
      '<div class="ft-stars"></div>' +
      '<div class="ft-cats">' +
        '<button class="ft-cat on" data-cat="general">General</button>' +
        '<button class="ft-cat" data-cat="bug">Bug</button>' +
        '<button class="ft-cat" data-cat="idea">Idea</button>' +
      '</div>' +
      '<textarea class="ft-text" placeholder="Tell us more (optional)"></textarea>' +
      '<div class="ft-actions">' +
        '<button class="ft-btn ft-btn-quiet" data-act="cancel">Cancel</button>' +
        '<button class="ft-btn ft-btn-primary" data-act="send">Send</button>' +
      '</div>';

    var stars = panel.querySelector(".ft-stars");
    for (var i = 1; i <= 5; i++) {
      var s = document.createElement("span");
      s.className = "ft-star"; s.dataset.v = i; s.textContent = "★";
      stars.appendChild(s);
    }
    function paintStars() {
      [].forEach.call(stars.children, function (el) {
        el.classList.toggle("on", state.rating !== null && +el.dataset.v <= state.rating);
      });
    }
    stars.addEventListener("click", function (e) {
      var st = e.target.closest(".ft-star"); if (!st) return;
      state.rating = +st.dataset.v; paintStars();
    });
    panel.querySelector(".ft-cats").addEventListener("click", function (e) {
      var b = e.target.closest(".ft-cat"); if (!b) return;
      state.category = b.dataset.cat;
      [].forEach.call(panel.querySelectorAll(".ft-cat"), function (el) {
        el.classList.toggle("on", el === b);
      });
    });
    panel.addEventListener("click", function (e) {
      var act = (e.target.closest("[data-act]") || {}).dataset;
      if (!act) return;
      if (act.act === "cancel") return close();
      if (act.act === "send") {
        var text = panel.querySelector(".ft-text").value.trim();
        var kind = state.category !== "general" ? state.category
                 : (state.rating !== null ? "csat" : "freeform");
        if (state.rating === null && !text) { close(); return; }
        send({ kind: kind, rating: state.rating, text: text });
        panel.innerHTML = '<div class="ft-thanks">Thanks for the feedback! ✓</div>';
        setTimeout(close, 1400);
      }
    });

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    panel.querySelector(".ft-text").focus();
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function mountFab() {
    injectStyles();
    if (document.querySelector(".ft-fab")) return;
    var fab = document.createElement("button");
    fab.className = "ft-fab";
    fab.style.setProperty("--ft-accent", cfg.accent);
    fab.textContent = "Feedback";
    fab.addEventListener("click", open);
    document.body.appendChild(fab);
  }

  // ----------------------------------------------------------------- init
  function init(options) {
    Object.assign(cfg, options || {});
    if (!started) {
      started = true;
      window.addEventListener("online", drain);
      setInterval(drain, RETRY_MS);
    }
    if (options && options.fab === false) { drain(); return api; }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", mountFab);
    } else {
      mountFab();
    }
    drain();
    return api;
  }

  // auto-init from the script tag's data-* attributes, if present
  function autoInit() {
    var s = document.currentScript ||
      document.querySelector('script[src*="feedback-widget.js"]');
    if (!s || !s.dataset || !s.dataset.app) return;
    init({
      app: s.dataset.app,
      collectorUrl: s.dataset.collectorUrl || "",
      publishableKey: s.dataset.key || "",
      accent: s.dataset.accent || cfg.accent,
    });
  }

  var api = { init: init, open: open, close: close, submit: send, drain: drain };
  window.FeedbackWidget = api;
  autoInit();
})();
