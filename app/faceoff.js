/* PUCK Faceoff: BALL's One on One, on ice.

   You have the puck. Tap a team-mate and a question comes up: right, and the
   pass goes crisply across the ice to him and he skates on with it; wrong, and
   one of theirs picks it off and they go the other way. Work it up the ice,
   and once you are in their zone you can shoot: answer, pick a spot, and the
   man in goal picks one blind. Same spot, saved. Periods (or first to 3), and
   level at the end goes to the shootout.

   THE RULES LIVE HERE AND ONLY HERE. app/rink3d.js is told what happened and
   only decides how it looks (BALL's "a view, never a driver").

   Two of you on one phone take turns with the puck; the defender gets a say
   twice: the forecheck (three soft passes in a row and he comes for the
   fourth) and the goalie's blind pick. Or play the computer at Easy, Medium
   or Hard, with BALL's own odds. Questions come from PUCK.questions.next(). */
(function(){
const P = window.PUCK = window.PUCK || {};
const FO = 'puck.faceoff';
let U = null;                         /* PUCK.ui, from app.js */
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){ return false; } };
const wait = ms => new Promise(r => setTimeout(r, reduced() ? Math.min(ms, 350) : ms));
const pick = a => a[Math.floor(Math.random()*a.length)];

/* ---------------- the shapes ----------------
   Every position is in that side's own attacking frame, in metres: x across,
   z from the goal it attacks (0) back to its own goal line (54.26). Slots:
   0 G, 1 LD, 2 RD, 3 C, 4 LW, 5 RW. A side attacks in one of three zones:
   D (breaking out of its own end), N (through the neutral zone), O (in theirs). */
const SLOTS = ['G', 'LD', 'RD', 'C', 'LW', 'RW'];
const SLOT_SAYS = { G: 'the goalie', LD: 'the left D', RD: 'the right D', C: 'the centre', LW: 'the left wing', RW: 'the right wing' };
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

/* ---------------- the ladder ----------------
   A pass costs what it covers: how far up the ice, plus a quarter of how far
   across, plus a cross-crease ball through the slot. Backwards is free. */
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
/* three soft ones in a row and the forecheck comes for the fourth */
const PRESS_AT = 3;

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

