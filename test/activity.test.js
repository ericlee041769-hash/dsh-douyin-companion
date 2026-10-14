import test from 'node:test';
import assert from 'node:assert/strict';
import { activityFor, decisionFor } from '../src/activity.js';

test('running → approval → resumed → completed produces play/pause/play/pause', () => {
  const sessions = { byId: { main: { id: 'main', running: true } } };
  const statuses = new Map();
  const controls = [];
  for (const status of [{ running: true }, { running: true, pendingInteraction: {} }, { running: true }, { running: false }]) {
    statuses.set('main', status);
    controls.push(decisionFor(activityFor('main', sessions, statuses).state));
  }
  assert.deepEqual(controls, ['play', 'pause', 'play', 'pause']);
});
test('unrelated sessions and forks cannot start playback or interrupt current task', () => {
  const sessions = { byId: { main: { id: 'main', running: false }, fork: { id: 'fork', parentId: 'main', origin: 'fork', running: true } } };
  const statuses = new Map([['other', { running: true, pendingInteraction: {} }], ['fork', { running: true }]]);
  assert.equal(activityFor('main', sessions, statuses).state, 'idle');
});
test('nested subagent approval overrides another running agent until all approvals settle', () => {
  const sessions = { byId: { main: { id: 'main', running: true }, child: { id: 'child', parentId: 'main', origin: 'subagent' }, nested: { id: 'nested', parentId: 'child', origin: 'subagent' } } };
  const statuses = new Map([['child', { pendingInteraction: {} }], ['nested', { pendingInteraction: {} }]]);
  assert.equal(activityFor('main', sessions, statuses).state, 'awaiting');
  statuses.delete('child');
  assert.equal(activityFor('main', sessions, statuses).attentionId, 'nested');
  statuses.clear();
  assert.equal(activityFor('main', sessions, statuses).state, 'thinking');
});
test('disconnect and no selected conversation pause even while a task runs', () => {
  const sessions = { byId: { main: { id: 'main', running: true } } };
  assert.equal(decisionFor(activityFor('main', sessions, new Map(), false).state), 'pause');
  assert.equal(decisionFor(activityFor(undefined, sessions, new Map()).state), 'pause');
});
