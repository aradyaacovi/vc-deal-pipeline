# Metric definitions

Every number on the Analytics tab and in the import check is defined here, so two people reading the same dashboard get the same answer. The code is in [`js/analytics.js`](../js/analytics.js) and [`js/quality.js`](../js/quality.js); each rule below has a test.

Scope: an analyst sees metrics for their own startups (lead or second analyst), a manager for all. Rates are rounded to whole percent; averages of days to one decimal. When the denominator is zero the metric is empty (`—`), never 0.

## Pipeline

| Metric | Definition |
| --- | --- |
| Active | Startups with at least one checklist step left |
| Completed | Startups with all 17 steps done (committee presentation included). Completion rate = completed / all startups |
| Avg progress | Mean of each startup's checklist percent |
| Gone quiet | Active startups with no logged activity for 7 or more days. Rate = quiet / active |
| Overdue | Active startups whose target date has passed |
| Red lights | Startups whose light is red (the analyst's chosen light, otherwise the suggestion from the P0 rule). Rate = red / startups that have a light |
| To first meeting | Mean days from assignment to the "Questions and next steps" step (the end of the first meeting), over startups that reached it |
| Form submitted | Of startups that had their first meeting, the share with a submitted traffic-light form |

## Funnel and phase time

- **Funnel.** A startup has *reached* a stage when its current phase is that stage or later (phases in order, then Done). *Conversion* at a stage = reached here / reached at the stage before.
- **Time in phase.** For startups that finished the phase: days between finishing the previous phase (or assignment, for the first) and finishing this one. A phase is finished on the date of its last completed step. Startups that have not finished the phase are left out, so the average describes completed work only.

## Charts

| Chart | Definition |
| --- | --- |
| New and finished per 30 days | Twelve consecutive 30-day periods ending today. *Entered* = startups assigned in the period; *Finished* = startups whose last checklist step (committee presentation) falls in it |
| Time in each phase (range chart) | Per phase, for startups that finished it: bar = 25th to 75th percentile, tick = median, line = fastest to slowest. Percentiles are linearly interpolated |
| Sectors and traffic lights | Startups per sector split by light (green, yellow, red, not evaluated), largest sector first |
| Workload by analyst | Open startups per lead analyst, split into moving and gone quiet (7+ days without activity) |

Every chart has a text summary and a hidden data table for screen readers.

## Demo data

The default demo is generated, not hand-written: 72 invented startups over about 12 months from a fixed random seed, so the numbers are identical on every run. Steps take a random number of days per phase and startups stall at set probabilities, which produces a funnel, slow phases and quiet startups to analyse. The generator is in [`data/portfolio-seed.js`](../data/portfolio-seed.js). It is a model of plausible behaviour, not real fund data. Add `?data=small` to the URL for the original 9-startup set.

## Data health

Share of startups with: a real sector (not "Unspecified"), a one-line description, a second analyst, a target date (finished startups are exempt), at least one named founder. It tells the reader how far to trust the rest of the page.

## Import quality score

`score = rows imported with nothing to report / data rows in the file × 100`

A row counts as clean when it is accepted and raised no warning. Rejected rows and rows imported with a warning both lower the score.

| Outcome | Rule |
| --- | --- |
| **Rejected** | Empty name · unknown track · name already on the list · name repeated in the file · no `name` column · empty file |
| **Warning, row imported** | Extra spaces trimmed · sector spelled differently from an existing or more common spelling (normalised to it) · no sector (set to "Unspecified") · no description · description over 140 characters · name that matches another after ignoring case, punctuation and suffixes such as Inc or Ltd · text starting with `=`, `+`, `-` or `@` · unused column in the header |
| **Per-column completeness** | Filled cells / data rows, for `name`, `sector`, `track`, `one_liner` |

Rejected rows can be downloaded with the line number and the reason, so the sender can fix and resend. Exports escape leading `=`, `+`, `-`, `@` so a spreadsheet never runs imported text as a formula.

## What is not measured

There is no revenue, valuation or return data, and the demo data is invented, so the numbers show how the metrics behave, not how a real fund performs.
