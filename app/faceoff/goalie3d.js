/* PUCK · the goalie in 3D (three.js r128, global THREE, no modules).

   ONE SkinnedMesh per goalie, one material, one draw call: every piece of gear
   (pads, trapper, blocker, chest and arms under the sweater, pants, mask and
   cage, skates, stick) is built procedurally from smooth lofted shapes and
   merged into a single geometry skinned to 18 bones. The colours come from one
   painted atlas per goalie (sweater, sleeves, pad faces, mask art, blocker
   board, glove cuff, T-trap laces) times vertex colours, and a small shared
   roughness/metalness atlas tells leather from cloth from fibreglass from steel.

   P.goalie3d(ctx) -> { makeGoalie, goaliePose, trackGoalie }
     ctx.parent   the Object3D the goalies live in (the rink's world)
     ctx.puck     the puck mesh (tracking, where he looks)
     ctx.K        the shot's timeline (go, load, shot, hit, end in 0..1)
     ctx.shot()   { guess, spot, scored, id } of the shot being played
     ctx.aniso    texture anisotropy

   Frames. The goalie faces +z, his left (glove side) is +x, y is up, the
   origin is on the ice under him. Every bone is a direct child of the mesh,
   posed in that frame each time: a bone's +y runs along it (hip to knee, knee
   to ankle, wrist to fingertips) and its +z is its "front" (the pad's face,
   the pocket of the glove, the blocker's board, the blade's face).

   r128 note: the rink renders twice a frame (the reflection, then the ice)
   with one info.reset(), so the renderer would refresh a skeleton once and
   draw the second pass with the mirrored bones. skeleton.frame is pinned to
   -1 so every render refreshes it (cheap: 18 bones). */
(function(){
const P = window.PUCK = window.PUCK || {};

P.goalie3d = function(ctx){
const THREE = window.THREE;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const lerp = (a, b, t) => a + (b - a)*t, clamp = (t, a = 0, b = 1) => t < a ? a : t > b ? b : t;
const ease = t => t*t*(3 - 2*t), easeOut = t => 1 - Math.pow(1 - t, 3), easeIn = t => t*t*t;
const smooth = (a, b, x) => ease(clamp((x - a)/(b - a)));
const sgnpow = (v, p) => Math.sign(v)*Math.pow(Math.abs(v), p);
const K0 = { go: .05, deke: .40, load: .58, sweep: .64, shot: .664, hit: .72, end: .9 };
const timeline = () => ctx.K || K0;            /* read late: the rink declares its timeline after the cast */
const shotOf = ctx.shot || (() => ({ guess: 'fh', spot: 'fh', scored: false, id: 0 }));

/* ===================================== BODY ===================================== */
const B = { pel: 0, spine: 1, chest: 2, head: 3, uaR: 4, faR: 5, hR: 6, uaL: 7, faL: 8, hL: 9, trap: 10, thR: 11, shR: 12, ftR: 13, thL: 14, shL: 15, ftL: 16, stick: 17 };
const NB = 18;
const L = { thigh: .45, shin: .47, ua: .32, fa: .28, spine: .12, chest: .15, neck: .42, hipX: .105, hipY: -.06, shX: .205, shY: .255, ankle: .125, grip: .72 };
const BLADE_LIE = 125*Math.PI/180;          /* angle between the blade (heel to toe) and the shaft */
const GRIP = V(.0, .075, -.035);            /* where the shaft runs through the blocker hand, in hand space */
const TRAP = V(.03, .17, .03);              /* the pocket, in glove-hand space */

function quatFrame(y, zh){ const m = new THREE.Matrix4(); frameM(m, V(), y, zh); return new THREE.Quaternion().setFromRotationMatrix(m); }
const _x = V(), _y = V(), _z = V();
function frameM(m, o, y, zh){
  _y.copy(y).normalize(); _z.copy(zh).addScaledVector(_y, -zh.dot(_y));
  if(_z.lengthSq() < 1e-8){ _z.set(0, 0, 1).addScaledVector(_y, -_y.z); if(_z.lengthSq() < 1e-8) _z.set(1, 0, 0).addScaledVector(_y, -_y.x); }
  _z.normalize(); _x.crossVectors(_y, _z);
  m.makeBasis(_x, _y, _z); m.setPosition(o); return m;
}
const qE = v => new THREE.Quaternion().setFromEuler(new THREE.Euler(v.x, v.y, v.z, 'YXZ'));
/* the stick in the blocker hand: shaft from the pinky side to the thumb side, the blade's face with the board's */
const Q_HS = quatFrame(V(-.72, .66, -.05), V(0, 0, 1));
const Q_HS_INV = Q_HS.clone().invert();
function ik2(A, T, l1, l2, poleP){
  const d = T.clone().sub(A); let dist = d.length(); const dir = d.divideScalar(dist || 1);
  dist = clamp(dist, .05, l1 + l2 - .0015);
  const a = (l1*l1 + dist*dist - l2*l2)/(2*dist), h = Math.sqrt(Math.max(0, l1*l1 - a*a));
  const pd = poleP.clone().sub(A); pd.addScaledVector(dir, -pd.dot(dir)); if(pd.lengthSq() < 1e-8) pd.set(0, 0, 1); pd.normalize();
  return { mid: A.clone().addScaledVector(dir, a).addScaledVector(pd, h), end: A.clone().addScaledVector(dir, dist) };
}

/* The stick on the ice: grip G, the blade pointing along bd (flat on the ice), the heel where the
   lie angle and the grip's distance up the shaft put it. Of the two places that works, the one
   nearer C (where the blade is wanted). Too high to reach the ice: the heel comes up off it. */
function iceStick(G, C, bd){
  const b = V(bd ? bd.x : 1, 0, bd ? bd.z : 0); if(b.lengthSq() < 1e-6) b.set(1, 0, 0); b.normalize();
  const n = V(-b.z, 0, b.x);
  const gy = Math.min(G.y - .006, L.grip*.985), R = Math.sqrt(Math.max(0, L.grip*L.grip - gy*gy));
  const k = Math.max(-R, L.grip*Math.cos(BLADE_LIE)), p = Math.sqrt(Math.max(0, R*R - k*k));
  /* D = G - H, the shaft from heel to grip */
  const want = V(C.x - b.x*.19, 0, C.z - b.z*.19);
  let best = null, bd2 = 1e9;
  for(const sg of [1, -1]){
    const D = b.clone().multiplyScalar(k).addScaledVector(n, sg*p); D.y = gy;
    const H = G.clone().sub(D), dd = (H.x - want.x)**2 + (H.z - want.z)**2;
    if(dd < bd2){ bd2 = dd; best = { H, s: D.normalize() }; }
  }
  const z = V().crossVectors(b, best.s);
  const m = new THREE.Matrix4(); frameM(m, best.H, best.s, z);
  return { H: best.H, q: new THREE.Quaternion().setFromRotationMatrix(m) };
}

/* The skeleton for a rig pose R. All in the goalie's own frame. Returns a matrix per bone. */
function solve(R, out){
  const M = out.M;
  const qP = qE(R.pelR), half = R.sp.clone().multiplyScalar(.5);
  const qS = qP.clone().multiply(qE(half)), qC = qS.clone().multiply(qE(half));
  const pel = R.pel, spO = pel.clone().add(V(0, L.spine, 0).applyQuaternion(qP)), chO = spO.clone().add(V(0, L.chest, 0).applyQuaternion(qS));
  M[B.pel].compose(pel, qP, ONE); M[B.spine].compose(spO, qS, ONE); M[B.chest].compose(chO, qC, ONE);
  /* the head: towards what he looks at, within what a neck allows */
  const nk = chO.clone().add(V(0, L.neck, .03).applyQuaternion(qC));
  let yaw = 0, pit = 0;
  if(R.look){
    const d = R.look.clone().sub(nk).applyQuaternion(qC.clone().invert());
    yaw = clamp(Math.atan2(d.x, d.z), -1.35, 1.35)*R.lookW; pit = clamp(Math.atan2(-d.y, Math.hypot(d.x, d.z)), -.7, .85)*R.lookW;
  }
  const qH = qC.clone().multiply(qE(V(pit + R.hd.x, yaw + R.hd.y, R.hd.z)));
  M[B.head].compose(nk, qH, ONE);
  out.eye = nk.clone().add(V(0, .12, .1).applyQuaternion(qH));
  /* the stick and the blocker hand: on the ice the stick decides how the hand sits, in the air the hand carries it */
  const shoulder = (s, hand) => { const p = chO.clone().add(V(s*L.shX, L.shY, -.01).applyQuaternion(qC)); p.y += .045*clamp((hand.y - p.y)/.45); return p; };
  const qBa = quatFrame(R.bl.f, R.bl.n);
  /* the stick held up in the air by its own line (sa.s heel to knob, sa.z the blade's face): the hand follows the stick */
  if(R.saW > 0) qBa.slerp(quatFrame(R.sa.s, R.sa.z).multiply(Q_HS_INV), clamp(R.saW));
  const G = R.bl.p.clone().add(GRIP.clone().applyQuaternion(qBa));
  const ice = iceStick(G, R.stk, R.bd);
  const qBd = ice.q.clone().multiply(Q_HS_INV);
  const sf = clamp(R.sf);
  const qB = qBd.clone().slerp(qBa, sf);
  const wristB = G.clone().sub(GRIP.clone().applyQuaternion(qB));
  const shR = shoulder(-1, wristB), aR = ik2(shR, wristB, L.ua, L.fa, shR.clone().add(R.elR));
  const gripW = aR.end.clone().add(GRIP.clone().applyQuaternion(qB));
  /* the arm may not have got all the way: put the stick back on the ice from where the hand is */
  const ice2 = gripW.distanceToSquared(G) > 1e-6 ? iceStick(gripW, R.stk, R.bd) : ice;
  const qStick = ice2.q.clone().slerp(qBa.clone().multiply(Q_HS), sf);
  const heel = gripW.clone().sub(V(0, L.grip, 0).applyQuaternion(qStick));
  /* a blade that cannot lie flat rests on its toe or heel, never through the ice */
  const toe = heel.clone().addScaledVector(V(Math.sin(BLADE_LIE), Math.cos(BLADE_LIE), 0).applyQuaternion(qStick), .38);
  const low = Math.min(heel.y, toe.y); if(low < .004) heel.y += .004 - low;
  arm(M, B.uaR, B.faR, B.hR, shR, aR, qB);
  M[B.stick].compose(heel, qStick, ONE);
  out.heel = heel; out.qStick = qStick;
  /* the glove hand */
  const qG = quatFrame(R.gl.f, R.gl.n);
  const shL = shoulder(1, R.gl.p), aL = ik2(shL, R.gl.p, L.ua, L.fa, shL.clone().add(R.elL));
  arm(M, B.uaL, B.faL, B.hL, shL, aL, qG);
  M[B.trap].compose(aL.end.clone().add(V(.012, .02, -.012).applyQuaternion(qG)), qG.clone().multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), -R.close*1.0)), ONE);
  /* the legs: two-bone IK from the hip to the ankle, the knee towards its pole; the pad turns with the shin's "face" */
  out.knee = [];
  for(let i = 0; i < 2; i++){
    const s = i ? 1 : -1, Lg = R.lg[i];
    const hip = pel.clone().add(V(s*L.hipX, L.hipY, 0).applyQuaternion(qP));
    const r = ik2(hip, Lg.a, L.thigh, L.shin, Lg.k);
    const th = i ? B.thL : B.thR, sh = i ? B.shL : B.shR, ft = i ? B.ftL : B.ftR;
    frameM(M[th], hip, r.mid.clone().sub(hip), r.mid.clone().sub(hip.clone().lerp(r.end, .5)).add(V(0, 0, .02).applyQuaternion(qP)));
    frameM(M[sh], r.mid, r.end.clone().sub(r.mid), Lg.f);
    frameM(M[ft], r.end, Lg.t, Lg.u);
    out.knee[i] = r.mid;
  }
  return out;
}
const ONE = V(1, 1, 1);
function arm(M, ua, fa, h, sh, r, qH){
  const zH = V(0, 0, 1).applyQuaternion(qH);
  const fd = r.end.clone().sub(r.mid);
  frameM(M[ua], sh, r.mid.clone().sub(sh), fd.lengthSq() > 1e-6 ? fd.clone().add(zH.clone().multiplyScalar(.2)) : zH);
  frameM(M[fa], r.mid, fd, zH);
  M[h].compose(r.end, qH, ONE);
}

/* ===================================== POSES =====================================
   A rig pose: the pelvis (point + YXZ euler), the bend of the back (split over spine and
   chest), the head on top of what he looks at, both hands (point, finger direction,
   palm/board normal), the stick's blade on the ice, each leg (ankle, knee pole, pad face,
   toe, top of the foot). Poses blend as plain numbers and vectors. Leg 0 is his right
   (blocker side, -x), leg 1 his left (glove side, +x). */
