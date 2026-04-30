// ── SVG music staff rendering ─────────────────────────────────────────────────
// renderStaff(activeKeys, practiceContext) is the main entry point.
// practiceContext = { pattern, key, active, sequential, seqIndex } | null

import { CFG, config } from './config.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Diatonic step offset within octave (0=C…6=B) — sharp and flat spellings
const DIATONIC      = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const DIATONIC_FLAT = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6];
// Accidental symbol for each semitone (null = natural diatonic note)
const SHARP    = [null, '♯', null, '♯', null, null, '♯', null, '♯', null, '♯', null];
const FLAT_ACC = [null, '♭', null, '♭', null, null, '♭', null, '♭', null, '♭', null];

// Pitch classes covered by sharps/flats in key-sig order: F C G D A E B / Bb Eb Ab Db Gb Cb Fb
const SHARP_PCS = [6, 1, 8, 3, 10, 5, 0];
const FLAT_PCS  = [10, 3, 8, 1, 6, 11, 4];

// Rendering cache: midi → { ledgers[], ellipse, accidental }
const staffDisplayed = new Map();

// ── SVG helpers ───────────────────────────────────────────────────────────────

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

// Returns '#' for sharp keys, 'b' for flat keys, null for C/random.
function getKeyType() {
  const val = document.getElementById('key-select')?.value;
  const sig = val && KEY_SIGS[val];
  return sig ? sig.type : null;
}

// Steps above middle C (C4 = 0). Treble lines: 2,4,6,8,10. Bass lines: -2,-4,-6,-8,-10.
function midiToStep(midi) {
  return (Math.floor(midi / 12) - 5) * 7 + DIATONIC[midi % 12];
}

// midiToStep using the correct enharmonic spelling for the current key.
function midiToStepCtx(midi) {
  const d = getKeyType() === 'b' ? DIATONIC_FLAT : DIATONIC;
  return (Math.floor(midi / 12) - 5) * 7 + d[midi % 12];
}

// Accidental symbol (♯/♭/null) for the current key.
function accidentalForMidi(midi) {
  return getKeyType() === 'b' ? FLAT_ACC[midi % 12] : SHARP[midi % 12];
}

function isInKeySig(midi, key) {
  const sig = KEY_SIGS[key];
  if (!sig) return false;
  const pcs = sig.type === '#' ? SHARP_PCS : FLAT_PCS;
  return pcs.slice(0, sig.count).includes(midi % 12);
}

// True when midi is a natural note whose altered counterpart is in the key signature.
function needsNatural(midi, key) {
  const sig = KEY_SIGS[key];
  if (!sig) return false;
  if (accidentalForMidi(midi) !== null) return false;
  const semitone = midi % 12;
  const pcs = sig.type === '#' ? SHARP_PCS : FLAT_PCS;
  const alt = sig.type === '#' ? (semitone + 1) % 12 : ((semitone - 1) + 12) % 12;
  return pcs.slice(0, sig.count).includes(alt);
}

// Diatonic step values where ledger lines should be drawn for a given note step.
function ledgerSteps(step) {
  const out = [];
  if (step >= -1 && step <= 1) out.push(0);          // middle C ledger line
  if (step > 10) {
    const hi = step % 2 === 0 ? step : step - 1;
    for (let s = 12; s <= hi; s += 2) out.push(s);   // above treble
  }
  if (step < -10) {
    const lo = step % 2 === 0 ? step : step + 1;
    for (let s = -12; s >= lo; s -= 2) out.push(s);  // below bass
  }
  return out;
}

// Map: midi → xOffset (px, relative to CFG.noteX). Within a run of adjacent
// notes (each one diatonic step apart), sides alternate so no two seconds
// collide. Lowest note of the run sits on the left (displaced) side — this
// satisfies the engraving rules for up-stems at any length, and for even-count
// down-stems. (Odd-count down-stems would flip; not handled here.)
function computeXOffsets(midiList) {
  const offset  = CFG.noteRx * 2 - 2;
  const entries = midiList.map(midi => ({ midi, step: midiToStepCtx(midi) }));
  entries.sort((a, b) => a.step - b.step);
  const result = new Map(entries.map(({ midi }) => [midi, 0]));

  let i = 0;
  while (i < entries.length) {
    let j = i;
    while (j + 1 < entries.length && entries[j + 1].step - entries[j].step === 1) j++;
    if (j > i) {
      for (let k = i; k <= j; k++) {
        result.set(entries[k].midi, (k - i) % 2 === 0 ? -offset : 0);
      }
    }
    i = j + 1;
  }
  return result;
}