function setup(){
  const s = loadSetup(), C = window.PUCK_CONFIG || {}, names = C.DEMO_PLAYERS || ['Martijn', 'Felix', 'Ale'];
  const cpu = s.vs === 'cpu';
  const lineup = (t, withC) => { const r = (P.ROSTERS || {})[t]; return r ? r.filter(x => withC || x[0] !== 'C').map(x => esc(x[2])).join(' · ') : ''; };
  const who = (i) => {
    const p = s.p[i], isCpu = i === 1 && cpu;
    return '<div class="card light playerset fo-who" data-i="' + i + '" style="--tc:' + teamColor(p.team) + '">' +
      '<div class="fo-who-top">' + U.logoImg(p.team, 56) + '<div style="flex:1;min-width:0"><span class="label">' + (i ? (isCpu ? 'The computer' : 'Player 2') : 'Player 1') + '</span>' +
      '<div class="fo-name">' + esc(isCpu ? 'Computer · ' + DIFFICULTY[s.diff].label : p.name) + '</div><span class="one">' + esc(P.team(p.team).name) + (isCpu ? '' : ' · you centre the top line, #' + p.number) + '</span>' +
      '<span class="fo-line">' + lineup(p.team, isCpu) + '</span></div></div>' +
      (isCpu ? '<p class="one">Plays at your difficulty: ' + esc(DIFFICULTY[s.diff].label) + '.</p>'
        : '<div class="names">' + names.map(n => '<button type="button" class="chip' + (n === p.name ? ' on' : '') + '" data-name="' + esc(n) + '">' + esc(n) + '</button>').join('') + '</div>' +
          '<div class="field"><label for="num' + i + '">Your number</label><input id="num' + i + '" type="number" min="0" max="99" value="' + p.number + '" inputmode="numeric"></div>') +
      '<details><summary class="label" style="cursor:pointer;padding:6px 0">Change team</summary><div class="teams" style="margin-top:8px">' +
      P.TEAMS.map(t => '<button type="button" class="tbtn' + (t.abbr === p.team ? ' on' : '') + '" data-team="' + t.abbr + '"' + (t.abbr === s.p[1 - i].team ? ' disabled' : '') + '>' + U.logoImg(t.abbr, 44) + t.abbr + '</button>').join('') + '</div></details></div>';
  };
  U.app.innerHTML = U.band('Faceoff', 'One on One · on ice', '#home') + '<div class="wrap stack fo fo-setup">' +
    '<div class="card light fo-kitroom"><div class="fo-kit" id="kit"></div><div class="fo-kit-bar"><span class="label" id="kitsay">Your sweater</span><button type="button" class="ghost" id="kitturn">Turn him round</button></div></div>' +
    who(0) +
    '<div class="card light"><span class="label">Against</span><div class="names" style="margin-top:8px"><button type="button" class="chip' + (!cpu ? ' on' : '') + '" data-vs="friend">A friend, same phone</button><button type="button" class="chip' + (cpu ? ' on' : '') + '" data-vs="cpu">The computer</button></div></div>' +
    who(1) +
    '<div class="card light"><span class="label">Difficulty</span><div class="names" style="margin-top:8px">' + Object.keys(DIFFICULTY).map(k => '<button type="button" class="chip' + (s.diff === k ? ' on' : '') + '" data-diff="' + k + '">' + DIFFICULTY[k].label + '</button>').join('') + '</div><p class="one" style="margin-top:8px">' + esc(DIFFICULTY[s.diff].says) + '</p>' +
    '<span class="label" style="display:block;margin-top:12px">How long</span><div class="names" style="margin-top:8px">' + Object.keys(LENS).map(k => '<button type="button" class="chip' + (s.len === k ? ' on' : '') + '" data-len="' + k + '">' + LENS[k].label + '</button>').join('') + '</div>' +
    '<span class="label" style="display:block;margin-top:12px">Shootout if it\'s level</span><div class="names" style="margin-top:8px">' + [3, 5].map(n => '<button type="button" class="chip' + (s.shots === n ? ' on' : '') + '" data-shots="' + n + '">' + n + ' shooters each</button>').join('') + '</div>' +
    '<p class="one" style="margin-top:10px">Tap a team-mate to pass: right and he has it, wrong and they pick it off. Further up the ice is a harder question. In their zone you can shoot; pick a spot, the goalie picks one blind.</p></div>' +
    '<button type="button" class="pill wide" id="start">Drop the puck</button></div>';
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
  const again = () => { persist(); setup(); };
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
    cpu ? { name: P.team(s.p[1].team).name.split(' ').pop(), team: s.p[1].team, number: null, ai: s.diff }
        : { name: s.p[1].name, team: s.p[1].team, number: s.p[1].number, ai: null }
  ];
  const men = p.map(x => lineupOf(x.team, x.ai ? null : x));
  return {
    live: true, p, men, diff: s.diff, len: s.len, qpp: LENS[s.len].qpp, shots: s.shots,
    score: [0, 0], period: 1, q: 0, qIn: 0,
    att: 0, zone: 'F', at: 3, safe: 0, phase: 'start', taker: 0,
    st: [0, 1].map(() => ({ passes: 0, lost: 0, shots: 0, saves: 0, steals: 0 })), goals: [], so: null, end: null
  };
}
const RM = () => (RK && RK.match) || STUB;
const STUB = { teams(){}, place(){}, pass: () => wait(500), faceoff(){}, drop: () => wait(500), aim(){}, endShot(){}, toGoalie(){}, celebrate: () => wait(900), select(){}, unselect(){}, target(){} };
const manName = (w, i) => M.men[w][i].label;
const tagInfo = () => {
  const o = {};
  for(let b = 1; b < 6; b++) if(b !== M.at){ const t = tierFor(M.zone, M.at, b); o[b] = { tier: t, say: TIERS[t].say }; }
  return o;
};
const canShoot = () => M.zone === 'O' && M.at > 0;
/* a little life in the shapes: nobody stands on the same blade of ice twice */
const jit = () => (Math.random() - .5)*1.1;
function sides(){
  return [0, 1].map(w => {
    const src = M.zone === 'F' ? SHAPES.F : w === M.att ? SHAPES[M.zone] : DEF[M.zone];
    return src.map((p, i) => i === 0 ? null : (M.zone === 'F' ? { x: p[0], z: p[1] } : { x: p[0] + jit(), z: p[1] + jit()*.8, fast: true }));
  });
}
function placeAll(instant){
  RM().place({ att: M.att, sides: sides(), carrier: M.zone === 'F' ? null : { w: M.att, i: M.at }, instant: !!instant });
}
/* which of theirs cuts the pass out: the one nearest the lane, 60 per cent of the way */
function interceptor(b){
  const a = SHAPES[M.zone][M.at], r = SHAPES[M.zone][b];
  const px = a[0] + (r[0] - a[0])*.6, pz = a[1] + (r[1] - a[1])*.6;
  let best = 3, bd = 1e9;
  DEF[M.zone].forEach((q, i) => { if(!i) return; const vx = -q[0], vz = 54.26 - q[1], d = Math.hypot(vx - px, vz - pz); if(d < bd){ bd = d; best = i; } });
  return best;
}