const legP = (s, a, k, f, t, u) => ({ a, k, f, t, u });
function leg(s, ax, ay, az, kx, ky, kz, fx, fy, fz, tx, ty, tz, ux, uy, uz){ return { a: V(s*ax, ay, az), k: V(s*kx, ky, kz), f: V(s*fx, fy, fz), t: V(s*tx, ty, tz), u: V(s*ux, uy, uz) }; }
function rig(o){
  return Object.assign({
    pel: V(0, .65, -.08), pelR: V(.5, 0, 0), sp: V(.28, 0, 0), hd: V(0, 0, 0), look: V(0, .4, 8), lookW: 1,
    gl: { p: V(.44, .55, .36), f: V(.42, 1, .3), n: V(.2, -.15, 1) }, close: 0, elL: V(.6, -.8, -.3),
    bl: { p: V(-.4, .47, .38), f: V(-.15, 1, .45), n: V(-.12, 0, 1) }, elR: V(-.6, -.8, -.3),
    stk: V(.02, 0, .66), bd: V(1, 0, -.08), sf: 0, sa: { s: V(.3, -1, .1), z: V(0, 0, 1) }, saW: 0,
    lg: [leg(-1, .36, L.ankle, -.03, .05, .5, .7, -.18, .2, 1, .42, 0, 1, -.22, 1, 0),
         leg(1, .36, L.ankle, -.03, .05, .5, .7, -.18, .2, 1, .42, 0, 1, -.22, 1, 0)]
  }, o || {});
}
const POSE = {
  /* ready: the modern butterfly stance, knees in, pads flared, glove open by the hip, blocker and stick on the five-hole */
  stance: () => rig(),
  /* nothing near: stood up, relaxed, stick on the ice */
  upright: () => rig({ pel: V(0, .82, -.04), pelR: V(.2, 0, 0), sp: V(.1, 0, 0),
    gl: { p: V(.38, .66, .2), f: V(.25, 1, .1), n: V(.35, -.2, 1) }, bl: { p: V(-.35, .6, .22), f: V(-.15, 1, .3), n: V(-.25, 0, 1) }, stk: V(-.02, 0, .52),
    lg: [leg(-1, .27, L.ankle, -.01, .14, .62, .5, -.1, .1, 1, .3, 0, 1, -.1, 1, 0), leg(1, .27, L.ankle, -.01, .14, .62, .5, -.1, .1, 1, .3, 0, 1, -.1, 1, 0)] }),
  /* the butterfly: knees on the ice, pads flat and sealed, hands out in front, the stick over the five-hole */
  butterfly: () => rig({ pel: V(0, .44, .0), pelR: V(.24, 0, 0), sp: V(.22, 0, 0),
    gl: { p: V(.47, .5, .44), f: V(.25, 1, .3), n: V(.1, 0, 1) }, bl: { p: V(-.42, .44, .44), f: V(-.15, 1, .5), n: V(-.1, 0, 1) }, stk: V(.03, 0, .8),
    lg: [leg(-1, .56, .14, .18, .05, .12, .48, 0, .25, 1, 1, -.25, -.2, 0, -.3, 1), leg(1, .56, .14, .18, .05, .12, .48, 0, .25, 1, 1, -.25, -.2, 0, -.3, 1)] })
};
/* after a goal: stood up, sagging, the glove hanging and the stick on the ice */
POSE.slump = () => rig({ pel: V(0, .86, -.06), pelR: V(.16, 0, 0), sp: V(.2, 0, 0), hd: V(.55, 0, 0), lookW: .2,
  gl: { p: V(.33, .55, .08), f: V(.1, -1, .2), n: V(.3, 0, 1) }, bl: { p: V(-.3, .55, .1), f: V(-.2, .6, .6), n: V(-.5, 0, 1) }, stk: V(-.2, 0, .48),
  lg: [leg(-1, .22, L.ankle, -.02, .12, .7, .5, -.1, .1, 1, .3, 0, 1, -.05, 1, 0), leg(1, .22, L.ankle, -.02, .12, .7, .5, -.1, .1, 1, .3, 0, 1, -.05, 1, 0)] });
/* with the puck: the glove up and shut in front of his chest, stood up a little */
POSE.hold = () => rig({ pel: V(0, .76, -.05), pelR: V(.25, 0, 0), sp: V(.08, 0, 0), look: V(0, .4, 8),
  gl: { p: V(.2, .98, .34), f: V(-.25, .85, .45), n: V(-.25, .15, 1) }, close: 1, elL: V(.9, -.6, -.2),
  bl: { p: V(-.36, .6, .26), f: V(-.15, 1, .3), n: V(-.25, 0, 1) }, stk: V(-.02, 0, .55),
  lg: [leg(-1, .28, L.ankle, -.01, .14, .6, .5, -.1, .1, 1, .3, 0, 1, -.1, 1, 0), leg(1, .28, L.ankle, -.01, .14, .6, .5, -.1, .1, 1, .3, 0, 1, -.1, 1, 0)] });
/* a win: both arms up in a V, the glove open to the crowd, the stick raised blade-first up and out to his blocker side
   (held where the paddle meets the shaft, the knob hanging down by his shoulder, never across his face) */
POSE.cele = () => rig({ pel: V(0, .97, -.02), pelR: V(-.05, 0, 0), sp: V(-.12, 0, 0), hd: V(-.35, 0, 0), lookW: 0,
  gl: { p: V(.46, 1.9, .14), f: V(.2, 1, .05), n: V(.05, .1, 1) }, close: .15, elL: V(1, -.2, -.4),
  bl: { p: V(-.46, 1.86, .12), f: V(-.1, 1, .1), n: V(-.1, 0, 1) }, sf: 1, sa: { s: V(.22, -1, .08), z: V(.1, .1, 1) }, saW: 1, elR: V(-1, -.2, -.4),
  lg: [leg(-1, .2, L.ankle, 0, .1, .8, .5, 0, .1, 1, .25, 0, 1, 0, 1, 0), leg(1, .2, L.ankle, 0, .1, .8, .5, 0, .1, 1, .25, 0, 1, 0, 1, 0)] });
/* reverse VH on the post, s = which post (+1 glove side): that pad flat along the goal line, the other skate planted */
POSE.rvh = s => {
  const near = s > 0 ? 1 : 0, far = 1 - near, R = rig({ pel: V(s*.06, .46, .02), pelR: V(.15, s*.15, -s*.12), sp: V(.1, 0, 0), stk: V(s*.22, 0, .62) });
  R.lg[near] = leg(s, .62, .14, .02, .1, .13, .4, 0, .3, 1, 1, -.2, -.1, 0, -.2, 1);
  R.lg[far] = leg(-s, .22, L.ankle, .08, .2, .55, .7, -.15, .2, 1, .4, 0, 1, -.2, 1, 0);
  if(s > 0){ R.gl = { p: V(.6, .62, .2), f: V(.15, 1, .1), n: V(.4, 0, 1) }; R.bl = { p: V(-.34, .46, .4), f: V(-.15, 1, .5), n: V(-.1, 0, 1) }; }
  else { R.bl = { p: V(-.58, .55, .2), f: V(-.15, 1, .1), n: V(-.45, 0, 1) }; R.gl = { p: V(.4, .55, .4), f: V(.25, 1, .3), n: V(.1, 0, 1) }; R.stk = V(-.32, 0, .5); }
  return R;
};
/* the saves, at the moment the puck gets there. v picks a version of the save */
const SAVE = {
  /* glove high: up and out, the pocket square to the puck. v1 does it from the butterfly */
  gh: v => {
    const R = v ? POSE.butterfly() : rig({ pel: V(.08, .72, -.05), pelR: V(.32, .12, .1), sp: V(.06, .22, .14),
      lg: [leg(-1, .3, L.ankle, -.06, .12, .52, .6, -.16, .2, 1, .4, 0, 1, -.3, 1, 0), leg(1, .46, L.ankle, .02, .14, .55, .62, -.2, .2, 1, .6, 0, 1, -.35, 1, 0)] });
    R.gl = { p: V(.6, v ? .98 : 1.04, .34), f: V(.3, 1, -.05), n: V(-.05, .05, 1) }; R.elL = V(1, -.1, -.5);
    R.hd = V(.05, .1, 0); if(v){ R.sp = V(.02, .2, .16); R.pel.x = .05; }
    return R;
  },
  /* blocker high: the board up and angled to send it to the corner */
  bh: v => {
    const R = v ? POSE.butterfly() : rig({ pel: V(-.08, .72, -.05), pelR: V(.32, -.12, -.1), sp: V(.06, -.22, -.14),
      lg: [leg(-1, .46, L.ankle, .02, .14, .55, .62, -.2, .2, 1, .6, 0, 1, -.35, 1, 0), leg(1, .3, L.ankle, -.06, .12, .52, .6, -.16, .2, 1, .4, 0, 1, -.3, 1, 0)] });
    R.bl = { p: V(-.6, .96, .34), f: V(.25, 1, .05), n: V(-.4, .05, 1) }; R.sf = .85; R.elR = V(-1, -.1, -.5); R.stk = V(-.4, 0, .5);
    if(v){ R.sp = V(.02, -.2, -.16); R.pel.x = -.05; }
    return R;
  },
  /* five-hole: down into the butterfly, the paddle flat over the hole */
  fh: () => { const R = POSE.butterfly(); R.stk = V(.06, 0, .74); R.bl.p = V(-.3, .42, .52); R.gl.p = V(.42, .5, .46); R.sp = V(.2, 0, 0); return R; },
  /* low glove: v0 a pad extension along the ice to the post (the desperation stretch), v1 a standing kick save */
  lg: v => {
    if(v){
      const R = rig({ pel: V(-.04, .66, -.06), pelR: V(.34, -.1, .16), sp: V(.08, .15, -.08) });
      R.lg[1] = leg(1, .8, .24, .2, .5, .5, .7, 0, .15, 1, 1, .1, .6, -.3, 1, 0); R.lg[0] = leg(-1, .3, L.ankle, -.04, .12, .52, .6, -.16, .2, 1, .4, 0, 1, -.35, 1, 0);
      R.gl = { p: V(.62, .44, .36), f: V(.4, .4, .5), n: V(.15, .2, 1) }; return R;
    }
    const R = POSE.butterfly(); R.pel = V(.2, .35, .0); R.pelR = V(.14, .3, -.18); R.sp = V(.12, -.15, .1);
    R.lg[1] = leg(1, 1.0, .14, .14, .55, .7, .5, 0, .35, 1, 1, .1, .25, 0, 1, .2);
    R.lg[0] = leg(-1, .42, .14, .2, .02, .12, .46, 0, .25, 1, 1, -.25, -.2, 0, -.3, 1);
    R.gl = { p: V(.74, .3, .42), f: V(.6, .4, .3), n: V(.1, .4, 1) }; R.elL = V(.8, .1, -.5);
    R.bl.p = V(-.28, .42, .44); R.stk = V(.2, 0, .74);
    return R;
  },
  /* low blocker: v0 the mirror stretch with the stick down along the pad, v1 a stick save on the ice */
  lb: v => {
    if(v){
      const R = rig({ pel: V(-.08, .6, -.04), pelR: V(.42, -.15, -.1), sp: V(.18, -.2, -.05) });
      R.lg[0] = leg(-1, .5, L.ankle, .02, .2, .5, .6, -.2, .2, 1, .5, 0, 1, -.35, 1, 0);
      R.bl = { p: V(-.55, .36, .44), f: V(-.4, .5, .7), n: V(-.25, .2, 1) }; R.stk = V(-.72, 0, .58); R.elR = V(-.8, -.2, -.3);
      return R;
    }
    const R = POSE.butterfly(); R.pel = V(-.2, .35, .0); R.pelR = V(.14, -.3, .18); R.sp = V(.12, .15, -.1);
    R.lg[0] = leg(-1, 1.0, .14, .14, .55, .7, .5, 0, .35, 1, 1, .1, .25, 0, 1, .2);
    R.lg[1] = leg(1, .42, .14, .2, .02, .12, .46, 0, .25, 1, 1, -.25, -.2, 0, -.3, 1);
    R.bl = { p: V(-.6, .32, .5), f: V(-.5, .5, .6), n: V(-.1, .3, 1) }; R.stk = V(-.62, 0, .62); R.elR = V(-.8, .1, -.4);
    R.gl.p = V(.3, .5, .46);
    return R;
  }
};
/* where along the crease each save takes him */
const SAVE_X = { gh: .1, bh: -.1, fh: 0, lg: .16, lb: -.16 };
const ICE_SAVE = { gh: [false, true], bh: [false, true], fh: [true, true], lg: [true, false], lb: [true, false] };

/* a deep copy blend of two rig poses */
function mix(a, b, t){
  if(t <= 0) return a; if(t >= 1) return b;
  if(a && a.isVector3) return a.clone().lerp(b, t);
  if(typeof a === 'number') return a + (b - a)*t;
  if(Array.isArray(a)) return a.map((x, i) => mix(x, b[i], t));
  if(a && typeof a === 'object'){ const o = {}; for(const k in a) o[k] = (b && k in b) ? mix(a[k], b[k], t) : a[k]; return o; }
  return t < .5 ? a : b;
}
function cloneRig(a){ return mix(a, a, .5); }

/* ===================================== GEOMETRY =====================================
   Everything is built in some bone's bind frame, moved into the mesh with that bone's
   bind matrix, and given bone weights (one bone, or a function of where the vertex is). */