// Draw one stem for a clef group. notes = [{step, nx, cy, color}], all same clef.
function drawGroupStem(ng, notes) {
  if (!notes.length) return;
  notes.sort((a, b) => a.step - b.step);
  const lo = notes[0], hi = notes[notes.length - 1];
  const ref     = lo.step >= 0 ? 6 : -6;
  const dir     = (hi.step - ref) >= (ref - lo.step) ? 'down' : 'up';
  const stemLen = 7 * CFG.sStep;
  let x, y1, y2, color;
  const maxNx = Math.max(...notes.map(n => n.nx));
  const minNx = Math.min(...notes.map(n => n.nx));
  const split = maxNx !== minNx;
  if (dir === 'up') {
    x  = split ? maxNx - CFG.noteRx : lo.nx + CFG.noteRx;
    y1 = lo.cy;
    y2 = hi.cy - stemLen;
    if (lo.step < -10) y2 = Math.min(y2, CFG.sCtr + 6 * CFG.sStep);
    color = lo.color;
  } else {
    x  = split ? minNx + CFG.noteRx : hi.nx - CFG.noteRx;
    y1 = hi.cy;
    y2 = lo.cy + stemLen;
    if (hi.step > 10) y2 = Math.max(y2, CFG.sCtr - 6 * CFG.sStep);
    color = hi.color;
  }
  ng.appendChild(svgEl('line', { x1: x, x2: x, y1, y2, stroke: color, 'stroke-width': 1.5 }));
}

// Filled (quarter) or open (half) note head. Open heads use a thicker stroke
// and a small rotation for the classical tilted-oval look.
let halfNoteMaskId = 0;

function makeNoteHead(cx, cy, color, half) {
  if (!half) {
    return svgEl('ellipse', {
      cx, cy, rx: CFG.noteRx, ry: CFG.noteRy, fill: color,
      transform: `rotate(-30 ${cx} ${cy})`,
    });
  }
  const g       = svgEl('g', {});
  const maskId  = `half-cut-${++halfNoteMaskId}`;
  const defs    = svgEl('defs', {});
  const mask    = svgEl('mask', { id: maskId });
  mask.appendChild(svgEl('rect', { x: cx - CFG.noteRx * 2, y: cy - CFG.noteRy * 2, width: CFG.noteRx * 4, height: CFG.noteRy * 4, fill: 'white' }));
  mask.appendChild(svgEl('ellipse', { cx, cy, rx: CFG.noteRx, ry: CFG.noteRy * 0.57, fill: 'black' }));
  defs.appendChild(mask);
  g.appendChild(defs);
  g.appendChild(svgEl('ellipse', {
    cx, cy, rx: CFG.noteRx, ry: CFG.noteRy,
    fill: color, mask: `url(#${maskId})`,
    transform: `rotate(-30 ${cx} ${cy})`,
  }));
  g.appendChild(svgEl('ellipse', {
    cx, cy, rx: CFG.noteRx, ry: CFG.noteRy,
    fill: 'none', stroke: color, 'stroke-width': 1.5,
    transform: `rotate(-30 ${cx} ${cy})`,
  }));
  return g;
}

// Pattern entries may be a bare midi number or { midi, half }.
function normalizePatternEntry(entry) {
  return typeof entry === 'number' ? { midi: entry, half: false }
                                   : { midi: entry.midi, half: !!entry.half };
}

function drawChordStems(ng, noteData) {
  drawGroupStem(ng, noteData.filter(n => n.step >= 0));
  drawGroupStem(ng, noteData.filter(n => n.step < 0));
}

// ── Key signature data (needed by renderKeySignature) ─────────────────────────
// Also exported for use by staff rendering helpers in other modules.
export const KEY_SIGS = {
  G:  { type: '#', count: 1 }, D:  { type: '#', count: 2 },
  A:  { type: '#', count: 3 }, E:  { type: '#', count: 4 },
  B:  { type: '#', count: 5 }, 'F#': { type: '#', count: 6 },
  F:  { type: 'b', count: 1 }, Bb: { type: 'b', count: 2 },
  Eb: { type: 'b', count: 3 }, Ab: { type: 'b', count: 4 },
  Db: { type: 'b', count: 5 },
};

// Diatonic steps for each accidental in order, treble then bass
export const SHARP_STEPS_TREBLE = [10, 7, 4, 8, 5, 9, 6];
export const SHARP_STEPS_BASS   = [-4, -7, -3, -6, -2, -5, -1];
export const FLAT_STEPS_TREBLE  = [6, 9, 5, 8, 4, 7, 10];
export const FLAT_STEPS_BASS    = [-1, -5, -2, -6, -3, -7, -4];

// ── Public API ────────────────────────────────────────────────────────────────

