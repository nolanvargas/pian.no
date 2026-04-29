// ── Per-tab application state ────────────────────────────────────────────────
// Each tab owns its own practice session and key signature. Switching tabs
// snapshots the current tab's practice into its slot and restores the new
// tab's snapshot into the live `practice` singleton.

import { snapshotPractice, loadPractice } from './practiceCore.js';

const TABS = ['piano', 'scale', 'random', 'tails', 'settings'];

function defaultPracticeSnapshot() {
  return {
    active: false, pattern: [], played: new Set(),
    key: 'random', sequential: false, seqIndex: 0,
    viewingScaleMode: false, scale_strict: false,
  };
}

const _states = Object.fromEntries(TABS.map(name => [name, {
  key: localStorage.getItem(`cfg-tab-${name}-key`) ?? 'random',
  practice: defaultPracticeSnapshot(),
}]));

let _currentTab = null;

export function getCurrentTab()       { return _currentTab; }
export function getTabState(name)     { return _states[name]; }

export function snapshotCurrentTab() {
  if (_currentTab && _states[_currentTab]) {
    _states[_currentTab].practice = snapshotPractice();
  }
}

export function activateTab(name) {
  _currentTab = name;
  loadPractice(_states[name].practice);
}

export function setTabKey(name, key) {
  _states[name].key = key;
  localStorage.setItem(`cfg-tab-${name}-key`, key);
}
