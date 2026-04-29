// ── Bootstrap ─────────────────────────────────────────────────────────────────
// Imports all modules and wires cross-cutting callbacks. No logic lives here.

import { initConfig }                                    from './modules/config.js';
import { buildStaff, rebuildStaff }                     from './modules/staff.js';
import {
  scaleKeyboard, applyKeyFilter,
  getMouseHeldMidi, clearMouseHeld,
}                                                        from './modules/keyboard.js';
import {
  activeKeys, noteOn, noteOff,
  initMIDI, initMIDICallbacks,
}                                                        from './modules/midi.js';
import { practice }                                      from './modules/practiceCore.js';
import {
  checkPracticeNote, evaluatePracticeChord, initPracticePanel,
}                                                        from './modules/practiceFlow.js';
import { renderAnalytics }                               from './modules/analytics.js';
import { initResizer, syncHeights }                      from './modules/resizer.js';

document.addEventListener('DOMContentLoaded', () => {
  // Callbacks that cross the midi ↔ practice boundary
  initMIDICallbacks({
    onCheckPracticeNote:     (midi) => checkPracticeNote(midi),
    onEvaluatePracticeChord: ()     => evaluatePracticeChord(),
  });

  // Callbacks that cross the config ↔ staff/keyboard boundary
  initConfig({
    onRebuildStaff:   () => rebuildStaff(activeKeys, practice),
    onApplyKeyFilter: () => applyKeyFilter(),
  });

  const keyboardCallbacks = {
    onNoteOn:  (midi, vel) => noteOn(midi, vel),
    onNoteOff: (midi)      => noteOff(midi),
  };

  buildStaff();
  initMIDI();
  initPracticePanel();
  applyKeyFilter();
  scaleKeyboard(keyboardCallbacks);
  initResizer();

  // Re-scale keyboard and sync all panel heights when the window width changes.
  // Guard by tracking last width so height-only changes (from syncHeights itself)
  // don't re-trigger scaleKeyboard in an infinite loop.
  let lastPianoW = 0;
  new ResizeObserver((entries) => {
    const w = Math.round(entries[0].contentRect.width);
    if (w === lastPianoW) return;
    lastPianoW = w;
    activeKeys.clear();
    scaleKeyboard(keyboardCallbacks);
    syncHeights();
  }).observe(document.getElementById('piano-container'));

  // Re-sync panel heights when the window height changes.
  let lastContainerH = 0;
  new ResizeObserver((entries) => {
    const h = Math.round(entries[0].contentRect.height);
    if (h === lastContainerH) return;
    lastContainerH = h;
    syncHeights();
  }).observe(document.getElementById('resize-container'));

  if (practice.completionHistory.length > 0) {
    document.getElementById('practice-content').removeAttribute('hidden');
    renderAnalytics();
    syncHeights();
  }

  document.addEventListener('mouseup', () => {
    const held = getMouseHeldMidi();
    if (held !== null) {
      noteOff(held);
      clearMouseHeld();
    }
  });
});
