import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { installScript } from '../src/media.js';
import { setImmediate } from 'node:timers/promises';

function fixture() {
  const handlers = new Map();
  const list = [];
  let mutated;
  const document = {
    documentElement: {}, querySelectorAll: () => list,
    addEventListener: (name, fn) => handlers.set(name, fn),
    removeEventListener: name => handlers.delete(name),
  };
  const window = {};
  const context = { window, document, innerWidth: 500, innerHeight: 800, requestAnimationFrame: fn => fn(),
    MutationObserver: class { constructor(fn) { mutated = fn; } observe() {} disconnect() {} } };
  vm.runInNewContext(installScript, context);
  function video(source = 'test.mp4', rect = {left:0,top:0,right:500,bottom:800}) {
    const v = { tagName:'VIDEO', currentSrc:source, src:source, readyState:3, paused:true, muted:false, currentTime:17,
      getBoundingClientRect: () => rect,
      play: async () => { v.paused = false; handlers.get('play')?.({target:v}); },
      pause: () => { v.paused = true; } };
    list.push(v); return v;
  }
  return { api:window.__dshDouyinCompanion, video, list, handlers, mutate: () => mutated() };
}

test('pauses every video, preserves position, and resumes visible source', async () => {
  const f = fixture();
  const visible = f.video();
  const hidden = f.video('preload.mp4', {left:0,top:900,right:500,bottom:1700});
  f.api.setAction('play'); await Promise.resolve();
  assert.equal(visible.paused, false); assert.equal(hidden.paused, true);
  hidden.paused = false;
  f.api.setAction('pause');
  assert.equal(visible.paused, true); assert.equal(hidden.paused, true);
  assert.equal(visible.currentTime, 17);
  f.api.setAction('play'); await Promise.resolve();
  assert.equal(visible.paused, false); assert.equal(visible.currentTime, 17);
});
test('site cannot autoplay a replacement video while awaiting approval', async () => {
  const f = fixture();
  const v = f.video();
  await v.play(); assert.equal(v.paused, true);
});
test('a deferred play promise cannot restart video after completion', async () => {
  const f = fixture(); const v = f.video();
  let finish;
  v.play = () => new Promise(resolve => { finish = () => { v.paused = false; resolve(); }; });
  f.api.setAction('play'); f.api.setAction('pause');
  finish(); await setImmediate();
  assert.equal(v.paused, true);
});
test('manual pause is retained while running, but switching source starts new video', async () => {
  const f = fixture(); const v = f.video();
  f.api.setAction('play'); await Promise.resolve();
  v.pause(); f.api.setAction('play'); assert.equal(v.paused, true);
  v.currentSrc = 'next.mp4'; f.mutate(); await Promise.resolve();
  assert.equal(v.paused, false);
});
test('blocked audible autoplay starts muted and reports that sound needs a gesture', async () => {
  const f = fixture(); const v = f.video();
  v.play = async () => { if (!v.muted) { const e = new Error('gesture'); e.name = 'NotAllowedError'; throw e; } v.paused = false; };
  f.api.setAction('play'); await setImmediate();
  assert.equal(v.paused, false); assert.equal(v.muted, true); assert.equal(f.api.snapshot().needsGesture, true);
});
test('closing controller releases observers and pauses video', async () => {
  const f = fixture(); const v = f.video();
  f.api.setAction('play'); await Promise.resolve();
  f.api.dispose(); assert.equal(v.paused, true); assert.equal(f.handlers.size, 0);
});

for (const mutedRetry of [false, true]) {
  test(`live source load cancels play without showing an error (muted retry: ${mutedRetry})`, async () => {
    const f = fixture(); const v = f.video();
    let attempts = 0;
    v.play = async () => {
      attempts++;
      const e = new Error('The play() request was interrupted by a new load request.');
      e.name = mutedRetry && attempts === 1 ? 'NotAllowedError' : 'AbortError';
      throw e;
    };
    f.api.setAction('play'); await setImmediate();
    assert.equal(f.api.snapshot().error, '');
    const expectedAttempts = mutedRetry ? 2 : 1;
    assert.equal(attempts, expectedAttempts);
    f.mutate(); f.api.setAction('play'); await setImmediate();
    assert.equal(attempts, expectedAttempts, 'do not repeatedly interrupt the site reconnecting');
  });
}

test('an old play result cannot pause a newer resumed task', async () => {
  const f = fixture(); const v = f.video();
  let finish;
  v.play = () => new Promise(resolve => { finish = () => { v.paused = false; resolve(); }; });
  f.api.setAction('play'); f.api.setAction('pause');
  v.play = async () => { v.paused = false; };
  f.api.setAction('play'); await setImmediate();
  finish(); await setImmediate();
  assert.equal(v.paused, false);
});

test('a replaced stream cannot publish its late error over the current stream', async () => {
  const f = fixture(); const v = f.video();
  let rejectOld;
  v.play = () => new Promise((_, reject) => { rejectOld = reject; });
  f.api.setAction('play');
  v.currentSrc = 'next.mp4'; v.play = async () => { v.paused = false; };
  f.mutate(); await setImmediate();
  rejectOld(new Error('old source failed')); await setImmediate();
  assert.equal(f.api.snapshot().error, ''); assert.equal(v.paused, false);
});

test('live MediaStream replacement resumes when needed without restarting an already playing stream', async () => {
  const f = fixture(); const v = f.video('');
  v.srcObject = {}; v.paused = false;
  let attempts = 0; let loads = 0;
  v.play = async () => { attempts++; v.paused = false; };
  v.load = () => { loads++; };
  f.api.setAction('play'); await setImmediate();
  assert.equal(attempts, 0);
  v.srcObject = {}; f.mutate(); await setImmediate();
  assert.equal(attempts, 0);
  v.srcObject = {}; v.paused = true; f.handlers.get('loadeddata')({ target: v }); await setImmediate();
  assert.equal(attempts, 1); assert.equal(v.paused, false); assert.equal(loads, 0);
});

test('a real current-source playback failure remains visible', async () => {
  const f = fixture(); const v = f.video();
  v.play = async () => { const e = new Error('unsupported stream'); e.name = 'NotSupportedError'; throw e; };
  f.api.setAction('play'); await setImmediate();
  assert.equal(f.api.snapshot().error, 'unsupported stream');
});
