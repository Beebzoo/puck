/* PUCK 26: the loading screen's logo rain. The 32 NHL team logos fall onto the ice
   and pile up (round bodies, gravity, a little bounce and roll), then the mode's own
   logo drops on top, bigger, with a glow. One canvas, about two seconds.
   P.p26rain.run(canvas, { hero: "MTL", dur: 2000 }) returns { stop() }.
   With prefers-reduced-motion the pile is worked out at once and drawn still. */
(function(){
const P = window.PUCK, LOGO = window.PUCK_LOGOS;
const TEAMS = ["ANA","BOS","BUF","CAR","CBJ","CGY","CHI","COL","DAL","DET","EDM","FLA","LAK","MIN","MTL","NJD","NSH","NYI","NYR","OTT","PHI","PIT","SEA","SJS","STL","TBL","TOR","UTA","VAN","VGK","WPG","WSH"];
const reduced = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;

/* the logos, loaded once and kept: decoded SVG images draw fast */
const IMG = {};
function img(code){
  if(!IMG[code]){ const i = new Image(); i.decoding = "async"; i.src = LOGO.dark[code]; IMG[code] = i; }
  return IMG[code];
}
function preload(){ TEAMS.concat("NHL").forEach(img); }

function run(cv, o = {}){
  const ctx = cv.getContext("2d");
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = cv.clientWidth, H = cv.clientHeight;
  cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const r0 = Math.max(22, Math.min(56, W*.074, H*.11)), g = Math.max(2200, H*5);
  let seed = 7 + (o.seed || 0);
  const rnd = () => { seed = (seed*16807) % 2147483647; return (seed - 1)/2147483646; };
  const order = TEAMS.slice().sort(() => rnd() - .5).filter(t => t !== o.hero);
  const hero = TEAMS.includes(o.hero) || o.hero === "NHL" ? o.hero : "NHL";
  const bodies = order.map((t, i) => {
    const r = r0*(.88 + rnd()*.24);
    return { t, r, m: r*r, x: r + rnd()*(W - 2*r), y: -r - rnd()*H*.12, vx: (rnd() - .5)*160, vy: 420 + rnd()*380, a: (rnd() - .5)*1.2, va: (rnd() - .5)*7, at: .02 + i*.024, on: false, hit: false };
  });
  bodies.push({ t: hero, r: r0*1.75, m: r0*r0*6, x: W/2, y: -r0*2, vx: 0, vy: 1300, a: -.12, va: .5, at: .92, on: false, hit: false, hero: true });
  const puffs = [];
  const floor = H - 2;
  function step(dt, t){
    for(const b of bodies){
      if(!b.on){ if(t >= b.at) b.on = true; else continue; }
      b.vy += g*dt; b.x += b.vx*dt; b.y += b.vy*dt; b.a += b.va*dt;
      b.vx *= 1 - .4*dt; b.va *= 1 - 1.2*dt;
    }
    for(let it = 0; it < 4; it++){
      for(let i = 0; i < bodies.length; i++){
        const A = bodies[i]; if(!A.on) continue;
        for(let j = i + 1; j < bodies.length; j++){
          const B = bodies[j]; if(!B.on) continue;
          const dx = B.x - A.x, dy = B.y - A.y, rr = (A.r + B.r)*.92, d2 = dx*dx + dy*dy;
          if(d2 >= rr*rr || d2 === 0) continue;
          const d = Math.sqrt(d2), nx = dx/d, ny = dy/d, over = rr - d, im = 1/A.m + 1/B.m;
          A.x -= nx*over*(1/A.m)/im; A.y -= ny*over*(1/A.m)/im; B.x += nx*over*(1/B.m)/im; B.y += ny*over*(1/B.m)/im;
          const rv = (B.vx - A.vx)*nx + (B.vy - A.vy)*ny;
          if(rv < 0){
            const j2 = -(1.18)*rv/im;
            A.vx -= j2*nx/A.m; A.vy -= j2*ny/A.m; B.vx += j2*nx/B.m; B.vy += j2*ny/B.m;
            const tx = -ny, tv = ((B.vx - A.vx)*tx + (B.vy - A.vy)*nx);
            A.va += tv*.004; B.va -= tv*.004;
          }
        }
      }
      for(const b of bodies){
        if(!b.on) continue;
        if(b.y + b.r*.92 > floor){
          if(!b.hit && b.vy > 500){ b.hit = true; for(let k = 0; k < (b.hero ? 26 : 6); k++) puffs.push({ x: b.x + (Math.random() - .5)*b.r, y: floor, vx: (Math.random() - .5)*(b.hero ? 520 : 260), vy: -80 - Math.random()*(b.hero ? 340 : 160), r: .6 + Math.random()*1.8, age: 0, life: .35 + Math.random()*.35 }); }
          b.y = floor - b.r*.92; if(b.vy > 0) b.vy *= -.22; b.vx *= .86; b.va = b.vx/b.r*.8;
        }
        if(b.x < b.r*.8){ b.x = b.r*.8; b.vx = Math.abs(b.vx)*.4; }
        if(b.x > W - b.r*.8){ b.x = W - b.r*.8; b.vx = -Math.abs(b.vx)*.4; }
      }
    }
  }
  function drawLogo(b){
    const i = img(b.t); if(!i.complete || !i.naturalWidth) return;
    const s = b.r*2.05, k = Math.min(s/i.naturalWidth, s/i.naturalHeight), w = i.naturalWidth*k, h = i.naturalHeight*k;
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.a);
    ctx.drawImage(i, -w/2, -h/2, w, h); ctx.restore();
  }
  function draw(t){
    ctx.clearRect(0, 0, W, H);
    /* soft contact shadows on the ice */
    ctx.fillStyle = "rgba(0,0,0,.35)";
    for(const b of bodies) if(b.on && b.y > floor - b.r*2.2){ ctx.globalAlpha = Math.max(0, 1 - (floor - b.y - b.r)/(b.r*1.2))*.8; ctx.beginPath(); ctx.ellipse(b.x, floor, b.r*.9, b.r*.18, 0, 0, 6.283); ctx.fill(); }
    ctx.globalAlpha = 1;
    const H0 = bodies[bodies.length - 1];
    if(H0.on && H0.hit){
      const p = .75 + .25*Math.sin(t*6), gr = ctx.createRadialGradient(H0.x, H0.y, H0.r*.3, H0.x, H0.y, H0.r*2.2);
      gr.addColorStop(0, "rgba(61,155,255," + .55*p + ")"); gr.addColorStop(1, "rgba(61,155,255,0)");
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(H0.x, H0.y, H0.r*2.2, 0, 6.283); ctx.fill();
    }
    for(const b of bodies) if(b.on) drawLogo(b);
    ctx.fillStyle = "#eaf6ff";
    for(const p of puffs){ ctx.globalAlpha = Math.max(0, 1 - p.age/p.life); ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }
    ctx.globalAlpha = 1;
  }
  let raf = 0, stopped = false;
  if(reduced()){
    for(let t = 0; t < 3; t += 1/120) step(1/120, t);
    puffs.length = 0;
    const paint = () => { if(!stopped) draw(0); };
    paint(); [...new Set(bodies.map(b => img(b.t)))].forEach(i => i.complete || i.addEventListener("load", paint, { once: true }));
    return { stop(){ stopped = true; } };
  }
  const t0 = performance.now(); let last = t0, acc = 0;
  function frame(now){
    if(stopped) return;
    const t = (now - t0)/1000; acc += Math.min(.1, (now - last)/1000); last = now;
    while(acc >= 1/120){ step(1/120, t); acc -= 1/120; }
    for(let i = puffs.length - 1; i >= 0; i--){ const p = puffs[i]; p.age += 1/60; p.vy += 900/60; p.x += p.vx/60; p.y = Math.min(floor, p.y + p.vy/60); if(p.age > p.life) puffs.splice(i, 1); }
    draw(t);
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  return { stop(){ stopped = true; cancelAnimationFrame(raf); } };
}

P.p26rain = { run, preload, img, TEAMS };
})();
