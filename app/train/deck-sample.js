/* T1 sample deck: a few questions to test the training screens with. Loaded by
   app/train/train.js only when the real deck (app/train/deck.js) is missing. */
(function(){
const P = window.PUCK = window.PUCK || {};
if(P.TRAIN && Array.isArray(P.TRAIN.items)) return;
P.TRAIN = {
  version: "sample-1", sample: true,
  lessons: [
    { id: "teams", n: 1, title: "The 32 teams", blurb: "Logo, sweater, city and nickname." },
    { id: "divisions", n: 2, title: "Divisions & conferences", blurb: "Who plays in which division." },
    { id: "rules", n: 3, title: "The rules", blurb: "Offside, icing, power play, overtime, the playoffs." },
    { id: "stars", n: 4, title: "Today's stars", blurb: "Two or three faces per team." },
    { id: "legends", n: 5, title: "The legends", blurb: "The greats who built the game." },
    { id: "trophies", n: 6, title: "Trophies & the Stanley Cup", blurb: "What gets won, and by whom." },
    { id: "lore", n: 7, title: "Rivalries & lore", blurb: "Habs–Leafs, the Battle of Alberta, the Original Six." }
  ],
  items: [
    { id: "s-teams-1", lesson: "teams", q: "Which team's logo is this?", a: "Montréal Canadiens", o: ["Toronto Maple Leafs", "New York Rangers", "Washington Capitals"],
      why: "The CH stands for Club de Hockey Canadien. The Canadiens are the oldest NHL club and have won the Stanley Cup 24 times.", show: "before", img: { logo: "MTL" } },
    { id: "s-teams-2", lesson: "teams", q: "Whose home sweater is this?", a: "Edmonton Oilers", o: ["New York Islanders", "Buffalo Sabres", "St. Louis Blues"],
      why: "Royal blue with orange: the Oilers. Their city grew on the oil business, hence the name.", show: "before", img: { kit: "EDM" } },
    { id: "s-teams-3", lesson: "teams", q: "Which city do the Kraken play in?", a: "Seattle", o: ["San Jose", "Vancouver", "Salt Lake City"],
      why: "The Seattle Kraken joined in 2021 as the NHL's 32nd team. A kraken is a sea monster from Scandinavian legend.", img: { logo: "SEA" } },
    { id: "s-div-1", lesson: "divisions", q: "Which division are these eight teams in?", a: "Atlantic", o: ["Metropolitan", "Central", "Pacific"],
      why: "The Atlantic is one of the two Eastern Conference divisions. Four of the Original Six play in it: Boston, Detroit, Montréal and Toronto.", show: "before",
      img: { logos: ["BOS", "BUF", "DET", "FLA", "MTL", "OTT", "TBL", "TOR"] } },
    { id: "s-rules-1", lesson: "rules", q: "An attacker skates into the zone before the puck. What's the call?", a: "Offside", o: ["Icing", "Hooking", "Interference"],
      why: "The puck has to cross the blue line into the attacking zone before any attacker's skates do. If not, play stops and there's a faceoff just outside the zone.", img: { diagram: "offside" } },
    { id: "s-rules-2", lesson: "rules", q: "A team shoots the puck from its own half all the way past the other goal line, untouched. What is it?", a: "Icing", o: ["Offside", "A power play", "A delay of game"],
      why: "That's icing. The faceoff goes back to the end of the team that iced it, and that team can't change lines.", img: { diagram: "icing" } },
    { id: "s-rules-3", lesson: "rules", q: "How many rounds are there in the NHL playoffs?", a: "4", o: ["3", "5", "6"],
      why: "Sixteen teams, four rounds, every series best of seven. The two conference champions meet in the Stanley Cup Final.", img: { diagram: "playoffs" } },
    { id: "s-stars-1", lesson: "stars", q: "Who is this?", a: "Connor McDavid", o: ["Leon Draisaitl", "Nathan MacKinnon", "Auston Matthews"],
      why: "Connor McDavid, Edmonton's captain, number 97. First overall pick in 2015 and widely seen as the best player in the world.", show: "before", img: { face: 8478402, name: "Connor McDavid" } },
    { id: "s-stars-2", lesson: "stars", q: "Who has scored the most goals in NHL history?", a: "Alex Ovechkin", o: ["Wayne Gretzky", "Gordie Howe", "Jaromír Jágr"],
      why: "Ovechkin passed Wayne Gretzky's 894 goals in April 2025, playing his whole career for the Washington Capitals.", img: { face: 8471214, name: "Alex Ovechkin" } },
    { id: "s-legends-1", lesson: "legends", q: "Which defenceman flew through the air after his 1970 Cup-winning goal?", a: "Bobby Orr", o: ["Ray Bourque", "Denis Potvin", "Larry Robinson"],
      why: "Bobby Orr of the Boston Bruins. The photo of him flying after scoring in overtime is one of the most famous in sport.", img: { face: 8450070, name: "Bobby Orr" } },
    { id: "s-trophies-1", lesson: "trophies", q: "What do the playoff champions win?", a: "The Stanley Cup", o: ["The Presidents' Trophy", "The Hart Trophy", "The Conn Smythe Trophy"],
      why: "The Stanley Cup, first awarded in 1893. Every player on the winning team gets a day with it.", img: { diagram: "unknown-one" } },
    { id: "s-lore-1", lesson: "lore", q: "Which of these is NOT one of the Original Six?", a: "Philadelphia Flyers", o: ["Chicago Blackhawks", "Detroit Red Wings", "New York Rangers"],
      why: "The Original Six were the NHL's only teams from 1942 to 1967: Boston, Chicago, Detroit, Montréal, New York and Toronto. Philadelphia joined in the 1967 expansion.", img: { logos: ["BOS", "CHI", "DET", "MTL", "NYR", "TOR"] } }
  ]
};
})();
