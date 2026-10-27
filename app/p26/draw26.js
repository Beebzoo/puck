/* PUCK 26 drawing helpers: _brand/puck26/source/draw.js, unchanged, wrapped so its
   names (uid, S, C, TEAMS, LOGO...) stay private. Logos come from app/assets/teams.
   Exposes PUCK.d26 = { chrome, CHROME, EMBER, puck, spray, rng, mix, nest }. */
(function(){
const CODES = ["ANA","BOS","BUF","CAR","CBJ","CGY","CHI","COL","DAL","DET","EDM","FLA","LAK","MIN","MTL","NJD","NSH","NYI","NYR","OTT","PHI","PIT","SEA","SJS","STL","TBL","TOR","UTA","VAN","VGK","WPG","WSH","NHL"];
window.PUCK_LOGOS = { light: {}, dark: {} };
for(const c of CODES){ window.PUCK_LOGOS.light[c] = "app/assets/teams/" + c + ".svg"; window.PUCK_LOGOS.dark[c] = "app/assets/teams/" + c + "_dark.svg"; }
// Drawing functions shared by the PUCK logo pages: puck(), chrome() (the chrome 3D text), CHROME/EMBER
// palettes, word()/crest() (the Crest logo), spray(), rng(), mix(), nest(). They read the team logos
// from window.PUCK_LOGOS = { light: {CODE: url}, dark: {CODE: url} } (in the app: ../logo-faceoff/logos/).
let uid = 0;
const S = { shield: '1', centre: 'leaf', stamp: 'sweater', stitch: '0', depth: '7', names: '1' };
const LOGO = window.PUCK_LOGOS || { light: {}, dark: {} };
const TEAMS = ['ANA','BOS','BUF','CGY','CAR','CHI','COL','CBJ','DAL','DET','EDM','FLA','LAK','MIN','MTL','NSH','NJD','NYI','NYR','OTT','PHI','PIT','SEA','SJS','STL','TBL','TOR','UTA','VAN','VGK','WSH','WPG'];
function olympic(r){
  const w = r*.22, top = -r*.45, bot = r*.55;
  return [[-2.2*r, top, '#0081C8'], [0, top, C.cream], [2.2*r, top, '#EE334E'], [-1.1*r, bot, '#FCB131'], [1.1*r, bot, '#00A651']]
    .map(([x, y, c]) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="none" stroke="${c}" stroke-width="${w.toFixed(1)}"/>`).join('');
}
function centreMark(centre, sw, id){
  if(centre === 'leaf') return `<path transform="translate(0 2.5) ${LEAF_T}" d="${LEAF}" fill="#000" opacity=".5"/>` + (sw
    ? `<path transform="${LEAF_T}" d="${LEAF}" fill="${C.red}" stroke="${C.cream}" stroke-width="170" stroke-linejoin="round" paint-order="stroke"/>`
    : `<path transform="${LEAF_T}" d="${LEAF}" fill="url(#${id}au)"/>`);
  if(centre === 'rings') return olympic(13.5);
  return LOGO.dark[centre] ? `<image href="${LOGO.dark[centre]}" x="-50" y="-33" width="100" height="66"/>` : '';
}
const C = { cream: '#F8F1DD', blue: '#1F4FA8', red: '#D2232A', navy: '#16283f', out: '#0a1424', thread: '#9c8458' };
const F = 'font-family="Barlow Semi Condensed, Arial Narrow, sans-serif" font-style="italic"';
function rng(seed){ return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; }; }
const mix = (a, b, t) => { const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); const A = p(a), B = p(b);
  return '#' + A.map((x, i) => Math.round(x + (B[i] - x)*t).toString(16).padStart(2, '0')).join(''); };
const nest = (svg, x, y, w, ratio) => svg.replace('<svg ', `<svg x="${x}" y="${y}" width="${w}" height="${(w*ratio).toFixed(1)}" overflow="visible" `);

/* ---------- the puck (as on the logo page), with a sweater or gold stamp ---------- */
function puck(o = {}){
  const id = 'p' + (uid++), cx = 100, cy = 56, rx = 88, ry = 37, h = 30, s = ry/rx;
  const detail = o.detail !== false, names = detail && (o.names ?? S.names === '1'), ring = 66, sw = (o.stamp || S.stamp) === 'sweater';
  const side = `M${cx - rx} ${cy} A${rx} ${ry} 0 0 0 ${cx + rx} ${cy} L${cx + rx} ${cy + h} A${rx} ${ry} 0 0 1 ${cx - rx} ${cy + h} Z`;
  const stamp = sw
    ? `<linearGradient id="${id}au" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffaf0"/><stop offset=".5" stop-color="#efe4c6"/><stop offset="1" stop-color="#cdbd94"/></linearGradient>`
    : `<linearGradient id="${id}au" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0b8"/><stop offset=".3" stop-color="#f3cd6b"/><stop offset=".6" stop-color="#c99a2e"/><stop offset=".85" stop-color="#f6d57c"/><stop offset="1" stop-color="#8a6512"/></linearGradient>`;
  return `<svg viewBox="0 0 200 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="${id}sd" x1="0" x2="1"><stop offset="0" stop-color="#030405"/><stop offset=".16" stop-color="#15191e"/><stop offset=".3" stop-color="#2e353e"/><stop offset=".42" stop-color="#14181d"/><stop offset=".8" stop-color="#07090b"/><stop offset="1" stop-color="#010101"/></linearGradient>
    <linearGradient id="${id}sv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset=".7" stop-color="#000" stop-opacity=".15"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></linearGradient>
    <radialGradient id="${id}tp" cx=".38" cy=".3" r=".75"><stop offset="0" stop-color="#434b56"/><stop offset=".45" stop-color="#22272e"/><stop offset="1" stop-color="#0a0c0f"/></radialGradient>
    ${stamp}
    <pattern id="${id}kn" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="none"/><path d="M0 0H5M0 0V5" stroke="#505a66" stroke-width=".9"/></pattern>
    <clipPath id="${id}sc"><path d="${side}"/></clipPath>
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
      ${names ? `<g font-family="Barlow Semi Condensed, Arial Narrow, sans-serif" font-weight="800" font-size="11.5" letter-spacing="1.1" text-anchor="middle">
        <text fill="#000" opacity=".6" transform="translate(0 2)"><textPath href="#${id}ta" startOffset="50%">FELIX · ALEJANDRO · MARTIJN</textPath></text>
        <text fill="url(#${id}au)"><textPath href="#${id}ta" startOffset="50%">FELIX · ALEJANDRO · MARTIJN</textPath></text>
        <text fill="#000" opacity=".6" transform="translate(0 2)" font-size="14" letter-spacing="3"><textPath href="#${id}tb" startOffset="50%">MCJESUS · 2026</textPath></text>
        <text fill="url(#${id}au)" font-size="14" letter-spacing="3"><textPath href="#${id}tb" startOffset="50%">MCJESUS · 2026</textPath></text></g>` : ''}
      ${centreMark(o.centre || S.centre, sw, id)}
    </g>
  </g>
  <path d="${rimArc(cx, cy, rx - 1, ry - 1, 188, 262)}" fill="none" stroke="#c9d8e6" stroke-width="2" stroke-linecap="round" opacity=".6"/>
  <path d="${rimArc(cx, cy, rx - 1, ry - 1, 200, 238)}" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".8"/>
  <path d="M${cx - rx} ${cy} A${rx} ${ry} 0 0 0 ${cx + rx} ${cy}" fill="none" stroke="#5a6572" stroke-width="1" opacity=".7"/>
</svg>`;
}
/* the maple leaf from the Canadian flag (public symbol), drawn in flag units and scaled to the stamp */
const LEAF = 'm4890 4430-45-863a95 95 0 0 1 111-98l859 151-116-320a65 65 0 0 1 20-73l941-762-212-99a65 65 0 0 1-34-79l186-572-542 115a65 65 0 0 1-73-38l-105-247-423 454a65 65 0 0 1-111-57l204-1052-327 189a65 65 0 0 1-91-27l-332-652-332 652a65 65 0 0 1-91 27l-327-189 204 1052a65 65 0 0 1-111 57l-423-454-105 247a65 65 0 0 1-73 38l-542-115 186 572a65 65 0 0 1-34 79l-212 99 941 762a65 65 0 0 1 20 73l-116 320 859-151a95 95 0 0 1 111 98l-45 863z';
const LEAF_T = 'scale(.0195) translate(-4800 -2330)';
function rimArc(cx, cy, rx, ry, a0, a1){ const P = a => [cx + rx*Math.cos(a*Math.PI/180), cy + ry*Math.sin(a*Math.PI/180)].map(v => v.toFixed(2)).join(' '); return 'M' + P(a0) + ' A' + rx + ' ' + ry + ' 0 0 1 ' + P(a1); }
function star(x, y, R, r){ let d = ''; for(let i = 0; i < 10; i++){ const a = -Math.PI/2 + i*Math.PI/5, q = i % 2 ? r : R; d += (i ? 'L' : 'M') + (x + Math.cos(a)*q).toFixed(2) + ' ' + (y + Math.sin(a)*q).toFixed(2); } return d + 'Z'; }

/* ---------- snow off the puck's front edge ---------- */
function spray(seed = 11, n = 90){
  const r = rng(seed); let dots = '', id = 's' + (uid++);
  for(let i = 0; i < n; i++){
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

/* ---------- the word, in SVG: baseline at y 0, caps from -0.7em; optional block, stripes, stitching ---------- */
function word(o = {}){
  const { text = 'PUCK', size = 200, len = 440, depth = +S.depth, k = size*.0105, stripes = true, stitch = S.stitch === '1', outlines = null, shine = true, weight = 900 } = o;
  const id = 'w' + (uid++), top = -.7*size, ch = .7*size, W = len || size*.6;
  const T = (attrs, tr) => `<text x="0" y="0" font-size="${size}" font-weight="${weight}" ${F}${len ? ` textLength="${len}" lengthAdjust="spacingAndGlyphs"` : ''}${tr ? ` transform="${tr}"` : ''} ${attrs}>${text}</text>`;
  let s = `<defs><clipPath id="${id}c">${T('')}</clipPath>
    <linearGradient id="${id}sh" gradientUnits="userSpaceOnUse" x1="0" y1="${top}" x2="0" y2="${top + ch*.32}"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <filter id="${id}b" x="-.2" y="-.2" width="1.4" height="1.4"><feGaussianBlur stdDeviation="${size*.02}"/></filter>
    ${stitch ? `<mask id="${id}m" maskUnits="userSpaceOnUse" x="-100" y="${-size*1.2}" width="${W + 300}" height="${size*1.6}">
      ${T(`fill="none" stroke="#fff" stroke-width="${size*.072}" stroke-dasharray="${size*.024} ${size*.018}"`)}${T(`fill="none" stroke="#000" stroke-width="${size*.05}"`)}</mask>` : ''}</defs>`;
  if(depth){
    const e = depth*k;
    s += T(`fill="#000" opacity=".45" filter="url(#${id}b)"`, `translate(${e + size*.03} ${e + size*.04})`);
    for(let i = depth; i >= 1; i--) s += T(`fill="${C.out}" stroke="${C.out}" stroke-width="${size*.036}" stroke-linejoin="round"`, `translate(${(i*k).toFixed(2)} ${(i*k).toFixed(2)})`);
    for(let i = depth; i >= 1; i--){ const c = mix('#e0312b', '#3a0609', i/depth); s += T(`fill="${c}" stroke="${c}" stroke-width="${size*.012}" stroke-linejoin="round"`, `translate(${(i*k).toFixed(2)} ${(i*k).toFixed(2)})`); }
  }
  if(outlines) outlines.forEach(([c, w]) => s += T(`fill="${c}" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"`));
  s += outlines ? T(`fill="${C.cream}"`) : T(`fill="${C.cream}" stroke="${C.out}" stroke-width="${size*.036}" stroke-linejoin="round" paint-order="stroke"`);
  s += `<g clip-path="url(#${id}c)">`;
  if(stripes) s += `<rect x="-60" y="${top + ch*.56}" width="${W + 120}" height="${ch*.095}" fill="${C.blue}"/><rect x="-60" y="${top + ch*.7}" width="${W + 120}" height="${ch*.095}" fill="${C.blue}"/>`;
  if(shine) s += `<rect x="-60" y="${top - 10}" width="${W + 120}" height="${ch*.4}" fill="url(#${id}sh)"/>`;
  if(stitch) s += `<rect x="-60" y="${top - 20}" width="${W + 120}" height="${ch + 40}" fill="${C.thread}" mask="url(#${id}m)"/>`;
  return s + '</g>';
}

/* ---------- the HOCKEY QUIZ bar, at the letters' slant (about 12°) ---------- */
function bar(x0, y0, w, h, stitch = false){
  const id = 'b' + (uid++), s = h*.21, pts = `${x0 + s},${y0} ${x0 + w + s},${y0} ${x0 + w},${y0 + h} ${x0},${y0 + h}`, ls = h*.34;
  const thread = stitch ? `<path d="M${x0 + s + 8} ${y0 + 5.5} L${x0 + w + s - 10} ${y0 + 5.5}" stroke="${C.cream}" stroke-width="1.6" stroke-dasharray="5 3.5" opacity=".7"/>` : '';
  return `<defs><clipPath id="${id}"><polygon points="${pts}"/></clipPath></defs>
    <polygon points="${pts}" transform="translate(7 7)" fill="#000" opacity=".35"/>
    <polygon points="${pts}" fill="${C.blue}"/>
    <g clip-path="url(#${id})"><rect x="${x0 - 20}" y="${y0 + h - 13}" width="${w + 40}" height="4" fill="${C.cream}"/><rect x="${x0 - 20}" y="${y0 + h - 9}" width="${w + 40}" height="9" fill="#c8202a"/></g>
    ${thread}<polygon points="${pts}" fill="none" stroke="${C.out}" stroke-width="3" stroke-linejoin="round"/>
    <text x="${x0 + w/2 + s/2 + ls/2}" y="${y0 + h*.6}" text-anchor="middle" font-size="${h*.5}" font-weight="800" ${F} letter-spacing="${ls}" fill="${C.cream}">HOCKEY QUIZ</text>`;
}

/* ---------- the crest lockup: NHL shield, a crown of ice crystals, puck, word and bar as one badge ---------- */
const ICE = { light: '#eef8ff', mid: '#c4e3f7', dark: '#86bde6', line: '#0a1424' };
function shard(cx, cy, a, L, w, r0){
  const dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx, P = (t, o) => [cx + dx*t + nx*o, cy + dy*t + ny*o];
  const B = P(r0, 0), Lp = P(r0, w), Rp = P(r0, -w), S1 = P(r0 + (L - r0)*.62, w*.62), S2 = P(r0 + (L - r0)*.62, -w*.62), T = P(L, 0);
  const pt = ps => ps.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ');
  const leftLit = nx + ny < 0;
  return `<polygon points="${pt([Lp, S1, T, S2, Rp])}" fill="${ICE.mid}" stroke="${ICE.line}" stroke-width="5" stroke-linejoin="round"/>
    <polygon points="${pt([Lp, S1, T, B])}" fill="${leftLit ? ICE.light : ICE.dark}"/>
    <polygon points="${pt([B, T, S2, Rp])}" fill="${leftLit ? ICE.dark : ICE.light}"/>
    <path d="M${pt([B])} L${pt([T])}" stroke="#fff" stroke-opacity=".7" stroke-width="1.5"/>
    <polygon points="${pt([Lp, S1, T, S2, Rp])}" fill="none" stroke="${ICE.line}" stroke-width="3" stroke-linejoin="round"/>`;
}
function crown(cx, cy, small){
  /* mirrored around the centre line: long crystals step down from the top, short ones sit in between */
  const K = small ? 7 : 11, span = Math.PI + .5, a0 = -Math.PI - .25, mid = (K - 1)/2;
  let back = '', front = '';
  for(let i = 0; i < K; i++){
    const a = a0 + (i + .5)/K*span, d = Math.abs(i - mid), up = Math.max(0, Math.sin(-a));
    front += shard(cx, cy, a, 245 + 110*up*(d % 2 ? .66 : 1), d === 0 ? 40 : 33 - d*1.2, 100);
    if(!small && i < K - 1){ const b = a0 + (i + 1)/K*span; back += shard(cx, cy, b, 205 + 60*Math.max(0, Math.sin(-b)), 19, 100); }
  }
  return back + front;
}
function crest(small, st){
  const id = 'k' + (uid++), cx = 228, cy = -210;
  const streak = (y, x0, h) => `<polygon points="${x0},${y} -150,${y - h/2} -150,${y + h/2}" fill="${ICE.mid}" stroke="${ICE.line}" stroke-width="3" stroke-linejoin="round"/>`;
  const sparkle = (x, y, s) => `<path d="M${x} ${y - s} L${x + s*.2} ${y - s*.2} L${x + s} ${y} L${x + s*.2} ${y + s*.2} L${x} ${y + s} L${x - s*.2} ${y + s*.2} L${x - s} ${y} L${x - s*.2} ${y - s*.2}Z" fill="#fff"/>`;
  return `<svg viewBox="-440 -590 1010 690" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PUCK Hockey Quiz logo with the NHL shield">
    <defs>
      <radialGradient id="${id}g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#6fb8ff" stop-opacity=".5"/><stop offset=".6" stop-color="#6fb8ff" stop-opacity=".12"/><stop offset="1" stop-color="#6fb8ff" stop-opacity="0"/></radialGradient>
      <filter id="${id}o" x="-.1" y="-.1" width="1.2" height="1.25">
        <feMorphology in="SourceAlpha" operator="dilate" radius="${small ? 5 : 7}" result="d"/>
        <feFlood flood-color="#050a12"/><feComposite in2="d" operator="in" result="o"/>
        <feGaussianBlur in="d" stdDeviation="9"/><feOffset dx="8" dy="12" result="s"/>
        <feFlood flood-color="#000" flood-opacity=".5"/><feComposite in2="s" operator="in" result="sh"/>
        <feMerge><feMergeNode in="sh"/><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="${id}r" x="-.1" y="-.1" width="1.2" height="1.2">
        <feMorphology in="SourceAlpha" operator="dilate" radius="15" result="d2"/><feFlood flood-color="${ICE.light}"/><feComposite in2="d2" operator="in" result="ice"/>
        <feMorphology in="SourceAlpha" operator="dilate" radius="6" result="d1"/><feFlood flood-color="${ICE.line}"/><feComposite in2="d1" operator="in" result="ln"/>
        <feMerge><feMergeNode in="ice"/><feMergeNode in="ln"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <filter id="${id}snow" x="-.1" y="-.1" width="1.2" height="1.2">
        <feMorphology in="SourceAlpha" operator="dilate" radius="17" result="d"/>
        <feOffset in="d" dy="17" result="dn"/><feComposite in="d" in2="dn" operator="out" result="band"/>
        <feTurbulence type="fractalNoise" baseFrequency=".035" numOctaves="2" seed="8" result="n"/>
        <feDisplacementMap in="band" in2="n" scale="14" xChannelSelector="R" yChannelSelector="G" result="lump"/>
        <feMorphology in="lump" operator="dilate" radius="3" result="lo"/><feFlood flood-color="${ICE.line}"/><feComposite in2="lo" operator="in" result="edge"/>
        <feFlood flood-color="${ICE.mid}"/><feComposite in2="lump" operator="in" result="under"/>
        <feOffset in="lump" dy="-5" result="up"/><feFlood flood-color="#fff"/><feComposite in2="up" operator="in"/><feComposite in2="lump" operator="in" result="top"/>
        <feMerge><feMergeNode in="edge"/><feMergeNode in="under"/><feMergeNode in="top"/></feMerge></filter>
    </defs>
    <ellipse class="a-ice" cx="${cx}" cy="${cy}" rx="470" ry="360" fill="url(#${id}g)"/>
    <g filter="url(#${id}o)">
      <g class="a-ice">${crown(cx, cy, small)}</g>
      <g class="a-ice"><image href="${LOGO.dark.NHL || ''}" x="${cx - 300}" y="${cy - 196}" width="600" height="400" filter="url(#${id}r)"/>${small ? '' : `<image href="${LOGO.dark.NHL || ''}" x="${cx - 300}" y="${cy - 196}" width="600" height="400" filter="url(#${id}snow)"/>`}</g>
      <g class="a-ghost">${streak(-100, -420, 16)}${streak(-62, -370, 11)}${small ? '' : streak(-24, -330, 8)}</g>
      <g class="a-puck">${nest(puck({ shadow: false, ...(small ? { names: false } : {}) }), -252, -146, 250, .7)}</g>
      <g class="a-word">${word(st)}</g>
      <g class="a-bar">${bar(-18, 30, 476, 46, !small && S.stitch === '1')}</g>
    </g>
    <g class="a-spray">${nest(spray(11, small ? 60 : 140), -27, -112, 196, .6875)}</g>
    ${small ? '' : `<g class="a-ice">${sparkle(cx - 190, cy - 270, 12)}${sparkle(cx + 190, cy - 270, 12)}${sparkle(cx, cy - 395, 9)}</g>`}
  </svg>`;
}

/* ---------- A: Faceoff, refined ---------- */
function faceoff(o = {}){
  const id = 'f' + (uid++), small = !!o.small, shield = S.shield === '1' && o.shield !== false;
  const st = small ? { stitch: false } : {};
  if(shield) return crest(small, st);
  const streak = (y, x0, op, w) => `<path d="M${x0} ${y} L-150 ${y}" stroke="url(#${id}s)" stroke-width="${w}" opacity="${op}"/>`;
  return `<svg viewBox="-340 -205 850 290" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PUCK Hockey Quiz logo">
    <defs><linearGradient id="${id}t" gradientUnits="userSpaceOnUse" x1="-340" x2="-80" y1="0" y2="0"><stop offset="0" stop-color="#dcecf8" stop-opacity="0"/><stop offset="1" stop-color="#dcecf8" stop-opacity=".8"/></linearGradient>
      <linearGradient id="${id}s" gradientUnits="userSpaceOnUse" x1="-400" x2="-150" y1="0" y2="0"><stop offset="0" stop-color="#e4f1fb" stop-opacity="0"/><stop offset="1" stop-color="#e4f1fb" stop-opacity=".9"/></linearGradient>
      <linearGradient id="${id}m" gradientUnits="userSpaceOnUse" x1="-420" x2="-170" y1="0" y2="0"><stop offset="0" stop-color="#05080c" stop-opacity="0"/><stop offset="1" stop-color="#05080c" stop-opacity=".75"/></linearGradient>
      <filter id="${id}mb" x="-.3" y="-.5" width="1.6" height="2"><feGaussianBlur stdDeviation="16 3"/></filter>
      <filter id="${id}cb" x="-.5" y="-1" width="2" height="3"><feGaussianBlur stdDeviation="6 2.5"/></filter></defs>
    <g class="a-trail" stroke="url(#${id}t)" stroke-linecap="round" fill="none"><path d="M-340 3 L-90 1" stroke-width="2.5"/><path d="M-320 10 L-80 8" stroke-width="1.6"/></g>
    <g class="a-ghost">
      <path d="M-400 -112 Q-230 -124 -170 -114 L-170 -4 Q-230 6 -400 -4Z" fill="url(#${id}m)" filter="url(#${id}mb)"/>
      ${small ? '' : `<g stroke-linecap="round" fill="none">${streak(-104, -330, .8, 2.4)}${streak(-80, -380, .45, 1.6)}${streak(-30, -300, .6, 2)}${streak(-8, -360, .35, 1.4)}</g>`}
    </g>
    <g class="a-puck">${nest(puck(small ? { names: false } : {}), -252, -146, 250, .7)}</g>
    <g class="a-word">${word(st)}</g>
    <g class="a-spray"><ellipse cx="-4" cy="5" rx="46" ry="9" fill="#f2f8fd" opacity=".55" filter="url(#${id}cb)"/>${nest(spray(11, small ? 60 : 140), -27, -112, 196, .6875)}</g>
    <g class="a-bar">${bar(-18, 30, 476, 46, !small && S.stitch === '1')}</g>
  </svg>`;
}

/* ---------- B: stacked ---------- */
function stacked(){
  return `<svg viewBox="-40 -320 540 410" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PUCK stacked logo">
    ${nest(puck(), 110, -305, 220, .7)}
    ${word()}
    ${bar(-18, 30, 476, 46)}
  </svg>`;
}

/* ---------- C: sweater patch ---------- */
function patch(){
  const id = 'c' + (uid++);
  return `<svg viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PUCK sweater patch">
    <defs><filter id="${id}f" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="3" seed="4"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .3 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
      <clipPath id="${id}k"><rect width="600" height="400" rx="26"/></clipPath></defs>
    <g clip-path="url(#${id}k)">
      <rect width="600" height="400" fill="#c8202a"/>
      <rect y="168" width="600" height="44" fill="${C.blue}"/><rect y="212" width="600" height="16" fill="${C.cream}"/><rect y="228" width="600" height="44" fill="${C.blue}"/>
      <g transform="translate(86 262)">${word({ depth: 0, stripes: false, shine: false, outlines: [[C.navy, 40], ['#c8202a', 22]] })}</g>
      <rect width="600" height="400" fill="#000" filter="url(#${id}f)"/>
    </g>
    <rect x="14" y="14" width="572" height="372" rx="16" fill="none" stroke="${C.cream}" stroke-width="2.5" stroke-dasharray="7 5" opacity=".85"/>
    ${nest(puck({ detail: false }), 168, 300, 58, .7)}
    <text x="236" y="336" font-size="27" font-weight="800" ${F} letter-spacing="7" fill="${C.cream}">HOCKEY QUIZ</text>
  </svg>`;
}

/* ---------- D: monogram (also the icon) ---------- */
function mono(px){
  const id = 'm' + (uid++), big = px >= 96;
  return `<svg width="${px}" height="${px}" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PUCK app icon">
    <defs><clipPath id="${id}k"><rect width="200" height="200" rx="44"/></clipPath>
      <radialGradient id="${id}b" cx=".45" cy=".35" r=".85"><stop offset="0" stop-color="#21406a"/><stop offset=".6" stop-color="#11223a"/><stop offset="1" stop-color="#070f1b"/></radialGradient></defs>
    <g clip-path="url(#${id}k)">
      <rect width="200" height="200" fill="url(#${id}b)"/>
      ${big ? `<rect y="181" width="200" height="4" fill="${C.cream}"/><rect y="185" width="200" height="8" fill="${C.blue}"/><rect y="193" width="200" height="4" fill="${C.cream}"/>` : ''}
      <g transform="translate(40 152) scale(.74)">${word({ text: 'P', len: 0, stitch: big && S.stitch === '1', depth: 7 })}</g>
      ${nest(puck({ detail: big, names: false }), 90, 102, 94, .7)}
      ${big ? nest(spray(5), 152, 104, 40, .6875) : ''}
    </g>
  </svg>`;
}

/* ---------- E: scoreboard ---------- */
function scoreboard(){
  const id = 'e' + (uid++), G = {
    P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
    U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
    C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
    K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'] };
  const pitch = 17, r = 6.6, gap = 24, w = 5*pitch, x0 = (600 - (4*w + 3*gap))/2 + pitch/2, y0 = 74;
  let off = '', on = '';
  'PUCK'.split('').forEach((l, li) => G[l].forEach((row, ri) => [...row].forEach((b, ci) => {
    const x = (x0 + li*(w + gap) + ci*pitch - ri*1.4).toFixed(1), y = (y0 + ri*pitch).toFixed(1);
    if(b === '1') on += `<circle cx="${x}" cy="${y}" r="${r}"/>`; else off += `<circle cx="${x}" cy="${y}" r="${r}"/>`;
  })));
  const rivets = [20, 580].flatMap(x => [20, 280].map(y => `<circle cx="${x}" cy="${y}" r="4" fill="#4a5664"/>`)).join('');
  const seg = (x, y, t, anchor = 'middle', size = 30) => `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="Big Shoulders Display, Impact, sans-serif" font-weight="900" font-size="${size}" letter-spacing="3">${t}</text>`;
  return `<svg viewBox="0 0 600 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PUCK on a scoreboard">
    <defs><filter id="${id}g" x="-.1" y="-.2" width="1.2" height="1.4"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      <radialGradient id="${id}bulb" cx=".4" cy=".35" r=".7"><stop offset="0" stop-color="#fff2e6"/><stop offset=".35" stop-color="#ff5a48"/><stop offset="1" stop-color="#c8141c"/></radialGradient>
      <linearGradient id="${id}p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#151b22"/><stop offset="1" stop-color="#07090c"/></linearGradient></defs>
    <rect x="2" y="2" width="596" height="296" rx="14" fill="#2b3440"/>
    <rect x="12" y="12" width="576" height="276" rx="8" fill="url(#${id}p)"/>
    ${rivets}
    <rect x="34" y="40" width="532" height="160" rx="6" fill="#050608" stroke="#1d242c" stroke-width="2"/>
    <g fill="#2a1214">${off}</g>
    <g fill="url(#${id}bulb)" filter="url(#${id}g)">${on}</g>
    <line x1="34" y1="222" x2="566" y2="222" stroke="#1d242c" stroke-width="2"/>
    <g fill="#8ea0b2">${seg(60, 252, 'PERIOD', 'start', 16)}${seg(540, 252, 'TIME', 'end', 16)}</g>
    <g fill="#ff4a3a" filter="url(#${id}g)">${seg(60, 276, '1', 'start', 26)}${seg(540, 276, '20:00', 'end', 26)}</g>
    <text x="300" y="268" text-anchor="middle" font-size="24" font-weight="800" ${F} letter-spacing="8" fill="${C.cream}">HOCKEY QUIZ</text>
  </svg>`;
}

/* ---------- F: the arena ---------- */
function arena(){
  const id = 'r' + (uid++), banners = TEAMS.slice(0, 16), boards = TEAMS.slice(16);
  const banner = (t, i) => { const x = 34 + i*59; return `<g transform="translate(${x} 18)">
      <path d="M0 0 H50 V74 L25 86 L0 74Z" fill="${C.cream}" stroke="#0a1424" stroke-width="1.5"/>
      <rect y="56" width="50" height="5" fill="${C.blue}"/><rect y="63" width="50" height="5" fill="#c8202a"/>
      <image href="${LOGO.light[t] || ''}" x="2" y="8" width="46" height="31"/>
      <text x="25" y="51" text-anchor="middle" font-family="Big Shoulders Display, Impact, sans-serif" font-weight="900" font-size="10" letter-spacing="1" fill="#16283f">${t}</text></g>`; };
  const board = (t, i) => { const x = i*62.5; return `<rect x="${x}" y="300" width="62.5" height="58" fill="#f7fafc" stroke="#cdd8e1" stroke-width="1"/><image href="${LOGO.light[t] || ''}" x="${x + 6}" y="306" width="50.5" height="46"/>`; };
  return `<svg viewBox="0 0 1000 600" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PUCK in an arena with all 32 team logos">
    <defs><linearGradient id="${id}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#050a12"/><stop offset="1" stop-color="#14263e"/></linearGradient>
      <radialGradient id="${id}spot" cx=".5" cy="0" r=".9"><stop offset="0" stop-color="#bcd8f2" stop-opacity=".22"/><stop offset="1" stop-color="#bcd8f2" stop-opacity="0"/></radialGradient>
      <linearGradient id="${id}ice" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfdde7"/><stop offset=".3" stop-color="#e9f1f6"/><stop offset="1" stop-color="#dbe7ef"/></linearGradient></defs>
    <rect width="1000" height="300" fill="url(#${id}sky)"/>
    <rect width="1000" height="300" fill="url(#${id}spot)"/>
    <path d="M0 12 H1000" stroke="#2a3a50" stroke-width="3"/>
    ${banners.map(banner).join('')}
    <rect y="230" width="1000" height="70" fill="#9fb6c8" opacity=".12"/>
    ${[...Array(9)].map((_, i) => `<path d="M${i*125} 230 V300" stroke="#c9dbe8" stroke-opacity=".25" stroke-width="2"/>`).join('')}
    <rect y="296" width="1000" height="4" fill="#0a1424"/>
    ${boards.map(board).join('')}
    <rect y="358" width="1000" height="12" fill="#f2c230"/>
    <rect y="370" width="1000" height="230" fill="url(#${id}ice)"/>
    <rect x="0" y="560" width="1000" height="10" fill="${C.blue}" opacity=".55"/>
    ${[...Array(30)].map((_, i) => `<path d="M${i*40 - 60} 600 L${i*40 + 40} 370" stroke="#fff" stroke-opacity=".35" stroke-width="1"/>`).join('')}
    ${nest(faceoff({ shield: false }), 110, 330, 780, 290/850)}
  </svg>`;
}

/* ---------- G: the puck wall ---------- */
function wall(){
  const id = 'q' + (uid++);
  const cells = TEAMS.map((t, i) => {
    const c = i % 8, r = Math.floor(i/8), x = 34 + c*118 + (r % 2)*20, y = 30 + r*128, hab = t === 'MTL';
    return `${hab ? `<ellipse cx="${x + 54}" cy="${y + 52}" rx="70" ry="44" fill="#d2232a" opacity=".55" filter="url(#${id}g)"/>` : ''}
      ${nest(puck({ centre: t, names: false }), x, y, 108, .7)}
      <text x="${x + 54}" y="${y + 104}" text-anchor="middle" font-family="Big Shoulders Display, Impact, sans-serif" font-weight="900" font-size="15" letter-spacing="2.5" fill="${hab ? C.cream : '#8ea4b8'}">${t}</text>`;
  }).join('');
  return `<svg viewBox="0 0 1000 540" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="32 pucks with the team logos">
    <defs><filter id="${id}g" x="-.5" y="-.5" width="2" height="2"><feGaussianBlur stdDeviation="14"/></filter></defs>
    <rect width="1000" height="540" fill="#0b1626"/>${cells}</svg>`;
}

/* ---------- H: PUCK 26, a mid-2000s game title screen ---------- */
function chrome(id, txt, x, y, size, len, pal){
  const T = (attrs, tr) => `<text x="${x}" y="${y}" font-family="'Exo 2', 'Arial Black', sans-serif" font-style="italic" font-weight="900" font-size="${size}" textLength="${len}" lengthAdjust="spacingAndGlyphs"${tr ? ` transform="${tr}"` : ''} ${attrs}>${txt}</text>`;
  const top = y - size*.72, n = 9;
  let s = `<defs>
    <linearGradient id="${id}f" gradientUnits="userSpaceOnUse" x1="0" y1="${top}" x2="0" y2="${y}">${pal.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>
    <linearGradient id="${id}r" gradientUnits="userSpaceOnUse" x1="0" y1="${top}" x2="0" y2="${y}"><stop offset="0" stop-color="#4c5a6c"/><stop offset=".5" stop-color="#f4f8ff"/><stop offset="1" stop-color="#5d6b7e"/></linearGradient>
    <clipPath id="${id}c">${T('')}</clipPath>
    <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <filter id="${id}g" x="-.2" y="-.4" width="1.4" height="1.8"><feGaussianBlur stdDeviation="${size*.05}"/></filter></defs>`;
  s += T(`fill="none" stroke="#2f8fff" stroke-width="${size*.14}" stroke-linejoin="round" opacity=".55" filter="url(#${id}g)"`);
  for(let i = n; i >= 1; i--){ const c = mix('#3a4658', '#04070c', i/n); s += T(`fill="${c}" stroke="${c}" stroke-width="${size*.07}" stroke-linejoin="round"`, `translate(${(i*size*.0065).toFixed(2)} ${(i*size*.0075).toFixed(2)})`); }
  s += T(`fill="none" stroke="#03060b" stroke-width="${size*.07}" stroke-linejoin="round"`);
  s += T(`fill="url(#${id}f)" stroke="url(#${id}r)" stroke-width="${size*.022}" stroke-linejoin="round" paint-order="stroke"`);
  s += `<g clip-path="url(#${id}c)"><rect x="${x - 40}" y="${top - 10}" width="${len + 80}" height="${size*.06}" fill="#fff" opacity=".55"/>
    <g class="r-shine"><rect x="${x}" y="${top - 40}" width="110" height="${size + 80}" fill="url(#${id}s)" transform="skewX(-24)"/></g></g>`;
  return s;
}
const CHROME = [[0, '#ffffff'], [.22, '#dfe8f2'], [.47, '#8292a7'], [.5, '#17202c'], [.56, '#3a4a5e'], [.8, '#b7c8da'], [1, '#f2f7fc']];
const EMBER = [[0, '#fff6cf'], [.25, '#ffd36a'], [.48, '#f08a17'], [.5, '#5a1d00'], [.58, '#b84a06'], [.82, '#ffb43a'], [1, '#fff0c0']];
function retroScreen(){
  const id = 'h' + (uid++), r = rng(26);
  const sparks = [...Array(26)].map(() => { const x = 975 + r()*50, y = 530 + (r() - .5)*60, l = 12 + r()*40, a = Math.PI*((r() - .5)*.3);
    return `<path d="M${x.toFixed(1)} ${y.toFixed(1)} l${(Math.cos(a)*l).toFixed(1)} ${(Math.sin(a)*l*.6 - r()*12).toFixed(1)}" stroke="${r() < .5 ? '#ffd36a' : '#fff4d6'}" stroke-width="${(1 + r()*1.8).toFixed(1)}" stroke-linecap="round"/>`; }).join('');
  const flare = (x, y, s) => `<g class="r-flare"><circle cx="${x}" cy="${y}" r="${s*.9}" fill="url(#${id}fl)"/>
    <path d="M${x - s*4} ${y} L${x} ${y - s*.08} L${x + s*4} ${y} L${x} ${y + s*.08}Z M${x} ${y - s*2} L${x + s*.06} ${y} L${x} ${y + s*2} L${x - s*.06} ${y}Z" fill="#fff"/></g>`;
  const rink = [...Array(14)].map((_, i) => `<path d="M${600 + (i - 6.5)*40} 520 L${600 + (i - 6.5)*190} 675" stroke="#fff" stroke-opacity=".05"/>`).join('');
  return `<svg viewBox="0 0 1200 675" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="PUCK 26 retro title screen">
    <defs>
      <radialGradient id="${id}bg" cx=".45" cy=".42" r=".75"><stop offset="0" stop-color="#173a6e"/><stop offset=".45" stop-color="#0a1c38"/><stop offset="1" stop-color="#01040a"/></radialGradient>
      <linearGradient id="${id}ice" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9cc4e6" stop-opacity=".35"/><stop offset=".2" stop-color="#d6e9f7" stop-opacity=".22"/><stop offset="1" stop-color="#0a1830" stop-opacity=".9"/></linearGradient>
      <linearGradient id="${id}beam" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe6ff" stop-opacity=".28"/><stop offset="1" stop-color="#cfe6ff" stop-opacity="0"/></linearGradient>
      <linearGradient id="${id}sw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#2f8fff" stop-opacity="0"/><stop offset=".4" stop-color="#2f8fff" stop-opacity=".9"/><stop offset="1" stop-color="#9fe0ff" stop-opacity=".2"/></linearGradient>
      <linearGradient id="${id}tr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd36a" stop-opacity=".9"/><stop offset=".3" stop-color="#9fd8ff" stop-opacity=".5"/><stop offset="1" stop-color="#9fd8ff" stop-opacity="0"/></linearGradient>
      <linearGradient id="${id}ln" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9fd8ff" stop-opacity="0"/><stop offset=".5" stop-color="#e8f6ff"/><stop offset="1" stop-color="#9fd8ff" stop-opacity="0"/></linearGradient>
      <radialGradient id="${id}fl" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff"/><stop offset=".25" stop-color="#bfe4ff" stop-opacity=".7"/><stop offset="1" stop-color="#2f8fff" stop-opacity="0"/></radialGradient>
      <radialGradient id="${id}vg" cx=".5" cy=".5" r=".75"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".75"/></radialGradient>
      <filter id="${id}b" x="-.3" y="-.3" width="1.6" height="1.6"><feGaussianBlur stdDeviation="14"/></filter>
      <filter id="${id}b2" x="-.3" y="-.3" width="1.6" height="1.6"><feGaussianBlur stdDeviation="4"/></filter>
      <filter id="${id}sg" x="-.2" y="-.2" width="1.4" height="1.4"><feMorphology in="SourceAlpha" operator="dilate" radius="6" result="d"/><feGaussianBlur in="d" stdDeviation="12"/><feFlood flood-color="#3d9bff" flood-opacity=".8"/><feComposite operator="in" in2="SourceGraphic" result="x"/><feGaussianBlur in="d" stdDeviation="12" result="bd"/><feFlood flood-color="#3d9bff" flood-opacity=".75"/><feComposite in2="bd" operator="in" result="glow"/><feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect width="1200" height="675" fill="url(#${id}bg)"/>
    <g filter="url(#${id}b)"><polygon class="r-beam" points="430,0 520,0 760,675 300,675" fill="url(#${id}beam)"/><polygon class="r-beam" points="700,0 760,0 1100,675 760,675" fill="url(#${id}beam)"/><polygon class="r-beam" points="180,0 230,0 260,675 -40,675" fill="url(#${id}beam)"/></g>
    <polygon points="0,520 1200,520 1200,675 0,675" fill="url(#${id}ice)"/>
    <path d="M0 520 H1200" stroke="#bfe0ff" stroke-opacity=".35"/>
    ${rink}
    <path d="M300 675 L520 520 M900 675 L680 520" stroke="#2f6fd8" stroke-opacity=".35" stroke-width="6"/>
    <g class="r-swoosh"><path d="M40 560 Q560 600 1180 150" fill="none" stroke="url(#${id}sw)" stroke-width="34" stroke-linecap="round" filter="url(#${id}b2)" opacity=".85"/>
      <path d="M40 560 Q560 600 1180 150" fill="none" stroke="#e9f7ff" stroke-width="3" stroke-linecap="round" opacity=".9"/>
      <path d="M90 590 Q600 615 1180 230" fill="none" stroke="url(#${id}sw)" stroke-width="10" stroke-linecap="round" opacity=".6"/></g>
    <g class="r-shield"><image href="${LOGO.dark.NHL || ''}" x="-10" y="95" width="540" height="360" filter="url(#${id}sg)"/></g>
    <g class="r-word">${chrome(id + 'p', 'PUCK', 412, 372, 220, 590, CHROME)}</g>
    <g class="r-year">${chrome(id + 'y', '26', 1012, 258, 104, 120, EMBER)}</g>
    <g class="r-sub">
      <path d="M430 418 H1000" stroke="url(#${id}ln)" stroke-width="2"/>
      <text x="716" y="456" text-anchor="middle" font-family="Michroma, 'Arial', sans-serif" font-size="27" letter-spacing="17" fill="#e8f3ff">HOCKEY QUIZ</text>
      <path d="M430 476 H1000" stroke="url(#${id}ln)" stroke-width="2"/></g>
    <g class="r-puck">
      <path d="M830 498 L1200 470 L1200 560 L830 548Z" fill="url(#${id}tr)" opacity=".45" filter="url(#${id}b2)"/>
      ${sparks}
      <g transform="rotate(-8 900 520)">${nest(puck(), 790, 455, 200, .7)}</g></g>
    ${flare(470, 140, 46)}${flare(985, 245, 26)}
    <text class="r-start" x="600" y="626" text-anchor="middle" font-family="Michroma, 'Arial', sans-serif" font-size="20" letter-spacing="10" fill="#ffd36a">PRESS START</text>
    <text x="600" y="660" text-anchor="middle" font-family="Michroma, 'Arial', sans-serif" font-size="9.5" letter-spacing="3" fill="#7f97b3">© 2026 FELIX · ALEJANDRO · MARTIJN · MCJESUS. ALL RIGHTS RESERVED.</text>
    <rect width="1200" height="675" fill="url(#${id}vg)" pointer-events="none"/>
  </svg>`;
}





window.PUCK = window.PUCK || {};
window.PUCK.d26 = { chrome, CHROME, EMBER, puck, spray, rng, mix, nest, nextId: () => uid++ };
})();
