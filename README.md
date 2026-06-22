# LabBudgeteer

A private, browser-local tool for planning lab personnel effort and grant spending month by
month. All computation happens in your browser; no budget data is uploaded to a server.

## What it does

A single dashboard shows, top to bottom:

- **Budget snapshot** — projected remaining balance per grant.
- **Grant balance trend** — month-by-month burn-down (salary + fringe + one-off expenses).
- **Effort allocation** — each person's monthly percent effort, stacked by grant, flagged when
  the monthly total is under, over, or exactly 100%.

## Your data is a read-only YAML event file

The source of truth is a human- and AI-readable YAML file on your own disk. The app loads
`public/budget_events.yaml` on startup and treats the browser UI as a read-only simulator.
Edit the YAML in an editor, then refresh the page or use the in-page reload controls.

The app reads `public/budget_events.yaml`. That path is gitignored, so your real data is never
committed: point it at your own file by copying or symlinking your canonical event file there,
e.g. `ln -s /path/to/your/budget_events.yaml public/budget_events.yaml`.

You can also click **Open YAML** in the page header to load a different local `.yaml`/`.yml`
file for the current browser session. In browsers that support the File System Access API,
the app keeps the selected file handle and can auto-reload when the file changes. In browsers
that only expose a basic file input, the selected file can be loaded manually but cannot be
watched continuously by the page.

Events must be listed in chronological order — they are compiled in file order, so a later
`cover_person` can re-add effort that an earlier `terminate_personnel` removed.

Data shape:

```yaml
schemaVersion: 8
settings:
  startMonth: 2024-09
  endMonth: 2031-05

events:
  - month: 2025-07
    type: salary_rate
    personId: wz
    name: Wanding Zhou
    annualSalary: 160000

  - month: 2025-08
    type: start_grant
    grantId: r35
    name: R35 / GRT-00002468
    accountType: regular
    nextReportMonth: 2026-08
    info: Annual RPPR due before renewal.
    endMonth: 2027-08
    budget: 26788
    budgetStartMonth: 2025-08

  - month: 2025-08
    type: grant_update
    grantId: r35
    nextReportMonth: 2027-08
    info: Updated report date after annual renewal.

  - month: 2025-08
    type: cover_person
    grantId: r35
    personId: hf
    name: Hongxiang Fu
    effort: 80
    startMonth: 2025-08
    endMonth: 2025-11

  - month: 2024-09
    type: cover_person
    grantId: r35
    personId: wz
    name: Wanding Zhou
    effort: 51
    capAtTotal: 100
    startMonth: 2024-09
    endMonth: 2027-08

  - month: 2026-04
    type: one_off_expenditure
    grantId: r35
    amount: 3330
    description: CCR APC

  - month: 2026-06
    type: reset_balance
    grantId: professional-fund
    amount: 4000
    description: Annual reset to 4000
```

`accountType` groups snapshot cards and can be `flexible`, `regular`, or `supplemental`.
`nextReportMonth` is shown on the compact snapshot card. `info` is optional free text shown in
the snapshot tooltip. Use `grant_update` to revise report metadata after annual renewal.
`budgetStartMonth` means the month whose ending balance is entered. For example, if a grant
period starts on August 1 and the balance is known as of July 31, use July as the
`budgetStartMonth`; charges start in the following month. Negative one-off expenditures are
award supplements or installments. `reset_balance` re-establishes the month-end balance for a
grant cycle without treating it as spend. `capAtTotal` on `cover_person` caps that grant's
monthly effort after all other grant coverage for the person has been applied.

## Privacy

- No network calls carry your data; everything runs client-side.
- The YAML file lives only where you put it. `public/budget_events.yaml` is gitignored, so it is
  never committed or published.
- When you open a local YAML file from the page, the browser grants access only to that selected
  file for the current session.

## Develop

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build to dist/
```

## Deploy

Pushing to `main` triggers `.github/workflows/deploy.yml`, which builds and publishes to
GitHub Pages. Enable Pages once in repo **Settings -> Pages -> Source: GitHub Actions**.
The app expects to be served under `/LabBudgeteer/` (see `base` in `vite.config.ts`); adjust
if your repo name differs.

Because `public/budget_events.yaml` is gitignored, the deployed site loads no data by default
(it shows the empty state). To publish a working demo, commit a non-sensitive sample file at
that path; to keep budgets private, leave it out and run the app locally only.

## Stack

React + TypeScript + Vite + Tailwind, state via Zustand, Zod for validation, YAML for event
parsing, and Recharts for budget plots.
