/* The Pool's points, as plain functions (no DOM), so _tests/scoring-test.js can
   run them in node. A game here is the app's own shape (see nhl.js):
   { id, start, final, home: {abbr, score}, away: {abbr, score}, ending: "REG" | "OT" | "SO" }
   and a pick is { user, game_id, home, away, ending, joker }.
   The numbers live in P.SCORING (app/data.js); DEFAULT is the same, for node. */
(function(root){
const DEFAULT = { winner: 2, diff: 1, exact: 3, ending: 1, endingWinner: 1, loneWolf: 1, jokerMult: 2, derby: ["MTL", "EDM"], derbyMult: 2 };
const opts = S => Object.assign({}, DEFAULT, S || {});
const side = (h, a) => h > a ? "home" : "away";

/* Habs v Oilers: the game that counts double */
function isDerby(game, S){
  S = opts(S);
  if(!game || !S.derby || S.derby.length !== 2 || !(S.derbyMult > 1)) return false;
  const a = game.home && game.home.abbr, b = game.away && game.away.abbr;
  return a !== b && S.derby.includes(a) && S.derby.includes(b);
}

/* points for every pick on one finished game: { [user]: { pts, parts: [[label, n]] } }.
   A tie (a live game "if it ended now") has no winner yet, so nobody scores. */
function scoreGame(game, picks, S){
  S = opts(S);
  const out = {};
  if(!game || !game.final) return out;
  const gh = game.home.score, ga = game.away.score;
  if(gh === ga){ for(const p of picks) out[p.user] = { pts: 0, parts: [] }; return out; }
  const win = side(gh, ga), derby = isDerby(game, S);
  const right = picks.filter(p => side(p.home, p.away) === win);
  for(const p of picks){
    const parts = [];
    const okWin = side(p.home, p.away) === win;
    if(okWin){
      parts.push(["Winner", S.winner]);
      if(p.home === gh && p.away === ga) parts.push(["Exact score", S.exact]);
      else if(p.home - p.away === gh - ga) parts.push(["Goal difference", S.diff]);
    }
    if(game.ending && game.ending !== "REG" && p.ending === game.ending){
      parts.push([game.ending === "SO" ? "Called the shootout" : "Called overtime", S.ending]);
      if(okWin) parts.push(["... and the winner", S.endingWinner]);
    }
    if(okWin && right.length === 1 && picks.length >= 2) parts.push(["Lone wolf", S.loneWolf]);
    let pts = parts.reduce((n, x) => n + x[1], 0);
    if(p.joker && pts > 0){ parts.push(["Joker ×" + S.jokerMult, pts*(S.jokerMult - 1)]); pts *= S.jokerMult; }
    if(derby && pts > 0){ parts.push(["Derby ×" + S.derbyMult, pts*(S.derbyMult - 1)]); pts *= S.derbyMult; }
    out[p.user] = { pts, parts };
  }
  return out;
}

/* Monday-to-Sunday weeks in the viewer's time zone, for the one-joker-a-week rule */
function weekKey(iso){
  const d = new Date(iso), day = (d.getDay() + 6) % 7;
  const mon = new Date(d.getFullYear(), d.getMonth(), d.getDate() - day);
  return mon.getFullYear() + "-" + String(mon.getMonth() + 1).padStart(2, "0") + "-" + String(mon.getDate()).padStart(2, "0");
}

const byStart = (a, b) => a.start < b.start ? -1 : a.start > b.start ? 1 : 0;
function groupPicks(picks){
  const byGame = {};
  for(const p of picks) if(!p.hidden) (byGame[p.game_id] = byGame[p.game_id] || []).push(p);
  return byGame;
}

/* the league table: one row per player, best first.
   - form: the last five finished games since your first pick (null = no pick)
   - streak: finished games in a row, up to now, where you scored
   - missed: finished games without your pick, since your first pick
   - best: your best single game { game_id, pts }
   - crowns: weeks you won (see weeks()) */
function table(games, picks, users, S){
  S = opts(S);
  const rows = {};
  for(const u of users) rows[u.id] = { id: u.id, name: u.name, pts: 0, played: 0, winners: 0, exact: 0, calls: 0, wolves: 0, jokers: 0, missed: 0, best: null, seq: [] };
  const byGame = groupPicks(picks);
  const done = games.filter(g => g.final).sort(byStart);
  for(const g of done){
    const ps = byGame[g.id] || [], res = scoreGame(g, ps, S);
    for(const u of users){
      const r = rows[u.id], p = ps.find(x => x.user === u.id);
      if(!p){ if(r.seq.length){ r.seq.push(null); r.missed++; } continue; }
      const x = res[p.user]; r.pts += x.pts; r.played++;
      const has = l => x.parts.some(q => q[0] === l);
      if(has("Winner")) r.winners++;
      if(has("Exact score")) r.exact++;
      if(x.parts.some(q => /^Called/.test(q[0]))) r.calls++;
      if(has("Lone wolf")) r.wolves++;
      if(p.joker) r.jokers++;
      if(!r.best || x.pts >= r.best.pts) r.best = { game_id: g.id, pts: x.pts };
      r.seq.push(x.pts);
    }
  }
  const crowns = {};
  for(const w of weeks(games, picks, users, S)) if(w.complete) for(const id of w.winners) crowns[id] = (crowns[id] || 0) + 1;
  return Object.values(rows).map(r => {
    let streak = 0; for(let i = r.seq.length - 1; i >= 0 && r.seq[i] > 0; i--) streak++;
    const { seq, ...rest } = r;
    return { ...rest, form: seq.slice(-5), streak, crowns: crowns[r.id] || 0 };
  }).sort((a, b) => b.pts - a.pts || b.exact - a.exact || b.winners - a.winners || a.name.localeCompare(b.name));
}

/* week by week, newest first: { week, games, complete, pts: {user: n}, winners: [user] }.
   A week is complete when every Pool game in it is final; the winners are the
   week's top scorers (shared on a tie, nobody with zero). */
function weeks(games, picks, users, S){
  S = opts(S);
  const byGame = groupPicks(picks), out = {};
  for(const g of games.slice().sort(byStart)){
    const k = weekKey(g.start);
    const w = out[k] = out[k] || { week: k, games: 0, finals: 0, pts: Object.fromEntries(users.map(u => [u.id, 0])) };
    w.games++;
    if(!g.final) continue;
    w.finals++;
    const res = scoreGame(g, byGame[g.id] || [], S);
    for(const id in res) if(id in w.pts) w.pts[id] += res[id].pts;
  }
  return Object.values(out).filter(w => w.finals > 0).map(w => {
    const top = Math.max(0, ...Object.values(w.pts));
    return { week: w.week, games: w.games, complete: w.finals === w.games, pts: w.pts, winners: top > 0 ? Object.keys(w.pts).filter(id => w.pts[id] === top) : [] };
  }).sort((a, b) => a.week < b.week ? 1 : -1);
}

/* head to head: for each pair, the finished games both picked and who scored more */
function h2h(games, picks, users, S){
  S = opts(S);
  const byGame = groupPicks(picks), out = [];
  for(let i = 0; i < users.length; i++) for(let j = i + 1; j < users.length; j++) out.push({ a: users[i].id, b: users[j].id, aw: 0, bw: 0, draws: 0 });
  for(const g of games.filter(x => x.final)){
    const res = scoreGame(g, byGame[g.id] || [], S);
    for(const r of out){
      if(!res[r.a] || !res[r.b]) continue;
      if(res[r.a].pts > res[r.b].pts) r.aw++; else if(res[r.b].pts > res[r.a].pts) r.bw++; else r.draws++;
    }
  }
  return out;
}

/* the season's story: the best call and the biggest miss so far.
   best = the most points from one pick (the latest wins a tie);
   miss = a wrong winner, furthest from the real score (goals off in total). */
function moments(games, picks, S){
  S = opts(S);
  const byGame = groupPicks(picks);
  let best = null, miss = null;
  for(const g of games.filter(x => x.final).sort(byStart)){
    const ps = byGame[g.id] || [], res = scoreGame(g, ps, S);
    for(const p of ps){
      const pts = res[p.user].pts;
      if(pts > 0 && (!best || pts >= best.pts)) best = { user: p.user, game_id: g.id, pick: p, pts };
      if(side(p.home, p.away) !== side(g.home.score, g.away.score)){
        const off = Math.abs(p.home - g.home.score) + Math.abs(p.away - g.away.score);
        if(!miss || off >= miss.off) miss = { user: p.user, game_id: g.id, pick: p, off };
      }
    }
  }
  return { best, miss };
}

/* an overtime or shootout game always ends one goal apart; a regulation pick can't be a tie */
function validPick(p){
  if(!(p.home >= 0 && p.away >= 0) || p.home === p.away) return false;
  if(p.ending !== "REG" && Math.abs(p.home - p.away) !== 1) return false;
  return true;
}

/* the most one pick can score before the joker and the derby (8 with v0's numbers) */
function maxGame(S){ S = opts(S); return S.winner + S.exact + S.ending + S.endingWinner + S.loneWolf; }

const api = { DEFAULT, scoreGame, weekKey, table, weeks, h2h, moments, validPick, isDerby, maxGame };
if(typeof module !== "undefined" && module.exports) module.exports = api;
else (root.PUCK = root.PUCK || {}).scoring = api;
})(this);