function GeoB(){ this.p = []; this.n = []; this.uv = []; this.role = []; this.si = []; this.sw = []; this.ix = []; }
GeoB.prototype.add = function(geo, M, o){
  const pos = geo.attributes.position, nor = geo.attributes.normal, uvA = geo.attributes.uv, n0 = this.p.length/3;
  const nm = new THREE.Matrix3().getNormalMatrix(M), flip = M.determinant() < 0;
  const v = V(), nv = V(), q = V();
  for(let i = 0; i < pos.count; i++){
    q.fromBufferAttribute(pos, i); v.copy(q).applyMatrix4(M); this.p.push(v.x, v.y, v.z);
    nv.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize(); if(flip) nv.negate(); this.n.push(nv.x, nv.y, nv.z);
    const u0 = uvA ? uvA.getX(i) : 0, v0 = uvA ? uvA.getY(i) : 0;
    const uv = typeof o.uv === 'function' ? o.uv(q, u0, v0, i) : o.uv;
    this.uv.push(uv[0], uv[1]);
    this.role.push(typeof o.c === 'function' ? o.c(q, u0, v0, i) : o.c);
    let w = typeof o.w === 'function' ? o.w(q, u0, v0, i, v) : [[o.w, 1]];
    w = w.filter(x => x[1] > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = w.reduce((s, x) => s + x[1], 0) || 1;
    for(let k = 0; k < 4; k++){ this.si.push(w[k] ? w[k][0] : 0); this.sw.push(w[k] ? w[k][1]/tot : 0); }
  }
  const idx = geo.index ? geo.index.array : [...Array(pos.count).keys()];
  for(let i = 0; i < idx.length; i += 3){ if(flip) this.ix.push(n0 + idx[i], n0 + idx[i + 2], n0 + idx[i + 1]); else this.ix.push(n0 + idx[i], n0 + idx[i + 1], n0 + idx[i + 2]); }
};
GeoB.prototype.build = function(){
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
  g.setIndex(this.ix);
  g.computeBoundingSphere();
  return g;
};

/* A loft: rings of superellipses. ring = { c, ax, ay, w, d, e, t }. o.theta(a) maps 0..1 round
   the ring to an angle, o.arc spaces the points by arc length (so paint lands true), o.warp
   bends a point, o.cap0/cap1 close the ends. uv = (round, along). */
function loft(rings, seg, o = {}){
  const n = rings.length, pos = [], uv = [], idx = [];
  const th = o.theta || (a => a*Math.PI*2);
  for(let i = 0; i < n; i++){
    const r = rings[i], e = r.e || 2, t = r.t != null ? r.t : i/(n - 1);
    const pt = a => { const q = th(a); return [sgnpow(Math.cos(q), 2/e)*r.w, sgnpow(Math.sin(q), 2/e)*r.d]; };
    let as = null;
    if(o.arc){
      const N = 160, cum = [0]; let prev = pt(0);
      for(let k = 1; k <= N; k++){ const p = pt(k/N); cum.push(cum[k - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1])); prev = p; }
      as = []; let k = 0;
      for(let j = 0; j <= seg; j++){ const want = j/seg*cum[N]; while(k < N - 1 && cum[k + 1] < want) k++; const f = (want - cum[k])/((cum[k + 1] - cum[k]) || 1); as.push((k + f)/N); }
    }
    for(let j = 0; j <= seg; j++){
      const a = as ? as[j] : j/seg, [px, py] = pt(a);
      const p = r.c.clone().addScaledVector(r.ax, px).addScaledVector(r.ay, py);
      if(o.warp) o.warp(p, j/seg, t, i, r);
      pos.push(p.x, p.y, p.z); uv.push(j/seg, t);
    }
  }
  for(let i = 0; i < n - 1; i++) for(let j = 0; j < seg; j++){ const a = i*(seg + 1) + j, b = a + seg + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const capAt = (ri, rev) => {
    const r = rings[ri], c = r.c.clone(); if(o.warp) o.warp(c, .5, r.t != null ? r.t : ri/(n - 1), ri, r, true);
    const ci = pos.length/3; pos.push(c.x, c.y, c.z); uv.push(.5, r.t != null ? r.t : ri/(n - 1));
    for(let j = 0; j < seg; j++){ const a = ri*(seg + 1) + j; if(rev) idx.push(ci, a + 1, a); else idx.push(ci, a, a + 1); }
  };
  if(o.cap0) capAt(0, false); if(o.cap1) capAt(n - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
  g.computeVertexNormals();
  /* outward? (checked on the fattest ring) */
  let best = 0, bw = -1; rings.forEach((r, i) => { if(r.w*r.d > bw){ bw = r.w*r.d; best = i; } });
  const nA = g.attributes.normal, pA = g.attributes.position, vi = best*(seg + 1) + Math.floor(seg/4);
  const radial = V().fromBufferAttribute(pA, vi).sub(rings[best].c);
  if(radial.dot(V().fromBufferAttribute(nA, vi)) < 0){ const ix = g.index.array; for(let i = 0; i < ix.length; i += 3){ const tmp = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = tmp; } g.computeVertexNormals(); }
  /* the seam: one normal for both copies */
  for(let i = 0; i < n; i++){ const a = i*(seg + 1), b = a + seg; const x = nA.getX(a) + nA.getX(b), y = nA.getY(a) + nA.getY(b), z = nA.getZ(a) + nA.getZ(b), l = Math.hypot(x, y, z) || 1; nA.setXYZ(a, x/l, y/l, z/l); nA.setXYZ(b, x/l, y/l, z/l); }
  return g;
}
const AX = V(1, 0, 0), AY = V(0, 1, 0), AZ = V(0, 0, 1);
/* a superellipsoid blob along y: half sizes w (x), h (y), d (z); e round, eV down the length */
function blob(w, h, d, e = 3, eV = 2.4, seg = 20, rs = 12, o = {}){
  const rings = [];
  for(let i = 0; i <= rs; i++){
    const ph = -Math.PI/2 + Math.PI*i/rs, cy = sgnpow(Math.sin(ph), 2/eV)*h, k = Math.max(.001, Math.pow(Math.abs(Math.cos(ph)), 2/eV));
    rings.push({ c: V(0, cy, 0), ax: AX, ay: AZ, w: w*k, d: d*k, e, t: i/rs });
  }
  return loft(rings, seg, o);
}
function tube(pts, r, seg = 5, n = 10){
  const curve = new THREE.CatmullRomCurve3(pts);
  return new THREE.TubeGeometry(curve, n, r, seg, false);
}
const mT = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
const at = (geo, m) => { geo.applyMatrix4(m); return geo; };
const mTR = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(V(x, y, z), qE(V(rx, ry, rz)), ONE);

/* ---- the atlas: where each painted piece sits (px in a 1024 square) ---- */
const AW = 1024;
const RECT = { jer: [0, 0, 1024, 448], slv: [0, 448, 256, 256], pad: [256, 448, 160, 448], mask: [416, 448, 384, 192], blk: [800, 448, 128, 224], cuff: [416, 640, 256, 128], lace: [672, 640, 128, 128] };
const SW = ['fabric', 'leather', 'plastic', 'gloss', 'metal', 'rubber', 'padside', 'skin', 'mesh'];
const SW_RM = { fabric: [.92, 0], leather: [.55, 0], plastic: [.38, .05], gloss: [.2, .1], metal: [.28, .85], rubber: [.85, 0], padside: [.5, 0], skin: [.6, 0], mesh: [.9, 0] };
const RECT_RM = { jer: [.9, 0], slv: [.9, 0], pad: [.48, 0], mask: [.2, .12], blk: [.45, 0], cuff: [.55, 0], lace: [.75, 0] };
const swUV = name => { const k = SW.indexOf(name), x = (k % 4)*64 + 32, y = 704 + Math.floor(k/4)*64 + 32; return [x/AW, 1 - y/AW]; };
const rectUV = (r, s, t) => { const R = RECT[r]; return [(R[0] + clamp(s)*R[2])/AW, 1 - (R[1] + clamp(t)*R[3])/AW]; };

/* the shared roughness (g) and metalness (b) atlas */
let rmTex = null;
function rmTexture(){
  if(rmTex) return rmTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const put = (x, y, w, h, [r, m]) => { g.fillStyle = 'rgb(0,' + Math.round(r*255) + ',' + Math.round(m*255) + ')'; g.fillRect(x/8, y/8, w/8, h/8); };
  put(0, 0, 1024, 1024, [.8, 0]);
  for(const k in RECT) put(...RECT[k], RECT_RM[k]);
  SW.forEach((s, k) => put((k % 4)*64, 704 + Math.floor(k/4)*64, 64, 64, SW_RM[s]));
  rmTex = new THREE.CanvasTexture(c); rmTex.magFilter = THREE.NearestFilter; rmTex.minFilter = THREE.NearestFilter; rmTex.generateMipmaps = false;
  return rmTex;
}

/* ---- the build: one geometry for every goalie (the colours per vertex are a role, set per kit) ---- */
let GEO = null;
function buildGeo(){
  if(GEO) return GEO;
  const out = { M: [...Array(NB)].map(() => new THREE.Matrix4()) };
  const bindR = rig({ pel: V(0, 1.09, 0), pelR: V(0, 0, 0), sp: V(0, 0, 0), look: null, lookW: 0,
    gl: { p: V(.46, 1.1, .2), f: V(.2, -1, .4), n: V(-.3, 0, 1) }, bl: { p: V(-.46, 1.1, .2), f: V(-.2, -1, .4), n: V(.3, 0, 1) }, sf: 1,
    elL: V(1, 0, -.6), elR: V(-1, 0, -.6),
    lg: [leg(-1, .14, L.ankle, 0, .1, .5, .5, 0, 0, 1, 0, 0, 1, 0, 1, 0), leg(1, .14, L.ankle, 0, .1, .5, .5, 0, 0, 1, 0, 0, 1, 0, 1, 0)] });
  /* straight legs and a level foot for the bind: put the knee exactly between */
  solve(bindR, out);
  const BM = out.M.map(m => m.clone()), Bp = i => V().setFromMatrixPosition(BM[i]);
  const GB = new GeoB();
  const inBone = (b, extra) => extra ? BM[b].clone().multiply(extra) : BM[b];
  const fab = swUV('fabric');

  /* ---------------- the sweater over the chest protector ---------------- */
  const P0 = Bp(B.pel);
  const TOR = [
    [-.13, .29, .19, 2.3, -.005], [-.08, .285, .185, 2.4, -.005], [.0, .278, .18, 2.5, 0], [.1, .272, .176, 2.6, .005], [.2, .283, .182, 2.8, .012],
    [.3, .3, .19, 3, .018], [.39, .315, .195, 3.2, .02], [.46, .325, .19, 3.4, .015], [.52, .33, .18, 3.5, .005], [.56, .315, .165, 3.4, -.005],
    [.592, .27, .145, 3, -.012], [.618, .2, .12, 2.6, -.015], [.636, .12, .095, 2.2, -.012], [.645, .085, .078, 2, -.01]
  ];
  const TOR_H = TOR[TOR.length - 1][0] - TOR[0][0];
  const torRings = TOR.map(([h, w, d, e, dz]) => ({ c: V(0, P0.y + h, dz), ax: AX, ay: AZ, w, d, e, t: (TOR[TOR.length - 1][0] - h)/TOR_H }));
  const torso = loft(torRings, 56, { arc: true, theta: a => Math.PI - 2*Math.PI*a, warp: (p, a, t, i, r) => { const hang = smooth(.55, 1, t); if(hang <= 0) return; const rd = V(p.x - r.c.x, 0, p.z - r.c.z).normalize(); p.addScaledVector(rd, hang*(.006*Math.sin(a*Math.PI*2*7 + 1) + .004*Math.sin(a*Math.PI*2*11 + 2))); } });
  const spineW = (h) => {
    if(h < .02) return [[B.pel, 1]];
    if(h < .14){ const f = (h - .02)/.12; return [[B.pel, 1 - f], [B.spine, f]]; }
    if(h < .3){ const f = (h - .14)/.16; return [[B.spine, 1 - f], [B.chest, f]]; }
    return [[B.chest, 1]];
  };
  GB.add(torso, new THREE.Matrix4(), { c: 'tex', uv: (q, u, v) => rectUV('jer', u, v), w: (q) => {
    const h = q.y - P0.y, w = spineW(h);
    const side = Math.abs(q.x), arm = .22*smooth(.22, .32, side)*smooth(.34, .44, h)*(1 - smooth(.5, .56, h));
    if(arm > 0){ const ua = q.x > 0 ? B.uaL : B.uaR; return w.map(x => [x[0], x[1]*(1 - arm)]).concat([[ua, arm]]); }
    return w;
  } });
  /* the collar and the neck under the mask */
  const ch = Bp(B.chest), hd = Bp(B.head);
  GB.add(loft([0, 1, 2].map(i => ({ c: V(0, P0.y + .636 + i*.012, -.01), ax: AX, ay: AZ, w: .092 - i*.006, d: .084 - i*.005, e: 2 })), 24), new THREE.Matrix4(), { c: 'collar', uv: fab, w: B.chest });
  GB.add(loft([0, 1, 2, 3].map(i => ({ c: V(0, lerp(P0.y + .6, hd.y + .06, i/3), lerp(-.01, .0, i/3)), ax: AX, ay: AZ, w: .065, d: .062, e: 2 })), 16), new THREE.Matrix4(), { c: 'neck', uv: swUV('rubber'), w: (q) => { const f = smooth(hd.y - .05, hd.y + .03, q.y); return [[B.chest, 1 - f], [B.head, f]]; } });

  /* ---------------- the sleeves over the arm units: shoulder to wrist, bulging at the elbow floater ---------------- */
  for(const s of [-1, 1]){
    const ua = s > 0 ? B.uaL : B.uaR, fa = s > 0 ? B.faL : B.faR, hb = s > 0 ? B.hL : B.hR;
    const S = Bp(ua), E = Bp(fa), Wr = Bp(hb), d1 = E.clone().sub(S).normalize(), d2 = Wr.clone().sub(E).normalize();
    const lu = S.distanceTo(E), lf = E.distanceTo(Wr), tot = lu + lf + .025;
    const R0 = V(s, .15, 0).normalize();
    const rings = [];
    const prof = [[-.07, .115, .112], [-.02, .142, .132], [.04, .148, .136], [.1, .136, .126], [.17, .124, .117], [.23, .122, .115], [lu - .03, .13, .122], [lu + .01, .136, .126], [lu + .05, .124, .114], [lu + .11, .112, .104], [lu + .18, .105, .097], [lu + lf - .09, .097, .089], [lu + lf - .045, .088, .082]];
    for(const [dd, w, d] of prof){
      const k = clamp((dd - (lu - .06))/.12);
      const tan = d1.clone().lerp(d2, k).normalize();
      const c = dd < lu ? S.clone().addScaledVector(d1, dd) : E.clone().addScaledVector(d2, dd - lu);
      if(dd > lu - .06 && dd < lu + .06) c.lerp(E.clone().addScaledVector(tan, dd - lu), .5);
      const ax = R0.clone().addScaledVector(tan, -R0.dot(tan)).normalize(), ay = V().crossVectors(tan, ax).multiplyScalar(s);
      rings.push({ c, ax, ay, w, d, e: 2.3, t: (dd + .07)/tot, dd });
    }
    const g = loft(rings, 28, { arc: true, warp: (p, a, t, i, r) => { const rd = p.clone().sub(r.c).normalize(); p.addScaledVector(rd, .0045*Math.sin(a*Math.PI*2*3 + t*23 + s) + .003*Math.sin(a*Math.PI*2*5 - t*31)); } });
    GB.add(g, new THREE.Matrix4(), { c: 'tex', uv: (q, u, v) => rectUV('slv', u, v), w: (q, u, v) => {
      const dd = v*tot - .07;
      if(dd < .1){ const f = smooth(-.06, .1, dd); return [[B.chest, .55*(1 - f)], [ua, .45 + .55*f]]; }
      if(dd < lu + .06){ const f = smooth(lu - .06, lu + .06, dd); return [[ua, 1 - f], [fa, f]]; }
      return [[fa, 1]];
    } });
  }

  /* ---------------- the pants: a big padded seat and two legs down the thighs ---------------- */
  GB.add(blob(.255, .12, .18, 3, 2.6, 28, 10), mT(0, P0.y - .055, -.01), { c: (q, u) => (u < .025 || u > .975 || Math.abs(u - .5) < .025) ? 'pantsS' : 'pants', uv: fab, w: B.pel });
  for(const s of [-1, 1]){
    const th = s > 0 ? B.thL : B.thR, H = Bp(th), Kn = Bp(s > 0 ? B.shL : B.shR), dir = Kn.clone().sub(H).normalize();
    const rings = [[-.08, .14, .15], [0, .145, .155], [.1, .14, .145], [.2, .132, .135], [.27, .125, .125], [.3, .118, .118]].map(([d, w, dd]) => ({ c: H.clone().addScaledVector(dir, d).add(V(s*.012, 0, 0)), ax: AX, ay: AZ, w, d: dd, e: 2.4, t: d }));
    GB.add(loft(rings, 22, { cap1: true, theta: a => s > 0 ? a*Math.PI*2 : Math.PI - a*Math.PI*2 }), new THREE.Matrix4(), {
      c: (q, u) => Math.abs(u - .0) < .03 || Math.abs(u - 1) < .03 ? 'pantsS' : 'pants', uv: fab,
      w: (q) => { const d = (P0.y + L.hipY) - q.y; const f = smooth(-.02, .12, d); return [[B.pel, 1 - f], [th, f]]; } });
  }

  /* ---------------- the leg pads: face, thigh rise, knee stack, landing gear, boot channel, straps ----------------
     Built in pad space (o out from the leg, h up from the knee, f forward), then into the shin's frame. */
  for(const s of [-1, 1]){
    const sh = s > 0 ? B.shL : B.shR, th = s > 0 ? B.thL : B.thR;
    const toShin = new THREE.Matrix4().makeBasis(V(-s, 0, 0), V(0, -1, 0), V(0, 0, 1));
    const Mpad = BM[sh].clone().multiply(toShin);
    const padW = (q) => { const h = q.y; const f = .5*smooth(.06, .24, h); return f > 0 ? [[sh, 1 - f], [th, f]] : [[sh, 1]]; };
    const H0 = -(L.shin + L.ankle) + .012, H1 = .25;
    /* the face block: a modern flat face with squared edges. Breaks across it (grooves the pad folds at): the thigh rise
       above the knee, the knee, the boot; the toe bridge curls forward over the skate */
    const BRK = [.125, -.075, H0 + .15];
    const hs = []; for(let i = 0; i <= 24; i++) hs.push(lerp(H0, H1 - .012, i/24));
    for(const b of BRK) hs.push(b - .011, b, b + .011);
    hs.push(H1 - .004, H1, H0 + .004, H0 + .022); hs.sort((x, y) => x - y);
    const rings = [];
    hs.forEach(h => {
      const top = smooth(.13, H1, h), toe = smooth(H0 + .12, H0, h), rise = smooth(.11, .14, h);
      const w = .148*(1 - .1*rise - .06*top) - .012*toe, cz = .093 + .034*toe*toe - .006*rise, d = .042*(1 - .25*top);
      rings.push({ c: V(.004 - .008*rise, h, cz), ax: AX, ay: AZ, w, d, e: 7, t: (H1 - h)/(H1 - H0 + .02) });
    });
    /* rounded-off ends, still square in plan */
    const nR = rings.length - 1;
    rings[0].w *= .86; rings[0].d *= .55; rings[1].w *= .97; rings[1].d *= .9;
    rings[nR].w *= .9; rings[nR].d *= .45; rings[nR - 1].w *= .975; rings[nR - 1].d *= .88;
    const face = loft(rings, 26, { arc: true, cap0: true, cap1: true, warp: (p, a, t) => {
      if(p.z > .1){
        const o = p.x, h = p.y;
        /* two vertical breaks (the face's channels), and the three across */
        p.z -= .006*Math.exp(-Math.pow((o + .045)/.009, 2)) + .006*Math.exp(-Math.pow((o - .05)/.009, 2));
        for(const b of BRK) p.z -= .008*Math.exp(-Math.pow((h - b)/.009, 2));
        p.z += .004*(1 - Math.pow(o/.15, 2));
      }
    } });
    GB.add(face, Mpad, { c: 'tex', uv: (q) => rectUV('pad', (q.x + .155)/.31, (H1 - q.y)/(H1 - H0)), w: padW });
    /* the side walls round the leg: landing gear on the inside, the outer wing */
    for(const side of [-1, 1]){
      const ox = side*.14, top = side < 0 ? .04 : .1, bot = H0 + .1;
      const wr = [];
      for(let i = 0; i <= 10; i++){ const h = lerp(bot, top, i/10); wr.push({ c: V(ox, h, .01), ax: AX, ay: AZ, w: .017, d: .065, e: 4, t: i/10 }); }
      GB.add(loft(wr, 12, { cap0: true, cap1: true }), Mpad, { c: side < 0 ? 'padIn' : 'padOut', uv: swUV('padside'), w: padW });
    }
    /* the knee stack: three landing blocks on the inside at the knee */
    for(let k = 0; k < 3; k++){
      GB.add(at(blob(.03, .028, .07, 4, 3, 10, 6), mT(-.152, -.03 + k*.05, .015 - k*.004)), Mpad, { c: k === 1 ? 'padIn2' : 'padIn', uv: swUV('padside'), w: padW });
    }
    /* the knee cradle behind the knee, the calf, the straps round the back */
    GB.add(at(blob(.085, .07, .05, 3, 2.5, 16, 8), mT(0, .0, -.0)), Mpad, { c: 'cradle', uv: swUV('leather'), w: padW });
    const calf = loft([0, 1, 2, 3].map(i => ({ c: V(0, lerp(-.08, -.46, i/3), -.01), ax: AX, ay: AZ, w: lerp(.07, .055, i/3), d: lerp(.065, .05, i/3), e: 2.2 })), 14, { cap1: true });
    GB.add(calf, Mpad, { c: 'strap', uv: swUV('rubber'), w: sh });
    for(const h of [-.17, -.3, -.43]){
      const st = loft([-1, 1].map(k => ({ c: V(0, h + k*.012, -.012), ax: AX, ay: AZ, w: .15, d: .078, e: 2.6 })), 20, { theta: a => Math.PI + a*Math.PI });
      GB.add(st, Mpad, { c: 'strap', uv: swUV('rubber'), w: sh });
    }
    /* the toe tie over the skate */
    GB.add(at(blob(.04, .012, .05, 3, 2, 10, 6), mT(0, H0 + .03, .02)), Mpad, { c: 'strap', uv: swUV('rubber'), w: sh });
  }

  /* ---------------- the skates: boot, cowling, steel ---------------- */
  for(const s of [-1, 1]){
    const ft = s > 0 ? B.ftL : B.ftR;
    /* foot space: y towards the toe, z up from the ankle */
    const Mb = BM[ft];
    GB.add(blob(.052, .125, .06, 3, 2.6, 16, 10), Mb.clone().multiply(mT(0, .04, -.03)), { c: 'boot', uv: swUV('leather'), w: ft });
    GB.add(blob(.06, .155, .028, 3.4, 3, 16, 8), Mb.clone().multiply(mT(0, .05, -.088)), { c: 'cowl', uv: swUV('plastic'), w: ft });
    GB.add(blob(.004, .165, .014, 4, 4, 6, 6), Mb.clone().multiply(mT(0, .05, -.112)), { c: 'steel', uv: swUV('metal'), w: ft });
    GB.add(loft([0, 1].map(i => ({ c: V(0, -.02, lerp(.0, .06, i)), ax: AX, ay: AY, w: .058, d: .065, e: 2.2 })), 14, { cap1: true }), Mb, { c: 'boot', uv: swUV('leather'), w: ft });
  }

  /* ---------------- the trapper: cuff, back shell, finger rim, thumb rim, pocket, T-trap, piping ----------------
     glove space: y wrist to fingertips, z out of the pocket, +x the finger (pinky) side, -x the thumb */
  {
    const Mh = BM[B.hL], hw = (q) => { const f = smooth(-.02, .07, q.x)*smooth(.0, .12, q.y); return [[B.hL, 1 - f], [B.trap, f]]; };
    const curl = (k, from, len) => p => { const y = p.y; p.z += k*Math.pow(clamp((y - from)/len), 2); };
    GB.add(at(blob(.1, .095, .052, 4, 3, 24, 10), mTR(.0, -.095, -.02, .05, 0, 0)), Mh, { c: 'tex', uv: (q) => rectUV('cuff', (q.x + .1)/.2, (.01 - q.y)/.19), w: B.hL });
    /* one body: a deep pocket with steep walls and a rolled lip, the rims standing up round it, the top curling over
       (the fingers and the T). gDef is the shape as a function, so the binding can sit exactly on the pocket's edge */
    const GW = .15, GH = .222, GD = .068, GE = 2.6, GEV = 2.3, PX = .112, PY0 = .03, PYR = .178;
    const pr = (x, y) => Math.sqrt((x/PX)**2 + ((y - PY0)/PYR)**2);           /* 1 on the pocket's edge */
    const gDef = (x, y, z) => {
      const Y = y + GH, r = pr(x, y);
      if(z > -.01){
        const fr = clamp((z + .01)/.04);
        z -= Math.min(.078, 1.6*Math.max(0, z))*(1 - smooth(.62, 1, r))*(.4 + .6*smooth(-.16, .02, y))*fr;     /* the bowl: a flat-ish bottom, steep walls, never through the back */
        z += .011*Math.exp(-(((r - 1.07)/.08)**2))*fr;                          /* the rolled lip round it */
      }
      z += .062*Math.pow(clamp((Y - .29)/.15), 2) + .024*clamp(x/.14) + .012*clamp(-x/.14);
      return [x - .012*Math.pow(clamp((Y - .31)/.13), 2)*Math.sign(x), y, z];
    };
    { const g = blob(GW, GH, GD, GE, GEV, 40, 26); const pa = g.attributes.position, front = [];
      for(let k = 0; k < pa.count; k++){ const x = pa.getX(k), y = pa.getY(k), z = pa.getZ(k); front[k] = z > -.01 && pr(x, y) < 1.05; const d = gDef(x, y, z); pa.setXYZ(k, d[0], d[1], d[2]); }
      g.computeVertexNormals();
      GB.add(at(g, mT(.008, .19, .0)), Mh, { c: (q, u, v, i) => front[i] ? 'pocket' : 'gloveBack', uv: swUV('leather'), w: hw });
      /* the binding round the pocket: on the blob's own front surface, just inside the lip */
      const surf = (x, y) => { const k = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(y/GH), GEV)), 1/GEV), ax = Math.min(.999, Math.abs(x/(GW*k || 1))); return GD*k*Math.pow(1 - Math.pow(ax, GE), 1/GE); };
      const rim = [];
      for(let i = 0; i <= 40; i++){ const a = i/40*Math.PI*2, x = Math.cos(a)*PX*1.0, y = PY0 + Math.sin(a)*PYR*1.0, d = gDef(x, y, surf(x, y)); rim.push(V(d[0] + .008, d[1] + .19, d[2] + .004)); }
      rim.pop();
      const rc = new THREE.CatmullRomCurve3(rim, true);
      GB.add(new THREE.TubeGeometry(rc, 40, .0085, 5, true), Mh, { c: 'binding', uv: swUV('leather'), w: hw });
    }
    { const g = blob(.078, .088, .014, 3, 3, 16, 8); const pa = g.attributes.position; for(let k = 0; k < pa.count; k++){ pa.setZ(k, pa.getZ(k) + .035*Math.pow(clamp((pa.getY(k) + .088)/.176), 2)); } g.computeVertexNormals();
      GB.add(at(g, mT(.0, .33, .024)), Mh, { c: 'tex', uv: (q) => rectUV('lace', (q.x + .078)/.156, (.418 - q.y)/.176), w: (q) => [[B.hL, .45], [B.trap, .55]] }); }
    GB.add(tube([V(-.004, .4, .07), V(-.002, .33, .05), V(.0, .26, .025)], .008, 5, 8), Mh, { c: 'lace', uv: swUV('leather'), w: (q) => [[B.hL, .5], [B.trap, .5]] });
  }
  /* ---------------- the blocker: board, thumb wall, the mitt round the stick, cuff ----------------
     hand space: y along the fingers, z out of the board (towards the shooter), +x the pinky side */
  {
    const Mh = BM[B.hR];
    GB.add(at(blob(.112, .2, .022, 6, 5, 26, 12, { warp: p => { p.z += .014*(1 - Math.pow(p.x/.112, 2)); } }), mT(.008, .07, .085)), Mh, { c: 'tex', uv: (q) => rectUV('blk', (q.x + .104)/.224, (.27 - q.y)/.4), w: B.hR });
    GB.add(at(blob(.02, .14, .05, 4, 3, 12, 8), mT(-.1, .03, .04)), Mh, { c: 'blkSide', uv: swUV('leather'), w: B.hR });
    GB.add(at(blob(.065, .075, .05, 3, 2.5, 18, 8), mT(.0, .06, .02)), Mh, { c: 'blkMitt', uv: swUV('leather'), w: B.hR });
    GB.add(at(blob(.058, .05, .042, 2.6, 2.4, 16, 8), mT(.0, .08, -.035)), Mh, { c: 'blkPalm', uv: swUV('leather'), w: B.hR });
    GB.add(at(blob(.088, .09, .062, 3, 2.6, 20, 8), mT(.0, -.085, .015)), Mh, { c: 'blkCuff', uv: swUV('leather'), w: B.hR });
  }

  /* ---------------- the mask: shell, face opening, cat-eye cage, throat guard ----------------
     head space: y up from the top of the neck, z out of the face */
  {
    const Mh = BM[B.head];
    const cy = .12, R = { w: .119, h: .148, d: .14 };
    const shell = blob(R.w, R.h, R.d, 2.2, 2.1, 32, 20, { warp: (p, a, t) => {
      const y = p.y, front = Math.max(0, p.z)/R.d;
      if(y < 0){ const k = clamp(-y/R.h); p.x *= 1 - .22*k*front; p.z += .03*k*front + .02*smooth(.55, .85, k)*front; }   /* the jaw narrows forward into a chin */
      if(p.z < -.06 && y < -.02) p.z += .02*clamp((-.02 - y)/.1);
      p.y *= y > 0 ? .98 : 1;
    } });
    /* what is open at the front, in shell space */
    const openAt = q => { const y = q.y, front = q.z/R.d, ax = Math.abs(q.x); return q.z > .02 && y > -.085 && y < .052 && ax < .075 + .02*clamp((y + .02)/.07) && front > .25; };
    const sp = shell.attributes.position;
    const opened = new Set();
    for(let i = 0; i < sp.count; i++){ const q = V().fromBufferAttribute(sp, i); if(openAt(q)){ q.z -= .035; sp.setXYZ(i, q.x, q.y, q.z); opened.add(i); } }
    shell.computeVertexNormals();
    const Mshell = Mh.clone().multiply(mT(0, cy, -.005));
    GB.add(shell, Mshell, { c: (q, u, v, i) => opened.has(i) ? 'face' : 'tex', uv: (q, u, v) => rectUV('mask', u, v), w: B.head });
    /* the cage: cat-eye bars lying on the shell's own curve, across the opening */
    const onShell = (x, y, off = .007) => {
      const z0 = R.d*Math.sqrt(Math.max(.02, 1 - (x/R.w)**2 - (y/R.h)**2)), k = clamp(-y/R.h), fr = z0/R.d;
      return V(x*(1 - .22*k*fr), y*(y > 0 ? .98 : 1) + cy, z0 + .03*k*fr + .02*smooth(.55, .85, k)*fr + off - .005);
    };
    const edgeX = y => .075 + .02*clamp((y + .02)/.07);
    const bar = (pts) => GB.add(tube(pts, .0045, 4, Math.max(6, pts.length*2)), Mh, { c: 'cage', uv: swUV('metal'), w: B.head });
    const line = (x0, y0, x1, y1, n = 6) => [...Array(n + 1)].map((_, i) => onShell(lerp(x0, x1, i/n), lerp(y0, y1, i/n)));
    for(const x of [-.014, .014]) bar(line(x, .056, x*.9, -.086));
    for(const x of [-.045, .045]) bar(line(x, .004, x*.85, -.074));
    for(const y of [.054, .004, -.034]) bar(line(-edgeX(y) - .004, y, edgeX(y) + .004, y, 10));
    bar(line(-.052, -.066, .052, -.066, 8));
    for(const sg of [-1, 1]){ const pts = []; for(let i = 0; i <= 8; i++){ const y = lerp(.056, -.08, i/8); pts.push(onShell(sg*(edgeX(y) + .004)*(y < -.05 ? .8 : 1), y)); } bar(pts); }
    /* the throat guard, hanging off the chin */
    GB.add(at(blob(.05, .04, .005, 3, 3, 16, 8, { warp: p => { p.z -= .25*p.x*p.x; } }), mTR(0, .005, .1, .3, 0, 0)), Mh, { c: 'dangler', uv: swUV('gloss'), w: B.head });
  }

  /* ---------------- the stick: paddle, shaft, knob, the blade flat on the ice ----------------
     stick space: the heel at 0, y up the shaft, +x towards the toe in the stick's plane */
  {
    const Ms = BM[B.stick];
    const bd = V(Math.sin(BLADE_LIE), Math.cos(BLADE_LIE), 0), bu = V(-bd.y, bd.x, 0), bn = V(0, 0, 1);
    const Mb = new THREE.Matrix4().makeBasis(bd, bu, bn);
    const blade = new THREE.BoxGeometry(.38, .088, .013, 8, 2, 1);
    { const p = blade.attributes.position; for(let i = 0; i < p.count; i++){ const x = p.getX(i), y = p.getY(i); const toe = clamp((x - .13)/.06); p.setY(i, y - toe*(y > 0 ? .012 : 0)); p.setZ(i, p.getZ(i) + .018*Math.pow(clamp((x + .05)/.24), 2)); } blade.computeVertexNormals(); }
    GB.add(blade, Ms.clone().multiply(Mb).multiply(mT(.19 - .015, .044, 0)), { c: (q) => Math.abs(q.x - .02) < .13 ? 'tapeB' : 'stick', uv: swUV('fabric'), w: B.stick });
    GB.add(new THREE.BoxGeometry(.088, .64, .026, 1, 6, 1), Ms.clone().multiply(mT(.03, .34, 0)), { c: (q) => q.y > .25 ? 'stick2' : 'stick', uv: swUV('plastic'), w: B.stick });
    GB.add(new THREE.BoxGeometry(.03, .82, .022, 1, 4, 1), Ms.clone().multiply(mT(.012, 1.06, 0)), { c: 'stick', uv: swUV('plastic'), w: B.stick });
    GB.add(new THREE.CylinderGeometry(.021, .019, .09, 8), Ms.clone().multiply(mT(.012, 1.44, 0)), { c: 'tape', uv: swUV('fabric'), w: B.stick });
  }

  const geo = GB.build();
  GEO = { geo, roles: GB.role, inv: BM.map(m => m.clone().invert()), bind: BM };
  return GEO;
}

