/* PUCK Faceoff: BALL's One on One, on ice.

   You have the puck. Tap a team-mate and a question comes up: right, and the
   pass goes crisply across the ice to him and he skates on with it; wrong, and
   one of theirs picks it off and they go the other way. Work it up the ice,
   and once you are in their zone you can shoot: answer, pick a spot, and the
   man in goal picks one blind. Same spot, saved. Periods (or first to 3), and
   level at the end goes to the shootout.

   Where everyone stands matters, so look around (drag the rink, pinch, or the
   TV / Top / Puck buttons). Each turn they mark two of your men (one in your
   own end): a pass to a marked man is a rung harder, and he is the one who
   cuts it out if you miss. An open man costs what the distance costs.

   The moments: a stretch pass to an open man that takes it into their zone is
   a BREAKAWAY (the shot is an easy question); a pass across the slot, or from the point down to
   a forward, sets up a ONE-TIMER (the shot is a rung easier). Three saves in a
   row is a BRICK WALL, three goals for one man a HAT TRICK.

   The shot is a choice: SNIPE (pick a spot, the goalie covers one) or RIP IT
   (a rung easier, the goalie covers two). A save off the pads leaves a REBOUND
   and the goalie's side has to answer to clear it. A forecheck that misses is
   a hook: a POWER PLAY. Three right in a row puts you ON A HEATER (a 50-50).
   Goals get a TV replay from the other end; a tap skips anything you watch.

   THE RULES LIVE HERE AND ONLY HERE. app/rink3d.js is told what happened and
   only decides how it looks (BALL's "a view, never a driver").

   Two of you on one phone take turns with the puck; the defender gets a say
   three times: the forecheck (after two soft passes he may go for the third:
   a steal or a penalty), the goalie's blind pick and the rebound. Or play the computer at Easy, Medium,
   Hard or Expert, with BALL's own odds. Questions come from PUCK.questions.next(). */
(function(){
const P = window.PUCK = window.PUCK || {};
const FO = 'puck.faceoff';
let U = null;                         /* PUCK.ui, from app.js */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){ return false; } };
const wait = ms => new Promise(r => setTimeout(r, reduced() ? Math.min(ms, 350) : ms));
const pick = a => a[Math.floor(Math.random()*a.length)];
const sfx = n => { if(P.sfx) P.sfx.play(n); };
const buzz = p => { try { if(navigator.vibrate && !reduced()) navigator.vibrate(p); } catch(e){} };

/* ---------------- the shapes ----------------
   Every position is in that side's own attacking frame, in metres: x across,
   z from the goal it attacks (0) back to its own goal line (54.26). Slots:
   0 G, 1 LD, 2 RD, 3 C, 4 LW, 5 RW. A side attacks in one of three zones:
   D (breaking out of its own end), N (through the neutral zone), O (in theirs). */
const SLOTS = ['G', 'LD', 'RD', 'C', 'LW', 'RW'];
const G_SPOT = [0, 52.6];
const SHAPES = {
  D: [G_SPOT, [-5.5, 50.5], [5.5, 48], [0, 41], [-9.5, 36.5], [9.5, 36.5]],
  N: [G_SPOT, [-5, 37], [5, 37], [0, 28.5], [-9, 22], [9, 22]],
  O: [G_SPOT, [-7.5, 19], [7.5, 19], [0, 8], [-7.5, 4.5], [8, 7]],
  F: [G_SPOT, [-4.5, 33.4], [4.5, 33.4], [0, 27.75], [-5.2, 28.6], [5.2, 28.6]]
};
/* the side without the puck, by where the attack is */
const DEF = {
  O: [G_SPOT, [-3, 49], [4, 47.5], [0, 44], [-7.5, 37], [7.5, 37]],
  N: [G_SPOT, [-5, 41], [5, 41], [0, 33], [-8, 31], [8, 31]],
  D: [G_SPOT, [-7, 22], [7, 22], [0, 14], [-6, 10], [6, 12]],
  F: SHAPES.F
};
const NEXT_ZONE = { D: 'N', N: 'O', O: 'O' }, LOST_ZONE = { O: 'D', N: 'N', D: 'O' };
const ZONE_SAYS = { D: 'in his own end', N: 'in the neutral zone', O: 'in their zone' };
const ZONE_TAG = { D: 'Own end', N: 'Neutral zone', O: 'Their zone', F: 'Centre ice' };

/* ---------------- the ladder ----------------
   A pass costs what it covers: how far up the ice, plus a quarter of how far
   across, plus a cross-crease ball through the slot. Backwards is free.
   A marked man costs one rung more. */
const LADDER = ['easy', 'normal', 'hard', 'extreme'];
const up = t => LADDER[Math.min(3, LADDER.indexOf(t) + 1)], down = t => LADDER[Math.max(0, LADDER.indexOf(t) - 1)];
const TIERS = {
  easy: { say: 'Easy', secs: 12 }, normal: { say: 'Normal', secs: 15 },
  hard: { say: 'Hard', secs: 18 }, extreme: { say: 'Extreme', secs: 20 }
};
const PASS_SAYS = { easy: 'Short pass', normal: 'Pass', hard: 'Long pass', extreme: 'Stretch pass' };
function tierFor(zone, a, b){
  const A = SHAPES[zone][a], B = SHAPES[zone][b];
  let eff = Math.max(0, A[1] - B[1]) + .25*Math.abs(A[0] - B[0]);
  if(zone === 'O' && A[0]*B[0] < 0 && A[1] < 12 && B[1] < 12) eff += 4;
  return eff <= 4 ? 'easy' : eff <= 12 ? 'normal' : eff <= 18 ? 'hard' : 'extreme';
}
/* where you can shoot from, and what it costs */
const SHOT_AT = { 1: 'extreme', 2: 'extreme', 3: 'normal', 4: 'hard', 5: 'hard' };
const SHOT_SAYS = { normal: 'from the slot', hard: 'off the wing', extreme: 'from the point' };
/* two soft ones in a row and the other side may forecheck the third */
const PRESS_AT = 2;
/* the shot menu: SNIPE (the rung for where he is, the goalie covers one spot of five)
   or RIP IT, a quick shot (a rung easier, but the goalie gets to cover two). A save off the pads (low
   spots), or any quick shot he doesn't catch, leaves a REBOUND in the crease: the defending side
   has to answer to clear it, a miss and it's buried. Glove high he catches; blocker high goes
   to the corner. */
const PAD_SPOTS = ['fh', 'lg', 'lb'];
const reboundOff = (spot, quick) => quick ? spot !== 'gh' : PAD_SPOTS.includes(spot);
/* a power play: a forecheck that misses is a hook, two minutes, the man who did it goes to the
   box. The side on the power play gets one fewer man marked until it scores or the time is up */
const PP_QS = 4;
/* on a heater: three right in a row and your next question is a 50-50 */
const HEAT_AT = 3;
const SPOT_KEYS = ['gh', 'bh', 'fh', 'lg', 'lb'];

/* ---------------- difficulty: THE one place that says which questions come up ----------------
   tiers goes straight into PUCK.questions.next({ tiers }). Inside the band, a
   short pass asks its easiest tier, a stretch pass or a shot its hardest, and
   everything else the whole band. The computer opponent plays at the same
   level, with BALL's odds per rung of the pass ladder. */
const DIFFICULTY = {
  easy:   { label: 'Easy',   tiers: ['easy'],            says: 'Only the easy ones. He misses the ones you would.',  p: { easy: .80, normal: .55, hard: .30, extreme: .12 } },
  medium: { label: 'Medium', tiers: ['easy', 'normal'],  says: 'Easy and normal questions. About as good as your mates.', p: { easy: .90, normal: .70, hard: .45, extreme: .25 } },
  hard:   { label: 'Hard',   tiers: ['normal', 'hard'],  says: 'Normal and hard questions. He knows the ones nobody knows.', p: { easy: .95, normal: .85, hard: .65, extreme: .40 } },
  expert: { label: 'Expert', tiers: ['hard', 'extreme'], says: 'Hard and extreme questions only. For the three of us on a good night.', p: { easy: .97, normal: .90, hard: .75, extreme: .50 } }
};
/* the question tiers for one rung of the ladder, inside the chosen band */
function bandFor(t){
  const band = (DIFFICULTY[(M && M.diff) || 'medium'] || DIFFICULTY.medium).tiers;
  if(band.length < 2) return band;
  return t === 'easy' ? [band[0]] : t === 'normal' ? band : [band[band.length - 1]];
}
const AI = DIFFICULTY;
const LENS = {
  first3: { label: 'First to 3', qpp: 0 },
  short: { label: '3 short periods', qpp: 4 },
  normal: { label: '3 periods', qpp: 6 },
  long: { label: '3 long periods', qpp: 10 }
};
const PERIOD_SAYS = ['1st', '2nd', '3rd'];

let M = null;                         /* the match */
let tokN = 0;                         /* bumped whenever the screen goes, so stale timers do nothing */
let RK = null;                        /* the rink, or null without WebGL */

