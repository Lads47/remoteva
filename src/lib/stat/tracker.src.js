/* eslint-disable @typescript-eslint/no-unused-vars -- catch (e) gardé : vieux navigateurs */
// EVA Stat — script de suivi servi sur /e.js.
// Source lisible ; la version minifiée servie est régénérée par
// `node scripts/stat-build-tracker.mjs` (un test vérifie qu'elle est à jour).
(function (w, d) {
  var me = d.currentScript;
  if (!me) return;
  var site = me.getAttribute("data-site");
  if (!site) return;
  var api = new URL(me.src).origin + "/api/public/e";
  // data-exclude="/live,/dashboard" : préfixes de chemins jamais mesurés (pages d'application).
  var excluded = (me.getAttribute("data-exclude") || "").split(",").map(function (p) {
    return p.trim().replace(/\/$/, "");
  }).filter(Boolean);
  function isExcluded(u) {
    return excluded.some(function (p) { return u === p || u.indexOf(p + "/") === 0; });
  }
  var nav = w.navigator;
  var L, S;
  try { L = w.localStorage; S = w.sessionStorage; } catch (e) {}

  function get(st, k) { try { return st.getItem(k); } catch (e) { return null; } }
  function set(st, k, v) { try { st.setItem(k, v); } catch (e) {} }
  function del(st, k) { try { st.removeItem(k); } catch (e) {} }
  function uid() {
    try { return crypto.randomUUID(); } catch (e) {
      return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
    }
  }
  function now() { return Date.now(); }

  function off() {
    return nav.doNotTrack == "1" || w.doNotTrack == "1" || !!nav.globalPrivacyControl ||
      get(L, "evaStat_off") == "1";
  }

  // Visiteur : propre à ce site, renouvelé après 13 mois (395 jours).
  function visitor() {
    var p = (get(L, "evaStat_v") || "").split(".");
    if (!p[1] || now() - p[1] > 34128e6) {
      p = [uid(), now()];
      set(L, "evaStat_v", p.join("."));
    }
    return p[0];
  }

  // Session : nouvelle après 30 min sans activité.
  function session() {
    var p = (get(S, "evaStat_s") || "").split(".");
    if (!p[1] || now() - p[1] > 18e5) p = [uid()];
    p[1] = now();
    set(S, "evaStat_s", p.join("."));
    return p[0];
  }

  function send(o) {
    if (off()) return;
    o.s = site;
    o.v = visitor();
    o.se = session();
    if (nav.webdriver) o.b = 1;
    var body = JSON.stringify(o);
    try { if (nav.sendBeacon && nav.sendBeacon(api, body)) return; } catch (e) {}
    try {
      fetch(api, { method: "POST", body: body, keepalive: true, credentials: "omit",
        headers: { "Content-Type": "text/plain" } }).catch(function () {});
    } catch (e) {}
  }

  var pid, last, refSent, acc = 0, since = 0;
  function visible() { return d.visibilityState == "visible"; }
  function resume() { if (!since && visible()) since = now(); }
  function pause() { if (since) { acc += now() - since; since = 0; } }
  function seconds() { return Math.round((acc + (since ? now() - since : 0)) / 1000); }
  function ping(t) { if (pid) send({ t: t, p: pid, d: seconds() }); }

  function pageview() {
    var u = location.pathname;
    if (u === last) return;
    ping("heartbeat");
    last = u;
    pid = null;
    if (isExcluded(u)) return;
    pid = uid();
    acc = since = 0;
    resume();
    var o = { t: "pageview", p: pid, u: u, ti: d.title.slice(0, 300), w: screen.width, l: nav.language };
    if (!refSent) { refSent = 1; if (d.referrer) o.r = d.referrer.slice(0, 1000); }
    var q = new URLSearchParams(location.search);
    ["source", "medium", "campaign"].forEach(function (k) {
      var v = q.get("utm_" + k);
      if (v) o["u" + k[0]] = v.slice(0, 100);
    });
    send(o);
  }

  function track(name, props) {
    if (typeof name != "string" || isExcluded(location.pathname)) return;
    var o = { t: "event", n: name.slice(0, 64), u: location.pathname };
    if (props && typeof props == "object") o.pr = props;
    send(o);
  }

  var queued = (w.evaStat && w.evaStat.q) || [];
  var evaStat = function (name, props) { track(name, props); };
  evaStat.optOut = function () { set(L, "evaStat_off", "1"); };
  evaStat.optIn = function () { del(L, "evaStat_off"); };
  w.evaStat = evaStat;

  // Sites monopages : le titre est mis à jour après le changement d'URL.
  ["pushState", "replaceState"].forEach(function (m) {
    var orig = history[m];
    history[m] = function () {
      var r = orig.apply(this, arguments);
      setTimeout(pageview, 100);
      return r;
    };
  });
  w.addEventListener("popstate", function () { setTimeout(pageview, 100); });

  d.addEventListener("visibilitychange", function () {
    if (visible()) resume();
    else { pause(); ping("heartbeat"); }
  });
  w.addEventListener("pagehide", function () { pause(); ping("leave"); });
  setInterval(function () { if (visible()) ping("heartbeat"); }, 15e3);

  pageview();
  for (var i = 0; i < queued.length; i++) track(queued[i][0], queued[i][1]);
})(window, document);
