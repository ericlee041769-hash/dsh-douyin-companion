import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';

test('client mounts beside the existing corner control and disposes its registrations', async () => {
  const compiled = await build({ entryPoints: ['src/client.jsx'], bundle: true, write: false,
    format: 'cjs', external: ['react'], loader: { '.css': 'text' } });
  const registrations = new Map([['conversation.session.header.corner', 'existing-control']]);
  const kinds = { 'conversation.session.header.corner': 'single',
    'conversation.session.header.utilities': 'list', 'sidebar.right.pane.tab': 'keyed' };
  const subscriptions = new Set();
  const observable = value => ({ getSnapshot: () => value,
    subscribe: fn => { subscriptions.add(fn); return () => subscriptions.delete(fn); } });
  const disposers = [];
  const context = {
    effect: callback => disposers.push(callback()),
    sidebarRight: { mounted: observable(undefined) },
    sessions: { list: observable({ byId: {} }) },
    uiSession: { sessionStatus: observable(new Map()) },
    connection: { generation: observable(1) },
    sidebarRightTabs: { register: () => () => {} },
    slots: {
      inject: (name, callback) => { assert.ok(kinds[name]); return callback(); },
      register: ({ name }, component) => {
        if (kinds[name] === 'single' && registrations.has(name)) throw new Error('slot occupied');
        registrations.set(name, component);
        return () => registrations.delete(name);
      },
    },
  };
  const sandbox = { module: { exports: {} }, require: () => ({}),
    dshDesktop: { browser: {} }, localStorage: { getItem: () => null }, clearTimeout,
    document: { createElement: () => ({ remove() {} }), head: { append() {} } } };
  vm.runInNewContext(compiled.outputFiles[0].text, sandbox);
  sandbox.module.exports.apply(context);
  assert.equal(registrations.get('conversation.session.header.corner'), 'existing-control');
  assert.equal(typeof registrations.get('conversation.session.header.utilities'), 'function');
  assert.ok(subscriptions.size);
  disposers.reverse().forEach(dispose => dispose());
  assert.deepEqual([...registrations.keys()], ['conversation.session.header.corner']);
  assert.equal(subscriptions.size, 0);
});

test('different conversations share Douyin storage while releasing only their own leases', async () => {
  const compiled = await build({ entryPoints: ['src/client.jsx'], bundle: true, write: false,
    format: 'cjs', external: ['react'], loader: { '.css': 'text' } });
  const registrations = new Map();
  const acquired = [], released = [], guests = [], effects = [];
  const observable = value => ({ getSnapshot: () => value, subscribe: () => () => {} });
  const React = {
    useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
    useRef: value => ({ current: value }),
    useState: value => [value, () => {}], useEffect: effect => effects.push(effect),
    createElement: (_type, props) => {
      if (props?.ref) props.ref.current = { append: element => guests.push(element) };
      return {};
    },
  };
  const sandbox = { module: { exports: {} }, require: () => React, clearTimeout, AbortController,
    setInterval: () => 1, clearInterval: () => {}, navigator: { userAgent: 'Chrome/152 Electron/44' },
    localStorage: { getItem: () => null }, document: { head: { append() {} },
      createElement: () => ({ attributes: {}, setAttribute(k, v) { this.attributes[k] = v; },
        addEventListener() {}, remove() {} }) },
    dshDesktop: { browser: {
      acquire: async identity => { acquired.push(identity); return { lease: `lease-${acquired.length}`, partition: 'shared-douyin' }; },
      release: async lease => released.push(lease), onOpenRequested: () => () => {},
    } },
  };
  vm.runInNewContext(compiled.outputFiles[0].text, sandbox);
  sandbox.module.exports.apply({ effect: fn => fn(),
    sidebarRight: { mounted: observable(undefined) }, sessions: { list: observable({ byId: {} }) },
    uiSession: { sessionStatus: observable(new Map()) }, connection: { generation: observable(1) },
    sidebarRightTabs: { register: () => () => {} }, slots: {
      inject: (_name, fn) => fn(), register: ({ name }, component) => registrations.set(name, component),
    },
  });
  const Player = registrations.get('sidebar.right.pane.tab');
  const cleanups = [];
  for (const sessionId of ['conversation-a', 'conversation-b']) {
    Player({ sessionId, useTabInfo: () => ({ tab: { visible: true } }) });
    for (const effect of effects.splice(0)) { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); }
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.deepEqual(acquired, ['dsh-douyin-companion', 'dsh-douyin-companion']);
  assert.deepEqual(guests.map(guest => guest.attributes.partition), ['shared-douyin', 'shared-douyin']);
  assert.deepEqual(guests.map(guest => guest.attributes.name), ['lease-1', 'lease-2']);
  cleanups[0]();
  assert.deepEqual(released, ['lease-1']);
  cleanups[1]();
  assert.deepEqual(released, ['lease-1', 'lease-2']);
});
