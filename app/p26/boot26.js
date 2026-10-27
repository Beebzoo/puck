/* PUCK 26: the title screen and the arena around the app.
   - P.p26boot.scene(): the PRESS START screen, built from layers so it works at any
     size (phone portrait, tablet, desktop landscape): arena sky and crowd, light
     beams, the ice with its markings and the logo's reflection, the stacked chrome
     logo, a stick that sweeps the puck to centre ice, a snow spray, dust in the beams
     and a glint over the chrome. start(el) runs the canvas; it stops when el leaves.
   - P.p26boot.arena(): the arena behind the 520 px app column on wide screens
     (crowd, beams, ice, the ribbon board with the 32 teams).
   Everything is DOM + CSS (app/p26/p26.css, "boot" and "arena"); one small canvas for
   the snow, the dust and the camera flashes. Respects prefers-reduced-motion. */
(function(){
const P = window.PUCK, D = P.d26, LOGO = window.PUCK_LOGOS;
const reduced = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const TEAMS = ["ANA","BOS","BUF","CAR","CBJ","CGY","CHI","COL","DAL","DET","EDM","FLA","LAK","MIN","MTL","NJD","NSH","NYI","NYR","OTT","PHI","PIT","SEA","SJS","STL","TBL","TOR","UTA","VAN","VGK","WPG","WSH"];

/* a hockey stick, blade to the right, drawn upright: the top of the shaft is the pivot */
function stick(){
  return '<svg viewBox="0 0 120 640" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>' +
    '<linearGradient id="bsk" x1="0" x2="1"><stop offset="0" stop-color="#0b0f15"/><stop offset=".35" stop-color="#3a4452"/><stop offset=".55" stop-color="#151a22"/><stop offset="1" stop-color="#05070a"/></linearGradient>' +
    '<linearGradient id="bsb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2a313b"/><stop offset="1" stop-color="#07090c"/></linearGradient></defs>' +
    '<rect x="53" y="0" width="14" height="60" rx="3" fill="#e8eef4"/><path d="M53 12 H67 M53 26 H67 M53 40 H67" stroke="#b8c4cf" stroke-width="1.4"/>' +
    '<rect x="54" y="58" width="12" height="520" fill="url(#bsk)"/><rect x="57" y="70" width="2" height="500" fill="#ff6a1a" opacity=".85"/>' +
    '<path d="M54 572 L66 572 L68 600 Q70 622 92 624 L118 626 Q120 640 104 640 L70 639 Q52 638 52 612 Z" fill="url(#bsb)"/>' +
    '<path d="M60 606 L66 606 Q69 626 92 628 L116 630" stroke="#f4f8ff" stroke-width="7" fill="none" opacity=".9" stroke-dasharray="3 2"/></svg>';
}

/* the boot screen: returns the inner HTML of the .p26-boot button */
function scene(logoSVG, reflSVG){
  const puck = D.puck();
  return '<div class="bt-sky"></div><div class="bt-crowd"></div>' +
    '<div class="bt-ice"><i class="bt-lines"></i><i class="bt-blue"></i><i class="bt-red"></i><i class="bt-circle"></i><div class="bt-refl">' + (reflSVG || "") + '</div></div>' +
    '<div class="bt-boards"><i></i></div>' +
    '<div class="bt-beams"><i></i><i></i><i></i><i></i></div>' +
    '<svg class="bt-swoosh" viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="btsw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2f8fff" stop-opacity="0"/><stop offset=".45" stop-color="#2f8fff" stop-opacity=".9"/><stop offset="1" stop-color="#9fe0ff" stop-opacity=".2"/></linearGradient></defs>' +
    '<path class="glow" d="M-20 690 Q480 760 1020 330" fill="none" stroke="url(#btsw)" stroke-width="18" vector-effect="non-scaling-stroke" pathLength="1"/>' +
    '<path class="core" d="M-20 690 Q480 760 1020 330" fill="none" stroke="#e9f7ff" stroke-width="2" vector-effect="non-scaling-stroke" pathLength="1"/></svg>' +
    '<canvas class="bt-fx" aria-hidden="true"></canvas>' +
    '<div class="bt-logo">' + logoSVG + '<i class="bt-flare"></i></div>' +
    '<div class="bt-puck"><i class="bt-trail"></i>' + puck + '</div>' +
    '<div class="bt-stick">' + stick() + '</div>' +
    '<div class="bt-press"><span>PRESS START</span></div>' +
    '<div class="bt-copy">© 2026 FELIX · ALEJANDRO · MARTIJN · MCJESUS</div><div class="bt-vig"></div>';
}

/* the canvas: snow off the puck when it stops, ice dust drifting in the beams, camera flashes */
function start(el){
  const cv = el.querySelector(".bt-fx"); if(!cv || reduced()) return;
  const ctx = cv.getContext("2d");
  let W = 0, H = 0, dpr = 1;
  const size = () => { dpr = Math.min(2, window.devicePixelRatio || 1); W = el.clientWidth; H = el.clientHeight; cv.width = W*dpr; cv.height = H*dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  size(); window.addEventListener("resize", size);
  const hz = () => H*(W > H ? .66 : .62);               /* the horizon, as in the CSS */
  const puckY = () => hz() + (H - hz())*.3;
  const dust = [...Array(70)].map(() => ({ x: Math.random(), y: Math.random(), r: .4 + Math.random()*1.6, s: .004 + Math.random()*.012, p: Math.random()*6.28 }));
  const flashes = [];
  const pk = el.querySelector(".bt-puck");
  let off = 0, snow = [], t0 = performance.now(), sprayed = false, trailOn = false, raf = 0;
  function spray(){
    const cx = W/2, cy = puckY(), pw = Math.min(W*.34, H*.18);
    for(let i = 0; i < 170; i++){
      const a = -Math.PI*(.04 + Math.random()*.42), v = 120 + Math.pow(Math.random(), .7)*(520 + pw*2);
      snow.push({ x: cx + pw*.36 + Math.random()*pw*.12, y: cy + pw*.1 - Math.random()*pw*.12, vx: Math.cos(a)*v, vy: Math.sin(a)*v*.8, r: .6 + Math.random()*Math.random()*3.4, life: .6 + Math.random()*.9, age: 0, fl: Math.random()*pw*.3 });
    }
  }
  let last = t0;
  function frame(now){
    if(!document.body.contains(el)){ cancelAnimationFrame(raf); window.removeEventListener("resize", size); return; }
    /* follow the CSS clock (the puck's slide), so the spray lands when the puck stops even if the first frames were slow */
    const ref = pk && pk.getAnimations ? pk.getAnimations()[0] : null;
    const dt = Math.min(.05, (now - last)/1000); last = now;
    if(ref && ref.playState === "running" && ref.currentTime != null) off = ref.currentTime/1000 - (now - t0)/1000;
    const t = (now - t0)/1000 + off;
    ctx.clearRect(0, 0, W, H);
    /* dust in the beams: slow, faint, always */
    ctx.fillStyle = "#cfe6ff";
    for(const d of dust){
      d.y -= d.s*dt*6; d.p += dt*.8; if(d.y < -.02) d.y = 1.02;
      const x = d.x*W + Math.sin(d.p)*12, y = d.y*hz();
      ctx.globalAlpha = Math.min(1, t/1.2)*(.18 + .22*Math.sin(d.p*1.3)**2);
      ctx.beginPath(); ctx.arc(x, y, d.r, 0, 6.283); ctx.fill();
    }
    /* camera flashes in the crowd */
    if(t > 1.8 && Math.random() < dt*2.2) flashes.push({ x: Math.random()*W, y: hz()*(.55 + Math.random()*.38), age: 0 });
    for(let i = flashes.length - 1; i >= 0; i--){
      const f = flashes[i]; f.age += dt; if(f.age > .25){ flashes.splice(i, 1); continue; }
      const k = 1 - f.age/.25, g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 9);
      g.addColorStop(0, "rgba(255,255,255," + k + ")"); g.addColorStop(1, "rgba(200,225,255,0)");
      ctx.globalAlpha = 1; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, 9, 0, 6.283); ctx.fill();
    }
    /* shavings while the puck slides (0.72 s to 1.3 s), then the spray when it stops */
    if(t > .72 && t < 1.28){
      const k = (t - .72)/.56, e = 1 - Math.pow(1 - k, 3), pw = Math.min(W*.34, H*.18);
      const x = W*.2 + (W*.5 - W*.2)*e - pw*.3, y = puckY() + pw*.16;
      for(let i = 0; i < 3; i++) snow.push({ x: x + Math.random()*10, y: y - Math.random()*6, vx: -40 - Math.random()*80, vy: -30 - Math.random()*60, r: .5 + Math.random()*1.4, life: .4 + Math.random()*.3, age: 0, fl: Math.random()*12 });
    }
    if(!sprayed && t > 1.26){ sprayed = true; spray(); }
    ctx.fillStyle = "#fff";
    for(let i = snow.length - 1; i >= 0; i--){
      const s = snow[i]; s.age += dt; if(s.age > s.life){ snow.splice(i, 1); continue; }
      s.vy += 900*dt; s.vx *= 1 - 1.6*dt; s.x += s.vx*dt; s.y += s.vy*dt;
      const floor = puckY() + Math.min(W*.34, H*.18)*.12 + s.fl;
      if(s.y > floor){ s.y = floor; s.vy *= -.25; s.vx *= .6; s.life = Math.min(s.life, s.age + .3); }
      ctx.globalAlpha = (1 - s.age/s.life)*.95; ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
}

/* the arena behind the app column on wide screens: one fixed layer, CSS-animated */
function arena(){
  const a = document.createElement("div");
  a.className = "p26-arena"; a.setAttribute("aria-hidden", "true");
  const ribbon = TEAMS.map(t => '<img src="' + LOGO.dark[t] + '" alt="" loading="lazy" decoding="async">').join("");
  a.innerHTML = '<div class="ar-sky"></div><div class="ar-tiers"></div><div class="ar-crowd"></div><div class="ar-ribbon"><div>' + ribbon + ribbon + '</div></div>' +
    '<div class="ar-ice"><i class="bt-lines"></i><i class="bt-blue"></i><i class="bt-red"></i><i class="fc l"></i><i class="fc r"></i></div><div class="ar-rig"></div>' +
    '<div class="ar-beams"><i></i><i></i><i></i><i></i></div><div class="ar-vig"></div>';
  return a;
}

P.p26boot = { scene, start, arena, stick, TEAMS };
})();
