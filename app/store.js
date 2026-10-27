/* Who you are and the Pool's picks. Two modes behind one interface:
   - online: Supabase (accounts, picks shared between the three of us, others'
     picks hidden until puck drop by the database itself, see supabase/schema.sql)
   - demo: no keys in config.js yet; picks live in this browser and you switch
     players on Me, so the Pool can be tried before Supabase is set up. */
(function(){
const P = window.PUCK = window.PUCK || {};
const C = window.PUCK_CONFIG;
const online = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY && window.supabase);
const LS = "puck.demo";
const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch(e){ return {}; } };
const save = d => { try { localStorage.setItem(LS, JSON.stringify(d)); } catch(e){} };

function demo(){
  const d = load();
  if(!d.players) d.players = C.DEMO_PLAYERS.map((n, i) => ({ id: "demo-" + i, name: n }));
  for(const p of d.players) if(!p.team) p.team = "MTL";
  if(!d.picks) d.picks = [];
  if(!d.me) d.me = d.players[0].id;
  save(d);
  return {
    mode: "demo",
    async me(){ const d = load(); return d.players.find(p => p.id === d.me) || null; },
    async players(){ return load().players; },
    async switchTo(id){ const d = load(); d.me = id; save(d); },
    /* your favourite team (one of the 32 abbreviations) */
    async setTeam(abbr){ const d = load(), p = d.players.find(x => x.id === d.me); if(!p) throw new Error("Pick a player first."); p.team = abbr; save(d); },
    async picks(){ return load().picks; },
    async savePick(pk){
      if(new Date(pk.start_utc) <= new Date()) throw new Error("This game has started, picks are locked.");
      const d = load(), me = d.me;
      d.picks = d.picks.filter(p => !(p.user === me && p.game_id === pk.game_id));
      d.picks.push({ ...pk, user: me });
      save(d);
    },
    async signOut(){}
  };
}

function supa(){
  /* its own storage key: on the same site as BALL (beebzoo.github.io/…) the
     default key is shared, and signing in here would replace BALL's session */
  const sb = window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY, { auth: { storageKey: "puck-auth", persistSession: true, autoRefreshToken: true } });
  let profile = null;
  const row = r => ({ user: r.user_id, game_id: r.game_id, home: r.home, away: r.away, ending: r.ending, joker: r.joker, start_utc: r.start_utc });
  return {
    mode: "online", sb,
    /* the session is read from this phone (no network), so Play draws at once */
    async me(){
      const { data: { session } } = await sb.auth.getSession();
      const user = session && session.user;
      if(!user) return (profile = null);
      if(profile && profile.id === user.id) return profile;
      const { data: p } = await sb.from("puck_profiles").select("id,name,team").eq("id", user.id).maybeSingle();
      const given = user.user_metadata && user.user_metadata.name;
      const prefix = (user.email || "Me").split("@")[0].slice(0, 24);
      /* "unnamed": still on the e-mail name the app made up, so Me and Play ask for a real one */
      profile = p ? { ...p, unnamed: !given && p.name === prefix } : { id: user.id, name: given || prefix, team: "MTL", missing: true, unnamed: !given };
      if(profile.missing){ await sb.from("puck_profiles").insert({ id: profile.id, name: profile.name }); delete profile.missing; }
      return profile;
    },
    async signUp(email, password, name, code){
      if(code.trim().toLowerCase() !== C.LEAGUE_CODE) throw new Error("That league code isn't right.");
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: location.origin + location.pathname } });
      if(error) throw error;
      if(data.user && data.session) await sb.from("puck_profiles").upsert({ id: data.user.id, name });
      return data;
    },
    async rename(name){
      const me = await this.me(); name = name.trim().slice(0, 24);
      if(!name) throw new Error("Type a name.");
      const { error } = await sb.from("puck_profiles").update({ name }).eq("id", me.id);
      if(error) throw error; profile = { ...me, name, unnamed: false };
      /* remember it on the account too, so it never asks again */
      try { await sb.auth.updateUser({ data: { name } }); } catch(e){}
    },
    /* your favourite team, in puck_profiles.team (default MTL) */
    async setTeam(abbr){
      const me = await this.me(); if(!me) throw new Error("Sign in first.");
      const { error } = await sb.from("puck_profiles").update({ team: abbr }).eq("id", me.id);
      if(error) throw error; profile = { ...me, team: abbr };
    },
    async signIn(email, password){
      if(!email || !password) throw new Error("Type your email and password.");
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if(error) throw new Error(/invalid login/i.test(error.message) ? "That email and password don't match. Ask Martijn if you've lost yours."
        : /not confirmed/i.test(error.message) ? "This account isn't confirmed yet. Ask Martijn to confirm it in Supabase."
        : /fetch|network/i.test(error.message) ? "No connection. Try again when you're online." : error.message);
      profile = null;
    },
    async signOut(){ await sb.auth.signOut(); profile = null; },
    async players(){ if(!(await sb.auth.getSession()).data.session) return []; const { data, error } = await sb.from("puck_profiles").select("id,name,team").order("created_at"); if(error) throw error; return data; },
    /* everything the database lets us see, plus a scoreless "has picked" row for
       the others' picks that are still hidden before puck drop */
    async picks(){
      /* signed out there is nothing to see (and BALL's project answers 401) */
      if(!(await sb.auth.getSession()).data.session) return [];
      const [{ data, error }, flags] = await Promise.all([sb.from("puck_predictions").select("*"), sb.from("puck_pick_status").select("user_id,game_id")]);
      if(error) throw error;
      const out = data.map(row), seen = new Set(out.map(p => p.user + ":" + p.game_id));
      for(const f of flags.data || []) if(!seen.has(f.user_id + ":" + f.game_id)) out.push({ user: f.user_id, game_id: f.game_id, hidden: true });
      return out;
    },
    async savePick(pk){
      const me = await this.me();
      const { error } = await sb.from("puck_predictions").upsert({ user_id: me.id, game_id: pk.game_id, start_utc: pk.start_utc, home: pk.home, away: pk.away, ending: pk.ending, joker: !!pk.joker, updated_at: new Date().toISOString() });
      if(error) throw new Error(/row-level security/i.test(error.message) ? "This game has started, picks are locked." : error.message);
    }
  };
}
P.store = online ? supa() : demo();
})();
