/* PUCK · procedural texture helpers for the goalies (app/faceoff/goalie3d.js). Plain canvas 2D, no three.js.

   The goalie's atlas is painted three times over: the colour (per goalie), a height field (per goalie: the
   knit, the twill numbers, the stitching, the quilting), and the shared roughness/clearcoat/metal map. The
   height is drawn on two canvases, a low one (folds, the broad shape of cloth) and a detail one (knit, grain,
   stitches; twill drawn flat on top of the knit, so the numbers sit smooth on a folded sweater), then baked
   here into a tangent-space normal map and a cavity shade multiplied into the colour.

   Heights are grey levels round 128 (128 = flat). P.goalieTex:
     rng(seed)                       a seeded random, () => [0, 1)
     canvas(w, h)
     knit(g, x, y, w, h, o)          air-knit (o.p period px, o.a depth): fills the rect with the pattern
     grain(g, x, y, w, h, o)         pebbled leather / nylon grain (o.a depth, o.s speck size, o.seed)
     ribs(g, x, y, w, h, o)          parallel ribs (o.p period, o.a depth, o.dir 'h' or 'v')
     soft(g, pts, w, a)              a soft ridge (a > 0) or valley (a < 0) along a polyline, w its width in px
     stitch(g, pts, o)               a row of stitches along a polyline (o.len, o.gap, o.w, o.col, o.closed)
     bake(colour, low, detail, normal, o)
                                     the normal map from low + detail, and the cavity shade into colour.
                                     o.strength (normal), o.cav (how much a dip darkens), o.cavMax */