/* ===================================== PAINT ===================================== */
const FONTS = {
  block: s => '900 ' + s + 'px "Big Shoulders Display", Impact, sans-serif',
  college: s => '400 ' + s + 'px "Graduate", "Big Shoulders Display", serif',
  slab: s => '400 ' + s + 'px "Alfa Slab One", "Big Shoulders Display", serif',
  modern: s => '400 ' + s + 'px "Russo One", "Big Shoulders Display", sans-serif'
};
function drawText(g, txt, cx, cy, hpx, cols, font, sx, maxW, spacing = 0){
  g.save(); g.translate(cx, cy);
  let size = hpx; g.font = (FONTS[font] || FONTS.block)(size);
  const asc = g.measureText('0').actualBoundingBoxAscent || size*.72;
  size *= hpx/asc; g.font = (FONTS[font] || FONTS.block)(size);
  const chars = [...txt], ws = chars.map(c => g.measureText(c).width), sp = spacing*hpx;
  const tw = ws.reduce((a, b) => a + b, 0) + sp*(chars.length - 1), k = Math.min(sx, maxW/(tw || 1));
  g.scale(k, 1); g.textBaseline = 'alphabetic'; g.lineJoin = 'round'; g.miterLimit = 2;
  const pass = fn => { let x = -tw/2; chars.forEach((c, i) => { fn(c, x); x += ws[i] + sp; }); };
  if(cols[2]){ g.lineWidth = hpx*.24; g.strokeStyle = cols[2]; pass((c, x) => g.strokeText(c, x, hpx/2)); }
  if(cols[1]){ g.lineWidth = hpx*.12; g.strokeStyle = cols[1]; pass((c, x) => g.strokeText(c, x, hpx/2)); }
  g.fillStyle = cols[0]; pass((c, x) => g.fillText(c, x, hpx/2));
  g.restore();
}
const logoCache = {}, logoWait = [];
function logo(abbr, v){
  const k = abbr + (v === 'dark' ? '_dark' : '');
  if(logoCache[k] !== undefined) return logoCache[k];
  logoCache[k] = null;
  const im = new Image();
  im.onload = () => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 400; const g = c.getContext('2d'); g.drawImage(im, 0, 0, 600, 400);
    let d; try { d = g.getImageData(0, 0, 600, 400).data; } catch(e){ return; }
    let x0 = 600, y0 = 400, x1 = 0, y1 = 0;
    for(let y = 0; y < 400; y += 2) for(let x = 0; x < 600; x += 2) if(d[(y*600 + x)*4 + 3] > 20){ if(x < x0) x0 = x; if(x > x1) x1 = x; if(y < y0) y0 = y; if(y > y1) y1 = y; }
    const t = document.createElement('canvas'); t.width = Math.max(1, x1 - x0 + 4); t.height = Math.max(1, y1 - y0 + 4);
    t.getContext('2d').drawImage(c, x0 - 2, y0 - 2, t.width, t.height, 0, 0, t.width, t.height);
    logoCache[k] = t; for(const f of logoWait.splice(0)) f();
  };
  im.src = (ctx.assets || 'app/assets/teams/') + k + '.svg';
  return null;
}
function crest(g, img, cx, cy, wpx, hmax, sx = 1){
  let w = wpx, h = w*img.height/img.width; if(h > hmax){ h = hmax; w = h*img.width/img.height; }
  g.save(); g.translate(cx, cy); g.scale(sx, 1); g.drawImage(img, -w/2, -h/2, w, h); g.restore();
}
const lum = hex => { const n = parseInt(String(hex).slice(1), 16); return (.299*(n >> 16) + .587*(n >> 8 & 255) + .114*(n & 255))/255; };
const teamC = (abbr, k) => (P.team ? (P.team(abbr) || {})[k] : null) || (k === 'c1' ? '#16283f' : '#F2C230');
const kitOf = abbr => (P.KITS || {})[abbr] || { b: teamC(abbr, 'c1'), n: ['#ffffff', teamC(abbr, 'c2')], f: 'block', col: [teamC(abbr, 'c2'), '#ffffff'] };
function bandsOf(spec){ if(!spec) return []; let a = spec[0]; return spec.slice(1).map(([c, h]) => { const r = { c, a, b: a + h }; a += h; return r; }); }
const shade = (hex, k) => { const n = parseInt(String(hex).slice(1), 16); const f = c => Math.max(0, Math.min(255, Math.round(c*k))); return '#' + [n >> 16, n >> 8 & 255, n & 255].map(c => f(c).toString(16).padStart(2, '0')).join(''); };
/* the colours of his gear, from the sweater */
function gearOf(k){
  const glv = k.glv || [k.helm || k.b, k.b];
  const dark = [k.b, k.helm, glv[0]].filter(Boolean).sort((a, b) => lum(a) - lum(b))[0];
  const accent = (k.n && k.n[1] && k.n[1] !== k.b) ? k.n[1] : (k.col && k.col[1] && k.col[1] !== k.b) ? k.col[1] : '#ffffff';
  const main = lum(k.b) > .85 ? dark : k.b;
  const trim = lum(main) > .7 ? (dark !== main ? dark : '#1a1a1a') : '#ffffff';
  return { main, dark, accent: accent === main ? trim : accent, trim, helm: k.helm || k.b, pants: k.pants || ['#111111', null] };
}

