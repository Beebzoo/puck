/* PUCK 26 charts for the NHL tab: hand-made SVG, no library.
   Every chart draws at the pixel width of its box (so text stays crisp), redraws when
   the box resizes, and has a tap/hover layer: a crosshair or a highlighted mark and a
   tooltip with the exact numbers. Colours are the theme's chart tokens (nhl-tab.css,
   checked with the dataviz validator on the navy surface):
     --cx-a  #d9740a  ember  (goals; the team's own line)
     --cx-b  #3b8ae0  ice    (assists; goals for)
     --cx-n  #e8664a  coral  (goals against)
   Grid and axes are 1px solid hairlines a step off the surface; text uses text tokens.
   API (PUCK.nhlCharts):
     line(el, { points:[{y, tip}], ref:[y…], refLabel, endLabel, yFmt, xFmt, color })
     columns(el, { items:[{ v:[a,b], tip, x }], series:[{name, color}], peak })
     diverge(el, { items:[{ up, down, tip, x }], up:{name,color}, down:{name,color} })
     scatter(el, { items:[{ x, y, abbr, logo, href, tip, hi }], xLabel, yLabel, xRef, yRef, xFmt, yFmt })
     spark(values, { w, h, color, ref }) -> SVG string (no interaction; a tile's trend) */
