/* CT78.A10.Synth -- the controls of the original CT68 dolls (their CONTROLS list, Sing, Talk, Spin 360, Blink, Auto blink),
 * in the "Doll" group of the right-hand column. They drive the doll that plays the toy.
 * A slider takes over its control (CT78Doll.manual); double-click it to give it back to the doll. */
(function () {
  'use strict';
  const D = window.CT78Doll, CC = window.CT68Carolers, root = document.getElementById('dollctl');
  const rows = {};
  let autoBlink = true;
  const out = (c, v) => (v === undefined ? 'auto' : v.toFixed(c.max - c.min > 20 ? 0 : 2) + (c.unit || ''));
  for (const c of CC.CONTROLS) {
    const row = document.createElement('div'); row.className = 'pr'; row.title = c.note || '';
    row.innerHTML = '<span>' + c.label.replace('candle arm', 'arm') + '</span><span class="v">auto</span><input type="range" min="' + c.min + '" max="' + c.max + '" step="' + (c.max - c.min) / 400 + '" value="' + c.def + '">';
    const el = row.querySelector('input'), v = row.querySelector('.v');
    el.addEventListener('input', () => { D.manual[c.key] = +el.value; v.textContent = out(c, +el.value); });
    el.addEventListener('dblclick', () => give(c));
    rows[c.key] = { el, v, c }; root.appendChild(row);
  }
  function give(c) {
    delete D.manual[c.key]; rows[c.key].el.value = c.def; rows[c.key].v.textContent = out(c, D.ready ? D.car.shown[c.key] : c.def);
    if (D.ready) D.car.setPose({ [c.key]: c.def });
  }
  const btns = document.createElement('div'); btns.className = 'btns'; root.appendChild(btns);
  const mk = (label, title, f) => { const b = document.createElement('button'); b.className = 'tog'; b.title = title; b.innerHTML = '<span class="t">' + label + '</span>'; b.addEventListener('click', () => { if (D.ready) { f(b); sync(); } }); btns.appendChild(b); return b; };
  const sing = mk('Sing', 'the doll sings: her mouth forms words, with a slight sway and a slight turn of the head', () => D.car.sing());
  const talk = mk('Talk', 'the doll talks: quick small mouth shapes, small nods and glances', () => D.car.talk());
  mk('Spin 360°', 'she turns once round on her stand', () => D.car.spin360());
  mk('Blink', 'one blink', () => D.car.blink());
  const ab = mk('Auto blink', 'blink very occasionally, every 8 to 20 seconds', () => { autoBlink = !autoBlink; D.car.setAutoBlink(autoBlink); });
  const all = mk('All auto', 'give every control back to the doll', () => { for (const k in rows) give(rows[k].c); if (D.car.singing) D.car.sing(false); if (D.car.talking) D.car.talk(false); });
  all.classList.remove('tog');
  function sync() { sing.classList.toggle('on', !!D.car.singing); talk.classList.toggle('on', !!D.car.talking); ab.classList.toggle('on', autoBlink); }
  ab.classList.add('on');
  // A10 (request 53): as in CT68, a slider that is not taken over moves with the doll (it shows what she is doing now)
  let dragging = null;
  for (const k in rows) { rows[k].el.addEventListener('pointerdown', () => { dragging = k; }); }
  addEventListener('pointerup', () => { dragging = null; });
  (function follow() {
    requestAnimationFrame(follow);
    if (!D.ready) return;
    const shown = D.car.shown;
    for (const k in rows) {
      if (k in D.manual || dragging === k) continue;
      const { el, v, c } = rows[k], x = shown[c.key];
      el.value = x; v.textContent = out(c, x);
    }
  })();
  const note = document.createElement('div'); note.className = 'note';
  note.textContent = 'The sliders follow the doll. Move one to take that control over; double-click it to give it back. The arm raise only shows while her hands are not playing.';
  root.appendChild(note);
})();
