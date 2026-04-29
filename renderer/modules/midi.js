// ── MIDI input, note state, and sustain pedal ─────────────────────────────────
// activeKeys is exported as the authoritative map of currently-sounding notes.
// Callbacks for cross-module side effects are injected via initMIDICallbacks().

import { config }                        from './config.js';
import { isBlack, getNoteName, midiToHz } from './constants.js';
import { MIDI_MIN, MIDI_MAX }             from './constants.js';
import { renderStaff }                    from './staff.js';
import { practice }                       from './practiceCore.js';

// ── State ─────────────────────────────────────────────────────────────────────

export const activeKeys = new Map(); // midi → DOM element

let sustainActive = false;
const sustainedKeys = new Set(); // midi notes held open by sustain pedal

// ── Hardware keyboard range detection ────────────────────────────────────────
// Tracks the min/max MIDI notes seen from hardware, persisted across sessions.
let hwMin = parseInt(localStorage.getItem('hw-kb-min') ?? String(MIDI_MAX));
let hwMax = parseInt(localStorage.getItem('hw-kb-max') ?? String(MIDI_MIN));

export function getHardwareRange() {
  if (hwMin > hwMax) return null; // no hardware notes seen yet
  return { min: hwMin, max: hwMax };
}

function trackHardwareNote(midi) {
  let changed = false;
  if (midi < hwMin) { hwMin = midi; changed = true; }
  if (midi > hwMax) { hwMax = midi; changed = true; }
  if (changed) {
    localStorage.setItem('hw-kb-min', hwMin);
    localStorage.setItem('hw-kb-max', hwMax);
  }
}

// Cross-module callbacks wired by app.js to avoid circular imports.
let _onCheckPracticeNote     = () => {};
let _onEvaluatePracticeChord = () => {};

export function initMIDICallbacks({ onCheckPracticeNote, onEvaluatePracticeChord }) {
  _onCheckPracticeNote     = onCheckPracticeNote;
  _onEvaluatePracticeChord = onEvaluatePracticeChord;
}

// ── Note events ───────────────────────────────────────────────────────────────

export function noteOn(midi, velocity) {
  if (velocity === 0) { noteOff(midi); return; }

  const el = document.querySelector(`[data-midi="${midi}"]`);
  if (!el) return;

  const b     = Math.round(40 + (velocity / 127) * 215);
  const color = isBlack(midi)
    ? `rgb(0, ${b - 20}, ${Math.round(b * 0.4)})`
    : `rgb(${Math.round(b * 0.25)}, ${b}, ${Math.round(b * 0.45)})`;

  sustainedKeys.delete(midi);
  el.style.setProperty('--key-color', color);
  el.classList.remove('pedal-held');
  el.classList.add('active');
  activeKeys.set(midi, el);

  document.getElementById('note-name').textContent      = getNoteName(midi);
  document.getElementById('velocity-label').textContent = `vel: ${velocity}`;
  document.getElementById('freq-label').textContent     = config.showFrequency ? `${midiToHz(midi)} Hz` : '';

  renderStaff(activeKeys, practice);
  _onCheckPracticeNote(midi);
}

export function noteOff(midi) {
  const el = activeKeys.get(midi);
  if (!el) return;

  if (sustainActive) {
    sustainedKeys.add(midi);
    el.classList.add('pedal-held');
    return;
  }

  el.classList.remove('active', 'pedal-held');
  el.style.removeProperty('--key-color');
  activeKeys.delete(midi);

  if (activeKeys.size === 0) {
    document.getElementById('note-name').textContent      = '--';
    document.getElementById('velocity-label').textContent = 'vel: --';
    document.getElementById('freq-label').textContent     = '';
  }

  renderStaff(activeKeys, practice);
  if (practice.active && !practice.sequential) _onEvaluatePracticeChord();
}

// ── Sustain pedal ─────────────────────────────────────────────────────────────

export function setSustain(on) {
  sustainActive = on;
  updateSustainIndicator();
  if (!on) {
    const toRelease = [...sustainedKeys];
    sustainedKeys.clear();
    for (const midi of toRelease) {
      const el = activeKeys.get(midi);
      if (!el) continue;
      el.classList.remove('active', 'pedal-held');
      el.style.removeProperty('--key-color');
      activeKeys.delete(midi);
    }
    if (activeKeys.size === 0) {
      document.getElementById('note-name').textContent      = '--';
      document.getElementById('velocity-label').textContent = 'vel: --';
      document.getElementById('freq-label').textContent     = '';
    }
    renderStaff(activeKeys, practice);
  }
}

function updateSustainIndicator() {
  document.getElementById('sustain-indicator')
    ?.classList.toggle('active', sustainActive);
}

// ── MIDI device access ────────────────────────────────────────────────────────

export async function initMIDI() {
  const statusDot   = document.getElementById('status-dot');
  const statusLabel = document.getElementById('status-label');

  let access;
  try {
    access = await navigator.requestMIDIAccess({ sysex: false });
  } catch (err) {
    statusLabel.textContent = `MIDI Error: ${err.message}`;
    return;
  }

  const attachedInputs = new Set();

  function attachInput(input) {
    if (attachedInputs.has(input.id)) return;
    attachedInputs.add(input.id);
    input.onmidimessage = (event) => {
      const [status, note, velocity] = event.data;
      const command = status & 0xF0;
      if (command === 0x90) { trackHardwareNote(note); noteOn(note, velocity); }
      if (command === 0x80) noteOff(note);
      if (command === 0xB0 && note === 64) setSustain(velocity >= 64);
    };
  }

  function scanInputs() {
    for (const id of attachedInputs) {
      if (!access.inputs.has(id)) attachedInputs.delete(id);
    }
    const inputs = [...access.inputs.values()];
    if (inputs.length > 0) {
      inputs.forEach(attachInput);
      statusDot.className     = 'dot connected';
      statusLabel.textContent = inputs.length === 1 ? inputs[0].name : `${inputs.length} devices`;
    } else {
      statusDot.className     = 'dot disconnected';
      statusLabel.textContent = 'No MIDI device';
    }
  }

  scanInputs();
  access.onstatechange = () => scanInputs();
}
