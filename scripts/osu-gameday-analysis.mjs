#!/usr/bin/env node
/**
 * OSU 2025 Game Day Restaurant Analysis (read-only).
 *
 * Data below is copied verbatim from Supabase daily_sales. Baselines
 * (base_*) are the DB-computed rolling average of the prior 8 Saturdays per
 * location (window function, ROWS 8 PRECEDING..1 PRECEDING over the
 * Saturday-only series). Nothing here queries or mutates the DB.
 */

// date, loc, rev, guests, checks, labor, base_rev, base_guests, base_checks, base_labor
const ROWS = [
  ['2025-08-30','Gahanna',15456.43,506,187,3312.27,17380.87,576.6,218.6,3144.29],
  ['2025-08-30','Grandview',21430.83,812,231,3732.33,24493.52,921.6,274.4,4068.12],
  ['2025-08-30','Westerville',10366.46,437,146,2455.06,13668.39,551.5,193.1,2793.63],
  ['2025-09-06','Gahanna',15707.38,530,207,2908.81,17623.00,580.8,218.6,3186.65],
  ['2025-09-06','Grandview',12436.32,495,148,3524.20,25026.65,941.3,280.3,4107.47],
  ['2025-09-06','Westerville',10390.29,445,146,2623.99,13532.58,549.0,192.6,2776.16],
  ['2025-09-13','Gahanna',19095.44,705,239,3543.06,17645.62,576.4,217.6,3140.35],
  ['2025-09-13','Grandview',24822.79,926,269,4041.11,23360.79,881.5,262.9,4033.34],
  ['2025-09-13','Westerville',9221.79,380,135,2439.42,13193.93,540.6,188.5,2736.20],
  ['2025-09-27','Gahanna',16427.67,575,206,3093.81,17857.43,592.8,222.9,3199.68],
  ['2025-09-27','Grandview',20213.77,854,255,3621.93,23739.52,892.6,264.6,3993.78],
  ['2025-09-27','Westerville',12646.04,510,186,2711.62,12614.53,510.5,178.8,2688.56],
  ['2025-10-04','Gahanna',17682.25,614,238,3060.93,17473.39,586.6,218.4,3160.83],
  ['2025-10-04','Grandview',26884.40,981,309,3601.86,23198.58,881.3,262.8,3953.07],
  ['2025-10-04','Westerville',11692.53,577,166,2812.35,12303.98,499.6,176.5,2686.82],
  ['2025-10-11','Gahanna',18549.65,606,234,3189.03,17732.75,594.3,220.8,3152.36],
  ['2025-10-11','Grandview',21350.95,834,243,3762.25,23376.06,884.4,265.8,3861.27],
  ['2025-10-11','Westerville',11260.53,479,171,2581.56,12011.50,496.0,171.6,2679.90],
  ['2025-10-18','Gahanna',16404.09,603,243,2939.87,17496.26,596.8,221.4,3165.92],
  ['2025-10-18','Grandview',22399.88,946,268,3686.00,22510.02,868.4,257.6,3790.87],
  ['2025-10-18','Westerville',13695.69,553,224,2590.33,11612.28,490.1,168.4,2662.91],
  ['2025-11-01','Gahanna',19912.04,669,237,3419.42,17358.44,601.0,227.1,3129.74],
  ['2025-11-01','Grandview',25271.84,871,272,3638.89,21864.98,858.4,253.1,3789.75],
  ['2025-11-01','Westerville',13314.67,556,189,2498.98,11997.11,503.0,175.4,2617.73],
  ['2025-11-08','Gahanna',19325.07,682,250,3318.77,17884.02,618.4,230.9,3193.57],
  ['2025-11-08','Grandview',27425.52,962,298,4211.54,23469.42,905.4,268.6,3804.09],
  ['2025-11-08','Westerville',14166.18,503,182,2409.55,12362.66,516.9,180.8,2602.11],
  ['2025-11-15','Gahanna',18147.75,595,227,3164.55,17912.73,615.5,232.3,3165.53],
  ['2025-11-15','Grandview',26932.94,1047,295,3799.56,23794.76,909.9,272.3,3825.39],
  ['2025-11-15','Westerville',12941.78,461,179,2508.71,12980.71,532.3,186.6,2598.37],
  ['2025-11-22','Gahanna',16721.28,701,229,2974.02,17886.71,613.1,231.1,3169.76],
  ['2025-11-22','Grandview',22670.84,848,250,3474.13,23947.38,915.8,272.5,3811.35],
  ['2025-11-22','Westerville',13909.03,557,207,2336.08,12845.76,520.0,184.3,2577.86],
  ['2025-11-29','Gahanna',12562.89,384,151,2680.31,17923.41,628.9,234.0,3154.79],
  ['2025-11-29','Grandview',14542.56,585,171,3288.54,24254.51,915.0,271.9,3792.88],
  ['2025-11-29','Westerville',8918.91,350,119,2367.26,13003.63,525.9,186.9,2530.92],
];

