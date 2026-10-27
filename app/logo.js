/* The Faceoff logo and the logo puck, lifted from _brand/logo/index.html (the
   reference build). Change it there first, then copy here. */
(function(){
let uid = 0;
function rng(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; }; }

/* ---------- THE PUCK: viewBox 200 x 140, top face centre (100,58), rx 88, ry 32, 30 thick ---------- */
function puck(o = {}){
  const id = 'p' + (uid++), cx = 100, cy = 56, rx = 88, ry = 37, h = 30, s = ry/rx;
  const detail = o.detail !== false, ring = 66;
  const side = `M${cx - rx} ${cy} A${rx} ${ry} 0 0 0 ${cx + rx} ${cy} L${cx + rx} ${cy + h} A${rx} ${ry} 0 0 1 ${cx - rx} ${cy + h} Z`;
  return `<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="${id}sd" x1="0" x2="1"><stop offset="0" stop-color="#030405"/><stop offset=".16" stop-color="#15191e"/><stop offset=".3" stop-color="#2e353e"/><stop offset=".42" stop-color="#14181d"/><stop offset=".8" stop-color="#07090b"/><stop offset="1" stop-color="#010101"/></linearGradient>
    <linearGradient id="${id}sv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".7" stop-color="#000" stop-opacity=".15"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></linearGradient>
    <radialGradient id="${id}tp" cx=".38" cy=".3" r=".75"><stop offset="0" stop-color="#434b56"/><stop offset=".45" stop-color="#22272e"/><stop offset="1" stop-color="#0a0c0f"/></radialGradient>
    <linearGradient id="${id}au" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset=".3" stop-color="#f3cd6b"/><stop offset=".6" stop-color="#c99a2e"/><stop offset=".85" stop-color="#f6d57c"/><stop offset="1" stop-color="#8a6512"/></linearGradient>
    <pattern id="${id}kn" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="none"/><path d="M0 0H5M0 0V5" stroke="#505a66" stroke-width=".9"/></pattern>
    <clipPath id="${id}sc"><path d="${side}"/></clipPath>
    <clipPath id="${id}tc"><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}"/></clipPath>
    <filter id="${id}gr" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency="1.4" numOctaves="2" seed="7"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 .55 -.18"/><feComposite in2="SourceGraphic" operator="in"/></filter>
    <filter id="${id}bl" x="-.3" y="-.3" width="1.6" height="1.6"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="${id}bs" x="-.5" y="-.5" width="2" height="2"><feGaussianBlur stdDeviation="1.2"/></filter>
    <path id="${id}ta" d="M-73 0 A73 73 0 0 1 73 0"/><path id="${id}tb" d="M-83 0 A83 83 0 0 0 83 0"/>
  </defs>
  ${o.shadow !== false ? `<ellipse cx="${cx + 4}" cy="${cy + h + 4}" rx="${rx + 4}" ry="${ry * .62}" fill="#000" opacity=".42" filter="url(#${id}bl)"/>` : ''}
  <path d="${side}" fill="url(#${id}sd)"/>
  ${detail ? `<g clip-path="url(#${id}sc)"><rect x="${cx - rx}" y="${cy + 4}" width="${rx*2}" height="${h + ry}" fill="url(#${id}kn)" opacity=".75"/>
    <path d="${side}" fill="url(#${id}sd)" opacity=".55"/>
    <path d="M${cx - rx} ${cy + 3} A${rx} ${ry} 0 0 0 ${cx + rx} ${cy + 3}" fill="none" stroke="#3a424c" stroke-width="1.4"/>
    <path d="M${cx - rx} ${cy + h - 3} A${rx} ${ry} 0 0 0 ${cx + rx} ${cy + h - 3}" fill="none" stroke="#2b3139" stroke-width="1.2"/>
    <rect x="${cx - 46}" y="${cy}" width="16" height="${h + ry + 4}" fill="#9fb6ca" opacity=".22" filter="url(#${id}bs)"/></g>` : ''}
  <path d="${side}" fill="url(#${id}sv)"/>
  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id}tp)"/>
  ${detail ? `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" filter="url(#${id}gr)" opacity=".5"/>` : ''}
  <g transform="translate(${cx} ${cy}) scale(1 ${s.toFixed(4)})">
    <g class="spin">
      <g transform="translate(0 3)" fill="none" stroke="#000" opacity=".55"><circle r="${ring}" stroke-width="6"/><circle r="${ring - 16}" stroke-width="2"/></g>
      <circle r="${ring}" fill="none" stroke="url(#${id}au)" stroke-width="5.5"/>
      <circle r="${ring - 16}" fill="none" stroke="url(#${id}au)" stroke-width="2"/>
      ${detail ? `<g font-family="Barlow Semi Condensed, Arial Narrow, sans-serif" font-weight="800" font-size="11.5" letter-spacing="1.1" text-anchor="middle">
        <text fill="#000" opacity=".6" transform="translate(0 2)"><textPath href="#${id}ta" startOffset="50%">FELIX · ALEJANDRO · MARTIJN</textPath></text>
        <text fill="url(#${id}au)"><textPath href="#${id}ta" startOffset="50%">FELIX · ALEJANDRO · MARTIJN</textPath></text>
        <text fill="#000" opacity=".6" transform="translate(0 2)" font-size="14" letter-spacing="3"><textPath href="#${id}tb" startOffset="50%">MCJESUS · 2026</textPath></text>
        <text fill="url(#${id}au)" font-size="14" letter-spacing="3"><textPath href="#${id}tb" startOffset="50%">MCJESUS · 2026</textPath></text></g>` : ''}
      <path transform="translate(0 2.5)" d="${star(0, 0, 34, 14)}" fill="#000" opacity=".5"/>
      <path d="${star(0, 0, 34, 14)}" fill="url(#${id}au)"/>
      <path d="${star(0, 0, 34, 14)}" fill="none" stroke="#fff3c4" stroke-width="1" opacity=".5"/>
    </g>
  </g>
  <path d="${rimArc(cx, cy, rx - 1, ry - 1, 188, 262)}" fill="none" stroke="#c9d8e6" stroke-width="2" stroke-linecap="round" opacity=".6"/>
  <path d="${rimArc(cx, cy, rx - 1, ry - 1, 200, 238)}" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>
  <path d="M${cx - rx} ${cy} A${rx} ${ry} 0 0 0 ${cx + rx} ${cy}" fill="none" stroke="#5a6572" stroke-width="1" opacity=".7"/>
</svg>`;
}
function rimArc(cx, cy, rx, ry, a0, a1){ const P = a => [cx + rx*Math.cos(a*Math.PI/180), cy + ry*Math.sin(a*Math.PI/180)].map(v => v.toFixed(2)).join(' '); return 'M' + P(a0) + ' A' + rx + ' ' + ry + ' 0 0 1 ' + P(a1); }
function star(x, y, R, r){ let d = ''; for(let i = 0; i < 10; i++){ const a = -Math.PI/2 + i*Math.PI/5, q = i % 2 ? r : R; d += (i ? 'L' : 'M') + (x + Math.cos(a)*q).toFixed(2) + ' ' + (y + Math.sin(a)*q).toFixed(2); } return d + 'Z'; }

/* ---------- snow: a fan of ice chips flying forward off the stop ---------- */
function spray(seed = 11){
  const r = rng(seed); let dots = '', id = 's' + (uid++);
  for(let i = 0; i < 90; i++){
    const a = -.15 - r()*1.1, d = 10 + Math.pow(r(), .8)*120, x = 8 + Math.cos(a)*d, y = 96 + Math.sin(a)*d*.62 + r()*6;
    const s = .6 + r()*r()*3.2, op = (1 - d/150)*.95, col = r() < .3 ? '#cfe6f7' : '#ffffff';
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s.toFixed(2)}" fill="${col}" opacity="${op.toFixed(2)}"${s > 2.6 ? ` filter="url(#${id}b)"` : ''}/>`;
  }
  return `<svg viewBox="0 0 160 110" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs>
    <filter id="${id}b" x="-1" y="-1" width="3" height="3"><feGaussianBlur stdDeviation=".8"/></filter>
    <filter id="${id}c" x="-.5" y="-.5" width="2" height="2"><feGaussianBlur stdDeviation="5"/></filter>
    <radialGradient id="${id}g" cx=".1" cy=".85" r=".9"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset=".5" stop-color="#e6f2fb" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
    <path d="M0 104 Q30 60 95 46 Q70 78 120 70 Q60 100 0 108Z" fill="url(#${id}g)" filter="url(#${id}c)"/>${dots}</svg>`;
}

/* ---------- the 3D block, as in BALL's reference build ---------- */
function block({depth = 10, step = .009, from, to, outline, ow = .018}){
  const mix = (a, b, t) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const A = p(a), B = p(b);
    return '#' + A.map((x, i) => Math.round(x + (B[i] - x)*t).toString(16).padStart(2, '0')).join(''); };
  const s = [];
  for(let a = 0; a < 360; a += 45){ const r = a*Math.PI/180; s.push((Math.cos(r)*ow).toFixed(3) + 'em ' + (Math.sin(r)*ow).toFixed(3) + 'em 0 ' + outline); }
  for(let i = 1; i <= depth; i++){ const d = (i*step + ow*.7).toFixed(3); s.push(d + 'em ' + d + 'em 0 ' + mix(from, to, i/depth)); }
  const e = (depth*step + ow).toFixed(3); s.push(e + 'em ' + e + 'em 0 ' + outline);
  s.push((depth*step + .05).toFixed(3) + 'em ' + (depth*step + .07).toFixed(3) + 'em .06em rgba(0,0,0,.45)');
  return s.join(',');
}
const COLORS = { blockFrom: '#e0312b', blockTo: '#4e090d', outline: '#0a1424' };
const lines = w => '<span class="lines">' + w.map((x, i) => '<i style="width:' + x + 'em;top:' + (i*(.5/(w.length - 1))).toFixed(3) + 'em;opacity:' + (i === 1 || i === 2 ? 1 : .6) + '"></i>').join('') + '</span>';
function ghosts(n = 3, gap = .22){
  let g = '<span class="ghosts">';
  for(let k = n; k >= 1; k--) g += '<span class="g" style="transform:translateX(-' + (k*gap) + 'em);opacity:' + (.3 - k*.07).toFixed(2) + ';filter:blur(' + (k*.014) + 'em)">' + puck({ detail: false, shadow: false }) + '</span>';
  return g + '</span>';
}
function faceoff({ tagline = true } = {}){
  const word = 'PUCK'.split('').map(l => '<span class="L" data-l="' + l + '">' + l + '</span>').join('');
  return '<div class="logo"><span class="glow"></span><span class="pk">' + lines([1.55, 1.2, 1.4, .8]) + ghosts() + '<span class="g">' + puck() + '</span><span class="spray">' + spray() + '</span></span>' +
    '<span class="word" style="text-shadow:' + block({ from: COLORS.blockFrom, to: COLORS.blockTo, outline: COLORS.outline }) + '">' + word + '</span>' +
    (tagline ? '<span class="tagbar"><span>Hockey quiz</span></span>' : '') + '</div>';
}
window.PUCK = window.PUCK || {};
window.PUCK.brand = { faceoff, puck, spray };
})();
