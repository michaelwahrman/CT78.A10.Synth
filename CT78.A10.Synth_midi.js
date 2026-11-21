/* CT78.A10.Synth -- MIDI, through the CT45.A1.USB standard layer (CT78.A10.Synth_lib/ct45midi.js + ct45.profiles.js); the CT55 / CT58 / CT61 / CT72 glue.
 *
 *  * NOTES: any key or pad that sends a note plays the toy's key (note on = key down, note off = key up; velocity = how hard).
 *    Notes outside C3..C5 are folded into the nearest octave that is on the toy. A control that is assigned to an action (below) is not played as a note.
 *  * Controls: defaults in CT78.A10.Synth_midimap.js (X-TOUCH MINI). Right-click any on-screen button, then press (or turn) a MIDI control to assign it;
 *    learned assignments live in this browser (localStorage) and override the file. Any device works this way.
 *  * Lights: X-TOUCH buttons light when their switch is on; encoder rings show their values.
 */
(function () {
  'use strict';
  const C = window.CT78, $ = (id) => document.getElementById(id);
  const LEARN_KEY = 'CT78.midimap.learned';
  const DEFAULTS = window.CT78_MIDIMAP || {};
  const VALUE_ACTIONS = new Set(Object.keys(C.VALUES));
  const BUTTON_TO_VALUE = { faster: 'tempo', slower: 'tempo', volUp: 'volume', volDown: 'volume', glowUp: 'glow', glowDown: 'glow', lookLeft: 'lookYaw', lookRight: 'lookYaw', lookUp: 'lookPitch', lookDown: 'lookPitch' };
  const NAMES = { play: 'Play / stop play mode', reset: 'Reset', record: 'Record', prevSong: 'Previous song', nextSong: 'Next song', faster: 'Tempo +', slower: 'Tempo −', loop: 'Loop', sound: 'Sound',
    tone: 'Tone', volUp: 'Volume +', volDown: 'Volume −', glowUp: 'Glow +', glowDown: 'Glow −', bubbles: 'Bubbles', room: 'Room light', view: 'View', lookLeft: 'Look left', lookRight: 'Look right',
    lookUp: 'Look up', lookDown: 'Look down', orbit: 'Turn', hud: 'Info', display: 'Show / hide the display', bar: 'Show / hide the buttons',
    tempo: 'Tempo (value)', volume: 'Volume (value)', glow: 'Glow (value)', lookYaw: 'Look left / right (value)', lookPitch: 'Look up / down (value)', zoom: 'Zoom (value)' };
  const COLORS = { play: '#4ff0a8', reset: '#ffffff', record: '#ff2a3a', prevSong: '#ffbf6a', nextSong: '#ffbf6a', loop: '#ffbf6a', sound: '#4ff0a8', tone: '#d5c2f5', bubbles: '#ff8aa8', room: '#ffe08a',
    view: '#7fc4ff', orbit: '#7fc4ff', hud: '#9a9a9a', glowUp: '#ff6a5a', glowDown: '#ff6a5a', faster: '#c0c0c0', slower: '#c0c0c0', volUp: '#4ff0a8', volDown: '#4ff0a8' };

  let learned = {};
  try { learned = JSON.parse(localStorage.getItem(LEARN_KEY) || '{}') || {}; } catch { learned = {}; }
  const saveLearned = () => { try { localStorage.setItem(LEARN_KEY, JSON.stringify(learned)); } catch { /* */ } };
  const mapFor = (pid) => Object.assign({}, DEFAULTS[pid] || {}, learned[pid] || {});
  const lookup = (pid, control) => { const a = mapFor(pid)[control]; return typeof a === 'string' && !control.startsWith('_') ? a : null; };

  const DEV_SHORT = { 'behringer-xtouch-mini': 'XT', 'novation-launchpad-mini-mk3': 'LP', 'novation-launchpad-mini': 'LP', 'korg-nanokey2': 'nK' };
  const NOTE = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  function ctlShort(pid, id) {
    let m;
    if ((m = /^btn([ab])(\d)$/.exec(id))) return (m[1] === 'a' ? 'top' : 'bot') + m[2];
    if ((m = /^pad\.(\d)\.(\d)$/.exec(id))) return `r${+m[1] + 1}c${+m[2] + 1}`;
    if ((m = /^key(\d+)$/.exec(id))) return NOTE[+m[1] % 12] + (+m[1] >= 12 ? (+m[1] >= 24 ? "''" : "'") : '');
    if ((m = /^enc(\d)$/.exec(id))) return 'knob' + m[1];
    return id;
  }

  const hub = new CT45.MidiHub();
  let status = hub.supported ? 'not connected' : 'Web MIDI is not available in this browser (use Chrome or Edge)';
  hub.on('connect', (d) => { d.autoRing = false; setTimeout(() => { lights(d); refresh(); C.toast(`MIDI: ${d.profile.name || d.profile.id} connected`); }, 60); });
  hub.on('disconnect', (d) => { refresh(); C.toast(`MIDI: ${d.profile.name || d.profile.id} disconnected`); });
  hub.on('status', () => refresh());

  /** the MIDI note number of an event, if it has one (keyboard keys carry it; pads of other devices keep it in their control definition) */
  function noteOf(e) {
    if (typeof e.note === 'number') return e.note;
    try { const c = e.device && e.device.control(e.control); if (c && c.in && typeof c.in.note === 'number') return c.in.note; } catch { /* */ }
    return null;
  }

  let learning = null;
  hub.on('input', (e) => {
    const d = e.device, pid = d.profile.id, ctl = e.control;
    if (learning) {                                          // assign this control to the button being learned
      const isValue = e.type === 'encoder' || e.type === 'knob' || e.type === 'fader';
      if (!isValue && e.action !== 'press') return;
      if (e.type === 'bender' || e.type === 'key') { C.toast('Keys play the toy; use a button, pad, knob or fader for this'); return; }
      let action = learning.action;
      if (isValue) action = BUTTON_TO_VALUE[action] || (VALUE_ACTIONS.has(action) ? action : null);
      if (!action) { C.toast(`"${NAMES[learning.action]}" needs a button or pad (not a knob)`); return; }
      (learned[pid] = learned[pid] || {})[ctl] = action; saveLearned();
      C.toast(`${d.profile.name || pid} · ${ctlShort(pid, ctl)} → ${NAMES[action]}`);
      endLearn(); lights(d); refresh();
      return;
    }
    const action = lookup(pid, ctl);
    if (action) {
      if (VALUE_ACTIONS.has(action)) {
        if (e.type === 'encoder' && e.delta) C.setValue(action, { delta: e.delta });
        else if (e.type === 'knob' || e.type === 'fader') C.setValue(action, { value: e.value });
        else if (e.type === 'bender') C.setValue(action, { value: (e.value + 1) / 2 });
        else if (e.action === 'press') C.setValue(action, { delta: 1 });
        return;
      }
      if (e.action === 'press') C.act(action, 'press');
      return;
    }
    const n = noteOf(e);
    if (n === null) return;
    const src = 'midi:' + d.id;
    if (e.action === 'press') C.down(n, e.velocity > 0 ? e.velocity : 0.7, src);
    else if (e.action === 'release') C.up(n, src);
  });

  async function connect() {
    if (!hub.supported) { refresh(); return; }
    status = 'asking the browser for MIDI…'; refresh();
    const r = await hub.start();
    status = r.ok ? `on${r.sysex ? ' (with sysex)' : ' (no sysex)'}` : 'refused: ' + r.error;
    refresh();
    for (const d of hub.list()) lights(d);
  }

  const dim = (hex, k) => { const n = parseInt(hex.slice(1), 16); return '#' + [16, 8, 0].map(s => Math.round(((n >> s) & 255) * k).toString(16).padStart(2, '0')).join(''); };
  const clamp01 = (x) => Math.max(0.02, Math.min(1, x));
  function lights(d) {
    if (!d || (!d.connected && !d.simulated)) return;
    const map = mapFor(d.profile.id);
    for (const [ctl, action] of Object.entries(map)) {
      if (ctl.startsWith('_')) continue;
      const c = d.control(ctl); if (!c || !c.led) continue;
      try {
        if (c.led.kind === 'ring-mackie') { if (VALUE_ACTIONS.has(action)) d.setLight(ctl, clamp01(C.valueFrac(action)), { style: 'fan' }); continue; }
        const on = C.isOn(action);
        if (c.led.kind === 'mono') d.setLight(ctl, action === 'record' && on ? 'blink' : !!on);
        else { const col = COLORS[action] || '#ffffff'; d.setLight(ctl, on === undefined ? dim(col, 0.35) : on ? col : dim(col, 0.12)); }
      } catch (err) { /* LEDs are a nicety */ }
    }
  }
  C.onChange(() => { for (const d of hub.list()) lights(d); hints(); });

  function endLearn() { if (learning) learning.btn.classList.remove('learn'); learning = null; }
  C.setLearnHook((action, btn) => {
    endLearn();
    if (!hub.list().length) { C.toast('Connect a MIDI device first (MIDI button), then right-click a button and press a control'); return; }
    learning = { action, btn }; btn.classList.add('learn');
    C.toast(`Press (or turn) the MIDI control for "${NAMES[action]}" — Esc cancels`, 8000);
  });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && learning) { endLearn(); C.toast('Cancelled'); } });

  function hints() {
    const devs = hub.list();
    for (const b of C.buttons) {
      const a = b.dataset.action, out = [];
      for (const d of devs) {
        const map = mapFor(d.profile.id), sh = DEV_SHORT[d.profile.id] || 'MIDI';
        for (const [ctl, act] of Object.entries(map)) if (act === a && !ctl.startsWith('_')) { out.push(sh + ' ' + ctlShort(d.profile.id, ctl)); break; }
      }
      const m = b.querySelector('.m'); if (m) m.textContent = out.slice(0, 2).join(' · ');
    }
  }
  function refresh() {
    const devs = hub.list();
    $('midiChip').textContent = hub.status === 'running' ? (devs.length ? devs.length + ' device' + (devs.length > 1 ? 's' : '') : 'no devices') : (hub.supported ? 'off' : 'n/a');
    $('midiStatus').textContent = 'MIDI: ' + status + (hub.status === 'running' ? ` · ${devs.length} device(s)` : '');
    C.setMidiLine('MIDI: ' + (hub.status === 'running' ? (devs.length ? devs.map(d => (d.profile.name || d.profile.id) + (d.simulated ? ' (sim)' : '')).join(', ') : 'no devices plugged in') : status));
    const box = $('midiDevices'); box.innerHTML = '';
    for (const d of devs) {
      const pid = d.profile.id, map = mapFor(pid), lr = learned[pid] || {};
      const h = document.createElement('h3'); h.textContent = `${d.profile.name || pid}  (${d.portNames.join(' | ')})`; box.appendChild(h);
      if (map._layout) { const p = document.createElement('p'); p.textContent = map._layout; box.appendChild(p); }
      const rows = Object.entries(map).filter(([k]) => !k.startsWith('_'));
      if (rows.length) {
        const t = document.createElement('table');
        t.innerHTML = '<tr><th>control</th><th>action</th></tr>' + rows.map(([k, a]) => `<tr><td>${ctlShort(pid, k)} <span style="color:#8a8597">(${k})</span></td><td class="${lr[k] ? 'learned' : ''}">${NAMES[a] || a}</td></tr>`).join('');
        box.appendChild(t);
      }
    }
    hints();
  }
  $('b_midi').onclick = () => { $('midiPanel').classList.toggle('on'); refresh(); };
  $('midiConnect').onclick = () => connect();
  $('midiForget').onclick = () => { learned = {}; saveLearned(); refresh(); for (const d of hub.list()) lights(d); C.toast('Learned MIDI forgotten — back to the defaults'); };

  window.CT78.midi = { hub, connect, lookup, get learned() { return learned; }, refresh };
  refresh();
  if (new URLSearchParams(location.search).get('midi') !== '0') connect();   // ask at once; Chrome remembers the answer
})();