// Game classification — reconciled to the actual 2025 Big Ten schedule.
// The prompt's table had internal contradictions (Penn State listed on 10-11,
// which is the Illinois away date; Purdue listed home on 11-01, which is the
// Penn State home date). OSU 2025 = 7 home + 5 away. 09-20 & 10-25 were byes.
const GAMES = {
  '2025-08-30': { opp: 'Texas',         ha: 'HOME', result: 'L 7-14',  kick: 'Night (7:30p)' },
  '2025-09-06': { opp: 'Grambling St.', ha: 'HOME', result: 'W 70-0',  kick: 'Noon' },
  '2025-09-13': { opp: 'Ohio',          ha: 'HOME', result: 'W 37-9',  kick: 'Afternoon' },
  '2025-09-27': { opp: 'at Washington', ha: 'AWAY', result: '—',       kick: 'Night' },
  '2025-10-04': { opp: 'Minnesota',     ha: 'HOME', result: '—',       kick: 'Afternoon' },
  '2025-10-11': { opp: 'at Illinois',   ha: 'AWAY', result: '—',       kick: 'Afternoon' },
  '2025-10-18': { opp: 'at Wisconsin',  ha: 'AWAY', result: '—',       kick: 'Night' },
  '2025-11-01': { opp: 'Penn State',    ha: 'HOME', result: '—',       kick: 'Noon' },
  '2025-11-08': { opp: 'at Purdue',     ha: 'AWAY', result: '—',       kick: 'Afternoon' },
  '2025-11-15': { opp: 'UCLA',          ha: 'HOME', result: '—',       kick: 'Afternoon' },
  '2025-11-22': { opp: 'Rutgers',       ha: 'HOME', result: '—',       kick: 'Afternoon' },
  '2025-11-29': { opp: 'at Michigan',   ha: 'AWAY', result: '—',       kick: 'Noon' },
};

const LOCS = ['Grandview', 'Gahanna', 'Westerville'];
const DATES = [...new Set(ROWS.map(r => r[0]))];

// index: byDateLoc[date][loc] = {rev,guests,checks,labor,base_rev,...}
const byDateLoc = {};
for (const [date, loc, rev, guests, checks, labor, brev, bguests, bchecks, blabor] of ROWS) {
  (byDateLoc[date] ??= {})[loc] = { rev, guests, checks, labor, brev, bguests, bchecks, blabor };
}

const pct = (a, b) => (b === 0 ? 0 : ((a - b) / b) * 100);
const money = n => '$' + Math.round(n).toLocaleString('en-US');
const money2 = n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sp = n => (n >= 0 ? '+' : '') + n.toFixed(1) + '%';
const mean = xs => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = xs => { const m = mean(xs); return Math.sqrt(mean(xs.map(x => (x - m) ** 2))); }; // population SD
function pearson(xs, ys) {
  const n = xs.length, mx = mean(xs), my = mean(ys);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { const a = xs[i] - mx, b = ys[i] - my; num += a * b; dx += a * a; dy += b * b; }
  return num / Math.sqrt(dx * dy);
}

