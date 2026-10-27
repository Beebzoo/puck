/* The Starting Five: a prompt with five ranked answers ("the top 5 goal
   scorers ever"), a rink with five spots. Type a name and he skates out in
   his own sweater. Solo: three misses end the round. Two or three players
   take turns on one phone: two misses and you sit in the box until the next
   round. Data: PUCK.gdata.five (app/games/data.js), every number sourced. */
(function(){
const P = window.PUCK = window.PUCK || {};
/* rank 1 takes centre, then the wings, then the defence pair */
const SLOTS = [{ pos: "C", x: 50, y: 40 }, { pos: "LW", x: 20, y: 46 }, { pos: "RW", x: 80, y: 46 }, { pos: "LD", x: 28, y: 84 }, { pos: "RD", x: 72, y: 84 }];
const UNIT = { goals: ["G", "goals"], points: ["PTS", "points"], assists: ["A", "assists"], wins: ["W", "wins"], GP: ["GP", "games"], PIM: ["PIM", "penalty minutes"] };
const flagOf = cc => cc ? '<img class="flag" src="' + P.flag(cc) + '" alt="' + cc.toUpperCase() + '">' : "";
const teamOfPrompt = pr => { const t = pr.id.split("-")[0].toUpperCase(); return P.TEAMS.some(x => x.abbr === t) ? t : null; };
const surname = n => { const p = String(n).split(" "); return p.length > 1 ? p.slice(1).join(" ") : n; };
const ITEM = (pr, a) => Object.assign({}, a, { kind: pr.kind });

/* ---------- the rink: a half-rink in SVG on a tilted 3D plane ---------- */
let scratches = null;
function iceScratches(){
  if(scratches) return scratches;
  let s = "";
  for(let i = 0; i < 160; i++){
    const x = Math.random()*850, y = Math.random()*900, a = Math.random()*Math.PI, l = 30 + Math.random()*170, bend = (Math.random() - .5)*60;
    s += "M" + x.toFixed(0) + " " + y.toFixed(0) + " q" + (Math.cos(a)*l/2 + bend).toFixed(0) + " " + (Math.sin(a)*l/2 - bend).toFixed(0) + " " + (Math.cos(a)*l).toFixed(0) + " " + (Math.sin(a)*l).toFixed(0);
  }
  return scratches = s;
}
function circle(cx, cy){
  let h = '<circle cx="' + cx + '" cy="' + cy + '" r="150" fill="none" stroke="#c8202a" stroke-width="5"/><circle cx="' + cx + '" cy="' + cy + '" r="12" fill="#c8202a"/>';
  for(const sx of [-1, 1]) for(const sy of [-1, 1]){
    h += '<path d="M' + (cx + sx*20) + " " + (cy + sy*8) + " h" + (sx*30) + " M" + (cx + sx*20) + " " + (cy + sy*8) + " v" + (sy*30) + '" stroke="#c8202a" stroke-width="4" fill="none"/>';
    h += '<path d="M' + (cx + sx*40) + " " + (cy + sy*146) + " v" + (sy*22) + '" stroke="#c8202a" stroke-width="4"/>';
  }
  return h;
}
function rinkSvg(logo){
  const ice = "M280 16 H570 A264 264 0 0 1 834 280 V940 H16 V280 A264 264 0 0 1 280 16Z";
  return '<svg class="s5-ice" viewBox="0 0 850 900" preserveAspectRatio="none" aria-hidden="true"><defs>' +
    '<radialGradient id="s5ig" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset=".6" stop-color="#eef5fa"/><stop offset="1" stop-color="#d4e2ec"/></radialGradient>' +
    '<clipPath id="s5ic"><path d="' + ice + '"/></clipPath>' +
    '<linearGradient id="s5bd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#c9d6df"/></linearGradient></defs>' +
    '<path d="M280 0 H570 A280 280 0 0 1 850 280 V960 H0 V280 A280 280 0 0 1 280 0Z" fill="url(#s5bd)"/>' +
    '<path d="M280 6 H570 A274 274 0 0 1 844 280 V960 H6 V280 A274 274 0 0 1 280 6Z" fill="none" stroke="#F2C230" stroke-width="5"/>' +
    '<path d="' + ice + '" fill="url(#s5ig)"/>' +
    '<g clip-path="url(#s5ic)">' +
      '<path d="' + iceScratches() + '" fill="none" stroke="#8ea7bc" stroke-opacity=".22" stroke-width="1.3"/>' +
      '<rect x="0" y="118" width="850" height="5" fill="#c8202a"/>' +
      '<path d="M365 123 A60 60 0 0 0 485 123Z" fill="#6aa8e8" fill-opacity=".55" stroke="#c8202a" stroke-width="4"/>' +
      '<path d="M395 123 v-6 M455 123 v-6" stroke="#c8202a" stroke-width="4"/>' +
      '<path d="M325 123 L300 16 M525 123 L550 16" stroke="#c8202a" stroke-width="3"/>' +
      circle(205, 330) + circle(645, 330) +
      '<image href="' + logo + '" x="335" y="500" width="180" height="180" opacity=".2" preserveAspectRatio="xMidYMid meet"/>' +
      '<rect x="0" y="770" width="850" height="26" fill="#1F5CC4"/>' +
      '<circle cx="205" cy="850" r="12" fill="#c8202a"/><circle cx="645" cy="850" r="12" fill="#c8202a"/>' +
      '<ellipse cx="425" cy="380" rx="420" ry="300" fill="#fff" opacity=".18"/>' +
    "</g></svg>";
}
function netSvg(){
  return '<svg viewBox="0 0 80 54" aria-hidden="true"><path d="M8 52 V8 Q8 3 13 3 H67 Q72 3 72 8 V52" fill="rgba(255,255,255,.55)" stroke="#d2232a" stroke-width="4"/>' +
    '<path d="M14 8 V50 M22 8 V50 M30 8 V50 M38 8 V50 M46 8 V50 M54 8 V50 M62 8 V50 M12 16 H68 M12 24 H68 M12 32 H68 M12 40 H68" stroke="#9fb2c4" stroke-width=".8"/></svg>';
}
function stage(pr){
  const t = teamOfPrompt(pr), logo = t ? P.logo(t, false) : P.NHL_LOGO(false);
  const ads = ["PUCK", t ? '<img src="' + P.logo(t, true) + '" alt="">' : '<img src="' + P.NHL_LOGO(true) + '" alt="">', "GAME NIGHT", "STARTING FIVE", '<img src="' + P.NHL_LOGO(true) + '" alt="">', "MCJESUS"];
  return '<div class="s5-stage" id="s5-stage"><div class="s5-crowd"></div><div class="s5-lights"><i></i><i></i></div>' +
    '<div class="s5-plane" id="s5-plane">' + rinkSvg(logo) +
      '<div class="s5-wall"><div class="glass"></div><div class="ads">' + ads.map(a => "<span>" + a + "</span>").join("") + "</div></div>" +
      '<div class="s5-net">' + netSvg() + "</div>" +
      SLOTS.map((s, i) => '<div class="s5-mark" style="left:' + s.x + "%;top:" + s.y + '%" data-k="' + i + '"><span>' + (i + 1) + "</span><small>" + s.pos + "</small></div>" +
        '<div class="s5-shadow" style="left:' + s.x + "%;top:" + s.y + '%" data-k="' + i + '"></div>' +
        '<div class="s5-slot" style="left:' + s.x + "%;top:" + s.y + "%;z-index:" + Math.round(s.y) + '" data-k="' + i + '"></div>').join("") +
    "</div>" + '<div class="s5-cap" id="s5-cap" aria-live="polite"></div></div>';
}

/* ---------- a sweater skating out ---------- */
function valueLine(pr, a){
  if(pr.kind === "team") return "";
  if(pr.unit === "year") return /captain/.test(pr.id) ? "C from " + a.value : String(a.value);
  const u = UNIT[pr.unit]; return a.value.toLocaleString("en-US") + " " + (u ? u[0] : pr.unit);
}
function valueLong(pr, a){
  if(pr.kind === "team") return P.team(a.team).name;
  if(pr.unit === "year") return (/captain/.test(pr.id) ? "Captain from " + a.value : a.value) + " · " + P.team(a.team).name;
  const u = UNIT[pr.unit]; return a.value.toLocaleString("en-US") + " " + (u ? u[1] : pr.unit) + " · " + P.team(a.team).name;
}
function sweater(pr, a, ghost){
  const K = P.kit;
  const nm = pr.kind === "team" ? P.team(a.team).name.split(" ").pop() : surname(a.name);
  const num = pr.kind === "team" ? 67 : a.number;
  return '<div class="s5-card' + (ghost ? " ghost" : "") + '"><div class="f back">' + K.jersey(a.team, { side: "back", name: nm, number: num }) + "</div>" +
    '<div class="f front">' + K.jersey(a.team, { side: "front", letter: /captain/.test(pr.id) ? "C" : "" }) + '</div><i class="shine"></i></div>';
}
async function reveal(G, k, by, ghost){
  const K = P.kit, $ = P.ui.$, pr = G.pr, a = pr.answers[k];
  const slot = $('.s5-slot[data-k="' + k + '"]'), mark = $('.s5-mark[data-k="' + k + '"]'), sh = $('.s5-shadow[data-k="' + k + '"]');
  if(!slot) return;
  slot.innerHTML = sweater(pr, a, ghost) + '<div class="s5-tag' + (ghost ? " ghost" : "") + '"' + (by ? ' style="--pc:' + by.col.c + '"' : "") + "><b>" + K.esc(pr.kind === "team" ? P.team(a.team).name.split(" ").pop() : surname(a.name)) + "</b>" +
    (valueLine(pr, a) ? "<small>" + K.esc(valueLine(pr, a)) + "</small>" : "") + "</div>";
  slot.classList.add("on"); mark.classList.add("got"); mark.style.setProperty("--pc", by ? by.col.c : "#6b7c8d"); sh.classList.add("on");
  const card = slot.firstChild, tag = slot.children[1];
  if(K.RM()) return;
  if(ghost){
    card.animate([{ opacity: 0, transform: "translateY(-30px)" }, { opacity: 1, transform: "none" }], { duration: 420, easing: "ease-out", fill: "both" });
    tag.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 250, fill: "both" });
    return;
  }
  card.animate([
    { transform: "translateY(-150%) rotateY(-540deg) scale(.55)", opacity: 0 },
    { transform: "translateY(-150%) rotateY(-540deg) scale(.55)", opacity: 1, offset: .05 },
    { transform: "translateY(4%) rotateY(-15deg) scale(1.06)", offset: .7 },
    { transform: "translateY(0) rotateY(4deg) scale(.99)", offset: .85 },
    { transform: "none" }
  ], { duration: 1150, easing: "cubic-bezier(.22,.8,.3,1)", fill: "both" });
  card.querySelector(".shine").animate([{ transform: "translateX(-120%) skewX(-18deg)", opacity: 1 }, { transform: "translateX(220%) skewX(-18deg)", opacity: 1 }], { duration: 700, delay: 950, easing: "ease-in-out" });
  tag.animate([{ opacity: 0, transform: "translateY(8px) scale(.8)" }, { opacity: 1, transform: "none" }], { duration: 350, delay: 900, easing: "cubic-bezier(.2,1.4,.4,1)", fill: "both" });
  sh.animate([{ opacity: 0, transform: "translate(-50%,-50%) scale(.3)" }, { opacity: 1, transform: "translate(-50%,-50%) scale(1)" }], { duration: 500, delay: 650, fill: "both" });
  setTimeout(() => {
    const r = mark.getBoundingClientRect();
    if(r.width) { K.spray(r.left + r.width/2, r.top + r.height/2, { dir: SLOTS[k].x < 50 ? 1 : -1 }); }
    const st = $("#s5-stage"); if(st){ st.classList.remove("hit"); void st.offsetWidth; st.classList.add("hit"); }
  }, 780);
}
function caption(G, k, by){
  const K = P.kit, cap = P.ui.$("#s5-cap"), pr = G.pr, a = pr.answers[k];
  if(!cap) return;
  const T = P.team(a.team);
  cap.innerHTML = '<div class="in" style="--tc:' + T.c1 + ";--tc2:" + T.c2 + '"><span class="rk">' + (k + 1) + '</span><img src="' + P.logo(a.team, true) + '" alt="">' +
    "<div><b>" + K.esc(pr.kind === "team" ? T.name : a.name) + " " + flagOf(a.cc) + "</b><small>" + K.esc(valueLong(pr, a)) + (by && G.players.length > 1 ? " · " + K.esc(by.name) : "") + "</small></div></div>";
  clearTimeout(G.capT);
  cap.classList.remove("on"); void cap.offsetWidth; cap.classList.add("on");
  G.capT = setTimeout(() => cap.classList.remove("on"), 2600);
}

