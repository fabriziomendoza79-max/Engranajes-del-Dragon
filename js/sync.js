/* =========================================
   SINCRONIZACIÓN EN LA NUBE (Supabase)

   Los datos se siguen guardando en localStorage
   (rápido y funciona sin internet) y además se
   copian a Supabase, así los usuarios, productos,
   saldos y pedidos sirven en Chrome, Brave, el
   celular o cualquier otro navegador.

   - Al bajar solo se descargan los datos que
     cambiaron (no todo el catálogo).
   - Al subir se fusionan los cambios, así nunca
     se borra un producto o usuario que otro
     navegador haya agregado.
   - Cuando alguien cambia algo, las demás
     pantallas se actualizan solas.

   Requiere js/supabase-config.js. Si está vacío,
   el sitio funciona igual que antes (solo local).
========================================= */
window.SVSYNC = (function () {
  var TABLE = "sv_data";
  var TS_KEY = "sv_ts";
  var MIRROR_KEY = "sv_mirror";
  var TIMEOUT = 12000;
  var RELOAD_GAP = 3000;

  var base = "";
  var anon = "";
  var enabled = false;
  var ready = false;
  var starting = false;
  var queue = {};
  var timer = null;
  var lastReload = 0;
  var remoteRows = null;

  var resolveReady = null;
  var readyPromise = new Promise(function (res) { resolveReady = res; });

  function finish() {
    if (ready) return;
    ready = true;
    resolveReady(enabled);
  }

  function isReady() { return ready; }
  function isEnabled() { return enabled; }

  /* ---------- almacenamiento local ---------- */
  function parseJSON(raw, fallback) {
    if (raw == null || raw === "") return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  function writeStore(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      try { console.warn("SVSYNC: sin espacio para " + key, e); } catch (e2) {}
      return false;
    }
  }

  function tsMap() { return parseJSON(localStorage.getItem(TS_KEY), {}) || {}; }
  function getTs(key) { return Number(tsMap()[key] || 0); }
  function setTs(key, t) {
    var m = tsMap();
    m[key] = t;
    writeStore(TS_KEY, m);
  }

  function getMirror(key) {
    var m = parseJSON(localStorage.getItem(MIRROR_KEY), {}) || {};
    return m[key] || null;
  }
  function setMirror(key, ids) {
    var m = parseJSON(localStorage.getItem(MIRROR_KEY), {}) || {};
    m[key] = ids;
    writeStore(MIRROR_KEY, m);
  }

  function writeLocal(key, value) { return writeStore(key, value); }

  /* ---------- identidad de cada elemento ---------- */
  function idOf(item) {
    if (item == null) return "";
    if (typeof item !== "object") return String(item);
    return String(
      item.id != null ? item.id :
      item.code != null ? item.code :
      item.orderId != null ? item.orderId :
      item.key != null ? item.key :
      item.name != null ? item.name : ""
    );
  }

  function idsOf(value) {
    if (Array.isArray(value)) return value.map(idOf).filter(Boolean);
    if (value && typeof value === "object") return Object.keys(value);
    return [];
  }

  function isMergeable(key) {
    return key.indexOf("sv_balance_") !== 0;
  }

  /* fusiona lo local con lo remoto sin perder lo de otros navegadores:
     - lo nuestro mantiene prioridad
     - lo que apareció en la nube y no habíamos visto se conserva
     - lo que estaba en el espejo pero ya no está local, fue borrado */
  function mergeValue(key, localVal, remoteVal, mirror) {
    try {
      if (Array.isArray(localVal) && Array.isArray(remoteVal)) {
        var seen = {};
        (mirror || []).forEach(function (id) { seen[id] = 1; });
        var localIds = {};
        localVal.forEach(function (it) { var id = idOf(it); if (id) localIds[id] = 1; });
        var result = localVal.slice();
        remoteVal.forEach(function (it) {
          var id = idOf(it);
          if (!id || localIds[id]) return;
          if (seen[id]) return;
          result.push(it);
          localIds[id] = 1;
        });
        return result;
      }

      if (
        localVal && typeof localVal === "object" && !Array.isArray(localVal) &&
        remoteVal && typeof remoteVal === "object" && !Array.isArray(remoteVal)
      ) {
        var mirrorKeys = {};
        (mirror || []).forEach(function (k) { mirrorKeys[k] = 1; });
        var res = {};
        Object.keys(remoteVal).forEach(function (k) {
          if (Object.prototype.hasOwnProperty.call(localVal, k)) { res[k] = localVal[k]; return; }
          if (!mirrorKeys[k]) res[k] = remoteVal[k];
        });
        Object.keys(localVal).forEach(function (k) {
          if (!Object.prototype.hasOwnProperty.call(res, k)) res[k] = localVal[k];
        });
        return res;
      }
    } catch (e) {}
    return localVal;
  }

  /* ---------- peticiones ---------- */
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

  /* ---------- bajar solo lo que cambió ---------- */
  function fetchValues(ids) {
    var out = [];
    function batch(start) {
      var slice = ids.slice(start, start + 50);
      if (!slice.length) return Promise.resolve(out);
      var list = slice.map(encodeURIComponent).join(",");
      return api(
        "/rest/v1/" + TABLE + "?select=id,value,ts&id=in.(" + list + ")",
        { headers: headers() }
      ).then(function (rows) {
        out = out.concat(rows || []);
        return batch(start + 50);
      });
    }
    return batch(0);
  }

  function shrinkThen(key, value) {
    try {
      if (window.SV && SV.shrinkValue) return SV.shrinkValue(key, value);
    } catch (e) {}
    return Promise.resolve(value);
  }

  function adopt(key, value, ts) {
    if (writeLocal(key, value)) {
      setTs(key, ts);
      setMirror(key, idsOf(value));
      return true;
    }
    return false;
  }

  function pull() {
    if (!enabled) return Promise.resolve(0);

    return api("/rest/v1/" + TABLE + "?select=id,ts", { headers: headers() })
      .then(function (rows) {
        rows = rows || [];
        remoteRows = rows.length;
        var need = [];
        rows.forEach(function (r) {
          var t = Number(r.ts || 0);
          if (!r.id || !t || t <= getTs(r.id)) return;
          need.push(r.id);
        });
        if (!need.length) return 0;

        return fetchValues(need).then(function (list) {
          var jobs = (list || []).map(function (row) {
            return { row: row, val: parseJSON(row.value, null) };
          }).filter(function (j) { return j.val !== null; });

          return jobs.reduce(function (chain, job) {
            return chain.then(function (changed) {
              var ts = Number(job.row.ts || 0);
              var ok = adopt(job.row.id, job.val, ts);
              if (ok) return changed + 1;
              /* sin espacio local: aligerar imágenes y reintentar */
              return shrinkThen(job.row.id, job.val).then(function (small) {
                if (small && small !== job.val && adopt(job.row.id, small, ts)) return changed + 1;
                try { console.warn("SVSYNC: no se pudo guardar " + job.row.id); } catch (e) {}
                return changed;
              });
            });
          }, Promise.resolve(0));
        });
      });
  }

  /* ---------- subir (fusionando con lo que ya está en la nube) ---------- */
  function push(key, value) {
    if (!enabled) return;
    queue[key] = { v: JSON.stringify(value) };
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, 400);
    if (typeof document !== "undefined" && document.visibilityState === "hidden") flush();
  }

  function prepareRow(job) {
    var key = job.k;
    var localVal = parseJSON(job.v, null);
    var ts = Date.now();

    if (localVal === null || !isMergeable(key)) {
      return Promise.resolve({ id: key, value: job.v, ts: ts, final: null });
    }

    return api(
      "/rest/v1/" + TABLE + "?select=value&id=eq." + encodeURIComponent(key),
      { headers: headers() }
    ).then(function (rows) {
      var remoteVal = null;
      if (rows && rows[0]) remoteVal = parseJSON(rows[0].value, null);
      var finalVal = remoteVal === null
        ? localVal
        : mergeValue(key, localVal, remoteVal, getMirror(key));
      return { id: key, value: JSON.stringify(finalVal), ts: ts, final: finalVal };
    }).catch(function () {
      return { id: key, value: job.v, ts: ts, final: null };
    });
  }

  function flush() {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!enabled || !ready) return;

    var keys = Object.keys(queue);
    if (!keys.length) return;

    var jobs = keys.map(function (k) {
      var item = queue[k];
      delete queue[k];
      return { k: k, v: item.v };
    });
    var original = {};
    jobs.forEach(function (j) { original[j.k] = j.v; });

    Promise.all(jobs.map(prepareRow))
      .then(function (rows) {
        return api("/rest/v1/" + TABLE, {
          method: "POST",
          headers: headers({ Prefer: "resolution=merge-duplicates,return=minimal" }),
          body: JSON.stringify(rows.map(function (row) {
            return { id: row.id, value: row.value, ts: row.ts };
          }))
        }).then(function () { return rows; });
      })
      .then(function (rows) {
        rows.forEach(function (row) {
          setTs(row.id, row.ts);
          if (row.final) {
            setMirror(row.id, idsOf(row.final));
            var current = localStorage.getItem(row.id);
            if (current === null || current === original[row.id]) {
              writeLocal(row.id, row.final);
            }
          }
        });
        if (Object.keys(queue).length) setTimeout(flush, 100);
      })
      .catch(function () {
        jobs.forEach(function (j) { if (!queue[j.k]) queue[j.k] = { v: j.v }; });
        setTimeout(flush, 5000);
      });
  }

  /* si la nube está vacía, subir todo lo que hay local */
  function pushAll() {
    if (!enabled) return;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf("sv_") !== 0) continue;
        if (k === "sv_session" || k === TS_KEY || k === MIRROR_KEY) continue;
        var raw = localStorage.getItem(k);
        if (raw == null) continue;
        queue[k] = { v: raw };
      }
    } catch (e) {}
    flush();
  }

  /* ---------- cambios remotos: avisar y refrescar ---------- */
  function busyEditing() {
    var el = document.activeElement;
    if (!el) return false;
    var tag = (el.tagName || "").toUpperCase();
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
  }

  function doReload() {
    try {
      var now = Date.now();
      if (now - lastReload < RELOAD_GAP) return;
      if (busyEditing()) return;
      lastReload = now;
      location.reload();
    } catch (e) {}
  }

  function afterPull(changed) {
    if (!changed) return;
    try {
      document.dispatchEvent(new CustomEvent("sv:sync", { detail: { changed: changed } }));
    } catch (e) {}
    try {
      if (document.readyState === "loading") {
        /* la página todavía se está dibujando: recargar al terminar */
        if (!window.__svReloadOnLoad) {
          window.__svReloadOnLoad = true;
          window.addEventListener("load", function () { setTimeout(doReload, 100); });
        }
        return;
      }
      doReload();
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
        if (changed === -1) {
          enabled = false;
        } else if (remoteRows === 0) {
          pushAll();
        }
        finish();
        flush();
        if (changed > 0) afterPull(changed);
        refreshLocalImages();
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
    }, 30000);

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState !== "visible") return;
      if (!enabled || !ready) return;
      pull().then(afterPull).catch(function () {});
    });

    window.addEventListener("focus", function () {
      if (!enabled || !ready) return;
      pull().then(afterPull).catch(function () {});
    });

    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", flush);
  }

  /* aligerar imágenes gigantes guardadas en el catálogo */
  function refreshLocalImages() {
    try {
      if (window.SV && SV.shrinkProducts) SV.shrinkProducts();
    } catch (e) {}
  }

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", function () {
        init();
        scheduleRefresh();
      });
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