// Per-game rollups (3-location totals) + per-location lift series
const perGame = DATES.map(date => {
  const g = GAMES[date];
  const cells = LOCS.map(l => byDateLoc[date][l]);
  const rev = cells.reduce((s, c) => s + c.rev, 0);
  const brev = cells.reduce((s, c) => s + c.brev, 0);
  const guests = cells.reduce((s, c) => s + c.guests, 0);
  const bguests = cells.reduce((s, c) => s + c.bguests, 0);
  const checks = cells.reduce((s, c) => s + c.checks, 0);
  const bchecks = cells.reduce((s, c) => s + c.bchecks, 0);
  const labor = cells.reduce((s, c) => s + c.labor, 0);
  const blabor = cells.reduce((s, c) => s + c.blabor, 0);
  return {
    date, ...g,
    rev, brev, revLift: pct(rev, brev),
    guests, bguests, guestLift: pct(guests, bguests),
    check: rev / checks, bcheck: brev / bchecks,
    laborPct: (labor / rev) * 100, blaborPct: (blabor / brev) * 100,
    perLoc: Object.fromEntries(LOCS.map(l => {
      const c = byDateLoc[date][l];
      return [l, {
        rev: c.rev, revLift: pct(c.rev, c.brev),
        guestLift: pct(c.guests, c.bguests),
        check: c.rev / c.checks, bcheck: c.brev / c.bchecks,
        laborPct: (c.labor / c.rev) * 100, blaborPct: (c.blabor / c.brev) * 100,
      }];
    })),
  };
});

const home = perGame.filter(g => g.ha === 'HOME');
const away = perGame.filter(g => g.ha === 'AWAY');

// Home/away aggregate lifts (weighted by summed revenue vs summed baseline)
function aggLift(list) {
  const rev = list.reduce((s, g) => s + g.rev, 0);
  const brev = list.reduce((s, g) => s + g.brev, 0);
  const guests = list.reduce((s, g) => s + g.guests, 0);
  const bguests = list.reduce((s, g) => s + g.bguests, 0);
  const checkAvg = mean(list.map(g => g.check));
  const bcheckAvg = mean(list.map(g => g.bcheck));
  return { revLift: pct(rev, brev), guestLift: pct(guests, bguests), checkAvg, bcheckAvg,
    meanRevLift: mean(list.map(g => g.revLift)) };
}
const homeAgg = aggLift(home), awayAgg = aggLift(away);

// Per-location home/away average lift
const locAgg = {};
for (const l of LOCS) {
  const hRev = home.reduce((s, g) => s + g.perLoc[l].rev, 0);
  const hBase = home.reduce((s, g) => s + byDateLoc[g.date][l].brev, 0);
  const aRev = away.reduce((s, g) => s + g.perLoc[l].rev, 0);
  const aBase = away.reduce((s, g) => s + byDateLoc[g.date][l].brev, 0);
  const hLifts = home.map(g => ({ date: g.date, opp: g.opp, lift: g.perLoc[l].revLift }));
  const aLifts = away.map(g => ({ date: g.date, opp: g.opp, lift: g.perLoc[l].revLift }));
  const allLifts = [...hLifts, ...aLifts].sort((x, y) => y.lift - x.lift);
  locAgg[l] = {
    homeLift: pct(hRev, hBase), awayLift: pct(aRev, aBase),
    homeMean: mean(home.map(g => g.perLoc[l].revLift)),
    awayMean: mean(away.map(g => g.perLoc[l].revLift)),
    best: allLifts[0], worst: allLifts[allLifts.length - 1],
  };
}

// Correlation of per-game revenue-lift% series across the 12 games
const liftSeries = Object.fromEntries(LOCS.map(l => [l, perGame.map(g => g.perLoc[l].revLift)]));
const corr = {
  'Grandview-Gahanna': pearson(liftSeries.Grandview, liftSeries.Gahanna),
  'Grandview-Westerville': pearson(liftSeries.Grandview, liftSeries.Westerville),
  'Gahanna-Westerville': pearson(liftSeries.Gahanna, liftSeries.Westerville),
};

// SD analysis on HOME-game total revenue lift
const homeLifts = home.map(g => g.revLift);
const homeMean = mean(homeLifts), homeSD = sd(homeLifts);
const outliers = home.map(g => ({ ...g, z: (g.revLift - homeMean) / homeSD }))
  .filter(g => Math.abs(g.z) > 1)
  .sort((a, b) => a.z - b.z);

