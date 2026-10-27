/* PUCK 26: the menu shell, from _brand/puck26/source/menu.js.
   - boot(): the PRESS START title screen (once per app open, only when the app
     opens on Play; a link straight to #pool or a game skips it)
   - the header (horizontal PUCK 26 logo + LB PLAY POOL TABLE NHL ME RB tabs) and the
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
  { id: "faceoff", team: "MTL", name: "Faceoff", tag: "1 on 1", text: "One on one, like BALL. Pass with a right answer, shoot, score.", face: "Suzuki", bg: BG.MTL, big: "1v1" },
  { id: "lists", team: "EDM", name: "Lists", tag: "Top 10s", text: "The last 10 Cup winners, the Original Six, top 10s.", face: "McDavid_EDM", bg: BG.EDM, big: "10" },
  { id: "five", team: "PIT", name: "Starting Five", tag: "5 names", text: "Name the top five on the ice.", face: "Crosby_PIT", bg: BG.PIT, big: "5" },
  { id: "wore", team: "NHL", name: "Who wore it?", tag: "Buzzer", text: "A number, a team, a buzzer race.", face: "Jagr", bg: BG.CZE, big: "#" },
  { id: "draft", team: "EDM", name: "Draft Day", tag: "1st picks", text: "First overall picks. You're on the clock.", face: "Draisaitl_EDM", bg: BG.EDM, big: "1st", fit: "height:100%;width:46%;right:0" },
  { id: "locker", team: "WSH", name: "The Locker Room", tag: "Hi · Lo", text: "Higher or lower, stall by stall.", face: "Ovechkin", bg: BG.WSH, big: "↑↓" }
];
function modes(){
  /* any plug-in game that isn't in the design's six still gets a bar */
  const extra = (P.games || []).filter(g => !MODES.some(m => m.id === g.id))
    .map(g => ({ id: g.id, name: g.title, tag: "New", text: g.sub || "", face: null, team: "NHL", bg: BG.NHL, big: "?" }));
  return MODES.concat(extra);
}
const TIPS = [
  "A <b>hat trick</b> is three goals by one player in one game.",
  "The Stanley Cup was first awarded in <b>1893</b>.",
  "An <b>empty-net goal</b> is scored after the other team pulls its goalie.",
  "The Original Six are <b>BOS, CHI, DET, MTL, NYR and TOR</b>."
];
const FACTS = "The Canadiens have won 24 Stanley Cups · Alex Ovechkin passed Wayne Gretzky with his 895th goal in April 2025 · Sidney Crosby went first overall in the 2005 draft · Mario Lemieux went first overall in 1984 · The Original Six: BOS, CHI, DET, MTL, NYR, TOR · ";
/* NHL: the stats centre (app/nhl/nhl-tab.js); its sub-pages (#nhl-standings, #nhl-team-MTL…) are all route "nhl" */
const TABS = [["play", "#home"], ["pool", "#pool"], ["table", "#table"], ["nhl", "#nhl"], ["me", "#me"]];
const TAB_OF = { home: "play", pool: "pool", table: "table", nhl: "nhl", me: "me" };

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
function flash(){ const f = document.getElementById("p26flash"); if(!f || reduced()) return; f.classList.remove("go"); void f.offsetWidth; f.classList.add("go"); }
let booting = false;
/* the title screen: layered (app/p26/boot26.js) so it fits a phone, a tablet and a
   wide screen. The intro (beams, stick, puck, spray, logo slam, glint) is CSS on .p26-boot */
function boot(){
  const h = (location.hash || "#home").slice(1);
  let seen = false; try { seen = sessionStorage.getItem("puck.booted") === "1"; } catch(e){}
  const pre = () => document.documentElement.classList.remove("p26-pre");
  if(seen || (h && h !== "home")){ pre(); return; }
  try { sessionStorage.setItem("puck.booted", "1"); } catch(e){}
  booting = true;
  const b = document.createElement("button");
  b.className = "p26-boot"; b.type = "button"; b.setAttribute("aria-label", "Press start");
  b.innerHTML = P.p26boot.scene(stackedLogo(), stackedLogo());
  document.body.appendChild(b);
  document.documentElement.classList.add("p26-booting"); pre();
  b.focus({ preventScroll: true });
  P.p26boot.start(b);
  let gone = false;
  b.addEventListener("click", () => {
    if(gone) return; gone = true; booting = false;
    flash(); document.documentElement.classList.remove("p26-booting");
    if(reduced()){ b.remove(); return; }
    b.classList.add("out"); setTimeout(() => b.remove(), 420);
    entrance();
  });
}
/* after PRESS START: the header, the Play screen and the footer come in */
function entrance(){
  if(reduced()) return;
  const top = document.getElementById("p26top"), foot = document.getElementById("p26foot");
  run([...top.children], { y: -16, dur: 560, gap: 90, delay: 140 });
  run(items(), { y: 26, dur: 560, gap: 60, delay: 240 });
  run([foot], { y: 40, dur: 560, delay: 320 });
}

