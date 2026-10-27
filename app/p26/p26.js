/* PUCK 26: the menu shell, from _brand/puck26/source/menu.js.
   - boot(): the PRESS START title screen (once per app open, only when the app
     opens on Play; a link straight to #pool or a game skips it)
   - the header (horizontal PUCK 26 logo + LB PLAY POOL TABLE ME RB tabs) and the
     footer (NHL FACTS ticker + A/B/Y hints), which replace the old bottom bar
   - play(): the Play screen (pool strip, preview card, the six skewed mode bars)
   - startMode(): the loading screen with a tip, then the mode's real route
   app.js calls route(name) on every hash change and play() for #home. */
(function(){
const P = window.PUCK, D = P.d26, LOGO = window.PUCK_LOGOS;
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const reduced = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const face = n => "app/assets/players/" + n + ".webp";
const ab = k => '<i class="ab ' + k.toLowerCase() + '">' + k + "</i>";

const BG = {
  MTL: "linear-gradient(150deg,#d0303f,#AF1E2D 45%,#192168)", PIT: "linear-gradient(150deg,#FCB514,#a77506 40%,#111 85%)",
  EDM: "linear-gradient(150deg,#ff6a1a,#c63d00 35%,#041E42 75%)", WSH: "linear-gradient(150deg,#e02a43,#C8102E 40%,#041E42)",
  CZE: "linear-gradient(150deg,#2b5bb5,#11457E 45%,#7a0f1a)", NHL: "linear-gradient(150deg,#2b5bb5,#0a1c38 55%,#01040a)"
};
/* the six modes, in the order of the design; route = the app's own hash */
const MODES = [
  { id: "faceoff", name: "Faceoff", tag: "1 on 1", text: "One on one, like BALL. Pass with a right answer, shoot, score.", face: "Suzuki", bg: BG.MTL, big: "1v1" },
  { id: "lists", name: "Lists", tag: "Top 10s", text: "The last 10 Cup winners, the Original Six, top 10s.", face: "Mario_Lemieux", bg: BG.PIT, big: "10" },
  { id: "five", name: "Starting Five", tag: "5 names", text: "Name the top five on the ice.", face: "McDavid", bg: BG.EDM, big: "5" },
  { id: "wore", name: "Who wore it?", tag: "Buzzer", text: "A number, a team, a buzzer race.", face: "Jagr", bg: BG.CZE, big: "#" },
  { id: "draft", name: "Draft Day", tag: "1st picks", text: "First overall picks. You're on the clock.", face: "Crosby", bg: BG.PIT, big: "1st" },
  { id: "locker", name: "The Locker Room", tag: "Hi · Lo", text: "Higher or lower, stall by stall.", face: "Ovechkin", bg: BG.WSH, big: "↑↓" }
];
function modes(){
  /* any plug-in game that isn't in the design's six still gets a bar */
  const extra = (P.games || []).filter(g => !MODES.some(m => m.id === g.id))
    .map(g => ({ id: g.id, name: g.title, tag: "New", text: g.sub || "", face: null, bg: BG.NHL, big: "?" }));
  return MODES.concat(extra);
}
const TIPS = [
  "A <b>hat trick</b> is three goals by one player in one game.",
  "The Stanley Cup was first awarded in <b>1893</b>.",
  "An <b>empty-net goal</b> is scored after the other team pulls its goalie.",
  "The Original Six are <b>BOS, CHI, DET, MTL, NYR and TOR</b>."
];
const FACTS = "The Canadiens have won 24 Stanley Cups · Alex Ovechkin passed Wayne Gretzky with his 895th goal in April 2025 · Sidney Crosby went first overall in the 2005 draft · Mario Lemieux went first overall in 1984 · The Original Six: BOS, CHI, DET, MTL, NYR, TOR · ";
const TABS = [["play", "#home"], ["pool", "#pool"], ["table", "#table"], ["me", "#me"]];
const TAB_OF = { home: "play", pool: "pool", table: "table", me: "me" };

/* ---------- logos ---------- */
function glowDefs(id){
  return '<filter id="' + id + 'sg" x="-.2" y="-.2" width="1.4" height="1.4"><feMorphology in="SourceAlpha" operator="dilate" radius="5" result="d"/><feGaussianBlur in="d" stdDeviation="11" result="bd"/><feFlood flood-color="#3d9bff" flood-opacity=".8"/><feComposite in2="bd" operator="in" result="glow"/><feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
    '<linearGradient id="' + id + 'ln" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9fd8ff" stop-opacity="0"/><stop offset=".5" stop-color="#e8f6ff"/><stop offset="1" stop-color="#9fd8ff" stop-opacity="0"/></linearGradient>';
}
function headLogo(){
  const id = "hl" + D.nextId();
  return '<svg viewBox="0 0 860 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PUCK 26 Hockey Quiz"><defs>' + glowDefs(id) + "</defs>" +
    '<image href="' + LOGO.dark.NHL + '" x="-30" y="0" width="390" height="260" filter="url(#' + id + 'sg)"/>' +
    D.chrome(id + "p", "PUCK", 300, 200, 172, 440, D.CHROME) + D.chrome(id + "y", "26", 752, 104, 82, 92, D.EMBER) +
    '<text x="540" y="272" text-anchor="middle" font-family="Michroma, Arial, sans-serif" font-size="24" letter-spacing="14" fill="#e8f3ff">HOCKEY QUIZ</text></svg>';
}
function stackedLogo(){
  const id = "sl" + D.nextId(), W = 640, cx = W/2, pl = 440, yl = 84, x0 = cx - (pl + 8 + yl)/2;
  return '<svg viewBox="0 0 ' + W + ' 500" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PUCK 26 Hockey Quiz"><defs>' + glowDefs(id) + "</defs>" +
    '<image href="' + LOGO.dark.NHL + '" x="' + (cx - 195) + '" y="6" width="390" height="260" filter="url(#' + id + 'sg)"/>' +
    D.chrome(id + "p", "PUCK", x0, 400, 170, pl, D.CHROME) + D.chrome(id + "y", "26", x0 + pl + 8, 300, 76, yl, D.EMBER) +
    '<path d="M' + (cx - 220) + " 428 H" + (cx + 220) + '" stroke="url(#' + id + 'ln)" stroke-width="2"/>' +
    '<text x="' + (cx + 6) + '" y="464" text-anchor="middle" font-family="Michroma, Arial, sans-serif" font-size="22" letter-spacing="12" fill="#e8f3ff">HOCKEY QUIZ</text>' +
    '<path d="M' + (cx - 220) + " 484 H" + (cx + 220) + '" stroke="url(#' + id + 'ln)" stroke-width="2"/></svg>';
}

/* ---------- the boot screen ---------- */
function bootScene(){
  const id = "bt" + D.nextId(), r = D.rng(26);
  const sparks = [...Array(18)].map(() => { const x = 300 + r()*20, y = 640 + (r() - .5)*30, l = 8 + r()*26, a = (r() - .5)*.5;
    return '<path d="M' + x.toFixed(1) + " " + y.toFixed(1) + " l" + (Math.cos(a)*l).toFixed(1) + " " + (Math.sin(a)*l).toFixed(1) + '" stroke="' + (r() < .5 ? "#ffd36a" : "#fff4d6") + '" stroke-width="' + (1 + r()*1.4).toFixed(1) + '" stroke-linecap="round"/>'; }).join("");
  const rink = [...Array(10)].map((_, i) => '<path d="M' + (195 + (i - 4.5)*26) + " 600 L" + (195 + (i - 4.5)*110) + ' 844" stroke="#fff" stroke-opacity=".05"/>').join("");
  return '<svg viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>' +
    '<radialGradient id="' + id + 'bg" cx=".5" cy=".36" r=".8"><stop offset="0" stop-color="#1b4787"/><stop offset=".45" stop-color="#0a1c38"/><stop offset="1" stop-color="#01040a"/></radialGradient>' +
    '<linearGradient id="' + id + 'ice" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9cc4e6" stop-opacity=".35"/><stop offset=".25" stop-color="#d6e9f7" stop-opacity=".18"/><stop offset="1" stop-color="#0a1830" stop-opacity=".95"/></linearGradient>' +
    '<linearGradient id="' + id + 'bm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe6ff" stop-opacity=".3"/><stop offset="1" stop-color="#cfe6ff" stop-opacity="0"/></linearGradient>' +
    '<linearGradient id="' + id + 'sw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2f8fff" stop-opacity="0"/><stop offset=".45" stop-color="#2f8fff" stop-opacity=".9"/><stop offset="1" stop-color="#9fe0ff" stop-opacity=".15"/></linearGradient>' +
    '<linearGradient id="' + id + 'tr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd36a" stop-opacity=".9"/><stop offset=".35" stop-color="#9fd8ff" stop-opacity=".45"/><stop offset="1" stop-color="#9fd8ff" stop-opacity="0"/></linearGradient>' +
    '<radialGradient id="' + id + 'fl" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="#bfe4ff" stop-opacity=".7"/><stop offset="1" stop-color="#2f8fff" stop-opacity="0"/></radialGradient>' +
    '<filter id="' + id + 'b" x="-.3" y="-.3" width="1.6" height="1.6"><feGaussianBlur stdDeviation="10"/></filter><filter id="' + id + 'b2" x="-.3" y="-.3" width="1.6" height="1.6"><feGaussianBlur stdDeviation="3"/></filter></defs>' +
    '<rect width="390" height="844" fill="url(#' + id + 'bg)"/>' +
    '<g filter="url(#' + id + 'b)"><polygon points="120,0 170,0 260,600 40,600" fill="url(#' + id + 'bm)"/><polygon points="250,0 290,0 400,600 250,600" fill="url(#' + id + 'bm)"/></g>' +
    '<polygon points="0,600 390,600 390,844 0,844" fill="url(#' + id + 'ice)"/><path d="M0 600 H390" stroke="#bfe0ff" stroke-opacity=".35"/>' + rink +
    '<path d="M-10 560 Q200 600 410 330" fill="none" stroke="url(#' + id + 'sw)" stroke-width="22" stroke-linecap="round" filter="url(#' + id + 'b2)" opacity=".85"/>' +
    '<path d="M-10 560 Q200 600 410 330" fill="none" stroke="#e9f7ff" stroke-width="2" opacity=".9"/>' +
    D.nest(stackedLogo(), 15, 215, 360, 500/640) +
    '<path d="M290 618 L390 600 L390 690 L290 668Z" fill="url(#' + id + 'tr)" opacity=".45" filter="url(#' + id + 'b2)"/>' + sparks +
    '<g transform="rotate(-6 250 650)">' + D.nest(D.puck(), 180, 600, 130, .7) + "</g>" +
    '<g><circle cx="128" cy="232" r="34" fill="url(#' + id + 'fl)"/><path d="M68 232 L128 230.6 L188 232 L128 233.4Z M128 196 L129.2 232 L128 268 L126.8 232Z" fill="#fff"/></g>' +
    '<text class="press" x="195" y="760" text-anchor="middle" font-family="Michroma, Arial, sans-serif" font-size="17" letter-spacing="7" fill="#ffd36a">PRESS START</text>' +
    '<text x="195" y="800" text-anchor="middle" font-family="Michroma, Arial, sans-serif" font-size="7.5" letter-spacing="2" fill="#7f97b3">© 2026 FELIX · ALEJANDRO · MARTIJN · MCJESUS</text></svg>';
}
function flash(){ const f = document.getElementById("p26flash"); if(!f || reduced()) return; f.classList.remove("go"); void f.offsetWidth; f.classList.add("go"); }
let booting = false;
function boot(){
  const h = (location.hash || "#home").slice(1);
  let seen = false; try { seen = sessionStorage.getItem("puck.booted") === "1"; } catch(e){}
  if(seen || (h && h !== "home")) return;
  try { sessionStorage.setItem("puck.booted", "1"); } catch(e){}
  booting = true;
  const b = document.createElement("button");
  b.className = "p26-boot"; b.type = "button"; b.setAttribute("aria-label", "Press start");
  b.innerHTML = bootScene();
  document.body.appendChild(b);
  b.focus({ preventScroll: true });
  b.addEventListener("click", () => { booting = false; b.remove(); flash(); });
}

/* ---------- header and footer ---------- */
function shell(){
  const top = document.getElementById("p26top"), foot = document.getElementById("p26foot");
  top.innerHTML = '<a class="lg" href="#home" aria-label="PUCK 26, back to Play">' + headLogo() + "</a>" +
    '<nav class="p26-tabs" aria-label="Sections"><button class="sh" type="button" data-sh="-1" aria-label="Previous tab">LB</button>' +
    TABS.map(([t, h]) => '<a href="' + h + '" data-tab="' + t + '">' + t.toUpperCase() + "</a>").join("") +
    '<button class="sh" type="button" data-sh="1" aria-label="Next tab">RB</button></nav>';
  foot.innerHTML = '<div class="p26-ticker" aria-hidden="true"><b>NHL FACTS</b><span>' + FACTS + FACTS + "</span></div>" +
    '<div class="p26-hints"><button type="button" data-hint="a">' + ab("A") + 'SELECT</button><button type="button" data-hint="b">' + ab("B") + 'BACK</button><button type="button" data-hint="y">' + ab("Y") + "POOL</button></div>";
  top.querySelectorAll("[data-sh]").forEach(b => b.addEventListener("click", () => shiftTab(+b.dataset.sh)));
  foot.querySelector('[data-hint="a"]').addEventListener("click", () => { if(cur === "home") startMode(sel()); });
  foot.querySelector('[data-hint="b"]').addEventListener("click", () => { location.hash = "#home"; });
  foot.querySelector('[data-hint="y"]').addEventListener("click", () => { location.hash = "#pool"; });
}
let cur = "home";
function route(name){
  cur = name;
  const tab = TAB_OF[name];
  document.body.classList.toggle("p26-tab", !!tab);
  document.body.classList.toggle("p26-game", !tab);
  document.querySelectorAll(".p26-tabs [data-tab]").forEach(a => a.classList.toggle("on", a.dataset.tab === tab));
  closeLoad();
}
function shiftTab(d){
  const i = Math.max(0, TABS.findIndex(([t]) => t === (TAB_OF[cur] || "play")));
  location.hash = TABS[(i + d + TABS.length) % TABS.length][1];
}

/* ---------- countdowns: anything with data-until ticks every second ---------- */
function clock(iso){
  const s = Math.floor((new Date(iso) - Date.now())/1000);
  if(s <= 0) return "LOCKED";
  const h = Math.floor(s/3600), m = Math.floor(s % 3600/60), x = s % 60, p = n => String(n).padStart(2, "0");
  return h >= 100 ? Math.floor(h/24) + "D " + p(h % 24) + "H" : p(h) + ":" + p(m) + ":" + p(x);
}
setInterval(() => document.querySelectorAll("[data-until]").forEach(el => { el.textContent = clock(el.dataset.until); }), 1000);

/* ---------- Play ---------- */
let selI = 0;
try { selI = +localStorage.getItem("puck.sel") || 0; } catch(e){}
const sel = () => modes()[Math.min(selI, modes().length - 1)];
function previewHTML(m, i){
  return '<div class="in" style="--bg:' + m.bg + '"><span class="big">' + esc(m.big) + "</span></div>" +
    (m.face ? '<img class="who" src="' + face(m.face) + '" alt="">' : "") +
    '<div class="txt"><small>MODE ' + String(i + 1).padStart(2, "0") + " · " + esc(m.tag.toUpperCase()) + "</small><h3>" + esc(m.name) + "</h3><p>" + esc(m.text) + "</p>" +
    '<button class="playa" type="button" data-play>' + ab("A") + "PLAY</button></div>";
}
function play(app){
  const ms = modes(); selI = Math.min(selI, ms.length - 1);
  app.innerHTML = '<div class="p26-play">' +
    '<a class="strip" href="#pool" id="strip"><span class="k">THE<br>POOL</span><span class="vs"><span class="clk" style="font-size:2.6cqw;color:var(--mist);text-shadow:none">LOADING…</span></span><span class="clk"></span><span class="go">►</span></a>' +
    '<div class="preview" id="pv">' + previewHTML(ms[selI], selI) + "</div>" +
    '<div class="p26-menu" role="listbox" aria-label="Modes">' + ms.map((m, i) => '<button class="item' + (i === selI ? " sel" : "") + '" type="button" role="option" aria-selected="' + (i === selI) + '" data-i="' + i + '"><span>' + esc(m.name) + "</span><em>" + esc(m.tag.toUpperCase()) + "</em></button>").join("") + "</div></div>";
  app.querySelectorAll(".item").forEach(el => el.addEventListener("click", () => { const i = +el.dataset.i; i === selI ? startMode(ms[i]) : select(i); }));
  wirePlay();
  fillStrip();
}
function wirePlay(){ const p = document.querySelector("#pv [data-play]"); if(p) p.addEventListener("click", () => startMode(sel())); }
function select(i){
  const ms = modes();
  selI = (i + ms.length) % ms.length;
  try { localStorage.setItem("puck.sel", selI); } catch(e){}
  document.querySelectorAll(".p26-menu .item").forEach((el, k) => { el.classList.toggle("sel", k === selI); el.setAttribute("aria-selected", k === selI); });
  const pv = document.getElementById("pv"); if(!pv) return;
  pv.innerHTML = previewHTML(ms[selI], selI); pv.classList.remove("swap"); void pv.offsetWidth; pv.classList.add("swap"); wirePlay();
  const it = document.querySelectorAll(".p26-menu .item")[selI]; if(it) it.scrollIntoView({ block: "nearest" });
}
/* the soonest Pool game (a live one first), with the real lock time */
async function fillStrip(){
  const s = document.getElementById("strip"); if(!s) return;
  try {
    const { games } = await P.nhl.poolGames();
    const now = Date.now();
    const g = games.find(x => x.live) || games.find(x => !x.final && new Date(x.start) > now);
    if(!g || !document.body.contains(s)){ if(document.body.contains(s)) s.querySelector(".vs").innerHTML = '<span class="clk" style="font-size:2.6cqw;color:var(--mist);text-shadow:none">NO GAMES</span>'; return; }
    const img = t => '<img src="' + LOGO.dark[t] + '" alt="' + t + '">';
    s.querySelector(".vs").innerHTML = img(g.away.abbr) + (g.live ? '<span class="sc">' + g.away.score + "–" + g.home.score + "</span>" : "@") + img(g.home.abbr);
    const c = s.querySelector(":scope > .clk");
    if(g.live){ c.textContent = "LIVE"; c.classList.add("live"); }
    else { c.dataset.until = g.start; c.textContent = clock(g.start); }
  } catch(e){ const v = s.querySelector(".vs"); if(v) v.innerHTML = '<span class="clk" style="font-size:2.6cqw;color:var(--mist);text-shadow:none">OFFLINE</span>'; }
}

/* ---------- loading screen, then the real mode ---------- */
let loadT = 0;
function closeLoad(){ clearTimeout(loadT); const l = document.querySelector(".p26-load"); if(l) l.remove(); }
function startMode(m){
  if(!m) return;
  closeLoad();
  const dur = reduced() ? 400 : 2000, i = modes().indexOf(m);
  const L = document.createElement("div");
  L.className = "p26-load"; L.setAttribute("role", "dialog"); L.setAttribute("aria-label", "Loading " + m.name);
  L.innerHTML = '<div class="box" style="--dur:' + dur + 'ms"><div class="art">' + (m.face ? '<img src="' + face(m.face) + '" alt="">' : '<span class="glyph">' + esc(m.big) + "</span>") + "</div>" +
    "<h3>" + esc(m.name) + '</h3><p class="tip"><b>TIP · </b>' + TIPS[Math.max(0, i) % TIPS.length] + "</p>" +
    '<div class="lbl"><span>LOADING</span><span>' + ab("B") + " BACK</span></div><div class=\"bar\"><i></i></div></div>";
  document.body.appendChild(L);
  L.addEventListener("click", closeLoad);
  loadT = setTimeout(() => { L.remove(); location.hash = "#" + m.id; }, dur + 80);
}

/* ---------- keyboard: ↑ ↓ move, Enter plays, Q/E switch tabs, Esc backs out ---------- */
document.addEventListener("keydown", e => {
  const t = e.target, typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  const bootEl = document.querySelector(".p26-boot");
  if(bootEl){ if(e.key === "Enter" || e.key === " "){ e.preventDefault(); bootEl.click(); } return; }
  if(document.querySelector(".p26-load")){ if(e.key === "Escape" || e.key === "Enter"){ e.preventDefault(); closeLoad(); } return; }
  if(typing) return;
  const k = e.key.toLowerCase();
  if(k === "q") shiftTab(-1);
  else if(k === "e") shiftTab(1);
  else if(k === "escape") location.hash = "#home";
  else if(cur === "home" && e.key === "ArrowDown"){ e.preventDefault(); select(selI + 1); }
  else if(cur === "home" && e.key === "ArrowUp"){ e.preventDefault(); select(selI - 1); }
  else if(cur === "home" && e.key === "Enter" && !(t && t.closest && t.closest("button,a"))){ e.preventDefault(); startMode(sel()); }
});

P.p26 = { shell, boot, route, play, startMode, clock, MODES };
})();
