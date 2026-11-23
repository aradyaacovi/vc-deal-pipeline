# Design decisions

Why the tool works the way it does. Each choice is a judgment call and is meant to be edited.

## Rubric weights: team 30, market 25, product 20, traction 15, terms 10

Early-stage deals rarely have meaningful revenue, so traction carries less weight than it would at a later stage. The team is weighted highest because at pre-seed it is the main thing being bought. Terms and fit are scored but kept small: a great deal on a weak company is still a weak company. The weights sum to 1 and a test enforces it.

## A score of 1 forces red

A weighted average hides fatal flaws. A team scoring 5 on everything except a market of 1 would still average above green. Treating a 1 as a veto keeps the traffic light honest, and the rule is shown to the user next to the rating inputs so it is never a surprise.

## Green from 3.8, yellow from 3.0

Chosen so that a deal needs mostly 4s to be green and a set of 3s sits exactly at the yellow boundary. The thresholds are constants in `js/logic.js` and covered by tests at the boundaries.

## Partial scores are allowed

Evaluations are filled in over several meetings. A deal with two criteria rated gets a score from those two, renormalised, and is labelled partial. The alternative, hiding the score until everything is rated, makes early deals look unscored when they are not.

## Stale after 14 days, active stages only

Two weeks without an update is the point where a founder starts to wonder if anyone is listening. Passed and invested deals are never stale. The overview counts stale deals because that is the question a manager asks first.

## Analysts see only their own deals

Keeps each analyst's work separate and lets the manager view be the single place where everything comes together. In this demo the rule is enforced in the front end only; a real deployment would enforce it on the server (see the README).

## No framework, no backend

The point of the demo is the rules, not the infrastructure. Plain ES modules keep the whole tool readable in an afternoon, and pure logic functions make it testable without a browser.

## Stage history, now partly closed

Every stage change is now logged as { date, from, to }, which gives time in the current stage. The funnel still uses `passedFrom` rather than the log, and cohort conversion over time is not built: that would need a database to query. Seeded deals have illustrative histories.

## Submission is gated, not just a stage change

Moving a deal to IC review by dragging it is how weak deals reach the committee. Submission therefore checks the evidence first: a complete, non-red evaluation, enough of the checklist done, real notes and an ask. The thresholds (10 steps, 40 characters) are illustrative and live in `js/logic.js`. A red deal can be passed but not submitted.

## The memo is a template, on purpose

The IC memo is assembled from the deal record with fixed wording, so the output is predictable and testable and no data leaves the browser. It is labelled a draft for the analyst to rewrite. A model-written version would be an optional layer on top, with the user's own key.
