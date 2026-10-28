/* The 3D rink (three.js r128). ONE WebGL canvas for the whole app, built once
   and moved between screens (browsers drop WebGL contexts after a handful).

   A VIEW, NEVER A DRIVER. app/faceoff.js owns the rules and tells this file
   what happened; this file only decides how it looks. Two ways to use it:

     shootout  one shooter, one goalie, the five spots on the net (the duel)
     match     the full rink, 5 skaters and a goalie a side, passes, the shot

   Like BALL, whoever has the puck is ALWAYS drawn attacking the north net
   (z = 0, the far end from the camera). When possession changes, every man is
   turned 180 degrees round centre ice together with the camera, which leaves
   the picture identical, and then the camera swings back round behind the new
   attackers. The shot animation therefore only ever needs the north net.

   World: x across (-12.95..12.95), z along the rink: north goal line 0, centre
   27.13, south goal line 54.26. Skaters face local -z. */
(function(){
const P = window.PUCK = window.PUCK || {};
let built;
function build(){
let gl = false;
try { gl = !!window.THREE && !!(document.createElement('canvas').getContext('webgl')); } catch(e){}
if(!gl) return null;
const wrap = document.createElement('div'); wrap.className = 'rink';
const cv = document.createElement('canvas'); wrap.appendChild(cv);
const vig = document.createElement('div'); vig.className = 'vig'; wrap.appendChild(vig);
const tagsEl = document.createElement('div'); tagsEl.className = 'tags'; wrap.appendChild(tagsEl);
const spotsEl = document.createElement('div'); spotsEl.className = 'spots'; spotsEl.hidden = true; wrap.appendChild(spotsEl);
const resEl = document.createElement('div'); resEl.className = 'shotres'; resEl.hidden = true;
resEl.innerHTML = '<i class="mk keep"><b>Goalie</b></i><i class="mk aim"><b>Shot</b></i><i class="mk keep k2" hidden><b>Goalie</b></i>'; wrap.appendChild(resEl);
/* the TV replay: the bug in the corner and letterbox bars */
const rbug = document.createElement('div'); rbug.className = 'rbug'; rbug.hidden = true; rbug.innerHTML = '<i></i><i></i><b>Replay</b>'; wrap.appendChild(rbug);
const flash = document.createElement('div'); flash.className = 'flash'; wrap.appendChild(flash);
/* the camera buttons: broadcast, overhead, behind the puck; and back to broadcast */
const camui = document.createElement('div'); camui.className = 'camui'; camui.hidden = true;
camui.innerHTML = '<button type="button" data-v="tv" aria-label="Broadcast camera">TV</button><button type="button" data-v="top" aria-label="Overhead camera">Top</button><button type="button" data-v="pov" aria-label="Behind the puck carrier">Puck</button><button type="button" data-v="reset" class="rs" aria-label="Back to the broadcast camera" hidden>&#8634;</button>';
wrap.appendChild(camui);
const lerp = (a, b, t) => a + (b - a)*t, clamp = (t, a = 0, b = 1) => t < a ? a : t > b ? b : t, ease = t => t*t*(3 - 2*t), frac = x => x - Math.floor(x);
const V = (x, y, z) => new THREE.Vector3(x, y, z), UP = V(0, 1, 0);
const vl = (a, b, t) => a.clone().lerp(b, t);
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
const std = (c, r = .65, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
const reduced = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch(e){ return false; } };
const seedOf = s => { let h = 2166136261 >>> 0; for(const ch of String(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; };

/* rink dimensions in metres (NHL: 200 x 85 ft, 28 ft corners) */
const HX = 12.95, ZN = -3.35, ZS = 57.61, GS = 54.26, ZC = 27.13, CR = 8.53, BL1 = 19.51, BL2 = 34.75;

/* ---- renderer: two passes per frame, the world upside down under see-through ice, then the world ---- */
const R = new THREE.WebGLRenderer({ canvas: cv, antialias: true });
/* DPR is the quality cap; size() also keeps a full-screen canvas under ~2.6 million pixels */
let DPR = Math.min(2, window.devicePixelRatio || 1);
R.setPixelRatio(DPR);
let quality = 2;                   /* 2 everything, 1 no reflection, 0 lean shadows and 1x pixels */
R.setClearColor(0x070d17, 1); R.autoClear = false; R.info.autoReset = false;
R.shadowMap.enabled = true; R.shadowMap.type = THREE.PCFShadowMap; R.shadowMap.autoUpdate = false;
const ANISO = Math.min(8, R.capabilities.getMaxAnisotropy());
const scene = new THREE.Scene(); scene.fog = new THREE.Fog(0x070d17, 34, 95);
const world = new THREE.Group(); scene.add(world);
const cam = new THREE.PerspectiveCamera(22, .8, .1, 160);
const CAM0 = V(-.5, 1.9, 15), CAM1 = V(-.3, 1.72, 13.2), LOOK = V(0, .62, 0);
cam.position.copy(CAM0); cam.lookAt(LOOK);

world.add(new THREE.HemisphereLight(0xe4f0ff, 0x34404e, .78));
const key = new THREE.DirectionalLight(0xffffff, 1.05); key.position.set(2.5, 16, 10); key.target.position.set(0, 0, 3);
world.add(key, key.target);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0006; key.shadow.radius = 2.5;
Object.assign(key.shadow.camera, { left: -14, right: 14, top: 17, bottom: -17, near: 2, far: 50 }); key.shadow.camera.updateProjectionMatrix();
const rim = new THREE.DirectionalLight(0xb8d0ff, .5); rim.position.set(-5, 9, -8); world.add(rim);
const fill = new THREE.DirectionalLight(0xfff2e0, .25); fill.position.set(6, 10, 30); world.add(fill);

function mesh(geo, mat, parent, x = 0, y = 0, z = 0){ const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; (parent || world).add(m); return m; }
function canvasTex(w, h, draw){ const c = document.createElement('canvas'); c.width = w; c.height = h; if(draw) draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.anisotropy = ANISO; return t; }
/* small parts don't need to throw a shadow: it halves the shadow pass */
function slim(root){ root.traverse(o => { if(o.isMesh){ if(!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); if(o.geometry.boundingSphere.radius < .1) o.castShadow = false; } }); }

/* ---- the outline of the rink: a rounded rectangle, points with inward normals ---- */
function rinkPath(off, perCorner = 10){
  const pts = [], hx = HX + off, zn = ZN - off, zs = ZS + off, r = CR + off;
  const corners = [[hx - r, zn + r, -Math.PI/2], [hx - r, zs - r, 0], [-hx + r, zs - r, Math.PI/2], [-hx + r, zn + r, Math.PI]];
  for(const [cx, cz, a0] of corners) for(let k = 0; k <= perCorner; k++){
    const a = a0 + k/perCorner*Math.PI/2, x = cx + Math.cos(a)*r, z = cz + Math.sin(a)*r;
    pts.push({ x, z, nx: -Math.cos(a), nz: -Math.sin(a) });
  }
  pts.push({ ...pts[0] });
  let s = 0; pts.forEach((p, i) => { if(i) s += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z); p.s = s; });
  return pts;
}
/* a ribbon along a path: f(p) returns the two edge points */
function ribbon(path, f, mat, uRep, vFlip){
  const pos = [], uv = [], idx = [], L = path[path.length - 1].s;
  path.forEach((p, i) => { const [a, b] = f(p); pos.push(...a, ...b); const u = p.s/L*uRep; uv.push(u, vFlip ? 0 : 1, u, vFlip ? 1 : 0); if(i){ const k = (i - 1)*2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); } });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat); world.add(m); return m;
}

/* ---- the ice: painted in metres, the home crest at centre ice ---- */
const ICE_W = 1024, ICE_H = 2048;
const iceTex = canvasTex(ICE_W, ICE_H);
function paintIce(crest){
  const g = iceTex.image.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = '#eef4f8'; g.fillRect(0, 0, ICE_W, ICE_H);
  const sx = ICE_W/(2*HX), sz = ICE_H/(ZS - ZN);
  g.setTransform(sx, 0, 0, sz, HX*sx, -ZN*sz);
  const rnd = (() => { let s = 7; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0)/4294967296; })();
  /* skate marks */
  for(let i = 0; i < 2600; i++){
    const x = (rnd() - .5)*2*HX, z = ZN + rnd()*(ZS - ZN), a = rnd()*Math.PI, l = .3 + rnd()*2.4;
    g.strokeStyle = 'rgba(140,165,188,' + (.03 + rnd()*.07) + ')'; g.lineWidth = .012 + rnd()*.03;
    g.beginPath(); g.moveTo(x, z); g.quadraticCurveTo(x + Math.cos(a)*l*.5 + .3, z + Math.sin(a)*l*.5 - .2, x + Math.cos(a)*l, z + Math.sin(a)*l); g.stroke();
  }
  const snow = (x, z, r, a) => { const gr = g.createRadialGradient(x, z, 0, x, z, r); gr.addColorStop(0, 'rgba(255,255,255,' + a + ')'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x - r, z - r, 2*r, 2*r); };
  for(const gz of [0, GS]) for(let i = 0; i < 30; i++) snow((rnd() - .5)*4.5, gz + (gz ? -1 : 1)*(.3 + rnd()*3), .3 + rnd()*.8, .5);
  for(let i = 0; i < 60; i++) snow((rnd() < .5 ? -1 : 1)*(HX - rnd()*1.2), ZN + rnd()*(ZS - ZN), .4 + rnd()*1.2, .35);
  const RED = '#c8202a', BLUE = '#1F5CC4';
  /* centre ice: the home crest under the ice, then the lines over it */
  if(crest){ const w = 7.2, h = w*crest.height/crest.width; g.globalAlpha = .88; g.drawImage(crest, -w/2, ZC - h/2, w, h); g.globalAlpha = 1; }
  g.fillStyle = RED; g.fillRect(-HX, ZC - .1525, 2*HX, .305);
  g.fillStyle = 'rgba(255,255,255,.75)'; for(let x = -HX; x < HX; x += .6) g.fillRect(x, ZC - .03, .3, .06);
  g.fillStyle = BLUE; for(const z of [BL1, BL2]) g.fillRect(-HX, z - .1525, 2*HX, .305);
  g.strokeStyle = BLUE; g.lineWidth = .05; g.beginPath(); g.arc(0, ZC, 4.57, 0, Math.PI*2); g.stroke();
  g.fillStyle = BLUE; g.beginPath(); g.arc(0, ZC, .155, 0, Math.PI*2); g.fill();
  g.strokeStyle = RED; g.beginPath(); g.arc(HX, ZC, 3.05, Math.PI/2, Math.PI*1.5); g.stroke();
  /* goal lines, creases, trapezoids, circles and dots at both ends */
  for(const [gz, dir] of [[0, 1], [GS, -1]]){
    g.fillStyle = RED; g.fillRect(-HX, gz - .025, 2*HX, .05);
    g.beginPath(); g.moveTo(-1.22, gz); g.lineTo(-1.22, gz + dir*1.37); g.arc(0, gz, 1.83, Math.atan2(dir*1.37, -1.22), Math.atan2(dir*1.37, 1.22), dir > 0); g.lineTo(1.22, gz); g.closePath();
    g.fillStyle = 'rgba(70,145,220,.45)'; g.fill(); g.strokeStyle = RED; g.lineWidth = .05; g.stroke();
    g.beginPath(); for(const s of [-1, 1]){ g.moveTo(s*3.35, gz); g.lineTo(s*4.27, gz - dir*3.35); } g.stroke();
    for(const s of [-1, 1]){
      const fx = s*6.71, fz = gz + dir*6.1;
      g.beginPath(); g.arc(fx, fz, 4.57, 0, Math.PI*2); g.stroke();
      g.fillStyle = RED; g.beginPath(); g.arc(fx, fz, .305, 0, Math.PI*2); g.fill();
      g.beginPath(); for(const h of [-1, 1]) for(const k of [-1, 1]){ g.moveTo(fx + h*4.57, fz + k*.9); g.lineTo(fx + h*5.17, fz + k*.9); } g.stroke();
      g.beginPath(); for(const h of [-1, 1]) for(const k of [-1, 1]){ g.moveTo(fx + h*1.05, fz + k*.3); g.lineTo(fx + h*.45, fz + k*.3); g.lineTo(fx + h*.45, fz + k*1.2); } g.stroke();
    }
  }
  g.fillStyle = RED; for(const s of [-1, 1]) for(const z of [BL1 + 1.52, BL2 - 1.52]){ g.beginPath(); g.arc(s*6.71, z, .305, 0, Math.PI*2); g.fill(); }
  g.setTransform(1, 0, 0, 1, 0, 0);
  iceTex.needsUpdate = true;
}
paintIce(null);
const iceShape = new THREE.Shape(); rinkPath(0, 12).forEach((p, i) => i ? iceShape.lineTo(p.x, -p.z) : iceShape.moveTo(p.x, -p.z));
const iceGeo = new THREE.ShapeGeometry(iceShape);
{ const pa = iceGeo.attributes.position, uv = new Float32Array(pa.count*2); for(let i = 0; i < pa.count; i++){ uv[i*2] = (pa.getX(i) + HX)/(2*HX); uv[i*2 + 1] = 1 - (-pa.getY(i) - ZN)/(ZS - ZN); } iceGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
const ice = new THREE.Mesh(iceGeo, new THREE.MeshStandardMaterial({ map: iceTex, roughness: .14, metalness: 0, transparent: true, opacity: .86 }));
ice.rotation.x = -Math.PI/2; ice.receiveShadow = true; world.add(ice);

/* ---- boards, glass, stanchions, crowd ---- */
function boardTexture(){
  /* the PUCK 26 boards: navy panels with chrome type and the ember 26, white ones in between */
  return canvasTex(2048, 96, (g) => {
    g.fillStyle = '#f6f8fa'; g.fillRect(0, 0, 2048, 96);
    const ads = [['PUCK', '26', 1], ['FACEOFF', '', 0], ['ONE ON ONE', '', 1], ['BEEBZOO', '', 0], ['GAME NIGHT', '', 1], ['THE SWEATER', '', 0], ['PUCK', '26', 1], ['DAILY SHOOTOUT', '', 0]];
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for(let i = 0; i < 8; i++){
      const [w, n, dark] = ads[i], x0 = i*256;
      if(dark){
        const bg = g.createLinearGradient(0, 0, 0, 76); bg.addColorStop(0, '#1b4787'); bg.addColorStop(1, '#0a1c38'); g.fillStyle = bg; g.fillRect(x0 + 2, 0, 252, 76);
        g.fillStyle = 'rgba(240,138,23,.9)'; g.fillRect(x0 + 2, 70, 252, 6);
      }
      g.font = 'italic 900 ' + (w.length > 9 ? 40 : 50) + 'px "Exo 2", "Arial Black", sans-serif';
      const tw = g.measureText(w).width, nw = n ? g.measureText(n).width + 10 : 0, cx = x0 + 128 - nw/2;
      if(dark){ const ch = g.createLinearGradient(0, 14, 0, 62); ch.addColorStop(0, '#ffffff'); ch.addColorStop(.48, '#cfdbe8'); ch.addColorStop(.52, '#7d8ea3'); ch.addColorStop(1, '#eef4fb'); g.fillStyle = ch; }
      else g.fillStyle = i % 4 === 1 ? '#f08a17' : '#0a1c38';
      g.fillText(w, cx, 39);
      if(n){ const em = g.createLinearGradient(0, 14, 0, 62); em.addColorStop(0, '#ffe08a'); em.addColorStop(1, '#f08a17'); g.fillStyle = em; g.fillText(n, cx + tw/2 + nw/2 + 4, 39); }
      g.fillStyle = 'rgba(12,24,40,.1)'; g.fillRect(x0 + 254, 0, 2, 76);
    }
    g.fillStyle = '#F2C230'; g.fillRect(0, 76, 2048, 20);
  });
}
let boardTex = boardTexture(); boardTex.wrapS = THREE.RepeatWrapping;
const boardMat = new THREE.MeshStandardMaterial({ map: boardTex, roughness: .5, side: THREE.DoubleSide }), capMat = std(0x1a2a40, .5);
capMat.side = THREE.DoubleSide;
const glassMat = new THREE.MeshStandardMaterial({ color: 0xa8cde6, roughness: .05, transparent: true, opacity: .1, side: THREE.DoubleSide, depthWrite: false });
const stanMat = std(0x2a3442, .4, .3);
const P0 = rinkPath(0, 12), PL = P0[P0.length - 1].s;
const boards = ribbon(P0, p => [[p.x, 0, p.z], [p.x, 1.07, p.z]], boardMat, Math.round(PL/34), true);
boards.receiveShadow = true;
ribbon(P0, p => [[p.x, 1.07, p.z], [p.x - p.nx*.22, 1.07, p.z - p.nz*.22]], capMat, 1);
ribbon(P0, p => [[p.x - p.nx*.04, 1.08, p.z - p.nz*.04], [p.x - p.nx*.04, 2.9, p.z - p.nz*.04]], glassMat, 1);
{ const g = new THREE.BoxGeometry(.05, 1.82, .06), n = Math.round(PL/2.45);
  const im = new THREE.InstancedMesh(g, stanMat, n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion();
  for(let k = 0; k < n; k++){ const s = k/n*PL; let i = 1; while(i < P0.length - 1 && P0[i].s < s) i++; const a = P0[i - 1], b = P0[i], f = (s - a.s)/((b.s - a.s) || 1);
    q.setFromAxisAngle(UP, Math.atan2(a.nx, a.nz)); m4.compose(V(lerp(a.x, b.x, f) - a.nx*.04, 1.99, lerp(a.z, b.z, f) - a.nz*.04), q, V(1, 1, 1)); im.setMatrixAt(k, m4); }
  world.add(im); }
/* the crowd: rows of fans, most of them in the home side's colours */
const crowdTex = canvasTex(1024, 512);
crowdTex.wrapS = THREE.RepeatWrapping;
function paintCrowd(cols){
  const g = crowdTex.image.getContext('2d');
  g.fillStyle = '#0b1220'; g.fillRect(0, 0, 1024, 512);
  const rnd = (() => { let s = 99; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0)/4294967296; })();
  const SK = ['#f1cfae', '#e0b48c', '#c99067', '#a86e48', '#7d4e30'];
  for(let row = 0; row < 16; row++){
    const y = 20 + row*31;
    g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(0, y + 18, 1024, 3);
    for(let x = 4 + (row % 2)*9; x < 1024; x += 18){
      if(rnd() < .08) continue;
      const c = rnd() < .65 ? cols[(rnd()*cols.length)|0] : ['#e8eef3', '#2b3a4d', '#4a5866', '#1b2533'][(rnd()*4)|0];
      const dy = (rnd() - .5)*4;
      g.fillStyle = c; g.beginPath(); g.ellipse(x, y + 14 + dy, 7, 9, 0, 0, Math.PI*2); g.fill();
      g.fillStyle = SK[(rnd()*SK.length)|0]; g.beginPath(); g.arc(x, y + 2 + dy, 4.4, 0, Math.PI*2); g.fill();
    }
  }
  crowdTex.needsUpdate = true;
}
paintCrowd(['#c8202a', '#1F5CC4', '#e8eef3']);
const crowdMat = new THREE.MeshBasicMaterial({ map: crowdTex, side: THREE.DoubleSide });
const crowd = [];
const PC = rinkPath(.9, 8);
crowd.push(ribbon(PC, p => [[p.x, 1.25, p.z], [p.x - p.nx*15, 12.5, p.z - p.nz*15]], crowdMat, Math.round(PC[PC.length - 1].s/26)));
crowd.push(ribbon(PC, p => [[p.x - p.nx*15, 12.5, p.z - p.nz*15], [p.x - p.nx*16, 22, p.z - p.nz*16]], new THREE.MeshBasicMaterial({ color: 0x05080e, side: THREE.DoubleSide }), 1));
/* camera flashes going off in the stands: a few all night, a storm when it goes in */
const NF = 90, fPos = new Float32Array(NF*3), fCol = new Float32Array(NF*3), fLife = new Float32Array(NF);
for(let i = 0; i < NF; i++){
  const p = PC[Math.floor(Math.random()*(PC.length - 1))], f = .08 + Math.random()*.8;
  fPos[i*3] = p.x - p.nx*15*f; fPos[i*3 + 1] = 1.4 + 11.1*f; fPos[i*3 + 2] = p.z - p.nz*15*f;
}
const fGeo = new THREE.BufferGeometry(); fGeo.setAttribute('position', new THREE.BufferAttribute(fPos, 3)); fGeo.setAttribute('color', new THREE.BufferAttribute(fCol, 3));
const glowTex = canvasTex(64, 64, g => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,250,235,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
const flashPts = new THREE.Points(fGeo, new THREE.PointsMaterial({ size: 1.1, map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
world.add(flashPts); crowd.push(flashPts);
let flashRate = .9;
function stepFlashes(dt){
  for(let i = 0; i < NF; i++){
    if(fLife[i] > 0) fLife[i] -= dt*7;
    else if(Math.random() < flashRate*dt/NF*6) fLife[i] = 1;
    const c = Math.max(0, fLife[i]); fCol[i*3] = fCol[i*3 + 1] = fCol[i*3 + 2] = c;
  }
  fGeo.attributes.color.needsUpdate = true;
}
/* the scoreboard over centre ice: the score, the clock and GOAL when it goes in */
const cube = new THREE.Group(); cube.position.set(0, 15, ZC); world.add(cube);
const cubeTex = canvasTex(512, 256, g => { g.fillStyle = '#05080e'; g.fillRect(0, 0, 512, 256); });
let cubeInfo = null, cubeBig = '';
function paintCube(){
  const g = cubeTex.image.getContext('2d'), W2 = 512, H2 = 256;
  const bg = g.createLinearGradient(0, 0, 0, H2); bg.addColorStop(0, '#0a1c38'); bg.addColorStop(1, '#01040a'); g.fillStyle = bg; g.fillRect(0, 0, W2, H2);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if(cubeBig){
    const em = g.createLinearGradient(0, 0, 0, H2); em.addColorStop(0, '#ffe08a'); em.addColorStop(.7, '#f08a17'); em.addColorStop(1, '#d06a08'); g.fillStyle = em; g.fillRect(0, 0, W2, H2);
    g.fillStyle = '#1a0d00'; g.font = 'italic 900 ' + (cubeBig.length > 6 ? 84 : 120) + 'px "Exo 2", "Arial Black", sans-serif'; g.fillText(cubeBig, W2/2, H2/2 + 6);
  } else if(cubeInfo){
    const { a, b, clock } = cubeInfo;
    for(const [t, x0] of [[a, 0], [b, 256]]){
      g.fillStyle = t.color; g.fillRect(x0 + 6, 6, 244, 52);
      g.fillStyle = '#ffffff'; g.font = 'italic 900 40px "Exo 2", "Arial Black", sans-serif'; g.fillText(t.abbr, x0 + 128, 34);
      g.font = 'italic 900 128px "Exo 2", "Arial Black", sans-serif'; g.fillText(String(t.score), x0 + 128, 146);
    }
    g.fillStyle = 'rgba(143,180,221,.25)'; g.fillRect(255, 70, 2, 140);
    g.fillStyle = '#ffb43a'; g.font = '26px Michroma, Arial, sans-serif'; g.fillText(clock || '', W2/2, 230);
  } else {
    g.font = 'italic 900 96px "Exo 2", "Arial Black", sans-serif'; g.fillStyle = '#e8f3ff'; g.fillText('PUCK', 220, H2/2);
    g.fillStyle = '#f08a17'; g.fillText('26', 400, H2/2);
  }
  cubeTex.needsUpdate = true;
}
paintCube();
for(let k = 0; k < 4; k++){ const f = mesh(new THREE.PlaneGeometry(5, 2.6), new THREE.MeshBasicMaterial({ map: cubeTex }), cube); f.rotation.y = k*Math.PI/2; f.position.set(Math.sin(k*Math.PI/2)*2.5, 0, Math.cos(k*Math.PI/2)*2.5); f.castShadow = false; }
mesh(new THREE.BoxGeometry(5.1, .5, 5.1), std(0x10161f, .5, .4), cube, 0, 1.55, 0).castShadow = false;
mesh(new THREE.BoxGeometry(5.1, .5, 5.1), std(0x10161f, .5, .4), cube, 0, -1.55, 0).castShadow = false;
crowd.push(cube);

/* ---- the nets: red frame, white base, a knitted mesh that can bulge; one at each end ---- */
const W = .915, H = 1.22;
const postMat = std(0xd11f26, .35, .2), frameMat = std(0xf2f4f6, .5);
function rod(a, b, r, mat, parent){
  const A = V(...a), B = V(...b), d = B.clone().sub(A);
  const m = mesh(new THREE.CylinderGeometry(r, r, d.length(), 12), mat, parent);
  m.position.copy(A).add(B).multiplyScalar(.5); m.quaternion.setFromUnitVectors(UP, d.normalize()); return m;
}
function along(poly, t){
  const segs = []; let tot = 0;
  for(let i = 0; i < poly.length - 1; i++){ const l = Math.hypot(poly[i+1][0]-poly[i][0], poly[i+1][1]-poly[i][1], poly[i+1][2]-poly[i][2]); segs.push(l); tot += l; }
  let d = t*tot;
  for(let i = 0; i < segs.length; i++){ if(d <= segs[i] || i === segs.length - 1){ const k = segs[i] ? d/segs[i] : 0; return poly[i].map((v, j) => lerp(v, poly[i+1][j], clamp(k))); } d -= segs[i]; }
}
const meshTex = canvasTex(128, 128, (g) => { g.clearRect(0, 0, 128, 128); g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, 0); g.lineTo(128, 128); g.moveTo(128, 0); g.lineTo(0, 128); g.stroke(); });
meshTex.wrapS = meshTex.wrapT = THREE.RepeatWrapping;
const netMat = new THREE.MeshStandardMaterial({ map: meshTex, transparent: true, alphaTest: .35, side: THREE.DoubleSide, roughness: .9 });
function netRibbon(A, B, n, uRep, vRep, mat){
  const pos = [], uv = [], idx = [];
  for(let i = 0; i <= n; i++){ const a = along(A, i/n), b = along(B, i/n); pos.push(...a, ...b); uv.push(i/n*uRep, vRep, i/n*uRep, 0); }
  for(let i = 0; i < n; i++){ const k = i*2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}
function makeNet(z, ry){
  const net = new THREE.Group(); net.position.z = z; net.rotation.y = ry; world.add(net);
  rod([-W, 0, 0], [-W, H, 0], .03, postMat, net); rod([W, 0, 0], [W, H, 0], .03, postMat, net); rod([-W, H, 0], [W, H, 0], .03, postMat, net);
  const topP = [[-W, H, 0], [-.62, H, -.45], [.62, H, -.45], [W, H, 0]];
  const baseP = [[-W, 0, 0], [-1.0, 0, -.55], [-.6, 0, -1.02], [.6, 0, -1.02], [1.0, 0, -.55], [W, 0, 0]];
  for(const p of [topP, baseP]) for(let i = 0; i < p.length - 1; i++) rod(p[i], p[i + 1], .022, p === topP ? postMat : frameMat, net);
  const skin = new THREE.Group(); net.add(skin);
  skin.add(netRibbon(topP, baseP, 40, 34, 12, netMat));
  skin.add(netRibbon([[-W, H, 0], [W, H, 0]], topP, 20, 18, 4, netMat));
  const skirtTop = baseP.map(p => [p[0]*.97, .2, p[2]*.97 + (p[2] ? .01 : 0)]);
  skin.add(netRibbon(skirtTop, baseP, 30, 1, 1, new THREE.MeshStandardMaterial({ color: 0xf4f6f8, side: THREE.DoubleSide, roughness: .9 })));
  /* the goal light, on top of the glass behind the net */
  const lightMat = new THREE.MeshStandardMaterial({ color: 0x5a1014, emissive: 0x000000, roughness: .4 });
  mesh(new THREE.CylinderGeometry(.16, .2, .32, 16), lightMat, net, 0, 3.08, -3.45);
  mesh(new THREE.BoxGeometry(.5, .12, .5), std(0x1a2230, .5, .4), net, 0, 2.9, -3.45);
  const red = new THREE.PointLight(0xff2a2a, 0, 16); red.position.set(0, 2.6, -2.6); net.add(red);
  return { net, skin, lightMat, red };
}
const NETS = [makeNet(0, 0), makeNet(GS, Math.PI)];
const NN = NETS[0];

/* ---- the stick: heel at the origin, shaft up +y, blade at the lie angle ---- */
const Mt = {
  boot: std(0x101010, .3, .1), steel: std(0xd5dde4, .2, .9), holder: std(0xe9e9e9, .45),
  shaft: std(0x151515, .4, .1), tape: std(0xf3f3ee, .95),
  visor: new THREE.MeshStandardMaterial({ color: 0xd8ecff, roughness: .05, metalness: .2, transparent: true, opacity: .22, side: THREE.DoubleSide, depthWrite: false }),
  cage: new THREE.MeshBasicMaterial({ color: 0x222222, wireframe: true }), puck: std(0x0b0b0b, .45)
};
function makeStick(len, bladeLen, lieDeg, o = {}){
  const g = new THREE.Group(), lie = lieDeg*Math.PI/180, bH = o.bladeH || .072;
  const pad = o.paddle || 0;
  if(pad) mesh(new THREE.BoxGeometry(.085, pad, .026), o.shaft || Mt.shaft, g, 0, pad/2, 0);
  mesh(new THREE.BoxGeometry(.03, len - pad, .022), o.shaft || Mt.shaft, g, 0, pad + (len - pad)/2, 0);
  mesh(new THREE.BoxGeometry(.035, .13, .027), Mt.tape, g, 0, len - .065, 0);
  const blade = new THREE.Group(); blade.rotation.z = Math.atan2(Math.cos(lie), -Math.sin(lie)); g.add(blade);
  const heel = bladeLen*.55, toe = bladeLen - heel;
  mesh(new THREE.BoxGeometry(heel, bH, .012), Mt.shaft, blade, heel/2 - .01, 0, 0);
  mesh(new THREE.BoxGeometry(heel*.8, bH + .004, .016), o.tape || Mt.tape, blade, heel*.55, 0, 0);
  const tg = new THREE.Group(); tg.position.x = heel - .015; tg.rotation.y = o.curve == null ? .28 : o.curve; blade.add(tg);
  mesh(new THREE.BoxGeometry(toe, bH*.94, .012), Mt.shaft, tg, toe/2, 0, 0);
  mesh(new THREE.BoxGeometry(toe*.85, bH*.94 + .004, .016), o.tape || Mt.tape, tg, toe*.45, 0, 0);
  return g;
}
const sX = V(), sY = V(), sZ = V(), sM = new THREE.Matrix4();
function placeStick(g, Hh, Bt){
  sY.subVectors(Bt, Hh).normalize();
  const hd = V(Hh.x - Bt.x, 0, Hh.z - Bt.z); if(hd.lengthSq() < 1e-6) hd.set(-1, 0, 0); hd.normalize();
  sX.copy(hd).addScaledVector(sY, -hd.dot(sY)).normalize().negate();
  sZ.crossVectors(sX, sY);
  sM.makeBasis(sX, sY, sZ); g.quaternion.setFromRotationMatrix(sM); g.position.copy(Hh);
  return hd;
}

/* ---- limbs: cylinders stretched between two joints; arms and legs solve their own elbows and knees ---- */
const tA = V(), bX = V(), bY = V(), bZ = V(), bM = new THREE.Matrix4();
function limb(rA, rB, mat, parent, seg = 14){ return mesh(new THREE.CylinderGeometry(rB, rA, 1, seg), mat, parent); }
function place(m, A, B){ tA.subVectors(B, A); const L = tA.length() || 1e-4; m.position.copy(A).addScaledVector(tA, .5); m.quaternion.setFromUnitVectors(UP, tA.divideScalar(L)); m.scale.set(1, L, 1); }
/* the same, with the cylinder's +x turned towards `out`, so a sleeve number faces the right way */
function placeOut(m, A, B, out){
  bY.subVectors(B, A); const L = bY.length() || 1e-4; bY.divideScalar(L);
  bX.copy(out).addScaledVector(bY, -out.dot(bY)); if(bX.lengthSq() < 1e-6) bX.set(1, 0, 0); bX.normalize();
  bZ.crossVectors(bX, bY); bM.makeBasis(bX, bY, bZ); m.quaternion.setFromRotationMatrix(bM);
  m.position.copy(A).addScaledVector(bY, L/2); m.scale.set(1, L, 1);
}
function orient(m, Pp, dir){ m.position.copy(Pp); m.quaternion.setFromUnitVectors(UP, dir.clone().normalize()); }
function ik(A, T, l1, l2, pole){
  const d = T.clone().sub(A); let dist = d.length(); const dir = d.divideScalar(dist || 1);
  dist = Math.max(.05, Math.min(dist, l1 + l2 - .002));
  const a = (l1*l1 + dist*dist - l2*l2)/(2*dist), h = Math.sqrt(Math.max(0, l1*l1 - a*a));
  const pd = pole.clone().addScaledVector(dir, -pole.dot(dir)).normalize();
  return { mid: A.clone().addScaledVector(dir, a).addScaledVector(pd, h), end: A.clone().addScaledVector(dir, dist) };
}

/* ===================================== THE SWEATERS =====================================
   One canvas per piece, painted from the team's row in P.KITS (app/assets/kits.js).
   The torso is a lathe, so u runs round the body (0 = his right side, .25 = his
   chest, .5 = his left side, .75 = his back) and v runs up it in equal steps of
   cloth. That is what lets a number sit flat and big on the back. */
const KITS = () => P.KITS || {};
const TPX = 1024, TPY = 512, ARM_W = 256, ARM_H = 128;
const PROF = (() => {
  const ctrl = [[.274, -.13], [.264, -.05], [.252, .07], [.257, .2], [.274, .32], [.292, .42], [.301, .48], [.293, .535], [.258, .585], [.195, .622], [.125, .643], [.085, .651]];
  const curve = new THREE.SplineCurve(ctrl.map(p => new THREE.Vector2(p[0], p[1])));
  const pts = curve.getSpacedPoints(34);
  const cum = [0]; for(let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = cum[cum.length - 1]*100;
  const cmAt = y => { for(let i = 1; i < pts.length; i++) if(pts[i].y >= y){ const f = (y - pts[i - 1].y)/((pts[i].y - pts[i - 1].y) || 1); return lerp(cum[i - 1], cum[i], f)*100; } return total; };
  return { pts, total, cmAt };
})();
const TORSO_GEO = new THREE.LatheGeometry(PROF.pts, 40, Math.PI/2, Math.PI*2);
const SHOULDER_CM = PROF.cmAt(.5);
const TY = TPY/PROF.total;                       /* torso px per cm, up the body */
const TXs = TPX/(2*Math.PI*29);                  /* torso px per cm, across the back at the chest */
const UPX = ARM_W/(2*Math.PI*8.2), UPY = ARM_H/33, FOY = ARM_H/34;

const FONTS = {
  block: s => '900 ' + s + 'px "Big Shoulders Display", Impact, sans-serif',
  college: s => '400 ' + s + 'px "Graduate", "Big Shoulders Display", serif',
  slab: s => '400 ' + s + 'px "Alfa Slab One", "Big Shoulders Display", serif',
  modern: s => '400 ' + s + 'px "Russo One", "Big Shoulders Display", sans-serif'
};
const NAMEFONT = { block: 'block', college: 'block', slab: 'block', modern: 'modern' };
/* text with its cap height exactly hpx, centred on (cx, cy), squeezed by sx to suit the cloth, never wider than maxW */
function drawText(g, txt, cx, cy, hpx, cols, font, sx, maxW, spacing = 0, rot = 0){
  g.save(); g.translate(cx, cy); if(rot) g.rotate(rot);
  let size = hpx; g.font = FONTS[font](size);
  const asc = g.measureText('0').actualBoundingBoxAscent || size*.72;
  size *= hpx/asc; g.font = FONTS[font](size);
  const chars = [...txt], ws = chars.map(c => g.measureText(c).width), sp = spacing*hpx;
  const tw = ws.reduce((a, b) => a + b, 0) + sp*(chars.length - 1);
  const k = Math.min(sx, maxW/(tw || 1));
  g.scale(k, 1); g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.lineJoin = 'round'; g.miterLimit = 2;
  const pass = (fn) => { let x = -tw/2; chars.forEach((c, i) => { fn(c, x); x += ws[i] + sp; }); };
  const y = hpx/2;
  if(cols[2]){ g.lineWidth = hpx*.24; g.strokeStyle = cols[2]; pass((c, x) => g.strokeText(c, x, y)); }
  if(cols[1]){ g.lineWidth = hpx*.12; g.strokeStyle = cols[1]; pass((c, x) => g.strokeText(c, x, y)); }
  g.fillStyle = cols[0]; pass((c, x) => g.fillText(c, x, y));
  g.restore();
}
/* the logos: rasterised from the SVG files in app/assets/teams (same origin, so the canvases stay clean), trimmed to their ink */
const logoCache = {}, logoWait = [];
function logo(abbr, v){
  const k = abbr + (v === 'dark' ? '_dark' : '');
  if(logoCache[k] !== undefined) return logoCache[k];
  logoCache[k] = null;
  const im = new Image();
  im.onload = () => {
    const c = document.createElement('canvas'); c.width = 960; c.height = 640; const g = c.getContext('2d'); g.drawImage(im, 0, 0, 960, 640);
    let d; try { d = g.getImageData(0, 0, 960, 640).data; } catch(e){ return; }
    /* the (R) and TM marks sit apart from the crest at the bottom right: find the crest's own columns first */
    const colInk = new Array(960).fill(0);
    for(let y = 0; y < 640; y += 2) for(let x = 0; x < 960; x += 2) if(d[(y*960 + x)*4 + 3] > 20) colInk[x]++;
    let x0 = 960, y0 = 640, x1 = 0, y1 = 0;
    for(let y = 0; y < 640; y += 2) for(let x = 0; x < 960; x += 2) if(d[(y*960 + x)*4 + 3] > 20){ if(x < x0) x0 = x; if(x > x1) x1 = x; if(y < y0) y0 = y; if(y > y1) y1 = y; }
    const t = document.createElement('canvas'); t.width = Math.max(1, x1 - x0 + 4); t.height = Math.max(1, y1 - y0 + 4);
    t.getContext('2d').drawImage(c, x0 - 2, y0 - 2, t.width, t.height, 0, 0, t.width, t.height);
    logoCache[k] = t; for(const f of logoWait.splice(0)) f();
  };
  im.src = 'app/assets/teams/' + k + '.svg';
  return null;
}
const silCache = new Map();
function silhouette(img, col){
  let m = silCache.get(img); if(!m){ m = {}; silCache.set(img, m); }
  if(m[col]) return m[col];
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d');
  g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
  return m[col] = c;
}
function drawCrest(g, img, cx, cy, wpx, edge, sx = 1){
  let w = wpx, h = w*img.height/img.width; if(h > wpx*.95){ h = wpx*.95; w = h*img.width/img.height; }
  g.save(); g.translate(cx, cy); g.scale(sx, 1);
  if(edge){ const s = silhouette(img, edge), r = w*.035; for(let k = 0; k < 16; k++){ const a = k/16*Math.PI*2; g.drawImage(s, -w/2 + Math.cos(a)*r, -h/2 + Math.sin(a)*r, w, h); } }
  g.drawImage(img, -w/2, -h/2, w, h); g.restore();
}
const teamC = (abbr, k) => (P.team ? P.team(abbr)[k] : null) || (k === 'c1' ? '#16283f' : '#F2C230');
const kitOf = abbr => KITS()[abbr] || { b: teamC(abbr, 'c1'), n: ['#ffffff', teamC(abbr, 'c2')], f: 'block', col: [teamC(abbr, 'c2'), '#ffffff'] };
const lum = hex => { const n = parseInt(String(hex).slice(1), 16); return (.299*(n >> 16) + .587*(n >> 8 & 255) + .114*(n & 255))/255; };
const sleeveOf = k => k.sc || k.b;
/* stripes listed from an edge: [start, [c, h], [c, h]...] -> [{c, a, b}] in cm from that edge */
function bandsOf(spec){ if(!spec) return []; let a = spec[0]; return spec.slice(1).map(([c, h]) => { const r = { c, a, b: a + h }; a += h; return r; }); }

function paintTorso(g, k, abbr, name, num){
  const Wp = TPX, Hp = TPY, y = cm => Hp - cm*TY, uX = u => u*Wp;
  g.fillStyle = k.b; g.fillRect(0, 0, Wp, Hp);
  /* hem: a solid band, a peaked band, then stripes */
  if(k.hz){ g.fillStyle = k.hz[0]; g.fillRect(0, y(k.hz[1]), Wp, k.hz[1]*TY); }
  if(k.peak){
    const [c, e, h, ph] = k.peak, pk = u => h + ph*Math.max(0, 1 - Math.min(Math.abs(u - .25), Math.abs(u - .75))/.13);
    g.beginPath(); g.moveTo(0, Hp); for(let i = 0; i <= 64; i++){ const u = i/64; g.lineTo(uX(u), y(pk(u))); } g.lineTo(Wp, Hp); g.closePath(); g.fillStyle = c; g.fill();
    g.beginPath(); for(let i = 0; i <= 64; i++){ const u = i/64; g[i ? 'lineTo' : 'moveTo'](uX(u), y(pk(u))); } g.strokeStyle = e; g.lineWidth = 2.2*TY; g.stroke();
  }
  for(const s of bandsOf(k.hem)){ g.fillStyle = s.c; g.fillRect(0, y(s.b), Wp, (s.b - s.a)*TY + .5); }
  for(const s of bandsOf(k.chest)){ g.fillStyle = s.c; g.fillRect(0, y(s.b), Wp, (s.b - s.a)*TY + .5); }
  /* the yoke: down over the shoulders, dipping where the sleeves join */
  if(k.yoke){
    const [c, d, , trim] = k.yoke, dep = u => SHOULDER_CM - d - 7*(1 + Math.cos(4*Math.PI*u))/2;
    g.beginPath(); g.moveTo(0, 0); for(let i = 0; i <= 64; i++){ const u = i/64; g.lineTo(uX(u), y(dep(u))); } g.lineTo(Wp, 0); g.closePath(); g.fillStyle = c; g.fill();
    if(trim){ g.beginPath(); for(let i = 0; i <= 64; i++){ const u = i/64; g[i ? 'lineTo' : 'moveTo'](uX(u), y(dep(u))); } g.strokeStyle = trim; g.lineWidth = 1.6*TY; g.stroke(); }
  }
  /* piping down both sides */
  if(k.pipe) for(const u of [0, .5, 1]){ g.fillStyle = k.pipe[1]; g.fillRect(uX(u) - 9, 0, 18, Hp); g.fillStyle = k.pipe[0]; g.fillRect(uX(u) - 5, 0, 10, Hp); }
  /* the collar: a V at the throat in the collar colour, laced if it is a lace-up */
  const col = k.col || [k.b, '#ffffff'];
  for(const [cu, depth, half] of [[.25, 15, 6.5], [.75, 4, 9]]){
    const cx = uX(cu), bot = y(PROF.total - depth), hw = half*TXs;
    g.beginPath(); g.moveTo(cx - hw, 0); g.lineTo(cx, bot); g.lineTo(cx + hw, 0); g.closePath(); g.fillStyle = col[0]; g.fill();
    g.strokeStyle = col[1]; g.lineWidth = 1.4*TY; g.beginPath(); g.moveTo(cx - hw - 2, 0); g.lineTo(cx, bot + 2); g.lineTo(cx + hw + 2, 0); g.stroke();
    if(col[2] && cu === .25){ g.lineWidth = .7*TY; for(let i = 1; i < 4; i++){ const yy = lerp(0, bot, i/4.4), w2 = hw*(1 - i/4.4); g.beginPath(); g.moveTo(cx - w2*.8, yy - 4); g.lineTo(cx + w2*.8, yy + 4); g.moveTo(cx + w2*.8, yy - 4); g.lineTo(cx - w2*.8, yy + 4); g.stroke(); } }
  }
  const n = k.n || ['#ffffff', null];
  /* the crest, big on the chest, or the wordmark */
  const crestY = y(SHOULDER_CM - 23), crestW = 34*TXs;
  if(k.word) drawText(g, k.word, uX(.25), crestY + 4, 8.5*TY, [n[0], n[1], n[2]], 'college', TXs/TY, 50*TXs, .04, .3);
  else {
    const img = logo(abbr, (k.crest && k.crest.v) || 'light');
    if(img) drawCrest(g, img, uX(.25), crestY, crestW, k.crest && k.crest.edge, TXs/TY);
  }
  /* the back: the name bar and a big number, in whichever of the two colours shows on the cloth under them */
  const nm = String(name || '').toUpperCase();
  if(nm){ const ny = y(SHOULDER_CM - 9); drawText(g, nm, uX(.75), ny, 6.4*TY, readable(g, n, uX(.75), ny), NAMEFONT[k.f] || 'block', TXs/TY, 40*TXs, .1); }
  if(num !== '' && num != null){ const ny = y(SHOULDER_CM - 31); drawText(g, String(num), uX(.75), ny, 25*TY, readable(g, n, uX(.75) - 30, ny), k.f || 'block', TXs/TY*1.05, 44*TXs, .02); }
  /* the NHL shield at the throat */
  const sy = y(PROF.total - 17); g.fillStyle = '#e8eaed'; g.fillRect(uX(.25) - 7, sy - 9, 14, 16); g.fillStyle = '#111'; g.fillRect(uX(.25) - 4, sy - 6, 8, 8);
}
/* text colours that read on the cloth under (x, y): swap fill and outline when the fill would vanish */
function readable(g, cols, x, y){
  let d; try { d = g.getImageData(Math.round(x), Math.round(y), 1, 1).data; } catch(e){ return cols; }
  const bg = (.299*d[0] + .587*d[1] + .114*d[2])/255;
  if(Math.abs(lum(cols[0]) - bg) > .28) return cols;
  const alt = cols[1] && Math.abs(lum(cols[1]) - bg) > .28 ? cols[1] : (bg > .5 ? '#111111' : '#ffffff');
  return [alt, cols[0], cols[2]];
}
function paintUpper(g, k, num){
  const Wp = ARM_W, Hp = ARM_H, fromSh = cm => Hp - cm*UPY;
  g.fillStyle = sleeveOf(k); g.fillRect(0, 0, Wp, Hp);
  if(k.yoke && k.yoke[2]){ const d = Math.min(33, k.yoke[2]); g.fillStyle = k.yoke[0]; g.fillRect(0, fromSh(d), Wp, d*UPY + 1); if(k.yoke[3] && d < 33){ g.fillStyle = k.yoke[3]; g.fillRect(0, fromSh(d) - 2, Wp, 3); } }
  /* a chest band runs on round the arm, a little higher because the arm hangs */
  for(const s of bandsOf(k.chest)){ const a = (SHOULDER_CM - s.b)*.62, b = (SHOULDER_CM - s.a)*.62; g.fillStyle = s.c; g.fillRect(0, fromSh(b), Wp, (b - a)*UPY + .5); }
  for(const s of bandsOf(k.slv)){ if(s.b <= 34) continue; const a = Math.max(0, s.a - 34), b = s.b - 34; g.fillStyle = s.c; g.fillRect(0, a*UPY, Wp, (b - a)*UPY + .5); }
  if(k.cuff && k.cuff[1] > 34){ g.fillStyle = k.cuff[0]; g.fillRect(0, 0, Wp, (k.cuff[1] - 34)*UPY); }
  if(k.pipe){ g.fillStyle = k.pipe[1]; g.fillRect(Wp*.75 - 7, 0, 14, Hp); g.fillStyle = k.pipe[0]; g.fillRect(Wp*.75 - 4, 0, 8, Hp); }
  /* the sleeve number, on the outside of the upper arm; the arm runs shoulder to elbow, so it is painted upside down */
  if(num !== '' && num != null) drawText(g, String(num), Wp*.25, fromSh(10.5), 9*UPY, k.n || ['#fff'], k.f || 'block', UPX/UPY, 15*UPX, .02, Math.PI);
}
function paintFore(g, k){
  const Wp = ARM_W, Hp = ARM_H;
  g.fillStyle = sleeveOf(k); g.fillRect(0, 0, Wp, Hp);
  if(k.yoke && k.yoke[2] >= 99){ g.fillStyle = k.yoke[0]; g.fillRect(0, 0, Wp, Hp); }
  if(k.cuff){ g.fillStyle = k.cuff[0]; g.fillRect(0, 0, Wp, Math.min(34, k.cuff[1])*FOY); }
  for(const s of bandsOf(k.slv)){ if(s.a >= 34) continue; const b = Math.min(34, s.b); g.fillStyle = s.c; g.fillRect(0, s.a*FOY, Wp, (b - s.a)*FOY + .5); }
  if(k.pipe){ g.fillStyle = k.pipe[1]; g.fillRect(Wp*.75 - 7, 0, 14, Hp); g.fillStyle = k.pipe[0]; g.fillRect(Wp*.75 - 4, 0, 8, Hp); }
}
function paintPants(g, k){
  const [c, s] = k.pants || ['#111111', null];
  g.fillStyle = c; g.fillRect(0, 0, 128, 64);
  if(s) for(const u of [.25, .75]){ g.fillStyle = s; g.fillRect(u*128 - 3, 0, 6, 64); }
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, 58, 128, 6);
}
function paintSocks(g, k){
  const sp = k.socks || [k.b];
  g.fillStyle = sp[0]; g.fillRect(0, 0, 64, 128);
  let f = .3; for(const [c, h] of sp.slice(1)){ g.fillStyle = c; g.fillRect(0, 128 - (f + h)*128, 64, h*128 + .5); f += h; }
}
/* the goalie's pads, mask and blocker are painted in app/faceoff/goalie3d.js (his atlas): teamMats still asks for these */
function paintPad(g, c1){ g.fillStyle = '#f4f6f8'; g.fillRect(0, 0, 64, 192); g.fillStyle = c1; g.fillRect(0, 44, 64, 16); }
function paintMask(g, abbr, c1){ g.fillStyle = c1; g.fillRect(0, 0, 512, 256); }
function paintBlocker(g, c1){ g.fillStyle = '#f4f6f8'; g.fillRect(0, 0, 64, 112); g.strokeStyle = c1; g.lineWidth = 7; g.strokeRect(3, 3, 58, 106); }

/* every painted canvas, so it can be painted again once the fonts and logos have landed */
const painted = [];
function paintTex(w, h, fn){ const t = canvasTex(w, h); const run = () => { fn(t.image.getContext('2d')); t.needsUpdate = true; }; run(); painted.push(run); return t; }
function repaintAll(){ for(const f of painted) f(); }
let repaintQ = 0;
logoWait.push(function again(){ clearTimeout(repaintQ); repaintQ = setTimeout(repaintAll, 60); logoWait.push(again); });
const FONT_LOAD = ['900 50px "Big Shoulders Display"', '50px "Graduate"', '50px "Alfa Slab One"', '50px "Russo One"', 'italic 900 50px "Exo 2"', '26px Michroma'];
if(document.fonts && document.fonts.load) Promise.all(FONT_LOAD.map(f => document.fonts.load(f).catch(() => null))).then(() => { repaintAll(); paintCube(); boardMat.map = boardTex = boardTexture(); boardTex.wrapS = THREE.RepeatWrapping; boardTex.repeat.x = 1; boardMat.needsUpdate = true; });

/* materials for a whole team (shared), and the three numbered pieces per man */
const teamCache = {}, manCache = {};
function teamMats(abbr){
  if(teamCache[abbr]) return teamCache[abbr];
  const k = kitOf(abbr), sl = sleeveOf(k);
  const elbowC = k.cuff && k.cuff[1] >= 30 ? k.cuff[0] : (k.yoke && k.yoke[2] >= 99 ? k.yoke[0] : sl);
  const shC = k.yoke && k.yoke[2] ? k.yoke[0] : sl;
  const glv = k.glv || [k.helm || k.b, k.b];
  const darkest = [k.b, k.helm, glv[0]].filter(Boolean).sort((a, b) => lum(a) - lum(b))[0];
  const accent = (k.n && k.n[1] && k.n[1] !== k.b) ? k.n[1] : (k.col && k.col[1]) || '#ffffff';
  const T = {
    pants: new THREE.MeshStandardMaterial({ map: paintTex(128, 64, g => paintPants(g, k)), roughness: .7 }),
    leg: std((k.pants || ['#111'])[0], .7),
    sock: new THREE.MeshStandardMaterial({ map: paintTex(64, 128, g => paintSocks(g, k)), roughness: .85 }),
    sockPlain: std((k.socks || [k.b])[0], .85),
    helm: std(k.helm || k.b, .28, .12), glove: std(glv[0], .6), cuff: std(glv[1], .6),
    collar: std((k.col || [k.b])[0], .8),
    elbow: std(elbowC, .82), shoulder: std(shC, .82),
    gpad: new THREE.MeshStandardMaterial({ map: paintTex(64, 192, g => paintPad(g, darkest, accent)), roughness: .7 }),
    gmask: new THREE.MeshStandardMaterial({ map: paintTex(512, 256, g => paintMask(g, abbr, k.helm || k.b, accent === (k.helm || k.b) ? '#ffffff' : accent)), roughness: .25, metalness: .1 }),
    gblock: new THREE.MeshStandardMaterial({ map: paintTex(64, 112, g => paintBlocker(g, darkest, accent)), roughness: .6 }),
    gtrap: new THREE.MeshStandardMaterial({ color: darkest, roughness: .7, side: THREE.DoubleSide }),
    gwhite: std(0xf3f5f7, .8), gaccent: std(accent, .7), kit: k
  };
  return teamCache[abbr] = T;
}
function manMats(abbr, name, num){
  const key = abbr + '|' + name + '|' + num;
  if(manCache[key]) return manCache[key];
  const torso = new THREE.MeshStandardMaterial({ map: paintTex(TPX, TPY, g => paintTorso(g, kitOf(abbr), abbr, name, num)), roughness: .82, side: THREE.DoubleSide });
  const upper = new THREE.MeshStandardMaterial({ map: paintTex(ARM_W, ARM_H, g => paintUpper(g, kitOf(abbr), num)), roughness: .82 });
  const fore = new THREE.MeshStandardMaterial({ map: paintTex(ARM_W, ARM_H, g => paintFore(g, kitOf(abbr))), roughness: .82 });
  return manCache[key] = { torso, upper, fore };
}
const SKINS = [0xf1cfae, 0xe0b48c, 0xc99067, 0xa86e48, 0x7d4e30];
const skinMats = SKINS.map(c => { const m = std(c, .6); m.emissive.setHex(c); m.emissiveIntensity = .18; return m; });

/* ===================================== THE SKATER =====================================
   Built, dressed and moved in app/faceoff/skater3d.js: one skinned mesh per man (kit, gear and
   stick in one draw call), a bone rig, the stride, the stop, the shots. This file says where he
   is and what he is doing. */
const SK = P.skater3d({ world, cam, seedOf, kitOf, sleeveOf, paintTorso, paintUpper, paintFore, paintSocks, paintTex, PROF, SHOULDER_CM });
function makeSkater(){ return SK.make(); }

/* ===================================== THE GOALIE =====================================
   Built, dressed and moved in app/faceoff/goalie3d.js: one skinned mesh per goalie (pads, trapper,
   blocker, chest and arms under the sweater, mask and cage, stick) in one draw call, a bone rig,
   the stance, the shuffle and T-push, the saves. He faces +z in his net's frame, catches with his
   left hand (+x), blocker and stick in the right. Its timeline and the shot are read late (they are
   declared further down). */
let GKIT = null;
const goalieKit = () => GKIT || (GKIT = P.goalie3d({ parent: world, aniso: ANISO, GS,
  get puck(){ return puck; }, get K(){ return K; }, shot: () => ({ guess, spot: shotSpot, scored, id: shotT0 }) }));
function makeGoalie(){ return goalieKit().makeGoalie(); }

/* ---- snow off the skates ---- */
const NP = 420, pPos = new Float32Array(NP*3), pVel = new Float32Array(NP*3), pLife = new Float32Array(NP);
for(let i = 0; i < NP; i++) pPos[i*3 + 1] = -50;
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
const snowPts = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0xf4faff, size: .03, transparent: true, opacity: .9, depthWrite: false })); world.add(snowPts);
let pNext = 0;
function spray(at, dir, n, speed){
  if(!at) return;
  for(let j = 0; j < n; j++){
    const i = pNext++ % NP;
    pPos[i*3] = at.x + (Math.random() - .5)*.1; pPos[i*3 + 1] = .02; pPos[i*3 + 2] = at.z + (Math.random() - .5)*.1;
    pVel[i*3] = dir.x*speed*(.4 + Math.random()) + (Math.random() - .5)*.5; pVel[i*3 + 1] = .3 + Math.random()*.9; pVel[i*3 + 2] = dir.z*speed*(.4 + Math.random()) + (Math.random() - .5)*.5;
    pLife[i] = .4 + Math.random()*.5;
  }
}
function stepSnow(dt){
  for(let i = 0; i < NP; i++){
    if(pLife[i] <= 0) continue;
    pLife[i] -= dt; pVel[i*3 + 1] -= 5*dt;
    pPos[i*3] += pVel[i*3]*dt; pPos[i*3 + 1] += pVel[i*3 + 1]*dt; pPos[i*3 + 2] += pVel[i*3 + 2]*dt;
    if(pPos[i*3 + 1] < .006){ pPos[i*3 + 1] = .006; pVel[i*3] *= .8; pVel[i*3 + 2] *= .8; pVel[i*3 + 1] = 0; }
    if(pLife[i] <= 0) pPos[i*3 + 1] = -50;
  }
  pGeo.attributes.position.needsUpdate = true;
}
function snowRot(){ for(let i = 0; i < NP; i++){ if(pLife[i] <= 0) continue; pPos[i*3] = -pPos[i*3]; pPos[i*3 + 2] = GS - pPos[i*3 + 2]; pVel[i*3] = -pVel[i*3]; pVel[i*3 + 2] = -pVel[i*3 + 2]; } }

const puck = mesh(new THREE.CylinderGeometry(.038, .038, .025, 24), Mt.puck, world);
const SL = 1.42;

/* ===================================== THE CAST ===================================== */
/* two goalies and five skaters a side; A[w][0] is w's goalie, then 1 LD, 2 RD, 3 C, 4 LW, 5 RW */
const A = [0, 1].map(w => [0, 1, 2, 3, 4, 5].map(i => {
  if(i === 0){ const g = makeGoalie(); g.w = w; g.i = 0; g.goalie = true; return g; }
  const s = makeSkater(); Object.assign(s, { w, i, x: 0, z: ZC, vx: 0, vz: 0, head: 0, tx: 0, tz: ZC, ph: Math.random(), amt: 0, turn: 0, mode: 'idle', t0: 0, seed: Math.random()*6, face: null, back: false, speed: 0 });
  return s;
}));
const skaters = () => A[0].slice(1).concat(A[1].slice(1));
/* the shootout's own shooter, so the duel never disturbs the match */
const SO = makeSkater();
/* rings on the ice: who has it, and who you are about to find */
const ringC = new THREE.Mesh(new THREE.RingGeometry(.48, .58, 40), new THREE.MeshBasicMaterial({ color: 0xF2C230, transparent: true, opacity: .85, depthWrite: false })); ringC.rotation.x = -Math.PI/2; ringC.position.y = .012; world.add(ringC);
const ringT = new THREE.Mesh(new THREE.RingGeometry(.5, .6, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .7, depthWrite: false })); ringT.rotation.x = -Math.PI/2; ringT.position.y = .012; world.add(ringT); ringT.visible = false;

/* ===================================== THE SHOT =====================================
   One attempt is a function of u in 0..1, the shootout scene: skate in, a deke,
   load, sweep, release, then the goal or the save. */
const DUR = 3100, K = { go: .05, deke: .40, load: .58, sweep: .64, shot: .664, hit: .72, end: .9 };
let START = [-1.35, 8.6], END = [-1.0, 3.7], SH = SO, GNo = A[1][0];
let state = 'idle', shotT0 = 0, shotSpot = 'gh', guess = 'fh', scored = false, releaseW = null, goalLit = 0;
const mirr = () => SH.hand === 'R' ? -1 : 1;
function rootAt(u){
  const k = ease(clamp((u - K.go)/(K.shot + .01 - K.go))), m = mirr();
  let x = lerp(START[0], END[0], k) + m*Math.sin(k*Math.PI)*.35, z = lerp(START[1], END[1], k);
  const a = clamp((u - K.shot)/(1 - K.shot)); x -= m*(.25*a + 1.1*a*a); z -= .9*a*(1 - .5*a);
  return [x, z];
}
/* the shooter's body through the attempt: app/faceoff/skater3d.js (wrist shot, snapshot, one-timer) */
let shotKind = '', oneAt = null, oneFrom = null;
function skaterPose(u, t, idle){
  const sp = SPOTS[shotSpot];
  return SK.shotPose(SH, u, t, idle, { K, DUR, scored, kind: shotKind, reduced: reduced(), high: !!(sp && sp.p[1] > .5) });
}
/* where the puck sits on his blade, on the ice */
function bladeWorld(actor, r){ const p = actor.root.localToWorld(r.blade.clone()); p.y = .013; return p; }
function setShooter(u, t, idle){
  const [x, z] = rootAt(idle ? 0 : u), [x2, z2] = rootAt(Math.min(.995, (idle ? 0 : u) + .01));
  const dx = idle ? END[0] - START[0] : x2 - x, dz = idle ? END[1] - START[1] : z2 - z;
  SH.root.position.set(x, 0, z); SH.root.rotation.y = Math.atan2(-dx, -dz);
  const Pq = skaterPose(u, t, idle), r = SH.pose(Pq);
  return { Pq, r };
}
const SPOTS = {
  gh: { n: 'Glove high', s: 'Glove high', p: [.64, .98] },
  bh: { n: 'Blocker high', s: 'Blocker high', p: [-.64, .98] },
  fh: { n: 'Five-hole', s: 'Five-hole', p: [0, .13] },
  lg: { n: 'Low glove', s: 'Low', p: [.7, .15] },
  lb: { n: 'Low blocker', s: 'Low', p: [-.7, .15] }
};
/* the goalie follows the puck round his crease (shuffles, T-pushes, the post), and plays his save */
function trackGoalie(g, dt){ goalieKit().trackGoalie(g, dt); }
function goaliePose(u, t, idle, pw, seed, g){ return goalieKit().goaliePose(u, t, idle, pw, seed, g); }
let lastU = 0, lastHitU = 0, padSprayed = false, shotLive = false, shotClock = 0, slow = 0;
let hitW = null;                   /* where a save met the puck: the rebound starts there */
/* runs the shot, or the shooter waiting at the line. The clock runs slow from the load to the
   moment it reaches the net: the bit everyone leans in for */
function runShot(now, t, dt){
  const idle = !(state === 'shoot' || state === 'result');
  if(!idle){
    const u0 = shotClock/DUR, inSlow = !reduced() && u0 > K.load - .03 && u0 < K.hit + .015;
    slow += ((inSlow ? 1 : 0) - slow)*(1 - Math.exp(-dt*(inSlow ? 10 : 6)));
    shotClock += dt*1000*lerp(1, .36, slow)*(replaying ? .6 : 1);
  } else slow = Math.max(0, slow - dt*4);
  const u = idle ? 0 : clamp(shotClock/DUR);
  if(!idle && u >= K.shot && !releaseW){ const s = setShooter(K.shot, t, false); releaseW = bladeWorld(SH, s.r); }
  const { Pq, r } = setShooter(u, t, idle);
  const S = SPOTS[shotSpot].p, target = V(S[0], S[1], .03);
  if(shotKind === 'one' && !idle && u >= K.deke && u < K.shot){
    /* a one-timer: the puck goes on ahead into the spot where the blade will come down */
    if(!oneAt){ const s1 = setShooter(K.shot, t, false); oneAt = bladeWorld(SH, s1.r); oneFrom = puck.position.clone(); setShooter(u, t, idle); }
    const f = clamp((u - K.deke)/(K.shot - K.deke)); puck.position.copy(vl(oneFrom, oneAt, 1 - Math.pow(1 - f, 1.7))); puck.rotation.y += .3;
  }
  else if(idle || u < K.shot){ puck.position.copy(bladeWorld(SH, r)); puck.rotation.set(0, 0, 0); }
  else if(u < K.hit){ const f = (u - K.shot)/(K.hit - K.shot), tgt = scored ? target : (hitW = GNo.contact(shotSpot)); puck.position.copy(vl(releaseW, tgt, f)); puck.position.y += Math.sin(f*Math.PI)*.06; puck.rotation.x += .6; }
  else {
    const f = clamp((u - K.hit)/(K.end - K.hit)), h0 = hitW || target;
    if(scored){ const drop = clamp((f - .25)/.5); puck.position.set(S[0]*.8, lerp(S[1], .016, ease(drop)), lerp(.03, -.82, Math.sqrt(clamp(f/.35)))); }
    else if(shotSpot === 'gh'){ GNo.trapper.updateMatrixWorld(true); GNo.trapper.getWorldPosition(puck.position); puck.position.z += .02; }
    else if(shotSpot === 'bh'){ puck.position.set(h0.x - f*2.6, Math.max(.016, h0.y + f*1.4 - f*f*2.6), lerp(h0.z, 1.6, f)); puck.rotation.z += .4; }
    else { const side = S[0] > .1 ? 1 : S[0] < -.1 ? -1 : .3; puck.position.set(h0.x + side*f*1.2, lerp(h0.y, .016, clamp(f*5)), lerp(h0.z, 2.6, f)); }
  }
  if(idle || u < K.shot) trackGoalie(GNo, dt);
  const pg = goaliePose(u, t, idle, puck.position, 0, GNo);
  GNo.pose(pg);
  if(!idle){
    for(let i = 0; i < 2; i++){
      const f = Pq.feet[i];
      if(f.push > .4 && f.push < .55 && Math.random() < .7){ const s = i ? 1 : -1; const at = SH.root.localToWorld(f.p.clone()); const dir = SH.root.localToWorld(V(s*1, 0, .6)).sub(SH.root.position).normalize(); spray(at, dir, 3, 1.2); }
    }
    if(lastU < K.shot && u >= K.shot) spray(releaseW, V(0, 0, -1), 12, .8);
    if(pg.splay > .7 && !padSprayed){ padSprayed = true; for(const s of [-1, 1]) spray(V(pg.x + s*.45, 0, .45), V(s, 0, .4), 18, 1.4); }
    if(u > .88 && lastU <= .88) spray(SH.root.localToWorld(V(0, 0, 0)), V(1, 0, .2), 22, 1.6);
  }
  lastU = u;
  const lit = scored && !idle && u > K.hit;
  NN.skin.scale.z = lit ? 1 + Math.max(0, Math.sin(clamp((u - K.hit)/.12)*Math.PI))*.28 : 1;
  if(lit) goalLit = Math.max(goalLit, .2);
  if(state === 'shoot' && lastHitU < K.hit && u >= K.hit){ if(scored){ goalLit = 3.2; flashRate = replaying ? 20 : 70; } else { GNo.trk.ready = 1; } if(api.onHit && !replaying) api.onHit(scored, shotSpot); }
  lastHitU = u;
  if(state === 'shoot' && u >= K.end && replaying){ endReplay(); return u; }
  if(state === 'shoot' && u >= K.end){ state = 'result'; showFlash(scored ? 'GOAL' : 'SAVE', scored ? 'goal' : 'save'); resEl.hidden = false; if(resolveShot) resolveShot(); }
  return u;
}

/* ===================================== THE MATCH ===================================== */
let mode = 'shootout';             // shootout | match | show
let att = 0;                       // the side drawn attacking the north net
let carrier = null;                // whoever has the puck: { w, i }
const pk = { state: 'carry', from: V(), to: V(), t0: 0, dur: 1, at: V(), done: null, spin: 0, lift: 0 };
const rot = p => ({ x: -p.x, z: GS - p.z });
const viewOf = (w, p) => w === att ? { x: p.x, z: p.z } : rot(p);
const actor = (w, i) => A[w][i];
function setEnds(){ for(const w of [0, 1]) A[w][0].setEnd(w === att ? 1 : 0); GNo = A[1 - att][0]; }

/* ---- the camera rig ----
   Every view is a point to look at (T), a distance (D), a heading round it (yaw: 0 is from
   the south end, behind the attack) and a height angle (el). The rig eases all of them
   towards the view asked for, so cutting between views, swinging round after a turnover
   and letting go of a drag are one smooth move, never a jump. The player's own drag,
   pinch and pan (usr) sit on top and melt away whenever play starts again. */
const camF = V(0, 0, ZC);
const rig = { T: V(0, .4, ZC), D: 15, yaw: 0, el: .56, fov: 46 };
const usr = { yaw: 0, el: 0, zoom: 1, px: 0, pz: 0, drag: false };
let view = 'tv', baseEl = .56, ctlEnabled = true;
let celeYaw = null, shotT = 0, camMode = 'play', camHold = null, celeAt = null, celeT0 = 0, shotBlend = 0;
let replaying = false, replayRes = null, lastShot = null, celeEnd = null, coverK = [];
let inT = 0, inB = 0, inTc = 0, inBc = 0, offApplied = NaN;
let aspect = .8, W_ = 1, H_ = 1;
const D2R = Math.PI/180;
/* a vertical field of view that suits the screen: taller on a phone held upright */
const vfFor = (port, land) => aspect < 1 ? lerp(port, land + 6, clamp((aspect - .45)/.55)) : land;
/* how far back to stand so `width` metres fill the screen across at that field of view */
const distFor = (width, vf) => (width/2)/Math.tan(Math.atan(Math.tan(vf*D2R/2)*aspect));
const shotFov = () => clamp(2*Math.atan(Math.tan(9*D2R)/aspect)/D2R, 14, 40);
function setFov(f){ if(Math.abs(cam.fov - f) > .01){ cam.fov = f; cam.updateProjectionMatrix(); } }
/* the HUD covers the top and bottom of the canvas: shift the picture so the play sits in what is left */
function applyOffset(){
  const d = Math.round((inBc - inTc)/2);
  if(d === offApplied) return; offApplied = d;
  if(!d) cam.clearViewOffset(); else cam.setViewOffset(W_, H_, 0, d, W_, H_);
  cam.updateProjectionMatrix();
}
function flipView(){
  att = 1 - att;
  for(const s of skaters()){ s.x = -s.x; s.z = GS - s.z; s.vx = -s.vx; s.vz = -s.vz; s.head += Math.PI; s.tx = -s.tx; s.tz = GS - s.tz; s.root.position.set(s.x, 0, s.z); }
  setEnds();
  for(const v of [pk.from, pk.to, pk.at, puck.position, camF, rig.T]){ v.x = -v.x; v.z = GS - v.z; }
  rig.yaw += Math.PI; usr.px = -usr.px; usr.pz = -usr.pz;
  snowRot(); hatsRot();
}

/* ---- looking around: drag to orbit, pinch or wheel to zoom, two fingers or right-drag to pan ---- */
const usrMoved = () => Math.abs(usr.yaw) > .03 || Math.abs(usr.el) > .03 || Math.abs(usr.zoom - 1) > .04 || Math.hypot(usr.px, usr.pz) > .4;
const ctlOn = () => mode === 'match' && ctlEnabled && !shotLive && camMode === 'play';
let camKey = '';
function syncCamUI(){
  const on = ctlOn(), k = on + view + usrMoved();
  if(k === camKey) return; camKey = k;
  camui.hidden = !on; wrap.classList.toggle('look', on);
  for(const b of camui.children){ const v = b.dataset.v; if(v === 'reset') b.hidden = !(usrMoved() || view !== 'tv'); else { b.classList.toggle('on', v === view); b.setAttribute('aria-pressed', v === view ? 'true' : 'false'); } }
}
function camReset(){ usr.yaw = usr.el = usr.px = usr.pz = 0; usr.zoom = 1; view = 'tv'; syncCamUI(); }
/* play starts again: back to the broadcast camera, smoothly */
function snapBack(){ camReset(); usr.drag = false; }
camui.addEventListener('click', e => {
  const b = e.target.closest('button'); if(!b) return;
  if(b.dataset.v === 'reset') camReset(); else { usr.yaw = usr.el = usr.px = usr.pz = 0; usr.zoom = 1; view = b.dataset.v; }
  syncCamUI(); if(api.onLook) api.onLook(view);
});
const ptrs = new Map(); let gest = null, suppressUntil = 0;
function panBy(dx, dy){
  const s = 2*rig.D*Math.tan(cam.fov*D2R/2)/Math.max(1, H_), cy = Math.cos(rig.yaw), sy = Math.sin(rig.yaw);
  usr.px = clamp(usr.px + (-dx*cy - dy*sy)*s, -14, 14); usr.pz = clamp(usr.pz + (dx*sy - dy*cy)*s, -26, 26);
}
function twoStart(){ const [a, b] = [...ptrs.values()]; gest = { moved: true, two: true, d0: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), z0: usr.zoom, mx: (a.x + b.x)/2, my: (a.y + b.y)/2 }; usr.drag = true; }
wrap.addEventListener('pointerdown', e => {
  if(!ctlOn() || e.target.closest('.camui')) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if(ptrs.size === 1) gest = { moved: false, sx: e.clientX, sy: e.clientY, pan: e.button === 2 || e.shiftKey || e.ctrlKey };
  else if(ptrs.size === 2) twoStart();
});
wrap.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if(!p || !gest) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if(!ctlOn()) return;
  if(ptrs.size === 1 && !gest.two){
    if(!gest.moved){
      if(Math.hypot(e.clientX - gest.sx, e.clientY - gest.sy) < 8) return;
      gest.moved = true; usr.drag = true; wrap.classList.add('grab');
      try { wrap.setPointerCapture(e.pointerId); } catch(err){}
    }
    if(gest.pan) panBy(dx, dy);
    else { usr.yaw -= dx*.0065; usr.el = clamp(usr.el + dy*.0045, .1 - baseEl, 1.42 - baseEl); }
  } else if(ptrs.size >= 2 && gest.two){
    const [a, b] = [...ptrs.values()], d = Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), mx = (a.x + b.x)/2, my = (a.y + b.y)/2;
    usr.zoom = clamp(gest.z0*gest.d0/d, .4, 2.4); panBy(mx - gest.mx, my - gest.my); gest.mx = mx; gest.my = my;
  }
  syncCamUI(); if(api.onLook) api.onLook('drag');
});
function ptrEnd(e){
  if(!ptrs.delete(e.pointerId)) return;
  if(gest && gest.moved) suppressUntil = performance.now() + 300;
  if(ptrs.size === 1){ const p = [...ptrs.values()][0]; gest = { moved: true, sx: p.x, sy: p.y, pan: false }; }
  if(!ptrs.size){ gest = null; usr.drag = false; wrap.classList.remove('grab'); }
}
wrap.addEventListener('pointerup', ptrEnd); wrap.addEventListener('pointercancel', ptrEnd);
wrap.addEventListener('wheel', e => {
  if(!ctlOn()) return; e.preventDefault();
  usr.zoom = clamp(usr.zoom*Math.exp(e.deltaY*(e.ctrlKey ? .01 : .0012)), .4, 2.4); syncCamUI(); if(api.onLook) api.onLook('zoom');
}, { passive: false });
wrap.addEventListener('dblclick', e => { if(ctlOn() && !e.target.closest('.tag,.camui')) camReset(); });
wrap.addEventListener('contextmenu', e => { if(ctlOn()) e.preventDefault(); });

