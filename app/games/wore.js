/* Who Wore It? A sweater hangs in a stall: a number and a team, no name.
   Solo: ten sweaters on a clock. Two or three players: a buzzer race on one
   phone. First to buzz answers; wrong and you're locked out of that sweater.
   Right and the name is stitched onto the back. First to five wins.
   Three sweaters in a row: hat trick. Data: PUCK.gdata.wore. */
(function(){
const P = window.PUCK = window.PUCK || {};
const surname = n => { const p = String(n).split(" "); return p.length > 1 ? p.slice(1).join(" ") : n; };

function setupScreen(){
  const K = P.kit;
  K.setup({
    id: "wore", title: "Who Wore It?", kick: "Number, team, name",
    hero: () => '<div class="ww-hero">' + ["MTL", "PIT", "BOS"].map((t, i) => '<div class="h h' + i + '">' + K.stall({ team: t, plate: "?", body: '<div class="ww-hang">' + K.jersey(t, { hanger: true, number: [33, 66, 4][i] }) + "</div>" }) + "</div>").join("") + "</div>",
    how: ["A sweater hangs in the stall: <b>a number and a team</b>, no name.", "Two or three of you: <b>hit your buzzer first</b>, then pick the name. Wrong, and you sit out that sweater.",
      "Right, and the name is stitched on. Three in a row is a hat trick."],
    modeLine: n => n === 1 ? "Solo: ten sweaters, ten seconds each. Beat your best." : "First to five sweaters wins.",
    options: [{ id: "to", label: "Play to", values: [[3, "3"], [5, "5"], [7, "7"]], def: 5 }],
    start: (players, opt) => play(players, opt)
  });
}
function deck(){
  const K = P.kit, all = P.gdata.wore;
  let seen = K.store.get("wore.seen", []);
  let pool = all.filter(x => !seen.includes(x.team + x.number));
  if(pool.length < 14){ seen = []; pool = all.slice(); }
  return { list: K.shuffle(pool), seen };
}
function play(players, opt){
  const K = P.kit, n = players.length, solo = n === 1;
  players.forEach(p => { p.score = 0; p.run = 0; p.miss = 0; });
  const D = deck();
  const G = { players, opt, i: 0, live: true, last: -1, run: 0, deck: D, total: solo ? 10 : 99 };
  P.ui.onLeave(() => { G.live = false; if(G.clock) G.clock.stop(); });
  sweater(G);
}
function sweater(G){
  const K = P.kit, { app, band, $, $$ } = P.ui, n = G.players.length, solo = n === 1;
  if(G.i >= G.deck.list.length){ G.deck = deck(); G.i = 0; }
  const it = G.deck.list[G.i], T = P.team(it.team);
  G.deck.seen.push(it.team + it.number); K.store.set("wore.seen", G.deck.seen.slice(-60));
  const opts = K.shuffle([it.name].concat(it.decoys.slice(0, 3)));
  const locked = new Set(); let state = "buzz", who = -1, done = false;
  const kick = solo ? "Sweater " + (G.i + 1) + " of " + G.total : "First to " + G.opt.to;
  app.innerHTML = '<div class="gx ww gx-play">' + band("Who Wore It?", kick, "#wore") + '<div class="wrap">' +
    '<div id="ww-board">' + K.board(G.players, -1) + "</div>" +
    '<div class="ww-scene">' + K.stall({ team: it.team, plate: '<span id="ww-plate">' + (solo ? "Who wore it?" : "Buzz in") + "</span>", cls: "ww-st", body: '<div class="ww-hang" id="ww-hang">' + K.turnable(it.team, { number: it.number, name: "" }) + "</div>" }) +
      '<div class="ww-q"><span class="kick"><span>No. ' + it.number + "</span></span><h2>Who wore <em>" + it.number + "</em> for the " + K.esc(T.name) + "?</h2></div>" +
    "</div>" +
    '<div class="ww-status"><span id="ww-say" aria-live="polite"></span><span id="ww-clock"></span></div>' +
    '<div class="ww-opts" id="ww-opts">' + opts.map(o => '<button type="button" class="ww-opt" data-n="' + K.esc(o) + '"' + (solo ? "" : " disabled") + ">" + K.esc(o) + "</button>").join("") + "</div>" +
    (solo ? "" : '<div class="ww-buzz" style="--n:' + n + '">' + G.players.map((p, i) => '<button type="button" class="ww-bz" data-p="' + i + '" style="--pc:' + p.col.c + ";--pd:" + p.col.d + '"><i></i><span>' + K.esc(p.name) + "</span></button>").join("") + "</div>") +
    '<div id="ww-after"></div></div></div>';
  const say = (t, cls) => { const e = $("#ww-say"); e.innerHTML = t; e.className = cls || ""; };
  const hang = $("#ww-hang");
  if(!K.RM()){
    hang.animate([{ transform: "translateY(-115%) rotate(-8deg)" }, { transform: "translateY(4%) rotate(3deg)", offset: .65 }, { transform: "translateY(-1%) rotate(-1.5deg)", offset: .85 }, { transform: "none" }],
      { duration: 900, easing: "cubic-bezier(.3,.8,.3,1)" });
    $(".ww-q").animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 400, delay: 350, fill: "backwards" });
  }
  const startClock = (secs, onEnd) => { if(G.clock) G.clock.stop(); G.clock = K.clock($("#ww-clock"), secs, onEnd); };
  if(solo){ say("Pick the name."); startClock(10, () => resolve(-1, null)); }
  else { say("Hit your buzzer to answer."); startClock(12, () => { if(state === "buzz") resolve(-1, null); }); }

  function buzz(i){
    if(state !== "buzz" || locked.has(i) || done || !G.live) return;
    state = "answer"; who = i;
    $$(".ww-bz").forEach(b => { b.classList.toggle("lit", +b.dataset.p === i); b.classList.toggle("dim", +b.dataset.p !== i); });
    $("#ww-board").innerHTML = K.board(G.players, i);
    $$(".ww-opt").forEach(b => { b.disabled = b.classList.contains("wrong"); });
    $("#ww-plate").textContent = G.players[i].name + " buzzed";
    say("<b>" + K.esc(G.players[i].name) + "</b>, pick the name.");
    startClock(6, () => answer(null));
    if(!K.RM()) $(".ww-scene").animate([{ boxShadow: "0 0 0 0 " + G.players[i].col.c }, { boxShadow: "0 0 0 8px transparent" }], { duration: 500 });
  }
  function answer(btn){
    if(done || !G.live) return;
    const ok = btn && btn.dataset.n === it.name;
    if(ok) return resolve(solo ? 0 : who, btn);
    if(btn){ btn.classList.add("wrong"); btn.disabled = true; }
    if(solo) return resolve(-1, btn);
    const p = G.players[who]; p.miss++; p.run = 0;
    locked.add(who);
    K.callout(btn ? "No" : "Too slow", "bad", $(".ww-scene"));
    $$(".ww-bz").forEach(b => { b.classList.remove("lit", "dim"); b.classList.toggle("out", locked.has(+b.dataset.p)); });
    $$(".ww-opt").forEach(b => { b.disabled = true; });
    if(locked.size >= n) return resolve(-1, null);
    state = "buzz"; who = -1;
    $("#ww-board").innerHTML = K.board(G.players, -1);
    $("#ww-plate").textContent = "Rebound";
    say(K.esc(p.name) + " is out of this one. Anyone else?");
    startClock(8, () => { if(state === "buzz") resolve(-1, null); });
  }
  async function resolve(winner, btn){
    if(done) return; done = true; state = "done";
    if(G.clock) G.clock.stop();
    $$(".ww-opt").forEach(b => { b.disabled = true; if(b.dataset.n === it.name) b.classList.add("right"); });
    $$(".ww-bz").forEach(b => { b.disabled = true; });
    const p = winner >= 0 ? G.players[winner] : null;
    if(p){
      p.score++;
      G.players.forEach(q => { if(q !== p) q.run = 0; });
      p.run++;
      $("#ww-board").innerHTML = K.board(G.players, winner);
      K.countUp($('#ww-board .gx-pl[data-p="' + winner + '"] .sc'), p.score);
    } else { G.players.forEach(q => q.run = 0); if(solo && btn) G.players[0].miss++; }
    say(p ? (solo ? "Right." : "<b>" + K.esc(p.name) + "</b> takes it.") : "It was " + K.esc(it.name) + ".", p ? "good" : "bad");
    await stitch(it, !p);
    if(!G.live) return;
    $("#ww-plate").textContent = it.name;
    if(p){
      const r = $(".ww-st .back").getBoundingClientRect();
      K.confetti([T.c1, T.c2, "#ffffff"], { n: 70, x: r.left + r.width/2, y: r.top + r.height*.45 });
      if(p.run === 3 && !K.RM()) K.hats({ name: p.name });
    }
    $("#ww-after").innerHTML = '<div class="card ww-fact"><p class="one">' + K.esc(it.fact) + '</p><span class="label">' + K.esc(it.name) + " · " + K.esc(T.name) + " · " + K.esc(it.years) + "</span></div>";
    const won = G.players.find(q => q.score >= G.opt.to);
    const over = solo ? G.i + 1 >= G.total : !!won;
    $("#ww-after").insertAdjacentHTML("beforeend", '<button type="button" class="pill wide" id="ww-next">' + (over ? "Full time" : "Next sweater") + "</button>");
    $("#ww-next").addEventListener("click", () => { G.i++; if(over) finish(G); else sweater(G); });
    if(!K.RM()) $("#ww-after").animate([{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "none" }], { duration: 350, fill: "both" });
    $("#ww-next").scrollIntoView({ behavior: K.RM() ? "auto" : "smooth", block: "nearest" });
  }
  /* the sweater turns on its hanger, then the name goes on letter by letter */
  async function stitch(it, ghost){
    const card = $(".ww-hang .gx-turn"), back = $(".ww-hang .gx-turn .back");
    if(!card) return;
    const name = surname(it.name);
    if(!K.RM()){
      card.animate([{ transform: "rotateY(0)" }, { transform: "rotateY(-180deg)", offset: .45 }, { transform: "rotateY(-180deg)", offset: .6 }, { transform: "rotateY(-360deg)" }], { duration: 1400, easing: "cubic-bezier(.45,0,.3,1)" });
      await K.sleep(1250);
      for(let k = 1; k <= name.length; k++){
        if(!G.live) return;
        back.innerHTML = K.jersey(it.team, { side: "back", hanger: true, number: it.number, name: name.slice(0, k), ghost: false });
        await K.sleep(name[k - 1] === " " ? 10 : 55);
      }
      const sh = document.createElement("i"); sh.className = "ww-shine"; back.appendChild(sh);
    } else back.innerHTML = K.jersey(it.team, { side: "back", hanger: true, number: it.number, name });
    if(ghost) back.classList.add("dimmed");
  }
  $$(".ww-opt").forEach(b => b.addEventListener("click", () => { if(solo || state === "answer") answer(b); }));
  $$(".ww-bz").forEach(b => b.addEventListener("pointerdown", e => { e.preventDefault(); buzz(+b.dataset.p); }));
  $$(".ww-bz").forEach(b => b.addEventListener("keydown", e => { if(e.key === "Enter" || e.key === " "){ e.preventDefault(); buzz(+b.dataset.p); } }));
}
function finish(G){
  const K = P.kit, solo = G.players.length === 1;
  let line;
  if(solo){
    const s = G.players[0].score, best = K.store.get("wore.best", 0);
    if(s > best) K.store.set("wore.best", s);
    line = s + " of " + G.total + " sweaters. Best: " + Math.max(best, s) + ".";
  } else line = "First to " + G.opt.to + " sweaters.";
  K.stars({ id: "wore", title: "Who Wore It?", players: G.players, line, tie: p => -p.miss, soloLbl: "Sweaters",
    soloTitle: G.players[0].score >= 9 ? "Equipment manager" : G.players[0].score >= 6 ? "Season-ticket holder" : "Bandwagon fan",
    rematch: () => play(G.players, G.opt) });
}
P.addGame({ id: "wore", title: "Who Wore It?", sub: "A number, a team, a buzzer race.", render: setupScreen });
})();
