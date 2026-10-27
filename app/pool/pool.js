/* The Pool, front and centre. Everything the score-prediction game draws lives here:
   - PUCK.poolHome(el): the Pool block at the top of Play (next game, countdown,
     one-tap quick pick, who has picked, the live score, last result, your rank)
   - PUCK.pool.page / table / me: the Pool, Table and Me tabs (app.js routes to them)
   - the pick editor (score wheels, presets, ending, joker, LOCK IN), as a sheet or inline
   - the moments: the reveal at puck drop and the final-whistle results
   - reminders: a calendar file with every remaining game, an alarm 2 hours before
   Rules and numbers: app/scoring.js and P.SCORING (app/data.js). Data: app/store.js, app/nhl.js.
   Seen-state for the moments is kept per phone in localStorage (puck.pool.seen.<player>). */
(function(){
const P = window.PUCK = window.PUCK || {}, C = window.PUCK_CONFIG;
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const reduced = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
/* a little haptic, only once the person has touched the page (browsers block it before) */
const buzz = n => { try { if(navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) navigator.vibrate(n); } catch(e){} };
const SS = () => P.scoring, SC = () => P.SCORING;
const onLeave = fn => { if(P.ui && P.ui.onLeave) P.ui.onLeave(fn); };

/* ---------------- small helpers ---------------- */
const logoSrc = abbr => (window.PUCK_LOGOS && window.PUCK_LOGOS.dark[abbr]) || P.logo(abbr, true);
const logo = (abbr, cls) => '<img class="pl-lg' + (cls ? " " + cls : "") + '" src="' + logoSrc(abbr) + '" alt="' + esc(abbr) + '">';
const nick = abbr => { const n = P.team(abbr).name.split(" "); return n.length > 2 && /^(Maple|Red|Blue|Golden)$/.test(n[n.length - 2]) ? n.slice(-2).join(" ") : n[n.length - 1]; };
const fDay = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
const fTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const fShort = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const dayOf = iso => fDay.format(new Date(iso)).replace(",", "").toUpperCase();
const timeOf = iso => fTime.format(new Date(iso));
function relDay(iso){
  const d = new Date(iso), t = new Date(), k = x => x.getFullYear() + "-" + x.getMonth() + "-" + x.getDate();
  const tm = new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1), ys = new Date(t.getFullYear(), t.getMonth(), t.getDate() - 1);
  /* NHL games end in the small hours in Europe: a game from earlier today was "last night" */
  if(k(d) === k(t)) return d < t && d.getHours() < 9 ? "LAST NIGHT" : d.getHours() >= 17 ? "TONIGHT" : "TODAY";
  if(k(d) === k(tm)) return "TOMORROW";
  if(k(d) === k(ys)) return "LAST NIGHT";
  return dayOf(iso);
}
function clock(iso){
  if(P.p26 && P.p26.clock) return P.p26.clock(iso);
  const s = Math.floor((new Date(iso) - Date.now())/1000); if(s <= 0) return "LOCKED";
  const p = n => String(n).padStart(2, "0"); return p(Math.floor(s/3600)) + ":" + p(Math.floor(s % 3600/60)) + ":" + p(s % 60);
}
/* short day for the rows: TONIGHT, TMRW, THU 29 */
function shortDay(iso){ const r = relDay(iso); return r === "TOMORROW" ? "TMRW" : r === "LAST NIGHT" ? "LAST NT" : /^[A-Z]{3} \d/.test(r) ? r.split(" ").slice(0, 2).join(" ") : r; }
const ord = n => n + ({ 1: "ST", 2: "ND", 3: "RD" }[n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || "TH");
const plural = (n, w) => n + " " + w + (n === 1 ? "" : "s");
const ENDING = { REG: "Regulation", OT: "Overtime", SO: "Shootout" };

/* ---------------- data: one shared load for Play, Pool and Table ---------------- */
let D = null, loadedAt = 0, inflight = null;
const started = g => new Date(g.start) <= Date.now();
const isOpen = g => !g.final && !g.live && !started(g);
const isLive = g => !g.final && (g.live || started(g));
function stale(){
  if(!D || Date.now() - loadedAt > 45000) return true;
  /* a game has started since: the others' picks are visible now, so fetch again */
  return D.games.some(g => !g.final && started(g) && !D.startedAt.has(g.id));
}
async function load(force){
  if(!force && !stale()) return D;
  if(inflight) return inflight;
  inflight = (async () => {
    const me = await P.store.me();
    const [feed, picks, players] = await Promise.all([P.nhl.poolGames(), P.store.picks(), P.store.players()]);
    const games = feed.games;
    /* today's scoreboard adds the live clock and the teams' records */
    if(games.some(g => isLive(g) || (isOpen(g) && new Date(g.start) - Date.now() < 36*3600e3))){
      try {
        const b = await P.nhl.scoreNow();
        for(const g of games){
          const x = b[g.id]; if(!x) continue;
          g.clock = x.clock; g.intermission = x.intermission; g.away.record = x.away.record; g.home.record = x.home.record;
          if(!g.final && (x.state === "LIVE" || x.state === "CRIT")){
            g.live = true; g.period = x.period || g.period; g.ptype = x.ptype || g.ptype;
            if(x.away.score != null) g.away.score = x.away.score; if(x.home.score != null) g.home.score = x.home.score;
          }
        }
      } catch(e){}
    }
    D = { me, games, picks, players: players || [], offlineSince: feed.offlineSince, startedAt: new Set(games.filter(started).map(g => g.id)) };
    loadedAt = Date.now();
    return D;
  })();
  try { return await inflight; } finally { inflight = null; }
}
function reset(){ D = null; loadedAt = 0; }
function errMsg(e){
  const m = (e && e.message) || String(e);
  return /permission denied/i.test(m) ? "Supabase won't let the app read the Pool's tables: run the <b>grant</b> lines at the end of <b>supabase/schema.sql</b> in the SQL editor."
    : /schema cache|does not exist/i.test(m) ? "The Pool isn't set up in Supabase yet: run <b>supabase/schema.sql</b> in the SQL editor (README step 1)."
    : /NHL feed|fetch/i.test(m) ? "Can't reach the NHL feed right now (" + esc(m) + "). On your computer, run <b>node server/serve.js</b>."
    : "Couldn't load the Pool: " + esc(m);
}

/* picks: yours always; the others' only once the game has started (the database
   enforces that online; in demo mode we keep the secret ourselves) */
const meId = () => D && D.me ? D.me.id : null;
const nameOf = id => { const p = D.players.find(x => x.id === id); return p ? p.name : "?"; };
const myPick = g => D.picks.find(p => p.user === meId() && p.game_id === g.id && !p.hidden) || null;
const hasPicked = (g, uid) => D.picks.some(p => p.user === uid && p.game_id === g.id);
const shown = g => D.picks.filter(p => p.game_id === g.id && !p.hidden && (started(g) || p.user === meId()));
const others = () => D.players.filter(p => p.id !== meId());
/* each player's favourite team (puck_profiles.team): a small logo by the name */
const teamOf = id => { const p = D && D.players.find(x => x.id === id); return (p && p.team) || null; };
const tmark = id => { const t = teamOf(id); return t ? '<img class="pl-tmk" src="' + logoSrc(t) + '" alt="' + esc(t) + '">' : ""; };
/* a live game scored as if it ended now */
function asIfNow(g){
  if(g.final) return g;
  const e = g.ptype === "SO" || (g.period || 0) > 4 ? "SO" : g.ptype === "OT" || (g.period || 0) > 3 ? "OT" : "REG";
  return { ...g, final: true, ending: e, home: { ...g.home, score: g.home.score || 0 }, away: { ...g.away, score: g.away.score || 0 } };
}
const resultOf = g => SS().scoreGame(asIfNow(g), shown(g), SC());
const derby = g => SS().isDerby(g, SC());
const mult = g => derby(g) ? SC().derbyMult : 1;
const winSide = p => p.home > p.away ? "home" : "away";
const winAbbr = (p, g) => g[winSide(p)].abbr;
/* "MTL 3–2 OT": winner first, the way you'd say it */
const pickText = (p, g) => winAbbr(p, g) + " " + Math.max(p.home, p.away) + "–" + Math.min(p.home, p.away) + (p.ending !== "REG" ? " " + p.ending : "");
const scoreText = g => g.away.abbr + " " + (g.away.score ?? 0) + "–" + (g.home.score ?? 0) + " " + g.home.abbr;

/* this week's joker for the game's week: where it is and whether it can still move */
function jokerFor(g){
  const wk = SS().weekKey(g.start);
  const other = D.picks.find(p => p.user === meId() && p.joker && p.game_id !== g.id && p.start_utc && SS().weekKey(p.start_utc) === wk);
  const og = other && D.games.find(x => x.id === other.game_id);
  return { other, og, locked: !!(other && new Date(other.start_utc) <= Date.now()) };
}
const gameName = g => g ? g.away.abbr + " @ " + g.home.abbr : "another game";

async function savePick(g, st){
  if(!D.me) throw new Error(P.store.mode === "online" ? "Sign in first (on Me)." : "Pick a player on Me first.");
  if(started(g)) throw new Error("This game has started, picks are locked.");
  const row = { game_id: g.id, start_utc: g.start, home: st.home, away: st.away, ending: st.ending, joker: !!st.joker };
  if(!SS().validPick(row)) throw new Error(row.home === row.away ? "Pick a winner: no ties in the NHL." : "Overtime and shootouts end one goal apart.");
  if(row.joker){
    const j = jokerFor(g);
    if(j.locked) throw new Error("This week's joker is already played on " + gameName(j.og) + ".");
    if(j.other){ await P.store.savePick({ ...j.other, joker: false }); j.other.joker = false; }
  }
  await P.store.savePick(row);
  const i = D.picks.findIndex(p => p.user === meId() && p.game_id === g.id), mine = { ...row, user: meId() };
  if(i >= 0) D.picks[i] = mine; else D.picks.push(mine);
  buzz([12, 40, 18]);
  return mine;
}

/* banter: what the picks say, before and after */
function lines(g, phase){
  const ps = shown(g), out = [], n = ps.length;
  const who = id => id === meId() ? "You" : nameOf(id);
  const names = ids => { const a = ids.map(who); return a.length > 1 ? a.slice(0, -1).join(", ") + " and " + a[a.length - 1] : a[0]; };
  const missing = D.players.filter(p => !ps.some(x => x.user === p.id));
  if(phase === "reveal" || phase === "live"){
    if(derby(g)) out.push("Derby night: every point counts ×" + SC().derbyMult + ".");
    if(n >= 2){
      const sides = {}; for(const p of ps) (sides[winAbbr(p, g)] = sides[winAbbr(p, g)] || []).push(p.user);
      const keys = Object.keys(sides);
      if(keys.length === 1) out.push((n === 2 ? "Both" : "All " + n) + " on the " + nick(keys[0]) + ". Nobody dares.");
      else { const lone = keys.find(k => sides[k].length === 1 && n >= 3); if(lone) out.push(names(sides[lone]) + (sides[lone][0] === meId() ? " went" : " went") + " against the room: " + nick(lone) + "."); else out.push("Split down the middle."); }
      for(let i = 0; i < n; i++) for(let j = i + 1; j < n; j++) if(ps[i].home === ps[j].home && ps[i].away === ps[j].away && ps[i].ending === ps[j].ending) out.push(names([ps[i].user, ps[j].user]) + " picked the exact same score.");
    }
    for(const p of ps) if(p.ending === "SO") out.push(who(p.user) + " sees a shootout coming."); else if(p.ending === "OT") out.push(who(p.user) + " called overtime.");
    for(const p of ps) if(p.joker) out.push(who(p.user) + " played the joker here." );
    for(const p of ps) if(Math.abs(p.home - p.away) >= 4) out.push(who(p.user) + " expects a blowout.");
    if(missing.length && missing.length < D.players.length) out.push(names(missing.map(x => x.id)) + (missing.length === 1 && missing[0].id !== meId() ? " forgot to pick." : " forgot to pick."));
  }
  if(phase === "final"){
    const res = resultOf(g), win = g.home.score > g.away.score ? "home" : "away";
    const right = ps.filter(p => winSide(p) === win);
    if(n && !right.length) out.push("Nobody saw the " + nick(g[win].abbr) + " coming.");
    if(n >= 2 && right.length === n) out.push("Clean sweep: " + (n === 2 ? "both" : "all " + n) + " had the " + nick(g[win].abbr) + ".");
    for(const p of ps) if(res[p.user] && res[p.user].parts.some(x => x[0] === "Exact score")) out.push(who(p.user) + " nailed it: " + pickText(p, g) + " on the nose.");
    for(const p of ps) if(res[p.user] && res[p.user].parts.some(x => x[0] === "Lone wolf")) out.push(who(p.user) + (p.user === meId() ? " were" : " was") + " the lone wolf.");
    for(const p of ps) if(p.joker) out.push(res[p.user].pts ? who(p.user) + "'s joker paid off: +" + res[p.user].pts + "." : who(p.user) + "'s joker came up empty.");
    for(const p of ps) if(g.ending !== "REG" && p.ending === g.ending) out.push(who(p.user) + " called the " + (g.ending === "SO" ? "shootout" : "overtime") + ".");
    if(missing.length && n) out.push(names(missing.map(x => x.id)) + " didn't pick. Zero.");
  }
  return [...new Set(out)].slice(0, 4).map(s => s.replace(/^You's/, "Your"));
}

/* ---------------- moments: seen-state per player, per phone ---------------- */
const seenKey = () => "puck.pool.seen." + (meId() || "anon");
function seen(){ try { const s = JSON.parse(localStorage.getItem(seenKey())); if(s && s.r && s.f) return s; } catch(e){} return { r: [], f: [] }; }
function markSeen(kind, id){ const s = seen(); if(!s[kind].includes(id)) s[kind].push(id); s.r = s.r.slice(-60); s.f = s.f.slice(-60); try { localStorage.setItem(seenKey(), JSON.stringify(s)); } catch(e){} }
/* the oldest final you haven't seen (last 3 days), else a game that just started */
function pendingMoment(){
  if(!D || !D.me) return null;
  const s = seen(), recent = g => Date.now() - new Date(g.start) < 3*864e5;
  const f = D.games.filter(g => g.final && recent(g) && !s.f.includes(g.id) && shown(g).length).sort((a, b) => a.start < b.start ? -1 : 1)[0];
  if(f) return ["final", f];
  const r = D.games.find(g => isLive(g) && !s.r.includes(g.id) && shown(g).length);
  return r ? ["reveal", r] : null;
}
let momentOpen = false;
function checkMoments(after){
  if(momentOpen || document.querySelector(".p26-boot") || document.querySelector(".p26-load")) return;
  const m = pendingMoment(); if(!m) return;
  setTimeout(() => { if(!momentOpen && !document.querySelector(".p26-boot") && !document.querySelector(".pl-sheet")) (m[0] === "final" ? showFinal : showReveal)(m[1], after); }, 350);
}

/* a full-screen layer, closed by its buttons, Esc or leaving the screen */
function layer(cls, html){
  const el = document.createElement("div");
  el.className = "pl-layer " + cls; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
  el.innerHTML = html;
  document.body.appendChild(el);
  document.body.classList.add("pl-noscroll");
  const key = e => { if(e.key === "Escape"){ e.stopPropagation(); e.preventDefault(); close(); } };
  window.addEventListener("keydown", key, true);
  let closed = false;
  function close(){ if(closed) return; closed = true; window.removeEventListener("keydown", key, true); el.classList.add("out"); document.body.classList.remove("pl-noscroll"); setTimeout(() => el.remove(), reduced() ? 0 : 220); if(el.onclose) el.onclose(); }
  el.close = close;
  onLeave(close);
  return el;
}

function showReveal(g, after){
  momentOpen = true;
  markSeen("r", g.id);
  const ps = shown(g), res = g.live || g.home.score != null ? resultOf(g) : {};
  const order = D.players.slice().sort((a, b) => (a.id === meId()) - (b.id === meId()));
  const cards = order.map((pl, i) => {
    const p = ps.find(x => x.user === pl.id);
    return '<div class="pl-flip" style="--d:' + (0.5 + i*0.45) + 's"><div class="pl-fi"><div class="pl-back"><b>?</b></div><div class="pl-front' + (p ? "" : " none") + (p && p.joker ? " joker" : "") + '">' +
      "<small>" + tmark(pl.id) + esc(pl.id === meId() ? "YOU" : pl.name) + "</small>" +
      (p ? logo(winAbbr(p, g)) + '<b class="sc">' + p.away + "–" + p.home + "</b><em>" + (p.ending === "REG" ? "REG" : p.ending) + (p.joker ? " · ★" : "") + "</em>" : '<b class="sc">—</b><em>NO PICK</em>') +
      "</div></div></div>";
  }).join("");
  const L = layer("pl-reveal", '<div class="pl-mo"><p class="pl-kick">PUCK DROP · ' + esc(dayOf(g.start)) + "</p>" +
    '<h2 class="pl-big">The picks<br>are in</h2>' +
    '<div class="pl-mo-vs">' + logo(g.away.abbr) + "<span>" + esc(g.away.abbr) + " @ " + esc(g.home.abbr) + "</span>" + logo(g.home.abbr) + "</div>" +
    (derby(g) ? '<p class="pl-derby">DERBY · ×' + SC().derbyMult + "</p>" : "") +
    '<div class="pl-flips">' + cards + "</div>" +
    '<ul class="pl-lines">' + lines(g, "reveal").map((t, i) => '<li style="--d:' + (0.6 + order.length*0.45 + i*0.25) + 's">' + esc(t) + "</li>").join("") + "</ul>" +
    '<div class="pl-mo-btns"><button type="button" class="pl-go" data-go="pool">FOLLOW IT LIVE</button><button type="button" class="pl-ghost" data-x>CLOSE</button></div></div>');
  buzz(30);
  L.onclose = () => { momentOpen = false; if(after) after(); };
  $("[data-x]", L).addEventListener("click", () => L.close());
  $('[data-go="pool"]', L).addEventListener("click", () => { L.close(); if(location.hash !== "#pool") location.hash = "#pool"; });
}

function showFinal(g, after){
  momentOpen = true;
  markSeen("f", g.id); markSeen("r", g.id);
  const ps = shown(g), res = resultOf(g);
  const before = SS().table(D.games.map(x => x.id === g.id ? { ...x, final: false } : x), D.picks, D.players, SC());
  const now = SS().table(D.games, D.picks, D.players, SC());
  const rankB = Object.fromEntries(before.map((r, i) => [r.id, i])), rankA = Object.fromEntries(now.map((r, i) => [r.id, i]));
  const rows = D.players.slice().sort((a, b) => ((res[b.id] || { pts: -1 }).pts - (res[a.id] || { pts: -1 }).pts));
  const top = Math.max(0, ...rows.map(p => (res[p.id] || { pts: 0 }).pts));
  const step = reduced() ? 0 : 0.55;
  const prow = (pl, i) => {
    const p = ps.find(x => x.user === pl.id), r = res[pl.id] || { pts: 0, parts: [] };
    return '<div class="pl-fr' + (r.pts && r.pts === top ? " top" : "") + '" style="--d:' + (0.7 + i*step) + 's"><div class="who"><b>' + tmark(pl.id) + esc(pl.id === meId() ? "You" : pl.name) + "</b><small>" +
      (p ? esc(pickText(p, g)) + (p.joker ? " · ★ JOKER" : "") : "NO PICK") + '</small></div><div class="chips">' +
      r.parts.map((x, k) => '<i style="--d:' + (0.9 + i*step + k*0.12) + 's">' + esc(x[0].replace("... and the winner", "+ winner")) + " +" + x[1] + "</i>").join("") +
      '</div><strong data-to="' + r.pts + '" style="--d:' + (0.8 + i*step) + 's">' + (reduced() ? (r.pts ? "+" + r.pts : "0") : "0") + "</strong></div>";
  };
  const H = 12; /* cqw per table row */
  const trow = r => { const mv = rankB[r.id] - rankA[r.id];
    return '<div class="pl-tr" data-id="' + r.id + '" style="transform:translateY(' + rankB[r.id]*H + 'cqw)"><i>' + (rankA[r.id] + 1) + "</i><b>" + tmark(r.id) + esc(r.id === meId() ? "You" : r.name) + '</b><em class="' + (mv > 0 ? "up" : mv < 0 ? "dn" : "") + '">' + (mv > 0 ? "▲" + mv : mv < 0 ? "▼" + -mv : "") + '</em><span data-from="' + (before.find(x => x.id === r.id) || { pts: 0 }).pts + '" data-to="' + r.pts + '">' + (before.find(x => x.id === r.id) || { pts: 0 }).pts + "</span></div>"; };
  const L = layer("pl-final", '<div class="pl-mo"><p class="pl-kick">FINAL' + (g.ending !== "REG" ? " · " + esc(ENDING[g.ending].toUpperCase()) : "") + " · " + esc(dayOf(g.start)) + "</p>" +
    '<div class="pl-board">' + '<div>' + logo(g.away.abbr) + "<b>" + esc(g.away.abbr) + '</b></div><strong class="pl-fs">' + g.away.score + "<i>–</i>" + g.home.score + "</strong><div>" + logo(g.home.abbr) + "<b>" + esc(g.home.abbr) + "</b></div></div>" +
    (g.gwg ? '<p class="pl-gwg">WINNING GOAL · ' + esc(g.gwg.toUpperCase()) + "</p>" : "") + (derby(g) ? '<p class="pl-derby">DERBY · ×' + SC().derbyMult + "</p>" : "") +
    '<div class="pl-frs">' + rows.map(prow).join("") + "</div>" +
    '<ul class="pl-lines">' + lines(g, "final").map((t, i) => '<li style="--d:' + (1.2 + rows.length*step + i*0.2) + 's">' + esc(t) + "</li>").join("") + "</ul>" +
    '<div class="pl-tbl" style="height:' + now.length*H + 'cqw">' + now.map(trow).join("") + "</div>" +
    '<div class="pl-mo-btns"><button type="button" class="pl-go" data-go="table">THE TABLE</button><button type="button" class="pl-ghost" data-x>NICE</button></div></div>');
  buzz([20, 60, 20, 60, 40]);
  L.onclose = () => { momentOpen = false; if(after) after(); };
  $("[data-x]", L).addEventListener("click", () => L.close());
  $('[data-go="table"]', L).addEventListener("click", () => { L.close(); location.hash = "#table"; });
  /* points count up, then the table slides into its new order */
  const count = (el, from, to, ms, fmt) => { if(reduced() || from === to){ el.textContent = fmt(to); return; } const t0 = performance.now();
    const f = t => { const k = Math.min(1, (t - t0)/ms), v = Math.round(from + (to - from)*(1 - Math.pow(1 - k, 3))); el.textContent = fmt(v); if(k < 1) requestAnimationFrame(f); else el.classList.add("done"); }; requestAnimationFrame(f); };
  $$(".pl-fr strong", L).forEach((el, i) => setTimeout(() => count(el, 0, +el.dataset.to, 700, v => v ? "+" + v : "0"), (0.8 + i*step)*1000));
  setTimeout(() => {
    $$(".pl-tr", L).forEach(el => { el.style.transform = "translateY(" + rankA[el.dataset.id]*H + "cqw)"; const s = $("span", el); count(s, +s.dataset.from, +s.dataset.to, 900, v => v); });
  }, reduced() ? 0 : (1.4 + rows.length*step)*1000);
}

/* ---------------- the pick editor ---------------- */
const PRESETS = [[2, 1], [3, 1], [3, 2], [4, 2], [4, 1], [5, 2], [3, 2, "OT"], [2, 1, "SO"]];
/* the editor for one game; opts.onSaved(pick) after LOCK IN */
function editor(g, opts = {}){
  const mine = myPick(g);
  const st = mine ? { home: mine.home, away: mine.away, ending: mine.ending, joker: !!mine.joker } : { home: 0, away: 0, ending: "REG", joker: false };
  const el = document.createElement("div");
  el.className = "pl-ed";
  const dial = k => '<div class="pl-dial" data-k="' + k + '" role="spinbutton" tabindex="0" aria-label="Goals for ' + esc(g[k].abbr) + '" aria-valuemin="0" aria-valuemax="15">' +
    '<button type="button" class="up" data-d="1" aria-label="One more for ' + esc(g[k].abbr) + '"></button><div class="win"><span class="n p"></span><b class="n c"></b><span class="n x"></span></div>' +
    '<button type="button" class="dn" data-d="-1" aria-label="One less for ' + esc(g[k].abbr) + '"></button></div>';
  const team = k => '<button type="button" class="pl-tm" data-w="' + k + '" aria-label="' + esc(P.team(g[k].abbr).name) + ' win">' + logo(g[k].abbr) + "<b>" + esc(g[k].abbr) + "</b><small>" + (k === "home" ? "HOME" : "AWAY") + "</small></button>";
  el.innerHTML = '<div class="pl-dials">' + team("away") + dial("away") + '<span class="pl-dash">–</span>' + dial("home") + team("home") + "</div>" +
    '<div class="pl-pre" aria-label="Quick scores"></div>' +
    '<div class="pl-ends" role="radiogroup" aria-label="How it ends">' + Object.keys(ENDING).map(k => '<button type="button" role="radio" data-e="' + k + '">' + ENDING[k] + "</button>").join("") + "</div>" +
    '<button type="button" class="pl-jk"></button>' +
    '<p class="pl-msg" aria-live="polite"></p>' +
    '<button type="button" class="pl-lock"><span></span></button>' +
    '<div class="pl-stamp" aria-hidden="true"><b>LOCKED IN</b></div>';
  const lead = () => st.home === st.away ? null : st.home > st.away ? "home" : "away";
  function fixEnding(){ if(st.ending !== "REG" && Math.abs(st.home - st.away) !== 1) st.ending = "REG"; }
  function paint(bump){
    for(const k of ["home", "away"]){
      const d = $('.pl-dial[data-k="' + k + '"]', el), v = st[k];
      $(".p", d).textContent = v < 15 ? v + 1 : ""; $(".c", d).textContent = v; $(".x", d).textContent = v > 0 ? v - 1 : "";
      d.setAttribute("aria-valuenow", v);
      if(bump && bump[0] === k && !reduced()){ const w = $(".win", d); w.classList.remove("bu", "bd"); void w.offsetWidth; w.classList.add(bump[1] > 0 ? "bu" : "bd"); }
    }
    const w = lead();
    $$(".pl-tm", el).forEach(b => b.classList.toggle("on", b.dataset.w === w));
    $$(".pl-ends button", el).forEach(b => { b.classList.toggle("on", b.dataset.e === st.ending); b.setAttribute("aria-checked", b.dataset.e === st.ending); });
    const pre = $(".pl-pre", el);
    pre.innerHTML = w ? '<span class="lb">' + esc(g[w].abbr) + " WIN</span>" + PRESETS.map(([a, b, e]) => { const on = st[w] === a && st[w === "home" ? "away" : "home"] === b && st.ending === (e || "REG");
        return '<button type="button" class="' + (on ? "on" : "") + '" data-p="' + a + "," + b + "," + (e || "REG") + '">' + a + "–" + b + (e ? " <small>" + e + "</small>" : "") + "</button>"; }).join("")
      : '<span class="lb">WHO WINS?</span><button type="button" class="wide" data-pw="away">' + esc(nick(g.away.abbr)) + '</button><button type="button" class="wide" data-pw="home">' + esc(nick(g.home.abbr)) + "</button>";
    const j = jokerFor(g), jb = $(".pl-jk", el), m = SC().jokerMult*mult(g);
    jb.classList.toggle("on", st.joker); jb.disabled = j.locked && !st.joker;
    jb.innerHTML = '<i class="star">★</i><span><b>' + (st.joker ? "JOKER ON · ×" + m : j.locked ? "JOKER PLAYED" : "PLAY YOUR JOKER · ×" + m) + "</b><small>" +
      (st.joker ? "This game counts " + (m === 4 ? "four times" : "double") + ". Tap to take it back." : j.locked ? "Already used this week on " + esc(gameName(j.og)) + "." : j.other ? "Moves it here from " + esc(gameName(j.og)) + "." : "One a week. This game would count " + (m === 4 ? "four times" : "double") + ".") + "</small></span>";
    const ok = SS().validPick(st), lk = $(".pl-lock", el), same = mine && mine.home === st.home && mine.away === st.away && mine.ending === st.ending && !!mine.joker === st.joker;
    lk.disabled = !ok || same;
    $("span", lk).textContent = !ok ? "LOCK IN" : same ? "LOCKED IN · " + pickText(st, g) : (mine ? "UPDATE · " : "LOCK IN · ") + pickText(st, g);
    lk.classList.toggle("done", !!same);
    const msg = $(".pl-msg", el);
    msg.textContent = st.home === st.away && (st.home || st.away) ? "No ties in the NHL: pick a winner." : "";
  }
  function bump(k, d){ const v = Math.max(0, Math.min(15, st[k] + d)); if(v === st[k]) return; st[k] = v; fixEnding(); paint([k, d]); buzz(6); }
  for(const d of $$(".pl-dial", el)){
    const k = d.dataset.k;
    $$("button", d).forEach(b => b.addEventListener("click", () => bump(k, +b.dataset.d)));
    /* drag the wheel up or down; every 26px is a goal */
    let y0 = null, acc = 0;
    $(".win", d).addEventListener("pointerdown", e => { y0 = e.clientY; acc = 0; try { $(".win", d).setPointerCapture(e.pointerId); } catch(x){} });
    $(".win", d).addEventListener("pointermove", e => { if(y0 == null) return; const dy = y0 - e.clientY; const steps = Math.trunc(dy/26) - acc; if(steps){ acc += steps; bump(k, steps > 0 ? 1 : -1); } });
    const up = () => { y0 = null; };
    $(".win", d).addEventListener("pointerup", up); $(".win", d).addEventListener("pointercancel", up);
    d.addEventListener("wheel", e => { e.preventDefault(); bump(k, e.deltaY < 0 ? 1 : -1); }, { passive: false });
    d.addEventListener("keydown", e => { if(e.key === "ArrowUp"){ e.preventDefault(); e.stopPropagation(); bump(k, 1); } else if(e.key === "ArrowDown"){ e.preventDefault(); e.stopPropagation(); bump(k, -1); } else if(/^[0-9]$/.test(e.key)){ st[k] = +e.key; fixEnding(); paint([k, 1]); } });
  }
  $$(".pl-tm", el).forEach(b => b.addEventListener("click", () => setWinner(b.dataset.w)));
  function setWinner(w){
    const o = w === "home" ? "away" : "home";
    if(st[w] > st[o]) return;
    if(st[w] < st[o]){ const t = st[w]; st[w] = st[o]; st[o] = t; }
    else { st[w] = 3; st[o] = 2; st.ending = "REG"; }
    fixEnding(); paint(); buzz(8);
  }
  el.addEventListener("click", e => {
    const pw = e.target.closest("[data-pw]"); if(pw){ setWinner(pw.dataset.pw); return; }
    const pr = e.target.closest("[data-p]"); if(!pr) return;
    const [a, b, en] = pr.dataset.p.split(","), w = lead(), o = w === "home" ? "away" : "home";
    st[w] = +a; st[o] = +b; st.ending = en; paint(); buzz(8);
  });
  $$(".pl-ends button", el).forEach(b => b.addEventListener("click", () => {
    st.ending = b.dataset.e;
    if(st.ending !== "REG" && Math.abs(st.home - st.away) !== 1){
      /* overtime: the winner by one. Keep whoever leads; from a tie, give it to the home team */
      const w = lead() || "home", o = w === "home" ? "away" : "home";
      st[w] = Math.max(st[w], 1); st[o] = st[w] - 1;
    }
    paint(); buzz(6);
  }));
  $(".pl-jk", el).addEventListener("click", () => { st.joker = !st.joker; paint(); buzz(st.joker ? [10, 30, 10] : 6); });
  $(".pl-lock", el).addEventListener("click", async () => {
    const lk = $(".pl-lock", el), msg = $(".pl-msg", el);
    lk.disabled = true; $("span", lk).textContent = "SAVING…"; msg.textContent = "";
    try {
      const saved = await savePick(g, st);
      Object.assign(mine || {}, saved);
      el.classList.remove("stamped"); void el.offsetWidth; el.classList.add("stamped");
      setTimeout(() => { el.classList.remove("stamped"); if(opts.onSaved) opts.onSaved(saved); else paintAfter(); }, reduced() ? 300 : 1100);
    } catch(e){ msg.textContent = e.message; msg.classList.add("bad"); paint(); }
  });
  function paintAfter(){ const m = myPick(g); if(m) Object.assign(st, { home: m.home, away: m.away, ending: m.ending, joker: !!m.joker }); paint(); }
  paint();
  return el;
}

/* the editor in a bottom sheet (from Play and the Pool's rows) */
function openSheet(g, onDone){
  const L = layer("pl-sheet", '<div class="pl-sh-bg" data-x></div><div class="pl-sh"><div class="pl-sh-grab"></div>' +
    '<div class="pl-sh-top"><span>' + esc(relDay(g.start)) + " · " + esc(timeOf(g.start)) + (g.venue ? " · " + esc(g.venue.toUpperCase()) : "") + '</span><button type="button" class="pl-x" data-x aria-label="Close">✕</button></div>' +
    '<p class="pl-sh-lock">LOCKS IN <b class="clk" data-until="' + g.start + '">' + clock(g.start) + "</b></p>" +
    (derby(g) ? '<p class="pl-derby">HABS v OILERS · DERBY · EVERYTHING ×' + SC().derbyMult + "</p>" : "") + '<div class="pl-sh-ed"></div>' + crew(g) + "</div>");
  $(".pl-sh-ed", L).appendChild(editor(g, { onSaved: () => { L.close(); if(onDone) onDone(); } }));
  $$("[data-x]", L).forEach(b => b.addEventListener("click", () => L.close()));
  L.onclose = () => { if(onDone) onDone(true); };
  /* swipe the sheet down to close */
  const sh = $(".pl-sh", L), grab = $(".pl-sh-grab", L); let y0 = null;
  grab.addEventListener("pointerdown", e => { y0 = e.clientY; try { grab.setPointerCapture(e.pointerId); } catch(x){} });
  grab.addEventListener("pointermove", e => { if(y0 != null) sh.style.transform = "translateY(" + Math.max(0, e.clientY - y0) + "px)"; });
  grab.addEventListener("pointerup", e => { if(y0 != null && e.clientY - y0 > 80) L.close(); else sh.style.transform = ""; y0 = null; });
  setTimeout(() => { const lk = $(".pl-dial", L); if(lk && !matchMedia("(pointer:coarse)").matches) lk.focus({ preventScroll: true }); }, 50);
  return L;
}

/* who has picked: you, then the others (picked or not, never the score before puck drop) */
function crew(g){
  return '<div class="pl-crew">' + D.players.slice().sort((a, b) => (b.id === meId()) - (a.id === meId())).map(p => {
    const ok = hasPicked(g, p.id);
    return '<span class="' + (ok ? "ok" : "no") + (p.id === meId() ? " me" : "") + '"><i>' + (ok ? "✓" : "…") + "</i>" + tmark(p.id) + esc(p.id === meId() ? "You" : p.name) + "</span>";
  }).join("") + "</div>";
}

/* ---------------- Play: the Pool block ---------------- */
P.poolHome = function(slot){
  slot.className = "pl-slot";
  slot.innerHTML = '<section class="pl-home"><div class="pl-hd"><span class="k">THE POOL</span></div><div class="pl-card"><div class="pl-in pl-wait"><span class="pl-load">LOADING THE POOL…</span></div></div></section>';
  let timer = 0, alive = true;
  onLeave(() => { alive = false; clearTimeout(timer); });
  const draw = () => { if(!alive || !document.body.contains(slot)) return; homeBlock(slot); schedule(); };
  function schedule(){
    clearTimeout(timer);
    if(!D) return;
    /* live: every 30 s. Otherwise wake up at the next puck drop (for the reveal) */
    const live = D.games.some(isLive), next = D.games.find(isOpen);
    const ms = live ? 30000 : next ? Math.min(Math.max(1000, new Date(next.start) - Date.now() + 1500), 6*3600e3) : 0;
    if(ms) timer = setTimeout(() => load(true).then(draw).then(() => checkMoments()).catch(() => {}), ms);
  }
  if(D) draw();
  load().then(() => { draw(); checkMoments(draw); }).catch(e => { if(alive) $(".pl-card", slot).innerHTML = '<div class="pl-in"><p class="pl-err">' + errMsg(e) + "</p></div>"; });
};

function homeBlock(slot){
  const games = D.games, me = D.me;
  const rows = SS().table(games, D.picks, D.players, SC());
  const myRow = me && rows.find(r => r.id === me.id), myRank = myRow ? rows.indexOf(myRow) + 1 : 0, anyPts = rows.some(r => r.pts);
  const live = games.filter(isLive), next = games.find(isOpen);
  const last = games.filter(g => g.final).slice(-1)[0];
  let html = '<section class="pl-home"><div class="pl-hd"><span class="k">THE POOL</span>' +
    (myRow && anyPts ? '<a class="pl-rank" href="#table"><b>' + ord(myRank) + "</b> · " + myRow.pts + " PTS" + (myRow.streak >= 2 ? ' · <i class="fire">' + myRow.streak + " IN A ROW</i>" : "") + "</a>" : '<a class="pl-rank" href="#pool">ALL GAMES ›</a>') + "</div>";
  if(P.store.mode === "online" && !me){
    html += '<div class="pl-card"><div class="pl-in pl-acct"><h3>Sign in to play</h3><p>Pick the score of every Habs and Oilers game. Takes ten seconds.</p><div class="pl-form-slot"></div></div></div></section>';
    slot.innerHTML = html; accountForm($(".pl-form-slot", slot), () => { reset(); P.poolHome(slot); }); return;
  }
  if(me && me.unnamed){
    html += '<div class="pl-card"><div class="pl-in pl-acct"><h3>Who are you?</h3><p>The others see this name on the Table.</p><div class="pl-form-slot"></div></div></div></section>';
    slot.innerHTML = html; nameForm($(".pl-form-slot", slot), () => { reset(); P.poolHome(slot); }); return;
  }
  const g = live[0] || next;
  if(!g) html += '<div class="pl-card"><div class="pl-in pl-wait"><span class="pl-load">NO POOL GAMES SCHEDULED</span></div></div>';
  else if(isLive(g)) html += liveCard(g, true);
  else html += openCard(g);
  /* under the card: the last result and this week's joker */
  const sub = [];
  if(last && (!g || last.id !== g.id)){
    const r = resultOf(last), ps = shown(last);
    sub.push('<button type="button" class="pl-last" data-final="' + last.id + '"><span class="t">' + esc(relDay(last.start)) + '</span><span class="s">' + logo(last.away.abbr) + "<b>" + last.away.score + "–" + last.home.score + "</b>" + logo(last.home.abbr) + (last.ending !== "REG" ? "<em>" + last.ending + "</em>" : "") + '</span><span class="p">' +
      (ps.length ? D.players.filter(pl => ps.some(x => x.user === pl.id)).sort((a, b) => (b.id === meId()) - (a.id === meId())).map(pl => '<i class="' + ((r[pl.id] || {}).pts ? "pos" : "") + '">' + esc(pl.id === meId() ? "YOU" : pl.name.slice(0, 6).toUpperCase()) + " " + ((r[pl.id] || {}).pts ? "+" + r[pl.id].pts : "0") + "</i>").join("") : "<i>NO PICKS</i>") + "</span><span class=\"go\">›</span></button>");
  }
  if(me){
    const wkGames = games.filter(x => SS().weekKey(x.start) === SS().weekKey(new Date().toISOString())), openWk = wkGames.filter(isOpen), unpicked = openWk.filter(x => !myPick(x));
    const jk = D.picks.find(p => p.user === meId() && p.joker && p.start_utc && SS().weekKey(p.start_utc) === SS().weekKey(new Date().toISOString()));
    const jg = jk && games.find(x => x.id === jk.game_id);
    sub.push('<a class="pl-week" href="#pool"><span>THIS WEEK</span><b>' + (openWk.length ? plural(openWk.length, "game") + " to go" : "all played") + (unpicked.length ? ' · <em class="hot">' + unpicked.length + " to pick</em>" : openWk.length ? " · all picked ✓" : "") +
      '</b><span class="jk' + (jk ? " on" : "") + '">★ ' + (jk ? esc(jg ? gameName(jg) : "PLAYED") : "JOKER UNUSED") + "</span></a>");
  }
  html += (sub.length ? '<div class="pl-subs">' + sub.join("") + "</div>" : "") + "</section>";
  slot.innerHTML = html;
  wireHome(slot, g);
}

function openCard(g){
  const mine = myPick(g), soon = new Date(g.start) - Date.now() < 3*3600e3, urgent = !mine && D.me && soon;
  const rec = t => t.record ? "<small>" + esc(t.record) + "</small>" : "<small>" + (t === g.home ? "HOME" : "AWAY") + "</small>";
  let pick;
  if(!D.me) pick = '<p class="pl-hint"><a href="#me">Pick a player on Me</a> to make picks.</p>';
  else if(mine) pick = '<div class="pl-mine"><span class="lb">YOUR PICK</span><b>' + esc(pickText(mine, g)) + "</b>" + (mine.joker ? '<i class="star">★ ×' + SC().jokerMult*mult(g) + "</i>" : "") + '<button type="button" class="pl-edit" data-edit>CHANGE</button></div>';
  else pick = '<div class="pl-quick"><span class="lb">' + (urgent ? "QUICK! WHO WINS?" : "WHO WINS?") + '</span><div class="pl-qw"><button type="button" data-qw="away">' + logo(g.away.abbr) + esc(nick(g.away.abbr)) + '</button><button type="button" data-qw="home">' + logo(g.home.abbr) + esc(nick(g.home.abbr)) + "</button></div>" +
    '<div class="pl-qs" hidden></div><button type="button" class="pl-exact" data-edit>EXACT SCORE, OT, JOKER ›</button></div>';
  return '<div class="pl-card' + (urgent ? " urgent" : "") + (mine ? " picked" : "") + (derby(g) ? " derby" : "") + '" data-g="' + g.id + '"><div class="pl-in">' +
    '<div class="pl-meta"><span>' + esc(relDay(g.start)) + " · " + esc(timeOf(g.start)) + "</span>" + (derby(g) ? '<span class="pl-dtag">DERBY ×' + SC().derbyMult + "</span>" : g.venue ? "<span>" + esc(g.venue.toUpperCase()) + "</span>" : "") + "</div>" +
    '<div class="pl-vs"><div class="t">' + logo(g.away.abbr) + "<b>" + esc(g.away.abbr) + "</b>" + rec(g.away) + '</div><div class="c"><small>' + (mine ? "LOCKS IN" : urgent ? "PICK BEFORE" : "LOCKS IN") + '</small><b class="clk" data-until="' + g.start + '">' + clock(g.start) + '</b></div><div class="t">' + logo(g.home.abbr) + "<b>" + esc(g.home.abbr) + "</b>" + rec(g.home) + "</div></div>" +
    pick + crew(g) + '<div class="pl-stamp" aria-hidden="true"><b>LOCKED IN</b></div></div></div>';
}

function liveCard(g, compact){
  const res = resultOf(g), ps = shown(g), tied = (g.home.score || 0) === (g.away.score || 0);
  const per = g.final ? "FINAL" : g.intermission ? "INT " + (g.period || "") : g.ptype === "SO" ? "SHOOTOUT" : g.ptype === "OT" ? "OT" : g.period ? ord(g.period) : "PUCK DROP";
  const rows = D.players.slice().sort((a, b) => ((res[b.id] || { pts: -1 }).pts - (res[a.id] || { pts: -1 }).pts) || ((b.id === meId()) - (a.id === meId())));
  return '<div class="pl-card live' + (derby(g) ? " derby" : "") + '" data-g="' + g.id + '"><div class="pl-in">' +
    '<div class="pl-meta"><span class="pl-livetag">● LIVE</span><span>' + esc(per) + (g.clock && !g.final ? " · " + esc(g.clock) : "") + "</span></div>" +
    '<div class="pl-vs"><div class="t">' + logo(g.away.abbr) + "<b>" + esc(g.away.abbr) + '</b></div><div class="c"><strong class="pl-ls">' + (g.away.score ?? 0) + "<i>–</i>" + (g.home.score ?? 0) + '</strong></div><div class="t">' + logo(g.home.abbr) + "<b>" + esc(g.home.abbr) + "</b></div></div>" +
    '<div class="pl-ifnow"><span class="lb">' + (tied ? "TIED · NOBODY HAS THE WINNER YET" : "IF IT ENDED NOW") + "</span>" +
    rows.map(pl => { const p = ps.find(x => x.user === pl.id), r = res[pl.id] || { pts: 0, parts: [] };
      return '<div class="r' + (r.pts ? " pos" : "") + '"><b>' + tmark(pl.id) + esc(pl.id === meId() ? "You" : pl.name) + "</b><span>" + (p ? esc(pickText(p, g)) + (p.joker ? " ★" : "") : "no pick") + "</span><strong>" + (r.pts ? "+" + r.pts : "0") + "</strong>" +
        (!compact && r.parts.length ? '<small>' + r.parts.map(x => esc(x[0]) + " +" + x[1]).join(" · ") + "</small>" : "") + "</div>"; }).join("") + "</div>" +
    (compact ? "" : '<ul class="pl-lines still">' + lines(g, "live").map(t => "<li>" + esc(t) + "</li>").join("") + "</ul>") + "</div></div>";
}

function wireHome(slot, g){
  const card = $(".pl-card[data-g]", slot);
  if(card && card.classList.contains("live")){ card.addEventListener("click", () => { location.hash = "#pool"; }); card.style.cursor = "pointer"; }
  $$("[data-edit]", slot).forEach(b => b.addEventListener("click", () => openSheet(g, () => homeBlock(slot))));
  $$("[data-qw]", slot).forEach(b => b.addEventListener("click", () => {
    const w = b.dataset.qw, o = w === "home" ? "away" : "home", qs = $(".pl-qs", slot);
    $$("[data-qw]", slot).forEach(x => x.classList.toggle("on", x === b));
    qs.hidden = false;
    qs.innerHTML = PRESETS.map(([a, c, e]) => '<button type="button" data-q="' + a + "," + c + "," + (e || "REG") + '">' + a + "–" + c + (e ? "<small>" + e + "</small>" : "") + "</button>").join("");
    buzz(8);
    $$("[data-q]", qs).forEach(q => q.addEventListener("click", async () => {
      const [a, c, e] = q.dataset.q.split(","), st = { ending: e, joker: false }; st[w] = +a; st[o] = +c;
      $$("[data-q]", qs).forEach(x => x.disabled = true); q.classList.add("on");
      try { await savePick(g, st); const cd = $(".pl-card", slot); cd.classList.add("stamped"); setTimeout(() => homeBlock(slot), reduced() ? 200 : 1100); }
      catch(err){ $$("[data-q]", qs).forEach(x => x.disabled = false); q.classList.remove("on"); qs.insertAdjacentHTML("beforeend", '<p class="pl-err">' + esc(err.message) + "</p>"); }
    }));
  }));
  const lb = $("[data-final]", slot);
  if(lb) lb.addEventListener("click", () => { const x = D.games.find(y => y.id === +lb.dataset.final); if(x) showFinal(x); });
}

/* ---------------- the Pool tab ---------------- */
async function page(app, band){
  app.innerHTML = band("The Pool", C.POOL_TEAMS.map(t => nick(t)).join(" · ")) + '<p class="p26-lbl">THE POOL · ' + C.POOL_TEAMS.map(t => nick(t).toUpperCase()).join(" · ") + '</p><div class="wrap pl-page" id="pl"><p class="one">Loading games…</p></div>';
  const box = $("#pl");
  try { await load(); } catch(e){ box.innerHTML = '<p class="err">' + errMsg(e) + "</p>"; return; }
  let open = null, timer = 0, alive = true;
  onLeave(() => { alive = false; clearTimeout(timer); });
  function draw(){
    if(!alive) return;
    const games = D.games, me = D.me;
    const live = games.filter(isLive), upcoming = games.filter(isOpen), done = games.filter(g => g.final).slice(-12).reverse();
    if(open == null){ const f = upcoming.find(g => !myPick(g)); open = me && f ? f.id : 0; }
    let html = "";
    if(D.offlineSince) html += '<p class="note">Offline: games as of ' + esc(dayOf(new Date(D.offlineSince).toISOString())) + " " + esc(timeOf(new Date(D.offlineSince).toISOString())) + ".</p>";
    if(!me) html += '<p class="note">' + (P.store.mode === "online" ? '<a href="#me">Sign in on Me</a> to make picks.' : '<a href="#me">Pick a player on Me</a> to make picks.') + "</p>";
    if(P.store.mode === "demo") html += '<p class="pl-demo">DEMO MODE · PICKS STAY ON THIS PHONE · SWITCH PLAYERS ON <a href="#me">ME</a></p>';
    if(me) html += weekBar();
    if(live.length) html += '<div class="sectitle"><h2>Live</h2><span class="label">IF IT ENDED NOW</span></div><div class="stack">' + live.map(g => liveCard(g, false)).join("") + "</div>";
    html += '<div class="sectitle"><h2>Next up</h2><span class="label">LOCKS AT PUCK DROP</span></div>';
    html += upcoming.length ? '<div class="pl-rows">' + upcoming.slice(0, 14).map(g => openRow(g, g.id === open)).join("") + "</div>" : '<p class="one">No games scheduled.</p>';
    if(upcoming.length > 14) html += '<p class="one pl-more">' + (upcoming.length - 14) + " more games later in the season.</p>";
    if(done.length) html += '<div class="sectitle"><h2>Results</h2><span class="label">TAP FOR THE POINTS</span></div><div class="pl-rows">' + done.map(resultRow).join("") + "</div>";
    html += reminderCard();
    box.innerHTML = html;
    const ex = $(".pl-row.open .pl-row-ed", box);
    if(ex){ const g = games.find(x => x.id === open); ex.appendChild(editor(g, { onSaved: () => { const nx = games.find(x => isOpen(x) && !myPick(x) && x.id !== g.id); open = nx && new Date(nx.start) - new Date(g.start) < 7*864e5 ? nx.id : 0; draw(); if(open){ const r = $('.pl-row[data-g="' + open + '"]', box); if(r) r.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" }); } } })); ex.insertAdjacentHTML("beforeend", crew(g)); }
    $$(".pl-row[data-g] > .pl-rh", box).forEach(h => h.addEventListener("click", () => { const id = +h.parentNode.dataset.g; open = open === id ? 0 : id; draw(); const r = $('.pl-row[data-g="' + id + '"]', box); if(r && open) r.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" }); }));
    $$("[data-final]", box).forEach(b => b.addEventListener("click", () => { const g = games.find(x => x.id === +b.dataset.final); if(g) showFinal(g); }));
    const rc = $("[data-ics]", box); if(rc) rc.addEventListener("click", downloadICS);
    clearTimeout(timer);
    const nx = games.find(isOpen), ms = live.length ? 30000 : nx ? Math.min(Math.max(1000, new Date(nx.start) - Date.now() + 1500), 6*3600e3) : 0;
    if(ms) timer = setTimeout(() => load(true).then(() => { if(!$(".pl-row.open .pl-ed .pl-lock:not(:disabled)", box)) draw(); checkMoments(draw); }).catch(() => {}), ms);
  }
  draw();
  checkMoments(draw);
}

function weekBar(){
  const now = new Date().toISOString(), wk = SS().weekKey(now);
  const w = SS().weeks(D.games, D.picks, D.players, SC()).find(x => x.week === wk);
  const jk = D.picks.find(p => p.user === meId() && p.joker && p.start_utc && SS().weekKey(p.start_utc) === wk), jg = jk && D.games.find(x => x.id === jk.game_id);
  const pts = w ? w.pts : {}, top = Math.max(1, ...Object.values(pts));
  const mon = new Date(wk + "T12:00:00"), sun = new Date(mon.getTime() + 6*864e5);
  return '<div class="pl-weekbar"><div class="h"><span>WEEK · ' + esc(fShort.format(mon).toUpperCase()) + " – " + esc(fShort.format(sun).toUpperCase()) + '</span><span class="jk' + (jk ? " on" : "") + '">★ ' + (jk ? "JOKER: " + esc(jg ? gameName(jg) : "PLAYED") : "JOKER UNUSED") + "</span></div>" +
    D.players.map(p => '<div class="b"><b>' + tmark(p.id) + esc(p.id === meId() ? "You" : p.name) + '</b><span><i style="width:' + Math.round(100*(pts[p.id] || 0)/top) + '%"></i></span><em>' + (pts[p.id] || 0) + "</em></div>").join("") + "</div>";
}

function openRow(g, isOpenRow){
  const mine = myPick(g), urgent = !mine && D.me && new Date(g.start) - Date.now() < 3*3600e3;
  return '<div class="pl-row' + (isOpenRow ? " open" : "") + (mine ? " picked" : "") + (urgent ? " urgent" : "") + (derby(g) ? " derby" : "") + '" data-g="' + g.id + '"><button type="button" class="pl-rh" aria-expanded="' + isOpenRow + '">' +
    '<span class="d"><b>' + esc(shortDay(g.start)) + "</b><small>" + esc(timeOf(g.start)) + "</small></span>" +
    '<span class="m">' + logo(g.away.abbr) + "<em>@</em>" + logo(g.home.abbr) + "</span>" +
    '<span class="y">' + (mine ? "<b>" + esc(pickText(mine, g)) + "</b>" + (mine.joker ? '<i class="star">★</i>' : "") : D.me ? '<b class="pick">PICK</b>' : "") +
    '<small class="dots">' + D.players.map(p => '<i class="' + (hasPicked(g, p.id) ? "ok" : "") + '" title="' + esc(p.name) + '"></i>').join("") + "</small></span>" +
    '<span class="c">' + (derby(g) ? '<small class="pl-dtag">DERBY</small>' : "") + '<small class="clk" data-until="' + g.start + '">' + clock(g.start) + "</small></span></button>" +
    (isOpenRow ? '<div class="pl-row-ed">' + (g.venue ? '<p class="pl-venue">' + esc(dayOf(g.start)) + " · " + esc(g.venue.toUpperCase()) + "</p>" : "") + "</div>" : "") + "</div>";
}

function resultRow(g){
  const r = resultOf(g), ps = shown(g), mine = ps.find(p => p.user === meId()), my = mine ? r[meId()].pts : null;
  return '<button type="button" class="pl-row pl-res" data-final="' + g.id + '"><span class="d"><b>' + esc(dayOf(g.start).replace(/^\w+ /, "")) + "</b><small>" + (g.ending !== "REG" ? g.ending : "FINAL") + "</small></span>" +
    '<span class="m">' + logo(g.away.abbr) + "<em>" + g.away.score + "–" + g.home.score + "</em>" + logo(g.home.abbr) + "</span>" +
    '<span class="y">' + (mine ? "<b>" + esc(pickText(mine, g)) + "</b>" : D.me ? '<b class="miss">NO PICK</b>' : "") +
    '<small class="ot">' + others().filter(p => ps.some(x => x.user === p.id)).map(p => esc(p.name.slice(0, 1)) + " " + ((r[p.id] || {}).pts ? "+" + r[p.id].pts : "0")).join(" · ") + "</small></span>" +
    '<span class="c"><strong class="' + (my ? "pos" : "") + '">' + (my == null ? "–" : my ? "+" + my : "0") + "</strong></span></button>";
}

/* ---------------- reminders: a calendar file, no server needed ---------------- */
function reminderCard(){
  const n = D.games.filter(isOpen).length;
  if(!n) return "";
  return '<div class="pl-remind"><div><b>Never miss a pick</b><p>Put all ' + n + " remaining games in your calendar, with an alarm 2 hours before puck drop.</p></div>" +
    '<button type="button" data-ics class="pl-go small">ADD TO CALENDAR</button></div>';
}
function downloadICS(){
  const z = d => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const url = location.origin + location.pathname + "#pool";
  const ev = D.games.filter(isOpen).map(g => ["BEGIN:VEVENT", "UID:puck-pool-" + g.id + "@beebzoo", "DTSTAMP:" + z(Date.now()), "DTSTART:" + z(g.start), "DURATION:PT3H",
    "SUMMARY:" + g.away.abbr + " @ " + g.home.abbr + (derby(g) ? " (DERBY)" : "") + " · PUCK Pool", "DESCRIPTION:Pick your score before puck drop: " + url, "URL:" + url, g.venue ? "LOCATION:" + g.venue.replace(/[,;]/g, " ") : "",
    "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Pick your score: " + g.away.abbr + " @ " + g.home.abbr + " starts in 2 hours", "TRIGGER:-PT2H", "END:VALARM", "END:VEVENT"].filter(Boolean).join("\r\n"));
  const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//beebzoo//PUCK Pool//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:PUCK Pool", ...ev, "END:VCALENDAR"].join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar" })); a.download = "puck-pool.ics";
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------------- the Table tab ---------------- */
function seasonLabel(){ const d = new Date(), y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1; return y + "-" + String(y + 1).slice(2); }
async function table(app, band){
  app.innerHTML = band("Table", "Season " + seasonLabel()) + '<p class="p26-lbl">THE POOL · SEASON ' + seasonLabel() + '</p><div class="wrap pl-page" id="tb"><p class="one">Adding it up…</p></div>';
  const box = $("#tb");
  try { await load(); } catch(e){ box.innerHTML = '<p class="err">' + errMsg(e) + "</p>"; return; }
  const S = SS(), K = SC(), games = D.games, players = D.players;
  const rows = S.table(games, D.picks, players, K);
  const lastF = games.filter(g => g.final).slice(-1)[0];
  const before = lastF ? S.table(games.map(x => x.id === lastF.id ? { ...x, final: false } : x), D.picks, players, K) : rows;
  const doneN = games.filter(g => g.final && shown(g).length).length, anyPts = rows.some(r => r.pts > 0);
  const nm = id => id === meId() ? "You" : nameOf(id);
  const gOf = id => games.find(g => g.id === id);
  let html = "";
  if(!rows.length) html += '<p class="note">' + (P.store.mode === "online" ? '<a href="#me">Sign in on Me</a> to see the table.' : "No players yet.") + "</p>";
  else html += '<div class="rows pl-standings">' + rows.map((r, i) => {
    const bi = before.findIndex(x => x.id === r.id), mv = anyPts ? bi - i : 0;
    const badges = [r.crowns ? '<em class="crown">♛ ' + r.crowns + "</em>" : "", r.streak >= 2 ? '<em class="fire">' + r.streak + " IN A ROW</em>" : "", r.missed ? '<em class="miss">' + r.missed + " MISSED</em>" : ""].join("");
    const tc = teamOf(r.id) ? P.team(teamOf(r.id)) : null;
    return '<div class="rowx' + (i === 0 && anyPts ? " lead" : "") + (r.id === meId() ? " me" : "") + '"' + (tc && r.id === meId() ? ' style="--tc1:' + tc.c1 + ";--tc2:" + tc.c2 + '"' : "") + '><i>' + (anyPts ? i + 1 : "–") + (mv ? '<sup class="' + (mv > 0 ? "up" : "dn") + '">' + (mv > 0 ? "▲" : "▼") + "</sup>" : "") + "</i><div><b>" + tmark(r.id) + esc(r.name) + "</b><small>" + r.winners + " WINNERS · " + r.exact + " EXACT · " + r.calls + " OT/SO</small>" +
      (badges ? '<div class="pl-badges">' + badges + "</div>" : "") +
      (r.form.length ? '<div class="form">' + r.form.map(x => x == null ? '<i class="m">–</i>' : '<i class="' + (x >= 5 ? "g" : x > 0 ? "b" : "") + '">' + x + "</i>").join("") + "</div>" : "") + "</div><span><strong>" + r.pts + "</strong> PTS</span></div>";
  }).join("") + "</div>";
  html += '<p class="one" style="margin-top:8px">' + (doneN ? plural(doneN, "finished game") + " with picks. Ties are split on exact scores, then right winners." : "The table fills up after the first Pool game.") + "</p>";

  if(D.me && players.length) html += '<div class="sectitle"><h2>This week</h2><span class="label">♛ FOR THE WINNER</span></div>' + weekBar();

  /* the season's story */
  const m = S.moments(games, D.picks, K), cards = [];
  const most = (key, min = 1) => { const top = rows.slice().sort((a, b) => b[key] - a[key])[0]; return top && top[key] >= min && rows.filter(r => r[key] === top[key]).length === 1 ? top : null; };
  if(m.best){ const g = gOf(m.best.game_id); cards.push(["BEST CALL", nm(m.best.user), pickText(m.best.pick, g) + " · " + scoreText(g), "+" + m.best.pts, "gold"]); }
  if(m.miss){ const g = gOf(m.miss.game_id); cards.push(["BIGGEST MISS", nm(m.miss.user), "Said " + pickText(m.miss.pick, g) + ". It was " + scoreText(g) + ".", m.miss.off + " off", "red"]); }
  const sn = most("exact"); if(sn) cards.push(["SNIPER", nm(sn.id), "Most exact scores.", sn.exact + "×", ""]);
  const lw = most("wolves"); if(lw) cards.push(["LONE WOLF", nm(lw.id), "Right when the others weren't.", lw.wolves + "×", ""]);
  const ot = most("calls"); if(ot) cards.push(["OT WHISPERER", nm(ot.id), "Called overtime or the shootout.", ot.calls + "×", ""]);
  const hs = most("streak", 3); if(hs) cards.push(["ON FIRE", nm(hs.id), "Scored in every game lately.", hs.streak + " in a row", "gold"]);
  const ms = most("missed"); if(ms) cards.push(["ASLEEP", nm(ms.id), "Games without a pick.", ms.missed + "×", "red"]);
  if(cards.length) html += '<div class="sectitle"><h2>The story so far</h2></div><div class="pl-story">' + cards.map(([k, who, t, n, c]) => '<div class="pl-st ' + c + '"><small>' + k + "</small><b>" + esc(who) + "</b><p>" + esc(t) + "</p><strong>" + esc(n) + "</strong></div>").join("") + "</div>";

  /* head to head */
  const hh = S.h2h(games, D.picks, players, K).filter(r => r.aw + r.bw + r.draws > 0);
  if(hh.length) html += '<div class="sectitle"><h2>Head to head</h2><span class="label">WHO OUTSCORED WHOM</span></div><div class="pl-h2h">' + hh.map(r =>
    '<div class="h"><b class="' + (r.aw > r.bw ? "w" : "") + '">' + esc(nm(r.a)) + "</b><strong>" + r.aw + "<i>–</i>" + r.bw + '</strong><b class="' + (r.bw > r.aw ? "w" : "") + '">' + esc(nm(r.b)) + "</b>" + (r.draws ? "<small>" + plural(r.draws, "game") + " level</small>" : "<small></small>") + "</div>").join("") + "</div>";

  /* weekly crowns */
  const ws = S.weeks(games, D.picks, players, K).filter(w => w.complete && w.winners.length);
  if(ws.length) html += '<div class="sectitle"><h2>Weekly crowns</h2></div><div class="pl-crowns">' + ws.slice(0, 8).map(w =>
    '<div class="c"><span>WEEK OF ' + esc(fShort.format(new Date(w.week + "T12:00:00")).toUpperCase()) + "</span><b>" + (w.winners.length ? "♛ " + w.winners.map(id => esc(nm(id))).join(" & ") : "NOBODY") + "</b><em>" + (w.winners.length ? w.pts[w.winners[0]] + " PTS" : "") + "</em></div>").join("") + "</div>";

  /* the rules, straight from P.SCORING */
  const best = S.maxGame(K);
  html += '<div class="sectitle"><h2>How points work</h2></div><div class="rules">' +
    [["Right winner", "+" + K.winner], ["Exact score, on top of the winner", "+" + K.exact], ["Right winner and goal difference (not exact)", "+" + K.diff],
     ["Called overtime or the shootout, and it went there", "+" + K.ending], ["… and you had the winner too", "+" + K.endingWinner],
     ["Lone wolf: the only one with the right winner", "+" + K.loneWolf],
     ["Joker: one game a week counts double. Move it as long as that game hasn't started.", "×" + K.jokerMult]]
      .concat(K.derbyMult > 1 && K.derby ? [["Derby: when " + K.derby.map(nick).join(" and ") + " meet, the game counts double (a joker on it makes ×" + K.jokerMult*K.derbyMult + ")", "×" + K.derbyMult]] : [])
      .map(([t, n]) => '<div class="rule"><span>' + t + "</span><b>" + n + "</b></div>").join("") + "</div>" +
    '<p class="one" style="margin-top:10px">Best possible game: ' + [K.winner, K.exact, K.ending, K.endingWinner, K.loneWolf].join(" + ") + " = " + best + ", " + best*K.jokerMult + " with the joker" +
    (K.derbyMult > 1 ? ", " + best*K.jokerMult*K.derbyMult + " with the joker on the derby" : "") + ". Picks lock at puck drop and you only see the others' picks after that. The week's top scorer gets a crown ♛ (no points, just glory).</p>";
  box.innerHTML = html;
}

/* ---------------- accounts: sign in, your name ---------------- */
function accountForm(el, done){
  let signup = false;
  el.innerHTML = '<form class="pl-form" novalidate><div class="field pl-su" hidden><label for="pl-nm">Your name</label><input id="pl-nm" autocomplete="nickname" maxlength="24"></div>' +
    '<div class="field"><label for="pl-em">Email</label><input id="pl-em" type="email" autocomplete="username" inputmode="email" autocapitalize="off" spellcheck="false" enterkeyhint="next"></div>' +
    '<div class="field"><label for="pl-pw">Password</label><div class="pl-pw"><input id="pl-pw" type="password" autocomplete="current-password" enterkeyhint="go"><button type="button" class="pl-eye" aria-label="Show password">SHOW</button></div></div>' +
    '<div class="field pl-su" hidden><label for="pl-cd">League code</label><input id="pl-cd" autocomplete="off" autocapitalize="off"></div>' +
    '<p class="pl-err" hidden></p><button type="submit" class="pl-go">SIGN IN</button>' +
    '<button type="button" class="pl-ghost pl-sw">NEW HERE? CREATE AN ACCOUNT</button></form>';
  const f = $("form", el), err = $(".pl-err", el), go = $('[type="submit"]', el);
  try { const last = localStorage.getItem("puck.lastEmail"); if(last) $("#pl-em", el).value = last; } catch(e){}
  $(".pl-eye", el).addEventListener("click", e => { const i = $("#pl-pw", el), show = i.type === "password"; i.type = show ? "text" : "password"; e.target.textContent = show ? "HIDE" : "SHOW"; });
  $(".pl-sw", el).addEventListener("click", e => { signup = !signup; $$(".pl-su", el).forEach(x => x.hidden = !signup); go.textContent = signup ? "CREATE ACCOUNT" : "SIGN IN"; e.target.textContent = signup ? "I HAVE AN ACCOUNT" : "NEW HERE? CREATE AN ACCOUNT"; $("#pl-pw", el).autocomplete = signup ? "new-password" : "current-password"; });
  f.addEventListener("submit", async e => {
    e.preventDefault(); err.hidden = true; err.className = "pl-err"; go.disabled = true; const label = go.textContent; go.textContent = "…";
    const email = $("#pl-em", el).value.trim(), pw = $("#pl-pw", el).value;
    try {
      if(signup){
        const r = await P.store.signUp(email, pw, $("#pl-nm", el).value.trim() || "Me", $("#pl-cd", el).value);
        if(!r.session){ err.hidden = false; err.className = "pl-note"; err.textContent = "Account made. Confirm it from your email (check spam), then sign in. No email? Ask Martijn to confirm you in Supabase."; go.disabled = false; go.textContent = label; return; }
      } else await P.store.signIn(email, pw);
      try { localStorage.setItem("puck.lastEmail", email); } catch(x){}
      reset(); buzz(20); done();
    } catch(x){ err.hidden = false; err.textContent = x.message; go.disabled = false; go.textContent = label; }
  });
}
/* the name step: one tap on your own name (the three of us), or type another */
async function nameForm(el, done){
  const players = await P.store.players().catch(() => []), me = await P.store.me();
  const taken = new Set(players.filter(p => !me || p.id !== me.id).map(p => p.name.toLowerCase()));
  const free = (C.DEMO_PLAYERS || []).filter(n => !taken.has(n.toLowerCase()));
  el.innerHTML = '<div class="pl-names">' + free.map(n => '<button type="button" class="pl-nm" data-n="' + esc(n) + '">' + esc(n) + "</button>").join("") + "</div>" +
    '<form class="pl-form pl-other"><div class="field"><label for="pl-rn">' + (free.length ? "Or another name" : "Your name") + '</label><div class="pl-pw"><input id="pl-rn" maxlength="24" autocomplete="nickname" enterkeyhint="done" value="' + esc(me && !me.unnamed ? me.name : "") + '"><button type="submit" class="pl-eye">SAVE</button></div></div><p class="pl-err" hidden></p></form>';
  const err = $(".pl-err", el);
  const save = async n => { err.hidden = true; try { await P.store.rename(n); reset(); buzz(20); done(n); } catch(x){ err.hidden = false; err.textContent = x.message; } };
  $$(".pl-nm", el).forEach(b => b.addEventListener("click", () => { b.classList.add("on"); save(b.dataset.n); }));
  $("form", el).addEventListener("submit", e => { e.preventDefault(); save($("#pl-rn", el).value); });
}

/* your favourite team: all 32 logos, one tap saves (puck_profiles.team) */
function teamPicker(el, me, onSaved){
  const cur = me.team || "MTL";
  el.innerHTML = '<div class="pl-tp-h"><span class="label">YOUR TEAM</span><b class="pl-tp-now">' + esc(P.team(cur).name) + '</b><em class="pl-tp-ok" aria-live="polite"></em></div>' +
    '<div class="pl-tp" role="radiogroup" aria-label="Your favourite team">' + P.TEAMS.slice().sort((a, b) => a.name.localeCompare(b.name)).map(t =>
      '<button type="button" role="radio" aria-checked="' + (t.abbr === cur) + '" class="' + (t.abbr === cur ? "on" : "") + '" data-t="' + t.abbr + '" title="' + esc(t.name) + '" style="--c1:' + t.c1 + '">' + logo(t.abbr) + "</button>").join("") + "</div>";
  const ok = $(".pl-tp-ok", el);
  $$(".pl-tp button", el).forEach(b => b.addEventListener("click", async () => {
    const prev = $(".pl-tp .on", el), t = b.dataset.t;
    if(prev === b) return;
    $$(".pl-tp button", el).forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); });
    $(".pl-tp-now", el).textContent = P.team(t).name; ok.className = "pl-tp-ok"; ok.textContent = "SAVING…"; buzz(8);
    try { await P.store.setTeam(t); me.team = t; if(D && D.players){ const p = D.players.find(x => x.id === me.id); if(p) p.team = t; } ok.textContent = "SAVED ✓"; ok.classList.add("yes"); buzz([10, 30, 10]); if(onSaved) onSaved(t); }
    catch(e){ ok.textContent = e.message; ok.classList.add("bad"); if(prev){ prev.click(); } }
  }));
}
const accent = (el, t) => { if(!el || !t) return; const x = P.team(t); el.style.setProperty("--tc1", x.c1); el.style.setProperty("--tc2", x.c2); el.classList.add("pl-acc"); };

async function mePage(app, band){
  const m = await P.store.me();
  app.innerHTML = band("Me", P.store.mode === "demo" ? "Demo mode" : m ? m.name : "Sign in") + '<div class="wrap stack pl-me" id="mebox"></div>';
  const box = $("#mebox");
  const after = () => { reset(); location.hash = "#home"; };
  if(P.store.mode === "demo"){
    const ps = await P.store.players();
    box.innerHTML = '<div class="card light stack"><h2 style="font-size:24px">Who\'s playing?</h2><p class="one">Demo mode keeps everything on this phone. Switch players to try the Pool as each of us.</p><div class="names">' +
      ps.map(p => '<button type="button" class="chip' + (m && m.id === p.id ? " on" : "") + '" data-id="' + p.id + '">' + esc(p.name) + "</button>").join("") + "</div></div>" +
      '<p class="note">To share picks between three phones, PUCK needs Supabase: see README.md.</p>';
    $$(".names .chip", box).forEach(b => b.addEventListener("click", async () => { await P.store.switchTo(b.dataset.id); reset(); mePage(app, band); }));
    if(m){ const c = box.firstElementChild; accent(c, m.team); c.insertAdjacentHTML("beforeend", '<div class="pl-tpw"></div>'); teamPicker($(".pl-tpw", c), m, t => accent(c, t)); }
  } else if(!m){
    box.innerHTML = '<div class="card light stack"><h2 style="font-size:24px">Sign in</h2><p class="one">With the email and password Martijn gave you.</p><div class="pl-form-slot"></div></div>';
    accountForm($(".pl-form-slot", box), async () => { const x = await P.store.me(); if(x && x.unnamed) mePage(app, band); else after(); });
  } else if(m.unnamed){
    box.innerHTML = '<div class="card light stack"><h2 style="font-size:24px">Welcome! Who are you?</h2><p class="one">Tap your name. It\'s what the others see on the Table.</p><div class="pl-form-slot"></div></div>';
    nameForm($(".pl-form-slot", box), after);
  } else {
    let line = "Signed in. Your picks count for the Table.";
    try { await load(); const rows = SS().table(D.games, D.picks, D.players, SC()), r = rows.find(x => x.id === m.id); if(r && rows.some(x => x.pts)) line = ord(rows.indexOf(r) + 1) + " in the Pool · " + r.pts + " pts · " + r.exact + " exact"; } catch(e){}
    box.innerHTML = '<div class="card light stack"><div class="pl-who"><h2 style="font-size:24px">' + esc(m.name) + '</h2><button type="button" class="pl-ghost" id="pl-ren">CHANGE NAME</button></div><p class="one">' + esc(line) + '</p><div class="pl-form-slot" hidden></div>' +
      '<button type="button" class="pl-ghost" id="pl-out" style="justify-self:start">SIGN OUT</button></div>';
    $("#pl-ren").addEventListener("click", () => { const s = $(".pl-form-slot", box); s.hidden = !s.hidden; if(!s.hidden) nameForm(s, () => mePage(app, band)); });
    $("#pl-out").addEventListener("click", async () => { await P.store.signOut(); reset(); mePage(app, band); });
    const c = box.firstElementChild; accent(c, m.team);
    $("#pl-out").insertAdjacentHTML("beforebegin", '<div class="pl-tpw"></div>'); teamPicker($(".pl-tpw", c), m, t => accent(c, t));
  }
  try { await load(); if(D.me && D.games.some(isOpen)){ box.insertAdjacentHTML("beforeend", reminderCard()); const b = $("[data-ics]", box); if(b) b.addEventListener("click", downloadICS); } } catch(e){}
  let n = 0; try { n = await P.questions.count(); } catch(e){}
  box.insertAdjacentHTML("beforeend", '<div class="card light"><span class="label">About</span><p class="one" style="margin-top:6px">PUCK, a hockey quiz for the three of us. ' + n + " questions in the bank. Logos and data from the NHL, for private use.</p></div>");
}

P.pool = { load, reset, page, table, me: mePage, editor, openSheet, showFinal, showReveal, lines, downloadICS };
})();