/* ---- skating ---- */
/* where a defender pressing the puck goes: the man with it, or where the pass is going */
function pressPoint(){
  if(pk.state === 'fly') return pk.to;
  if(carrier){ const c = actor(carrier.w, carrier.i); return c.goalie ? V(0, 0, GS - 3) : V(c.x, 0, c.z); }
  return null;
}
function steer(s, dt){
  /* a defender on a man, or on the puck, keeps his gap as they move: goal side of him, a stick away */
  if(s.follow && camMode === 'play' && !shotLive){
    if(s.follow.press){ const p = pressPoint(); if(p){ s.tx = p.x*.85; s.tz = p.z - 2.3; } }
    else { const o = actor(att, s.follow.i); s.tx = o.x*.8; s.tz = o.z - 1.25; }
    s.tx = clamp(s.tx, -HX + 1, HX - 1); s.tz = clamp(s.tz, ZN + 1.5, ZS - 1.5);
  }
  const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz);
  const vmax = s.vmax || 7.2;
  const sp = d < .12 ? 0 : Math.min(vmax, d*1.7);
  let wx = d > 1e-3 ? dx/d*sp : 0, wz = d > 1e-3 ? dz/d*sp : 0;
  /* a body's width from each other */
  for(const o of skaters()){ if(o === s || !o.root.visible) continue; const ox = s.x - o.x, oz = s.z - o.z, od = Math.hypot(ox, oz); if(od < 1.05 && od > 1e-3){ const f = (1.05 - od)*3; wx += ox/od*f; wz += oz/od*f; } }
  const ax = wx - s.vx, az = wz - s.vz, al = Math.hypot(ax, az), amax = (s.acc || 11)*dt;
  const k = al > amax ? amax/al : 1, before = Math.hypot(s.vx, s.vz), bvx = s.vx, bvz = s.vz;
  s.vx += ax*k; s.vz += az*k;
  s.x += s.vx*dt; s.z += s.vz*dt;
  s.x = clamp(s.x, -HX + .6, HX - .6); s.z = clamp(s.z, ZN + .7, ZS - .7);
  const speed = Math.hypot(s.vx, s.vz);
  s.acc1 = lerp(s.acc1 || 0, (speed - before)/Math.max(dt, 1e-3), .25);
  /* a hockey stop: both skates across, down low, a sheet of snow off the blades */
  if(s.acc1 < -4.5 && before > 2.6 && (s.stopK || 0) < .25){
    s.stopK = 1; s.stopSide = Math.random() < .5 ? -1 : 1;
    const ux = bvx/before, uz = bvz/before;
    for(const o of [-.25, .25]) spray(V(s.x + uz*o + ux*.3, 0, s.z - ux*o + uz*.3), V(ux, 0, uz), 9, 2.6);
  }
  s.stopK = Math.max(0, (s.stopK || 0) - dt*2.3);
  if(s.stopK > .45 && speed > 1 && Math.random() < .6) spray(V(s.x + s.vx/speed*.35, 0, s.z + s.vz/speed*.35), V(s.vx/speed, 0, s.vz/speed), 2, 2.2);
  /* coasting: feet together, a glide */
  s.glide = lerp(s.glide || 0, speed > 1.6 && s.acc1 < -.3 && s.acc1 > -4.5 ? 1 : 0, .08);
  /* heading: along the skate when going, at what he watches when not; a man facing the play skates backwards */
  let want = s.head;
  const fp = s.face, faceA = fp ? Math.atan2(-(fp.x - s.x), -(fp.z - s.z)) : null;
  const moveA = Math.atan2(-s.vx, -s.vz);
  s.back = false;
  if(speed > 1.1){ want = moveA; if(faceA != null && Math.abs(wrapA(moveA - faceA)) > 2.1 && s.mode !== 'carry'){ want = faceA; s.back = true; } }
  else if(faceA != null) want = faceA;
  const dh = wrapA(want - s.head), rate = (speed > 1.1 ? 6 : 3.5)*dt;
  const step = Math.max(-rate, Math.min(rate, dh)); s.head += step;
  s.turn = lerp(s.turn, step/Math.max(dt, 1e-3), .15);
  s.amt = lerp(s.amt, clamp(speed/4.2), .2);
  s.ph += dt*(.55 + speed*.3);
  s.speed = speed;
}
/* each man's body from how he moves and what he is doing: app/faceoff/skater3d.js */
function matchPose(s, t, now){ return SK.matchPose(s, t, now, reduced()); }