/* ---------------- the screen ---------------- */
function render(){
  U = P.ui;
  if(M && M.live) return play();
  return setup();
}
function play(){
  const tok = ++tokN;
  U.app.innerHTML = '<div class="fo fo-play"><header class="fo-top"><a class="back" href="#home" aria-label="Back">‹</a><h1>Faceoff</h1><span class="fo-sub">One on One</span></header>' +
    '<div class="wrap"><div class="fo-board" id="board"></div><div class="fo-rink" id="rinkbox"></div>' +
    '<div class="fo-call" id="call" aria-live="polite"></div><div class="card qcard fo-q" id="qc" hidden></div><div id="after"></div></div></div>' +
    '<div class="fo-hand" id="hand" hidden></div>';
  RK = P.rink.get();
  const box = U.$('#rinkbox');
  if(RK){ RK.mount(box); U.onLeave(() => RK.unmount()); }
  else box.innerHTML = '<p class="note">This browser can\'t draw the 3D rink, so the match plays out in words.</p>';
  box.insertAdjacentHTML('beforeend', '<div class="fo-toast" id="toast" aria-live="polite"></div>');
  U.onLeave(() => { tokN++; if(RK) RM().unselect(); });
  RM().teams([0, 1].map(w => ({ abbr: M.p[w].team, color: teamColor(M.p[w].team), men: M.men[w] })));
  board();
  /* back in after leaving: pick the match up where it stood */
  if(M.phase === 'final') return final(tok);
  if(M.phase === 'so') return shootoutNext(tok, true);
  if(M.phase === 'start' || M.phase === 'faceoff'){ M.zone = 'F'; placeAll(true); return faceoff(tok, M.taker); }
  if(M.phase === 'break') return intermission(tok);
  placeAll(true); turn(tok);
}
const live = tok => tok === tokN && M && document.getElementById('call');
function board(){
  const el = document.getElementById('board'); if(!el) return;
  const clock = M.so ? 'SHOOTOUT' : M.qpp ? (M.phase === 'final' ? 'FINAL' : PERIOD_SAYS[Math.min(2, M.period - 1)] + ' · ' + clockSays()) : 'FIRST TO 3';
  const side = w => '<div class="tm' + (w ? ' r' : '') + (M.att === w && !M.so && M.zone !== 'F' ? ' has' : '') + '" style="--tc:' + teamColor(M.p[w].team) + '">' + U.logoImg(M.p[w].team, 36, true) +
    '<div><b>' + esc(M.p[w].name) + '</b><small>' + esc(P.team(M.p[w].team).name.split(' ').pop()) + '</small></div></div>';
  const so = M.so ? '<small class="sod">' + M.so.kicks.map(k => k.map(x => x ? '●' : '○').join('')).join(' · ') + '</small>' : '';
  el.innerHTML = side(0) + '<div class="mid"><small>' + clock + '</small><b>' + M.score[0] + '–' + M.score[1] + '</b>' + so + '<small class="diff">' + esc((DIFFICULTY[M.diff] || DIFFICULTY.medium).label) + '</small></div>' + side(1);
}
function clockSays(){
  const left = M.qpp - (M.q - (M.period - 1)*M.qpp), mins = Math.max(0, Math.round(left*20/M.qpp));
  return mins + ':00';
}
function call(html, w){
  const el = document.getElementById('call'); if(!el) return;
  el.style.setProperty('--tc', w != null ? teamColor(M.p[w].team) : '#16283f');
  el.innerHTML = html;
}
let toastT = 0;
function toast(msg){ const t = document.getElementById('toast'); if(!t) return; t.textContent = msg; t.classList.remove('on'); void t.offsetWidth; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3000); }
/* while a question is up the rink steps back, so the whole card fits on a phone */
const asking = on => { const el = document.querySelector('.fo-play'); if(el) el.classList.toggle('asking', on); };
const whoSays = w => '<span class="fo-logo">' + U.logoImg(M.p[w].team, 28, true) + '</span><b>' + esc(M.p[w].name) + '</b>';

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
function ask(tok, w, t, head){
  return new Promise(async res => {
    const qc = document.getElementById('qc'); if(!qc) return;
    const q = await getQ(t);
    if(!live(tok)) return;
    M.q++; board();
    const ai = M.p[w].ai;
    if(!q){ qc.hidden = false; qc.innerHTML = '<p class="err">No questions found. Is _bank/questions/nhl.jsonl there?</p>'; await wait(1200); qc.hidden = true; return res(Math.random() < .5); }
    const secs = TIERS[t].secs;
    asking(true);
    qc.hidden = false;
    qc.style.setProperty('--tc', teamColor(M.p[w].team));
    qc.innerHTML = '<div class="fo-qhead"><span>' + whoSays(w) + ' · ' + esc(head) + '</span><span class="tierchip t-' + t + '">' + TIERS[t].say + '</span></div>' +
      '<div class="timer"><i id="tm"></i></div><p class="q">' + esc(q.q) + '</p><div class="opts">' +
      q.options.map((o, i) => '<button type="button" class="opt" data-i="' + i + '"' + (ai ? ' disabled' : '') + '>' + esc(o) + '</button>').join('') + '</div><p class="one" id="sub" hidden></p>';
    window.scrollTo({ top: 0, behavior: 'auto' });
    const bar = document.getElementById('tm'); bar.style.transition = 'transform ' + secs + 's linear'; requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transform = 'scaleX(0)'; }));
    let done = false;
    const answer = async (i) => {
      if(done || !live(tok)) return; done = true; clearTimeout(timer); clearTimeout(aiT);
      bar.style.transition = 'none';
      const ok = i === q.answer;
      U.$$('.opt', qc).forEach((b, j) => { b.disabled = true; if(j === q.answer) b.classList.add('right'); else if(j === i) b.classList.add('wrong'); if(j === i) b.classList.add('chosen'); });
      const sub = document.getElementById('sub'); sub.hidden = false; sub.textContent = (i < 0 ? 'Time\'s up. ' : ok ? 'Right. ' : 'Not quite. ') + (q.sub || '');
      await wait(ok ? 1100 : 1500);
      if(!live(tok)) return;
      qc.hidden = true; asking(false);
      res(ok);
    };
    const timer = setTimeout(() => answer(-1), secs*1000);
    let aiT = 0;
    U.onLeave(() => { clearTimeout(timer); clearTimeout(aiT); });
    if(ai){
      const right = Math.random() < AI[ai].p[t];
      const wrong = [0, 1, 2, 3].filter(i => i !== q.answer);
      const len = (q.q + q.options.join('')).length;
      aiT = setTimeout(() => answer(right ? q.answer : pick(wrong)), Math.min(4200, 1300 + len*14 + Math.random()*700));
    } else U.$$('.opt', qc).forEach(b => b.addEventListener('click', () => answer(+b.dataset.i)));
  });
}
/* the phone goes across the table (two humans only): the screen in his colours */
function handOver(tok, w, line){
  return new Promise(res => {
    const el = document.getElementById('hand'); if(!el) return;
    el.style.setProperty('--tc', teamColor(M.p[w].team));
    el.innerHTML = '<div class="fo-hand-in">' + U.logoImg(M.p[w].team, 96, true) + '<p class="label">Pass the phone to</p><h2>' + esc(M.p[w].name) + '</h2><p class="one">' + esc(line) + '</p>' +
      '<button type="button" class="pill" id="handgo">I\'m ' + esc(M.p[w].name) + '</button></div>';
    el.hidden = false;
    document.getElementById('handgo').addEventListener('click', () => { el.hidden = true; if(live(tok)) res(); });
  });
}
/* a spot on the net, tapped on the 3D net (or picked for the computer) */
function pickSpot(tok, w, line){
  const keys = ['gh', 'bh', 'fh', 'lg', 'lb'];
  if(M.p[w].ai || !RK) return wait(900).then(() => pick(keys));
  return new Promise(res => {
    call(whoSays(w) + '<span>' + esc(line) + '</span>', w);
    RK.pick(k => { RK.hold(); if(live(tok)) res(k); });
  });
}

