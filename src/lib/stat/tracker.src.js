/* eslint-disable @typescript-eslint/no-unused-vars -- catch (e) gardé : vieux navigateurs */
// EVA Stat — script de suivi servi sur /e.js.
// Source lisible ; la version minifiée servie est régénérée par
// `node scripts/stat-build-tracker.mjs` (un test vérifie qu'elle est à jour et < 3 Ko).
// Fonctions fléchées partout où `this`/`arguments` ne servent pas : c'est ce qui tient le poids.
((w, d) => {
  var me = d.currentScript;
  if (!me) return;
  var attr = (n) => me.getAttribute(n);
  var site = attr("data-site");
  if (!site) return;
  var api = new URL(me.src).origin + "/api/public/e";
  // data-exclude="/live,/dashboard" : préfixes de chemins jamais mesurés (pages d'application).
  var excluded = (attr("data-exclude") || "").split(",").map((p) => p.trim().replace(/\/$/, "")).filter(Boolean);
  var path = () => location.pathname;
  var isExcluded = (u) => excluded.some((p) => u === p || u.indexOf(p + "/") === 0);
  var nav = w.navigator;
  var on = (t, el, f, c) => el.addEventListener(t, f, c);
  var K = "evaStat_";
  var L, S;
  try { L = w.localStorage; S = w.sessionStorage; } catch (e) {}

  var get = (st, k) => { try { return st.getItem(K + k); } catch (e) { return null; } };
  var set = (st, k, v) => { try { st.setItem(K + k, v); } catch (e) {} };
  var uid = () => {
    try { return crypto.randomUUID(); } catch (e) {
      return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 12);
    }
  };
  var now = () => Date.now();

  var off = () => nav.doNotTrack == "1" || w.doNotTrack == "1" || !!nav.globalPrivacyControl || get(L, "off") == "1";

  // Visiteur : propre à ce site, renouvelé après 13 mois (395 jours).
  var visitor = () => {
    var p = (get(L, "v") || "").split(".");
    if (!p[1] || now() - p[1] > 34128e6) {
      p = [uid(), now()];
      set(L, "v", p.join("."));
    }
    return p[0];
  };

  // Session : nouvelle après 30 min sans activité.
  var session = () => {
    var p = (get(S, "s") || "").split(".");
    if (!p[1] || now() - p[1] > 18e5) p = [uid()];
    p[1] = now();
    set(S, "s", p.join("."));
    return p[0];
  };

  var send = (o) => {
    if (off()) return;
    o.s = site;
    o.v = visitor();
    o.se = session();
    if (nav.webdriver) o.b = 1;
    var body = JSON.stringify(o);
    try { if (nav.sendBeacon && nav.sendBeacon(api, body)) return; } catch (e) {}
    try {
      fetch(api, { method: "POST", body: body, keepalive: true, credentials: "omit",
        headers: { "Content-Type": "text/plain" } }).catch(() => {});
    } catch (e) {}
  };

  var pid, last, refSent, acc = 0, since = 0;
  var visible = () => d.visibilityState == "visible";
  var resume = () => { if (!since && visible()) since = now(); };
  var pause = () => { if (since) { acc += now() - since; since = 0; } };
  var seconds = () => Math.round((acc + (since ? now() - since : 0)) / 1000);
  var ping = (t) => { if (pid) send({ t: t, p: pid, d: seconds() }); };

  var pageview = () => {
    var u = path();
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
    ["source", "medium", "campaign"].forEach((k) => {
      var v = q.get("utm_" + k);
      if (v) o["u" + k[0]] = v.slice(0, 100);
    });
    send(o);
  };

  var track = (name, props) => {
    if (typeof name != "string" || isExcluded(path())) return;
    var o = { t: "event", n: name.slice(0, 64), u: path() };
    if (props && typeof props == "object") o.pr = props;
    send(o);
  };

  var queued = (w.evaStat && w.evaStat.q) || [];
  var evaStat = (name, props) => track(name, props);
  evaStat.optOut = () => set(L, "off", "1");
  evaStat.optIn = () => { try { L.removeItem(K + "off"); } catch (e) {} };
  w.evaStat = evaStat;

  // Sites monopages : le titre est mis à jour après le changement d'URL.
  ["pushState", "replaceState"].forEach((m) => {
    var orig = history[m];
    history[m] = function () {
      var r = orig.apply(this, arguments);
      setTimeout(pageview, 100);
      return r;
    };
  });
  on("popstate", w, () => setTimeout(pageview, 100));

  on("visibilitychange", d, () => {
    if (visible()) resume();
    else { pause(); ping("heartbeat"); }
  });
  on("pagehide", w, () => { pause(); ping("leave"); });
  setInterval(() => { if (visible()) ping("heartbeat"); }, 15e3);

  // Clics : un lien data-eva-event="nom" (data-eva-props='{"k":"v"}') envoie cet
  // événement ; avec data-liens sur la balise, téléphone, e-mail et liens sortants
  // sont comptés d'office. Phase de capture : un stopPropagation ne les masque pas.
  var bare = (h) => h.replace(/^www\./, "");
  on("click", d, (e) => {
    var a = e.target && e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    var n = a.getAttribute("data-eva-event"), p;
    if (n) {
      try { p = JSON.parse(a.getAttribute("data-eva-props")); } catch (x) {}
      return track(n, p);
    }
    if (attr("data-liens") == null) return;
    if (a.protocol == "tel:") track("clic_telephone");
    else if (a.protocol == "mailto:") track("clic_email");
    else if (/^https?:$/.test(a.protocol) && bare(a.hostname) != bare(location.hostname)) {
      track("clic_sortant", { domaine: bare(a.hostname) });
    }
  }, true);

  pageview();
  for (var i = 0; i < queued.length; i++) track(queued[i][0], queued[i][1]);
})(window, document);
