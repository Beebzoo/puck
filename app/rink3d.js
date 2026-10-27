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
const tagsEl = document.createElement('div'); tagsEl.className = 'tags'; wrap.appendChild(tagsEl);
const spotsEl = document.createElement('div'); spotsEl.className = 'spots'; spotsEl.hidden = true; wrap.appendChild(spotsEl);
const flash = document.createElement('div'); flash.className = 'flash'; wrap.appendChild(flash);
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
let DPR = Math.min(2, window.devicePixelRatio || 1);
R.setPixelRatio(DPR);
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
function slim(root){ root.traverse(o => { if(o.isMesh){ if(!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); if(o.geometry.boundingSphere.radius < .07) o.castShadow = false; } }); }

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
  return canvasTex(2048, 96, (g) => {
    g.fillStyle = '#f6f8fa'; g.fillRect(0, 0, 2048, 96);
    const ads = [['PUCK', '#0c1828'], ['DAILY SHOOTOUT', '#d2232a'], ['GAME NIGHT', '#1F5CC4'], ['BEEBZOO', '#0c1828'], ['THE SWEATER', '#d2232a'], ['ONE ON ONE', '#1F5CC4']];
    g.font = 'italic 900 48px "Big Shoulders Display", Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    for(let i = 0; i < 8; i++){ const [w, col] = ads[i % ads.length]; g.fillStyle = col; g.fillText(w, 128 + i*256, 40); g.fillStyle = 'rgba(12,24,40,.08)'; g.fillRect(i*256 + 254, 0, 2, 76); }
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
/* the scoreboard over centre ice */
const cube = new THREE.Group(); cube.position.set(0, 15, ZC); world.add(cube);
const cubeTex = canvasTex(512, 256, g => { g.fillStyle = '#05080e'; g.fillRect(0, 0, 512, 256); });
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
function paintPad(g, c1, c2){
  g.fillStyle = '#f4f6f8'; g.fillRect(0, 0, 64, 192); g.strokeStyle = c1; g.lineWidth = 3; g.strokeRect(2, 2, 60, 188);
  g.lineWidth = 2; for(const x of [22, 42]){ g.beginPath(); g.moveTo(x, 60); g.lineTo(x, 186); g.stroke(); }
  g.fillStyle = c1; g.fillRect(2, 44, 60, 16); g.fillStyle = c2; g.fillRect(2, 60, 60, 5); g.fillStyle = c1; for(const y of [100, 140]) g.fillRect(4, y, 56, 4);
  g.beginPath(); g.moveTo(2, 186); g.lineTo(62, 150); g.lineTo(62, 186); g.closePath(); g.fill();
}
function paintMask(g, abbr, c1, c2){
  g.fillStyle = c1; g.fillRect(0, 0, 512, 256);
  g.fillStyle = c2; g.beginPath(); g.moveTo(0, 60); g.bezierCurveTo(160, 20, 340, 140, 512, 80); g.lineTo(512, 118); g.bezierCurveTo(340, 180, 160, 64, 0, 104); g.fill();
  g.fillStyle = '#ffffff'; g.fillRect(0, 150, 512, 8);
  const img = logo(abbr, lum(c1) > .55 ? 'light' : 'dark');
  if(img) for(const u of [.07, .43]) drawCrest(g, img, u*512, 110, 90, null, 1);
}
function paintBlocker(g, c1, c2){ g.fillStyle = '#f4f6f8'; g.fillRect(0, 0, 64, 112); g.strokeStyle = c1; g.lineWidth = 7; g.strokeRect(3, 3, 58, 106); g.fillStyle = c2; g.fillRect(8, 48, 48, 9); g.fillStyle = c1; g.fillRect(8, 60, 48, 6); }

/* every painted canvas, so it can be painted again once the fonts and logos have landed */
const painted = [];
function paintTex(w, h, fn){ const t = canvasTex(w, h); const run = () => { fn(t.image.getContext('2d')); t.needsUpdate = true; }; run(); painted.push(run); return t; }
function repaintAll(){ for(const f of painted) f(); }
let repaintQ = 0;
logoWait.push(function again(){ clearTimeout(repaintQ); repaintQ = setTimeout(repaintAll, 60); logoWait.push(again); });
const FONT_LOAD = ['900 50px "Big Shoulders Display"', '50px "Graduate"', '50px "Alfa Slab One"', '50px "Russo One"'];
if(document.fonts && document.fonts.load) Promise.all(FONT_LOAD.map(f => document.fonts.load(f).catch(() => null))).then(() => { repaintAll(); boardMat.map = boardTex = boardTexture(); boardTex.wrapS = THREE.RepeatWrapping; boardTex.repeat.x = 1; boardMat.needsUpdate = true; });

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

/* ===================================== THE SKATER ===================================== */
function makeSkater(){
  const S = { root: new THREE.Group(), hand: 'L' };
  world.add(S.root);
  const tm = teamMats('MTL'), mm = manMats('MTL', '', '');
  const pelvisG = new THREE.Group(); S.root.add(pelvisG);
  const pants = mesh(new THREE.CylinderGeometry(.2, .232, .32, 18), tm.pants, pelvisG, 0, -.1, 0); pants.scale.z = .7;
  const torso = new THREE.Group(); S.root.add(torso);
  const sweater = mesh(TORSO_GEO, mm.torso, torso); sweater.scale.z = .7;
  const collar = mesh(new THREE.TorusGeometry(.083, .02, 8, 22), tm.collar, torso, 0, .645, -.004); collar.rotation.x = Math.PI/2; collar.scale.y = .8;
  const neck = mesh(new THREE.CylinderGeometry(.058, .064, .1, 12), skinMats[1], torso, 0, .66, -.01);
  const head = new THREE.Group(); head.position.set(0, .66, -.03); torso.add(head);
  const face = mesh(new THREE.SphereGeometry(.1, 16, 12), skinMats[1], head, 0, .09, -.03); face.scale.set(.88, 1.05, .95);
  const helm = mesh(new THREE.SphereGeometry(.125, 22, 16, 0, Math.PI*2, 0, Math.PI*.62), tm.helm, head, 0, .1, -.01); helm.scale.set(.96, .96, 1.12);
  const helmBits = [mesh(new THREE.BoxGeometry(.2, .05, .03), tm.helm, head, 0, .045, .1)];
  for(const s of [-1, 1]) helmBits.push(mesh(new THREE.BoxGeometry(.03, .08, .07), tm.helm, head, s*.115, .06, 0));
  mesh(new THREE.CylinderGeometry(.128, .128, .065, 18, 1, true, Math.PI - .95, 1.9), Mt.visor, head, 0, .07, -.03).scale.z = 1.12;
  const shoulders = [-1, 1].map(s => { const o = new THREE.Object3D(); o.position.set(s*.235, .5, -.02); torso.add(o); return o; });
  const caps = [-1, 1].map(s => { const c = mesh(new THREE.SphereGeometry(.105, 14, 10), tm.shoulder, torso, s*.225, .5, -.02); c.scale.set(1, .85, .95); return c; });
  function makeSkate(parent){
    const g = new THREE.Group(); parent.add(g);
    mesh(new THREE.BoxGeometry(.1, .13, .2), Mt.boot, g, 0, .1, .02);
    mesh(new THREE.SphereGeometry(.055, 12, 8), Mt.boot, g, 0, .075, -.1).scale.set(.95, .75, 1.3);
    mesh(new THREE.BoxGeometry(.075, .1, .035), Mt.boot, g, 0, .19, .11);
    mesh(new THREE.BoxGeometry(.03, .05, .27), Mt.holder, g, 0, .028, -.01);
    mesh(new THREE.BoxGeometry(.006, .02, .29), Mt.steel, g, 0, .008, -.01);
    return g;
  }
  const LEGS = [0, 1].map(() => ({ thigh: limb(.112, .085, tm.leg, S.root), knee: mesh(new THREE.SphereGeometry(.078, 12, 10), tm.sockPlain, S.root), shin: limb(.072, .054, tm.sock, S.root), skate: makeSkate(S.root) }));
  const ARMS = [0, 1].map(() => ({
    upper: limb(.088, .08, mm.upper, S.root, 16), elbow: mesh(new THREE.SphereGeometry(.08, 12, 10), tm.elbow, S.root), fore: limb(.08, .07, mm.fore, S.root, 16),
    cuff: mesh(new THREE.CylinderGeometry(.07, .064, .12, 12), tm.cuff, S.root), glove: makeGlove(tm.glove, tm.cuff)
  }));
  const stick = makeStick(1.42, .3, 135); S.root.add(stick);
  function makeGlove(m1, m2){
    const g = new THREE.Group(); S.root.add(g);
    const palm = mesh(new THREE.BoxGeometry(.105, .1, .11), m1, g, 0, .02, 0);
    const fing = mesh(new THREE.SphereGeometry(.062, 12, 10), m1, g, 0, .075, -.005); fing.scale.set(.95, .8, 1);
    const roll = mesh(new THREE.CylinderGeometry(.06, .06, .11, 10), m2, g, 0, .035, .045); roll.rotation.z = Math.PI/2;
    g.parts = [palm, fing, roll];
    return g;
  }
  slim(S.root);
  S.setKit = function(abbr, name, num, hand){
    const T = teamMats(abbr), M = manMats(abbr, name, num);
    pants.material = T.pants; sweater.material = M.torso; collar.material = T.collar;
    helm.material = T.helm; helmBits.forEach(b => b.material = T.helm);
    caps.forEach(c => c.material = T.shoulder);
    LEGS.forEach(L => { L.thigh.material = T.leg; L.knee.material = T.sockPlain; L.shin.material = T.sock; });
    ARMS.forEach(A => { A.upper.material = M.upper; A.fore.material = M.fore; A.elbow.material = T.elbow; A.cuff.material = T.cuff; A.glove.parts[0].material = A.glove.parts[1].material = T.glove; A.glove.parts[2].material = T.cuff; });
    const sk = skinMats[seedOf(name) % skinMats.length]; face.material = sk; neck.material = sk;
    S.hand = hand === 'R' ? 'R' : 'L'; S.abbr = abbr; S.name = name; S.num = num;
  };
  const tmpR = V();
  /* the pose is always written for a left shot (blade on his left, -x); a right shot is its mirror image */
  S.pose = function(Pq){
    const m = S.hand === 'R' ? -1 : 1;
    let Pz = Pq;
    if(m < 0){
      const mir = v => V(-v.x, v.y, v.z);
      Pz = { ...Pq, px: -Pq.px, twist: -Pq.twist, roll: -(Pq.roll || 0), Hh: mir(Pq.Hh), Bt: mir(Pq.Bt),
        feet: [Pq.feet[1], Pq.feet[0]].map(f => ({ p: mir(f.p), yaw: -f.yaw, push: f.push })) };
    }
    pelvisG.position.set(Pz.px, Pz.py, 0); pelvisG.rotation.set(Pz.lean*.3, Pz.twist*.45, 0, 'YXZ');
    torso.position.set(Pz.px, Pz.py, 0); torso.rotation.set(Pz.lean, Pz.twist, Pz.roll || 0, 'YXZ');
    head.rotation.x = -Pz.lean*.8 + (Pz.look || 0);
    S.root.updateMatrixWorld(true);
    for(let i = 0; i < 2; i++){
      const s = i ? 1 : -1, L = LEGS[i], f = Pz.feet[i];
      const hip = V(s*.1, -.13, 0).applyMatrix4(pelvisG.matrix), ank = f.p.clone(); ank.y += .13;
      const r = ik(hip, ank, .45, .44, V(s*.2, 0, -1));
      place(L.thigh, hip, r.mid); place(L.shin, r.mid, r.end); L.knee.position.copy(r.mid);
      L.skate.position.set(r.end.x, r.end.y - .13, r.end.z); L.skate.rotation.set(0, f.yaw, -s*.08*(f.p.y > .01 ? 0 : 1));
    }
    const U = V().subVectors(Pz.Bt, Pz.Hh).normalize();
    const lo = Pz.Bt.clone().addScaledVector(U, -(Pz.gap || .46)), hi = Pz.Bt.clone().addScaledVector(U, -.04);
    const hands = m > 0 ? [lo, hi] : [hi, lo];
    tmpR.set(1, 0, 0).applyEuler(torso.rotation);
    for(let i = 0; i < 2; i++){
      const s = i ? 1 : -1, A = ARMS[i];
      const sh = shoulders[i].position.clone().applyMatrix4(torso.matrix);
      const r = ik(sh, hands[i], .33, .34, V(s, -.5, .6));
      const out = tmpR.clone().multiplyScalar(s);
      placeOut(A.upper, sh, r.mid, out); A.elbow.position.copy(r.mid);
      const fd = V().subVectors(r.end, r.mid).normalize(), wrist = r.end.clone().addScaledVector(fd, -.075);
      placeOut(A.fore, r.mid, wrist, out); orient(A.cuff, wrist, fd); orient(A.glove, r.end, fd);
    }
    const hd = placeStick(stick, Pz.Hh, Pz.Bt);
    return { hd, Hh: Pz.Hh };
  };
  return S;
}

/* ===================================== THE GOALIE =====================================
   He faces +z in his net's frame, catches with his left hand (+x), blocker and stick in the right. */
function makeGoalie(){
  const G = { base: new THREE.Group() }; world.add(G.base);
  const tm = teamMats('EDM'), mm = manMats('EDM', '', '');
  const gG = new THREE.Group(); gG.position.set(0, 0, .38); G.base.add(gG);
  const gPelvis = new THREE.Group(); gG.add(gPelvis);
  const pants = mesh(new THREE.CylinderGeometry(.25, .28, .3, 16), tm.pants, gPelvis, 0, -.06, 0); pants.scale.z = .8;
  const gTorso = new THREE.Group(); gG.add(gTorso);
  /* the goalie's sweater is the same lathe, cut bigger and turned to face +z, so his crest is on show */
  const sweater = mesh(TORSO_GEO, mm.torso, gTorso); sweater.scale.set(1.2, .95, .86); sweater.rotation.y = Math.PI;
  const pads = [-1, 1].map(s => { const c = mesh(new THREE.SphereGeometry(.16, 14, 10), tm.shoulder, gTorso, s*.3, .5, 0); c.scale.set(1, .8, 1); return c; });
  const gHead = new THREE.Group(); gHead.position.set(0, .62, .04); gTorso.add(gHead);
  const mask = mesh(new THREE.SphereGeometry(.14, 24, 16), tm.gmask, gHead, 0, .1, 0); mask.scale.set(.92, 1.08, 1);
  const cage = new THREE.Mesh(new THREE.SphereGeometry(.152, 8, 6, Math.PI/2 - .75, 1.5, Math.PI*.42, Math.PI*.38), Mt.cage); cage.position.set(0, .1, .01); gHead.add(cage);
  const gShoulders = [-1, 1].map(s => { const o = new THREE.Object3D(); o.position.set(s*.3, .5, 0); gTorso.add(o); return o; });
  const PADS = [-1, 1].map(s => {
    const p = new THREE.Group(); gG.add(p);
    const face = mesh(new THREE.BoxGeometry(.27, .84, .13), tm.gpad, p, 0, -.38, .02);
    mesh(new THREE.BoxGeometry(.22, .14, .17), tm.gwhite, p, 0, .02, 0);
    mesh(new THREE.CylinderGeometry(.045, .045, .82, 10), tm.gwhite, p, s*.13, -.38, .03);
    return { p, s, face, thigh: limb(.13, .11, tm.leg, gG) };
  });
  const gArms = [0, 1].map(() => ({ upper: limb(.1, .09, mm.upper, gG, 16), fore: limb(.09, .08, mm.fore, gG, 16) }));
  const trapper = new THREE.Group(); gG.add(trapper);
  const trapCup = mesh(new THREE.SphereGeometry(.15, 18, 12, 0, Math.PI*2, 0, Math.PI/2), tm.gtrap, trapper); trapCup.rotation.x = -Math.PI/2; trapCup.scale.set(1, .6, 1.2);
  mesh(new THREE.BoxGeometry(.1, .2, .1), tm.gwhite, trapper, -.02, -.14, -.06);
  const trapT = mesh(new THREE.BoxGeometry(.03, .16, .02), tm.gaccent, trapper, 0, .02, -.08);
  const blocker = new THREE.Group(); gG.add(blocker);
  const blockFace = mesh(new THREE.BoxGeometry(.21, .37, .05), tm.gblock, blocker, -.05, .03, .04);
  mesh(new THREE.CylinderGeometry(.07, .07, .14, 12), tm.gwhite, blocker, .02, -.06, -.02);
  const gStick = makeStick(1.48, .38, 122, { paddle: .62, bladeH: .09, curve: .05, tape: tm.gwhite }); gG.add(gStick);
  slim(G.base);
  G.trapper = trapper;
  G.setKit = function(abbr, name, num){
    const T = teamMats(abbr), M = manMats(abbr, name, num);
    pants.material = T.pants; sweater.material = M.torso; pads.forEach(p => p.material = T.shoulder); mask.material = T.gmask;
    PADS.forEach(p => { p.face.material = T.gpad; p.thigh.material = T.leg; });
    gArms.forEach(a => { a.upper.material = M.upper; a.fore.material = M.fore; });
    trapCup.material = T.gtrap; trapT.material = T.gaccent; blockFace.material = T.gblock;
    G.abbr = abbr; G.name = name; G.num = num;
  };
  const tmpR = V();
  G.pose = function(Pq){
    gG.position.x = Pq.x; gG.rotation.set(0, Pq.yaw, Pq.roll);
    const py = lerp(.6, .36, Pq.splay);
    gPelvis.position.set(0, py, -.02); gTorso.position.set(0, py, -.02); gTorso.rotation.x = .3 - .12*Pq.splay;
    gHead.rotation.x = -.25 + .1*Pq.splay;
    gG.updateMatrixWorld(true);
    for(const pd of PADS){
      const s = pd.s, knee = vl(V(s*.17, .45, .2), V(s*.15, .11, .25), Pq.splay);
      pd.p.position.copy(knee); pd.p.rotation.set(-.1*(1 - Pq.splay), 0, s*lerp(.1, 1.42, Pq.splay));
      place(pd.thigh, V(s*.13, -.1, 0).applyMatrix4(gPelvis.matrix), knee);
    }
    const ends = [];
    tmpR.set(1, 0, 0).applyEuler(gTorso.rotation);
    [Pq.block, Pq.glove].forEach((T, i) => {
      const s = i ? 1 : -1, A = gArms[i], sh = gShoulders[i].position.clone().applyMatrix4(gTorso.matrix);
      const r = ik(sh, T, .33, .35, V(s, -.6, -.5)), out = tmpR.clone().multiplyScalar(s);
      placeOut(A.upper, sh, r.mid, out); placeOut(A.fore, r.mid, r.end, out); ends.push(r.end);
    });
    blocker.position.copy(ends[0]); trapper.position.copy(ends[1]);
    trapper.rotation.set(0, -.25, -.2);
    const grip = ends[0], Hh = V(grip.x + .34, Math.max(.045, grip.y - .7), grip.z + .22);
    placeStick(gStick, Hh, Hh.clone().add(grip.clone().sub(Hh).normalize().multiplyScalar(1.48)));
  };
  /* which end he is in: 0 the north net, 1 the south */
  G.setEnd = function(end){ G.end = end; G.base.position.set(0, 0, end ? GS : 0); G.base.rotation.y = end ? Math.PI : 0; };
  G.setEnd(0);
  return G;
}

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
const DUR = 3600, K = { go: .05, deke: .40, load: .58, sweep: .64, shot: .664, hit: .72, end: .9 };
let START = [-1.35, 8.6], END = [-1.0, 3.7], SH = SO, GNo = A[1][0];
let state = 'idle', shotT0 = 0, shotSpot = 'gh', guess = 'fh', scored = false, releaseW = null, goalLit = 0;
const mirr = () => SH.hand === 'R' ? -1 : 1;
function rootAt(u){
  const k = ease(clamp((u - K.go)/(K.shot + .01 - K.go))), m = mirr();
  let x = lerp(START[0], END[0], k) + m*Math.sin(k*Math.PI)*.35, z = lerp(START[1], END[1], k);
  const a = clamp((u - K.shot)/(1 - K.shot)); x -= m*(.25*a + 1.1*a*a); z -= .9*a*(1 - .5*a);
  return [x, z];
}
function strideFeet(amt, ph, back){
  return [0, 1].map(i => {
    const s = i ? 1 : -1, g = { p: V(s*.21, 0, s < 0 ? -.1 : .12), out: .08 };
    let st = g;
    if(amt > 0){
      const p = frac(ph + (i ? .5 : 0)), bz = back ? -1 : 1;
      if(p < .55){ const q = p/.55; st = { p: V(s*(.12 + .36*q), 0, bz*(-.08 + .42*q)), out: .25 + .4*q }; }
      else { const q = (p - .55)/.45; st = { p: V(s*lerp(.48, .12, q), .13*Math.sin(q*Math.PI), bz*lerp(.34, -.08, q)), out: lerp(.65, .1, q) }; }
    }
    return { p: vl(g.p, st.p, amt), yaw: -s*lerp(g.out, st.out, amt)*(back ? -1 : 1), push: amt > .5 ? frac(ph + (i ? .5 : 0)) : -1 };
  });
}
function skaterPose(u, t, idle){
  const Pq = { px: 0, py: .85, lean: -.55, twist: 0, roll: 0, gap: .46 };
  let amt = 0, ph = 0;
  if(!idle){ amt = clamp((u - K.go)/.03)*(1 - clamp((u - .34)/.06)); ph = (u - K.go)*DUR/1000*2.3; }
  Pq.feet = strideFeet(amt, ph, false);
  Pq.px = .06*Math.sin(ph*2*Math.PI)*amt; Pq.py = .85 + .02*Math.cos(ph*4*Math.PI)*amt;
  Pq.twist = .12*Math.sin(ph*2*Math.PI)*amt; Pq.lean = -.55 - .08*amt;
  const base = V(-.55, .04, -1.05), loadP = V(-.72, .04, -.6);
  let Hh = base.clone(), Bq = V(.12, .92, -.5);
  if(idle){ Hh.x += .1*Math.sin(t*4.2); Hh.z += .05*Math.cos(t*4.2); }
  else if(u < K.deke){ Hh.x += .13*Math.sin((u - K.go)*DUR/1000*2*Math.PI*1.4); }
  else if(u < K.load){ const d = (u - K.deke)/(K.load - K.deke), o = Math.sin(d*Math.PI); Hh.x += o*.8; Hh.z += o*.18; Pq.twist -= o*.25; Bq.x += o*.15; }
  else if(u < K.sweep){ const l = ease((u - K.load)/(K.sweep - K.load)); Hh = vl(base, loadP, l); Pq.twist += .32*l; Bq = vl(Bq, V(.22, .98, -.36), l); }
  else {
    const r = ease(clamp((u - K.sweep)/.065)); Hh = vl(loadP, V(-.15, .5, -1.5), r); Pq.twist += lerp(.32, -.38, r);
    Bq = vl(V(.22, .98, -.36), V(-.02, 1.02, -.62), r); Pq.lean = lerp(-.6, -.42, r);
    Hh.lerp(V(-.3, .1, -1.25), clamp((u - .76)/.1)*.6);
  }
  const Bt = Hh.clone().add(Bq.clone().sub(Hh).normalize().multiplyScalar(SL));
  const c = scored && !idle ? ease(clamp((u - .76)/.1)) : 0;
  if(c > 0) celeStick(Pq, Hh, Bt, c);
  else { Pq.Hh = Hh; Pq.Bt = Bt; }
  return Pq;
}
/* the stick up, the arms with it */
function celeStick(Pq, Hh, Bt, c){
  const Bc = V(.26, 1.78, -.12), Hc = Bc.clone().add(V(-.35, .85, -.4).normalize().multiplyScalar(SL));
  Bt = Bt.clone().lerp(Bc, c); Hh = Hh.clone().lerp(Hc, c); Hh = Bt.clone().add(Hh.clone().sub(Bt).normalize().multiplyScalar(SL));
  Pq.lean = lerp(Pq.lean, -.12, c); Pq.twist = lerp(Pq.twist, -.15, c); Pq.gap = lerp(.46, .3, c);
  Pq.Hh = Hh; Pq.Bt = Bt;
}
function bladeWorld(actor, r){
  const n = V(r.hd.z, 0, -r.hd.x); if(n.z > 0) n.negate();
  const p = r.Hh.clone().addScaledVector(r.hd, .13).addScaledVector(n, .05); p.y = Math.max(.013, r.Hh.y - .02);
  return actor.root.localToWorld(p);
}
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
const G0 = { glove: V(.43, .84, .3), block: V(-.43, .7, .32) };
const SAVES = {
  gh: { x: .12, roll: -.08, glove: V(.6, 1.02, .34) },
  bh: { x: -.12, roll: .08, block: V(-.6, .96, .35) },
  fh: { splay: 1 },
  lg: { x: .22, roll: -.14, splay: 1, glove: V(.6, .36, .36) },
  lb: { x: -.22, roll: .14, splay: 1, block: V(-.62, .33, .36) }
};
function goaliePose(u, t, idle, pw, seed){
  const Pq = { x: 0, yaw: 0, roll: 0, splay: 0, glove: G0.glove.clone(), block: G0.block.clone() };
  Pq.x = Math.max(-.22, Math.min(.22, pw.x*.3)); Pq.yaw = Math.max(-.45, Math.min(.45, Math.atan2(pw.x - Pq.x, Math.max(1, pw.z - .38))*.75));
  Pq.glove.y += Math.sin(t*2 + seed)*.012; Pq.block.y += Math.sin(t*2 + 1 + seed)*.01;
  if(!idle){
    const k = ease(clamp((u - (K.shot - .025))/.075)), S = SAVES[guess];
    Pq.x = lerp(Pq.x, S.x || 0, k); Pq.roll = lerp(0, S.roll || 0, k); Pq.splay = (S.splay || 0)*k; Pq.yaw = lerp(Pq.yaw, 0, k);
    if(S.glove) Pq.glove.lerp(S.glove, k); else if(S.splay) Pq.glove.lerp(V(.36, .56, .36), k);
    if(S.block) Pq.block.lerp(S.block, k); else if(S.splay) Pq.block.lerp(V(-.36, .5, .36), k);
  }
  return Pq;
}
let lastU = 0, padSprayed = false, shotLive = false;
/* runs the shot, or the shooter waiting at the line */
function runShot(now, t){
  const idle = !(state === 'shoot' || state === 'result');
  const u = idle ? 0 : clamp((now - shotT0)/DUR);
  if(!idle && u >= K.shot && !releaseW){ const s = setShooter(K.shot, t, false); releaseW = bladeWorld(SH, s.r); }
  const { Pq, r } = setShooter(u, t, idle);
  const S = SPOTS[shotSpot].p, target = V(S[0], S[1], .03);
  if(idle || u < K.shot){ puck.position.copy(bladeWorld(SH, r)); puck.rotation.set(0, 0, 0); }
  else if(u < K.hit){ const f = (u - K.shot)/(K.hit - K.shot); puck.position.copy(vl(releaseW, target, f)); puck.position.y += Math.sin(f*Math.PI)*.06; puck.rotation.x += .6; }
  else {
    const f = clamp((u - K.hit)/(K.end - K.hit));
    if(scored){ const drop = clamp((f - .25)/.5); puck.position.set(S[0]*.8, lerp(S[1], .016, ease(drop)), lerp(.03, -.82, Math.sqrt(clamp(f/.35)))); }
    else if(shotSpot === 'gh'){ GNo.trapper.updateMatrixWorld(true); GNo.trapper.getWorldPosition(puck.position); puck.position.z += .02; }
    else if(shotSpot === 'bh'){ puck.position.set(S[0] - f*2.6, Math.max(.016, S[1] + f*1.4 - f*f*2.6), lerp(.4, 1.6, f)); puck.rotation.z += .4; }
    else { const side = S[0] > .1 ? 1 : S[0] < -.1 ? -1 : .3; puck.position.set(S[0] + side*f*1.2, .016, lerp(.5, 2.6, f)); }
  }
  const pg = goaliePose(u, t, idle, puck.position, 0);
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
  if(state === 'shoot' && u >= K.end){ state = 'result'; showFlash(scored ? 'GOAL' : 'SAVE', scored ? 'goal' : 'save'); if(resolveShot) resolveShot(); }
  return u;
}

/* ===================================== THE MATCH ===================================== */
let mode = 'shootout';             // shootout | match
let att = 0;                       // the side drawn attacking the north net
let carrier = null;                // whoever has the puck: { w, i }
const pk = { state: 'carry', from: V(), to: V(), t0: 0, dur: 1, at: V(), done: null, spin: 0 };
const rot = p => ({ x: -p.x, z: GS - p.z });
const viewOf = (w, p) => w === att ? { x: p.x, z: p.z } : rot(p);
const actor = (w, i) => A[w][i];
function setEnds(){ for(const w of [0, 1]) A[w][0].setEnd(w === att ? 1 : 0); GNo = A[1 - att][0]; }
/* turn the whole picture 180 degrees about centre ice, camera included, so nothing seems to move */
function flipView(){
  att = 1 - att;
  for(const s of skaters()){ s.x = -s.x; s.z = GS - s.z; s.vx = -s.vx; s.vz = -s.vz; s.head += Math.PI; s.tx = -s.tx; s.tz = GS - s.tz; s.root.position.set(s.x, 0, s.z); }
  setEnds();
  for(const v of [pk.from, pk.to, pk.at, puck.position]){ v.x = -v.x; v.z = GS - v.z; }
  camF.x = -camF.x; camF.z = GS - camF.z; camYaw += Math.PI;
  snowRot();
}
/* the camera rig: a broadcast camera high behind the attackers, following the puck */
const camF = V(0, 0, ZC), camPos = V(0, 12, ZC + 15), camLook = V(0, 0, ZC);
let celeYaw = null, shotT = 0;
let camYaw = 0, camMode = 'play', camHold = null, celeAt = null, celeT0 = 0, shotBlend = 0;
function steer(s, dt){
  const dx = s.tx - s.x, dz = s.tz - s.z, d = Math.hypot(dx, dz);
  const vmax = s.vmax || 7.2;
  const sp = d < .12 ? 0 : Math.min(vmax, d*1.7);
  let wx = d > 1e-3 ? dx/d*sp : 0, wz = d > 1e-3 ? dz/d*sp : 0;
  /* a body's width from each other */
  for(const o of skaters()){ if(o === s || !o.root.visible) continue; const ox = s.x - o.x, oz = s.z - o.z, od = Math.hypot(ox, oz); if(od < 1.05 && od > 1e-3){ const f = (1.05 - od)*3; wx += ox/od*f; wz += oz/od*f; } }
  const ax = wx - s.vx, az = wz - s.vz, al = Math.hypot(ax, az), amax = (s.acc || 11)*dt;
  const k = al > amax ? amax/al : 1, before = Math.hypot(s.vx, s.vz);
  s.vx += ax*k; s.vz += az*k;
  s.x += s.vx*dt; s.z += s.vz*dt;
  s.x = clamp(s.x, -HX + .6, HX - .6); s.z = clamp(s.z, ZN + .7, ZS - .7);
  const speed = Math.hypot(s.vx, s.vz);
  /* a hard stop throws snow */
  if(before - speed > 7*dt*1.2 && before > 3 && Math.random() < .6){ const fx = -Math.sin(s.head), fz = -Math.cos(s.head); spray(V(s.x + fx*.3, 0, s.z + fz*.3), V(fx, 0, fz), 4, 2); }
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
function matchPose(s, t, now){
  const amt = s.amt, ph = s.ph;
  const Pq = { px: .06*Math.sin(ph*2*Math.PI)*amt, py: .86 + .02*Math.cos(ph*4*Math.PI)*amt, lean: -.4 - .22*amt, twist: .12*Math.sin(ph*2*Math.PI)*amt, roll: clamp(-s.turn*.12, -.35, .35), gap: .46 };
  Pq.feet = strideFeet(amt, ph, s.back);
  let Hh = V(-.5, .03, -1.0), Bq = V(.12, .92, -.5);
  const k = (now - s.t0)/1000;
  const crouch = [{ p: V(-.3, 0, .05), yaw: .3, push: -1 }, { p: V(.3, 0, .05), yaw: -.3, push: -1 }];
  if(s.mode === 'carry'){ Hh.x += .17*Math.sin(t*7.5 + s.seed); Hh.z += .07*Math.cos(t*7.5 + s.seed); Pq.lean -= .06; }
  else if(s.mode === 'recv'){ Hh = V(-.62, .03, -1.18); Pq.twist -= .15; }
  else if(s.mode === 'pass'){
    const q = clamp(k/.34);
    if(q < .45){ const l = ease(q/.45); Hh = vl(V(-.5, .03, -1.0), V(-.82, .03, -.42), l); Pq.twist += .3*l; }
    else { const l = ease((q - .45)/.55); Hh = vl(V(-.82, .03, -.42), V(-.05, .1, -1.45), l); Pq.twist += lerp(.3, -.35, l); Bq = vl(Bq, V(-.02, 1.0, -.6), l); }
  }
  else if(s.mode === 'lunge'){ const l = ease(clamp(k/.25)); Hh = vl(Hh, V(-.9, .03, -1.35), l); Pq.lean -= .3*l; Pq.py -= .1*l; }
  else if(s.mode === 'faceoff'){ Pq.lean = -1.0; Pq.py = .7; Hh = V(-.1, .03, -.95); Bq = V(.1, .72, -.48); Pq.feet = crouch; }
  else if(s.mode === 'draw'){ const l = ease(clamp(k/.3)); Pq.lean = -1.0 + .3*l; Pq.py = .7 + .1*l; Hh = vl(V(-.1, .03, -.95), V(-.55, .03, -.2), l); Bq = V(.1, .78, -.4); Pq.feet = crouch; }
  else Hh.x += .04*Math.sin(t*1.3 + s.seed);
  const Bt = Hh.clone().add(Bq.clone().sub(Hh).normalize().multiplyScalar(SL));
  if(s.mode === 'cele'){ const c = ease(clamp(k/.4)); celeStick(Pq, Hh, Bt, c); Pq.look = .2*c; }
  else { Pq.Hh = Hh; Pq.Bt = Bt; }
  return Pq;
}
const lastBlade = new Map();
let ringTarget = null;
function runMatch(dt, t, now, shotOwnsPuck){
  for(const s of skaters()){
    if(shotLive && s === SH) continue;
    steer(s, dt);
    s.root.position.set(s.x, 0, s.z); s.root.rotation.y = s.head;
    lastBlade.set(s, s.pose(matchPose(s, t, now)));
    if(s.speed > 3 && Math.random() < s.speed*.02) spray(V(s.x, 0, s.z), V(Math.cos(s.head), 0, -Math.sin(s.head)), 2, 1);
  }
  if(!shotOwnsPuck){
    if(pk.state === 'carry' && carrier){
      const c = actor(carrier.w, carrier.i);
      if(c.goalie){ c.trapper.updateMatrixWorld(true); c.trapper.getWorldPosition(puck.position); }
      else { const r = lastBlade.get(c); if(r) puck.position.copy(bladeWorld(c, r)); }
    } else if(pk.state === 'fly'){
      const f = clamp((now - pk.t0)/pk.dur), e = 1 - Math.pow(1 - f, 1.35);
      puck.position.copy(vl(pk.from, pk.to, e)); puck.position.y = .013;
      puck.rotation.y += pk.spin*dt;
      if(f >= 1){ pk.state = 'rest'; pk.at.copy(pk.to); const d = pk.done; pk.done = null; if(d) d(); }
    } else if(pk.state === 'drop'){
      const f = clamp((now - pk.t0)/pk.dur); puck.position.set(pk.at.x, lerp(1.5, .013, f*f), pk.at.z); puck.rotation.x += .2;
      if(f >= 1){ pk.state = 'rest'; puck.rotation.set(0, 0, 0); spray(pk.at, V(0, 0, 1), 6, .6); const d = pk.done; pk.done = null; if(d) d(); }
    } else if(pk.state === 'rest'){ puck.position.copy(pk.at); puck.position.y = .013; }
  }
  /* goalies square up to the puck */
  for(const w of [0, 1]){
    const g = A[w][0];
    if(shotLive && g === GNo) continue;
    g.pose(goaliePose(0, t, true, g.base.worldToLocal(puck.position.clone()), w*1.7));
  }
  if(carrier && !shotLive && pk.state === 'carry'){ const c = actor(carrier.w, carrier.i); const p = c.goalie ? c.base.localToWorld(V(0, 0, .5)) : V(c.x, 0, c.z); ringC.position.set(p.x, .012, p.z); ringC.scale.setScalar(1 + .06*Math.sin(t*5)); }
  if(ringTarget){ const c = actor(ringTarget.w, ringTarget.i); ringT.position.set(c.x, .012, c.z); ringT.scale.setScalar(1 + .1*Math.sin(t*7)); }
}
function ringsOn(){ ringC.visible = mode === 'match' && !!(carrier && !shotLive && pk.state === 'carry'); ringT.visible = mode === 'match' && !!(ringTarget && !shotLive); }
function focusPoint(){
  if(carrier && pk.state === 'carry'){ const c = actor(carrier.w, carrier.i); if(!c.goalie) return V(c.x, 0, c.z); }
  return puck.position.clone();
}
let aspect = .8;
const baseFov = shot => shot ? (aspect < 1 ? 22 : aspect < 1.3 ? 18 : 14) : (aspect < .9 ? 46 : aspect < 1.3 ? 40 : 34);
function setFov(f){ if(Math.abs(cam.fov - f) > .01){ cam.fov = f; cam.updateProjectionMatrix(); } }
/* the sweater room: one man on the ice, the camera walking round him */
let showAng = 0, showCur = 0;
function runShow(t, dt){
  SO.root.position.set(0, 0, 5.2); SO.root.rotation.y = 0;
  const Pq = skaterPose(0, t, true);
  /* stood up straight so the crest shows, stick down by his side */
  Pq.lean = -.16; Pq.py = .93; Pq.twist = .05*Math.sin(t*.8);
  Pq.Hh = V(-.62 + .05*Math.sin(t*1.3), .03, -.55); Pq.Bt = Pq.Hh.clone().add(V(.5, 1.05, .32).normalize().multiplyScalar(SL)); Pq.gap = .5;
  const r = SO.pose(Pq);
  puck.position.copy(bladeWorld(SO, r));
  GNo.pose(goaliePose(0, t, true, puck.position, 0));
  showCur += wrapA(showAng - showCur)*(1 - Math.exp(-dt*3));
}
function updateCam(dt, now, shotU){
  const r = reduced();
  if(mode === 'show'){
    const a = showCur + (r ? 0 : Math.sin(now/1000*.5)*.45);
    cam.position.set(Math.sin(a)*3.1, 1.45, 5.2 + Math.cos(a)*3.1); cam.lookAt(0, 1.0, 5.2); setFov(aspect < 1 ? 34 : 28);
    key.target.position.set(0, 0, 5); key.position.set(2.5, 16, 12); key.target.updateMatrixWorld();
    return;
  }
  if(mode === 'shootout'){
    const c = ease(clamp(shotU/K.shot));
    cam.position.copy(vl(CAM0, CAM1, c)); cam.lookAt(LOOK); setFov(baseFov(true));
    key.target.position.set(0, 0, 3); key.position.set(2.5, 16, 10); key.target.updateMatrixWorld();
    return;
  }
  camYaw = r ? 0 : camYaw*Math.exp(-dt*2.6); if(Math.abs(camYaw) < .002) camYaw = 0;
  let F = camHold ? camHold.clone() : focusPoint(), Hc = 8.2, Dc = 12.5, fov = baseFov(false);
  if(camMode === 'faceoff'){ Hc = 3.4; Dc = 7.2; fov *= .82; }
  if(camMode === 'cele' && celeAt){ F = V(celeAt.x - Math.sin(celeAt.head)*.8, 0, celeAt.z - Math.cos(celeAt.head)*.8); Hc = 2.1; Dc = 5.8; fov *= .8; }
  if(camMode === 'play'){ F.z = clamp(F.z - 4.5, 4, 48); F.x *= .5; }
  camF.lerp(F, 1 - Math.exp(-dt*(camMode === 'cele' ? 5 : 2.4)));
  let yaw = camYaw;
  if(camMode === 'faceoff') yaw += .55;
  /* the goal: round in front of the scorer, so you see his crest and his stick in the air */
  if(camMode === 'cele' && celeAt){ celeYaw = celeYaw == null ? yaw : celeYaw; celeYaw += wrapA(celeAt.head + Math.PI*.78 + (r ? 0 : Math.sin((now - celeT0)/1000*.6)*.3) - celeYaw)*(1 - Math.exp(-dt*3)); yaw = celeYaw; }
  else celeYaw = null;
  const pPlay = camF.clone().add(V(Math.sin(yaw)*Dc, Hc, Math.cos(yaw)*Dc)), lPlay = camF.clone().add(V(0, camMode === 'cele' ? 1.1 : .4, 0));
  if(shotBlend > 0){
    const sb = ease(shotBlend), cz = START[1] + 6.4, sp = V(START[0]*.4 - .5*mirr(), 1.9, cz);
    camPos.copy(pPlay.lerp(sp, sb)); camLook.copy(lPlay.lerp(LOOK, sb)); fov = lerp(fov, baseFov(true), sb);
  } else { camPos.copy(pPlay); camLook.copy(lPlay); }
  cam.position.copy(camPos); cam.lookAt(camLook); setFov(fov);
  const kt = shotBlend > .5 ? V(0, 0, 3) : camF;
  key.target.position.copy(kt); key.position.copy(kt).add(V(3, 16, 9)); key.target.updateMatrixWorld();
}

/* ---- tags over the men: names, and the price of a pass while you are choosing ---- */
const tagEls = new Map();
let tagMode = null, onTag = null, tagInfo = {};
for(const s of skaters()){
  const b = document.createElement('button'); b.type = 'button'; b.className = 'tag'; b.tabIndex = -1;
  b.innerHTML = '<span class="nm"></span><span class="tier"></span>';
  b.addEventListener('click', () => { if(tagMode && onTag && s.w === att && tagInfo[s.i]) onTag(s.i); });
  tagsEl.appendChild(b); tagEls.set(s, b);
}
const tmpV = V();
function placeTags(){
  const show = mode === 'match' && !shotLive && camMode === 'play';
  tagsEl.hidden = !show;
  if(!show) return;
  const w = wrap.clientWidth, h = wrap.clientHeight;
  for(const [s, b] of tagEls){
    tmpV.set(s.x, 2.1, s.z).project(cam);
    const vis = tmpV.z < 1 && tmpV.x > -1.15 && tmpV.x < 1.15 && tmpV.y > -1.15 && tmpV.y < 1.15;
    b.style.display = vis ? '' : 'none';
    if(vis) b.style.transform = 'translate(' + ((tmpV.x + 1)/2*w).toFixed(1) + 'px,' + ((1 - tmpV.y)/2*h).toFixed(1) + 'px) translate(-50%,-100%)';
  }
}
function setTags(){
  for(const [s, b] of tagEls){
    const mine = s.w === att, info = tagMode && mine ? tagInfo[s.i] : null, has = !!(carrier && carrier.w === s.w && carrier.i === s.i);
    b.className = 'tag ' + (mine ? 'us' : 'them') + (info ? ' pick t-' + info.tier : '') + (has ? ' has' : '');
    b.tabIndex = info ? 0 : -1;
    b.style.setProperty('--tc', A[s.w].color || '#ffffff');
    b.querySelector('.nm').textContent = mine ? (s.label || '') : (s.num != null ? String(s.num) : '');
    b.querySelector('.tier').textContent = info ? info.say : '';
    if(info) b.setAttribute('aria-label', 'Pass to ' + s.label + ', ' + info.say); else b.removeAttribute('aria-label');
  }
}

/* ===================================== THE LOOP ===================================== */
let lastT = 0, frames = 0, slowAvg = 16, reflect = true, shadowTick = 0;
function render(now){
  const t = now/1000, dt = Math.min(.05, t - lastT || .016); lastT = t;
  slowAvg = lerp(slowAvg, dt*1000, .03);
  /* a phone that can't keep up loses the reflection and some pixels, not frames */
  if(++frames > 120 && slowAvg > 38 && reflect){ reflect = false; DPR = Math.min(DPR, 1.25); R.setPixelRatio(DPR); size(); }
  let su = 0, shotOwns = false;
  if(mode === 'shootout' || shotLive){ su = runShot(now, t); shotOwns = true; }
  if(mode === 'show') runShow(t, dt);
  if(mode === 'match'){
    runMatch(dt, t, now, shotOwns);
    /* on the clock, not the frame count, so a slow phone still gets there */
    shotBlend = shotLive ? clamp((now - shotT)/650) : Math.max(0, shotBlend - dt/.5);
  }
  stepSnow(dt);
  goalLit = Math.max(0, goalLit - dt);
  const lit = goalLit > 0;
  NN.lightMat.emissive.setHex(lit && Math.sin(t*14) > -.2 ? 0xff1a1a : 0x000000);
  NN.red.intensity = lit ? 1.6 + Math.sin(t*14)*.8 : 0;
  updateCam(dt, now, su);
  R.info.reset();
  R.clear();
  if(reflect){
    world.scale.y = -1; ice.visible = false; for(const m of crowd) m.visible = false; snowPts.visible = false; ringC.visible = ringT.visible = false;
    R.render(scene, cam);
    world.scale.y = 1; ice.visible = true; for(const m of crowd) m.visible = true; snowPts.visible = true; R.clearDepth();
  }
  ringsOn();
  if(++shadowTick % (reflect ? 1 : 2) === 0) R.shadowMap.needsUpdate = true;
  R.render(scene, cam);
  if(state === 'pick') placeSpots();
  placeTags();
}
function size(){ const w = wrap.clientWidth, h = wrap.clientHeight; if(!w || !h) return; R.setSize(w, h, false); aspect = w/h; cam.aspect = aspect; cam.updateProjectionMatrix(); }
function placeSpots(){
  const w = wrap.clientWidth, h = wrap.clientHeight;
  for(const b of spotsEl.children){ const p = SPOTS[b.dataset.k].p, v = V(p[0], p[1], 0).project(cam); b.style.left = ((v.x + 1)/2*w) + 'px'; b.style.top = ((1 - v.y)/2*h) + 'px'; }
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
  for(const s of skaters()) s.root.visible = m === 'match';
  SO.root.visible = m === 'shootout' || m === 'show';
  for(const w of [0, 1]) A[w][0].base.visible = m === 'match';
  if(m === 'show'){ GNo = A[1][0]; GNo.setEnd(0); GNo.base.visible = true; shotLive = false; shotBlend = 0; carrier = null; ringTarget = null; state = 'idle'; spotsEl.hidden = true; flash.className = 'flash'; }
  if(m === 'shootout'){ SH = SO; GNo = A[1][0]; GNo.setEnd(0); GNo.base.visible = true; shotLive = false; shotBlend = 0; camMode = 'play'; carrier = null; ringTarget = null; }
  tagsEl.hidden = m !== 'match';
}
setMode('shootout');

/* ===================================== THE API ===================================== */
const api = {
  SPOTS,
  mount(el){
    el.appendChild(wrap); size();
    if(window.ResizeObserver){ ro = ro || new ResizeObserver(size); ro.observe(wrap); }
    if(!running){ running = true; lastT = 0; raf = requestAnimationFrame(loop); }
  },
  unmount(){ running = false; cancelAnimationFrame(raf); if(ro) ro.disconnect(); wrap.remove(); },
  /* ---- the shootout: sh = { team, name, number, shoots }, go = { team, name, number } ---- */
  shootout(sh, go){
    setMode('shootout');
    SO.setKit(sh.team, sh.name || '', sh.number == null ? '' : sh.number, sh.shoots);
    GNo.setKit(go.team, go.name || '', go.number == null ? '' : go.number);
    const m = SO.hand === 'R' ? -1 : 1;
    START = [-1.35*m, 8.6]; END = [-1.0*m, 3.7];
    state = 'idle'; scored = false; flash.className = 'flash'; spotsEl.hidden = true;
  },
  /* the sweater room: sh = { team, name, number, shoots } on the ice, go = the goalie behind him; angle 0 = his back, PI = his front */
  showcase(sh, go, angle){
    if(sh){ setMode('show'); SO.setKit(sh.team, sh.name || '', sh.number == null ? '' : sh.number, sh.shoots); }
    if(go) GNo.setKit(go.team, go.name || '', go.number == null ? '' : go.number);
    if(angle != null){ showAng = angle; if(sh) showCur = angle; }
  },
  /* the old call, still honoured */
  setKits(sh, go){ api.shootout({ team: sh.team || 'MTL', name: sh.name, number: sh.number, shoots: sh.shoots }, { team: go.team || 'EDM', name: go.name, number: go.number }); },
  /* show the five spots; cb(spotKey) on a tap */
  pick(cb){ onPick = cb; scored = false; flash.className = 'flash'; spotsEl.hidden = false; state = 'pick'; },
  hold(){ state = 'idle'; spotsEl.hidden = true; if(!shotLive) flash.className = 'flash'; },
  /* play one attempt; resolves a moment after GOAL or SAVE shows */
  shoot(o){
    shotSpot = o.spot; scored = !!o.scored; guess = o.guess || o.spot;
    releaseW = null; padSprayed = false; lastU = 0; spotsEl.hidden = true; flash.className = 'flash';
    state = 'shoot'; shotT0 = performance.now();
    return new Promise(res => { resolveShot = () => { resolveShot = null; setTimeout(res, reduced() ? 600 : 1400); }; });
  },
  flash: showFlash,
  /* draw calls and triangles of the last frame, for keeping an eye on phones */
  stats(){ return { calls: R.info.render.calls, triangles: R.info.render.triangles, reflect, dpr: DPR, avgMs: Math.round(slowAvg) }; },
  /* ---- the match ---- */
  match: {
    /* T: [{ abbr, color, men: [{ label, back, num, shoots }] x6, the goalie first }] x2 */
    teams(T){
      setMode('match');
      for(const w of [0, 1]){
        A[w].color = T[w].color;
        T[w].men.forEach((m, i) => { const a = A[w][i]; if(i === 0) a.setKit(T[w].abbr, m.back, m.num); else { a.setKit(T[w].abbr, m.back, m.num, m.shoots); a.label = m.label; } });
      }
      const paintHome = () => { const img = logo(T[0].abbr, 'light'); if(img){ paintIce(img); return true; } return false; };
      if(!paintHome()) logoWait.push(function once(){ if(!paintHome()) logoWait.push(once); });
      const k0 = kitOf(T[0].abbr), k1 = kitOf(T[1].abbr);
      paintCrowd([k0.b, k0.b, (k0.n && k0.n[1]) || '#ffffff', k0.b, k1.b, '#e8eef3']);
      setTags();
    },
    /* everyone to these spots, given in each side's own attacking frame (attacking z = 0) */
    place(o){
      if(o.att != null && o.att !== att){ if(o.instant){ att = o.att; setEnds(); } else flipView(); }
      if(o.instant) setEnds();
      for(const w of [0, 1]) for(let i = 1; i < 6; i++){
        const s = A[w][i], p = o.sides[w][i]; if(!p) continue;
        const v = viewOf(w, p); s.tx = v.x; s.tz = v.z;
        if(o.instant){ s.x = v.x; s.z = v.z; s.vx = s.vz = 0; s.head = w === att ? 0 : Math.PI; s.root.position.set(s.x, 0, s.z); }
        s.vmax = p.fast ? 8.6 : 7.2; s.acc = 11;
      }
      if(o.carrier !== undefined){ carrier = o.carrier; if(carrier) pk.state = 'carry'; }
      for(const s of skaters()){
        const has = !!(carrier && carrier.w === s.w && carrier.i === s.i);
        s.mode = has ? 'carry' : 'idle';
        s.face = has ? { x: s.tx*.4, z: 0 } : puck.position;
      }
      if(o.instant){ camF.copy(focusPoint()); camF.z = clamp(camF.z - 3.5, 5, 49); camF.x *= .55; camYaw = 0; }
      camMode = 'play'; camHold = null; ringTarget = null;
      setTags();
    },
    /* the puck off his stick to a team-mate: ok, or picked off by `by` */
    pass(o){
      const from = actor(o.from.w, o.from.i), to = actor(o.to.w, o.to.i);
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
            by.tx = end.x + (by.x - end.x)*.12; by.tz = end.z + (by.z - end.z)*.12; by.vmax = 10; by.acc = 18; by.mode = 'lunge'; by.t0 = performance.now(); by.face = { x: start.x, z: start.z };
            catcher = by; to.mode = 'recv'; to.face = { x: start.x, z: start.z };
          }
          const dist = start.distanceTo(end);
          pk.state = 'fly'; pk.from.copy(start); pk.to.copy(end); pk.t0 = performance.now(); pk.dur = clamp(dist/(o.ok ? 21 : 17), .32, 1.25)*1000; pk.spin = 14 + Math.random()*8;
          carrier = null; ringTarget = o.ok ? { w: to.w, i: to.i } : null; setTags();
          spray(start, V(end.x - start.x, 0, end.z - start.z).normalize(), 5, .9);
          pk.done = () => {
            spray(end, V(start.x - end.x, 0, start.z - end.z).normalize(), 7, 1.1);
            catcher.acc = 11; catcher.vmax = 7.2;
            carrier = { w: catcher.w, i: catcher.i }; pk.state = 'carry'; ringTarget = null;
            for(const s of skaters()) if(s.mode === 'recv' || s.mode === 'lunge' || s.mode === 'pass') s.mode = 'idle';
            catcher.mode = 'carry'; setTags();
            setTimeout(res, reduced() ? 120 : 380);
          };
        };
        if(from.goalie){ setTimeout(go, 200); return; }
        from.mode = 'pass'; from.t0 = performance.now();
        setTimeout(go, 150);
      });
    },
    /* faceoff: the two centres crouch over the dot, the puck held above it */
    faceoff(){
      for(const w of [0, 1]){ const c = A[w][3]; c.mode = 'faceoff'; c.face = { x: 0, z: ZC }; }
      carrier = null; pk.state = 'held'; pk.at.set(0, 0, ZC); puck.position.set(0, 1.5, ZC); puck.rotation.set(0, 0, 0);
      camMode = 'faceoff'; camHold = V(0, 0, ZC); setTags();
    },
    /* drop it: `win` draws it back to his left D */
    drop(win){
      return new Promise(res => {
        pk.state = 'drop'; pk.at.set(0, 0, ZC); pk.t0 = performance.now(); pk.dur = 420;
        pk.done = () => {
          const c = A[win][3], d = A[win][1];
          c.mode = 'draw'; c.t0 = performance.now(); A[1 - win][3].mode = 'idle';
          setTimeout(() => {
            const start = V(0, .013, ZC), end = V(d.x, .013, d.z + (win === att ? -1 : 1)*.9);
            pk.state = 'fly'; pk.from.copy(start); pk.to.copy(end); pk.t0 = performance.now(); pk.dur = 650; pk.spin = 16;
            pk.done = () => { carrier = { w: win, i: 1 }; pk.state = 'carry'; A[win][3].mode = 'idle'; d.mode = 'carry'; camHold = null; camMode = 'play'; setTags(); setTimeout(res, 250); };
          }, 230);
        };
      });
    },
    /* the shot: the camera drops in behind him; then pick() shows the spots and shoot() plays it */
    aim(w, i){
      const s = actor(w, i); SH = s; GNo = A[1 - att][0]; shotLive = true; shotT = performance.now();
      const m = s.hand === 'R' ? -1 : 1;
      /* he takes it in to shooting range while the camera cuts down behind him */
      START = [clamp(s.x, -7, 7), clamp(s.z, 6, 11.5)];
      END = [clamp(START[0]*.3 - .9*m, -2.2, 2.2), Math.min(3.9, START[1]*.5)];
      state = 'idle'; scored = false; flash.className = 'flash';
      for(const o of skaters()){ if(o === s) continue; const mine = o.w === att; /* out of the camera's lane: wide, and down by the goal line */
        const sx = o.x >= 0 ? 1 : -1; o.tx = sx*clamp(Math.abs(o.x)*.6, mine ? 3.4 : 2.6, 7); o.tz = mine ? clamp(o.z*.45, 2, 7) : clamp(o.z*.55 + 1.2, 1.6, 9); o.face = puck.position; o.mode = 'idle'; }
      ringTarget = null; setTags();
    },
    endShot(){
      shotLive = false; state = 'idle'; spotsEl.hidden = true;
      SH.x = SH.root.position.x; SH.z = SH.root.position.z; SH.head = SH.root.rotation.y; SH.vx = SH.vz = 0; SH.tx = SH.x; SH.tz = SH.z;
      pk.at.copy(puck.position); pk.state = 'rest';
      SH = SO; flash.className = 'flash';
    },
    /* the goalie covers it */
    toGoalie(w){ carrier = { w, i: 0 }; pk.state = 'carry'; setTags(); },
    /* the goal: lights, the scorer's stick up, team-mates in on him, the camera round him */
    celebrate(w, i){
      const s = actor(w, i); s.mode = 'cele'; s.t0 = performance.now();
      const side = s.x >= 0 ? 1 : -1;
      s.tx = side*(HX - 2.5); s.tz = 7; s.vmax = 6;
      celeAt = s; celeT0 = performance.now(); camMode = 'cele'; goalLit = 3.4;
      for(const o of skaters()){
        if(o === s) continue;
        if(o.w === w){ o.tx = s.tx - side*(.9 + Math.random()); o.tz = 7 + (Math.random() - .5)*2.4; o.vmax = 8; o.face = s.root.position; }
        else { o.tx = o.x*.7; o.tz = o.z + 4; o.vmax = 3; o.face = null; }
      }
      carrier = null; setTags();
      return wait(3200).then(() => { celeAt = null; camMode = 'play'; for(const o of skaters()){ o.mode = 'idle'; o.vmax = 7.2; } });
    },
    /* choosing: tags on your men with what each ball costs */
    select(info, cb){ tagMode = 'pass'; tagInfo = info || {}; onTag = cb; setTags(); },
    unselect(){ tagMode = null; tagInfo = {}; onTag = null; setTags(); },
    target(t){ ringTarget = t; },
    /* where a man is in the view, for the rules that need geometry (who picks off a pass) */
    where(w, i){ const s = actor(w, i); return s.goalie ? { x: 0, z: s.end ? GS - .5 : .5 } : { x: s.x, z: s.z }; },
    get att(){ return att; }
  }
};
return api;
}
P.rink = { get(){ if(built === undefined) built = build(); return built; } };
})();
