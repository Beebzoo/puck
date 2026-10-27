/* Static data: the 32 teams with their colours and logos, the sample lists,
   and the Pool's scoring. Questions are not here: they come from the bank,
   _bank/questions/nhl.jsonl (see questions.js). */
(function(){
const P = window.PUCK = window.PUCK || {};
/* games in their own files (app/games/*.js) register here; app.js routes them */
P.games = P.games || [];
P.addGame = g => P.games.push(g);

/* abbrev, name, colours [sweater, stripe]. Logos come from the NHL's own CDN. */
const TEAMS = [
  ["ANA", "Anaheim Ducks", "#F47A38", "#111111"], ["BOS", "Boston Bruins", "#FFB81C", "#111111"],
  ["BUF", "Buffalo Sabres", "#003087", "#FFB81C"], ["CAR", "Carolina Hurricanes", "#CE1126", "#111111"],
  ["CBJ", "Columbus Blue Jackets", "#002654", "#CE1126"], ["CGY", "Calgary Flames", "#D2001C", "#FAAF19"],
  ["CHI", "Chicago Blackhawks", "#CF0A2C", "#111111"], ["COL", "Colorado Avalanche", "#6F263D", "#236192"],
  ["DAL", "Dallas Stars", "#006847", "#8F8F8C"], ["DET", "Detroit Red Wings", "#CE1126", "#FFFFFF"],
  ["EDM", "Edmonton Oilers", "#041E42", "#FF4C00"], ["FLA", "Florida Panthers", "#C8102E", "#041E42"],
  ["LAK", "Los Angeles Kings", "#111111", "#A2AAAD"], ["MIN", "Minnesota Wild", "#154734", "#A6192E"],
  ["MTL", "Montréal Canadiens", "#AF1E2D", "#192168"], ["NJD", "New Jersey Devils", "#CE1126", "#111111"],
  ["NSH", "Nashville Predators", "#FFB81C", "#041E42"], ["NYI", "New York Islanders", "#00539B", "#F47D30"],
  ["NYR", "New York Rangers", "#0038A8", "#CE1126"], ["OTT", "Ottawa Senators", "#C52032", "#111111"],
  ["PHI", "Philadelphia Flyers", "#F74902", "#111111"], ["PIT", "Pittsburgh Penguins", "#111111", "#FCB514"],
  ["SEA", "Seattle Kraken", "#001628", "#99D9D9"], ["SJS", "San Jose Sharks", "#006D75", "#111111"],
  ["STL", "St. Louis Blues", "#002F87", "#FCB514"], ["TBL", "Tampa Bay Lightning", "#002868", "#FFFFFF"],
  ["TOR", "Toronto Maple Leafs", "#00205B", "#FFFFFF"], ["UTA", "Utah Mammoth", "#71AFE5", "#090909"],
  ["VAN", "Vancouver Canucks", "#00205B", "#00843D"], ["VGK", "Vegas Golden Knights", "#B4975A", "#333F42"],
  ["WPG", "Winnipeg Jets", "#041E42", "#AC162C"], ["WSH", "Washington Capitals", "#C8102E", "#041E42"]
].map(([abbr, name, c1, c2]) => ({ abbr, name, c1, c2 }));
P.TEAMS = TEAMS;
P.team = abbr => TEAMS.find(t => t.abbr === abbr) || { abbr, name: abbr, c1: "#16283f", c2: "#F2C230" };
P.logo = (abbr, dark) => "https://assets.nhle.com/logos/nhl/svg/" + abbr + (dark ? "_dark" : "_light") + ".svg";
P.NHL_LOGO = dark => "https://assets.nhle.com/logos/nhl/svg/NHL_" + (dark ? "dark" : "light") + ".svg";
P.flag = cc => "https://flagcdn.com/" + cc.toLowerCase() + ".svg";

/* team answers in the Lists accept the city, the nickname, the full name or the abbreviation */
const NICK = { ANA: "Anaheim|Ducks", BOS: "Boston|Bruins", BUF: "Buffalo|Sabres", CAR: "Carolina|Hurricanes|Canes", CBJ: "Columbus|Blue Jackets",
  CGY: "Calgary|Flames", CHI: "Chicago|Blackhawks|Hawks", COL: "Colorado|Avalanche|Avs", DAL: "Dallas|Stars", DET: "Detroit|Red Wings|Wings",
  EDM: "Edmonton|Oilers", FLA: "Florida|Panthers|Cats", LAK: "Los Angeles|LA|Kings", MIN: "Minnesota|Wild", MTL: "Montreal|Montréal|Canadiens|Habs",
  NJD: "New Jersey|Devils", NSH: "Nashville|Predators|Preds", NYI: "Islanders|Isles", NYR: "Rangers", OTT: "Ottawa|Senators|Sens",
  PHI: "Philadelphia|Philly|Flyers", PIT: "Pittsburgh|Penguins|Pens", SEA: "Seattle|Kraken", SJS: "San Jose|Sharks", STL: "St Louis|Saint Louis|Blues",
  TBL: "Tampa Bay|Tampa|Lightning|Bolts", TOR: "Toronto|Maple Leafs|Leafs", UTA: "Utah|Mammoth", VAN: "Vancouver|Canucks|Nucks",
  VGK: "Vegas|Las Vegas|Golden Knights|Knights", WPG: "Winnipeg|Jets", WSH: "Washington|Capitals|Caps" };
P.teamAliases = abbr => [P.team(abbr).name, abbr, ...(NICK[abbr] || "").split("|")].filter(Boolean);

/* ---------- the Lists. Samples until the bank has its own lists. Every fact is checked against the source. ---------- */
P.LISTS = [
  { id: "cup-last-10", title: "The last 10 Stanley Cup winners", sub: "2016 to 2025. Name a team and it fills every year it won.", kind: "team",
    src: "https://en.wikipedia.org/wiki/List_of_Stanley_Cup_champions",
    items: [[2025, "FLA"], [2024, "FLA"], [2023, "VGK"], [2022, "COL"], [2021, "TBL"], [2020, "TBL"], [2019, "STL"], [2018, "WSH"], [2017, "PIT"], [2016, "PIT"]]
      .map(([y, t]) => ({ label: String(y), team: t })) },
  { id: "original-six", title: "The Original Six", sub: "The six teams of the NHL from 1942 to 1967.", kind: "team",
    src: "https://en.wikipedia.org/wiki/Original_Six",
    items: ["MTL", "TOR", "BOS", "DET", "CHI", "NYR"].map(t => ({ label: "", team: t })) },
  { id: "canadian-teams", title: "The Canadian NHL teams", sub: "All seven of them, as of the 2026-27 season.", kind: "team",
    src: "https://en.wikipedia.org/wiki/National_Hockey_League",
    items: ["MTL", "TOR", "OTT", "WPG", "CGY", "EDM", "VAN"].map(t => ({ label: "", team: t })) },
  { id: "goals-top-10", title: "Top 10 goal scorers, all-time", sub: "NHL regular season. Surnames are enough.", kind: "name",
    src: "https://en.wikipedia.org/wiki/List_of_NHL_players_with_500_or_more_goals",
    items: [["Alex Ovechkin", "Ovechkin Ovi", "RUS"], ["Wayne Gretzky", "Gretzky", "CAN"], ["Gordie Howe", "Howe", "CAN"], ["Jaromír Jágr", "Jagr", "CZE"],
      ["Brett Hull", "Hull", "USA"], ["Marcel Dionne", "Dionne", "CAN"], ["Phil Esposito", "Esposito Espo", "CAN"], ["Mike Gartner", "Gartner", "CAN"],
      ["Mark Messier", "Messier", "CAN"], ["Steve Yzerman", "Yzerman Stevie Y", "CAN"]]
      .map(([n, al, c], i) => ({ label: "#" + (i + 1), name: n, alias: al.split(" "), cc: { RUS: "ru", CAN: "ca", CZE: "cz", USA: "us" }[c] })) },
  { id: "oilers-cups", title: "The Oilers' Stanley Cup years", sub: "Edmonton's five Cups. Type the years.", kind: "year",
    src: "https://en.wikipedia.org/wiki/Edmonton_Oilers",
    items: [1984, 1985, 1987, 1988, 1990].map(y => ({ label: "", year: y, team: "EDM" })) },
  { id: "habs-cups-since-1970", title: "Montréal's Cups since 1970", sub: "Eight of them. Type the years.", kind: "year",
    src: "https://en.wikipedia.org/wiki/List_of_Stanley_Cup_champions",
    items: [1971, 1973, 1976, 1977, 1978, 1979, 1986, 1993].map(y => ({ label: "", year: y, team: "MTL" })) }
];

/* ---------- the Pool's scoring: the one place to change it ---------- */
P.SCORING = {
  winner: 2,        // right winner
  diff: 1,          // right winner and right goal difference (not the exact score)
  exact: 3,         // exact final score, on top of the winner (2 + 3 = 5)
  ending: 1,        // called overtime or the shootout and it went there
  endingWinner: 1,  // ... and had the right winner too
  loneWolf: 1,      // the only one of us with the right winner
  jokerMult: 2      // one joker a week doubles a game
};
})();