/* ---------------- setup ---------------- */
function loadSetup(){
  const C = window.PUCK_CONFIG || {}, names = C.DEMO_PLAYERS || ['Martijn', 'Felix', 'Ale'];
  let s = {}; try { s = JSON.parse(localStorage.getItem(FO)) || {}; } catch(e){}
  const def = { vs: 'friend', diff: 'medium', len: 'normal', shots: 3,
    p: [{ name: names[0], team: 'MTL', number: 14 }, { name: names[1], team: 'EDM', number: 97 }] };
  const out = { ...def, ...s };
  if(!out.p || out.p.length < 2) out.p = def.p;
  if(![3, 5].includes(out.shots)) out.shots = 3;
  if(!LENS[out.len]) out.len = 'normal';
  if(!DIFFICULTY[out.diff]) out.diff = DIFFICULTY[out.level] ? out.level : 'medium';
  return out;
}
const saveSetup = s => { try { localStorage.setItem(FO, JSON.stringify(s)); } catch(e){} };
const kitOf = t => (P.KITS || {})[t] || {};
const teamColor = t => kitOf(t).b || P.team(t).c1;
const nick = t => P.team(t).name.split(' ').pop();
const poss = n => n + (/s$/i.test(n) ? '\'' : '\'s');
const seg = (attr, items, cur) => '<div class="fo-seg">' + items.map(([k, lab]) => '<button type="button" class="' + (String(k) === String(cur) ? 'on' : '') + '" data-' + attr + '="' + k + '">' + esc(lab) + '</button>').join('') + '</div>';

/* the match is a full-screen stage on <body>, outside the app shell's column; it goes when the screen does */
function stageOff(){ const el = document.getElementById('fo'); if(el) el.remove(); document.body.classList.remove('fo-on'); }
function setup(){
  stageOff();
  const s = loadSetup(), C = window.PUCK_CONFIG || {}, names = C.DEMO_PLAYERS || ['Martijn', 'Felix', 'Ale'];
  const cpu = s.vs === 'cpu';
  const lineup = (t, withC) => { const r = (P.ROSTERS || {})[t]; return r ? r.filter(x => withC || x[0] !== 'C').map(x => esc(x[2])).join(' · ') : ''; };
  const who = (i) => {
    const p = s.p[i], isCpu = i === 1 && cpu;
    return '<div class="fo-card fo-who" data-i="' + i + '" style="--tc:' + teamColor(p.team) + '">' +
      '<div class="fo-who-top">' + U.logoImg(p.team, 56, true) + '<div class="fo-who-txt"><span class="fo-k">' + (i ? (isCpu ? 'The computer' : 'Player 2') : 'Player 1') + '</span>' +
      '<div class="fo-name">' + esc(isCpu ? 'Computer · ' + DIFFICULTY[s.diff].label : p.name) + '</div><span class="fo-team">' + esc(P.team(p.team).name) + (isCpu ? '' : ' · centre, #' + p.number) + '</span>' +
      '<span class="fo-line">' + lineup(p.team, isCpu) + '</span></div></div>' +
      (isCpu ? '' : '<div class="fo-row">' + seg('name', names.map(n => [n, n]), p.name) +
          '<label class="fo-num"><span>#</span><input id="num' + i + '" type="number" min="0" max="99" value="' + p.number + '" inputmode="numeric" aria-label="Your number"></label></div>') +
      '<details class="fo-teams"><summary>Change team</summary><div class="teams">' +
      P.TEAMS.map(t => '<button type="button" class="tbtn' + (t.abbr === p.team ? ' on' : '') + '" data-team="' + t.abbr + '"' + (t.abbr === s.p[1 - i].team ? ' disabled' : '') + '>' + U.logoImg(t.abbr, 40) + t.abbr + '</button>').join('') + '</div></details></div>';
  };
  U.app.innerHTML = U.band('Faceoff', 'One on One · on ice', '#home') + '<div class="wrap stack fo fo-setup">' +
    '<div class="fo-card fo-kitroom"><div class="fo-kit" id="kit"></div><div class="fo-kit-bar"><span class="fo-k" id="kitsay">Your sweater</span><button type="button" class="fo-mini" id="kitturn">Turn him round</button></div></div>' +
    '<div class="fo-vs"><span style="--tc:' + teamColor(s.p[0].team) + '">' + U.logoImg(s.p[0].team, 64, true) + '</span><b>VS</b><span style="--tc:' + teamColor(s.p[1].team) + '">' + U.logoImg(s.p[1].team, 64, true) + '</span></div>' +
    who(0) +
    '<div class="fo-card"><span class="fo-k">Against</span>' + seg('vs', [['friend', 'A friend, same phone'], ['cpu', 'The computer']], s.vs) + '</div>' +
    who(1) +
    '<div class="fo-card"><span class="fo-k">Difficulty</span>' + seg('diff', Object.keys(DIFFICULTY).map(k => [k, DIFFICULTY[k].label]), s.diff) + '<p class="fo-p">' + esc(DIFFICULTY[s.diff].says) + '</p>' +
    '<span class="fo-k">How long</span>' + seg('len', Object.keys(LENS).map(k => [k, LENS[k].label]), s.len) +
    '<span class="fo-k">Shootout if it\'s level</span>' + seg('shots', [[3, '3 shooters each'], [5, '5 shooters each']], s.shots) + '</div>' +
    '<div class="fo-card fo-how"><span class="fo-k">How it works</span><ol>' +
      '<li><b>Pass:</b> tap a team-mate, answer right and he has it. Wrong, and they pick it off.</li>' +
      '<li><b>Look around:</b> drag the rink or tap <i>Top</i>. A <em>marked</em> man is a rung harder than an open one.</li>' +
      '<li><b>Shoot</b> in their zone: <i>snipe</i> (pick a spot, the goalie covers one blind) or <i>rip it</i> (a rung easier, but he covers two). A pad save leaves a <b>rebound</b>: the goalie\'s side answers to clear it.</li>' +
      '<li><b>Breakaway:</b> a stretch pass to an open man into their zone, and the shot is an easy one. A pass across the slot sets up a <b>one-timer</b>.</li>' +
      '<li><b>Forecheck:</b> after two soft passes the other side may go for the puck. Right steals it; wrong is a hook and a <b>power play</b>.</li>' +
      '<li><b>Heater:</b> three right in a row and your next question is a 50-50.</li></ol></div>' +
    '<button type="button" class="fo-go" id="start"><span class="ab a">A</span>Drop the puck</button></div>';
  /* the sweater room: your man turning on the ice */
  RK = P.rink.get();
  let ang = 0;
  if(RK){
    RK.mount(document.getElementById('kit'));
    U.onLeave(() => RK.unmount());
    const me = s.p[0], opp = s.p[1];
    RK.showcase({ team: me.team, name: me.name, number: me.number, shoots: 'L' }, { team: opp.team, ...goalieOf(opp.team) });
    const turnBtn = document.getElementById('kitturn');
    turnBtn.addEventListener('click', () => { ang = ang ? 0 : Math.PI; RK.showcase(null, null, ang); document.getElementById('kitsay').textContent = ang ? 'The crest' : 'Your sweater'; });
  } else document.getElementById('kit').innerHTML = '<p class="note">This browser can\'t draw the 3D rink.</p>';
  const persist = () => saveSetup(s);
  const again = () => { const y = window.scrollY; persist(); setup(); window.scrollTo(0, y); };
  U.$$('.fo-who').forEach(box => {
    const i = +box.dataset.i;
    U.$$('[data-name]', box).forEach(b => b.addEventListener('click', () => { s.p[i].name = b.dataset.name; again(); }));
    U.$$('.tbtn', box).forEach(b => b.addEventListener('click', () => { s.p[i].team = b.dataset.team; again(); }));
    const inp = U.$('input', box); if(inp) inp.addEventListener('change', e => { s.p[i].number = Math.max(0, Math.min(99, parseInt(e.target.value, 10) || 0)); again(); });
  });
  U.$$('[data-diff]').forEach(b => b.addEventListener('click', () => { s.diff = b.dataset.diff; again(); }));
  U.$$('[data-vs]').forEach(b => b.addEventListener('click', () => { s.vs = b.dataset.vs; again(); }));
  U.$$('[data-len]').forEach(b => b.addEventListener('click', () => { s.len = b.dataset.len; again(); }));
  U.$$('[data-shots]').forEach(b => b.addEventListener('click', () => { s.shots = +b.dataset.shots; again(); }));
  U.$('#start').addEventListener('click', () => {
    if(s.vs === 'friend' && s.p[0].name === s.p[1].name) s.p[1].name = (window.PUCK_CONFIG.DEMO_PLAYERS || []).find(n => n !== s.p[0].name) || s.p[1].name + ' 2';
    persist();
    M = newMatch(s);
    play();
  });
}
function goalieOf(abbr){ const r = ((P.ROSTERS || {})[abbr] || []).find(x => x[0] === 'G'); return r ? { name: r[2], number: r[3] } : { name: '', number: 1 }; }

/* ---------------- the match ---------------- */
function lineupOf(abbr, you){
  const rows = (P.ROSTERS || {})[abbr] || [];
  const get = slot => rows.find(x => x[0] === slot);
  return SLOTS.map((slot, i) => {
    if(i === 3 && you) return { label: you.name, back: you.name, num: you.number, shoots: 'L', you: true };
    const r = get(slot);
    return r ? { label: r[2], back: r[2], num: r[3], shoots: r[4] } : { label: slot, back: '', num: [30, 4, 5, 19, 11, 7][i], shoots: 'L' };
  });
}
function newMatch(s){
  const cpu = s.vs === 'cpu';
  const p = [
    { name: s.p[0].name, team: s.p[0].team, number: s.p[0].number, ai: null },
    cpu ? { name: nick(s.p[1].team), team: s.p[1].team, number: null, ai: s.diff }
        : { name: s.p[1].name, team: s.p[1].team, number: s.p[1].number, ai: null }
  ];
  const men = p.map(x => lineupOf(x.team, x.ai ? null : x));
  return {
    live: true, p, men, diff: s.diff, len: s.len, qpp: LENS[s.len].qpp, shots: s.shots,
    score: [0, 0], period: 1, q: 0, qIn: 0,
    att: 0, zone: 'F', at: 3, safe: 0, phase: 'start', taker: 0, cov: null, brk: false, oneT: false,
    st: [0, 1].map(() => ({ passes: 0, lost: 0, shots: 0, saves: 0, steals: 0, pp: 0 })), wall: [0, 0], goals: [], so: null, end: null,
    streak: [0, 0], hot: [false, false], pp: null
  };
}
const RM = () => (RK && RK.match) || STUB;
const STUB = { teams(){}, place(){}, pass: () => wait(500), faceoff(){}, drop: () => wait(500), aim(){}, endShot(){}, toGoalie(){}, celebrate: () => wait(900), select(){}, unselect(){}, target(){}, hats(){}, score(){}, view(){}, controls(){}, box(){}, scramble(){}, putBack: () => wait(700), replay: () => Promise.resolve(), att: 0 };
const manName = (w, i) => M.men[w][i].label;