/* ---------------- faceoff ---------------- */
async function faceoff(tok, taker){
  /* a faceoff with no time left to play the puck is no faceoff: the period ends first */
  if(M.qpp && M.q + 1 >= M.qpp*M.period) return periodEnd(tok);
  M.phase = 'faceoff'; M.taker = taker; M.zone = 'F'; M.safe = 0;
  placeAll(false);
  RM().faceoff();
  board();
  const c = M.men[taker][3].label;
  call(whoSays(taker) + '<span>Faceoff at centre ice. ' + esc(c) + ' takes the draw: answer it right to win it.</span>', taker);
  await wait(1300);
  if(!live(tok)) return;
  const ok = await ask(tok, taker, 'normal', 'Faceoff');
  if(!live(tok)) return;
  const win = ok ? taker : 1 - taker;
  await RM().drop(win);
  if(!live(tok)) return;
  toast(M.men[win][3].label + ' wins the draw back to ' + M.men[win][1].label + '.');
  M.att = win; M.zone = 'N'; M.at = 1; M.phase = 'turn';
  placeAll(false);
  await wait(win === RM().att ? 600 : 1400);
  turn(tok);
}

/* ---------------- a turn with the puck ---------------- */
async function turn(tok){
  if(!live(tok)) return;
  M.phase = 'turn';
  if(M.qpp && M.q >= M.qpp*M.period) return periodEnd(tok);
  board();
  const w = M.att, me = M.p[w], info = tagInfo();
  const where = M.at === 0 ? 'in his crease' : ZONE_SAYS[M.zone];
  const holder = M.men[w][M.at].label;
  if(me.ai){
    call(whoSays(w) + '<span>' + esc(holder) + ' has it ' + where + '. The computer is thinking…</span>', w);
    await wait(1100 + Math.random()*700);
    if(!live(tok)) return;
    return aiAct(tok, info);
  }
  const press = M.safe >= PRESS_AT;
  call(whoSays(w) + '<span>' + esc(holder) + ' has it ' + where + '. Tap a team-mate to pass' + (canShoot() ? ', or shoot ' + SHOT_SAYS[SHOT_AT[M.at]] : '') + '.' +
    (press ? ' <em>The forecheck is on: a soft pass now gets challenged.</em>' : '') + '</span>' +
    '<div class="fo-acts">' + (canShoot() ? '<button type="button" class="pill" id="shoot">Shoot <small class="tierchip t-' + SHOT_AT[M.at] + '">' + TIERS[SHOT_AT[M.at]].say + '</small></button>' : '') +
    (!RK ? Object.keys(info).map(b => '<button type="button" class="btn2" data-pass="' + b + '">' + esc(manName(w, b)) + ' · ' + info[b].say + '</button>').join('') : '') + '</div>', w);
  RM().select(info, b => { RM().unselect(); passTo(tok, +b); });
  const sh = document.getElementById('shoot'); if(sh) sh.addEventListener('click', () => { RM().unselect(); shoot(tok); });
  U.$$('[data-pass]').forEach(b => b.addEventListener('click', () => passTo(tok, +b.dataset.pass)));
}
/* the computer with the puck: shoot from a good place, else move it forward, mostly */
function aiAct(tok, info){
  const lv = AI[M.p[M.att].ai].p;
  if(canShoot()){
    const st = SHOT_AT[M.at], go = st === 'normal' ? .9 : st === 'hard' ? .55 : .12;
    if(Math.random() < go) return shoot(tok);
  }
  const here = SHAPES[M.zone][M.at];
  const opts = Object.keys(info).map(b => {
    const t = info[b].tier, to = SHAPES[M.zone][b], fwd = here[1] - to[1];
    let wgt = (fwd > 2 ? 6 : fwd < -2 ? .35 : 1.2)*Math.pow(lv[t], 2);
    if(M.safe >= PRESS_AT && (t === 'easy' || t === 'normal')) wgt *= .4;
    if(M.lastFrom === +b) wgt *= .25;
    return { b: +b, wgt };
  });
  let r = Math.random()*opts.reduce((a, o) => a + o.wgt, 0);
  for(const o of opts){ r -= o.wgt; if(r <= 0) return passTo(tok, o.b); }
  return passTo(tok, opts[0].b);
}
async function passTo(tok, b){
  if(!live(tok)) return;
  const w = M.att, t = tierFor(M.zone, M.at, b), soft = t === 'easy' || t === 'normal';
  RM().target({ w, i: b });
  if(soft && M.safe >= PRESS_AT){
    /* the forecheck: he answers first. Right, and he takes it; wrong, and you are through him */
    const d = 1 - w;
    call(whoSays(d) + '<span>Forecheck! ' + esc(M.p[d].name) + ' comes for it. Right answer steals the puck.</span>', d);
    await wait(700);
    const stole = await ask(tok, d, 'normal', 'Forecheck');
    if(!live(tok)) return;
    if(stole){ M.st[d].steals++; return lose(tok, b, 'Stolen on the forecheck'); }
    toast('Missed him. ' + M.men[w][b].label + ' is clear.');
    return complete(tok, b, t);
  }
  call(whoSays(w) + '<span>' + PASS_SAYS[t] + ' to ' + esc(M.men[w][b].label) + '.</span>', w);
  const ok = await ask(tok, w, t, PASS_SAYS[t] + ' to ' + M.men[w][b].label);
  if(!live(tok)) return;
  if(ok) complete(tok, b, t); else lose(tok, b);
}
async function complete(tok, b, t){
  const w = M.att, from = M.at;
  await RM().pass({ from: { w, i: from }, to: { w, i: b }, ok: true });
  if(!live(tok)) return;
  const fwd = SHAPES[M.zone][from][1] - SHAPES[M.zone][b][1];
  const before = M.zone;
  if(b >= 3 && fwd > 2) M.zone = NEXT_ZONE[M.zone];
  M.safe = (t === 'easy' || t === 'normal') ? M.safe + 1 : 0;
  M.lastFrom = from; M.at = b; M.st[w].passes++;
  placeAll(false);
  toast(M.men[w][b].label + (M.zone !== before ? (M.zone === 'O' ? ' carries it into their zone.' : ' takes it up the ice.') : ' has it.'));
  await wait(M.zone !== before ? 1100 : 600);
  turn(tok);
}
async function lose(tok, b, why){
  const w = M.att, d = 1 - w, by = interceptor(b);
  M.st[w].lost++;
  await RM().pass({ from: { w, i: M.at }, to: { w, i: b }, ok: false, by: { w: d, i: by } });
  if(!live(tok)) return;
  toast((why || 'Picked off') + ' by ' + M.men[d][by].label + '. ' + M.p[d].name + '\'s puck.');
  M.att = d; M.zone = LOST_ZONE[M.zone]; M.at = by; M.safe = 0; M.lastFrom = null;
  placeAll(false);
  board();
  await wait(1700);
  turn(tok);
}

