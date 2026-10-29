/* The NHL tab: PUCK's stats centre (decided in _plans/nhl-tab.md).
   Routes (app.js sends every #nhl… hash here as render(app, arg)):
     #nhl                        overview: your team, tonight, divisions, leaders, goalies, all 32 clubs
     #nhl-games[-YYYY-MM-DD]     the schedule: a week of games from that day, filter all / Pool / your team
     #nhl-standings[-<view>]     division | conference | wildcard | league, sortable columns, the power map
     #nhl-leaders-<cat>          skaters; #nhl-leaders-goalie-<cat>, -rookie-<cat>, -d-<cat> (defencemen)
     #nhl-clubs                  every club by division
     #nhl-team-<ABBR>            team page: points race, goals for/against, form, leaders, roster
     #nhl-player-<id>            player page: bio, season, game log chart, career chart, awards
     #nhl-game-<gameId>          one game, head to head (app/nhl/game.js): form, win estimate, stats, series
   Data: PUCK.nhl.cached() (app/nhl.js) through the relay's allow-list; charts: app/nhl/charts.js.
   Your favourite team ((await PUCK.store.me()).team) is drawn in its own colours everywhere;
   the Pool teams (MTL, EDM) in ember. No live stats go to the ticker or the quiz. */
(function(){
const P = window.PUCK = window.PUCK || {}, C = window.PUCK_CONFIG || {};
const N = () => P.nhl, CH = () => P.nhlCharts;
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const onLeave = fn => { if(P.ui && P.ui.onLeave) P.ui.onLeave(fn); };
const POOL = C.POOL_TEAMS || ["MTL", "EDM"];

/* ---------------- formats ---------------- */
const fDay = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
const fDM = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const fTime = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const day = d => fDay.format(d).replace(",", "").toUpperCase();
const dm = d => fDM.format(d).toUpperCase().replace("SEPT", "SEP");
const time = d => fTime.format(d);
const ymd = s => new Date(s + "T12:00:00");            /* a date-only feed value, at noon so no zone moves it */
const ord = n => n + (["TH", "ST", "ND", "RD"][(n % 100 > 10 && n % 100 < 14) ? 0 : n % 10 < 4 ? n % 10 : 0]);
const p3 = v => v == null || isNaN(v) ? "–" : (+v).toFixed(3).replace(/^0/, "");
const f2 = v => v == null || isNaN(v) ? "–" : (+v).toFixed(2);
const f1 = v => v == null || isNaN(v) ? "–" : (+v).toFixed(1);
const pc1 = v => v == null || isNaN(v) ? "–" : (v*100).toFixed(1) + "%";
const sgn = v => v == null ? "–" : v > 0 ? "+" + v : String(v);
const mmss = s => { if(s == null || isNaN(s)) return "–"; s = Math.round(s); return Math.floor(s/60) + ":" + String(s % 60).padStart(2, "0"); };
const seasonTxt = id => { const s = String(id); return s.slice(0, 4) + "-" + s.slice(6, 8); };
const nm = o => o ? (o.default || "") : "";

/* ---------------- teams, colours, highlight ---------------- */
const logoSrc = abbr => (window.PUCK_LOGOS && window.PUCK_LOGOS.dark[abbr]) || P.logo(abbr, true);
const logo = (abbr, cls) => '<img class="' + (cls || "nx-lg") + '" src="' + logoSrc(abbr) + '" alt="' + esc(abbr) + '" loading="lazy">';
const head = (src, cls) => '<img class="' + (cls || "nx-hs") + '" src="' + esc(src) + '" alt="" loading="lazy" onerror="this.classList.add(\'gone\')">';
const lum = hex => { const n = parseInt(hex.slice(1), 16), c = [n >> 16, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v/12.92 : Math.pow((v + .055)/1.055, 2.4); }); return .2126*c[0] + .7152*c[1] + .0722*c[2]; };
/* a team's two colours, the brighter one as the accent (Pittsburgh: gold, Edmonton: orange) */
function tc(abbr){
  const t = P.team(abbr), a = lum(t.c1) >= .06 ? t.c1 : t.c2, b = a === t.c1 ? t.c2 : t.c1;
  return { c1: t.c1, c2: t.c2, acc: lum(a) < .03 ? "#c9d6e6" : a, deep: b };
}
const tvars = abbr => { const c = tc(abbr); return "--t1:" + c.c1 + ";--t2:" + c.c2 + ";--ta:" + c.acc; };
let FAV = null;
/* the classes and colours a row gets: your team in its colours, the Pool teams in ember */
function hl(abbr){
  if(abbr && abbr === FAV) return { cls: " fav", st: ' style="' + tvars(abbr) + '"' };
  if(POOL.includes(abbr)) return { cls: " ours", st: "" };
  return { cls: "", st: "" };
}
async function favTeam(){ try { const me = await P.store.me(); return (me && me.team) || null; } catch(e){ return null; } }

/* ---------------- data ---------------- */
const TTL = { live: 20000, std: 180000, stats: 300000 };
const SK_CATS = "points,goals,assists,plusMinus,goalsPp,goalsSh,penaltyMins,faceoffLeaders,toi";
const PATHS = {
  standings: "/v1/standings/now",
  score: "/v1/score/now",
  scoreOn: d => "/v1/score/" + d,
  skaters: () => N().q("/v1/skater-stats-leaders/current", { categories: SK_CATS, limit: 20 }),
  skatersBasic: () => N().q("/v1/skater-stats-leaders/current", { categories: "points,goals,assists", limit: 20 }),
  skater1: (cat, limit) => N().q("/v1/skater-stats-leaders/current", { categories: cat, limit }),
  goalies: () => N().q("/v1/goalie-stats-leaders/current", { categories: "wins,savePctg,goalsAgainstAverage,shutouts", limit: 20 }),
  rookies: (prop, season) => N().q("/stats/rest/en/skater/summary", { limit: 20, sort: JSON.stringify([{ property: prop, direction: "DESC" }]), cayenneExp: "seasonId=" + season + " and gameTypeId=2 and isRookie=1" }),
  sched: t => "/v1/club-schedule-season/" + t + "/now",
  club: t => "/v1/club-stats/" + t + "/now",
  roster: t => "/v1/roster/" + t + "/current",
  landing: id => "/v1/player/" + id + "/landing",
  log: id => "/v1/player/" + id + "/game-log/now"
};
let stamps = [];
async function load(path, ttl){ const r = await N().cached(path, ttl); stamps.push(r); return r; }

const DIVS = [["A", "Atlantic", "E"], ["M", "Metropolitan", "E"], ["C", "Central", "W"], ["P", "Pacific", "W"]];
const CONFS = [["E", "Eastern"], ["W", "Western"]];
function teamRow(x){
  const rec = (w, l, o) => w + "-" + l + "-" + o;
  return { abbr: x.teamAbbrev.default, name: nm(x.teamName), short: nm(x.teamCommonName), place: nm(x.placeName),
    conf: x.conferenceAbbrev, confName: x.conferenceName, div: x.divisionAbbrev, divName: x.divisionName,
    gp: x.gamesPlayed, w: x.wins, l: x.losses, otl: x.otLosses, pts: x.points, pct: x.pointPctg,
    gf: x.goalFor, ga: x.goalAgainst, gd: x.goalDifferential, rw: x.regulationWins, row: x.regulationPlusOtWins,
    streak: x.streakCode ? x.streakCode + x.streakCount : "–", streakV: x.streakCode ? (x.streakCode === "W" ? 1 : -1)*x.streakCount : 0,
    l10: rec(x.l10Wins, x.l10Losses, x.l10OtLosses), l10p: x.l10Points,
    home: rec(x.homeWins, x.homeLosses, x.homeOtLosses), homeP: x.homePoints, away: rec(x.roadWins, x.roadLosses, x.roadOtLosses), awayP: x.roadPoints,
    seqL: x.leagueSequence, seqC: x.conferenceSequence, seqD: x.divisionSequence, wc: x.wildcardSequence, season: x.seasonId };
}
async function standings(){
  const r = await load(PATHS.standings, TTL.std);
  const teams = (r.data.standings || []).map(teamRow);
  const by = a => teams.find(t => t.abbr === a);
  /* in a playoff spot today: top three of the division, or one of the conference's two wild cards */
  teams.forEach(t => { t.inPos = t.seqD <= 3 || (t.wc >= 1 && t.wc <= 2); });
  return { teams, by, season: teams.length ? teams[0].season : null, fresh: r.fresh, at: r.at };
}
/* the season's results for one team, from its schedule */
function results(sched, abbr){
  const games = (sched.games || []).filter(g => g.gameType === 2).sort((a, b) => a.startTimeUTC < b.startTimeUTC ? -1 : 1);
  const done = [], next = []; let live = null;
  for(const g of games){
    const home = g.homeTeam.abbrev === abbr, me = home ? g.homeTeam : g.awayTeam, op = home ? g.awayTeam : g.homeTeam;
    const st = g.gameState, base = { id: g.id, start: new Date(g.startTimeUTC), home, opp: op.abbrev, venue: nm(g.venue) };
    if(st === "FINAL" || st === "OFF"){
      const end = (g.gameOutcome && g.gameOutcome.lastPeriodType) || "REG", gf = me.score, ga = op.score;
      const res = gf > ga ? "W" : end === "REG" ? "L" : "OTL";
      done.push({ ...base, gf, ga, end, res, pts: res === "W" ? 2 : res === "OTL" ? 1 : 0 });
    } else if(st === "LIVE" || st === "CRIT") live = { ...base, gf: me.score, ga: op.score };
    else next.push(base);
  }
  let run = 0; done.forEach(g => { run += g.pts; g.cum = run; });
  return { done, next, live };
}
/* the pace of the conference's last playoff spot (the second wild card), as points after each game */
function pace(std, conf, n, self){
  let ref = std.teams.find(t => t.conf === conf && t.wc === 2), label = "Playoff line";
  if(ref && ref.abbr === self){ ref = std.teams.find(t => t.conf === conf && t.wc === 3); label = "First team out"; }
  if(!ref || !ref.gp) return null;
  return { team: ref, label, line: Array.from({ length: n }, (_, i) => +(ref.pct*2*(i + 1)).toFixed(2)) };
}
async function skaterLeaders(){
  try { return await load(PATHS.skaters(), TTL.stats); }
  catch(e){ return await load(PATHS.skatersBasic(), TTL.stats); }
}
const leader = x => ({ id: x.id, first: nm(x.firstName), last: nm(x.lastName), num: x.sweaterNumber, team: x.teamAbbrev, pos: x.position, v: x.value, head: x.headshot });

/* ---------------- shared pieces ---------------- */
const sk = (h, cls) => '<div class="nx-sk' + (cls ? " " + cls : "") + '" style="height:' + h + '"></div>';
const lbl = (t, more) => '<div class="nx-h"><h2>' + t + "</h2>" + (more || "") + "</div>";
const more = (href, t) => '<a class="nx-more" href="' + href + '">' + (t || "ALL") + " <span>►</span></a>";
const fail = (what, e) => '<p class="nx-err">Can\'t load ' + what + " right now" + (e && e.message ? " (" + esc(e.message) + ")" : "") + ". " +
  (/^(localhost|127\.)/.test(location.hostname) ? "Is <b>node server/serve.js</b> running?" : "Try again in a minute.") + "</p>";
function legend(items){ return '<div class="nx-key">' + items.map(([n, c, k]) => '<span><i class="' + (k || "sw") + '" style="--c:' + c + '"></i>' + esc(n) + "</span>").join("") + "</div>"; }
function stampHTML(){
  const off = stamps.filter(s => s && !s.fresh);
  if(off.length){ const at = Math.min(...off.map(s => s.at || Date.now())); return '<p class="nx-src off"><i></i>OFFLINE · LAST KNOWN ' + day(new Date(at)) + " " + time(new Date(at)) + "</p>"; }
  return '<p class="nx-src"><i></i>NHL DATA · UPDATED ' + time(new Date()) + "</p>";
}
function stamp(page){ const s = $(".nx-src", page); if(s) s.outerHTML = stampHTML(); else page.insertAdjacentHTML("beforeend", stampHTML()); }
/* a sortable table: cols [{ k, h, v(r) sort value, f(r) html, d: -1 desc first | 1 asc first }], the first col sticks */
function tableHTML(cols, rows, sort, o = {}){
  const s = sort && cols.find(c => c.k === sort.k);
  if(s) rows = rows.slice().sort((a, b) => { const x = s.v(a), y = s.v(b); return (x === y ? (o.tie ? o.tie(a, b) : 0) : (x < y ? -1 : 1)*sort.d); });
  const head = "<thead><tr>" + cols.map((c, i) => '<th scope="col"' + (i ? ' data-k="' + c.k + '"' : "") + ' class="' + (i ? "" : "nm") + (s && s.k === c.k ? " on " + (sort.d < 0 ? "dn" : "up") : "") + (c.cls ? " " + c.cls : "") + '"' + (c.t ? ' title="' + esc(c.t) + '"' : "") + ">" + (i && c.v ? '<button type="button">' + c.h + "</button>" : c.h) + "</th>").join("") + "</tr></thead>";
  const body = rows.map((r, i) => {
    const h = o.row ? o.row(r, i) : { cls: "", st: "" };
    const line = o.cut && o.cut(r, i, rows) ? '<tr class="cut"><td colspan="' + cols.length + '"><span>' + o.cut(r, i, rows) + "</span></td></tr>" : "";
    return '<tr class="' + h.cls + '"' + h.st + (o.href ? ' data-href="' + o.href(r) + '"' : "") + ">" + cols.map((c, j) => "<td" + (j ? (c.cls ? ' class="' + c.cls + '"' : "") : ' class="nm"') + ">" + c.f(r, i) + "</td>").join("") + "</tr>" + line;
  }).join("");
  return '<div class="nx-tw"><table class="nx-t">' + head + "<tbody>" + body + "</tbody></table></div>";
}
/* a table row opens its team or player; a header sorts (the page decides what a sort means) */
function wireTables(root, onSort){
  root.addEventListener("click", e => {
    const th = e.target.closest("th[data-k]"); if(th && root.contains(th)){ onSort(th.dataset.k); return; }
    const tr = e.target.closest("tr[data-href]"); if(tr && !e.target.closest("a")) location.hash = tr.dataset.href;
  });
}
/* switch a view in place (chips, segments): the hash changes without a new route, scroll stays */
function swapHash(h){ try { history.replaceState(null, "", h); } catch(e){ location.hash = h; } }

/* ---------------- the frame: sub-navigation, back, the page ---------------- */
const NAV = [["overview", "#nhl", "Overview"], ["games", "#nhl-games", "Games"], ["standings","#nhl-standings", "Standings"], ["leaders", "#nhl-leaders-points", "Leaders"], ["clubs", "#nhl-clubs", "Clubs"]];
let trail = [], gen = 0;
function frame(app, section, deep){
  const h = location.hash || "#nhl";
  if(trail[trail.length - 2] === h) trail.pop(); else if(trail[trail.length - 1] !== h) trail.push(h);
  if(!deep) trail = [h];
  const back = trail[trail.length - 2] || "#nhl";
  const again = !!$(".nx", app);
  app.innerHTML = '<div class="nx"><nav class="nx-nav" aria-label="NHL sections">' + NAV.map(([k, href, t]) => '<a href="' + href + '"' + (k === section ? ' class="on" aria-current="page"' : "") + "><span>" + t + "</span></a>").join("") + "</nav>" +
    (deep ? '<a class="nx-back" href="' + back + '"><i class="ab b">B</i>BACK</a>' : "") + '<div class="nx-page' + (again ? " nx-enter" : "") + '"></div></div>';
  return $(".nx-page", app);
}

/* ================= OVERVIEW ================= */
let ovCat = "points";
async function overview(page, alive){
  page.innerHTML =
    '<section id="ov-team">' + sk("62cqw", "card") + "</section>" +
    '<section id="ov-tonight">' + lbl("Tonight") + '<div class="nx-games">' + sk("19cqw") + sk("19cqw") + sk("19cqw") + sk("19cqw") + "</div></section>" +
    '<section id="ov-div">' + lbl("Standings", more("#nhl-standings", "FULL TABLE")) + '<div class="nx-divs">' + sk("44cqw") + sk("44cqw") + sk("44cqw") + sk("44cqw") + "</div></section>" +
    '<section id="ov-lead">' + lbl("League leaders") + sk("42cqw", "card") + sk("40cqw") + "</section>" +
    '<section id="ov-net">' + lbl("In the crease", more("#nhl-leaders-goalie-wins", "GOALIES")) + '<div class="nx-net">' + sk("36cqw") + sk("36cqw") + sk("36cqw") + "</div></section>" +
    '<section id="ov-clubs">' + lbl("All 32 clubs", more("#nhl-clubs", "CLUBS")) + sk("26cqw") + "</section>";
  const stdP = standings();
  /* your team (or the Habs), tonight, the divisions, the leaders, the goalies: each fills in on its own */
  const jobs = [
    (async () => { const std = await stdP; const t = FAV || "MTL"; let res = null; try { res = results((await load(PATHS.sched(t), TTL.stats)).data, t); } catch(e){} if(alive()) $("#ov-team", page).innerHTML = myTeam(std, t, res); })()
      .catch(e => { if(alive()) $("#ov-team", page).innerHTML = fail("your team", e); }),
    tonight(page, alive),
    (async () => { const std = await stdP; if(!alive()) return; $("#ov-div", page).innerHTML = lbl("Standings", more("#nhl-standings", "FULL TABLE")) + divGlance(std); $("#ov-clubs", page).innerHTML = lbl("All 32 clubs", more("#nhl-clubs", "CLUBS")) + clubGrid(std); })()
      .catch(e => { if(alive()){ $("#ov-div", page).innerHTML = lbl("Standings") + fail("the standings", e); $("#ov-clubs", page).innerHTML = ""; } }),
    (async () => { const r = await skaterLeaders(); if(alive()) ovLeaders(page, r.data); })()
      .catch(e => { if(alive()) $("#ov-lead", page).innerHTML = lbl("League leaders") + fail("the leaders", e); }),
    (async () => { const r = await load(PATHS.goalies(), TTL.stats); if(alive()) $("#ov-net", page).innerHTML = lbl("In the crease", more("#nhl-leaders-goalie-wins", "GOALIES")) + netCards(r.data); })()
      .catch(e => { if(alive()) $("#ov-net", page).innerHTML = lbl("In the crease") + fail("the goalies", e); })
  ];
  await Promise.all(jobs);
  if(alive()) stamp(page);
}

/* your team's card: record, ranks, streak, last 10, the points trend, next and last game */
function myTeam(std, abbr, res){
  const t = std.by(abbr); if(!t) return "";
  const pc = res && res.done.length > 1 ? pace(std, t.conf, res.done.length, abbr) : null;
  const trend = res && res.done.length > 1 ? CH().spark(res.done.map(g => g.cum), { w: 150, h: 44, color: "#ffd36a", ref: pc && pc.line }) : "";
  const nx = res && (res.live || res.next[0]), last = res && res.done[res.done.length - 1];
  const vs = g => (g.home ? "vs " : "@ ") + logo(g.opp, "nx-lgs") + "<b>" + g.opp + "</b>";
  const nextTxt = !nx ? "" : res.live === nx ? '<span class="live">LIVE</span> ' + vs(nx) + " <b>" + nx.gf + "–" + nx.ga + "</b>" : '<span>' + day(nx.start) + " · " + time(nx.start) + "</span> " + vs(nx);
  const lastTxt = !last ? "" : '<em class="r ' + last.res.toLowerCase() + '">' + (last.res === "OTL" ? last.end : last.res) + "</em> " + last.gf + "–" + last.ga + (last.end !== "REG" && last.res === "W" ? " " + last.end : "") + " " + vs(last);
  return '<a class="nx-my" href="#nhl-team-' + abbr + '" style="' + tvars(abbr) + '">' +
    '<div class="nx-my-top"><span class="big" aria-hidden="true">' + esc(abbr) + "</span>" + logo(abbr, "nx-my-lg") +
      '<div class="nm"><small>' + (FAV ? "YOUR TEAM" : "THE HABS") + " · " + esc(t.divName.toUpperCase()) + "</small><h3" + (t.short.length > 9 ? ' class="long"' : "") + ">" + esc(t.short) + '</h3><span class="rec">' + t.w + "-" + t.l + "-" + t.otl + "</span></div>" +
      '<div class="pts"><b>' + t.pts + "</b><small>PTS</small></div></div>" +
    '<div class="nx-my-cells"><span><small>DIVISION</small><b>' + ord(t.seqD) + "</b></span><span><small>" + (t.conf === "E" ? "EAST" : "WEST") + "</small><b>" + ord(t.seqC) + "</b></span><span><small>STREAK</small><b>" + esc(t.streak) + "</b></span><span><small>LAST 10</small><b>" + esc(t.l10) + "</b></span></div>" +
    (trend ? '<div class="nx-my-trend"><div><small>POINTS · ' + res.done.length + " GAMES</small>" + (pc ? '<small class="k"><span><i class="me"></i>' + esc(t.short.toUpperCase()) + '</span><span><i class="wc"></i>' + esc(pc.label.toUpperCase()) + "</span></small>" : "") + "</div>" + trend + "</div>" : "") +
    ((nextTxt || lastTxt) ? '<div class="nx-my-games">' + (nextTxt ? '<span class="g"><small>NEXT</small>' + nextTxt + "</span>" : "") + (lastTxt ? '<span class="g"><small>LAST</small>' + lastTxt + "</span>" : "") + "</div>" : "") +
    (FAV ? "" : '<p class="nx-my-hint">Pick your team on <u>Me</u> and it shows here.</p>') + "</a>";
}

/* tonight's scoreboard; live games refresh every 30 s while the tab is open */
function gameState(x){
  const st = x.gameState, pd = x.periodDescriptor || {}, clock = x.clock || {};
  if(st === "LIVE" || st === "CRIT"){
    if(clock.inIntermission) return { live: true, txt: "INT " + (pd.number || "") };
    const per = pd.periodType === "OT" ? "OT" : pd.periodType === "SO" ? "SO" : "P" + (pd.number || "");
    return { live: true, txt: per + (clock.timeRemaining && pd.periodType !== "SO" ? " · " + clock.timeRemaining : "") };
  }
  if(st === "FINAL" || st === "OFF"){ const e = (x.gameOutcome && x.gameOutcome.lastPeriodType) || pd.periodType; return { done: true, txt: "FINAL" + (e && e !== "REG" ? "/" + e : "") }; }
  if(x.gameScheduleState && x.gameScheduleState !== "OK") return { txt: x.gameScheduleState === "PPD" ? "POSTPONED" : x.gameScheduleState };
  return { txt: time(new Date(x.startTimeUTC)) };
}
function gameTile(x){
  const s = gameState(x), a = x.awayTeam, h = x.homeTeam, pool = POOL.includes(a.abbrev) || POOL.includes(h.abbrev);
  const sc = t => typeof t.score === "number" ? t.score : "";
  const won = (t, o) => s.done && t.score > o.score ? " w" : "";
  const side = (t, o) => { const m = hl(t.abbrev); return '<span class="tm' + m.cls + won(t, o) + '"' + m.st + ">" + logo(t.abbrev, "nx-lgs") + "<b>" + t.abbrev + "</b><em>" + esc(t.record || "") + "</em><strong>" + sc(t) + "</strong></span>"; };
  const tag = pool ? '<span class="pool">POOL</span>' : "";
  /* every card opens the game's head-to-head page; a Pool game's page has the way into the Pool */
  return '<a class="nx-game' + (pool ? " pool" : "") + (s.live ? " live" : "") + '" href="#nhl-game-' + x.id + '" aria-label="' + esc(a.abbrev + " at " + h.abbrev + ", head to head") + '">' +
    '<span class="st">' + (s.live ? '<i class="dot"></i>' : "") + esc(s.txt) + tag + "</span>" + side(a, h) + side(h, a) + "</a>";
}
async function tonight(page, alive){
  const box = () => $("#ov-tonight", page);
  const draw = r => {
    const g = (r.data.games || []), d = r.data.currentDate ? ymd(r.data.currentDate) : new Date();
    const lv = g.filter(x => x.gameState === "LIVE" || x.gameState === "CRIT").length;
    const sub = '<span class="nx-sub">' + day(d) + " · " + g.length + " GAME" + (g.length === 1 ? "" : "S") + (lv ? ' · <b class="lv">' + lv + " LIVE</b>" : "") + "</span>";
    /* the next days from the feed's own week (no extra request), each a way into the schedule */
    const cur = r.data.currentDate, next = (r.data.gameWeek || []).filter(w => cur && w.date > cur && w.numberOfGames).slice(0, 4);
    const up = '<div class="nx-h nx-uph"><h2>Coming up</h2>' + more("#nhl-games", "ALL GAMES") + "</div>" +
      (next.length ? '<div class="nx-up">' + next.map(w => '<a href="#nhl-games-' + w.date + '"><small>' + esc(day(ymd(w.date)).split(" ")[0]) + "</small><b>" + esc(dm(ymd(w.date))) + "</b><em>" + w.numberOfGames + " GAME" + (w.numberOfGames === 1 ? "" : "S") + "</em></a>").join("") + "</div>" : "");
    box().innerHTML = lbl(lv ? "Live now" : "Tonight", sub) + (g.length ? '<div class="nx-games">' + g.map(gameTile).join("") + "</div>" : '<p class="nx-none">No NHL games today.</p>') +
      (g.length ? '<p class="nx-fine">Times in your time zone. Tap a game for the head to head.</p>' : "") + up;
    return g;
  };
  try {
    const g = draw(await load(PATHS.score, TTL.live));
    const hot = () => g.some(x => x.gameState === "LIVE" || x.gameState === "CRIT" || (x.gameState !== "FINAL" && x.gameState !== "OFF" && new Date(x.startTimeUTC) - Date.now() < 15*60000));
    if(hot()){
      const iv = setInterval(async () => { if(!alive()){ clearInterval(iv); return; } try { const r = await N().cached(PATHS.score, TTL.live); if(alive()) draw(r); } catch(e){} }, 30000);
      onLeave(() => clearInterval(iv));
    }
  } catch(e){ if(alive()) box().innerHTML = lbl("Tonight") + fail("tonight's games", e); }
}

/* ================= GAMES: a week of the schedule ================= */
/* dates are the NHL's own (Eastern) days, as YYYY-MM-DD; the arithmetic runs at UTC noon so no zone moves a day */
const addDays = (s, n) => new Date(Date.parse(s + "T12:00:00Z") + n*864e5).toISOString().slice(0, 10);
let gamesFilter = "all";
async function gamesPage(page, alive, arg){
  const today = await load(PATHS.score, TTL.live).then(r => r.data.currentDate).catch(() => null) || new Date().toISOString().slice(0, 10);
  if(!alive()) return;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(arg) ? arg : today;
  const days = [...Array(7)].map((_, i) => addDays(from, i));
  const filters = [["all", "All games"], ["pool", "Pool"]].concat(FAV && !POOL.includes(FAV) ? [["fav", "★ " + FAV]] : []);
  if(!filters.some(f => f[0] === gamesFilter)) gamesFilter = "all";
  const keep = x => gamesFilter === "all" ? true : gamesFilter === "pool" ? [x.awayTeam.abbrev, x.homeTeam.abbrev].some(t => POOL.includes(t)) : [x.awayTeam.abbrev, x.homeTeam.abbrev].includes(FAV);
  page.innerHTML = '<div class="nx-h"><h2>Games</h2><span class="nx-sub">' + esc(dm(ymd(days[0]))) + " – " + esc(dm(ymd(days[6]))) + "</span></div>" +
    '<div class="nx-wk"><a href="#nhl-games-' + addDays(from, -7) + '">◄ EARLIER</a>' + (from !== today ? '<a href="#nhl-games">TONIGHT</a>' : "") + '<a href="#nhl-games-' + addDays(from, 7) + '">LATER ►</a></div>' +
    '<div class="nx-chips" role="tablist">' + filters.map(([k, t]) => '<a role="tab" href="#" data-f="' + k + '"' + (k === gamesFilter ? ' class="on" aria-selected="true"' : ' aria-selected="false"') + ">" + esc(t) + "</a>").join("") + "</div>" +
    days.map(d => '<section class="nx-day" data-d="' + d + '">' + lbl(title(d)) + sk("19cqw") + "</section>").join("") +
    '<p class="nx-fine">Times in your time zone. Tap a game for the head to head.</p>';
  function title(d){ return d === today ? "Tonight" : d === addDays(today, 1) ? "Tomorrow" : esc(day(ymd(d))); }
  const got = {};
  const draw = d => {
    const sec = $('.nx-day[data-d="' + d + '"]', page), g = got[d];
    if(!sec || !g) return;
    const show = g.filter(keep);
    const n = '<span class="nx-sub">' + g.length + " GAME" + (g.length === 1 ? "" : "S") + (show.length !== g.length ? " · " + show.length + " SHOWN" : "") + "</span>";
    sec.innerHTML = lbl(title(d), n) + (show.length ? '<div class="nx-games">' + show.map(gameTile).join("") + "</div>" : '<p class="nx-none">' + (g.length ? "None of these games." : "No NHL games.") + "</p>");
    sec.hidden = gamesFilter !== "all" && !show.length;
  };
  $$("[data-f]", page).forEach(a => a.addEventListener("click", e => {
    e.preventDefault(); gamesFilter = a.dataset.f;
    $$("[data-f]", page).forEach(b => { b.classList.toggle("on", b === a); b.setAttribute("aria-selected", b === a); });
    days.forEach(draw);
  }));
  /* the days load side by side; a day that fails says so in its own place */
  await Promise.all(days.map(async d => {
    try { const r = await load(PATHS.scoreOn(d), d === today ? TTL.live : TTL.std); if(!alive()) return; got[d] = r.data.games || []; draw(d); }
    catch(e){ if(!alive()) return; const sec = $('.nx-day[data-d="' + d + '"]', page); if(sec) sec.innerHTML = $(".nx-h", sec).outerHTML + fail("these games", e); }
  }));
  if(alive()) stamp(page);
}

/* the four divisions, top four and the playoff line under third; your division first */
function divGlance(std){
  const fd = FAV && std.by(FAV) ? std.by(FAV).div : null;
  const order = DIVS.slice().sort((a, b) => (b[0] === fd) - (a[0] === fd));
  return '<div class="nx-divs">' + order.map(([k, name]) => {
    const ts = std.teams.filter(t => t.div === k).sort((a, b) => a.seqD - b.seqD);
    let rows = ts.slice(0, 4);
    const extra = FAV && fd === k && !rows.some(t => t.abbr === FAV) ? ts.find(t => t.abbr === FAV) : null;
    const r = t => { const m = hl(t.abbr); return '<a class="nx-dr' + m.cls + '"' + m.st + ' href="#nhl-team-' + t.abbr + '"><i>' + t.seqD + "</i>" + logo(t.abbr, "nx-lgs") + "<b>" + t.abbr + "</b><span>" + t.gp + "</span><strong>" + t.pts + "</strong></a>"; };
    return '<div class="nx-dvp"><a class="nx-dh" href="#nhl-standings" aria-label="' + esc(name) + ' standings"><b>' + esc(name.toUpperCase()) + "</b><span>GP</span><span>PTS</span></a>" +
      rows.map((t, i) => r(t) + (i === 2 ? '<div class="nx-pl"><span>PLAYOFF LINE</span></div>' : "")).join("") + (extra ? '<div class="nx-gap">···</div>' + r(extra) : "") + "</div>";
  }).join("") + "</div>";
}

/* the leaders block: a gold number 1, then two to five */
const SKC = [
  { id: "points", h: "Points", s: "PTS" }, { id: "goals", h: "Goals", s: "G" }, { id: "assists", h: "Assists", s: "A" },
  { id: "plusMinus", h: "Plus/minus", s: "+/-", f: sgn }, { id: "goalsPp", h: "Power-play goals", s: "PPG" }, { id: "goalsSh", h: "Short-handed goals", s: "SHG" },
  { id: "toi", h: "Ice time per game", s: "TOI", f: mmss }, { id: "faceoffLeaders", h: "Faceoff %", s: "FO%", f: pc1, nobar: true }, { id: "penaltyMins", h: "Penalty minutes", s: "PIM" }
];
const GOC = [
  { id: "wins", h: "Wins", s: "W" }, { id: "savePctg", h: "Save %", s: "SV%", f: p3, nobar: true }, { id: "goalsAgainstAverage", h: "Goals against average", s: "GAA", f: f2, nobar: true }, { id: "shutouts", h: "Shutouts", s: "SO" }
];
const RKC = [{ id: "points", h: "Points", s: "PTS" }, { id: "goals", h: "Goals", s: "G" }, { id: "assists", h: "Assists", s: "A" }, { id: "plusMinus", h: "Plus/minus", s: "+/-", f: sgn }];
const DFC = RKC;
const fmtOf = c => c.f || (v => v);
function goldCard(p, c, rank, big){
  const f = fmtOf(c), m = hl(p.team);
  return '<a class="nx-gold' + (big ? " big" : "") + (m.cls ? " " + m.cls.trim() : "") + '" href="#nhl-player-' + p.id + '" style="' + tvars(p.team) + '">' +
    '<span class="in"><span class="num" aria-hidden="true">' + esc(p.num != null ? p.num : "") + "</span>" + head(p.head, "hs") +
    '<span class="txt"><small>NO. ' + rank + " · " + esc(c.h.toUpperCase()) + "</small><span class=\"fn\">" + esc(p.first) + "</span><b>" + esc(p.last) + "</b>" +
    '<span class="tm">' + logo(p.team, "nx-lgs") + esc(p.team) + (p.pos ? " · " + esc(p.pos) : "") + (p.num != null ? " · #" + esc(p.num) : "") + "</span></span>" +
    '<span class="val"><b>' + esc(f(p.v)) + "</b><small>" + esc(c.s) + "</small></span></span></a>";
}
function leaderRows(list, c, from, bars){
  const f = fmtOf(c), top = Math.max(...list.map(p => Math.abs(p.v) || 0)) || 1;
  /* ties share a rank */
  let rk = 0, prev = null;
  return '<div class="nx-lr">' + list.map((p, i) => { if(p.v !== prev){ rk = i + 1; prev = p.v; } return { p, rk }; }).slice(from).map(({ p, rk }) => {
    const m = hl(p.team), w = bars && !c.nobar ? Math.max(2, Math.abs(p.v)/top*100) : 0;
    return '<a class="nx-row' + m.cls + '"' + m.st + ' href="#nhl-player-' + p.id + '"><i>' + rk + "</i>" + head(p.head) +
      '<span class="who"><b>' + esc(p.first.charAt(0) + ". " + p.last) + "</b><small>" + logo(p.team, "nx-lgx") + esc(p.team) + (p.pos ? " · " + esc(p.pos) : "") + "</small></span>" +
      '<span class="v">' + (w ? '<span class="bar"><i style="width:' + w.toFixed(1) + '%"></i></span>' : "") + "<strong>" + esc(f(p.v)) + "</strong></span></a>";
  }).join("") + "</div>";
}
function ovLeaders(page, data){
  const box = $("#ov-lead", page);
  const cats = SKC.slice(0, 3).filter(c => data[c.id]);
  const draw = () => {
    const c = cats.find(x => x.id === ovCat) || cats[0], list = (data[c.id] || []).map(leader);
    box.innerHTML = lbl("League leaders", more("#nhl-leaders-" + c.id, "TOP 20")) +
      '<div class="nx-seg" role="tablist">' + cats.map(x => '<button type="button" role="tab" aria-selected="' + (x.id === c.id) + '" data-c="' + x.id + '"' + (x.id === c.id ? ' class="on"' : "") + "><span>" + x.h + "</span></button>").join("") + "</div>" +
      (list.length ? goldCard(list[0], c, 1) + leaderRows(list.slice(0, 5), c, 1, true) : '<p class="nx-none">No games played yet.</p>');
    $$("[data-c]", box).forEach(b => b.addEventListener("click", () => { ovCat = b.dataset.c; draw(); }));
  };
  draw();
}
function netCards(data){
  const pick = [["wins", "WINS", v => v], ["savePctg", "SAVE %", p3], ["goalsAgainstAverage", "GAA", f2]];
  return '<div class="nx-net">' + pick.map(([k, t, f]) => {
    const x = (data[k] || [])[0]; if(!x) return ""; const p = leader(x), m = hl(p.team);
    return '<a class="nx-gc' + m.cls + '"' + m.st + ' href="#nhl-player-' + p.id + '" style="' + tvars(p.team) + '"><small>' + t + "</small>" + head(p.head) + "<strong>" + esc(f(p.v)) + "</strong><b>" + esc(p.last) + "</b><em>" + logo(p.team, "nx-lgx") + esc(p.team) + "</em></a>";
  }).join("") + "</div>";
}
function clubGrid(std){
  return '<div class="nx-clubs">' + DIVS.map(([k]) => std.teams.filter(t => t.div === k).sort((a, b) => a.abbr < b.abbr ? -1 : 1).map(t => { const m = hl(t.abbr); return '<a class="' + m.cls.trim() + '"' + m.st + ' href="#nhl-team-' + t.abbr + '" title="' + esc(t.name) + '">' + logo(t.abbr) + "</a>"; }).join("")).join("") + "</div>";
}

/* ================= STANDINGS ================= */
const VIEWS = [["division", "Division"], ["conference", "Conference"], ["wildcard", "Wild card"], ["league", "League"]];
let stSort = null;
const COLS = () => [
  { k: "team", h: "TEAM", f: (t, i) => '<span class="tc"><i>' + (t._rk != null ? t._rk : i + 1) + "</i>" + logo(t.abbr, "nx-lgs") + "<b>" + t.abbr + '</b>' + (t.inPos ? '<em class="x" title="In a playoff spot">x</em>' : "") + "</span>" },
  { k: "gp", h: "GP", v: t => t.gp, d: -1, f: t => t.gp },
  { k: "w", h: "W", v: t => t.w, d: -1, f: t => t.w },
  { k: "l", h: "L", v: t => t.l, d: 1, f: t => t.l },
  { k: "otl", h: "OTL", v: t => t.otl, d: 1, f: t => t.otl },
  { k: "pts", h: "PTS", v: t => t.pts, d: -1, f: t => "<strong>" + t.pts + "</strong>", cls: "pt" },
  { k: "pct", h: "P%", v: t => t.pct, d: -1, f: t => p3(t.pct) },
  { k: "gf", h: "GF", v: t => t.gf, d: -1, f: t => t.gf },
  { k: "ga", h: "GA", v: t => t.ga, d: 1, f: t => t.ga },
  { k: "gd", h: "DIFF", v: t => t.gd, d: -1, f: t => '<span class="' + (t.gd > 0 ? "pos" : t.gd < 0 ? "neg" : "") + '">' + sgn(t.gd) + "</span>" },
  { k: "rw", h: "RW", v: t => t.rw, d: -1, f: t => t.rw, t: "Regulation wins" },
  { k: "strk", h: "STRK", v: t => t.streakV, d: -1, f: t => '<span class="sk ' + (t.streak[0] || "") + '">' + t.streak + "</span>" },
  { k: "l10", h: "L10", v: t => t.l10p, d: -1, f: t => t.l10 },
  { k: "home", h: "HOME", v: t => t.homeP, d: -1, f: t => t.home },
  { k: "away", h: "AWAY", v: t => t.awayP, d: -1, f: t => t.away }
];
async function standingsPage(page, alive, view){
  if(!VIEWS.some(v => v[0] === view)) view = "division";
  page.innerHTML = lbl("Standings") + sk("10cqw") + sk("120cqw");
  let std;
  try { std = await standings(); } catch(e){ if(alive()) page.innerHTML = lbl("Standings") + fail("the standings", e); return; }
  if(!alive()) return;
  const draw = () => {
    const cols = COLS(), sorted = !!stSort;
    const rowOpt = (cut) => ({ row: t => hl(t.abbr), href: t => "#nhl-team-" + t.abbr, cut: sorted ? null : cut, tie: (a, b) => a.seqL - b.seqL });
    const grp = (title, ts, cut, sub) => '<div class="nx-grp"><h3>' + esc(title) + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</h3>" + tableHTML(cols, ts, stSort, rowOpt(cut)) + "</div>";
    const rk = (ts, key) => ts.map(t => ({ ...t, _rk: t[key] }));
    let html = "";
    const fc = FAV && std.by(FAV) ? std.by(FAV).conf : null, fd = FAV && std.by(FAV) ? std.by(FAV).div : null;
    const confs = CONFS.slice().sort((a, b) => (b[0] === fc) - (a[0] === fc));
    if(view === "division"){
      const ds = DIVS.slice().sort((a, b) => (b[0] === fd) - (a[0] === fd));
      html = ds.map(([k, name, c]) => grp(name, rk(std.teams.filter(t => t.div === k).sort((a, b) => a.seqD - b.seqD), "seqD"), (t, i) => i === 2 ? "PLAYOFF LINE" : "", c === "E" ? "EASTERN" : "WESTERN")).join("");
    } else if(view === "conference"){
      html = confs.map(([k, name]) => grp(name, rk(std.teams.filter(t => t.conf === k).sort((a, b) => a.seqC - b.seqC), "seqC"), (t, i, all) => i === 7 ? "TOP 8" : "", "CONFERENCE")).join("");
    } else if(view === "wildcard"){
      html = confs.map(([k, name]) => {
        const ds = DIVS.filter(d => d[2] === k), top = d => std.teams.filter(t => t.div === d[0] && t.seqD <= 3).sort((a, b) => a.seqD - b.seqD);
        const rest = std.teams.filter(t => t.conf === k && t.wc > 0).sort((a, b) => a.wc - b.wc);
        return '<div class="nx-wc"><h3 class="nx-ch">' + esc(name.toUpperCase()) + "</h3>" + ds.map(d => grp(d[1], rk(top(d), "seqD"), null, "TOP 3")).join("") +
          grp("Wild card", rk(rest, "wc"), (t, i) => i === 1 ? "PLAYOFF LINE" : "", "") + "</div>";
      }).join("");
    } else {
      html = grp("NHL", rk(std.teams.slice().sort((a, b) => a.seqL - b.seqL), "seqL"), (t, i) => i === 15 ? "TOP 16" : "", "ALL 32");
    }
    $("#st-tables", page).innerHTML = html;
    $("#st-sort", page).innerHTML = sorted ? 'Sorted by <b>' + esc(cols.find(c => c.k === stSort.k).h) + '</b> · <button type="button" id="st-reset">Back to the standings</button>' : "Tap a column to sort. <b class=\"x\">x</b> = in a playoff spot today.";
    const rs = $("#st-reset", page); if(rs) rs.addEventListener("click", () => { stSort = null; draw(); });
  };
  page.innerHTML = lbl("Standings", '<span class="nx-sub">' + seasonTxt(std.season || 20262027) + " · REGULAR SEASON</span>") +
    '<div class="nx-seg" role="tablist">' + VIEWS.map(([k, t]) => '<a role="tab" href="#nhl-standings-' + k + '" data-v="' + k + '"' + (k === view ? ' class="on" aria-selected="true"' : ' aria-selected="false"') + "><span>" + t + "</span></a>").join("") + "</div>" +
    '<p class="nx-fine" id="st-sort"></p><div id="st-tables"></div>' +
    '<section class="nx-panel">' + lbl("Power map", '<span class="nx-sub">GOAL DIFFERENCE × POINTS %</span>') + '<div class="nx-chart" id="st-map"></div>' +
      '<p class="nx-fine">Top right: winning and outscoring. Tap a logo for the team. Lines at even goal difference and a .500 points %.</p></section>';
  $$("[data-v]", page).forEach(a => a.addEventListener("click", e => {
    e.preventDefault(); view = a.dataset.v; swapHash(a.getAttribute("href"));
    $$("[data-v]", page).forEach(x => { x.classList.toggle("on", x === a); x.setAttribute("aria-selected", x === a); }); draw();
  }));
  wireTables($("#st-tables", page), k => {
    const c = COLS().find(x => x.k === k); if(!c) return;
    stSort = stSort && stSort.k === k ? { k, d: -stSort.d } : { k, d: c.d || -1 };
    draw();
  });
  draw();
  CH().scatter($("#st-map", page), {
    label: "Goal difference against points percentage, all 32 teams",
    items: std.teams.map(t => { const m = hl(t.abbr); return { x: t.gd, y: t.pct, logo: logoSrc(t.abbr), href: "#nhl-team-" + t.abbr, hi: m.cls.includes("fav") ? tc(t.abbr).acc : m.cls.includes("ours") ? "#f08a17" : null,
      tip: "<b>" + esc(t.name) + "</b><span>" + t.pts + " pts · " + p3(t.pct) + " · " + ord(t.seqL) + " in the NHL</span><span>Goals " + t.gf + "–" + t.ga + " (" + sgn(t.gd) + ")</span>" }; }),
    xFmt: sgn, yFmt: p3, xRef: 0, yRef: .5, xLabel: "Goal difference", yLabel: "Points %"
  });
  stamp(page);
}

/* ================= LEADERS ================= */
const GROUPS = [["skaters", "Skaters", "", SKC], ["goalies", "Goalies", "goalie-", GOC], ["rookies", "Rookies", "rookie-", RKC], ["defence", "Defence", "d-", DFC]];
function parseLeaders(arg){
  const a = arg || "";
  const g = GROUPS.find(x => x[2] && a.startsWith(x[2])) || GROUPS[0];
  const id = g[2] ? a.slice(g[2].length) : a, c = g[3].find(x => x.id === id) || g[3][0];
  return { g, c };
}
async function leaderList(g, c){
  if(g[0] === "skaters"){ const r = await skaterLeaders(); return (r.data[c.id] || []).map(leader); }
  if(g[0] === "goalies"){ const r = await load(PATHS.goalies(), TTL.stats); return (r.data[c.id] || []).map(leader); }
  if(g[0] === "defence"){
    const r = await load(PATHS.skater1(c.id, 100), TTL.stats);
    return (r.data[c.id] || []).filter(x => x.position === "D").slice(0, 20).map(leader);
  }
  /* rookies: the stats API; no sweater numbers there, the headshot from the team's folder */
  const std = await standings(), season = std.season || 20262027;
  const r = await load(PATHS.rookies(c.id, season), TTL.stats);
  return (r.data.data || []).map(x => { const team = String(x.teamAbbrevs || "").split(",").pop().trim();
    const full = x.skaterFullName || "", last = x.lastName || full.split(" ").slice(-1)[0], first = full.slice(0, full.length - last.length).trim();
    return { id: x.playerId, first, last, num: null, team, pos: x.positionCode, v: x[c.id], head: "https://assets.nhle.com/mugs/nhl/" + season + "/" + team + "/" + x.playerId + ".png" }; });
}
async function leadersPage(page, alive, arg){
  let { g, c } = parseLeaders(arg);
  const chrome = () => '<div class="nx-seg four" role="tablist">' + GROUPS.map(x => '<a role="tab" href="#nhl-leaders-' + x[2] + x[3][0].id + '" data-g="' + x[0] + '"' + (x === g ? ' class="on" aria-selected="true"' : ' aria-selected="false"') + "><span>" + x[1] + "</span></a>").join("") + "</div>" +
    '<div class="nx-chips" role="tablist">' + g[3].map(x => '<a role="tab" href="#nhl-leaders-' + g[2] + x.id + '" data-c="' + x.id + '"' + (x === c ? ' class="on" aria-selected="true"' : ' aria-selected="false"') + ">" + esc(x.h) + "</a>").join("") + "</div>";
  const draw = async () => {
    const n = ++drawN;
    page.innerHTML = lbl("Leaders", '<span class="nx-sub">' + esc(g[1].toUpperCase()) + " · TOP 20</span>") + chrome() + '<div id="ld-body">' + sk("52cqw", "card") + sk("14cqw") + sk("14cqw") + sk("14cqw") + "</div>";
    wire();
    const ch = $(".nx-chips .on", page); if(ch) ch.scrollIntoView({ block: "nearest", inline: "center" });
    try {
      const list = await leaderList(g, c);
      if(!alive() || n !== drawN) return;
      const note = g[0] === "rookies" ? '<p class="nx-fine">Rookies: first NHL season by the league\'s rules.</p>' : g[0] === "defence" ? '<p class="nx-fine">Defencemen from the league\'s top 100 in ' + esc(c.h.toLowerCase()) + ".</p>" : c.id === "goalsAgainstAverage" || c.id === "savePctg" ? '<p class="nx-fine">Goalies with enough games to qualify, as the NHL counts them.</p>' : "";
      $("#ld-body", page).innerHTML = list.length ? goldCard(list[0], c, 1, true) + leaderRows(list, c, 1, true) + note : '<p class="nx-none">No leaders yet in this category.</p>';
      stamp(page);
    } catch(e){ if(alive() && n === drawN) $("#ld-body", page).innerHTML = fail("these leaders", e); }
  };
  let drawN = 0;
  function wire(){
    $$("[data-g]", page).forEach(a => a.addEventListener("click", e => { e.preventDefault(); swapHash(a.getAttribute("href")); g = GROUPS.find(x => x[0] === a.dataset.g); c = g[3][0]; draw(); }));
    $$("[data-c]", page).forEach(a => a.addEventListener("click", e => { e.preventDefault(); swapHash(a.getAttribute("href")); c = g[3].find(x => x.id === a.dataset.c); draw(); }));
  }
  await draw();
}

/* ================= CLUBS ================= */
async function clubsPage(page, alive){
  page.innerHTML = lbl("Clubs") + sk("80cqw") + sk("80cqw");
  let std; try { std = await standings(); } catch(e){ if(alive()) page.innerHTML = lbl("Clubs") + fail("the clubs", e); return; }
  if(!alive()) return;
  page.innerHTML = lbl("Clubs", '<span class="nx-sub">32 TEAMS · BY DIVISION</span>') + DIVS.map(([k, name, c]) => '<div class="nx-grp"><h3>' + esc(name) + "<small>" + (c === "E" ? "EASTERN" : "WESTERN") + '</small></h3><div class="nx-cl">' +
    std.teams.filter(t => t.div === k).sort((a, b) => a.seqD - b.seqD).map(t => { const m = hl(t.abbr);
      return '<a class="nx-club' + m.cls + '" href="#nhl-team-' + t.abbr + '" style="' + tvars(t.abbr) + '">' + logo(t.abbr) + '<span><small>' + esc(t.place.toUpperCase()) + "</small><b>" + esc(t.short) + "</b><em>" + t.w + "-" + t.l + "-" + t.otl + " · <strong>" + t.pts + "</strong> PTS · " + ord(t.seqD) + "</em></span></a>"; }).join("") + "</div></div>").join("");
  stamp(page);
}

/* ================= TEAM ================= */
async function teamPage(page, alive, abbr){
  abbr = String(abbr || "").toUpperCase();
  if(!P.TEAMS.some(t => t.abbr === abbr)){ page.innerHTML = '<p class="nx-none">No team called ' + esc(abbr) + '. <a href="#nhl-clubs">All clubs</a></p>'; return; }
  page.innerHTML = '<div class="nx-hero sk-hero" style="' + tvars(abbr) + '">' + logo(abbr, "lg") + "</div>" + '<div class="nx-tiles">' + sk("17cqw").repeat(8) + "</div>" + sk("64cqw") + sk("54cqw") + sk("80cqw");
  const [s, sc, cs, ro] = await Promise.allSettled([standings(), load(PATHS.sched(abbr), TTL.stats), load(PATHS.club(abbr), TTL.stats), load(PATHS.roster(abbr), TTL.stats)]);
  if(!alive()) return;
  if(s.status !== "fulfilled"){ page.innerHTML = fail("this team", s.reason); return; }
  const std = s.value, t = std.by(abbr); if(!t){ page.innerHTML = '<p class="nx-none">No standings for ' + esc(abbr) + " yet.</p>"; return; }
  const res = sc.status === "fulfilled" ? results(sc.value.data, abbr) : null;
  /* league ranks for the tiles (1 = best) */
  const rank = (f, asc) => 1 + std.teams.filter(x => asc ? f(x) < f(t) : f(x) > f(t)).length;
  const per = (x, k) => x.gp ? x[k]/x.gp : 0;
  const tile = (k, v, r) => '<div class="nx-tile"><small>' + k + "</small><b>" + v + "</b>" + (r ? "<em>" + ord(r) + " NHL</em>" : "<em>&nbsp;</em>") + "</div>";
  const fav = abbr === FAV, conf = t.conf === "E" ? "EASTERN" : "WESTERN";
  let html = '<section class="nx-hero" style="' + tvars(abbr) + '"><span class="wm" aria-hidden="true">' + logo(abbr, "wml") + "</span>" + logo(abbr, "lg") +
    '<div class="tx"><small>' + conf + " · " + esc(t.divName.toUpperCase()) + (fav ? ' · <span class="yt">★ YOUR TEAM</span>' : POOL.includes(abbr) ? ' · <span class="yt pl">POOL TEAM</span>' : "") + "</small>" +
    '<h2><span>' + esc(t.place) + "</span>" + esc(t.short) + "</h2>" +
    '<div class="rec"><b>' + t.w + "-" + t.l + "-" + t.otl + "</b><span>" + t.pts + " PTS · " + t.gp + " GP</span></div>" +
    '<div class="rk"><span>' + ord(t.seqD) + " " + esc(t.divName.toUpperCase()) + "</span><span>" + ord(t.seqC) + " " + (t.conf === "E" ? "EAST" : "WEST") + "</span><span>" + ord(t.seqL) + " NHL</span>" + (t.inPos ? '<span class="in">IN A PLAYOFF SPOT</span>' : "") + "</div></div></section>";
  html += '<div class="nx-tiles">' + tile("POINTS %", p3(t.pct), rank(x => x.pct)) + tile("GF / GP", f2(per(t, "gf")), rank(x => per(x, "gf"))) + tile("GA / GP", f2(per(t, "ga")), rank(x => per(x, "ga"), true)) + tile("GOAL DIFF", sgn(t.gd), rank(x => x.gd)) +
    tile("STREAK", esc(t.streak)) + tile("LAST 10", esc(t.l10)) + tile("HOME", esc(t.home)) + tile("AWAY", esc(t.away)) + "</div>";
  const done = res ? res.done : [];
  if(done.length > 1){
    const pc = pace(std, t.conf, done.length, abbr);
    html += '<section class="nx-panel">' + lbl("Points race", '<span class="nx-sub">' + done.length + " GAMES</span>") + legend([[t.short, "#f08a17", "ln"]].concat(pc ? [[pc.label + " pace (" + pc.team.abbr + ", " + p3(pc.team.pct) + ")", "#6f8fb6", "ln"]] : [])) + '<div class="nx-chart" id="tm-race"></div></section>';
    html += '<section class="nx-panel">' + lbl("Goals for and against", '<span class="nx-sub">GAME BY GAME</span>') + legend([["Goals for", "#3b8ae0"], ["Goals against", "#e8664a"]]) + '<div class="nx-chart" id="tm-gfga"></div></section>';
  }
  if(res && (done.length || res.next.length)){
    const vs = g => (g.home ? "vs" : "@");
    html += '<section class="nx-panel">' + lbl("Form", '<span class="nx-sub">LAST ' + Math.min(10, done.length) + "</span>") + '<div class="nx-form">' + done.slice(-10).reverse().map(g =>
      '<a class="fm ' + g.res.toLowerCase() + '" href="#nhl-team-' + g.opp + '"><em>' + (g.res === "OTL" ? g.end : g.res) + "</em>" + logo(g.opp, "nx-lgs") + "<b>" + g.gf + "–" + g.ga + (g.end !== "REG" ? "<sup>" + g.end + "</sup>" : "") + "</b><small>" + vs(g) + " " + g.opp + " · " + dm(g.start) + "</small></a>").join("") + "</div>" +
      (res.live || res.next.length ? '<h3 class="nx-ch">' + (res.live ? "Live now" : "Next up") + '</h3><div class="nx-next">' + (res.live ? [res.live] : []).concat(res.next.slice(0, res.live ? 2 : 3)).map(g =>
        '<a href="#nhl-game-' + g.id + '"' + (g === res.live ? ' class="live"' : "") + "><small>" + (g === res.live ? '<i class="dot"></i>LIVE · ' + g.gf + "–" + g.ga : day(g.start) + " · " + time(g.start)) + "</small>" + '<span>' + vs(g) + "</span>" + logo(g.opp, "nx-lgs") + "<b>" + esc(P.team(g.opp).name) + "</b></a>").join("") + "</div>" : "") + "</section>";
  }
  /* the team's own leaders and its roster with this season's numbers */
  if(cs.status === "fulfilled"){
    const nums = {}; if(ro.status === "fulfilled") ["forwards", "defensemen", "goalies"].forEach(k => (ro.value.data[k] || []).forEach(p => { nums[p.id] = p.sweaterNumber; }));
    const skaters = (cs.value.data.skaters || []).map(x => ({ id: x.playerId, first: nm(x.firstName), last: nm(x.lastName), pos: x.positionCode, head: x.headshot, num: nums[x.playerId],
      gp: x.gamesPlayed, g: x.goals, a: x.assists, p: x.points, pm: x.plusMinus, pim: x.penaltyMinutes, ppg: x.powerPlayGoals, s: x.shots, sp: x.shootingPctg, toi: x.avgTimeOnIcePerGame, fo: x.faceoffWinPctg }));
    const goalies = (cs.value.data.goalies || []).map(x => ({ id: x.playerId, first: nm(x.firstName), last: nm(x.lastName), pos: "G", head: x.headshot, num: nums[x.playerId],
      gp: x.gamesPlayed, gs: x.gamesStarted, w: x.wins, l: x.losses, otl: x.overtimeLosses, gaa: x.goalsAgainstAverage, sv: x.savePercentage, so: x.shutouts }));
    if(skaters.length){
      const best = (k, f) => skaters.slice().sort((a, b) => b[k] - a[k] || b.p - a.p)[0];
      const g1 = goalies.slice().sort((a, b) => b.gp - a.gp)[0];
      const card = (p, k, v) => '<a class="nx-tl" href="#nhl-player-' + p.id + '">' + head(p.head) + "<small>" + k + "</small><strong>" + v + "</strong><b>" + esc(p.last) + "</b></a>";
      html += '<section class="nx-panel">' + lbl("Team leaders") + '<div class="nx-tls">' + card(best("p"), "POINTS", best("p").p) + card(best("g"), "GOALS", best("g").g) + card(best("a"), "ASSISTS", best("a").a) + card(best("pm"), "PLUS/MINUS", sgn(best("pm").pm)) +
        (g1 ? card(g1, "SAVE % · " + g1.gp + " GP", p3(g1.sv)) : "") + "</div></section>";
    }
    html += '<section class="nx-panel" id="tm-roster">' + lbl("Roster", '<span class="nx-sub">' + seasonTxt(cs.value.data.season || std.season) + " STATS</span>") + '<div id="tm-sk"></div><div id="tm-go"></div><p class="nx-fine">Tap a column to sort, a player for his page.</p></section>';
    page.innerHTML = html;
    rosterTables(page, skaters, goalies);
  } else {
    page.innerHTML = html + fail("the roster", cs.reason);
  }
  if(done.length > 1){
    const pc = pace(std, t.conf, done.length, abbr);
    CH().line($("#tm-race", page), {
      label: t.short + " points after each game", endLabel: done[done.length - 1].cum + " PTS", refLabel: pc ? "PACE" : "",
      points: done.map((g, i) => ({ y: g.cum, tip: "<b>Game " + (i + 1) + " · " + dm(g.start) + "</b><span>" + (g.home ? "vs " : "@ ") + g.opp + " · " + resTxt(g) + "</span><span>" + g.cum + " pts" + (pc ? " · pace " + pc.line[i].toFixed(1) : "") + "</span>" })),
      ref: pc ? pc.line : null, color: "#f08a17"
    });
    CH().diverge($("#tm-gfga", page), {
      label: "Goals for and against in each game",
      items: done.map((g, i) => ({ up: g.gf, down: g.ga, x: dm(g.start).split(" ")[0] + " " + dm(g.start).split(" ")[1].slice(0, 3), tip: "<b>" + dm(g.start) + " · " + (g.home ? "vs " : "@ ") + g.opp + "</b><span>" + resTxt(g) + "</span>" })),
      up: { name: "Goals for", color: "#3b8ae0" }, down: { name: "Goals against", color: "#e8664a" }
    });
  }
  stamp(page);
}
const resTxt = g => (g.res === "W" ? "Won " : g.res === "L" ? "Lost " : "Lost ") + g.gf + "–" + g.ga + (g.end !== "REG" ? " (" + g.end + ")" : "");
let rsSort = { k: "p", d: -1 }, rgSort = { k: "gp", d: -1 };
function rosterTables(page, skaters, goalies){
  const who = p => '<span class="pc">' + head(p.head) + '<span><b>' + esc(p.first.charAt(0) + ". " + p.last) + "</b><small>" + (p.num != null ? "#" + p.num + " · " : "") + esc(p.pos) + "</small></span></span>";
  const skc = [
    { k: "name", h: "SKATER", f: who },
    { k: "gp", h: "GP", v: p => p.gp, d: -1, f: p => p.gp }, { k: "g", h: "G", v: p => p.g, d: -1, f: p => p.g }, { k: "a", h: "A", v: p => p.a, d: -1, f: p => p.a },
    { k: "p", h: "P", v: p => p.p, d: -1, f: p => "<strong>" + p.p + "</strong>", cls: "pt" }, { k: "pm", h: "+/-", v: p => p.pm, d: -1, f: p => sgn(p.pm) },
    { k: "pim", h: "PIM", v: p => p.pim, d: -1, f: p => p.pim }, { k: "ppg", h: "PPG", v: p => p.ppg, d: -1, f: p => p.ppg }, { k: "s", h: "S", v: p => p.s, d: -1, f: p => p.s },
    { k: "sp", h: "S%", v: p => p.sp || 0, d: -1, f: p => p.s ? f1(p.sp*100) : "–" }, { k: "toi", h: "TOI", v: p => p.toi, d: -1, f: p => mmss(p.toi) },
    { k: "fo", h: "FO%", v: p => p.fo || 0, d: -1, f: p => p.fo ? f1(p.fo*100) : "–" }
  ];
  const goc = [
    { k: "name", h: "GOALIE", f: who },
    { k: "gp", h: "GP", v: p => p.gp, d: -1, f: p => p.gp }, { k: "w", h: "W", v: p => p.w, d: -1, f: p => "<strong>" + p.w + "</strong>", cls: "pt" }, { k: "l", h: "L", v: p => p.l, d: 1, f: p => p.l },
    { k: "otl", h: "OTL", v: p => p.otl, d: 1, f: p => p.otl }, { k: "sv", h: "SV%", v: p => p.sv, d: -1, f: p => p3(p.sv) }, { k: "gaa", h: "GAA", v: p => p.gaa, d: 1, f: p => f2(p.gaa) }, { k: "so", h: "SO", v: p => p.so, d: -1, f: p => p.so }
  ];
  const opt = { href: p => "#nhl-player-" + p.id, tie: (a, b) => (b.p || b.gp) - (a.p || a.gp) };
  const draw = () => {
    $("#tm-sk", page).innerHTML = tableHTML(skc, skaters, rsSort, opt);
    $("#tm-go", page).innerHTML = goalies.length ? tableHTML(goc, goalies, rgSort, opt) : "";
  };
  draw();
  wireTables($("#tm-sk", page), k => { const c = skc.find(x => x.k === k); rsSort = rsSort.k === k ? { k, d: -rsSort.d } : { k, d: c.d || -1 }; draw(); });
  wireTables($("#tm-go", page), k => { const c = goc.find(x => x.k === k); rgSort = rgSort.k === k ? { k, d: -rgSort.d } : { k, d: c.d || -1 }; draw(); });
}

/* ================= PLAYER ================= */
const COUNTRY = { CAN: "Canada", USA: "USA", SWE: "Sweden", FIN: "Finland", RUS: "Russia", CZE: "Czechia", SVK: "Slovakia", CHE: "Switzerland", DEU: "Germany", AUT: "Austria", DNK: "Denmark", NOR: "Norway", LVA: "Latvia", BLR: "Belarus", SVN: "Slovenia", FRA: "France", AUS: "Australia", GBR: "Great Britain", UKR: "Ukraine", KAZ: "Kazakhstan", NLD: "Netherlands", POL: "Poland", ITA: "Italy", JPN: "Japan" };
async function playerPage(page, alive, id){
  if(!/^\d{7}$/.test(String(id))){ page.innerHTML = '<p class="nx-none">That isn\'t a player.</p>'; return; }
  page.innerHTML = sk("74cqw", "card") + '<div class="nx-tiles">' + sk("17cqw").repeat(8) + "</div>" + sk("60cqw") + sk("54cqw");
  const [L, G] = await Promise.allSettled([load(PATHS.landing(id), TTL.stats), load(PATHS.log(id), TTL.stats)]);
  if(!alive()) return;
  if(L.status !== "fulfilled"){ page.innerHTML = fail("this player", L.reason); return; }
  const p = L.value.data, team = p.currentTeamAbbrev || "NHL";
  const goalie = p.position === "G", first = nm(p.firstName), last = nm(p.lastName);
  const born = p.birthDate ? new Date(p.birthDate + "T12:00:00") : null, age = born ? Math.floor((Date.now() - born)/(365.2425*864e5)) : null;
  const ft = p.heightInInches ? Math.floor(p.heightInInches/12) + "′" + (p.heightInInches % 12) + "″" : "";
  const dd = p.draftDetails, draft = dd ? dd.year + " · R" + dd.round + " #" + dd.overallPick + " · " + dd.teamAbbrev : "Undrafted";
  const POS = { C: "Centre", L: "Left wing", R: "Right wing", D: "Defence", G: "Goalie" };
  const bio = [["AGE", age != null ? age : "–"], ["HEIGHT", p.heightInCentimeters ? p.heightInCentimeters + " cm" + (ft ? " · " + ft : "") : "–"], ["WEIGHT", p.weightInKilograms ? p.weightInKilograms + " kg" : "–"],
    [goalie ? "CATCHES" : "SHOOTS", p.shootsCatches === "L" ? "Left" : p.shootsCatches === "R" ? "Right" : "–"], ["BORN", esc([nm(p.birthCity), COUNTRY[p.birthCountry] || p.birthCountry].filter(Boolean).join(", ")) + (born ? "<small>" + dm(born) + " " + born.getFullYear() + "</small>" : "")], ["DRAFT", esc(draft)]];
  const m = hl(team);
  let html = '<section class="nx-pl-hero' + (m.cls.includes("fav") ? " fav" : "") + '" style="' + tvars(team) + '"><span class="num" aria-hidden="true">' + esc(p.sweaterNumber || "") + "</span>" + head(p.headshot, "hs") +
    '<div class="tx"><small>' + esc((POS[p.position] || p.position || "").toUpperCase()) + (p.sweaterNumber ? " · #" + p.sweaterNumber : "") + "</small><span class=\"fn\">" + esc(first) + "</span><h2>" + esc(last) + "</h2>" +
    (p.currentTeamAbbrev ? '<a class="tm" href="#nhl-team-' + team + '">' + logo(team, "nx-lgs") + esc(nm(p.fullTeamName) || team) + " ►</a>" : '<span class="tm">' + (p.isActive ? "No NHL team" : "Retired") + "</span>") + "</div></section>" +
    '<div class="nx-bio">' + bio.map(([k, v]) => "<div><small>" + k + "</small><b>" + v + "</b></div>").join("") + "</div>";
  /* this season (or the last one he played) */
  const fs = p.featuredStats, ss = fs && fs.regularSeason && fs.regularSeason.subSeason;
  const nhlRows = (p.seasonTotals || []).filter(s => s.leagueAbbrev === "NHL" && s.gameTypeId === 2);
  const cur = nhlRows.filter(s => fs && s.season === fs.season);
  const tile = (k, v) => '<div class="nx-tile"><small>' + k + "</small><b>" + v + "</b></div>";
  if(ss){
    const toi = cur.length === 1 ? cur[0].avgToi : null;
    html += lbl(seasonTxt(fs.season) + " season", '<span class="nx-sub">REGULAR SEASON</span>') + '<div class="nx-tiles">' + (goalie
      ? tile("GP", ss.gamesPlayed) + tile("WINS", ss.wins) + tile("LOSSES", ss.losses) + tile("OTL", ss.otLosses) + tile("SAVE %", p3(ss.savePctg)) + tile("GAA", f2(ss.goalsAgainstAvg)) + tile("SHUTOUTS", ss.shutouts) + tile("CAREER W", fs.regularSeason.career ? fs.regularSeason.career.wins : "–")
      : tile("GP", ss.gamesPlayed) + tile("GOALS", ss.goals) + tile("ASSISTS", ss.assists) + tile("POINTS", "<strong>" + ss.points + "</strong>") + tile("+/-", sgn(ss.plusMinus)) + tile("PP POINTS", ss.powerPlayPoints) + tile("SHOOTING", ss.shots ? pc1(ss.shootingPctg) : "–") + tile("TOI / GP", toi || "–")) + "</div>";
  }
  const log = G.status === "fulfilled" ? (G.value.data.gameLog || []).slice().reverse() : [];
  if(log.length){
    html += '<section class="nx-panel">' + lbl("Game by game", '<span class="nx-sub">' + log.length + " GAMES</span>") +
      (goalie ? legend([["Save % per game", "#3b8ae0", "ln"], ["Season save %", "#6f8fb6", "ln"]]) : legend([["Goals", "#d9740a"], ["Assists", "#3b8ae0"]])) + '<div class="nx-chart" id="pl-log"></div>' +
      '<details class="nx-det"><summary>Game log table</summary>' + logTable(log, goalie) + "</details></section>";
  }
  /* career: points (or wins) in every NHL regular season; a traded season adds up */
  const seasons = [];
  nhlRows.forEach(s => { let x = seasons.find(y => y.season === s.season); if(!x){ x = { season: s.season, gp: 0, g: 0, a: 0, p: 0, w: 0, teams: [] }; seasons.push(x); }
    x.gp += s.gamesPlayed || 0; x.g += s.goals || 0; x.a += s.assists || 0; x.p += s.points || 0; x.w += s.wins || 0; const tn = nm(s.teamCommonName); if(tn && !x.teams.includes(tn)) x.teams.push(tn); });
  seasons.sort((a, b) => a.season - b.season);
  if(seasons.length > 1) html += '<section class="nx-panel">' + lbl("Career", '<span class="nx-sub">' + (goalie ? "WINS" : "POINTS") + " BY NHL SEASON</span>") + '<div class="nx-chart" id="pl-career"></div></section>';
  const ct = p.careerTotals;
  if(ct && ct.regularSeason){
    const row = (k, s) => s ? "<tr><td class=\"nm\">" + k + "</td>" + (goalie ? [s.gamesPlayed, s.wins, s.losses, s.otLosses, f2(s.goalsAgainstAvg), p3(s.savePctg), s.shutouts] : [s.gamesPlayed, s.goals, s.assists, "<strong>" + s.points + "</strong>", sgn(s.plusMinus), s.powerPlayGoals, s.gameWinningGoals]).map(v => "<td>" + v + "</td>").join("") + "</tr>" : "";
    html += '<section class="nx-panel">' + lbl("Career totals", '<span class="nx-sub">NHL</span>') + '<div class="nx-tw"><table class="nx-t"><thead><tr><th class="nm"></th>' + (goalie ? ["GP", "W", "L", "OTL", "GAA", "SV%", "SO"] : ["GP", "G", "A", "P", "+/-", "PPG", "GWG"]).map(h => "<th>" + h + "</th>").join("") + "</tr></thead><tbody>" +
      row("Regular season", ct.regularSeason) + row("Playoffs", ct.playoffs) + "</tbody></table></div>" +
      (seasons.length ? (() => { const b = seasons.slice().sort((a, b) => goalie ? b.w - a.w : b.p - a.p)[0]; return '<p class="nx-fine">Best season: <b>' + seasonTxt(b.season) + "</b>, " + (goalie ? b.w + " wins" : b.p + " points (" + b.g + " goals)") + " in " + b.gp + " games" + (p.inHHOF ? " · Hall of Famer" : "") + (p.inTop100AllTime ? " · NHL Top 100 all time" : "") + ".</p>"; })() : "") + "</section>";
  }
  if((p.awards || []).length){
    html += '<section class="nx-panel">' + lbl("Awards") + '<div class="nx-aw">' + p.awards.map(a => '<div><b>' + esc(nm(a.trophy)) + "</b><small>" + a.seasons.map(s => "<span>" + seasonTxt(s.seasonId) + "</span>").join(" · ") + "</small></div>").join("") + "</div></section>";
  }
  page.innerHTML = html;
  if(log.length){
    const dl = g => dm(ymd(g.gameDate));
    if(goalie){
      const sv = log.filter(g => g.shotsAgainst);
      if(sv.length) CH().line($("#pl-log", page), { label: "Save percentage in each game", dots: true, area: false, color: "#3b8ae0", yFmt: p3, min: Math.min(.85, Math.floor(Math.min(...sv.map(g => g.savePctg))*20)/20),
        xFmt: k => dl(sv[k - 1]), ref: ss ? sv.map(() => ss.savePctg) : null, refLabel: ss ? p3(ss.savePctg) : "",
        points: sv.map(g => ({ y: g.savePctg, tip: "<b>" + dl(g) + " · " + (g.homeRoadFlag === "H" ? "vs " : "@ ") + g.opponentAbbrev + "</b><span>" + (g.shotsAgainst - g.goalsAgainst) + " saves on " + g.shotsAgainst + " · " + p3(g.savePctg) + "</span><span>" + ({ W: "Win", L: "Loss", O: "OT loss" }[g.decision] || "No decision") + "</span>" })) });
    } else {
      CH().columns($("#pl-log", page), { label: "Goals and assists in each game", series: [{ name: "Goals", color: "#d9740a" }, { name: "Assists", color: "#3b8ae0" }],
        items: log.map(g => ({ v: [g.goals, g.assists], x: dl(g), tip: "<b>" + dl(g) + " · " + (g.homeRoadFlag === "H" ? "vs " : "@ ") + g.opponentAbbrev + "</b><span>" + g.goals + " G · " + g.assists + " A · " + g.points + " P</span><span>" + sgn(g.plusMinus) + " · " + g.shots + " shots · " + g.toi + "</span>" })) });
    }
  }
  if(seasons.length > 1){
    CH().columns($("#pl-career", page), { label: (goalie ? "Wins" : "Points") + " in each NHL season", peak: true, series: [{ name: goalie ? "Wins" : "Points", color: "#d9740a" }],
      items: seasons.map(s => ({ v: [goalie ? s.w : s.p], x: "’" + String(s.season).slice(6, 8), tip: "<b>" + seasonTxt(s.season) + " · " + esc(s.teams.join(", ")) + "</b><span>" + s.gp + " GP · " + (goalie ? s.w + " wins" : s.g + " G · " + s.a + " A · " + s.p + " P") + "</span>" })) });
  }
  stamp(page);
}
function logTable(log, goalie){
  const rows = log.slice().reverse();
  return '<div class="nx-tw"><table class="nx-t sm"><thead><tr><th class="nm">GAME</th>' + (goalie ? ["DEC", "SA", "GA", "SV%", "TOI"] : ["G", "A", "P", "+/-", "S", "TOI"]).map(h => "<th>" + h + "</th>").join("") + "</tr></thead><tbody>" +
    rows.map(g => '<tr><td class="nm">' + dm(ymd(g.gameDate)) + " " + (g.homeRoadFlag === "H" ? "vs " : "@ ") + g.opponentAbbrev + "</td>" +
      (goalie ? [g.decision || "–", g.shotsAgainst, g.goalsAgainst, p3(g.savePctg), g.toi] : [g.goals, g.assists, "<strong>" + g.points + "</strong>", sgn(g.plusMinus), g.shots, g.toi]).map(v => "<td>" + v + "</td>").join("") + "</tr>").join("") + "</tbody></table></div>";
}

/* ================= the router entry ================= */
async function render(app, arg){
  const my = ++gen; stamps = [];
  const parts = String(arg || "").split("-"), kind = parts[0] || "", rest = parts.slice(1).join("-");
  const section = kind === "standings" ? "standings" : kind === "leaders" ? "leaders" : kind === "clubs" ? "clubs" : kind === "games" ? "games" : kind === "" ? "overview" : null;
  const page = frame(app, section, kind === "team" || kind === "player" || kind === "game");
  const alive = () => my === gen && document.body.contains(page);
  FAV = await favTeam();
  if(!alive()) return;
  if(kind === "standings") return standingsPage(page, alive, rest);
  if(kind === "leaders") return leadersPage(page, alive, rest);
  if(kind === "clubs") return clubsPage(page, alive);
  if(kind === "games") return gamesPage(page, alive, rest);
  if(kind === "team") return teamPage(page, alive, rest);
  if(kind === "player") return playerPage(page, alive, rest);
  if(kind === "game" && P.nhlGame) return P.nhlGame.page(page, alive, rest, KIT);
  return overview(page, alive);
}
/* the helpers app/nhl/game.js (the game page) shares with this file */
const KIT = { esc, $, $$, onLeave, POOL, day, dm, time, ymd, ord, p3, f2, f1, pc1, sgn, nm, logo, logoSrc, head, tc, tvars, hl, fav: () => FAV,
  TTL, PATHS, load, standings, results, sk, lbl, fail, stamp, legend };
P.nhlTab = { render };
})();
