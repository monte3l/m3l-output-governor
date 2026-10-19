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

## Second run

The same eval was run again the same day on the corrected fixture (no `.claude/CLAUDE.md`, one failing test, tracked files only) and the current `scripts/measure.mjs`. Data: [`p4-2026-10-19-run2.jsonl`](p4-2026-10-19-run2.jsonl), counts only. Reproduce with `node evals/summarize.mjs evals/p4-2026-10-19-run2.jsonl`. The `pass` column in that file is as recorded, with the strict T1 check described below. It cost $4.43, billed to the `ANTHROPIC_API_KEY` credential (`claude auth status` reports `api_key`).

Pairs: 24. Errored runs excluded: 0.

| Measure | Default | Concise | Change |
| --- | --- | --- | --- |
| Output tokens, total | 25791 | 21918 | -15.0% (95% interval -21.5% to -8.1%) |
| Output tokens, median per pair | | | -12.4% (95% interval -21.7% to -4.9%) |
| Visible answer characters | 34909 | 27244 | -22.0% |
| Thinking tokens | 4329 | 3580 | -17.3% |
| Cost (USD) | 2.24 | 2.19 | -2.1% |
| Checks passed, as recorded | 22/24 | 21/24 | |

Concise gave fewer output tokens in 19 of 24 pairs (range -53.1% to +23.9%).

| Task | Median output change, run 1 | Median output change, run 2 |
| --- | --- | --- |
| T1-explain | -18.4% | -26.9% |
| T2-locate | -32.0% | -6.7% |
| T3-fix | +1.0% | -8.0% |
| T4-review | -16.4% | -22.1% |
| T5-plan | -18.0% | -14.9% |
| T6-git | -42.1% | -26.2% |
| T7-config | +1.3% | +0.5% |
| T8-fact | +1.8% | -10.9% |

- **The result repeats, smaller.** Total output fell 15.0% against 16.8%. The point estimate is on the plan's 15% bar and the per-pair median (-12.4%) is below it. Taken together, Concise cuts output by roughly 12 to 17% on this workload, with the interval reaching below the bar in both runs.
- **Run 1 to run 2 differed more than reps within a run.** Within a cell the three reps differ by a median of 7% (coefficient of variation). The same cell differs between the two runs by a median of 19%, and T2-locate went from -32% to -7%. The fixture also changed between the runs, so the gap is not all sampling noise; the third run below separates the two. Treat per-task figures as indicative.
- **The T1 failures were a strict check.** Concise passed T1-explain 0 of 3 in run 2. The answers explain the estimate correctly but write "every request after it", "`later = totalRequests - r.at`" or "4 characters per token", which the original regular expression did not accept. The check now accepts those wordings (`tests/evals.test.mjs` covers it). Re-scoring the saved run 2 answers with it, as a post hoc step, gives T1 3 of 3 for both arms and 23/24 (default) against 24/24 (Concise) overall. The recorded `pass` values are unchanged, and run 1 was scored with the strict check, so only run 2 was re-scored.

## Third run: how much of the spread is noise

A third live run, started from a clean checkout of `main` so its fixture holds the same tracked content as run 2 and uses the same strict T1 check. Data: [`p4-2026-10-19-run3.jsonl`](p4-2026-10-19-run3.jsonl). It cost $4.41, billed to the `ANTHROPIC_API_KEY` credential. Reproduce with `node evals/summarize.mjs evals/p4-2026-10-19-run3.jsonl`.

| Run | Fixture | Output tokens, total | Median per pair | Pairs lower | Cost |
| --- | --- | --- | --- | --- | --- |
| 1 | Original (included `.claude/CLAUDE.md`) | -16.8% | -17.2% | 17 of 24 | $4.60 |
| 2 | Corrected | -15.0% | -12.4% | 19 of 24 | $4.43 |
| 3 | Corrected, same content as run 2 | -13.4% (interval -20.9% to -5.3%) | -11.5% (interval -18.3% to -3.7%) | 20 of 24 | $4.41 |

| Task (mean of 3, Concise against default) | Run 1 | Run 2 | Run 3 |
| --- | --- | --- | --- |
| T1-explain | -14% | -28% | -19% |
| T2-locate | -25% | +1% | -7% |
| T3-fix | -4% | -10% | -12% |
| T4-review | -26% | -23% | -1% |
| T5-plan | -18% | -12% | -17% |
| T6-git | -42% | -33% | -38% |
| T7-config | -1% | +1% | -2% |
| T8-fact | 0% | -11% | +3% |

- **Most of the earlier spread was the fixture, not noise.** The median change of a cell between two runs on the same fixture (run 2 to run 3) is 5%, close to the 7% spread between reps inside a run. Between run 1 and run 2 it was 19%, and between run 1 and run 3 it was 15%. The original fixture's `.claude/CLAUDE.md`, which described the seeded bug and the repository, changed how these answers were written.
- **The corrected estimate is lower than the first headline.** Two runs on the corrected fixture give -15.0% and -13.4% in total (about -14%) and -12.4% and -11.5% median per pair (about -12%). Both are below the plan's 15% bar on the median, and the intervals reach well under it. The first run's -16.8% is best read as an upper figure for the original fixture.
- **Some tasks are stable and some are not.** T6-git (-33%, -38%), T1-explain (-28%, -19%) and T5-plan (-12%, -17%) repeat across the corrected runs. T4-review (-23%, -1%) and T8-fact (-11%, +3%) do not, even on the same fixture, and T4's reps vary by 22 to 36% inside a cell. Do not read a per-task number for T2, T4 or T8 from three reps.
- **Checks.** Run 3 passed 23/24 (default) and 22/24 (Concise) under the strict check. The Concise misses were T1 rep 1 and T4 rep 3; the default miss was T4 rep 2, the same cell that failed in run 2. The failing answers were not reviewed, so a strict check may explain them. Three runs on a task set this small do not show a difference in answer quality either way.
