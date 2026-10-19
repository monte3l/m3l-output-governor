# Evaluation results

P4: does built-in **Concise** cut output tokens, with the same model and effort, without losing checked answers? Run on 2026-10-19 with `claude-opus-5-5` at effort `medium`, 8 tasks, 3 reps, 24 paired `claude -p` runs, each in a fresh scratch copy of this repository. The per-run data is in [`p4-2026-10-19.jsonl`](p4-2026-10-19.jsonl); it holds counts only, no answer text (a live run writes answer text to the gitignored `evals/.results/texts/`).

Reproduce the table below with `node evals/summarize.mjs evals/p4-2026-10-19.jsonl`. Re-running the live eval (`node evals/p4.mjs --live`) costs about $5 and builds its fixture from the current `scripts/measure.mjs`, so its numbers are comparable with these only on the same commit of that file.

Pairs: 24. Errored runs excluded: 0.

| Measure | Default | Concise | Change |
| --- | --- | --- | --- |
| Output tokens, total | 27210 | 22642 | -16.8% (95% interval -23.3% to -10.5%) |
| Output tokens, median per pair | | | -17.2% (95% interval -21.0% to -3.0%) |
| Visible answer characters | 39112 | 28766 | -26.5% |
| Thinking tokens | 3181 | 3438 | +8.1% |
| Cost (USD) | 2.34 | 2.26 | -3.3% |
| Checks passed | 23/24 | 24/24 | |

Concise gave fewer output tokens in 17 of 24 pairs (range -51.7% to +22.3%).

| Task | Pairs | Median output change | Passed (default, Concise) |
| --- | --- | --- | --- |
| T1-explain | 3 | -18.4% | 2/3, 3/3 |
| T2-locate | 3 | -32.0% | 3/3, 3/3 |
| T3-fix | 3 | +1.0% | 3/3, 3/3 |
| T4-review | 3 | -16.4% | 3/3, 3/3 |
| T5-plan | 3 | -18.0% | 3/3, 3/3 |
| T6-git | 3 | -42.1% | 3/3, 3/3 |
| T7-config | 3 | +1.3% | 3/3, 3/3 |
| T8-fact | 3 | +1.8% | 3/3, 3/3 |

## Reading the result

- The plan's bar was a median fall of at least 15% in output tokens with no loss of checked answers. The point estimates clear it (total -16.8%, median per pair -17.2%). The intervals reach below it, so the evidence is good but not conclusive.
- The effect depends on the task. Explanations, reviews, plans, git questions and locating code fell 16 to 42%. Fixes, a manifest lookup and a one-line fact were unchanged, because those answers are already short.
- Cost fell only 3%: the fixed prompt prefix dominates each run, so output tokens, not dollars per run, are the signal.
- Limits: one model, one effort, a small fixture without global instructions, 3 runs per cell, and checks that are regular expressions plus one test run. They do not grade answer quality beyond that. The one default miss (T1-explain, rep 2) was not reviewed and may be a strict check. The fixture of this recorded run still contained `.claude/CLAUDE.md`, which mentions the seeded bug; the runner now leaves it out, so a new run is not strictly comparable.
- A first attempt hit a workspace spend limit; it ran on an earlier version of the runner that did not stop at the first error, which is how 28 error rows came about. Those rows were discarded and the runs repeated once the limit was lifted. The data file holds only the 48 valid runs and was reformatted after the run. The current runner stops at the first error row.
