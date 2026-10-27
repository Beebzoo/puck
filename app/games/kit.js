/* The kit for the plug-in games: detailed SVG sweaters for all 32 teams,
   name matching, the player setup, the jumbotron scoreboard, a shot clock,
   particles (ice spray, confetti), hat-trick hats and the Three Stars screen.
   Exposed as PUCK.kit. Nothing here touches app.js; PUCK.ui is read lazily
   because app.js sets it after the games load. */
(function(){
const P = window.PUCK = window.PUCK || {};
const RM = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shuffle = a => { for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random()*(i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const store = {
  get(k, d){ try { const v = JSON.parse(localStorage.getItem("puck.g." + k)); return v == null ? d : v; } catch(e){ return d; } },
  set(k, v){ try { localStorage.setItem("puck.g." + k, JSON.stringify(v)); } catch(e){} }
};

/* the three of us on one phone: goal-light red, royal blue, kickplate gold */
const PC = [
  { c: "#E3343B", d: "#7E1015", t: "#fff" },
  { c: "#2F73E0", d: "#0F3576", t: "#fff" },
  { c: "#F2C230", d: "#6E5208", t: "#2a2105" }
];

/* ---------------- sweaters ----------------
   b body, s sleeve stripes [colour, height] from the cuff up, h hem stripes
   (default s), y yoke, yt yoke trim, ch chest band, c collar, n number,
   o number outline, t name colour (default n). Home sweaters, as close as
   flat colour gets. */
const K = "#111111", W = "#ffffff";
const J = {
  ANA: { b: "#F95602", s: [[K, 7], [W, 3], [K, 7]], c: K, n: K, o: W },
  BOS: { b: "#16171a", y: "#FFB81C", yt: W, s: [[W, 3], ["#FFB81C", 10], [W, 3]], c: "#FFB81C", n: "#FFB81C", o: W },
  BUF: { b: "#003087", s: [["#FFB81C", 4], [W, 9], ["#FFB81C", 4]], c: "#FFB81C", n: W, o: "#FFB81C" },
  CAR: { b: "#CE1126", s: [[K, 9], [W, 3], [K, 4]], c: K, n: W, o: K },
  CBJ: { b: "#002654", s: [["#CE1126", 9], [W, 3], ["#CE1126", 4]], c: "#CE1126", n: W, o: "#CE1126" },
  CGY: { b: "#D2001C", s: [[W, 4], ["#FAAF19", 9], [W, 4]], c: "#FAAF19", n: W, o: "#FAAF19" },
  CHI: { b: "#CF0A2C", s: [[K, 7], [W, 7], [K, 7]], c: W, n: K, o: W },
  COL: { b: "#6F263D", s: [["#236192", 9], [W, 3], ["#A2AAAD", 4]], c: "#236192", n: W, o: "#236192" },
  DAL: { b: "#006847", s: [[K, 7], [W, 3], [K, 7]], c: K, n: W, o: K },
  DET: { b: "#CE1126", s: [[W, 20]], h: [[W, 12]], c: W, n: W, o: "#a50e1f" },
  EDM: { b: "#0B3C91", s: [["#FF4C00", 11], [W, 3], ["#FF4C00", 4]], c: "#FF4C00", n: W, o: "#FF4C00" },
  FLA: { b: "#C8102E", s: [["#041E42", 9], ["#B9975B", 3], ["#041E42", 4]], c: "#041E42", n: W, o: "#041E42" },
  LAK: { b: "#141414", s: [["#A2AAAD", 7], [W, 3], ["#A2AAAD", 7]], c: "#A2AAAD", n: W, o: "#A2AAAD" },
  MIN: { b: "#154734", s: [["#DDCBA4", 4], ["#A6192E", 9], ["#DDCBA4", 4]], c: "#A6192E", n: "#DDCBA4", o: "#A6192E" },
  MTL: { b: "#AF1E2D", ch: [[W, 4], ["#192168", 30], [W, 4]], s: [[W, 4], ["#192168", 11], [W, 4]], h: [["#192168", 9], [W, 4], ["#192168", 9]], c: "#192168", n: W, o: "#192168" },
  NJD: { b: "#CE1126", s: [[K, 11], [W, 3], [K, 4]], c: K, n: W, o: K },
  NSH: { b: "#FFB81C", s: [["#041E42", 9], [W, 3], ["#041E42", 4]], c: "#041E42", n: "#041E42", o: W },
  NYI: { b: "#00539B", s: [[W, 4], ["#F47D30", 9], [W, 4]], c: "#F47D30", n: "#F47D30", o: W },
  NYR: { b: "#0038A8", s: [["#CE1126", 4], [W, 9], ["#CE1126", 4]], c: "#CE1126", n: "#CE1126", o: W },
  OTT: { b: "#151515", s: [["#C52032", 7], [W, 3], ["#C52032", 7]], c: "#C52032", n: W, o: "#C52032" },
  PHI: { b: "#F74902", s: [[W, 4], [K, 11], [W, 4]], c: K, n: K, o: W },
  PIT: { b: "#141414", s: [["#FCB514", 10], [W, 3], ["#FCB514", 4]], c: "#FCB514", n: "#FCB514", o: W },
  SEA: { b: "#001628", s: [["#99D9D9", 9], ["#355464", 3], ["#E9072B", 2]], c: "#99D9D9", n: "#99D9D9", o: "#355464" },
  SJS: { b: "#006D75", s: [[K, 7], [W, 3], ["#E57200", 3]], c: K, n: W, o: K },
  STL: { b: "#002F87", s: [["#041E42", 6], ["#FCB514", 4], ["#041E42", 6]], c: "#FCB514", n: W, o: "#FCB514" },
  TBL: { b: "#002868", s: [[W, 7], ["#002868", 3], [W, 7]], c: W, n: W, o: "#001a45" },
  TOR: { b: "#00205B", s: [[W, 5], ["#00205B", 4], [W, 5]], c: W, n: W, o: "#00163f" },
  UTA: { b: "#0d0d0d", s: [["#71AFE5", 9], [W, 3]], c: "#71AFE5", n: W, o: "#71AFE5" },
  VAN: { b: "#00205B", s: [["#00843D", 9], [W, 3], ["#00843D", 4]], c: "#00843D", n: W, o: "#00843D" },
  VGK: { b: "#333F42", s: [["#B4975A", 9], ["#C8102E", 3], ["#B4975A", 4]], c: "#B4975A", n: "#B4975A", o: W },
  WPG: { b: "#041E42", s: [["#A2AAAD", 4], ["#AC162C", 9], ["#A2AAAD", 4]], c: "#AC162C", n: W, o: "#AC162C" },
  WSH: { b: "#C8102E", s: [["#041E42", 9], [W, 3], ["#041E42", 4]], c: "#041E42", n: W, o: "#041E42" }
};
const design = abbr => J[abbr] || { b: "#16283f", s: [["#F2C230", 8], [W, 3]], c: "#F2C230", n: W, o: "#F2C230" };
const lum = hex => { const h = hex.replace("#", ""); const [r, g, b] = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)/255); return .2126*r + .7152*g + .0722*b; };

let uid = 0;
/* the sweater, flat-laid with the arms down at an angle. viewBox 240 x 250.
   o: { side: "back"|"front", name, number, hanger, letter, ghost } */
const BODY = "M97 19 Q120 31 143 19 L180 27 Q203 33 215 57 L237 119 L205 135 L177 88 L178 233 Q120 242 62 233 L63 88 L35 135 L3 119 L25 57 Q37 33 60 27 Z";
const NECK_BACK = "M97 19 Q120 31 143 19";
function sleeveStripes(d, side){
  /* in the sleeve's own frame: the cuff runs along x, the arm goes up -y */
  let y = -14, out = "";
  for(const [c, h] of d.s){ out += '<rect x="-40" y="' + (y - h) + '" width="80" height="' + h + '" fill="' + c + '"/>'; y -= h; }
  const num = side === "back" && d._num != null ? '<text x="0" y="-60" text-anchor="middle" font-size="17" class="jn" fill="' + d.n + '" stroke="' + d.o + '" stroke-width="2.2" paint-order="stroke">' + esc(d._num) + "</text>" : "";
  return out + num;
}
function jersey(abbr, o = {}){
  const d = Object.assign({}, design(abbr)), id = "jx" + (uid++), side = o.side || "back";
  d._num = o.number != null && o.number !== "" ? String(o.number) : null;
  const hem = d.h || d.s;
  let hemSvg = "", y = 202;
  for(const [c, h] of hem){ hemSvg += '<rect x="0" y="' + y + '" width="240" height="' + h + '" fill="' + c + '"/>'; y += h; }
  let chest = "";
  if(d.ch){ let cy = 104; for(const [c, h] of d.ch){ chest += '<rect x="0" y="' + cy + '" width="240" height="' + h + '" fill="' + c + '"/>'; cy += h; } }
  const yoke = d.y ? '<path d="M0 0H240V60 L178 70 Q120 84 62 70 L0 60Z" fill="' + d.y + '"/>' + (d.yt ? '<path d="M0 60 L62 70 Q120 84 178 70 L240 60" fill="none" stroke="' + d.yt + '" stroke-width="3"/>' : "") : "";
  const dark = lum(d.b) < .35;
  const sl = sleeveStripes(d, side);
  const sleeves = '<g transform="translate(19 127) rotate(26.6)">' + sl + '</g><g transform="translate(221 127) rotate(-26.6)">' + sl + "</g>";
  let face = "";
  if(side === "front"){
    face = '<path d="M97 19 L120 50 L143 19 Q120 29 97 19Z" fill="' + d.c + '"/><path d="M104 22 L120 44 L136 22" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.2"/>' +
      '<image href="' + P.logo(abbr, dark) + '" x="74" y="64" width="92" height="92" preserveAspectRatio="xMidYMid meet"/>';
    if(o.letter) face += '<text x="166" y="78" font-size="22" class="jn" fill="' + d.n + '" stroke="' + d.o + '" stroke-width="2" paint-order="stroke" text-anchor="middle">' + esc(o.letter) + "</text>";
  } else {
    const name = String(o.name || "").toUpperCase();
    const fs = name.length > 13 ? 12 : name.length > 10 ? 14.5 : name.length > 7 ? 17 : 19;
    const num = d._num || "";
    const nfs = num.length > 2 ? 66 : 92;
    face = '<path d="' + NECK_BACK + '" fill="none" stroke="' + d.c + '" stroke-width="7" stroke-linecap="round"/>' +
      '<path id="' + id + 'arc" d="M58 70 Q120 52 182 70" fill="none"/>' +
      (name ? '<text font-size="' + fs + '" class="jt" fill="' + (d.t || d.n) + '" text-anchor="middle" letter-spacing="1.6"><textPath href="#' + id + 'arc" startOffset="50%">' + esc(name) + "</textPath></text>" : "") +
      (num ? '<text x="120" y="' + (nfs > 70 ? 168 : 158) + '" font-size="' + nfs + '" class="jn" text-anchor="middle" fill="rgba(0,0,0,.28)" transform="translate(2.5 3)">' + esc(num) + "</text>" +
        '<text x="120" y="' + (nfs > 70 ? 168 : 158) + '" font-size="' + nfs + '" class="jn" text-anchor="middle" fill="' + d.n + '" stroke="' + d.o + '" stroke-width="5.5" paint-order="stroke" stroke-linejoin="round">' + esc(num) + "</text>" : "");
  }
  const hanger = o.hanger ? '<g class="jhang"><path d="M120 -18 q0 -10 8 -10 q8 0 8 8 q0 6 -8 10 L120 2" fill="none" stroke="#b9c3cc" stroke-width="3" stroke-linecap="round"/>' +
    '<path d="M40 30 Q120 -6 200 30 L196 36 Q120 4 44 36Z" fill="#8a5a2b"/><path d="M44 31 Q120 -1 196 31" fill="none" stroke="#c48a4f" stroke-width="1.5"/></g>' : "";
  return '<svg class="jersey' + (o.ghost ? " ghost" : "") + '" viewBox="0 ' + (o.hanger ? -30 : 0) + " 240 " + (o.hanger ? 280 : 250) + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
    "<defs>" +
      '<clipPath id="' + id + 'c"><path d="' + BODY + '"/></clipPath>' +
      '<linearGradient id="' + id + 'h" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".42"/><stop offset=".2" stop-color="#000" stop-opacity=".08"/><stop offset=".5" stop-color="#fff" stop-opacity=".07"/><stop offset=".8" stop-color="#000" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".42"/></linearGradient>' +
      '<linearGradient id="' + id + 'v" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".35" stop-color="#fff" stop-opacity="0"/><stop offset=".85" stop-color="#000" stop-opacity=".08"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>' +
      '<pattern id="' + id + 'm" width="3" height="3" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r=".55" fill="#000" opacity=".18"/></pattern>' +
      '<filter id="' + id + 'f" x="-10%" y="-10%" width="120%" height="125%"><feDropShadow dx="0" dy="5" stdDeviation="5" flood-color="#000" flood-opacity=".45"/></filter>' +
    "</defs>" + hanger +
    '<g filter="url(#' + id + 'f)"><path d="' + BODY + '" fill="' + d.b + '"/></g>' +
    '<g clip-path="url(#' + id + 'c)">' + yoke + chest + sleeves + hemSvg + face +
      '<rect x="0" y="0" width="240" height="250" fill="url(#' + id + 'm)"/>' +
      '<rect x="0" y="0" width="240" height="250" fill="url(#' + id + 'h)"/><rect x="0" y="0" width="240" height="250" fill="url(#' + id + 'v)"/>' +
      /* folds: under the arms, at the hem, across the back */
      '<path d="M66 92 Q80 130 72 180 M174 92 Q160 130 168 180" fill="none" stroke="#000" stroke-opacity=".14" stroke-width="7" stroke-linecap="round"/>' +
      '<path d="M70 96 Q84 132 77 178 M170 96 Q156 132 163 178" fill="none" stroke="#fff" stroke-opacity=".08" stroke-width="3" stroke-linecap="round"/>' +
      '<path d="M30 70 Q44 90 40 118 M210 70 Q196 90 200 118" fill="none" stroke="#000" stroke-opacity=".12" stroke-width="6" stroke-linecap="round"/>' +
      '<path d="M90 226 Q100 210 96 190 M150 226 Q140 210 144 190" fill="none" stroke="#000" stroke-opacity=".1" stroke-width="5" stroke-linecap="round"/>' +
      /* stitching: shoulder seams, the side seams, the cuffs, the hem */
      '<path d="M60 27 Q70 50 63 88 M180 27 Q170 50 177 88 M5 116 L35 131 M235 116 L205 131 M64 228 Q120 237 176 228" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="1" stroke-dasharray="2.2 2.4"/>' +
    "</g>" +
    '<path d="' + BODY + '" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="1.6"/></svg>';
}


/* ---------------- a locker stall: wood, a nameplate, a hook, a light ----------------
   o: { team, plate (html), body (html), cls } */
function stall(o){
  return '<div class="gx-stall ' + (o.cls || "") + '"' + (o.team ? ' style="--tc:' + P.team(o.team).c1 + ";--tc2:" + P.team(o.team).c2 + '"' : "") + ">" +
    '<div class="plate">' + (o.team ? '<img src="' + P.logo(o.team, false) + '" alt="">' : "") + '<span class="pt">' + (o.plate || "") + "</span></div>" +
    '<div class="back"><i class="hook"></i><div class="lamp"></div>' + (o.body || "") + '</div><div class="bench"></div></div>';
}
/* a sweater that can turn round on its hanger: back face and front face */
function turnable(abbr, o = {}){
  return '<div class="gx-turn"><div class="f back">' + jersey(abbr, Object.assign({ side: "back", hanger: true }, o)) + '</div><div class="f front">' + jersey(abbr, { side: "front", hanger: true }) + "</div></div>";
}

/* ---------------- names ---------------- */
const norm = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/ø/g, "o").replace(/æ/g, "ae").replace(/ß/g, "ss").replace(/[.'’`\-]/g, " ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
function lev(a, b){
  if(a === b) return 0; const m = a.length, n = b.length; if(!m || !n) return m || n;
  let prev = Array.from({ length: n + 1 }, (_, j) => j), cur = new Array(n + 1);
  for(let i = 1; i <= m; i++){ cur[0] = i; for(let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); [prev, cur] = [cur, prev]; }
  return prev[n];
}
/* the keys an answer is known by: full name, surname, aliases, team names */
function keys(it){
  const k = new Set(), add = s => { const v = norm(s); if(v) k.add(v); };
  add(it.name);
  const parts = norm(it.name).split(" ");
  if(parts.length > 1) add(parts.slice(1).join(" "));
  if(parts.length > 2) add(parts[parts.length - 1]);
  (it.aliases || []).forEach(add);
  if(it.team && it.kind === "team" && P.teamAliases) P.teamAliases(it.team).forEach(add);
  return [...k];
}
/* which of the items does the guess name? exact keys win; then a typo or two */
function match(guess, items){
  const g = norm(guess); if(!g) return [];
  const ks = items.map(keys);
  let hits = items.map((_, i) => i).filter(i => ks[i].includes(g));
  if(hits.length) return hits;
  const tol = g.length >= 9 ? 2 : g.length >= 5 ? 1 : 0;
  if(!tol) return [];
  let best = 99;
  ks.forEach((kk, i) => kk.forEach(k => { if(Math.abs(k.length - g.length) > tol || k.length < 4) return; const dd = lev(g, k); if(dd <= tol){ if(dd < best){ best = dd; hits = [i]; } else if(dd === best && !hits.includes(i)) hits.push(i); } }));
  return hits;
}

/* ---------------- players ---------------- */
function defaultPlayers(){
  const names = (window.PUCK_CONFIG && PUCK_CONFIG.DEMO_PLAYERS) || ["Martijn", "Felix", "Ale"];
  return store.get("players", { n: 2, names: names.slice(0, 3) });
}
/* the setup screen every game shares: how to play, how many players, names, options */
function setup(o){
  const { app, band, $, $$ } = P.ui;
  const st = defaultPlayers();
  if(o.minPlayers && st.n < o.minPlayers) st.n = o.minPlayers;
  const opt = store.get("opt." + o.id, {});
  (o.options || []).forEach(x => { if(opt[x.id] == null || !x.values.some(v => v[0] === opt[x.id])) opt[x.id] = x.def; });
  const paint = () => {
    app.innerHTML = '<div class="gx">' + band(o.title, o.kick, "#home") + '<div class="wrap stack gx-setup">' +
      (o.hero ? '<div class="gx-hero">' + o.hero() + "</div>" : "") +
      '<div class="card gx-how"><span class="label">How to play</span><ol>' + o.how.map(s => "<li>" + s + "</li>").join("") + "</ol></div>" +
      '<div class="card light"><div class="gx-row"><span class="label">Players</span><div class="gx-seg" role="group" aria-label="Players">' +
        [1, 2, 3].map(n => '<button type="button" class="' + (st.n === n ? "on" : "") + '" data-n="' + n + '">' + n + "</button>").join("") + "</div></div>" +
      '<div class="gx-names">' + Array.from({ length: st.n }, (_, i) => '<label class="gx-name" style="--pc:' + PC[i].c + '"><i>' + (i + 1) + '</i><input maxlength="12" value="' + esc(st.names[i] || "Player " + (i + 1)) + '" data-i="' + i + '" aria-label="Player ' + (i + 1) + ' name" autocomplete="off"></label>').join("") + "</div>" +
      (o.modeLine ? '<p class="one" style="margin-top:8px">' + o.modeLine(st.n) + "</p>" : "") +
      (o.options || []).map(x => '<div class="gx-row" style="margin-top:12px"><span class="label">' + esc(x.label) + '</span><div class="gx-seg" data-opt="' + x.id + '">' +
        x.values.map(([v, l]) => '<button type="button" class="' + (opt[x.id] === v ? "on" : "") + '" data-v="' + v + '">' + esc(l) + "</button>").join("") + "</div></div>").join("") +
      "</div>" + (o.extra ? o.extra() : "") +
      '<button type="button" class="pill wide" id="gx-go">' + esc(o.go || "Drop the puck") + "</button>" +
      (o.foot ? '<p class="one gx-foot">' + o.foot + "</p>" : "") + "</div></div>";
    $$(".gx-seg[role=group] button").forEach(b => b.addEventListener("click", () => { st.n = +b.dataset.n; store.set("players", st); paint(); }));
    $$(".gx-name input").forEach(inp => inp.addEventListener("input", () => { st.names[+inp.dataset.i] = inp.value.trim(); store.set("players", st); }));
    $$(".gx-seg[data-opt]").forEach(g => $$("button", g).forEach(b => b.addEventListener("click", () => {
      const x = o.options.find(z => z.id === g.dataset.opt); const v = x.values.find(z => String(z[0]) === b.dataset.v)[0];
      opt[x.id] = v; store.set("opt." + o.id, opt); $$("button", g).forEach(z => z.classList.toggle("on", z === b));
    })));
    if(o.after) o.after();
    $("#gx-go").addEventListener("click", () => {
      const used = new Set();
      const players = Array.from({ length: st.n }, (_, i) => {
        let nm = (st.names[i] || "").trim() || "Player " + (i + 1);
        while(used.has(nm.toLowerCase())) nm += "²"; used.add(nm.toLowerCase());
        return { i, name: nm, col: PC[i], score: 0 };
      });
      o.start(players, Object.assign({}, opt));
    });
  };
  paint();
}

/* ---------------- the jumbotron scoreboard ----------------
   p.score, optional p.marks = [true, false…] for lives or strikes */
function board(players, active, o = {}){
  return '<div class="gx-board' + (players.length === 1 ? " solo" : "") + '" style="--n:' + players.length + '">' + players.map((p, i) =>
    '<div class="gx-pl' + (i === active ? " on" : "") + (p.out ? " out" : "") + '" style="--pc:' + p.col.c + ";--pd:" + p.col.d + '" data-p="' + i + '">' +
      '<span class="nm">' + esc(p.name) + "</span>" +
      '<b class="sc">' + (o.fmt ? o.fmt(p) : p.score) + "</b>" +
      (p.marks ? '<span class="mk">' + p.marks.map(m => '<i class="' + (m ? "x" : "") + '"></i>').join("") + "</span>" : "") +
    "</div>").join("") + "</div>";
}
/* count a number up on an element, odometer style */
function countUp(el, to, ms = 700){
  if(!el) return;
  const from = +el.dataset.v || 0; el.dataset.v = to;
  if(RM() || from === to){ el.textContent = to; return; }
  const t0 = performance.now();
  const step = now => { const k = Math.min(1, (now - t0)/ms), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(from + (to - from)*e); if(k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}

/* ---------------- a shot clock: an LED number and a draining bar ---------------- */
function clock(el, secs, onEnd){
  let left = secs*1000, last = performance.now(), raf = 0, stopped = false, paused = false;
  el.innerHTML = '<div class="gx-clock"><b>' + secs + '</b><span class="bar"><i></i></span></div>';
  const b = el.querySelector("b"), bar = el.querySelector("i");
  const tick = now => {
    if(stopped) return;
    if(!paused) left -= now - last; last = now;
    const s = Math.max(0, Math.ceil(left/1000));
    if(b.textContent !== String(s)) b.textContent = s;
    el.firstChild.classList.toggle("low", left < 5000);
    bar.style.transform = "scaleX(" + Math.max(0, left/(secs*1000)) + ")";
    if(left <= 0){ stopped = true; onEnd && onEnd(); return; }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  const api = { stop(){ stopped = true; cancelAnimationFrame(raf); }, pause(v){ paused = v; }, left: () => left };
  if(P.ui) P.ui.onLeave(api.stop);
  return api;
}

/* ---------------- particles: ice spray and confetti on one canvas ---------------- */
let fxc = null, fxx = null, parts = [], fxraf = 0, fxlast = 0;
function fxCanvas(){
  if(fxc && document.body.contains(fxc)) return;
  fxc = document.createElement("canvas"); fxc.className = "gx-fx"; document.body.appendChild(fxc);
  fxx = fxc.getContext("2d"); fxSize();
  window.addEventListener("resize", fxSize);
}
function fxSize(){ if(!fxc) return; const r = Math.min(2, window.devicePixelRatio || 1); fxc.width = innerWidth*r; fxc.height = innerHeight*r; fxx.setTransform(r, 0, 0, r, 0, 0); }
function fxLoop(now){
  const dt = Math.min(.05, (now - fxlast)/1000 || .016); fxlast = now;
  fxx.clearRect(0, 0, fxc.width, fxc.height);
  parts = parts.filter(p => (p.life -= dt) > 0);
  for(const p of parts){
    p.vy += p.g*dt; p.vx *= p.drag; p.vy *= p.drag; p.x += p.vx*dt; p.y += p.vy*dt; p.r += p.vr*dt;
    const a = Math.min(1, p.life/p.fade);
    fxx.globalAlpha = a;
    if(p.kind === "snow"){ fxx.fillStyle = p.c; fxx.beginPath(); fxx.arc(p.x, p.y, p.s*(.5 + .5*a), 0, 7); fxx.fill(); }
    else { fxx.save(); fxx.translate(p.x, p.y); fxx.rotate(p.r); fxx.scale(1, Math.cos(p.r*2.3)); fxx.fillStyle = p.c; fxx.fillRect(-p.s/2, -p.s/4, p.s, p.s/2); fxx.restore(); }
  }
  fxx.globalAlpha = 1;
  if(parts.length) fxraf = requestAnimationFrame(fxLoop); else { fxraf = 0; fxx.clearRect(0, 0, fxc.width, fxc.height); }
}
function fxGo(){ if(!fxraf){ fxlast = performance.now(); fxraf = requestAnimationFrame(fxLoop); } }
/* ice spray at a point on screen, thrown to one side like a hockey stop */
function spray(x, y, o = {}){
  if(RM()) return; fxCanvas();
  const n = o.n || 46, dir = o.dir == null ? (Math.random() < .5 ? -1 : 1) : o.dir;
  for(let i = 0; i < n; i++){
    const a = -Math.PI/2 + dir*(.35 + Math.random()*1.1) + (Math.random() - .5)*.5, v = 120 + Math.random()*260;
    parts.push({ kind: "snow", x: x + (Math.random() - .5)*18, y: y + (Math.random() - .5)*6, vx: Math.cos(a)*v, vy: Math.sin(a)*v*.7, g: 520, drag: .965, r: 0, vr: 0,
      s: 1 + Math.random()*2.6, c: Math.random() < .25 ? "#cfe6ff" : "#ffffff", life: .5 + Math.random()*.6, fade: .4 });
  }
  fxGo();
}
function confetti(colors, o = {}){
  if(RM()) return; fxCanvas();
  const n = o.n || 140, w = innerWidth;
  for(let i = 0; i < n; i++){
    const fromL = i % 2 === 0, x = o.x != null ? o.x : fromL ? -10 : w + 10, y = o.y != null ? o.y : innerHeight*.55;
    const a = o.x != null ? -Math.PI/2 + (Math.random() - .5)*2.2 : fromL ? -Math.PI/2 + .25 + Math.random()*.7 : -Math.PI/2 - .25 - Math.random()*.7;
    const v = (o.x != null ? 260 : 520) + Math.random()*420;
    parts.push({ kind: "conf", x, y, vx: Math.cos(a)*v, vy: Math.sin(a)*v, g: 420, drag: .975, r: Math.random()*6, vr: (Math.random() - .5)*14,
      s: 7 + Math.random()*7, c: colors[i % colors.length], life: 2 + Math.random()*1.6, fade: .6 });
  }
  fxGo();
}

/* ---------------- hat trick: hats rain onto the ice ---------------- */
function hatSvg(kind, c1, c2){
  if(kind === 0) return '<svg viewBox="0 0 64 44"><path d="M8 34 Q8 6 34 6 Q56 6 56 30 Z" fill="' + c1 + '"/><path d="M34 6 L34 32 M20 10 Q26 20 24 33 M46 10 Q42 20 44 31" stroke="rgba(0,0,0,.25)" fill="none"/><path d="M4 34 Q30 26 62 36 Q40 44 6 40Z" fill="' + c2 + '"/><circle cx="34" cy="6" r="3" fill="' + c2 + '"/></svg>';
  if(kind === 1) return '<svg viewBox="0 0 64 56"><circle cx="32" cy="9" r="8" fill="' + c2 + '"/><path d="M10 40 Q10 12 32 12 Q54 12 54 40Z" fill="' + c1 + '"/><path d="M14 26h36" stroke="' + c2 + '" stroke-width="4"/><rect x="7" y="38" width="50" height="12" rx="4" fill="' + c2 + '"/><path d="M12 44h40" stroke="rgba(0,0,0,.2)" stroke-dasharray="2 2"/></svg>';
  return '<svg viewBox="0 0 64 40"><path d="M16 28 Q14 8 24 8 Q32 12 40 8 Q50 8 48 28Z" fill="' + c1 + '"/><rect x="15" y="22" width="34" height="5" fill="' + c2 + '"/><ellipse cx="32" cy="30" rx="30" ry="7" fill="' + c1 + '"/><ellipse cx="32" cy="29" rx="18" ry="3" fill="rgba(0,0,0,.25)"/></svg>';
}
function hats(o = {}){
  const box = document.createElement("div"); box.className = "gx-hats";
  box.innerHTML = '<div class="gx-ht"><span>Hat trick</span>' + (o.name ? "<small>" + esc(o.name) + "</small>" : "") + "</div>";
  document.body.appendChild(box);
  const pal = [["#E3343B", "#fff"], ["#16283f", "#F2C230"], ["#2F73E0", "#fff"], ["#F2C230", "#16283f"], ["#1f8a4c", "#fff"], ["#8a5a2b", "#2a1a0a"], ["#eef3f7", "#E3343B"]];
  const rm = RM(), n = rm ? 0 : 22;
  for(let i = 0; i < n; i++){
    const h = document.createElement("i"), [c1, c2] = pal[i % pal.length];
    h.innerHTML = hatSvg(i % 3, c1, c2);
    const x = 4 + Math.random()*86, s = 38 + Math.random()*26, land = 62 + Math.random()*26;
    h.style.cssText = "left:" + x + "vw;width:" + s + "px";
    box.appendChild(h);
    h.animate([{ transform: "translateY(-30vh) rotate(" + (Math.random()*360) + "deg)" }, { transform: "translateY(" + land + "vh) rotate(" + (Math.random()*720 - 360) + "deg)", offset: .8 },
      { transform: "translateY(" + (land - 2) + "vh) rotate(" + (Math.random()*40 - 20) + "deg)" }],
      { duration: 1300 + Math.random()*900, delay: Math.random()*700, easing: "cubic-bezier(.35,0,.6,1)", fill: "both" });
  }
  const ht = box.firstChild;
  ht.animate([{ transform: "scale(2.2) rotate(-6deg)", opacity: 0 }, { transform: "scale(.94) rotate(-6deg)", opacity: 1, offset: .55 }, { transform: "scale(1) rotate(-6deg)", opacity: 1 }], { duration: rm ? 1 : 650, easing: "cubic-bezier(.2,.9,.3,1.3)", fill: "both" });
  return new Promise(res => setTimeout(() => {
    const a = box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, fill: "forwards" });
    a.onfinish = () => { box.remove(); res(); };
  }, rm ? 1400 : 2700));
}

/* ---------------- a big word across the screen: GOAL, NO GOAL, TIME ---------------- */
function callout(text, kind = "good", el){
  const d = document.createElement("div"); d.className = "gx-call " + kind; d.innerHTML = "<span>" + esc(text) + "</span>";
  (el || document.body).appendChild(d);
  const a = d.animate([{ opacity: 0, transform: "scale(1.6)" }, { opacity: 1, transform: "scale(1)", offset: .2 }, { opacity: 1, transform: "scale(1)", offset: .75 }, { opacity: 0, transform: "scale(.96)" }],
    { duration: RM() ? 900 : 1100, easing: "ease-out", fill: "forwards" });
  a.onfinish = () => d.remove();
}

/* ---------------- the Three Stars: the full-time screen ---------------- */
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8l3.1 6.6 7.1.8-5.3 4.9 1.4 7.1L12 17.6l-6.3 3.6 1.4-7.1L1.8 9.2l7.1-.8z"/></svg>';
function stars(o){
  const { app, band, $ } = P.ui;
  const ps = o.players.slice().sort((a, b) => (b.score - a.score) || ((o.tie ? o.tie(b) : 0) - (o.tie ? o.tie(a) : 0)));
  const solo = ps.length === 1, tie = !solo && ps[0].score === ps[1].score && (!o.tie || o.tie(ps[0]) === o.tie(ps[1]));
  const head = solo ? (o.soloTitle || "Full time") : tie ? "It's a tie" : esc(ps[0].name) + " wins";
  const order = solo ? [0] : ps.length === 2 ? [1, 0] : [1, 0, 2];
  const same = (a, b) => a.score === b.score && (!o.tie || o.tie(a) === o.tie(b));
  const rankOf = p => ps.findIndex(q => same(q, p));
  const lbl = ["First star", "Second star", "Third star"];
  app.innerHTML = '<div class="gx">' + band(o.title, o.kick || "Full time", "#home") + '<div class="wrap stack">' +
    '<div class="gx-stars card"><div class="gx-spot"></div><h2 class="gx-win">' + head + "</h2>" + (o.line ? '<p class="one gx-line">' + o.line + "</p>" : "") +
    '<div class="gx-pod" style="--n:' + ps.length + '">' + order.map(k => { const p = ps[k]; return '<div class="gx-podc r' + k + '" style="--pc:' + p.col.c + ";--pd:" + p.col.d + '">' +
      '<span class="st">' + STAR.repeat(solo ? 1 : 3 - rankOf(p)) + "</span><b>" + esc(p.name) + '</b><span class="pts">' + (o.fmt ? o.fmt(p) : p.score) + "</span>" +
      '<div class="blk"><small>' + (solo ? (o.soloLbl || "Score") : ps.some(q => q !== p && same(q, p)) ? "Tied" : lbl[rankOf(p)]) + "</small></div></div>"; }).join("") + "</div>" +
    (o.extra || "") + "</div>" +
    '<button type="button" class="pill wide" id="gx-re">Rematch</button><a class="btn2 gx-chg" href="#' + o.id + '">Change players</a></div></div>';
  $("#gx-re").addEventListener("click", o.rematch);
  if(!RM()) setTimeout(() => confetti(tie || solo ? ["#ffffff", "#F2C230", "#8fd0ff", "#E3343B"] : [ps[0].col.c, "#ffffff", ps[0].col.d, "#F2C230"], { n: 170 }), 450);
}

P.kit = { stall, turnable, RM, esc, sleep, shuffle, store, PC, J, design, jersey, norm, lev, match, keys, setup, board, countUp, clock, spray, confetti, hats, callout, stars, STAR };
})();
