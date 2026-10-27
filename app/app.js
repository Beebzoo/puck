/* PUCK: the screens. A tiny hash router; each screen writes #app and may
   register a cleanup (the rink, timers) that runs when you leave it. */
(function(){
const P = window.PUCK, C = window.PUCK_CONFIG, S = P.scoring;
const app = document.getElementById("app");
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
let cleanup = [];
const onLeave = fn => cleanup.push(fn);
const logoImg = (abbr, size = 40, dark) => '<img class="logo-img" src="' + P.logo(abbr, dark) + '" alt="' + esc(P.team(abbr).name) + '" width="' + size + '" height="' + size + '" loading="lazy">';
/* a game's header (PUCK 26: chrome title, ember kick, the red B button leads back) */
const band = (title, kick, back) => '<header class="band"><div class="wrap"><div class="row">' + (back ? '<a class="back" href="' + back + '" aria-label="Back"><i class="ab b">B</i></a>' : "") +
  "<h1>" + esc(title) + "</h1></div>" + (kick ? '<span class="kick"><span>' + esc(kick) + "</span></span>" : "") + "</div></header>";
const fmt = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const when = iso => fmt.format(new Date(iso));
function until(iso){
  const m = Math.round((new Date(iso) - Date.now())/60000);
  if(m <= 0) return "now";
  if(m < 60) return m + " min";
  const h = Math.floor(m/60); if(h < 24) return h + "h " + (m % 60) + "m";
  return Math.floor(h/24) + "d " + (h % 24) + "h";
}

/* ---------------- router ---------------- */
const ROUTES = { home, pool, table, me, faceoff, lists };
/* plug-in games: P.addGame({ id, title, sub, render(arg) }) from app/games/*.js;
   they get a Home tile and the route #<id> (or #<id>-<arg>) */
P.games = P.games || [];
let routeN = 0;
async function route(){
  const n = ++routeN;
  const h = (location.hash || "#home").slice(1);
  const [name, arg] = h.split(/-(.+)/);
  const plug = P.games.find(g => g.id === name);
  const fn = name === "list" ? listPlay : plug ? plug.render : ROUTES[name] || home;
  const key = fn === home ? "home" : name;
  /* PUCK 26 shell (app/p26/p26.js): leave() may close a wipe first (a few hundred ms; a
     newer route wins), route() sets the tabs and chrome and closes the loading screen,
     enter() animates the new screen in. The screen renders its first HTML synchronously. */
  const wait = P.p26.leave(key);
  if(wait){ await new Promise(r => setTimeout(r, wait)); if(n !== routeN) return; }
  for(const f of cleanup.splice(0)) try { f(); } catch(e){}
  P.p26.route(key);
  window.scrollTo(0, 0);
  const run = (async () => fn(arg))();
  P.p26.enter(key);
  try { await run; } catch(err){ console.error(err); if(n === routeN) app.innerHTML = band("Oops", "", "#home") + '<div class="wrap"><p class="err">' + esc(err.message || err) + "</p></div>"; }
}
window.addEventListener("hashchange", route);

/* ---------------- home: the PUCK 26 Play screen (app/p26/p26.js) ---------------- */
async function home(){ P.p26.play(app); }

/* ---------------- the Pool, the Table and Me: app/pool/pool.js ---------------- */
async function pool(){ return P.pool.page(app, band); }
async function table(){ return P.pool.table(app, band); }
async function me(){ return P.pool.me(app, band); }

/* ---------------- Faceoff: One on One on ice, in app/faceoff.js ---------------- */
function faceoff(arg){ return P.faceoff.render(arg); }

/* ---------------- Lists ---------------- */
async function lists(){
  app.innerHTML = band("Lists", "Name them all", "#home") + '<div class="wrap stack">' + P.LISTS.map(l => {
    const ex = l.items.slice(0, 4).map(it => it.team ? logoImg(it.team, 30) : it.cc ? '<img class="flag" src="' + P.flag(it.cc) + '" alt="">' : "").join("");
    let best = null; try { best = JSON.parse(localStorage.getItem("puck.list." + l.id)); } catch(e){}
    return '<a class="card light" href="#list-' + l.id + '" style="text-decoration:none;color:inherit;display:grid;gap:6px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center"><h2 style="font-size:22px">' + esc(l.title) + '</h2><span class="label">' + (best ? best.got + "/" + l.items.length : l.items.length) + "</span></div>" +
      '<p class="one">' + esc(l.sub) + '</p><div style="display:flex;gap:6px;align-items:center;opacity:.8">' + ex + "</div></a>";
  }).join("") + '<p class="one">These are samples to try the game. The real lists will come from the question bank.</p></div>';
}
const norm = s => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
async function listPlay(id){
  const L = P.LISTS.find(l => l.id === id);
  if(!L){ location.hash = "#lists"; return; }
  const got = new Set(); let wrong = 0, gaveUp = false; const t0 = Date.now();
  const show = it => it.kind === "team" || L.kind === "team" ? P.team(it.team).name : L.kind === "year" ? String(it.year) : it.name;
  app.innerHTML = band(L.title, L.sub, "#lists") + '<div class="wrap"><div style="display:flex;justify-content:space-between;align-items:center;margin:4px 2px 10px"><span class="label" id="cnt"></span><button type="button" class="ghost" id="give">Give up</button></div>' +
    '<div class="slots" id="slots"></div><form class="guess" id="gf" autocomplete="off"><input id="gi" placeholder="Type an answer" aria-label="Your answer" enterkeyhint="go"><button class="pill" type="submit" style="padding:12px 18px">Go</button></form><div id="end"></div></div>';
  const paint = () => {
    $("#slots").innerHTML = L.items.map((it, i) => {
      const ok = got.has(i), miss = gaveUp && !ok;
      const pic = (ok || miss) ? (it.team ? logoImg(it.team, 40) : it.cc ? '<img class="flag" src="' + P.flag(it.cc) + '" alt="" style="width:34px;height:23px">' : "") : '<span class="ph"></span>';
      return '<div class="slot' + (ok ? " got" : miss ? " missed" : "") + '"><span class="lab">' + esc(it.label || i + 1) + "</span>" + (pic || '<span class="ph"></span>') + "<b>" + (ok || miss ? esc(show(it)) : "") + "</b></div>";
    }).join("");
    $("#cnt").textContent = got.size + " of " + L.items.length + (wrong ? " · " + wrong + " wrong" : "");
  };
  paint();
  const input = $("#gi");
  setTimeout(() => input.focus(), 50);
  function end(){
    $("#gf").hidden = true; $("#give").hidden = true;
    const secs = Math.round((Date.now() - t0)/1000);
    try { const prev = JSON.parse(localStorage.getItem("puck.list." + L.id)); if(!prev || got.size > prev.got) localStorage.setItem("puck.list." + L.id, JSON.stringify({ got: got.size, secs })); } catch(e){}
    $("#end").innerHTML = '<div class="card" style="margin-top:12px;text-align:center;display:grid;gap:8px;justify-items:center"><h2>' + (got.size === L.items.length ? "All " + L.items.length + "!" : got.size + " of " + L.items.length) + '</h2><p class="one">' +
      (gaveUp ? "The ones you missed are in red." : "In " + secs + " seconds, " + wrong + " wrong.") + '</p><a class="btn2" href="#lists" style="text-decoration:none">More lists</a></div>';
  }
  $("#gf").addEventListener("submit", e => {
    e.preventDefault();
    const v = norm(input.value); if(!v) return;
    let hit = [];
    L.items.forEach((it, i) => {
      if(got.has(i)) return;
      let names;
      if(L.kind === "team") names = P.teamAliases(it.team);
      else if(L.kind === "year") names = [String(it.year), String(it.year).slice(2)];
      else names = [it.name, ...(it.alias || [])];
      if(names.map(norm).includes(v)) hit.push(i);
    });
    if(hit.length){ hit.forEach(i => got.add(i)); input.value = ""; paint(); if(got.size === L.items.length) end(); }
    else { wrong++; input.classList.remove("shake"); void input.offsetWidth; input.classList.add("shake"); paint(); input.select(); }
  });
  $("#give").addEventListener("click", () => { gaveUp = true; paint(); end(); });
}

/* go. Games in their own files (app/games/*.js) register with PUCK.addGame
   before this runs, and get the shared helpers below as PUCK.ui. */
P.ui = { app, esc, $, $$, onLeave, band, logoImg, when };
route();
})();
