/* CT78.A10.Synth -- the page: scene, camera, keys, play mode, the display on the right, the recorder.
 * MIDI is in CT78.A10.Synth_midi.js; it calls CT78.down / CT78.up / CT78.act / CT78.setValue.
 * Public API (for the CT68 doll's hand and other callers): window.CT78 -- see the end of this file. */
(function () {
  'use strict';
  const LABEL = 'CT78.A10.Synth';
  const $ = (id) => document.getElementById(id);
  const qs = new URLSearchParams(location.search);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const NOTES = Array.from({ length: 34 }, (_, i) => 48 + i);   // A7: black keys back: C3 to A5, 20 white keys and 14 black
  const FIRST = NOTES[0], LAST = NOTES[NOTES.length - 1], NKEYS = NOTES.length;
  const keyOf = (n) => M.keys.find((k) => k.note === n);

  // ------------------------------------------------------------------ state
  const S = {
    time: 0, playing: qs.get('play') !== '0', song: clamp(parseInt(qs.get('song') || '0', 10) || 0, 0, CT78Songs.SONGS.length - 1), tempo: clamp(parseFloat(qs.get('tempo') || '112'), 40, 220), loop: true,
    sound: qs.get('sound') !== '0', volume: 0.8, tone: 2, glow: 1, bubbles: false, room: false, view: 0, orbit: true,   /* A9: no bubbles (request 42); Turn is on at the start (request 44) */ hud: true, recording: false,
    yaw: 0, pitch: 0, dist: 0, tx: 0, ty: 0, tz: 0,
  };
  const VIEWS = [
    // A8: the start view is above her and in front of her (over the toy's back), looking down at her face and hands (request 36)
    { name: 'her', yaw: 200, pitch: 34, dist: 235, t: [0, 14, 22] },   // A10 (request 58): a little further back (was 210)
    { name: 'hero', yaw: 48, pitch: 22, dist: 215, t: [0, 10, 14] }, { name: 'front', yaw: 0, pitch: 10, dist: 165, t: [0, 8, 6] },
    { name: 'top', yaw: 0, pitch: 66, dist: 140, t: [0, 8, 4] }, { name: 'keys', yaw: 18, pitch: 36, dist: 48, t: [0, 8.5, 8.5] },
  ];
  const goal = { yaw: 0, pitch: 0, dist: 0, tx: 0, ty: 0, tz: 0 };
  function setView(i, jump) {
    S.view = ((i % VIEWS.length) + VIEWS.length) % VIEWS.length; const v = VIEWS[S.view];
    Object.assign(goal, { yaw: v.yaw, pitch: v.pitch, dist: v.dist, tx: v.t[0], ty: v.t[1], tz: v.t[2] });
    if (jump) Object.assign(S, goal);
  }
  setView(0, true);

  // ------------------------------------------------------------------ renderer, scene
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = parseFloat(qs.get('exposure') || '1.15');
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x060304);
  const FOV = 30, camera = new THREE.PerspectiveCamera(FOV, 1, 1, 1200);
  const hemi = new THREE.HemisphereLight(0x8a7a90, 0x120808, 0.0); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffeedd, 0.0); key.position.set(-30, 50, 60); scene.add(key);
  const fillRed = new THREE.DirectionalLight(0xff5a48, 0.0); fillRed.position.set(40, 20, 30); scene.add(fillRed);

  const M = CT78Model.build(THREE, { notes: NOTES });
  scene.add(M.group);
  const env = M.makeEnv(renderer);
  for (const m of M.glassMats) { m.envMap = env; m.envMapIntensity = 1.6; }
  for (const m of M.mats.key) { m.envMap = env; m.envMapIntensity = 0.55; }
  for (const m of M.mats.body) { m.envMap = env; m.envMapIntensity = 0.5; }

  // ------------------------------------------------------------------ sound
  const synth = new CT78Sound.Synth(), speaker = new CT78Sound.Speaker(synth);
  synth.muted = !S.sound; synth.volume = S.volume; synth.setTone(S.tone);
  let audioStarted = false;
  function startAudio() { if (!S.sound) return; audioStarted = true; speaker.start(); $('audioNote').classList.add('off'); }
  if (!S.sound) $('audioNote').classList.add('off');   // A10 (request 55): the notice shows until the sound is on
  for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { if (!audioStarted) startAudio(); }, { capture: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden) speaker.suspend(); else if (audioStarted && S.sound) speaker.start(); });

  // ------------------------------------------------------------------ keys: down / up from any source
  const keyListeners = [];
  const tubeE = [0, 0, 0], tubeP = [0, 0, 0];
  let lastNote = '', lastNoteT = -9;
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = (n) => NOTE_NAMES[n % 12] + (Math.floor(n / 12) - 1);
  /** fold any MIDI note into the toy's range (the nearest octave that is on the keyboard) */
  /** A6: fold into C3..A5 by octaves; a black-key note goes to the white key just below it (C# -> C, D# -> D, F# -> F, G# -> G, A# -> A) */
  function fold(n) { n = Math.round(n); while (n < FIRST) n += 12; while (n > LAST) n -= 12; return n; }   // every note has its own key; outside F3-C5 -> nearest octave
  function down(note, vel = 0.8, src = 'api') {
    const n = fold(note), k = keyOf(n); if (!k) return null;
    k.srcs = k.srcs || new Set();
    const was = k.srcs.size > 0; k.srcs.add(src);
    k.target = 0.55 + 0.45 * clamp(vel, 0, 1); k.vel = vel;
    if (!was) {
      synth.noteOn(n, clamp(vel, 0.05, 1));
      // (A5: a key stroke lights only the key; nothing else changes its glow)
      lastNote = noteName(n); lastNoteT = S.time;
      for (const f of keyListeners) try { f({ note: n, index: M.keys.indexOf(k), down: true, velocity: vel, source: src }); } catch { /* */ }
    }
    return n;
  }
  function up(note, src = 'api') {
    const n = fold(note), k = keyOf(n); if (!k || !k.srcs) return;
    k.srcs.delete(src);
    if (k.srcs.size === 0) {
      k.target = 0; synth.noteOff(n);
      for (const f of keyListeners) try { f({ note: n, index: M.keys.indexOf(k), down: false, velocity: 0, source: src }); } catch { /* */ }
    }
  }
  function allUp(src) {
    for (const k of M.keys) if (k.srcs && k.srcs.size && (!src || k.srcs.has(src))) { if (src) up(k.note, src); else { k.srcs.clear(); k.target = 0; synth.noteOff(k.note); } }
  }

  // ------------------------------------------------------------------ play mode (the keys played by themselves)
  const play = { t: 0, next: 0, ev: [], active: [], gap: 0, pause: 0 };
  const HOLD = 1.0;    // A9 (request 43): when a song is finished her hands rest on the keys this long, then the next song starts
  const PAUSE = 5.0;   // A9 (request 39): after the last song of the playlist: seconds from its end to the first note of the first song (the hands go to rest meanwhile)
  // A7: start a little before the first note, so the doll's hand can get there (A8: at least 1.2 s, at least one beat)
  // A8: each song sets its own instrument and tempo (request 29); the Tone button and [ ] still change them until the next song
  function loadSong(leadSec = 1.2) {
    const sg = song(); S.tempo = sg.bpm || S.tempo; synth.setTone(sg.tone === undefined ? S.tone : sg.tone); S.tone = synth.tone;
    play.t = -Math.max(1, leadSec * S.tempo / 60); play.next = 0; play.active.length = 0; play.gap = 0; play.pause = 0;
  }
  const song = () => CT78Songs.SONGS[S.song];
  /** the eight dials of a song: fixed for each song (a seeded random set), so a song always has the same settings */
  function dialsFor(i) { let s = 0x9e37 + i * 7919; const r = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; return Array.from({ length: 8 }, () => (r() - 0.5) * 4.4); }
  const setDialsForSong = (jump) => M.setDials(dialsFor(S.song), jump);
  function stepPlay(dt) {
    const sg = song(), spb = 60 / S.tempo;
    // release finished notes
    for (let i = play.active.length - 1; i >= 0; i--) { const a = play.active[i]; if (play.t >= a.off) { for (const n of a.notes) up(n, 'play'); play.active.splice(i, 1); } }
    play.t += dt / spb;                                         // in beats
    while (play.next < sg.events.length && play.t >= sg.events[play.next].t) {
      const e = sg.events[play.next++];
      for (const n of e.notes) down(n, e.vel * (0.9 + Math.random() * 0.0), 'play');
      play.active.push({ off: e.t + e.dur, notes: e.notes });
    }
    if (play.next >= sg.events.length && !play.active.length && play.t >= sg.beats) {
      // A8: a pause first (the doll comes to rest), then the next song
      if (S.loop) {
        play.pause += dt;
        const n = CT78Songs.SONGS.length, wrap = S.song === n - 1;
        // A9: between songs the hands rest on the keys for HOLD, then the next song (its lead-in lets the hands move); after the last, PAUSE in all, counted to the first note
        const next = CT78Songs.SONGS[(S.song + 1) % n], lead = wrap ? Math.max(1.2, 60 / (next.bpm || S.tempo)) : 0.9;
        if (play.pause >= (wrap ? PAUSE - lead : HOLD)) { S.song = (S.song + 1) % n; loadSong(wrap ? 1.2 : 0.9); setDialsForSong(false); toast('Next song: ' + song().name + ' · ' + synth.toneName); refreshUI(); }
      }
      else { S.playing = false; refreshUI(); }
    }
  }

  // ------------------------------------------------------------------ the look of things and the camera
  let PW = 800, PH = 600, fullRes = false;
  const stage = $('stage');
  const REC_W = parseInt(qs.get('recw') || '99999', 10), REC_H = parseInt(qs.get('rech') || '99999', 10);
  const even = (x) => Math.max(2, Math.floor(x / 2) * 2);
  function fit() {
    if (S.recording) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2, parseFloat(qs.get('dpr') || '2')), w = stage.clientWidth, h = stage.clientHeight;
    PW = even(Math.min(3840, w * dpr)); PH = even(Math.min(2160, h * dpr));
    renderer.setSize(PW, PH, false); camera.aspect = PW / PH; camera.updateProjectionMatrix();
  }
  new ResizeObserver(fit).observe(stage);
  // A10: the movie is half the display's size (your OK), so the recorder keeps up better
  function recSize() { const s = Math.min(0.5, REC_W / PW, REC_H / PH); return [even(PW * s), even(PH * s)]; }
  function updateCamera(dt) {
    const k = 1 - Math.exp(-dt * 6);
    if (S.orbit) goal.yaw += dt * 9;
    for (const p of ['yaw', 'pitch', 'dist', 'tx', 'ty', 'tz']) S[p] += (goal[p] - S[p]) * k;
    const y = S.yaw * Math.PI / 180, p = S.pitch * Math.PI / 180, d = S.dist;
    camera.position.set(S.tx + Math.sin(y) * Math.cos(p) * d, S.ty + Math.sin(p) * d, S.tz + Math.cos(y) * Math.cos(p) * d);
    camera.lookAt(S.tx, S.ty, S.tz);
  }
  function lights() {
    const r = S.room ? 1 : 0.0;
    hemi.intensity = 0.34 + 1.4 * r; key.intensity = 0.55 + 2.6 * r; fillRed.intensity = 0.5 + 0.5 * r;
  }

  // ------------------------------------------------------------------ pointer: click a key, drag to turn, wheel to zoom
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const keyMeshes = M.keys.map((k) => k.mesh);
  function pick(ev) {
    const r = canvas.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -(((ev.clientY - r.top) / r.height) * 2 - 1));
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(keyMeshes, false)[0]; return hit ? hit.object.userData.key : -1;
  }
  let drag = null, mouseKey = -1;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const k = e.button === 0 ? pick(e) : -1;
    if (k >= 0) { mouseKey = k; down(M.keys[k].note, 0.8, 'mouse'); return; }
    drag = { x: e.clientX, y: e.clientY }; canvas.classList.add('drag');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (drag) {
      goal.yaw -= (e.clientX - drag.x) * 0.4; goal.pitch = clamp(goal.pitch + (e.clientY - drag.y) * 0.3, -5, 85); S.yaw = goal.yaw; S.pitch = goal.pitch;
      drag.x = e.clientX; drag.y = e.clientY;
    } else if (mouseKey < 0 && e.buttons === 0) canvas.classList.toggle('key', pick(e) >= 0);
  });
  const endPointer = () => { if (mouseKey >= 0) { up(M.keys[mouseKey].note, 'mouse'); mouseKey = -1; } drag = null; canvas.classList.remove('drag'); };
  canvas.addEventListener('pointerup', endPointer); canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); goal.dist = clamp(goal.dist * Math.exp(e.deltaY * 0.0012), 22, 360); }, { passive: false });
  canvas.addEventListener('dblclick', () => setView(0));
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  // ------------------------------------------------------------------ toast, UI
  let toastT = 0;
  function toast(msg, ms = 2600) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), ms); }
  const btns = [...document.querySelectorAll('[data-action]')];
  const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  const listeners = [];
  function notify() { refreshUI(); for (const f of listeners) try { f(); } catch { /* */ } }
  function refreshUI() {
    for (const b of btns) b.classList.toggle('on', !!isOn(b.dataset.action));
    $('v_song').textContent = song().name; $('v_tempo').textContent = Math.round(S.tempo); $('v_vol').textContent = Math.round(S.volume * 100) + '%';
    $('v_glow').textContent = Math.round(S.glow * 100) + '%'; $('t_tone').textContent = synth.toneName; $('t_view').textContent = 'View: ' + VIEWS[S.view].name;
    const pb = document.querySelector('[data-action="play"] .t'); if (pb) pb.textContent = S.playing ? 'Playing ❚❚' : 'Play ▶';
  }

  // ------------------------------------------------------------------ recording (the CT55.A7 / CT61 / CT72 recorder: WebCodecs H.264 + AAC, constant frame rate)
  const FPS_KEY = 'CT78.fps';
  let FPS = parseInt(qs.get('fps') || (() => { try { return localStorage.getItem(FPS_KEY); } catch { return null; } })() || '60', 10) === 30 ? 30 : 60;
  let take = null, recBusy = false, recReady = '', lastMovie = null, toastRecT = 0;
  async function prepareRecorder() {
    if (!CT78Rec.supported()) { recReady = 'this browser cannot make movies (use Chrome or Edge)'; return; }
    recReady = 'preparing…';
    const [w, h] = recSize(), f = FPS;
    const pk = await CT78Rec.prepare(w, h, f, CT78Sound.SR);
    if (w === recSize()[0] && h === recSize()[1] && f === FPS) recReady = pk ? `${pk.name}${CT78Rec.audioPick ? ' + ' + (CT78Rec.audioPick.mux === 'aac' ? 'AAC' : 'Opus') + ' sound' : ' (no sound encoder)'}` : 'no video encoder works at this size';
  }
  async function startRecording() {
    if (recBusy || S.recording) return;
    if (!CT78Rec.supported()) { toast('This browser cannot make movies — use Chrome or Edge. Everything else works.'); return; }
    recBusy = true; toast('Starting the recorder…');
    const [w, h] = recSize();
    let pk = CT78Rec.cached(w, h, FPS);
    if (pk === undefined) pk = await CT78Rec.prepare(w, h, FPS, CT78Sound.SR);
    recBusy = false;
    if (!pk) { toast('No video encoder works at ' + w + '×' + h + ' here. (' + CT78Rec.tried.slice(-3).join('; ') + ')'); return; }
    if (w !== PW || h !== PH) { PW = w; PH = h; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    try { take = CT78Rec.Take(canvas, w, h, FPS, CT78Sound.SR, pk, CT78Rec.audioPick); }
    catch (e) { toast('The recorder could not start: ' + (e && e.message || e)); fit(); return; }
    S.recording = true; speaker.setMode('film'); document.body.classList.add('recording');
    toast(`● Recording ${w}×${h}, ${FPS} fps, ${pk.name}, sound ${take.audio}${S.sound ? '' : ' (Sound is off: silent track)'}. The speakers are muted while recording; the movie has the sound. Press Record again to stop and download the MP4.`, 5000);
    notify();
  }
  async function stopRecording() {
    if (!S.recording || !take) return;
    const t = take; take = null; S.recording = false; speaker.setMode('live'); document.body.classList.remove('recording'); notify();
    if (t.frames === 0) { t.abort(); toast('Nothing was recorded.'); fit(); return; }
    toast(`Finishing the movie (${t.frames} frames)…`, 60000);
    let blob;
    try { blob = await t.finish(); } catch (e) { toast('The movie failed in the browser encoder: ' + (e && e.message || e), 12000); fit(); return; }
    const d = new Date(), p2 = (x) => String(x).padStart(2, '0');
    const name = `${LABEL}_movie_${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}.mp4`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 120000);
    lastMovie = { name, bytes: blob.size, frames: t.frames, seconds: t.seconds, w: t.w, h: t.h, fps: t.fps, codec: t.codec, audio: t.audio, mbps: t.mbps };
    $('toast').innerHTML = `Movie downloaded: <b>${name}</b> — ${t.seconds.toFixed(1)} s, ${t.w}×${t.h}, ${t.fps} fps, ${(blob.size / 1048576).toFixed(1)} MB (in your Downloads folder) · <a href="${url}" download="${name}">save another copy</a>`;
    $('toast').classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => $('toast').classList.remove('on'), 12000);
    fit();
  }

  // ------------------------------------------------------------------ actions (buttons, keys and MIDI all come here)
  const setSound = (v) => { S.sound = v; synth.muted = !v; if (v) startAudio(); };
  const nudgeSong = (d) => { const n = CT78Songs.SONGS.length; allUp('play'); S.song = (S.song + d + n) % n; loadSong(); setDialsForSong(false); toast('Song: ' + song().name); };
  const ACT = {
    play() { if (!S.playing) { if (play.t >= song().beats - 0.01 || play.t < 0) loadSong(); } else allUp('play'); S.playing = !S.playing; startAudio(); },
    reset() { allUp(); S.playing = false; S.time = 0; loadSong(); toast('Reset: all keys up, play mode off'); },
    record() { if (S.recording) stopRecording(); else startRecording(); },
    prevSong() { nudgeSong(-1); }, nextSong() { nudgeSong(1); },
    faster() { S.tempo = clamp(S.tempo + 4, 40, 220); }, slower() { S.tempo = clamp(S.tempo - 4, 40, 220); },
    loop() { S.loop = !S.loop; },
    sound() { setSound(!S.sound); },
    tone() { synth.setTone(synth.tone + 1); S.tone = synth.tone; toast('Tone: ' + synth.toneName); },
    volUp() { S.volume = clamp(S.volume + 0.05, 0, 1); synth.volume = S.volume; }, volDown() { S.volume = clamp(S.volume - 0.05, 0, 1); synth.volume = S.volume; },
    glowUp() { S.glow = clamp(S.glow + 0.1, 0, 1.6); }, glowDown() { S.glow = clamp(S.glow - 0.1, 0, 1.6); },
    bubbles() { S.bubbles = !S.bubbles; }, room() { S.room = !S.room; lights(); },
    view() { setView(S.view + 1); },
    lookLeft() { goal.yaw += 12; }, lookRight() { goal.yaw -= 12; }, lookUp() { goal.pitch = clamp(goal.pitch + 8, -5, 85); }, lookDown() { goal.pitch = clamp(goal.pitch - 8, -5, 85); },
    orbit() { S.orbit = !S.orbit; },
    hud() { document.body.classList.toggle('nohud'); S.hud = !document.body.classList.contains('nohud'); },
    bar() { document.body.classList.toggle('nobar'); },
    display() { const b = document.body.classList; const hidden = b.contains('nobar') && b.contains('nohud'); b.toggle('nobar', !hidden); b.toggle('nohud', !hidden); S.hud = hidden; },
  };
  const IS_ON = { play: () => S.playing, record: () => S.recording, loop: () => S.loop, sound: () => S.sound, bubbles: () => S.bubbles, room: () => S.room, orbit: () => S.orbit, hud: () => S.hud, view: () => S.view !== 0 };
  const isOn = (a) => IS_ON[a] ? !!IS_ON[a]() : undefined;
  function act(name, phase) {
    if (phase === 'release') return;
    const f = ACT[name]; if (!f) return; f(); notify();
    const b = btns.find((x) => x.dataset.action === name); if (b) { b.classList.add('hit'); setTimeout(() => b.classList.remove('hit'), 120); }
  }
  /** value controls (MIDI knobs): { value: 0..1 } or { delta: detents } */
  const VALUES = {
    tempo: { get: () => (S.tempo - 40) / 180, set: (f) => { S.tempo = clamp(40 + f * 180, 40, 220); }, step: 4 / 180 },
    volume: { get: () => S.volume, set: (f) => { S.volume = clamp(f, 0, 1); synth.volume = S.volume; }, step: 0.03 },
    glow: { get: () => S.glow / 1.6, set: (f) => { S.glow = clamp(f * 1.6, 0, 1.6); }, step: 0.04 },
    lookYaw: { get: () => 0.5 - goal.yaw / 360, set: (f) => { goal.yaw = (0.5 - f) * 360; }, step: 0.02 },
    lookPitch: { get: () => (goal.pitch + 5) / 90, set: (f) => { goal.pitch = clamp(f * 90 - 5, -5, 85); }, step: 0.02 },
    zoom: { get: () => (360 - goal.dist) / 338, set: (f) => { goal.dist = clamp(360 - f * 338, 22, 360); }, step: 0.03 },
  };
  function setValue(name, o) { const v = VALUES[name]; if (!v) return; v.set(o.delta !== undefined ? clamp(v.get() + o.delta * v.step, 0, 1) : o.value); notify(); }
  const valueFrac = (name) => VALUES[name] ? clamp(VALUES[name].get(), 0, 1) : 0;

  for (const b of btns) {
    b.addEventListener('click', () => act(b.dataset.action, 'press'));
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); if (learnHook) learnHook(b.dataset.action, b); });
  }
  let learnHook = null;
  $('b_panels').onclick = () => ACT.display() || notify();
  $('b_help').onclick = () => $('helpPanel').classList.toggle('on');
  for (const x of document.querySelectorAll('[data-close]')) x.onclick = () => x.parentElement.classList.remove('on');
  $('fpsSel').value = String(FPS);
  $('fpsSel').onchange = () => { if (S.recording) { $('fpsSel').value = String(FPS); toast('Stop recording first'); return; } FPS = parseInt($('fpsSel').value, 10); try { localStorage.setItem(FPS_KEY, String(FPS)); } catch { /* */ } prepareRecorder(); };

  const KEYMAP = { ' ': 'play', p: 'play', Backspace: 'reset', r: 'record', n: 'nextSong', ']': 'faster', '[': 'slower', k: 'loop', m: 'sound', t: 'tone', '=': 'volUp', '+': 'volUp', '-': 'volDown',
    '.': 'glowUp', ',': 'glowDown', b: 'bubbles', l: 'room', v: 'view', o: 'orbit', i: 'hud', h: 'display', d: 'bar', ArrowLeft: 'lookLeft', ArrowRight: 'lookRight', ArrowUp: 'lookUp', ArrowDown: 'lookDown' };
  addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test((e.target || {}).tagName || '')) return;
    if (e.key === '?' || e.key === '/') { $('helpPanel').classList.toggle('on'); e.preventDefault(); return; }
    if (e.key === 'Escape') { document.querySelectorAll('.panel.on').forEach((p) => p.classList.remove('on')); return; }
    const a = KEYMAP[e.key] || KEYMAP[e.key.toLowerCase()];
    if (a) { e.preventDefault(); if (!e.repeat) act(a, 'press'); }
  });

  // ------------------------------------------------------------------ the display
  const perf = { n: 0, t0: performance.now(), fps: 0 };
  let midiLine = 'MIDI: off';
  function hudUpdate(now) {
    perf.n++; if (now - perf.t0 > 500) { perf.fps = perf.n * 1000 / (now - perf.t0); perf.n = 0; perf.t0 = now; }
    $('v_timer').textContent = fmtTime(S.time);
    if (S.recording && take) $('recTime').textContent = `${Math.floor(take.seconds / 60)}:${String(Math.floor(take.seconds) % 60).padStart(2, '0')}`;
    if (!S.hud || perf.n % 6) return;
    const held = M.keys.filter((k) => k.srcs && k.srcs.size).map((k) => noteName(k.note)).join(' ') || '—';
    const L = [];
    L.push(`<b>${LABEL}</b>  ${S.playing ? '▶ ' + song().name + ' @ ' + Math.round(S.tempo) + ' bpm' : '❚❚ play mode off'}  ${fmtTime(S.time)}`);
    L.push(`keys down: <b>${held}</b> · tone ${synth.toneName} · sound ${S.sound ? (speaker.running ? 'on' : 'waiting for a click') : 'off'}`);
    L.push(S.recording && take ? `<b>● REC</b> ${take.seconds.toFixed(1)} s · ${take.frames} frames · ${take.w}×${take.h} @ ${take.fps} · ${take.codec} · ${take.mbps.toFixed(0)} Mbit/s${take.failed ? ' · ERROR ' + take.failed : ''}`
      : `movie: ${recSize().join('×')} @ ${FPS} fps · ${recReady}`);
    L.push(`tubes ${M.tubes.map((t) => t.H + ' cm').join(' / ')} · pulse ${tubeP.map((x) => x.toFixed(2)).join(' ')}`);
    L.push(`${perf.fps.toFixed(0)} fps · ${renderer.info.render.calls} draws · ${midiLine}`);
    $('hud').innerHTML = L.join('\n');
  }

  // ------------------------------------------------------------------ the frame loop
  let lastTick = 0, frozen = false, sceneT = 0, lastDt = 1 / 60;
  function step(dt) {
    sceneT += dt;
    if (S.playing) { S.time += dt; stepPlay(dt); }
    for (let i = 0; i < 3; i++) { tubeE[i] *= Math.exp(-dt * 0.9); tubeP[i] *= Math.exp(-dt * 5); }
  }
  function draw(dt) {
    const px = PH / (2 * Math.tan(FOV * Math.PI / 360));
    const beatOn = S.playing && ((play.t % 1) + 1) % 1 < 0.2;
    // A4: a tube stays fully bright while any of its keys is held down (C-D# left, E-G middle, G#-B right)
    const held = [0, 0, 0];
    for (const k of M.keys) if (k.srcs && k.srcs.size) { const pc = k.note % 12; held[pc < 4 ? 0 : pc < 8 ? 1 : 2] = 1; }
    M.update(sceneT, dt, { energy: tubeE, pulse: tubeP, held, glow: S.glow, bubbles: S.bubbles, px,
      display: { note: S.time - lastNoteT < 99999 && lastNote ? lastNote : '', tone: synth.toneName.replace('Electric piano', 'E. piano'), icon: synth.toneIcon, song: S.playing ? song().name.replace('Joy to the World', 'Joy to World').replace('Bach Prelude in C', 'Bach Prelude').slice(0, 12) : '', playing: S.playing, beat: beatOn } });
    if (window.CT78Doll && CT78Doll.ready) CT78Doll.frame(sceneT, dt);   // A7: the doll, after the toy's keys are set
    renderer.render(scene, camera);
  }
  function tick(now) {
    requestAnimationFrame(tick);
    if (frozen) { lastTick = 0; return; }
    if (S.recording && take) {
      if (now - lastTick < 1000 / FPS - 2) return;
      if (take.busy()) return;
      lastTick = now;
      const dt = 1 / FPS; lastDt = dt;
      step(dt); updateCamera(dt); draw(dt);
      if (!take) return;
      const audio = synth.render(take.samplesForNextFrame());
      take.add(audio);   // A10: the speakers are silent while recording (the recorder runs slower than real time, so live sound broke up); the movie has the sound
    } else {
      const real = lastTick ? Math.min(0.5, Math.max(0.001, (now - lastTick) / 1000)) : 1 / 60, ns = Math.max(1, Math.ceil(real / 0.05)), dt = real / ns;
      lastTick = now; lastDt = Math.min(0.1, real);
      for (let k = 0; k < ns; k++) step(dt);
      updateCamera(lastDt); draw(lastDt);
    }
    hudUpdate(now);
  }

  // ------------------------------------------------------------------ public API
  window.CT78 = {
    playState: () => ({ playing: S.playing, beat: play.t, song: song(), tempo: S.tempo, pausing: play.pause >= HOLD && S.song === CT78Songs.SONGS.length - 1, holding: play.pause > 0 && play.pause < HOLD }),   // A7: for the doll
    LABEL, S, M, scene, camera, renderer, synth, speaker, toast, act, setValue, valueFrac, isOn, notify, VALUES,
    noteName, fold, FIRST, NKEYS,
    /** press / release a key (MIDI note number; vel 0..1; src names who is pressing, so two players can hold one key) */
    down, up, allUp,
    /** where a fingertip should land: { pos: THREE.Vector3 (world, on the key top), normal, depthMax (cm of travel at that spot), width } */
    keyTarget: (note) => M.keyTarget(fold(note)),
    /** continuous control: depth 0..1 pushes the key down without sounding it (a doll's hand can drive this); sound it with down() at the touch */
    setKeyDepth(note, d) { const k = keyOf(fold(note)); if (k) k.target = clamp(d, 0, 1); },
    onKey(f) { keyListeners.push(f); }, onChange(f) { listeners.push(f); },
    setMidiLine(t) { midiLine = t; }, setLearnHook(f) { learnHook = f; }, buttons: btns, ACT,
    get picture() { return [PW, PH]; }, get fps() { return FPS; }, get take() { return take; }, get lastMovie() { return lastMovie; }, get recReady() { return recReady; }, songs: CT78Songs.SONGS,
    freeze(v) { frozen = !!v; }, step, updateCamera, draw: () => draw(1 / 60), setView, tubeE, tubeP,
    stepTo(sec, dt = 1 / 30) { for (let t = 0; t < sec; t += dt) { step(dt); updateCamera(dt); } draw(dt); },
  };

  lights(); fit(); loadSong(); setDialsForSong(true); refreshUI(); notify();
  if (window.CT78Doll && qs.get('doll') !== '0') CT78Doll.init(THREE, scene, M).catch((e) => { console.error(e); toast('The doll could not be loaded: ' + (e && e.message || e), 8000); });
  if (qs.get('play') === '1') { S.playing = true; notify(); }
  if (qs.get('hud') === '1') ACT.display();
  requestAnimationFrame(tick);
  setTimeout(prepareRecorder, 1500);
  setTimeout(() => toast('Playing by itself — click once for sound  ·  click the keys, or play a MIDI keyboard  ·  P stops / starts  ·  ? = help', 5000), 600);
})();