/* ---- on the ice while you choose: the lanes to each team-mate in the colour of what the pass costs,
   red rings under the men marking them, and the rings for the puck carrier and the target ---- */
const TIER_HEX = { easy: 0x5fd38a, normal: 0xf2c94c, hard: 0xff9a3c, extreme: 0xff5a4f };
const laneTex = canvasTex(32, 256, g => {
  const gr = g.createLinearGradient(0, 256, 0, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.25, 'rgba(255,255,255,.35)'); gr.addColorStop(.9, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,.4)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 256);
  g.globalCompositeOperation = 'destination-in'; const ed = g.createLinearGradient(0, 0, 32, 0); ed.addColorStop(0, 'rgba(0,0,0,0)'); ed.addColorStop(.35, '#000'); ed.addColorStop(.65, '#000'); ed.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = ed; g.fillRect(0, 0, 32, 256);
});
const lanes = [0, 1, 2, 3, 4].map(() => {
  const g = new THREE.Group(), m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: laneTex, transparent: true, depthWrite: false, opacity: .7 }));
  m.rotation.x = -Math.PI/2; g.add(m); g.visible = false; world.add(g); g.m = m; return g;
});
const markRings = [0, 1, 2, 3, 4].map(() => { const r = new THREE.Mesh(new THREE.RingGeometry(.4, .5, 32), new THREE.MeshBasicMaterial({ color: 0xff4a3d, transparent: true, opacity: .8, depthWrite: false })); r.rotation.x = -Math.PI/2; r.visible = false; world.add(r); return r; });
const iceMarks = () => lanes.concat(markRings, [ringC, ringT]);
function placeLanes(t){
  const on = mode === 'match' && !!tagMode && !!carrier && !shotLive && camMode === 'play' && pk.state === 'carry';
  let n = 0, mN = 0;
  if(on){
    const c = actor(carrier.w, carrier.i), cp = c.goalie ? c.base.localToWorld(V(0, 0, 1)) : V(c.x, 0, c.z);
    for(const k of Object.keys(tagInfo)){
      const inf = tagInfo[k], r = actor(carrier.w, +k);
      if(inf.by != null && mN < markRings.length){ const d = actor(1 - carrier.w, inf.by), rr = markRings[mN++]; rr.visible = true; rr.position.set(d.x, .013, d.z); rr.scale.setScalar(1 + .08*Math.sin(t*6)); }
      if(!r || r.goalie || n >= lanes.length) continue;
      const dx = r.x - cp.x, dz = r.z - cp.z, L = Math.hypot(dx, dz); if(L < 1.8) continue;
      const g = lanes[n++], a = .7/L, b = 1 - .75/L;
      g.visible = true; g.position.set(cp.x + dx*(a + b)/2, .014, cp.z + dz*(a + b)/2); g.rotation.y = Math.atan2(-dx, -dz);
      g.m.scale.set(inf.by != null ? .26 : .36, L*(b - a), 1);
      g.m.material.color.setHex(TIER_HEX[inf.tier] || 0xffffff); g.m.material.opacity = .5 + .2*Math.sin(t*4 + n*1.3);
    }
  }
  for(let i = n; i < lanes.length; i++) lanes[i].visible = false;
  for(let i = mN; i < markRings.length; i++) markRings[i].visible = false;
}

