/* =========================================
   SINCRONIZACIÓN EN LA NUBE (Supabase)

   Los datos se siguen guardando en localStorage
   (rápido y funciona sin internet) y además se
   copian a Supabase, así los usuarios, productos,
   saldos y pedidos sirven en Chrome, Brave, el
   celular o cualquier otro navegador.

   Requiere js/supabase-config.js con la URL y la
   clave anónima de tu proyecto de Supabase y la
   tabla sv_data (ver instrucciones). Si no están,
   el sitio funciona igual que antes (solo local).
========================================= */
window.SVSYNC = (function () {
  var TABLE = "sv_data";
  var TS_KEY = "sv_ts";
  var RELOAD_FLAG = "sv_sync_reloaded";
  var PAGE = 1000;
  var TIMEOUT = 12000;

  var base = "";
  var anon = "";
  var enabled = false;
  var ready = false;
  var starting = false;
  var queue = {};
  var timer = null;

  var resolveReady = null;
  var readyPromise = new Promise(function (res) { resolveReady = res; });

  function finish() {
    if (ready) return;
    ready = true;
    resolveReady(enabled);
  }

  function isReady() { return ready; }
  function isEnabled() { return enabled; }

  /* ---------- marcas de tiempo locales ---------- */
  function tsMap() {
    try { return JSON.parse(localStorage.getItem(TS_KEY)) || {}; }
    catch (e) { return {}; }
  }

  function getTs(key) { return Number(tsMap()[key] || 0); }

  function setTs(key, t) {
    var m = tsMap();
    m[key] = t;
    try { localStorage.setItem(TS_KEY, JSON.stringify(m)); } catch (e) {}
  }

  function writeLocal(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  /* ---------- peticiones a Supabase (PostgREST) ---------- */
  function headers(extra) {
    var h = {
      apikey: anon,
      Authorization: "Bearer " + anon,
      "Content-Type": "application/json"
    };
    if (extra) Object.keys(extra).forEach(function (k) { h[k] = extra[k]; });
    return h;
  }

  function api(path, opts) {
    return fetch(base + path, opts).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      if (res.status === 204) return null;
      return res.text().then(function (txt) {
        if (!txt) return null;
        try { return JSON.parse(txt); } catch (e) { return null; }
      });
    });
  }

  /* ---------- traer datos de la nube ---------- */
  function pull() {
    if (!enabled) return Promise.resolve(0);
    var changed = 0;
    var offset = 0;

    function page() {
      return api(
        "/rest/v1/" + TABLE +
        "?select=id,value,ts&limit=" + PAGE + "&offset=" + offset,
        { headers: headers() }
      ).then(function (rows) {
        rows = rows || [];
        rows.forEach(function (row) {
          var id = row.id;
          var t = Number(row.ts || 0);
          if (!id || !t || t <= getTs(id)) return;
          var val;
          try { val = JSON.parse(row.value); } catch (e) { return; }
          writeLocal(id, val);
          setTs(id, t);
          changed++;
        });
        if (rows.length >= PAGE) {
          offset += PAGE;
          return page();
        }
        return changed;
      });
    }

    return page();
  }

  /* ---------- subir cambios a la nube ---------- */
  function push(key, value) {
    if (!enabled) return;
    var t = Date.now();
    setTs(key, t);
    queue[key] = { t: t, v: JSON.stringify(value) };
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 400);
    if (typeof document !== "undefined" && document.visibilityState === "hidden") flush();
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!enabled || !ready) return;

    var keys = Object.keys(queue);
    if (!keys.length) return;

    var body = keys.map(function (k) {
      var item = queue[k];
      delete queue[k];
      return { id: k, value: item.v, ts: item.t };
    });

    api("/rest/v1/" + TABLE, {
      method: "POST",
      headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(body)
    }).catch(function () {
      body.forEach(function (row) {
        if (!queue[row.id]) queue[row.id] = { t: row.ts, v: row.value };
      });
      setTimeout(flush, 5000);
    });
  }

  /* ---------- cambios remotos: avisar y refrescar ---------- */
  function afterPull(changed) {
    if (!changed) return;
    try {
      document.dispatchEvent(new CustomEvent("sv:sync", { detail: { changed: changed } }));
    } catch (e) {}
    try {
      if (
        document.readyState !== "loading" &&
        sessionStorage.getItem(RELOAD_FLAG) !== "1"
      ) {
        sessionStorage.setItem(RELOAD_FLAG, "1");
        location.reload();
      }
    } catch (e) {}
  }

  /* ---------- arranque ---------- */
  function init() {
    if (ready) return Promise.resolve(enabled);
    if (starting) return readyPromise;
    starting = true;

    var cfg = window.SV_SUPABASE || {};
    base = (cfg.url || cfg.SUPABASE_URL || "").replace(/\/$/, "");
    anon = cfg.key || cfg.SUPABASE_ANON_KEY || "";

    if (!base || !anon || typeof fetch === "undefined") {
      finish();
      return readyPromise;
    }
    enabled = true;

    var timeout = new Promise(function (res) { setTimeout(function () { res(-1); }, TIMEOUT); });

    Promise.race([pull(), timeout])
      .then(function (changed) {
        if (changed === -1) enabled = false;
        finish();
        flush();
        if (changed > 0) afterPull(changed);
      })
      .catch(function () {
        enabled = false;
        finish();
      });

    return readyPromise;
  }

  function readyNow() {
    if (ready) return Promise.resolve(enabled);
    return init();
  }

  /* refresco periódico + al volver a la pestaña */
  function scheduleRefresh() {
    setInterval(function () {
      if (!enabled || !ready) return;
      pull().then(afterPull).catch(function () {});
    }, 60000);

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible") return;
      if (!enabled || !ready) return;
      pull().then(afterPull).catch(function () {});
    });

    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () { init(); scheduleRefresh(); });
    } else {
      init();
      scheduleRefresh();
    }
  }

  return {
    init: init,
    ready: readyNow,
    isReady: isReady,
    isEnabled: isEnabled,
    push: push,
    pull: pull,
    flush: flush
  };
})();
