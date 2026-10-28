/* PUCK Faceoff: the look of the gameplay layer that came after app/faceoff.css (the shot menu,
   the forecheck call, the heater, the power play, the rebound, the TV replay, the skip button and
   the scoring summary). Injected once as a <style>, in the PUCK 26 colours (ember, chrome, mist). */
(function(){
const css = `
/* the scoreboard: a heater (three pips under the logo side) and the power play chip */
.sb-heat{position:absolute;top:4px;right:5px;display:flex;gap:2px;pointer-events:none}
.sb-tm.r .sb-heat{right:auto;left:5px}
.sb-heat i{width:5px;height:5px;border-radius:50%;background:rgba(255,255,255,.18);box-shadow:inset 0 0 0 1px rgba(0,0,0,.25)}
.sb-heat i.f{background:#ffb43a;box-shadow:0 0 5px rgba(255,150,40,.9)}
.sb-heat.on i{background:#ff5a2a;box-shadow:0 0 7px rgba(255,90,40,1);animation:fo-heat .7s ease-in-out infinite alternate}
.sb-heat.on i:nth-child(2){animation-delay:.12s}.sb-heat.on i:nth-child(3){animation-delay:.24s}
@keyframes fo-heat{to{transform:translateY(-2px) scale(1.25);background:#ffe08a}}
.sb-pp{font:900 italic 8.5px/1 var(--fo-game);letter-spacing:.03em;text-transform:uppercase;color:#fff;background:var(--tc,#d2232a);padding:2px 4px;border-radius:3px;white-space:nowrap;box-shadow:0 0 0 1px #ffd36a,0 0 8px rgba(255,170,50,.6);animation:fo-late 1.6s ease-in-out infinite}
.sb-pp b{font-variant-numeric:tabular-nums;color:#ffd36a}

/* two shot buttons side by side, and the forecheck call */
.fo-acts:has(.fo-quick){display:grid;grid-template-columns:1fr 1fr;gap:8px}
.fo-acts:has(.fo-quick) .fo-shoot{font-size:17px;min-height:52px;padding:0 10px;gap:7px}
.fo-acts:has(.fo-quick) .fo-shoot small{font-size:6.5px;letter-spacing:.08em}
.fo-acts:has(.fo-quick) .fo-shoot .tierchip{font-size:9px;padding:3px 5px}
.fo-shoot.fo-quick{background:linear-gradient(90deg,#d7e6f6,#8fb4dd 60%,#5f86b8);color:#06142a;box-shadow:0 0 18px rgba(143,180,221,.35)}
.fo-shoot.fo-quick small{color:#0d2346}
.fo-shoot.fo-fc{background:linear-gradient(90deg,#ff8a7a,#d2232a 70%,#8e0f15);color:#fff}
.fo-shoot.fo-fc small{color:#ffe1dc}
.fo-ppsay{display:block;color:#ffd36a;font-weight:800}
.fo-ppsay.sh{color:#ff8a7a}

/* the question: a 50-50 on a heater */
.fo-5050{flex:none;font:900 italic 11px/1 var(--fo-game);color:#1a0d00;background:linear-gradient(90deg,#ffe08a,#ff5a2a);padding:4px 7px;border-radius:4px;box-shadow:0 0 10px rgba(255,90,40,.6);animation:fo-pop .3s ease-out}
.fo-q .opt.gone{opacity:.18!important;filter:grayscale(1);text-decoration:line-through;pointer-events:none}
.fo-heated{display:block;margin-top:4px;font:900 italic 13px/1.2 var(--fo-game);text-transform:uppercase;color:#ffb43a;text-shadow:0 0 10px rgba(255,120,40,.6)}

/* the goalie's second spot against a quick shot */
.rink .spot.taken{animation:none;border-color:#fff;background:radial-gradient(circle,#fff 0 6px,rgba(255,255,255,.35) 7px,rgba(255,255,255,.12) 62%,transparent 64%);box-shadow:0 0 14px rgba(255,255,255,.7);cursor:default}
.rink .spot.taken span{color:#ffd36a}
.rink .shotres .mk[hidden]{display:none}

/* the TV replay: letterbox bars and the bug */
.rink .rbug{position:absolute;inset:0;pointer-events:none;z-index:4}
.rink .rbug[hidden]{display:none}
.rink .rbug > i{position:absolute;left:0;right:0;height:9%;background:#01040a;animation:fo-bars .35s cubic-bezier(.2,.9,.3,1)}
.rink .rbug > i:first-child{top:0}.rink .rbug > i:nth-child(2){bottom:0}
@keyframes fo-bars{from{height:0}}
.rink .rbug b{position:absolute;left:14px;top:calc(9% + 12px);padding:5px 12px 5px 22px;transform:skewX(-10deg);background:linear-gradient(90deg,#ffe08a,#f08a17 70%,#d06a08);color:#1a0d00;font:900 italic 16px/1 'Exo 2',sans-serif;text-transform:uppercase;letter-spacing:.06em;box-shadow:0 0 18px rgba(255,170,50,.5)}
.rink .rbug b::before{content:"";position:absolute;left:9px;top:50%;width:7px;height:7px;margin-top:-3.5px;border-radius:50%;background:#d2232a;animation:fo-late .8s ease-in-out infinite}

/* tap to skip: while you watch */
.fo-skip{position:absolute;right:max(12px,env(safe-area-inset-right,0px));bottom:calc(var(--dockH,120px) + 12px);z-index:6;display:flex;align-items:center;gap:6px;padding:8px 12px;border:0;border-radius:6px;transform:skewX(-10deg);background:rgba(6,18,38,.78);color:#e8f3ff;font:8px/1 var(--fo-wide);letter-spacing:.14em;text-transform:uppercase;box-shadow:inset 0 0 0 1px rgba(143,180,221,.35);cursor:pointer;animation:fo-pop .3s ease-out}
.fo-skip[hidden]{display:none}
.fo-skip i{font:900 italic 16px/1 var(--fo-game);color:#ffd36a;font-style:normal}

/* the scoring summary on the final screen */
.fo-sum{list-style:none;margin:0;padding:0;width:100%;display:grid;gap:4px}
.fo-sum li{display:flex;align-items:center;gap:8px;padding:6px 10px;border-left:3px solid var(--tc);background:linear-gradient(90deg,color-mix(in srgb,var(--tc) 30%,transparent),rgba(10,30,60,.2));text-align:left;min-width:0}
.fo-sum li img{width:22px;height:22px;flex:none}
.fo-sum-n{flex:1;min-width:0;display:flex;align-items:baseline;gap:6px;overflow:hidden}
.fo-sum-n b{font:900 italic 14px/1.1 var(--fo-game);text-transform:uppercase;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fo-sum-n small{font:7px/1 var(--fo-wide);letter-spacing:.12em;text-transform:uppercase;color:var(--mist,#9fc0e6)}
.fo-chip{flex:none;font:900 italic 9.5px/1 var(--fo-game);text-transform:uppercase;font-style:normal;padding:3px 6px;border-radius:3px;background:rgba(143,180,221,.2);color:#cfe0f3;box-shadow:inset 0 0 0 1px rgba(143,180,221,.35)}
.fo-chip.pp{background:linear-gradient(90deg,#ffe08a,#f08a17);color:#1a0d00;box-shadow:none}
.fo-sum-s{flex:none;font:900 italic 15px/1 var(--fo-game);color:#ffd36a;font-variant-numeric:tabular-nums;min-width:30px;text-align:right}
@media (prefers-reduced-motion:reduce){ .sb-heat.on i,.rink .rbug > i,.fo-skip,.fo-5050{animation:none!important} }
`;
const st = document.createElement('style');
st.id = 'fo-look';
st.textContent = css;
document.head.appendChild(st);
})();
