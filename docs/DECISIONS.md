# Design decisions

Why the tool works the way it does. Each choice is a judgment call and is meant to be edited.

## One checklist for every startup

Four phases and seventeen steps, the same for all startups, so a manager can compare them and an analyst never wonders what comes next. The track (intro or launch) changes the target date, not the steps. The steps are generic ones written for this demo.

## A ready text for each step

Most delays are blank-page delays. Each step that needs writing has a template filled from the record. They are deterministic on purpose: reviewable, free, and nothing is sent anywhere. The analyst edits and copies.

## The analyst decides the light, the rule only suggests

P0 answers are marked unknown, founder-stated, verified or concern, with a source. Any concern suggests red, at least 75% verified suggests green, otherwise yellow. It is a suggestion because judgment about a team cannot be reduced to a count, but showing the rule keeps lights consistent between analysts.

## Founder-provided information is kept apart and labelled

What founders say in an application is not what we verified. It lives on its own tab with a warning, so it is never mistaken for a finding.

## Scheduling needs the lead and at least one peer

A founder meeting without the lead is not useful, and one analyst alone is a risk. The tool offers three times where both are free and re-checks at booking, so two analysts cannot take the same slot.

## The manager sees exceptions, not everything

Four tiles (red light, gone quiet for 7 days, due within 3 days, form missing) show what needs attention and act as table filters. The manager view is read-only.

## No backend

Roles are enforced in the UI to show the model. A real deployment would enforce them on the server. The demo stores data in the browser so it can be tried without an account.

## Analytics definitions live in one document

A dashboard is only useful if two readers get the same number. Each metric is defined in [`METRICS.md`](METRICS.md), computed by a pure function in `js/analytics.js`, and tested. Averages describe finished work only, and empty denominators show `—` instead of a misleading 0.

## Import checks separate "reject" from "warn"

A row that cannot be used (no name, unknown track, duplicate) is rejected with its line number. A row that can be used but is untidy (spaces, odd sector spelling, near-duplicate name) is imported after cleaning and flagged. Rejecting everything untidy would make people give up on the tool; accepting everything silently would let duplicates and typos reach the manager view. The score and the downloadable rejected-rows file make the trade-off visible. Near-duplicates are only flagged, never merged, because only a person knows whether "Ember Grid" and "Ember Grid Inc." are the same company.

## Charts are hand-drawn SVG, not a library

A charting library would add a dependency and a build step to a project whose point is that it runs from a static folder. Five chart types are small enough to write directly (`js/charts.js`), take their colours from the theme so dark mode works, and each carries a text summary and a data table for screen readers. The cost is no tooltips or animation, which this dashboard does not need.

## The demo data is generated from a seed

Nine hand-written startups cannot show a trend or a funnel. A seeded generator makes 72, with realistic stalls and delays, and gives the same data on every run so tests, screenshots and the live demo agree. The dashboard opens first, as the manager, because the first thing a visitor should see is the analysis.

## Analytics respect the same roles as the rest of the app

The Analytics tab reads through the same visibility rule as the deal list, so an analyst's KPIs cover only their own startups. A test pins this.
