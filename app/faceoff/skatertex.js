/* PUCK: the skaters' textures and their one material (three.js r128, plain script, no modules).
   Read by app/faceoff/skater3d.js, which builds the geometry against the atlas layout below.

   FOUR KINDS OF TEXTURE, so a team shares almost everything:
   - the TEAM MAP (1024x1024, one per team): the sweater, sleeves, pants, socks, helmet, gloves and
     skates in the team's colours, painted from its row in app/assets/kits.js. No names, no numbers.
   - the MAN MAP (512x512, one per man): his name and number in tackle twill for the back, the sleeve
     numbers, the sticker on the back of his helmet, his face, his stick. The shader lays it over the
     team map through five boxes (atlas rectangle -> man rectangle), so it costs one more sample.
   - the GEAR NORMAL MAP (1024x1024, one for everyone): folds and wrinkles at the waist, the back, the
     armpits and the elbows, the seams and the hem stitching, the padded panels of the pants, the vents
     and ridges of the helmet, the rolls of the gloves, the boot's stitching. Generated once, in JS,
     from height fields over the layout; its AO goes into ORM.
   - ORM (512, everyone: occlusion, roughness, metal) and MASK (512, everyone: clearcoat, cloth sheen,
     which knit, raised appliqué).
   The fine knit itself (air-knit dimples, the mesh panels under the arms, the rib of the socks, satin
   stitch on the crest, twill on the numbers) is procedural in the shader and fades out with distance.

   ONE MATERIAL per man (MeshPhysicalMaterial: clearcoat on the helmet, the visor, the boots), so it
   stays one draw call per man per pass. */