const H_CM = 78, SHOULDER_CM = 69;
function paintAtlas(g, k, abbr, name, num){
  const gr = gearOf(k), W = '#f4f5f7';
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, AW, AW);
  paintJersey(g, k, abbr, name, num);
  paintSleeve(g, k, num);
  paintPads(g, gr);
  paintMask(g, k, gr, abbr, num);
  paintBlocker(g, gr, abbr);
  paintCuff(g, gr, abbr);
  paintLace(g, gr);
}
function clipRect(g, r, fn){ const R = RECT[r]; g.save(); g.beginPath(); g.rect(R[0], R[1], R[2], R[3]); g.clip(); g.translate(R[0], R[1]); fn(R[2], R[3]); g.restore(); }
function paintJersey(g, k, abbr, name, num){
  clipRect(g, 'jer', (Wp, Hp) => {
    const y = cm => Hp*(1 - cm/H_CM), X = u => u*Wp, PX = Wp/185, PY = Hp/H_CM;
    g.fillStyle = k.b; g.fillRect(0, 0, Wp, Hp);
    if(k.hz){ g.fillStyle = k.hz[0]; g.fillRect(0, y(k.hz[1] + 4), Wp, (k.hz[1] + 4)*PY + 2); }
    if(k.peak){
      const [c, e, h, ph] = k.peak, pk = u => h + 4 + ph*Math.max(0, 1 - Math.min(Math.abs(u - .25), Math.abs(u - .75))/.13);
      g.beginPath(); g.moveTo(0, Hp); for(let i = 0; i <= 64; i++){ const u = i/64; g.lineTo(X(u), y(pk(u))); } g.lineTo(Wp, Hp); g.closePath(); g.fillStyle = c; g.fill();
      g.beginPath(); for(let i = 0; i <= 64; i++){ const u = i/64; g[i ? 'lineTo' : 'moveTo'](X(u), y(pk(u))); } g.strokeStyle = e; g.lineWidth = 2.2*PY; g.stroke();
    }
    for(const s of bandsOf(k.hem)){ g.fillStyle = s.c; g.fillRect(0, y(s.b + 4), Wp, (s.b - s.a)*PY + .5); }
    for(const s of bandsOf(k.chest)){ g.fillStyle = s.c; g.fillRect(0, y(s.b + 6), Wp, (s.b - s.a)*PY + .5); }
    if(k.yoke){
      const [c, d, , trim] = k.yoke, dep = u => SHOULDER_CM - d - 7*(1 + Math.cos(4*Math.PI*u))/2;
      g.beginPath(); g.moveTo(0, 0); for(let i = 0; i <= 64; i++){ const u = i/64; g.lineTo(X(u), y(dep(u))); } g.lineTo(Wp, 0); g.closePath(); g.fillStyle = c; g.fill();
      if(trim){ g.beginPath(); for(let i = 0; i <= 64; i++){ const u = i/64; g[i ? 'lineTo' : 'moveTo'](X(u), y(dep(u))); } g.strokeStyle = trim; g.lineWidth = 1.6*PY; g.stroke(); }
    }
    if(k.pipe) for(const u of [0, .5, 1]){ g.fillStyle = k.pipe[1]; g.fillRect(X(u) - 9, 0, 18, Hp); g.fillStyle = k.pipe[0]; g.fillRect(X(u) - 5, 0, 10, Hp); }
    /* the collar: a V at the throat, a notch at the back */
    const col = k.col || [k.b, '#ffffff'];
    for(const [cu, depth, hw] of [[.25, 14, 7], [.75, 4, 9]]){
      const cx = X(cu), bot = y(H_CM - depth), w = hw*PX;
      g.beginPath(); g.moveTo(cx - w, 0); g.lineTo(cx, bot); g.lineTo(cx + w, 0); g.closePath(); g.fillStyle = col[0]; g.fill();
      g.strokeStyle = col[1]; g.lineWidth = 1.4*PY; g.beginPath(); g.moveTo(cx - w - 2, 0); g.lineTo(cx, bot + 2); g.lineTo(cx + w + 2, 0); g.stroke();
    }
    const n = k.n || ['#ffffff', null];
    if(k.word) drawText(g, k.word, X(.25), y(SHOULDER_CM - 24), 10*PY, [n[0], n[1], n[2]], 'college', PX/PY, 52*PX, .04);
    else { const img = logo(abbr, (k.crest && k.crest.v) || 'light'); if(img) crest(g, img, X(.25), y(SHOULDER_CM - 25), 40*PX, 32*PY, 1); }
    const nm = String(name || '').toUpperCase();
    const rd = (cols, u, cm) => readable(g, cols, X(u), y(cm));
    if(nm) drawText(g, nm, X(.75), y(SHOULDER_CM - 7), 7*PY, rd(n, .75, SHOULDER_CM - 7), 'block', PX/PY, 46*PX, .1);
    if(num !== '' && num != null) drawText(g, String(num), X(.75), y(SHOULDER_CM - 28), 27*PY, rd(n, .74, SHOULDER_CM - 28), k.f || 'block', PX/PY*1.05, 48*PX, .02);
    /* the NHL shield at the throat */
    const sy = y(H_CM - 18); g.fillStyle = '#e8eaed'; g.fillRect(X(.25) - 8, sy - 10, 16, 18); g.fillStyle = '#111'; g.fillRect(X(.25) - 5, sy - 7, 10, 10);
  });
}
function readable(g, cols, x, y){
  let d; try { d = g.getImageData(Math.round(x), Math.round(y), 1, 1).data; } catch(e){ return cols; }
  const bg = (.299*d[0] + .587*d[1] + .114*d[2])/255;
  if(Math.abs(lum(cols[0]) - bg) > .28) return cols;
  const alt = cols[1] && Math.abs(lum(cols[1]) - bg) > .28 ? cols[1] : (bg > .5 ? '#111111' : '#ffffff');
  return [alt, cols[0], cols[2]];
}
const SLV_CM = 66;
function paintSleeve(g, k, num){
  clipRect(g, 'slv', (Wp, Hp) => {
    const fromCuff = cm => Hp*(1 - cm/SLV_CM), fromSh = cm => Hp*cm/SLV_CM, PY = Hp/SLV_CM, PX = Wp/68;
    g.fillStyle = k.sc || k.b; g.fillRect(0, 0, Wp, Hp);
    if(k.yoke && k.yoke[2]){ const d = Math.min(SLV_CM, k.yoke[2] + 4); g.fillStyle = k.yoke[0]; g.fillRect(0, 0, Wp, fromSh(d)); if(k.yoke[3]){ g.fillStyle = k.yoke[3]; g.fillRect(0, fromSh(d) - 2, Wp, 3); } }
    for(const s of bandsOf(k.chest)){ const a = (SHOULDER_CM - s.b - 6)*.75, b = (SHOULDER_CM - s.a - 6)*.75; g.fillStyle = s.c; g.fillRect(0, fromSh(a), Wp, (b - a)*PY + .5); }
    if(k.cuff){ g.fillStyle = k.cuff[0]; g.fillRect(0, fromCuff(k.cuff[1] + 2), Wp, Hp); }
    for(const s of bandsOf(k.slv)){ g.fillStyle = s.c; g.fillRect(0, fromCuff(s.b + 4), Wp, (s.b - s.a)*PY + .5); }
    if(k.pipe){ for(const u of [.75]){ g.fillStyle = k.pipe[1]; g.fillRect(Wp*u - 7, 0, 14, Hp); g.fillStyle = k.pipe[0]; g.fillRect(Wp*u - 4, 0, 8, Hp); } }
    if(num !== '' && num != null) drawText(g, String(num), Wp*.25, fromSh(13), 11*PY, k.n || ['#fff'], k.f || 'block', PX/PY, 20*PX, .02);
  });
}
function paintPads(g, gr){
  /* u: 0 the inside edge, 1 the outside; v: 0 the top of the thigh rise, 1 the toe. The breaks: v .15 (thigh rise), .39 (knee), .82 (boot) */
  clipRect(g, 'pad', (Wp, Hp) => {
    const W = '#f4f5f7', c1 = gr.main, c2 = gr.accent === W || lum(gr.accent) > .9 ? gr.trim : gr.accent;
    const s = x => x*Wp, t = y => y*Hp;
    g.fillStyle = W; g.fillRect(0, 0, Wp, Hp);
    /* the thigh rise: a team colour panel, a pinstripe under it */
    g.fillStyle = c1; g.fillRect(0, 0, Wp, t(.13));
    g.fillStyle = c2; g.fillRect(0, t(.118), Wp, t(.01));
    /* the knee: a block from the inside edge over the knee stack, the accent pinstriped through it */
    g.fillStyle = c1;
    g.beginPath(); g.moveTo(0, t(.2)); g.lineTo(s(.58), t(.2)); g.lineTo(s(.7), t(.29)); g.lineTo(s(.58), t(.375)); g.lineTo(0, t(.375)); g.closePath(); g.fill();
    g.fillStyle = c2; g.fillRect(0, t(.283), s(.62), t(.01));
    /* the outer roll's edge: a stripe down the outside of the calf into the boot */
    g.fillStyle = c1; g.fillRect(s(.9), t(.39), s(.1), t(.61));
    g.fillStyle = c2; g.fillRect(s(.865), t(.42), s(.022), t(.38));
    /* the boot */
    g.fillStyle = c1; g.beginPath(); g.moveTo(0, Hp); g.lineTo(0, t(.835)); g.lineTo(Wp, t(.81)); g.lineTo(Wp, Hp); g.closePath(); g.fill();
    /* the breaks: darker seams where the pad folds, and the stitched channels down the face */
    g.fillStyle = 'rgba(0,0,0,.32)'; for(const v of [.15, .39, .82]) g.fillRect(0, t(v) - 2, Wp, 4);
    g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 2;
    for(const x of [.355, .66]){ g.beginPath(); g.moveTo(s(x), t(.4)); g.lineTo(s(x), t(.81)); g.stroke(); }
    g.strokeStyle = 'rgba(0,0,0,.1)'; g.lineWidth = 1.5; g.setLineDash([4, 4]);
    for(const y of [.52, .66]){ g.beginPath(); g.moveTo(s(.04), t(y)); g.lineTo(s(.86), t(y)); g.stroke(); }
    g.setLineDash([]);
    /* wear on the boot and the lower face, where the ice gets at it */
    g.fillStyle = 'rgba(120,130,140,.08)'; for(let i = 0; i < 40; i++){ g.fillRect(Math.random()*Wp, t(.7 + Math.random()*.25), 3 + Math.random()*6, 2); }
  });
}
function paintMask(g, k, gr, abbr, num){
  /* the shell's u: .25 the face, .75 the back, 0 and .5 the sides. The shell's rings run chin to crown down the canvas,
     so it is painted flipped (crown at the top here), and words and crests mirrored back so they read from outside.
     A painted mask: the helmet colour, a
     wing in the sweater's colour sweeping from the brow back over each side (outlined), a racing stripe over the top,
     the crest big on each cheek, the backplate with his number */
  clipRect(g, 'mask', (Wp, Hp) => {
    const base = gr.helm, wing = Math.abs(lum(gr.main) - lum(base)) > .08 || gr.main.toLowerCase() !== String(base).toLowerCase() ? gr.main : gr.accent;
    let acc = gr.accent; if(acc.toLowerCase() === String(wing).toLowerCase() || acc.toLowerCase() === String(base).toLowerCase()) acc = lum(base) > .6 ? '#1a1a1a' : '#ffffff';
    const edge = lum(wing) > .75 ? shade(base, .6) : '#ffffff';
    g.translate(0, Hp); g.scale(1, -1);
    const mir = (cx, fn) => { g.save(); g.translate(cx, 0); g.scale(-1, 1); g.translate(-cx, 0); fn(); g.restore(); };
    g.fillStyle = base; g.fillRect(0, 0, Wp, Hp);
    for(const m of [1, -1]){
      g.save(); g.translate(Wp*.25, 0); g.scale(m, 1);
      const wingP = () => { g.beginPath(); g.moveTo(Wp*.02, Hp*.24); g.bezierCurveTo(Wp*.1, Hp*.1, Wp*.26, Hp*.2, Wp*.5, Hp*.12); g.lineTo(Wp*.5, Hp*.5);
        g.bezierCurveTo(Wp*.36, Hp*.62, Wp*.26, Hp*.4, Wp*.14, Hp*.46); g.bezierCurveTo(Wp*.08, Hp*.5, Wp*.04, Hp*.4, Wp*.02, Hp*.24); g.closePath(); };
      wingP(); g.lineWidth = Hp*.045; g.strokeStyle = edge; g.stroke(); g.fillStyle = wing; g.fill();
      /* a thin accent flash through the wing */
      g.fillStyle = acc; g.beginPath(); g.moveTo(Wp*.06, Hp*.3); g.bezierCurveTo(Wp*.16, Hp*.2, Wp*.3, Hp*.32, Wp*.5, Hp*.26); g.lineTo(Wp*.5, Hp*.3); g.bezierCurveTo(Wp*.3, Hp*.38, Wp*.16, Hp*.27, Wp*.07, Hp*.34); g.closePath(); g.fill();
      g.restore();
    }
    /* the racing stripe over the crown, front to back */
    g.fillStyle = acc; g.fillRect(Wp*.75 - Wp*.014, 0, Wp*.028, Hp*.42); g.fillRect(Wp*.25 - Wp*.012, 0, Wp*.024, Hp*.08);
    /* the chin and jaw a little darker */
    const gd = g.createLinearGradient(0, Hp*.7, 0, Hp); gd.addColorStop(0, 'rgba(0,0,0,0)'); gd.addColorStop(1, 'rgba(0,0,0,.32)'); g.fillStyle = gd; g.fillRect(0, Hp*.7, Wp, Hp*.3);
    /* the crest on each cheek */
    const img = logo(abbr, lum(base) > .55 ? 'light' : 'dark') || logo(abbr, 'light');
    if(img) for(const u of [.075, .425]) mir(Wp*u, () => crest(g, img, Wp*u, Hp*.6, Wp*.13, Hp*.3, 1));
    /* the backplate, with his number */
    g.fillStyle = '#f2f2f2'; g.fillRect(Wp*.66, Hp*.44, Wp*.18, Hp*.48);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.strokeRect(Wp*.66, Hp*.44, Wp*.18, Hp*.48);
    if(num !== '' && num != null) mir(Wp*.75, () => drawText(g, String(num), Wp*.75, Hp*.66, Hp*.16, ['#1a1a1a', null], 'block', 1, Wp*.14));
    /* the clear coat catching the light */
    g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(0, Hp*.05, Wp, Hp*.02);
  });
}
function paintBlocker(g, gr, abbr){
  clipRect(g, 'blk', (Wp, Hp) => {
    g.fillStyle = '#f4f5f7'; g.fillRect(0, 0, Wp, Hp);
    g.fillStyle = gr.main; g.fillRect(0, 0, Wp, Hp*.08); g.fillRect(0, Hp*.92, Wp, Hp*.08); g.fillRect(0, 0, Wp*.1, Hp); g.fillRect(Wp*.9, 0, Wp*.1, Hp);
    g.fillStyle = gr.main; g.beginPath(); g.moveTo(Wp*.1, Hp*.62); g.lineTo(Wp*.9, Hp*.42); g.lineTo(Wp*.9, Hp*.56); g.lineTo(Wp*.1, Hp*.76); g.closePath(); g.fill();
    g.fillStyle = gr.accent; g.beginPath(); g.moveTo(Wp*.1, Hp*.78); g.lineTo(Wp*.9, Hp*.58); g.lineTo(Wp*.9, Hp*.62); g.lineTo(Wp*.1, Hp*.82); g.closePath(); g.fill();
    const img = logo(abbr, 'light'); if(img) crest(g, img, Wp*.5, Hp*.26, Wp*.6, Hp*.24, 1);
    g.strokeStyle = 'rgba(0,0,0,.15)'; g.lineWidth = 2; g.strokeRect(Wp*.14, Hp*.1, Wp*.72, Hp*.8);
  });
}
function paintCuff(g, gr, abbr){
  clipRect(g, 'cuff', (Wp, Hp) => {
    g.fillStyle = gr.main; g.fillRect(0, 0, Wp, Hp);
    g.fillStyle = '#f4f5f7'; g.fillRect(0, Hp*.12, Wp, Hp*.14); g.fillStyle = gr.accent; g.fillRect(0, Hp*.27, Wp, Hp*.06);
    const img = logo(abbr, 'light'); if(img) crest(g, img, Wp*.5, Hp*.64, Wp*.3, Hp*.4, 1);
  });
}
function paintLace(g, gr){
  clipRect(g, 'lace', (Wp, Hp) => {
    g.fillStyle = shade(gr.main, .55); g.fillRect(0, 0, Wp, Hp);
    g.strokeStyle = '#d9cdb4'; g.lineWidth = 7; g.lineCap = 'round';
    for(let i = -4; i <= 8; i++){ g.beginPath(); g.moveTo(i*Wp/5, 0); g.lineTo(i*Wp/5 + Hp*.8, Hp); g.stroke(); g.beginPath(); g.moveTo(i*Wp/5, Hp); g.lineTo(i*Wp/5 + Hp*.8, 0); g.stroke(); }
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2; g.strokeRect(2, 2, Wp - 4, Hp - 4);
  });
}
/* the colour of each part, from the kit */
function palette(k){
  const gr = gearOf(k), W = '#f4f5f7';
  const pc = gr.main, pin = lum(gr.main) > .8 ? gr.trim : gr.main;
  return {
    tex: '#ffffff', collar: (k.col || [k.b])[0], neck: '#1c1d20',
    pants: gr.pants[0], pantsS: gr.pants[1] || gr.pants[0],
    padIn: pin, padIn2: W, padOut: W, cradle: '#2a2b2e', strap: '#151618',
    boot: '#141517', cowl: '#3a3e45', steel: '#cfd6dd',
    gloveBack: pc, gloveFing: pc, gloveThumb: pc, pocket: lum(pc) > .8 ? '#d8dadd' : W, binding: lum(pc) > .8 ? gr.trim : (lum(gr.accent) > .85 ? shade(pc, .6) : gr.accent), lace: '#d9cdb4',
    blkSide: pc, blkMitt: pc, blkPalm: '#24262a', blkCuff: pc,
    cage: '#202326', face: '#141518', dangler: '#7f8a96', trim: W,
    stick: '#151515', stick2: '#2b2b2b', tape: '#f1f1ec', tapeB: '#2c2c2e'
  };
}

