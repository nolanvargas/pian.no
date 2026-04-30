// ── Practice orchestration: test flow, evaluation, feedback ──────────────────
// This module is the conductor — it imports from most other modules and wires
// together pattern generation, evaluation, and highlighting.

import { MIDI_MIN, MIDI_MAX }                  from './constants.js';
import {
  practice, resolveKey,
  generateRandom, generateTriad, generateScaleFragment,
  generateArpeggio, generateInterval, generateShellVoicing,
  generatePentatonic, generateScaleRun,
  generateTwoHanded,
} from './practiceCore.js';
import { renderStaff }                          from './staff.js';
import {
  applyTargetHighlights, clearTargetHighlights,
  applyWrongHints, clearWrongHints,
  scrollPianoToPattern, applyKeyFilter,
  applyRootHighlight,
} from './keyboard.js';
import { activeKeys, getHardwareRange }          from './midi.js';

// ── Scale-strict flash ────────────────────────────────────────────────────────

function flashAndRestart() {
  practice.active = false;
  clearTargetHighlights();
  const keys = document.querySelectorAll('.key-white, .key-black');
  keys.forEach(k => k.classList.add('flash-wrong'));
  setTimeout(() => {
    keys.forEach(k => k.classList.remove('flash-wrong'));
    generateScalePattern();
  }, 600);
}

// ── Pattern dispatchers ───────────────────────────────────────────────────────

export function generateScalePattern() {
  practice.viewingScaleMode = true;
  const keyName  = document.getElementById('key-select').value;
  const usedKey  = resolveKey(keyName);
  const hwRange  = getHardwareRange();
  const minKey   = hwRange ? hwRange.min : MIDI_MIN;
  const maxKey   = hwRange ? hwRange.max : MIDI_MAX;
  const pattern  = generateScaleRun(keyName, minKey, maxKey);
  if (pattern.length > 0) startTest(pattern, usedKey, true);
}

export function generatePattern() {
  practice.viewingScaleMode = false;
  const keyName   = document.getElementById('key-select').value;
  const noteCount = parseInt(document.getElementById('count-select').value, 10);
  const patType   = document.getElementById('pattern-select').value;
  const twoHanded = document.getElementById('cfg-two-handed').checked;

  const halfEnabled = document.getElementById('cfg-half-notes')?.checked;
  const useHalf     = !!halfEnabled && Math.random() < 0.33;

  if (twoHanded) {
    const usedKey = resolveKey(keyName);
    const pattern = generateTwoHanded(keyName, MIDI_MIN, MIDI_MAX, noteCount, patType);
    startTest(pattern, usedKey, false, useHalf);
    return;
  }

  const GENERATORS = {
    random:        () => generateRandom(keyName, MIDI_MIN, MIDI_MAX, noteCount),
    triad:         () => generateTriad(keyName, MIDI_MIN, MIDI_MAX),
    scalefragment: () => generateScaleFragment(keyName, MIDI_MIN, MIDI_MAX, noteCount),
    arpeggio:      () => generateArpeggio(keyName, MIDI_MIN, MIDI_MAX, noteCount),
    interval:      () => generateInterval(keyName, MIDI_MIN, MIDI_MAX),
    shell:         () => generateShellVoicing(keyName, MIDI_MIN, MIDI_MAX),
    pentatonic:    () => generatePentatonic(keyName, MIDI_MIN, MIDI_MAX, noteCount),
  };

  let type = patType;
  if (type === 'any') {
    const choices = Object.keys(GENERATORS).filter(k => k !== 'random');
    type = choices[Math.floor(Math.random() * choices.length)];
  }

  const usedKey = (type === 'random' && keyName === 'random') ? 'random' : resolveKey(keyName);
  const pattern = (GENERATORS[type] ?? GENERATORS.random)().sort((a, b) => a - b);
  startTest(pattern, usedKey, false, useHalf);
}

// ── Test lifecycle ────────────────────────────────────────────────────────────

export function startTest(pattern, key, sequential = false, half = false) {
  clearTargetHighlights();
  clearWrongHints();
  applyRootHighlight(key);

  practice.active     = true;
  practice.pattern    = pattern;
  practice.played     = new Set();
  practice.key        = key || 'random';
  practice.sequential = sequential;
  practice.seqIndex   = 0;
  practice.half       = half;

  clearFeedback();
  renderStaff(activeKeys, practice);
  applyTargetHighlights(practice);
  scrollPianoToPattern(sequential ? [pattern[0]] : pattern);
}