/* ---- hats on the ice: a hat trick ---- */
const hatGeo = new THREE.LatheGeometry([[0, 0], [.17, 0], [.17, .014], [.1, .02], [.095, .11], [.07, .14], [0, .145]].map(p => new THREE.Vector2(p[0], p[1])), 12);
const NH = 36, hats = new THREE.InstancedMesh(hatGeo, new THREE.MeshStandardMaterial({ roughness: .85 }), NH);
hats.visible = false; hats.frustumCulled = false; hats.castShadow = false; world.add(hats);
const HAT_C = ['#111111', '#c8202a', '#0a1c38', '#f2f2f2', '#2a4a7a', '#6b4a2c', '#e8c070', '#3a3a3a', '#f08a17'];
const hat = [], hm4 = new THREE.Matrix4(), hq = new THREE.Quaternion(), he = new THREE.Euler(), hs = V(1, 1, 1), hc = new THREE.Color(), hOff = V(0, -20, 0);
for(let i = 0; i < NH; i++){ hat.push({ p: V(), v: V(), r: V(), w: V(), t: 0 }); hats.setColorAt(i, hc.set(HAT_C[i % HAT_C.length])); hats.setMatrixAt(i, hm4.compose(hOff, hq, hs)); }
function throwHats(){
  for(let i = 0; i < NH; i++){
    const h = hat[i], p = P0[Math.floor(Math.random()*(P0.length - 1))];
    h.p.set(p.x - p.nx*1.6, 3 + Math.random()*2.5, p.z - p.nz*1.6);
    const sp = 3.5 + Math.random()*5.5; h.v.set(p.nx*sp + (Math.random() - .5)*2, 2.5 + Math.random()*3.5, p.nz*sp + (Math.random() - .5)*2);
    h.r.set(Math.random()*6, Math.random()*6, Math.random()*6); h.w.set((Math.random() - .5)*14, (Math.random() - .5)*10, (Math.random() - .5)*14);
    h.t = -i*.07 - Math.random()*.2;
  }
  hats.visible = true;
}
function stepHats(dt){
  if(!hats.visible) return;
  for(let i = 0; i < NH; i++){
    const h = hat[i]; h.t += dt;
    if(h.t > 0){
      h.v.y -= 9.8*dt; h.p.addScaledVector(h.v, dt);
      if(h.p.y <= 0){
        h.p.y = 0; h.v.y = 0; const f = Math.pow(.2, dt); h.v.x *= f; h.v.z *= f;
        const s = 1 - Math.exp(-dt*9); h.r.x += wrapA(-h.r.x)*s; h.r.z += wrapA(-h.r.z)*s; h.r.y += h.w.y*dt*.3; h.w.multiplyScalar(Math.pow(.05, dt));
      } else h.r.addScaledVector(h.w, dt);
      if(Math.abs(h.p.x) > HX - .3){ h.p.x = Math.sign(h.p.x)*(HX - .3); h.v.x *= -.4; }
      if(h.p.z < ZN + .3 || h.p.z > ZS - .3){ h.p.z = clamp(h.p.z, ZN + .3, ZS - .3); h.v.z *= -.4; }
    }
    he.set(h.r.x, h.r.y, h.r.z); hq.setFromEuler(he); hats.setMatrixAt(i, hm4.compose(h.t > 0 ? h.p : hOff, hq, hs));
  }
  hats.instanceMatrix.needsUpdate = true;
}
function hatsRot(){ for(const h of hat){ h.p.x = -h.p.x; h.p.z = GS - h.p.z; h.v.x = -h.v.x; h.v.z = -h.v.z; h.r.y += Math.PI; } }
function clearHats(){ hats.visible = false; }