/* ===================================== THE GOALIE ===================================== */
function makeGoalie(){
  const GE = buildGeo();
  const G = { base: new THREE.Group() }; (ctx.parent || ctx.world).add(G.base);
  const gG = new THREE.Group(); gG.position.set(0, 0, .38); G.base.add(gG);
  const geo = new THREE.BufferGeometry();
  for(const a of ['position', 'normal', 'uv', 'skinIndex', 'skinWeight']) geo.setAttribute(a, GE.geo.attributes[a]);
  geo.setIndex(GE.geo.index); geo.boundingSphere = GE.geo.boundingSphere;
  const col = new Float32Array(GE.roles.length*3); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const atlas = document.createElement('canvas'); atlas.width = atlas.height = AW;
  const tex = new THREE.CanvasTexture(atlas); tex.anisotropy = ctx.aniso || 4;
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughnessMap: rmTexture(), metalnessMap: rmTexture(), roughness: 1, metalness: 1, vertexColors: true, skinning: true });
  const mesh = new THREE.SkinnedMesh(geo, mat); mesh.castShadow = true; mesh.frustumCulled = false;
  const bones = [...Array(NB)].map(() => new THREE.Bone());
  bones.forEach(b => mesh.add(b));
  const skel = new THREE.Skeleton(bones, GE.inv.map(m => m.clone()));
  try { Object.defineProperty(skel, 'frame', { get(){ return -1; }, set(){} }); } catch(e){}
  mesh.bind(skel, new THREE.Matrix4());
  gG.add(mesh);
  G.mesh = mesh; G.gG = gG;
  G.trapper = new THREE.Object3D(); gG.add(G.trapper);
  const out = { M: [...Array(NB)].map(() => new THREE.Matrix4()) };
  const tmpQ = new THREE.Quaternion(), tmpS = V();
  let kitKey = '';
  G.setKit = function(abbr, name, num, o = {}){
    const k = o.kit || kitOf(abbr), key = abbr + '|' + name + '|' + num + '|' + (o.kit ? JSON.stringify(o.kit) : '');
    G.abbr = abbr; G.name = name; G.num = num;
    if(key === kitKey) return; kitKey = key;
    const run = () => { paintAtlas(atlas.getContext('2d'), k, abbr, name, num); tex.needsUpdate = true; };
    run(); G.repaint = run;
    const pal = palette(k), c = new THREE.Color();
    const c2 = new THREE.Color();
    GE.roles.forEach((r, i) => { if(Array.isArray(r)){ c.set(pal[r[0]] || '#ff00ff'); c.lerp(c2.set(pal[r[1]] || '#ff00ff'), clamp(r[2])); } else c.set(pal[r] || '#ff00ff'); col[i*3] = c.r; col[i*3 + 1] = c.g; col[i*3 + 2] = c.b; });
    geo.attributes.color.needsUpdate = true;
  };
  logoWait.push(function again(){ if(G.repaint) G.repaint(); logoWait.push(again); });
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if(G.repaint) setTimeout(G.repaint, 50); });

  /* where he stands in his crease, smoothed, so he shuffles and pushes and squares up instead of snapping */
  G.trk = { x: 0, z: .38, yaw: 0, ready: 0, slump: 0, vx: 0, ph: 0, post: 0, hold: 0, cele: 0, slide: 0, slideDir: 1, scr: 0, scrT: 0, scrPh: 0, scrLeg: 0, calm: 0 };
  G.fx = { scrape: null };
  let last = null, lastT = 0, xf = null, lastSrc = '';
  G.pose = function(Pq){
    const now = performance.now()/1000, dt = Math.min(.1, lastT ? now - lastT : 0); lastT = now;
    let R = Pq.rig || POSE.stance(), x = Pq.x, z = Pq.z == null ? .38 : Pq.z, yaw = Pq.yaw || 0;
    /* a new source (a shot starts or ends, a new screen): blend from where he was */
    if(last && (Pq.src !== lastSrc) && dt < .2) xf = { from: last, t: 0, dur: Pq.src === 'shot' ? .18 : .4 };
    lastSrc = Pq.src;
    const tgt = { R, x, z, yaw };
    let cur = tgt;
    if(xf){ xf.t += dt; const f = ease(clamp(xf.t/xf.dur)); cur = { R: mix(xf.from.R, R, f), x: lerp(xf.from.x, x, f), z: lerp(xf.from.z, z, f), yaw: lerp(xf.from.yaw, yaw, f) }; if(f >= 1) xf = null; }
    last = { R: cloneRig(cur.R), x: cur.x, z: cur.z, yaw: cur.yaw };
    gG.position.set(cur.x, 0, cur.z); gG.rotation.set(0, cur.yaw, 0);
    solve(cur.R, out);
    for(let i = 0; i < NB; i++){ out.M[i].decompose(bones[i].position, bones[i].quaternion, tmpS); bones[i].scale.set(1, 1, 1); }
    /* the pocket, for the puck he catches and holds */
    G.trapper.position.copy(TRAP).applyMatrix4(out.M[B.hL]);
    G.out = out; G.rigNow = cur.R;
    /* effects for the rink: g.fx.scrape = { p, dir, n } while a skate scrapes the crease (world space), else null */
    G.fx.scrape = null;
    if(Pq.fx && !xf){
      const ft = Pq.fx.leg ? B.ftL : B.ftR, p = V().setFromMatrixPosition(out.M[ft]); p.y = .01;
      gG.updateMatrixWorld(true);
      const pw = gG.localToWorld(p), dw = gG.localToWorld(p.clone().add(V(Pq.fx.s, 0, .35))).sub(pw).normalize();
      G.fx.scrape = { p: pw, dir: dw, n: Pq.fx.n };
    }
  };
  /* where a save meets the puck (world), so the puck flies to the gear that stops it */
  G.contact = function(spot){
    const o = G.out; if(!o) return G.base.localToWorld(V(0, .5, .5));
    let p;
    if(spot === 'gh') p = TRAP.clone().add(V(0, 0, .02)).applyMatrix4(o.M[B.hL]);
    else if(spot === 'bh') p = V(.0, .08, .11).applyMatrix4(o.M[B.hR]);
    else if(spot === 'fh'){ p = V(.06, .1, 0).applyMatrix4(o.M[B.stick]); p.y = .06; p.z += .03; }
    else { const sh = spot === 'lg' ? B.shL : B.shR; p = V(0, .3, .14).applyMatrix4(o.M[sh]); p.y = Math.max(.05, Math.min(p.y, .2)); }
    gG.updateMatrixWorld(true);
    return gG.localToWorld(p);
  };
  /* which end he is in: 0 the north net, 1 the south */
  G.setEnd = function(end){ G.end = end; G.base.position.set(0, 0, end ? (ctx.GS || 54.26) : 0); G.base.rotation.y = end ? Math.PI : 0; };
  G.setEnd(0);
  G.setKit('EDM', '', '');
  G.pose({ x: 0, z: .38, yaw: 0, rig: POSE.stance(), src: 'idle' });
  return G;
}

