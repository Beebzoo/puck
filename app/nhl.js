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
  return { id: x.id, start: x.startTimeUTC, type: x.gameType, state: st, final, live: st === "LIVE" || st === "CRIT",
    ending: final ? ending : null, period: x.periodDescriptor ? x.periodDescriptor.number : null,
    home: side(x.homeTeam), away: side(x.awayTeam), venue: x.venue && x.venue.default };
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
P.nhl = { get, poolGames };
})();