/* ---------------- who is marked ----------------
   Each time a side gets the puck somewhere new, the other side picks up two of
   its men (one in its own end; nobody on a breakaway) and sends the next man
   at the puck. A marked man costs a rung more, and if the pass misses it is his
   marker who has it. Done in the attacking side's frame. */
const toAtt = q => [-q[0], 54.26 - q[1]];
/* is side w's man i in the penalty box? */
const boxed = (w, i) => !!(M && M.pp && M.pp.box.w === w && M.pp.box.i === i);
function cover(){
  const zone = M.zone, sh = SHAPES[zone], here = sh[M.at];
  const recv = [1, 2, 3, 4, 5].filter(b => b !== M.at && !boxed(M.att, b));
  let n = M.brk ? 0 : zone === 'D' ? 1 : 2;
  if(M.pp && M.pp.w === M.att) n = Math.min(n, 1);
  const pool = recv.map(b => ({ b, w: 1 + Math.max(0, here[1] - sh[b][1])/5 }));
  const marked = [];
  for(let k = 0; k < n && pool.length; k++){
    let r = Math.random()*pool.reduce((a, o) => a + o.w, 0), j = 0;
    for(; j < pool.length - 1; j++){ r -= pool[j].w; if(r <= 0) break; }
    marked.push(pool.splice(j, 1)[0].b);
  }
  const live5 = [1, 2, 3, 4, 5].filter(i => !boxed(1 - M.att, i));
  const defs = live5.map(i => ({ i, p: toAtt(DEF[zone][i]) })), free = new Set(live5), marks = {};
  for(const b of marked){
    let best = null, bd = 1e9;
    for(const d of defs) if(free.has(d.i)){ const dd = Math.hypot(d.p[0] - sh[b][0], d.p[1] - sh[b][1]); if(dd < bd){ bd = dd; best = d.i; } }
    if(best != null){ marks[b] = best; free.delete(best); }
  }
  let press = null, pd = 1e9;
  if(M.at > 0 && !M.brk) for(const d of defs) if(free.has(d.i)){ const dd = Math.hypot(d.p[0] - here[0], d.p[1] - here[1]); if(dd < pd){ pd = dd; press = d.i; } }
  M.cov = { marks, press };
}
/* where defender i stands, in the attacking side's frame */
function defSpot(i){
  const c = M.cov || { marks: {}, press: null }, sh = SHAPES[M.zone];
  for(const b of Object.keys(c.marks)) if(c.marks[b] === i){ const q = sh[b]; return [q[0]*.8, q[1] - 1.25]; }
  if(c.press === i){ const q = sh[M.at]; return [q[0]*.85, q[1] - 2.3]; }
  return toAtt(DEF[M.zone][i]);
}
const markedBy = b => M.cov && M.cov.marks[b] != null ? M.cov.marks[b] : null;
function passTier(b){ const t = tierFor(M.zone, M.at, b); return markedBy(b) != null ? up(t) : t; }
const advances = b => b >= 3 && SHAPES[M.zone][M.at][1] - SHAPES[M.zone][b][1] > 2 && M.zone !== 'O';
const tagInfo = () => {
  const o = {};
  for(let b = 1; b < 6; b++) if(b !== M.at && !boxed(M.att, b)){
    const t = passTier(b), by = markedBy(b), brk = M.zone === 'N' && advances(b) && t === 'extreme' && by == null;
    o[b] = { tier: t, say: TIERS[t].say, marked: by != null, by, hot: brk || advances(b), note: by != null ? 'Marked' : brk ? 'Breakaway' : 'Open' };
  }
  return o;
};
const canShoot = () => M.zone === 'O' && M.at > 0;
const shotTier = () => M.brk ? 'easy' : M.oneT ? down(SHOT_AT[M.at]) : SHOT_AT[M.at];
const shotSays = () => M.brk ? 'on the breakaway' : M.oneT ? 'on the one-timer' : SHOT_SAYS[SHOT_AT[M.at]];
/* a little life in the shapes: nobody stands on the same blade of ice twice */
const jit = () => (Math.random() - .5)*1.1;
function sides(){
  return [0, 1].map(w => {
    if(M.zone === 'F') return SHAPES.F.map((p, i) => i ? { x: p[0], z: p[1] } : null);
    if(w === M.att) return SHAPES[M.zone].map((p, i) => i === 0 ? null : { x: p[0] + jit(), z: p[1] + jit()*.8, fast: true });
    const c = M.cov || { marks: {}, press: null }, here = SHAPES[M.zone][M.at];
    return [0, 1, 2, 3, 4, 5].map(i => {
      if(!i) return null;
      /* a breakaway: they are all behind him, chasing */
      if(M.brk){ const a = [here[0]*.4 + (i - 3)*2.4, here[1] + 5 + Math.random()*5]; return { x: -a[0], z: 54.26 - a[1], fast: true }; }
      const a = defSpot(i), mk = Object.keys(c.marks).find(b => c.marks[b] === i);
      return { x: -a[0] + jit()*.4, z: 54.26 - a[1] + jit()*.4, fast: true, mark: mk != null ? +mk : undefined, press: c.press === i };
    });
  });
}
function placeAll(instant){
  if(M.zone !== 'F') cover();
  RM().box(M.pp ? M.pp.box : null);
  RM().place({ att: M.att, sides: sides(), carrier: M.zone === 'F' ? null : { w: M.att, i: M.at }, instant: !!instant });
}
/* which of theirs cuts the pass out: his marker, else the one nearest the lane 60 per cent of the way */
function interceptor(b){
  const by = markedBy(b); if(by != null) return by;
  const a = SHAPES[M.zone][M.at], r = SHAPES[M.zone][b];
  const px = a[0] + (r[0] - a[0])*.6, pz = a[1] + (r[1] - a[1])*.6;
  let best = 3, bd = 1e9;
  for(let i = 1; i < 6; i++){ if(boxed(1 - M.att, i)) continue; const q = defSpot(i), d = Math.hypot(q[0] - px, q[1] - pz); if(d < bd){ bd = d; best = i; } }
  return best;
}

/* ---------------- the screen ---------------- */
async function render(){
  U = P.ui;
  if(M && M.live) return play();
  await applyFavourite();
  return setup();
}
/* your favourite team (picked on Me) becomes Player 1's team, once per change of
   favourite, so you start in your own jersey but can still swap for a match */