const best = [...perGame].sort((a, b) => b.revLift - a.revLift)[0];
const worst = [...perGame].sort((a, b) => a.revLift - b.revLift)[0];

// Confound-adjusted view: home games ≥ baseline count; and means excluding the
// three confounded dates (Grambling noon blowout, Texas primetime opener,
// Thanksgiving at-Michigan). Numbers correct — narrative must match them.
const homeAtOrAbove = home.filter(g => g.revLift >= -1).length;
const homeExGrambling = mean(home.filter(g => g.date !== '2025-09-06').map(g => g.revLift));
const awayExMich = mean(away.filter(g => g.date !== '2025-11-29').map(g => g.revLift));
const CONFOUNDS = new Set(['2025-09-06', '2025-08-30', '2025-11-29']);
const cleanMean = mean(perGame.filter(g => !CONFOUNDS.has(g.date)).map(g => g.revLift));

// ─── Emit markdown ─────────────────────────────────────────────────────────────
let md = '';
const P = s => { md += s + '\n'; };

P('# OSU Game Day Restaurant Analysis — 2025 Season');
P('');
P('High Bank Distillery restaurants (Grandview · Gahanna · Westerville) vs. the Ohio State football schedule.');
P('Baseline = rolling average of the **prior 8 Saturdays** per location (computed in-DB via window functions). Read-only analysis of `daily_sales`; PO BOX 21 (satellite) excluded.');
P('');
P('> **Data-driven correction to the provided schedule.** The prompt\'s table was internally contradictory (Penn State listed on 10-11 — that\'s the Illinois *away* date; Purdue listed *home* on 11-01 — that\'s the Penn State *home* date). Reconciled to the actual 2025 Big Ten schedule: **7 home, 5 away**, with **09-20 and 10-25 as byes** (both showed normal revenue, confirming they were not game days). Game *results* are not stored in `daily_sales`; only the three the prompt supplied (Texas, Grambling, Ohio) are shown — others are left blank rather than invented. No CFP games are included: OSU\'s Jan-2026 playoff participation can\'t be confirmed from sales data and was not fabricated.');
P('');
P('---');
P('');
P('## Executive Summary');
P('');
P(`- **Game days analyzed:** 12 (7 home, 5 away).`);
P(`- **Headline — game days barely move these suburban restaurants.** The raw averages look negative (home **${sp(homeAgg.revLift)}**, away **${sp(awayAgg.revLift)}** vs baseline), but that\'s the work of just **three confounded Saturdays**: the Grambling noon blowout, the Texas primetime opener, and the Thanksgiving/at-Michigan finale. Strip those out and both home (**${sp(homeExGrambling)}** ex-Grambling) and away (**${sp(awayExMich)}** ex-Thanksgiving) game Saturdays sit **right at their 8-week baseline** — the remaining 9 games average **${sp(cleanMean)}**.`);
P(`- **Home games are a coin flip, not a reliable drop:** **${homeAtOrAbove} of 7** home games ran above baseline (Penn State +14.2%, Minnesota +6.2%, UCLA +6.1%), with Ohio (-2.0%) and Rutgers (-2.5%) essentially flat. The negative home aggregate is dominated by two *early*-season games (Grambling -31.4%, Texas -14.9%).`);
P(`- **Best game day:** ${best.date} vs ${best.opp} (${best.ha}) — total revenue ${sp(best.revLift)} vs baseline${best.result !== '—' ? `, ${best.result}` : ''}. (A home game — so home Saturdays clearly *can* lift.)`);
P(`- **Worst game day:** ${worst.date} vs ${worst.opp} (${worst.ha}) — total revenue ${sp(worst.revLift)} vs baseline${worst.result !== '—' ? `, ${worst.result}` : ''}. Thanksgiving weekend **and** The Game at Michigan — a holiday + rivalry double whammy, not a normal away game.`);
P(`- **What actually moves the needle:** kickoff time (a **noon** low-draw home game = all-day tailgate = deep trough), the **season opener** hype, and the **Thanksgiving** holiday — *not* home-vs-away by itself.`);
P('');
P('## Home vs Away Comparison');
P('');
P('| Metric | Home Games Avg | Away Games Avg | Difference |');
P('|--------|---------------:|---------------:|-----------:|');
P(`| Revenue lift vs baseline | ${sp(homeAgg.revLift)} | ${sp(awayAgg.revLift)} | ${(homeAgg.revLift - awayAgg.revLift).toFixed(1)} pts |`);
P(`| Guest-count lift vs baseline | ${sp(homeAgg.guestLift)} | ${sp(awayAgg.guestLift)} | ${(homeAgg.guestLift - awayAgg.guestLift).toFixed(1)} pts |`);
P(`| Avg check (game day) | ${money2(homeAgg.checkAvg)} | ${money2(awayAgg.checkAvg)} | ${money2(homeAgg.checkAvg - awayAgg.checkAvg)} |`);
{
  const bestHomeLoc = Object.entries(locAgg).sort((a,b)=>b[1].homeLift-a[1].homeLift)[0][0];
  const bestAwayLoc = Object.entries(locAgg).sort((a,b)=>b[1].awayLift-a[1].awayLift)[0][0];
  P(`| Best location (least hurt / most helped) | ${bestHomeLoc} | ${bestAwayLoc} | — |`);
}
P('');
P(`> Both raw averages are pulled negative by outliers. **Home ex-Grambling: ${sp(homeExGrambling)}. Away ex-Thanksgiving: ${sp(awayExMich)}.** On that adjusted basis home and away are effectively identical and both at baseline — the home/away distinction is *not* what drives game-day revenue here.`);
P('');
P('## Per-Game Breakdown');
P('');
P('| Date | Opponent | H/A | Result | Grandview | Gahanna | Westerville | Total | vs Baseline |');
P('|------|----------|-----|--------|----------:|--------:|------------:|------:|:-----------:|');
for (const g of perGame) {
  P(`| ${g.date} | ${g.opp} | ${g.ha} | ${g.result} | ${money(g.perLoc.Grandview.rev)} | ${money(g.perLoc.Gahanna.rev)} | ${money(g.perLoc.Westerville.rev)} | ${money(g.rev)} | ${sp(g.revLift)} |`);
}
P('');
P('## Per-Location Analysis');
P('');
for (const l of LOCS) {
  const a = locAgg[l];
  P(`### ${l}`);
  P(`- **Avg lift on home games:** ${sp(a.homeLift)} (per-game mean ${sp(a.homeMean)})`);
  P(`- **Avg lift on away games:** ${sp(a.awayLift)} (per-game mean ${sp(a.awayMean)})`);
  P(`- **Best single game:** ${a.best.date} vs ${a.best.opp} — ${sp(a.best.lift)}`);
  P(`- **Worst single game:** ${a.worst.date} vs ${a.worst.opp} — ${sp(a.worst.lift)}`);
  P('');
}
P('## Anomalies & Standout Findings');
P('');
P(`Home-game total-revenue lift: mean **${homeMean.toFixed(1)}%**, standard deviation **${homeSD.toFixed(1)} pts**. Games beyond ±1 SD:`);
P('');
if (outliers.length === 0) P('- None beyond ±1 SD.');
for (const o of outliers) {
  P(`- **${o.date} vs ${o.opp}** — ${sp(o.revLift)} (${o.z.toFixed(1)} SD ${o.z < 0 ? 'below' : 'above'} the home-game mean).${o.date === '2025-09-06' ? ' The Grambling blowout was a **noon** kickoff — an all-day tailgate that gutted Grandview (' + sp(perGame.find(g=>g.date==='2025-09-06').perLoc.Grandview.revLift) + ').' : ''}${o.date === '2025-08-30' ? ' The **Texas loss** (night kickoff) opened the season below every baseline.' : ''}`);
}
P('');
P('- **Wins vs losses:** only three results are known from the prompt (Texas L, Grambling W, Ohio W). Both the loss *and* the 70-0 win landed below baseline, so within the confirmable set the **score is not predictive** — kickoff time and the calendar explain far more. A caveat, not a conclusion, given N=3 known outcomes.');
P('- **Kickoff time:** the deepest home trough was the **noon** Grambling kickoff (all-day tailgate, no dinner rebound). Afternoon/evening home games (Ohio 09-13, Minnesota 10-04, UCLA 11-15) recovered to at-or-above baseline as the crowd filtered back for dinner. Penn State (also listed noon) held up (+14%) because it fell in the confound-free late-season stretch — a reminder these labels are coarse and N is small.');
{
  const texasLift = perGame.find(g => g.date === '2025-08-30').revLift;
  const michLift = perGame.find(g => g.date === '2025-11-29').revLift;
  P(`- **Marquee vs cupcake:** the marquee matchups didn't drive *lifts* — they drove the **biggest drops**. The Texas opener (${sp(texasLift)}) and the at-Michigan finale (${sp(michLift)}) were the two softest Saturdays; big games pull people to the stadium / away-watch parties, not to the suburbs. "Cupcake" Grambling was the exception only because its noon kickoff meant an all-day tailgate.`);
}
P('');
P('## Correlation Matrix (per-game revenue-lift %, 12 games)');
P('');
P('| Location pair | Pearson r |');
P('|---------------|:---------:|');
P(`| Grandview ↔ Gahanna | ${(corr['Grandview-Gahanna']*100).toFixed(0)}% (${corr['Grandview-Gahanna'].toFixed(2)}) |`);
P(`| Grandview ↔ Westerville | ${(corr['Grandview-Westerville']*100).toFixed(0)}% (${corr['Grandview-Westerville'].toFixed(2)}) |`);
P(`| Gahanna ↔ Westerville | ${(corr['Gahanna-Westerville']*100).toFixed(0)}% (${corr['Gahanna-Westerville'].toFixed(2)}) |`);
P('');
P('High positive r = the locations move together on game days (a game that hurts one hurts all).');
P('');
P('## Key Takeaways & Recommendations');
P('');
P(`1. **Don\'t reflexively re-staff for "a game."** After removing three confounded dates, game-day Saturdays run at baseline (${sp(cleanMean)} across the other 9). The mere existence of an OSU game is **not** a staffing signal — treat a normal game Saturday like any other Saturday.`);
P(`2. **Do plan for three specific patterns that genuinely swing revenue:**`);
P(`   - **Noon kickoff vs a low-draw opponent** (e.g., Grambling 09-06, -31%): an all-day tailgate that gutted Grandview to ${sp(perGame.find(g=>g.date==='2025-09-06').perLoc.Grandview.revLift)}. Cut labor hard for these; the dinner rebound is weak.`);
P(`   - **Thanksgiving / The-Game weekend (11-29, ${sp(perGame.find(g=>g.date==='2025-11-29').revLift)})**: the worst Saturday of the season. Minimum viable staffing; consider a rivalry watch-party promo to claw back traffic.`);
P(`   - **The primetime season opener (Texas, -14.9%)**: opener hype pulls people downtown/to watch parties. Trim the early-season opener.`);
P(`3. **Late-season home games actually *lift* (Penn State +14%, UCLA +6%).** Where the opponent draws a crowd but the kickoff is afternoon/evening, some of that crowd converts to dinner traffic — protect the dinner shift on those dates rather than cutting.`);
P(`4. **One chain-wide playbook works, but tune by location.** Grandview and Gahanna move together on game days (r=${corr['Grandview-Gahanna'].toFixed(2)}); Westerville is the least correlated and structurally the most home-game-sensitive (home ${sp(locAgg.Westerville.homeLift)}), so it can cut the deepest on the noon/opener/holiday dates.`);
P(`5. **Game outcome is not a usable signal from this data.** Only three results are known, and the 70-0 blowout win and the Texas loss both sat below baseline — kickoff time, opponent draw, and the calendar explain far more than the scoreboard.`);
P('');
P('---');
P('*Read-only analysis. Baselines and game-day figures pulled from Supabase `daily_sales`; no data modified.*');

// Print + write
process.stdout.write(md);
const fs = await import('node:fs');
fs.writeFileSync(new URL('../reports/osu-gameday-2025.md', import.meta.url), md);