/* ---------- prompts: unseen first, so the deck goes round ---------- */
function pick(n){
  const K = P.kit, all = P.gdata.five;
  let seen = K.store.get("five.seen", []);
  let pool = all.filter(p => !seen.includes(p.id));
  if(pool.length < n){ seen = []; pool = all.slice(); }
  const out = K.shuffle(pool).slice(0, n);
  K.store.set("five.seen", seen.concat(out.map(p => p.id)).slice(-200));
  return out;
}

/* ---------- the game ---------- */
function setupScreen(){
  const K = P.kit;
  K.setup({
    id: "five", title: "Starting Five", kick: "Name the top five",
    hero: () => '<div class="s5-hero"><div class="fan">' +
      [["MTL", "Lafleur", 10], ["EDM", "Gretzky", 99], ["WSH", "Ovechkin", 8]].map(([t, n, no], i) => '<div class="j j' + i + '">' + K.jersey(t, { name: n, number: no }) + "</div>").join("") +
      '</div><div class="cap"><span class="kick"><span>24 rounds, all checked</span></span></div></div>',
    how: ["A prompt like <b>the top 5 goal scorers ever</b>, and five empty spots on the ice.", "Type a name. A surname is enough; accents and small typos are fine.",
      "Right, and he skates out in his own sweater. Wrong is a penalty."],
    modeLine: n => n === 1 ? "Solo: three misses and the round is over." : "Take turns on this phone. Two penalties and you sit in the box until the next round. Most names wins.",
    options: [{ id: "rounds", label: "Rounds", values: [[3, "3"], [5, "5"], [7, "7"]], def: 5 },
      { id: "clock", label: "Shot clock", values: [["off", "Off"], ["norm", "Normal"], ["fast", "Fast"]], def: "norm" }],
    start: (players, opt) => play(players, opt)
  });
}
function play(players, opt){
  const K = P.kit, n = players.length;
  players.forEach(p => { p.score = 0; p.streak = 0; p.out = false; p.miss = 0; });
  const G = { players, opt, prompts: pick(opt.rounds), r: 0, turn: 0, live: true, log: [] };
  P.ui.onLeave(() => { G.live = false; if(G.clock) G.clock.stop(); clearTimeout(G.capT); });
  round(G);
}
function round(G){
  const K = P.kit, { app, band, $, $$ } = P.ui, n = G.players.length, solo = n === 1;
  const pr = G.pr = G.prompts[G.r], items = pr.answers.map(a => ITEM(pr, a));
  const maxS = solo ? 3 : 2;
  G.found = pr.answers.map(() => -1); G.busy = false;
  G.players.forEach(p => { p.strikes = 0; p.out = false; p.marks = Array(maxS).fill(false); });
  G.turn = G.r % n;
  const unit = pr.kind === "team" ? "Teams" : pr.unit === "year" ? "Players" : (UNIT[pr.unit] || [0, pr.unit])[1];
  app.innerHTML = '<div class="gx s5 gx-play">' + band("Starting Five", "Round " + (G.r + 1) + " of " + G.prompts.length, "#five") + '<div class="wrap">' +
    '<div id="s5-board">' + K.board(G.players, solo ? 0 : G.turn) + "</div>" +
    '<div class="s5-prompt"><span class="u">' + K.esc(unit) + '</span><h2>' + K.esc(pr.title) + '</h2><p class="one">' + K.esc(pr.sub) + "</p></div>" +
    stage(pr) +
    '<div class="s5-turn" id="s5-turn"><span id="s5-who"></span><span id="s5-clock"></span></div>' +
    '<form class="s5-guess" id="s5-form" autocomplete="off"><input id="s5-in" placeholder="Type a name" aria-label="Your answer" enterkeyhint="go" autocapitalize="words" spellcheck="false"><button class="pill" type="submit">Go</button></form>' +
    '<div class="s5-bar"><span class="s5-msg" id="s5-msg" aria-live="polite"></span><button type="button" class="ghost" id="s5-pass">' + (solo ? "Reveal all" : "Pass") + "</button></div>" +
    '<div id="s5-after"></div><p class="s5-src">' + K.esc(pr.asOf ? "As of " + pr.asOf + ". " : "") + "Source: " + pr.src.map(u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch(e){ return ""; } }).filter((v, i, a) => v && a.indexOf(v) === i).join(", ") + "</p>" +
    "</div></div>";
  const input = $("#s5-in"), msg = $("#s5-msg");
  const say = (t, cls) => { msg.textContent = t; msg.className = "s5-msg " + (cls || ""); };
  const paintBoard = () => { $("#s5-board").innerHTML = K.board(G.players, solo ? 0 : G.turn); };
  /* intro: the prompt card flips in, the spots light one by one */
  if(!K.RM()){
    $(".s5-prompt").animate([{ transform: "perspective(600px) rotateX(-70deg)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 600, easing: "cubic-bezier(.2,.9,.3,1.2)", fill: "both" });
    $(".s5-plane").animate([{ transform: "translateX(-50%) rotateX(80deg) scale(.8)", opacity: 0 }, { transform: "translateX(-50%) rotateX(56deg)", opacity: 1 }], { duration: 900, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" });
    $$(".s5-mark").forEach((m, i) => m.animate([{ transform: "translate(-50%,-50%) scale(0)" }, { transform: "translate(-50%,-50%) scale(1.25)", offset: .7 }, { transform: "translate(-50%,-50%) scale(1)" }], { duration: 420, delay: 500 + i*110, fill: "backwards", easing: "ease-out" }));
  }
  const secs = G.opt.clock === "off" ? 0 : solo ? (G.opt.clock === "fast" ? 60 : 90) : (G.opt.clock === "fast" ? 15 : 25);
  if(solo && secs) G.clock = K.clock($("#s5-clock"), secs, () => { if(G.live && !G.ended){ say("Time. Here's who you missed.", "bad"); endRound(); } });

  function turnLine(){
    const p = G.players[G.turn];
    $("#s5-who").innerHTML = solo ? '<b>' + G.found.filter(x => x >= 0).length + " of 5</b> on the ice" : '<i style="background:' + p.col.c + '"></i><b>' + K.esc(p.name) + "</b> to shoot";
  }
  function startTurn(){
    if(!G.live) return;
    if(G.found.every(x => x >= 0) || G.players.every(p => p.out)) return endRound();
    if(!solo){
      let guard = 0; while(G.players[G.turn].out && guard++ < 5) G.turn = (G.turn + 1) % n;
      paintBoard();
      if(G.clock) G.clock.stop();
      if(secs) G.clock = K.clock($("#s5-clock"), secs, () => { if(G.live && !G.ended) miss("Time's up"); });
    }
    turnLine(); input.disabled = false; G.busy = false;
    setTimeout(() => { if(G.live && document.activeElement !== input) try { input.focus({ preventScroll: true }); } catch(e){} }, 60);
  }
  function advance(){ if(solo) return startTurn(); G.turn = (G.turn + 1) % n; startTurn(); }
  function miss(why){
    const p = G.players[G.turn];
    p.marks[p.strikes] = true; p.strikes++; p.miss++; p.streak = 0;
    input.classList.remove("shake"); void input.offsetWidth; input.classList.add("shake");
    const out = p.strikes >= (solo ? 3 : 2);
    if(out) p.out = true;
    say((why ? why + ". " : "") + (solo ? (out ? "That's three. Round over." : "Penalty " + p.strikes + " of 3.") : out ? K.esc(p.name) + " goes to the box." : "Penalty for " + p.name + "."), "bad");
    K.callout(out && !solo ? "To the box" : "No goal", "bad", $("#s5-stage"));
    paintBoard();
    if(solo && out) return setTimeout(endRound, 700);
    input.value = "";
    G.busy = true; input.disabled = !solo;
    setTimeout(() => { if(G.live && !G.ended) advance(); }, solo ? 250 : 900);
  }
  function hit(k){
    const p = G.players[G.turn];
    G.found[k] = G.turn; p.score++; p.streak++;
    reveal(G, k, p); caption(G, k, p);
    say(["Top shelf.", "Bar down.", "Snipe.", "What a feed.", "Off the post and in."][Math.floor(Math.random()*5)], "good");
    input.value = ""; paintBoard(); turnLine();
    if(p.streak === 3 && !K.RM()) K.hats({ name: p.name });
    if(G.found.every(x => x >= 0)){ G.busy = true; return setTimeout(endRound, 1500); }
    if(!solo){ G.busy = true; input.disabled = true; if(G.clock) G.clock.pause(true); setTimeout(() => { if(G.live && !G.ended) advance(); }, 1300); }
  }
  $("#s5-form").addEventListener("submit", e => {
    e.preventDefault();
    if(G.busy || G.ended) return;
    const v = input.value.trim(); if(!v) return;
    const hits = K.match(v, items), live = hits.filter(i => G.found[i] < 0);
    if(!hits.length) return miss("");
    if(!live.length){ say("Already on the ice. Try another.", ""); input.select(); return; }
    if(live.length > 1){ say("More than one fits. Add a first name.", ""); input.select(); return; }
    hit(live[0]);
  });
  $("#s5-pass").addEventListener("click", () => { if(G.ended) return; if(solo){ say("Here's the five.", ""); endRound(); } else if(!G.busy) miss("Pass"); });

  async function endRound(){
    if(G.ended && G.endedRound === G.r) return;
    G.ended = true; G.endedRound = G.r;
    if(G.clock) G.clock.stop();
    input.disabled = true; $("#s5-form").classList.add("done"); $("#s5-pass").hidden = true; $("#s5-turn").style.visibility = "hidden";
    G.log.push({ title: pr.title, got: G.found.filter(x => x >= 0).length });
    for(let k = 0; k < 5; k++){ if(G.found[k] < 0 && G.live){ reveal(G, k, null, true); await K.sleep(K.RM() ? 0 : 260); } }
    if(!G.live) return;
    const got = G.found.filter(x => x >= 0).length, last = G.r === G.prompts.length - 1;
    const per = !solo ? '<div class="s5-per">' + G.players.map((p, i) => '<span style="--pc:' + p.col.c + '"><i></i>' + K.esc(p.name) + " <b>+" + G.found.filter(x => x === i).length + "</b></span>").join("") + "</div>" : "";
    $("#s5-after").innerHTML = '<div class="card s5-end"><h2>' + (got === 5 ? "All five!" : got + " of 5") + "</h2>" + per +
      '<button type="button" class="pill wide" id="s5-next">' + (last ? "Full time" : "Next round") + "</button></div>";
    const end = $("#s5-after .s5-end");
    if(!K.RM()) end.animate([{ opacity: 0, transform: "translateY(16px)" }, { opacity: 1, transform: "none" }], { duration: 380, easing: "ease-out", fill: "both" });
    if(got === 5) K.confetti(["#ffffff", "#F2C230", "#E3343B", "#2F73E0"], { n: 90 });
    end.scrollIntoView({ behavior: K.RM() ? "auto" : "smooth", block: "nearest" });
    $("#s5-next").addEventListener("click", () => {
      G.ended = false;
      if(last) return finish(G);
      G.r++; round(G);
    });
  }
  G.ended = false;
  setTimeout(startTurn, K.RM() ? 0 : 700);
}
function finish(G){
  const K = P.kit, solo = G.players.length === 1, total = G.prompts.length*5;
  let line = "";
  if(solo){
    const best = K.store.get("five.best", 0), pct = Math.round(G.players[0].score/total*100);
    if(G.players[0].score > best && G.prompts.length === 5) K.store.set("five.best", G.players[0].score);
    line = G.players[0].score + " of " + total + " names (" + pct + "%)." + (G.prompts.length === 5 ? " Best over five rounds: " + Math.max(best, G.players[0].score) + "." : "");
  } else line = G.prompts.length + " rounds, " + total + " names to find.";
  const extra = '<div class="s5-recap">' + G.log.map((l, i) => '<div><span>' + (i + 1) + "</span><b>" + K.esc(l.title) + "</b><i>" + l.got + "/5</i></div>").join("") + "</div>";
  K.stars({ id: "five", title: "Starting Five", players: G.players, line, extra, soloTitle: G.players[0].score >= total*.8 ? "Hall of Famer" : G.players[0].score >= total*.5 ? "First line" : "Fourth line", soloLbl: "Names",
    tie: p => -p.miss, rematch: () => play(G.players, G.opt) });
}
P.addGame({ id: "five", title: "Starting Five", sub: "Name the top five on the ice.", render: setupScreen });
})();