/* ---------- header and footer ---------- */
function shell(){
  const top = document.getElementById("p26top"), foot = document.getElementById("p26foot");
  top.innerHTML = '<a class="lg" href="#home" aria-label="PUCK 26, back to Play">' + headLogo() + "</a>" +
    '<nav class="p26-tabs" aria-label="Sections"><button class="sh" type="button" data-sh="-1" aria-label="Previous tab">LB</button>' +
    TABS.map(([t, h]) => '<a href="' + h + '" data-tab="' + t + '">' + t.toUpperCase() + "</a>").join("") +
    '<button class="sh" type="button" data-sh="1" aria-label="Next tab">RB</button><i class="ul" aria-hidden="true"></i></nav>';
  foot.innerHTML = '<div class="p26-ticker" aria-hidden="true"><b>NHL FACTS</b><span>' + FACTS + FACTS + "</span></div>" +
    '<div class="p26-hints"><button type="button" data-hint="a">' + ab("A") + 'SELECT</button><button type="button" data-hint="b">' + ab("B") + 'BACK</button><button type="button" data-hint="y">' + ab("Y") + "POOL</button></div>";
  top.querySelectorAll("[data-sh]").forEach(b => b.addEventListener("click", () => shiftTab(+b.dataset.sh)));
  foot.querySelector('[data-hint="a"]').addEventListener("click", () => { if(cur === "home") startMode(sel()); });
  foot.querySelector('[data-hint="b"]').addEventListener("click", () => { location.hash = "#home"; });
  foot.querySelector('[data-hint="y"]').addEventListener("click", () => { location.hash = "#pool"; });
  /* the arena around the column on wide screens, and the wipe used between screens */
  document.body.insertBefore(P.p26boot.arena(), document.body.firstChild);
  const w = document.createElement("div");
  w.className = "p26-wipe"; w.setAttribute("aria-hidden", "true");
  w.innerHTML = '<i class="pn"><span>' + headLogo() + "</span></i>";
  document.body.appendChild(w);
  window.addEventListener("resize", () => underline(false));
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(() => underline(false));
  const pre = () => P.p26rain.preload();
  if("requestIdleCallback" in window) requestIdleCallback(pre, { timeout: 2500 }); else setTimeout(pre, 1500);
}
let cur = null, prev = null;
function route(name){
  prev = cur; cur = name;
  const tab = TAB_OF[name];
  document.body.classList.toggle("p26-tab", !!tab);
  document.body.classList.toggle("p26-game", !tab);
  document.querySelectorAll(".p26-tabs [data-tab]").forEach(a => a.classList.toggle("on", a.dataset.tab === tab));
  underline(!!TAB_OF[prev]);
  closeLoad(true);
}
/* the gold line under the active tab glides to it */
function underline(glide){
  const nav = document.querySelector(".p26-tabs"), ul = nav && nav.querySelector(".ul"), on = nav && nav.querySelector("a.on");
  if(!ul || !on || !on.offsetWidth){ if(ul) ul.style.opacity = 0; return; }
  if(!glide || reduced()) ul.style.transition = "none";
  ul.style.opacity = 1;
  ul.style.transform = "translate(" + on.offsetLeft + "px," + (on.offsetTop + on.offsetHeight + 1) + "px) scaleX(" + on.offsetWidth + ")";
  if(!glide || reduced()){ void ul.offsetWidth; ul.style.transition = ""; }
}

/* ---------- screen transitions ----------
   app.js route() asks leave(next) how long to wait (the wipe closing), renders, then
   calls enter(next). Tabs slide sideways by direction with their content staggered,
   a game opens out of the loading screen, leaving a game is a skewed wipe. Every new
   route cancels what is still running, so quick tab switching never queues up. */