export function buildStaff() {
  const svg = document.getElementById('staff-svg');

  for (let s = 2; s <= 10; s += 2)
    svg.appendChild(svgEl('line', { x1: CFG.staffX1, x2: CFG.staffX2, y1: CFG.sCtr - s * CFG.sStep, y2: CFG.sCtr - s * CFG.sStep, stroke: '#000', 'stroke-width': 1 }));

  for (let s = -2; s >= -10; s -= 2)
    svg.appendChild(svgEl('line', { x1: CFG.staffX1, x2: CFG.staffX2, y1: CFG.sCtr - s * CFG.sStep, y2: CFG.sCtr - s * CFG.sStep, stroke: '#000', 'stroke-width': 1 }));

  const tc = svgEl('text', { x: CFG.trebleX, y: CFG.sCtr - CFG.trebleYSteps * CFG.sStep, fill: '#000', 'font-size': CFG.trebleSize, 'font-family': 'serif' });
  tc.textContent = '\uD834\uDD1E'; // 𝄞
  svg.appendChild(tc);

  const bc = svgEl('text', { x: CFG.bassX, y: CFG.sCtr + CFG.bassYSteps * CFG.sStep, fill: '#000', 'font-size': CFG.bassSize, 'font-family': 'serif' });
  bc.textContent = '\uD834\uDD22'; // 𝄢
  svg.appendChild(bc);

  svg.appendChild(svgEl('g', { id: 'staff-notes' }));
}

export function rebuildStaff(activeKeys, practiceContext) {
  const svg = document.getElementById('staff-svg');
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  staffDisplayed.clear();
  buildStaff();
  renderStaff(activeKeys, practiceContext);
}

export function renderKeySignature(ng, key) {
  const sig = KEY_SIGS[key];
  if (!sig) return;
  const stepsT = sig.type === '#' ? SHARP_STEPS_TREBLE : FLAT_STEPS_TREBLE;
  const stepsB = sig.type === '#' ? SHARP_STEPS_BASS   : FLAT_STEPS_BASS;
  const symbol = sig.type === '#' ? '♯' : '♭';
  const fontSize = sig.type === '#' ? CFG.keySigSizeSharp : CFG.keySigSizeFlat;
  for (let i = 0; i < sig.count; i++) {
    const x = CFG.keySigX + i * CFG.keySigSpacing;
    const makeAcc = (step) => {
      const t = svgEl('text', { x, y: CFG.sCtr - step * CFG.sStep + 7, fill: '#000', 'font-size': fontSize, 'text-anchor': 'middle', 'font-family': 'serif' });
      t.textContent = symbol;
      return t;
    };
    ng.appendChild(makeAcc(stepsT[i]));
    ng.appendChild(makeAcc(stepsB[i]));
  }
}