async function applyFavourite(){
  let me = null;
  try { me = P.store && await P.store.me(); } catch(e){}
  const fav = me && me.team;
  if(!fav || !P.team(fav) || !P.team(fav).c1) return;
  const s = loadSetup();
  if(s.favSeen === fav) return;
  s.favSeen = fav;
  s.p[0].team = fav;
  const names = (window.PUCK_CONFIG || {}).DEMO_PLAYERS || [];
  const mine = names.find(n => me.name && me.name.toLowerCase().startsWith(n.toLowerCase()));
  if(mine) s.p[0].name = mine;
  if(s.p[1].team === fav) s.p[1].team = fav === 'EDM' ? 'MTL' : 'EDM';
  saveSetup(s);
}
const SND_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const SND_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
function play(){
  const tok = ++tokN;
  stageOff();
  U.app.innerHTML = '';
  const host = document.createElement('div');
  document.body.appendChild(host);
  host.outerHTML = '<div class="fo fo-play" id="fo">' +
    '<div class="fo-rink" id="rinkbox"></div>' +
    '<header class="fo-hud" id="hud"><a class="fo-back" href="#home" aria-label="Leave the match">&#8249;</a><div class="fo-board" id="board"></div>' +
    '<button type="button" class="fo-snd" id="snd" aria-label="Sound on or off"></button></header>' +
    '<div class="fo-banner" id="toast" aria-live="polite"></div>' +
    '<div class="fo-hint" id="hint" hidden><b>Look around</b> drag the rink · pinch to zoom · <i>Top</i> for the whole ice</div>' +
    '<div class="fo-dock" id="dock"><div class="fo-call" id="call" aria-live="polite"></div><div class="fo-q" id="qc" hidden></div></div>' +
    '<button type="button" class="fo-skip" id="skip" hidden>Tap to skip <i>&#8250;&#8250;</i></button>' +
    '<div class="fo-over" id="after" hidden></div>' +
    '<div class="fo-hand" id="hand" hidden></div></div>';
  RK = P.rink.get();
  const box = U.$('#rinkbox');
  if(RK){ RK.mount(box); U.onLeave(() => RK.unmount()); }
  else box.innerHTML = '<p class="note fo-nogl">This browser can\'t draw the 3D rink, so the match plays out in words.</p>';
  U.onLeave(() => { tokN++; skipOn = false; if(RK){ RM().unselect(); RK.onLook = RK.onHit = RK.onPass = RK.onCatch = null; } stageOff(); });
  document.body.classList.add('fo-on');
  /* the HUD covers the top and bottom of the rink: tell the camera, so the play sits in the middle of what is left */
  const hud = U.$('#hud'), dock = U.$('#dock'), stage = U.$('#fo');
  const fit = () => {
    if(!stage.isConnected) return;
    const S = stage.getBoundingClientRect(), top = hud.getBoundingClientRect().bottom - S.top, bot = S.bottom - dock.getBoundingClientRect().top;
    stage.style.setProperty('--hudH', Math.round(top) + 'px'); stage.style.setProperty('--dockH', Math.round(bot) + 'px');
    if(RK) RK.insets(top, bot);
  };
  /* watching, not playing (the shot, the goal, the replay): a tap anywhere on the ice speeds it on */
  stage.addEventListener('click', e => {
    if(!skipOn || e.target.closest('a,.fo-q,.fo-call,.fo-over,.fo-hand,.fo-hud,.camui,.tag,.spot')) return;
    if(RK && RK.skip) RK.skip();
  });
  if(window.ResizeObserver){ const ro = new ResizeObserver(fit); ro.observe(hud); ro.observe(dock); ro.observe(stage); U.onLeave(() => ro.disconnect()); }
  fit();
  /* sound */
  const snd = U.$('#snd'), sndPaint = () => { const on = !P.sfx || P.sfx.on; snd.innerHTML = on ? SND_ON : SND_OFF; snd.classList.toggle('off', !on); };
  sndPaint(); snd.addEventListener('click', () => { if(P.sfx){ P.sfx.on = !P.sfx.on; sndPaint(); } });
  if(RK){
    RK.onLook = () => hint(false);
    RK.onPass = () => sfx('pass');
    RK.onCatch = ok => sfx(ok ? 'catch' : 'steal');
    RK.onHit = scored => { sfx(scored ? 'horn' : 'save'); buzz(scored ? [40, 60, 90] : 25); };
  }
  RM().teams([0, 1].map(w => ({ abbr: M.p[w].team, color: teamColor(M.p[w].team), men: M.men[w] })));
  board();
  /* back in after leaving: pick the match up where it stood */
  if(M.phase === 'final'){ M.zone = 'F'; placeAll(true); return final(tok); }
  if(M.phase === 'so'){ M.zone = 'F'; placeAll(true); return shootoutNext(tok); }
  if(M.phase === 'start' || M.phase === 'faceoff'){ M.zone = 'F'; placeAll(true); return faceoff(tok, M.taker); }
  if(M.phase === 'break'){ M.zone = 'F'; placeAll(true); return intermission(tok); }
  placeAll(true); turn(tok);
}
const live = tok => tok === tokN && M && document.getElementById('call');
let skipOn = false;
function skippable(on){ skipOn = !!on && !!RK; const el = document.getElementById('skip'); if(el) el.hidden = !skipOn; }
let lastScore = null;
function board(){
  const el = document.getElementById('board'); if(!el) return;
  const per = M.phase === 'final' ? 'Final' : M.so ? 'Shootout' : M.qpp ? PERIOD_SAYS[Math.min(2, M.period - 1)] : 'First to 3';
  const clk = M.so && M.phase !== 'final' ? M.so.kicks[0].filter(Boolean).length + '–' + M.so.kicks[1].filter(Boolean).length : M.qpp && M.phase !== 'final' ? clockSays() : '';
  const bump = lastScore ? [0, 1].map(w => M.score[w] !== lastScore[w]) : [false, false];
  lastScore = M.score.slice();
  const has = w => M.att === w && !M.so && M.zone !== 'F' && M.phase !== 'final';
  const side = w => '<div class="sb-tm' + (w ? ' r' : '') + (has(w) ? ' has' : '') + '" style="--tc:' + teamColor(M.p[w].team) + '">' + U.logoImg(M.p[w].team, 34, true) +
    '<span class="sb-ab">' + esc(M.p[w].team) + '<small>' + esc(M.p[w].name) + '</small></span><i class="sb-puck" aria-hidden="true"></i>' +
    (M.so ? '' : '<i class="sb-heat' + (M.hot[w] ? ' on' : '') + '" title="' + (M.hot[w] ? 'On a heater: next question is a 50-50' : M.streak[w] + ' right in a row') + '">' + [0, 1, 2].map(k => '<i class="' + (M.hot[w] || k < M.streak[w] ? 'f' : '') + '"></i>').join('') + '</i>') + '</div>';
  const sc = w => '<b class="sb-sc' + (w ? ' r' : '') + (bump[w] ? ' bump' : '') + '" style="--tc:' + teamColor(M.p[w].team) + '">' + M.score[w] + '</b>';
  const so = M.so ? '<div class="sb-so">' + [0, 1].map(w => '<span>' + Array.from({ length: Math.max(M.shots, M.so.kicks[w].length) }, (_, k) => { const x = M.so.kicks[w][k]; return '<i class="' + (x === true ? 'g' : x === false ? 'm' : '') + '"></i>'; }).join('') + '</span>').join('') + '</div>' : '';
  el.innerHTML = '<div class="sb">' + side(0) + sc(0) + '<div class="sb-mid"><span class="sb-per">' + esc(per) + '</span>' + (clk ? '<span class="sb-clk">' + esc(clk) + '</span>' : '') +
    (M.pp && M.phase !== 'final' && !M.so ? '<span class="sb-pp" style="--tc:' + teamColor(M.p[M.pp.w].team) + '" title="' + esc(M.p[M.pp.w].team) + ' power play">' + (M.pp.w ? '' : '&#9664; ') + 'PP <b>' + ppLeft() + '</b>' + (M.pp.w ? ' &#9654;' : '') + '</span>' : '<span class="sb-dif">' + esc((DIFFICULTY[M.diff] || DIFFICULTY.medium).label) + '</span>') + '</div>' + sc(1) + side(1) + '</div>' + so;
  RM().score({ a: { abbr: M.p[0].team, color: teamColor(M.p[0].team), score: M.score[0] }, b: { abbr: M.p[1].team, color: teamColor(M.p[1].team), score: M.score[1] }, clock: (per + (clk ? '  ' + clk : '')).toUpperCase() });
}
function ppLeft(){ const s = Math.max(0, Math.round((M.pp.until - M.q)/PP_QS*120)); return Math.floor(s/60) + ':' + String(s % 60).padStart(2, '0'); }
function clockSays(){
  const left = M.qpp - (M.q - (M.period - 1)*M.qpp), mins = Math.max(0, Math.round(left*20/M.qpp));
  return mins + ':00';
}
function call(html, w){
  const el = document.getElementById('call'); if(!el) return;
  el.style.setProperty('--tc', w != null ? teamColor(M.p[w].team) : '#3d6fae');
  el.innerHTML = html;
  el.hidden = !html;
}
/* banners across the rink: kind info | good | bad | big (the ember ones, for the moments) */
let toastT = 0;
function toast(title, sub, kind, w){
  const t = document.getElementById('toast'); if(!t) return;
  t.className = 'fo-banner ' + (kind || 'info');
  t.style.setProperty('--tc', w != null ? teamColor(M.p[w].team) : '#3d6fae');
  t.innerHTML = '<b>' + esc(title) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '');
  void t.offsetWidth; t.classList.add('on');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), kind === 'big' ? 2300 : 1900);
}
let hintT = 0;
function hint(on){
  const h = document.getElementById('hint'); if(!h) return;
  if(on){
    if(!h.hidden) return;
    let n = 0; try { n = +localStorage.getItem('puck.faceoff.look') || 0; } catch(e){}
    if(n >= 3) return;
    try { localStorage.setItem('puck.faceoff.look', n + 1); } catch(e){}
    h.hidden = false; clearTimeout(hintT); hintT = setTimeout(() => { h.hidden = true; }, 6500);
  } else if(!h.hidden){ h.hidden = true; try { localStorage.setItem('puck.faceoff.look', 9); } catch(e){} }
}
/* while a question is up the call bar steps aside */
const asking = on => { const el = document.querySelector('.fo-play'); if(el) el.classList.toggle('asking', on); const c = document.getElementById('call'); if(c && on) c.hidden = true; };
const whoSays = w => '<span class="fo-who-c">' + U.logoImg(M.p[w].team, 28, true) + '<b>' + esc(M.p[w].name) + '</b></span>';

/* ---------------- a question ----------------
   Resolves true or false. The computer reads it too, and answers with BALL's odds. */
