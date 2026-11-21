/* CT78.A10.Synth -- the centre doll from CT68.B1.Doll ("Cream lace"), standing in front of the toy and "playing" it.
 *
 * The dolls come from CT68's embed bundle (CT78.A10.Synth_lib/ct68_carolers.js, copied unchanged from
 * CT68.B1.Doll/embed/ct68_carolers.js). It always builds all three carolers; we keep the middle one and drop the other two.
 * Her candle is hidden (and the candle lights are off: lights: false).
 *
 * Play mode is a player piano: the toy plays the song by itself. The doll only makes it look as if she plays it.
 * A8:
 *   * Each song has a right-hand part and a left-hand part (CT78.A10.Synth_songs.js); each of her hands plays its part.
 *     In a chord the hand hits one key (right hand the top one, left hand the bottom one); the others go down by themselves.
 *   * The arm is posed the way a hand plays a piano (request 32): the hand palm down, fingers forward and a little down,
 *     so the fingertip comes down on the key; the elbow below and outside the shoulder. It is solved in that order:
 *     the hand from the key, then the wrist, then the elbow on the circle of places it can be, nearest "down and out".
 *     (A7 aimed the arm with a free twist, which could turn the arm and hand inside out.)
 *   * Her body turns left or right toward where her hands are playing (request 33), and her shoulders reach forward a
 *     little when a key is far (request 35). She still glides a little sideways, as in A7.
 *   * She looks down at her hands while playing, and up and ahead when the tune stops (request 31).
 *   * In the songs with words she mouths them (request 37).
 *   * Between songs her hands come to rest at her waist and she looks up (request 38; the pause is in _main.js).
 * Outside play mode (MIDI or mouse) her arms rest at her waist.
 *
 * Units: the toy is in cm; the doll is about 1 unit tall in her own space, scaled by DOLL_CM.
 */
