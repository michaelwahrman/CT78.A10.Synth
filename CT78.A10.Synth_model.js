/* CT78.A10.Synth -- the toy synthesizer model (three.js).  Units: 1 unit = 1 cm.  Origin: on the floor, in the middle of the toy.
 * +x to the player's right, +y up, +z toward the player (the keys are at the front).
 *
 * Look: after "toy synth 2.webp" / "toy synth 3.webp": a black laminated-wood body with stepped sides, a sloped control
 * panel with knobs, little red lights and a red display window, chunky cream keys (with black ones), and three glass tubes on
 * top with bubbles rising in red-lit liquid, like old Christmas-tree bubble lights.
 *
 *   const M = CT78Model.build(THREE, { keys: 25, firstNote: 48 });
 *   M.group                      add to the scene
 *   M.keys[i]                    { note, black, group, mesh, x, hinge, len, top, depth, glow }
 *   M.keyTarget(note)            { pos: Vector3 (world, where a fingertip should land), normal, depthMax } for the doll
 *   M.update(t, dt, S)           t = scene time (s); S = { energy:[3], glow, bubbles, display:{note,tone,song,playing,beat}, room }
 */
(function (global) {
  'use strict';
  const BED_Y = 7, HINGE_Z = 5.6, KEY_FRONT = 14.4, WHITE_W = 2.3;

  function build(THREE, opts = {}) {
    const NOTES = opts.notes || Array.from({ length: 34 }, (_, i) => 48 + i);   // A7: C3 to A5, 20 white keys and 14 black
    const WID = opts.width || 46.9, SX = WID / 35.2;                // A6: the toy a third longer than A1-A5 (35.2 cm)
    const group = new THREE.Group(); group.name = 'toy-synth';
    const R = (a, b) => a + (b - a) * Math.random();
    let seed = 7; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };   // deterministic look

    // ---------------------------------------------------------------- textures
    function woodTexture() {
      const c = document.createElement('canvas'); c.width = 512; c.height = 512; const g = c.getContext('2d');
      g.fillStyle = '#17120f'; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 900; i++) {
        const y = rnd() * 512, a = 0.04 + rnd() * 0.1, l = 60 + rnd() * 380, x = rnd() * 512;
        g.strokeStyle = `rgba(${rnd() < 0.5 ? '70,50,38' : '0,0,0'},${a})`; g.lineWidth = 0.5 + rnd() * 1.6;
        g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + l / 3, y + rnd() * 6 - 3, x + l * 2 / 3, y + rnd() * 6 - 3, x + l, y + rnd() * 4 - 2); g.stroke();
      }
      const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
    }
    const wood = woodTexture();
    function radialTexture(stops) {
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); for (const [p, col] of stops) gr.addColorStop(p, col);
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    }
    const glowTex = radialTexture([[0, 'rgba(255,90,70,1)'], [0.35, 'rgba(255,30,30,.55)'], [1, 'rgba(255,0,0,0)']]);

    // ---------------------------------------------------------------- materials
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a3028, map: wood, roughness: 0.55, metalness: 0.05 });
    const bodyMat2 = new THREE.MeshStandardMaterial({ color: 0x2a221c, map: wood, roughness: 0.6, metalness: 0.05 });
    const plastic = new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 0.4, metalness: 0.1 });
    const panelMat = new THREE.MeshStandardMaterial({ color: 0x1b1a1d, roughness: 0.5, metalness: 0.2 });
    const knobMat = new THREE.MeshStandardMaterial({ color: 0x2c2b30, roughness: 0.35, metalness: 0.5 });

    // ---------------------------------------------------------------- body: sides and core from one profile (z, y)
    function profileShape(grow) {
      const s = new THREE.Shape();
      const g = grow;
      s.moveTo(-12.5 - g, 0); s.lineTo(15.4 + g, 0); s.lineTo(15.4 + g, BED_Y + g); s.lineTo(HINGE_Z + 0.4, BED_Y + g);
      s.lineTo(0.8 - g * 0.3, 15.5 + g); s.lineTo(-12.5 - g, 15.5 + g); s.closePath();
      return s;
    }
    function extrudeX(shape, width, bevel) {
      const geo = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 1 });
      geo.rotateY(-Math.PI / 2); geo.translate(width / 2, 0, 0);       // profile x -> world z, extrusion -> x, centred
      // uv: use position so the wood grain runs along z
      const p = geo.attributes.position, uv = geo.attributes.uv;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getZ(i) * 0.03 + p.getX(i) * 0.01, p.getY(i) * 0.03);
      return geo;
    }
    const core = new THREE.Mesh(extrudeX(profileShape(0), WID, 0), bodyMat2); core.position.x = 0; group.add(core);
    // laminated cheeks: three slabs, each a little bigger, stepped (as in the photo's stepped side)
    for (const sx of [-1, 1]) {
      const slabs = [[2.4, 0.0], [0.9, 0.55], [0.9, 1.1]];
      let off = WID / 2;
      for (const [w, grow] of slabs) {
        const m = new THREE.Mesh(extrudeX(profileShape(grow), w, 0.05), grow === 0 ? bodyMat : bodyMat2);
        m.position.x = sx * (off + w / 2); m.position.y = -grow * 0.0; off += w; group.add(m);
        if (grow > 0) m.position.y = 0;
      }
    }
    // front board under the keys and the rail above them
    const frontBoard = new THREE.Mesh(new THREE.BoxGeometry(WID, 6.4, 1.1), bodyMat); frontBoard.position.set(0, 3.4, 14.95); group.add(frontBoard);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(WID, 0.5, 1.4), plastic); lip.position.set(0, 6.9, 14.95); group.add(lip);
    const bed = new THREE.Mesh(new THREE.BoxGeometry(WID, 0.4, 10), plastic); bed.position.set(0, BED_Y + 0.15, 9.6); group.add(bed);
    // top ridge rails along the panel top (the stepped dark rails in the photo)
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(WID, 0.35, 1.0 + i * 0.1), i === 1 ? plastic : bodyMat2);
      r.position.set(0, 15.5 + 0.17 + i * 0.35, 0.3 - i * 0.18); r.rotation.x = 0; group.add(r);
    }

    // ---------------------------------------------------------------- the sloped panel and its parts
    const slopeLen = Math.hypot(HINGE_Z + 0.4 - 0.8, 15.5 - BED_Y), slopeAng = Math.atan2(15.5 - BED_Y, (HINGE_Z + 0.4) - 0.8);   // from the horizontal
    const panel = new THREE.Group();
    panel.position.set(0, (BED_Y + 15.5) / 2, (HINGE_Z + 0.4 + 0.8) / 2);
    // local +Z of the panel must point out of the slope (up and toward the player); rotate about x so +Y runs up the slope
    panel.rotation.x = -(Math.PI / 2 - slopeAng);
    group.add(panel);
    const panelPlate = new THREE.Mesh(new THREE.BoxGeometry(WID - 0.6, slopeLen, 0.3), panelMat); panelPlate.position.z = 0.05; panel.add(panelPlate);
    const ledMats = [];
    function led(x, y, color, size = 0.55, w = size) {
      const m = new THREE.MeshStandardMaterial({ color: 0x120404, emissive: color, emissiveIntensity: 0.1, roughness: 0.3 });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, size, 0.35), m); mesh.position.set(x, y, 0.3); panel.add(mesh);
      ledMats.push(m); return m;
    }
    const dials = [];
    function knob(x, y, r = 0.95) {
      const k = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.05, 0.9, 20), knobMat); k.rotation.x = Math.PI / 2; k.position.set(x, y, 0.65); panel.add(k);
      const tick = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, r * 0.8), new THREE.MeshBasicMaterial({ color: 0xbbbbbb }));
      tick.position.set(0, 0.47, -r * 0.4); k.add(tick);
      k.rotation.y = (rnd() - 0.5) * 2.4;
      dials.push({ mesh: k, cur: k.rotation.y, from: k.rotation.y, to: k.rotation.y, t0: 0, dur: 1 });
      return k;
    }
    // left cluster: four knobs, two rows, red lights
    const kpos = [[-14.5, 3.2], [-11, 3.2], [-7.5, 3.2], [-4, 3.2], [-14.5, -0.4], [-11, -0.4], [-7.5, -0.4], [-4, -0.4]];
    kpos.forEach(([x, y], i) => knob(x, y, i < 4 ? 0.95 : 0.8));
    const switchLeds = [led(-15.2, 4.4 + 0.1, 0xff2a2a, 0.5), led(-15.2, -3.3, 0xff2a2a, 0.5)];
    // vertical red bars (the little lit rectangles of the photo), one per tube: they follow the tube's energy
    const bars = [];
    for (let i = 0; i < 3; i++) bars.push(led(-2 + i * 1.2 + 0.0, -3.5, 0xff3030, 1.5, 0.55));
    // the meter: five red squares
    const meter = []; for (let i = 0; i < 5; i++) meter.push(led(1.2 + i * 1.15, 3.6, 0xff2020, 0.62));
    // display window: a canvas
    const dispCanvas = document.createElement('canvas'); dispCanvas.width = 320; dispCanvas.height = 80;
    const dispTex = new THREE.CanvasTexture(dispCanvas); dispTex.colorSpace = THREE.SRGBColorSpace;
    const dispMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, emissiveMap: dispTex, emissiveIntensity: 1.1, roughness: 0.2 });
    const dispFrame = new THREE.Mesh(new THREE.BoxGeometry(11.2, 3.6, 0.3), plastic); dispFrame.position.set(8.0, 1.2, 0.25); panel.add(dispFrame);
    const disp = new THREE.Mesh(new THREE.PlaneGeometry(10.2, 2.55), dispMat); disp.position.set(8.0, 1.2, 0.42); panel.add(disp);
    // right edge: two square buttons and the blue light
    const rbtn = [led(14.6, 4.4, 0xff2020, 0.9), led(14.6, 2.2, 0xff2020, 0.9)];
    const blue = led(14.6, -0.6, 0x35b0ff, 0.55);
    for (const x of [8.4, 11.4]) { /* two small slider slots */ const s = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, 0.1), new THREE.MeshBasicMaterial({ color: 0x050505 })); s.position.set(x, -2.6, 0.22); panel.add(s); const sk = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.7, 0.5), knobMat); sk.position.set(x, -2.1 + (x > 10 ? 0.5 : -0.6), 0.45); panel.add(sk); }
    // engraved-looking white marks under the knobs
    const marks = document.createElement('canvas'); marks.width = 512; marks.height = 128; { const g = marks.getContext('2d'); g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, 512, 128); g.strokeStyle = 'rgba(200,190,180,.5)'; g.lineWidth = 2; for (let i = 0; i < 4; i++) { g.strokeRect(30 + i * 118, 90, 80, 24); } }
    const markTex = new THREE.CanvasTexture(marks); markTex.colorSpace = THREE.SRGBColorSpace;
    const markPlane = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshBasicMaterial({ map: markTex, transparent: true, opacity: 0.55, depthWrite: false }));
    markPlane.position.set(-9.2, -2.6, 0.22); panel.add(markPlane);
    for (const ch of panel.children) if (ch !== panelPlate) ch.position.x *= SX;   // A6: spread the panel's parts over the longer panel

    // ---------------------------------------------------------------- keys
    // env map for gloss: a dark room with two soft bright panels
    function makeEnv(renderer) {
      const sc = new THREE.Scene(); sc.background = new THREE.Color(0x050304);
      const mk = (w, h, p, r, c) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(...p); m.lookAt(0, 0, 0); sc.add(m); };
      mk(30, 14, [-20, 22, 24], 0, 0xcfc3bd); mk(18, 30, [30, 10, 6], 0, 0x7a2018); mk(40, 4, [0, 34, -10], 0, 0xffffff); mk(30, 10, [0, 6, 30], 0, 0x5a1a16);
      const pm = new THREE.PMREMGenerator(renderer); const t = pm.fromScene(sc, 0.04).texture; pm.dispose(); return t;
    }
    const keys = [];
    const isBlack = (n) => [1, 3, 6, 8, 10].includes(n % 12);
    // x positions: whites in sequence, blacks between
    const whites = NOTES.filter((n) => !isBlack(n));                 // A7: black keys back; the whites set the width
    const nWhite = whites.length, kbW = nWhite * WHITE_W, x0 = -kbW / 2;
    function keyGeo(len, hBack, hFront, width) {
      const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(len, 0); s.lineTo(len, hFront); s.lineTo(0, hBack); s.closePath();
      const geo = new THREE.ExtrudeGeometry(s, { depth: width - 0.3, bevelEnabled: true, bevelSize: 0.14, bevelThickness: 0.14, bevelSegments: 2, curveSegments: 1 });
      geo.rotateY(-Math.PI / 2); geo.translate((width - 0.3) / 2, 0, 0);
      return geo;
    }
    const whiteGeo = keyGeo(KEY_FRONT - HINGE_Z, 2.9, 1.7, WHITE_W);
    const blackGeo = keyGeo(5.4, 1.5, 1.2, 1.55);
    const keyGroup = new THREE.Group(); group.add(keyGroup);
    for (let i = 0; i < NOTES.length; i++) {
      const note = NOTES[i], black = isBlack(note);                  // A7: black keys back
      const x = black ? x0 + (whites.indexOf(note - 1) + 1) * WHITE_W   // on the line between the two whites
                      : x0 + (whites.indexOf(note) + 0.5) * WHITE_W;
      const mat = new THREE.MeshStandardMaterial({ color: black ? 0x0d0d10 : 0xe6dfd2, roughness: black ? 0.3 : 0.38, metalness: 0, emissive: 0xff1c10, emissiveIntensity: 0 });
      const mesh = new THREE.Mesh(black ? blackGeo : whiteGeo, mat);
      const g = new THREE.Group();
      g.position.set(x, BED_Y + 0.35 + (black ? 2.25 : 0), HINGE_Z); g.add(mesh); keyGroup.add(g);
      mesh.userData.key = i;
      // glow halo lying on the key's top (additive)
      const len = black ? 5.4 : KEY_FRONT - HINGE_Z;
      const halo = new THREE.Mesh(new THREE.PlaneGeometry(black ? 2.4 : 3.6, len * 1.15), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0, color: 0xff3a2a }));
      halo.rotation.x = -Math.PI / 2 + Math.atan2(black ? 0.3 : 1.2, len); halo.position.set(0, (black ? 1.55 : 2.2) + 0.3, len * 0.5); g.add(halo);
      keys.push({ note, black, group: g, mesh, mat, halo, x, hinge: HINGE_Z, len, top: black ? 1.45 : 2.0, depth: 0, glow: 0, target: 0, vel: 0 });
    }
    // little hinge strip in the back
    const hs = new THREE.Mesh(new THREE.BoxGeometry(kbW + 0.4, 1.2, 0.5), plastic); hs.position.set(0, BED_Y + 0.9, HINGE_Z - 0.2); group.add(hs);

    // ---------------------------------------------------------------- the three tubes
    const tubes = [];
    // A9 (request 42): much smaller tubes (A8: 12 cm tall, 2 cm radius), each with a glowing red/orange element, and no bubbles
    const TUBE_X = [-6, 0, 6], TUBE_H = [4.6, 4.6, 4.6], TUBE_RS = [1.0, 1.0, 1.0], TUBE_Z = -5.2, TUBE_R = 1.0, DECK_Y = 16.4;
    const bubbleVert = `
      attribute vec4 seed;   // x: angle, y: radius frac, z: speed, w: phase
      attribute float sz;
      uniform float uPh, uH, uR, uEn, uPx, uGlow, uT;
      varying float vA; varying float vS;
      void main() {
        float ph = fract(seed.w + uPh * seed.z);
        float q = fract(seed.x * 3.7 + seed.w * 5.1);
        float vis = smoothstep(q, q + 0.1, 0.30 + 0.70 * uEn + 0.1);
        float y = ph * uH;
        float w = sin(uT * (1.3 + seed.z * 2.0) + seed.w * 40.0) * 0.1;
        float rad = seed.y * (uR - 0.45);
        vec3 p = vec3(cos(seed.x + w) * rad + w * 0.5, y, sin(seed.x + w) * rad);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float grow = 0.65 + 0.7 * ph;
        gl_PointSize = max(1.5, sz * grow * (1.0 + 0.6 * uEn) * uPx / -mv.z) * (0.2 + 0.8 * vis);
        gl_Position = projectionMatrix * mv;
        vA = vis * (0.55 + 0.45 * smoothstep(0.0, 0.12, ph)) * (1.0 - smoothstep(0.93, 1.0, ph)) * (0.35 + 0.9 * uGlow);
        vS = sz;
      }`;
    const bubbleFrag = `
      varying float vA; varying float vS;
      void main() {
        vec2 q = gl_PointCoord - 0.5; float d = length(q) * 2.0;
        if (d > 1.0) discard;
        float ring = smoothstep(0.55, 0.92, d) * (1.0 - smoothstep(0.92, 1.0, d));
        float hl = smoothstep(0.32, 0.0, length(q - vec2(-0.17, -0.17)));
        float fill = 0.16 * (1.0 - d);
        float a = (ring * 0.85 + hl * 0.9 + fill) * vA;
        gl_FragColor = vec4(vec3(1.0, 0.62, 0.55) * a * 1.4, a);
      }`;
    const liquidVert = `varying vec3 vN; varying vec3 vV; varying float vY; uniform float uH;
      void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vY = position.y / uH; gl_Position = projectionMatrix * mv; }`;
    const liquidFrag = `varying vec3 vN; varying vec3 vV; varying float vY; uniform float uGlow, uPulse; uniform vec3 uCol;
      void main() {
        float fr = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
        float base = pow(1.0 - clamp(vY, 0.0, 1.0), 1.7);
        float a = (0.07 + 0.25 * base + 0.15 * fr) * (0.2 + 1.0 * uGlow) + 1.5 * uPulse * (0.3 + base);
        vec3 c = mix(uCol, vec3(1.0, 0.85, 0.65), clamp(base * base * 0.4 + uPulse * 0.9, 0.0, 1.0));
        gl_FragColor = vec4(c * a, a);
      }`;
    for (let t = 0; t < 3; t++) {
      const TUBE_R = TUBE_RS[t], H = TUBE_H[t], tg = new THREE.Group(); tg.position.set(TUBE_X[t], DECK_Y, TUBE_Z); group.add(tg);
      // A10 (request 51): a small vacuum tube like the photo: clear glass with a domed top, a metal base, a dark plate and grid rods inside,
      // and a glowing orange filament near the foot; no coil, no bubbles, no coloured liquid.
      const metal = new THREE.MeshStandardMaterial({ color: 0x9a9aa2, metalness: 0.9, roughness: 0.32 });
      const darkM = new THREE.MeshStandardMaterial({ color: 0x2b2522, metalness: 0.7, roughness: 0.45 });
      const brass = new THREE.MeshStandardMaterial({ color: 0xb08a50, metalness: 0.85, roughness: 0.4 });
      const BH = 0.9;                                                                   // the metal base
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(TUBE_R * 1.1, TUBE_R * 1.18, BH, 32), metal); collar.position.y = BH / 2 - 0.3; tg.add(collar);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(TUBE_R * 1.12, 0.07, 8, 32), metal); ring.rotation.x = Math.PI / 2; ring.position.y = BH - 0.3; tg.add(ring);
      const inner = new THREE.Group(); inner.position.y = BH - 0.3; tg.add(inner);
      // clear glass envelope with a domed top (lathe)
      const pts = []; pts.push(new THREE.Vector2(0.001, 0)); pts.push(new THREE.Vector2(TUBE_R, 0)); pts.push(new THREE.Vector2(TUBE_R, H));
      for (let a = 1; a <= 14; a++) { const th = a / 14 * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(th) * TUBE_R, H + Math.sin(th) * TUBE_R * 0.8)); }
      const glass = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, roughness: 0.03, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03, depthWrite: false, side: THREE.DoubleSide }));
      glass.renderOrder = 3; inner.add(glass);
      // (the liquid, the bubbles and the red shell of A8 are not added; their materials stay so update() need not change)
      const liqMat = new THREE.ShaderMaterial({ vertexShader: liquidVert, fragmentShader: liquidFrag, uniforms: { uH: { value: 1 }, uGlow: { value: 0.5 }, uPulse: { value: 0 }, uCol: { value: new THREE.Color(0xff8a30) } } });
      const bubMat = new THREE.ShaderMaterial({ vertexShader: bubbleVert, fragmentShader: bubbleFrag, uniforms: { uT: { value: 0 }, uPh: { value: 0 }, uH: { value: 1 }, uR: { value: 1 }, uEn: { value: 0 }, uPx: { value: 600 }, uGlow: { value: 0.5 } } });
      // inside: a dark plate (the anode) with a mica cap, two brass grid rods, a pin foot; and the glowing filament
      const plate = new THREE.Mesh(new THREE.BoxGeometry(TUBE_R * 0.85, H * 0.52, TUBE_R * 0.45), darkM); plate.position.y = H * 0.22 + H * 0.26 + 0.2; inner.add(plate);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(TUBE_R * 0.62, TUBE_R * 0.62, 0.05, 20), darkM); cap.position.y = H * 0.76 + 0.2; inner.add(cap);
      for (const sx of [-1, 1]) { const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, H * 0.56, 6), brass); rod.position.set(sx * TUBE_R * 0.58, H * 0.5, 0); inner.add(rod); }
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(TUBE_R * 0.55, TUBE_R * 0.7, 0.25, 20), darkM); foot.position.y = 0.12; inner.add(foot);
      const elemBase = new THREE.Color([0xff8a2a, 0xff7a1a, 0xff9a3a][t]), elemMat = new THREE.MeshBasicMaterial({ color: elemBase.clone() });
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.1, H * 0.4, 0.06), elemMat); bar.position.set(-TUBE_R * 0.2, H * 0.48, TUBE_R * 0.24); inner.add(bar);   // the bright glowing strip on the plate
      const glowFoot = new THREE.Mesh(new THREE.CylinderGeometry(TUBE_R * 0.4, TUBE_R * 0.5, 0.18, 16), elemMat); glowFoot.position.y = 0.38; inner.add(glowFoot);   // the glowing filament at the foot
      // hot spot at the foot, and a soft orange glow through the glass
      const lamp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff8a40, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.8 }));
      lamp.scale.set(TUBE_R * 2.4, TUBE_R * 2.4, 1); lamp.position.y = 0.45; lamp.renderOrder = 4; inner.add(lamp);
      const top = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff7a30, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.25 }));
      top.scale.set(TUBE_R * 3.2, H * 1.0, 1); top.position.y = H * 0.45; top.renderOrder = 4; inner.add(top);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff8a30, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0 }));
      halo.scale.set(TUBE_R * 6, H * 1.5, 1); halo.position.y = H * 0.45; halo.renderOrder = 5;
      const shell = { material: { opacity: 0 } };   // (A8's red shell is gone)
      // the light that the tube throws on the deck and its neighbours
      const light = new THREE.PointLight(0xff8a3a, 0, 60, 2); light.position.set(0, 3, 0); tg.add(light);
      tubes.push({ group: tg, H, liqMat, bubMat, elemMat, elemBase, lamp, top, light, energy: 0, glass, ph: 0, halo, shell, fl: 1, flT: 1, flNext: 0 });
    }

    // ---------------------------------------------------------------- cables, floor glow, key lights
    const cableMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.5 });
    const backCables = [[[10, 12, -12], [13, 9, -16], [20, 2, -21], [24, -16, -23], [25, -45, -22]],
                    [[12, 14, -12], [16, 11, -18], [26, 5, -26], [34, -14, -28], [36, -50, -26]],
                    [[8, 11, -12.3], [6, 6, -18], [8, -2, -24], [12, -20, -28], [14, -50, -30]]];
    for (const c of backCables) {
      const curve = new THREE.CatmullRomCurve3(c.map((p) => new THREE.Vector3(...p)));
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.28, 8, false), cableMat); group.add(m);
    }
    // (A3: no floor and no table: the toy floats in the dark; four little feet)
    for (const [fx, fz] of [[-(WID / 2 - 0.6), -10], [WID / 2 - 0.6, -10], [-(WID / 2 - 0.6), 13], [WID / 2 - 0.6, 13]]) { const ft = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.7, 14), plastic); ft.position.set(fx, -0.35, fz); group.add(ft); }
    const keyLights = [];
    for (let i = 0; i < 5; i++) { const l = new THREE.PointLight(0xff2a1c, 0, 22, 2); l.position.set(0, 14, 10); group.add(l); keyLights.push(l); }

    // ---------------------------------------------------------------- display
    let lastDisp = '';
    function drawDisplay(d) {
      const sig = JSON.stringify(d); if (sig === lastDisp) return; lastDisp = sig;
      const g = dispCanvas.getContext('2d'), W = dispCanvas.width, Hh = dispCanvas.height;
      // A8 (request 30): the display's colour and a small picture change with the instrument: red and a piano for the piano,
      // amber and an electric piano on its stand, green and organ pipes for the organ; the old red and no picture for the toy tones
      const PAL = { piano: ['#5a0b0b', '#2a0303', '#ff6a60', '#ffd8d0'], epiano: ['#5c3404', '#2a1501', '#ffb040', '#ffe8c0'],
        organ: ['#0b4a1c', '#02200a', '#60ff8a', '#d0ffd8'], toy: ['#5a0b0b', '#2a0303', '#ff6a60', '#ffd8d0'] };
      const [c0, c1, glow, ink] = PAL[d.icon] || PAL.toy;
      const grd = g.createLinearGradient(0, 0, 0, Hh); grd.addColorStop(0, c0); grd.addColorStop(1, c1); g.fillStyle = grd; g.fillRect(0, 0, W, Hh);
      g.shadowColor = glow; g.shadowBlur = 12; g.fillStyle = ink; g.strokeStyle = ink; g.textBaseline = 'middle';
      g.font = '700 50px "Consolas", "Courier New", monospace'; g.textAlign = 'left'; g.fillText(d.note || '---', 12, Hh / 2 + 3);
      // the picture, between the note and the words
      const ix = 116, iy = 14, iw = 62, ih = 52;
      g.lineWidth = 2; g.shadowBlur = 6;
      if (d.icon === 'piano') {           // a grand piano seen from above-front: a keyboard and a curved lid
        g.beginPath(); g.moveTo(ix, iy + ih); g.lineTo(ix, iy + 4); g.quadraticCurveTo(ix + iw * 0.55, iy - 2, ix + iw * 0.7, iy + 18); g.quadraticCurveTo(ix + iw, iy + 30, ix + iw, iy + ih); g.stroke();
        for (let k = 0; k < 7; k++) g.strokeRect(ix + k * iw / 7, iy + ih - 14, iw / 7, 14);
        for (const k of [1, 2, 4, 5, 6]) g.fillRect(ix + k * iw / 7 - 3, iy + ih - 14, 6, 8);
      } else if (d.icon === 'epiano') {   // a flat electric piano on an X stand
        g.strokeRect(ix, iy + 10, iw, 14);
        for (let k = 0; k < 9; k++) g.strokeRect(ix + 2 + k * (iw - 4) / 9, iy + 16, (iw - 4) / 9, 8);
        g.beginPath(); g.moveTo(ix + 10, iy + 26); g.lineTo(ix + iw - 10, iy + ih); g.moveTo(ix + iw - 10, iy + 26); g.lineTo(ix + 10, iy + ih); g.stroke();
      } else if (d.icon === 'organ') {    // a row of pipes
        const hs = [0.55, 0.75, 0.95, 1, 0.95, 0.75, 0.55];
        hs.forEach((h, k) => { const x = ix + 3 + k * (iw - 6) / 7, w = (iw - 6) / 7 - 3, top = iy + ih - h * ih; g.strokeRect(x, top, w, h * ih - 2); g.fillRect(x, top + h * ih * 0.62, w, 3); });
      }
      g.shadowBlur = 12;
      g.font = '600 18px "Consolas", "Courier New", monospace'; g.textAlign = 'right'; g.fillText((d.playing ? '▶ ' : '') + (d.song || ''), W - 10, 24); g.fillText(d.tone || '', W - 10, 56);
      dispTex.needsUpdate = true;
    }

    // ---------------------------------------------------------------- the eight dials (A2): ease to new positions, one after another
    let nowT = 0;
    function setDials(angles, jump) {
      dials.forEach((d, i) => {
        const a = angles[i % angles.length];
        if (jump) { d.cur = d.from = d.to = a; d.mesh.rotation.y = a; return; }
        d.from = d.cur; d.to = a; d.t0 = nowT + i * 0.11; d.dur = 0.9 + 0.05 * i;
      });
    }
    // ---------------------------------------------------------------- jacks and their lights (A6: no patch cables, no hanger rail)
    const JACK_X = [-15, -12, -9, -6, 6, 9, 12, 15].map((x) => x * SX), JACK_Y = 3.1, JACK_Z = 15.5;
    const jackMat = new THREE.MeshStandardMaterial({ color: 0x8a8a90, roughness: 0.3, metalness: 0.9 });
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    JACK_X.forEach((x) => {
      const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.35, 6), jackMat); nut.rotation.x = Math.PI / 2; nut.position.set(x, JACK_Y, JACK_Z + 0.1); group.add(nut);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.12, 8, 18), jackMat); ring.position.set(x, JACK_Y, JACK_Z + 0.3); group.add(ring);
      const hole = new THREE.Mesh(new THREE.CircleGeometry(0.42, 16), holeMat); hole.position.set(x, JACK_Y, JACK_Z + 0.32); group.add(hole);
      const lm = new THREE.MeshStandardMaterial({ color: 0x2a1004, emissive: 0xffa21c, emissiveIntensity: 3.2, roughness: 0.3 });   // lit, steady
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.3, 12), lm); l.rotation.x = Math.PI / 2; l.position.set(x, JACK_Y + 1.9, JACK_Z + 0.1); group.add(l);
      const lh = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffa21c, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 0.9 }));
      lh.scale.set(2.6, 2.6, 1); lh.position.set(x, JACK_Y + 1.9, JACK_Z + 0.5); group.add(lh);
    });
    const cables = [], plugMeshes = [];
    function setCable() { /* A6: no patch cables */ }
    function updateCables() { /* A6: no patch cables */ }

    // ---------------------------------------------------------------- per-frame
    const tmpV = new THREE.Vector3();
    function update(t, dt, S) {
      nowT = t;
      for (const d of dials) { const u = Math.max(0, Math.min(1, (t - d.t0) / d.dur)), e = u * u * (3 - 2 * u); d.cur = d.from + (d.to - d.from) * e; d.mesh.rotation.y = d.cur; }
      updateCables(dt);
      const glowAll = S.glow === undefined ? 1 : S.glow, bubOn = S.bubbles === false ? 0 : 1;
      // keys
      let totalGlow = 0;
      for (const k of keys) {
        const want = k.target;
        k.depth += (want - k.depth) * Math.min(1, dt * (want > k.depth ? 40 : 18));
        k.glow = want > 0.01 ? Math.min(1, k.glow + dt * 12) : Math.max(0, k.glow - dt * 2.6);
        k.group.rotation.x = k.depth * 0.115;
        k.mat.emissiveIntensity = k.glow * (k.black ? 2.4 : 1.7) * glowAll;
        k.halo.material.opacity = k.glow * 0.85 * glowAll;
        totalGlow += k.glow;
      }
      // lights follow the brightest keys
      const order = keys.filter((k) => k.glow > 0.02).sort((a, b) => b.glow - a.glow);
      keyLights.forEach((l, i) => {
        const k = order[i];
        if (!k) { l.intensity = 0; return; }
        tmpV.set(0, 0, 0); k.group.localToWorld(tmpV); l.position.copy(group.worldToLocal(tmpV)); l.position.y += 2.6; l.position.z += k.len * 0.55;
        l.intensity = 220 * k.glow * glowAll;
      });
      // tubes
      const E = S.energy || [0, 0, 0];
      tubes.forEach((tb, i) => {
        tb.energy += (E[i] - tb.energy) * Math.min(1, dt * 10);
        const p = 0, e = 0.3;                                         // A5: the tubes do not react to keys; a steady glow (with their own flicker)
        // flicker: each tube its own, a new random brightness every 40-130 ms, smoothed; stronger while it is lit
        if (t >= tb.flNext) { tb.flT = 0.62 + 0.55 * rnd() + 0.25 * e * (rnd() - 0.5); tb.flNext = t + 0.04 + 0.09 * rnd(); }
        tb.fl += (tb.flT - tb.fl) * Math.min(1, dt * 22);
        const gl = (0.28 + 1.9 * e) * tb.fl * glowAll;
        tb.ph += dt * 0.11 * (1.5 + 1.5 * tb.energy + 9 * p);        // leisurely at rest, a surge on its own keys
        // (A4: the tube itself never changes shape or size; only its light changes)
        tb.liqMat.uniforms.uGlow.value = gl; tb.liqMat.uniforms.uPulse.value = Math.min(1, 0.4 * tb.energy + p) * tb.fl * glowAll;
        tb.bubMat.uniforms.uT.value = t; tb.bubMat.uniforms.uPh.value = tb.ph; tb.bubMat.uniforms.uEn.value = Math.min(1, 0.4 * tb.energy + p); tb.bubMat.uniforms.uGlow.value = gl; tb.bubMat.uniforms.uPx.value = S.px || 600;
        tb.bubMat.visible = false;
        tb.elemMat.color.copy(tb.elemBase).multiplyScalar((0.85 + 0.55 * (tb.fl - 0.6)) * (0.35 + 0.65 * Math.min(1.4, glowAll)));   // A9: the element glows and flickers
        tb.lamp.material.opacity = Math.min(1, (0.1 + 0.9 * e) * tb.fl) * (0.3 + 0.7 * glowAll);
        tb.top.material.opacity = (0.03 + 0.8 * e) * tb.fl * glowAll;
        tb.halo.material.opacity = Math.min(1, 1.0 * e * tb.fl) * glowAll;
        tb.shell.material.opacity = Math.min(0.9, 0.05 + 1.0 * e * tb.fl) * glowAll;
        tb.light.intensity = (5 + 900 * e) * tb.fl * glowAll;
      });
      // little lights
      const eMax = Math.max(E[0], E[1], E[2]), eSum = (E[0] + E[1] + E[2]) / 3;
      // (A5: the panel's little lights are steady; they do not react to keys)
      meter.forEach((m, i) => { m.emissiveIntensity = (i < 3 ? 2.2 : 0.18) * glowAll; });
      bars.forEach((m) => { m.emissiveIntensity = 1.4 * glowAll; });
      switchLeds.forEach((m) => { m.emissiveIntensity = 1.6 * glowAll; });
      rbtn[0].emissiveIntensity = (S.display && S.display.playing ? 2.4 : 0.35) * glowAll;
      rbtn[1].emissiveIntensity = 1.2 * glowAll;
      blue.emissiveIntensity = (S.display && S.display.beat ? 3.0 : 0.5);
      drawDisplay(S.display || {});
    }

    // where a fingertip should land on a key (world space), and which way is "down"
    function keyTarget(note) {
      const k = keys.find((q) => q.note === note); if (!k) return null;
      group.updateMatrixWorld(true);
      const pos = new THREE.Vector3(0, k.top + 0.1, k.len * (k.black ? 0.6 : 0.78)); k.group.localToWorld(pos);
      return { pos, normal: new THREE.Vector3(0, 1, 0).transformDirection(group.matrixWorld), depthMax: Math.sin(0.115) * (k.len * 0.8), width: k.black ? 1.5 : WHITE_W - 0.3 };
    }
    return { group, keys, tubes, keyTarget, update, dials, setDials, cables, setCable, plugMeshes, makeEnv, panel, glassMats: tubes.map((t) => t.glass.material),
      mats: { key: keys.map((k) => k.mat), body: [bodyMat, bodyMat2, plastic, panelMat, knobMat] }, dims: { WHITE_W, BED_Y, HINGE_Z, KEY_FRONT, width: kbW, tubeTop: DECK_Y + 0.8 + Math.max(...TUBE_H) + TUBE_R } };
  }
  global.CT78Model = { build };
})(window);