async function getQ(t){
  /* the rung's tiers, else the whole band, else whatever the bank has (Expert has no extreme rows yet) */
  const band = (DIFFICULTY[(M && M.diff) || 'medium'] || DIFFICULTY.medium).tiers;
  for(const tiers of [bandFor(t), band, ['hard', 'normal'], null]){
    try { const q = await P.questions.next(tiers ? { tiers } : {}); if(q && q.options) return q; } catch(e){}
  }
  return null;
}
const KEYS = ['a', 'b', 'x', 'y'];
function ask(tok, w, t, head, o = {}){
  return new Promise(async res => {
    const qc = document.getElementById('qc'); if(!qc) return;
    skippable(false);
    const q = await getQ(t);
    if(!live(tok)) return;
    M.q++; board();
    const ai = M.p[w].ai;
    if(!q){ qc.hidden = false; qc.innerHTML = '<p class="err">No questions found. Is _bank/questions/nhl.jsonl there?</p>'; await wait(1200); qc.hidden = true; return res(Math.random() < .5); }
    const secs = o.secs || TIERS[t].secs;
    /* on a heater: two wrong answers struck off */
    const heat = M.hot[w] && !M.so, gone = heat ? [0, 1, 2, 3].filter(i => i !== q.answer).sort(() => Math.random() - .5).slice(0, 2) : [];
    if(heat){ M.hot[w] = false; M.streak[w] = 0; board(); }
    asking(true);
    qc.hidden = false; qc.className = 'fo-q' + (ai ? ' cpu' : '');
    qc.style.setProperty('--tc', teamColor(M.p[w].team));
    qc.innerHTML = '<div class="fo-qhead">' + whoSays(w) + '<span class="fo-what">' + esc(head) + '</span>' + (heat ? '<span class="fo-5050">50-50</span>' : '') + '<span class="tierchip t-' + t + '">' + TIERS[t].say + '</span></div>' +
      '<div class="fo-timer"><i id="tm"></i><span id="tsec">' + secs + '</span></div><p class="fo-qq">' + esc(q.q) + '</p><div class="fo-opts">' +
      q.options.map((op, i) => '<button type="button" class="opt' + (gone.includes(i) ? ' gone' : '') + '" data-i="' + i + '"' + (ai || gone.includes(i) ? ' disabled' : '') + '><span class="ab ' + KEYS[i] + '">' + KEYS[i].toUpperCase() + '</span><span class="ot">' + esc(op) + '</span></button>').join('') + '</div>' +
      (ai ? '<p class="fo-think"><i></i><i></i><i></i>The computer is thinking</p>' : '') + '<p class="fo-sub" id="sub" hidden></p>';
    const bar = document.getElementById('tm'), secEl = document.getElementById('tsec');
    bar.style.transition = 'transform ' + secs + 's linear'; requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transform = 'scaleX(0)'; }));
    const t0 = Date.now();
    const tickI = setInterval(() => {
      const left = Math.max(0, Math.ceil(secs - (Date.now() - t0)/1000));
      if(secEl && secEl.textContent !== String(left)){ secEl.textContent = left; if(left <= 3 && left > 0 && !ai){ qc.classList.add('late'); sfx('tick'); } }
    }, 200);
    let done = false, skip = null;
    const answer = async (i) => {
      if(done || !live(tok)) return; done = true; clearTimeout(timer); clearTimeout(aiT); clearInterval(tickI); document.removeEventListener('keydown', onKey);
      bar.style.transition = 'none';
      const ok = i === q.answer;
      U.$$('.opt', qc).forEach((b, j) => { b.disabled = true; if(j === q.answer) b.classList.add('right'); else if(j === i) b.classList.add('wrong'); if(j === i) b.classList.add('chosen'); });
      qc.classList.remove('late'); qc.classList.add(ok ? 'is-right' : 'is-wrong');
      const think = qc.querySelector('.fo-think'); if(think) think.remove();
      /* the streak: three right in a row and the next one is a 50-50 */
      let heated = false;
      if(M.so){ /* the shootout is a clean duel: no heaters */ }
      else if(ok){ M.streak[w]++; if(M.streak[w] >= HEAT_AT && !M.hot[w]){ M.hot[w] = true; heated = true; sfx('heat'); } }
      else { M.streak[w] = 0; M.hot[w] = false; }
      board();
      const sub = document.getElementById('sub'); sub.hidden = false;
      sub.innerHTML = '<b>' + (i < 0 ? 'Time\'s up.' : ok ? 'Right!' : 'Not quite.') + '</b> ' + esc(q.sub || '') +
        (heated ? '<span class="fo-heated">On a heater: ' + esc(M.p[w].name) + '\'s next question is a 50-50</span>' : '') + '<small>Tap to go on</small>';
      sfx(ok ? 'right' : 'wrong'); if(!ai) buzz(ok ? 18 : [30, 50, 30]);
      /* a moment to read it; a tap on the card goes on straight away */
      await new Promise(r => { skip = r; setTimeout(r, (ok ? 950 : 1350) + Math.min(900, (q.sub || '').length*9)); });
      if(!live(tok)) return;
      qc.hidden = true; asking(false);
      res(ok);
    };
    qc.onclick = e => { if(done && skip && !e.target.closest('.opt:not([disabled])')){ const s2 = skip; skip = null; s2(); } };
    const onKey = e => { if(ai || done) return; const k = e.key.toLowerCase(), i = KEYS.indexOf(k) >= 0 ? KEYS.indexOf(k) : ['1', '2', '3', '4'].indexOf(k); if(i >= 0 && !gone.includes(i)){ e.preventDefault(); answer(i); } };
    if(!ai) document.addEventListener('keydown', onKey);
    const timer = setTimeout(() => answer(-1), secs*1000);
    let aiT = 0;
    U.onLeave(() => { clearTimeout(timer); clearTimeout(aiT); clearInterval(tickI); document.removeEventListener('keydown', onKey); });
    if(ai){
      const p0 = AI[ai].p[t] || .5, right = Math.random() < (heat ? p0 + (1 - p0)*.5 : p0);
      const wrong = [0, 1, 2, 3].filter(i => i !== q.answer && !gone.includes(i));
      const len = (q.q + q.options.join('')).length;
      aiT = setTimeout(() => answer(right ? q.answer : pick(wrong)), Math.min(3400, 1000 + len*11 + Math.random()*600));
    } else U.$$('.opt', qc).forEach(b => b.addEventListener('click', () => { if(!b.classList.contains('gone')) answer(+b.dataset.i); }));
  });
}
/* the phone goes across the table (two humans only): the screen in his colours */
function handOver(tok, w, line){
  return new Promise(res => {
    const el = document.getElementById('hand'); if(!el) return;
    el.style.setProperty('--tc', teamColor(M.p[w].team));
    el.innerHTML = '<div class="fo-hand-in">' + U.logoImg(M.p[w].team, 96, true) + '<p class="fo-k">Pass the phone to</p><h2>' + esc(M.p[w].name) + '</h2><p class="fo-p">' + esc(line) + '</p>' +
      '<button type="button" class="fo-go" id="handgo"><span class="ab a">A</span>I\'m ' + esc(M.p[w].name) + '</button></div>';
    el.hidden = false;
    document.getElementById('handgo').addEventListener('click', () => { el.hidden = true; if(live(tok)) res(); });
  });
}
/* a spot on the net, tapped on the 3D net (or picked for the computer) */
function pickSpot(tok, w, line, taken = []){
  const keys = SPOT_KEYS.filter(k => !taken.includes(k));
  if(M.p[w].ai || !RK) return wait(700).then(() => pick(keys));
  return new Promise(res => {
    call(whoSays(w) + '<span class="fo-say">' + line + '</span>', w);
    RK.pick(k => { if(taken.includes(k)) return; RK.hold(); sfx('catch'); if(live(tok)) res(k); }, taken);
  });
}
/* the goalie covers one spot, or two against a quick shot */
async function cover2(tok, d, keeper, n){
  if(M.p[d].ai){
    call(whoSays(d) + '<span class="fo-say"><b>' + esc(keeper) + '</b> sets himself…</span>', d);
    await wait(700);
    return SPOT_KEYS.slice().sort(() => Math.random() - .5).slice(0, n);
  }
  const a = await pickSpot(tok, d, 'You\'re <b>' + esc(keeper) + '</b>. ' + (n > 1 ? 'A quick shot: cover <b>two</b> spots. The first?' : 'Where do you go?'));
  if(n < 2 || !live(tok)) return [a];
  const b = await pickSpot(tok, d, 'And your <b>second</b> spot?', [a]);
  return [a, b];
}

/* ---------------- faceoff ---------------- */
async function faceoff(tok, taker){
  /* a faceoff with no time left to play the puck is no faceoff: the period ends first */
  if(M.qpp && M.q + 1 >= M.qpp*M.period) return periodEnd(tok);
  M.phase = 'faceoff'; M.taker = taker; M.zone = 'F'; M.safe = 0; M.brk = M.oneT = false; M.cov = null;
  placeAll(false);
  RM().faceoff();
  board();
  const c = M.men[taker][3].label;
  call(whoSays(taker) + '<span class="fo-say">Faceoff at centre ice. <b>' + esc(c) + '</b> takes the draw: answer it right to win it.</span>', taker);
  sfx('whistle');
  await wait(800);
  if(!live(tok)) return;
  const ok = await ask(tok, taker, 'normal', 'Faceoff');
  if(!live(tok)) return;
  const win = ok ? taker : 1 - taker;
  await RM().drop(win);
  if(!live(tok)) return;
  toast(M.men[win][3].label + ' wins it', 'Back to ' + M.men[win][1].label, 'info', win);
  M.att = win; M.zone = 'N'; M.at = 1; M.phase = 'turn';
  placeAll(false);
  await wait(win === RM().att ? 350 : 1000);
  turn(tok);
}

