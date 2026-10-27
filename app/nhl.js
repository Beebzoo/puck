/* The NHL's own feed (api-web.nhle.com). Browsers can't read it directly (no
   CORS), so it goes through a relay: server/serve.js on localhost, the
   Supabase function "puck-nhl" once the app is online. The last answer is kept, so
   the Pool still shows something offline. */
(function(){
const P = window.PUCK = window.PUCK || {};
const C = window.PUCK_CONFIG;
const local = /^(localhost|127\.|192\.168\.|10\.)/.test(location.hostname);
function url(path){
  if(C.NHL_PROXY) return C.NHL_PROXY + encodeURIComponent(path);
  if(local || !C.SUPABASE_URL) return "/nhl" + path;
  return C.SUPABASE_URL + "/functions/v1/" + (C.NHL_FUNCTION || "puck-nhl") + "?path=" + encodeURIComponent(path);
}
async function get(path){
  const key = "puck.nhl:" + path;
  try {
    const headers = C.SUPABASE_ANON_KEY && !local ? { apikey: C.SUPABASE_ANON_KEY, Authorization: "Bearer " + C.SUPABASE_ANON_KEY } : {};
    const r = await fetch(url(path), { headers });
    if(!r.ok) throw new Error("NHL feed " + r.status);
    const j = await r.json();
    try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), j })); } catch(e){}
    return { data: j, fresh: true };
  } catch(err){
    try { const c = JSON.parse(localStorage.getItem(key)); if(c) return { data: c.j, fresh: false, at: c.at, err }; } catch(e){}
    throw err;
  }
}
/* the app's game shape; gameState FUT/PRE = not started, LIVE/CRIT = on, FINAL/OFF = done */
function game(x){
  const st = x.gameState, final = st === "FINAL" || st === "OFF";
  const ending = x.gameOutcome ? x.gameOutcome.lastPeriodType : (x.periodDescriptor && x.periodDescriptor.periodType) || null;
  const side = t => ({ abbr: t.abbrev, score: typeof t.score === "number" ? t.score : null, logo: t.logo, dark: t.darkLogo, name: (t.placeName && t.placeName.default) || t.abbrev });
  const gw = x.winningGoalScorer;
  return { id: x.id, start: x.startTimeUTC, type: x.gameType, state: st, final, live: st === "LIVE" || st === "CRIT",
    ending: final ? ending : null, period: x.periodDescriptor ? x.periodDescriptor.number : null,
    ptype: x.periodDescriptor ? x.periodDescriptor.periodType : null,
    gwg: gw && gw.lastName ? ((gw.firstInitial && gw.firstInitial.default) ? gw.firstInitial.default + " " : "") + gw.lastName.default : null,
    home: side(x.homeTeam), away: side(x.awayTeam), venue: x.venue && x.venue.default };
}
/* today's scoreboard: the live clock and the teams' records, by game id
   { [id]: { state, period, ptype, clock, intermission, away: {score, record}, home: {...} } } */
async function scoreNow(){
  const r = await get("/v1/score/now"), out = {};
  for(const x of (r.data && r.data.games) || []){
    const t = s => ({ score: typeof s.score === "number" ? s.score : null, record: s.record || null });
    out[x.id] = { state: x.gameState, period: x.periodDescriptor ? x.periodDescriptor.number : x.period || null, ptype: x.periodDescriptor ? x.periodDescriptor.periodType : null,
      clock: x.clock ? x.clock.timeRemaining : null, intermission: !!(x.clock && x.clock.inIntermission), away: t(x.awayTeam), home: t(x.homeTeam) };
  }
  return out;
}
/* regular season and playoff games of the Pool teams, one list, no doubles when they meet */
async function poolGames(){
  const out = {}, notes = [];
  for(const t of C.POOL_TEAMS){
    const r = await get("/v1/club-schedule-season/" + t + "/now");
    if(!r.fresh) notes.push(r.at);
    for(const x of r.data.games || []) if(x.gameType === 2 || x.gameType === 3) out[x.id] = game(x);
  }
  return { games: Object.values(out).sort((a, b) => a.start < b.start ? -1 : 1), offlineSince: notes.length ? Math.min(...notes) : null };
}
/* ---------- for the NHL tab (app/nhl/): a short memory cache over get() ----------
   q(path, params): the path with its own query string, encoded (the relays check it
   key by key, see server/serve.js). cached(path, ttl): the same answer for ttl ms
   (one request in flight per path), then fresh from the feed; offline it falls back to
   the last answer get() kept in localStorage ({ fresh: false, at }). The tab's answers
   are many (players, rosters), so only the last LRU_MAX of them stay on the phone. */
const q = (path, params) => path + "?" + Object.keys(params).map(k => encodeURIComponent(k) + "=" + encodeURIComponent(params[k])).join("&");
const mem = new Map(), flying = new Map(), LRU = "puck.nhl.lru", LRU_MAX = 36;
const KEEP = p => /club-schedule-season\/(MTL|EDM)\/now$|\/score\/now$/.test(p);
function remember(path){
  if(KEEP(path)) return;
  try {
    let l = JSON.parse(localStorage.getItem(LRU)) || [];
    l = l.filter(x => x !== path); l.push(path);
    while(l.length > LRU_MAX) localStorage.removeItem("puck.nhl:" + l.shift());
    localStorage.setItem(LRU, JSON.stringify(l));
  } catch(e){}
}
async function cached(path, ttl = 180000){
  const hit = mem.get(path);
  if(hit && hit.fresh && Date.now() - hit.got < ttl) return hit;
  if(flying.has(path)) return flying.get(path);
  const p = (async () => {
    try {
      const r = await get(path);
      const out = { data: r.data, fresh: r.fresh, at: r.fresh ? Date.now() : r.at, got: Date.now() };
      if(r.fresh) remember(path);
      mem.set(path, out);
      return out;
    } finally { flying.delete(path); }
  })();
  flying.set(path, p);
  return p;
}
/* what's in memory or on the phone right now, without a request (for an instant first paint) */
function peek(path){
  const hit = mem.get(path); if(hit) return hit;
  try { const c = JSON.parse(localStorage.getItem("puck.nhl:" + path)); if(c) return { data: c.j, fresh: false, at: c.at }; } catch(e){}
  return null;
}
P.nhl = { get, poolGames, scoreNow, q, cached, peek };
})();