(function(){
const P = window.PUCK = window.PUCK || {};
const NS = "http://www.w3.org/2000/svg";
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const GRID = "rgba(143,180,221,.16)", AXIS = "rgba(143,180,221,.34)", INK2 = "#9fc0e6", INK3 = "#6f8fb6", SURF = "#081833";
let uid = 0;

/* clean ticks: a 1/2/5 step, from lo up to the first tick at or above hi */
function ticks(lo, hi, n = 4){
  if(hi === lo){ hi = lo + 1; }
  const raw = (hi - lo)/n, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw/mag;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10)*mag;
  const a = Math.floor(lo/step + 1e-9)*step, b = Math.ceil(hi/step - 1e-9)*step, out = [];
  for(let v = a; v <= b + step/2; v += step) out.push(+v.toFixed(10));
  return out;
}
const num = v => Math.abs(v) >= 1000 ? (v/1000).toFixed(v % 1000 ? 1 : 0) + "K" : String(v);

/* the frame every interactive chart shares: a box, an SVG, a tooltip, a resize watcher */
function mount(el, draw){
  el.classList.add("cx");
  el.innerHTML = "";
  const tip = document.createElement("div"); tip.className = "cx-tip"; tip.setAttribute("role", "status"); tip.hidden = true;
  let w = 0, svg = null, api = null;
  const paint = () => {
    const nw = Math.round(el.clientWidth); if(!nw || nw === w) return; w = nw;
    if(svg) svg.remove();
    const out = draw(nw);
    svg = new DOMParser().parseFromString('<svg xmlns="' + NS + '">' + out.svg + "</svg>", "image/svg+xml").documentElement;
    svg.setAttribute("viewBox", "0 0 " + nw + " " + out.h); svg.setAttribute("width", nw); svg.setAttribute("height", out.h);
    svg.setAttribute("role", "img"); if(out.label) svg.setAttribute("aria-label", out.label);
    svg = document.importNode(svg, true);
    el.insertBefore(svg, tip);
    api = out; hide();
  };
  el.appendChild(tip);
  /* hover / tap: the chart says which item is nearest (pick(x, y) -> index) and how to show it (show(i) -> {x, y, html}) */
  let pinned = false;
  function hide(){ tip.hidden = true; pinned = false; if(svg){ svg.classList.remove("dim"); svg.querySelectorAll(".on").forEach(n => n.classList.remove("on")); } const c = svg && svg.querySelector(".cx-cross"); if(c) c.setAttribute("opacity", 0); }
  function at(e){
    if(!api || !api.pick) return;
    const r = svg.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const i = api.pick(x, y); if(i == null || i < 0){ hide(); return; }
    const s = api.show(i, svg); if(!s) return;
    tip.innerHTML = s.html; tip.hidden = false;
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let left = s.x - tw/2; left = Math.max(2, Math.min(w - tw - 2, left));
    let top = s.y - th - 12; if(top < 0) top = s.y + 14;
    tip.style.transform = "translate(" + Math.round(left) + "px," + Math.round(top) + "px)";
  }
  el.addEventListener("pointermove", e => { if(e.pointerType === "mouse" && !pinned) at(e); });
  el.addEventListener("pointerdown", e => { pinned = e.pointerType !== "mouse"; at(e); });
  el.addEventListener("pointerleave", e => { if(e.pointerType === "mouse") hide(); });
  el.addEventListener("click", e => { if(api && api.href){ const r = svg.getBoundingClientRect(), i = api.pick(e.clientX - r.left, e.clientY - r.top); const h = i != null && i >= 0 ? api.href(i) : null; if(h){ location.hash = h; } } });
  const outside = e => { if(!el.contains(e.target)) hide(); };
  document.addEventListener("pointerdown", outside, { passive: true });
  paint();
  const ro = window.ResizeObserver ? new ResizeObserver(() => paint()) : null; if(ro) ro.observe(el);
  if(P.ui && P.ui.onLeave) P.ui.onLeave(() => { document.removeEventListener("pointerdown", outside); if(ro) ro.disconnect(); });
  return el;
}
const font = w => Math.max(10, Math.min(13, Math.round(w*.029)));
const txt = (x, y, s, o = {}) => '<text x="' + x + '" y="' + y + '" fill="' + (o.fill || INK2) + '" font-size="' + o.fs + '" font-family="Exo 2, sans-serif" font-weight="' + (o.fw || 600) + '"' + (o.anchor ? ' text-anchor="' + o.anchor + '"' : "") + (o.cls ? ' class="' + o.cls + '"' : "") + ' style="font-variant-numeric:tabular-nums">' + esc(s) + "</text>";
/* a column with a 4px rounded data end and a square base (y0 = base, y1 = end) */
function col(x, w, y0, y1, color, cls){
  if(Math.abs(y1 - y0) < .5) return "";
  const up = y1 < y0, r = Math.min(4, w/2, Math.abs(y1 - y0)), t = up ? y1 : y0, b = up ? y0 : y1;
  const d = up ? "M" + x + " " + b + "V" + (t + r) + "Q" + x + " " + t + " " + (x + r) + " " + t + "H" + (x + w - r) + "Q" + (x + w) + " " + t + " " + (x + w) + " " + (t + r) + "V" + b + "Z"
               : "M" + x + " " + t + "V" + (b - r) + "Q" + x + " " + b + " " + (x + r) + " " + b + "H" + (x + w - r) + "Q" + (x + w) + " " + b + " " + (x + w) + " " + (b - r) + "V" + t + "Z";
  return '<path d="' + d + '" fill="' + color + '"' + (cls ? ' class="' + cls + '"' : "") + "/>";
}

/* ---------- a line over games (points progression, save % by game) ---------- */
function line(el, o){
  const pts = o.points, n = pts.length;
  return mount(el, W => {
    const fs = font(W), H = o.h || Math.round(Math.min(260, Math.max(170, W*.5)));
    const ys = pts.map(p => p.y).concat(o.ref || []).filter(v => v != null);
    let lo = o.min != null ? o.min : Math.min(0, ...ys), hi = Math.max(...ys);
    const tk = ticks(lo, hi, 4); lo = tk[0]; hi = tk[tk.length - 1];
    const yF = o.yFmt || num, padL = Math.max(...tk.map(t => yF(t).length))*fs*.6 + 8, padR = o.endLabel || o.refLabel ? fs*4.6 : 10, padT = fs, padB = fs*2.2;
    const iw = W - padL - padR, ih = H - padT - padB;
    const X = i => padL + (n <= 1 ? iw/2 : i*iw/(n - 1)), Y = v => padT + ih - (v - lo)/(hi - lo)*ih;
    let s = "";
    tk.forEach(t => { s += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(t) + '" y2="' + Y(t) + '" stroke="' + (t === 0 ? AXIS : GRID) + '" stroke-width="1" shape-rendering="crispEdges"/>' + txt(padL - 6, Y(t) + fs*.35, yF(t), { fs, anchor: "end", fill: INK3 }); });
    /* x: the first and last game, and a few between, by game number */
    const xt = ticks(1, Math.max(2, n), Math.min(5, n)).filter(v => v >= 1 && v <= n && Number.isInteger(v));
    xt.forEach(v => { s += txt(X(v - 1), H - fs*.6, (o.xFmt || (k => "G" + k))(v), { fs, anchor: "middle", fill: INK3 }); });
    if(o.ref && o.ref.length){
      const d = o.ref.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join("");
      s += '<path d="' + d + '" fill="none" stroke="' + INK3 + '" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/>';
      if(o.refLabel){ let ry = Y(o.ref[o.ref.length - 1]), ly = pts.length ? Y(pts[pts.length - 1].y) : -999;
        if(Math.abs(ry - ly) < fs*1.3) ry = ly + (ry >= ly ? 1 : -1)*fs*1.3;
        s += txt(X(o.ref.length - 1) + 8, ry + fs*.35, o.refLabel, { fs: fs*.92, fill: INK3 }); }
    }
    const c = o.color || "#f08a17", id = "lg" + (++uid);
    const d = pts.map((p, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(p.y).toFixed(1)).join("");
    if(o.area !== false && n > 1) s += '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c + '" stop-opacity=".22"/><stop offset="1" stop-color="' + c + '" stop-opacity="0"/></linearGradient></defs><path d="' + d + "L" + X(n - 1) + " " + Y(lo) + "L" + X(0) + " " + Y(lo) + 'Z" fill="url(#' + id + ')"/>';
    s += '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';
    if(o.dots) pts.forEach((p, i) => { s += '<circle cx="' + X(i) + '" cy="' + Y(p.y) + '" r="3" fill="' + c + '" stroke="' + SURF + '" stroke-width="2"/>'; });
    if(n){ const L = pts[n - 1]; s += '<circle cx="' + X(n - 1) + '" cy="' + Y(L.y) + '" r="4.5" fill="' + c + '" stroke="' + SURF + '" stroke-width="2"/>'; if(o.endLabel) s += txt(X(n - 1) + 8, Y(L.y) + fs*.35, o.endLabel, { fs: fs*1.05, fill: "#e8f3ff", fw: 800 }); }
    s += '<g class="cx-cross" opacity="0"><line x1="0" x2="0" y1="' + padT + '" y2="' + (padT + ih) + '" stroke="' + AXIS + '" stroke-width="1"/><circle r="5.5" fill="' + c + '" stroke="#fff" stroke-width="2"/></g>';
    return { svg: s, h: H, label: o.label,
      pick: x => n ? Math.max(0, Math.min(n - 1, Math.round((x - padL)/(iw/Math.max(1, n - 1))))) : -1,
      show: (i, svg) => { const g = svg.querySelector(".cx-cross"); g.setAttribute("opacity", 1); g.firstChild.setAttribute("x1", X(i)); g.firstChild.setAttribute("x2", X(i)); g.lastChild.setAttribute("cx", X(i)); g.lastChild.setAttribute("cy", Y(pts[i].y)); return { x: X(i), y: Y(pts[i].y), html: pts[i].tip }; } };
  });
}

/* ---------- columns: one per game or season, optionally two stacked series ---------- */
function columns(el, o){
  const items = o.items, n = items.length, ser = o.series;
  return mount(el, W => {
    const fs = font(W), H = o.h || Math.round(Math.min(230, Math.max(150, W*.44)));
    const tot = items.map(it => it.v.reduce((a, b) => a + (b || 0), 0));
    const tk = ticks(0, Math.max(1, ...tot), Math.min(4, Math.max(1, ...tot))), hi = tk[tk.length - 1];
    const padL = Math.max(...tk.map(t => num(t).length))*fs*.6 + 8, padR = 6, padT = fs*(o.peak ? 1.6 : .8), padB = fs*2.2;
    const iw = W - padL - padR, ih = H - padT - padB, band = iw/Math.max(1, n), bw = Math.max(2, Math.min(24, band - 2));
    const X = i => padL + i*band + (band - bw)/2, Y = v => padT + ih - v/hi*ih;
    let s = "";
    tk.forEach(t => { s += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(t) + '" y2="' + Y(t) + '" stroke="' + (t === 0 ? AXIS : GRID) + '" stroke-width="1" shape-rendering="crispEdges"/>' + txt(padL - 6, Y(t) + fs*.35, num(t), { fs, anchor: "end", fill: INK3 }); });
    items.forEach((it, i) => {
      let base = 0, g = '<g class="cx-m">';
      /* stacked: a 2px surface gap between the segments; only the top one gets the round end */
      const top = it.v.reduce((k, v, j) => v ? j : k, -1);
      it.v.forEach((v, j) => {
        if(!v) return;
        const y0 = Y(base) - (base ? 1 : 0), y1 = Y(base + v) + (j < top ? 1 : 0);
        g += j === top ? col(X(i), bw, y0, y1, ser[j].color) : '<rect x="' + X(i) + '" y="' + y1 + '" width="' + bw + '" height="' + Math.max(0, y0 - y1) + '" fill="' + ser[j].color + '"/>';
        base += v;
      });
      s += g + "</g>";
    });
    if(o.peak){ const m = Math.max(...tot); if(m > 0){ const i = tot.lastIndexOf(m); s += txt(X(i) + bw/2, Y(m) - 5, o.peakFmt ? o.peakFmt(m) : num(m), { fs, anchor: "middle", fill: "#e8f3ff", fw: 800 }); } }
    /* x labels: a handful, never crowded */
    const every = Math.max(1, Math.ceil(n/(W/(fs*3.6))));
    items.forEach((it, i) => { if(it.x != null && (i % every === 0 || i === n - 1) && !(i !== n - 1 && n - 1 - i < every)) s += txt(X(i) + bw/2, H - fs*.6, it.x, { fs: fs*.92, anchor: "middle", fill: INK3 }); });
    return { svg: s, h: H, label: o.label,
      pick: x => { const i = Math.floor((x - padL)/band); return i >= 0 && i < n ? i : -1; },
      show: (i, svg) => { svg.querySelectorAll(".cx-m").forEach((g, k) => g.classList.toggle("on", k === i)); svg.classList.add("dim"); return { x: X(i) + bw/2, y: Y(tot[i]), html: items[i].tip }; } };
  });
}

/* ---------- diverging columns: goals for up, goals against down, one axis ---------- */
function diverge(el, o){
  const items = o.items, n = items.length;
  return mount(el, W => {
    const fs = font(W), H = o.h || Math.round(Math.min(230, Math.max(160, W*.46)));
    const m = Math.max(1, ...items.map(it => Math.max(it.up, it.down)));
    const tk = ticks(0, m, Math.min(3, m)), hi = tk[tk.length - 1];
    const padL = Math.max(...tk.map(t => String(t).length))*fs*.6 + 8, padR = 6, padT = fs*.8, padB = fs*2.2;
    const iw = W - padL - padR, ih = H - padT - padB, band = iw/Math.max(1, n), bw = Math.max(2, Math.min(18, band - 2));
    const X = i => padL + i*band + (band - bw)/2, Z = padT + ih/2, Y = v => Z - v/hi*(ih/2 - 1);
    let s = "";
    tk.forEach(t => {
      s += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(t) + '" y2="' + Y(t) + '" stroke="' + (t === 0 ? AXIS : GRID) + '" stroke-width="1" shape-rendering="crispEdges"/>' + txt(padL - 6, Y(t) + fs*.35, t, { fs, anchor: "end", fill: INK3 });
      if(t) s += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(-t) + '" y2="' + Y(-t) + '" stroke="' + GRID + '" stroke-width="1" shape-rendering="crispEdges"/>' + txt(padL - 6, Y(-t) + fs*.35, t, { fs, anchor: "end", fill: INK3 });
    });
    items.forEach((it, i) => { s += '<g class="cx-m">' + (it.up > 0 ? col(X(i), bw, Z - 1, Y(it.up), o.up.color) : "") + (it.down > 0 ? col(X(i), bw, Z + 1, Y(-it.down), o.down.color) : "") + "</g>"; });
    const every = Math.max(1, Math.ceil(n/(W/(fs*3.6))));
    items.forEach((it, i) => { if(it.x != null && (i % every === 0 || i === n - 1) && !(i !== n - 1 && n - 1 - i < every)) s += txt(X(i) + bw/2, H - fs*.6, it.x, { fs: fs*.92, anchor: "middle", fill: INK3 }); });
    return { svg: s, h: H, label: o.label,
      pick: x => { const i = Math.floor((x - padL)/band); return i >= 0 && i < n ? i : -1; },
      show: (i, svg) => { svg.querySelectorAll(".cx-m").forEach((g, k) => g.classList.toggle("on", k === i)); svg.classList.add("dim"); return { x: X(i) + bw/2, y: Y(items[i].up), html: items[i].tip }; } };
  });
}

/* ---------- scatter with team logos (goal difference against points %) ---------- */
function scatter(el, o){
  const items = o.items, n = items.length;
  return mount(el, W => {
    const fs = font(W), H = o.h || Math.round(Math.min(420, W*.9)), L = Math.max(18, Math.min(30, W*.068));
    const xs = items.map(i => i.x), ys = items.map(i => i.y);
    const xt = ticks(Math.min(...xs), Math.max(...xs), 6), yt = ticks(Math.min(...ys), Math.max(...ys), 6);
    const padL = Math.max(...yt.map(t => (o.yFmt || num)(t).length))*fs*.6 + 10, padR = L/2 + 4, padT = L/2 + 4, padB = fs*3.4;
    const iw = W - padL - padR, ih = H - padT - padB;
    const X = v => padL + (v - xt[0])/(xt[xt.length - 1] - xt[0])*iw, Y = v => padT + ih - (v - yt[0])/(yt[yt.length - 1] - yt[0])*ih;
    let s = "";
    yt.forEach(t => { s += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(t) + '" y2="' + Y(t) + '" stroke="' + GRID + '" stroke-width="1" shape-rendering="crispEdges"/>' + txt(padL - 6, Y(t) + fs*.35, (o.yFmt || num)(t), { fs, anchor: "end", fill: INK3 }); });
    xt.forEach(t => { s += '<line y1="' + padT + '" y2="' + (padT + ih) + '" x1="' + X(t) + '" x2="' + X(t) + '" stroke="' + GRID + '" stroke-width="1" shape-rendering="crispEdges"/>' + txt(X(t), padT + ih + fs*1.3, (o.xFmt || num)(t), { fs, anchor: "middle", fill: INK3 }); });
    if(o.xRef != null && o.xRef > xt[0] && o.xRef < xt[xt.length - 1]) s += '<line y1="' + padT + '" y2="' + (padT + ih) + '" x1="' + X(o.xRef) + '" x2="' + X(o.xRef) + '" stroke="' + AXIS + '" stroke-width="1"/>';
    if(o.yRef != null && o.yRef > yt[0] && o.yRef < yt[yt.length - 1]) s += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + Y(o.yRef) + '" y2="' + Y(o.yRef) + '" stroke="' + AXIS + '" stroke-width="1"/>';
    if(o.xLabel) s += txt(padL + iw/2, H - fs*.5, o.xLabel, { fs: fs*.9, anchor: "middle", fill: INK2, fw: 700 });
    if(o.yLabel) s += txt(padL + 4, padT + fs*.9, o.yLabel, { fs: fs*.9, fill: INK2, fw: 700 });
    /* highlighted teams last, so they sit on top */
    const order = items.map((it, i) => i).sort((a, b) => (items[a].hi ? 1 : 0) - (items[b].hi ? 1 : 0));
    order.forEach(i => { const it = items[i], r = it.hi ? L*.56 : L*.5;
      s += '<g class="cx-m' + (it.hi ? " hi" : "") + '" transform="translate(' + X(it.x).toFixed(1) + " " + Y(it.y).toFixed(1) + ')">' +
        (it.hi ? '<circle r="' + (r + 2) + '" fill="none" stroke="' + it.hi + '" stroke-width="2"/>' : "") +
        '<circle r="' + r + '" fill="' + SURF + '" fill-opacity=".8"/><image href="' + esc(it.logo) + '" x="' + (-r) + '" y="' + (-r) + '" width="' + 2*r + '" height="' + 2*r + '"/></g>'; });
    return { svg: s, h: H, label: o.label,
      pick: (x, y) => { let b = -1, bd = (L*.9)*(L*.9); items.forEach((it, i) => { const d = (X(it.x) - x)**2 + (Y(it.y) - y)**2; if(d < bd){ bd = d; b = i; } }); return b; },
      show: (i, svg) => { svg.querySelectorAll(".cx-m").forEach(g => g.classList.remove("on")); const g = svg.querySelectorAll(".cx-m")[order.indexOf(i)]; if(g) g.classList.add("on"); return { x: X(items[i].x), y: Y(items[i].y) - L/2, html: items[i].tip }; },
      href: i => items[i].href || null };
  });
}

/* ---------- a sparkline for a tile (static) ---------- */
function spark(values, o = {}){
  const w = o.w || 120, h = o.h || 36, n = values.length; if(n < 2) return "";
  const all = values.concat(o.ref || []), lo = Math.min(0, ...all), hi = Math.max(1, ...all);
  const X = i => 2 + i*(w - 8)/(n - 1), Y = v => h - 3 - (v - lo)/(hi - lo)*(h - 8);
  const d = values.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join("");
  const r = o.ref ? '<path d="' + o.ref.map((v, i) => (i ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1)).join("") + '" fill="none" stroke="rgba(255,255,255,.4)" stroke-width="1.2"/>' : "";
  return '<svg class="cx-spark" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '" aria-hidden="true">' + r +
    '<path d="' + d + '" fill="none" stroke="' + (o.color || "#ffd36a") + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<circle cx="' + X(n - 1) + '" cy="' + Y(values[n - 1]) + '" r="3.2" fill="' + (o.color || "#ffd36a") + '"/></svg>';
}

P.nhlCharts = { line, columns, diverge, scatter, spark, ticks };
})();