/* ===================================== TRACKING AND THE ANIMATION =====================================
   The goalie follows the puck round his crease: out to challenge when it is close, square to
   it, down into his stance once it is in his end; on the post when it is behind the line.
   Small moves are shuffles, big ones a T-push; he looks at the puck all the while. */
const tmpG = V();
function trackGoalie(g, dt){
  const pk = ctx.puck ? ctx.puck.position : V(0, 0, 10);
  const pl = g.base.worldToLocal(tmpG.copy(pk)), tr = g.trk;
  const ang = clamp(Math.atan2(pl.x, Math.max(.4, pl.z - .2)), -1.2, 1.2), dist = Math.hypot(pl.x, pl.z);
  const near = clamp(1 - (dist - 5)/20), R0 = .12 + .42*near*(1 - .45*Math.abs(ang));
  const k = 1 - Math.exp(-dt*5.5), ky = 1 - Math.exp(-dt*7);
  const behind = pl.z < .75 && Math.abs(pl.x) < 4.5 && dist < 5.5;
  const postT = behind ? (pl.x >= 0 ? 1 : -1) : 0;
  tr.post += (postT - tr.post)*(1 - Math.exp(-dt*6));
  const x0 = tr.x;
  const xT = behind ? Math.sign(pl.x)*.5 : clamp(Math.sin(ang)*R0*1.25, -.62, .62), zT = behind ? .2 : .3 + Math.cos(ang)*R0;
  tr.x += (xT - tr.x)*k; tr.z += (zT - tr.z)*k;
  tr.yaw += ((behind ? Math.sign(pl.x)*.5 : ang*.82) - tr.yaw)*ky;
  if(dt > 0) tr.vx += ((tr.x - x0)/dt - tr.vx)*(1 - Math.exp(-dt*10));
  tr.ph += Math.abs(tr.vx)*dt*7;
  tr.ready += ((dist < 22 ? 1 : 0) - tr.ready)*(1 - Math.exp(-dt*3));
  tr.slump = Math.max(0, tr.slump - dt*.35);
  tr.hold += ((g.hasPuck ? 1 : 0) - tr.hold)*(1 - Math.exp(-dt*5));
  /* a quick move across with the puck in tight (a pass through the slot): down into a butterfly slide, the push leg
     driving and the lead pad sealing the ice; he stays down a moment after it, then recovers to his feet */
  const fast = Math.abs(tr.vx) > .9 && dist < 5.6 && !behind && tr.hold < .5 && !tr.cele;
  tr.slide = tr.slide || 0;
  tr.slide += ((fast ? 1 : 0) - tr.slide)*(1 - Math.exp(-dt*(fast ? 11 : 1.6)));
  if(fast) tr.slideDir = tr.vx > 0 ? 1 : -1;
  /* nothing near (the play at the other end, a stoppage): every few seconds he scrapes his crease, one skate then the other */
  const calm = tr.ready < .35 && Math.abs(tr.vx) < .12 && tr.slump <= 0 && !tr.cele && tr.hold < .1 && tr.slide < .1;
  tr.calm = (tr.calm || 0) + ((calm ? 1 : 0) - (tr.calm || 0))*(1 - Math.exp(-dt*(calm ? 1.5 : 6)));
  tr.scrT = (tr.scrT || 0) + dt*(tr.calm > .5 ? 1 : 0);
  const CYC = 7.2, ph = tr.scrT % CYC;
  tr.scrPh = ph; tr.scrLeg = Math.floor(tr.scrT/CYC) % 2;
  tr.scr = tr.calm*smooth(.6, 1, ph)*(1 - smooth(3, 3.4, ph));
}
/* the puck in his own frame */
function puckLocal(g, x, z, yaw){
  const pk = ctx.puck ? ctx.puck.position : null; if(!pk || !g) return V(0, .4, 8);
  const p = g.base.worldToLocal(pk.clone()); p.x -= x; p.z -= z;
  return p.applyAxisAngle(V(0, 1, 0), -yaw);
}
function shotSeed(sh){ let h = 2166136261 >>> 0; for(const ch of String(sh.id) + sh.guess + sh.spot) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return h; }