// Main render entry point. practiceContext is null when in free-play mode.
export function renderStaff(activeKeys, practiceContext) {
  const ng = document.getElementById('staff-notes');

  if (practiceContext && practiceContext.pattern.length > 0) {
    while (ng.firstChild) ng.removeChild(ng.firstChild);
    staffDisplayed.clear();
    renderPracticeStaff(ng, activeKeys, practiceContext);
    return;
  }

  // Free-play mode: full redraw so adjacent-note offsets stay correct.
  while (ng.firstChild) ng.removeChild(ng.firstChild);
  staffDisplayed.clear();
  renderKeySignature(ng, document.getElementById('key-select').value);
  const xOffsets = computeXOffsets([...activeKeys.keys()]);

  const noteData = [...activeKeys.keys()].map(midi => {
    const step = midiToStepCtx(midi);
    return { step, nx: CFG.noteX + (xOffsets.get(midi) ?? 0), cy: CFG.sCtr - step * CFG.sStep, color: '#000' };
  });
  drawChordStems(ng, noteData);

  for (const [midi] of activeKeys) {
    addNoteToStaff(ng, midi, xOffsets.get(midi) ?? 0);
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function addNoteToStaff(ng, midi, xOff = 0) {
  const step  = midiToStepCtx(midi);
  const cy    = CFG.sCtr - step * CFG.sStep;
  const nx    = CFG.noteX + xOff;
  const entry = { ledgers: [], ellipse: null, accidental: null };
  for (const ls of ledgerSteps(step)) {
    const line = svgEl('line', {
      x1: nx - CFG.noteRx - 4, x2: nx + CFG.noteRx + 4,
      y1: CFG.sCtr - ls * CFG.sStep, y2: CFG.sCtr - ls * CFG.sStep,
      stroke: '#000', 'stroke-width': 1.5,
    });
    ng.appendChild(line);
    entry.ledgers.push(line);
  }
  entry.ellipse = makeNoteHead(nx, cy, '#000', false);
  ng.appendChild(entry.ellipse);
  const acc         = accidentalForMidi(midi);
  const selectedKey = document.getElementById('key-select')?.value ?? 'random';
  const symbol = (config.showAccidentals && acc && !isInKeySig(midi, selectedKey)) ? acc
               : (config.showAccidentals && needsNatural(midi, selectedKey))       ? '♮'
               : null;
  if (symbol) {
    const sz = symbol === '♭' ? CFG.keySigSizeFlat : CFG.keySigSizeSharp;
    entry.accidental = svgEl('text', { x: nx - CFG.noteRx - 18, y: cy + 4, fill: '#000', 'font-size': sz, 'text-anchor': 'middle' });
    entry.accidental.textContent = symbol;
    ng.appendChild(entry.accidental);
  }
  staffDisplayed.set(midi, entry);
}

function renderPracticeStaff(ng, activeKeys, ctx) {
  renderKeySignature(ng, ctx.key);

  const rawPattern = ctx.sequential
    ? (ctx.pattern[ctx.seqIndex] !== undefined ? [ctx.pattern[ctx.seqIndex]] : [])
    : ctx.pattern;
  const displayPattern = rawPattern.map(normalizePatternEntry);
  const patternMidis   = displayPattern.map(e => e.midi);
  const xOffsets = computeXOffsets(patternMidis);

  const patternData = displayPattern.map(({ midi, half }) => {
    const step = midiToStepCtx(midi);
    return { midi, half: half || !!ctx.half, step, nx: CFG.noteX + (xOffsets.get(midi) ?? 0), cy: CFG.sCtr - step * CFG.sStep, color: activeKeys.has(midi) ? '#22c55e' : '#000' };
  });

  drawChordStems(ng, patternData);

  for (const { midi, step: s, nx, cy, color, half } of patternData) {
    for (const ls of ledgerSteps(s)) {
      ng.appendChild(svgEl('line', {
        x1: nx - CFG.noteRx - 4, x2: nx + CFG.noteRx + 4,
        y1: CFG.sCtr - ls * CFG.sStep, y2: CFG.sCtr - ls * CFG.sStep,
        stroke: '#000', 'stroke-width': 1.5,
      }));
    }
    ng.appendChild(makeNoteHead(nx, cy, color, half));
    const acc = accidentalForMidi(midi);
    const sym = (config.showAccidentals && acc && !isInKeySig(midi, ctx.key)) ? acc
              : (config.showAccidentals && needsNatural(midi, ctx.key))       ? '♮'
              : null;
    if (sym) {
      const sz = sym === '♭' ? CFG.keySigSizeFlat : CFG.keySigSizeSharp;
      const t = svgEl('text', { x: nx - CFG.noteRx - 18, y: cy + 4, fill: color, 'font-size': sz, 'text-anchor': 'middle' });
      t.textContent = sym;
      ng.appendChild(t);
    }
  }

  // Wrong notes: active keys not in pattern (hidden in sequential/scale-run mode)
  if (ctx.active && !ctx.sequential) {
    const wrongData = [];
    for (const [midi] of activeKeys) {
      if (patternMidis.includes(midi)) continue;
      const step = midiToStepCtx(midi);
      wrongData.push({ midi, step, nx: CFG.noteX, cy: CFG.sCtr - step * CFG.sStep, color: '#ef4444' });
    }
    drawChordStems(ng, wrongData);
    for (const { midi, step: s, nx, cy, color } of wrongData) {
      for (const ls of ledgerSteps(s)) {
        ng.appendChild(svgEl('line', {
          x1: nx - CFG.noteRx - 4, x2: nx + CFG.noteRx + 4,
          y1: CFG.sCtr - ls * CFG.sStep, y2: CFG.sCtr - ls * CFG.sStep,
          stroke: '#000', 'stroke-width': 1.5,
        }));
      }
      ng.appendChild(makeNoteHead(nx, cy, color, false));
      const acc = accidentalForMidi(midi);
      const sym = (config.showAccidentals && acc && !isInKeySig(midi, ctx.key)) ? acc
                : (config.showAccidentals && needsNatural(midi, ctx.key))       ? '♮'
                : null;
      if (sym) {
        const sz = sym === '♭' ? CFG.keySigSizeFlat : CFG.keySigSizeSharp;
        const t = svgEl('text', { x: nx - CFG.noteRx - 18, y: cy + 4, fill: color, 'font-size': sz, 'text-anchor': 'middle' });
        t.textContent = sym;
        ng.appendChild(t);
      }
    }
  }
}
