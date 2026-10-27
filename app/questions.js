/* Questions straight from the bank: every deck listed in _bank/questions/decks.json
   (falls back to nhl alone if the manifest is missing). BALL's row shape
   ({id, tier, cat, q, a, o[3], sub}). Only status "ok" ships.
   Used ids are remembered, so a duel doesn't repeat until the pool runs out.

   P.questions.next(opts) -> { id, q, sub, tier, cat, deck, options: [4 strings], answer: index }
     opts.tiers  ["easy","normal"]       only these tiers
     opts.decks  ["olympics","habs"]     only these decks
     opts.cats   ["olympics","women"]    only these categories */
(function(){
const P = window.PUCK = window.PUCK || {};
const BASE = "_bank/questions/";
const FALLBACK = ["nhl"];
const USED = "puck.used";
let loading = null;
async function deckList(){
  try {
    const r = await fetch(BASE + "decks.json", { cache: "no-cache" });
    if(r.ok){ const j = await r.json(); const d = Array.isArray(j) ? j : j.decks; if(Array.isArray(d) && d.length) return d; }
  } catch(e){}
  return FALLBACK;
}
async function readDeck(d){
  const out = [];
  try {
    const r = await fetch(BASE + d + ".jsonl", { cache: "no-cache" });
    if(!r.ok) return out;
    for(const line of (await r.text()).split("\n")){
      if(!line.trim()) continue;
      try { const q = JSON.parse(line); if(q.status === "ok" && q.id && q.a && q.o && q.o.length >= 3){ q.deck = d; out.push(q); } } catch(e){}
    }
  } catch(e){}
  return out;
}
function load(){
  if(!loading) loading = (async () => {
    const decks = await deckList();
    const seen = new Set(), rows = [];
    for(const part of await Promise.all(decks.map(readDeck))) for(const q of part){ if(!seen.has(q.id)){ seen.add(q.id); rows.push(q); } }
    return rows;
  })();
  return loading;
}
const shuffle = a => { for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random()*(i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const fits = opts => q => (!opts.tiers || opts.tiers.includes(q.tier)) && (!opts.decks || opts.decks.includes(q.deck)) && (!opts.cats || opts.cats.includes(q.cat));
async function next(opts = {}){
  const all = (await load()).filter(fits(opts));
  if(!all.length) return null;
  let used = [];
  try { used = JSON.parse(localStorage.getItem(USED)) || []; } catch(e){}
  const usedSet = new Set(used);
  let pool = all.filter(q => !usedSet.has(q.id));
  if(!pool.length){
    /* this pool ran out: forget only its ids, so other filters keep their memory */
    const mine = new Set(all.map(q => q.id));
    used = used.filter(id => !mine.has(id));
    pool = all;
  }
  const q = pool[Math.floor(Math.random()*pool.length)];
  used.push(q.id);
  try { localStorage.setItem(USED, JSON.stringify(used.slice(-3000))); } catch(e){}
  const options = shuffle([q.a, ...q.o.slice(0, 3)]);
  return { id: q.id, q: q.q, sub: q.sub || "", tier: q.tier, cat: q.cat, deck: q.deck, options, answer: options.indexOf(q.a) };
}
async function count(opts = {}){ return (await load()).filter(fits(opts)).length; }
async function decks(){ const c = {}; for(const q of await load()) c[q.deck] = (c[q.deck] || 0) + 1; return c; }
P.questions = { load, next, count, decks };
})();
