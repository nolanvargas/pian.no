// ── Piano keyboard DOM rendering and key highlighting ─────────────────────────
// buildKeyboard / scaleKeyboard receive { onNoteOn, onNoteOff } callbacks
// so this module has no dependency on midi.js.

import { CFG, config } from './config.js';
import { MIDI_MIN, MIDI_MAX, WHITE_KEY_COUNT, KEY_BASE, isBlack, KEY_ROOTS } from './constants.js';

let mouseHeldMidi = null;

// Exported so app.js can release the held key on global mouseup.
export function getMouseHeldMidi() { return mouseHeldMidi; }
export function clearMouseHeld()   { mouseHeldMidi = null; }

// ── Build / scale ─────────────────────────────────────────────────────────────

export function buildKeyboard({ onNoteOn, onNoteOff }) {
  const piano = document.getElementById('piano');
  piano.innerHTML = '';
  let whiteIndex = 0;

  for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi++) {
    const el = document.createElement('div');
    el.dataset.midi = midi;

    if (isBlack(midi)) {
      el.className  = 'key-black';
      el.style.left   = (whiteIndex * CFG.whiteW - CFG.blackW / 2) + 'px';
      el.style.width  = CFG.blackW + 'px';
      el.style.height = CFG.blackH + 'px';
    } else {
      el.className  = 'key-white';
      el.style.left   = (whiteIndex * CFG.whiteW) + 'px';
      el.style.width  = CFG.whiteW + 'px';
      el.style.height = CFG.keyH + 'px';
      whiteIndex++;
    }

    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (mouseHeldMidi !== null) onNoteOff(mouseHeldMidi);
      mouseHeldMidi = midi;
      onNoteOn(midi, 80);
    });

    el.addEventListener('mouseenter', (e) => {
      if (e.buttons === 1) {
        if (mouseHeldMidi !== null) onNoteOff(mouseHeldMidi);
        mouseHeldMidi = midi;
        onNoteOn(midi, 80);
      }
    });

    piano.appendChild(el);
  }

  piano.style.width  = (52 * CFG.whiteW) + 'px';
  piano.style.height = CFG.keyH + 'px';
}

// Recalculates CFG key dimensions from container width, then rebuilds.
// Callers are responsible for clearing activeKeys before calling this.
export function scaleKeyboard(callbacks) {
  const container = document.getElementById('piano-container');
  const cs = getComputedStyle(container);
  const hPad  = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const availW = container.clientWidth - hPad;
  if (!availW) return;
  const scale   = availW / (WHITE_KEY_COUNT * KEY_BASE.whiteW);
  CFG.whiteW = KEY_BASE.whiteW * scale;
  CFG.blackW = KEY_BASE.blackW * scale;
  CFG.keyH   = KEY_BASE.keyH   * scale;
  CFG.blackH = KEY_BASE.blackH * scale;
  mouseHeldMidi = null;
  buildKeyboard(callbacks);
  applyKeyFilter();
}

// ── Computer keyboard input ──────────────────────────────────────────────────
// Bottom two QWERTY rows play a chromatic run from middle C upward.
// Lower row (zxcv...) = white keys; asdf row (sd_gh_...) = black keys.
const COMPUTER_KEY_MAP = {
  'z': 60, 's': 61, 'x': 62, 'd': 63, 'c': 64, 'v': 65, 'g': 66, 'b': 67,
  'h': 68, 'n': 69, 'j': 70, 'm': 71, ',': 72, 'l': 73, '.': 74, ';': 75, '/': 76,
};
const heldComputerKeys = new Set();

export function initComputerKeyboard({ onNoteOn, onNoteOff }) {
  window.addEventListener('keydown', (e) => {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
    const midi = COMPUTER_KEY_MAP[e.key.toLowerCase()];
    if (midi === undefined) return;
    if (heldComputerKeys.has(midi)) return;
    heldComputerKeys.add(midi);
    onNoteOn(midi, 80);
    e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    const midi = COMPUTER_KEY_MAP[e.key.toLowerCase()];
    if (midi === undefined) return;
    if (!heldComputerKeys.has(midi)) return;
    heldComputerKeys.delete(midi);
    onNoteOff(midi);
  });
  window.addEventListener('blur', () => {
    for (const midi of heldComputerKeys) onNoteOff(midi);
    heldComputerKeys.clear();
  });
}

// ── Key highlighting ──────────────────────────────────────────────────────────

