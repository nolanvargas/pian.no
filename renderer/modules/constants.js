// ── Pure constants and stateless utility functions ────────────────────────────
// No DOM access, no imports. Safe to import from any module.

export const MIDI_MIN = 21;   // A0
export const MIDI_MAX = 108;  // C8
export const WHITE_KEY_COUNT = 52; // A0..C8

export const NOTE_NAMES      = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const BLACK_SEMITONES = new Set([1, 3, 6, 8, 10]);

export const KEY_ROOTS = {
  C: 48, G: 43, D: 50, A: 45, E: 52, B: 47,
  'F#': 54, F: 53, Bb: 46, Eb: 51, Ab: 56, Db: 49,
};
export const ALL_KEY_NAMES = Object.keys(KEY_ROOTS);

export const MAJOR_INTERVALS      = [0, 2, 4, 5, 7, 9, 11];
export const PENTATONIC_INTERVALS = [0, 2, 4, 7, 9];
export const TRIAD_MAJOR  = [0, 4, 7];
export const TRIAD_MINOR  = [0, 3, 7];
export const SHELL_MAJ7   = [0, 11];
export const SHELL_DOM7   = [0, 10];
export const MAX_SPAN     = 14; // octave + 2 semitones — max comfortable hand stretch
export const TREBLE_SPLIT = 60; // C4 — split point for two-handed generation

// Base key proportions — scaleKeyboard() derives actual pixel values from these
export const KEY_BASE = { whiteW: 24, blackW: 14, keyH: 160, blackH: 100 };

export function isBlack(midi) {
  return BLACK_SEMITONES.has(midi % 12);
}

export function getNoteName(midi) {
  const octave = Math.floor(midi / 12) - 1;
  return NOTE_NAMES[midi % 12] + octave;
}

export function midiToHz(midi) {
  return (440 * Math.pow(2, (midi - 69) / 12)).toFixed(1);
}
