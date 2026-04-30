// ── Tails: live history visualizer ────────────────────────────────────────────
// Records note-on/off events and draws falling-bar history above the piano.
// Bars emerge at the canvas bottom (flush with the keyboard top) and travel
// upward; their height grows while a key is held, fixes on release, and the
// whole bar drifts up until it scrolls off the top.

import { isBlack } from './constants.js';

const WINDOW_SECONDS = 6;
const PX_PER_SEC     = 90;

const events     = [];          // { midi, t0, t1|null, velocity }
const heldByMidi = new Map();   // midi → reference to its held event
const keyMap     = new Map();   // midi → { x, w, black }

let canvas = null;
let ctx    = null;
let rafId  = null;
let active = false;

// ── Public API ───────────────────────────────────────────────────────────────

export function initTails() {
  canvas = document.getElementById('tails-canvas');
  if (!canvas) return;
  ctx = canvas.getContext('2d');
  recomputeKeyMap();
  // Track tab-main resizing so the canvas backing store stays in sync.
  const ro = new ResizeObserver(() => resizeCanvas());
  ro.observe(canvas);
  resizeCanvas();
}

export function recordNoteOn(midi, velocity) {
  // If a previous note for this midi is still held (shouldn't normally happen
  // because activeKeys dedupes), close it out first.
  const prev = heldByMidi.get(midi);
  if (prev && prev.t1 === null) prev.t1 = nowSec();
  // Cheap GC so events don't pile up while the tab is inactive.
  pruneExpired(nowSec());
  const ev = { midi, t0: nowSec(), t1: null, velocity };
  events.push(ev);
  heldByMidi.set(midi, ev);
}

export function recordNoteOff(midi) {
  const ev = heldByMidi.get(midi);
  if (!ev || ev.t1 !== null) return;
  ev.t1 = nowSec();
  heldByMidi.delete(midi);
}

export function setActive(on) {
  active = !!on;
  if (active) {
    if (rafId === null) rafId = requestAnimationFrame(tick);
  } else if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

export function recomputeKeyMap() {
  keyMap.clear();
  if (!canvas) return;
  const canvasRect = canvas.getBoundingClientRect();
  const keys = document.querySelectorAll('#piano [data-midi]');
  for (const el of keys) {
    const midi = +el.dataset.midi;
    const r    = el.getBoundingClientRect();
    keyMap.set(midi, {
      x:     r.left - canvasRect.left,
      w:     r.width,
      black: isBlack(midi),
    });
  }
}

// ── Internals ────────────────────────────────────────────────────────────────

function nowSec() { return performance.now() / 1000; }

function pruneExpired(tNow) {
  const cutoff = tNow - WINDOW_SECONDS;
  let write = 0;
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (e.t1 !== null && e.t1 < cutoff) continue;
    events[write++] = e;
  }
  events.length = write;
}

function resizeCanvas() {
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const w   = canvas.clientWidth;
  const h   = canvas.clientHeight;
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width  = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // Key x-positions are in canvas-css pixels; rebuild on size change so the
  // canvas's left-edge offset against the piano stays accurate.
  recomputeKeyMap();
}

function tick() {
  rafId = active ? requestAnimationFrame(tick) : null;
  if (!ctx || !canvas) return;

  const tNow = nowSec();
  pruneExpired(tNow);

  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  ctx.clearRect(0, 0, cssW, cssH);

  for (const e of events) {
    const km = keyMap.get(e.midi);
    if (!km) continue;

    let bottomY, topY;
    if (e.t1 === null) {
      bottomY = cssH;
      topY    = cssH - (tNow - e.t0) * PX_PER_SEC;
    } else {
      const ageRel = tNow - e.t1;
      bottomY = cssH - ageRel * PX_PER_SEC;
      topY    = bottomY - (e.t1 - e.t0) * PX_PER_SEC;
    }

    if (bottomY <= 0) continue;
    if (topY < 0) topY = 0;
    const h = Math.max(1, bottomY - topY);

    ctx.fillStyle = barColor(e.velocity, km.black);
    // Slightly inset black-key bars to mirror the narrower black-key column.
    ctx.fillRect(km.x + 0.5, topY, Math.max(1, km.w - 1), h);
  }
}

function barColor(velocity, black) {
  const b = Math.round(40 + (velocity / 127) * 215);
  return black
    ? `rgb(0, ${b - 20}, ${Math.round(b * 0.4)})`
    : `rgb(${Math.round(b * 0.25)}, ${b}, ${Math.round(b * 0.45)})`;
}
