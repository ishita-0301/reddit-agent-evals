# Reddit Agent Evals — filename1

End-to-end evals system for a synthetic Reddit posting agent:

1. **`filename1.mjs`** — generates 50 synthetic sessions to `sessions.jsonl`.
2. **`filename1_eval.mjs`** — runs Claude (sonnet-4) as an LLM judge over each session, writes `eval_results.jsonl`.
3. **`filename1.html`** — dark-themed dashboard: summary stats, SVG bar + radar charts, filters, per-session step trace, manual override + CSV export.

## Prerequisites

- Node.js ≥ 18
- An Anthropic API key

## Setup

```bash
npm init -y
npm install @anthropic-ai/sdk
export ANTHROPIC_API_KEY=sk-ant-...
```

## Run in order

### 1. Generate the synthetic dataset

```bash
node filename1.mjs
```

Produces `sessions.jsonl` (50 lines). Output is deterministic (seeded RNG), with a mix of: `quality_success`, `success_with_retry`, `rule_violation`, `off_topic`, `spam_like`, `error_cascade`.

### 2. Run the LLM-judge eval pipeline

```bash
node filename1_eval.mjs
```

For each session, calls `claude-sonnet-4-20250514` to score it on 5 dimensions (1–5):

- `rule_compliance`
- `task_completion`
- `content_quality`
- `error_handling`
- `efficiency`

Writes `eval_results.jsonl`. Each line:

```json
{
  "session_id": "...",
  "scores": { "rule_compliance": 4, ... },
  "overall": 4.20,
  "reasoning": "...",
  "verdict": "pass"
}
```

Prints summary stats: pass rate, avg overall, avg per dimension.

### 3. View the dashboard

The dashboard loads `sessions.jsonl` and `eval_results.jsonl` via `fetch`, so it must be served over HTTP (not opened with `file://`):

```bash
npx http-server . -p 8080
# then open http://localhost:8080/filename1.html
```

Or any equivalent (`python3 -m http.server`, `caddy file-server`, etc).

## Dashboard features

- **Summary panel** — total sessions, pass rate, failures, manual overrides.
- **Bar chart** — avg score per dimension across all sessions (SVG, color-coded).
- **Session list** — filter by verdict / subreddit / outcome.
- **Detail view** — radar chart of the 5 scores, judge reasoning, full step-by-step trace with color-coded status per step.
- **Manual override** — Mark pass / fail / clear, plus a notes textarea. Saved to `localStorage` under `filename1_overrides`. Overrides are visually distinct (yellow `OVR` badge) and the override count surfaces in the summary panel.
- **Export CSV** — downloads all sessions + judge results + overrides + notes as `eval_export.csv`.

## File map

| File | Purpose |
| --- | --- |
| `filename1.mjs` | Synthetic session generator |
| `filename1_eval.mjs` | Claude LLM-judge runner |
| `filename1.html` | Dashboard |
| `sessions.jsonl` | Generated dataset (output of step 1) |
| `eval_results.jsonl` | Judge results (output of step 2) |
| `eval_export.csv` | Export from dashboard |
