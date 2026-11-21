/* CT78.A10.Synth -- default MIDI map for the CONTROLS (notes are not mapped here: any key / pad that sends a note plays the toy's keys).
 * Keys are CT45 profile ids and CT45 control ids. Values are CT78 actions:
 *   buttons : play reset record prevSong nextSong loop sound tone volUp volDown glowUp glowDown bubbles room view lookLeft lookRight lookUp lookDown orbit hud faster slower display
 *   knobs / encoders / faders (values) : tempo volume glow lookYaw lookPitch zoom
 * Re-assign any control from the page: right-click an on-screen button, then press the MIDI control (kept in the browser).
 */
window.CT78_MIDIMAP = {
  "behringer-xtouch-mini": {
    "_layout": "Top row = Play, Reset, Record, Tone, Next song, View, Bubbles, Room; bottom row = Loop, Sound, Turn, Info, Glow -, Glow +, Tempo -, Tempo +; knob 1 tempo, 2 volume, 3 glow, 6 look left / right, 7 look up / down, 8 zoom; fader = volume. (Keys of a keyboard play the toy.)",
    "btna1": "play", "btna2": "reset", "btna3": "record", "btna4": "tone", "btna5": "nextSong", "btna6": "view", "btna7": "bubbles", "btna8": "room",
    "btnb1": "loop", "btnb2": "sound", "btnb3": "orbit", "btnb4": "hud", "btnb5": "glowDown", "btnb6": "glowUp", "btnb7": "slower", "btnb8": "faster",
    "enc1": "tempo", "enc1.push": "play", "enc2": "volume", "enc2.push": "sound", "enc3": "glow", "enc3.push": "bubbles",
    "enc6": "lookYaw", "enc6.push": "view", "enc7": "lookPitch", "enc7.push": "view", "enc8": "zoom", "fader": "volume",
    "layerA": "view", "layerB": "hud"
  }
};
