/* PUCK: the skaters of the 3D rink (three.js r128, plain script, no modules).

   ONE SKINNED MESH PER MAN. Sweater, shoulder pads, hockey pants, socks over the
   shin guards, skates, gloves, helmet, face and stick are a single geometry in a
   single draw call (the see-through visor, his shadows and the snow go last in
   the same index). The geometry is built once from lofted rings, lathes and
   extrusions and shared by every man: the sweater hangs in folds, blouses over
   the pants and bunches at the elbows. The textures and the material are in
   app/faceoff/skatertex.js: a team map shared by the whole team (the sweater keeps
   the old lathe layout, so paintTorso/paintUpper/paintFore paint it unchanged), a
   small map of his own (name and number in twill, his face, his stick), and
   normal, roughness and mask maps shared by everyone. What else makes a man HIS
   is his own skeleton.

   THE BONES ARE NOT IN THE SCENE GRAPH. Each is a matrix in the man's own space
   and the mesh skins 'detached', so the mirrored reflection pass, the shadow pass
   and the picture all see the same pose.

   A POSE IS DATA (feet, pelvis, lean, twist, where the stick is) and solve() turns
   it into bones: two-bone IK for the legs and arms, the skates flat or on an edge,
   the stick placed so the blade lies flat on the ice at its lie, the top hand on
   the knob, the bottom hand down the shaft, fingers round it.

   THE MOTION is procedural and written to look like video of the real thing: the
   stride (push out and back on the inside edge, toe flick, recovery low under the
   hips, weight over the gliding skate), the glide, crossovers, backwards C-cuts,
   the hockey stop, soft hands, passes, wrist shots, snapshots and one-timers with
   the weight going through, the faceoff crouch, celebrations. Every change of
   state is eased, feet stay put on the ice when he stands, and far men drop to a
   lighter mesh.

   Skater space: y up, he faces -z, x is his right. Poses are written for a LEFT
   shot (blade on his left) and mirrored for a right shot.
   rink3d.js calls P.skater3d(ctx) once and keeps what it returns. */