/* ---------------- the shot ---------------- */
async function shoot(tok){
  if(!live(tok)) return;
  const w = M.att, d = 1 - w, t = SHOT_AT[M.at], shooter = M.men[w][M.at].label, keeper = M.men[d][0].label;
  M.st[w].shots++;
  call(whoSays(w) + '<span>' + esc(shooter) + ' shoots ' + SHOT_SAYS[t] + '.</span>', w);
  const ok = await ask(tok, w, t, 'Shot ' + SHOT_SAYS[t]);
  if(!live(tok)) return;
  RM().aim(w, M.at);
  await wait(800);
  if(!live(tok)) return;
  const keys = ['gh', 'bh', 'fh', 'lg', 'lb'];
  let spot, guess;
  if(!ok){
    spot = pick(keys); guess = spot;
    call(whoSays(w) + '<span>Not cleanly struck: ' + esc(keeper) + ' reads it all the way.</span>', w);
  } else {
    spot = await pickSpot(tok, w, 'Pick your spot on ' + keeper + '.');
    if(!live(tok)) return;
    const both = !M.p[w].ai && !M.p[d].ai;
    if(both){ await handOver(tok, d, M.p[w].name + ' has picked a spot. You\'re in goal: pick one blind. Same spot and it\'s saved.'); if(!live(tok)) return; }
    if(M.p[d].ai){ call(whoSays(d) + '<span>' + esc(keeper) + ' sets himself…</span>', d); guess = await pickSpot(tok, d, ''); }
    else guess = await pickSpot(tok, d, 'You\'re ' + keeper + '. Where do you go?');
    if(!live(tok)) return;
  }
  const scored = ok && spot !== guess;
  call(whoSays(w) + '<span>' + esc(shooter) + ' on ' + esc(keeper) + '…</span>', w);
  if(RK) await RK.shoot({ spot, scored, guess }); else await wait(900);
  if(!live(tok)) return;
  RM().endShot();
  if(scored){
    M.score[w]++; M.goals.push({ w, name: shooter, period: M.period, so: false });
    board();
    toast('GOAL! ' + shooter + ' (' + M.p[w].name + ')');
    call(whoSays(w) + '<span>Scores! ' + M.score[0] + '–' + M.score[1] + '.</span>', w);
    await RM().celebrate(w, M.at);
    if(!live(tok)) return;
    if(!M.qpp && M.score[w] >= 3) return endMatch(tok);
    return faceoff(tok, d);
  }
  M.st[d].saves++;
  toast((ok ? 'SAVE! ' + keeper + ' guessed right.' : 'Easy save for ' + keeper + '.') + ' ' + M.p[d].name + '\'s puck.');
  M.att = d; M.zone = 'D'; M.at = 0; M.safe = 0; M.lastFrom = null;
  placeAll(false);
  board();
  await wait(1800);
  turn(tok);
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
  call('<b>End of the ' + PERIOD_SAYS[M.period - 2] + '</b><span>' + esc(M.p[0].name) + ' ' + M.score[0] + ', ' + esc(M.p[1].name) + ' ' + M.score[1] + '.</span><div class="fo-acts"><button type="button" class="pill" id="nextp">Start the ' + PERIOD_SAYS[M.period - 1] + '</button></div>');
  document.getElementById('nextp').addEventListener('click', () => faceoff(tok, (M.period + 1) % 2));
}

