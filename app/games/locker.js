/* The Locker Room: higher or lower. Two stalls, two sweaters. The left one's
   career total is on the board; did the right one get more or fewer? Take
   turns; three pucks each, a wrong call costs one. Keep calling until
   everyone's out of pucks. Most right calls wins. Retired players only, so
   the numbers are final. Data: PUCK.gdata.careers. */
(function(){
const P = window.PUCK = window.PUCK || {};
const STATS = [["p", "career points", "PTS"], ["g", "career goals", "G"], ["a", "career assists", "A"]];
const surname = n => { const p = String(n).split(" "); return p.length > 1 ? p.slice(1).join(" ") : n; };
const fmt = v => Number(v).toLocaleString("en-US");

function setupScreen(){
  const K = P.kit;
  K.setup({
    id: "locker", title: "The Locker Room", kick: "Higher or lower",
    hero: () => '<div class="lr-hero">' + [["NYI", "Bossy", 22], ["BOS", "Orr", 4]].map(([t, n, no], i) => K.stall({ team: t, plate: n, body: '<div class="ww-hang">' + K.jersey(t, { hanger: true, name: n, number: no }) + '</div><div class="lr-num">' + (i ? "?" : "1,126") + "</div>" })).join("") + '<span class="vs">VS</span></div>',
    how: ["Two sweaters in two stalls. You see the <b>career total</b> of the one on the left.", "More or fewer for the one on the right? Points, goals or assists.",
      "Right, and he moves over. Wrong costs a puck. Three pucks each; most right calls wins."],
    modeLine: n => n === 1 ? "Solo: three pucks. How long a run can you build?" : "Take turns. Out of pucks, out of the room.",
    start: (players, opt) => play(players, opt)
  });
}
function play(players, opt){
  const K = P.kit;
  players.forEach(p => { p.score = 0; p.run = 0; p.out = false; p.marks = [false, false, false]; p.miss = 0; });
  const G = { players, opt, live: true, turn: 0, calls: 0, bag: K.shuffle(P.gdata.careers.slice()) };
  G.left = G.bag.pop(); G.stat = STATS[0]; G.right = nextFor(G);
  P.ui.onLeave(() => { G.live = false; });
  screen(G);
}
function draw(G){ if(!G.bag.length) G.bag = P.kit.shuffle(P.gdata.careers.filter(c => c !== G.left)); return G.bag.pop(); }
function nextFor(G){
  /* a stat at random, and a man whose total differs from the left one's */
  G.stat = STATS[Math.random() < .5 ? 0 : Math.random() < .5 ? 1 : 2];
  for(let k = 0; k < 30; k++){ const c = draw(G); if(c[G.stat[0]] !== G.left[G.stat[0]] && c.name !== G.left.name) return c; }
  return draw(G);
}
function stallFor(c, known, stat){
  const K = P.kit;
  return K.stall({ team: c.team, plate: K.esc(surname(c.name)), cls: "lr-st", body: '<div class="ww-hang">' + K.jersey(c.team, { hanger: true, name: surname(c.name), number: c.number }) + "</div>" +
    '<div class="lr-num' + (known ? "" : " q") + '"><b data-v="0">' + (known ? fmt(c[stat[0]]) : "?") + "</b><small>" + stat[2] + "</small></div>" });
}
function screen(G){
  const K = P.kit, { app, band, $, $$ } = P.ui, n = G.players.length, solo = n === 1;
  let guard = 0; while(G.players[G.turn].out && guard++ < 4) G.turn = (G.turn + 1) % n;
  const p = G.players[G.turn], S = G.stat;
  app.innerHTML = '<div class="gx lr gx-play">' + band("The Locker Room", "Higher or lower", "#locker") + '<div class="wrap">' +
    '<div id="lr-board">' + K.board(G.players, G.turn) + "</div>" +
    '<div class="lr-track"><div class="lr-row" id="lr-row"><div class="lr-c" id="lr-l">' + stallFor(G.left, true, S) + '</div><div class="lr-c" id="lr-r">' + stallFor(G.right, false, S) + '</div></div><span class="vs">VS</span></div>' +
    '<div class="lr-q"><span class="label">' + (solo ? "Your call" : '<i style="background:' + p.col.c + '"></i>' + K.esc(p.name) + "'s call") + "</span>" +
      "<h2>" + K.esc(surname(G.right.name)) + ": more or fewer " + S[1] + " than " + K.esc(surname(G.left.name)) + "?</h2></div>" +
    '<div class="lr-btns"><button type="button" class="lr-b up" data-d="1"><svg viewBox="0 0 24 24"><path d="M12 5l8 10H4z"/></svg>More</button><button type="button" class="lr-b dn" data-d="-1"><svg viewBox="0 0 24 24"><path d="M12 19L4 9h16z"/></svg>Fewer</button></div>' +
    '<p class="lr-say" id="lr-say" aria-live="polite"></p><p class="s5-src">Regular season, career, from NHL.com. Retired players, so the numbers are final.</p></div></div>';
  if(!K.RM() && G.calls === 0) $$(".lr-c").forEach((c, i) => c.animate([{ opacity: 0, transform: "translateY(20px)" }, { opacity: 1, transform: "none" }], { duration: 450, delay: i*120, fill: "backwards" }));
  let done = false;
  $$(".lr-b").forEach(b => b.addEventListener("click", async () => {
    if(done || !G.live) return; done = true;
    $$(".lr-b").forEach(x => { x.disabled = true; x.classList.toggle("pick", x === b); });
    const d = +b.dataset.d, a = G.left[S[0]], v = G.right[S[0]], ok = d > 0 ? v > a : v < a;
    const num = $("#lr-r .lr-num b"); $("#lr-r .lr-num").classList.remove("q");
    /* the odometer rolls */
    if(K.RM()) num.textContent = fmt(v);
    else await new Promise(res => { const t0 = performance.now(), ms = 1100; const step = now => { const k = Math.min(1, (now - t0)/ms), e = 1 - Math.pow(1 - k, 3); num.textContent = fmt(Math.round(v*e)); if(k < 1) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
    if(!G.live) return;
    G.calls++;
    const rs = $("#lr-r .gx-stall");
    rs.classList.add(ok ? "good" : "bad");
    const say = $("#lr-say");
    if(ok){
      p.score++; p.run++;
      say.innerHTML = "<b>Right.</b> " + K.esc(G.right.name) + ", " + fmt(v) + " " + S[1] + ".";
      say.className = "lr-say good";
      const r = rs.getBoundingClientRect(); K.confetti([P.team(G.right.team).c1, "#ffffff", "#F2C230"], { n: 40, x: r.left + r.width/2, y: r.top + r.height*.4 });
      if(p.run === 3 && !K.RM()) K.hats({ name: p.name });
    } else {
      p.marks[p.miss] = true; p.miss++; p.run = 0;
      if(p.miss >= 3) p.out = true;
      say.innerHTML = "<b>" + (p.out ? (solo ? "Out of pucks." : K.esc(p.name) + " is out of pucks.") : "No.") + "</b> " + K.esc(G.right.name) + " had " + fmt(v) + ".";
      say.className = "lr-say bad";
      K.callout(p.out ? "Out" : "Wrong call", "bad", $(".lr-track"));
    }
    $("#lr-board").innerHTML = K.board(G.players, G.turn);
    await K.sleep(K.RM() ? 600 : 1200);
    if(!G.live) return;
    if(G.players.every(q => q.out)) return finish(G);
    /* he moves over to the left stall and a new man comes in */
    const nextLeft = G.right;
    if(!K.RM()){
      const row = $("#lr-row");
      row.insertAdjacentHTML("beforeend", '<div class="lr-c">' + K.stall({ team: null, plate: "", cls: "lr-st empty" }) + "</div>");
      await row.animate([{ transform: "none" }, { transform: "translateX(calc(-50% - 5px))" }], { duration: 520, easing: "cubic-bezier(.6,0,.3,1)", fill: "forwards" }).finished.catch(() => {});
      if(!G.live) return;
    }
    G.left = nextLeft; G.right = nextFor(G);
    if(!solo) G.turn = (G.turn + 1) % n;
    screen(G);
  }));
}
function finish(G){
  const K = P.kit, solo = G.players.length === 1;
  let line;
  if(solo){
    const s = G.players[0].score, best = K.store.get("locker.best", 0);
    if(s > best) K.store.set("locker.best", s);
    line = s + " right calls before the pucks ran out. Best: " + Math.max(best, s) + ".";
  } else line = G.calls + " calls in the room.";
  K.stars({ id: "locker", title: "The Locker Room", players: G.players, line, soloLbl: "Right calls",
    soloTitle: G.players[0].score >= 15 ? "Hockey-Reference" : G.players[0].score >= 8 ? "Stats nerd" : "Rink rat",
    rematch: () => play(G.players, G.opt) });
}
P.addGame({ id: "locker", title: "The Locker Room", sub: "Higher or lower, stall by stall.", render: setupScreen });
})();