const lastBlade = new Map();
let ringTarget = null;
/* during a shot, anyone between the camera and the shooter or the net steps out of the picture */
function segDist(px, pz, ax, az, bx, bz){ const vx = bx - ax, vz = bz - az, L = vx*vx + vz*vz || 1, k = clamp(((px - ax)*vx + (pz - az)*vz)/L); return Math.hypot(px - ax - vx*k, pz - az - vz*k); }
function inShotLane(s){
  const cx = cam.position.x, cz = cam.position.z, sp = SH.root.position;
  if(Math.hypot(s.x - cx, s.z - cz) < 3) return true;
  if(s.z > sp.z - .6 && segDist(s.x, s.z, cx, cz, sp.x, sp.z) < 1.3) return true;
  return s.z > 2.2 && segDist(s.x, s.z, cx, cz, 0, .3) < 1.5;
}
function runMatch(dt, t, now, shotOwnsPuck){
  const nSub = Math.min(6, Math.ceil(dt/.034)), hSub = dt/nSub;
  for(const s of skaters()){
    if(shotLive && s === SH) continue;
    s.root.visible = !s.boxed && !replaying && !(shotLive && shotBlend > .2 && inShotLane(s));
    for(let k = 0; k < nSub; k++) steer(s, hSub);
    const ks = s.stopK ? ease(Math.min(1, s.stopK*1.5)) : 0;
    s.root.position.set(s.x, 0, s.z); s.root.rotation.y = s.head + (s.stopSide || 0)*1.15*ks;
    lastBlade.set(s, s.pose(matchPose(s, t, now)));
    if(s.speed > 3 && (s.glide || 0) < .5 && Math.random() < s.speed*.02) spray(V(s.x, 0, s.z), V(Math.cos(s.head), 0, -Math.sin(s.head)), 2, 1);
  }
  if(!shotOwnsPuck){
    if(pk.state === 'carry' && carrier){
      const c = actor(carrier.w, carrier.i);
      if(c.goalie){ c.trapper.updateMatrixWorld(true); c.trapper.getWorldPosition(puck.position); }
      else { const r = lastBlade.get(c); if(r) puck.position.copy(bladeWorld(c, r)); }
    } else if(pk.state === 'fly'){
      const f = clamp((now - pk.t0)/pk.dur), e = 1 - Math.pow(1 - f, 1.35);
      puck.position.copy(vl(pk.from, pk.to, e)); puck.position.y = .013 + pk.lift*Math.sin(Math.PI*e);
      puck.rotation.y += pk.spin*dt;
      if(f >= 1){ pk.state = 'rest'; pk.at.copy(pk.to); const d = pk.done; pk.done = null; if(d) d(); }
    } else if(pk.state === 'drop'){
      const f = clamp((now - pk.t0)/pk.dur); puck.position.set(pk.at.x, lerp(1.5, .013, f*f), pk.at.z); puck.rotation.x += .2;
      if(f >= 1){ pk.state = 'rest'; puck.rotation.set(0, 0, 0); spray(pk.at, V(0, 0, 1), 6, .6); const d = pk.done; pk.done = null; if(d) d(); }
    } else if(pk.state === 'rest'){ puck.position.copy(pk.at); puck.position.y = .013; }
  }
  /* goalies follow the puck */
  for(const w of [0, 1]){
    const g = A[w][0];
    if(shotLive && g === GNo) continue;
    g.hasPuck = !!(carrier && carrier.w === w && carrier.i === 0 && pk.state === 'carry');
    trackGoalie(g, dt);
    g.pose(goaliePose(0, t, true, null, w*1.7, g));
    if(g.fx && g.fx.scrape && Math.random() < .6) spray(g.fx.scrape.p, g.fx.scrape.dir, 2, .7*g.fx.scrape.n);
  }
  if(carrier && !shotLive && pk.state === 'carry'){ const c = actor(carrier.w, carrier.i); const p = c.goalie ? c.base.localToWorld(V(0, 0, .5)) : V(c.x, 0, c.z); ringC.position.set(p.x, .012, p.z); ringC.scale.setScalar(1 + .06*Math.sin(t*5)); }
  if(ringTarget){ const c = actor(ringTarget.w, ringTarget.i); ringT.position.set(c.x, .012, c.z); ringT.scale.setScalar(1 + .1*Math.sin(t*7)); }
  placeLanes(t);
}
function ringsOn(){ ringC.visible = mode === 'match' && !!(carrier && !shotLive && pk.state === 'carry'); ringT.visible = mode === 'match' && !!(ringTarget && !shotLive); }
function focusPoint(){
  if(carrier && pk.state === 'carry'){ const c = actor(carrier.w, carrier.i); return c.goalie ? c.base.localToWorld(V(0, 0, 1.5)) : V(c.x, 0, c.z); }
  if(pk.state === 'fly') return puck.position.clone().lerp(pk.to, .5);
  return puck.position.clone();
}
/* the sweater room: one man on the ice, the camera walking round him */
let showAng = 0, showCur = 0;
function runShow(t, dt){
  SO.root.position.set(0, 0, 5.2); SO.root.rotation.y = 0;
  /* stood up straight so the crest shows, the stick resting on the ice by his side */
  const r = SO.pose(SK.showPose(SO, t));
  puck.position.copy(bladeWorld(SO, r));
  GNo.pose(goaliePose(0, t, true, puck.position, 0, GNo));
  showCur += wrapA(showAng - showCur)*(1 - Math.exp(-dt*3));
}
let shadowWide = false;
const Tt = V();
function updateCam(dt, now, shotU){
  const r = reduced();
  if(mode === 'lab'){ SK.labCam(cam, key, dt); return; }
  if(mode === 'show'){
    const a = showCur + (r ? 0 : Math.sin(now/1000*.5)*.45);
    cam.position.set(Math.sin(a)*3.1, 1.45, 5.2 + Math.cos(a)*3.1); cam.lookAt(0, 1.0, 5.2); setFov(aspect < 1 ? 34 : 28);
    key.target.position.set(0, 0, 5); key.position.set(2.5, 16, 12); key.target.updateMatrixWorld();
    return;
  }
  if(mode === 'shootout'){
    const c = ease(clamp(shotU/K.shot));
    cam.position.copy(vl(CAM0, CAM1, c)); cam.position.z -= slow*1.1; cam.position.y += (aspect < 1 ? 1.2 : 0) - slow*.12; if(aspect < 1) cam.position.z += 2.2; cam.lookAt(LOOK); setFov(shotFov() - slow*1.5);
    key.target.position.set(0, 0, 3); key.position.set(2.5, 16, 10); key.target.updateMatrixWorld();
    return;
  }
  if(replaying){
    /* the replay: the reverse angle, high behind the net, the goalie in front and the shooter coming at us */
    const sd = START[0] >= 0 ? 1 : -1, k = ease(clamp(shotClock/DUR)), port = aspect < 1;
    cam.position.set(sd*lerp(1.1, .5, k), lerp(2.6, 2.15, k), lerp(-3.1, -2.6, k));
    cam.lookAt(lerp(START[0], END[0], k)*.55, .45, lerp(port ? 5.4 : 5.8, port ? 2.9 : 3.2, k)); setFov(port ? lerp(56, 50, k) : lerp(34, 30, k));
    key.target.position.set(0, 0, 3); key.position.set(2.5, 16, 10); key.target.updateMatrixWorld();
    return;
  }
  const F = camHold ? camHold.clone() : focusPoint();
  let D, el, yaw = 0, vf;
  if(camMode === 'faceoff'){ vf = vfFor(50, 30); Tt.set(F.x, .4, F.z); el = .42; yaw = .55; D = distFor(aspect < 1 ? 6.4 : 9, vf); }
  else if(camMode === 'scramble'){ vf = vfFor(52, 32); Tt.set(F.x*.6, .4, F.z + .6); el = .5; yaw = F.x >= 0 ? .4 : -.4; D = distFor(aspect < 1 ? 6.5 : 10, vf); }
  else if(camMode === 'cele' && celeAt){
    vf = vfFor(50, 30); Tt.set(celeAt.x - Math.sin(celeAt.head)*.8, 1.05, celeAt.z - Math.cos(celeAt.head)*.8); el = .2; D = distFor(aspect < 1 ? 5 : 8, vf);
    celeYaw = celeYaw == null ? rig.yaw : celeYaw;
    celeYaw += wrapA(celeAt.head + Math.PI*.78 + (r ? 0 : Math.sin((now - celeT0)/1000*.6)*.3) - celeYaw)*(1 - Math.exp(-dt*3)); yaw = celeYaw;
  } else {
    celeYaw = null;
    if(view === 'top'){ vf = vfFor(50, 40); Tt.set(F.x*.2, 0, clamp(F.z - 4, 11, 43)); el = 1.22; D = distFor(aspect < 1 ? 29 : 36, vf); }
    else if(view === 'pov'){
      vf = vfFor(60, 42);
      const c = carrier ? actor(carrier.w, carrier.i) : null, cx = c && !c.goalie ? c.x : F.x, cz = c && !c.goalie ? c.z : F.z;
      Tt.set(cx*.6, .6, cz - 10); el = .42; D = 13;
    } else {
      vf = vfFor(58, 36);
      camF.lerp(V(F.x*.5, 0, clamp(F.z - (aspect < 1 ? 6.5 : 2.5), 4, 48)), 1 - Math.exp(-dt*2.4));
      Tt.set(camF.x, .4, camF.z); /* deep in their zone a phone sees mostly crowd over the end boards: look down more steeply there */
      el = aspect < 1 ? lerp(.82, .6, clamp((camF.z - 4)/9)) : .6; D = distFor(aspect < 1 ? 11.5 : 19, vf);
    }
    baseEl = el;
    yaw += usr.yaw; el = clamp(el + usr.el, .1, 1.42); D *= usr.zoom; Tt.x += usr.px; Tt.z += usr.pz;
  }
  const rate = usr.drag ? 16 : camMode === 'cele' ? 4.5 : 3.2, k = 1 - Math.exp(-dt*(r ? rate*3 : rate)), ky = usr.drag ? k : 1 - Math.exp(-dt*(r ? 12 : 4));
  rig.T.lerp(Tt, k); rig.D += (D - rig.D)*k; rig.el += (el - rig.el)*k; rig.yaw += wrapA(yaw - rig.yaw)*ky; rig.fov += (vf - rig.fov)*k;
  const ce = Math.cos(rig.el);
  const pos = V(rig.T.x + Math.sin(rig.yaw)*ce*rig.D, rig.T.y + Math.sin(rig.el)*rig.D, rig.T.z + Math.cos(rig.yaw)*ce*rig.D), look = rig.T.clone();
  let fov = rig.fov;
  if(shotBlend > 0){
    const sb = ease(shotBlend), sp = V(START[0]*.4 - .5*mirr(), (aspect < 1 ? 3.1 : 1.9) - slow*.15, START[1] + (aspect < 1 ? 8.6 : 6.4) - slow*1.3);
    pos.lerp(sp, sb); look.lerp(LOOK, sb); fov = lerp(fov, shotFov() - slow*1.5, sb);
  }
  /* never out through the glass into the stands: pull in over the boards instead */
  const hx = pos.x - look.x, hz = pos.z - look.z;
  const lim = Math.min(1, (HX + 2.5 - Math.abs(look.x))/Math.max(1e-3, Math.abs(hx)), (hz > 0 ? ZS + 2.5 - look.z : look.z - ZN + 2.5)/Math.max(1e-3, Math.abs(hz)));
  if(lim < 1 && lim > 0){ pos.x = look.x + hx*lim; pos.z = look.z + hz*lim; pos.y = Math.max(pos.y, look.y + 2 + 6*(1 - lim)); }
  cam.position.copy(pos); cam.lookAt(look); setFov(fov);
  const kt = shotBlend > .5 ? V(0, 0, 3) : rig.T;
  key.target.position.set(kt.x, 0, kt.z); key.position.set(kt.x + 3, 16, kt.z + 9); key.target.updateMatrixWorld();
  /* the overhead camera sees more ice than the shadow box covers: widen it while it is up */
  const wide = rig.el > .9;
  if(wide !== shadowWide){ shadowWide = wide; Object.assign(key.shadow.camera, wide ? { left: -17, right: 17, top: 25, bottom: -25 } : { left: -14, right: 14, top: 17, bottom: -17 }); key.shadow.camera.updateProjectionMatrix(); }
}

