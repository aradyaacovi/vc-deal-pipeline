// The guided tour: plain data, so it can be tested without a browser. app.js turns each step into a screen state.
// Steps follow the real flow of the tool: look at the numbers, import messy data, evaluate a startup, see who built what.
export const TOUR_STEPS = [
  {
    id: 'dashboard',
    view: 'analytics',
    as: 'dana',
    title: 'Start with the numbers',
    text: 'The manager sees the pipeline as measured: where startups drop out, which phase is slow, where risk sits, who is overloaded. Every metric is defined in METRICS.md, so two people read the same number the same way.',
  },
  {
    id: 'import',
    view: 'deals',
    as: 'ava',
    title: 'Messy data does not get in silently',
    text: 'This is a deliberately untidy CSV. It gets a quality score, rejected rows with the reason, cleaned fields and warnings, and the rejects can be downloaded to fix and resend.',
  },
  {
    id: 'deal',
    view: 'deal',
    as: 'ava',
    title: 'One startup, one process',
    text: 'The analyst works through the same checklist for every startup and fills in a traffic-light form. The rule suggests a light; the analyst decides. What founders told us stays labelled as unverified.',
  },
  {
    id: 'about',
    view: 'about',
    as: 'dana',
    title: 'What I did, and what the AI did',
    text: 'The last screen says who decided what, how the work ran, and where the AI helped. It is the part to read if you want to know what I can do.',
  },
];