// ── Practice evaluation ───────────────────────────────────────────────────────

export function checkPracticeNote(midi) {
  if (!practice.active) return;

  if (practice.sequential) {
    const target = practice.pattern[practice.seqIndex];
    if (midi !== target) {
      showFeedback(false);
      if (practice.scale_strict) flashAndRestart();
      return;
    }
    practice.seqIndex++;
    if (practice.seqIndex >= practice.pattern.length) {
      practice.active = false;
      clearTargetHighlights();
      showFeedback(true);
      practice.nextPatternTimer = setTimeout(() => generatePattern(), 1200);
    } else {
      showFeedback(true);
      applyTargetHighlights(practice);
      scrollPianoToPattern([practice.pattern[practice.seqIndex]]);
      renderStaff(activeKeys, practice);
    }
    return;
  }

  if (!practice.pattern.includes(midi)) {
    showFeedback(false);
    clearTargetHighlights();
    applyWrongHints(practice.pattern, activeKeys);
    return;
  }

  evaluatePracticeChord();
}

export function evaluatePracticeChord() {
  if (!practice.active) return;

  const heldInPattern = practice.pattern.filter(m => activeKeys.has(m));
  const wrongHeld     = [...activeKeys.keys()].some(m => !practice.pattern.includes(m));

  if (!wrongHeld) clearWrongHints();

  if (!wrongHeld && heldInPattern.length === practice.pattern.length) {
    practice.active = false;
    clearTargetHighlights();
    clearWrongHints();
    showFeedback(true);
    practice.nextPatternTimer = setTimeout(() => generatePattern(), 1200);
  }
}

// ── Feedback ──────────────────────────────────────────────────────────────────

export function showFeedback(correct) {
  const el = document.getElementById('feedback-label');
  el.textContent = correct ? 'Correct!' : 'Wrong';
  el.className   = correct ? 'correct' : 'wrong';
  if (practice.feedbackTimer) clearTimeout(practice.feedbackTimer);
  practice.feedbackTimer = setTimeout(() => {
    el.textContent = '';
    el.className   = '';
  }, 800);
}

export function clearFeedback() {
  const el = document.getElementById('feedback-label');
  el.textContent = '';
  el.className   = '';
}

// ── Tab-switch reset ──────────────────────────────────────────────────────────
// Wipes transient practice state and any DOM remnants so a tab switch lands
// in a clean state. Preserves practice.key and practice.scale_strict.

export function resetPracticeSession() {
  if (practice.feedbackTimer)    { clearTimeout(practice.feedbackTimer);    practice.feedbackTimer    = null; }
  if (practice.nextPatternTimer) { clearTimeout(practice.nextPatternTimer); practice.nextPatternTimer = null; }
  practice.active           = false;
  practice.pattern          = [];
  practice.played           = new Set();
  practice.sequential       = false;
  practice.seqIndex         = 0;
  practice.viewingScaleMode = false;
  practice.half             = false;
  clearTargetHighlights();
  clearWrongHints();
  clearFeedback();
  renderStaff(activeKeys, practice);
}

// ── Practice control wiring ───────────────────────────────────────────────────

export function initPracticeControls() {
  document.getElementById('generate-btn').addEventListener('click', () => generatePattern());
  document.getElementById('scale-btn').addEventListener('click', () => generateScalePattern());

  const keySel = document.getElementById('key-select');
  keySel.value = localStorage.getItem('cfg-key') ?? 'random';
  applyRootHighlight(keySel.value);
  keySel.addEventListener('change', () => {
    localStorage.setItem('cfg-key', keySel.value);
    applyKeyFilter();
    applyRootHighlight(keySel.value);
    renderStaff(activeKeys, practice);
  });

  const patSel    = document.getElementById('pattern-select');
  const countSel  = document.getElementById('count-select');
  const FIXED_COUNT = new Set(['triad', 'interval', 'shell']);

  patSel.value      = localStorage.getItem('cfg-pattern') ?? 'any';
  countSel.disabled = FIXED_COUNT.has(patSel.value);

  patSel.addEventListener('change', () => {
    localStorage.setItem('cfg-pattern', patSel.value);
    countSel.disabled = FIXED_COUNT.has(patSel.value);
  });
}