(function (global) {
  'use strict';
  const DOLL_CM = 60;          // her height in the toy's cm (her arm, shoulder to fingertip, is then about 22 cm)
  const SHOULDER_ABOVE_KEYS = 9;   // cm: her shoulders this far above the key tops
  const SKIRT_FRONT = 0.155;   // A8: her skirt's reach in front of her centre at the toy's height (her units, turned up to 20°)
  const LIFT = 4.0;            // cm: the most the fingertip rises between notes
  const L1 = 0.155, L2 = 0.15; // upper arm; forearm to the wrist (rig units, from CT68 doll_rig.js)
  const PLAY_CURL = 0.2;       // the fingers' curl while playing (0 straight, 1 a fist)
  const HAND_DOWN = 28 * Math.PI / 180;   // the hand points forward and this much down
  const REST_S = 3.0;          // seconds: a hand with no note coming within this long goes back to rest
  const D2R = Math.PI / 180;

  const D = { ready: false, error: '', manual: {} };
  global.CT78Doll = D;

  D.init = async function (THREE, scene, M) {
    if (!global.CT68Carolers) { D.error = 'CT68 bundle not loaded'; return; }
    // A10: the curls' opacity lowered (CT68 default 0.6) to cut the aliasing on the curls at the back of her head
    const car = await global.CT68Carolers.create(THREE, { lights: false, singing: false, autoBlink: true, hair: { opacity: 0.35 } });   // A9: the old hair again (the blonde curls were wrong)
    // keep the middle doll (index 1: Cream lace); take the two others out
    car.rigs.forEach((r, i) => { if (i !== 1) car.group.remove(r.root); });
    const rig = car.rigs[1];
    car.rigs.length = 0; car.rigs.push(rig);                    // A8: and stop posing the two that were taken out
    // A10: no curls at all (they alias); the cap of hair is kept
    for (const c of rig.root.getObjectByName('hair').children) if (c.name.startsWith('curl_')) c.visible = false;
    rig.candle.visible = false;                                 // "remove her candle"
    rig.root.position.set(0, 0, 0); rig.root.rotation.set(0, 0, 0);
    const keyTop = M.keyTarget(60).pos.y;
    const g = car.group;
    g.scale.setScalar(DOLL_CM);
    g.rotation.y = Math.PI;                                     // she faces the keys (-Z)
    D.baseY = keyTop + SHOULDER_ABOVE_KEYS - 0.69 * DOLL_CM;
    D.baseZ = 16.4 + SKIRT_FRONT * DOLL_CM + 0.8;               // A8: closer (A7: 29): the jacks' front, her skirt, a gap
    g.position.set(0, D.baseY, D.baseZ);
    scene.add(g);
    // her own light: a warm spot from above, in front of her (over the toy), and a soft fill, so she is not a black shape
    const spot = new THREE.SpotLight(0xfff0e0, 26000, 320, 0.42, 0.6, 2);
    spot.position.set(-20, 120, -50); spot.target.position.set(0, D.baseY + 0.75 * DOLL_CM, D.baseZ); scene.add(spot, spot.target);
    // A8: a soft light low in front of her face, so it shows from the start view while she looks down at the keys
    const face = new THREE.SpotLight(0xfff4ea, 5000, 200, 0.3, 0.8, 2);
    face.position.set(0, 14, -30); face.target.position.set(0, D.baseY + 0.86 * DOLL_CM, D.baseZ); scene.add(face, face.target);
    const fill = new THREE.PointLight(0xff8a70, 1400, 180, 2); fill.position.set(40, 40, 90); scene.add(fill);
    Object.assign(D, { THREE, car, rig, group: g, spot, face, fill, M, x: 0, yaw: 0, look: { nod: 0, turn: 0, eyeY: 0, eng: 0 }, mouth: { open: 0, shape: 0 } });
    D.arms = { L: mkArm(rig.armL, 1, 'L'), R: mkArm(rig.armR, -1, 'R') };
    // the rest positions of the keys (fingertip targets), by note
    D.keyPos = {};
    for (const k of M.keys) { const t = M.keyTarget(k.note); D.keyPos[k.note] = t.pos.clone().add(new THREE.Vector3(0, -0.25, 0)); }
    // where the middle fingertip is in the wrist's frame, with the fingers as they are while playing
    for (const side of ['L', 'R']) {
      const A = D.arms[side];
      A.arm.fingers.curl(PLAY_CURL); A.arm.wrist.quaternion.identity(); g.updateMatrixWorld(true);
      A.tipLocal = A.arm.wrist.worldToLocal(tipWorld(A));
    }
    D.ready = true;
  };

  function mkArm(arm, sgn, side) {
    const T = D.THREE;
    const tipMesh = D.rig.root.getObjectByName(`finger1_${side}2`);   // the middle finger's last bone
    return { arm, sgn, side, w: 0, have: false, qs: new T.Quaternion(), phi: 0, qw: new T.Quaternion(), prot: new T.Vector3(),
      base: arm.shoulder.position.clone(), seg: tipMesh.parent, tipLen: 0.0056 + 0.0036 * 0.74 };
  }
  function tipWorld(A) { A.seg.updateMatrixWorld(true); return A.seg.localToWorld(new D.THREE.Vector3(0, -A.tipLen, 0)); }

  // a rotation from three axes (columns)
  function basisQ(x, y, z) { const T = D.THREE; return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z)); }

  /* Pose one arm so the middle fingertip is at `P` (world). Returns { qs: shoulder (local), phi: elbow bend, qw: wrist (local), prot }.
   * 1. the hand: palm down, fingers toward the key from the shoulder's side and HAND_DOWN below level;
   * 2. the wrist is where that hand puts the fingertip on P;
   * 3. the elbow: of the circle of places it can be (upper arm L1 from the shoulder, forearm L2 from the wrist), the one
   *    nearest "down, out to her side and a little back";
   * 4. the shoulder turns the upper arm to the elbow with the elbow's hinge across the bend; the elbow bends; the wrist turns the hand. */
  // two passes: the second turns the hand a third of the way toward the forearm's line, so the wrist does not bend far
  function solve(A, P) {
    const first = solve1(A, P, null);
    return solve1(A, P, first.fore);
  }
  function solve1(A, P, foreHint) {
    const T = D.THREE, arm = A.arm, s = DOLL_CM;
    const up = new T.Vector3(0, 1, 0);
    const body = arm.shoulder.parent;
    // shoulders reach forward a little when the key is far (request 35)
    arm.shoulder.position.copy(A.base); body.updateMatrixWorld(true);
    let S = arm.shoulder.getWorldPosition(new T.Vector3());
    const flat = new T.Vector3(P.x - S.x, 0, P.z - S.z); if (flat.lengthSq() < 1e-6) flat.set(0, 0, -1); flat.normalize();
    const h = flat.clone().multiplyScalar(Math.cos(HAND_DOWN)).addScaledVector(up, -Math.sin(HAND_DOWN)).normalize();
    if (foreHint) { h.lerp(foreHint, 0.35); h.y = Math.min(h.y, -Math.sin(12 * D2R)); h.normalize(); }
    const Yw = h.clone().negate();                                   // the fingers point down the wrist's -Y
    const Xw = up.clone().addScaledVector(Yw, -up.dot(Yw)).normalize().multiplyScalar(A.sgn);   // the palm (-sgn X) faces down
    const Zw = new T.Vector3().crossVectors(Xw, Yw);                 // the thumb side
    const QW = basisQ(Xw, Yw, Zw);
    const W = P.clone().sub(A.tipLocal.clone().multiplyScalar(s).applyQuaternion(QW));
    const l1 = L1 * s, l2 = L2 * s;
    let d = W.distanceTo(S);
    const prot = new T.Vector3();
    if (d > 0.9 * (l1 + l2)) {                                       // reach: the shoulder comes toward the key, up to 2.4 cm
      const wl = body.worldToLocal(W.clone()).sub(A.base).setY(0);   // toward the wrist, level, in her body's frame
      wl.z = Math.max(wl.z, 0); if (wl.lengthSq() < 1e-10) wl.set(0, 0, 1);
      prot.copy(wl.normalize().multiplyScalar(Math.min(0.04, (d - 0.9 * (l1 + l2)) / s)));
      arm.shoulder.position.copy(A.base).add(prot); body.updateMatrixWorld(true);
      S = arm.shoulder.getWorldPosition(new T.Vector3()); d = W.distanceTo(S);
    }
    d = Math.min(Math.max(d, Math.abs(l1 - l2) + 0.5), (l1 + l2) * 0.999);
    const n = W.clone().sub(S).normalize();
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), r = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const C = S.clone().addScaledVector(n, a);
    // her outward side and her back, in the world
    const bq = body.getWorldQuaternion(new T.Quaternion());
    const out = new T.Vector3(A.sgn, 0, 0).applyQuaternion(bq).setY(0).normalize();
    const back = new T.Vector3(0, 0, -1).applyQuaternion(bq).setY(0).normalize();
    const pole = new T.Vector3(0, -1, 0).addScaledVector(out, 0.75).addScaledVector(back, 0.35);
    let e = pole.addScaledVector(n, -pole.dot(n)); if (e.lengthSq() < 1e-8) e.set(0, -1, 0); e.normalize();
    const E = C.addScaledVector(e, r);
    const Wd = S.clone().addScaledVector(n, d);                      // the wrist (pulled in if out of reach)
    const Yu = S.clone().sub(E).normalize();                         // the upper arm runs down its -Y
    const fore = Wd.clone().sub(E).normalize();
    let Zu = fore.clone().addScaledVector(Yu, -fore.dot(Yu));       // the elbow bends toward +Z
    if (Zu.lengthSq() < 1e-8) Zu = e.clone().negate(); Zu.normalize();
    const Xu = new T.Vector3().crossVectors(Yu, Zu);
    const QU = basisQ(Xu, Yu, Zu);
    const phi = Math.acos(Math.max(-1, Math.min(1, Yu.clone().negate().dot(fore))));
    const pq = arm.shoulder.parent.getWorldQuaternion(new T.Quaternion());
    const qs = pq.clone().invert().multiply(QU);
    const QE = QU.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -phi));
    const qw = QE.invert().multiply(QW);
    arm.shoulder.position.copy(A.base);
    return { qs, phi, qw, prot, fore };
  }

  // the key a hand plays for an event: right hand the top note, left hand the bottom one (the others go down by themselves)
  function keyOf(e, side) {
    const ns = e.notes.map((n) => D.fold(n)).filter((n) => D.keyPos[n]);
    if (!ns.length) return null;
    return side === 'R' ? Math.max(...ns) : Math.min(...ns);
  }

  // the fingertip target for one hand now; null = rest
  function target(side, ps) {
    const T = D.THREE, now = ps.beat, bps = ps.tempo / 60, gap = REST_S * bps;
    let prev = null, next = null;
    for (const e of ps.song.events) {
      if (e.hand !== side) continue;
      const n = keyOf(e, side); if (n === null) continue;
      if (e.t <= now) prev = { t: e.t, n, dur: e.dur }; else { next = { t: e.t, n }; break; }
    }
    const lift = (p, k) => p.clone().add(new T.Vector3(0, k, 0.6 * k / LIFT));
    if (!next || next.t - now > gap) {
      if (!prev) return null;
      if (ps.holding) return D.arms[side].w > 0.3 ? D.keyPos[prev.n].clone() : null;   // A9 (request 43): the song is over: the hands rest on the keys
      const after = now - (prev.t + prev.dur);
      if (after < 0) return D.keyPos[prev.n].clone();                // holding the last note
      if (after < 0.6 * bps) return lift(D.keyPos[prev.n], LIFT * Math.min(1, after / (0.4 * bps)));
      return null;
    }
    const N = D.keyPos[next.n];
    let P, t0;
    if (prev && next.t - prev.t <= gap) {
      P = D.keyPos[prev.n];
      t0 = prev.t + Math.min(prev.dur, 0.4 * (next.t - prev.t));    // stay on the key a while, then travel
    } else {
      P = lift(N, LIFT);                                             // come in from above the first key
      t0 = Math.max(now - 1e-3, next.t - Math.max(0.8, 0.7 * bps));
    }
    if (now <= t0) return P.clone();
    const span = next.t - t0, u = Math.max(0, Math.min(1, (now - t0) / Math.max(1e-3, span)));
    const ez = u * u * (3 - 2 * u);
    const p = P.clone().lerp(N, ez);
    const dist = P.distanceTo(N), secs = span / bps;
    const k = Math.min(LIFT, 0.8 + 0.3 * dist, 0.6 + 7 * secs);      // a small hop for a quick near note, a higher arc for a far one
    p.y += Math.sin(Math.PI * u) * k;
    p.z += Math.sin(Math.PI * u) * 0.25 * k;                         // and a little toward her, clear of the black keys
    return p;
  }

  // the mouth for the words (request 37): the syllable on the right-hand note now; its vowel sets how open and how round
  const VOWEL = { a: [0.85, 0.15], e: [0.5, 0.7], i: [0.38, 0.95], y: [0.38, 0.9], o: [0.72, -0.75], u: [0.45, -0.95] };   // as CT68's singing
  function mouthNow(ps) {
    if (!ps.song.sung) return { open: 0, shape: 0 };
    const now = ps.beat, spb = 60 / ps.tempo, ev = ps.song.events;
    let cur = null, sylE = null, nextT = Infinity;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i]; if (e.hand !== 'R') continue;
      if (e.t <= now) { cur = e; if (e.syl) sylE = e; } else { nextT = e.t; break; }
    }
    if (!cur || !sylE || now > cur.t + cur.dur + 0.1) return { open: 0, shape: 0 };
    // A10 (request 57): she mouths the words now and then, not all the time: about 4 phrases in 10 (8-beat stretches, the same ones every time)
    const chunk = Math.floor(sylE.t / 8) + ps.song.name.length * 7;
    if (((Math.imul(chunk + 1, 2654435761) >>> 0) % 10) >= 4) return { open: 0, shape: 0 };
    const syl = sylE.syl.toLowerCase();
    const v = (syl.match(/oo|ow|[aeiouy]/) || ['a'])[0];
    const [open, shape] = v === 'oo' ? [0.45, -1] : v === 'ow' ? [0.7, -0.8] : VOWEL[v];
    const sec = (now - sylE.t) * spb, endSec = (Math.min(nextT, cur.t + cur.dur) - now) * spb;
    if (/^[mbpfvw]/.test(syl) && sec < 0.07) return { open: 0.03, shape };
    const env = Math.min(1, sec / 0.09) * (endSec < 0.12 ? 0.35 + 0.65 * Math.max(0, endSec) / 0.12 : 1);
    return { open: Math.min(1, 1.25 * open * env), shape };   // A9 (request 40): wider (A8: 0.8), so she is seen to sing
  }

  D.frame = function (t, dt) {
    if (!D.ready) return;
    const T = D.THREE, C = global.CT78, ps = C.playState();
    D.fold = C.fold;
    const k = (r) => Math.min(1, dt * r);
    // the hands' targets (null: rest)
    const tg = {};
    for (const side of ['L', 'R']) tg[side] = ps.playing && !ps.pausing ? target(side, ps) : null;
    // A9: a new song while the hands are playing: they travel from where they are to the new song's first key (not a jump)
    const changed = D.curSong !== ps.song; D.curSong = ps.song;
    for (const side of ['L', 'R']) {
      const A = D.arms[side];
      if (changed && A.cur && A.w > 0.3 && tg[side]) A.xf = { from: A.cur.clone(), t: 0 };
      if (A.xf) {
        A.xf.t += dt; const u = Math.min(1, A.xf.t / 0.7);
        if (tg[side]) { const q = A.xf.from.clone().lerp(tg[side], u * u * (3 - 2 * u)); q.y += Math.sin(Math.PI * u) * 3; tg[side] = q; }
        if (u >= 1 || !tg[side]) A.xf = null;
      }
    }
    // glide sideways toward the coming notes, so they stay within reach
    let gx = 0;
    if (ps.playing && !ps.pausing) {
      const up = ps.song.events.filter((e) => e.t > ps.beat - 0.5 && e.t < ps.beat + 3 * ps.tempo / 60);
      let s = 0, n = 0; for (const e of up) { const kk = keyOf(e, e.hand); if (kk !== null) { s += D.keyPos[kk].x; n++; } }
      if (n) gx = Math.max(-9, Math.min(9, (s / n) * 0.5));
    }
    D.x += (gx - D.x) * k(2.0);
    D.group.position.x = D.x;
    // where she is looking / turning: the hands that are playing, weighted
    let fx = 0, fz = 0, fy = 0, fw = 0;
    for (const side of ['L', 'R']) { const A = D.arms[side], p = tg[side] || (A.have ? A.last : null); if (p && A.w > 0.01) { fx += p.x * A.w; fy += p.y * A.w; fz += p.z * A.w; fw += A.w; } }
    const eng = Math.min(1, fw);
    const L = D.look;
    L.eng += (eng - L.eng) * k(3);
    // her body turns toward her hands (request 33): in her own frame +X is her left, which is the world's -X
    let yawGoal = 0;
    if (fw > 0.01) { fx /= fw; fy /= fw; fz /= fw; yawGoal = Math.max(-18, Math.min(18, 0.45 * Math.atan2(-(fx - D.x), D.baseZ - fz) / D2R)); }
    D.yaw += (yawGoal * eng - D.yaw) * k(2.5);
    // head and eyes: down at the hands while playing, ahead at rest (request 31)
    let turnGoal = 0;
    if (fw > 0.01) turnGoal = Math.max(-40, Math.min(40, Math.atan2(-(fx - D.x), D.baseZ - fz) / D2R - D.yaw));
    L.turn += (turnGoal * L.eng - L.turn) * k(4);
    // mouthing the words
    const m = ps.playing && !ps.pausing && L.eng > 0.3 ? mouthNow(ps) : { open: 0, shape: 0 };
    // A10 (request 54): now and then she smiles: the mouth wide and nearly closed for a second or two (a word still opens it)
    const sm = D.smile || (D.smile = { next: t + 3 + 4 * Math.random(), t0: -99, dur: 2 });
    if (t >= sm.next) { sm.t0 = t; sm.dur = 1.6 + 1.2 * Math.random(); sm.next = t + sm.dur + 5 + 8 * Math.random(); }
    const su = (t - sm.t0) / sm.dur, smile = su >= 0 && su <= 1 ? Math.sin(Math.PI * su) ** 0.6 : 0;
    m.shape = m.shape * (1 - smile) + 0.9 * smile; m.open = Math.max(m.open, 0.1 * smile);
    D.mouth.open += (m.open - D.mouth.open) * k(25); D.mouth.shape += (m.shape - D.mouth.shape) * k(18);
    // (given to the carolers' own pose, so their update shows it once: the mouth's shape is costly to change twice a frame)
    D.car.setPose(Object.assign({ headNod: -15 * L.eng + 4 * D.mouth.open,   /* A9: not tipped down so far (A8: -24), and a small bob on each syllable */ headTurn: L.turn, eyeY: -0.6 * L.eng, eyeX: 0, mouthOpen: D.mouth.open, mouthShape: D.mouth.shape }, D.manual), true);   // A10: D.manual = the controls of CT68's dolls that the Doll group of the panel has taken over
    D.car.update(t);                                              // her blinks; sets her pose, arms at rest (we then pose the arms)
    D.rig.body.rotation.y = D.yaw * D2R;
    D.group.updateMatrixWorld(true);
    // the arms
    for (const side of ['L', 'R']) {
      const A = D.arms[side], arm = A.arm;
      A.cur = tg[side] ? tg[side].clone() : null;
      A.w += ((tg[side] ? 1 : 0) - A.w) * k(4.5);
      if (tg[side]) { const s = solve(A, tg[side]); A.qs.copy(s.qs); A.phi = s.phi; A.qw.copy(s.qw); A.prot.copy(s.prot); A.have = true; A.last = tg[side].clone(); }
      const w = A.have ? A.w : 0, ws = w * w * (3 - 2 * w);
      arm.shoulder.position.copy(A.base).addScaledVector(A.prot, ws);
      arm.wrist.quaternion.identity();
      if (ws > 0.001) {
        const restQ = arm.shoulder.quaternion.clone(), restE = arm.elbow.rotation.x;
        arm.shoulder.quaternion.copy(restQ.slerp(A.qs, ws));
        arm.elbow.rotation.set(restE + (-A.phi - restE) * ws, arm.elbow.rotation.y * (1 - ws), arm.elbow.rotation.z * (1 - ws));
        arm.wrist.quaternion.slerp(A.qw, ws);
        arm.fingers.curl(0.45 + (PLAY_CURL - 0.45) * ws);
      }
    }
    D.group.updateMatrixWorld(true);
  };

  /** where the middle fingertips are now (world), for checks */
  D.fingertips = function () { return { L: tipWorld(D.arms.L), R: tipWorld(D.arms.R) }; };
})(window);
