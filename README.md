# Gematria Sports Betting Calculator

A gematria cipher analysis tool for NBA, NHL, and MLB games. It scans daily
schedules, runs numerology calculations on team names and game dates, sends the
results to Claude AI for evaluation, and places virtual paper bets. You can
track profit and loss over time without risking real money.

---

## Table of Contents

1. [What This Is](#1-what-this-is)
2. [Prerequisites](#2-prerequisites)
3. [Quick Start](#3-quick-start)
4. [Supabase Setup (Detailed)](#4-supabase-setup-detailed)
5. [Anthropic API Key](#5-anthropic-api-key)
6. [Environment Variables Reference](#6-environment-variables-reference)
7. [External APIs Used](#7-external-apis-used)
8. [How It Works](#8-how-it-works)
9. [Daily Workflow](#9-daily-workflow)
10. [Customizing Your Gematria](#10-customizing-your-gematria)
11. [Vercel Deployment](#11-vercel-deployment)
12. [Troubleshooting](#12-troubleshooting)
13. [Project Structure](#13-project-structure)

---

## 1. What This Is

Gematria is a form of numerology that assigns numerical values to letters. In
English gematria, each letter of the alphabet maps to a number (A=1, B=2, ...
Z=26 in the simplest cipher). By summing the letter values of a word or phrase,
you get a single number that represents it.

This application applies that idea to sports betting. It takes the names of NBA,
NHL, and MLB teams -- city names, nicknames, full franchise names, even player
names and arena names -- and converts them all into cipher values using four
different cipher systems. It does the same with the game date, producing
numerical values through five different date calculation methods.

When a cipher value for a team name matches a date value, that is called an
"alignment." The more alignments a team has, the stronger the signal. Three or
more alignments on one side is a "Triple Lock" -- the strongest signal the
system produces.

Once the cipher math is done, the app packages all the alignment data along with
real betting odds from Polymarket and sends it to Claude (Anthropic's AI). Claude
reviews the gematria profile, the odds, and the lock classification, then decides
whether to place a virtual bet and at what size.

All bets are paper trades -- fake money, no real risk. You start with a virtual
$10,000 bankroll and track wins, losses, and profit over time. The goal is to see
whether gematria-based signals have any predictive value, or to just have fun
exploring the numerology of sports.

---

## 2. Prerequisites

Before you start, make sure you have the following:

**Node.js 20 or newer**
Download the LTS version from [https://nodejs.org](https://nodejs.org). After
installing, open a terminal and run `node --version` to confirm it says v20 or
higher.

**A Supabase account (free tier works)**
Go to [https://supabase.com](https://supabase.com) and sign up. Supabase
provides a free PostgreSQL database that the app uses to store games, bets, and
settings. You do not need to pay anything.

**An Anthropic API key (paid, roughly $5-20/month)**
Go to [https://console.anthropic.com](https://console.anthropic.com) and create
an account. You will need to add a payment method. Each game analysis costs
about $0.02-0.15 depending on which Claude model you choose. A typical day with
10-15 games costs $0.50-2.00.

**A Vercel account (free)**
Go to [https://vercel.com](https://vercel.com) and sign up. This is only needed
if you want to deploy the app to the internet. For local use, you can skip this.

**Git installed**
Download from [https://git-scm.com](https://git-scm.com) if you do not already
have it. Run `git --version` in your terminal to check.

---

## 3. Quick Start

Open your terminal (Command Prompt, PowerShell, or Terminal on Mac) and run
these commands one at a time:

**Step 1: Clone the repository**

```
git clone https://github.com/YOUR_USERNAME/gematria.git
cd gematria
```

Replace `YOUR_USERNAME` with the actual GitHub username or URL where the repo
lives. If you received the code as a zip file, unzip it and `cd` into the
folder instead.

**Step 2: Install dependencies**

```
npm install
```

This downloads all the libraries the app needs. It may take a minute or two.

**Step 3: Set up Supabase**

Follow the detailed steps in [Section 4](#4-supabase-setup-detailed) below.
You will create a database and run a migration script.

**Step 4: Create your environment file**

Copy the example file:

```
cp .env.example .env.local
```

On Windows, use:

```
copy .env.example .env.local
```

Open `.env.local` in any text editor and fill in your values. See
[Section 6](#6-environment-variables-reference) for what each variable means
and where to find it.

**Step 5: Start the development server**

```
npm run dev
```

Wait until you see a message like "Ready on http://localhost:3000". The port
may differ if 3000 is in use.

**Step 6: Open the app**

Go to [http://localhost:3000](http://localhost:3000) in your browser. You will
see a login screen. Enter the password you set as `APP_PASSWORD` in your
`.env.local` file.

After logging in, you will see the dashboard. From here you can fetch games,
run analysis, and track your paper bets.

---

## 4. Supabase Setup (Detailed)

This section walks through creating your database from scratch.

**Step 1:** Go to [https://supabase.com](https://supabase.com) and click
"Start your project." Sign up with GitHub or email.

**Step 2:** Once logged in, click "New Project" in your dashboard.

**Step 3:** Fill in the project details:
- **Name**: anything you like, for example "gematria"
- **Database Password**: pick something strong, you will not need this password
  in the app but Supabase requires it
- **Region**: pick the closest to you for best performance
- **Plan**: Free tier is fine

Click "Create new project" and wait 1-2 minutes for it to finish provisioning.

**Step 4:** In the left sidebar, click "SQL Editor."

**Step 5:** Click "New Query" (the plus icon or button) to open a blank editor.

**Step 6:** On your computer, open the file `supabase/migrations/001_init.sql`
from this repo. Select all the SQL text and copy it to your clipboard.

**Step 7:** Paste the SQL into the Supabase SQL Editor. Click "Run" (or press
Ctrl+Enter / Cmd+Enter).

**Step 8:** You should see a success message. To verify, click "Table Editor"
in the left sidebar. You should see four tables:
- `games` -- stores game schedules and scores
- `paper_trades` -- stores your virtual bets
- `bankroll_ledger` -- tracks daily balance and P&L
- `gematria_settings` -- stores your AI prompt and bet configuration

**Step 9:** Now you need three values for your environment file. In the left
sidebar, click "Project Settings" (the gear icon), then click "API" under the
Configuration section.

**Step 10:** Copy these three values:
- **Project URL** -- this is your `NEXT_PUBLIC_SUPABASE_URL`. It looks like
  `https://abcdefghij.supabase.co`.
- **anon public** key -- this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`. It is a
  long string starting with `eyJ...`.
- **service_role** key -- this is your `SUPABASE_SERVICE_KEY`. It is also a
  long string starting with `eyJ...`. **Keep this one secret.** It has full
  write access to your database. Never commit it to Git or share it publicly.

You are done with Supabase setup.

---

## 5. Anthropic API Key

The app uses Claude, an AI model by Anthropic, to analyze gematria data and
make betting decisions.

**Step 1:** Go to [https://console.anthropic.com](https://console.anthropic.com)
and sign up or log in.

**Step 2:** In the left sidebar or top menu, click "API Keys."

**Step 3:** Click "Create Key." Give it a name like "gematria" so you can
identify it later.

**Step 4:** Copy the key. It starts with `sk-ant-...`. This is your
`ANTHROPIC_API_KEY`. You will only see it once, so paste it into your
`.env.local` file right away.

**Step 5:** Go to "Billing" in the Anthropic console and add a payment method
(credit card). Without billing set up, API calls will fail.

**Step 6: Cost expectations**

Each game analysis sends one request to Claude. The cost depends on the model:
- **Claude Sonnet** (default): about $0.02-0.05 per game. Cheapest option, good
  enough for most use.
- **Claude Opus**: about $0.10-0.15 per game. Most capable model, best analysis
  quality.
- **Claude Haiku**: about $0.01-0.02 per game. Fastest and cheapest, but least
  nuanced.

A typical day with 10-15 games across NBA/NHL/MLB will cost $0.50-2.00 with
Sonnet. Monthly cost is usually $5-20 depending on how many days you run
analysis.

---

## 6. Environment Variables Reference

Your `.env.local` file needs these five variables. Here is what each one does:

| Variable | Required | Description | Where to Get It |
|----------|----------|-------------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Your Supabase project URL | Supabase Dashboard > Project Settings > API > Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public anonymous key for client-side database reads | Supabase Dashboard > Project Settings > API > anon public |
| `SUPABASE_SERVICE_KEY` | Yes | Service role key with full database write access | Supabase Dashboard > Project Settings > API > service_role (keep secret) |
| `ANTHROPIC_API_KEY` | Yes | API key for Claude AI analysis | console.anthropic.com > API Keys > Create Key |
| `APP_PASSWORD` | Yes | Password you type to log into the app | You choose this yourself. Pick anything. |

Example `.env.local` file:

```
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghij.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
ANTHROPIC_API_KEY=sk-ant-api03-...
APP_PASSWORD=my-secret-password
```

Do not put quotes around the values. Do not add spaces around the `=` sign.

---

## 7. External APIs Used

The app fetches data from several free public APIs. You do not need API keys
for any of these -- only Anthropic requires a key.

### ESPN (NBA and MLB)

Free, no key needed. Used to fetch game schedules, scores, team records, and
venue information.

- NBA scoreboard:
  `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=YYYYMMDD`
- MLB scoreboard:
  `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=YYYYMMDD`

The date format is `YYYYMMDD` with no dashes (for example, `20260408` for
April 8, 2026).

### NHL API

Free, no key needed. Used to fetch NHL game schedules, scores, and team
standings.

- Schedule:
  `https://api-web.nhle.com/v1/schedule/YYYY-MM-DD`
- Standings:
  `https://api-web.nhle.com/v1/standings/now`

The date format here uses dashes (for example, `2026-04-08`).

### Polymarket Gamma

Free, no key needed. Used to fetch real prediction market odds. Polymarket is a
crypto-based prediction market where people trade on event outcomes. The odds
reflect real money being wagered.

- Events endpoint:
  `https://gamma-api.polymarket.com/events?active=true&closed=false&limit=200&tag=TAG`
- Tags by sport: `basketball` (NBA), `hockey` (NHL), `baseball` (MLB)

The app matches Polymarket events to games by team names in the event slugs and
titles. Odds are converted from implied probability to American moneyline format.

### Anthropic Claude

Paid, API key required. The AI model that reviews gematria data and makes
betting decisions. See [Section 5](#5-anthropic-api-key) for setup.

---

## 8. How It Works

The system operates in a five-step pipeline. Here is what happens at each stage.

### Step 1: Cipher Math

Every team name is run through four English gematria ciphers:

- **Ordinal**: A=1, B=2, C=3, ... Z=26. Sum all letters.
- **Reduction**: A=1, B=2, ... I=9, J=1, K=2, ... (cycles 1-9). Sum all letters.
- **Reverse Ordinal**: A=26, B=25, C=24, ... Z=1. Sum all letters.
- **Reverse Reduction**: A=8, B=7, ... (reverse of Reduction cycle). Sum all letters.

For example, "Lakers" in Ordinal = L(12) + A(1) + K(11) + E(5) + R(18) + S(19) = 66.

The app calculates cipher values for every team's city name, nickname, full name,
abbreviation, star players, coaches, goalie (for hockey), and the arena name.

The game date is also converted into numbers using five methods:

- **Full Date**: month + day + first two digits of year + last two digits
  (e.g., 4 + 8 + 20 + 26 = 58 for April 8, 2026)
- **Reduced Year**: month + day + digit sum of year
  (e.g., 4 + 8 + 10 = 22)
- **Single Digits**: digit sum of month + digit sum of day + digit sum of year
  (e.g., 4 + 8 + 10 = 22)
- **Short Year**: month + day + last two digits of year
  (e.g., 4 + 8 + 26 = 38)
- **Month + Day**: month + day
  (e.g., 4 + 8 = 12)

### Step 2: Alignment Detection

When a cipher value for a team element matches any date value, that is an
alignment. For example, if "Boston" has an Ordinal value of 68 and the Full
Date numerology is also 68, that is one alignment.

The app checks every combination of team elements, ciphers, and date methods.
It also looks for cross-team "cipher mirror" matches (where one team's cipher
value equals another team's cipher value), win-target alignments, loss-count
matches, jersey number alignments, and venue matches.

Each alignment type has a different weight. City and full-name matches are
weighted heavily. Venue matches are weighted lightly. The weighted scores for
each side are compared, and a conflict penalty is applied when both sides have
alignments.

### Step 3: Lock Classification

Based on alignment count (excluding market-date alignments which are neutral):

- **Triple Lock**: 3 or more alignments on the favored side. Strongest signal.
- **Double Lock**: 2 alignments. Moderate signal.
- **Single Lock**: 1 alignment. Weak signal.
- **Skip**: 0 alignments, or the weighted gap between the two sides is too small
  (under 15 points), meaning it is a toss-up.

### Step 4: Claude Analysis

The cipher data, alignment list, lock classification, date numerology, odds from
Polymarket, team records, and moon phase data are all formatted into a structured
prompt and sent to Claude.

Claude's system prompt (which you can customize in Settings) tells it to evaluate
the gematria profile and respond with a JSON array of betting decisions. Each
decision includes the bet type (moneyline or over/under), the pick, units to
wager, confidence percentage, and reasoning.

### Step 5: Paper Trading

Bets are placed with virtual money. The starting bankroll is $10,000.

- **Unit size**: $100 per unit (configurable)
- **Max per bet**: 5 units ($500)
- **Max per day**: 20 units ($2,000)
- **Win payout**: calculated from American odds (e.g., +150 pays $150 on a $100 bet, -130 pays $76.92)

After games end, the settlement step checks final scores and grades each bet
as win, loss, push, or void. The profit or loss is recorded and the bankroll
balance is updated.

---

## 9. Daily Workflow

Here is how to use the app on a typical day.

**Step 1: Open the dashboard**

Go to the app in your browser. The home page shows today's date, the date
numerology values (Full, Reduced Year, Single Digits, Short Year, Month+Day),
and moon illumination percentage.

**Step 2: Fetch games**

Click the "Fetch Games" button. The app will call the ESPN and NHL APIs to get
today's schedule for NBA, NHL, and MLB. It will also fetch Polymarket odds and
match them to each game. After a few seconds, you will see game cards appear
with team names, records, and odds.

**Step 3: Run analysis**

Click the "Analyze & Bet" button. This step takes longer (30 seconds to a few
minutes depending on how many games there are). For each unanalyzed game, the
app:
1. Runs the cipher math on both teams
2. Detects alignments and classifies the lock type
3. Sends everything to Claude for evaluation
4. If Claude decides to bet, places a virtual paper trade

You will see a progress indicator showing which game is being analyzed.

**Step 4: Check your bets**

Go to the `/live` page (click "Live" in the navigation). This shows all your
pending bets for today with the teams, bet type, units wagered, odds, and
Claude's reasoning.

**Step 5: Settle bets**

After games finish (usually late evening Eastern Time), go back to the
dashboard and click "Settle Bets." The app will check final scores for every
game with a pending bet and grade each one as win, loss, push, or void. Your
bankroll balance will be updated.

**Step 6: Review results**

- `/history` -- full bet history with win/loss results
- `/stats` -- bankroll equity curve, win rate, and aggregate statistics
- `/cipher-lab` -- manually enter any text to see its cipher values

---

## 10. Customizing Your Gematria

Go to the `/settings` page to configure how the AI makes decisions.

**System Prompt**

This is the main instruction that Claude receives before analyzing each game.
The default prompt tells Claude to act as a gematria numerology specialist and
explains the alignment system. You can edit this to emphasize different factors,
add custom rules, or change the personality entirely.

**Bet Rules**

This section defines the betting criteria by lock type. The defaults are:
- Triple Lock: bet 3-5 units at 70-95% confidence
- Double Lock: bet 1-3 units at 55-75% confidence
- Single Lock: usually skip, or 1 unit at 50-60% confidence
- No Lock: skip

**Claude Model**

Choose which Claude model to use:
- **Claude Sonnet 4** (default) -- good balance of cost and quality
- **Claude Opus 4** -- most capable, best analysis, highest cost
- **Claude Haiku 4** -- cheapest and fastest, less detailed analysis

**Sizing Controls**

- **Max units per bet**: cap on how much Claude can wager on a single game (default 5)
- **Max daily units**: cap on total wagering per day (default 20)
- **Unit size in dollars**: how much each unit is worth (default $100)
- **Min confidence**: Claude must be at least this confident to place a bet (default 60%)

**Auto-Bet Toggles**

- **Auto-bet Triple Locks**: when on, Triple Lock games are always bet even if
  Claude says skip (default: on)
- **Auto-bet Double Locks**: same for Double Locks (default: off)
- **Auto-bet Single Locks**: same for Single Locks (default: off)

---

## 11. Vercel Deployment

If you want the app running 24/7 on the internet instead of on your local
machine, deploy it to Vercel.

**Step 1:** Push your code to a GitHub repository. If you have not done this:

```
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/YOUR_USERNAME/gematria.git
git push -u origin main
```

**Step 2:** Go to [https://vercel.com](https://vercel.com) and log in with your
GitHub account.

**Step 3:** Click "Add New" > "Project."

**Step 4:** Find your `gematria` repo in the list and click "Import."

**Step 5:** On the configuration page, open "Environment Variables" and add all
five variables from your `.env.local` file:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_KEY`
- `ANTHROPIC_API_KEY`
- `APP_PASSWORD`

**Step 6:** Click "Deploy." Vercel will build and deploy the app. This takes
1-2 minutes.

**Step 7:** When it finishes, you will get a URL like
`https://gematria-abc123.vercel.app`. Open it in your browser and log in.

**Important: Vercel function timeout**

The analyze route can take several minutes to process all games. On Vercel's
free plan (Hobby), serverless functions time out after 10 seconds. The app's
`vercel.json` sets the analyze route to 300 seconds (5 minutes), but this
requires **Vercel Pro** ($20/month).

If you are on the free plan, analysis will time out on busy days with many
games. You have two options:
- Upgrade to Vercel Pro for the 300-second timeout
- Run analysis locally with `npm run dev` and use Vercel only for viewing
  results (the database is shared)

---

## 12. Troubleshooting

### "Analyze times out" or "Analysis failed"

If running on Vercel free tier, the 10-second limit kills the function before
Claude can finish. You need Vercel Pro ($20/month) for the 300-second
`maxDuration`. Alternatively, run analysis locally with `npm run dev` and
click "Analyze & Bet" from localhost.

### "Writes silently fail" or "No bets are saved"

This usually means the `SUPABASE_SERVICE_KEY` is wrong or missing. The anon
key only has read access. The service role key is required for writes (inserting
bets, updating games). Double-check your `.env.local` file.

### "No games found"

Not every day has games in every league. NBA and NHL play most days from October
through June, but there are occasional off-days. MLB plays almost every day from
April through October. If you see zero games, it may genuinely be an off-day.
Try again tomorrow.

### "Invalid password" on login

The password you type must exactly match the `APP_PASSWORD` in your `.env.local`
file. It is case-sensitive. Make sure there are no extra spaces or quotes around
the value in your env file.

### "Claude error" or "Anthropic API error"

Check that:
1. Your `ANTHROPIC_API_KEY` is correct (starts with `sk-ant-`)
2. You have added a payment method in the Anthropic console
3. Your account has not run out of credits

### "Module not found" or "Cannot find module"

Run `npm install` again. If that does not fix it, delete `node_modules` and
`package-lock.json`, then run `npm install` fresh:

```
rm -rf node_modules package-lock.json
npm install
```

On Windows:

```
rmdir /s /q node_modules
del package-lock.json
npm install
```

### Reset your bankroll

If you want to start over with a fresh $10,000 bankroll:

1. Go to your Supabase dashboard
2. Click "Table Editor" in the left sidebar
3. Click on the `bankroll_ledger` table
4. Select all rows and delete them
5. Go to "SQL Editor," click "New Query," and run:

```sql
INSERT INTO bankroll_ledger (date, balance, daily_pl)
VALUES (CURRENT_DATE, 10000, 0)
ON CONFLICT (date) DO NOTHING;
```

### Re-run analysis on games already analyzed

If you want Claude to re-analyze games that were already processed:

1. Go to Supabase Table Editor
2. Click on the `games` table
3. Find the games you want to re-analyze
4. Edit each row and set `analyzed` to `false`
5. Optionally, delete related rows from `paper_trades` if you want to remove
   the old bets
6. Go back to the app and click "Analyze & Bet"

### Port 3000 already in use

If another app is using port 3000, Next.js will automatically try 3001, 3002,
etc. Check the terminal output for the actual URL. You can also specify a port:

```
npx next dev --port 3007
```

---

## 13. Project Structure

```
gematria/
|
|-- .env.example              Example environment variables
|-- .gitignore                Files excluded from Git
|-- next.config.ts            Next.js configuration (image domains, turbopack)
|-- package.json              Dependencies and scripts
|-- postcss.config.mjs        PostCSS config for Tailwind v4
|-- tsconfig.json             TypeScript compiler settings
|-- vercel.json               Vercel function timeouts (analyze=300s)
|
|-- supabase/
|   |-- migrations/
|       |-- 001_init.sql      Complete database schema (run once in SQL Editor)
|
|-- src/
    |-- app/
    |   |-- layout.tsx         Root layout (fonts, Toaster, metadata)
    |   |-- globals.css        Tailwind imports and theme tokens
    |   |-- page.tsx           Dashboard: fetch games, analyze, settle, game cards
    |   |
    |   |-- login/
    |   |   |-- page.tsx       Login page (password input, session cookie)
    |   |
    |   |-- live/
    |   |   |-- page.tsx       Pending bets view with live game status
    |   |
    |   |-- history/
    |   |   |-- page.tsx       Full bet history with filters
    |   |
    |   |-- stats/
    |   |   |-- page.tsx       Bankroll equity curve and aggregate statistics
    |   |
    |   |-- settings/
    |   |   |-- page.tsx       AI prompt editor, model picker, bet sizing controls
    |   |
    |   |-- cipher-lab/
    |   |   |-- page.tsx       Manual gematria calculator for any text
    |   |
    |   |-- api/
    |       |-- auth/
    |       |   |-- login/
    |       |       |-- route.ts    POST: verify password, set session cookie
    |       |
    |       |-- fetch-games/
    |       |   |-- route.ts        POST: fetch ESPN/NHL/MLB schedules, match odds
    |       |                       GET:  return cached games for a date
    |       |
    |       |-- analyze/
    |       |   |-- route.ts        POST: run gematria + Claude on all unanalyzed games
    |       |                       Streams progress events to the browser
    |       |
    |       |-- settle/
    |       |   |-- route.ts        POST: check final scores, grade bets, update P&L
    |       |
    |       |-- calculate/
    |       |   |-- route.ts        POST: gematria cipher calculation for arbitrary text
    |       |
    |       |-- settings/
    |       |   |-- route.ts        GET/PUT: read and update gematria_settings
    |       |
    |       |-- trades/
    |           |-- live/
    |           |   |-- route.ts    GET: pending paper trades for today
    |           |
    |           |-- history/
    |           |   |-- route.ts    GET: settled trades with optional filters
    |           |
    |           |-- stats/
    |               |-- route.ts    GET: aggregate stats and ledger data
    |
    |-- lib/
    |   |-- gematria.ts           Cipher engine: 4 ciphers + date numerology math
    |   |-- analysis-engine.ts    Alignment detection, lock classification, scoring
    |   |-- claude-agent.ts       Claude API integration, prompt builder, JSON parser
    |   |-- paper-trading.ts      Bet validation, stake calculation, payout math
    |   |-- settlement.ts         Trade result determination from final scores
    |   |-- sports-api.ts         ESPN (NBA/MLB) and NHL API wrappers with retry
    |   |-- odds-api.ts           Polymarket Gamma odds fetching and matching
    |   |-- polymarket-sports-slug.ts  Polymarket slug parsing and team code resolution
    |   |-- moon-phase.ts         Lunar phase calculation (synodic month)
    |   |-- date-utils.ts         Eastern Time date utilities
    |   |-- auth.ts               HMAC session cookie creation and verification
    |   |-- supabase.ts           Browser-side Supabase client
    |   |-- supabase-server.ts    Server-side Supabase client (service role)
    |   |-- types.ts              TypeScript interfaces for all data models
    |   |
    |   |-- constants/
    |       |-- index.ts          Team lookup by name/abbreviation
    |       |-- teams-nba.ts      30 NBA teams: city, name, abbreviation, alternates
    |       |-- teams-nhl.ts      32 NHL teams: same, plus area codes
    |       |-- teams-mlb.ts      30 MLB teams: same structure
    |
    |-- components/
        |-- Nav.tsx               Navigation bar with page links
        |-- GameCard.tsx          Game display card with teams, odds, lock badge
        |-- LockBadge.tsx         Triple/Double/Single lock indicator
        |-- TradeCard.tsx         Bet card with pick, units, reasoning
        |-- StatCard.tsx          Small stat display box
        |-- EquityCurve.tsx       Recharts line chart of bankroll over time
        |-- ProgressBar.tsx       Analysis progress indicator
```

---

## License

This project is for educational and entertainment purposes only. It is not
financial advice. Paper trading involves no real money. Use at your own risk.