/* ---- tags over the men: name and number, and while you choose what each pass costs and
   whether he is open or marked. A team-mate off the screen is pinned to its edge with an arrow ---- */
const tagEls = new Map();
let tagMode = null, onTag = null, tagInfo = {};
const TIER_N = { easy: 1, normal: 2, hard: 3, extreme: 4 };
for(const s of skaters()){
  const b = document.createElement('button'); b.type = 'button'; b.className = 'tag'; b.tabIndex = -1;
  b.innerHTML = '<span class="cov"></span><span class="pl"><i class="no"></i><span class="nm"></span></span><span class="tier"><i class="pips"><i></i><i></i><i></i><i></i></i><em></em></span><i class="arr"></i>';
  b.addEventListener('click', () => { if(performance.now() < suppressUntil) return; if(tagMode && onTag && s.w === att && tagInfo[s.i]) onTag(s.i); });
  b._no = b.querySelector('.no'); b._nm = b.querySelector('.nm'); b._em = b.querySelector('em'); b._cov = b.querySelector('.cov'); b._pips = b.querySelector('.pips');
  b._x = -1; b._y = -1; b._vis = true; b._edge = false;
  tagsEl.appendChild(b); tagEls.set(s, b);
}
const tmpV = V(), tagList = [];
function placeTags(){
  const show = mode === 'match' && !shotLive && camMode === 'play';
  if(tagsEl.hidden === show) tagsEl.hidden = !show;
  if(!show) return;
  const w = W_, h = H_, top = inTc + 8, bot = h - inBc - 8;
  tagList.length = 0;
  for(const [s, b] of tagEls){
    if(s.boxed){ if(b._vis){ b._vis = false; b.style.display = 'none'; } continue; }
    tmpV.set(s.x, 2.15, s.z).project(cam);
    const behind = tmpV.z > 1;
    let x = (tmpV.x + 1)/2*w, y = (1 - tmpV.y)/2*h, edge = false, vis = true;
    if(behind || x < 6 || x > w - 6 || y < top || y > bot + 40){
      if(b._pick){
        if(behind){ x = w - x; y = h - y; }
        const cx = w/2, cy = (top + bot)/2, dx = x - cx, dy = y - cy;
        const kk = Math.min((w/2 - 62)/Math.max(1e-3, Math.abs(dx)), ((bot - top)/2 - 34)/Math.max(1e-3, Math.abs(dy)), 1);
        x = cx + dx*kk; y = cy + dy*kk; edge = true;
        b.style.setProperty('--a', Math.atan2(dy, dx).toFixed(2) + 'rad');
      } else vis = false;
    }
    if(vis !== b._vis){ b._vis = vis; b.style.display = vis ? '' : 'none'; if(vis) b._w = 0; }
    if(!vis) continue;
    if(!b._w) b._w = b.offsetWidth || 60;
    if(!edge) x = clamp(x, b._w/2 + 4, w - b._w/2 - 4);
    if(edge !== b._edge){ b._edge = edge; b.classList.toggle('edge', edge); }
    if(!b._h) b._h = b.offsetHeight || 24;
    tagList.push({ b, x, y: edge ? y + b._h/2 : y, edge, w: b._w, h: b._h, oy: 0 });
  }
  /* nearer men (lower on the screen) keep their place; a tag behind one is lifted clear of it */
  tagList.sort((a, c) => c.y - a.y);
  for(let pass = 0; pass < 2; pass++) for(let i = 0; i < tagList.length; i++){
    const T = tagList[i]; if(T.b._mk) continue;
    for(let j = 0; j < i; j++){
      const B = tagList[j]; if(B.b._mk) continue;
      const ty = T.y + T.oy, by = B.y + B.oy;
      if(Math.abs(T.x - B.x) < (T.w + B.w)/2 - 4 && ty > by - B.h + 3 && ty - T.h < by) T.oy = by - B.h - 1 - T.y;
    }
  }
  for(const T of tagList){
    const b = T.b; b._oy = lerp(b._oy || 0, T.oy, .3); const y = Math.max(T.h + top - 6, T.y + b._oy) - (T.edge ? T.h/2 : 0);
    if(Math.abs(T.x - b._x) > .3 || Math.abs(y - b._y) > .3){ b._x = T.x; b._y = y; b.style.transform = 'translate(' + T.x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,' + (T.edge ? '-50%' : '-100%') + ')'; }
  }
}
function setTags(){
  const marking = new Set();
  if(tagMode) for(const k of Object.keys(tagInfo)) if(tagInfo[k].by != null) marking.add(tagInfo[k].by);
  for(const [s, b] of tagEls){
    const mine = s.w === att, info = tagMode && mine ? tagInfo[s.i] : null, has = !!(carrier && carrier.w === s.w && carrier.i === s.i);
    b._pick = !!info; b._mk = !mine && !!tagMode && marking.has(s.i); b._h = 0;
    b.className = 'tag ' + (mine ? 'us' : 'them') + (info ? ' pick t-' + info.tier + (info.marked ? ' marked' : ' open') + (info.hot ? ' hot' : '') : '') + (has ? ' has' : '') + (!mine && tagMode && marking.has(s.i) ? ' mk' : '') + (b._edge ? ' edge' : '');
    b.tabIndex = info ? 0 : -1;
    b.style.setProperty('--tc', A[s.w].color || '#ffffff');
    b._no.textContent = s.num != null ? String(s.num) : '';
    b._nm.textContent = mine ? (s.label || '') : '';
    b._em.textContent = info ? info.say : '';
    b._cov.textContent = info ? (info.note || (info.marked ? 'Marked' : 'Open')) : '';
    b._pips.className = 'pips p' + (info ? TIER_N[info.tier] || 0 : 0);
    b._w = 0;
    if(info) b.setAttribute('aria-label', 'Pass to ' + s.label + ', ' + info.say + (info.marked ? ', marked' : ', open')); else b.removeAttribute('aria-label');
  }
}