/* ---------------- a turn with the puck ---------------- */
async function turn(tok){
  if(!live(tok)) return;
  M.phase = 'turn';
  if(M.qpp && M.q >= M.qpp*M.period) return periodEnd(tok);
  if(M.pp && M.q >= M.pp.until) endPP('Back to full strength', M.p[1 - M.pp.w].name + '\'s ' + nick(M.p[1 - M.pp.w].team) + ' killed it off');
  board();
  const w = M.att, me = M.p[w], info = tagInfo();
  const where = M.at === 0 ? 'in his crease' : ZONE_SAYS[M.zone];
  const holder = M.men[w][M.at].label;
  if(me.ai){
    call(whoSays(w) + '<span class="fo-say"><b>' + esc(holder) + '</b> has it ' + where + '.</span><span class="fo-dots"><i></i><i></i><i></i></span>', w);
    await wait(650 + Math.random()*450);
    if(!live(tok)) return;
    return aiAct(tok, info);
  }
  const press = M.safe >= PRESS_AT && !(M.pp && M.pp.w === w), st = canShoot() ? shotTier() : null;
  /* the shot menu: a breakaway or a one-timer is one shot; otherwise pick your spot, or a quick one */
  const menu = st && !M.brk && !M.oneT, qt = st ? down(st) : null;
  const opens = Object.keys(info).filter(b => !info[b].marked).map(b => M.men[w][b].label);
  const pp = M.pp ? (M.pp.w === w ? ' <span class="fo-ppsay">Power play: they can only mark one man.</span>' : ' <span class="fo-ppsay sh">Shorthanded: ' + esc(M.men[w][M.pp.box.i].label) + ' is in the box.</span>') : '';
  call(whoSays(w) + '<span class="fo-zone">' + ZONE_TAG[M.zone] + '</span><span class="fo-say"><b>' + esc(holder) + '</b> has it' + (st && menu ? ' ' + esc(shotSays()) : '') + '. Tap a team-mate to pass' + (st ? ', or shoot' : '') + '.' +
    (opens.length && !st ? ' <span class="fo-open">Open: ' + opens.map(esc).join(', ') + '</span>' : '') + pp +
    (press ? ' <em>Careful: another soft pass and ' + esc(M.p[1 - w].name) + ' can forecheck.</em>' : '') + '</span>' +
    '<div class="fo-acts">' + (st ? '<button type="button" class="fo-shoot' + (M.brk || M.oneT ? ' hot' : '') + '" id="shoot"><span class="ab y">Y</span><span>' + (menu ? 'Snipe' : 'Shoot') + ' <small>' + esc(menu ? 'he covers 1 spot' : shotSays()) + '</small></span><span class="tierchip t-' + st + '">' + TIERS[st].say + '</span></button>' : '') +
    (menu ? '<button type="button" class="fo-shoot fo-quick" id="quick"><span class="ab x">X</span><span>Rip it <small>he covers 2 · rebounds</small></span><span class="tierchip t-' + qt + '">' + TIERS[qt].say + '</span></button>' : '') +
    (!RK ? Object.keys(info).map(b => '<button type="button" class="fo-passbtn" data-pass="' + b + '">' + esc(manName(w, b)) + ' <span class="tierchip t-' + info[b].tier + '">' + info[b].say + '</span></button>').join('') : '') + '</div>', w);
  RM().select(info, b => { RM().unselect(); passTo(tok, +b); });
  hint(true);
  const sh = document.getElementById('shoot');
  if(sh){
    const onY = e => { const k = e.key.toLowerCase(); if((k === 'y' || (k === 'x' && menu)) && live(tok) && document.getElementById('shoot')){ e.preventDefault(); go(k === 'x'); } };
    const go = quick => { document.removeEventListener('keydown', onY); RM().unselect(); shoot(tok, quick); };
    sh.addEventListener('click', () => go(false));
    const qb = document.getElementById('quick'); if(qb) qb.addEventListener('click', () => go(true));
    document.addEventListener('keydown', onY); U.onLeave(() => document.removeEventListener('keydown', onY));
    RM().select(info, b => { document.removeEventListener('keydown', onY); RM().unselect(); passTo(tok, +b); });
  }
  U.$$('[data-pass]').forEach(b => b.addEventListener('click', () => passTo(tok, +b.dataset.pass)));
}
/* the computer with the puck: shoot from a good place, else move it forward to an open man, mostly */
function aiAct(tok, info){
  const lv = AI[M.p[M.att].ai].p;
  if(canShoot()){
    const st = shotTier(), go = M.brk ? .97 : st === 'easy' ? .95 : st === 'normal' ? .88 : st === 'hard' ? .5 : .12;
    if(Math.random() < go) return shoot(tok, !M.brk && !M.oneT && (st === 'hard' || st === 'extreme') && Math.random() < .6);
  }
  const here = SHAPES[M.zone][M.at];
  const opts = Object.keys(info).map(b => {
    const t = info[b].tier, to = SHAPES[M.zone][b], fwd = here[1] - to[1];
    let wgt = (fwd > 2 ? 6 : fwd < -2 ? .35 : 1.2)*Math.pow(lv[t], 2);
    if(info[b].marked) wgt *= .55;
    if(M.safe >= PRESS_AT && (t === 'easy' || t === 'normal')) wgt *= .4;
    if(M.lastFrom === +b) wgt *= .25;
    return { b: +b, wgt };
  });
  let r = Math.random()*opts.reduce((a, o) => a + o.wgt, 0);
  for(const o of opts){ r -= o.wgt; if(r <= 0) return passTo(tok, o.b); }
  return passTo(tok, opts[0].b);
}
/* the defender's call: go for the puck (a steal, or a penalty) or sit back and let the pass be */
function forecheckCall(tok, d, w, b){
  if(M.p[d].ai) return wait(350).then(() => Math.random() < (M.zone === 'D' ? .7 : .5));
  return new Promise(res => {
    sfx('tick');
    call(whoSays(d) + '<span class="fo-say"><b>' + esc(M.p[d].name) + ', forecheck?</b> ' + esc(M.p[w].name) + ' keeps it soft. Go for it: a right answer steals it, a wrong one is a hook, two minutes and a power play. Or sit back and let ' + esc(M.p[w].name) + ' answer for the pass.</span>' +
      '<div class="fo-acts"><button type="button" class="fo-shoot fo-fc" data-choice="go"><span class="ab a">A</span><span>Go for it <small>steal or penalty</small></span></button>' +
      '<button type="button" class="fo-shoot fo-quick" data-choice="sit"><span class="ab b">B</span><span>Sit back <small>let him pass</small></span></button></div>', d);
    const done = v => { document.removeEventListener('keydown', onK); if(live(tok)) res(v); };
    const onK = e => { const k = e.key.toLowerCase(); if(k === 'a' || k === 'b'){ e.preventDefault(); done(k === 'a'); } };
    document.addEventListener('keydown', onK); U.onLeave(() => document.removeEventListener('keydown', onK));
    U.$$('[data-choice]').forEach(x => x.addEventListener('click', () => done(x.dataset.choice === 'go')));
  });
}
function endPP(title, sub){
  if(!M.pp) return;
  M.pp = null; RM().box(null);
  if(title) toast(title, sub || '', 'info');
  board();
}
const hintAway = () => { const h = document.getElementById('hint'); if(h) h.hidden = true; };
async function passTo(tok, b){
  if(!live(tok)) return;
  hintAway();
  const w = M.att, t = passTier(b), soft = t === 'easy' || t === 'normal';
  RM().target({ w, i: b });
  if(soft && M.safe >= PRESS_AT && !(M.pp && M.pp.w === w)){
    /* the forecheck: the other side may go for it. He answers first: right, and he takes it;
       wrong, and he hooks you on the way past: two minutes, a power play */
    const d = 1 - w, c = M.cov || {}, fc = c.press != null ? c.press : 4;
    const goFor = await forecheckCall(tok, d, w, b);
    if(!live(tok)) return;
    if(!goFor) M.safe = 0;
    if(goFor){
      call(whoSays(d) + '<span class="fo-say"><b>Forecheck!</b> ' + esc(M.men[d][fc].label) + ' comes for it. Right steals the puck; wrong is a hook and two minutes.</span>', d);
      toast('Forecheck', M.p[d].name + ' comes for it', 'bad', d);
      sfx('steal');
      await wait(450);
      const stole = await ask(tok, d, 'normal', 'Forecheck · steal it or take a penalty');
      if(!live(tok)) return;
      if(stole){ M.st[d].steals++; return lose(tok, b, 'Stolen', 'on the forecheck'); }
      /* the hook: the forechecker (a forward; a defenceman sends a winger) goes to the box */
      const bi = fc >= 4 ? fc : (Math.random() < .5 ? 4 : 5);
      if(M.pp){
        /* they were on the power play themselves: a penalty each way, back to five on five */
        endPP('Offsetting minors', 'Back to five on five');
        sfx('whistle');
        await wait(900);
        if(!live(tok)) return;
        return complete(tok, b, t);
      }
      M.pp = { w, box: { w: d, i: bi }, until: M.q + PP_QS };
      M.st[w].pp++;
      sfx('whistle'); buzz([30, 40, 30]);
      toast('Hooking!', M.men[d][bi].label + ' · 2 minutes · ' + poss(M.p[w].name) + ' power play', 'big', w);
      board();
      await wait(700);
      if(!live(tok)) return;
      return complete(tok, b, t);
    }
  }
  const by = markedBy(b);
  call(whoSays(w) + '<span class="fo-say">' + PASS_SAYS[t] + ' to <b>' + esc(M.men[w][b].label) + '</b>' + (by != null ? ', marked by ' + esc(M.men[1 - w][by].label) : '') + '.</span>', w);
  const ok = await ask(tok, w, t, PASS_SAYS[t] + ' to ' + M.men[w][b].label);
  if(!live(tok)) return;
  if(ok) complete(tok, b, t); else lose(tok, b);
}
async function complete(tok, b, t){
  const w = M.att, from = M.at, before = M.zone, A0 = SHAPES[before][from], B0 = SHAPES[before][b], wasOpen = markedBy(b) == null;
  await RM().pass({ from: { w, i: from }, to: { w, i: b }, ok: true, tier: t });
  if(!live(tok)) return;
  const fwd = A0[1] - B0[1];
  if(b >= 3 && fwd > 2) M.zone = NEXT_ZONE[M.zone];
  M.safe = (t === 'easy' || t === 'normal') ? M.safe + 1 : 0;
  M.lastFrom = from; M.at = b; M.st[w].passes++;
  /* the moments: in alone off a long one, or set up for a one-timer */
  M.brk = before === 'N' && M.zone === 'O' && t === 'extreme' && wasOpen;
  M.oneT = !M.brk && before === 'O' && b >= 3 && (A0[0]*B0[0] < 0 || from <= 2);
  placeAll(false);
  if(M.brk){ toast('Breakaway!', M.men[w][b].label + ' is in alone: the shot is an easy one', 'big', w); sfx('big'); buzz(30); }
  else if(M.oneT){ toast('One-timer', 'Shoot now: the question is a rung easier', 'big', w); sfx('big'); }
  else if(M.zone !== before) toast(M.zone === 'O' ? 'Into their zone' : 'Up the ice', M.men[w][b].label + ' carries it in', 'good', w);
  await wait(M.zone !== before ? 650 : 320);
  turn(tok);
}
async function lose(tok, b, title, sub){
  const w = M.att, d = 1 - w, by = interceptor(b);
  M.st[w].lost++;
  await RM().pass({ from: { w, i: M.at }, to: { w, i: b }, ok: false, by: { w: d, i: by } });
  if(!live(tok)) return;
  toast(title || 'Picked off', (sub ? sub + ' · ' : '') + 'by ' + M.men[d][by].label + ' · ' + poss(M.p[d].name) + ' puck', 'bad', d);
  buzz(40);
  M.att = d; M.zone = LOST_ZONE[M.zone]; M.at = by; M.safe = 0; M.lastFrom = null; M.brk = M.oneT = false;
  placeAll(false);
  board();
  await wait(1050);
  turn(tok);
}

