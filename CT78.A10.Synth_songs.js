/* CT78.A10.Synth -- the songs for play mode.
 *
 * A8: new tunes (request 28): Silent Night, Joy to the World, Beethoven's Für Elise and J. S. Bach's Prelude in C (BWV 846).
 * A9 (requests 39-43): the playlist is Silent Night, Joy to the World (four verses) and We Wish You a Merry Christmas; Für Elise and the Prelude are kept in CT78Songs.OTHER, not played.
 * All are public domain (Gruber 1818 / Mohr, tr. Young 1859; Watts 1719 / Mason 1839; Beethoven 1810; Bach 1722).
 * The arrangements are simple ones written here from memory for a 34-key toy (C3..A5): a tune for the right hand and a
 * few bass notes for the left. They are not checked against a score.
 *
 * Each song has its instrument (request 29: 0 piano, 1 electric piano, 2 organ; see CT78.A10.Synth_sound.js) and its
 * tempo (quarter notes per minute).
 *
 * Notation: "E4:1" = note, a colon, length in beats; "R:1" = rest; "C3+G3:3" = two keys at once (the hand hits the
 * first one, the other goes down by itself: request 34); "G4:1.5/Si" = a note with the syllable sung on it (the doll
 * mouths it: request 37). A note with no syllable in a sung line holds the one before.
 * Events: {t (beats), notes [midi], dur (beats), vel, hand 'R' | 'L', syl}.
 */
