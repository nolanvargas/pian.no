// ── Practice state and pattern generation ────────────────────────────────────
// Pure practice logic: no DOM access, no imports beyond constants.

import {
  MIDI_MIN, MIDI_MAX, ALL_KEY_NAMES, KEY_ROOTS,
  MAJOR_INTERVALS, PENTATONIC_INTERVALS,
  SHELL_MAJ7, SHELL_DOM7, MAX_SPAN, TREBLE_SPLIT,
} from './constants.js';

// ── Shared practice state ─────────────────────────────────────────────────────

export const practice = {
  active:           false,
  pattern:          [],
  played:           new Set(),
  key:              'random',
  sequential:       false,  // scale-run mode: notes played one at a time in order
  seqIndex:         0,
  totalCorrect:     0,
  totalAttempts:    0,
  feedbackTimer:    null,
  startTime:        null,
  timerInterval:    null,
  completionHistory: JSON.parse(localStorage.getItem('completionHistory') || '[]'),
  viewingScaleMode: false,
  scale_strict:     false,
};

// ── Edge bias coefficient ─────────────────────────────────────────────────────
// 0 = uniform, positive = edge preference, negative = center preference.
let edgeBias = parseFloat(localStorage.getItem('cfg-edge-bias') ?? '0');
export function setEdgeBias(v) { edgeBias = v; }

// ── Helpers ───────────────────────────────────────────────────────────────────

