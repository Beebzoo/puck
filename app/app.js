/* PUCK: the screens. A tiny hash router; each screen writes #app and may
   register a cleanup (the rink, timers) that runs when you leave it. */
(function(){
const P = window.PUCK, C = window.PUCK_CONFIG, S = P.scoring;
const app = document.getElementById("app"), tabbar = document.getElementById("tabbar");
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
let cleanup = [];
const onLeave = fn => cleanup.push(fn);
const logoImg = (abbr, size = 40, dark) => '<img class="logo-img" src="' + P.logo(abbr, dark) + '" alt="' + esc(P.team(abbr).name) + '" width="' + size + '" height="' + size + '" loading="lazy">';
const band = (title, kick, back) => '<header class="band"><div class="wrap"><div class="row">' + (back ? '<a class="back" href="' + back + '" aria-label="Back">‹</a>' : "") +
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
async function route(){
  for(const f of cleanup.splice(0)) try { f(); } catch(e){}
  const h = (location.hash || "#home").slice(1);
  const [name, arg] = h.split(/-(.+)/);
  const plug = P.games.find(g => g.id === name);
  const fn = name === "list" ? listPlay : plug ? plug.render : ROUTES[name] || home;
  const tab = { home: "home", faceoff: "home", lists: "home", list: "home", pool: "pool", table: "table", me: "me" }[name] || "home";
  $$("a", tabbar).forEach(a => a.classList.toggle("on", a.dataset.tab === tab));
  window.scrollTo(0, 0);
  try { await fn(arg); } catch(err){ console.error(err); app.innerHTML = band("Oops", "", "#home") + '<div class="wrap"><p class="err">' + esc(err.message || err) + "</p></div>"; }
}
window.addEventListener("hashchange", route);

/* ---------------- home ---------------- */
let introPlayed = false;
async function home(){
  const me = await P.store.me();
  app.innerHTML = '<div class="stage"><div class="wrap"><div class="show" id="logo" title="Replay"></div><div class="who">' +
    (me ? '<span class="chip">Playing as ' + esc(me.name) + "</span>" : '<a class="chip" href="#me">Sign in for the Pool</a>') +
    (P.store.mode === "demo" ? '<a class="chip" href="#me">Demo mode</a>' : "") + "</div></div></div>" +
    '<div class="wrap stack" style="margin-top:4px">' +
      '<div class="card" id="poolcard"><span class="label" style="color:#9fb2c4">The Pool</span><p class="one" style="margin-top:8px">Loading the next game…</p></div>' +
      '<div class="card light"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><div><h2>Faceoff</h2><p class="one">One on one, like BALL. Pass with a right answer, shoot, score.</p></div>' +
        '<img src="' + P.NHL_LOGO() + '" alt="" width="54" height="54" style="flex:none"></div><a class="pill wide" href="#faceoff" style="margin-top:12px">Play</a></div>' +
      '<div class="tiles"><a class="tile" href="#lists"><b>Lists</b><span>The last 10 Cup winners, the Original Six, top 10s</span></a>' +
        '<a class="tile" href="#table"><b>Table</b><span>Who is winning the Pool</span></a>' +
        P.games.map(g => '<a class="tile" href="#' + g.id + '"><b>' + esc(g.title) + "</b><span>" + esc(g.sub) + "</span></a>").join("") + "</div>" +
    "</div>";
  const L = $("#logo"), play = () => { L.innerHTML = P.brand.faceoff(); const l = L.firstChild; void l.offsetWidth; l.classList.add("play"); };
  if(introPlayed) L.innerHTML = P.brand.faceoff(); else { introPlayed = true; play(); }
  L.addEventListener("click", play);
  try {
    const [{ games }, picks] = await Promise.all([P.nhl.poolGames(), P.store.picks()]);
    const next = games.find(g => !g.final && !g.live && new Date(g.start) > Date.now()), live = games.find(g => g.live);
    const g = live || next, card = $("#poolcard");
    if(!g || !card) return;
    const mine = me && picks.find(p => p.user === me.id && p.game_id === g.id);
    card.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center"><span class="label" style="color:#9fb2c4">The Pool · ' + (live ? '<span style="color:#ff8a8f">Live</span>' : "Next up") + "</span>" +
      '<span class="label" style="color:#9fb2c4">' + (live ? "" : "locks in " + until(g.start)) + "</span></div>" +
      '<div style="display:flex;align-items:center;justify-content:center;gap:14px;margin:12px 0 6px">' + logoImg(g.away.abbr, 54, true) +
      '<span style="font:900 26px/1 var(--display)">' + (live ? (g.away.score + "–" + g.home.score) : "@") + "</span>" + logoImg(g.home.abbr, 54, true) + "</div>" +
      '<p class="one" style="text-align:center">' + esc(when(g.start)) + " · " + (mine ? "Your pick: " + mine.away + "–" + mine.home + (mine.ending !== "REG" ? " " + mine.ending : "") : "No pick yet") + "</p>" +
      '<div style="text-align:center;margin-top:10px"><a class="btn2" href="#pool" style="display:inline-block;text-decoration:none">' + (mine || live ? "Open the Pool" : "Make your pick") + "</a></div>";
  } catch(e){ const c = $("#poolcard"); if(c) c.innerHTML = '<span class="label" style="color:#9fb2c4">The Pool</span><p class="one" style="margin-top:8px">Can\'t reach the NHL feed right now.</p><a class="btn2" href="#pool" style="display:inline-block;margin-top:10px;text-decoration:none">Open the Pool</a>'; }
}

/* ---------------- the Pool ---------------- */
const ENDS = [["REG", "Regulation"], ["OT", "Overtime"], ["SO", "Shootout"]];
async function pool(){
  app.innerHTML = band("The Pool", C.POOL_TEAMS.map(t => P.team(t).name.split(" ").pop()).join(" · ")) + '<div class="wrap" id="pl"><p class="one">Loading games…</p></div>';
  const box = $("#pl");
  const me = await P.store.me();
  let feed, picks, players;
  try { [feed, picks, players] = await Promise.all([P.nhl.poolGames(), P.store.picks(), P.store.players()]); }
  catch(e){ box.innerHTML = '<p class="err">' + (/puck_|schema cache/.test(e.message) ? "The Pool isn't set up in Supabase yet: run <b>supabase/schema.sql</b> in the SQL editor (README step 1)."
    : /NHL feed|fetch/i.test(e.message) ? "Can't reach the NHL feed: " + esc(e.message) + ". On your computer, run <b>node server/serve.js</b> and open the address it prints."
    : "Couldn't load the Pool: " + esc(e.message)) + "</p>"; return; }
  const games = feed.games, now = Date.now();
  const upcoming = games.filter(g => !g.final && !g.live && new Date(g.start) > now).slice(0, 8);
  const live = games.filter(g => g.live || (!g.final && new Date(g.start) <= now));
  const done = games.filter(g => g.final).slice(-10).reverse();
  const nameOf = id => (players.find(p => p.id === id) || { name: "?" }).name;
  let html = "";
  if(feed.offlineSince) html += '<p class="note">Offline: these are the games as of ' + esc(when(new Date(feed.offlineSince).toISOString())) + ".</p>";
  if(!me) html += '<p class="note">' + (P.store.mode === "online" ? 'Sign in on <a href="#me">Me</a> to make picks.' : "") + "</p>";
  if(P.store.mode === "demo") html += '<p class="note">Demo mode: picks stay on this phone. Switch between Martijn, Felix and Ale on <a href="#me">Me</a>. Sharing picks needs Supabase (see the README).</p>';
  if(live.length) html += '<div class="sectitle"><h2>Live</h2></div><div class="stack">' + live.map(g => gameCard(g, "live")).join("") + "</div>";
  html += '<div class="sectitle"><h2>Next up</h2><span class="label">Locks at puck drop</span></div><div class="stack">' + (upcoming.length ? upcoming.map(g => gameCard(g, "open")).join("") : '<p class="one">No games scheduled.</p>') + "</div>";
  if(done.length) html += '<div class="sectitle"><h2>Results</h2></div><div class="stack">' + done.map(g => gameCard(g, "final")).join("") + "</div>";
  box.innerHTML = html;

  function gameCard(g, kind){
    let ps = picks.filter(p => p.game_id === g.id); const mine = me && ps.find(p => p.user === me.id);
    const top = '<div class="top"><span>' + esc(when(g.start)) + "</span>" + (kind === "open" ? '<span class="lock">Locks in ' + until(g.start) + "</span>" :
      kind === "live" ? '<span class="live">Live' + (g.period ? " · P" + g.period : "") + "</span>" : "<span>Final" + (g.ending && g.ending !== "REG" ? " · " + g.ending : "") + "</span>") + "</div>";
    const side = (t, tag) => '<div class="side">' + logoImg(t.abbr, 58) + "<b>" + esc(t.abbr) + "</b><small>" + tag + "</small></div>";
    if(kind === "open"){
      const pk = mine ? { ...mine } : { home: 0, away: 0, ending: "REG", joker: false };
      return '<div class="game" data-id="' + g.id + '" data-start="' + g.start + '" data-h="' + pk.home + '" data-a="' + pk.away + '" data-end="' + pk.ending + '" data-j="' + (pk.joker ? 1 : 0) + '">' + top +
        '<div class="match">' + side(g.away, "Away") + '<div class="mid"><small>Your pick</small></div>' + side(g.home, "Home") + "</div>" +
        '<div class="pickrow"><div class="stepper" data-k="a"><button type="button" data-d="-1" aria-label="One less for ' + g.away.abbr + '">−</button><output>' + pk.away + '</output><button type="button" data-d="1" aria-label="One more for ' + g.away.abbr + '">+</button></div>' +
        '<span style="font:900 22px/1 var(--display);color:var(--muted)">–</span>' +
        '<div class="stepper" data-k="h"><button type="button" data-d="-1" aria-label="One less for ' + g.home.abbr + '">−</button><output>' + pk.home + '</output><button type="button" data-d="1" aria-label="One more for ' + g.home.abbr + '">+</button></div></div>' +
        '<div class="ends">' + ENDS.map(([k, n]) => '<button type="button" class="end' + (pk.ending === k ? " on" : "") + '" data-end="' + k + '">' + n + "</button>").join("") + "</div>" +
        '<div class="gamefoot"><button type="button" class="joker' + (pk.joker ? " on" : "") + '">★ Joker ×' + P.SCORING.jokerMult + '</button><span class="saved" aria-live="polite">' + (mine ? "Saved" : "") + "</span></div>" +
        '<div class="picks">' + players.filter(p => !me || p.id !== me.id).map(p => '<div class="prow"><b>' + esc(p.name) + "</b><span></span><span class=\"pts zero\">" + (ps.some(x => x.user === p.id) ? "picked ✓" : "no pick") + "</span></div>").join("") + "</div></div>";
    }
    const final = kind === "final";
    ps = ps.filter(p => !p.hidden);
    const res = S.scoreGame(final ? g : { ...g, final: true, ending: (g.period || 0) > 4 ? "SO" : (g.period || 0) > 3 ? "OT" : "REG" }, ps, P.SCORING);
    return '<div class="game">' + top + '<div class="match">' + side(g.away, "Away") + '<div class="mid"><span class="score">' + (g.away.score ?? "–") + "–" + (g.home.score ?? "–") + "</span><small>" + (final ? (g.ending === "REG" ? "Regulation" : g.ending === "OT" ? "Overtime" : "Shootout") : "If it ended now") + "</small></div>" + side(g.home, "Home") + "</div>" +
      '<div class="picks">' + (ps.length ? ps.slice().sort((a, b) => (res[b.user] || { pts: 0 }).pts - (res[a.user] || { pts: 0 }).pts).map(p => {
        const r = res[p.user] || { pts: 0, parts: [] };
        return '<div class="prow"><b>' + esc(nameOf(p.user)) + (p.joker ? " ★" : "") + '</b><span class="pk">' + p.away + "–" + p.home + (p.ending !== "REG" ? " <small>" + p.ending + "</small>" : "") + '</span><span class="pts' + (r.pts ? "" : " zero") + '">' + (r.pts ? "+" + r.pts : "0") + "</span>" +
          (r.parts.length ? '<span class="why">' + r.parts.map(x => esc(x[0]) + " +" + x[1]).join(" · ") + "</span>" : "") + "</div>";
      }).join("") : '<p class="one">Nobody picked this one.</p>') + "</div></div>";
  }

  /* editing a pick: steppers, the ending, the joker; saved as you go */
  for(const card of $$(".game[data-id]", box)){
    const st = () => ({ game_id: +card.dataset.id, start_utc: card.dataset.start, home: +card.dataset.h, away: +card.dataset.a, ending: card.dataset.end, joker: card.dataset.j === "1" });
    const paint = () => { const p = st(); $('.stepper[data-k="h"] output', card).textContent = p.home; $('.stepper[data-k="a"] output', card).textContent = p.away;
      $$(".end", card).forEach(b => b.classList.toggle("on", b.dataset.end === p.ending)); $(".joker", card).classList.toggle("on", p.joker); };
    let t = 0;
    const commit = (msg) => {
      paint();
      const p = st(), out = $(".saved", card);
      if(!me){ out.textContent = "Sign in to save"; return; }
      if(p.home === p.away){ out.style.color = "var(--muted)"; out.textContent = "Pick a winner: no ties in the NHL"; return; }
      if(!S.validPick(p)){ out.style.color = "var(--muted)"; out.textContent = "Overtime and shootouts end one goal apart"; return; }
      out.style.color = ""; out.textContent = "Saving…";
      clearTimeout(t); t = setTimeout(async () => {
        try { await P.store.savePick(p); out.textContent = msg || "Saved"; const i = picks.findIndex(x => x.user === me.id && x.game_id === p.game_id); const row = { ...p, user: me.id }; if(i >= 0) picks[i] = row; else picks.push(row); }
        catch(e){ out.style.color = "var(--bad)"; out.textContent = e.message; }
      }, 450);
    };
    $$(".stepper button", card).forEach(b => b.addEventListener("click", () => {
      const k = b.parentNode.dataset.k, key = k === "h" ? "h" : "a";
      card.dataset[key] = Math.max(0, Math.min(15, +card.dataset[key] + +b.dataset.d));
      const p = st();
      if(p.ending !== "REG" && Math.abs(p.home - p.away) !== 1 && p.home !== p.away){ card.dataset.end = "REG"; }
      commit();
    }));
    $$(".end", card).forEach(b => b.addEventListener("click", () => {
      card.dataset.end = b.dataset.end;
      const p = st();
      if(b.dataset.end !== "REG" && Math.abs(p.home - p.away) !== 1){
        /* overtime: the winner by one. Keep whoever leads; from a tie, give it to the home team */
        if(p.home >= p.away){ card.dataset.h = Math.max(p.home, p.away + 1, 1); card.dataset.a = card.dataset.h - 1; }
        else { card.dataset.a = Math.max(p.away, 1); card.dataset.h = card.dataset.a - 1; }
      }
      commit();
    }));
    $(".joker", card).addEventListener("click", async () => {
      if(!me) return;
      const p = st(), wk = S.weekKey(p.start_utc);
      if(card.dataset.j === "1"){ card.dataset.j = "0"; commit(); return; }
      const other = picks.find(x => x.user === me.id && x.joker && x.game_id !== p.game_id && S.weekKey(x.start_utc || "") === wk);
      if(other && new Date(other.start_utc) <= Date.now()){ $(".saved", card).textContent = "This week's joker is already played"; return; }
      if(other){ try { await P.store.savePick({ ...other, joker: false }); other.joker = false; const oc = $('.game[data-id="' + other.game_id + '"]', box); if(oc){ oc.dataset.j = "0"; $(".joker", oc).classList.remove("on"); } } catch(e){} }
      card.dataset.j = "1"; commit("Saved · joker moved here");
    });
  }
}

/* ---------------- the table ---------------- */
async function table(){
  app.innerHTML = band("Table", "Season " + seasonLabel()) + '<div class="wrap" id="tb"><p class="one">Adding it up…</p></div>';
  const box = $("#tb");
  let games, picks, players;
  try { [{ games }, picks, players] = await Promise.all([P.nhl.poolGames(), P.store.picks(), P.store.players()]); }
  catch(e){ box.innerHTML = '<p class="err">' + esc(e.message) + "</p>"; return; }
  const rows = S.table(games, picks.filter(p => !p.hidden), players, P.SCORING);
  const doneN = games.filter(g => g.final).length;
  box.innerHTML = '<table class="lt"><thead><tr><th>#</th><th>Player</th><th title="Right winners">W</th><th title="Exact scores">Ex</th><th title="OT and shootout calls">OT</th><th>Pts</th></tr></thead><tbody>' +
    rows.map((r, i) => "<tr><td>" + (i + 1) + "</td><td>" + esc(r.name) + '<div class="form" style="justify-content:flex-start;margin-top:5px">' + r.form.map(x => '<i class="' + (x >= 5 ? "g" : x > 0 ? "b" : "") + '">' + x + "</i>").join("") + "</div></td><td>" + r.winners + "</td><td>" + r.exact + "</td><td>" + r.calls + '</td><td class="pts">' + r.pts + "</td></tr>").join("") +
    '</tbody></table><p class="one" style="margin-top:8px">' + doneN + " finished games so far. Ties are split on exact scores, then right winners.</p>" +
    '<div class="sectitle"><h2>How points work</h2></div><div class="rules">' +
    [["Right winner", P.SCORING.winner], ["Exact score, on top of the winner", P.SCORING.exact], ["Right winner and goal difference (not exact)", P.SCORING.diff],
     ["Called overtime or the shootout, and it went there", P.SCORING.ending], ["… and you had the winner too", P.SCORING.endingWinner],
     ["Lone wolf: the only one with the right winner", P.SCORING.loneWolf]].map(([t, n]) => '<div class="rule"><span>' + t + "</span><b>+" + n + "</b></div>").join("") +
    '<div class="rule"><span>Joker: one game a week counts double. Move it as long as that game hasn\'t started.</span><b>×' + P.SCORING.jokerMult + "</b></div></div>" +
    '<p class="one" style="margin-top:10px">Best possible game: 2 + 3 + 1 + 1 + 1 = 8, or 16 with the joker. Picks lock at puck drop and you only see the others\' picks after that. These rules are a first go: see _plans/pool.md for the other ideas.</p>';
}
function seasonLabel(){ const d = new Date(), y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1; return y + "-" + String(y + 1).slice(2); }

/* ---------------- me ---------------- */
async function me(){
  const m = await P.store.me();
  let html = band("Me", P.store.mode === "demo" ? "Demo mode" : m ? m.name : "Sign in") + '<div class="wrap stack">';
  if(P.store.mode === "demo"){
    const ps = await P.store.players();
    html += '<div class="card light stack"><h2 style="font-size:24px">Who\'s playing?</h2><p class="one">Demo mode keeps everything on this phone. Switch players to try the Pool as each of us.</p><div class="names">' +
      ps.map(p => '<button type="button" class="chip' + (m && m.id === p.id ? " on" : "") + '" data-id="' + p.id + '">' + esc(p.name) + "</button>").join("") + "</div></div>" +
      '<p class="note">To share picks between three phones: create a Supabase project, run <b>supabase/schema.sql</b>, deploy the <b>nhl</b> function and fill in <b>app/config.js</b>. The steps are in README.md.</p>';
  } else if(!m){
    html += '<div class="card light stack"><h2 style="font-size:24px" id="ftitle">Sign in</h2>' +
      '<div class="field" id="fname" hidden><label for="nm">Your name</label><input id="nm" autocomplete="nickname" maxlength="24"></div>' +
      '<div class="field"><label for="em">Email</label><input id="em" type="email" autocomplete="email"></div>' +
      '<div class="field"><label for="pw">Password</label><input id="pw" type="password" autocomplete="current-password" minlength="6"></div>' +
      '<div class="field" id="fcode" hidden><label for="cd">League code</label><input id="cd" autocomplete="off"></div>' +
      '<p class="err" id="ferr" hidden></p><button type="button" class="pill wide" id="go">Sign in</button>' +
      '<button type="button" class="ghost" id="sw">New here? Create an account</button></div>';
  } else {
    html += '<div class="card light stack"><h2 style="font-size:24px">' + esc(m.name) + '</h2><p class="one">' + (m.unnamed ? "Welcome! What should the others see as your name?" : "Signed in. Your picks count for the Table.") + '</p>' +
      '<div class="field"><label for="rn">Your name</label><input id="rn" maxlength="24" autocomplete="nickname" value="' + esc(m.unnamed ? "" : m.name) + '"></div>' +
      '<p class="err" id="rerr" hidden></p><button type="button" class="btn2" id="rsave" style="justify-self:start;background:var(--navy);">Save name</button>' +
      '<button type="button" class="ghost" id="out" style="justify-self:start">Sign out</button></div>';
  }
  const n = await P.questions.count();
  html += '<div class="card light"><span class="label">About</span><p class="one" style="margin-top:6px">PUCK, a hockey quiz for the three of us. ' + n + ' questions in the bank. Logos and data from the NHL, for private use.</p></div></div>';
  app.innerHTML = html;
  $$(".names .chip").forEach(b => b.addEventListener("click", async () => { await P.store.switchTo(b.dataset.id); me(); }));
  const out = $("#out"); if(out) out.addEventListener("click", async () => { await P.store.signOut(); me(); });
  const rs = $("#rsave");
  if(rs) rs.addEventListener("click", async () => { const e = $("#rerr"); e.hidden = true; try { await P.store.rename($("#rn").value); me(); } catch(x){ e.hidden = false; e.textContent = x.message; } });
  const go = $("#go");
  if(go){
    let signup = false;
    $("#sw").addEventListener("click", () => { signup = !signup; $("#fname").hidden = $("#fcode").hidden = !signup; $("#ftitle").textContent = go.textContent = signup ? "Create account" : "Sign in"; $("#sw").textContent = signup ? "I have an account" : "New here? Create an account"; });
    go.addEventListener("click", async () => {
      const err = $("#ferr"); err.hidden = true; go.disabled = true;
      try {
        if(signup){ const r = await P.store.signUp($("#em").value.trim(), $("#pw").value, $("#nm").value.trim() || "Me", $("#cd").value); if(!r.session){ err.hidden = false; err.textContent = "Check your email to confirm, then sign in."; go.disabled = false; return; } }
        else await P.store.signIn($("#em").value.trim(), $("#pw").value);
        location.hash = "#pool";
      } catch(e){ err.hidden = false; err.textContent = e.message; go.disabled = false; }
    });
  }
}

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
