/* =========================================
   SINCRONIZACIÓN EN LA NUBE (Firebase Firestore)

   Los datos se siguen guardando en localStorage
   (rápido y funciona sin internet) y además se
   copian a la nube, así los usuarios, productos,
   saldos y pedidos sirven en Chrome, Brave, el
   celular o cualquier otro navegador.

   Requiere js/firebase-config.js con los datos
   de tu proyecto de Firebase. Si no están, el
   sitio funciona igual que antes (solo local).
========================================= */
window.SVSYNC = (function () {
  var COL = "sv_data";
  var TS_KEY = "sv_ts";
  var RELOAD_FLAG = "sv_sync_reloaded";

  var db = null;
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

  /* ---------- traer datos de la nube ---------- */
  function pull() {
    if (!enabled) return Promise.resolve(0);
    return db.collection(COL).get().then(function (snap) {
      var changed = 0;
      snap.forEach(function (doc) {
        var key = doc.id;
        var d = doc.data() || {};
        var t = Number(d.t || 0);
        if (!t || t <= getTs(key)) return;
        var val;
        try { val = JSON.parse(d.v); } catch (e) { return; }
        writeLocal(key, val);
        setTs(key, t);
        changed++;
      });
      return changed;
    });
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

    var batch = db.batch();
    var sent = {};
    keys.forEach(function (k) {
      var item = queue[k];
      sent[k] = item;
      batch.set(db.collection(COL).doc(k), { v: item.v, t: item.t });
      delete queue[k];
    });

    batch.commit().catch(function () {
      keys.forEach(function (k) {
        if (!queue[k]) queue[k] = sent[k];
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

    var cfg = window.SV_FIREBASE_CONFIG;
    if (!cfg || !cfg.apiKey || !cfg.projectId || typeof firebase === "undefined") {
      finish();
      return readyPromise;
    }

    try {
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      db = firebase.firestore();
      enabled = true;
    } catch (e) {
      enabled = false;
      finish();
      return readyPromise;
    }

    var timeout = new Promise(function (res) { setTimeout(function () { res(-1); }, 12000); });

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
