/* Draft Day: the stage, the podium, the clock. "With the first overall pick
   in the 2015 NHL Draft, the Edmonton Oilers select..." Pick the name from
   four prospects. Two or three players take turns as the GM on the clock:
   right first time is 2 points; wrong, and the next GM trades up and can
   steal it for 1. The pick pulls on his new sweater and the cap drops.
   Data: PUCK.gdata.draft (every first overall pick 2000-2026). */
(function(){
const P = window.PUCK = window.PUCK || {};
const surname = n => { const p = String(n).split(" "); return p.length > 1 ? p.slice(1).join(" ") : n; };
const POSN = { C: "Centre", LW: "Left wing", RW: "Right wing", D: "Defence", G: "Goalie" };

function cap(abbr){
  const T = P.team(abbr), d = P.kit.design(abbr);
  return '<svg class="dd-capsvg" viewBox="0 0 120 80" aria-hidden="true"><defs><linearGradient id="ddcg' + abbr + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#000" stop-opacity=".25"/></linearGradient></defs>' +
    '<path d="M14 58 Q12 12 60 10 Q108 12 106 58Z" fill="' + d.b + '"/><path d="M14 58 Q12 12 60 10 Q108 12 106 58Z" fill="url(#ddcg' + abbr + ')"/>' +
    '<path d="M60 10 V58 M38 15 Q30 36 32 58 M82 15 Q90 36 88 58" stroke="rgba(0,0,0,.22)" fill="none"/><circle cx="60" cy="11" r="4" fill="' + (d.s[0] ? d.s[0][0] : T.c2) + '"/>' +
    '<image href="' + P.logo(abbr, P.kit.design(abbr).b && lumDark(d.b)) + '" x="40" y="22" width="40" height="34"/>' +
    '<path d="M6 60 Q60 48 114 60 Q112 74 60 72 Q8 74 6 60Z" fill="' + (d.s[0] ? d.s[0][0] : T.c2) + '"/><path d="M10 62 Q60 52 110 62" stroke="rgba(255,255,255,.25)" fill="none"/></svg>';
}
const lumDark = hex => { const h = hex.replace("#", ""); const [r, g, b] = [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)/255); return .2126*r + .7152*g + .0722*b < .35; };

function setupScreen(){
  const K = P.kit;
  K.setup({
    id: "draft", title: "Draft Day", kick: "You're on the clock",
    hero: () => '<div class="dd-hero"><div class="beam b1"></div><div class="beam b2"></div><div class="scr"><small>NHL Draft · Round 1 · Pick 1</small><b>2015</b></div>' +
      '<div class="pod"><img src="' + P.logo("EDM", true) + '" alt=""></div><div class="jj">' + K.jersey("EDM", { name: "McDavid", number: 1 }) + "</div></div>",
    how: ["Every first overall pick from <b>2000 to 2026</b>. The team steps up to the podium.", "Pick the name from four prospects before the clock runs out.",
      "Two or three of you take turns as GM. Right first time is 2 points. Wrong, and the next GM <b>trades up</b> and can steal it for 1."],
    modeLine: n => n === 1 ? "Solo: ten picks. Every right one is a point." : "Each GM gets the picks below. Most points wins.",
    options: [{ id: "per", label: "Picks per GM", values: [[3, "3"], [4, "4"], [5, "5"]], def: 4 }],
    start: (players, opt) => play(players, opt)
  });
}
function play(players, opt){
  const K = P.kit, n = players.length;
  players.forEach(p => { p.score = 0; p.run = 0; p.miss = 0; });
  let seen = K.store.get("draft.seen", []);
  let pool = P.gdata.draft.filter(d => !seen.includes(d.year));
  const need = n === 1 ? 10 : n*opt.per;
  if(pool.length < need){ seen = []; pool = P.gdata.draft.slice(); }
  const picks = K.shuffle(pool).slice(0, need);
  K.store.set("draft.seen", seen.concat(picks.map(d => d.year)));
  const G = { players, opt, picks, i: 0, live: true };
  P.ui.onLeave(() => { G.live = false; if(G.clock) G.clock.stop(); clearTimeout(G.typeT); });
  pick(G);
}
function pick(G){
  const K = P.kit, { app, band, $, $$ } = P.ui, n = G.players.length, solo = n === 1;
  const d = G.picks[G.i], T = P.team(d.team);
  let gm = G.i % n, tries = 0, done = false;
  const opts = K.shuffle([d.name].concat(d.decoys.filter(x => x !== d.name).slice(0, 3)));
  const facts = {};
  app.innerHTML = '<div class="gx dd gx-play">' + band("Draft Day", "Pick " + (G.i + 1) + " of " + G.picks.length, "#draft") + '<div class="wrap">' +
    '<div id="dd-board">' + K.board(G.players, solo ? 0 : gm) + "</div>" +
    '<div class="dd-stage" id="dd-stage" style="--tc:' + T.c1 + ";--tc2:" + T.c2 + '"><div class="curtain"></div><div class="beam b1"></div><div class="beam b2"></div>' +
      '<div class="scr"><div class="scr-in"><img src="' + P.logo(d.team, true) + '" alt=""><div><small>' + d.year + ' NHL Draft</small><b>Round 1 · Pick 1</b><span>' + K.esc(T.name) + "</span></div></div></div>" +
      '<div class="flashes" id="dd-fl"></div>' +
      '<div class="dd-pick" id="dd-pick"></div>' +
      '<div class="pod"><div class="top"></div><div class="face"><img src="' + P.logo(d.team, true) + '" alt=""><small>' + d.year + " Draft</small></div></div>" +
    "</div>" +
    '<p class="dd-ann" id="dd-ann" aria-live="polite"></p>' +
    '<div class="dd-status"><span id="dd-say"></span><span id="dd-clock"></span></div>' +
    '<div class="dd-opts" id="dd-opts">' + opts.map(o => '<button type="button" class="dd-opt" data-n="' + K.esc(o) + '" disabled><b>' + K.esc(o) + "</b></button>").join("") + "</div>" +
    '<div id="dd-after"></div></div></div>';
  const say = (t, c) => { const e = $("#dd-say"); e.innerHTML = t; e.className = c || ""; };
  const paintBoard = () => { $("#dd-board").innerHTML = K.board(G.players, solo ? 0 : gm); };
  /* the commissioner reads it out */
  const text = "With the first overall pick in the " + d.year + " NHL Draft, the " + (d.note && d.team === "WPG" ? "Atlanta Thrashers" : T.name) + " select…";
  const ann = $("#dd-ann");
  if(!K.RM()){
    $(".dd-stage .scr").animate([{ opacity: 0, transform: "translateX(-50%) scale(.9)" }, { opacity: 1, transform: "translateX(-50%) scale(1)" }], { duration: 500, easing: "ease-out", fill: "backwards" });
    $(".dd-stage .pod").animate([{ transform: "translate(-50%, 60px)" }, { transform: "translateX(-50%)" }], { duration: 650, delay: 150, easing: "cubic-bezier(.2,.9,.3,1.1)", fill: "backwards" });
    let k = 0;
    const type = () => { if(!G.live) return; ann.textContent = text.slice(0, ++k); if(k < text.length) G.typeT = setTimeout(type, 22); else ready(); };
    G.typeT = setTimeout(type, 500);
  } else { ann.textContent = text; ready(); }
  function ready(){
    if(!G.live) return;
    $$(".dd-opt").forEach(b => { b.disabled = b.classList.contains("wrong"); });
    if(!K.RM()) $$(".dd-opt").forEach((b, i) => b.animate([{ opacity: 0, transform: "translateY(12px)" }, { opacity: 1, transform: "none" }], { duration: 300, delay: i*70, fill: "backwards" }));
    turn();
  }
  function turn(){
    paintBoard();
    say(solo ? "Make the pick." : (tries ? "<b>" + K.esc(G.players[gm].name) + "</b> trades up. Steal it for 1." : "<b>" + K.esc(G.players[gm].name) + "</b> is on the clock."));
    if(G.clock) G.clock.stop();
    G.clock = K.clock($("#dd-clock"), tries ? 8 : 15, () => choose(null));
  }
  function choose(btn){
    if(done || !G.live) return;
    if(G.clock) G.clock.stop();
    const ok = btn && btn.dataset.n === d.name, p = G.players[gm];
    if(ok) return resolve(p, tries ? 1 : 2, btn);
    if(btn){ btn.classList.add("wrong"); btn.disabled = true; }
    p.miss++; p.run = 0; tries++;
    K.callout(btn ? "Bust" : "Clock's out", "bad", $("#dd-stage"));
    if(solo || tries >= n || $$(".dd-opt:not(.wrong)").length <= 1) return resolve(null, 0, null);
    gm = (gm + 1) % n;
    setTimeout(() => { if(G.live && !done) turn(); }, 700);
  }
  async function resolve(p, pts, btn){
    done = true;
    $$(".dd-opt").forEach(b => { b.disabled = true; if(b.dataset.n === d.name) b.classList.add("right"); });
    if(p){
      p.score += solo ? 1 : pts; p.run++;
      G.players.forEach(q => { if(q !== p) q.run = 0; });
      paintBoard(); K.countUp($('#dd-board .gx-pl[data-p="' + p.i + '"] .sc'), p.score);
      say(solo ? "Right pick." : "<b>" + K.esc(p.name) + "</b> +" + pts + (pts === 1 ? ", stolen." : ". Franchise pick."), "good");
    } else say("It was " + K.esc(d.name) + ".", "bad");
    /* the pick walks up: sweater on, cap on, cameras go */
    const box = $("#dd-pick");
    box.innerHTML = '<div class="jj">' + K.jersey(d.team, { name: surname(d.name), number: 1, ghost: !p }) + '</div><div class="cap">' + cap(d.team) + "</div>";
    if(!K.RM()){
      box.querySelector(".jj").animate([{ transform: "translateY(40%) scale(.6)", opacity: 0 }, { transform: "translateY(-4%) scale(1.04)", opacity: 1, offset: .7 }, { transform: "none", opacity: 1 }], { duration: 700, easing: "cubic-bezier(.2,.9,.3,1)", fill: "both" });
      box.querySelector(".cap").animate([{ transform: "translate(-50%,-260%) rotate(-30deg)", opacity: 0 }, { transform: "translate(-50%,-260%) rotate(-30deg)", opacity: 1, offset: .1 }, { transform: "translate(-50%,6%) rotate(4deg)", offset: .75 }, { transform: "translate(-50%,0) rotate(0)" }],
        { duration: 800, delay: 550, easing: "cubic-bezier(.5,0,.4,1)", fill: "both" });
      if(p) flashes();
    }
    const after = '<div class="card dd-info"><div class="row"><img class="logo-img" src="' + P.logo(d.team, true) + '" alt="" width="40" height="40"><div><b>' + K.esc(d.name) + "</b> " +
      (d.cc ? '<img class="flag" src="' + P.flag(d.cc) + '" alt="">' : "") + '<small>' + K.esc((POSN[d.pos] || d.pos) + " · from " + d.from) + "</small></div></div>" +
      '<p class="one">' + K.esc(d.second) + " went second." + (d.note ? " " + K.esc(d.note) : "") + "</p></div>";
    await K.sleep(K.RM() ? 0 : 900);
    if(!G.live) return;
    if(p){ const r = $("#dd-stage").getBoundingClientRect(); K.confetti([T.c1, T.c2, "#ffffff"], { n: 60, x: r.left + r.width/2, y: r.top + r.height*.5 }); if(p.run === 3 && !K.RM()) K.hats({ name: p.name }); }
    const last = G.i + 1 >= G.picks.length;
    $("#dd-after").innerHTML = after + '<button type="button" class="pill wide" id="dd-next">' + (last ? "Full time" : "Next pick") + "</button>";
    if(!K.RM()) $("#dd-after").animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 350, fill: "both" });
    $("#dd-next").addEventListener("click", () => { G.i++; if(last) finish(G); else pick(G); });
    $("#dd-next").scrollIntoView({ behavior: K.RM() ? "auto" : "smooth", block: "nearest" });
  }
  function flashes(){
    const fl = $("#dd-fl"); if(!fl) return;
    for(let k = 0; k < 16; k++){
      const f = document.createElement("i");
      f.style.left = (4 + Math.random()*92) + "%"; f.style.top = (40 + Math.random()*50) + "%";
      fl.appendChild(f);
      f.animate([{ opacity: 0, transform: "scale(.3)" }, { opacity: 1, transform: "scale(1)", offset: .15 }, { opacity: 0, transform: "scale(1.4)" }], { duration: 380, delay: 300 + Math.random()*1600, fill: "both" });
    }
  }
  $$(".dd-opt").forEach(b => b.addEventListener("click", () => choose(b)));
}
function finish(G){
  const K = P.kit, solo = G.players.length === 1;
  let line;
  if(solo){
    const s = G.players[0].score, best = K.store.get("draft.best", 0);
    if(s > best) K.store.set("draft.best", s);
    line = s + " of 10 picks right. Best: " + Math.max(best, s) + ".";
  } else line = G.picks.length + " picks. 2 for a franchise pick, 1 for a steal.";
  K.stars({ id: "draft", title: "Draft Day", players: G.players, line, tie: p => -p.miss, soloLbl: "Picks",
    soloTitle: G.players[0].score >= 9 ? "General manager" : G.players[0].score >= 6 ? "Head scout" : "Intern",
    rematch: () => play(G.players, G.opt) });
}
P.addGame({ id: "draft", title: "Draft Day", sub: "First overall picks. You're on the clock.", render: setupScreen });
})();