let anims = [], wipeT = 0, fromLoad = false, mo = null;
const isTab = k => !!TAB_OF[k];
const TAB_I = k => TABS.findIndex(([t]) => t === TAB_OF[k]);
function stopAll(){ anims.forEach(a => { try { a.cancel(); } catch(e){} }); anims = []; if(mo){ mo.disconnect(); mo = null; } }
function run(els, o){
  if(reduced() || !els) return;
  const ease = "cubic-bezier(.16,1,.3,1)";
  [...els].slice(0, 14).forEach((el, i) => {
    if(!el || !el.animate) return;
    const tf = (o.x ? "translateX(" + o.x + "px) " : "") + (o.y ? "translateY(" + o.y + "px) " : "") + (o.s ? "scale(" + o.s + ")" : "");
    const a = el.animate([{ opacity: o.o == null ? 0 : o.o, transform: tf || "none" }, { opacity: 1, transform: "none" }],
      { duration: o.dur || 380, delay: (o.delay || 0) + Math.min(i, 9)*(o.gap || 0), easing: ease, fill: "backwards" });
    anims.push(a);
    a.onfinish = () => { const k = anims.indexOf(a); if(k >= 0) anims.splice(k, 1); };
  });
}
/* what to stagger: the screen's top-level blocks (one level into a wrapper) */
function items(){
  const app = document.getElementById("app"), out = [];
  const flat = el => [...el.children].forEach(c => {
    if(out.length > 14) return;
    if(c.matches(".p26-play,.gx,.wrap,.p26-sec,.fo,.stack,form") && !c.matches(".card,.game,.frame") && c.children.length) flat(c);
    else if(getComputedStyle(c).position !== "fixed") out.push(c);
  });
  if(app) flat(app);
  return out;
}
function wipe(dir, phase){
  const w = document.querySelector(".p26-wipe"); if(!w || reduced()) return;
  clearTimeout(wipeT);
  w.dataset.dir = dir < 0 ? "l" : "r";
  w.classList.remove("cover", "open"); void w.offsetWidth;
  w.classList.add(phase);
  if(phase === "open") wipeT = setTimeout(() => w.classList.remove("open"), 560);
}
function leave(next){
  stopAll();
  fromLoad = !!document.querySelector(".p26-load.done");
  if(reduced() || booting || cur === null || next === cur) return 0;
  if(document.querySelector(".p26-load")) return 0;
  /* out of a game to a tab, or straight into a game from a tab (a link, not the menu): the wipe */
  if(!isTab(cur) && isTab(next)){ wipe(-1, "cover"); return 210; }
  if(isTab(cur) && !isTab(next)){ wipe(1, "cover"); return 210; }
  return 0;
}
const depth = k => k === "list" ? 2 : 1;
function enter(next){
  const was = prev, w = document.querySelector(".p26-wipe");
  const wiping = w && w.classList.contains("cover");
  if(wiping) wipe(w.dataset.dir === "l" ? -1 : 1, "open");
  if(reduced() || booting) return;
  if(fromLoad){ fromLoad = false; run(items(), { y: 34, s: .97, o: .2, dur: 600, gap: 55 }); return; }
  if(was === null){ run(items(), { y: 18, dur: 460, gap: 45 }); return; }
  if(isTab(next) && isTab(was)){
    if(next === was) return;
    const d = Math.sign(TAB_I(next) - TAB_I(was)) || 1;
    run(items(), { x: 30*d, dur: 440, gap: 38 });
    watch();
    return;
  }
  if(isTab(next)){
    const top = document.getElementById("p26top"), foot = document.getElementById("p26foot");
    run([...top.children], { y: -12, dur: 480, gap: 60, delay: 60 });
    run(items(), { x: -30, dur: 500, gap: 40, delay: 100 });
    run([foot], { y: 30, dur: 480, delay: 140 });
    watch();
    return;
  }
  /* game to game: deeper slides in from the right, back up from the left */
  const d = was === next ? 0 : (was === "list" && next === "lists") || (was === next) ? -1 : depth(next) >= depth(was) ? 1 : -1;
  run(items(), d ? { x: 30*d, dur: 440, gap: 40, delay: wiping ? 80 : 0 } : { y: 14, dur: 380, gap: 35 });
}
/* tabs fill in after their data loads (Pool, Table): stagger those blocks in too */
function watch(){
  const app = document.getElementById("app"); if(!app || !window.MutationObserver) return;
  const t0 = Date.now();
  const obs = new MutationObserver(list => {
    if(Date.now() - t0 > 2500){ obs.disconnect(); if(mo === obs) mo = null; return; }
    const els = [];
    list.forEach(m => m.addedNodes.forEach(n => {
      if(n.nodeType !== 1 || n.closest(".p26-menu,.preview,#poolslot") || n.offsetHeight < 24) return;
      els.push(...(n.matches(".stack,.rows,.rules") && n.children.length ? n.children : [n]));
    }));
    if(els.length) run(els.slice(0, 10), { y: 16, dur: 420, gap: 45 });
  });
  obs.observe(app, { childList: true, subtree: true });
  mo = obs;
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
    (m.face ? '<img class="who" src="' + face(m.face) + '" alt=""' + (m.fit ? ' style="' + m.fit + '"' : "") + ">" : "") +
    '<div class="txt"><small>MODE ' + String(i + 1).padStart(2, "0") + " · " + esc(m.tag.toUpperCase()) + "</small><h3>" + esc(m.name) + "</h3><p>" + esc(m.text) + "</p>" +
    '<button class="playa" type="button" data-play>' + ab("A") + "PLAY</button></div>";
}
function play(app){
  const ms = modes(); selI = Math.min(selI, ms.length - 1);
  app.innerHTML = '<div class="p26-play">' +
    '<div id="poolslot"><a class="strip" href="#pool" id="strip"><span class="k">THE<br>POOL</span><span class="vs"><span class="clk" style="font-size:2.6cqw;color:var(--mist);text-shadow:none">LOADING…</span></span><span class="clk"></span><span class="go">►</span></a></div>' +
    '<div class="preview" id="pv">' + previewHTML(ms[selI], selI) + "</div>" +
    '<div class="p26-menu" role="listbox" aria-label="Modes">' + ms.map((m, i) => '<button class="item' + (i === selI ? " sel" : "") + '" type="button" role="option" aria-selected="' + (i === selI) + '" data-i="' + i + '"><span>' + esc(m.name) + "</span><em>" + esc(m.tag.toUpperCase()) + "</em></button>").join("") + "</div></div>";
  app.querySelectorAll(".item").forEach(el => el.addEventListener("click", () => { const i = +el.dataset.i; i === selI ? startMode(ms[i]) : select(i); }));
  wirePlay();
  /* the Pool owns the top of Play: app/pool/pool.js can set PUCK.poolHome(el) to draw
     its own block in #poolslot (cleanup through PUCK.ui.onLeave); otherwise the strip */
  if(typeof P.poolHome === "function"){ try { P.poolHome(document.getElementById("poolslot")); return; } catch(e){ console.error(e); } }
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

/* ---------- loading screen: the 32 logos rain down and pile up, then the real mode ---------- */
let loadT = 0, rain = null;
function closeLoad(soft){
  clearTimeout(loadT);
  if(rain){ const r = rain; rain = null; setTimeout(() => r.stop(), soft ? 420 : 0); }
  document.querySelectorAll(".p26-load").forEach(l => {
    if(l.classList.contains("out")) return;
    if(reduced()){ l.remove(); return; }
    l.classList.add("out", soft && l.classList.contains("done") ? "go" : "cancel");
    setTimeout(() => l.remove(), soft ? 420 : 200);
  });
}
function startMode(m){
  if(!m) return;
  closeLoad();
  const dur = reduced() ? 500 : 2000, i = modes().indexOf(m);
  const L = document.createElement("div");
  L.className = "p26-load"; L.setAttribute("role", "dialog"); L.setAttribute("aria-label", "Loading " + m.name);
  L.style.setProperty("--dur", dur + "ms"); L.style.setProperty("--bg", m.bg);
  L.innerHTML = '<div class="ld-beams" aria-hidden="true"><i></i><i></i><i></i></div>' +
    '<div class="ld-rain" aria-hidden="true"><span class="ld-big">' + esc(m.big) + '</span><canvas></canvas><i class="ld-ice"></i></div>' +
    '<div class="box"><small>MODE ' + String(Math.max(0, i) + 1).padStart(2, "0") + " · " + esc(m.tag.toUpperCase()) + "</small><h3>" + esc(m.name) + "</h3>" +
    '<p class="tip"><b>TIP · </b>' + TIPS[Math.max(0, i) % TIPS.length] + "</p>" +
    '<div class="lbl"><span>LOADING<em></em></span><span>' + ab("B") + ' BACK</span></div><div class="bar"><i></i></div></div>';
  document.body.appendChild(L);
  rain = P.p26rain.run(L.querySelector("canvas"), { hero: m.team || "NHL", seed: i + 1 });
  L.addEventListener("click", () => closeLoad());
  loadT = setTimeout(() => { L.classList.add("done"); location.hash = "#" + m.id; }, dur + 60);
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

P.p26 = { shell, boot, route, leave, enter, play, startMode, clock, MODES };
})();
