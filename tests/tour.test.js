import test from 'node:test';
import assert from 'node:assert/strict';
import { TOUR_STEPS } from '../js/tour.js';
import { PORTFOLIO_USERS } from '../data/portfolio-seed.js';

const VIEWS = ['analytics', 'deals', 'deal', 'overview', 'about'];

test('tour: four steps with unique ids and readable text', () => {
  assert.equal(TOUR_STEPS.length, 4);
  assert.equal(new Set(TOUR_STEPS.map((s) => s.id)).size, 4);
  for (const s of TOUR_STEPS) {
    assert.ok(s.title.length > 0 && s.title.length <= 60, s.id);
    assert.ok(s.text.length > 40 && s.text.length <= 320, `${s.id} should read in a few seconds`);
  }
});

test('tour: every step opens a real view as a real user', () => {
  for (const s of TOUR_STEPS) {
    assert.ok(VIEWS.includes(s.view), s.id);
    assert.ok(PORTFOLIO_USERS.some((u) => u.id === s.as), s.id);
  }
});

test('tour: the import step is an analyst, the manager steps are the manager', () => {
  const role = (id) => PORTFOLIO_USERS.find((u) => u.id === TOUR_STEPS.find((s) => s.id === id).as).role;
  assert.equal(role('import'), 'analyst');
  assert.equal(role('deal'), 'analyst');
  assert.equal(role('dashboard'), 'manager');
});