(function (global) {
  'use strict';
  const NAMES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function midi(s) { const m = /^([A-G])([#b]?)(-?\d)$/.exec(s); if (!m) throw new Error('bad note ' + s); return 12 * (+m[3] + 1) + NAMES[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0); }
  /** one hand's part -> events */
  function part(text, hand, soft) {
    const ev = []; let t = 0, n = 0;
    for (const tok of text.trim().split(/\s+/)) {
      const [nd, syl] = tok.split('/'), [nm, d] = nd.split(':'), dur = parseFloat(d);
      if (!(dur > 0)) throw new Error('bad length ' + tok);
      if (nm !== 'R') ev.push({ t, notes: nm.split('+').map(midi), dur: dur * 0.9, vel: (n % 4 === 0 ? 0.92 : 0.74) * soft, hand, syl: syl || '' });
      t += dur; n++;
    }
    return { ev, beats: t };
  }
  /** a song from its right- and left-hand parts */
  function song(name, tone, bpm, right, left, sung) {
    const r = part(right, 'R', 1), l = part(left || 'R:1', 'L', 0.8);
    const events = r.ev.concat(l.ev).sort((a, b) => a.t - b.t || (a.hand === 'L' ? -1 : 1));
    return { name, tone, bpm, sung: !!sung, events, beats: Math.max(r.beats, l.beats) };
  }
  // the old notation (one part, no hands) is still read for anything that calls parse()
  function parse(text) { const p = part(text, 'R', 1); return { events: p.ev, beats: p.beats }; }

  const SONGS = [];

  // ---- Silent Night (3/4), electric piano. Right: the tune with the words of the first verse; left: one bass note per bar
  SONGS.push(song('Silent Night', 1, 76,
    'G4:1.5/Si A4:.5 G4:1/lent E4:3/night G4:1.5/Ho A4:.5 G4:1/ly E4:3/night ' +
    'D5:2/All D5:1/is B4:3/calm C5:2/all C5:1/is G4:3/bright ' +
    'A4:2/Round A4:1/yon C5:1.5/vir B4:.5 A4:1/gin G4:1.5/mo A4:.5/ther G4:1/and E4:3/child ' +
    'A4:2/Ho A4:1/ly C5:1.5/in B4:.5/fant A4:1/so G4:1.5/ten A4:.5/der G4:1/and E4:3/mild ' +
    'D5:2/Sleep D5:1/in F5:1.5/hea D5:.5/ven B4:1/ly C5:3/peace E5:3 ' +
    'C5:1.5/Sleep G4:.5/in E4:1/hea G4:1.5/ven F4:.5/ly D4:1 C4:6/peace',
    'C3+G3:3 C3+G3:3 C3+G3:3 C3+G3:3 G3+D4:3 G3+D4:3 C3+G3:3 C3+G3:3 F3+C4:3 F3+C4:3 C3+G3:3 C3+G3:3 ' +
    'F3+C4:3 F3+C4:3 C3+G3:3 C3+G3:3 G3+D4:3 G3+D4:3 C3+G3:3 C3+G3:3 C3+G3:3 G3+D4:3 C3+G3:6', true));

  // ---- Joy to the World (2/4), organ: four verses (Watts 1719), each the same tune and bass; "*" is where a syllable goes, a plain note holds the one before
  // A9: slots per verse: line 1 (8), line 2 (6), line 3 (8), the refrain three times (6, 6, 10; '' = the note holds the syllable before)
  {
    const TUNE = 'D5:1/* C#5:.75/* B4:.25/* A4:1.5/* G4:.5/* F#4:1/* E4:1/* D4:1.5/* ' +
      'A4:.5/* B4:1.5/* B4:.5/* C#5:1.5/* C#5:.5/* D5:1.5/* ' +
      'D5:.5/* D5:.5/* C#5:.5/* B4:.5/* A4:.5/* A4:.75/* G4:.25/* F#4:1/* ' +
      'F#4:.5/* F#4:.5/* F#4:.5/* F#4:.5/* F#4:.25/* G4:.25 A4:1.5/* ' +
      'G4:.25/* F#4:.25 E4:.5/* E4:.5/* E4:.5/* E4:.25/* F#4:.25 G4:1.5/* ' +
      'F#4:.25/* E4:.25 D4:.5/* D5:1/* B4:.5/* A4:.75/* G4:.25 F#4:.5/* G4:.5/* F#4:1/* E4:.5/* D4:2/* ';
    const BASS = 'D3+A3:2 D3+A3:2 G3:1 A3:1 D3+A3:2 G3+B3:2 A3+C#4:2 D3+A3:2 D3+A3:2 A3:1 D3:1 D3+A3:2 D3+A3:2 ' +
      'A3:2 A3:2 D3:1 F#3:1 G3:1 A3:1 G3:1 A3:1 D3+A3:2 ';
    const V = (l1, l2, l3, r1, r3) => [].concat(l1, l2, l3, r1, r1, r3);
    const verses = [
      V(['Joy', 'to', 'the', 'world', 'the', 'Lord', 'is', 'come'], ['let', 'earth', 're', 'ceive', 'her', 'King'], ['let', 'ev', 'ery', 'heart', 'pre', 'pare', 'him', 'room'],
        ['and', "heav'n", 'and', 'na', 'ture', 'sing'], ['and', "heav'n", '', 'and', "heav'n", '', 'and', 'na', 'ture', 'sing']),
      V(['Joy', 'to', 'the', 'world', 'the', 'Sav', 'ior', 'reigns'], ['let', 'men', 'their', 'songs', 'em', 'ploy'], ['while', 'fields', 'and', 'floods', 'rocks', 'hills', 'and', 'plains'],
        ['re', 'peat', 'the', 'sound', 'ing', 'joy'], ['re', 'peat', '', 're', 'peat', '', 'the', 'sound', 'ing', 'joy']),
      // (A10, requests 56 and 59: the third and fourth verses are cut: two verses)
    ];
    let right = '', left = '';
    for (const v of verses) {
      let i = 0;
      right += TUNE.replace(/\/\*/g, () => (v[i++] ? '/' + v[i - 1] : '')) + ' ';
      if (i !== 44) throw new Error('Joy to the World: a verse has ' + i + ' syllable slots, not 44');
      left += BASS;
    }
    SONGS.push(song('Joy to the World', 2, 92, right, left, true));
  }

  // ---- We Wish You a Merry Christmas (3/4, traditional English), piano; the tune with its words and a simple chord bass
  // (the first verse only, without the "Good tidings we bring" part)
  {
    const R = 'D4:1/We ' +
      'G4:1/wish G4:.5/you A4:.5/a G4:.5/mer F#4:.5/ry E4:1/Christ E4:1/mas E4:1/we ' +
      'A4:1/wish A4:.5/you B4:.5/a A4:.5/mer G4:.5/ry F#4:1/Christ D4:1/mas D4:1/we ' +
      'B4:1/wish B4:.5/you C5:.5/a B4:.5/mer A4:.5/ry G4:1/Christ E4:1/mas D4:.5/and D4:.5/a ' +
      'E4:1/hap A4:1/py F#4:1/new G4:3/year ';
    const L = 'R:1 G3+D4:3 C3+G3:3 D3+A3:3 D3+A3:3 G3+D4:3 G3+D4:3 D3+A3:3 G3+D4:3 ';
    SONGS.push(song('We Wish You a Merry Christmas', 0, 126, R + R, L + L, true));   // sung twice through
  }

  const OTHER = [];   // A9: Für Elise and the Bach prelude are no longer in the playlist (they stay here, unused)

  // ---- Für Elise (3/8: a bar is 1.5 beats), piano. The left hand's arpeggios are cut to one bass note a bar
  // (the C under the second part is C4, not C3: the doll cannot reach C3 while her right hand is up at E5).
  {
    const A = 'E5:.25 D#5:.25 E5:.25 B4:.25 D5:.25 C5:.25 A4:.75 C4:.25 E4:.25 A4:.25 B4:.75 E4:.25 G#4:.25 B4:.25 ' +
              'C5:.75 E4:.25 E5:.25 D#5:.25 E5:.25 D#5:.25 E5:.25 B4:.25 D5:.25 C5:.25 A4:.75 C4:.25 E4:.25 A4:.25 B4:.75 E4:.25 C5:.25 B4:.25 ';
    const AL = 'R:1.5 A3:1.5 E3:1.5 A3:1.5 R:1.5 A3:1.5 E3:1.5 ';
    const B = 'E5:.75 G4:.25 F5:.25 E5:.25 D5:.75 F4:.25 E5:.25 D5:.25 C5:.75 E4:.25 D5:.25 C5:.25 B4:.75 E4:.25 E5:.25 D#5:.25 ';
    OTHER.push(song('Fur Elise', 0, 70,
      'E5:.25 D#5:.25 ' + A + 'A4:1 E5:.25 D#5:.25 ' + A + 'A4:.75 B4:.25 C5:.25 D5:.25 ' + B + A + 'A4:1.5',
      'R:.5 ' + AL + 'A3:1.5 ' + AL + 'A3:1.5 C4:1.5 G3:1.5 A3:1.5 E3:1.5 ' + AL + 'A3:1.5'));
  }

  // ---- J. S. Bach, Prelude in C major, BWV 846 (the first 15 bars, then a C chord), piano.
  // Each bar is one chord of five notes a b c d e, played twice: left hand a, b; right hand c d e c d e (16ths).
  {
    const bars = ['C4 E4 G4 C5 E5', 'C4 D4 A4 D5 F5', 'B3 D4 G4 D5 F5', 'C4 E4 G4 C5 E5', 'C4 E4 A4 E5 A5', 'C4 D4 F#4 A4 D5',
      'B3 D4 G4 D5 G5', 'B3 C4 E4 G4 C5', 'A3 C4 E4 G4 C5', 'D3 A3 D4 F#4 C5', 'G3 B3 D4 G4 B4', 'G3 A#3 E4 G4 C#5',
      'F3 A3 D4 A4 D5', 'F3 G#3 D4 F4 B4', 'E3 G3 C4 G4 C5'];
    let R = '', L = '';
    for (const b of bars) {
      const [a, bb, c, d, e] = b.split(' ');
      for (let h = 0; h < 2; h++) { R += `R:.5 ${c}:.25 ${d}:.25 ${e}:.25 ${c}:.25 ${d}:.25 ${e}:.25 `; L += `${a}:.25 ${bb}:1.75 `; }
    }
    const s = song('Bach Prelude in C', 0, 60, R + 'E4+G4+C5:4', L + 'C3+C4:4');
    for (const e of s.events) if (e.hand === 'L' && e.t % 2 === 0 && e.t < 60) e.dur = 1.9;   // the bass note is held through the half bar
    OTHER.push(s);
  }

  global.CT78Songs = { SONGS, OTHER, parse, midi };
})(window);
