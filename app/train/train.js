/* T1: Martijn's NHL school. A password-locked training tab (soft lock, not security)
   with seven lessons, a visual quiz and a small Leitner box per question.
   - Deck: app/train/deck.js sets PUCK.TRAIN = { version, lessons, items } (owned by
     the content chat). When it's missing, app/train/deck-sample.js is loaded instead.
   - Routes (app/app.js): #t1 the lesson list (a tab), #t1-<lesson> a session of ~10,
     #t1-review the mistakes. Everything is saved per device under "puck.t1.".
   - Leitner: box 1 = got it wrong last time (back in the next session), box 2 = right
     once (back after 10 min), 3 = known (12 h), 4 = 3 days, 5 = 10 days. Right moves an
     item up one box when it was due, wrong drops it to box 1 and it also comes back once
     more at the end of the same session. A lesson's strength counts a known item (box 3+)
     as 1 and a box-2 item as 0.6; at 80% strength the next lesson opens. */
(function(){
const P = window.PUCK = window.PUCK || {};
const KEY = "puck.t1.", PASS = "beebzo", SIZE = 10, KNOWN = 3, HALF = .6, OPEN_AT = .8, RETRIES = 3;
const MIN = 6e4, HOUR = 60*MIN, DAY = 24*HOUR;
const WAIT = [0, 0, 10*MIN, 12*HOUR, 3*DAY, 10*DAY];
const MUG = id => "https://assets.nhle.com/mugs/nhl/latest/" + id + ".png";
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const shuffle = a => { for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random()*(i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const get = (k, d) => { try { const v = JSON.parse(localStorage.getItem(KEY + k)); return v == null ? d : v; } catch(e){ return d; } };
const put = (k, v) => { try { localStorage.setItem(KEY + k, JSON.stringify(v)); } catch(e){} };
const ab = k => '<i class="ab ' + k.toLowerCase() + '">' + k + "</i>";
const ABBR = /^[A-Z]{3}$/;
const teamName = t => (P.team ? P.team(t).name : t);
const initials = n => { const p = String(n || "").trim().split(/\s+/); return ((p[0] || "?")[0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase(); };
const today = () => new Date().toISOString().slice(0, 10);

/* ---------------- the deck ---------------- */
let deckP = null;
function loadDeck(){
  if(P.TRAIN && Array.isArray(P.TRAIN.items)) return Promise.resolve(P.TRAIN);
  if(!deckP) deckP = new Promise(res => {
    const s = document.createElement("script");
    s.src = "app/train/deck-sample.js";
    s.onload = () => res(P.TRAIN || null); s.onerror = () => res(null);
    document.head.appendChild(s);
  });
  return deckP;
}
const ORDER = ["teams", "divisions", "rules", "stars", "legends", "trophies", "lore"];
function shape(T){
  const lessons = (T.lessons || []).filter(l => l && l.id).slice()
    .sort((a, b) => (a.n || ORDER.indexOf(a.id) + 1 || 99) - (b.n || ORDER.indexOf(b.id) + 1 || 99));
  const by = {}; lessons.forEach(l => { by[l.id] = []; });
  const items = (T.items || []).filter(it => it && it.id && it.q && it.a != null && by[it.lesson]);
  items.forEach(it => by[it.lesson].push(it));
  return { lessons, by, items, sample: !!T.sample, version: T.version };
}

/* ---------------- memory ---------------- */
const boxes = () => get("box", {});
function stats(list, M){
  const now = Date.now();
  let known = 0, seen = 0, due = 0, wrong = 0, n = 0, ok = 0, pts = 0;
  list.forEach(it => {
    const r = M[it.id]; if(!r) return;
    seen++; n += r.n || 0; ok += r.ok || 0;
    if(r.b >= KNOWN) known++;
    pts += r.b >= KNOWN ? 1 : r.b === 2 ? HALF : 0;
    if(r.b === 1) wrong++;
    if((r.due || 0) <= now) due++;
  });
  return { total: list.length, known, seen, due, wrong, fresh: list.length - seen, acc: n ? Math.round(100*ok/n) : null, pct: list.length ? pts/list.length : 0 };
}
/* which lessons are open: the first, every one reached by 80%, and every one skipped to */
function openSet(D, M){
  const open = new Set(get("open", []));
  D.lessons.forEach((l, i) => {
    if(i === 0) open.add(l.id);
    else if(open.has(D.lessons[i - 1].id) && stats(D.by[D.lessons[i - 1].id], M).pct >= OPEN_AT) open.add(l.id);
  });
  put("open", [...open]);
  return open;
}
function grade(it, right){
  const M = boxes(), now = Date.now();
  const r = M[it.id] || { b: 0, n: 0, ok: 0 };
  const wasDue = !r.due || r.due <= now;
  r.n = (r.n || 0) + 1; if(right) r.ok = (r.ok || 0) + 1;
  if(right){ if(!r.b) r.b = 2; else if(wasDue) r.b = Math.min(5, r.b + 1); }
  else r.b = 1;
  r.due = now + WAIT[r.b]; r.last = now;
  M[it.id] = r; put("box", M);
  const d = get("days", {}); d[today()] = (d[today()] || 0) + 1;
  const keep = Object.keys(d).sort().slice(-60); put("days", Object.fromEntries(keep.map(k => [k, d[k]])));
}
/* ~10 questions: what's due first (lowest box first), then new ones in deck order,
   then extra practice (weakest, longest ago) so a session is never empty */
function build(list, M, review){
  const now = Date.now();
  if(review) return shuffle(list.filter(it => M[it.id] && M[it.id].b === 1)).slice(0, SIZE);
  const due = list.filter(it => M[it.id] && (M[it.id].due || 0) <= now).sort((a, b) => M[a.id].b - M[b.id].b || M[a.id].due - M[b.id].due);
  const fresh = list.filter(it => !M[it.id]);
  const pick = due.slice(0, Math.min(due.length, fresh.length ? 6 : SIZE));
  pick.push(...fresh.slice(0, SIZE - pick.length));
  if(pick.length < SIZE) pick.push(...due.slice(pick.length).filter(it => !pick.includes(it)).slice(0, SIZE - pick.length));
  if(pick.length < SIZE){
    const rest = list.filter(it => !pick.includes(it)).sort((a, b) => (M[a.id].b - M[b.id].b) || ((M[a.id].last || 0) - (M[b.id].last || 0)));
    pick.push(...rest.slice(0, SIZE - pick.length));
  }
  /* new ones keep their deck order relative to each other, the rest is mixed in */
  const news = pick.filter(it => !M[it.id]), olds = shuffle(pick.filter(it => M[it.id]));
  const out = [];
  while(news.length || olds.length){
    if(news.length && (!olds.length || Math.random() < news.length/(news.length + olds.length))) out.push(news.shift()); else out.push(olds.shift());
  }
  return out;
}

/* ---------------- visuals ---------------- */
function logoImg(t, cls){
  return '<img class="' + (cls || "lg") + '" src="app/assets/teams/' + t + '_dark.svg" alt="' + esc(teamName(t)) + '" onerror="this.onerror=null;this.src=\'app/assets/teams/' + t + '.svg\'">';
}
/* phase "q": the visual is the question (no names); "a": revealed with the answer */
function visual(img, phase){
  if(!img || typeof img !== "object") return "";
  const cap = s => phase === "a" && s ? "<figcaption>" + esc(s) + "</figcaption>" : "";
  if(img.face != null){
    const id = String(img.face).replace(/\D/g, ""); if(!id) return "";
    return '<figure class="t1-v t1-face"><span class="rim"><span class="in"><i class="ini">' + esc(initials(img.name)) + "</i>" +
      '<img src="' + MUG(id) + '" alt="' + (phase === "a" ? esc(img.name || "") : "Who is this?") + '" referrerpolicy="no-referrer" onerror="this.remove()"></span></span>' + cap(img.name) + "</figure>";
  }
  if(typeof img.logo === "string" && ABBR.test(img.logo))
    return '<figure class="t1-v t1-logo">' + logoImg(img.logo) + cap(teamName(img.logo)) + "</figure>";
  if(typeof img.kit === "string" && ABBR.test(img.kit) && P.kit && P.kit.jersey)
    return '<figure class="t1-v t1-kit"><div class="jw">' + P.kit.jersey(img.kit, phase === "a" ? { side: "front" } : { side: "back" }) + "</div>" + cap(teamName(img.kit)) + "</figure>";
  if(Array.isArray(img.logos)){
    const ts = img.logos.filter(t => typeof t === "string" && ABBR.test(t)).slice(0, 32); if(!ts.length) return "";
    return '<figure class="t1-v t1-logos' + (ts.length > 8 ? " many" : "") + '">' + ts.map(t => '<span class="tm">' + logoImg(t) + (phase === "a" ? "<small>" + t + "</small>" : "") + "</span>").join("") + "</figure>";
  }
  if(typeof img.diagram === "string" && DIAGRAMS[img.diagram])
    return '<figure class="t1-v t1-diag">' + DIAGRAMS[img.diagram]() + "</figure>";
  return "";
}

/* ---------------- the diagrams: a 200 ft x 85 ft rink at 1.95 px per ft ---------------- */
const RX = x => 5 + x*1.95, CY = 88;
const FONT = 'font-family="Michroma,Arial,sans-serif"', BOLD = 'font-family="\'Exo 2\',Arial,sans-serif" font-weight="900" font-style="italic"';
function rink(o = {}){
  const dots = [[RX(31), CY - 43], [RX(31), CY + 43], [RX(169), CY - 43], [RX(169), CY + 43], [RX(80), CY - 43], [RX(80), CY + 43], [RX(120), CY - 43], [RX(120), CY + 43]];
  const circ = ([x, y]) => '<circle cx="' + x + '" cy="' + y + '" r="29" fill="none" stroke="#d2232a" stroke-width="1.3"/>';
  return '<rect x="5" y="5" width="390" height="166" rx="54" fill="#eef5fb" stroke="#8aa3bd" stroke-width="3"/>' +
    '<g opacity=".95"><rect x="' + (RX(75) - 3) + '" y="5" width="6" height="166" fill="#2f6fd8"/><rect x="' + (RX(125) - 3) + '" y="5" width="6" height="166" fill="#2f6fd8"/>' +
    '<rect x="197" y="5" width="6" height="166" fill="#d2232a"/><rect x="197" y="5" width="6" height="166" fill="url(#t1dash)"/>' +
    '<line x1="' + RX(11) + '" y1="13" x2="' + RX(11) + '" y2="163" stroke="#d2232a" stroke-width="1.5"/><line x1="' + RX(189) + '" y1="13" x2="' + RX(189) + '" y2="163" stroke="#d2232a" stroke-width="1.5"/>' +
    '<path d="M' + RX(11) + " " + (CY - 12) + " A12 12 0 0 1 " + RX(11) + " " + (CY + 12) + 'Z" fill="#9cc6f0" stroke="#d2232a" stroke-width="1"/>' +
    '<path d="M' + RX(189) + " " + (CY - 12) + " A12 12 0 0 0 " + RX(189) + " " + (CY + 12) + 'Z" fill="#9cc6f0" stroke="#d2232a" stroke-width="1"/>' +
    '<rect x="' + (RX(11) - 8) + '" y="' + (CY - 6) + '" width="8" height="12" fill="none" stroke="#d2232a" stroke-width="1.6"/><rect x="' + RX(189) + '" y="' + (CY - 6) + '" width="8" height="12" fill="none" stroke="#d2232a" stroke-width="1.6"/>' +
    [dots[0], dots[1], dots[2], dots[3]].map(circ).join("") + '<circle cx="200" cy="' + CY + '" r="29" fill="none" stroke="#2f6fd8" stroke-width="1.3"/></g>' +
    (o.dots === false ? "" : dots.map(([x, y]) => '<circle cx="' + x + '" cy="' + y + '" r="3.2" fill="#d2232a"/>').join("") + '<circle cx="200" cy="' + CY + '" r="2.6" fill="#2f6fd8"/>');
}
const defs = '<defs><pattern id="t1dash" width="6" height="10" patternUnits="userSpaceOnUse"><rect y="6" width="6" height="4" fill="#fff" opacity=".85"/></pattern>' +
  '<marker id="t1arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#ffd36a"/></marker>' +
  '<marker id="t1arrk" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#0a1c38"/></marker></defs>';
const svg = (vb, body, label) => '<svg viewBox="' + vb + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + esc(label) + '">' + defs + body + "</svg>";
const tag = (x, y, t, c, anchor) => '<text x="' + x + '" y="' + y + '" ' + FONT + ' font-size="8.5" letter-spacing="1" fill="' + (c || "#9fc0e6") + '" text-anchor="' + (anchor || "middle") + '">' + t + "</text>";
const skater = (x, y, c, lbl) => '<circle cx="' + x + '" cy="' + y + '" r="8" fill="' + c + '" stroke="#fff" stroke-width="1.6"/>' + (lbl ? '<text x="' + x + '" y="' + (y + 3.4) + '" ' + BOLD + ' font-size="9.5" fill="#fff" text-anchor="middle">' + lbl + "</text>" : "");
const puck = (x, y) => '<ellipse cx="' + x + '" cy="' + y + '" rx="4.6" ry="3.2" fill="#0b0d10" stroke="#fff" stroke-width=".8"/>';
const DIAGRAMS = {
  rink: () => svg("0 -22 400 234", rink() +
    tag(RX(37), -8, "DEFENSIVE ZONE") + tag(200, -8, "NEUTRAL ZONE") + tag(RX(163), -8, "ATTACKING ZONE") +
    tag(8, 190, "GOAL LINE", "#ff8a8f", "start") + tag(RX(75), 190, "BLUE LINE", "#7fb2ff") + tag(200, 205, "RED LINE", "#ff8a8f") + tag(RX(125), 190, "BLUE LINE", "#7fb2ff") + tag(392, 190, "GOAL LINE", "#ff8a8f", "end"),
    "The rink: three zones split by two blue lines, the red centre line, the goal lines"),
  "faceoff-dots": () => svg("0 -6 400 196", rink() +
    [[RX(31), CY - 43], [RX(31), CY + 43], [RX(80), CY - 43], [RX(80), CY + 43], [200, CY], [RX(120), CY - 43], [RX(120), CY + 43], [RX(169), CY - 43], [RX(169), CY + 43]]
      .map(([x, y], i) => '<circle cx="' + x + '" cy="' + y + '" r="9" fill="#ffd36a" stroke="#0a1c38" stroke-width="1.5"/><text x="' + x + '" y="' + (y + 3.6) + '" ' + BOLD + ' font-size="10" fill="#1a0d00" text-anchor="middle">' + (i + 1) + "</text>").join("") +
    tag(200, 188, "9 FACEOFF DOTS · 5 CIRCLES"), "The nine faceoff dots"),
  offside: () => {
    const panel = (x0, off) => {
      const bl = x0 + 92;
      return '<rect x="' + x0 + '" y="20" width="184" height="120" rx="10" fill="#eef5fb" stroke="#8aa3bd" stroke-width="2"/>' +
        '<rect x="' + (bl + 4) + '" y="21" width="' + (x0 + 183 - bl - 4) + '" height="118" fill="rgba(255,211,106,.16)"/>' +
        '<rect x="' + (bl - 3) + '" y="20" width="6" height="120" fill="#2f6fd8"/>' +
        '<text x="' + (bl + 46) + '" y="36" ' + FONT + ' font-size="7.6" fill="#5a7391" text-anchor="middle">THEIR ZONE</text>' +
        (off ? skater(bl + 30, 70, "#d2232a", "A") + puck(bl - 26, 108) + '<path d="M' + (bl - 46) + ' 108 H' + (bl - 34) + '" stroke="#0a1c38" stroke-width="1.6" marker-end="url(#t1arrk)"/>' +
          '<path d="M' + (bl + 12) + ' 70 H' + (bl + 20) + '" stroke="#0a1c38" stroke-width="1.6" marker-end="url(#t1arrk)"/>'
          : puck(bl + 26, 108) + '<path d="M' + (bl - 10) + ' 108 H' + (bl + 16) + '" stroke="#0a1c38" stroke-width="1.6" stroke-dasharray="3 2" marker-end="url(#t1arrk)"/>' + skater(bl - 22, 70, "#d2232a", "A") +
          '<path d="M' + (bl - 40) + ' 70 H' + (bl - 32) + '" stroke="#0a1c38" stroke-width="1.6" marker-end="url(#t1arrk)"/>') +
        '<text x="' + (x0 + 92) + '" y="160" ' + BOLD + ' font-size="15" fill="' + (off ? "#ff7a7f" : "#46d17a") + '" text-anchor="middle">' + (off ? "OFFSIDE ✕" : "ONSIDE ✓") + "</text>" +
        '<text x="' + (x0 + 92) + '" y="176" ' + FONT + ' font-size="7.6" fill="#9fc0e6" text-anchor="middle">' + (off ? "SKATER BEFORE THE PUCK" : "PUCK FIRST, THEN SKATER") + "</text>";
    };
    return svg("0 10 400 176", panel(8, false) + panel(208, true), "Offside: the puck must cross the blue line into the zone before the attacker does");
  },
  icing: () => svg("0 -6 400 200", rink() +
    skater(RX(60), 120, "#2f6fd8", "") + '<path d="M' + (RX(60) + 8) + ' 116 Q 220 60 ' + (RX(196) - 2) + ' 52" fill="none" stroke="#ffd36a" stroke-width="3" stroke-dasharray="7 5" marker-end="url(#t1arr)"/>' +
    '<path d="M' + (RX(60) + 8) + ' 116 Q 220 60 ' + (RX(196) - 2) + ' 52" fill="none" stroke="#0a1c38" stroke-width="1" stroke-dasharray="7 5" opacity=".4"/>' +
    puck(RX(196), 52) + '<circle cx="' + RX(31) + '" cy="' + (CY + 43) + '" r="14" fill="none" stroke="#ffd36a" stroke-width="3"/>' +
    tag(8, 190, "FROM HIS OWN HALF", "#7fb2ff", "start") + tag(392, 190, "UNTOUCHED PAST THE LINE", "#ffd36a", "end") +
    tag(200, 2, "ICING · FACEOFF BACK IN HIS OWN END", "#e8f3ff"),
    "Icing: the puck is shot from behind the red line across the other team's goal line untouched; the faceoff comes back to the shooter's end"),
  powerplay: () => svg("0 -14 400 240", rink() +
    [[RX(132), CY - 48], [RX(132), CY + 48], [RX(172), CY - 62], [RX(172), CY + 62], [RX(156), CY]].map(([x, y]) => skater(x, y, "#d2232a", "")).join("") +
    [[RX(166), CY - 26], [RX(166), CY + 26], [RX(181), CY - 13], [RX(181), CY + 13]].map(([x, y]) => skater(x, y, "#2f6fd8", "")).join("") +
    '<rect x="150" y="182" width="100" height="34" rx="6" fill="#0a1c38" stroke="#ffd36a" stroke-width="1.5"/>' + skater(172, 199, "#2f6fd8", "") +
    '<text x="214" y="204" ' + BOLD + ' font-size="15" fill="#ffd36a" text-anchor="middle">2:00</text>' +
    tag(200, 0, "POWER PLAY · 5 RED ON 4 BLUE", "#e8f3ff") + tag(100, 203, "PENALTY BOX", "#ffd36a"),
    "Power play: five skaters against four while a player sits two minutes in the penalty box"),
  playoffs: () => {
    let s = "";
    const col = (x, n, w, h, top, gap, c) => { for(let i = 0; i < n; i++) s += '<rect x="' + x + '" y="' + (top + i*(h + gap)) + '" width="' + w + '" height="' + h + '" rx="3" fill="' + c + '"/>'; };
    col(8, 4, 58, 22, 30, 12, "#1b4787"); col(80, 2, 58, 22, 47, 46, "#245aa6"); col(152, 1, 40, 22, 81, 0, "#3d7fd0");
    col(334, 4, 58, 22, 30, 12, "#1b4787"); col(262, 2, 58, 22, 47, 46, "#245aa6"); col(208, 1, 40, 22, 81, 0, "#3d7fd0");
    s += '<path d="M192 92 H208" stroke="#ffd36a" stroke-width="2"/>';
    s += '<path d="M138 58 H145 V126 H138 M145 92 H152 M262 58 H255 V126 H262 M255 92 H248" fill="none" stroke="#5f86b8" stroke-width="1"/>';
    s += '<path d="M66 41 H73 V75 H66 M73 58 H80 M66 109 H73 V143 H66 M73 126 H80 M334 41 H327 V75 H334 M327 58 H320 M334 109 H327 V143 H334 M327 126 H320" fill="none" stroke="#5f86b8" stroke-width="1"/>';
    s += '<g transform="translate(200 126)"><path d="M-11 -18 H11 L8 -6 Q0 0 -8 -6Z M-4 -3 H4 V6 H-4Z M-11 6 H11 V12 H-11Z" fill="url(#t1gold)"/></g>';
    s += '<text x="200" y="76" ' + BOLD + ' font-size="10" fill="#ffd36a" text-anchor="middle">FINAL</text>';
    s += tag(37, 22, "ROUND 1") + tag(109, 22, "ROUND 2") + tag(172, 22, "CONF") + tag(228, 22, "CONF") + tag(291, 22, "ROUND 2") + tag(363, 22, "ROUND 1");
    s += '<text x="100" y="8" ' + BOLD + ' font-size="11" fill="#e8f3ff" text-anchor="middle">WEST · 8 TEAMS</text><text x="300" y="8" ' + BOLD + ' font-size="11" fill="#e8f3ff" text-anchor="middle">EAST · 8 TEAMS</text>';
    s += tag(200, 172, "16 TEAMS · 4 ROUNDS · EVERY SERIES BEST OF 7", "#ffd36a");
    return svg("0 -6 400 186", '<defs><linearGradient id="t1gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".5" stop-color="#d9a514"/><stop offset="1" stop-color="#8a6512"/></linearGradient></defs>' + s,
      "The playoffs: 16 teams, 8 per conference, four rounds of best-of-seven series, the two conference champions meet in the Stanley Cup Final");
  }
};

/* ---------------- screens ---------------- */
const unlocked = () => get("unlocked", false) === true;
const UC = '<span class="t1-uc">UNDER CONSTRUCTION</span>';
const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3h1.5A1.5 1.5 0 0 1 20 11.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 20.5v-9A1.5 1.5 0 0 1 5.5 10Zm2 0h6V7a3 3 0 0 0-6 0Z" fill="currentColor"/></svg>';

function gate(app, then){
  app.innerHTML = '<div class="t1 t1-gatepage"><div class="t1-gate"><div class="fi">' + UC + '<div class="lk">' + LOCK + "</div>" +
    '<h2>T1 <span>Training</span></h2><p>Martijn\'s NHL school: the teams, the rules, the stars and the stories. Locked while it\'s being built.</p>' +
    '<form id="t1pw" autocomplete="off"><input id="t1pi" type="password" placeholder="Password" aria-label="Password" enterkeyhint="go" autocapitalize="off" spellcheck="false">' +
    '<button type="submit">' + ab("A") + "UNLOCK</button></form><p class=\"msg\" id=\"t1msg\" role=\"status\"></p></div></div></div>";
  const f = app.querySelector("#t1pw"), i = app.querySelector("#t1pi"), m = app.querySelector("#t1msg");
  f.addEventListener("submit", e => {
    e.preventDefault();
    if(i.value.trim().toLowerCase() === PASS){ put("unlocked", true); then(); return; }
    m.textContent = i.value.trim() ? "Not that one. Try again." : "Type the password first.";
    f.classList.remove("no"); void f.offsetWidth; f.classList.add("no"); i.select();
  });
}

async function render(arg){
  const U = P.ui, app = U.app;
  if(!unlocked()) return gate(app, () => render(arg));
  app.innerHTML = '<div class="t1"><p class="t1-wait">Loading the lessons…</p></div>';
  const T = await loadDeck();
  if(!T){ app.innerHTML = '<div class="t1"><p class="t1-wait">No deck yet: app/train/deck.js is missing.</p></div>'; return; }
  const D = shape(T);
  if(!arg) return list(app, D);
  if(arg === "review") return session(app, D, null);
  const L = D.lessons.find(l => l.id === arg);
  if(!L){ location.hash = "#t1"; return; }
  return session(app, D, L);
}

function bar(st, mark){
  const k = Math.round(st.pct*100), s = st.total ? Math.round(100*st.seen/st.total) : 0; /* blue: seen, ember: strength */
  return '<div class="t1-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + k + '"><i class="seen" style="width:' + s + '%"></i><i class="known" style="width:' + k + '%"></i>' + (mark ? '<em style="left:' + OPEN_AT*100 + '%"></em>' : "") + "</div>";
}

function list(app, D){
  const M = boxes(), open = openSet(D, M), all = stats(D.items, M);
  const days = get("days", {}), td = days[today()] || 0;
  const mist = D.items.filter(it => M[it.id] && M[it.id].b === 1).length;
  app.innerHTML = '<div class="t1">' +
    '<div class="t1-head"><div><small>T1 · TRAINING</small><h2>Learn the NHL</h2></div>' + UC + "</div>" +
    '<div class="t1-all"><div class="nums"><b>' + Math.round(all.pct*100) + "%</b><span>strength · " + all.known + " of " + all.total + " known</span>" + (td ? '<span class="td">' + td + " today</span>" : "") + "</div>" + bar(all) + "</div>" +
    '<div class="t1-acts"><a class="t1-rev' + (mist ? "" : " off") + '" href="' + (mist ? "#t1-review" : "#t1") + '" id="t1rev"' + (mist ? "" : ' aria-disabled="true"') + ">REVIEW MISTAKES <b>" + mist + "</b></a></div>" +
    '<div class="t1-lessons">' + D.lessons.map((l, i) => {
      const st = stats(D.by[l.id], M), isOpen = open.has(l.id), done = st.total && st.pct >= 1;
      const meta = !st.total ? "Questions coming soon" : !st.seen ? st.total + (st.total === 1 ? " question" : " questions") + " · not started" :
        "Strength " + Math.round(st.pct*100) + "% · " + st.known + "/" + st.total + " known" + (st.due ? " · " + st.due + " due" : "") + (st.fresh ? " · " + st.fresh + " new" : "") + (st.acc != null ? " · " + st.acc + "% right" : "");
      return '<div class="t1-les' + (isOpen ? "" : " locked") + (done ? " done" : "") + '" data-id="' + esc(l.id) + '">' +
        '<a class="in" href="' + (isOpen && st.total ? "#t1-" + esc(l.id) : "#t1") + '" data-go>' +
          '<span class="no">' + (l.n || i + 1) + "</span>" +
          '<span class="tx"><b>' + esc(l.title) + "</b>" + (l.blurb ? "<small>" + esc(l.blurb) + "</small>" : "") + bar(st, true) + '<span class="st">' + esc(meta) + "</span></span>" +
          '<span class="go">' + (isOpen ? (done ? "✓" : "►") : LOCK) + "</span></a>" +
        (isOpen ? "" : '<button type="button" class="skip" data-skip>' + (i > 0 ? "Reach " + OPEN_AT*100 + "% in lesson " + (D.lessons[i - 1].n || i) + " · " : "") + "<u>skip ahead</u></button>") + "</div>";
    }).join("") + "</div>" +
    '<p class="t1-foot">' + (D.sample ? "Sample deck: the real lessons are on their way. " : "") + "Wrong answers come back in the next session; right ones wait longer each time (10 minutes, half a day, 3 days, 10 days). Two right in a row and it's known. At 80% strength the next lesson opens.</p></div>";

  const rev = app.querySelector("#t1rev");
  rev.addEventListener("click", e => { if(rev.classList.contains("off")){ e.preventDefault(); nudge(rev); } });
  app.querySelectorAll(".t1-les").forEach(card => {
    const id = card.dataset.id, go = card.querySelector("[data-go]");
    const skip = () => { const o = new Set(get("open", [])); o.add(id); put("open", [...o]); list(app, D); const c = app.querySelector('.t1-les[data-id="' + id + '"]'); if(c){ c.classList.add("pop"); } };
    let t = 0, long = false;
    go.addEventListener("click", e => {
      if(long){ e.preventDefault(); long = false; return; }
      if(card.classList.contains("locked")){ e.preventDefault(); nudge(card); }
      else if(!(D.by[id] || []).length){ e.preventDefault(); nudge(card); }
    });
    if(card.classList.contains("locked")){
      card.querySelector("[data-skip]").addEventListener("click", skip);
      /* hold a locked lesson for 0.7 s to open it too */
      go.addEventListener("pointerdown", () => { clearTimeout(t); t = setTimeout(() => { long = true; skip(); }, 700); });
      ["pointerup", "pointerleave", "pointercancel"].forEach(ev => go.addEventListener(ev, () => clearTimeout(t)));
      go.addEventListener("contextmenu", e => e.preventDefault());
    }
  });
}
function nudge(el){ el.classList.remove("nudge"); void el.offsetWidth; el.classList.add("nudge"); }

/* ---------------- a session ---------------- */
function session(app, D, L){
  const U = P.ui, review = !L;
  const pool = review ? D.items : D.by[L.id];
  const M0 = boxes(), before = L ? stats(pool, M0) : null, openBefore = openSet(D, M0);
  const queue = build(pool, M0, review);
  if(!queue.length){ location.hash = "#t1"; return; }
  const log = []; let i = 0, retries = 0, streak = 0;
  const title = L ? L.title : "Your mistakes", kick = L ? "LESSON " + (L.n || D.lessons.indexOf(L) + 1) : "REVIEW";
  app.innerHTML = '<div class="t1 t1-play"><div class="t1-top"><a class="back" href="#t1" aria-label="Back to the lessons">' + ab("B") + '</a><div class="ttl"><small>T1 · ' + esc(kick) + "</small><b>" + esc(title) + '</b></div><span class="cnt" id="t1cnt"></span></div>' +
    '<div class="t1-prog" id="t1prog"></div><div id="t1stage"></div></div>';
  const stage = app.querySelector("#t1stage"), prog = app.querySelector("#t1prog"), cnt = app.querySelector("#t1cnt");
  let state = null;
  const paintProg = () => {
    prog.innerHTML = queue.map((_, k) => '<i class="' + (k < log.length ? (log[k].right ? "ok" : "no") : k === i ? "now" : "") + '"></i>').join("");
    cnt.textContent = Math.min(i + 1, queue.length) + "/" + queue.length;
  };
  function ask(){
    const it = queue[i], again = queue.indexOf(it) < i;
    const opts = shuffle([...new Set([String(it.a), ...(it.o || []).map(String)])].filter(s => s.trim()));
    const short = opts.every(s => s.length <= 16);
    const before = (it.show || "after") === "before";
    state = { it, again, opts, done: false, before };
    stage.innerHTML = '<div class="t1-q' + (before ? " vis" : "") + '" data-id="' + esc(it.id) + '">' +
      (again ? '<span class="again">AGAIN</span>' : "") +
      (before ? '<div class="t1-vq" id="t1vq">' + visual(it.img, "q") + "</div>" : "") +
      '<p class="qq">' + esc(it.q) + "</p>" +
      '<div class="t1-opts' + (short && opts.length === 4 ? " grid" : "") + '">' + opts.map((o, k) => '<button type="button" data-k="' + k + '"><i>' + (k + 1) + "</i><span>" + esc(o) + "</span></button>").join("") + "</div>" +
      '<div class="t1-ex" id="t1ex" hidden></div></div>';
    stage.querySelectorAll(".t1-opts button").forEach(b => b.addEventListener("click", () => answer(+b.dataset.k)));
    paintProg();
  }
  function answer(k){
    if(!state || state.done) return;
    const { it, opts, again, before } = state; state.done = true;
    const right = opts[k] === String(it.a);
    if(!again) grade(it, right);
    log.push({ it, right, again });
    streak = right ? streak + 1 : 0;
    if(!right && !again && retries < RETRIES){ queue.push(it); retries++; }
    if(!right && navigator.vibrate) try { navigator.vibrate(25); } catch(e){}
    stage.querySelectorAll(".t1-opts button").forEach((b, j) => {
      b.disabled = true;
      if(opts[j] === String(it.a)) b.classList.add("right");
      else if(j === k) b.classList.add("wrong");
      else b.classList.add("gone");
    });
    stage.querySelector(".t1-q").classList.add(right ? "is-ok" : "is-no");
    if(before){ const vq = stage.querySelector("#t1vq"); if(vq && it.img && (it.img.kit || it.img.logo || it.img.logos || it.img.face != null)) vq.innerHTML = visual(it.img, "a"); }
    const ex = stage.querySelector("#t1ex");
    const vis = before ? "" : visual(it.img, "a");
    ex.innerHTML = '<div class="vd ' + (right ? "ok" : "no") + '"><b>' + (right ? (streak >= 3 ? streak + " IN A ROW" : "RIGHT") : "NOT QUITE") + "</b>" + (right ? "" : "<span>It's <em>" + esc(it.a) + "</em></span>") + "</div>" +
      (vis ? '<div class="t1-va">' + vis + "</div>" : "") + (it.why ? '<p class="why">' + esc(it.why) + "</p>" : "") +
      '<button type="button" class="next" id="t1next">' + ab("A") + (i + 1 < queue.length ? "NEXT" : "FINISH") + "</button>";
    ex.hidden = false;
    paintProg();
    const nx = ex.querySelector("#t1next");
    nx.addEventListener("click", next);
    requestAnimationFrame(() => {
      const r = nx.getBoundingClientRect();
      if(r.bottom > innerHeight - 8) nx.scrollIntoView({ block: "end", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      try { nx.focus({ preventScroll: true }); } catch(e){}
    });
  }
  function next(){
    if(!state || !state.done) return;
    i++;
    if(i >= queue.length) return finish();
    window.scrollTo(0, 0); ask();
  }
  function finish(){
    state = null;
    const M = boxes(), firsts = log.filter(x => !x.again), got = firsts.filter(x => x.right).length;
    let unlockedNew = null;
    if(L){
      const open = openSet(D, M);
      unlockedNew = D.lessons.find(l => open.has(l.id) && !openBefore.has(l.id)) || null;
    }
    const after = L ? stats(pool, M) : null;
    const left = D.items.filter(it => M[it.id] && M[it.id].b === 1).length;
    prog.innerHTML = log.map(x => '<i class="' + (x.right ? "ok" : "no") + '"></i>').join("");
    cnt.textContent = "";
    stage.innerHTML = '<div class="t1-end">' +
      '<div class="sc"><b>' + got + "</b><span>/ " + firsts.length + "</span></div>" +
      '<p class="lab">' + (got === firsts.length ? "Clean sheet." : got >= firsts.length*.7 ? "Good session." : "Every miss comes back soon. That's how it sticks.") + "</p>" +
      (L ? '<div class="t1-delta"><span>Lesson strength</span><b>' + Math.round(before.pct*100) + "% → " + Math.round(after.pct*100) + "% <small>· " + after.known + " of " + after.total + " known</small></b>" + bar(after, true) + "</div>" : "") +
      (unlockedNew ? '<div class="t1-unl">' + ab("Y") + "<span><b>Unlocked:</b> " + esc(unlockedNew.title) + "</span></div>" : "") +
      '<ul class="t1-recap">' + log.map(x => '<li class="' + (x.right ? "ok" : "no") + '"><i>' + (x.right ? "✓" : "✕") + "</i><span>" + esc(x.it.q) + "<small>" + esc(x.it.a) + "</small></span></li>").join("") + "</ul>" +
      '<div class="t1-btns"><button type="button" class="next" id="t1again">' + ab("A") + (L ? "NEXT 10" : left ? "REVIEW AGAIN" : "LESSONS") + '</button><a class="t1-ghost" href="#t1">' + ab("B") + "LESSONS</a></div></div>";
    const again = stage.querySelector("#t1again");
    again.addEventListener("click", () => { if(!L && !left) location.hash = "#t1"; else { window.scrollTo(0, 0); session(app, D, L); } });
    window.scrollTo(0, 0);
    state = { end: true };
  }
  /* keys: 1–4 answer, Enter/Space next, Esc back to the lessons (before PUCK 26's own keys) */
  const onKey = e => {
    const t = e.target; if(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    if(!document.body.contains(stage)) return;
    const k = e.key;
    if(k === "Escape"){ e.preventDefault(); e.stopPropagation(); location.hash = "#t1"; return; }
    if(k === "q" || k === "e" || k === "Q" || k === "E"){ e.stopPropagation(); return; }
    if(state && state.end && k === "Enter"){ e.preventDefault(); e.stopPropagation(); stage.querySelector("#t1again").click(); return; }
    if(!state || state.end) return;
    if(!state.done && /^[1-9]$/.test(k) && +k <= state.opts.length){ e.preventDefault(); e.stopPropagation(); answer(+k - 1); }
    else if(state.done && (k === "Enter" || k === " ")){ e.preventDefault(); e.stopPropagation(); next(); }
  };
  window.addEventListener("keydown", onKey, true);
  U.onLeave(() => window.removeEventListener("keydown", onKey, true));
  ask();
}

P.train = { render, DIAGRAMS, visual, build, stats, KEY };
})();