function goaliePose(u, t, idle, pw, seed, g){
  const K = timeline();
  const tr = g && g.trk ? g.trk : { x: 0, z: .38, yaw: 0, ready: .7, slump: 0, vx: 0, ph: 0, post: 0, hold: 0, cele: 0, slide: 0, scr: 0 };
  let x = tr.x, z = tr.z, yaw = tr.yaw;
  if(!g){ x = 0; z = .38; yaw = 0; }
  const slump = Math.min(1, tr.slump), rd = tr.ready*(1 - slump);
  /* the base: stood up to ready */
  let R = mix(POSE.upright(), POSE.stance(), ease(clamp(rd)));
  /* breathing: the chest lifts and the shoulders with it (slower and deeper stood up), a bob in the knees; the glove
     hand pumps now and then and, stood up, the stick taps the ice, so he is never a statue */
  const sd = seed || 0, up = 1 - rd, bph = t*(1.55 + .5*rd) + sd, br = Math.sin(bph);
  R.pel.y += br*.006*rd; R.sp.x -= br*(.012 + .02*up); R.hd.x += br*.02*up;
  R.gl.p.y += br*(.008 + .006*up) + Math.sin(t*2.3 + 1 + sd)*.004*rd; R.bl.p.y += br*(.007 + .005*up);
  const pump = (t*.23 + sd*.37) % 1; if(pump < .08) R.close = Math.max(R.close, .55*Math.sin(pump/.08*Math.PI));
  const tap = (t + sd*3.1) % 5.3; if(tap < .55 && tr.scr < .05) R.sf = Math.max(R.sf, .32*up*Math.sin(tap/.55*Math.PI));
  /* moving across: a shuffle, or a T-push when it is quick */
  const v = tr.vx || 0, sp = Math.abs(v), dir = v >= 0 ? 1 : -1;
  const push = smooth(.55, 1.2, sp), shuf = smooth(.08, .35, sp)*(1 - push);
  if(shuf > 0){
    const ph = tr.ph*Math.PI*2, lead = dir > 0 ? 1 : 0, trail = 1 - lead;
    R.lg[lead].a.x += dir*.06*shuf*(.5 + .5*Math.sin(ph));
    R.lg[trail].a.x += dir*.05*shuf*(.5 + .5*Math.sin(ph - 1.4)) - dir*.04*shuf*Math.max(0, Math.sin(ph + .8));
    R.lg[trail].a.y += .012*shuf*Math.max(0, Math.cos(ph));
    R.pel.y -= .015*shuf; R.pel.x += dir*.02*shuf;
  }
  if(push > 0){
    const lead = dir > 0 ? 1 : 0, trail = 1 - lead, s = dir;
    const T = cloneRig(R);
    T.lg[lead] = leg(s, .46, L.ankle + .02, .12, .2, .5, .6, -.1, .2, 1, 1, 0, .25, 0, 1, 0);
    T.lg[trail] = leg(-s, .62, L.ankle, -.08, .2, .45, .5, -.2, .2, 1, .25, 0, 1, s*.45, 1, 0);
    T.lg[trail].u = V(s*.45, 1, 0); T.lg[lead].u = V(0, 1, 0);
    T.pel.y -= .05; T.pel.x += s*.05; T.pelR.y += s*.3; T.sp.y -= s*.3;
    R = mix(R, T, push);
  }
  /* the butterfly slide: down on the knees, the lead pad flat and reaching along the ice, the push leg still driving
     off its inside edge while the move is quick, the hands out in front and the shoulders square to the puck */
  if(tr.slide > .01){
    const s = tr.slideDir || 1, lead = s > 0 ? 1 : 0, trail = 1 - lead, k = ease(clamp(tr.slide)), drive = clamp((Math.abs(v) - .6)/1.8);
    const S = POSE.butterfly();
    S.pel.x += s*.05; S.pel.y += .03*drive; S.pelR.z -= s*.07; S.pelR.y += s*.1; S.sp.y -= s*.1; S.sp.x += .04;
    S.lg[lead].a.x += s*.1; S.lg[lead].f = V(-s*.15, .3, 1);
    S.lg[trail] = mix(S.lg[trail], leg(-s, .6, L.ankle, -.04, .25, .38, .45, -.2, .2, 1, .35, 0, 1, -.45, 1, 0), drive*.85);
    S.gl.p.x += s*.04; S.bl.p.x += s*.04; S.stk = V(s*.12, 0, .78);
    R = mix(R, S, k);
  }
  /* scraping the crease: weight on the plant leg, the other skate turned out on its inside edge, three strokes out
     across the ice and back (lifted on the way back), his eyes down on it */
  let scrapeFx = null;
  if(tr.scr > .01){
    const i = tr.scrLeg, s = i ? 1 : -1, k = ease(clamp(tr.scr)), st = (tr.scrPh - .6)*Math.PI*2/.9;
    const out = .5 - .5*Math.cos(st), back = Math.sin(st) < 0 ? 1 : 0;
    const Lg = R.lg[i], Pl = R.lg[1 - i];
    Lg.a = Lg.a.clone().lerp(V(s*(.22 + .3*out), L.ankle - .025*back*Math.sin(st), .02 + .1*out), k);
    Lg.t = Lg.t.clone().lerp(V(s*.75, 0, .7), k); Lg.u = Lg.u.clone().lerp(V(-s*.38*(1 - back), 1, 0), k);
    Lg.k = Lg.k.clone().lerp(V(s*.2, .55, .6), k);
    Pl.a = Pl.a.clone().lerp(V(-s*.2, L.ankle, -.02), k);
    R.pel = R.pel.clone().add(V(-s*.06*k, -.03*k*out, 0)); R.pelR = R.pelR.clone().add(V(.08*k, 0, s*.05*k));
    R.sp = R.sp.clone().add(V(.08*k, 0, 0));
    R.look = V(s*.35, 0, .45); R.lookW = 1; R.hd = R.hd.clone().add(V(.15*k, 0, 0));
    R.sf = R.sf*(1 - k);
    /* snow off the inside edge on the way out (for the rink to spray: g.fx.scrape) */
    if(!back && k > .6 && Math.sin(st) > .2) scrapeFx = { leg: i, s, n: Math.sin(st) };
  }
  /* on the post */
  const post = Math.abs(tr.post);
  if(post > .01) R = mix(R, POSE.rvh(tr.post > 0 ? 1 : -1), ease(post));
  /* holding the puck */
  if(tr.hold > .01) R = mix(R, POSE.hold(), ease(tr.hold));
  /* beaten: the head goes down; the first seconds he turns to look into the net behind him */
  if(slump > 0){
    const S = POSE.slump();
    if(tr.slump > 1.5){ const k = smooth(1.5, 2.2, tr.slump); S.look = V(.3, .5, -1.5); S.lookW = 1; S.hd = V(.2, 0, 0); S.sp.y = .35*k; S.pelR.y = .2*k; }
    R = mix(R, S, ease(slump));
  }
  /* a win */
  let celeK = 0;
  if(tr.cele > 0){
    if(tr.celeT0 == null) tr.celeT0 = t;
    const ct = t - tr.celeT0; celeK = smooth(0, .45, ct);
    const C = POSE.cele(); C.pel.y += .05*Math.abs(Math.sin(ct*4.2))*celeK; C.gl.p.y += .06*Math.sin(ct*6); C.bl.p.y += .06*Math.sin(ct*6 + 1.5);
    R = mix(R, C, celeK);
  } else tr.celeT0 = null;
  /* eyes on the puck */
  R.look = puckLocal(g, x, z, yaw); R.look.y = Math.max(R.look.y, .02);
  if(tr.scr > .01) R.look.lerp(V((tr.scrLeg ? 1 : -1)*.35, 0, .45), ease(clamp(tr.scr)));
  if(slump > 0 && tr.slump > 1.5) R.look = V(.3, .5, -1.5);
  if(tr.cele > 0) R.lookW = 0;

  /* ---- the shot ---- */
  const out = { x, z, yaw, splay: 0, rig: R, src: idle ? 'idle' : 'shot', fx: scrapeFx };
  if(!idle && celeK < 1){
    const sh = shotOf(), gs = sh.guess || 'fh', ver = sh.ver != null ? sh.ver : shotSeed(sh) % 2, S0 = SAVE[gs](ver);
    /* set: deeper as the shooter loads up */
    const set = smooth(K.load - .1, K.load, u)*(1 - smooth(K.shot - .02, K.shot + .02, u));
    R.pel.y -= .04*set; R.sp.x += .06*set; R.gl.p.y -= .03*set;
    /* the move: quick out of the blocks, settling into the save as the puck arrives */
    const k = easeOut(clamp((u - (K.shot - .018))/(K.hit - K.shot + .006)));
    const S = cloneRig(S0); S.look = R.look; S.lookW = 1;
    let Rs = mix(R, S, k);
    /* a reaction, not a tween: the save hand or pad goes a touch past and comes back as the puck hits */
    const ov = .11*Math.sin(Math.PI*clamp((u - K.hit + .012)/.05));
    if(ov > 0){
      const ext = (a, b, c) => a.clone().addScaledVector(c.clone().sub(b), ov);
      if(gs === 'gh' || gs === 'lg') Rs.gl.p = ext(Rs.gl.p, R.gl.p, S.gl.p);
      if(gs === 'bh' || gs === 'lb') Rs.bl.p = ext(Rs.bl.p, R.bl.p, S.bl.p);
      if(gs === 'lg' || gs === 'lb'){ const li = gs === 'lg' ? 1 : 0; Rs.lg[li].a = ext(Rs.lg[li].a, R.lg[li].a, S.lg[li].a); }
    }
    const pu = clamp((u - K.hit)/(1 - K.hit));
    const onIce = ICE_SAVE[gs][ver];
    if(u > K.hit){
      if(!sh.scored){
        if(gs === 'gh'){
          /* the snap, the squeeze, then the glove up to show he has it */
          const sq = smooth(0, .08, pu), show = smooth(.22, .5, pu);
          Rs.close = sq; Rs.gl.p = Rs.gl.p.clone().add(V(-.03, -.02, -.06).multiplyScalar(sq*(1 - show)));
          const showG = { p: V(.32, onIce ? .95 : 1.12, .3), f: V(-.1, 1, .45), n: V(.25, .55, .8) };
          Rs.gl = mix(Rs.gl, showG, show); Rs.close = 1;
          if(!onIce) Rs = mix(Rs, Object.assign(POSE.hold(), { gl: Rs.gl, close: 1, look: R.look }), smooth(.35, .8, pu)*.7);
        } else if(gs === 'bh'){
          /* steer it into the corner: the board turns out, then he comes back */
          const f = smooth(0, .12, pu);
          Rs.bl = mix(Rs.bl, { p: V(-.72, .9, .22), f: V(.1, 1, -.1), n: V(-.85, .05, .5) }, f);
          Rs = mix(Rs, R, smooth(.4, .9, pu));
        } else {
          /* pad and stick saves: the rebound goes, he holds the seal, then gets up (the far knee first) */
          const kick = smooth(0, .06, pu)*(1 - smooth(.06, .2, pu));
          if(!onIce && gs === 'lg'){ Rs.lg[1].a.x += .08*kick; }
          /* rebound control: the pad's face and the paddle turn to steer it to the corner, not back into the slot */
          const steer = smooth(0, .05, pu)*(1 - smooth(.3, .55, pu)), side = gs === 'lg' ? 1 : gs === 'lb' ? -1 : -1;
          if(gs !== 'fh'){ const li = side > 0 ? 1 : 0; Rs.lg[li].f = Rs.lg[li].f.clone().add(V(side*.45*steer, 0, 0)); }
          Rs.bd = Rs.bd.clone().lerp(V(1, 0, side*.45), steer);
          const up = smooth(.5, .95, pu);
          if(onIce){
            const half = cloneRig(Rs); const far = gs === 'lg' ? 0 : 1, sgn = far ? 1 : -1;
            half.lg[far] = leg(sgn, .3, L.ankle, .05, .15, .55, .65, -.15, .2, 1, .4, 0, 1, -.2, 1, 0);
            half.pel.y += .1; half.pel.x *= .5;
            Rs = mix(mix(Rs, half, smooth(.45, .7, pu)), R, smooth(.65, 1, pu));
          } else Rs = mix(Rs, R, up);
        }
      } else {
        /* scored on: the reach ends, he looks back into the net, his head drops */
        const f = smooth(.04, .3, pu), down = smooth(.45, 1, pu);
        const B2 = cloneRig(Rs);
        B2.look = V((sh.spot === 'gh' || sh.spot === 'lg') ? .5 : -.5, .4, -1.2); B2.lookW = 1;
        B2.sp.y += ((sh.spot === 'gh' || sh.spot === 'lg') ? 1 : -1)*.35; B2.sp.x -= .1;
        B2.gl.p = B2.gl.p.clone().lerp(V(.42, .45, .25), .6); B2.bl.p = B2.bl.p.clone().lerp(V(-.4, .45, .28), .5); B2.close = 0;
        Rs = mix(Rs, B2, f);
        const D = cloneRig(Rs); D.hd = V(.6, 0, 0); D.lookW = .1; D.sp.x += .15; D.gl.p.y -= .1;
        Rs = mix(Rs, D, down*.8);
      }
    }
    out.rig = celeK > 0 ? mix(Rs, R, celeK) : Rs;
    out.x = lerp(x, SAVE_X[gs], k); out.z = lerp(z, .42, k); out.yaw = lerp(yaw, 0, k);
    if(onIce) out.splay = k*(u > K.hit && !sh.scored ? 1 - smooth(.6, 1, pu) : 1);
  }
  if(tr.hold > .5) out.rig.close = Math.max(out.rig.close, tr.hold);
  return out;
}

return { makeGoalie, goaliePose, trackGoalie, POSE, SAVE, solve, buildGeo, B, logo, kitOf };
};
})();