/* ---------------- the shot ---------------- */
async function shoot(tok, quick){
  if(!live(tok)) return;
  hintAway();
  const w = M.att, d = 1 - w, kind = M.brk ? 'brk' : M.oneT ? 'one' : '';
  quick = !!quick && !kind;
  const t = quick ? down(shotTier()) : shotTier(), says = quick ? 'quick shot ' + SHOT_SAYS[SHOT_AT[M.at]] : shotSays();
  const shooter = M.men[w][M.at].label, keeper = M.men[d][0].label, shooterAt = M.at, onPP = !!(M.pp && M.pp.w === w);
  M.st[w].shots++;
  call(whoSays(w) + '<span class="fo-say"><b>' + esc(shooter) + '</b> ' + (quick ? 'lets a quick one go ' + esc(SHOT_SAYS[SHOT_AT[M.at]]) : 'shoots ' + esc(says)) + '.</span>', w);
  const ok = await ask(tok, w, t, 'Shot ' + says);
  if(!live(tok)) return;
  RM().aim(w, M.at, { kind });
  M.brk = M.oneT = false;
  await wait(500);
  if(!live(tok)) return;
  let spot, cov;
  if(!ok){
    spot = pick(SPOT_KEYS); cov = [spot];
    call(whoSays(w) + '<span class="fo-say">Not cleanly struck: <b>' + esc(keeper) + '</b> reads it all the way.</span>', w);
  } else {
    spot = await pickSpot(tok, w, 'Pick your spot on <b>' + esc(keeper) + '</b>.' + (quick ? ' He gets to cover two.' : ''));
    if(!live(tok)) return;
    const both = !M.p[w].ai && !M.p[d].ai;
    if(both){ await handOver(tok, d, M.p[w].name + ' has picked a spot. You\'re in goal: ' + (quick ? 'it\'s a quick shot, so cover two spots blind.' : 'pick one blind.') + ' The same spot and it\'s saved.'); if(!live(tok)) return; }
    cov = await cover2(tok, d, keeper, quick ? 2 : 1);
    if(!live(tok)) return;
  }
  const scored = ok && !cov.includes(spot), guess = scored ? cov[0] : spot, S = (RK && RK.SPOTS) || {};
  call(whoSays(w) + '<span class="fo-say"><b>' + esc(shooter) + '</b> on ' + esc(keeper) + '…</span>', w);
  sfx('shot');
  skippable(true);
  if(RK) await RK.shoot({ spot, scored, guess, cover: cov }); else await wait(900);
  skippable(false);
  if(!live(tok)) return;
  const said = k => (S[k] && S[k].n || k).toLowerCase();
  if(scored){
    RM().endShot();
    return goal(tok, w, shooterAt, { kind: kind || (quick ? 'quick' : ''), pp: onPP, replay: true,
      line: '<b>Scores!</b> ' + esc(said(spot)) + ', ' + esc(keeper) + ' went ' + cov.map(said).map(esc).join(' and ') + '.' });
  }
  RM().endShot();
  M.st[d].saves++; M.wall[d]++;
  /* off the pads (or a quick one he can't hold): a rebound, loose in the crease */
  if(ok && reboundOff(spot, quick)) return rebound(tok, w, shooterAt, spot, onPP);
  call(whoSays(d) + '<span class="fo-say"><b>' + (ok ? 'Saved!' : 'Easy save.') + '</b> ' + (ok ? 'You went ' + esc(said(spot)) + ', ' + esc(keeper) + (spot === 'gh' ? ' gloves it.' : ' gets the blocker on it, out to the corner.') : esc(keeper) + ' had it all the way.') + ' ' + esc(poss(M.p[d].name)) + ' puck.</span>', d);
  if(M.wall[d] >= 3) toast(M.wall[d] === 3 ? 'Brick wall' : M.wall[d] + ' in a row', keeper + ' has stopped the last ' + M.wall[d], 'big', d);
  else toast(ok ? 'Save!' : 'Easy save', keeper + ' · ' + poss(M.p[d].name) + ' puck', 'info', d);
  M.att = d; M.zone = 'D'; M.at = 0; M.safe = 0; M.lastFrom = null;
  placeAll(false);
  board();
  await wait(900);
  turn(tok);
}
/* the rebound: the side in goal has to clear it (its player holds the phone after the blind pick) */
async function rebound(tok, w, shooterAt, spot, onPP){
  const d = 1 - w, keeper = M.men[d][0].label;
  const who = shooterAt === 3 ? (Math.random() < .5 ? 4 : 5) : 3, man = M.men[w][who].label;
  const dm = Math.random() < .5 ? 1 : 2;
  RM().scramble(w, who, dm);
  toast('Rebound!', keeper + ' can\'t hold it · ' + man + ' is crashing the net', 'big', w);
  sfx('big'); buzz([20, 30, 20]);
  call(whoSays(d) + '<span class="fo-say"><b>Rebound!</b> ' + esc(M.p[d].name) + ', clear it: right and ' + esc(M.men[d][dm].label) + ' sweeps it away, wrong and <b>' + esc(man) + '</b> buries it.</span>', d);
  await wait(900);
  if(!live(tok)) return;
  const cleared = await ask(tok, d, 'normal', 'Rebound · clear it', { secs: 10 });
  if(!live(tok)) return;
  skippable(true);
  await RM().putBack({ w, i: who, scored: !cleared, d, dm });
  skippable(false);
  if(!live(tok)) return;
  if(!cleared) return goal(tok, w, who, { kind: 'reb', pp: onPP, line: '<b>Scores on the rebound!</b> ' + esc(man) + ' was first to it.' });
  M.st[d].steals++;
  toast('Cleared', M.men[d][dm].label + ' · ' + poss(M.p[d].name) + ' puck', 'good', d);
  M.att = d; M.zone = 'D'; M.at = dm; M.safe = 0; M.lastFrom = null;
  placeAll(false);
  board();
  await wait(700);
  turn(tok);
}
/* a goal: the lights, the scorer, the replay, then back to centre (or the end, first to 3) */
const KIND_SAYS = { brk: 'Breakaway', one: 'One-timer', reb: 'Rebound', quick: 'Quick shot' };
async function goal(tok, w, at, o){
  const d = 1 - w, name = M.men[w][at].label;
  M.score[w]++; M.wall[d] = 0;
  M.goals.push({ w, name, period: M.period, so: false, kind: o.kind || '', pp: !!o.pp });
  if(o.pp) endPP();
  board();
  const n = M.goals.filter(g => !g.so && g.w === w && g.name === name).length;
  call(whoSays(w) + '<span class="fo-say">' + o.line + ' ' + M.score[0] + '–' + M.score[1] + '.</span>', w);
  skippable(true);
  const cele = RM().celebrate(w, at);
  const tag = [o.pp ? 'Power-play goal' : '', KIND_SAYS[o.kind] || ''].filter(Boolean).join(' · ');
  if(n === 3){ RM().hats(); toast('Hat trick!', name + ' · the hats are coming down', 'big', w); sfx('big'); }
  else toast(o.pp ? 'Power-play goal!' : 'Goal!', name + ' (' + M.p[w].name + ')' + (tag && !o.pp ? ' · ' + tag : ''), 'big', w);
  await cele;
  if(!live(tok)) return;
  /* the replay, from the other end, slowed down: tap to skip it */
  if(o.replay && RK && !reduced()){ sfx('swoosh'); await RM().replay(); if(!live(tok)) return; }
  skippable(false);
  if(!M.qpp && M.score[w] >= 3) return endMatch(tok);
  return faceoff(tok, d);
}

