/* PUCK settings. PUCK lives in BALL's Supabase project, in its own puck_ tables
   (see supabase/schema.sql and README.md). The key is BALL's public anon key:
   it's meant to be public, the database rules do the protecting. Empty both to
   run in demo mode (picks on this phone only, switch players on Me). */
window.PUCK_CONFIG = {
  SUPABASE_URL: "https://qychsizyqatnmpenidls.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF5Y2hzaXp5cWF0bm1wZW5pZGxzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NDc2MzIsImV4cCI6MjEwMjAyMzYzMn0.r0pRGgJbO-JcVSQdht6ptumEd3u4Oiwis4C2WEsS5Cw",
  /* the teams the Pool follows */
  POOL_TEAMS: ["MTL", "EDM"],
  /* asked once at sign-up, so a stranger who finds the link can't join */
  LEAGUE_CODE: "habs-oilers",
  /* the three of us; in demo mode these are the players you can switch between */
  DEMO_PLAYERS: ["Martijn", "Felix", "Ale"],
  /* where the NHL feed comes from. Empty = the local dev server (/nhl) on
     localhost, the Supabase function "puck-nhl" everywhere else */
  NHL_PROXY: "",
  /* the Edge Function in BALL's project that relays the feed (the dashboard named it) */
  NHL_FUNCTION: "smart-function"
};
