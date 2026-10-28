/* The NHL tab's game page, #nhl-game-<gameId>: one game, head to head.
   Opened from a "Tonight" card (and a team's "Next up"). nhl-tab.js routes here with its helpers (KIT).
   What it shows, top to bottom:
     the faceoff (logos, records, standings place; start time in your zone, or the live score, or the final),
     a way into the Pool for MTL / EDM games, the game itself once it's on (periods, shots, goals, three stars,
     game stats, goalies in net), the win estimate, form (last 10), season stats side by side, the season
     series, team leaders and the goalies.
   Data (all through the relay, cached like the rest of the tab, last known answer offline):
     /v1/gamecenter/<id>/landing     teams, state, clock, goals, three stars           (needed)
     /v1/gamecenter/<id>/boxscore    goalies' saves once the game is on                  (optional)
     /v1/gamecenter/<id>/right-rail  PP%, PK%, faceoff % before the game; period table,
                                     shots by period and game stats once it's on        (optional: the online
                                     relay refuses it until the new function is pasted, the page works without)
     /v1/standings/now, /v1/club-schedule-season/<T>/now, /v1/club-stats/<T>/now    (each optional) */
(function(){
const P = window.PUCK = window.PUCK || {};

/* ---------------- the win estimate ----------------
   Not betting odds: a small rating from what each team did this season BEFORE this game
   (its schedule, so a finished game shows what we'd have said at puck drop):
     P  = points %          points / (2 × games)
     GD = goal differential per game
     F  = points % over its last 10 games
   Small samples lean to average: w = gp / (gp + 20) for P and GD, wF = n / (n + 10) for F (n ≤ 10).
     strength = 2.5·w·(P − .5) + 0.35·w·GD + 0.8·wF·(F − .5)
     edge     = strength(home) − strength(away) + 0.15        (home ice: about 54% for two equal teams)
     P(home wins) = 1 / (1 + e^−edge), kept between 15% and 85%. Ties can't happen (OT and the shootout). */
const W = { k: 20, kF: 10, p: 2.5, gd: 0.35, f: 0.8, home: 0.15, lo: .15, hi: .85 };
function form(done){
  const gp = done.length, pts = done.reduce((s, g) => s + g.pts, 0), gd = done.reduce((s, g) => s + g.gf - g.ga, 0);
  const l10 = done.slice(-10), p10 = l10.reduce((s, g) => s + g.pts, 0);
  return { gp, pts, pct: gp ? pts/(2*gp) : .5, gdpg: gp ? gd/gp : 0, gd, n10: l10.length, pct10: l10.length ? p10/(2*l10.length) : .5,
    rec10: l10.filter(g => g.res === "W").length + "-" + l10.filter(g => g.res === "L").length + "-" + l10.filter(g => g.res === "OTL").length };
}
/* the same numbers from today's standings, when a schedule can't be read */
function formStd(t){
  const l = (t.l10 || "0-0-0").split("-").map(Number), n10 = l[0] + l[1] + l[2];
  return { gp: t.gp, pts: t.pts, pct: t.gp ? t.pct : .5, gdpg: t.gp ? t.gd/t.gp : 0, gd: t.gd, n10, pct10: n10 ? t.l10p/(2*n10) : .5, rec10: t.l10 };
}
function strength(f){
  const w = f.gp/(f.gp + W.k), wF = f.n10/(f.n10 + W.kF);
  const parts = { p: W.p*w*(f.pct - .5), gd: W.gd*w*f.gdpg, f: W.f*wF*(f.pct10 - .5) };
  return { parts, total: parts.p + parts.gd + parts.f };
}
function estimate(fa, fh){
  const a = strength(fa), h = strength(fh), edge = h.total - a.total + W.home;
  const home = Math.min(W.hi, Math.max(W.lo, 1/(1 + Math.exp(-edge))));
  return { home, away: 1 - home, a, h };
}

/* ---------------- small pieces ---------------- */
const mug = (id, src) => src || "https://assets.nhle.com/mugs/nhl/latest/" + id + ".png";
/* a headshot: the feed's picture, then the "latest" one, then nothing */
const face = (id, src) => '<img class="nx-hs" src="' + String(mug(id, src)).replace(/"/g, "") + '" alt="" loading="lazy" onerror="if(!this.dataset.f){this.dataset.f=1;this.src=\'https://assets.nhle.com/mugs/nhl/latest/' + (+id || 0) + '.png\'}else this.classList.add(\'gone\')">';
const POS = { C: "C", L: "LW", R: "RW", D: "D", G: "G" };
function stateOf(L){
  const st = L.gameState, pd = L.periodDescriptor || {}, clock = L.clock || {};
  const live = st === "LIVE" || st === "CRIT", done = st === "FINAL" || st === "OFF";
  const end = (L.gameOutcome && L.gameOutcome.lastPeriodType) || pd.periodType;
  const per = pd.periodType === "OT" ? (pd.number > 4 ? (pd.number - 3) + "OT" : "OT") : pd.periodType === "SO" ? "SO" : pd.number ? "P" + pd.number : "";
  const txt = live ? (clock.inIntermission ? "INTERMISSION " + (pd.number || "") : per + (clock.timeRemaining && pd.periodType !== "SO" ? " · " + clock.timeRemaining : "")) :
    done ? "FINAL" + (end && end !== "REG" ? "/" + end : "") : L.gameScheduleState && L.gameScheduleState !== "OK" ? (L.gameScheduleState === "PPD" ? "POSTPONED" : L.gameScheduleState) : "";
  return { live, done, pre: !live && !done, txt, end };
}
const perName = pd => pd.periodType === "OT" ? (pd.number > 4 ? (pd.number - 3) + "OT" : "OT") : pd.periodType === "SO" ? "SO" : String(pd.number);

/* ================= the page ================= */
async function page(pg, alive, id, K){
  const { esc, $, day, time, ord, p3, f2, f1, pc1, sgn, nm, logo, head, tc, tvars, hl, TTL, PATHS, load, standings, results, sk, lbl, fail, stamp, POOL, onLeave } = K;
  if(!/^\d{10}$/.test(String(id))){ pg.innerHTML = '<p class="nx-none">That isn\'t a game. <a href="#nhl">Back to the NHL</a></p>'; return; }
  const GP = { landing: "/v1/gamecenter/" + id + "/landing", box: "/v1/gamecenter/" + id + "/boxscore", rail: "/v1/gamecenter/" + id + "/right-rail" };
  pg.innerHTML = sk("58cqw", "card") + sk("30cqw") + sk("70cqw") + sk("90cqw");

  /* the game first (it names the teams), then everything else side by side */
  let L;
  try { L = (await load(GP.landing, TTL.live)).data; }
  catch(e){
    /* no landing: today's scoreboard still knows the teams */
    const sc = P.nhl.peek(PATHS.score), g = sc && ((sc.data && sc.data.games) || []).find(x => String(x.id) === String(id));
    if(!g){ if(alive()) pg.innerHTML = fail("this game", e); return; }
    L = g;
  }
  if(!alive()) return;
  const A = L.awayTeam.abbrev, H = L.homeTeam.abbrev, start = new Date(L.startTimeUTC);
  let S = stateOf(L);
  const [stdR, schA, schH, csA, csH, railR, boxR] = await Promise.allSettled([
    standings(), load(PATHS.sched(A), TTL.stats), load(PATHS.sched(H), TTL.stats), load(PATHS.club(A), TTL.stats), load(PATHS.club(H), TTL.stats),
    load(GP.rail, S.pre ? TTL.stats : TTL.live), S.pre ? Promise.reject(null) : load(GP.box, TTL.live)
  ]);
  if(!alive()) return;
  const ok = r => r.status === "fulfilled" ? r.value : null;
  const std = ok(stdR), tA = std && std.by(A), tH = std && std.by(H);
  let rail = ok(railR) && ok(railR).data, box = ok(boxR) && ok(boxR).data;
  const resA = ok(schA) ? results(ok(schA).data, A) : null, resH = ok(schH) ? results(ok(schH).data, H) : null;
  const before = res => res ? res.done.filter(g => g.start < start && String(g.id) !== String(id)) : null;
  const dA = before(resA), dH = before(resH);
  const FAV = K.fav(), side = { a: A, h: H };
  const cA = tc(A), cH = tc(H);
  /* two accents for the bars; when both clubs are close in colour the home side takes its second colour */
  const near = (x, y) => { const n = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16)); const p = n(x), q = n(y); return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 130; };
  /* bright enough to read on the dark panels: relative luminance of a #rrggbb colour */
  const lit = x => { const n = parseInt(String(x).slice(1), 16); if(isNaN(n)) return 0; return [n >> 16, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v/12.92 : Math.pow((v + .055)/1.055, 2.4); }).reduce((s, v, i) => s + v*[.2126, .7152, .0722][i], 0); };
  const accA = lit(cA.acc) >= .1 ? cA.acc : "#c9d6e6";
  /* the home side: its accent, else its other colour, else ember or ice, whichever reads and differs from the away one */
  const accH = [cH.acc, cH.deep, "#f08a17", "#3b8ae0", "#c9d6e6"].find(x => x && lit(x) >= .1 && !near(x, accA)) || "#f08a17";
 /* your team's colours for its .fav marks anywhere on the page */
  if(FAV === A || FAV === H) pg.setAttribute("style", tvars(FAV));
  const pageVars = "--ca:" + accA + ";--ch:" + accH + ";--a1:" + cA.c1 + ";--h1:" + cH.c1;

  /* ---------- the faceoff ---------- */
  const hero = () => {
    const tm = (abbr, t, rec, k) => {
      const m = hl(abbr), fav = abbr === FAV, place = t ? ord(t.seqD) + " " + esc(t.divName.toUpperCase()) : "";
      return '<a class="gp-tm ' + k + (m.cls ? " " + m.cls.trim() : "") + '" href="#nhl-team-' + abbr + '">' + logo(abbr, "gp-lg") +
        '<b>' + esc(abbr) + "</b><span class=\"nm\">" + esc(t ? t.short : nm(L[k === "a" ? "awayTeam" : "homeTeam"].commonName) || abbr) + "</span>" +
        '<span class="rec">' + esc(rec || "") + (t ? " · " + t.pts + " PTS" : "") + "</span>" + (place ? '<span class="pl">' + place + "</span>" : "") +
        (fav ? '<span class="tag fav">★ YOUR TEAM</span>' : POOL.includes(abbr) ? '<span class="tag ours">POOL</span>' : "") + "</a>";
    };
    const recOf = (t, k) => t ? t.w + "-" + t.l + "-" + t.otl : (L[k].record || "");
    const sa = L.awayTeam.score, sh = L.homeTeam.score, has = typeof sa === "number";
    const mid = S.pre
      ? '<span class="vs">VS</span><b class="tme">' + time(start) + '</b><small>' + day(start) + "</small>" + (S.txt ? '<small class="pp">' + esc(S.txt) + "</small>" : "")
      : '<span class="sc"><b' + (S.done && sa > sh ? ' class="w"' : "") + ">" + (has ? sa : "–") + "</b><i>–</i><b" + (S.done && sh > sa ? ' class="w"' : "") + ">" + (has ? sh : "–") + "</b></span>" +
        '<small class="' + (S.live ? "lv" : "fn") + '">' + (S.live ? '<i class="dot"></i>' : "") + esc(S.txt) + "</small>" +
        (typeof L.awayTeam.sog === "number" ? '<small class="sog">SHOTS ' + L.awayTeam.sog + "–" + L.homeTeam.sog + "</small>" : "");
    const venue = L.venue ? nm(L.venue) : "";
    return '<section class="gp-hero' + (S.live ? " live" : "") + '" style="' + pageVars + '">' +
      '<span class="wm a" aria-hidden="true">' + logo(A, "") + '</span><span class="wm h" aria-hidden="true">' + logo(H, "") + "</span>" +
      '<p class="gp-top">' + (L.gameType === 3 ? "PLAYOFFS · " : L.gameType === 1 ? "PRESEASON · " : "") + esc(day(start)) + (venue ? " · " + esc(venue.toUpperCase()) : "") + "</p>" +
      '<div class="gp-fo">' + tm(A, tA, recOf(tA, "awayTeam"), "a") + '<div class="gp-mid">' + mid + "</div>" + tm(H, tH, recOf(tH, "homeTeam"), "h") + "</div>" +
      '<p class="gp-ah"><span>AWAY</span><span>' + (S.pre ? "Times in your time zone" : S.live ? "Live · updates every 30 s" : "") + "</span><span>HOME</span></p></section>";
  };

  /* ---------- the Pool ---------- */
  const poolHTML = () => {
    if(!(POOL.includes(A) || POOL.includes(H))) return "";
    return '<a class="gp-pool" href="#pool"><span><small>A POOL GAME</small><b>' + (S.pre ? "Pick it in the Pool" : S.live ? "Your pick, live in the Pool" : "See how the Pool went") + "</b></span><em>►</em></a>";
  };

  /* ---------- the game itself (live or done) ---------- */
  const mirror = (label, a, h, o = {}) => {
    /* one stat side by side: bars grow out from the middle; the better side lights up */
    const va = +a, vh = +h, lo = o.lo || 0, hi = Math.max(va, vh), good = o.low ? -1 : 1;
    const wd = v => isNaN(v) || hi <= lo ? 0 : Math.max(4, (v - lo)/(hi - lo)*100);
    const best = isNaN(va) || isNaN(vh) || va === vh ? 0 : (va - vh)*good > 0 ? -1 : 1;
    const fmt = o.f || (v => v);
    return '<div class="gp-st"><small>' + esc(label) + "</small>" +
      '<span class="v a' + (best < 0 ? " on" : "") + '">' + (o.da != null ? esc(o.da) : fmt(a)) + (o.ra ? "<em>" + o.ra + "</em>" : "") + "</span>" +
      '<span class="bar a' + (best < 0 ? " on" : "") + '"><i style="width:' + wd(va).toFixed(1) + '%"></i></span>' +
      '<span class="bar h' + (best > 0 ? " on" : "") + '"><i style="width:' + wd(vh).toFixed(1) + '%"></i></span>' +
      '<span class="v h' + (best > 0 ? " on" : "") + '">' + (o.dh != null ? esc(o.dh) : fmt(h)) + (o.rh ? "<em>" + o.rh + "</em>" : "") + "</span></div>";
  };
  const keyAH = () => '<div class="gp-key"><span class="a">' + logo(A, "nx-lgs") + "<b>" + A + '</b></span><span class="h"><b>' + H + "</b>" + logo(H, "nx-lgs") + "</span></div>";
  const gameHTML = () => {
    if(S.pre) return "";
    const sm = L.summary || {}, periods = sm.scoring || [];
    let html = '<section class="nx-panel gp-game" style="' + pageVars + '">' + K.lbl(S.live ? "Live" : "The game", '<span class="nx-sub' + (S.live ? " lvt" : "") + '">' + esc(S.txt) + "</span>");
    /* periods: goals (and shots) per period */
    const ls = rail && rail.linescore, sp = rail && rail.shotsByPeriod;
    let rows = ls && ls.byPeriod ? ls.byPeriod.map(p => ({ pd: p.periodDescriptor, a: p.away, h: p.home })) : periods.map(p => ({ pd: p.periodDescriptor,
      a: p.goals.filter(g => !g.isHome && (g.teamAbbrev && g.teamAbbrev.default) === A).length, h: p.goals.filter(g => (g.teamAbbrev && g.teamAbbrev.default) === H).length }));
    if(rows.length){
      const shot = pd => sp && sp.find(x => x.periodDescriptor.number === pd.number);
      const tot = (k) => ls && ls.totals ? ls.totals[k] : (k === "away" ? L.awayTeam.score : L.homeTeam.score);
      html += '<div class="nx-tw"><table class="nx-t sm gp-ls"><thead><tr><th class="nm"></th>' + rows.map(r => "<th>" + perName(r.pd) + "</th>").join("") + '<th class="pt">T</th>' + (typeof L.awayTeam.sog === "number" ? "<th>SOG</th>" : "") + "</tr></thead><tbody>" +
        [["a", A, "away"], ["h", H, "home"]].map(([k, ab, key]) => '<tr class="' + hl(ab).cls.trim() + '"><td class="nm"><span class="tc">' + logo(ab, "nx-lgs") + "<b>" + ab + "</b></span></td>" +
          rows.map(r => { const s = shot(r.pd); return "<td>" + r[k] + (s && r.pd.periodType !== "SO" ? '<small class="sh">' + s[key] + "</small>" : "") + "</td>"; }).join("") +
          '<td class="pt"><strong>' + tot(key) + "</strong></td>" + (typeof L.awayTeam.sog === "number" ? "<td>" + L[key + "Team"].sog + "</td>" : "") + "</tr>").join("") + "</tbody></table></div>" +
        (sp ? '<p class="nx-fine">Small numbers: shots on goal in that period.</p>' : "");
    }
    /* the goals, period by period */
    const goals = periods.filter(p => p.goals.length);
    if(goals.length){
      html += '<div class="gp-goals">' + goals.map(p => '<h3 class="gp-ph">' + (p.periodDescriptor.periodType === "SO" ? "SHOOTOUT" : p.periodDescriptor.periodType === "OT" ? "OVERTIME" : ord(p.periodDescriptor.number) + " PERIOD") + "</h3>" +
        p.goals.map(g => {
          const ab = g.teamAbbrev ? g.teamAbbrev.default : "", so = p.periodDescriptor.periodType === "SO";
          const tag = so ? "SO WINNER" : g.strength === "pp" ? "PP" : g.strength === "sh" ? "SH" : "";
          const en = g.goalModifier === "empty-net" ? "EN" : g.goalModifier === "penalty-shot" ? "PS" : "";
          const ast = (g.assists || []).map(x => esc(nm(x.name))).join(", ");
          return '<a class="gp-goal ' + (ab === A ? "a" : "h") + hl(ab).cls + '" href="#nhl-player-' + g.playerId + '">' + face(g.playerId, g.headshot) +
            '<span class="who"><b>' + esc(nm(g.name) || (nm(g.firstName) + " " + nm(g.lastName))) + (g.goalsToDate && !so ? " <i>(" + g.goalsToDate + ")</i>" : "") + "</b>" +
            "<small>" + logo(ab, "nx-lgx") + esc(ab) + (so ? "" : " · " + esc(g.timeInPeriod || "")) + (ast ? " · " + ast : so ? "" : " · unassisted") + "</small></span>" +
            '<span class="sc">' + (tag || en ? '<em>' + [tag, en].filter(Boolean).join(" ") + "</em>" : "") + (so ? "" : "<strong>" + g.awayScore + "–" + g.homeScore + "</strong>") + "</span></a>";
        }).join("")).join("") + "</div>";
    } else if(S.live) html += '<p class="nx-none">No goals yet.</p>';
    /* three stars */
    if(S.done && (sm.threeStars || []).length){
      html += '<h3 class="nx-ch">Three stars</h3><div class="gp-stars">' + sm.threeStars.map(s => '<a class="' + hl(s.teamAbbrev).cls.trim() + '" href="#nhl-player-' + s.playerId + '"><i>' + ["", "1ST", "2ND", "3RD"][s.star] + " ★</i>" + face(s.playerId, s.headshot) +
        "<b>" + esc(nm(s.name)) + "</b><small>" + logo(s.teamAbbrev, "nx-lgx") + esc(s.teamAbbrev) + " · " + (s.position === "G" ? p3(s.savePctg) + " SV%" : (s.goals || 0) + "G " + (s.assists || 0) + "A") + "</small></a>").join("") + "</div>";
    }
    /* the game's numbers */
    const tgs = rail && rail.teamGameStats;
    if(tgs && tgs.length){
      const v = c => tgs.find(x => x.category === c);
      const frac = s => { const m = /^(\d+)\/(\d+)$/.exec(String(s)); return m ? +m[1] : NaN; };
      const rowsG = [["sog", "Shots on goal"], ["faceoffWinningPctg", "Faceoffs", { f: pc1, lo: 0 }], ["powerPlay", "Power play", { pp: true }], ["hits", "Hits"], ["blockedShots", "Blocked shots"], ["pim", "Penalty minutes", { low: true }], ["giveaways", "Giveaways", { low: true }], ["takeaways", "Takeaways"]];
      html += '<h3 class="nx-ch">Game stats</h3>' + keyAH() + '<div class="gp-sts">' + rowsG.map(([c, h, o = {}]) => { const x = v(c); if(!x) return "";
        /* power play "1/4": the bars by goals, the text as the feed writes it */
        if(o.pp) return mirror(h + " (goals/chances)", frac(x.awayValue), frac(x.homeValue), { da: x.awayValue, dh: x.homeValue });
        return mirror(h, x.awayValue, x.homeValue, o); }).join("") + "</div>";
    }
    /* who was in net */
    const gl = box && box.playerByGameStats;
    if(gl){
      const used = k => (gl[k].goalies || []).filter(g => g.toi && g.toi !== "00:00");
      const card = (g, ab) => '<a class="gp-gl' + hl(ab).cls + '" href="#nhl-player-' + g.playerId + '">' + face(g.playerId) + '<span class="who"><b>' + esc(nm(g.name)) + "</b><small>" + logo(ab, "nx-lgx") + ab + " · #" + g.sweaterNumber + (g.decision ? " · " + g.decision : "") + "</small></span>" +
        '<span class="n"><strong>' + (g.saves != null ? g.saves + "/" + g.shotsAgainst : "–") + "</strong><small>" + (g.savePctg != null ? p3(g.savePctg) + " SV%" : "SAVES") + "</small></span></a>";
      const ga = used("awayTeam"), gh = used("homeTeam");
      if(ga.length || gh.length) html += '<h3 class="nx-ch">In net</h3><div class="gp-gls">' + '<div>' + ga.map(g => card(g, A)).join("") + "</div><div>" + gh.map(g => card(g, H)).join("") + "</div></div>";
    }
    return html + "</section>";
  };

  /* ---------- win estimate ---------- */
  const fA = dA && (dA.length || !tA) ? form(dA) : tA ? formStd(tA) : null;
  const fH = dH && (dH.length || !tH) ? form(dH) : tH ? formStd(tH) : null;
  const winHTML = () => {
    if(!fA || !fH) return "";
    const e = estimate(fA, fH), pa = Math.round(e.away*100), ph = 100 - pa;
    const fav = (x, y) => x > y + 1e-9 ? "a" : y > x + 1e-9 ? "h" : "";
    const row = (k, a, h, w) => '<div class="gp-why ' + w + '"><span class="a">' + a + "</span><small>" + k + '</small><span class="h">' + h + "</span></div>";
    const early = fA.gp + fH.gp < 16;
    return '<section class="nx-panel gp-win" style="' + pageVars + '">' + lbl(S.pre ? "Who wins?" : "Pre-game estimate", '<span class="nx-sub">' + (S.pre ? "AN ESTIMATE, NOT ODDS" : "NOT ODDS") + "</span>") +
      '<div class="gp-pct"><span class="a"><b>' + pa + '<i>%</i></b><small>' + logo(A, "nx-lgx") + A + '</small></span><span class="h"><small>' + H + logo(H, "nx-lgx") + "</small><b>" + ph + "<i>%</i></b></span></div>" +
      '<div class="gp-split" role="img" aria-label="' + esc(A + " " + pa + "%, " + H + " " + ph + "%") + '"><i class="a" style="width:' + pa + '%"></i><i class="h" style="width:' + ph + '%"></i></div>' +
      '<div class="gp-whys">' +
        row("POINTS %", p3(fA.pct), p3(fH.pct), fav(e.a.parts.p, e.h.parts.p)) +
        row("GOAL DIFF / GAME", sgn(+fA.gdpg.toFixed(2)), sgn(+fH.gdpg.toFixed(2)), fav(e.a.parts.gd, e.h.parts.gd)) +
        row("LAST " + Math.max(fA.n10, fH.n10), esc(fA.rec10), esc(fH.rec10), fav(e.a.parts.f, e.h.parts.f)) +
        row("HOME ICE", "", "✓", "h") + "</div>" +
      '<p class="nx-fine">From each team\'s ' + (S.pre ? "season so far" : "games before this one") + ": points %, goal difference per game and the last 10, plus a small edge for home ice. " +
        (early ? "Early in the season it leans toward 50-50. " : "") + "A rough guide for fun, not betting odds.</p></section>";
  };

  /* ---------- form: the last 10 of each ---------- */
  const formHTML = () => {
    const one = (ab, d, t) => {
      if(!d){ return '<div class="gp-fm">' + '<h3>' + logo(ab, "nx-lgs") + "<b>" + ab + "</b>" + (t ? "<span>L10 " + esc(t.l10) + " · " + esc(t.streak) + "</span>" : "") + "</h3><p class=\"nx-fine\">No game list right now.</p></div>"; }
      const l = d.slice(-10).reverse();
      let st = "";
      if(d.length){ const last = d[d.length - 1].res; let n = 0; for(let i = d.length - 1; i >= 0 && d[i].res === last; i--) n++; st = (last === "OTL" ? "OT" : last) + n; }
      const f = form(d), m = hl(ab);
      return '<div class="gp-fm' + m.cls + '"' + m.st + '><h3>' + logo(ab, "nx-lgs") + "<b>" + ab + "</b><span>" + esc(f.rec10) + (st ? ' · STREAK <em class="' + st[0].toLowerCase() + '">' + st + "</em>" : "") + "</span></h3>" +
        (l.length ? '<div class="gp-pills">' + l.map(g => '<a class="fm ' + g.res.toLowerCase() + '" href="#nhl-game-' + g.id + '" title="' + esc((g.home ? "vs " : "@ ") + g.opp + " · " + K.dm(g.start)) + '"><em>' + (g.res === "OTL" ? g.end : g.res) + "</em><b>" + g.gf + "–" + g.ga + "</b>" + logo(g.opp, "nx-lgx") + "<small>" + (g.home ? "vs " : "@ ") + g.opp + "</small></a>").join("") + "</div>" : '<p class="nx-fine">No games played yet.</p>') + "</div>";
    };
    return '<section class="nx-panel">' + lbl("Form", '<span class="nx-sub">' + (S.pre ? "LAST 10 · NEWEST FIRST" : "LAST 10 BEFORE THIS GAME") + "</span>") + one(A, dA, tA) + one(H, dH, tH) + "</section>";
  };

  /* ---------- season stats, side by side ---------- */
  const seasonHTML = () => {
    const tss = rail && rail.teamSeasonStats, ra = tss && tss.awayTeam, rh = tss && tss.homeTeam;
    const sum = (cs, k, list) => cs ? (cs.data[list] || []).reduce((s, x) => s + (x[k] || 0), 0) : null;
    const cA = ok(csA), cH = ok(csH);
    const rank = (f, t, asc) => std && t ? ord(1 + std.teams.filter(x => x.gp && (asc ? f(x) < f(t) : f(x) > f(t))).length) : "";
    const per = (x, k) => x.gp ? x[k]/x.gp : 0;
    let rows = "";
    if(tA && tH && tA.gp && tH.gp){
      rows += mirror("Points %", tA.pct, tH.pct, { f: p3, ra: rank(x => x.pct, tA), rh: rank(x => x.pct, tH) });
      rows += mirror("Goals for / game", per(tA, "gf"), per(tH, "gf"), { f: f2, ra: rank(x => per(x, "gf"), tA), rh: rank(x => per(x, "gf"), tH) });
      rows += mirror("Goals against / game", per(tA, "ga"), per(tH, "ga"), { f: f2, low: true, ra: rank(x => per(x, "ga"), tA, true), rh: rank(x => per(x, "ga"), tH, true) });
    } else if(ra && rh){
      rows += mirror("Goals for / game", ra.goalsForPerGamePlayed, rh.goalsForPerGamePlayed, { f: f2, ra: ord(ra.goalsForPerGamePlayedRank), rh: ord(rh.goalsForPerGamePlayedRank) });
      rows += mirror("Goals against / game", ra.goalsAgainstPerGamePlayed, rh.goalsAgainstPerGamePlayed, { f: f2, low: true, ra: ord(ra.goalsAgainstPerGamePlayedRank), rh: ord(rh.goalsAgainstPerGamePlayedRank) });
    }
    if(ra && rh){
      rows += mirror("Power play", ra.ppPctg, rh.ppPctg, { f: pc1, ra: ord(ra.ppPctgRank), rh: ord(rh.ppPctgRank) });
      rows += mirror("Penalty kill", ra.pkPctg, rh.pkPctg, { f: pc1, lo: .5, ra: ord(ra.pkPctgRank), rh: ord(rh.pkPctgRank) });
      rows += mirror("Faceoffs won", ra.faceoffWinningPctg, rh.faceoffWinningPctg, { f: pc1, lo: .4, ra: ord(ra.faceoffWinningPctgRank), rh: ord(rh.faceoffWinningPctgRank) });
    }
    if(cA && cH && tA && tH && tA.gp && tH.gp){
      const sfA = sum(cA, "shots", "skaters"), sfH = sum(cH, "shots", "skaters"), saA = sum(cA, "shotsAgainst", "goalies"), saH = sum(cH, "shotsAgainst", "goalies");
      const svA = sum(cA, "saves", "goalies"), svH = sum(cH, "saves", "goalies"), gA = sum(cA, "goals", "skaters"), gH = sum(cH, "goals", "skaters");
      const ppA = sum(cA, "powerPlayGoals", "skaters"), ppH = sum(cH, "powerPlayGoals", "skaters");
      if(sfA && sfH) rows += mirror("Shots for / game", sfA/tA.gp, sfH/tH.gp, { f: f1 });
      if(saA && saH) rows += mirror("Shots against / game", saA/tA.gp, saH/tH.gp, { f: f1, low: true });
      if(sfA && sfH) rows += mirror("Shooting %", gA/sfA, gH/sfH, { f: pc1 });
      if(saA && saH) rows += mirror("Save %", svA/saA, svH/saH, { f: p3, lo: .85 });
      if(!(ra && rh)) rows += mirror("Power-play goals / game", ppA/tA.gp, ppH/tH.gp, { f: f2 });
    }
    if(!rows) return "";
    return '<section class="nx-panel gp-season" style="' + pageVars + '">' + lbl("Season stats", '<span class="nx-sub">' + (std && std.season ? K.esc(String(std.season).slice(0, 4) + "-" + String(std.season).slice(6, 8)) : "THIS SEASON") + "</span>") + keyAH() + '<div class="gp-sts">' + rows + "</div>" +
      '<p class="nx-fine">The brighter bar is the better number. Small print: rank among the 32 teams.' + (ra ? "" : " Power play, penalty kill and faceoffs show up before puck drop.") + "</p></section>";
  };

  /* ---------- season series ---------- */
  const seriesHTML = () => {
    const sch = ok(schH) || ok(schA), me = ok(schH) ? H : A;
    let games = sch ? (sch.data.games || []).filter(g => (g.gameType === 2 || g.gameType === 3) && (g.homeTeam.abbrev === (me === H ? A : H) || g.awayTeam.abbrev === (me === H ? A : H))) : [];
    if(!games.length && rail && rail.seasonSeries) games = rail.seasonSeries;
    if(!games.length) return "";
    games = games.slice().sort((a, b) => a.startTimeUTC < b.startTimeUTC ? -1 : 1);
    let wa = 0, wh = 0;
    const rows = games.map(g => {
      const d = new Date(g.startTimeUTC), fin = g.gameState === "FINAL" || g.gameState === "OFF", lv = g.gameState === "LIVE" || g.gameState === "CRIT", here = String(g.id) === String(id);
      const aw = g.awayTeam, hm = g.homeTeam, end = g.gameOutcome && g.gameOutcome.lastPeriodType;
      let win = "";
      if(fin){ win = aw.score > hm.score ? aw.abbrev : hm.abbrev; if(win === A) wa++; else wh++; }
      const s = (t, o) => '<span class="t' + (fin && t.score > o.score ? " w" : "") + '">' + logo(t.abbrev, "nx-lgs") + "<b>" + t.abbrev + "</b>" + (fin || lv ? "<strong>" + t.score + "</strong>" : "") + "</span>";
      return '<a class="gp-sr' + (here ? " here" : "") + (fin ? "" : " fut") + '" href="#nhl-game-' + g.id + '"><small>' + esc(K.dm(d)) + (fin ? "" : "<br>" + time(d)) + "</small>" + s(aw, hm) + '<i>@</i>' + s(hm, aw) +
        '<em>' + (here ? "THIS GAME" : fin ? "FINAL" + (end && end !== "REG" ? "/" + end : "") : lv ? "LIVE" : "") + "</em></a>";
    }).join("");
    const done = wa + wh;
    const tally = done ? (wa === wh ? "SERIES TIED " + wa + "–" + wh : (wa > wh ? A : H) + " LEADS " + Math.max(wa, wh) + "–" + Math.min(wa, wh)) : games.length + " MEETINGS THIS SEASON";
    return '<section class="nx-panel">' + lbl("Season series", '<span class="nx-sub">' + esc(tally) + "</span>") + '<div class="gp-srs">' + rows + "</div></section>";
  };

  /* ---------- team leaders and goalies ---------- */
  const skaters = r => r ? (r.data.skaters || []).map(x => ({ id: x.playerId, last: nm(x.lastName), first: nm(x.firstName), pos: x.positionCode, head: x.headshot, gp: x.gamesPlayed, g: x.goals, a: x.assists, p: x.points })) : [];
  const leadersHTML = () => {
    const sa = skaters(ok(csA)), sh = skaters(ok(csH));
    if(!sa.length || !sh.length) return "";
    const top = (l, k) => l.slice().sort((x, y) => y[k] - x[k] || y.p - x.p)[0];
    const card = (p, ab, k, cls) => '<a class="gp-pc ' + cls + hl(ab).cls + '" href="#nhl-player-' + p.id + '">' + face(p.id, p.head) + '<span class="who"><b>' + esc(p.last) + "</b><small>" + esc(POS[p.pos] || p.pos || "") + " · " + p.gp + " GP</small></span><strong>" + p[k] + "</strong></a>";
    const line = (k, h) => '<div class="gp-ld">' + card(top(sa, k), A, k, "a") + "<small>" + h + "</small>" + card(top(sh, k), H, k, "h") + "</div>";
    return '<section class="nx-panel" style="' + pageVars + '">' + lbl("Team leaders", '<span class="nx-sub">THIS SEASON</span>') + keyAH() + line("p", "PTS") + line("g", "G") + line("a", "A") + "</section>";
  };
  const goaliesHTML = () => {
    if(!S.pre) return "";
    const gl = r => r ? (r.data.goalies || []).map(x => ({ id: x.playerId, last: nm(x.lastName), head: x.headshot, gp: x.gamesPlayed, gs: x.gamesStarted, w: x.wins, l: x.losses, o: x.overtimeLosses, sv: x.savePercentage, gaa: x.goalsAgainstAverage, so: x.shutouts }))
      .filter(x => x.gp).sort((a, b) => b.gs - a.gs || b.gp - a.gp).slice(0, 2) : [];
    const ga = gl(ok(csA)), gh = gl(ok(csH));
    if(!ga.length && !gh.length) return "";
    const card = (g, ab, i) => '<a class="gp-gl' + (i ? " sub" : "") + hl(ab).cls + '" href="#nhl-player-' + g.id + '">' + face(g.id, g.head) + '<span class="who"><b>' + esc(g.last) + "</b><small>" + g.gs + " STARTS · " + g.w + "-" + g.l + "-" + g.o + "</small></span>" +
      '<span class="n"><strong>' + p3(g.sv) + "</strong><small>" + f2(g.gaa) + " GAA</small></span></a>";
    return '<section class="nx-panel">' + lbl("In the crease", '<span class="nx-sub">MOST STARTS FIRST</span>') + keyAH() + '<div class="gp-gls"><div>' + ga.map((g, i) => card(g, A, i)).join("") + "</div><div>" + gh.map((g, i) => card(g, H, i)).join("") + "</div></div>" +
      '<p class="nx-fine">The NHL names the starter close to puck drop; the one with the most starts usually plays.</p></section>';
  };

  const draw = () => {
    pg.innerHTML = hero() + poolHTML() + (S.pre ? winHTML() + formHTML() + seasonHTML() + seriesHTML() + leadersHTML() + goaliesHTML()
      : gameHTML() + seriesHTML() + formHTML() + winHTML() + seasonHTML() + leadersHTML());
    stamp(pg);
  };
  draw();

  /* live (or about to start): the score, clock and goals refresh every 30 s while the page is open */
  if(S.live || (S.pre && start - Date.now() < 15*60000 && Date.now() - start < 6*3600000)){
    const iv = setInterval(async () => {
      if(!alive()){ clearInterval(iv); return; }
      try {
        const r = await P.nhl.cached(GP.landing, TTL.live); if(!alive()) return;
        const was = S.pre; L = r.data; S = stateOf(L);
        if(!S.pre){
          const [rr, bb] = await Promise.allSettled([P.nhl.cached(GP.rail, TTL.live), P.nhl.cached(GP.box, TTL.live)]);
          if(rr.status === "fulfilled") rail = rr.value.data; if(bb.status === "fulfilled") box = bb.value.data;
        }
        if(!alive()) return;
        const y = window.scrollY; draw(); if(!was) window.scrollTo(0, y);
        if(S.done) clearInterval(iv);
      } catch(e){}
    }, 30000);
    onLeave(() => clearInterval(iv));
  }
}
P.nhlGame = { page, estimate, strength, W };
})();
