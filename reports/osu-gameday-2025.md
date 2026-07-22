# OSU Game Day Restaurant Analysis — 2025 Season

High Bank Distillery restaurants (Grandview · Gahanna · Westerville) vs. the Ohio State football schedule.
Baseline = rolling average of the **prior 8 Saturdays** per location (computed in-DB via window functions). Read-only analysis of `daily_sales`; PO BOX 21 (satellite) excluded.

> **Data-driven correction to the provided schedule.** The prompt's table was internally contradictory (Penn State listed on 10-11 — that's the Illinois *away* date; Purdue listed *home* on 11-01 — that's the Penn State *home* date). Reconciled to the actual 2025 Big Ten schedule: **7 home, 5 away**, with **09-20 and 10-25 as byes** (both showed normal revenue, confirming they were not game days). Game *results* are not stored in `daily_sales`; only the three the prompt supplied (Texas, Grambling, Ohio) are shown — others are left blank rather than invented. No CFP games are included: OSU's Jan-2026 playoff participation can't be confirmed from sales data and was not fabricated.

---

## Executive Summary

- **Game days analyzed:** 12 (7 home, 5 away).
- **Headline — game days barely move these suburban restaurants.** The raw averages look negative (home **-3.8%**, away **-6.7%** vs baseline), but that's the work of just **three confounded Saturdays**: the Grambling noon blowout, the Texas primetime opener, and the Thanksgiving/at-Michigan finale. Strip those out and both home (**+1.2%** ex-Grambling) and away (**+0.6%** ex-Thanksgiving) game Saturdays sit **right at their 8-week baseline** — the remaining 9 games average **+2.7%**.
- **Home games are a coin flip, not a reliable drop:** **3 of 7** home games ran above baseline (Penn State +14.2%, Minnesota +6.2%, UCLA +6.1%), with Ohio (-2.0%) and Rutgers (-2.5%) essentially flat. The negative home aggregate is dominated by two *early*-season games (Grambling -31.4%, Texas -14.9%).
- **Best game day:** 2025-11-01 vs Penn State (HOME) — total revenue +14.2% vs baseline. (A home game — so home Saturdays clearly *can* lift.)
- **Worst game day:** 2025-11-29 vs at Michigan (AWAY) — total revenue -34.7% vs baseline. Thanksgiving weekend **and** The Game at Michigan — a holiday + rivalry double whammy, not a normal away game.
- **What actually moves the needle:** kickoff time (a **noon** low-draw home game = all-day tailgate = deep trough), the **season opener** hype, and the **Thanksgiving** holiday — *not* home-vs-away by itself.

## Home vs Away Comparison

| Metric | Home Games Avg | Away Games Avg | Difference |
|--------|---------------:|---------------:|-----------:|
| Revenue lift vs baseline | -3.8% | -6.7% | 2.9 pts |
| Guest-count lift vs baseline | -3.1% | -6.1% | 3.0 pts |
| Avg check (game day) | $80.93 | $78.34 | $2.59 |
| Best location (least hurt / most helped) | Gahanna | Westerville | — |

> Both raw averages are pulled negative by outliers. **Home ex-Grambling: +1.2%. Away ex-Thanksgiving: +0.6%.** On that adjusted basis home and away are effectively identical and both at baseline — the home/away distinction is *not* what drives game-day revenue here.

## Per-Game Breakdown

| Date | Opponent | H/A | Result | Grandview | Gahanna | Westerville | Total | vs Baseline |
|------|----------|-----|--------|----------:|--------:|------------:|------:|:-----------:|
| 2025-08-30 | Texas | HOME | L 7-14 | $21,431 | $15,456 | $10,366 | $47,254 | -14.9% |
| 2025-09-06 | Grambling St. | HOME | W 70-0 | $12,436 | $15,707 | $10,390 | $38,534 | -31.4% |
| 2025-09-13 | Ohio | HOME | W 37-9 | $24,823 | $19,095 | $9,222 | $53,140 | -2.0% |
| 2025-09-27 | at Washington | AWAY | — | $20,214 | $16,428 | $12,646 | $49,287 | -9.1% |
| 2025-10-04 | Minnesota | HOME | — | $26,884 | $17,682 | $11,693 | $56,259 | +6.2% |
| 2025-10-11 | at Illinois | AWAY | — | $21,351 | $18,550 | $11,261 | $51,161 | -3.7% |
| 2025-10-18 | at Wisconsin | AWAY | — | $22,400 | $16,404 | $13,696 | $52,500 | +1.7% |
| 2025-11-01 | Penn State | HOME | — | $25,272 | $19,912 | $13,315 | $58,499 | +14.2% |
| 2025-11-08 | at Purdue | AWAY | — | $27,426 | $19,325 | $14,166 | $60,917 | +13.4% |
| 2025-11-15 | UCLA | HOME | — | $26,933 | $18,148 | $12,942 | $58,022 | +6.1% |
| 2025-11-22 | Rutgers | HOME | — | $22,671 | $16,721 | $13,909 | $53,301 | -2.5% |
| 2025-11-29 | at Michigan | AWAY | — | $14,543 | $12,563 | $8,919 | $36,024 | -34.7% |

