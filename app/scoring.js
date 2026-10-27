/* The Pool's points, as plain functions (no DOM), so _tests/scoring-test.js can
   run them in node. A game here is the app's own shape (see nhl.js):
   { id, start, final, home: {abbr, score}, away: {abbr, score}, ending: "REG" | "OT" | "SO" }
   and a pick is { user, game_id, home, away, ending, joker }. */
(function(root){
const DEFAULT = { winner: 2, diff: 1, exact: 3, ending: 1, endingWinner: 1, loneWolf: 1, jokerMult: 2 };
const side = (h, a) => h > a ? "home" : "away";

/* points for every pick on one finished game: { [user]: { pts, parts: [[label, n]] } } */
function scoreGame(game, picks, S = DEFAULT){
  const out = {};
  if(!game || !game.final) return out;
  const gh = game.home.score, ga = game.away.score, win = side(gh, ga);
  const right = picks.filter(p => side(p.home, p.away) === win);
  for(const p of picks){
    const parts = [];
    const okWin = side(p.home, p.away) === win;
    if(okWin){
      parts.push(["Winner", S.winner]);
      if(p.home === gh && p.away === ga) parts.push(["Exact score", S.exact]);
      else if(p.home - p.away === gh - ga) parts.push(["Goal difference", S.diff]);
    }
    if(game.ending !== "REG" && p.ending === game.ending){
      parts.push([game.ending === "SO" ? "Called the shootout" : "Called overtime", S.ending]);
      if(okWin) parts.push(["... and the winner", S.endingWinner]);
    }
    if(okWin && right.length === 1 && picks.length >= 2) parts.push(["Lone wolf", S.loneWolf]);
    let pts = parts.reduce((n, x) => n + x[1], 0);
    if(p.joker && pts > 0){ parts.push(["Joker ×" + S.jokerMult, pts*(S.jokerMult - 1)]); pts *= S.jokerMult; }
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

/* the league table: one row per player, best first */
function table(games, picks, users, S = DEFAULT){
  const rows = {};
  for(const u of users) rows[u.id] = { id: u.id, name: u.name, pts: 0, played: 0, winners: 0, exact: 0, calls: 0, wolves: 0, form: [] };
  const byGame = {};
  for(const p of picks) (byGame[p.game_id] = byGame[p.game_id] || []).push(p);
  const done = games.filter(g => g.final).sort((a, b) => a.start < b.start ? -1 : 1);
  for(const g of done){
    const ps = byGame[g.id] || [], res = scoreGame(g, ps, S);
    for(const p of ps){
      const r = rows[p.user]; if(!r) continue;
      const x = res[p.user]; r.pts += x.pts; r.played++;
      const has = l => x.parts.some(q => q[0] === l);
      if(has("Winner")) r.winners++;
      if(has("Exact score")) r.exact++;
      if(x.parts.some(q => /^Called/.test(q[0]))) r.calls++;
      if(has("Lone wolf")) r.wolves++;
      r.form.push(x.pts);
    }
  }
  return Object.values(rows).map(r => ({ ...r, form: r.form.slice(-5) }))
    .sort((a, b) => b.pts - a.pts || b.exact - a.exact || b.winners - a.winners || a.name.localeCompare(b.name));
}

/* an overtime or shootout game always ends one goal apart; a regulation pick can't be a tie */
function validPick(p){
  if(!(p.home >= 0 && p.away >= 0) || p.home === p.away) return false;
  if(p.ending !== "REG" && Math.abs(p.home - p.away) !== 1) return false;
  return true;
}

const api = { DEFAULT, scoreGame, weekKey, table, validPick };
if(typeof module !== "undefined" && module.exports) module.exports = api;
else (root.PUCK = root.PUCK || {}).scoring = api;
})(this);