/* ===================================== THE LOOP ===================================== */
let lastT = 0, frames = 0, slowAvg = 16, reflect = true, shadowTick = 0, vigOp = 0;
function render(now){
  /* dt is real time (capped), so a slow phone still plays everything at the right speed;
     the skating steps through it in small slices */
  const t = now/1000, dt = Math.min(.25, t - lastT || .016); lastT = t;
  slowAvg = lerp(slowAvg, dt*1000, .03);
  /* a phone that can't keep up loses the reflection and some pixels first, then more: never frames */
  if(++frames > 100 && slowAvg > 34 && quality > 0){
    quality--; frames = 0; slowAvg = 20;
    if(quality === 1){ reflect = false; DPR = Math.min(DPR, 1.5); } else { DPR = 1; key.castShadow = false; }
    size(); if(api.onQuality) api.onQuality(quality);
  }
  let su = 0, shotOwns = false;
  if(mode === 'shootout' || shotLive){ su = runShot(now, t, dt); shotOwns = true; }
  if(mode === 'show') runShow(t, dt);
  if(mode === 'lab'){ puck.position.copy(SK.labStep(SO, t, dt, { K, DUR, ZC })); puck.position.y = .013; }
  if(mode === 'match'){
    runMatch(dt, t, now, shotOwns);
    /* on the clock, not the frame count, so a slow phone still gets there */
    shotBlend = shotLive ? clamp((now - shotT)/650) : Math.max(0, shotBlend - dt/.5);
  }
  stepSnow(dt); stepFlashes(dt); stepHats(dt);
  flashRate = Math.max(.9, flashRate*Math.pow(.4, dt));
  goalLit = Math.max(0, goalLit - dt);
  const lit = goalLit > 0;
  NN.lightMat.emissive.setHex(lit && Math.sin(t*14) > -.2 ? 0xff1a1a : 0x000000);
  NN.red.intensity = lit ? 1.6 + Math.sin(t*14)*.8 : 0;
  crowdTex.offset.y = lit && !reduced() ? Math.abs(Math.sin(t*8))*.006 : 0;
  if(Math.abs(slow - vigOp) > .03 || (slow === 0 && vigOp)){ vigOp = slow < .03 ? 0 : slow; vig.style.opacity = vigOp.toFixed(2); }
  const ki = 1 - Math.exp(-dt*7); inTc += (inT - inTc)*ki; inBc += (inB - inBc)*ki;
  if(Math.abs(inT - inTc) < .5) inTc = inT; if(Math.abs(inB - inBc) < .5) inBc = inB;
  applyOffset();
  updateCam(dt, now, su);
  R.info.reset();
  R.clear();
  const marks = iceMarks();
  if(reflect){
    world.scale.y = -1; ice.visible = false; for(const m of crowd) m.visible = false; snowPts.visible = false; const mv = marks.map(m => m.visible); for(const m of marks) m.visible = false;
    R.render(scene, cam);
    world.scale.y = 1; ice.visible = true; for(const m of crowd) m.visible = true; snowPts.visible = true; marks.forEach((m, i) => { m.visible = mv[i]; }); R.clearDepth();
  }
  ringsOn();
  cube.visible = mode !== 'match' || rig.el < .95;
  if(++shadowTick % (quality === 2 ? 1 : quality === 1 ? 2 : 3) === 0) R.shadowMap.needsUpdate = true;
  R.render(scene, cam);
  if(state === 'pick') placeSpots();
  if(state === 'result' && !resEl.hidden) placeRes();
  placeTags();
  syncCamUI();
}
function size(){
  const w = wrap.clientWidth, h = wrap.clientHeight; if(!w || !h) return;
  W_ = w; H_ = h;
  R.setPixelRatio(Math.max(1, Math.min(DPR, Math.sqrt(2.6e6/(w*h)))));
  R.setSize(w, h, false); aspect = w/h; cam.aspect = aspect; offApplied = NaN; applyOffset(); cam.updateProjectionMatrix();
}
function netPx(p){ const v = V(p[0], p[1], 0).project(cam); return [(v.x + 1)/2*W_, (1 - v.y)/2*H_]; }
function placeSpots(){
  for(const b of spotsEl.children){ const [x, y] = netPx(SPOTS[b.dataset.k].p); b.style.left = x + 'px'; b.style.top = y + 'px'; }
}
function placeRes(){
  const [kx, ky] = netPx(SPOTS[guess].p), [ax, ay] = netPx(SPOTS[shotSpot].p), [k, a] = resEl.children;
  k.style.left = kx + 'px'; k.style.top = ky + 'px'; a.style.left = ax + 'px'; a.style.top = ay + 'px';
  const k2 = resEl.children[2], o2 = coverK.find(c => c !== guess);
  k2.hidden = !o2; if(o2){ const [x2, y2] = netPx(SPOTS[o2].p); k2.style.left = x2 + 'px'; k2.style.top = y2 + 'px'; }
}
let onPick = null, resolveShot = null, running = false, raf = 0, ro = null;
for(const k of Object.keys(SPOTS)){
  const b = document.createElement('button'); b.className = 'spot'; b.type = 'button'; b.dataset.k = k; b.setAttribute('aria-label', 'Shoot ' + SPOTS[k].n);
  const s = document.createElement('span'); s.textContent = SPOTS[k].s; b.appendChild(s);
  b.addEventListener('click', () => { if(state === 'pick' && onPick) onPick(k); }); spotsEl.appendChild(b);
}
let flashTimer = 0;
function showFlash(text, cls, ms){ clearTimeout(flashTimer); flash.textContent = text || ''; flash.className = text ? 'flash on ' + (cls || '') : 'flash'; if(ms) flashTimer = setTimeout(() => { flash.className = 'flash'; }, ms); }
function loop(now){ if(!running) return; try { render(now); } catch(e){ console.error(e); } raf = requestAnimationFrame(loop); }
const wait = ms => new Promise(r => setTimeout(r, reduced() ? Math.min(ms, 500) : ms));