/* ---------------- the shootout: the duel we already had ---------------- */
function shootoutStart(tok){
  M.so = { first: Math.random() < .5 ? 0 : 1, kicks: [[], []], n: 0 };
  M.phase = 'so';
  toast('Level after three. Shootout!');
  shootoutNext(tok, false);
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
  call(whoSays(w) + '<span>' + esc(man.label) + ' shoots on ' + esc(keeper.label) + (sudden ? ' · sudden death' : '') + '. ' + (M.p[w].ai ? '' : 'Pick a spot, then answer: right and the goalie bites, wrong and he reads you.') + '</span>', w);
  const spot = await pickSpot(tok, w, man.label + ' shoots on ' + keeper.label + (sudden ? ' · sudden death' : '') + '. Pick a spot, then answer: right and the goalie bites.');
  if(!live(tok)) return;
  const ok = await ask(tok, w, 'normal', 'Shootout');
  if(!live(tok)) return;
  const others = keys.filter(k => k !== spot);
  if(RK) await RK.shoot({ spot, scored: ok, guess: ok ? pick(others) : spot }); else await wait(800);
  if(!live(tok)) return;
  so.kicks[w].push(ok); so.n++;
  if(ok) M.goals.push({ w, name: man.label, so: true });
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
  const w = M.score[0] > M.score[1] ? 0 : 1, W = M.p[w], L = M.p[1 - w];
  const scorers = side => M.goals.filter(g => g.w === side && !g.so).map(g => esc(g.name) + (g.period && M.qpp ? ' <small>(' + PERIOD_SAYS[g.period - 1] + ')</small>' : '')).join(', ') || '–';
  const st = M.st;
  const row = (lab, k) => '<tr><td>' + st[0][k] + '</td><th>' + lab + '</th><td>' + st[1][k] + '</td></tr>';
  call('');
  document.getElementById('after').innerHTML = '<div class="card fo-final" style="--tc:' + teamColor(W.team) + '">' + U.logoImg(W.team, 84, true) +
    '<h2>' + esc(W.name) + (W.ai ? ' win' : ' wins') + '</h2><p class="one">' + M.score[w] + '–' + M.score[1 - w] + (M.end === 'SO' ? ' in the shootout' : '') + ' against ' + esc(L.name) + '.</p>' +
    '<table class="fo-stats"><thead><tr><td>' + esc(M.p[0].name) + '</td><th></th><td>' + esc(M.p[1].name) + '</td></tr></thead><tbody>' +
    row('Passes', 'passes') + row('Lost it', 'lost') + row('Shots', 'shots') + row('Saves', 'saves') + row('Steals', 'steals') + '</tbody></table>' +
    '<p class="one fo-scorers"><b>' + esc(M.p[0].name) + ':</b> ' + scorers(0) + '<br><b>' + esc(M.p[1].name) + ':</b> ' + scorers(1) + '</p>' +
    '<button type="button" class="pill" id="again">Rematch</button><button type="button" class="ghost" id="chg">Change teams</button></div>';
  document.getElementById('again').addEventListener('click', () => { const s = loadSetup(); M = newMatch(s); play(); });
  document.getElementById('chg').addEventListener('click', () => { M = null; setup(); });
}

P.faceoff = {
  render,
  /* for tests and the curious: the live match, and a way to jump the clock */
  get match(){ return M; },
  rules: { DIFFICULTY, bandFor, tierFor, SHAPES, DEF, interceptor: b => interceptor(b) }
};
})();