export function applyTargetHighlights(practice) {
  clearTargetHighlights();
  if (!practice.active) return;
  if (practice.sequential) {
    const midi = practice.pattern[practice.seqIndex];
    if (midi !== undefined) {
      document.querySelector(`[data-midi="${midi}"]`)?.classList.add('target');
    }
    return;
  }
  for (const midi of practice.pattern) {
    if (!practice.played.has(midi)) {
      document.querySelector(`[data-midi="${midi}"]`)?.classList.add('target');
    }
  }
}

export function clearTargetHighlights() {
  document.querySelectorAll('.key-white.target, .key-black.target')
    .forEach(el => el.classList.remove('target'));
}

export function applyWrongHints(pattern, activeKeys) {
  clearWrongHints();
  for (const midi of pattern) {
    if (!activeKeys.has(midi)) {
      document.querySelector(`[data-midi="${midi}"]`)?.classList.add('wrong-hint');
    }
  }
}

export function clearWrongHints() {
  document.querySelectorAll('.key-white.wrong-hint, .key-black.wrong-hint')
    .forEach(el => el.classList.remove('wrong-hint'));
}

export function scrollPianoToPattern(pattern) {
  if (!pattern || pattern.length === 0) return;
  const container  = document.getElementById('piano-container');
  const lowestEl   = document.querySelector(`[data-midi="${Math.min(...pattern)}"]`);
  const highestEl  = document.querySelector(`[data-midi="${Math.max(...pattern)}"]`);
  if (!lowestEl || !highestEl || !container) return;
  const left   = lowestEl.offsetLeft;
  const right  = highestEl.offsetLeft + highestEl.offsetWidth;
  const center = (left + right) / 2 - container.clientWidth / 2;
  container.scrollLeft = Math.max(0, center);
}

// ── Key filter (shadow out-of-key notes) ─────────────────────────────────────

const PITCH = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
const KEY_SCALES = {
  C:    new Set(['C', 'D', 'E', 'F', 'G', 'A', 'B']),
  G:    new Set(['G', 'A', 'B', 'C', 'D', 'E', 'F#']),
  D:    new Set(['D', 'E', 'F#', 'G', 'A', 'B', 'C#']),
  A:    new Set(['A', 'B', 'C#', 'D', 'E', 'F#', 'G#']),
  E:    new Set(['E', 'F#', 'G#', 'A', 'B', 'C#', 'D#']),
  B:    new Set(['B', 'C#', 'D#', 'E', 'F#', 'G#', 'A#']),
  'F#': new Set(['F#', 'G#', 'A#', 'B', 'C#', 'D#', 'F']),
  F:    new Set(['F', 'G', 'A', 'A#', 'C', 'D', 'E']),
  Bb:   new Set(['A#', 'C', 'D', 'D#', 'F', 'G', 'A']),
  Eb:   new Set(['D#', 'F', 'G', 'G#', 'A#', 'C', 'D']),
  Ab:   new Set(['G#', 'A#', 'C', 'C#', 'D#', 'F', 'G']),
  Db:   new Set(['C#', 'D#', 'F', 'F#', 'G#', 'A#', 'C']),
};

export function applyKeyFilter() {
  clearKeyFilter();
  const keyName = document.getElementById('key-select').value;
  if (!config.shadowOffKey || keyName === 'random') return;
  const scale = KEY_SCALES[keyName];
  if (!scale) return;
  for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi++) {
    const note = PITCH[(midi - 21) % 12];
    if (!scale.has(note)) {
      document.querySelector(`[data-midi="${midi}"]`)?.classList.add('out-of-key');
    }
  }
}

export function clearKeyFilter() {
  document.querySelectorAll('.out-of-key')
    .forEach(el => el.classList.remove('out-of-key'));
}

export function applyRootHighlight(keyName) {
  clearRootHighlight();
  if (!config.showRootKey) return;
  if (!keyName || keyName === 'random') return;
  const root = KEY_ROOTS[keyName];
  if (root === undefined) return;
  const pitchClass = root % 12;
  for (let midi = MIDI_MIN; midi <= MIDI_MAX; midi++) {
    if (midi % 12 === pitchClass) {
      document.querySelector(`[data-midi="${midi}"]`)?.classList.add('key-root');
    }
  }
}

export function clearRootHighlight() {
  document.querySelectorAll('.key-root')
    .forEach(el => el.classList.remove('key-root'));
}