export function resolveKey(keyName) {
  return keyName === 'random'
    ? ALL_KEY_NAMES[Math.floor(Math.random() * ALL_KEY_NAMES.length)]
    : keyName;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Weighted pick: edgeBias=0 → uniform; >0 → edges preferred; <0 → center preferred.
function pickWithBias(arr) {
  if (arr.length === 1) return arr[0];
  if (edgeBias === 0) return arr[Math.floor(Math.random() * arr.length)];
  const mid = (arr.length - 1) / 2;
  const weights = arr.map((_, i) => {
    const dist = mid > 0 ? Math.abs(i - mid) / mid : 0; // 0 at center, 1 at edges
    return Math.pow(dist + 0.1, edgeBias);
  });
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= weights[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

export function getKeyNotes(keyName, intervals = MAJOR_INTERVALS) {
  const notes = new Set();
  for (let oct = -48; oct <= 48; oct += 12) {
    for (const i of intervals) {
      const m = KEY_ROOTS[keyName] + oct + i;
      if (m >= MIDI_MIN && m <= MIDI_MAX) notes.add(m);
    }
  }
  return [...notes].sort((a, b) => a - b);
}

// ── Pattern generators ────────────────────────────────────────────────────────

export function generateRandom(keyName, minKey, maxKey, noteCount) {
  let pool;
  if (keyName === 'random') {
    pool = [];
    for (let m = minKey; m <= maxKey; m++) pool.push(m);
  } else {
    pool = getKeyNotes(keyName).filter(m => m >= minKey && m <= maxKey);
    if (!pool.length) pool = getKeyNotes(keyName);
  }
  const anchor  = pickWithBias(pool);
  const bounded = pool.filter(m => m >= anchor && m <= anchor + MAX_SPAN);
  const shuffled = [...bounded];
  const pattern  = [];
  const pickCount = Math.min(noteCount, shuffled.length);
  for (let i = 0; i < pickCount; i++) {
    const j = i + Math.floor(Math.random() * (shuffled.length - i));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    pattern.push(shuffled[i]);
  }
  while (pattern.length < noteCount) pattern.push(pickRandom(bounded));
  return pattern;
}

export function generateTriad(keyName, minKey, maxKey) {
  const key         = resolveKey(keyName);
  const allKeyNotes = getKeyNotes(key);
  const eligible    = allKeyNotes.filter((root, i) => {
    const third = allKeyNotes[i + 2];
    const fifth  = allKeyNotes[i + 4];
    return third !== undefined && fifth !== undefined &&
      root >= minKey && third >= minKey && fifth >= minKey &&
      root <= maxKey && third <= maxKey && fifth <= maxKey;
  });
  if (!eligible.length) return generateRandom(keyName, minKey, maxKey, 3);
  const root = pickWithBias(eligible);
  const i    = allKeyNotes.indexOf(root);
  return [root, allKeyNotes[i + 2], allKeyNotes[i + 4]];
}

export function generateScaleFragment(keyName, minKey, maxKey, noteCount) {
  const key  = resolveKey(keyName);
  const pool = getKeyNotes(key).filter(m => m >= minKey && m <= maxKey);
  if (pool.length < 2) return generateRandom(keyName, minKey, maxKey, noteCount);
  const count    = Math.max(2, Math.min(noteCount, 5, pool.length));
  const maxStart = pool.length - count;
  const start    = pickWithBias(Array.from({ length: maxStart + 1 }, (_, i) => i));
  const fragment = pool.slice(start, start + count);
  if (Math.random() < 0.5) fragment.reverse();
  return fragment;
}

export function generateArpeggio(keyName, minKey, maxKey, noteCount) {
  const key         = resolveKey(keyName);
  const allKeyNotes = getKeyNotes(key);
  const eligible    = allKeyNotes.filter((root, i) => {
    const third  = allKeyNotes[i + 2];
    const fifth  = allKeyNotes[i + 4];
    const octave = root + 12;
    return third !== undefined && fifth !== undefined &&
      root >= minKey && third >= minKey && fifth >= minKey && octave >= minKey &&
      root <= maxKey && third <= maxKey && fifth <= maxKey && octave <= maxKey;
  });
  if (!eligible.length) return generateTriad(keyName, minKey, maxKey);
  const root = pickWithBias(eligible);
  const i    = allKeyNotes.indexOf(root);
  return [root, allKeyNotes[i + 2], allKeyNotes[i + 4], root + 12].slice(0, Math.min(noteCount, 4));
}

export function generateInterval(keyName, minKey, maxKey) {
  const key  = resolveKey(keyName);
  let pool   = getKeyNotes(key).filter(m => m >= minKey && m <= maxKey);
  if (!pool.length) pool = getKeyNotes(key);
  const keySet    = new Set(pool);
  const lower     = pickWithBias(pool);
  const intervals = [3, 4, 5, 7, 8, 9, 12];
  for (const iv of intervals.sort(() => Math.random() - 0.5)) {
    if (lower + iv <= maxKey && keySet.has(lower + iv)) return [lower, lower + iv];
    if (lower - iv >= minKey && keySet.has(lower - iv)) return [lower - iv, lower];
  }
  return generateRandom(keyName, minKey, maxKey, 2);
}

export function generateShellVoicing(keyName, minKey, maxKey) {
  const key    = resolveKey(keyName);
  let pool     = getKeyNotes(key).filter(m => m >= minKey && m <= maxKey);
  if (!pool.length) pool = getKeyNotes(key);
  const keySet  = new Set(getKeyNotes(key));
  const root    = pickWithBias(pool);
  const quality = Math.random() < 0.5 ? SHELL_DOM7 : SHELL_MAJ7;
  let notes     = quality.map(o => root + o);
  if (notes.some(m => m < minKey || m > maxKey)) {
    notes = quality.map(o => root - 12 + o);
    if (notes.some(m => m < minKey || m > maxKey)) return generateInterval(keyName, minKey, maxKey);
  }
  if (keyName !== 'random' && notes.some(m => !keySet.has(m))) {
    return generateInterval(keyName, minKey, maxKey);
  }
  return notes.sort((a, b) => a - b);
}

export function generatePentatonic(keyName, minKey, maxKey, noteCount) {
  const key  = resolveKey(keyName);
  const pool = getKeyNotes(key, PENTATONIC_INTERVALS).filter(m => m >= minKey && m <= maxKey);
  if (pool.length < 2) return generateRandom(keyName, minKey, maxKey, noteCount);
  const anchor  = pickWithBias(pool);
  const bounded = pool.filter(m => m >= anchor && m <= anchor + MAX_SPAN);
  const count   = Math.max(2, Math.min(noteCount, bounded.length));
  const shuffled = [...bounded];
  const result   = [];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(Math.random() * (shuffled.length - i));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    result.push(shuffled[i]);
  }
  return result.sort((a, b) => a - b);
}

// Ascending then descending (no duplicate at the top).
export function generateScaleRun(keyName, minKey, maxKey) {
  const key = resolveKey(keyName);
  const asc = getKeyNotes(key).filter(m => m >= minKey && m <= maxKey);
  if (asc.length === 0) return [];
  const desc = [...asc].reverse().slice(1);
  return [...asc, ...desc];
}

// ── Two-handed and dispatcher ─────────────────────────────────────────────────

export function runGenerator(type, keyName, mn, mx, nc) {
  const GENS = {
    random:        () => generateRandom(keyName, mn, mx, nc),
    triad:         () => generateTriad(keyName, mn, mx),
    scalefragment: () => generateScaleFragment(keyName, mn, mx, nc),
    arpeggio:      () => generateArpeggio(keyName, mn, mx, nc),
    interval:      () => generateInterval(keyName, mn, mx),
    shell:         () => generateShellVoicing(keyName, mn, mx),
    pentatonic:    () => generatePentatonic(keyName, mn, mx, nc),
  };
  let t = type;
  if (t === 'any') {
    const choices = Object.keys(GENS).filter(k => k !== 'random');
    t = choices[Math.floor(Math.random() * choices.length)];
  }
  return (GENS[t] ?? GENS.random)();
}

export function generateTwoHanded(keyName, minKey, maxKey, noteCount, patType) {
  const trebleMin = Math.max(minKey, TREBLE_SPLIT);
  const trebleMax = Math.min(maxKey, 96);
  const bassMin   = Math.max(minKey, 36);
  const bassMax   = Math.min(maxKey, TREBLE_SPLIT - 1);
  const tCount    = Math.max(1, Math.ceil(noteCount / 2));
  const bCount    = Math.max(1, Math.floor(noteCount / 2));
  const treblePart = trebleMin <= trebleMax ? runGenerator(patType, keyName, trebleMin, trebleMax, tCount) : [];
  const bassPart   = bassMin   <= bassMax   ? runGenerator(patType, keyName, bassMin,   bassMax,   bCount) : [];
  return [...treblePart, ...bassPart].sort((a, b) => a - b);
}