/* ---------------- the clock ---------------- */
function periodEnd(tok){
  M.period++;
  if(M.period > 3){
    if(M.score[0] === M.score[1]) return shootoutStart(tok);
    return endMatch(tok);
  }
  M.phase = 'break';
  intermission(tok);
}
function intermission(tok){
  board();
  RM().unselect();
  call('');
  sfx('whistle');
  const el = document.getElementById('after'); if(!el) return;
  const row = (lab, k) => '<tr><td>' + M.st[0][k] + '</td><th>' + lab + '</th><td>' + M.st[1][k] + '</td></tr>';
  el.innerHTML = '<div class="fo-panel fo-int"><span class="fo-k">End of the ' + PERIOD_SAYS[M.period - 2] + '</span>' +
    '<div class="fo-bigsc">' + U.logoImg(M.p[0].team, 52, true) + '<b>' + M.score[0] + '<i>–</i>' + M.score[1] + '</b>' + U.logoImg(M.p[1].team, 52, true) + '</div>' +
    '<table class="fo-stats"><tbody>' + row('Shots', 'shots') + row('Saves', 'saves') + row('Passes', 'passes') + '</tbody></table>' +
    '<button type="button" class="fo-go" id="nextp"><span class="ab a">A</span>Start the ' + PERIOD_SAYS[M.period - 1] + '</button></div>';
  el.hidden = false;
  document.getElementById('nextp').addEventListener('click', () => { el.hidden = true; el.innerHTML = ''; faceoff(tok, (M.period + 1) % 2); });
}

/* ---------------- the shootout: the duel we already had ---------------- */
function shootoutStart(tok){
  M.so = { first: Math.random() < .5 ? 0 : 1, kicks: [[], []], n: 0 };
  M.phase = 'so';
  toast('Shootout!', 'Level after three · ' + M.shots + ' shooters each', 'big');
  sfx('whistle');
  shootoutNext(tok);
}
function soDecided(){
  const so = M.so, a = so.kicks[0], b = so.kicks[1], n = M.shots, ga = a.filter(Boolean).length, gb = b.filter(Boolean).length;
  if(a.length <= n && b.length <= n){
    if(ga > gb + (n - b.length)) return 0; if(gb > ga + (n - a.length)) return 1;
    if(a.length === n && b.length === n) return ga === gb ? null : ga > gb ? 0 : 1;
    return null;
  }
  if(a.length === b.length) return ga === gb ? null : ga > gb ? 0 : 1;
  return null;
}
async function shootoutNext(tok){
  if(!live(tok)) return;
  board();
  const win = soDecided();
  if(win != null){ M.score[win]++; M.end = 'SO'; return endMatch(tok); }
  const so = M.so, w = (so.first + so.n) % 2, d = 1 - w;
  const order = [3, 5, 4], slot = order[Math.floor(so.n/2) % 3], man = M.men[w][slot], keeper = M.men[d][0];
  if(RK) RK.shootout({ team: M.p[w].team, name: man.back, number: man.num, shoots: man.shoots }, { team: M.p[d].team, name: keeper.back, number: keeper.num });
  const sudden = so.kicks[w].length >= M.shots;
  const keys = ['gh', 'bh', 'fh', 'lg', 'lb'];
  if(M.p[w].ai) call(whoSays(w) + '<span class="fo-say"><b>' + esc(man.label) + '</b> shoots on ' + esc(keeper.label) + (sudden ? ' · sudden death' : '') + '.</span>', w);
  const spot = await pickSpot(tok, w, esc(man.label + ' shoots on ' + keeper.label + (sudden ? ' · sudden death' : '') + '. Pick a spot, then answer: right and the goalie bites.'));
  if(!live(tok)) return;
  const ok = await ask(tok, w, 'normal', 'Shootout' + (sudden ? ' · sudden death' : ''));
  if(!live(tok)) return;
  const others = keys.filter(k => k !== spot);
  sfx('shot');
  skippable(true);
  if(RK) await RK.shoot({ spot, scored: ok, guess: ok ? pick(others) : spot }); else await wait(800);
  skippable(false);
  if(!live(tok)) return;
  so.kicks[w].push(ok); so.n++;
  if(ok) M.goals.push({ w, name: man.label, so: true });
  toast(ok ? 'Scores' : 'Stopped', man.label + ' · ' + so.kicks[w].filter(Boolean).length + ' of ' + so.kicks[w].length, ok ? 'good' : 'bad', w);
  shootoutNext(tok);
}

/* ---------------- the end ---------------- */
function endMatch(tok){
  M.phase = 'final'; M.live = true;
  final(tok);
}
function final(tok){
  if(!live(tok)) return;
  board();
  RM().unselect();
  call('');
  const w = M.score[0] > M.score[1] ? 0 : 1, W = M.p[w], L = M.p[1 - w];
  if(RM().goalieWin) RM().goalieWin(W.team);
  /* the scoring summary: every goal in order, the score after it, how it went in */
  const summary = () => {
    const run = [0, 0], gs = M.goals.filter(g => !g.so);
    if(!gs.length) return '<p class="fo-scorers">No goals in regulation' + (M.end === 'SO' ? ': settled in the shootout.' : '.') + '</p>';
    return '<ol class="fo-sum">' + gs.map(g => { run[g.w]++; return '<li style="--tc:' + teamColor(M.p[g.w].team) + '">' + U.logoImg(M.p[g.w].team, 22, true) +
      '<span class="fo-sum-n"><b>' + esc(g.name) + '</b>' + (g.period && M.qpp ? '<small>' + PERIOD_SAYS[g.period - 1] + '</small>' : '') + '</span>' +
      (g.pp ? '<i class="fo-chip pp">PP</i>' : '') + (KIND_SAYS[g.kind] ? '<i class="fo-chip">' + KIND_SAYS[g.kind] + '</i>' : '') +
      '<span class="fo-sum-s">' + run[0] + '–' + run[1] + '</span></li>'; }).join('') + '</ol>';
  };
  const st = M.st;
  const row = (lab, k) => '<tr><td>' + st[0][k] + '</td><th>' + lab + '</th><td>' + st[1][k] + '</td></tr>';
  /* three stars: the scorers first, then the busier goalie, then whoever stole the most */
  const tally = {};
  M.goals.filter(g => !g.so).forEach(g => { const k = g.w + '|' + g.name; tally[k] = (tally[k] || 0) + 1; });
  const stars = Object.keys(tally).sort((a, b) => tally[b] - tally[a]).slice(0, 2).map(k => { const i = k.indexOf('|'); return { w: +k.slice(0, i), name: k.slice(i + 1), line: tally[k] >= 3 ? 'Hat trick' : tally[k] + (tally[k] === 1 ? ' goal' : ' goals') }; });
  const gw = st[0].saves >= st[1].saves ? 0 : 1;
  if(st[gw].saves) stars.push({ w: gw, name: M.men[gw][0].label, line: st[gw].saves + (st[gw].saves === 1 ? ' save' : ' saves') });
  const stealer = st[0].steals >= st[1].steals ? 0 : 1;
  if(stars.length < 3 && st[stealer].steals) stars.push({ w: stealer, name: M.men[stealer][3].label, line: st[stealer].steals + (st[stealer].steals === 1 ? ' steal' : ' steals') });
  const el = document.getElementById('after'); if(!el) return;
  el.innerHTML = '<div class="fo-panel fo-final" style="--tc:' + teamColor(W.team) + '"><span class="fo-k">Final' + (M.end === 'SO' ? ' · shootout' : '') + '</span>' +
    '<div class="fo-bigsc">' + U.logoImg(M.p[0].team, 56, true) + '<b>' + M.score[0] + '<i>–</i>' + M.score[1] + '</b>' + U.logoImg(M.p[1].team, 56, true) + '</div>' +
    '<h2>' + esc(W.name) + (W.ai ? ' win' : ' wins') + '</h2><p class="fo-p">' + M.score[w] + '–' + M.score[1 - w] + (M.end === 'SO' ? ' in the shootout' : '') + ' against ' + esc(L.name) + '.</p>' +
    (stars.length ? '<ol class="fo-stars">' + stars.map((s, i) => '<li style="--tc:' + teamColor(M.p[s.w].team) + '"><span class="st">' + '★'.repeat(i + 1) + '</span><b>' + esc(s.name) + '</b><small>' + esc(M.p[s.w].team) + ' · ' + esc(s.line) + '</small></li>').join('') + '</ol>' : '') +
    '<table class="fo-stats"><thead><tr><td>' + esc(M.p[0].name) + '</td><th></th><td>' + esc(M.p[1].name) + '</td></tr></thead><tbody>' +
    row('Shots', 'shots') + row('Saves', 'saves') + row('Passes', 'passes') + row('Lost it', 'lost') + row('Steals', 'steals') + row('Power play', 'pp') + '</tbody></table>' +
    summary() +
    '<div class="fo-endbtns"><button type="button" class="fo-go" id="again"><span class="ab a">A</span>Rematch</button><button type="button" class="fo-mini" id="chg">Change teams</button></div></div>';
  el.hidden = false;
  document.getElementById('again').addEventListener('click', () => { const s = loadSetup(); M = newMatch(s); lastScore = null; play(); });
  document.getElementById('chg').addEventListener('click', () => { M = null; lastScore = null; setup(); });
}

P.faceoff = {
  render,
  /* for tests and the curious: the live match */
  get match(){ return M; },
  rules: { DIFFICULTY, bandFor, tierFor, passTier: b => passTier(b), SHAPES, DEF, interceptor: b => interceptor(b), cover: () => cover() }
};
})();
