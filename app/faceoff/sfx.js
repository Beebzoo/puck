/* PUCK Faceoff sounds: all made on the spot with WebAudio, no files.
   P.sfx.play(name) for: pass, catch, right, wrong, tick, whistle, shot, horn, save, post, steal, big, heat, swoosh.
   P.sfx.on (true/false) is remembered on this phone; the first tap anywhere wakes the audio up
   (browsers keep it asleep until someone touches the page). */
(function(){
const P = window.PUCK = window.PUCK || {};
const KEY = 'puck.sfx';
let ctx = null, master = null, noiseBuf = null;
let on = true; try { on = localStorage.getItem(KEY) !== '0'; } catch(e){}
function wake(){
  if(ctx){ if(ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx; }
  const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return null;
  try { ctx = new AC(); } catch(e){ return null; }
  master = ctx.createGain(); master.gain.value = .55; master.connect(ctx.destination);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate*2, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0); for(let i = 0; i < d.length; i++) d[i] = Math.random()*2 - 1;
  return ctx;
}
['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, () => { if(on) wake(); }, { passive: true }));
/* building blocks: a tone with an envelope, and filtered noise */
function tone(f, t0, dur, o = {}){
  const osc = ctx.createOscillator(), g = ctx.createGain();
  osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(f, t0);
  if(o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
  const v = o.vol == null ? .3 : o.vol, a = o.attack || .005;
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v, t0 + a); g.gain.exponentialRampToValueAtTime(.0005, t0 + dur);
  let node = osc;
  if(o.lp){ const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = o.lp; node.connect(f2); node = f2; }
  node.connect(g); g.connect(o.dest || master); osc.start(t0); osc.stop(t0 + dur + .05);
  return osc;
}
function noise(t0, dur, o = {}){
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf; src.loop = true;
  f.type = o.type || 'bandpass'; f.frequency.value = o.f || 1000; f.Q.value = o.q || 1;
  const v = o.vol == null ? .3 : o.vol, a = o.attack || .004;
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(v, t0 + a);
  if(o.hold) g.gain.setValueAtTime(v, t0 + a + o.hold);
  g.gain.exponentialRampToValueAtTime(.0005, t0 + dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t0, Math.random()); src.stop(t0 + dur + .05);
}
const SOUNDS = {
  /* blade on puck: a woody tock */
  pass(t){ noise(t, .07, { f: 1800, q: 2.5, vol: .5 }); tone(190, t, .09, { vol: .35, to: 120 }); },
  catch(t){ noise(t, .05, { f: 1200, q: 2, vol: .25 }); tone(150, t, .06, { vol: .2 }); },
  right(t){ tone(660, t, .14, { type: 'triangle', vol: .22 }); tone(990, t + .08, .22, { type: 'triangle', vol: .22 }); },
  wrong(t){ tone(160, t, .3, { type: 'sawtooth', vol: .14, lp: 700, to: 110 }); tone(120, t + .02, .3, { type: 'square', vol: .06, lp: 500 }); },
  tick(t){ tone(1500, t, .035, { type: 'square', vol: .05, lp: 3000 }); },
  /* the ref's whistle: two close tones with a flutter */
  whistle(t){ const o = tone(2900, t, .42, { vol: .09, attack: .02 }); const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = 32; lg.gain.value = 70; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + .45); tone(3080, t, .4, { vol: .05, attack: .02 }); },
  /* the slap: a crack, then the puck away */
  shot(t){ noise(t, .12, { f: 2500, q: .8, vol: .6, type: 'highpass' }); tone(95, t, .14, { vol: .4, to: 50 }); },
  /* the goal horn and the building going up */
  horn(t){
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.2, t + .06); g.gain.setValueAtTime(.2, t + 1.7); g.gain.exponentialRampToValueAtTime(.0005, t + 2.3); g.connect(master);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300; lp.connect(g);
    for(const f of [174.6, 220, 261.6]){ const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(t); o.stop(t + 2.4); }
    noise(t + .05, 3, { f: 900, q: .5, vol: .22, attack: .4, hold: 1.2 });
  },
  /* a save: pad thud and an "ohh" from the crowd */
  save(t){ tone(85, t, .18, { vol: .45, to: 55 }); noise(t, .1, { f: 600, q: 1, vol: .3 }); noise(t + .08, 1.3, { f: 500, q: .7, vol: .12, attack: .2 }); },
  steal(t){ noise(t, .06, { f: 1400, q: 2, vol: .4 }); tone(240, t, .2, { type: 'triangle', vol: .12, to: 140 }); },
  /* a big moment: breakaway, one-timer, hat trick */
  big(t){ [523, 659, 784, 1046].forEach((f, i) => tone(f, t + i*.07, .28, { type: 'triangle', vol: .16 })); noise(t + .1, 1, { f: 900, q: .6, vol: .1, attack: .25 }); },
  /* on a heater: a quick rising sweep with a crackle on top */
  heat(t){ tone(330, t, .35, { type: 'sawtooth', vol: .08, lp: 2200, to: 990 }); noise(t + .05, .45, { f: 3800, q: 1.2, vol: .12, attack: .05 }); tone(1320, t + .3, .25, { type: 'triangle', vol: .12 }); },
  /* the TV replay wipe: a filtered whoosh */
  swoosh(t){ noise(t, .45, { f: 1400, q: .9, vol: .22, attack: .18 }); tone(220, t, .4, { type: 'sine', vol: .06, to: 660 }); }
};
P.sfx = {
  play(name){
    if(!on || !SOUNDS[name]) return;
    const c = wake(); if(!c || c.state !== 'running') return;
    try { SOUNDS[name](c.currentTime + .01); } catch(e){}
  },
  get on(){ return on; },
  set on(v){ on = !!v; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch(e){} if(on) wake(); }
};
})();
