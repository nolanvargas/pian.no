// ── Bootstrap ─────────────────────────────────────────────────────────────────
// Imports all modules and wires cross-cutting callbacks. No logic lives here.

import { initConfig }                                    from './modules/config.js';
import { buildStaff, rebuildStaff }                     from './modules/staff.js';
import {
  scaleKeyboard, applyKeyFilter, applyRootHighlight,
  getMouseHeldMidi, clearMouseHeld, initComputerKeyboard,
}                                                        from './modules/keyboard.js';
import {
  activeKeys, noteOn, noteOff,
  initMIDI, initMIDICallbacks,
}                                                        from './modules/midi.js';
import { practice }                                      from './modules/practiceCore.js';
import {
  checkPracticeNote, evaluatePracticeChord, initPracticeControls,
  resetPracticeSession,
}                                                        from './modules/practiceFlow.js';
import { initTabs }                                      from './modules/tabs.js';
import { initKeyDropdown }                               from './modules/keyDropdown.js';

document.addEventListener('DOMContentLoaded', () => {
  // Callbacks that cross the midi ↔ practice boundary
  initMIDICallbacks({
    onCheckPracticeNote:     (midi) => checkPracticeNote(midi),
    onEvaluatePracticeChord: ()     => evaluatePracticeChord(),
  });

  // Callbacks that cross the config ↔ staff/keyboard boundary
  initConfig({
    onRebuildStaff:       () => rebuildStaff(activeKeys, practice),
    onApplyKeyFilter:     () => applyKeyFilter(),
    onApplyRootHighlight: () => applyRootHighlight(localStorage.getItem('cfg-key') ?? 'random'),
  });

  const keyboardCallbacks = {
    onNoteOn:  (midi, vel) => noteOn(midi, vel),
    onNoteOff: (midi)      => noteOff(midi),
  };

  buildStaff();
  scaleKeyboard(keyboardCallbacks);
  initComputerKeyboard(keyboardCallbacks);
  initPracticeControls();
  initKeyDropdown();
  applyKeyFilter();
  initTabs({ onTabChange: () => resetPracticeSession() });
  initMIDI();

  document.addEventListener('mouseup', () => {
    const held = getMouseHeldMidi();
    if (held !== null) {
      noteOff(held);
      clearMouseHeld();
    }
  });
});