(function(){
'use strict';
const P = window.PUCK = window.PUCK || {};
const ATL = 1024, MAN = 512;
/* the atlas, in pixels (x right, y down) */
const L = {
  torso: [0, 0, 1024, 512], upper: [0, 512, 384, 256], fore: [384, 512, 384, 256],
  boot: [768, 512, 128, 128], sw: [896, 512, 128, 128], glove: [768, 640, 256, 128],
  leg: [0, 768, 256, 256], waist: [256, 768, 128, 96], stick: [256, 864, 128, 32],
  blob: [256, 896, 64, 64], snow: [320, 896, 64, 64], vis: [256, 960, 64, 64], lace: [320, 960, 64, 64],
  sock: [384, 768, 128, 256], face: [512, 768, 256, 256], helm: [768, 768, 256, 256]
};
/* small solid swatches, 32 px, in the bottom right corner */
const SW = { liner: 0, steel: 1, holder: 2, strap: 3, collar: 4, rivet: 5, cup: 6, palm: 7, tongue: 8, fstrap: 9, visEdge: 10, earHole: 11, sole: 12, knit: 13, black: 14, white: 15 };
const swPx = i => [L.sw[0] + (i % 4)*32, L.sw[1] + Math.floor(i/4)*32];
const clamp = (t, a = 0, b = 1) => t < a ? a : t > b ? b : t;
const lerp = (a, b, t) => a + (b - a)*t;
const sst = (a, b, x) => { const t = clamp((x - a)/(b - a)); return t*t*(3 - 2*t); };
const TAU = Math.PI*2, PI = Math.PI;
/* (u, v) in a rectangle, v up, -> atlas uv */
const rect = r => (u, v) => [(r[0] + .75 + clamp(u)*(r[2] - 1.5))/ATL, 1 - (r[1] + .75 + (1 - clamp(v))*(r[3] - 1.5))/ATL];
const swUV = i => { const [x, y] = swPx(i); return [(x + 16)/ATL, 1 - (y + 16)/ATL]; };

P.skaterTex = function(T3, C){
const R = {}; for(const k of Object.keys(L)) R[k] = rect(L[k]);
const hexOf = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : '#111111';
const rgbOf = hex => { const n = parseInt(hexOf(hex).slice(1), 16); return [n >> 16, n >> 8 & 255, n & 255]; };
const lum = hex => { const [r, g, b] = rgbOf(hex); return (.299*r + .587*g + .114*b)/255; };
const shade = (hex, k) => { const c = rgbOf(hex).map(v => Math.round(clamp(k > 0 ? v + (255 - v)*k : v*(1 + k), 0, 255))); return 'rgb(' + c.join(',') + ')'; };
let sd = 1; const rnd = () => (sd = (sd*16807) % 2147483647)/2147483647;
const seed = s => { sd = (s >>> 0) % 2147483646 + 1; };

/* ---- the sweater's numbers: where kits.js and rink3d.js put them ---- */
const TOT = C.PROF.total, SH = C.SHOULDER_CM;
const TY = 512/TOT, TXs = 1024/(TAU*29);
const UPY = 128/33, UPX = 256/(TAU*8.2);
const ASX = L.upper[2]/256, ASY = L.upper[3]/128;   /* the arm painters draw 256x128; the atlas holds them at this scale */
const slvX = L.upper[0] + 64*ASX, slvY = L.upper[1] + (128 - 10.5*UPY)*ASY;
const yT = cm => 512 - cm*TY;
/* the boxes: atlas rectangle -> where it sits in the man map, and at what scale */
const nameY = yT(SH - 9), numY = yT(SH - 31);
const backTop = Math.max(0, Math.round(nameY - 6.4*TY/2 - 22));
const BOX = [
  { k: 'back', a: [608, backTop, 320, 256], m: [0, 0], sx: 1, sy: 1 },
  { k: 'sleeve', a: [Math.round(slvX - 80), Math.round(slvY - 48), 160, 96], m: [320, 0], sx: 1, sy: 1 },
  /* the helmet's square is stretched (3.3 px/cm round, 11.6 up): its box evens that out */
  { k: 'helm', a: [L.helm[0] + 192 - 32, L.helm[1] + 150, 64, 80], m: [320, 96], sx: 3, sy: 1.8 },
  { k: 'face', a: L.face.slice(), m: [0, 256], sx: 1, sy: 1 },
  { k: 'stick', a: L.stick.slice(), m: [256, 256], sx: 2, sy: 2 }
];
const boxR = BOX.map(b => new T3.Vector4(b.a[0]/ATL, 1 - (b.a[1] + b.a[3])/ATL, (b.a[0] + b.a[2])/ATL, 1 - b.a[1]/ATL));
const boxT = BOX.map(b => new T3.Vector4(ATL*b.sx/MAN, ATL*b.sy/MAN, (b.m[0] - b.a[0]*b.sx)/MAN, 1 - (b.m[1] + (ATL - b.a[1])*b.sy)/MAN));

/* the helmet's vents: u, v (helmet square), half width, half height, turn */
const VENTS = [[.21, .74, .018, .09, 0], [.29, .74, .018, .09, 0], [.135, .6, .016, .11, .5], [.365, .6, .016, .11, -.5], [.65, .72, .016, .1, -.4], [.85, .72, .016, .1, .4], [.7, .5, .02, .07, 0], [.8, .5, .02, .07, 0], [.75, .9, .05, .03, 0]];
/* ===================================== GLOBAL MAPS =====================================
   Height fields in atlas pixels (so the slopes are true), region by region. */
let GLOBAL = null;
function globalMaps(){
  if(GLOBAL) return GLOBAL;
  const t0 = performance.now();
  const N = ATL, M2 = N/2;
  /* ---- 1. the line work, drawn: seams, stitching, panel lines, vents, eyelets. Grey 128 is flat;
     lighter is higher. In atlas pixels. ---- */
  const cv = document.createElement('canvas'); cv.width = cv.height = N;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, N, N);
  const grey = v => 'rgb(' + v + ',' + v + ',' + v + ')';
  const path = (pts, close) => { g.beginPath(); pts.forEach((p, k) => g[k ? 'lineTo' : 'moveTo'](p[0], p[1])); if(close) g.closePath(); };
  /* a seam: raised cloth either side of a sunk line */
  const seam = (pts, k = 1) => { g.setLineDash([]); g.lineCap = 'round'; g.lineJoin = 'round'; path(pts); g.strokeStyle = grey(128 + Math.round(22*k)); g.lineWidth = 5.5; g.stroke(); g.strokeStyle = grey(128 - Math.round(48*k)); g.lineWidth = 1.7; g.stroke(); };
  /* a run of stitching: a dashed groove */
  const stitch = (pts, k = 1, dash = [2.2, 1.4]) => { g.lineCap = 'butt'; g.setLineDash(dash); path(pts); g.strokeStyle = grey(128 - Math.round(40*k)); g.lineWidth = 1.15; g.stroke(); g.setLineDash([]); };
  const hline = (x0, x1, y) => [[x0, y], [x1, y]], vline = (x, y0, y1) => [[x, y0], [x, y1]];
  const [tX, tY, tW, tH] = L.torso, cmY = cm => tY + tH - cm*TY;
  /* the sweater: side seams, raglan seams from the collar to the armpits, the hem's two rows of stitching, the collar seam */
  for(const u of [0, .5, 1]) seam(vline(u*tW, tY, tY + tH), .9);
  for(const [uc, us] of [[.25, 0], [.25, .5], [.75, .5], [.75, 1]]){
    const pts = []; for(let k = 0; k <= 16; k++){ const s = k/16, cm = lerp(TOT - 2, SH - 21, s), ux = lerp(uc + (us > uc ? .075 : -.075), us, Math.pow(s, .8)); pts.push([ux*tW, cmY(cm)]); }
    seam(pts, .8);
  }
  stitch(hline(0, tW, cmY(1.4))); stitch(hline(0, tW, cmY(2.4)));
  g.fillStyle = grey(112); g.fillRect(0, cmY(3.3), tW, 2);
  g.fillStyle = grey(110); g.fillRect(0, cmY(TOT - 4.2), tW, 3);
  /* the sleeves: the seam inside the arm, the armhole's ring, the cuff's stitching */
  for(const [r, upper] of [[L.upper, true], [L.fore, false]]){
    const [x0, y0, w, h] = r;
    seam(vline(x0 + .75*w, y0, y0 + h), .8);
    if(upper){ g.fillStyle = grey(104); g.fillRect(x0, y0 + h - 9, w, 3); }
    else { stitch(hline(x0, x0 + w, y0 + 7)); stitch(hline(x0, x0 + w, y0 + 12)); }
  }
  /* the pants: quilting lines, side seams, the stripe's piping, the hem's roll */
  { const [x0, y0, w, h] = L.leg;
    for(const v of [.38, .66]) seam(hline(x0, x0 + w, y0 + (1 - v)*h), 1.1);
    for(const u of [0, .5, 1]) seam(vline(x0 + u*w, y0, y0 + h), 1.1);
    for(const dx of [-9.5, 9.5]){ g.fillStyle = grey(144); g.fillRect(x0 + .25*w + dx - .7, y0, 1.4, h); }
    g.fillStyle = grey(160); g.fillRect(x0, y0 + h - 9, w, 6); g.fillStyle = grey(96); g.fillRect(x0, y0 + h - 13, w, 1.6);
    stitch(hline(x0, x0 + w, y0 + h - 15)); }
  { const [x0, y0, w, h] = L.waist; seam(vline(x0 + .75*w, y0, y0 + h)); seam(vline(x0 + .25*w, y0, y0 + h), .6); g.fillStyle = grey(110); g.fillRect(x0, y0 + 8, w, 2); }
  /* the socks: a seam up the back */
  { const [x0, y0, w, h] = L.sock; seam(vline(x0 + .75*w, y0, y0 + h), .7); }
  /* the helmet: vents (a bevelled rim, a deep hole), the joint of the two shells, the brow rib, panel lines, the rear adjuster */
  const [hX, hY, hW, hH] = L.helm, HU = u => hX + u*hW, HV = v => hY + (1 - v)*hH;
  for(const [u, v, hu, hv, r] of VENTS){
    g.save(); g.translate(HU(u), HV(v)); g.rotate(-r*.25);
    g.fillStyle = grey(160); g.beginPath(); g.ellipse(0, 0, hu*hW + 2.2, hv*hH + 2.2, 0, 0, TAU); g.fill();
    g.fillStyle = grey(70); g.beginPath(); g.ellipse(0, 0, hu*hW + .6, hv*hH + .6, 0, 0, TAU); g.fill();
    g.fillStyle = grey(20); g.beginPath(); g.ellipse(0, 0, hu*hW - 1.2, hv*hH - 1.2, 0, 0, TAU); g.fill();
    g.restore();
  }
  for(const ug of [.06, .44]){ const pts = []; for(let k = 0; k <= 10; k++){ const v = k/10*.82; pts.push([HU(ug + .05*sst(.2, .8, v)), HV(v)]); } seam(pts, 1.3); }
  g.fillStyle = grey(150); g.fillRect(HU(.12), HV(.28), .26*hW, 2.4);
  for(const ur of [.17, .33]){ g.fillStyle = grey(146); g.fillRect(HU(ur) - 2.5, HV(1), 1.6, hH*.55); g.fillStyle = grey(108); g.fillRect(HU(ur) + .5, HV(1), 1.4, hH*.55); }
  g.fillStyle = grey(165); g.fillRect(hX, hY + hH - 4, hW, 4);
  /* the gauntlet: three panels, the rolled edge, two rows of stitches; the hand's rolls */
  { const [x0, y0] = L.glove;
    for(const u of [.1, .43, .76]) seam(vline(x0 + u*256, y0, y0 + 64), 1.1);
    g.fillStyle = grey(170); g.fillRect(x0, y0 + 64 - 7, 256, 5);
    stitch(hline(x0, x0 + 256, y0 + 64 - 14)); stitch(hline(x0, x0 + 256, y0 + 14));
    for(let k = 0; k <= 6; k++) seam(vline(x0 + k*256/6, y0 + 64, y0 + 128), 1.2); }
  /* the boot: the quarter panel's double stitching, eyelets, the laces crossing over the tongue, the toe cap */
  { const [x0, y0, w, h] = L.boot, BU = u => x0 + u*w, BV = v => y0 + (1 - v)*h;
    for(const dv of [0, .03]){ const pts = []; for(let k = 0; k <= 24; k++){ const u = k/24; pts.push([BU(u), BV(.29 + dv + .1*Math.cos((u - .25)*TAU))]); } stitch(pts, 1.2, [1.8, 1.2]); }
    for(let r = 0; r < 7; r++){ const v = .38 + (r + .5)/7*.62;
      for(const s of [-1, 1]){ g.fillStyle = grey(165); g.beginPath(); g.arc(BU(.25 + s*.085), BV(v), 2.8, 0, TAU); g.fill(); g.fillStyle = grey(60); g.beginPath(); g.arc(BU(.25 + s*.085), BV(v), 1.4, 0, TAU); g.fill(); }
      const v0 = .38 + r/7*.62, v1 = v0 + .62/7; g.strokeStyle = grey(178); g.lineWidth = 2.2; g.beginPath(); g.moveTo(BU(.165), BV(v0)); g.lineTo(BU(.335), BV(v1)); g.moveTo(BU(.335), BV(v0)); g.lineTo(BU(.165), BV(v1)); g.stroke(); }
    g.fillStyle = grey(150); g.beginPath(); g.ellipse(BU(.25), BV(.08), .1*w, .2*h, 0, 0, TAU); g.fill(); }
  /* the stick's tape: wound on a slant */
  { const [x0, y0, w, h] = L.stick; g.save(); g.beginPath(); g.rect(x0, y0, w*.09, h); g.rect(x0 + w*.91, y0, w*.09, h); g.clip();
    g.strokeStyle = grey(100); g.lineWidth = 1; for(let x = x0 - 30; x < x0 + w; x += 2.6){ g.beginPath(); g.moveTo(x, y0); g.lineTo(x + 10, y0 + h); g.stroke(); } g.restore(); }
  /* the laces at the throat, the collar's rib */
  { const [x0, y0] = L.lace; g.strokeStyle = grey(150); g.lineWidth = 1.4; for(let y = y0; y < y0 + 64; y += 3){ g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + 64, y + 2); g.stroke(); } }
  { const [px, py] = swPx(SW.collar); g.fillStyle = grey(150); for(let x = px; x < px + 32; x += 2) g.fillRect(x, py, 1, 32); }
  const line = g.getImageData(0, 0, N, N).data;

  /* ---- 2. the cloth's folds, computed at half size with tables (no trigonometry per pixel) ---- */
  const SL = new Float32Array(4096); for(let k = 0; k < 4096; k++) SL[k] = Math.sin(k/4096*TAU);
  const fsin = x => SL[((x*651.8986) | 0) & 4095], fold = x => Math.abs(fsin(x));
  const NG = new Float32Array(64*64); seed(1234); for(let k = 0; k < NG.length; k++) NG[k] = rnd();
  const nz = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx*fx*(3 - 2*fx), v = fy*fy*(3 - 2*fy), a = xi & 63, b = (xi + 1) & 63, c = (yi & 63)*64, d = ((yi + 1) & 63)*64;
    return (NG[c + a]*(1 - u) + NG[c + b]*u)*(1 - v) + (NG[d + a]*(1 - u) + NG[d + b]*u)*v; };
  const fbm = (x, y) => nz(x, y)*.65 + nz(x*2.1 + 5.2, y*2.1 + 1.3)*.35;
  const g2 = (d, w) => { const t = d/w; return t*t > 9 ? 0 : Math.exp(-t*t); };
  const HF = new Float32Array(M2*M2), AOh = new Float32Array(M2*M2).fill(1);
  /* fn(u, v, x, y) -> height in atlas pixels, on the half grid; ao(u, v) optional */
  const fieldIn = (r, fn) => { const x0 = r[0] >> 1, y0 = r[1] >> 1, w = r[2] >> 1, h = r[3] >> 1;
    for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){ const o = fn((x + .5)/w, 1 - (y + .5)/h, x*2, y*2); HF[(y0 + y)*M2 + x0 + x] = o[0]; if(o.length > 1) AOh[(y0 + y)*M2 + x0 + x] = o[1]; } };
  /* the sweater: blousing at the waist, drape off the pads, the armpits' fans, the small of the back */
  const PITS = [0, .5, 1].map(us => ({ us }));
  fieldIn(L.torso, (u, v) => {
    const cm = v*TOT, side = Math.min(u, Math.abs(u - .5), 1 - u), sideW = Math.min(1, side/.1);
    let h = 0, ao = 1;
    const wv = cm/3.4 + 1.3*fsin(u*TAU*3 + .7) + .7*fsin(u*TAU*7 + 2.1) + 2.4*fbm(u*9, cm*.12) + .8*fsin(u*TAU*13 + cm*.3);
    const wa = .25 + 1.1*fbm(u*6 + 3.1, cm*.08 + 1.7);
    h += 2.8*wa*sst(26, 14, cm)*sst(1, 6, cm)*(fold(wv*PI*.5) - .6);
    const dr = u*TAU*9 + 1.2*fsin(cm*.11 + u*20) + 1.6*fbm(u*16, cm*.05);
    const de = sst(SH - 40, SH - 12, cm)*sst(SH + 4, SH - 6, cm);
    if(de > 0) h += 2.2*de*(.35 + .65*sideW)*(fold(dr*.5) - .6);
    for(const pt of PITS){
      const du = (u - pt.us)*TAU*29, dc = cm - (SH - 12);
      if(Math.abs(du) > 26 || dc > 8 || dc < -26) continue;
      const r = Math.sqrt(du*du + dc*dc), w = g2(r, 10)*sst(1.5, 5, r)*sst(8, 0, dc);
      h += 2.6*w*(fold(Math.atan2(dc, du)*4.5) - .5); ao *= 1 - .3*g2(r, 8);
    }
    const bk = g2(cm - 30, 5)*g2(Math.abs(u - .75)*30, 4);
    if(bk > 0) h += 1.4*bk*(fold(cm*.9) - .5);
    ao *= .86 + .14*sst(0, 3.5, cm);
    return [h, ao];
  });
  for(const [r, upper] of [[L.upper, true], [L.fore, false]]) fieldIn(r, (u, v) => {
    const dIn = Math.abs(u - .75), e = upper ? sst(.55, 1, v) : sst(.45, 0, v);
    const ph = (upper ? v : -v)*15 + 1.4*fsin(u*TAU*2 + .5) + 1.2*fbm(u*8, v*3);
    let h = 2.8*e*(fold(ph*PI*.5) - .55)*(.6 + .4*g2(dIn*4, 1));
    h += 1.2*(fold(u*TAU*3 + 2*fbm(u*6, v*2)) - .5)*(1 - e);
    let ao = 1 - .28*e*g2(dIn*3.4, 1);
    if(upper) ao *= .8 + .2*sst(0, .12, v);
    return [h, ao];
  });
  fieldIn(L.leg, (u, v) => {
    const bands = [0, .38, .66, 1]; let bi = 0; while(bi < 2 && v > bands[bi + 1]) bi++;
    const vb = (v - bands[bi])/(bands[bi + 1] - bands[bi]);
    const pil = Math.max(0, fsin(clamp(vb)*PI)*fsin(clamp((u % .5)/.5)*PI)), sp = Math.sqrt(pil);
    let h = 3.4*sp + 1.4*sst(.75, 1, v)*(fold(u*TAU*4 + v*9 + 2*fbm(u*7, v*3)) - .5);
    return [h, (.55 + .45*Math.sqrt(sp))*(.8 + .2*sst(0, .1, v))];
  });
  fieldIn(L.waist, (u, v) => [1.6*(fold(u*TAU*5 + 3*fbm(u*5, v)) - .5)*sst(.5, 1, v), .7 + .3*sst(0, .5, v)]);
  fieldIn(L.sock, (u, v) => { const a = sst(.18, 0, v), k = sst(.82, 1, v); return [2*(a + .6*k)*(fold(v*40 + 2*fsin(u*TAU*2) + 1.5*fbm(u*6, v*4)) - .5), .78 + .22*sst(0, .12, v)]; });
  fieldIn(L.face, (u, v, x, y) => [.35*fbm(x*.18, y*.18), 1]);
  fieldIn(L.helm, (u, v, x, y) => [.15*fbm(x*.3, y*.3), .82 + .18*sst(0, .08, v)]);
  fieldIn([L.glove[0], L.glove[1], 256, 64], (u, v, x, y) => [.3*fbm(x*.25, y*.25), .75 + .25*sst(0, .2, v)]);
  fieldIn([L.glove[0], L.glove[1] + 64, 256, 64], (u, v, x, y) => { const p = Math.sqrt(Math.abs(fsin(u*PI*6))); return [2.2*p + .3*fbm(x*.25, y*.25), .7 + .3*Math.sqrt(p)]; });
  fieldIn(L.boot, (u, v, x, y) => [.2*fbm(x*.3, y*.3), .7 + .3*sst(0, .15, v)]);
  fieldIn(L.stick, (u, v, x, y) => [0, 1]);

  /* ---- 3. the regions, so no slope or blur runs across an edge of the atlas's islands ---- */
  const REG = new Uint8Array(N*N);
  const RECTS = [L.torso, L.upper, L.fore, L.leg, L.waist, L.stick, L.blob, L.snow, L.vis, L.lace, L.sock, L.face, L.helm, [L.glove[0], L.glove[1], 256, 64], [L.glove[0], L.glove[1] + 64, 256, 64], L.boot];
  Object.values(SW).forEach(j => { const [x, y] = swPx(j); RECTS.push([x, y, 32, 32]); });
  RECTS.forEach((r, k) => { for(let y = r[1]; y < r[1] + r[3]; y++) REG.fill(k + 1, y*N + r[0], y*N + r[0] + r[2]); });

  /* ---- 4. height = line work + folds (bilinear up from the half grid) ---- */
  const H = new Float32Array(N*N);
  for(let y = 0; y < N; y++){
    const fy = Math.min(M2 - 1.001, Math.max(0, y/2 - .25)), y0 = fy | 0, ty = fy - y0;
    for(let x = 0; x < N; x++){
      const fx = Math.min(M2 - 1.001, Math.max(0, x/2 - .25)), x0 = fx | 0, tx = fx - x0, a = y0*M2 + x0;
      const f = (HF[a]*(1 - tx) + HF[a + 1]*tx)*(1 - ty) + (HF[a + M2]*(1 - tx) + HF[a + M2 + 1]*tx)*ty;
      const i = y*N + x;
      H[i] = (line[i*4] - 128)/16 + f;
    }
  }
  /* ---- 5. normals (Sobel-ish, no slope across a region's edge) and the creases' occlusion ---- */
  const nrm = new Uint8Array(N*N*4);
  const blur = new Float32Array(N*N), tmp = new Float32Array(N*N), BR = 5, BW = 1/(2*BR + 1);
  for(let y = 0; y < N; y++){ const o = y*N; let acc = 0; for(let x = -BR; x <= BR; x++) acc += H[o + (x < 0 ? 0 : x)]; for(let x = 0; x < N; x++){ tmp[o + x] = acc*BW; acc += H[o + (x + BR + 1 < N ? x + BR + 1 : N - 1)] - H[o + (x - BR > 0 ? x - BR : 0)]; } }
  for(let x = 0; x < N; x++){ let acc = 0; for(let y = -BR; y <= BR; y++) acc += tmp[(y < 0 ? 0 : y)*N + x]; for(let y = 0; y < N; y++){ blur[y*N + x] = acc*BW; acc += tmp[(y + BR + 1 < N ? y + BR + 1 : N - 1)*N + x] - tmp[(y - BR > 0 ? y - BR : 0)*N + x]; } }
  const CAV = new Float32Array(N*N);
  for(let y = 0; y < N; y++) for(let x = 0; x < N; x++){
    const i = y*N + x, r = REG[i], h0 = H[i];
    const il = x > 0 && REG[i - 1] === r ? i - 1 : i, ir = x < N - 1 && REG[i + 1] === r ? i + 1 : i;
    const iu = y > 0 && REG[i - N] === r ? i - N : i, id = y < N - 1 && REG[i + N] === r ? i + N : i;
    const dx = (H[ir] - H[il])/((ir - il) || 1), dy = (H[id] - H[iu])/(((id - iu)/N) || 1);
    let nx = -dx, ny = dy; const l = 1/Math.sqrt(nx*nx + ny*ny + 1);
    const o = ((N - 1 - y)*N + x)*4;
    nrm[o] = (nx*l*.5 + .5)*255 + .5; nrm[o + 1] = (ny*l*.5 + .5)*255 + .5; nrm[o + 2] = (l*.5 + .5)*255 + .5; nrm[o + 3] = 255;
    const c = (blur[i] - h0)*.09; CAV[i] = r ? (c < 0 ? 1 : c > .45 ? .55 : 1 - c) : 1;
  }
  /* ---- 6. ORM (occlusion, roughness, metal) and MASK (clear coat, sheen, knit, appliqué), at half size ---- */
  const orm = new Uint8Array(M2*M2*4), msk = new Uint8Array(M2*M2*4);
  const put = (r, ro, me, cc, sh, kn, ap = 0) => { const x0 = r[0] >> 1, y0 = r[1] >> 1, w = Math.max(1, r[2] >> 1), h = Math.max(1, r[3] >> 1);
    for(let y = y0; y < y0 + h; y++) for(let x = x0; x < x0 + w; x++){ const o = ((M2 - 1 - y)*M2 + x)*4; orm[o + 1] = ro*255; orm[o + 2] = me*255; msk[o] = cc*255; msk[o + 1] = sh*255; msk[o + 2] = kn*255; msk[o + 3] = ap*255; } };
  /* (roughness, metal, clear coat, sheen, knit: .33 air-knit, .67 mesh, 1 rib) */
  put(L.torso, .82, 0, 0, 1, .33); put(L.upper, .82, 0, 0, 1, .33); put(L.fore, .82, 0, 0, 1, .33);
  /* the mesh panels: down the sides under the arms, and the inside of the sleeve */
  for(const u of [0, .5, 1]) put([Math.max(0, u*1024 - 60), Math.round(cmY(SH - 6)), 120, Math.round(cmY(SH - 32) - cmY(SH - 6))], .84, 0, 0, 1, .67);
  for(const r of [L.upper, L.fore]) put([r[0] + Math.round(.75*r[2]) - 34, r[1] + (r === L.upper ? 0 : 136), 68, 120], .84, 0, 0, 1, .67);
  /* the crest is sewn on */
  { const cx = .25*1024, cy = cmY(SH - 23), hw = 34*TXs*.62, hh = 34*TXs*.5; put([Math.round(cx - hw), Math.round(cy - hh), Math.round(2*hw), Math.round(2*hh)], .8, 0, 0, 1, .33, 1); }
  put(L.leg, .6, 0, 0, .45, 0); put(L.waist, .6, 0, 0, .45, 0); put(L.sock, .9, 0, 0, .8, 1);
  put(L.face, .55, 0, 0, .15, 0); put(L.helm, .42, 0, 1, 0, 0);
  put([L.glove[0], L.glove[1], 256, 128], .55, 0, 0, .35, 0); put(L.boot, .4, 0, .45, 0, 0);
  put(L.stick, .32, 0, .7, 0, 0); put([L.stick[0], L.stick[1], 12, 32], .92, 0, 0, 0, 0); put([L.stick[0] + 116, L.stick[1], 12, 32], .92, 0, 0, 0, 0);
  put(L.blob, 1, 0, 0, 0, 0); put(L.snow, 1, 0, 0, 0, 0); put(L.vis, .04, 0, 1, 0, 0); put(L.lace, .85, 0, 0, .5, 0);
  const SWV = { liner: [.88, 0, 0, .2, 0], steel: [.22, 1, .3, 0, 0], holder: [.32, 0, .6, 0, 0], strap: [.7, 0, 0, .3, 0], collar: [.85, 0, 0, 1, 1], rivet: [.3, 1, 0, 0, 0], cup: [.3, 0, .8, 0, 0],
    palm: [.75, 0, 0, .3, 0], tongue: [.9, 0, 0, .6, 0], fstrap: [.8, 0, 0, .5, 0], visEdge: [.4, 0, .5, 0, 0], earHole: [.6, 0, 0, 0, 0], sole: [.5, 0, 0, 0, 0], knit: [.85, 0, 0, 1, 1], black: [.6, 0, .3, 0, 0], white: [.6, 0, 0, 0, 0] };
  for(const [k, j] of Object.entries(SW)){ const [x, y] = swPx(j); put([x, y, 32, 32], ...SWV[k]); }
  /* the occlusion: folds' own, the creases', the vents (dark, rough and not glossy inside) */
  for(let y = 0; y < M2; y++) for(let x = 0; x < M2; x++){
    const i = (2*y)*N + 2*x, cav = (CAV[i] + CAV[i + 1] + CAV[i + N] + CAV[i + N + 1])/4, o = ((M2 - 1 - y)*M2 + x)*4;
    let ao = AOh[y*M2 + x]*cav;
    if(REG[i] === 13 && line[i*4] < 50){ ao *= .35; orm[o + 1] = 230; msk[o] = 0; }
    orm[o] = clamp(ao)*255; orm[o + 3] = 255;
  }
  const dt = (data, n) => { const t = new T3.DataTexture(data, n, n, T3.RGBAFormat); t.generateMipmaps = true; t.minFilter = T3.LinearMipmapLinearFilter; t.magFilter = T3.LinearFilter; t.anisotropy = 4; t.needsUpdate = true; return t; };
  GLOBAL = { normal: dt(nrm, N), orm: dt(orm, M2), mask: dt(msk, M2), ms: Math.round(performance.now() - t0) };
  return GLOBAL;
}

