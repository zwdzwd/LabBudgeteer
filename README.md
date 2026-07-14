# LabBudgeteer

A private, browser-local tool for planning lab personnel effort and grant spending month by
month. All computation happens in your browser; no budget data is uploaded to a server.

**Live app:** https://zwdzwd.github.io/LabBudgeteer/

## What it does

A single dashboard shows, top to bottom:

- **Budget snapshot** — projected remaining balance per grant.
- **Grant balance trend** — month-by-month burn-down (salary + fringe + one-off expenses).
- **Effort allocation** — each person's monthly percent effort, stacked by grant, flagged when
  the monthly total is under, over, or exactly 100%.

## Your data is a read-only event file

The source of truth is a human- and AI-readable text file on your own disk. On startup the app
first tries `public/budget_events.local.txt` and, when that is absent, falls back to
`public/budget_events.txt`; the browser UI is a read-only simulator. Edit the file in an
editor, then refresh the page or use the in-page reload controls.

`public/budget_events.local.txt` is gitignored, so your real data is never committed: point it
at your own file by copying or symlinking your canonical event file there, e.g.
`ln -s /path/to/your/budget_events.txt public/budget_events.local.txt`. The committed
`public/budget_events.txt` holds only the non-sensitive demo sample that the public site loads.

You can also click **Open** in the page header to load a different local file for the
current browser session. In browsers that support the File System Access API, the app keeps the
selected file handle and can auto-reload when the file changes. In browsers that only expose a
basic file input, the selected file can be loaded manually but cannot be watched continuously
by the page.

Events must be listed in chronological order — they are compiled in file order, so a later
`personnel_cover` can re-add effort that an earlier `personnel_terminate` removed.

### Event Types

- **`grant_start`** — Create a grant with optional budget and report schedule.
- **`grant_renew`** — Update grant metadata, set/adjust balance, and/or update report month. Use `amount: "1000"` (no sign) to reset balance to 1000, `amount: "+1000"` to add 1000, or `amount: "-1000"` to subtract 1000.
- **`grant_end`** — Mark grant as ended; terminates allocations after this month.
- **`personnel_cover`** — Allocate a person's monthly effort (0–100%) to a grant over a date range. Use `capAtTotal: 100` to cap total effort across all grants.
- **`personnel_salary_rate`** — Set a person's annual salary effective from this month.
- **`personnel_terminate`** — End a person's employment; removes effort allocations after this month.
- **`grant_cost`** — Record a non-salary cost or supplement (negative amount). Applied each month listed.

Data shape — a pipe-delimited text file. The first lines carry `schemaVersion` and `settings`,
then a `month | type | details` header, then one event per line. The `details` column is a
space-separated list of `key:value` pairs; quote any value containing spaces. `grantId` and
`personId` are just optional keys in `details` (events that don't need them omit them). Events
must be listed in chronological order.

```text
schemaVersion: 9
settings: startMonth=2024-09 endMonth=2031-05

month | type | details
2024-10 | personnel_salary_rate | personId:person-a name:"Person A" annualSalary:160000
2024-09 | grant_start | grantId:grant-1 name:"Example Grant" accountType:"regular" nextReportMonth:"2025-09" info:"Annual report due before renewal." endMonth:"2026-09" budget:50000 budgetStartMonth:"2024-09"
2024-09 | personnel_cover | grantId:grant-1 personId:person-a name:"Person A" effort:50 startMonth:"2024-09" endMonth:"2026-09"
2025-03 | grant_cost | grantId:grant-1 amount:5000 description:"Equipment purchase"
2025-09 | grant_renew | grantId:grant-1 nextReportMonth:"2026-09" info:"Report date updated after renewal."
2026-04 | grant_renew | grantId:grant-1 amount:"-50000" description:"Annual award installment"
```

### Field Notes

- `accountType` can be `flexible`, `regular`, or `supplemental`; groups snapshot cards.
- `nextReportMonth` appears on snapshot cards. `info` is optional free text in tooltips.
- `budgetStartMonth` is the month whose ending balance is known (e.g., if a grant runs Aug 1 – Jul 31 and the ending balance on Jul 31 is known, use July as `budgetStartMonth`). Salary charges begin the following month.
- `grant_renew` can update any grant field (`sponsor`, `accountType`, `info`, etc.) and/or adjust balance: amount with no sign resets the balance, `+` adds, `-` subtracts.
- `grant_cost` with negative `amount` is a supplement or award installment.
- `capAtTotal` on `personnel_cover` caps that person's effort on that grant after all other grants are allocated (enforces a total cap).

## Privacy

- No network calls carry your data; everything runs client-side.
- The event file lives only where you put it. `public/budget_events.local.txt` is gitignored,
  so it is never committed or published. Note that a local `npm run build` copies `public/`
  (following symlinks) into `dist/`, so keep local build output private; the deployed site is
  built on CI, where the gitignored file does not exist.
- When you open a local file from the page, the browser grants access only to that selected
  file for the current session.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build to dist/
```

## Serverless snapshot

`npm run build:single` produces `dist-single/index.html`, a single self-contained file with the
app and the current event data (from `budget_events.local.txt` when present, else the demo)
baked in. Open it directly from disk — no server needed. It is a snapshot: regenerate after
editing the event file. `dist-single/` is gitignored because the file embeds your real data;
treat it as confidential and do not share or publish it.

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and publishes to
GitHub Pages. Enable Pages once in repo **Settings -> Pages -> Source: GitHub Actions**.
The app expects to be served under `/LabBudgeteer/` (see `base` in `vite.config.ts`); adjust
if your repo name differs.

Because `public/budget_events.local.txt` is gitignored, the deployed site never sees your real
data; it loads the committed demo sample at `public/budget_events.txt`. To publish no demo at
all, delete that sample and the site shows the empty state.

## Stack

React + TypeScript + Vite + Tailwind, state via Zustand, Zod for validation, a pipe-delimited
text event format (YAML also supported), and Recharts for budget plots.