## Per-Location Analysis

### Grandview
- **Avg lift on home games:** -3.2% (per-game mean -2.5%)
- **Avg lift on away games:** -9.7% (per-game mean -9.4%)
- **Best single game:** 2025-11-08 vs at Purdue — +16.9%
- **Worst single game:** 2025-09-06 vs Grambling St. — -50.3%

### Gahanna
- **Avg lift on home games:** -0.5% (per-game mean -0.4%)
- **Avg lift on away games:** -6.3% (per-game mean -6.3%)
- **Best single game:** 2025-11-01 vs Penn State — +14.7%
- **Worst single game:** 2025-11-29 vs at Michigan — -29.9%

### Westerville
- **Avg lift on home games:** -9.6% (per-game mean -9.1%)
- **Avg lift on away games:** -1.5% (per-game mean -1.0%)
- **Best single game:** 2025-10-18 vs at Wisconsin — +17.9%
- **Worst single game:** 2025-11-29 vs at Michigan — -31.4%

## Anomalies & Standout Findings

Home-game total-revenue lift: mean **-3.5%**, standard deviation **14.2 pts**. Games beyond ±1 SD:

- **2025-09-06 vs Grambling St.** — -31.4% (-2.0 SD below the home-game mean). The Grambling blowout was a **noon** kickoff — an all-day tailgate that gutted Grandview (-50.3%).
- **2025-11-01 vs Penn State** — +14.2% (1.2 SD above the home-game mean).

- **Wins vs losses:** only three results are known from the prompt (Texas L, Grambling W, Ohio W). Both the loss *and* the 70-0 win landed below baseline, so within the confirmable set the **score is not predictive** — kickoff time and the calendar explain far more. A caveat, not a conclusion, given N=3 known outcomes.
- **Kickoff time:** the deepest home trough was the **noon** Grambling kickoff (all-day tailgate, no dinner rebound). Afternoon/evening home games (Ohio 09-13, Minnesota 10-04, UCLA 11-15) recovered to at-or-above baseline as the crowd filtered back for dinner. Penn State (also listed noon) held up (+14%) because it fell in the confound-free late-season stretch — a reminder these labels are coarse and N is small.
- **Marquee vs cupcake:** the marquee matchups didn't drive *lifts* — they drove the **biggest drops**. The Texas opener (-14.9%) and the at-Michigan finale (-34.7%) were the two softest Saturdays; big games pull people to the stadium / away-watch parties, not to the suburbs. "Cupcake" Grambling was the exception only because its noon kickoff meant an all-day tailgate.

## Correlation Matrix (per-game revenue-lift %, 12 games)

| Location pair | Pearson r |
|---------------|:---------:|
| Grandview ↔ Gahanna | 79% (0.79) |
| Grandview ↔ Westerville | 59% (0.59) |
| Gahanna ↔ Westerville | 47% (0.47) |

High positive r = the locations move together on game days (a game that hurts one hurts all).

## Key Takeaways & Recommendations

1. **Don't reflexively re-staff for "a game."** After removing three confounded dates, game-day Saturdays run at baseline (+2.7% across the other 9). The mere existence of an OSU game is **not** a staffing signal — treat a normal game Saturday like any other Saturday.
2. **Do plan for three specific patterns that genuinely swing revenue:**
   - **Noon kickoff vs a low-draw opponent** (e.g., Grambling 09-06, -31%): an all-day tailgate that gutted Grandview to -50.3%. Cut labor hard for these; the dinner rebound is weak.
   - **Thanksgiving / The-Game weekend (11-29, -34.7%)**: the worst Saturday of the season. Minimum viable staffing; consider a rivalry watch-party promo to claw back traffic.
   - **The primetime season opener (Texas, -14.9%)**: opener hype pulls people downtown/to watch parties. Trim the early-season opener.
3. **Late-season home games actually *lift* (Penn State +14%, UCLA +6%).** Where the opponent draws a crowd but the kickoff is afternoon/evening, some of that crowd converts to dinner traffic — protect the dinner shift on those dates rather than cutting.
4. **One chain-wide playbook works, but tune by location.** Grandview and Gahanna move together on game days (r=0.79); Westerville is the least correlated and structurally the most home-game-sensitive (home -9.6%), so it can cut the deepest on the noon/opener/holiday dates.
5. **Game outcome is not a usable signal from this data.** Only three results are known, and the 70-0 blowout win and the Texas loss both sat below baseline — kickoff time, opponent draw, and the calendar explain far more than the scoreboard.

---
*Read-only analysis. Baselines and game-day figures pulled from Supabase `daily_sales`; no data modified.*
