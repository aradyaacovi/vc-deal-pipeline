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

## Known gap: stage history

The funnel infers how far a passed deal got from a single `passedFrom` field. A real pipeline needs a stage-event log (deal, from, to, date) so that time-in-stage and cohort conversion can be measured. It is the first item on the roadmap.