(function(){
'use strict';
const P = window.PUCK = window.PUCK || {};
P.skater3d = function(C){
const T3 = window.THREE;
const V = (x = 0, y = 0, z = 0) => new T3.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a)*t, clamp = (t, a = 0, b = 1) => t < a ? a : t > b ? b : t;
const ease = t => t*t*(3 - 2*t), frac = x => x - Math.floor(x);
const sst = (a, b, x) => ease(clamp((x - a)/(b - a)));
const PI = Math.PI, TAU = PI*2;
const seedOf = C.seedOf;

/* ---- the man, in metres (about 1.86 m, 1.98 on his skates with the helmet) ---- */
const SL = 1.47;                 /* the stick, heel of the blade to the knob */
const LIE = 134*PI/180;          /* between the shaft and the blade's bottom edge (a lie 5.5) */
const BL = .30;                  /* blade, heel to toe */
const ANK = .125, TH = .44, SN = .45, UA = .315, FA = .28, GRIP = .078;
const HIPX = .095, HIPY = -.09;
const SHO = V(.19, .15, .01);    /* shoulder joints, from the chest bone */
const SPI = V(0, .13, 0), CHE = V(0, .17, 0), NEK = V(0, .222, -.012), HED = V(0, .105, -.004);
const PY0 = ANK + TH + SN - .012 - HIPY;   /* the pelvis when he stands straight */
const B = { pel: 0, spi: 1, che: 2, nek: 3, hed: 4, ua: [5, 8], fa: [6, 9], hd: [7, 10], th: [11, 14], sh: [12, 15], ft: [13, 16], stk: [17, 18],
  gnd: 19, fs: [20, 21], spr: 22, hem: 23 };   /* gnd, fs: the contact shadows on the ice; spr: the snow of a stop; hem: the sweater's hem, lagging */
const NB = 24;

/* ===================================== THE RIG ===================================== */
const UPV = V(0, 1, 0), ONE = V(1, 1, 1);
const _e = new T3.Euler(), _q = new T3.Quaternion(), _m = new T3.Matrix4();
const iA = V(), iB = V();
function basis(m, o, X, Y, Z){ m.set(X.x, Y.x, Z.x, o.x, X.y, Y.y, Z.y, o.y, X.z, Y.z, Z.z, o.z, 0, 0, 0, 1); return m; }
/* two bones from A towards T, the middle joint bent towards `pole`; false when it could not reach */
function ik(A, T, l1, l2, pole, mid, end){
  const d = iA.subVectors(T, A); let dist = d.length(); d.divideScalar(dist || 1);
  const reach = l1 + l2 - .0015, ok = dist <= reach; dist = clamp(dist, .05, reach);
  const a = (l1*l1 + dist*dist - l2*l2)/(2*dist), h = Math.sqrt(Math.max(0, l1*l1 - a*a));
  const pd = iB.copy(pole).addScaledVector(d, -pole.dot(d)); if(pd.lengthSq() < 1e-9) pd.set(0, 0, -1); pd.normalize();
  mid.copy(A).addScaledVector(d, a).addScaledVector(pd, h); end.copy(A).addScaledVector(d, dist);
  return ok;
}
/* the stick's frame from heel and knob: Y up the shaft, the blade at LIE from it, flat on the ice
   whenever the shaft is no steeper than the lie allows (steeper, and the toe comes up, as on a real
   stick). m: 1 a left shot, -1 a right shot. Z is the face of the blade, X along it */
function stickFrame(Hh, Bt, m, X, Y, Z){
  Y.subVectors(Bt, Hh).normalize();
  const L = Math.hypot(Y.x, Y.z), up = clamp((.3 - L)/.3);
  let hx = Y.x, hz = Y.z + .35*up; const hl = Math.hypot(hx, hz) || 1; hx /= hl; hz /= hl;
  const phi = Math.acos(clamp(Math.cos(LIE)/Math.max(L, 1e-3), -1, 1)), a = -m*phi;
  X.set(hx*Math.cos(a) + hz*Math.sin(a), 0, -hx*Math.sin(a) + hz*Math.cos(a));
  X.addScaledVector(Y, -X.dot(Y)); if(X.lengthSq() < 1e-8) X.set(1, 0, 0); X.normalize();
  Z.crossVectors(X, Y);
}
const BLADE_B = V(Math.sin(LIE), Math.cos(LIE), 0), BLADE_H = V(-Math.cos(LIE), Math.sin(LIE), 0);
const curveAt = a => .024*Math.pow(clamp(a/BL), 2);
/* where the puck sits on the forehand, in stick space (left stick; z flips for a right one) */
const PUCK_ON = V().addScaledVector(BLADE_B, BL*.5).addScaledVector(BLADE_H, .016);
PUCK_ON.z = .006 + .0381 + curveAt(BL*.5);

function newRig(){
  const R = { M: [...Array(NB)].map(() => new T3.Matrix4()), side: 1 };
  for(const k of ['pP', 'pS', 'pC', 'pN', 'pH', 'X', 'Y', 'Z', 'blade', 'G', 'W', 'Wf', 'el', 'w2', 'hX', 'hY', 'hZ', 'pole', 'tmp', 'tmp2', 'o']) R[k] = V();
  for(const k of ['qP', 'qS', 'qC', 'qN', 'qH', 'qF', 'qG']) R[k] = new T3.Quaternion();
  R.gs = V(1, 1, 1);
  R.hip = [V(), V()]; R.knee = [V(), V()]; R.ank = [V(), V()]; R.sho = [V(), V()];
  return R;
}
const ZERO = new T3.Matrix4().makeScale(0, 0, 0);
/* the pose (already mirrored for his hand) into bone matrices */
function solve(R, Pz){
  const M = R.M;
  /* the trunk: the pelvis takes some of the lean, the spine more, the chest all of it */
  _e.set(Pz.lean*.45, Pz.hipYaw, Pz.hipRoll, 'YXZ'); R.qP.setFromEuler(_e); R.pP.set(Pz.px, Pz.py, Pz.pz);
  _e.set(Pz.lean*.75, (Pz.hipYaw + Pz.twist)*.5, Pz.roll*.5, 'YXZ'); R.qS.setFromEuler(_e);
  R.pS.copy(SPI).applyQuaternion(R.qP).add(R.pP);
  _e.set(Pz.lean, Pz.twist, Pz.roll, 'YXZ'); R.qC.setFromEuler(_e);
  R.pC.copy(CHE).applyQuaternion(R.qS).add(R.pS);
  _e.set(-Pz.lean*.4 + Pz.look*.4, Pz.headYaw*.4, 0, 'YXZ'); R.qN.copy(R.qC).multiply(_q.setFromEuler(_e));
  R.pN.copy(NEK).applyQuaternion(R.qC).add(R.pC);
  _e.set(-Pz.lean*.72 + Pz.look, Pz.headYaw, 0, 'YXZ'); R.qH.copy(R.qC).multiply(_q.setFromEuler(_e));
  R.pH.copy(HED).applyQuaternion(R.qN).add(R.pN);
  M[B.pel].compose(R.pP, R.qP, ONE); M[B.spi].compose(R.pS, R.qS, ONE); M[B.che].compose(R.pC, R.qC, ONE);
  M[B.nek].compose(R.pN, R.qN, ONE); M[B.hed].compose(R.pH, R.qH, ONE);
  /* legs: the skate set on the ice (yaw, edge, heel up), the knee over the toes */
  for(let i = 0; i < 2; i++){
    const s = i ? 1 : -1, f = Pz.feet[i];
    const hip = R.hip[i].set(s*HIPX, HIPY, 0).applyQuaternion(R.qP).add(R.pP);
    _e.set(-f.pitch, f.yaw, f.zr, 'YZX'); R.qF.setFromEuler(_e);
    const toe = R.tmp.set(-Math.sin(f.yaw)*.15, 0, -Math.cos(f.yaw)*.15).add(f.p);
    const ank = R.ank[i].set(0, ANK, .15).applyQuaternion(R.qF).add(toe);
    const pole = R.pole.set(-Math.sin(f.yaw) + s*.22, 0, -Math.cos(f.yaw));
    ik(hip, ank, TH, SN, pole, R.knee[i], R.w2);
    const hn = R.hX.crossVectors(pole, R.tmp2.subVectors(R.w2, hip)).normalize();
    R.Y.subVectors(R.knee[i], hip).normalize(); R.Z.crossVectors(hn, R.Y); basis(M[B.th[i]], hip, hn, R.Y, R.Z);
    R.Y.subVectors(R.w2, R.knee[i]).normalize(); R.Z.crossVectors(hn, R.Y); basis(M[B.sh[i]], R.knee[i], hn, R.Y, R.Z);
    M[B.ft[i]].compose(R.w2, R.qF, ONE);
    /* his skate's shadow on the ice, smaller as the skate comes up */
    _e.set(0, f.yaw, 0); R.qG.setFromEuler(_e); const k = clamp(1 - f.p.y*4, .45, 1);
    M[B.fs[i]].compose(R.tmp.set(f.p.x, .008, f.p.z), R.qG, R.gs.set(k, 1, k));
  }
  /* the body's shadow under him, spread the way he leans; the hem of the sweater, a little behind the hips */
  _e.set(0, Pz.hipYaw, 0); R.qG.setFromEuler(_e);
  M[B.gnd].compose(R.tmp.set(R.pP.x*.8, .007, R.pP.z*.6 - .04), R.qG, R.gs.set(1 + .25*Math.abs(Pz.roll), 1, 1 + .2*clamp(-Pz.lean - .3)));
  _e.set(Pz.hemX || 0, 0, Pz.hemZ || 0, 'YXZ'); M[B.hem].compose(R.pP, _q.copy(R.qP).multiply(R.qG.setFromEuler(_e)), ONE);
  /* the snow off his skates in a stop: a fan out of the leading blade, the way he was going */
  if(Pz.spr > .01){ _e.set(0, Pz.sprA, 0); R.qG.setFromEuler(_e); const a = Pz.spr; M[B.spr].compose(Pz.sprP, R.qG, R.gs.set(.55 + .45*a, .35 + .65*a, Pz.sprL*a)); }
  else M[B.spr].copy(ZERO);
  /* the stick */
  const m = R.side, X = R.X, Y = R.Y, Z = R.Z;
  const Hh = R.o.copy(Pz.Hh);
  stickFrame(Hh, Pz.Bt, m, X, Y, Z);
  const top = m > 0 ? 1 : 0;
  /* arms: the top hand first; if he can't reach the knob, the stick comes to him */
  for(const i of [top, 1 - top]){
    const s = i ? 1 : -1, isTop = i === top;
    const sh = R.sho[i].set(s*SHO.x, SHO.y, SHO.z).applyQuaternion(R.qC).add(R.pC);
    const pole = R.pole.set(s*.85, -.5, .32).applyQuaternion(R.qC);
    const fa = clamp(isTop ? Pz.freeTop : Pz.free);
    const reach = UA + FA - .004;
    let along = isTop ? .055 : Pz.gap;
    const G = R.G, hY = R.hY, W = R.W;
    const grip = () => {
      G.copy(Hh).addScaledVector(Y, SL - along);
      hY.subVectors(G, sh); hY.addScaledVector(Y, -hY.dot(Y)); if(hY.lengthSq() < 1e-8) hY.set(0, -1, 0); hY.normalize();
      W.copy(G).addScaledVector(hY, -GRIP);
    };
    grip();
    if(fa < .999){
      let d = W.distanceTo(sh);
      if(d > reach){
        if(isTop){ R.tmp.subVectors(W, sh).multiplyScalar(1 - reach/d); Hh.sub(R.tmp); grip(); }
        else { for(let k = 0; k < 8 && d > reach; k++){ along = Math.max(.2, along - .05); grip(); d = W.distanceTo(sh); } }
      }
      /* the forearm comes in from the elbow, not the shoulder: solve, then turn the wrist to suit and solve again */
      ik(sh, W, UA, FA, pole, R.el, R.w2);
      R.tmp.subVectors(G, R.el); R.tmp.addScaledVector(Y, -R.tmp.dot(Y));
      if(R.tmp.lengthSq() > 1e-8){ hY.lerp(R.tmp.normalize(), .55).normalize(); W.copy(G).addScaledVector(hY, -GRIP); }
    }
    /* a free hand: to its own spot, given from the chest */
    if(fa > .001){ R.Wf.copy(isTop ? Pz.frTop : Pz.fr).applyQuaternion(R.qC).add(R.pC); W.lerp(R.Wf, fa); }
    ik(sh, W, UA, FA, pole, R.el, R.w2);
    const hn = R.hZ.crossVectors(pole, R.tmp2.subVectors(R.w2, sh)).normalize();
    const Ya = R.tmp.subVectors(R.el, sh).normalize(); basis(M[B.ua[i]], sh, hn, Ya, R.hX.crossVectors(hn, Ya));
    Ya.subVectors(R.w2, R.el).normalize(); basis(M[B.fa[i]], R.el, hn, Ya, R.hX.crossVectors(hn, Ya));
    /* the glove: X along the shaft towards the blade (where the thumb points), Y from the wrist into the fist */
    const hx = R.hX.copy(Y).negate();
    if(fa > .001){
      const fy = R.tmp2.copy(Ya);
      hY.lerp(fy, fa).normalize();
      _m.makeRotationFromQuaternion(R.qC); const fx = R.Wf.set(0, 0, -1).applyMatrix4(_m);
      hx.lerp(fx.addScaledVector(hY, -fx.dot(hY)).normalize(), fa);
    }
    hx.addScaledVector(hY, -hx.dot(hY)).normalize();
    const hz = R.hZ.crossVectors(hx, hY);
    const at = R.tmp.copy(R.w2).addScaledVector(hY, GRIP);
    basis(M[B.hd[i]], at, hx, hY, hz);
  }
  /* the stick bone: this hand's stick, the other one folded away */
  basis(M[B.stk[m > 0 ? 0 : 1]], Hh, X, Y, Z); M[B.stk[m > 0 ? 1 : 0]].copy(ZERO);
  if(Pz.noStick){ M[B.stk[0]].copy(ZERO); M[B.stk[1]].copy(ZERO); }
  R.blade.copy(Hh).addScaledVector(X, PUCK_ON.x).addScaledVector(Y, PUCK_ON.y).addScaledVector(Z, m*PUCK_ON.z);
  R.heel = Hh;
  return R;
}

/* ===================================== THE GEOMETRY =====================================
   Every vertex carries up to four bones. Tubes are lofted ring by ring in a bone's own
   space and blend into the next bone near a joint; small rigid parts ride one bone.
   The atlas it maps onto (and the material) are in app/faceoff/skatertex.js. */
const TX = P.skaterTex(T3, C);
const ATL = TX.ATL, RX = TX.R, SW = TX.SW, swUV = TX.swUV;
const R_TORSO = RX.torso, R_UPPER = RX.upper, R_FORE = RX.fore, R_LEG = RX.leg, R_WAIST = RX.waist, R_SOCK = RX.sock;
const R_FACE = RX.face, R_HELM = RX.helm, R_BOOT = RX.boot, R_STICK = RX.stick, R_LACE = RX.lace;
const R_CUFF = TX.rect([TX.L.glove[0], TX.L.glove[1], 256, 64]), R_HAND = TX.rect([TX.L.glove[0], TX.L.glove[1] + 64, 256, 64]);
/* the see-through things, drawn with the visor: his shadow on the ice, the snow of a stop, the visor's tint */
const FX_BLOB = RX.blob, FX_SNOW = RX.snow, FX_VIS = RX.vis;

function Acc(){ return { p: [], n: [], uv: [], si: [], sw: [], ib: [], iv: [] }; }
function normW(W){
  const w = W.filter(x => x[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
  let t = 0; for(const x of w) t += x[1];
  const o = w.map(x => [x[0], x[1]/(t || 1)]); while(o.length < 4) o.push([0, 0]);
  return o;
}
function vert(A, p, n, uv, W){
  A.p.push(p.x, p.y, p.z); A.n.push(n.x, n.y, n.z); A.uv.push(uv[0], uv[1]);
  const w = normW(W); for(let k = 0; k < 4; k++){ A.si.push(w[k][0]); A.sw.push(w[k][1]); }
  return A.p.length/3 - 1;
}
/* a loft: rings = [{ y, rx, rz, cx, cz, n }] in the bone's space (y along it), seg round.
   o.M bone space -> bind space, o.th0 where u = 0 sits, o.uv(fu, fa, i, r) the atlas, fa the
   fraction of the way round by arc length, o.w(lx, ly, lz, i, fu) the bones; o.shape(lx, ly, lz, th, i)
   may move a point ([x, z] or [x, z, y]). Returns the points (bind space) and their normals. */
function tube(A, rings, o){
  const seg = o.seg, nr = rings.length, Mx = o.M, grp = o.grp || 0, part = o.arc || 1, closed = part >= 1;
  const pts = [], loc = [], fa = [];
  for(let i = 0; i < nr; i++){
    const r = rings[i], e = 2/(r.n || 2), row = [], lrow = [], arc = [0];
    for(let j = 0; j <= seg; j++){
      const th = o.th0 + (j/seg)*TAU*part, s = Math.sin(th), c = Math.cos(th);
      let lx = (r.cx || 0) + r.rx*Math.sign(s)*Math.pow(Math.abs(s), e), lz = (r.cz || 0) + r.rz*Math.sign(c)*Math.pow(Math.abs(c), e), ly = r.y;
      if(o.shape){ const q = o.shape(lx, r.y, lz, th, i, j/seg); lx = q[0]; lz = q[1]; if(q.length > 2) ly = q[2]; }
      const lp = V(lx, ly, lz); lrow.push(lp); row.push(lp.clone().applyMatrix4(Mx));
      if(j) arc.push(arc[j - 1] + Math.hypot(lx - lrow[j - 1].x, lz - lrow[j - 1].z));
    }
    const tot = arc[seg] || 1; fa.push(arc.map(a => a/tot)); pts.push(row); loc.push(lrow);
  }
  const det = Mx.determinant(), flip = det < 0;
  const idx = [], nrm = [];
  const tA = V(), tB = V(), nn = V();
  for(let i = 0; i < nr; i++){
    const row = [], nrow = [];
    for(let j = 0; j <= seg; j++){
      const jm = closed ? (j === 0 ? seg - 1 : j - 1) : Math.max(0, j - 1), jp = closed ? (j === seg ? 1 : j + 1) : Math.min(seg, j + 1);
      tA.subVectors(pts[i][jp], pts[i][jm]);
      const i0 = Math.max(0, i - 1), i1 = Math.min(nr - 1, i + 1);
      tB.subVectors(pts[i1][j], pts[i0][j]);
      nn.crossVectors(tA, tB); if(flip) nn.negate(); if(nn.lengthSq() < 1e-14) nn.set(0, 1, 0); nn.normalize();
      const l = loc[i][j], fu = j/seg;
      row.push(vert(A, pts[i][j], nn, o.uv(fu, fa[i][j], i, rings[i]), o.w(l.x, l.y, l.z, i, fu))); nrow.push(nn.clone());
    }
    idx.push(row); nrm.push(nrow);
  }
  const out = grp ? A.iv : A.ib;
  for(let i = 0; i < nr - 1; i++) for(let j = 0; j < seg; j++){
    const a = idx[i][j], b = idx[i][j + 1], c = idx[i + 1][j + 1], d = idx[i + 1][j];
    if(flip) out.push(a, c, b, a, d, c); else out.push(a, b, c, a, c, d);
  }
  /* caps: a fan, facing out along the bone */
  const cap = (i, dir) => {
    const r = rings[i], cen = V(r.cx || 0, r.y, r.cz || 0).applyMatrix4(Mx), ax = V(0, dir, 0).transformDirection(Mx);
    const c0 = vert(A, cen, ax, o.uv(.5, .5, i, r), o.w(r.cx || 0, r.y, r.cz || 0, i, .5));
    const ring = []; for(let j = 0; j <= seg; j++){ const l = loc[i][j]; ring.push(vert(A, pts[i][j], ax, o.uv(j/seg, fa[i][j], i, r), o.w(l.x, l.y, l.z, i, j/seg))); }
    for(let j = 0; j < seg; j++){
      const p0 = cen, p1 = pts[i][j], p2 = pts[i][j + 1];
      const nrm2 = V().subVectors(p1, p0).cross(V().subVectors(p2, p0));
      if(nrm2.dot(ax) >= 0) out.push(c0, ring[j], ring[j + 1]); else out.push(c0, ring[j + 1], ring[j]);
    }
  };
  if(o.cap0) cap(0, -1); if(o.cap1) cap(nr - 1, 1);
  return { pts, nrm, fa };
}
/* a rigid part: any three.js geometry, in bone space by Ml, coloured by a swatch or mapped by uvf */
function part(A, geo, bone, Mb, Ml, uvf, grp = 0, W){
  const g = geo;
  const pos = g.attributes.position, nor = g.attributes.normal, uv0 = g.attributes.uv;
  const Mx = new T3.Matrix4().multiplyMatrices(Mb, Ml), Nm = new T3.Matrix3().getNormalMatrix(Mx), flip = Mx.determinant() < 0;
  const base = [], p = V(), n = V();
  for(let k = 0; k < pos.count; k++){
    p.fromBufferAttribute(pos, k).applyMatrix4(Mx); n.fromBufferAttribute(nor, k).applyMatrix3(Nm).normalize();
    const uv = typeof uvf === 'function' ? uvf(uv0 ? uv0.getX(k) : 0, uv0 ? uv0.getY(k) : 0) : uvf;
    base.push(vert(A, p, n, uv, W || [[bone, 1]]));
  }
  const out = grp ? A.iv : A.ib;
  const tri = (a, b, c) => flip ? out.push(base[a], base[c], base[b]) : out.push(base[a], base[b], base[c]);
  if(g.index){ const ix = g.index.array; for(let k = 0; k < ix.length; k += 3) tri(ix[k], ix[k + 1], ix[k + 2]); }
  else for(let k = 0; k < pos.count; k += 3) tri(k, k + 1, k + 2);
}
/* a rounded box (superellipsoid), half sizes hx, hy, hz */
function blob(hx, hy, hz, n = 3, ws = 12, hs = 8){
  const g = new T3.SphereGeometry(1, ws, hs), p = g.attributes.position, e = 2/n;
  for(let k = 0; k < p.count; k++){
    const x = p.getX(k), y = p.getY(k), z = p.getZ(k);
    p.setXYZ(k, Math.sign(x)*Math.pow(Math.abs(x), e)*hx, Math.sign(y)*Math.pow(Math.abs(y), e)*hy, Math.sign(z)*Math.pow(Math.abs(z), e)*hz);
  }
  g.computeVertexNormals(); return g;
}
const mat4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new T3.Matrix4().compose(V(x, y, z), new T3.Quaternion().setFromEuler(new T3.Euler(rx, ry, rz)), V(sx, sy, sz));
/* Catmull-Rom through a column of numbers, k steps per span */
function spline(ctrl, k){
  const out = [], n = ctrl.length;
  for(let i = 0; i < n - 1; i++) for(let s = 0; s < (i === n - 2 ? k + 1 : k); s++){
    const t = s/k, p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(n - 1, i + 2)];
    const r = {};
    for(const key of Object.keys(p1)){ const a = p0[key], b = p1[key], c = p2[key], d = p3[key]; r[key] = .5*(2*b + (-a + c)*t + (2*a - 5*b + 4*c - d)*t*t + (-a + 3*b - 3*c + d)*t*t*t); }
    out.push(r);
  }
  return out;
}
/* cloth: soft broad ridges with tight creases between */
const fold = x => Math.abs(Math.sin(x));
const gs = (x, w) => Math.exp(-(x/w)*(x/w));
/* push a point of a ring out (or in) by d metres, away from the ring's centre */
const pushOut = (lx, lz, cx, cz, d) => { const dx = lx - cx, dz = lz - cz, r = Math.hypot(dx, dz) || 1; return [lx + dx/r*d, lz + dz/r*d]; };

/* the bind pose: standing straight, arms hanging a little out (an A) */
function bindPose(){
  const Pz = basePose();
  Pz.py = PY0; Pz.lean = 0; Pz.feet[0].p.set(-HIPX, 0, 0); Pz.feet[1].p.set(HIPX, 0, 0); Pz.feet[0].yaw = Pz.feet[1].yaw = 0;
  Pz.free = Pz.freeTop = 1;
  const dir = s => V(s*.36, -1, -.1).normalize().multiplyScalar(UA + FA - .02);
  Pz.fr.copy(SHO).setX(-SHO.x).add(dir(-1)); Pz.frTop.copy(SHO).add(dir(1));
  Pz.Hh.set(-.4, 0, -.8); Pz.Bt.set(.1, .9, -.1);
  return Pz;
}

let GEO = null, BIND = null, INV = null;
function buildAll(){
  const R = newRig(); R.side = 1;
  solve(R, bindPose());
  BIND = R.M.map(m => m.clone());
  for(const b of [B.stk[0], B.stk[1], B.gnd, B.fs[0], B.fs[1], B.spr]) BIND[b].identity();
  INV = BIND.map(m => m.clone().invert());
  GEO = { hi: build(BIND, 1), lo: build(BIND, 0) };
}

function build(Mb, hi){
  const A = Acc();
  const S = hi ? 1 : .42, seg = n => Math.max(5, Math.round(n*S));
  const inv = Mb.map(m => m.clone().invert());
  /* a world direction in a bone's bind space */
  const dirIn = (bone, d) => d.clone().transformDirection(inv[bone]);
  const thOf = (bone, d) => { const l = dirIn(bone, d); return Math.atan2(l.x, l.z); };

  /* ---------------- the sweater: a loose lathe over the shoulder pads, hem over the pants ---------------- */
  const torsoCtrl = [
    { y: -.236, a: .232, b: .166, cz: .004, n: 2.2 },
    { y: -.246, a: .25, b: .184, cz: .006, n: 2.2 },
    { y: -.17, a: .245, b: .178, cz: .004, n: 2.2 },
    { y: -.07, a: .233, b: .167, cz: .002, n: 2.3 },
    { y: .04, a: .219, b: .154, cz: -.004, n: 2.4 },
    { y: .15, a: .226, b: .157, cz: -.008, n: 2.5 },
    { y: .26, a: .248, b: .166, cz: -.011, n: 2.6 },
    { y: .35, a: .276, b: .172, cz: -.010, n: 2.9 },
    { y: .42, a: .296, b: .17, cz: -.006, n: 3.3 },
    { y: .475, a: .29, b: .158, cz: -.002, n: 3.2 },
    { y: .52, a: .246, b: .137, cz: .003, n: 2.6 },
    { y: .555, a: .165, b: .110, cz: .006, n: 2.2 },
    { y: .577, a: .104, b: .087, cz: .008, n: 2 },
    { y: .588, a: .076, b: .071, cz: .01, n: 2 }
  ];
  const tr = spline(torsoCtrl, hi ? 4 : 1).map(r => ({ y: r.y, rx: r.a, rz: r.b, cz: r.cz, n: r.n }));
  /* v: cloth from the hem, so the sweater's own centimetres (hem stripes, name, number, yoke) land where kits.js says */
  const backArc = [0]; for(let i = 1; i < tr.length; i++) backArc.push(backArc[i - 1] + Math.hypot(tr[i].y - tr[i - 1].y, (tr[i].rz + tr[i].cz) - (tr[i - 1].rz + tr[i - 1].cz)));
  const iSh = tr.reduce((bi, r, i) => Math.abs(r.y - .43) < Math.abs(tr[bi].y - .43) ? i : bi, 0);
  const hemI = tr.reduce((bi, r, i) => r.y < tr[bi].y ? i : bi, 0), cmAt = i => i <= hemI ? 0 : i <= iSh ? (backArc[i] - backArc[hemI])/(backArc[iSh] - backArc[hemI])*C.SHOULDER_CM : C.SHOULDER_CM + (backArc[i] - backArc[iSh])/(backArc[tr.length - 1] - backArc[iSh])*(C.PROF.total - C.SHOULDER_CM);
  /* u: round the body by arc length, the back and chest panels given more of the cloth so the number keeps its shape */
  const panel = f => f - .21/(4*PI)*Math.sin(4*PI*(f - .25));
  /* the cloth hangs: it blouses over the pants in rolls, drapes in long folds off the shoulder pads, gathers
     under the arms, and the hem flares a little and is never quite level */
  const torsoShape = (lx, ly, lz, th, i) => {
    const u = ((th - PI/2)/TAU % 1 + 1) % 1, r = tr[i], side = Math.min(Math.abs(u - 0), Math.abs(u - .5), Math.abs(u - 1));
    let d = 0, y = ly;
    const wv = ly/.046*PI + 1.7*Math.sin(u*TAU*3 + .7) + .8*Math.sin(u*TAU*7 + 2.1);
    d += .011*sst(-.245, -.2, ly)*sst(.06, -.04, ly)*(fold(wv) - .25);
    const dr = u*TAU*4.5 + 1.1*Math.sin(ly*9 + u*21) + .6*Math.sin(u*TAU*11);
    d += .0085*sst(.1, .24, ly)*sst(.41, .33, ly)*(.4 + .6*clamp(side/.1))*(fold(dr) - .3);
    /* the hem: out a little, and wavy */
    const hm = sst(-.19, -.246, ly);
    d += .012*hm;
    y += hm*(.007*Math.sin(u*TAU*3 + 1.3) + .004*Math.sin(u*TAU*7 + .4));
    const q = pushOut(lx, lz, 0, r.cz, d);
    return [q[0], q[1], y];
  };
  const torso = tube(A, tr, { seg: seg(hi ? 60 : 36), M: Mb[B.pel], th0: PI/2, shape: torsoShape,
    uv: (fu, fa, i) => R_TORSO(panel(fa), cmAt(i)/C.PROF.total),
    w: (x, y, z) => {
      const W = []; const sp = sst(-.06, .09, y), ch = sst(.1, .26, y), hm = .9*sst(.02, -.2, y);
      W.push([B.pel, (1 - sp)*(1 - hm)], [B.hem, (1 - sp)*hm], [B.spi, sp*(1 - ch)], [B.che, ch]);
      /* the hem drapes over the thighs: in a crouch they push the front of the sweater up and out */
      const f = sst(.03, -.2, y), wl = f*(.22 + .38*clamp(-z/.12));
      const wL = wl*clamp(.5 - x/.16), wR = wl*clamp(.5 + x/.16);
      if(wl > 0){ for(const w of W) w[1] *= 1 - wL - wR; W.push([B.th[0], wL], [B.th[1], wR]); }
      return W;
    } });
  /* the collar: a knit band round the neck, its edge rolled */
  tube(A, [{ y: .574, rx: .086, rz: .081, cz: .009 }, { y: .588, rx: .083, rz: .078, cz: .01 }, { y: .601, rx: .077, rz: .073, cz: .01 }, { y: .607, rx: .07, rz: .067, cz: .01 }, { y: .6, rx: .064, rz: .061, cz: .01 }],
    { seg: seg(28), M: Mb[B.pel], th0: PI/2, uv: () => swUV(SW.collar), w: () => [[B.che, 1]] });
  if(hi){
    /* laces at the throat (drawn only for a lace-up collar: the atlas leaves them see-through otherwise) */
    const fr = (cm, du) => {
      let i = 0; while(i < tr.length - 1 && cmAt(i + 1) < cm) i++;
      const ring = torso.fa[i]; let j = 0, best = 9;
      ring.forEach((f, jj) => { const dd = Math.abs(panel(f) - (.25 + du)); if(dd < best){ best = dd; j = jj; } });
      return torso.pts[i][j].clone().addScaledVector(torso.nrm[i][j], .004);
    };
    const tot = C.PROF.total;
    for(let k = 0; k < 3; k++){
      const c0 = tot - 2.5 - k*3.6, c1 = c0 - 3.2, w0 = .022*(1 - k*.22), w1 = .022*(1 - (k + 1)*.22);
      for(const s of [-1, 1]){
        const cv = new T3.CatmullRomCurve3([fr(c0, -s*w0), fr((c0 + c1)/2, 0), fr(c1, s*w1)]);
        part(A, new T3.TubeGeometry(cv, 6, .0028, 4, false), B.che, new T3.Matrix4(), new T3.Matrix4(), (u, v) => R_LACE(u, v));
      }
    }
    /* the fight strap: a short tab from inside the back of the hem down to the pants */
    part(A, blob(.011, .02, .0022, 2.6, 8, 6), B.pel, Mb[B.pel], mat4(0, -.252, .166, -.3), swUV(SW.black), 0, [[B.hem, .6], [B.pel, .4]]);
  }

  /* ---------------- neck and head ---------------- */
  const hd = Mb[B.hed], nk = Mb[B.nek];
  tube(A, [{ y: -.03, rx: .06, rz: .058 }, { y: .04, rx: .057, rz: .055 }, { y: .1, rx: .056, rz: .054 }, { y: .16, rx: .055, rz: .054 }], { seg: seg(12), M: nk, th0: PI/2,
    uv: () => R_FACE(.5, .03), w: (x, y) => y < .05 ? [[B.che, sst(.05, -.03, y)], [B.nek, 1 - sst(.05, -.03, y)]] : [[B.nek, 1 - sst(.08, .15, y)], [B.hed, sst(.08, .15, y)]] });
  const headCtrl = [
    { y: -.032, a: .018, b: .022, cz: -.052 }, { y: -.026, a: .036, b: .04, cz: -.05 }, { y: -.01, a: .054, b: .058, cz: -.043 },
    { y: .012, a: .066, b: .078, cz: -.031 }, { y: .04, a: .073, b: .094, cz: -.022 }, { y: .072, a: .077, b: .101, cz: -.017 },
    { y: .105, a: .078, b: .104, cz: -.017 }, { y: .14, a: .074, b: .1, cz: -.019 }, { y: .175, a: .06, b: .085, cz: -.02 },
    { y: .2, a: .034, b: .055, cz: -.02 }, { y: .209, a: .004, b: .006, cz: -.02 }
  ];
  const hr = spline(headCtrl, hi ? 3 : 1).map(r => ({ y: r.y, rx: r.a, rz: r.b, cz: r.cz, n: 2.15 }));
  const hY0 = -.032, hY1 = .209;
  /* two halves: the front is the face, painted; the back is hair under the helmet */
  for(const front of [true, false]){
    tube(A, hr, { seg: front ? (hi ? 22 : 6) : (hi ? 8 : 4), arc: .5, M: hd, th0: front ? PI/2 : 3*PI/2,
      shape: (lx, ly, lz, th) => {
        /* the face: flatter across the cheeks, a nose, the brow over set-in eyes, cheekbones, lips, a chin */
        const fr = Math.max(0, -Math.cos(th)), da = th - PI, g = gs;
        let dz = 0;
        dz -= .019*g(da, .13)*g(ly - .05, .02) + .008*g(da, .1)*g(ly - .075, .018);
        dz += .002*g(da, .05)*g(ly - .04, .01);
        dz -= .007*g(da, .55)*g(ly - .097, .011);
        dz += .006*(g(da - .4, .16) + g(da + .4, .16))*g(ly - .078, .012);
        dz -= .004*(g(da - .62, .2) + g(da + .62, .2))*g(ly - .055, .02);
        dz -= .003*g(da, .2)*g(ly - .019, .005) + .0025*g(da, .18)*g(ly - .009, .005);
        dz -= .006*g(da, .3)*g(ly + .02, .012);
        return [lx*(1 - .07*fr), lz + dz];
      },
      uv: (fu, fa, i, r) => front ? R_FACE(fu, (r.y - hY0)/(hY1 - hY0)) : R_FACE(.5, .985),
      w: () => [[B.hed, 1]] });
  }
  /* earlobes, under the ear guards */
  if(hi) for(const s of [-1, 1]) part(A, blob(.007, .013, .011, 2.2, 6, 5), B.hed, hd, mat4(s*.071, .013, .004, 0, 0, s*.15), (u, v) => R_FACE(s > 0 ? .03 : .97, .28));

  /* ---------------- the helmet: shell, rim, ear guards, visor, chin strap ---------------- */
  /* a modern shell (the shape of a Bauer or a CCM): squarer than an egg across and over the top, a ridge
     down the crown, two shells meeting down the sides, longer and flared at the back, the brow flared out
     over the visor */
  const hc = V(0, .09, -.014), HA = .108, HB = .132, HC = .135, NE = 2.6;
  const rimY = th => .07 - .045*Math.cos(th) + .006*Math.cos(2*th) - .008*Math.max(0, Math.cos(th))*Math.max(0, Math.cos(th));
  const helmAt = (u, v, k = 1, dy = 0) => {
    const th = PI/2 + u*TAU, st = Math.sin(th), ct = Math.cos(th), back = Math.max(0, ct), front = Math.max(0, -ct);
    const r0 = clamp((rimY(th) + dy - hc.y)/HB, -1, 1), phi0 = Math.asin(Math.sign(r0)*Math.pow(Math.abs(r0), NE/2)), phi = lerp(phi0, PI/2, v);
    const cp = se(Math.cos(phi), NE);
    /* the brow flares over the visor, the back flares into a lip over the neck, a step where the shells meet */
    const flare = 1 + .06*front*front*(1 - sst(0, .3, v)) + .012*(1 - sst(0, .12, v)) + .045*back*back*(1 - sst(0, .22, v));
    const seamU = Math.min(Math.abs(u - .06), Math.abs(u - .44)), step = .006*sst(.02, .0, seamU)*sst(.85, .6, v)*(Math.sin(th) > 0 ? 1 : 1);
    const x = HA*se(st, 2.7)*cp*(1 + .03*back)*flare*k*(1 + step), z = hc.z + HC*se(ct, 2.3)*cp*(1 + .035*back)*flare*k*(1 + step);
    /* the ridge down the crown and two lower ridges either side of it */
    const ridge = .007*Math.exp(-x*x/.0005)*sst(.15, .8, v) + .0025*(Math.exp(-Math.pow(Math.abs(x) - .042, 2)/.00008))*sst(.4, .85, v);
    return [x, hc.y + HB*se(Math.sin(phi), NE) + ridge, z];
  };
  surf(A, seg(40), hi ? 14 : 5, (u, v) => helmAt(u, v), hd, (u, v) => R_HELM(u, v), [[B.hed, 1]], hc);
  /* the rim: a rubber lip, turned under, and the black foam liner showing inside it */
  surf(A, seg(40), hi ? 2 : 1, (u, v) => helmAt(u, 0, 1 - .075*v, -.003 + .008*v), hd, () => swUV(SW.liner), [[B.hed, 1]], hc);
  if(hi){
    /* ear guards: a moulded cup with a lip, holes over the ear, the clip that holds them */
    for(const s of [-1, 1]){
      const uS = s > 0 ? .015 : .485;
      part(A, blob(.014, .041, .039, 2.8, 12, 9), B.hed, hd, mat4(s*.104, .046, -.004, 0, 0, s*.1), (u, v) => R_HELM(uS, .12));
      part(A, new T3.TorusGeometry(.036, .0035, 4, 14), B.hed, hd, mat4(s*.112, .046, -.004, 0, PI/2, 0, 1, 1.1, 1), (u, v) => R_HELM(uS, .14));
      for(const [dy, dz] of [[.012, 0], [-.004, .006], [-.004, -.006], [.004, .016], [.004, -.016]]) part(A, blob(.003, .0045, .0045, 2, 5, 4), B.hed, hd, mat4(s*.1185, .046 + dy, -.004 + dz), swUV(SW.earHole));
      /* the visor's clip at the temple, its screw */
      part(A, blob(.006, .016, .013, 2.6, 8, 6), B.hed, hd, mat4(s*.116, .088, -.07, 0, 0, s*.12), swUV(SW.black));
      part(A, new T3.CylinderGeometry(.0042, .0042, .004, 8), B.hed, hd, mat4(s*.1225, .088, -.07, 0, 0, PI/2), swUV(SW.rivet));
      /* the chin strap's buckle below the ear */
      part(A, blob(.008, .011, .004, 2.6, 6, 4), B.hed, hd, mat4(s*.088, .002, -.014, .2, 0, s*.25), swUV(SW.black));
    }
    /* chin strap and cup */
    const strap = new T3.CatmullRomCurve3([V(-.095, .035, -.012), V(-.086, .004, -.016), V(-.068, -.022, -.036), V(-.034, -.04, -.058), V(0, -.045, -.064), V(.034, -.04, -.058), V(.068, -.022, -.036), V(.086, .004, -.016), V(.095, .035, -.012)]);
    part(A, new T3.TubeGeometry(strap, 20, .0042, 4, false), B.hed, hd, mat4(0, 0, 0, 0, 0, 0, 1, 1, 1), swUV(SW.strap));
    part(A, blob(.021, .014, .011, 2.4, 10, 7), B.hed, hd, mat4(0, -.043, -.06, .5), swUV(SW.visEdge));
    /* the visor: clear, from the brow to the tip of the nose, wrapped round and bowed out a little */
    const vg = new T3.BufferGeometry(), vp = [], vn = [], vu = [], vi = [], N = 22, NR = 3;
    for(let i = 0; i <= NR; i++) for(let j = 0; j <= N; j++){
      const t = i/NR, th = lerp(PI - 1.34, PI + 1.34, j/N), y = lerp(.03, .118, t), out = 1 + .072*(1 - t) + .012*Math.sin(t*PI);
      const x = Math.sin(th)*(HA + .012)*out, z = hc.z + Math.cos(th)*(HC + .004)*out;
      vp.push(x, y, z); vn.push(Math.sin(th), .12*(1 - t), Math.cos(th)); vu.push(j/N, t);
    }
    for(let i = 0; i < NR; i++) for(let j = 0; j < N; j++){ const a = i*(N + 1) + j, b = a + 1, c = a + N + 2, d = a + N + 1; vi.push(a, c, b, a, d, c); }
    vg.setAttribute('position', new T3.Float32BufferAttribute(vp, 3)); vg.setAttribute('normal', new T3.Float32BufferAttribute(vn, 3)); vg.setAttribute('uv', new T3.Float32BufferAttribute(vu, 2)); vg.setIndex(vi);
    part(A, vg, B.hed, hd, new T3.Matrix4(), (u, v) => FX_VIS(u, v), 1);
    /* the visor's lower edge trim */
    const edge = new T3.CatmullRomCurve3([...Array(11)].map((_, j) => { const th = lerp(PI - 1.32, PI + 1.32, j/10); return V(Math.sin(th)*(HA + .012)*1.072, .031, hc.z + Math.cos(th)*(HC + .004)*1.072); }));
    part(A, new T3.TubeGeometry(edge, 20, .0024, 4, false), B.hed, hd, new T3.Matrix4(), swUV(SW.visEdge));
  }

  /* ---------------- arms: sleeves over shoulder caps and elbow pads, bunched at the elbow ---------------- */
  for(let i = 0; i < 2; i++){
    const s = i ? 1 : -1, bu = B.ua[i], bf = B.fa[i];
    const thU = thOf(bu, V(s, 0, 0)) - PI/2, thF = thOf(bf, V(s, 0, 0)) - PI/2;
    const up = spline([
      { y: -.072, r: .01 }, { y: -.064, r: .036 }, { y: -.042, r: .066 }, { y: -.012, r: .09 }, { y: .035, r: .095 }, { y: .1, r: .087 },
      { y: .18, r: .081 }, { y: .245, r: .08 }, { y: .29, r: .085 }, { y: .318, r: .087 }, { y: .345, r: .08 }
    ], hi ? 3 : 1).map(r => ({ y: r.y, rx: r.r, rz: r.r*.97 }));
    tube(A, up, { seg: seg(24), M: Mb[bu], th0: thU,
      shape: (lx, ly, lz, th) => {
        const e = sst(.2, .3, ly)*sst(.36, .33, ly), lng = sst(.0, .08, ly)*sst(.3, .2, ly);
        const d = .0055*e*(fold(ly/.019*PI + 1.5*Math.sin(th*2 + .4)) - .3) + .0035*lng*(fold(th*3 + 2.2*Math.sin(ly*14)) - .4);
        return pushOut(lx, lz, 0, 0, d);
      },
      uv: (fu, fa, k, r) => R_UPPER(fu, clamp(r.y/.33)),
      w: (x, y) => { const c = .45*sst(.01, -.075, y), e = .5*sst(.27, .345, y); return [[B.che, c], [bu, 1 - c - e], [bf, e]]; } });
    const fo = spline([
      { y: -.045, r: .076 }, { y: -.012, r: .088 }, { y: .02, r: .089 }, { y: .06, r: .082 }, { y: .12, r: .075 }, { y: .2, r: .068 }, { y: .24, r: .066 }, { y: .262, r: .065 }
    ], hi ? 3 : 1).map(r => ({ y: r.y, rx: r.r, rz: r.r*.95 }));
    tube(A, fo, { seg: seg(22), M: Mb[bf], th0: thF,
      shape: (lx, ly, lz, th) => {
        const e = sst(-.05, -.03, ly)*sst(.09, .04, ly), lng = sst(.06, .12, ly);
        const d = .006*e*(fold(ly/.021*PI + 1.3*Math.sin(th*2 + 1.1)) - .3) + .003*lng*(fold(th*2.5 + 1.8*Math.sin(ly*12)) - .4);
        return pushOut(lx, lz, 0, 0, d);
      },
      uv: (fu, fa, k, r) => R_FORE(fu, 1 - (FA - r.y)/.34),
      w: (x, y) => { const e = .5*sst(.03, -.04, y); return [[bu, e], [bf, 1 - e]]; } });
  }
  /* ---------------- gloves: fist round the shaft, segmented finger rolls, thumb, padded back, gauntlet ---------------- */
  const handUV = (u, v) => R_HAND(u, v);
  for(let i = 0; i < 2; i++){
    const bh = B.hd[i], Mh = Mb[bh], mz = i ? 1 : -1;   /* the left glove is the right one mirrored */
    const GS = 1.32, L = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new T3.Matrix4().makeScale(GS, GS, GS*mz).multiply(mat4(x, y, z, rx, ry, rz, sx, sy, sz));
    if(hi){
      /* the palm and the fist's core */
      part(A, blob(.05, .042, .043, 3.2, 12, 8), bh, Mh, L(0, -.006, -.006), handUV);
      /* the fingers: each two rolls, the far one round the shaft */
      for(let f = 0; f < 4; f++){
        const x = -.04 + f*.0265, r = .035 - (f === 0 ? .004 : 0) - (f === 3 ? .002 : 0);
        part(A, new T3.TorusGeometry(r, .0148, 6, 10, 1.75), bh, Mh, L(x, 0, 0, 0, PI/2, 0).multiply(mat4(0, 0, 0, 0, 0, -.25)), (u, v) => R_HAND(u*.5, v));
        part(A, new T3.TorusGeometry(r, .0138, 6, 8, 1.55), bh, Mh, L(x, 0, 0, 0, PI/2, 0).multiply(mat4(0, 0, 0, 0, 0, -.25 + 1.8)), (u, v) => R_HAND(.5 + u*.5, v));
      }
      /* the back of the hand: two padded rolls over the knuckles, then the backhand panel */
      part(A, blob(.054, .02, .016, 2.6, 10, 6), bh, Mh, L(0, -.026, -.04, .1), handUV);
      part(A, blob(.052, .022, .02, 3, 10, 6), bh, Mh, L(0, -.052, -.034, .16), handUV);
      part(A, blob(.048, .012, .006, 2.6, 8, 6), bh, Mh, L(0, -.04, -.057, .12), swUV(SW.palm));
      /* the thumb: two rolls along the shaft */
      part(A, blob(.03, .016, .017, 2.4, 10, 6), bh, Mh, L(.058, -.014, .027, 0, .15, .35), handUV);
      part(A, blob(.022, .014, .015, 2.4, 8, 6), bh, Mh, L(.086, -.002, .032, 0, .1, .2), handUV);
    } else part(A, blob(.06, .055, .05, 3, 8, 6), bh, Mh, L(0, -.02, 0), handUV);
    /* the gauntlet rides the forearm (the wrist bends inside it): wide and open over the end of the sleeve,
       a rolled edge, a band of the second colour, its end tucked into the fist */
    const bf = B.fa[i], Mf = Mb[bf], cw = (x, y) => { const h = .55*sst(FA - .03, FA + .04, y); return [[bf, 1 - h], [bh, h]]; };
    const g0 = FA - .158, g1 = FA + .045;
    const cuffR = [{ y: FA - .142, rx: .079, rz: .076 }, { y: FA - .158, rx: .09, rz: .087 }, { y: FA - .156, rx: .097, rz: .093 }, { y: FA - .146, rx: .098, rz: .094 },
      { y: FA - .112, rx: .094, rz: .09 }, { y: FA - .055, rx: .086, rz: .082 }, { y: FA - .005, rx: .076, rz: .073 }, { y: FA + .03, rx: .066, rz: .064 }, { y: FA + .045, rx: .053, rz: .051 }];
    tube(A, cuffR, { seg: seg(20), M: Mf, th0: 0,
      shape: (lx, ly, lz, th) => { const d = .0025*sst(FA - .1, FA - .14, ly)*Math.cos(th*3); return pushOut(lx, lz, 0, 0, d); },
      uv: (fu, fa, k, r) => R_CUFF(fu, clamp((r.y - g0)/(g1 - g0))), w: cw });
  }

  /* ---------------- hockey pants: a shell round the seat, two wide legs ---------------- */
  tube(A, spline([
    { y: .04, a: .2, b: .136, cz: .0 }, { y: -.03, a: .212, b: .145, cz: .004 }, { y: -.1, a: .218, b: .15, cz: .006 },
    { y: -.17, a: .216, b: .15, cz: .008 }, { y: -.215, a: .19, b: .135, cz: .008 }, { y: -.228, a: .03, b: .03, cz: .008 }
  ], hi ? 2 : 1).map(r => ({ y: r.y, rx: r.a, rz: r.b, cz: r.cz, n: 2.3 })).reverse(), { seg: seg(32), M: Mb[B.pel], th0: PI/2,
    uv: (fu, fa, i, r) => R_WAIST(fa, (r.y + .228)/.268),
    w: (x, y) => { const l = .35*sst(-.08, -.2, y)*clamp(Math.abs(x)/.08); return [[B.pel, 1 - l], [B.th[x < 0 ? 0 : 1], l]]; } });
  for(let i = 0; i < 2; i++){
    const s = i ? 1 : -1, bt = B.th[i], th0 = thOf(bt, V(s, 0, 0)) - PI/2, out = dirIn(bt, V(s, 0, 0)), fw = dirIn(bt, V(0, 0, -1));
    const legR = spline([
      { y: -.11, r: .086, o: .0 }, { y: -.05, r: .112, o: .004 }, { y: .02, r: .138, o: .013 }, { y: .1, r: .139, o: .017 }, { y: .18, r: .134, o: .017 },
      { y: .25, r: .129, o: .015 }, { y: .3, r: .127, o: .014 }, { y: .322, r: .124, o: .014 }, { y: .332, r: .117, o: .014 }, { y: .318, r: .108, o: .014 }
    ], hi ? 2 : 1);
    tube(A, legR.map(r => ({ y: r.y, rx: r.r, rz: r.r*1.04, cx: out.x*r.o + fw.x*.008, cz: out.z*r.o + fw.z*.008, n: 2.9 })), { seg: seg(26), M: Mb[bt], th0,
      shape: (lx, ly, lz, th, k) => { const r = legR[k]; const cx = out.x*r.o + fw.x*.008, cz = out.z*r.o + fw.z*.008;
        /* the padded panels bulge a little between their seams */
        const d = .003*Math.pow(Math.abs(Math.sin(th*2)), .7)*sst(-.06, .02, ly)*sst(.33, .29, ly); return pushOut(lx, lz, cx, cz, d); },
      uv: (fu, fa, k, r) => R_LEG(fu, 1 - (r.y + .11)/.44),
      /* the top of the leg stays with the hips (it is the same pair of breezers), so a high knee doesn't lever it out through the sweater */
      w: (x, y) => { const p = sst(.09, -.07, y); return [[B.pel, p], [bt, 1 - p]]; } });
  }
  /* ---------------- socks over shin guards: the kneecap forward, the shin's ridge ---------------- */
  for(let i = 0; i < 2; i++){
    const bs = B.sh[i], fw = dirIn(bs, V(0, 0, -1));
    const sk = spline([
      { y: -.18, r: .082, f: .0, d: 1 }, { y: -.1, r: .084, f: .0, d: 1 }, { y: -.05, r: .087, f: .007, d: 1.04 }, { y: -.01, r: .086, f: .018, d: 1.1 }, { y: .03, r: .08, f: .018, d: 1.12 },
      { y: .09, r: .071, f: .014, d: 1.11 }, { y: .18, r: .066, f: .012, d: 1.09 }, { y: .28, r: .061, f: .009, d: 1.07 }, { y: .36, r: .056, f: .005, d: 1.04 },
      { y: .43, r: .05, f: .0, d: 1 }
    ], hi ? 2 : 1);
    tube(A, sk.map(r => ({ y: r.y, rx: r.r, rz: r.r*r.d, cx: fw.x*r.f, cz: fw.z*r.f, n: 2.2 })), { seg: seg(20), M: Mb[bs], th0: thOf(bs, V(i ? 1 : -1, 0, 0)) - PI/2,
      uv: (fu, fa, k, r) => R_SOCK(fu, (.43 - r.y)/.61),
      w: (x, y) => { const t = sst(.03, -.07, y); return [[B.th[i], t], [bs, 1 - t]]; } });
  }
  /* ---------------- skates: boot, tongue, tendon guard, holder, steel ---------------- */
  for(let i = 0; i < 2; i++){
    const bf = B.ft[i], Mf = Mb[bf];
    const boot = [
      { y: -.062, w: .044, f: .148, b: .092, n: 2.7 }, { y: -.05, w: .049, f: .153, b: .097, n: 2.7 }, { y: -.03, w: .05, f: .151, b: .098, n: 2.6 },
      { y: -.012, w: .049, f: .138, b: .095, n: 2.5 }, { y: .004, w: .047, f: .11, b: .091, n: 2.35 }, { y: .02, w: .045, f: .083, b: .087, n: 2.2 },
      { y: .04, w: .045, f: .068, b: .085, n: 2.2 }, { y: .06, w: .047, f: .063, b: .083, n: 2.2 }, { y: .076, w: .05, f: .064, b: .085, n: 2.2 }, { y: .073, w: .046, f: .058, b: .079, n: 2.2 }
    ];
    const bootR = boot.map(r => ({ y: r.y, rx: r.w, rz: 1, n: r.n, f: r.f, b: r.b }));
    tube(A, bootR, { seg: seg(28), M: Mf, th0: PI/2,
      shape: (lx, ly, lz, th, k) => { const r = bootR[k], c = Math.cos(th), e = 2/r.n; return [lx, Math.sign(c)*Math.pow(Math.abs(c), e)*(c > 0 ? r.b : r.f) - .012]; },
      uv: (fu, fa, k) => R_BOOT(fu, clamp(k/(bootR.length - 2))), w: () => [[bf, 1]], cap0: true });
    if(hi){
      /* the quarter panel's trim, the tongue (felt, standing up out of the boot), the tendon guard */
      tube(A, [{ y: -.004, rx: 1, rz: 1 }, { y: .008, rx: 1, rz: 1 }], { seg: seg(28), M: Mf, th0: PI/2,
        shape: (lx, ly, lz, th) => { const r = ly < 0 ? bootR[4] : bootR[5], k = ly < 0 ? 0 : 1, c = Math.cos(th), e = 2/r.n, sc = 1.012, rb = lerp(.093, .088, k), rf = lerp(.118, .09, k);
          return [Math.sign(Math.sin(th))*Math.pow(Math.abs(Math.sin(th)), e)*r.rx*sc, Math.sign(c)*Math.pow(Math.abs(c), e)*(c > 0 ? rb : rf)*sc - .012]; },
        uv: () => swUV(SW.sole), w: () => [[bf, 1]] });
      part(A, blob(.036, .056, .01, 2.8, 10, 8), bf, Mf, mat4(0, .104, -.072, -.3), swUV(SW.tongue));
      part(A, blob(.031, .02, .012, 2.6, 8, 6), bf, Mf, mat4(0, .148, -.09, -.45), swUV(SW.black));
      part(A, blob(.021, .045, .008, 2.6, 8, 8), bf, Mf, mat4(0, .104, .073, .32), (u, v) => R_BOOT(.75, .92));
      /* the laces' bow, tucked at the top */
      part(A, blob(.014, .004, .01, 2.4, 6, 4), bf, Mf, mat4(0, .085, -.081, -.3), swUV(SW.white));
    }
    /* holder and runner, from side profiles */
    const hs = new T3.Shape();
    const hp = [[-.142, -.098], [.118, -.098], [.124, -.088], [.104, -.06], [.04, -.06], [.03, -.078], [-.05, -.08], [-.075, -.062], [-.13, -.06], [-.15, -.074]];
    hs.moveTo(hp[0][0], hp[0][1]); for(const q of hp.slice(1)) hs.lineTo(q[0], q[1]);
    const hg = new T3.ExtrudeGeometry(hs, { depth: .026, bevelEnabled: hi ? true : false, bevelThickness: .002, bevelSize: .0018, bevelSegments: 1, curveSegments: 2 });
    part(A, hg, bf, Mf, new T3.Matrix4().set(0, 0, 1, -.013, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1), swUV(SW.holder));
    const ss = new T3.Shape(), steel = [];
    for(let k = 0; k <= 12; k++){ const z = lerp(-.158, .138, k/12); steel.push([z, -ANK + .0036*Math.pow((z + .01)/.148, 2) + .012*Math.pow(sst(-.13, -.158, z), 1.5) + .005*sst(.12, .138, z)]); }
    ss.moveTo(steel[0][0], steel[0][1]); for(const q of steel.slice(1)) ss.lineTo(q[0], q[1]);
    ss.lineTo(.134, -.093); ss.lineTo(-.15, -.093); ss.closePath();
    part(A, new T3.ExtrudeGeometry(ss, { depth: .0048, bevelEnabled: false, curveSegments: 2 }), bf, Mf, new T3.Matrix4().set(0, 0, 1, -.0024, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1), swUV(SW.steel));
  }

  /* ---------------- the sticks: a left and a right, the unused one folded to nothing ---------------- */
  const KT = SL - .165;
  for(let v = 0; v < 2; v++){
    const bs = B.stk[v], Ms = Mb[bs], mzS = v ? -1 : 1;
    const along = y => .09 + .82*clamp(y/KT);
    const shaftR = (y0, y1, wx, wz) => tube(A, [{ y: y0, rx: wx, rz: wz, n: 4.5 }, { y: y1, rx: wx, rz: wz, n: 4.5 }], { seg: seg(12), M: Ms, th0: 0, uv: (fu, fa, k, r) => R_STICK(along(r.y), fu), w: () => [[bs, 1]] });
    tube(A, [{ y: .012, rx: .0115, rz: .0058, n: 3 }, { y: .045, rx: .0135, rz: .0085, n: 4 }, { y: .1, rx: .0148, rz: .0104, n: 4.5 }], { seg: seg(12), M: Ms, th0: 0, uv: (fu, fa, k, r) => R_STICK(along(r.y), fu), w: () => [[bs, 1]] });
    shaftR(.1, KT, .0148, .0104);
    /* the knob: tape wound thick at the end, in ridges */
    const knob = [{ y: KT, rx: .0152, rz: .0108, n: 3.6 }];
    if(hi) for(let k = 1; k <= 8; k++){ const y = KT + k*.0165, rr = k % 2 ? .0006 : 0; knob.push({ y: y - .008, rx: .0158 + rr, rz: .0114 + rr, n: 3.6 }, { y, rx: .0161 + rr, rz: .0117 + rr, n: 3.6 }); }
    knob.push({ y: SL - .03, rx: .0158, rz: .0114, n: 3.6 }, { y: SL - .016, rx: .0185, rz: .0145, n: 3 }, { y: SL - .004, rx: .018, rz: .014, n: 3 }, { y: SL, rx: .008, rz: .006, n: 2.4 });
    tube(A, knob, { seg: seg(12), M: Ms, th0: 0, uv: (fu, fa, k, r) => R_STICK(.91 + .09*clamp((r.y - KT)/(SL - KT)), fu), w: () => [[bs, 1]] });
    /* the blade: a side profile, extruded, bent round its curve and set at the lie; taped */
    const bs2 = new T3.Shape();
    const prof = [[-.012, .0], [BL - .03, .0], [BL - .01, .006], [BL, .02], [BL - .002, .045], [BL - .02, .066], [BL - .06, .072], [.12, .068], [.04, .062], [-.004, .058], [-.016, .05]];
    bs2.moveTo(prof[0][0], prof[0][1]); for(const q of prof.slice(1)) bs2.lineTo(q[0], q[1]); bs2.closePath();
    const bg = new T3.ExtrudeGeometry(bs2, { depth: .011, bevelEnabled: false, curveSegments: 3 });
    const bp = bg.attributes.position, buv = bg.attributes.uv;
    for(let k = 0; k < bp.count; k++){
      const a = bp.getX(k), h = bp.getY(k), z = bp.getZ(k) - .0055, th = clamp(a/BL);
      buv.setXY(k, clamp(a/BL), clamp(h/.072));
      const q = V().addScaledVector(BLADE_B, a).addScaledVector(BLADE_H, h); q.z = (z*(1 - .35*th) + curveAt(a))*mzS;
      bp.setXYZ(k, q.x, q.y, q.z);
    }
    bg.computeVertexNormals();
    part(A, bg, bs, Ms, new T3.Matrix4(), (u, w) => R_STICK(.004 + .082*u, w));
  }

  /* ---------------- on the ice: the shadows under him, the snow of a stop (all see-through) ---------------- */
  const I4 = new T3.Matrix4(), flat = mat4(0, 0, 0, -PI/2);
  part(A, new T3.PlaneGeometry(.98, 1.3), B.gnd, I4, flat, (u, v) => FX_BLOB(u, v), 1);
  for(let i = 0; i < 2; i++) part(A, new T3.PlaneGeometry(.19, .46), B.fs[i], I4, flat, (u, v) => FX_BLOB(u, v), 1);
  part(A, sprayGeo(hi ? 8 : 4, hi ? 6 : 3), B.spr, I4, I4, (u, v) => FX_SNOW(u, v), 1);
  return finish(A);
}
/* the snow off the blade in a stop, in the spray bone's space (out along -z, a metre long at full size):
   a low rooster tail that rises and falls, and a skirt of it along the ice */
function sprayGeo(na, nb){
  const p = [], uv = [], ix = [];
  const sheet = (fn) => {
    const o = p.length/3;
    for(let i = 0; i <= na; i++) for(let j = 0; j <= nb; j++){ const a = i/na, b = j/nb*2 - 1, q = fn(a, b); p.push(q[0], q[1], q[2]); uv.push((b + 1)/2, a); }
    for(let i = 0; i < na; i++) for(let j = 0; j < nb; j++){ const k = o + i*(nb + 1) + j; ix.push(k, k + nb + 1, k + 1, k + 1, k + nb + 1, k + nb + 2); }
  };
  sheet((a, b) => [b*(.08 + .4*a), (.01 + .19*Math.sin(Math.min(1, a*1.1)*PI*.85))*(1 - .6*b*b), -a]);
  sheet((a, b) => [b*(.14 + .6*a), .01 + .035*a*(1 - b*b), -a*.85]);
  const g = new T3.BufferGeometry();
  g.setAttribute('position', new T3.Float32BufferAttribute(p, 3)); g.setAttribute('uv', new T3.Float32BufferAttribute(uv, 2)); g.setIndex(ix);
  g.computeVertexNormals();
  /* lit from above like the ice (and lit from within: see the emissive map) */
  const n = g.attributes.normal; for(let k = 0; k < n.count; k++) n.setXYZ(k, 0, 1, 0);
  return g;
}
const se = (c, n) => Math.sign(c)*Math.pow(Math.abs(c), 2/n);
/* a surface from fn(u, v) -> [x, y, z] in a bone's space (u round and closed, v along), normals from the
   surface itself, facing away from `cen` */
function surf(A, nu, nv, fn, M, uvf, W, cen, grp = 0){
  const Nm = new T3.Matrix3().getNormalMatrix(M), P = [], idx = [], e = 1e-3;
  const at = (u, v) => V(...fn(u, v));
  for(let i = 0; i <= nv; i++) for(let j = 0; j <= nu; j++){
    const u = j/nu, v = i/nv, p = at(u, v);
    const du = at(u + e, v).sub(at(u - e, v)), dv = v < 1 ? at(u, Math.min(1, v + e)).sub(at(u, Math.max(0, v - e))) : p.clone().sub(at(u, v - e));
    let n = V().crossVectors(du, dv);
    if(n.lengthSq() < 1e-14) n.copy(p).sub(cen);
    n.normalize(); if(n.dot(V().subVectors(p, cen)) < 0) n.negate();
    const pw = p.clone().applyMatrix4(M), nw = n.applyMatrix3(Nm).normalize();
    idx.push(vert(A, pw, nw, uvf(u, v), W));
    P.push(pw);
  }
  /* wind each quad so its face looks the way its normal does */
  const out = grp ? A.iv : A.ib, row = nu + 1;
  for(let i = 0; i < nv; i++) for(let j = 0; j < nu; j++){
    const a = i*row + j, b = a + 1, c = a + row + 1, d = a + row;
    const n = V().crossVectors(V().subVectors(P[b], P[a]), V().subVectors(P[d], P[a]));
    const k = idx[a]*3, ok = n.x*A.n[k] + n.y*A.n[k + 1] + n.z*A.n[k + 2] >= 0;
    if(ok) out.push(idx[a], idx[b], idx[c], idx[a], idx[c], idx[d]); else out.push(idx[a], idx[c], idx[b], idx[a], idx[d], idx[c]);
  }
}
function finish(A){
  const g = new T3.BufferGeometry();
  g.setAttribute('position', new T3.Float32BufferAttribute(A.p, 3));
  g.setAttribute('normal', new T3.Float32BufferAttribute(A.n, 3));
  const uv = new T3.Float32BufferAttribute(A.uv, 2);
  g.setAttribute('uv', uv); g.setAttribute('uv2', uv);
  g.setAttribute('skinIndex', new T3.Uint16BufferAttribute(A.si, 4));
  g.setAttribute('skinWeight', new T3.Float32BufferAttribute(A.sw, 4));
  /* one draw: the see-through parts last, so they lie over the man and the ice */
  g.setIndex(A.ib.concat(A.iv));
  g.boundingSphere = new T3.Sphere(V(0, 1.1, 0), 2.7);
  g.boundingBox = new T3.Box3(V(-2, -.2, -2), V(2, 3.2, 2));
  return g;
}

/* ===================================== HIS LOOK ===================================== */
const SKINS = ['#efc4a0', '#dfa97f', '#c68a5e', '#a0673f', '#72462a'];
const HAIR = ['#2a1d14', '#4a3322', '#6b4a2b', '#b08a4c', '#17110c', '#7a4a26'];
const EYES = ['#4a3020', '#3b5b7a', '#5a6a3a', '#2c2018', '#6b8aa6'];
function lookOf(name, num){
  const h = seedOf(String(name) + '#' + num), h2 = seedOf(String(name));
  return { skin: SKINS[h2 % SKINS.length], hair: HAIR[(h >>> 3) % HAIR.length], beard: (h >>> 6) % 4, eyes: EYES[(h >>> 9) % EYES.length], seed: h2 % 100000 + 1,
    tape: (h >>> 12) & 1 ? '#f2f2ee' : '#17181a', knob: (h >>> 13) % 3 ? '#f2f2ee' : '#1a1a1a', shaft: ['#16181c', '#1e2228', '#e8ebee', '#2c3036', '#16181c'][(h >>> 15) % 5],
    accent: ['#c8202a', '#e8ebee', '#d8b23a', '#3d9bff', '#9aa3ab'][(h >>> 18) % 5], holder: (h >>> 21) & 1 ? '#eef0f2' : '#1b1c1f', boot: ['#141517', '#1c1d20', '#101113'][(h >>> 23) % 3] };
}
/* ONE material and one draw call per man (app/faceoff/skatertex.js): blended, so the see-through parts at
   the end of the index (the visor, his shadows on the ice, the snow of a stop) are see-through, while
   everything else is opaque and draws as before. His own shadow caster leaves out everything see-through. */
const manMat = (abbr, name, num) => TX.manMat(abbr, name, num, lookOf(name, num));

/* ===================================== A MAN =====================================
   S.pose(Pq) with Pq written for a left shot (see basePose). Returns { blade, Hh, hd }. */
function make(parent){
  if(!GEO) buildAll();
  const S = { root: new T3.Group(), hand: 'L', abbr: '', name: '', num: '' };
  (parent || C.world).add(S.root);
  const bones = [...Array(NB)].map(() => new T3.Bone());
  const skel = new T3.Skeleton(bones, INV.map(m => m.clone()));
  const mats0 = manMat('MTL', '', '');
  const mesh = new T3.SkinnedMesh(GEO.hi, mats0); mesh.customDepthMaterial = mats0.depth;
  /* after the ice (which is see-through), so the shadows and the snow land on it */
  mesh.renderOrder = 1;
  mesh.bindMode = 'detached'; mesh.bind(skel, new T3.Matrix4());
  mesh.castShadow = true; mesh.frustumCulled = true;
  S.root.add(mesh); S.mesh = mesh;
  const R = newRig();
  S.rig = R;
  S.setKit = function(abbr, name, num, hand){
    const mt = manMat(abbr, name, num); mesh.material = mt; mesh.customDepthMaterial = mt.depth;
    S.hand = hand === 'R' ? 'R' : 'L'; S.abbr = abbr; S.name = name; S.num = num;
    S.cur = null;
  };
  /* smoothing: everything eases to the new pose; a new source (match to shot) fades in slower */
  let last = 0, far = false;
  const wpos = V();
  S.pose = function(Pq){
    const now = performance.now()/1000, dt = last ? clamp(now - last, 0, .1) : 1; last = now;
    if(!S.cur || dt >= .5){ S.cur = clonePose(Pq); S.src = Pq.src; S.xf = 0; }
    if(Pq.src !== S.src){ S.src = Pq.src; S.xf = 1; }
    S.xf = Math.max(0, (S.xf || 0) - dt/.4);
    const rate = Pq.rate > 0 ? Pq.rate : 1e4, slowR = 7;
    const r = lerp(rate, slowR, ease(S.xf));
    blendPose(S.cur, Pq, 1 - Math.exp(-r*dt), 1 - Math.exp(-Math.max(r, 18)*dt*(1 - .6*ease(S.xf))));
    const m = S.hand === 'R' ? -1 : 1;
    const Pz = m < 0 ? mirrorPose(S.cur, S.mir || (S.mir = basePose())) : copyPose(S.cur, S.mir || (S.mir = basePose()));
    plant(S, Pz, Pq.plant || 0, dt);
    /* the whole man turned a little more than his root (a hockey stop holds its angle longer than the steering does) */
    const yx = Pq.yawX || 0; mesh.rotation.y = yx;
    hem(S, Pz, dt, yx);
    R.side = m;
    solve(R, Pz);
    for(let i = 0; i < NB; i++) bones[i].matrixWorld.copy(R.M[i]);
    /* far away, the light mesh */
    if(C.cam){
      S.root.getWorldPosition(wpos);
      const d = wpos.distanceTo(C.cam.position), want = far ? d > 8.5 : d > 9.5;
      if(want !== far){ far = want; mesh.geometry = far ? GEO.lo : GEO.hi; }
    }
    const hd = V(R.heel.x - Pz.Bt.x, 0, R.heel.z - Pz.Bt.z); if(hd.lengthSq() < 1e-6) hd.set(-1, 0, 0); hd.normalize();
    const out = { blade: R.blade.clone(), Hh: R.heel.clone(), hd };
    if(yx){ for(const v of [out.blade, out.Hh, out.hd]) v.applyAxisAngle(UPV, yx); }
    return out;
  };
  return S;
}
/* the hem of the sweater swings on a spring: it lags when he speeds up, swings on when he stops, and
   rocks with the stride */
const _hv = V(), _ha = V();
function hem(S, Pz, dt, yx){
  const H = S._hem || (S._hem = { p: V(), v: V(), x: 0, z: 0, vx: 0, vz: 0, on: false });
  const ry = S.root.rotation.y + yx, c = Math.cos(ry), s = Math.sin(ry), rp = S.root.position;
  /* where his hips are on the ice */
  _hv.set(rp.x + Pz.px*c + Pz.pz*s, 0, rp.z - Pz.px*s + Pz.pz*c);
  if(!H.on || dt <= 0 || dt > .2){ H.p.copy(_hv); H.v.set(0, 0, 0); H.on = true; Pz.hemX = H.x; Pz.hemZ = H.z; return; }
  _ha.subVectors(_hv, H.p).divideScalar(dt); H.p.copy(_hv);
  const ax = clamp((_ha.x - H.v.x)/dt, -40, 40), az = clamp((_ha.z - H.v.z)/dt, -40, 40); H.v.copy(_ha);
  /* into his own space: x his right, z his back */
  const bx = ax*c - az*s, bz = ax*s + az*c;
  const tx = clamp(.01*bz, -.12, .12), tz = clamp(-.01*bx, -.1, .1);
  const K = 70, D = 6.5, n = Math.max(1, Math.ceil(dt/.01)), h = dt/n;
  for(let i = 0; i < n; i++){
    H.vx += (K*(tx - H.x) - D*H.vx)*h; H.x += H.vx*h;
    H.vz += (K*(tz - H.z) - D*H.vz)*h; H.z += H.vz*h;
  }
  H.x = clamp(H.x, -.14, .14); H.z = clamp(H.z, -.12, .12);
  Pz.hemX = H.x; Pz.hemZ = H.z;
}
/* feet stay where they are on the ice while he stands: a foot steps only once it is too far from
   where the stance wants it, one foot at a time, lifted */
function plant(S, Pz, w, dt){
  const st = S.pl || (S.pl = [{ a: null, yaw: 0, step: 0, from: V(), fy: 0 }, { a: null, yaw: 0, step: 0, from: V(), fy: 0 }]);
  const root = S.root, ry = root.rotation.y, c = Math.cos(ry), s = Math.sin(ry), rp = root.position;
  const toW = (p, o) => o.set(rp.x + p.x*c + p.z*s, 0, rp.z - p.x*s + p.z*c);
  const toL = (p, o) => { const dx = p.x - rp.x, dz = p.z - rp.z; return o.set(dx*c - dz*s, 0, dx*s + dz*c); };
  const want = [V(), V()];
  for(let i = 0; i < 2; i++){
    const f = Pz.feet[i], P = st[i];
    toW(f.p, want[i]);
    if(w < .5 || !P.a){ P.a = want[i].clone(); P.yaw = f.yaw + ry; P.step = 0; continue; }
  }
  if(w < .5) return;
  for(let i = 0; i < 2; i++){
    const f = Pz.feet[i], P = st[i], o = st[1 - i];
    if(P.step > 0){
      P.step = Math.min(1, P.step + dt/.22);
      const e = ease(P.step);
      if(P.step >= 1){ P.step = 0; P.a.copy(want[i]); P.yaw = f.yaw + ry; }
      else {
        const pos = V().lerpVectors(P.from, want[i], e), lift = .06*Math.sin(PI*e);
        toL(pos, f.p); f.p.y = lift; f.yaw = lerp(P.fy, f.yaw + ry, e) - ry; continue;
      }
    }
    const off = P.a.distanceTo(want[i]), dyaw = Math.abs(Math.atan2(Math.sin(f.yaw + ry - P.yaw), Math.cos(f.yaw + ry - P.yaw)));
    if((off > .17 || dyaw > .45) && o.step === 0){ P.step = .001; P.from.copy(P.a); P.fy = P.yaw; }
    toL(P.a, f.p); f.p.y = 0; f.yaw = P.yaw - ry;
  }
}

/* ===================================== POSES ===================================== */
function foot(x = 0, z = 0, yaw = 0){ return { p: V(x, 0, z), yaw, zr: 0, pitch: 0, push: -1 }; }
function basePose(){
  return { px: 0, py: .87, pz: .11, lean: -.64, twist: 0, roll: 0, hipYaw: 0, hipRoll: 0, look: 0, headYaw: 0, gap: .47,
    free: 0, freeTop: 0, fr: V(-.25, -.42, -.1), frTop: V(.25, -.42, -.1), Hh: V(-.36, 0, -.92), Bt: V(.16, .9, .03),
    feet: [foot(-.18, -.03, .2), foot(.18, .05, -.2)], rate: 12, plant: 0, src: 'match', noStick: false,
    spr: 0, sprP: V(), sprA: 0, sprL: 1, yawX: 0, hemX: 0, hemZ: 0 };
}
const NUMS = ['px', 'py', 'pz', 'lean', 'twist', 'roll', 'hipYaw', 'hipRoll', 'look', 'headYaw', 'gap', 'free', 'freeTop'];
function clonePose(Pq){ return copyPose(Pq, basePose()); }
function copyPose(Pq, o){
  for(const k of NUMS) o[k] = Pq[k];
  o.fr.copy(Pq.fr); o.frTop.copy(Pq.frTop); o.Hh.copy(Pq.Hh); o.Bt.copy(Pq.Bt); o.noStick = Pq.noStick;
  for(let i = 0; i < 2; i++){ const a = o.feet[i], b = Pq.feet[i]; a.p.copy(b.p); a.yaw = b.yaw; a.zr = b.zr; a.pitch = b.pitch; a.push = b.push; }
  fxCopy(Pq, o);
  return o;
}
/* the snow and the hem aren't eased: they come straight from what he does */
function fxCopy(a, o){ o.spr = a.spr; o.sprP.copy(a.sprP); o.sprA = a.sprA; o.sprL = a.sprL; o.yawX = a.yawX; o.hemX = a.hemX; o.hemZ = a.hemZ; }
function blendPose(c, t, k, kf){
  for(const key of NUMS) c[key] += (t[key] - c[key])*k;
  c.fr.lerp(t.fr, k); c.frTop.lerp(t.frTop, k); c.noStick = t.noStick; fxCopy(t, c);
  c.Hh.lerp(t.Hh, k); c.Bt.lerp(t.Bt, k);
  const d = V().subVectors(c.Bt, c.Hh); if(d.lengthSq() < 1e-6) d.subVectors(t.Bt, t.Hh); c.Bt.copy(c.Hh).addScaledVector(d.normalize(), SL);
  for(let i = 0; i < 2; i++){ const a = c.feet[i], b = t.feet[i]; a.p.lerp(b.p, kf); a.yaw += (b.yaw - a.yaw)*kf; a.zr += (b.zr - a.zr)*kf; a.pitch += (b.pitch - a.pitch)*kf; a.push = b.push; }
}
function mirrorPose(a, o){
  for(const k of NUMS) o[k] = a[k];
  o.px = -a.px; o.twist = -a.twist; o.roll = -a.roll; o.hipYaw = -a.hipYaw; o.hipRoll = -a.hipRoll; o.headYaw = -a.headYaw;
  /* top and bottom hand keep their jobs (the rig knows which hand is on top); only their spots mirror */
  o.fr.set(-a.fr.x, a.fr.y, a.fr.z); o.frTop.set(-a.frTop.x, a.frTop.y, a.frTop.z);
  o.Hh.set(-a.Hh.x, a.Hh.y, a.Hh.z); o.Bt.set(-a.Bt.x, a.Bt.y, a.Bt.z); o.noStick = a.noStick;
  for(let i = 0; i < 2; i++){ const f = a.feet[1 - i], g = o.feet[i]; g.p.set(-f.p.x, f.p.y, f.p.z); g.yaw = -f.yaw; g.zr = -f.zr; g.pitch = f.pitch; g.push = f.push; }
  fxCopy(a, o); o.sprP.x = -a.sprP.x; o.sprA = -a.sprA;
  return o;
}
/* the stick: the heel at `heel`, the shaft up through Q (his hands), no steeper than the lie allows while
   the blade is on the ice, so it lies flat */
const _d = V();
function stickTo(Pq, heel, Q, flat = true){
  _d.subVectors(Q, heel); const h = Math.hypot(_d.x, _d.z);
  if(flat && heel.y < .03){ const mx = h*Math.tan(PI - LIE - .02); if(_d.y > mx) _d.y = mx; }
  Pq.Hh.copy(heel); Pq.Bt.copy(heel).addScaledVector(_d.normalize(), SL);
}
/* held from the knob end: the top hand at `hand`, the stick pointing `dir` from it to the blade */
function stickFromHand(Pq, hand, dir){
  const d = _d.copy(dir).normalize();
  Pq.Bt.copy(hand).addScaledVector(d, -.055); Pq.Hh.copy(Pq.Bt).addScaledVector(d, SL);
}

/* ---------- the legs ---------- */
/* a forward stride, one leg, p its phase: set down under the hip, glide, push out and back on the inside
   edge, flick the toe, recover low under the body. k > 0 this leg crosses over (outside leg of a turn),
   k < 0 it pushes under (inside leg) */
function legFwd(s, p, a, k, o, v = 0){
  /* v: accelerating hard from slow: the toes turned out in a V, short quick pushes to the side, little glide */
  const xs = .11 + .04*v, xo = .16 + .44*a + .1*v, zb = (.06 + .38*a)*(1 - .6*v), zf = -.04 - .1*a + .04*v, lift = .03 + .075*a + .02*v;
  const over = Math.max(0, k), under = Math.max(0, -k);
  const x0 = lerp(lerp(xs, -.06, over), .27, under), x1 = lerp(xo + .05*over, -.16, under);
  const outMax = (.2 + .5*a)*(1 - .7*under) + .5*v;
  let x, z, y = 0, out, roll = 0, pitch = 0, push = -1;
  if(p < .14){ const q = p/.14; x = x0; z = lerp(zf, zf + .05, q); out = .07; roll = .1*a*q*(1 - 2*under); }
  else if(p < .6){
    const q = (p - .14)/.46, e = ease(q);
    x = lerp(x0, x1, e); z = lerp(zf + .05, zb*(1 - .45*under), Math.pow(q, 1.25)); out = lerp(.07, outMax, e);
    roll = (.34*a*(1 - 2*under))*Math.sin(PI*Math.min(1, q*1.15)) + .1*a*(1 - q)*(1 - 2*under); pitch = .42*a*sst(.7, 1, q); push = q;
  } else {
    const q = (p - .6)/.4;
    x = lerp(x1, x0, 1 - Math.pow(1 - q, 2.2)); z = lerp(zb*(1 - .45*under), zf, ease(q));
    y = (lift + .06*over)*Math.sin(PI*Math.min(1, q*1.1)); out = lerp(outMax, .07, ease(q)); pitch = .42*a*(1 - sst(0, .45, q)) - .1*a*Math.sin(PI*q);
  }
  o.p.set(s*x, y, z); o.yaw = -s*out; o.zr = s*roll; o.pitch = pitch; o.push = push;
  return o;
}
/* backwards: C-cuts, the heel pushed out and round in front, then the skate drawn back under the hip */
function legBack(s, p, a, o){
  const xs = .14, xo = .17 + .2*a, zf = -.24*a;
  let x, z, y = 0, out = 0, roll = 0;
  if(p < .55){ const q = p/.55, sn = Math.sin(PI*q); x = xs + (xo - xs)*sn; z = zf*ease(q); out = -(.12 + .42*a)*sn; roll = .3*a*sn; }
  else { const q = (p - .55)/.45; x = xs; z = zf*(1 - ease(q)); y = .012*a*Math.sin(PI*q); out = .04*Math.sin(PI*q); }
  o.p.set(s*x, y, z); o.yaw = -s*out; o.zr = s*roll; o.pitch = 0; o.push = p < .55 ? p/.55 : -1;
  return o;
}
function mixFoot(a, b, t){ a.p.lerp(b.p, t); a.yaw = lerp(a.yaw, b.yaw, t); a.zr = lerp(a.zr, b.zr, t); a.pitch = lerp(a.pitch, b.pitch, t); if(t > .5) a.push = b.push; return a; }
const FT = [...Array(12)].map(() => foot());
const setFoot = (f, x, z, yaw, y = 0) => { f.p.set(x, y, z); f.yaw = yaw; f.zr = 0; f.pitch = 0; f.push = -1; return f; };

/* everything below the waist and the trunk's rhythm, from how he is moving */
function gait(s, Pq, dt, o){
  const sp = o.speed, a = o.a, bk = o.bk, gl = o.gl, ks = o.ks, cr = o.cr, ph = s.gph, acc = o.acc || 0, bank = o.bank || 0;
  const stand = clamp(1 - (sp - .35)/1.2);
  for(let i = 0; i < 2; i++){
    const si = i ? 1 : -1, p = frac(ph + (i ? .5 : 0));
    const F = legFwd(si, p, Math.max(a, .55*acc), cr*si, FT[i], acc*(1 - stand*.7)), Bk = legBack(si, p, a, FT[2 + i]);
    mixFoot(F, Bk, bk);
    const G = setFoot(FT[4 + i], si*.115, i ? .1 : -.08, -si*.05);
    mixFoot(F, G, gl);
    const St = setFoot(FT[6 + i], si*.185, i ? .05 : -.03, -si*.2);
    mixFoot(F, St, stand);
    const f = Pq.feet[i]; f.p.copy(F.p); f.yaw = F.yaw; f.zr = F.zr; f.pitch = F.pitch; f.push = F.push;
  }
  const sw = Math.sin(TAU*ph), mv = (1 - stand)*(1 - gl);
  /* the weight over the gliding skate: the hips go side to side with the stride, a little up and down */
  Pq.px = -.05*a*sw*(1 - bk)*mv;
  Pq.py = lerp(.87, .855 - .075*a, 1 - stand) + .02*a*mv*Math.cos(2*TAU*(ph - .08)) - .03*gl - .05*bk*(1 - stand) - .04*acc;
  Pq.lean = lerp(-.64, -.62 - .3*a, (1 - stand)*(1 - bk)) + .06*gl + .3*bk*(1 - stand) - .2*acc;
  Pq.pz = lerp(.11, .07, 1 - stand)*(1 - bk) + .03*bk - .02*gl + .04*acc;
  Pq.hipYaw = .12*a*sw*(1 - bk)*mv; Pq.twist = -.07*a*sw*mv*(1 + .6*acc);
  Pq.roll = .05*a*sw*mv; Pq.hipRoll = 0;
  /* the free arm swings with the opposite leg, harder when he drives */
  Pq.fr.set(-.25 - .05*sw*a, -.4 + .04*Math.abs(sw)*a + .06*acc, -.1 + (.24*a + .14*acc)*sw*(1 - bk));
  /* a turn: the whole man leans in from the skates up, the hips inside the feet, both blades on edge */
  if(bank){
    const b = bank;
    Pq.px -= Math.sin(b)*.6; Pq.py -= (1 - Math.cos(b))*.3;
    Pq.hipRoll += b*.75; Pq.roll += b*.9; Pq.headYaw += b*.25; Pq.twist += b*.18;
    for(const f of Pq.feet) f.zr += b*.85;
  }
  /* a hockey stop: both skates turned across the way he was going and dug in on their edges (the leading
     skate on its inside edge, out at the end of a long leg; the trailing one on its outside edge, under him,
     the knee deep), the hips low and back from the skates, the shoulders still turned to where he was going.
     ks: how far into it, dl: the way he was going, in his own space */
  if(ks > 0 && o.dl){
    const tx = o.dl.x, tz = o.dl.z, e = ks;
    let nx = -tz, nz = tx; if(nz > 0){ nx = -nx; nz = -nz; }
    const yaw = Math.atan2(-nx, -nz), lead = tx > 0 ? 1 : 0, edge = tx*Math.cos(yaw) - tz*Math.sin(yaw);
    for(let i = 0; i < 2; i++){
      const L = i === lead, f = Pq.feet[i], tg = FT[8 + i], si = i ? 1 : -1;
      const along = L ? .46 : .04, fw = L ? .02 : -.07;
      setFoot(tg, tx*along + nx*fw + si*.02, tz*along + nz*fw, yaw);
      tg.zr = edge*(L ? .62 : .44); tg.push = L ? .5 : -1;
      mixFoot(f, tg, e);
      if(e > .5){ f.yaw = tg.yaw; }
    }
    Pq.px = lerp(Pq.px, -tx*.11, e); Pq.pz = lerp(Pq.pz, .1 - tz*.1, e); Pq.py = lerp(Pq.py, .7 + .03*o.sOut, e);
    Pq.lean = lerp(Pq.lean, -.42 - tz*.22, e); Pq.roll = lerp(Pq.roll, tx*.36, e); Pq.hipRoll = lerp(Pq.hipRoll, tx*.22, e);
    Pq.hipYaw = lerp(Pq.hipYaw, 0, e); Pq.twist = lerp(Pq.twist, -tx*.5, e); Pq.headYaw = -tx*.32*e; Pq.look = lerp(Pq.look, .06, e);
    Pq.fr.set(lerp(-.25, -.42, e), lerp(-.4, -.2, e), lerp(-.1, -.26, e));
    /* the snow: off the leading blade, the way he was going, longer as he slides */
    const lf = Pq.feet[lead];
    Pq.spr = e*o.sAmt; Pq.sprA = Math.atan2(-tx, -tz); Pq.sprL = o.sLen;
    Pq.sprP.set(lf.p.x + tx*.05, 0, lf.p.z + tz*.05);
  }
}

/* ---------- the match ---------- */
/* the hockey stop's own clock: starts when rink3d.js flags a stop, holds while he slides, lets go */
function stopOf(s, T, sp){
  const O = s._sto || (s._sto = { t0: -99, dx: 0, dz: -1, side: 0, v0: 0, pk: 0 }), k = s.stopK || 0;
  if(!O.fixed && k > .8 && O.pk <= .8){
    const v = Math.hypot(s.vx || 0, s.vz || 0);
    if(v > .3){ O.dx = s.vx/v; O.dz = s.vz/v; } else { const h = s.root.rotation.y; O.dx = -Math.sin(h); O.dz = -Math.cos(h); }
    O.t0 = T; O.side = s.stopSide || 1; O.v0 = Math.max(sp, 3);
  }
  O.pk = k;
  const t = T - O.t0, hold = .26 + .3*clamp(O.v0/7);
  O.e = t < 0 || t > 3 ? 0 : sst(0, .12, t)*(1 - sst(hold, hold + .4, t));
  O.t = t;
  return O;
}
const scratch = new WeakMap();
const PQ = s => { let o = scratch.get(s); if(!o){ o = basePose(); scratch.set(s, o); } return o; };
function reset(Pq){ const b = BASE; for(const k of NUMS) Pq[k] = b[k]; Pq.fr.copy(b.fr); Pq.frTop.copy(b.frTop); Pq.rate = 12; Pq.plant = 0; Pq.src = 'match'; Pq.noStick = false; Pq.spr = 0; Pq.yawX = 0; return Pq; }
const BASE = basePose();
const _v1 = V(), _v2 = V(), _v3 = V();
/* the puck carrier's soft hands: the blade rocks forehand to backhand in a figure eight, head up */
function handle(Pq, t, a, seed){
  const w = TAU*(1.9 - .8*a)*t + seed, sx = Math.sin(w);
  _v1.set(-.3 + .24*sx, 0, -1.0 + .07*Math.sin(2*w) - .05*a);
  _v2.set(.13 + .07*sx, .8, -.2 + .03*Math.sin(2*w));
  stickTo(Pq, _v1, _v2); Pq.gap = .46; Pq.look = .3; Pq.twist += -.1*sx; Pq.headYaw = .06*sx;
}
function readyStick(Pq, t, seed, x = 0){
  _v1.set(-.36 + x + .03*Math.sin(t*1.3 + seed), 0, -1.04); _v2.set(.12, .8, -.24); stickTo(Pq, _v1, _v2); Pq.gap = .45;
}
function matchPose(s, t, now, reduced){
  const T = now/1000, dt = clamp(T - (s._lt || T), 0, .1); s._lt = T;
  const m = s.hand === 'R' ? -1 : 1, sp = s.speed || 0, seed = s.seed || 0;
  s.gph = (s.gph || Math.random()) + dt*(s.back ? .78 + .1*sp : .7 + .12*sp + .7*clamp(((s.acc1 || 0) - 1.5)/6)*clamp((5.5 - sp)/2.5));
  s._bk = lerp(s._bk || 0, s.back ? 1 : 0, 1 - Math.exp(-dt*5));
  const Pq = reset(PQ(s));
  const gl = s.glide || 0, ksR = s.stopK ? ease(Math.min(1, s.stopK*1.5)) : 0;
  /* the hockey stop: rink3d.js flags it (stopK) and turns him by 1.15*ksR; a real one holds longer and turns
     him further, so the body keeps its own clock and the mesh takes the difference */
  const so = stopOf(s, T, sp), ks = so.e;
  Pq.yawX = (so.side || 0)*(1.32*ks - 1.15*ksR);
  const a = clamp(sp/6.8)*(1 - .8*gl)*(1 - ks);
  const cr = (1 - s._bk)*clamp((s.turn || 0)/2.2, -1, 1)*clamp((sp - 2)/2.5)*m*(1 - ks);
  /* the way he was going, in his own (left-shot) space, for the stop */
  let dl = null;
  if(ks > 0){
    const ry = s.root.rotation.y + Pq.yawX, c = Math.cos(ry), sn = Math.sin(ry);
    dl = _v3.set((so.dx*c - so.dz*sn)*m, 0, so.dx*sn + so.dz*c);
  }
  gait(s, Pq, dt, { speed: sp, a, bk: s._bk, gl, ks, cr, dl, sAmt: clamp(.3 + sp/4.5)*(1 - sst(.5, .9, so.t)), sLen: .5 + .75*sst(0, .4, so.t), sOut: sst(.3, .7, so.t),
    acc: clamp(((s.acc1 || 0) - 1.5)/6)*clamp((5.5 - sp)/2.5)*(1 - s._bk), bank: (1 - s._bk)*(1 - ks)*clamp(Math.atan(sp*(s.turn || 0)/9.8), -.62, .62)*m });
  Pq.plant = sp < .5 && ks < .04 && s.mode !== 'cele' ? 1 : 0;
  const k = (now - (s.t0 || 0))/1000;
  /* one hand on the stick when he flies without the puck, the other arm swinging */
  const oneHand = clamp((a - .45)/.3)*(s.mode === 'carry' || s.mode === 'pass' || s.mode === 'recv' ? 0 : 1);
  readyStick(Pq, t, seed);
  const mode = s.mode;
  if(mode === 'carry'){
    handle(Pq, t, a, seed);
    const cu = (now - (s.cushT || 0))/320;
    if(cu < 1){ const c = Math.sin(cu*PI)*(1 - cu*.4); Pq.Hh.z += .26*c; Pq.Hh.x -= .08*c; Pq.Bt.z += .2*c; Pq.twist += .08*c; Pq.rate = 22; }
  } else if(mode === 'recv'){
    /* the blade out on the ice to take it, square to the pass, soft */
    _v1.set(-.5, 0, -1.02); _v2.set(.1, .78, -.14); stickTo(Pq, _v1, _v2); Pq.twist += .12; Pq.lean -= .05; Pq.look = .2; Pq.gap = .5;
  } else if(mode === 'pass'){
    const q = clamp(k/.42), sau = s.saucer ? 1 : 0;
    /* the target's bearing in his own space */
    let ang = 0; if(s.passAt){ const dx = s.passAt.x - s.x, dz = s.passAt.z - s.z, ry = s.root.rotation.y; ang = clamp(Math.atan2(-(dx*Math.cos(ry) - dz*Math.sin(ry)), -(dx*Math.sin(ry) + dz*Math.cos(ry)))*m, -.9, .9); }
    const L1 = V(-.62, 0, -.42), L2 = V(Math.sin(ang)*-1.12 - .1, .02 + .3*sau*sst(.5, 1, q), -Math.cos(ang)*1.12);
    if(q < .4){ const l = ease(q/.4); _v1.lerpVectors(V(-.3, 0, -.9), L1, l); _v2.set(.1, .78, -.04); Pq.twist += .3*l; Pq.px -= .05*l; }
    else { const l = ease((q - .4)/.6); _v1.lerpVectors(L1, L2, l); _v1.y = Math.max(0, L2.y*sst(.5, 1, l)); _v2.set(lerp(.1, .22, l), lerp(.78, .86 + .1*sau, l), lerp(-.04, -.14, l)); Pq.twist += lerp(.3, -.32 + .3*ang, l); Pq.px += lerp(-.05, .05, l); Pq.lean -= .05*l; }
    stickTo(Pq, _v1, _v2, _v1.y < .01); Pq.rate = 26; Pq.look = .2;
  } else if(mode === 'lunge'){
    const l = ease(clamp(k/.25));
    _v1.set(lerp(-.4, -1.0, l), 0, lerp(-.9, -1.3, l)); _v2.set(.2, .7, -.2); stickTo(Pq, _v1, _v2);
    Pq.free = l; Pq.fr.set(-.3, -.25, .05); Pq.lean -= .3*l; Pq.py -= .1*l; Pq.twist += .25*l; Pq.rate = 20;
  } else if(mode === 'faceoff' || mode === 'draw'){
    const d = mode === 'draw' ? ease(clamp(k/.28)) : 0;
    /* the crouch: feet wide and staggered, bent over the dot, head up, the bottom hand low down the shaft */
    Pq.pz = lerp(.34, .12, d); Pq.py = lerp(.76, .86, d); Pq.lean = lerp(-1.02, -.7, d); Pq.look = lerp(.66, .35, d); Pq.twist = .35*d;
    setFoot(Pq.feet[0], -.36, lerp(.44, .2, d), .32); setFoot(Pq.feet[1], .34, lerp(.3, .12, d), -.26);
    Pq.feet[0].zr = -.08; Pq.feet[1].zr = .08;
    _v1.set(lerp(.02 + .015*Math.sin(t*9 + seed), -.52, d), 0, lerp(-.6, -.18, d));
    _v2.set(lerp(.2, .14, d), lerp(.6, .7, d), lerp(.16, .1, d)); stickTo(Pq, _v1, _v2); Pq.gap = lerp(.62, .5, d);
    Pq.plant = 1; Pq.rate = mode === 'draw' ? 24 : 8;
  } else if(mode === 'sad'){
    /* head down, the stick in one hand, dragging */
    _v1.set(-.25, 0, -.75); stickFromHand(Pq, V(.2, .9, -.12), _v2.subVectors(_v1, V(.2, .9, -.12)));
    Pq.free = 1; Pq.fr.set(-.22, -.5, -.02); Pq.lean = lerp(Pq.lean, -.3, .8); Pq.look = -.5; Pq.rate = 6;
  } else if(mode === 'cele' || mode === 'join'){
    cele(Pq, k, mode === 'join', seed, reduced);
  } else if(s.follow){
    /* defending: down in his stance, the stick out in the lane; skating backwards it is one-handed and long */
    _v1.set(-.5 + .05*Math.sin(t*2.1 + seed), 0, -1.1); _v2.set(.14, .76, -.12); stickTo(Pq, _v1, _v2); Pq.lean -= .06; Pq.py -= .03; Pq.look = .2;
    const one = Math.max(oneHand, s._bk*clamp(sp/1.5));
    if(one > 0){ Pq.free = one; Pq.fr.set(-.3, -.32, -.18); _v1.set(-.35, 0, -1.25); stickTo(Pq, _v1, V(.18, .82, -.1)); }
  } else {
    /* ready, a tap of the stick now and then: give it here */
    const tp = frac(t*.23 + seed*.37);
    if(tp < .07 && sp < 1){ const u = Math.sin(tp/.07*PI); Pq.Hh.y += .09*u; Pq.Hh.x -= .03*u; }
    if(oneHand > 0){ Pq.free = oneHand; _v1.set(-.32, .02, -1.05); stickTo(Pq, _v1, V(.2, .86, -.04), false); }
    if(sp < .8) idle(s, Pq, t, dt, seed, 1 - clamp((sp - .3)/.5), mode === 'idle' && !Pq.free);
  }
  if(mode !== 'idle' || sp > .3 || s.follow) s._idle = 0;
  if(s.mode !== 'faceoff' && s.mode !== 'draw' && oneHand > 0 && !Pq.free && mode !== 'carry'){ Pq.free = oneHand; }
  return Pq;
}
/* standing about: every man his own way of standing (how wide, how deep, where the stick is), the weight
   going from skate to skate, the head turning to follow things, a breath; and after a while stood still,
   some lean on the stick across their knees, as men do between whistles */
function idle(s, Pq, t, dt, seed, w, still){
  if(w <= 0) return;
  s._idle = (s._idle || 0) + dt;
  const h = seedOf('idle' + Math.round(seed*1e3)), style = h % 4, k = (h >>> 3) % 1000/1000;
  /* 0 the usual, 1 tall and easy, 2 low and wide like a defenceman, 3 the usual and a leaner */
  const wide = [1, .9, 1.16, 1.04][style], deep = [0, -.05, .05, .015][style] + .02*k;
  for(const f of Pq.feet){ f.p.x *= lerp(1, wide, w); f.yaw *= lerp(1, .8 + .5*k, w); }
  Pq.py -= deep*w; Pq.lean += (style === 2 ? -.1 : style === 1 ? .16 : 0)*w;
  /* weight shifts, a breath, the head */
  const sh = Math.sin(t*(.42 + .2*k) + seed*3)*Math.sin(t*.17 + seed);
  Pq.px += .045*sh*w; Pq.hipRoll += -.05*sh*w; Pq.roll += -.03*sh*w;
  Pq.lean += .018*Math.sin(t*1.7 + seed)*w;
  Pq.headYaw += (.34*Math.sin(t*.31 + seed*5)*Math.sin(t*.11 + seed*2) + .12*Math.sin(t*.9 + seed))*w;
  Pq.look += .06*Math.sin(t*.23 + seed*4)*w;
  if(style === 2){ _v1.set(-.42, 0, -.82); _v2.set(.14, .84, -.12); stickTo(Pq, _v1, _v2); }
  if(style === 1){ Pq.Hh.x -= .08*w; Pq.Hh.z -= .1*w; }
  /* resting on the stick, across the knees */
  const r = still && (style === 3 || style === 0 && k > .6) ? sst(4, 5.2, s._idle) : 0;
  if(r > 0){
    const H0 = Pq.Hh.clone(), B0 = Pq.Bt.clone();
    stickFromHand(Pq, _v1.set(.22, .6, -.36), _v2.set(-1, -.05, -.06));
    Pq.Hh.lerpVectors(H0, Pq.Hh, r); Pq.Bt.lerpVectors(B0, Pq.Bt, r);
    Pq.lean = lerp(Pq.lean, -1.18, r); Pq.py = lerp(Pq.py, .84, r); Pq.pz = lerp(Pq.pz, .15, r); Pq.look = lerp(Pq.look, .62, r); Pq.gap = lerp(Pq.gap, .5, r);
    Pq.rate = 4;
  }
}
/* the goal: the stick held up high, a fist pumped, gliding on one skate. A team-mate arriving: stick
   up, an arm out for him */
function cele(Pq, k, join, seed, reduced){
  const c = ease(clamp(k/.35));
  const pump = reduced || join ? 0 : Math.max(0, Math.sin(Math.max(0, k - .35)*7.5));
  const hand = V(lerp(.2, .3, c), lerp(.9, join ? 1.7 : 2.02, c), lerp(-.05, -.12, c));
  const dir = V(join ? .5 : .28, join ? .55 : .92, join ? -.4 : .25);
  if(c > .02){
    const H0 = Pq.Hh.clone(), B0 = Pq.Bt.clone();
    stickFromHand(Pq, hand, dir);
    Pq.Hh.lerpVectors(H0, Pq.Hh, c); Pq.Bt.lerpVectors(B0, Pq.Bt, c);
  }
  Pq.free = c; Pq.fr.set(join ? -.3 : -.2, join ? .1 : lerp(.08, -.22, pump), join ? -.42 : -.26);
  Pq.lean = lerp(Pq.lean, join ? -.3 : -.12, c); Pq.look = .25*c; Pq.twist = lerp(Pq.twist, join ? .1 : -.1, c);
  if(!join && c > .5){ const g = ease(clamp((k - .5)/.4)); Pq.feet[0].p.lerp(V(-.18, .14, .42), g); Pq.feet[0].pitch = .5*g; Pq.feet[1].p.lerp(V(.06, 0, -.04), g); Pq.py = lerp(Pq.py, .92, g); }
  Pq.rate = 10; Pq.plant = 0;
}

/* ---------- the shot (the shootout, and every shot in a match), a function of u ---------- */
function shotPose(S, u, t, idle, o){
  const K = o.K, now = performance.now()/1000, dt = clamp(now - (S._st || now), 0, .1); S._st = now;
  const Pq = reset(PQ(S)); Pq.src = 'shot'; Pq.rate = 0;
  const seed = seedOf(String(S.name) + S.num);
  const kind = o.kind === 'one' ? 'one' : o.kind === 'brk' || (o.kind == null || o.kind === '') && (seed & 4) ? 'snap' : 'wrist';
  if(idle){
    /* at the line, waiting: stance, the puck on his blade */
    gait(S, Pq, dt, { speed: 0, a: 0, bk: 0, gl: 0, ks: 0, cr: 0 });
    handle(Pq, t*.6, 0, seed); Pq.rate = 8; Pq.src = 'shot';
    return Pq;
  }
  const uD = K.deke, uL = K.load, uS = K.sweep, uR = K.shot;
  /* skating in, then a glide into his shooting stance */
  const a = clamp((u - K.go)/.04)*(1 - sst(.28, .42, u))*.95;
  S.gph = (S.gph || 0) + dt*(.7 + .12*6.5*a);
  gait(S, Pq, dt, { speed: 1.5 + 5*a, a, bk: 0, gl: sst(.3, .42, u)*(1 - sst(uD, uL, u)), ks: 0, cr: 0 });
  /* the stance: back skate (left) turned out, front skate at the net */
  const one = kind === 'one', st = sst(uD + (one ? 0 : .08), uL + .01, u);
  const back = setFoot(FT[10], one ? -.32 : -.27, one ? .22 : .17, one ? .7 : .55), front = setFoot(FT[11], one ? .17 : .13, one ? -.26 : -.2, one ? -.14 : -.05);
  back.zr = -.12; front.zr = .06;
  mixFoot(Pq.feet[0], back, st); mixFoot(Pq.feet[1], front, st);
  Pq.look = .2;
  /* the hands */
  const H = _v1, Q = _v2, LH0 = kind === 'snap' ? V(-.48, 0, -.62) : V(-.66, 0, -.4);
  if(u < uD || (one && u < uD)){
    handle(Pq, t, a, seed);
  } else if(u < uL && !one){
    /* the deke: forehand, across to the backhand, back */
    const d = (u - uD)/(uL - uD), sx = Math.sin(TAU*d)*(1 - .3*d), amp = kind === 'snap' ? .38 : .5;
    H.set(-.3 + amp*sx, 0, -.86 - .1*Math.sin(PI*d)); Q.set(.12 + .08*sx, .8, -.06);
    const L = sst(.75, 1, d); H.lerp(LH0, L*.6);
    stickTo(Pq, H, Q); Pq.twist += -.18*sx + .114*L; Pq.headYaw = -.05*sx; Pq.px -= .024*L;
  }
  if(!one && u >= uL){
    const LH = LH0, LQ = V(.06, .74, -.02);
    const EH = V(-.12, 0, -1.04), EQ = V(.2, .8, .03);
    /* where the deke left the stick */
    const DH = V(-.3, 0, -.86).lerp(LH, .6), DQ = V(.12, .8, -.06);
    /* the weight: loaded onto the back skate with the puck, then through onto the front one, the front knee
       driving down and the chest over it as the stick whips through */
    if(u < uS){ const l = ease((u - uL)/(uS - uL)); H.lerpVectors(DH, LH, l); Q.lerpVectors(DQ, LQ, l); Pq.twist += lerp(.38*.3, .38, l); Pq.px += lerp(-.08*.3, -.13, l); Pq.pz += .05*l; Pq.hipYaw += .12*l; Pq.roll += .06*l; Pq.lean -= .08*l; }
    else if(u < uR){ const r = Math.pow((u - uS)/(uR - uS), 1.4); H.lerpVectors(LH, EH, r); Q.lerpVectors(LQ, EQ, r); Pq.twist += lerp(.38, -.15, r); Pq.px += lerp(-.13, .08, r); Pq.pz += lerp(.05, -.07, r); Pq.hipYaw += lerp(.12, -.1, r); Pq.roll += lerp(.06, -.08, r); Pq.py -= .05*r; Pq.lean -= .1 + .06*r; }
    else {
      const f = ease(clamp((u - uR)/.07)), rel = sst(uR + .1, .92, u), hi = o.high ? 1 : 0;
      H.lerpVectors(EH, V(-.02, (kind === 'snap' ? .18 : .28) + .4*hi, -1.42), f).lerp(V(-.36, 0, -.9), rel);
      Q.lerpVectors(EQ, V(.26, .95 + .1*hi, -.12), f).lerp(V(.12, .8, -.08), rel);
      Pq.twist += lerp(-.15, -.38, f)*(1 - rel); Pq.px += .09*(1 - rel); Pq.pz -= .07*(1 - rel); Pq.hipYaw -= .14*(1 - rel); Pq.roll -= .08*(1 - rel); Pq.py -= .05*(1 - rel); Pq.lean = lerp(Pq.lean, -.56, f*(1 - rel));
      /* the back leg comes off the ice in the follow-through */
      const lb = f*(1 - rel); Pq.feet[0].p.lerp(V(-.3, .13, .42), lb); Pq.feet[0].pitch = .5*lb;
    }
    stickTo(Pq, H, Q, H.y < .01);
  }
  if(one && u >= uD){
    /* the one-timer: wind up high, down through the ice an inch behind the puck, finish high */
    const wB = V(.12, .96, -.28), wD = V(-.62, .5, .62).normalize();
    const iH = V(-.2, 0, -.9), iQ = V(.08, .7, -.18);
    if(u < uS){
      const w = ease(clamp((u - uD)/(uS - uD - .02)));
      stickTo(Pq, V(-.32, 0, -.9), V(.12, .8, -.06));
      const H0 = Pq.Hh.clone(), B0 = Pq.Bt.clone();
      stickFromHand(Pq, wB, wD);
      Pq.Hh.lerpVectors(H0, Pq.Hh, w); Pq.Bt.lerpVectors(B0, Pq.Bt, w);
      Pq.twist += .62*w; Pq.px -= .09*w; Pq.lean -= .05*w; Pq.gap = lerp(.46, .58, w);
    } else {
      const r = clamp((u - uS)/(uR - uS)), f = ease(clamp((u - uR)/.08)), rel = sst(uR + .12, .93, u);
      const Bw = V().copy(wB).addScaledVector(wD, -.055), Hw = Bw.clone().addScaledVector(wD, SL);
      stickTo(Pq, iH, iQ); const Hi = Pq.Hh.clone(), Bi = Pq.Bt.clone();
      if(u < uR){
        /* down through an arc: the knob leads, the blade follows */
        const e = r*r;
        Pq.Bt.lerpVectors(Bw, Bi, Math.sqrt(r)); const dir = V().subVectors(Hw, Bw).normalize().lerp(V().subVectors(Hi, Bi).normalize(), e).normalize();
        Pq.Hh.copy(Pq.Bt).addScaledVector(dir, SL); if(Pq.Hh.y < 0){ Pq.Bt.y -= Pq.Hh.y; Pq.Hh.y = 0; }
        Pq.twist += lerp(.62, -.1, e); Pq.px += lerp(-.09, .04, e);
      } else {
        stickFromHand(Pq, V(.3, 1.08, -.38), V(-.1, -.55, -1).lerp(V(-.6, -1, -.4), rel));
        if(f < 1){ const H1 = Pq.Hh.clone(), B1 = Pq.Bt.clone(); Pq.Hh.lerpVectors(Hi, H1, f); Pq.Bt.lerpVectors(Bi, B1, f); }
        if(rel > 0){ const H1 = Pq.Hh.clone(), B1 = Pq.Bt.clone(); stickTo(Pq, V(-.36, 0, -.9), V(.12, .8, -.08)); Pq.Hh.lerpVectors(H1, Pq.Hh, rel); Pq.Bt.lerpVectors(B1, Pq.Bt, rel); }
        Pq.twist += lerp(-.1, -.55, f)*(1 - rel); Pq.px += .06*(1 - rel); Pq.lean = lerp(Pq.lean, -.45, f*(1 - rel));
        const lb = f*(1 - rel); Pq.feet[0].p.lerp(V(-.36, .1, .45), lb); Pq.feet[0].pitch = .55*lb;
      }
      Pq.gap = .58;
    }
  }
  /* scored: up it goes */
  if(o.scored && u > .76){ cele(Pq, (u - .76)*o.DUR/1000, false, seed, o.reduced); Pq.rate = 10; }
  return Pq;
}
/* the sweater room: stood up, the stick resting on the ice, one hand on the knob */
function showPose(S, t){
  const Pq = reset(PQ(S)); Pq.src = 'show'; Pq.rate = 8;
  setFoot(Pq.feet[0], -.17, -.02, .22); setFoot(Pq.feet[1], .17, .04, -.22);
  Pq.py = 1.02; Pq.lean = -.14; Pq.twist = .05*Math.sin(t*.8); Pq.look = .05;
  stickFromHand(Pq, V(.23, .95 + .01*Math.sin(t*1.3), -.2), V(-.5, -.93, -.35));
  Pq.free = 1; Pq.fr.set(-.27, -.5, -.03);
  return Pq;
}

/* ===================================== THE LAB =====================================
   server/lab-skaters.html: one man, every motion, the camera round him. */
const MOTIONS = {
  ready: { len: 8 }, stride: { len: 4 }, sprint: { len: 4 }, glide: { len: 4 }, crossL: { len: 6 }, crossR: { len: 6 }, back: { len: 4 },
  stop: { len: 3.2 }, start: { len: 3 }, handle: { len: 4 }, carry: { len: 4 }, recv: { len: 2 }, pass: { len: 1.8 }, saucer: { len: 1.8 },
  wrist: { len: 3.6 }, snap: { len: 3.6 }, one: { len: 3.6 }, faceoff: { len: 3.2 }, defend: { len: 4 }, lunge: { len: 1.6 }, cele: { len: 3.4 }, join: { len: 3 }, sad: { len: 3 }, show: { len: 4 }
};
const lab = { kit: 'MTL', name: 'SUZUKI', num: 14, hand: 'R', motion: 'stride', t: 0, ts: 1, pause: false, cam: 'orbit', ang: 2.4, dist: 3.4, h: 1.0, cycle: false, auto: true, at: null, scored: true, high: false };
const labS = { x: 0, z: 0, vx: 0, vz: 0, head: 0, speed: 0, turn: 0, back: false, glide: 0, stopK: 0, stopSide: 1, mode: 'idle', t0: 0, seed: 1.3, cushT: -1e9, follow: null, gph: 0 };
function labSet(S, o){
  const kitChanged = ['kit', 'name', 'num', 'hand'].some(k => o[k] != null && o[k] !== lab[k]);
  Object.assign(lab, o);
  if(o.motion || o.t != null) lab.lt = 0;
  if(kitChanged || !S.abbr) S.setKit(lab.kit, lab.name, lab.num, lab.hand);
}
function labStep(S, t, dt, X){
  if(!S.abbr) S.setKit(lab.kit, lab.name, lab.num, lab.hand);
  const mo = MOTIONS[lab.motion] ? lab.motion : 'ready', len = MOTIONS[mo].len;
  if(lab.at != null){ lab.t = lab.at; }
  else if(!lab.pause) lab.t += dt*lab.ts;
  if(lab.cycle && lab.t > len*2){ const ks = Object.keys(MOTIONS); lab.motion = ks[(ks.indexOf(mo) + 1) % ks.length]; lab.t = 0; }
  const lt = lab.t % len, cyc = Math.floor(lab.t/len);
  const s = labS; s.root = S.root; s.hand = S.hand;
  const ZC = X.ZC;
  /* where he is: skating moves go up and down the ice, turns go round a circle */
  let x = 0, z = ZC + .62, head = 0, speed = 0, turn = 0, back = false, glide = 0, mode = 'idle', follow = null;
  const lin = (v) => { z = ZC + 7 - frac(lab.t*v/16)*16; };
  const T = lab.t, now = T*1000;
  if(mo === 'stride' || mo === 'carry'){ speed = 4.2; lin(speed); if(mo === 'carry') mode = 'carry'; }
  else if(mo === 'sprint'){ speed = 7.6; lin(speed); }
  else if(mo === 'glide'){ speed = 4; lin(speed); glide = 1; }
  else if(mo === 'back' || mo === 'defend'){ speed = mo === 'back' ? 3.6 : 2.6; z = ZC - 7 + frac(T*speed/16)*16; back = true; if(mo === 'defend') follow = { press: true }; }
  /* events at fixed moments of each loop, so a frozen frame (at) shows the same thing every time */
  const c0 = (T - lt)*1000;
  if(mo !== 'stop') s._sto = null;
  if(mo === 'stop'){
    if(lt < 1.5){ speed = 6.5; z = ZC + 5 - lt*6.5; s.stopK = 0; }
    else { const k2 = Math.min(lt - 1.5, .46); speed = Math.max(0, 6.5 - (lt - 1.5)*14); z = ZC + 5 - 1.5*6.5 - (6.5*k2 - 7*k2*k2); s.stopK = Math.max(0, 1 - (lt - 1.5)*2.3); s.stopSide = cyc % 2 ? -1 : 1; }
    /* the stop's clock from the loop, so a frozen moment shows the same thing every time */
    s._sto = { fixed: true, t0: T - lt + 1.5, dx: 0, dz: -1, side: cyc % 2 ? -1 : 1, v0: 6.5, pk: 1 };
  }
  else if(mo === 'start'){
    /* from a standstill: hard, short strides, then into a full stride */
    const ta = Math.max(0, lt - .4); speed = Math.min(7.2, ta*5); z = ZC + 5 - (ta < 1.44 ? 2.5*ta*ta : 5.18 + (ta - 1.44)*7.2);
    s.acc1 = lt > .4 && speed < 7.1 ? 9 : 0;
  }
  else if(mo === 'handle') mode = 'carry';
  else if(mo === 'recv'){ mode = lt < 1 ? 'recv' : 'carry'; s.cushT = c0 + 1000; }
  else if(mo === 'pass' || mo === 'saucer'){ mode = lt < .6 ? 'carry' : 'pass'; s.t0 = c0 + 600; s.saucer = mo === 'saucer'; s.passAt = { x: -3, z: ZC - 6 }; }
  else if(mo === 'faceoff'){ mode = lt < 2.2 ? 'faceoff' : 'draw'; s.t0 = c0 + 2200; }
  else if(mo === 'lunge'){ mode = 'lunge'; s.t0 = c0; }
  else if(mo === 'cele' || mo === 'join'){ mode = mo; speed = mo === 'cele' ? 3 : 2; lin(speed); s.t0 = c0; }
  else if(mo === 'sad'){ mode = 'sad'; speed = 1.4; lin(speed); }
  else if(mo === 'crossL' || mo === 'crossR'){ speed = 6; const R0 = 3.4, w = speed/R0, sg = mo === 'crossL' ? 1 : -1, a = T*w*sg; x = -sg*R0 + sg*R0*Math.cos(a); z = ZC - R0*Math.sin(a)*sg*sg; head = a; turn = w*sg; }
  /* velocity from the motion, as the match's steering would give it */
  const pv = s._p || { x, z }, vdt = Math.max(1e-3, dt*lab.ts);
  s.vx = lab.at != null ? 0 : (x - pv.x)/vdt; s.vz = lab.at != null ? 0 : (z - pv.z)/vdt; s._p = { x, z };
  if(Math.hypot(s.vx, s.vz) > 30 || lab.at != null){ s.vx = -Math.sin(head)*speed*(back ? -1 : 1); s.vz = -Math.cos(head)*speed*(back ? -1 : 1); }
  if(mo !== 'stop') s.stopK = 0;
  Object.assign(s, { x, z, head, speed, turn, back, glide, mode, follow });
  const ks = s.stopK ? ease(Math.min(1, s.stopK*1.5)) : 0;
  S.root.position.set(x, 0, z); S.root.rotation.y = head + (s.stopSide || 0)*1.15*ks;
  let Pq;
  if(mo === 'wrist' || mo === 'snap' || mo === 'one'){
    const u = clamp(lt/len*1.05);
    const r0 = X.rootAt ? null : null;
    S.root.position.set(0, 0, ZC + 4 - 4*ease(clamp((u - X.K.go)/(X.K.shot - X.K.go))) - 1.2*clamp((u - X.K.shot)/.3));
    S.gph = T*1.3; S._st = performance.now()/1000;
    Pq = shotPose(S, u, T, false, { K: X.K, DUR: len*1000, scored: lab.scored, kind: mo === 'one' ? 'one' : mo === 'snap' ? 'brk' : 'wrist', high: lab.high });
    lab.u = u;
  }
  else if(mo === 'show') Pq = showPose(S, T);
  else {
    s._lt = T; s._bk = back ? 1 : 0; s.gph = T*(back ? .78 + .1*speed : .7 + .12*speed) + .13; s.seed = lab.seed != null ? +lab.seed : 1.3;
    if(mo === 'start') s.gph = lt*1.5 + .13; else s.acc1 = 0;
    if(mo === 'ready') s._idle = lt;
    Pq = matchPose(s, T, now, false);
  }
  if(lab.at != null) Pq.rate = 0;
  const r = S.pose(Pq);
  lab.root = S.root.position; lab.S = S; lab.len = len;
  return S.root.localToWorld(r.blade.clone());
}
/* the lab's camera: round him, or one of the fixed looks */
const FOCUS = { gloveT: [.62, .1, 2.6], gloveB: [.62, .1, 2.9], skate: [.75, .12, 2.2], head: [.62, .02, 2.8], face: [.55, -.06, 2.85], knee: [.9, .1, 2.0] };
function labCam(cam, key, dt){
  const p = lab.root || V(0, 0, 27.75);
  const F = FOCUS[lab.cam], S = lab.S;
  if(F && S){
    const R = S.rig, top = R.side > 0 ? 1 : 0;
    const bone = { gloveT: B.hd[top], gloveB: B.hd[1 - top], skate: B.ft[1], head: B.hed, face: B.hed, knee: B.sh[1] }[lab.cam];
    const tg = S.root.localToWorld(V().setFromMatrixPosition(R.M[bone]));
    const ang = S.root.rotation.y + F[2] + (lab.spin || 0), D = F[0]*(lab.zoom || 1);
    cam.position.set(tg.x + Math.sin(ang)*D, tg.y + F[1] + D*.25, tg.z + Math.cos(ang)*D); cam.lookAt(tg);
    if(Math.abs(cam.fov - 34) > .01){ cam.fov = 34; cam.updateProjectionMatrix(); }
    key.target.position.set(p.x, 0, p.z); key.position.set(p.x + 2.5, 16, p.z + 10); key.target.updateMatrixWorld();
    return;
  }
  const C0 = { orbit: [null, 3.4, 1.05, .95], front: [PI, 3.2, 1.1, .95], back: [0, 3.2, 1.2, 1.0], side: [PI/2, 3.4, 1.0, .9], left: [-PI/2, 3.4, 1.0, .9], three: [2.4, 3.1, 1.15, .95],
    face: [2.75, .95, 1.75, 1.72], hands: [2.3, 1.5, 1.0, .75], feet: [2.2, 1.5, .35, .18], low: [2.5, 3.0, .35, .8], tv: [.35, 14, 6.5, .6], top: [.2, 6, 6.5, .5] }[lab.cam] || [null, 3.4, 1.05, .95];
  if(C0[0] == null){ if(!lab.pause && lab.auto) lab.ang += dt*.35; }
  const ang = C0[0] == null ? lab.ang : C0[0] + (lab.spin || 0), D = C0[1]*(lab.zoom || 1), hy = C0[2], ly = C0[3];
  cam.position.set(p.x + Math.sin(ang)*D, hy, p.z + Math.cos(ang)*D); cam.lookAt(p.x, ly, p.z);
  const fov = lab.fov || 34; if(Math.abs(cam.fov - fov) > .01){ cam.fov = fov; cam.updateProjectionMatrix(); }
  key.target.position.set(p.x, 0, p.z); key.position.set(p.x + 2.5, 16, p.z + 10); key.target.updateMatrixWorld();
}

return {
  make, matchPose, shotPose, showPose, SL,
  labSet, labStep, labCam, lab, MOTIONS: Object.keys(MOTIONS),
  geo: () => GEO, lookOf, texMemory: () => TX.memory()
};
};
})();