(function(){
const P = window.PUCK = window.PUCK || {};
const clamp = (t, a = 0, b = 1) => t < a ? a : t > b ? b : t;

function rng(seed){
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };
}
function canvas(w, h){ const c = document.createElement('canvas'); c.width = w; c.height = h || w; return c; }
const grey = v => { v = Math.round(clamp(v, 0, 255)); return 'rgb(' + v + ',' + v + ',' + v + ')'; };

/* the repeating tiles (built once) */
const TILE = {};
function tile(key, w, h, draw){
  if(TILE[key]) return TILE[key];
  const c = canvas(w, h), g = c.getContext('2d'); draw(g, w, h); return (TILE[key] = c);
}
/* air-knit: rows of small open cells, every other row shifted half a cell (the mesh of a modern sweater) */
function knitTile(p, a){
  return tile('knit' + p + '_' + a, p*2, p*2, (g, w, h) => {
    const im = g.createImageData(w, h), d = im.data;
    for(let y = 0; y < h; y++) for(let x = 0; x < w; x++){
      const row = Math.floor(y/p), xs = (x + (row % 2)*p/2) % p, ys = y % p;
      /* a rounded cell: the yarn high round it, the hole in its middle */
      const dx = (xs + .5 - p/2)/(p/2), dy = (ys + .5 - p/2)/(p/2), r = Math.sqrt(dx*dx*.9 + dy*dy*1.25);
      let v = 128 + a*(.55 - Math.max(0, 1 - r)*1.6);
      v += a*.08*Math.cos((ys + .5)/p*Math.PI*2);
      const i = (y*w + x)*4; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  });
}
function knit(g, x, y, w, h, o = {}){
  const t = knitTile(o.p || 4, o.a || 30);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y);
  g.fillStyle = g.createPattern(t, 'repeat'); g.fillRect(0, 0, w, h); g.restore();
}
/* grain: random specks, small pits and bumps, softened */
function grainTile(s, a, seed){
  return tile('grain' + s + '_' + a + '_' + seed, 128, 128, (g, w, h) => {
    const r = rng(seed || 7);
    g.fillStyle = grey(128); g.fillRect(0, 0, w, h);
    for(let i = 0; i < w*h/(s*s)*1.1; i++){
      const x = r()*w, y = r()*h, rad = s*(.35 + r()*.5), v = 128 + (r() - .5)*2*a;
      for(const ox of [0, -w, w]) for(const oy of [0, -h, h]){
        if((ox && Math.abs(x + ox - w/2) > w/2 + rad) || (oy && Math.abs(y + oy - h/2) > h/2 + rad)) continue;
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        gr.addColorStop(0, 'rgba(' + [v, v, v].map(Math.round) + ',.9)'); gr.addColorStop(1, 'rgba(' + [v, v, v].map(Math.round) + ',0)');
        g.fillStyle = gr; g.fillRect(x + ox - rad, y + oy - rad, rad*2, rad*2);
      }
    }
  });
}
function grain(g, x, y, w, h, o = {}){
  const t = grainTile(o.s || 2, o.a || 14, o.seed || 3);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x + (o.ox || 0), y + (o.oy || 0));
  g.globalCompositeOperation = o.op || 'overlay';
  g.fillStyle = g.createPattern(t, 'repeat'); g.fillRect(-(o.ox || 0), -(o.oy || 0), w, h); g.restore();
}
/* ribs: a ribbed nylon / webbing, soft-topped */
function ribs(g, x, y, w, h, o = {}){
  const p = o.p || 6, a = o.a || 18, v = o.dir === 'v';
  const t = tile('ribs' + p + '_' + a + (v ? 'v' : 'h'), v ? p : 4, v ? 4 : p, (gg, tw, th) => {
    for(let i = 0; i < p; i++){ gg.fillStyle = grey(128 + a*Math.cos((i + .5)/p*Math.PI*2)); if(v) gg.fillRect(i, 0, 1, th); else gg.fillRect(0, i, tw, 1); }
  });
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.translate(x, y);
  g.globalCompositeOperation = o.op || 'source-over';
  g.fillStyle = g.createPattern(t, 'repeat'); g.fillRect(0, 0, w, h); g.restore();
}
/* a soft ridge or valley: strokes from wide and faint to narrow, so the profile is round */
function soft(g, pts, w, a){
  const n = 7, c = a > 0 ? 255 : 0, step = Math.abs(a)/255/n*1.9;
  g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
  for(let i = 0; i < n; i++){
    g.lineWidth = w*(1 - i/n); g.strokeStyle = 'rgba(' + c + ',' + c + ',' + c + ',' + step.toFixed(4) + ')';
    g.beginPath(); pts.forEach((p, k) => k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke();
  }
  g.restore();
}
function stitch(g, pts, o = {}){
  g.save(); g.lineCap = 'butt'; g.setLineDash([o.len || 3, o.gap || 2]); g.lineDashOffset = o.off || 0;
  g.lineWidth = o.w || 1.2; g.strokeStyle = o.col || grey(96);
  g.beginPath(); pts.forEach((p, k) => k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); if(o.closed) g.closePath(); g.stroke();
  g.restore();
}

/* a box blur, across then down (sliding sums, flat arrays) */
function blur(src, W, H, r){
  const a = new Float32Array(src.length), b = new Float32Array(src.length), k = 1/(2*r + 1);
  for(let y = 0; y < H; y++){
    const o = y*W; let s = src[o]*(r + 1); for(let i = 1; i <= r; i++) s += src[o + Math.min(W - 1, i)];
    for(let x = 0; x < W; x++){ a[o + x] = s*k; s += src[o + Math.min(W - 1, x + r + 1)] - src[o + Math.max(0, x - r)]; }
  }
  for(let x = 0; x < W; x++){
    let s = a[x]*(r + 1); for(let i = 1; i <= r; i++) s += a[Math.min(H - 1, i)*W + x];
    for(let y = 0; y < H; y++){ b[y*W + x] = s*k; s += a[Math.min(H - 1, y + r + 1)*W + x] - a[Math.max(0, y - r)*W + x]; }
  }
  return b;
}
function bake(colour, low, detail, normal, o = {}){
  const W = colour.width, H = colour.height, S = o.strength || 5, cav = o.cav || 3, cavMax = o.cavMax || .4;
  const ld = low.getContext('2d').getImageData(0, 0, W, H).data, dd = detail.getContext('2d').getImageData(0, 0, W, H).data;
  const h = new Float32Array(W*H);
  for(let i = 0, j = 0; i < h.length; i++, j += 4) h[i] = (ld[j] + dd[j] - 256)/255;
  const ng = normal.getContext('2d'), nI = ng.createImageData(W, H), nd = nI.data;
  for(let y = 0; y < H; y++){
    const y0 = (y ? y - 1 : y)*W, y1 = y*W, y2 = (y < H - 1 ? y + 1 : y)*W;
    for(let x = 0; x < W; x++){
      const x0 = x ? x - 1 : x, x2 = x < W - 1 ? x + 1 : x;
      /* sobel */
      const hx = (h[y0 + x2] + 2*h[y1 + x2] + h[y2 + x2]) - (h[y0 + x0] + 2*h[y1 + x0] + h[y2 + x0]);
      const hy = (h[y2 + x0] + 2*h[y2 + x] + h[y2 + x2]) - (h[y0 + x0] + 2*h[y0 + x] + h[y0 + x2]);
      /* canvas y runs down, the texture's v up: n = (-dh/du, -dh/dv, 1) */
      let nx = -hx*S/8, ny = hy*S/8, nz = 1; const l = 1/Math.sqrt(nx*nx + ny*ny + nz*nz);
      const k = (y1 + x)*4; nd[k] = (nx*l*.5 + .5)*255; nd[k + 1] = (ny*l*.5 + .5)*255; nd[k + 2] = (nz*l*.5 + .5)*255; nd[k + 3] = 255;
    }
  }
  ng.putImageData(nI, 0, 0);
  /* the cavity: what lies below its surroundings gets less light */
  const b = blur(h, W, H, o.r || 3), cg = colour.getContext('2d'), cI = cg.getImageData(0, 0, W, H), cd = cI.data;
  for(let i = 0, j = 0; i < h.length; i++, j += 4){
    const d = b[i] - h[i], f = d > 0 ? 1 - Math.min(cavMax, d*cav) : 1 + Math.min(.06, -d*cav*.25);
    cd[j] = cd[j]*f; cd[j + 1] = cd[j + 1]*f; cd[j + 2] = cd[j + 2]*f;
  }
  cg.putImageData(cI, 0, 0);
}

P.goalieTex = { rng, canvas, grey, knit, grain, ribs, soft, stitch, bake, blur };
})();