/* everyone on the ice in a match, only the duel's two in a shootout */
function setMode(m){
  mode = m;
  if(replaying) endReplay(); celeEnd = null;
  for(const s of skaters()) s.boxed = false;
  for(const s of skaters()) s.root.visible = m === 'match';
  SO.root.visible = m === 'shootout' || m === 'show' || m === 'lab';
  for(const w of [0, 1]) A[w][0].base.visible = m === 'match';
  if(m === 'lab'){ shotLive = false; shotBlend = 0; carrier = null; ringTarget = null; state = 'idle'; spotsEl.hidden = true; resEl.hidden = true; flash.className = 'flash'; clearHats(); }
  if(m === 'show'){ GNo = A[1][0]; GNo.setEnd(0); GNo.base.visible = true; shotLive = false; shotBlend = 0; carrier = null; ringTarget = null; state = 'idle'; spotsEl.hidden = true; resEl.hidden = true; flash.className = 'flash'; clearHats(); }
  if(m === 'shootout'){ SH = SO; GNo = A[1][0]; GNo.setEnd(0); GNo.base.visible = true; shotLive = false; shotBlend = 0; camMode = 'play'; carrier = null; ringTarget = null; clearHats(); }
  tagsEl.hidden = m !== 'match';
  camKey = ''; syncCamUI();
}
setMode('shootout');
function endReplay(){
  if(!replaying) return;
  replaying = false; shotLive = false; state = 'idle'; rbug.hidden = true; goalLit = 0; flashRate = .9;
  SH.x = SH.root.position.x; SH.z = SH.root.position.z; SH.vx = SH.vz = 0; SH.tx = SH.x; SH.tz = SH.z;
  SH = SO; pk.state = 'rest';
  const r = replayRes; replayRes = null; if(r) setTimeout(r, 120);
}
/* ===================================== THE API ===================================== */
const api = {
  SPOTS,
  mount(el){
    el.appendChild(wrap); size();
    if(window.ResizeObserver){ ro = ro || new ResizeObserver(size); ro.observe(wrap); }
    if(!running){ running = true; lastT = 0; raf = requestAnimationFrame(loop); }
  },
  unmount(){ running = false; cancelAnimationFrame(raf); if(ro) ro.disconnect(); wrap.remove(); ptrs.clear(); gest = null; usr.drag = false; },
  /* ---- the shootout: sh = { team, name, number, shoots }, go = { team, name, number } ---- */
  shootout(sh, go){
    setMode('shootout');
    SO.setKit(sh.team, sh.name || '', sh.number == null ? '' : sh.number, sh.shoots);
    GNo.setKit(go.team, go.name || '', go.number == null ? '' : go.number); GNo.trk.cele = 0; GNo.trk.slump = 0;
    const m = SO.hand === 'R' ? -1 : 1;
    START = [-1.35*m, 8.6]; END = [-1.0*m, 3.7]; shotKind = '';
    state = 'idle'; scored = false; flash.className = 'flash'; spotsEl.hidden = true; resEl.hidden = true; shotClock = 0; slow = 0;
  },
  /* the sweater room: sh = { team, name, number, shoots } on the ice, go = the goalie behind him; angle 0 = his back, PI = his front */
  showcase(sh, go, angle){
    if(sh){ setMode('show'); inT = inB = inTc = inBc = 0; applyOffset(); SO.setKit(sh.team, sh.name || '', sh.number == null ? '' : sh.number, sh.shoots); }
    if(go) GNo.setKit(go.team, go.name || '', go.number == null ? '' : go.number);
    if(angle != null){ showAng = angle; if(sh) showCur = angle; }
  },
  /* the skater lab (server/lab-skaters.html): o = { kit, name, num, hand, motion, cam, at, ts, pause, cycle, zoom } */
  lab(o){ if(mode !== 'lab'){ setMode('lab'); inT = inB = inTc = inBc = 0; applyOffset(); } if(o) SK.labSet(SO, o); return SK.lab; },
  labMotions: SK.MOTIONS,
  /* the old call, still honoured */
  setKits(sh, go){ api.shootout({ team: sh.team || 'MTL', name: sh.name, number: sh.number, shoots: sh.shoots }, { team: go.team || 'EDM', name: go.name, number: go.number }); },
  /* show the five spots; cb(spotKey) on a tap */
  pick(cb, taken){ onPick = cb; scored = false; flash.className = 'flash'; spotsEl.hidden = false; resEl.hidden = true; state = 'pick';
    for(const b of spotsEl.children){ const t = !!(taken && taken.includes(b.dataset.k)); b.classList.toggle('taken', t); b.disabled = t; } },
  hold(){ state = 'idle'; spotsEl.hidden = true; resEl.hidden = true; if(!shotLive) flash.className = 'flash'; },
  /* play one attempt; resolves a moment after GOAL or SAVE shows */
  shoot(o){
    shotSpot = o.spot; scored = !!o.scored; guess = o.guess || o.spot; hitW = null; coverK = o.cover || [guess];
    lastShot = mode === 'match' && shotLive ? { sh: SH, START: START.slice(), END: END.slice(), kind: shotKind, spot: shotSpot, guess, scored } : null;
    releaseW = null; oneAt = null; padSprayed = false; lastU = 0; lastHitU = 0; shotClock = 0; spotsEl.hidden = true; resEl.hidden = true; flash.className = 'flash';
    resEl.classList.toggle('same', shotSpot === guess);
    state = 'shoot'; shotT0 = performance.now();
    return new Promise(res => { resolveShot = () => { resolveShot = null; setTimeout(res, reduced() ? 500 : 950); }; });
  },
  flash: showFlash,
  /* a tap while the play runs: the replay or the celebration ends, a shot jumps to the moment it gets there */
  skip(){
    if(replaying){ endReplay(); return true; }
    if(celeEnd){ celeEnd(); return true; }
    if(state === 'shoot' && shotClock < (K.hit - .03)*DUR){ shotClock = (K.hit - .03)*DUR; return true; }
    return false;
  },
  /* the part of the canvas the HUD covers, top and bottom, in CSS pixels: the picture centres in the rest */
  insets(top, bottom){ inT = Math.max(0, top || 0); inB = Math.max(0, bottom || 0); wrap.style.setProperty('--inT', inT + 'px'); wrap.style.setProperty('--inB', inB + 'px'); },
  /* draw calls and triangles of the last frame, for keeping an eye on phones */
  /* where the camera rig is, for tests */
  debug(){ const c = V(0, 0, ZC).project(cam), pk2 = puck.position.clone().project(cam); return { T: rig.T.toArray().map(v => +v.toFixed(2)), D: +rig.D.toFixed(2), yaw: +rig.yaw.toFixed(2), el: +rig.el.toFixed(2), fov: +cam.fov.toFixed(1), inT: Math.round(inTc), inB: Math.round(inBc), off: offApplied, mode, camMode, view, usr: { ...usr }, centre: [Math.round((c.x + 1)/2*W_), Math.round((1 - c.y)/2*H_)], puck: [Math.round((pk2.x + 1)/2*W_), Math.round((1 - pk2.y)/2*H_)] }; },
  stats(){ return { calls: R.info.render.calls, triangles: R.info.render.triangles, reflect, quality, dpr: R.getPixelRatio(), avgMs: Math.round(slowAvg*10)/10, w: W_, h: H_ }; },
  /* hooks for the screen: onLook(view) when the player moves the camera, onHit(scored) when the puck
     gets there, onPass(ok) as it leaves the stick, onCatch(ok) when it arrives, onQuality(level) */
  onLook: null, onHit: null, onPass: null, onCatch: null, onQuality: null,
  /* ---- the match ---- */
  match: {
    /* T: [{ abbr, color, men: [{ label, back, num, shoots }] x6, the goalie first }] x2 */
    teams(T){
      setMode('match');
      for(const w of [0, 1]){
        A[w].color = T[w].color;
        T[w].men.forEach((m, i) => { const a = A[w][i]; if(i === 0) a.setKit(T[w].abbr, m.back, m.num); else { a.setKit(T[w].abbr, m.back, m.num, m.shoots); a.label = m.label; } });
        Object.assign(A[w][0].trk, { cele: 0, slump: 0, hold: 0 });
      }
      const paintHome = () => { const img = logo(T[0].abbr, 'light'); if(img){ paintIce(img); return true; } return false; };
      if(!paintHome()) logoWait.push(function once(){ if(!paintHome()) logoWait.push(once); });
      const k0 = kitOf(T[0].abbr), k1 = kitOf(T[1].abbr);
      paintCrowd([k0.b, k0.b, (k0.n && k0.n[1]) || '#ffffff', k0.b, k1.b, '#e8eef3']);
      clearHats(); cubeBig = ''; lastShot = null;
      if(replaying) endReplay(); celeEnd = null; for(const s of skaters()) s.boxed = false;
      setTags();
    },
    /* everyone to these spots, given in each side's own attacking frame (attacking z = 0).
       A spot can say mark: i (stay goal side of their man i) or press: true (go at the puck) */
    place(o){
      if(o.att != null && o.att !== att){ if(o.instant){ att = o.att; setEnds(); } else flipView(); }
      if(o.instant) setEnds();
      for(const w of [0, 1]) for(let i = 1; i < 6; i++){
        const s = A[w][i], p = o.sides[w][i]; if(!p) continue;
        const v = viewOf(w, p); s.tx = v.x; s.tz = v.z;
        if(o.instant){ s.x = v.x; s.z = v.z; s.vx = s.vz = 0; s.head = w === att ? 0 : Math.PI; s.root.position.set(s.x, 0, s.z); s.stopK = 0; }
        s.vmax = p.fast ? 8.6 : 7.2; s.acc = 11;
        s.follow = p.mark != null ? { i: p.mark } : p.press ? { press: true } : null;
      }
      if(o.carrier !== undefined){ carrier = o.carrier; if(carrier) pk.state = 'carry'; }
      for(const s of skaters()){
        const has = !!(carrier && carrier.w === s.w && carrier.i === s.i);
        if(s.mode !== 'carry' || !has) s.mode = has ? 'carry' : 'idle';
        s.face = has ? { x: s.tx*.4, z: 0 } : puck.position;
      }
      if(o.instant){ const F = focusPoint(); camF.set(F.x*.5, 0, clamp(F.z - 4.5, 4, 48)); rig.T.set(camF.x, .4, camF.z); rig.yaw = 0; }
      camMode = 'play'; camHold = null; ringTarget = null;
      snapBack(); setTags();
    },
    /* the puck off his stick to a team-mate: ok, or picked off by `by`. A long one (tier) goes up off the ice */
    pass(o){
      const from = actor(o.from.w, o.from.i), to = actor(o.to.w, o.to.i);
      snapBack();
      return new Promise(res => {
        const go = () => {
          const start = puck.position.clone();
          let end, catcher = to;
          const m = to.hand === 'R' ? -1 : 1;
          if(o.ok){
            const px = lerp(to.x, to.tx, .3), pz = lerp(to.z, to.tz, .3);
            end = V(px - Math.sin(to.head)*.95 - Math.cos(to.head)*.45*m, .013, pz - Math.cos(to.head)*.95 + Math.sin(to.head)*.45*m);
            to.mode = 'recv'; to.face = { x: start.x, z: start.z };
          } else {
            const by = actor(o.by.w, o.by.i), aim = V(to.x, 0, to.z), f = .55 + Math.random()*.15;
            end = vl(start, aim, f); end.y = .013;
            /* the man cutting it out gets there with the puck */
            by.follow = null; by.tx = end.x + (by.x - end.x)*.12; by.tz = end.z + (by.z - end.z)*.12; by.vmax = 10; by.acc = 18; by.mode = 'lunge'; by.t0 = performance.now(); by.face = { x: start.x, z: start.z };
            catcher = by; to.mode = 'recv'; to.face = { x: start.x, z: start.z };
          }
          const dist = start.distanceTo(end), long = o.tier === 'hard' || o.tier === 'extreme';
          pk.state = 'fly'; pk.from.copy(start); pk.to.copy(end); pk.t0 = performance.now(); pk.dur = clamp(dist/(o.ok ? 21 : 17), .3, 1.2)*1000; pk.spin = 14 + Math.random()*8;
          pk.lift = long && dist > 9 ? .22 : 0;
          carrier = null; ringTarget = o.ok ? { w: to.w, i: to.i } : null; setTags();
          spray(start, V(end.x - start.x, 0, end.z - start.z).normalize(), 5, .9);
          if(api.onPass) api.onPass(o.ok);
          pk.done = () => {
            spray(end, V(start.x - end.x, 0, start.z - end.z).normalize(), 7, 1.1);
            catcher.acc = 11; catcher.vmax = 7.2;
            carrier = { w: catcher.w, i: catcher.i }; pk.state = 'carry'; ringTarget = null;
            for(const s of skaters()) if(s.mode === 'recv' || s.mode === 'lunge' || s.mode === 'pass') s.mode = 'idle';
            catcher.mode = 'carry'; catcher.cushT = performance.now(); setTags();
            if(api.onCatch) api.onCatch(o.ok);
            setTimeout(res, reduced() ? 120 : 300);
          };
        };
        if(from.goalie){ setTimeout(go, 160); return; }
        from.mode = 'pass'; from.t0 = performance.now(); from.passAt = { x: to.x, z: to.z }; from.saucer = o.tier === 'hard' || o.tier === 'extreme';
        setTimeout(go, 140);
      });
    },
    /* faceoff: the two centres crouch over the dot, the puck held above it */
    faceoff(){
      for(const w of [0, 1]){ const c = A[w][3]; c.mode = 'faceoff'; c.face = { x: 0, z: ZC }; }
      for(const s of skaters()){ s.follow = null; if(s.mode === 'sad' || s.mode === 'cele') s.mode = 'idle'; }
      carrier = null; pk.state = 'held'; pk.at.set(0, 0, ZC); puck.position.set(0, 1.5, ZC); puck.rotation.set(0, 0, 0);
      camMode = 'faceoff'; camHold = V(0, 0, ZC); clearHats(); cubeBig = ''; paintCube(); snapBack(); setTags();
    },
    /* drop it: `win` draws it back to his left D */
    drop(win){
      return new Promise(res => {
        pk.state = 'drop'; pk.at.set(0, 0, ZC); pk.t0 = performance.now(); pk.dur = 380;
        pk.done = () => {
          const c = A[win][3], d = A[win][1];
          c.mode = 'draw'; c.t0 = performance.now(); A[1 - win][3].mode = 'idle';
          setTimeout(() => {
            const start = V(0, .013, ZC), end = V(d.x, .013, d.z + (win === att ? -1 : 1)*.9);
            pk.state = 'fly'; pk.from.copy(start); pk.to.copy(end); pk.t0 = performance.now(); pk.dur = 560; pk.spin = 16; pk.lift = 0;
            pk.done = () => { carrier = { w: win, i: 1 }; pk.state = 'carry'; A[win][3].mode = 'idle'; d.mode = 'carry'; d.cushT = performance.now(); camHold = null; camMode = 'play'; setTags(); setTimeout(res, 200); };
          }, 200);
        };
      });
    },
    /* the shot: the camera drops in behind him; then pick() shows the spots and shoot() plays it.
       o.kind: 'one' a one-timer (he steps straight into it), 'brk' a breakaway (in alone from the blue line) */
    aim(w, i, o = {}){
      const s = actor(w, i); SH = s; GNo = A[1 - att][0]; shotLive = true; shotT = performance.now(); shotKind = o.kind || '';
      const m = s.hand === 'R' ? -1 : 1;
      snapBack();
      if(o.kind === 'brk'){ START = [clamp(s.x*.5, -4, 4), 15.5]; END = [clamp(-.9*m, -2.2, 2.2), 3.6]; }
      else if(o.kind === 'one'){ START = [clamp(s.x, -5, 5), clamp(s.z, 5, 8.5)]; END = [clamp(START[0]*.75, -3.5, 3.5), Math.max(3.8, START[1] - 1.6)]; }
      else { START = [clamp(s.x, aspect < 1 ? -4.2 : -7, aspect < 1 ? 4.2 : 7), clamp(s.z, 6, 11.5)]; END = [clamp(START[0]*.3 - .9*m, -2.2, 2.2), Math.min(3.9, START[1]*.5)]; }
      state = 'idle'; scored = false; flash.className = 'flash'; shotClock = 0;
      for(const q of skaters()){
        q.follow = null; if(q === s) continue;
        const mine = q.w === att, sx = q.x >= 0 ? 1 : -1;
        q.face = puck.position; q.mode = 'idle';
        /* a breakaway: theirs chase from behind; otherwise everyone out of the camera's lane, wide and down by the goal line */
        if(o.kind === 'brk' && !mine){ const sd = q.x >= START[0] ? 1 : -1; q.tx = clamp(START[0]*.5 + sd*(2.8 + Math.random()*2.2), -10, 10); q.tz = START[1] + 1.2 + Math.random()*2.4; q.vmax = 8.4; continue; }
        q.tx = sx*clamp(Math.abs(q.x)*.6, mine ? 3.4 : 2.6, 7); q.tz = mine ? clamp(q.z*.45, 2, 7) : clamp(q.z*.55 + 1.2, 1.6, 9); q.vmax = 9;
      }
      ringTarget = null; setTags();
    },
    endShot(){
      shotLive = false; state = 'idle'; spotsEl.hidden = true; resEl.hidden = true;
      SH.x = SH.root.position.x; SH.z = SH.root.position.z; SH.head = SH.root.rotation.y; SH.vx = SH.vz = 0; SH.tx = SH.x; SH.tz = SH.z;
      pk.at.copy(puck.position); pk.state = 'rest';
      SH = SO; flash.className = 'flash';
    },
    /* a man in the penalty box (b = { w, i }), or null for everyone back on */
    box(b){ for(const s of skaters()) s.boxed = !!(b && s.w === b.w && s.i === b.i); setTags(); },
    /* a rebound: the puck loose where the save left it, w's man i crashing the net, the other side's dm coming back to clear */
    scramble(w, i, dm){
      const p = puck.position.clone(); p.y = .013;
      p.x = clamp(p.x, -HX + 1.5, HX - 1.5); p.z = clamp(p.z, .9, 9);
      const a = actor(w, i), dd = actor(1 - w, dm);
      for(const s of skaters()) s.follow = null;
      a.tx = p.x + (a.x >= p.x ? .55 : -.55); a.tz = p.z + 1; a.vmax = 10; a.acc = 18; a.mode = 'idle'; a.face = { x: p.x, z: p.z };
      dd.tx = p.x*.6; dd.tz = Math.max(.9, p.z - .9); dd.vmax = 10; dd.acc = 18; dd.mode = 'idle'; dd.face = { x: p.x, z: p.z };
      carrier = null; pk.state = 'rest'; pk.at.copy(p);
      camMode = 'scramble'; camHold = p.clone(); ringTarget = null; setTags();
    },
    /* the rebound settled: o = { w, i, scored, d, dm }. Buried in the net, or swept up by their man */
    putBack(o){
      return new Promise(res => {
        const a = actor(o.w, o.i), dd = actor(o.d, o.dm), sx = puck.position.x >= 0 ? -1 : 1;
        const go = () => {
          const from = puck.position.clone(); from.y = .013;
          if(o.scored){
            a.mode = 'lunge'; a.t0 = performance.now();
            const to = V(sx*(.45 + Math.random()*.25), .1 + Math.random()*.35, -.45);
            Object.assign(pk, { state: 'fly', t0: performance.now(), dur: reduced() ? 120 : 280, spin: 22, lift: .12 }); pk.from.copy(from); pk.to.copy(to);
            spray(from, V(to.x - from.x, 0, to.z - from.z).normalize(), 10, 1.4);
            if(api.onPass) api.onPass(true);
            pk.done = () => { goalLit = 3.2; flashRate = 70; showFlash('GOAL', 'goal', 1500); A[o.d][0].trk.slump = 2.6; if(api.onHit) api.onHit(true, 'reb'); setTimeout(res, reduced() ? 300 : 900); };
          } else {
            dd.mode = 'lunge'; dd.t0 = performance.now();
            const to = V(dd.x - .5, .013, dd.z - .6);
            Object.assign(pk, { state: 'fly', t0: performance.now(), dur: 240, spin: 16, lift: 0 }); pk.from.copy(from); pk.to.copy(to);
            spray(from, V(0, 0, -1), 8, 1.2);
            pk.done = () => { carrier = { w: o.d, i: o.dm }; pk.state = 'carry'; dd.mode = 'carry'; dd.cushT = performance.now(); if(api.onCatch) api.onCatch(false); setTimeout(res, reduced() ? 150 : 450); };
          }
        };
        setTimeout(go, reduced() ? 100 : 350);
      });
    },
    /* the TV replay of the last goal from the far corner, slowed down; resolves when it's done or skipped */
    replay(){
      const L = lastShot;
      if(!L || !L.scored || mode !== 'match') return Promise.resolve();
      return new Promise(res => {
        SH = L.sh; GNo = A[1 - att][0]; START = L.START; END = L.END; shotKind = L.kind; shotSpot = L.spot; guess = L.guess; scored = true;
        hitW = null; releaseW = null; oneAt = null; padSprayed = true; slow = 0;
        shotClock = (L.kind === 'brk' ? .22 : .32)*DUR; lastU = shotClock/DUR; lastHitU = lastU;
        Object.assign(GNo.trk, { cele: 0, slump: 0 });
        SH.root.visible = true;
        shotLive = true; replaying = true; replayRes = res; state = 'shoot'; shotT0 = performance.now();
        flash.className = 'flash'; spotsEl.hidden = true; resEl.hidden = true; rbug.hidden = false; setTags();
      });
    },
    /* the goalie covers it */
    toGoalie(w){ carrier = { w, i: 0 }; pk.state = 'carry'; setTags(); },
    /* the final horn: the winning goalie's arms go up, the other one's head goes down (abbr = the winners) */
    goalieWin(abbr){ for(const w of [0, 1]){ const g = A[w][0]; if(!g.base.visible) continue; if(g.abbr === abbr) g.trk.cele = 1; else g.trk.slump = 2.6; } },
    /* the goal: lights, the scorer's stick up and pumping, team-mates in on him, heads down on the other side, the camera round him */
    celebrate(w, i){
      const s = actor(w, i); s.mode = 'cele'; s.t0 = performance.now(); s.follow = null;
      const side = s.x >= 0 ? 1 : -1;
      s.tx = side*(HX - 2.5); s.tz = 7; s.vmax = 6;
      celeAt = s; celeT0 = performance.now(); camMode = 'cele'; goalLit = 3.4; flashRate = 70;
      A[1 - w][0].trk.slump = 2.6;
      cubeBig = 'GOAL'; paintCube();
      for(const o of skaters()){
        if(o === s) continue; o.follow = null;
        if(o.w === w){ o.tx = s.tx - side*(.9 + Math.random()); o.tz = 7 + (Math.random() - .5)*2.4; o.vmax = 8; o.face = s.root.position; o.mode = 'join'; o.t0 = performance.now() + 500 + Math.random()*500; }
        else { o.tx = o.x*.7; o.tz = o.z + 4; o.vmax = 3; o.face = null; o.mode = 'sad'; }
      }
      carrier = null; snapBack(); setTags();
      return new Promise(res => {
        let ct = 0;
        const end = () => { if(celeEnd !== end) return; celeEnd = null; clearTimeout(ct); celeAt = null; camMode = 'play'; cubeBig = ''; paintCube(); for(const o of skaters()){ o.mode = 'idle'; o.vmax = 7.2; } res(); };
        celeEnd = end; ct = setTimeout(end, reduced() ? 500 : 2700);
      });
    },
    /* the hats come down */
    hats(){ throwHats(); flashRate = 90; },
    /* the big screen over centre ice: { a: { abbr, color, score }, b: {...}, clock } */
    score(info){ cubeInfo = info; if(!cubeBig) paintCube(); },
    /* choosing: tags on your men with what each pass costs; info[b] = { tier, say, marked, by, note, hot } */
    select(info, cb){ tagMode = 'pass'; tagInfo = info || {}; onTag = cb; setTags(); },
    unselect(){ tagMode = null; tagInfo = {}; onTag = null; setTags(); },
    target(t){ ringTarget = t; },
    /* the camera: view('tv' | 'top' | 'pov'), camReset() back to broadcast, controls(false) to lock it */
    view(v){ if(v === 'tv' || v === 'top' || v === 'pov'){ usr.yaw = usr.el = usr.px = usr.pz = 0; usr.zoom = 1; view = v; syncCamUI(); } return view; },
    camReset(){ camReset(); },
    controls(on){ ctlEnabled = !!on; syncCamUI(); },
    /* where a man is in the view, for the rules that need geometry (who picks off a pass) */
    where(w, i){ const s = actor(w, i); return s.goalie ? { x: 0, z: s.end ? GS - .5 : .5 } : { x: s.x, z: s.z }; },
    get att(){ return att; }
  }
};
return api;
}
P.rink = { get(){ if(built === undefined) built = build(); return built; } };
})();