/* ===================================== THE TEAM MAP ===================================== */
const logoImgs = {};
function logoOf(abbr, v, again){
  const k = abbr + (v === 'dark' ? '_dark' : '');
  const o = logoImgs[k] || (logoImgs[k] = { img: null, wait: [] });
  if(o.img) return o.img;
  if(again) o.wait.push(again);
  if(!o.loading){
    o.loading = true;
    const im = new Image();
    im.onload = () => { o.img = im; for(const f of o.wait.splice(0)) f(); };
    im.src = 'app/assets/teams/' + k + '.svg';
  }
  return null;
}
const teamCache = {};
function teamMap(abbr){
  if(teamCache[abbr]) return teamCache[abbr];
  let tex = null;
  const paint = g => paintTeam(g, abbr, () => { if(tex){ paint(tex.image.getContext('2d')); tex.needsUpdate = true; } });
  tex = C.paintTex(ATL, ATL, paint);
  return teamCache[abbr] = tex;
}
function paintTeam(g, abbr, again){
  const k = C.kitOf(abbr), crest = k.logo || abbr;
  g.clearRect(0, 0, ATL, ATL);
  /* the sweater and the sleeves, from rink3d.js's painters, without a name or a number */
  g.save(); g.beginPath(); g.rect(0, 0, 1024, 512); g.clip(); C.paintTorso(g, k, crest, '', ''); g.restore();
  g.save(); g.beginPath(); g.rect(...L.upper); g.clip(); g.translate(L.upper[0], L.upper[1]); g.scale(ASX, ASY); C.paintUpper(g, k, ''); g.restore();
  g.save(); g.beginPath(); g.rect(...L.fore); g.clip(); g.translate(L.fore[0], L.fore[1]); g.scale(ASX, ASY); C.paintFore(g, k); g.restore();
  /* knit cloth: a whisper of tone, the mesh panels under the arms a touch darker */
  seed(91); grain(g, 0, 0, 1024, 512, 5000, .035); grain(g, 0, 512, 768, 256, 2000, .035);
  paintLeg(g, k); paintWaist(g, k);
  g.save(); g.beginPath(); g.rect(...L.sock); g.clip(); g.translate(L.sock[0], L.sock[1]); g.scale(L.sock[2]/64, L.sock[3]/128); C.paintSocks(g, k); g.restore();
  grain(g, ...L.sock, 900, .04);
  g.fillStyle = '#c99a78'; g.fillRect(L.face[0], L.face[1], L.face[2], L.face[3]);
  paintHelmet(g, k, crest, again);
  paintGlove(g, k);
  paintBoot(g, k, abbr);
  g.fillStyle = '#222'; g.fillRect(L.stick[0], L.stick[1], L.stick[2], L.stick[3]);
  paintFX(g, k);
  const glv = k.glv || [k.helm || k.b, k.b], helm = k.helm || k.b, col = k.col || [k.b, '#ffffff'];
  const sw = { liner: '#151617', steel: '#c9d1d8', holder: (C.seedOf(abbr) >>> 3) & 1 ? '#e9ecef' : '#18191c', strap: '#141516', collar: col[0], rivet: '#b9c0c7', cup: '#e8eaec',
    palm: lum(glv[0]) > .6 ? '#c9b89a' : '#3d3a37', tongue: '#e9e9e6', fstrap: k.b, visEdge: '#1a1c1f', earHole: '#0c0c0d', sole: '#1c1d20', knit: k.b, black: '#121314', white: '#eef0f2' };
  for(const [name, j] of Object.entries(SW)){ const [x, y] = swPx(j); g.fillStyle = hexOf(sw[name]); g.fillRect(x, y, 32, 32); }
  void helm;
}
function grain(g, x0, y0, w, h, n, a){
  g.save(); g.globalAlpha = a;
  for(let k = 0; k < n; k++){ g.fillStyle = rnd() < .5 ? '#000' : '#fff'; g.fillRect(x0 + rnd()*w, y0 + rnd()*h, 1.5, 1.5); }
  g.restore();
}
/* the mesh under the arms: a fine darker dot screen */
function meshPanels(g){
  g.save();
  const panel = (x0, y0, w, h) => { g.globalAlpha = .07; g.fillStyle = '#000'; for(let y = y0; y < y0 + h; y += 2.4) for(let x = x0 + ((y/2.4) % 2)*1.2; x < x0 + w; x += 2.4) g.fillRect(x, y, 1.1, 1.1); };
  const top = yT(SH - 6), bot = yT(SH - 32);
  for(const u of [0, .5, 1]) panel(u*1024 - 60, top, 120, bot - top);
  for(const r of [L.upper, L.fore]) panel(r[0] + .75*r[2] - 34, r[1] + (r === L.upper ? 0 : 136), 68, 120);
  g.restore();
}
function paintLeg(g, k){
  const [c, s] = k.pants || ['#111111', null], x0 = L.leg[0], y0 = L.leg[1], w = L.leg[2], h = L.leg[3];
  g.fillStyle = hexOf(c); g.fillRect(x0, y0, w, h);
  if(s){
    g.fillStyle = hexOf(s); g.fillRect(Math.round(x0 + .25*w - 9), y0, 18, h*.96);
    g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(Math.round(x0 + .25*w - 10), y0, 1.2, h*.96); g.fillRect(Math.round(x0 + .25*w + 9), y0, 1.2, h*.96);
  }
  /* a little brand tab on the hem, the shell's ripstop */
  g.fillStyle = lum(c) > .5 ? 'rgba(0,0,0,.55)' : 'rgba(255,255,255,.75)'; g.fillRect(x0 + .25*w + 10, y0 + h - 26, 14, 5);
  g.save(); g.globalAlpha = .045; g.strokeStyle = lum(c) > .5 ? '#000' : '#fff'; g.lineWidth = .6;
  for(let x = x0; x < x0 + w; x += 4){ g.beginPath(); g.moveTo(x + .5, y0); g.lineTo(x + .5, y0 + h); g.stroke(); }
  for(let y = y0; y < y0 + h; y += 4){ g.beginPath(); g.moveTo(x0, y + .5); g.lineTo(x0 + w, y + .5); g.stroke(); }
  g.restore();
  seed(17); grain(g, x0, y0, w, h, 700, .04);
}
function paintWaist(g, k){
  const [c, s] = k.pants || ['#111111', null], x0 = L.waist[0], y0 = L.waist[1], w = L.waist[2], h = L.waist[3];
  g.fillStyle = hexOf(c); g.fillRect(x0, y0, w, h);
  if(s) for(const u of [0, .5, 1]){ g.fillStyle = hexOf(s); g.fillRect(x0 + u*w - 4.5, y0 + h*.05, 9, h*.95); }
  g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x0, y0, w, 8);
  seed(23); grain(g, x0, y0, w, h, 500, .04);
}
/* the helmet: shell colour, the vents' dark insides, the team's logo on both sides, the shield on the back */
function paintHelmet(g, k, crest, again){
  const [x0, y0, W, H] = L.helm, c = hexOf(k.helm || k.b);
  const X = u => x0 + u*W, Y = v => y0 + (1 - v)*H;
  g.fillStyle = c; g.fillRect(x0, y0, W, H);
  /* the shell is moulded, not flat: a touch lighter over the crown */
  const gr = g.createLinearGradient(0, Y(0), 0, Y(1)); gr.addColorStop(0, 'rgba(0,0,0,.12)'); gr.addColorStop(.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(255,255,255,.06)');
  g.fillStyle = gr; g.fillRect(x0, y0, W, H);
  /* the vents: foam liner black inside */
  for(const [u, v, hu, hv, r] of VENTS){
    g.save(); g.translate(X(u), Y(v)); g.rotate(-r*.25);
    g.fillStyle = '#0d0e10'; g.beginPath(); g.ellipse(0, 0, hu*W*.95, hv*H*.95, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(60,62,66,.8)'; g.beginPath(); g.ellipse(0, hv*H*.35, hu*W*.6, hv*H*.35, 0, 0, TAU); g.fill();
    g.restore();
  }
  /* the rubber trim round the bottom edge */
  g.fillStyle = '#111214'; g.fillRect(x0, y0 + H - 4, W, 4);
  /* the logo, on each side above the ear */
  const img = logoOf(crest, (k.crest && k.crest.v) || 'light', again);
  if(img) for(const u of [.02, .48]){
    const w = 22, h = w*(img.height || 1)/(img.width || 1)*3.5;
    g.drawImage(img, X(u) - w/2, Y(.5) - h/2, w, h);
  }
  /* the NHL shield sticker, low on the back */
  g.fillStyle = '#c9ced4'; g.beginPath(); g.moveTo(X(.75) - 2, Y(.085) - 7); g.lineTo(X(.75) + 2, Y(.085) - 7); g.lineTo(X(.75) + 2, Y(.085) + 3); g.lineTo(X(.75), Y(.085) + 7); g.lineTo(X(.75) - 2, Y(.085) + 3); g.closePath(); g.fill();
  g.fillStyle = '#16181b'; g.fillRect(X(.75) - 1.3, Y(.085) - 5, 2.6, 4);

}
function paintGlove(g, k){
  const [x0, y0, W, H] = L.glove, glv = k.glv || [k.helm || k.b, k.b], c0 = hexOf(glv[0]), c1 = hexOf(glv[1]);
  /* the gauntlet: main colour, a band of the second colour round the top, a white logo patch */
  g.fillStyle = c0; g.fillRect(x0, y0, W, 64);
  g.fillStyle = c1; g.fillRect(x0, y0 + 64 - 30, W, 15);
  g.fillStyle = shade(c0, -.35); g.fillRect(x0, y0 + 60, W, 4);
  g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(x0 + .25*W - 9, y0 + 12, 18, 7);
  g.fillStyle = c0; g.fillRect(x0 + .25*W - 7, y0 + 14, 14, 3);
  /* the hand: main colour, darker in the seams */
  g.fillStyle = c0; g.fillRect(x0, y0 + 64, W, 64);
  seed(5); grain(g, x0, y0, W, H, 1200, .05);
}
function paintBoot(g, k, abbr){
  const [x0, y0, W, H] = L.boot, X = u => x0 + u*W, Y = v => y0 + (1 - v)*H;
  g.fillStyle = '#16171a'; g.fillRect(x0, y0, W, H);
  /* the quarter panel's sweep, in grey and a little team colour */
  const acc = (C.seedOf(abbr) >>> 5) % 3 === 0 ? hexOf(k.b) : '#8d959d';
  g.strokeStyle = acc; g.lineWidth = 2.5;
  for(const off of [0, .5]){ g.beginPath(); for(let i = 0; i <= 20; i++){ const u = off + .1 + i/20*.3; const v = .3 + .25*Math.sin((i/20)*PI)*.8 + .02*i/20; g[i ? 'lineTo' : 'moveTo'](X(u), Y(v)); } g.stroke(); }
  g.fillStyle = '#5b6168'; g.fillRect(X(.7), Y(.95), .1*W, H*.12);
  /* the tongue's felt and the laces over it */
  g.fillStyle = '#25262a'; g.fillRect(X(.15), Y(1), .2*W, H*.6);
  g.strokeStyle = '#e6e6e2'; g.lineWidth = 2;
  for(let r = 0; r < 7; r++){ const v0 = .38 + r/7*.62, v1 = v0 + .62/7; g.beginPath(); g.moveTo(X(.165), Y(v0)); g.lineTo(X(.335), Y(v1)); g.moveTo(X(.335), Y(v0)); g.lineTo(X(.165), Y(v1)); g.stroke(); }
  g.fillStyle = '#b8bec4'; for(let r = 0; r < 7; r++){ const v = .38 + (r + .5)/7*.62; for(const s of [-1, 1]){ g.beginPath(); g.arc(X(.25 + s*.085), Y(v), 1.6, 0, TAU); g.fill(); } }
  /* the sole edge */
  g.fillStyle = '#2a2b2e'; g.fillRect(x0, Y(.06), W, H*.06);
  seed(3); grain(g, x0, y0, W, H, 600, .05);
}
/* the see-through cells: everything else in the atlas is opaque */
function paintFX(g, k){
  const fx = L.blob[0], fy = L.blob[1];
  g.save(); g.translate(fx - 128, fy - 896);
  g.clearRect(128, 896, 128, 128);
  g.fillStyle = 'rgba(0,0,0,.004)'; g.fillRect(128, 896, 64, 64);
  let gr = g.createRadialGradient(160, 928, 2, 160, 928, 29); gr.addColorStop(0, 'rgba(0,0,0,.52)'); gr.addColorStop(.45, 'rgba(0,0,0,.34)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(130, 898, 60, 60);
  g.fillStyle = 'rgba(255,255,255,.004)'; g.fillRect(192, 896, 64, 64);
  seed(7);
  g.save(); g.beginPath(); g.rect(193, 897, 62, 62); g.clip();
  gr = g.createRadialGradient(224, 962, 2, 224, 962, 58); gr.addColorStop(0, 'rgba(255,255,255,.8)'); gr.addColorStop(.5, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(193, 897, 62, 62);
  for(let n = 0; n < 1400; n++){
    const u = rnd(), v = Math.pow(rnd(), 1.4), side = 1 - Math.pow(Math.abs(u - .5)*2, 2), a = (1 - v)*side;
    if(rnd() > a) continue;
    g.fillStyle = 'rgba(255,255,255,' + (.3 + .6*a*rnd()).toFixed(2) + ')';
    const x = 194 + u*60, y = 958 - v*60, r = .45 + .9*rnd()*(1 - .5*v);
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  }
  g.restore();
  /* the visor: clear, the faintest blue-grey, a smoked band along the top, a brighter lower edge */
  gr = g.createLinearGradient(0, 1022, 0, 962);
  gr.addColorStop(0, 'rgba(200,212,225,.26)'); gr.addColorStop(.1, 'rgba(215,230,245,.09)'); gr.addColorStop(.7, 'rgba(210,225,240,.08)'); gr.addColorStop(.86, 'rgba(50,58,70,.38)'); gr.addColorStop(1, 'rgba(30,34,42,.55)');
  g.fillStyle = gr; g.fillRect(128, 960, 64, 64);
  /* laces at the throat: only on a lace-up collar (anything left see-through is not drawn) */
  const col = k.col || [];
  if(col[2]){ g.fillStyle = hexOf(col[1] || '#ffffff'); g.fillRect(192, 960, 64, 64); g.fillStyle = 'rgba(0,0,0,.15)'; for(let y = 960; y < 1024; y += 4) g.fillRect(192, y, 64, 1.5); }
  g.restore();
}

/* ===================================== THE MAN MAP ===================================== */
const FONTS = {
  block: s => '900 ' + s + 'px "Big Shoulders Display", Impact, sans-serif',
  college: s => '400 ' + s + 'px "Graduate", "Big Shoulders Display", serif',
  slab: s => '400 ' + s + 'px "Alfa Slab One", "Big Shoulders Display", serif',
  modern: s => '400 ' + s + 'px "Russo One", "Big Shoulders Display", sans-serif'
};
const NAMEFONT = { block: 'block', college: 'block', slab: 'block', modern: 'modern' };
/* tackle twill: each colour a layer of cloth cut to shape and sewn down with a zig-zag in its own
   thread; a soft shadow where one layer sits on the next. cx, cy the centre in the man map. */
function twill(g, txt, cx, cy, hpx, cols, font, sx, maxW, spacing = 0, rot = 0, opt = {}){
  g.save(); g.translate(cx, cy); if(rot) g.rotate(rot);
  let size = hpx; g.font = FONTS[font](size);
  const asc = g.measureText('0').actualBoundingBoxAscent || size*.72;
  size *= hpx/asc; g.font = FONTS[font](size);
  const chars = [...txt], ws = chars.map(c => g.measureText(c).width), sp = spacing*hpx;
  const tw = ws.reduce((a, b) => a + b, 0) + sp*(chars.length - 1);
  const k = Math.min(sx, maxW/(tw || 1));
  g.scale(k, 1); g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.lineJoin = 'round'; g.miterLimit = 2;
  const pass = fn => { let x = -tw/2; chars.forEach((c, i) => { fn(c, x); x += ws[i] + sp; }); };
  const y = hpx/2;
  const layers = [];
  if(cols[2]) layers.push([cols[2], hpx*.24]);
  if(cols[1]) layers.push([cols[1], hpx*.12]);
  layers.push([cols[0], 0]);
  const flat = opt.flat;
  layers.forEach(([c, lw], li) => {
    /* the shadow this layer throws on the one below (or on the sweater) */
    if(!flat){
      g.save(); g.shadowColor = 'rgba(0,0,0,' + (li ? .45 : .4) + ')'; g.shadowBlur = Math.max(1.5, hpx*.035); g.shadowOffsetY = 0;
      g.fillStyle = c; g.strokeStyle = c; g.lineWidth = lw;
      pass((ch, x) => { if(lw) g.strokeText(ch, x, y); g.fillText(ch, x, y); });
      g.restore();
    }
    g.fillStyle = c; g.strokeStyle = c; g.lineWidth = lw;
    pass((ch, x) => { if(lw) g.strokeText(ch, x, y); g.fillText(ch, x, y); });
    /* the stitching: a darker run of thread just inside the edge */
    if(!flat && hpx > 20){
      g.save(); g.globalCompositeOperation = 'source-atop';
      g.strokeStyle = lum(c) > .55 ? 'rgba(0,0,0,.32)' : 'rgba(255,255,255,.28)'; g.lineWidth = Math.max(.9, hpx*.012);
      g.setLineDash([Math.max(1.2, hpx*.016), Math.max(1, hpx*.012)]);
      const inset = Math.max(1.2, hpx*.02);
      pass((ch, x) => { g.lineWidth = Math.max(.9, hpx*.012); if(lw){ g.save(); g.lineWidth = Math.max(.1, lw - inset*2); g.strokeText(ch, x, y); g.restore(); } else { g.save(); g.lineWidth = inset; g.globalCompositeOperation = 'source-atop'; g.strokeText(ch, x, y); g.restore(); } });
      g.restore();
      /* a lighter crown along the middle of the layer (the twill is a little puffy) */
      g.save(); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = .08; g.fillStyle = '#fff';
      pass((ch, x) => g.fillText(ch, x, y - hpx*.01)); g.restore();
    }
  });
  g.restore();
}
/* the colour under (x, y) on the team map: the name and the number must read against it */
function readable(team, cols, x, y){
  let d; try { d = team.image.getContext('2d').getImageData(Math.round(x), Math.round(y), 1, 1).data; } catch(e){ return cols; }
  const bg = (.299*d[0] + .587*d[1] + .114*d[2])/255;
  if(Math.abs(lum(cols[0]) - bg) > .28) return cols;
  const alt = cols[1] && Math.abs(lum(cols[1]) - bg) > .28 ? cols[1] : (bg > .5 ? '#111111' : '#ffffff');
  return [alt, cols[0], cols[2]];
}
const manCache = {};
function manMap(abbr, name, num, look){
  const key = abbr + '|' + name + '|' + num;
  if(manCache[key]) return manCache[key];
  const team = teamMap(abbr);
  return manCache[key] = C.paintTex(MAN, MAN, g => paintMan(g, abbr, name, num, look, team));
}
function paintMan(g, abbr, name, num, look, team){
  const k = C.kitOf(abbr), n = k.n || ['#ffffff', null];
  g.clearRect(0, 0, MAN, MAN);
  /* the back: the name bar and the number, where rink3d.js's painter put them, in the box's own pixels */
  const b0 = BOX[0], toM = (ax, ay) => [b0.m[0] + (ax - b0.a[0])*b0.sx, b0.m[1] + (ay - b0.a[1])*b0.sy];
  g.save(); g.beginPath(); g.rect(0, 0, 320, 256); g.clip();
  const nm = String(name || '').toUpperCase();
  if(nm){ const [x, y] = toM(768, nameY); twill(g, nm, x, y, 6.4*TY, readable(team, n, 768, nameY), NAMEFONT[k.f] || 'block', TXs/TY, 40*TXs, .1); }
  if(num !== '' && num != null){ const [x, y] = toM(768, numY); twill(g, String(num), x, y, 25*TY, readable(team, n, 738, numY), k.f || 'block', TXs/TY*1.05, 44*TXs, .02); }
  g.restore();
  /* the sleeves: the number on the outside of the upper arm, upside down (the arm runs shoulder to elbow) */
  if(num !== '' && num != null){
    const b = BOX[1], cx = slvX - b.a[0] + b.m[0], cy = slvY - b.a[1] + b.m[1];
    g.save(); g.beginPath(); g.rect(b.m[0], b.m[1], b.a[2], b.a[3]); g.clip();
    twill(g, String(num), cx, cy, 9*UPY*ASY, n, k.f || 'block', UPX/UPY*ASX/ASY, 15*UPX*ASX, .02, PI);
    g.restore();
    /* the helmet: a vinyl sticker, its outline cut a little wide */
    const h = BOX[2], hc = hexOf(k.helm || k.b), fill = lum(hc) > .6 ? '#141414' : (lum(n[0]) > .35 && Math.abs(lum(n[0]) - lum(hc)) > .25 ? n[0] : '#ffffff');
    g.save(); g.beginPath(); g.rect(h.m[0], h.m[1], 192, 144); g.clip();
    twill(g, String(num), h.m[0] + 96, h.m[1] + 80, 58, [fill, n[1] && n[1] !== hc ? n[1] : null], k.f || 'block', .55, 110, .03, 0, { flat: true });
    g.restore();
  }
  paintFace(g, look);
  paintStick(g, look, C.seedOf(String(name) + '#' + num));
}
/* the face: front half of the head, his right on the left, chin at the bottom; the top rows are hair
   (the back of his head and the neck's skin sample this square too) */
function paintFace(g, F){
  const x0 = 0, y0 = 256, W = 256, H = 256, X = u => x0 + u*W, Y = v => y0 + (1 - v)*H;
  seed(F.seed || 3);
  g.save(); g.beginPath(); g.rect(x0, y0, W, H); g.clip();
  g.fillStyle = F.skin; g.fillRect(x0, y0, W, H);
  /* the skin's own tone: blotchy warmth, cooler where a beard grows */
  for(let k = 0; k < 160; k++){
    const x = X(rnd()), y = Y(rnd()), r = 6 + rnd()*20;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); const a = .035 + .03*rnd();
    gr.addColorStop(0, rnd() < .55 ? 'rgba(170,70,60,' + a + ')' : 'rgba(255,235,210,' + a + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2*r, 2*r);
  }
  /* modelling: the sides turn away, under the jaw is shadow, the cheeks and nose carry blood */
  let gr = g.createLinearGradient(x0, 0, x0 + W, 0);
  gr.addColorStop(0, 'rgba(60,30,20,.32)'); gr.addColorStop(.22, 'rgba(60,30,20,.05)'); gr.addColorStop(.5, 'rgba(0,0,0,0)'); gr.addColorStop(.78, 'rgba(60,30,20,.05)'); gr.addColorStop(1, 'rgba(60,30,20,.32)');
  g.fillStyle = gr; g.fillRect(x0, y0, W, H);
  gr = g.createLinearGradient(0, Y(0), 0, Y(.16)); gr.addColorStop(0, 'rgba(40,20,10,.38)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x0, Y(.16), W, H*.16);
  for(const [u, v, r, a] of [[.32, .31, 30, .13], [.68, .31, 30, .13], [.5, .36, 14, .1], [.5, .6, 40, .04]]){ gr = g.createRadialGradient(X(u), Y(v), 1, X(u), Y(v), r); gr.addColorStop(0, 'rgba(190,70,60,' + a + ')'); gr.addColorStop(1, 'rgba(190,70,60,0)'); g.fillStyle = gr; g.fillRect(X(u) - r, Y(v) - r, 2*r, 2*r); }
  /* stubble or a beard: dense short hairs, thicker on the chin and the jaw */
  const beardA = [0, .22, .5, .82][F.beard] || 0;
  if(beardA){
    const inBeard = (u, v) => { const du = Math.abs(u - .5); if(v > .36 + .06*du || v < -.02) return false; if(v > .27 && du < .15) return false; if(du > .44) return false; return true; };
    /* the shadow of the growth, then the hairs */
    g.save(); g.globalAlpha = .1 + .25*beardA; g.fillStyle = F.beard === 3 ? F.hair : 'rgb(70,62,62)';
    g.beginPath(); g.moveTo(X(.12), Y(.38)); g.quadraticCurveTo(X(.16), Y(.03), X(.5), Y(-.03)); g.quadraticCurveTo(X(.84), Y(.03), X(.88), Y(.38));
    g.lineTo(X(.78), Y(.36)); g.quadraticCurveTo(X(.7), Y(.26), X(.6), Y(.27)); g.lineTo(X(.6), Y(.31)); g.quadraticCurveTo(X(.5), Y(.33), X(.4), Y(.31)); g.lineTo(X(.4), Y(.27)); g.quadraticCurveTo(X(.3), Y(.26), X(.22), Y(.36)); g.closePath(); g.fill();
    g.restore();
    const nH = Math.round(3600*beardA);
    for(let k = 0; k < nH; k++){
      const u = .08 + rnd()*.84, v = rnd()*.4; if(!inBeard(u, v)) continue;
      if(Math.abs(v - .2) < .02 && Math.abs(u - .5) < .075) continue;
      const len = .6 + rnd()*(.6 + 3.2*beardA*beardA);
      g.strokeStyle = F.beard === 3 ? shade(F.hair, (rnd() - .5)*.3) : shade(F.hair, -.1);
      g.globalAlpha = F.beard === 3 ? .5 : .16 + .2*rnd(); g.lineWidth = F.beard === 3 ? 1 : .7;
      const a = PI/2 + (u - .5)*1.5 + (rnd() - .5)*.6; g.beginPath(); g.moveTo(X(u), Y(v)); g.lineTo(X(u) + Math.cos(a)*len, Y(v) + Math.sin(a)*len); g.stroke();
    }
    g.globalAlpha = 1;
  }
  /* the nose: light down the bridge, shadow down one side and under it, nostrils */
  for(const [du, c] of [[-.035, 'rgba(80,40,25,.14)'], [0, 'rgba(255,232,215,.12)'], [.035, 'rgba(80,40,25,.08)']]){
    gr = g.createRadialGradient(X(.5 + du), Y(.41), 1, X(.5 + du), Y(.41), 16); gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.translate(X(.5 + du), Y(.41)); g.scale(.45, 1.5); g.translate(-X(.5 + du), -Y(.41)); g.fillStyle = gr; g.fillRect(X(.5 + du) - 16, Y(.41) - 16, 32, 32); g.restore(); }
  g.fillStyle = 'rgba(70,35,20,.28)'; g.beginPath(); g.ellipse(X(.5), Y(.315), 13, 3.5, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(45,18,12,.6)'; for(const u of [.478, .522]){ g.beginPath(); g.ellipse(X(u), Y(.31), 3.4, 1.9, (u < .5 ? -.3 : .3), 0, TAU); g.fill(); }
  /* the mouth: a darker parting, a fuller lower lip with a little light on it */
  g.fillStyle = 'rgba(150,72,64,.45)'; g.beginPath(); g.moveTo(X(.43), Y(.085)); g.quadraticCurveTo(X(.5), Y(.235), X(.57), Y(.085)); g.quadraticCurveTo(X(.5), Y(.205), X(.43), Y(.085)); g.fill();
  g.fillStyle = 'rgba(160,80,70,.38)'; g.beginPath(); g.ellipse(X(.5), Y(.178), 13, 4, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,220,210,.14)'; g.beginPath(); g.ellipse(X(.5), Y(.172), 7, 1.6, 0, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(70,28,24,.75)'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(X(.425), Y(.198)); g.quadraticCurveTo(X(.5), Y(.188), X(.575), Y(.198)); g.stroke();
  /* the eyes, set back under the brow: lids, a lash line, the iris, a glint */
  for(const u of [.37, .63]){
    const s = u < .5 ? 1 : -1;
    gr = g.createRadialGradient(X(u), Y(.44), 3, X(u), Y(.44), 22); gr.addColorStop(0, 'rgba(70,35,25,.32)'); gr.addColorStop(1, 'rgba(70,35,25,0)'); g.fillStyle = gr; g.fillRect(X(u) - 24, Y(.44) - 24, 48, 48);
    g.fillStyle = '#d9cfc4'; g.beginPath(); g.moveTo(X(u) - 9*s, Y(.432)); g.quadraticCurveTo(X(u), Y(.455), X(u) + 9.5*s, Y(.436)); g.quadraticCurveTo(X(u), Y(.414), X(u) - 9*s, Y(.432)); g.fill();
    g.fillStyle = F.eyes; g.beginPath(); g.arc(X(u) + s, Y(.434), 3.4, 0, TAU); g.fill();
    g.fillStyle = '#0b0a09'; g.beginPath(); g.arc(X(u) + s, Y(.434), 1.5, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,.75)'; g.fillRect(X(u) + 1.6*s, Y(.434) - 2.2, 1.3, 1.3);
    g.strokeStyle = 'rgba(25,12,8,.85)'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(X(u) - 9.5*s, Y(.432)); g.quadraticCurveTo(X(u), Y(.458), X(u) + 10*s, Y(.437)); g.stroke();
    g.strokeStyle = 'rgba(60,30,20,.35)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(X(u) - 9*s, Y(.448)); g.quadraticCurveTo(X(u), Y(.474), X(u) + 9*s, Y(.452)); g.stroke();
    g.strokeStyle = 'rgba(90,45,30,.3)'; g.beginPath(); g.moveTo(X(u) - 7*s, Y(.418)); g.quadraticCurveTo(X(u), Y(.408), X(u) + 8*s, Y(.42)); g.stroke();
    /* the brow: hairs, thick at the inner end, thinning to the tail */
    g.strokeStyle = shade(F.hair, -.15); g.lineCap = 'round';
    for(let h = 0; h < 46; h++){
      const t = rnd(), bx = X(u) - 12*s + t*25*s, by = Y(.5 + .028*Math.sin(t*PI*.9 + .2)) + (rnd() - .5)*(3.2 - 1.8*t);
      g.globalAlpha = .55 + .35*(1 - t); g.lineWidth = .9 + .7*(1 - t);
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + 3.2*s, by - 1 - .8*(1 - t)); g.stroke();
    }
    g.globalAlpha = 1; g.lineCap = 'butt';
  }
  /* hair at the temples and above the brow, under the helmet's edge; sideburns */
  g.fillStyle = F.hair; g.fillRect(x0, Y(1), W, H*.31);
  for(let k = 0; k < 400; k++){ const u = rnd(), v = .66 + rnd()*.06; g.strokeStyle = shade(F.hair, (rnd() - .5)*.4); g.lineWidth = 1; g.beginPath(); g.moveTo(X(u), Y(v + .03)); g.lineTo(X(u) + (rnd() - .5)*3, Y(v - .02)); g.stroke(); }
  g.fillRect(x0, Y(.72), W*.075, H*.36); g.fillRect(x0 + W*.925, Y(.72), W*.075, H*.36);
  g.restore();
  /* pores and grain */
  g.save(); g.globalAlpha = .05; for(let k = 0; k < 2600; k++){ g.fillStyle = rnd() < .5 ? '#000' : '#fff'; g.fillRect(x0 + rnd()*W, y0 + rnd()*H, 1, 1); } g.restore();
}
/* the stick: the strip runs heel (0) to knob (1) along x, round the shaft down y.
   0-9%: the blade's tape; 91-100%: the knob's tape; between: the shaft's graphics */
function paintStick(g, F, h){
  const x0 = 256, y0 = 256, W = 256, H = 64, X = u => x0 + u*W;
  g.save(); g.beginPath(); g.rect(x0, y0, W, H); g.clip();
  g.fillStyle = F.shaft; g.fillRect(x0, y0, W, H);
  /* the maker's graphics: a long panel down the middle of the shaft, a band, a few blocks of type */
  const dark = lum(F.shaft) < .4, ink = dark ? '#e9ecef' : '#16181c';
  g.fillStyle = F.accent; g.fillRect(X(.38), y0 + 6, W*.17, 20); g.fillRect(X(.38), y0 + 38, W*.17, 20);
  g.fillStyle = ink; g.fillRect(X(.58), y0 + 4, W*.2, 6); g.fillRect(X(.58), y0 + 36, W*.2, 6);
  g.font = '900 18px "Exo 2", Impact, sans-serif'; g.textBaseline = 'middle'; g.fillStyle = ink;
  const words = ['APEX', 'NOVA', 'VAPR', 'JETSPD', 'HYPR', 'CATLYST'];
  g.save(); g.translate(X(.6), y0 + 22); g.scale(1, .9); g.fillText(words[h % words.length], 0, 0); g.restore();
  g.save(); g.translate(X(.6), y0 + 54); g.scale(1, .9); g.fillText(words[h % words.length], 0, 0); g.restore();
  g.fillStyle = F.accent; g.fillRect(X(.86), y0, 3, H); g.fillRect(X(.2), y0, 4, H);
  /* gloss streaks down the shaft */
  const gr = g.createLinearGradient(0, y0, 0, y0 + H); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.25, 'rgba(255,255,255,.08)'); gr.addColorStop(.3, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(X(.09), y0, W*.82, H);
  /* the tape: cloth tape wound on a slant, each wrap overlapping the last */
  const tape = (a, b, c) => {
    g.fillStyle = c; g.fillRect(X(a), y0, (b - a)*W, H);
    g.strokeStyle = lum(c) > .5 ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.12)'; g.lineWidth = 1.2;
    for(let x = X(a) - 30; x < X(b); x += 4.5){ g.beginPath(); g.moveTo(x, y0); g.lineTo(x + 18, y0 + H); g.stroke(); }
    /* puck marks on the blade's tape */
    if(a === 0) for(let k = 0; k < 40; k++){ g.fillStyle = 'rgba(20,20,22,' + (.1 + rnd()*.25).toFixed(2) + ')'; g.fillRect(X(rnd()*b), y0 + rnd()*H, 1 + rnd()*3, 1 + rnd()*2); }
  };
  tape(0, .09, F.tape); tape(.91, 1, F.knob);
  g.restore();
}

/* ===================================== THE MATERIAL ===================================== */
const SHADER_KEY = 'puck-skater-v3';
function patch(shader){
  const U = shader.uniforms, ud = this.userData;
  U.skMan = { value: ud.man }; U.skMask = { value: ud.mask };
  U.skBoxR = { value: boxR }; U.skBoxT = { value: boxT };
  U.skBody = { value: ud.body };
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
uniform sampler2D skMan;
uniform sampler2D skMask;
uniform vec4 skBoxR[5];
uniform vec4 skBoxT[5];
uniform vec3 skBody;
/* which box (man map) this point of the atlas sits in: xy scale, zw offset; the first three are lettering */
vec4 skBoxOf(vec2 uv, out float inBox, out float letter){
  vec4 t = vec4(0.0); inBox = 0.0; letter = 0.0;
  for(int i = 0; i < 5; i++){
    vec4 r = skBoxR[i];
    float h = step(r.x, uv.x)*step(uv.x, r.z)*step(r.y, uv.y)*step(uv.y, r.w);
    t = mix(t, skBoxT[i], h); inBox = max(inBox, h);
    if(i < 3) letter = max(letter, h);
  }
  return t;
}
/* the knit, in atlas pixels: a height; kind .33 air-knit dimples, .67 mesh, 1 rib, 2 satin stitch, 3 twill */
float skKnitH(vec2 p, float kind){
  if(kind < 0.5){ vec2 q = p*vec2(0.455, 0.52); q.x += 0.5*floor(q.y); vec2 f = fract(q) - 0.5; return -exp(-dot(f, f)*14.0) + 0.2*sin(p.y*2.6); }
  if(kind < 0.8){ vec2 q = p*vec2(0.31, 0.36); q.x += 0.5*floor(q.y); vec2 f = fract(q) - 0.5; return -1.6*smoothstep(0.26, 0.13, length(f)); }
  if(kind < 1.5) return abs(sin(p.x*1.57));
  if(kind < 2.5) return abs(sin((p.x*0.8 + p.y*1.2)*2.2));
  return abs(sin((p.x*0.6 - p.y)*1.9));
}
vec2 skKnit(vec2 p, float kind, float amp){
  float per = kind < 0.5 ? 2.2 : kind < 0.8 ? 3.2 : kind < 1.5 ? 2.0 : kind < 2.5 ? 1.43 : 1.65;
  float fw = max(fwidth(p.x), fwidth(p.y));
  float fade = 1.0 - smoothstep(per*0.18, per*0.42, fw);
  if(fade <= 0.0 || amp <= 0.0) return vec2(0.0);
  float e = 0.2, h0 = skKnitH(p, kind);
  return -vec2(skKnitH(p + vec2(e, 0.0), kind) - h0, skKnitH(p + vec2(0.0, e), kind) - h0)/e*amp*fade;
}
float skLum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }`)
    .replace('#include <map_fragment>', `#include <map_fragment>
  float skIn, skIsL; vec4 skT = skBoxOf(vUv, skIn, skIsL);
  vec2 skMuv = vUv*skT.xy + skT.zw;
  vec4 skM = texture2D(skMan, skMuv)*skIn;
  diffuseColor.rgb = mix(diffuseColor.rgb, mapTexelToLinear(vec4(skM.rgb, 1.0)).rgb*diffuse, skM.a);
  diffuseColor.a = mix(diffuseColor.a, 1.0, skM.a*(1.0 - skIsL));
  vec4 skMk = texture2D(skMask, vUv);
  float skLetter = skM.a*skIsL;`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  roughnessFactor = mix(roughnessFactor, 0.62, skLetter);`)
    .replace('mapN.xy *= normalScale;', `mapN.xy *= normalScale;
  {
    vec2 px = vUv*1024.0;
    /* the knit everywhere it is cloth; the twill's own weave on the numbers */
    float kind = skMk.b > 0.9 ? 1.0 : skMk.b > 0.5 ? 0.67 : 0.33;
    float amp = skMk.b > 0.1 ? 0.35 : 0.0;
    mapN.xy += skKnit(px, kind, amp*(1.0 - skLetter));
    mapN.xy += skKnit(px, 3.0, 0.45*skLetter);
    /* raised appliqué: the lettering's edge (its coverage), the crest (how far from the body's colour) */
    vec2 du = vec2(max(1.0/1024.0, fwidth(vUv.x)), 0.0), dv = vec2(0.0, max(1.0/1024.0, fwidth(vUv.y)));
    float hL = skM.a, hLx = texture2D(skMan, (vUv + du)*skT.xy + skT.zw).a*skIn, hLy = texture2D(skMan, (vUv + dv)*skT.xy + skT.zw).a*skIn;
    mapN.xy -= vec2(hLx - hL, hLy - hL)*skIsL*1.6/max(1.0, du.x*1024.0);
    if(skMk.a > 0.01){
      vec3 c0 = texture2D(map, vUv).rgb, cx = texture2D(map, vUv + du).rgb, cy = texture2D(map, vUv + dv).rgb;
      float h0 = min(1.0, length(c0 - skBody)*1.6), h1 = min(1.0, length(cx - skBody)*1.6), h2 = min(1.0, length(cy - skBody)*1.6);
      mapN.xy -= vec2(h1 - h0, h2 - h0)*skMk.a*2.0/max(1.0, du.x*1024.0);
      mapN.xy += skKnit(px, 2.0, 0.4*skMk.a*h0);
    }
  }`)
    .replace('#include <output_fragment>', `
  {
    /* cloth: a soft sheen at grazing angles instead of a plastic highlight */
    vec3 skV = normalize(vViewPosition);
    float skFr = pow(1.0 - saturate(dot(normal, skV)), 3.0);
    vec3 skIrr = (reflectedLight.directDiffuse + reflectedLight.indirectDiffuse)/max(diffuseColor.rgb, vec3(0.03));
    outgoingLight += skMk.g*skFr*skIrr*mix(diffuseColor.rgb, vec3(1.0), 0.45)*0.42;
  }
#include <output_fragment>
  /* the visor: what it reflects shows even where the plastic is clear */
  if(diffuseColor.a < 0.98) gl_FragColor.a = max(gl_FragColor.a, saturate(skLum(reflectedLight.directSpecular + reflectedLight.indirectSpecular)*1.4)*skMk.r);`);
}
const matCache = {};
let EM_TEX = null;
function emTex(){
  if(EM_TEX) return EM_TEX;
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#8a9096'; g.fillRect(L.snow[0]/4, L.snow[1]/4, 16, 16);
  EM_TEX = new T3.CanvasTexture(c); return EM_TEX;
}
/* the renderer's colour space: a map in sRGB if the picture is, so a lighting change upstream keeps the colours */
function syncEncoding(m, renderer){
  if(!renderer) return;
  const want = renderer.outputEncoding === T3.sRGBEncoding ? T3.sRGBEncoding : T3.LinearEncoding;
  for(const t of [m.map, m.userData.man]) if(t && t.encoding !== want){ t.encoding = want; t.needsUpdate = true; m.needsUpdate = true; }
}
function manMat(abbr, name, num, look){
  const key = abbr + '|' + name + '|' + num;
  if(matCache[key]) return matCache[key];
  const G = globalMaps(), map = teamMap(abbr), man = manMap(abbr, name, num, look);
  const k = C.kitOf(abbr), [r, g, b] = rgbOf(k.b);
  const m = new T3.MeshPhysicalMaterial({ map, normalMap: G.normal, roughnessMap: G.orm, metalnessMap: G.orm, aoMap: G.orm, aoMapIntensity: 1,
    roughness: 1, metalness: 1, clearcoat: 1, clearcoatMap: G.mask, clearcoatRoughness: .1, reflectivity: .45,
    skinning: true, side: T3.DoubleSide, transparent: true, depthWrite: true, alphaTest: .02, emissiveMap: emTex(), emissive: 0xffffff });
  m.userData = { man, mask: G.mask, body: new T3.Color(r/255, g/255, b/255) };
  m.onBeforeCompile = function(shader, renderer){ syncEncoding(m, renderer); patch.call(m, shader); };
  m.customProgramCacheKey = () => SHADER_KEY;
  m.depth = new T3.MeshDepthMaterial({ depthPacking: T3.RGBADepthPacking, map, alphaTest: .5, skinning: true });
  return matCache[key] = m;
}
/* for the lab: what the textures cost */
function memory(){
  const G = GLOBAL; let bytes = 0, n = 0;
  const add = (w, h) => { bytes += w*h*4*4/3; n++; };
  if(G){ add(ATL, ATL); add(ATL/2, ATL/2); add(ATL/2, ATL/2); }
  for(const k of Object.keys(teamCache)) add(ATL, ATL);
  for(const k of Object.keys(manCache)) add(MAN, MAN);
  return { textures: n + 1, mb: Math.round(bytes/1e5)/10, teams: Object.keys(teamCache).length, men: Object.keys(manCache).length, genMs: G ? G.ms : 0 };
}
P.skaterTex.memory = memory;
/* for the lab: look at the maps themselves */
P.skaterTex.debug = { globalMaps, teamMap, manMap: (abbr, name, num) => manCache[abbr + '|' + name + '|' + num] };
return { ATL, L, R, SW, swUV, rect, manMat, memory, globalMaps };
};
P.skaterTex.L = L;
})();
