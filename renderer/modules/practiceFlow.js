// ── Practice orchestration: test flow, evaluation, feedback, panel UI ─────────
// This module is the conductor — it imports from most other modules and wires
// together pattern generation, evaluation, highlighting, and analytics.

import { MIDI_MIN, MIDI_MAX }                  from './constants.js';
import {
  practice, resolveKey, getKeyNotes,
  generateRandom, generateTriad, generateScaleFragment,
  generateArpeggio, generateInterval, generateShellVoicing,
  generatePentatonic, generateScaleRun,
  runGenerator, generateTwoHanded,
} from './practiceCore.js';
import { renderStaff }                          from './staff.js';
import {
  applyTargetHighlights, clearTargetHighlights,
  applyWrongHints, clearWrongHints,
  scrollPianoToPattern, applyKeyFilter,
  applyRootHighlight,
} from './keyboard.js';
import { activeKeys, getHardwareRange }          from './midi.js';
import { renderAnalytics }                      from './analytics.js';
import { syncHeights }                          from './resizer.js';

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

  if (twoHanded) {
    const usedKey = resolveKey(keyName);
    const pattern = generateTwoHanded(keyName, MIDI_MIN, MIDI_MAX, noteCount, patType);
    startTest(pattern, usedKey);
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
  startTest(pattern, usedKey);
}

// ── Test lifecycle ────────────────────────────────────────────────────────────

export function startTest(pattern, key, sequential = false) {
  clearTargetHighlights();
  clearWrongHints();
  applyRootHighlight(key);

  practice.active        = true;
  practice.pattern       = pattern;
  practice.played        = new Set();
  practice.key           = key || 'random';
  practice.sequential    = sequential;
  practice.seqIndex      = 0;
  practice.totalCorrect  = 0;
  practice.totalAttempts = 0;

  document.getElementById('practice-content').removeAttribute('hidden');
  syncHeights();
  updateProgressLabel();
  updateScoreLabel();
  clearFeedback();
  startTimer();
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
      practice.totalAttempts++;
      showFeedback(false);
      updateScoreLabel();
      if (practice.scale_strict) flashAndRestart();
      return;
    }
    practice.seqIndex++;
    practice.totalCorrect++;
    practice.totalAttempts++;
    updateProgressLabel();
    updateScoreLabel();
    if (practice.seqIndex >= practice.pattern.length) {
      practice.active = false;
      clearTargetHighlights();
      showFeedback(true);
      const elapsed = stopTimer();
      recordCompletion(elapsed);
      document.getElementById('progress-label').textContent = 'Complete!';
      setTimeout(() => generatePattern(), 1200);
    } else {
      showFeedback(true);
      applyTargetHighlights(practice);
      scrollPianoToPattern([practice.pattern[practice.seqIndex]]);
      renderStaff(activeKeys, practice);
    }
    return;
  }

  if (!practice.pattern.includes(midi)) {
    practice.totalAttempts++;
    showFeedback(false);
    updateScoreLabel();
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
  updateProgressLabel(heldInPattern.length);

  if (!wrongHeld && heldInPattern.length === practice.pattern.length) {
    practice.totalAttempts++;
    practice.totalCorrect++;
    practice.active = false;
    clearTargetHighlights();
    clearWrongHints();
    showFeedback(true);
    updateScoreLabel();
    const elapsed = stopTimer();
    recordCompletion(elapsed);
    document.getElementById('progress-label').textContent = 'Complete!';
    setTimeout(() => generatePattern(), 1200);
  }
}

// ── Feedback and progress UI ──────────────────────────────────────────────────

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

export function updateProgressLabel(heldCount) {
  if (practice.sequential) {
    document.getElementById('progress-label').textContent =
      `${practice.seqIndex} / ${practice.pattern.length}`;
    return;
  }
  if (heldCount === undefined) {
    heldCount = practice.pattern.filter(m => activeKeys.has(m)).length;
  }
  document.getElementById('progress-label').textContent =
    `${heldCount} / ${practice.pattern.length} held`;
}

export function updateScoreLabel() {
  document.getElementById('score-label').textContent =
    `Score: ${practice.totalCorrect} / ${practice.totalAttempts}`;
}

// ── Timer ─────────────────────────────────────────────────────────────────────

export function startTimer() {
  if (practice.timerInterval) clearInterval(practice.timerInterval);
  practice.startTime = Date.now();
  const el = document.getElementById('timer-label');
  el.textContent = '0.0s';
  practice.timerInterval = setInterval(() => {
    el.textContent = `${((Date.now() - practice.startTime) / 1000).toFixed(1)}s`;
  }, 100);
}

export function stopTimer() {
  if (practice.timerInterval) {
    clearInterval(practice.timerInterval);
    practice.timerInterval = null;
  }
  const elapsed = practice.startTime ? (Date.now() - practice.startTime) / 1000 : 0;
  document.getElementById('timer-label').textContent = `${elapsed.toFixed(1)}s`;
  return elapsed;
}

// ── History ───────────────────────────────────────────────────────────────────

export function recordCompletion(elapsed) {
  practice.completionHistory.push({
    time:     elapsed,
    notes:    practice.pattern.length,
    correct:  practice.totalCorrect,
    attempts: practice.totalAttempts,
    key:      practice.key,
    mode:     practice.sequential ? 'scalerun' : 'chord',
    ts:       Date.now(),
  });
  localStorage.setItem('completionHistory', JSON.stringify(practice.completionHistory));
  renderAnalytics();
}

// ── Session reset ─────────────────────────────────────────────────────────────

function resetSession() {
  if (practice.timerInterval) clearInterval(practice.timerInterval);
  practice.active           = false;
  practice.pattern          = [];
  practice.played           = new Set();
  practice.totalCorrect     = 0;
  practice.totalAttempts    = 0;
  practice.seqIndex         = 0;
  practice.startTime        = null;
  practice.timerInterval    = null;
  practice.completionHistory = [];
  localStorage.removeItem('completionHistory');

  clearTargetHighlights();
  clearWrongHints();
  clearFeedback();

  document.getElementById('score-label').textContent    = 'Score: 0 / 0';
  document.getElementById('progress-label').textContent = '';
  document.getElementById('timer-label').textContent    = '';
  document.getElementById('practice-content').setAttribute('hidden', '');
  syncHeights();
}

// ── Practice panel UI ─────────────────────────────────────────────────────────

export function initPracticePanel() {
  const toggleBtn   = document.getElementById('practice-toggle');
  const panel       = document.getElementById('practice-panel');
  const controls    = document.getElementById('practice-controls');
  const generateBtn = document.getElementById('generate-btn');

  toggleBtn.addEventListener('click', () => {
    const expanded = panel.classList.toggle('expanded');
    toggleBtn.setAttribute('aria-expanded', expanded);
    if (expanded) {
      controls.removeAttribute('hidden');
    } else {
      controls.setAttribute('hidden', '');
    }
  });

  generateBtn.addEventListener('click', () => generatePattern());
  document.getElementById('scale-btn').addEventListener('click', () => generateScalePattern());
  document.getElementById('clear-btn').addEventListener('click', () => resetSession());

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

  patSel.value          = localStorage.getItem('cfg-pattern') ?? 'any';
  countSel.disabled     = FIXED_COUNT.has(patSel.value);

  patSel.addEventListener('change', () => {
    localStorage.setItem('cfg-pattern', patSel.value);
    countSel.disabled = FIXED_COUNT.has(patSel.value);
    renderAnalytics();
  });
}
