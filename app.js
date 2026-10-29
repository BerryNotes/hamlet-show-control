(function () {
  const VERSION = "v0.47.1";
  const scenes = Array.isArray(window.SHOW_CUES) ? window.SHOW_CUES : [];
  const songs = scenes.flatMap((scene) => scene.cues);
  const audioById = new Map();
  const rowById = new Map();
  const mixerById = new Map();

  const state = {
    master: 0.85,
    warning: "",
    looping: new Set(),
    levels: new Map(),
    pan: loadPan(),
    ramps: new Map(),
    boost: true,
    showStarted: false
  };

  // Master pan for everything (-1 = left, 0 = centre, 1 = right),
  // remembered on this device so a pan set in rehearsal is there for the show.
  function loadPan() {
    try {
      const saved = Number(localStorage.getItem("soundboard.pan"));
      return Number.isFinite(saved) ? Math.min(1, Math.max(-1, saved)) : 0;
    } catch (error) {
      return 0;
    }
  }

  function savePan() {
    try {
      localStorage.setItem("soundboard.pan", String(state.pan));
    } catch (error) { /* private mode etc. — pan just isn't remembered */ }
  }

  // Web Audio analysis graph (built lazily on first play)
  let audioCtx = null;
  let masterGain = null;
  let masterAnalyser = null;
  let masterData = null;
  let masterMeterLevel = 0;
  let masterComp = null;
  let masterMakeup = null;
  let masterPanner = null;
  const graphById = new Map();
  let meterRaf = 0;
  let wakeLock = null;

  const els = {
    list: document.querySelector("#songList"),
    template: document.querySelector("#songTemplate"),
    mixerList: document.querySelector("#mixerList"),
    mixerTemplate: document.querySelector("#mixerTemplate"),
    emptyMixer: document.querySelector("#emptyMixer"),
    nowPlaying: document.querySelector("#nowPlaying"),
    boardMeta: document.querySelector("#boardMeta"),
    master: document.querySelector("#masterVolume"),
    masterOutput: document.querySelector("#masterOutput"),
    masterFill: document.querySelector("#masterFill"),
    masterMeterL: document.querySelector("#masterMeterL"),
    masterMeterR: document.querySelector("#masterMeterR"),
    stopAll: document.querySelector("#stopAll"),
    boostToggle: document.querySelector("#boostToggle"),
    audioStatus: document.querySelector("#audioStatus"),
    masterPan: document.querySelector("#masterPan"),
    masterPanReadout: document.querySelector("#masterPanReadout")
  };


  function songName(song) {
    return song.track || song.action || song.id;
  }

  function defaultSongLevel(song) {
    return (song.volume ?? 80) / 100;
  }

  function songLevel(song) {
    return state.levels.get(song.id) ?? defaultSongLevel(song);
  }

  function ensureAudioContext() {
    if (audioCtx) return audioCtx;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
      audioCtx = new Ctx({ latencyHint: "interactive" });
    } catch (error) {
      audioCtx = new Ctx();
    }
    const ctx = audioCtx;
    ctx.addEventListener("statechange", () => {
      if (ctx !== audioCtx) return;
      if (ctx.state === "running") resumeTriedAt = 0;
      updateAudioStatus();
    });
    masterGain = audioCtx.createGain();
    masterGain.gain.value = state.master;
    masterAnalyser = audioCtx.createAnalyser();
    masterAnalyser.fftSize = 512;
    masterData = new Uint8Array(masterAnalyser.fftSize);

    // Master bus: compressor tames peaks + makeup gain lifts the average
    // loudness, so the show plays louder without clipping when cues overlap.
    // The BOOST button toggles this on/off (see applyBoost).
    masterComp = audioCtx.createDynamicsCompressor();
    masterComp.attack.value = 0.003;
    masterComp.release.value = 0.25;
    masterMakeup = audioCtx.createGain();

    // Master pan sits right after the master fader, so it moves every
    // sound (and the phone-end tail) together.
    if (audioCtx.createStereoPanner) {
      masterPanner = audioCtx.createStereoPanner();
      masterPanner.pan.value = state.pan;
      masterGain.connect(masterPanner);
      masterPanner.connect(masterComp);
    } else {
      masterPanner = null;
      masterGain.connect(masterComp);
    }
    masterComp.connect(masterMakeup);
    masterMakeup.connect(masterAnalyser);
    masterAnalyser.connect(audioCtx.destination);
    applyBoost();
    return audioCtx;
  }

  function applyBoost() {
    if (!masterComp || !masterMakeup) return;
    if (state.boost) {
      masterComp.threshold.value = -14;
      masterComp.knee.value = 24;
      masterComp.ratio.value = 6;
      masterMakeup.gain.value = 1.9;
    } else {
      // Effectively flat: no compression, unity makeup.
      masterComp.threshold.value = 0;
      masterComp.knee.value = 0;
      masterComp.ratio.value = 1;
      masterMakeup.gain.value = 1;
    }
  }

  // Sounds are decoded up front into Web Audio buffers and played with
  // buffer sources, which start almost instantly — an <audio> element has
  // to seek and spin up a decoder on every press. BufferVoice exposes the
  // small slice of the HTMLAudioElement API the rest of the board uses.
  class BufferVoice extends EventTarget {
    constructor(src) {
      super();
      this.src = src;
      this.dataset = {};
      this.loop = false;
      this.volume = 1;
      this.preload = "auto";
      this.buffer = null;
      this.node = null;
      this.offset = 0;
      this.startedAt = 0;
      this.paused = true;
      this.ended = false;
      this.loading = null;
      this.ticker = 0;
      this.fadeTimer = 0;
      this.output = audioCtx.createGain();
    }

    get readyState() { return this.buffer ? HTMLMediaElement.HAVE_ENOUGH_DATA : HTMLMediaElement.HAVE_NOTHING; }
    get duration() { return this.buffer ? this.buffer.duration : NaN; }

    get currentTime() {
      if (!this.buffer) return 0;
      if (this.paused) return this.offset;
      const t = this.offset + audioCtx.currentTime - this.startedAt;
      return this.loop ? t % this.buffer.duration : Math.min(t, this.buffer.duration);
    }

    set currentTime(value) {
      const playing = !this.paused;
      if (playing) this.stopNode();
      this.offset = Math.max(0, Number(value) || 0);
      if (this.buffer) this.offset = Math.min(this.offset, this.buffer.duration);
      this.ended = false;
      if (playing) this.startNode();
      this.dispatchEvent(new Event("seeked"));
    }

    load() {
      if (!this.loading) {
        this.loading = decodeSound(this.src)
          .then((buffer) => {
            this.buffer = buffer;
            this.dispatchEvent(new Event("loadedmetadata"));
            this.dispatchEvent(new Event("durationchange"));
            updateAudioStatus();
          })
          .catch((error) => {
            this.loading = null;
            throw error;
          });
      }
      return this.loading;
    }

    async play() {
      if (!this.buffer) await this.load();
      if (!this.paused) return;
      if (this.ended || this.offset >= this.buffer.duration) this.offset = 0;
      this.ended = false;
      this.paused = false;
      this.startNode();
    }

    pause() {
      if (this.paused) return;
      this.offset = this.currentTime;
      this.stopNode();
      this.paused = true;
    }

    // Ramp to silence over `seconds`, then call onDone (which stops it).
    fadeOut(seconds, onDone) {
      clearTimeout(this.fadeTimer);
      const g = this.output.gain;
      const now = audioCtx.currentTime;
      const from = g.value;
      g.cancelScheduledValues(now);
      g.setValueAtTime(from, now);
      // Exponential decay rather than a straight line: a linear ramp barely
      // dips for the first second, so a Stop press sounded ignored. This
      // is clearly quieter within a fifth of the fade.
      g.setTargetAtTime(0, now, seconds / 5);
      this.fadeTimer = setTimeout(() => {
        this.fadeTimer = 0;
        onDone();
      }, seconds * 1000);
    }

    cancelFade() {
      clearTimeout(this.fadeTimer);
      this.fadeTimer = 0;
      const g = this.output.gain;
      g.cancelScheduledValues(audioCtx.currentTime);
      g.setValueAtTime(1, audioCtx.currentTime);
    }

    startNode() {
      this.cancelFade();
      const node = audioCtx.createBufferSource();
      node.buffer = this.buffer;
      node.loop = this.loop;
      node.connect(this.output);
      node.onended = () => {
        if (this.node !== node) return;
        this.stopNode();
        this.paused = true;
        this.ended = true;
        this.offset = 0;
        this.dispatchEvent(new Event("timeupdate"));
        this.dispatchEvent(new Event("ended"));
      };
      this.startedAt = audioCtx.currentTime;
      node.start(0, this.offset);
      this.node = node;
      clearInterval(this.ticker);
      this.ticker = setInterval(() => this.dispatchEvent(new Event("timeupdate")), 250);
    }

    stopNode() {
      const node = this.node;
      this.node = null;
      clearInterval(this.ticker);
      if (!node) return;
      node.onended = null;
      try { node.stop(); } catch (error) { /* already stopped */ }
      node.disconnect();
    }
  }

  // Decoded AudioBuffers aren't tied to one context, so they're cached by
  // URL and survive an engine rebuild (see rebuildAudio).
  const decoded = new Map();
  function decodeSound(url) {
    if (!decoded.has(url)) {
      const job = fetch(url)
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.arrayBuffer();
        })
        .then((bytes) => new Promise((resolve, reject) => audioCtx.decodeAudioData(bytes, resolve, reject)))
        .then(trimLeadingSilence);
      job.catch(() => decoded.delete(url));
      decoded.set(url, job);
    }
    return decoded.get(url);
  }

  // Drop the silent lead-in most files have (MP3 encoder padding plus any
  // dead air), keeping 2 ms before the first audible sample.
  function trimLeadingSilence(buffer) {
    const threshold = 0.003;
    let first = buffer.length;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < first; i++) {
        if (Math.abs(data[i]) > threshold) { first = i; break; }
      }
    }
    const start = Math.max(0, first - Math.round(buffer.sampleRate * 0.002));
    if (start === 0 || start >= buffer.length) return buffer;
    const trimmed = audioCtx.createBuffer(buffer.numberOfChannels, buffer.length - start, buffer.sampleRate);
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      trimmed.copyToChannel(buffer.getChannelData(ch).subarray(start), ch);
    }
    return trimmed;
  }

  // Bluetooth speakers and headphones power down their link after a few
  // seconds of silence, then clip or delay the next sound while they wake.
  // A constant, inaudible noise floor (about -74 dB) keeps the link awake.
  let keepAlive = null;
  function startKeepAlive() {
    if (keepAlive || !audioCtx) return;
    const length = audioCtx.sampleRate;
    const noise = audioCtx.createBuffer(1, length, audioCtx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = audioCtx.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const gain = audioCtx.createGain();
    gain.gain.value = 0.0002;
    source.connect(gain);
    gain.connect(audioCtx.destination);
    source.start();
    keepAlive = source;
  }

  // Get the audio engine running from whatever state it's in. Browsers
  // park it as "suspended" before the first tap, and iPhones leave it
  // "interrupted" after a call, the lock screen or switching apps — any
  // of which used to leave the board silent until a refresh.
  function wakeAudio() {
    if (!audioCtx) return;
    if (audioCtx.state === "closed") {
      rebuildAudio();
      return;
    }
    if (audioCtx.state !== "running") audioCtx.resume().catch(() => {});
  }

  // Last resort when the engine won't resume: throw it away and build a
  // fresh one. Decoded sounds come from the cache, so this is instant.
  function rebuildAudio() {
    const replay = songs
      .filter((song) => {
        const audio = audioById.get(song.id);
        return audio && !audio.paused && !audio.ended && !audio.fadeTimer;
      })
      .map((song) => [song, audioById.get(song.id).currentTime]);
    songs.forEach(stopSong);
    stopSoundById.forEach((voice) => voice.stopNode());
    const old = audioCtx;
    audioCtx = null;
    keepAlive = null;
    graphById.clear();
    audioById.clear();
    stopSoundById.clear();
    if (old && old.state !== "closed") old.close().catch(() => {});
    resumeTriedAt = 0;
    ensureAudioContext();
    loadSounds();
    startKeepAlive();
    replay.forEach(([song, at]) => playSong(song, { retry: false, at }));
    syncStatus();
    updateAudioStatus();
    return replay.map(([song]) => song.id);
  }

  // Unlock sound from inside a real tap/click/key press — the only place
  // phones allow it. Resume first; if an earlier resume in a gesture
  // didn't take, build a fresh engine right here in the gesture, which
  // every browser accepts. A silent blip through both Web Audio and an
  // <audio> element finishes the unlock on iPhones.
  let resumeTriedAt = 0;
  // iPhones pause web audio when the screen locks unless the page is
  // playing media. A looping, silent <audio> track keeps Safari in media
  // playback mode, so cues keep playing smoothly with the phone locked
  // (and through the silent switch). Started in the first tap; restarted
  // on any later tap if iOS ever stops it (e.g. after a phone call).
  const sessionTrack = new Audio("data:audio/wav;base64,UklGRmQfAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YUAfAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==");
  sessionTrack.loop = true;
  sessionTrack.preload = "auto";
  sessionTrack.setAttribute("playsinline", "");
  // iOS pauses this track for a phone call (or another app taking the
  // audio) and never restarts it; the status light turns red so one tap
  // brings it back.
  let sessionTrackStarted = false;
  sessionTrack.addEventListener("playing", () => {
    sessionTrackStarted = true;
    updateAudioStatus();
  });
  sessionTrack.addEventListener("pause", () => updateAudioStatus());
  if ("mediaSession" in navigator && window.MediaMetadata) {
    navigator.mediaSession.metadata = new MediaMetadata({ title: "Sound Board", artist: "Show Control" });
  }
  function unlockAudio(force) {
    if (!ensureAudioContext()) return;
    if (audioCtx.state !== "running") {
      const now = performance.now();
      const stuck = audioCtx.state === "closed" || (resumeTriedAt && now - resumeTriedAt > 400);
      if (force || stuck) rebuildAudio();
      resumeTriedAt = resumeTriedAt || now;
      audioCtx.resume().catch(() => {});
    }
    try {
      const blip = audioCtx.createBufferSource();
      blip.buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
      blip.connect(audioCtx.destination);
      blip.start(0);
    } catch (error) { /* harmless */ }
    if (sessionTrack.paused) sessionTrack.play().catch(() => {});
    startKeepAlive();
    updateAudioStatus();
  }

  // After a press, make sure the sound is actually coming out. If the
  // engine still isn't running once the user has interacted with the page,
  // rebuild it and fire the cue again.
  function confirmPlayback(song) {
    setTimeout(() => {
      if (!audioCtx || audioCtx.state === "running") return;
      const activated = !navigator.userActivation || navigator.userActivation.hasBeenActive;
      if (!activated) return;
      const replayed = rebuildAudio();
      if (!replayed.includes(song.id)) playSong(song, { retry: false });
    }, 400);
  }

  function updateAudioStatus() {
    const el = els.audioStatus;
    if (!el) return;
    const loaded = songs.every((song) => {
      const audio = audioById.get(song.id);
      return audio && audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA;
    });
    let mode = "ready";
    let text = "Sound ready";
    const reasons = {
      suspended: "sound is paused",
      interrupted: "interrupted by a call or another app",
      closed: "sound engine stopped"
    };
    if (!audioCtx || audioCtx.state !== "running") {
      mode = "off";
      text = `Tap here to turn sound on (${audioCtx ? reasons[audioCtx.state] || audioCtx.state : "no audio"})`;
    } else if (sessionTrackStarted && sessionTrack.paused) {
      mode = "off";
      text = "Tap here to turn sound back on (paused by a call or another app)";
    } else if (!loaded) {
      mode = "loading";
      text = "Loading sounds…";
    }
    el.dataset.mode = mode;
    el.textContent = text;
  }

  function ensureGraph(song) {
    if (graphById.has(song.id)) return graphById.get(song.id);
    if (!ensureAudioContext()) return null;
    const audio = audioById.get(song.id);
    if (!audio) return null;

    let source;
    try {
      source = audio.output || audioCtx.createMediaElementSource(audio);
    } catch (error) {
      return null;
    }

    const gain = audioCtx.createGain();
    gain.gain.value = songLevel(song);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    const data = new Uint8Array(analyser.fftSize);

    source.connect(gain);
    gain.connect(analyser);
    analyser.connect(masterGain);

    audio.volume = 1;
    const graph = { source, gain, analyser, data, level: 0 };
    graphById.set(song.id, graph);
    return graph;
  }

  function setMasterPan(value) {
    const pan = Math.round(Math.min(1, Math.max(-1, value)) * 100) / 100;
    state.pan = pan;
    savePan();
    if (masterPanner) masterPanner.pan.setTargetAtTime(pan, audioCtx.currentTime, 0.01);
    renderPan();
  }

  function renderPan() {
    const knob = els.masterPan;
    if (!knob) return;
    const pan = state.pan;
    knob.style.setProperty("--angle", `${pan * 135}deg`);
    knob.setAttribute("aria-valuenow", String(Math.round(pan * 100)));
    const amount = Math.round(Math.abs(pan) * 100);
    els.masterPanReadout.textContent = amount === 0 ? "C" : `${pan < 0 ? "L" : "R"} ${amount}`;
  }

  // Rotary pan knob: drag up/right to pan right, down/left to pan left;
  // double-tap (or double-click) to centre; arrow keys nudge it.
  function wirePanKnob() {
    const knob = els.masterPan;
    if (!knob) return;
    let drag = null;
    let lastTap = 0;
    knob.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const now = performance.now();
      if (now - lastTap < 320) {
        setMasterPan(0);
        lastTap = 0;
        return;
      }
      lastTap = now;
      drag = { x: event.clientX, y: event.clientY, start: state.pan };
      knob.setPointerCapture(event.pointerId);
    });
    knob.addEventListener("pointermove", (event) => {
      if (!drag) return;
      const moved = (event.clientX - drag.x) - (event.clientY - drag.y);
      setMasterPan(drag.start + moved / 120);
    });
    const end = () => { drag = null; };
    knob.addEventListener("pointerup", end);
    knob.addEventListener("pointercancel", end);
    knob.addEventListener("keydown", (event) => {
      const step = { ArrowLeft: -0.1, ArrowDown: -0.1, ArrowRight: 0.1, ArrowUp: 0.1 }[event.key];
      if (step) {
        event.preventDefault();
        setMasterPan(state.pan + step);
      } else if (event.key === "Home" || event.key === "0") {
        event.preventDefault();
        setMasterPan(0);
      }
    });
    renderPan();
  }

  function applyOutputVolume(song) {
    const audio = audioById.get(song.id);
    if (!audio) return;
    const graph = graphById.get(song.id);
    if (graph) {
      // A fade owns the gain node while it runs; don't fight its automation.
      if (state.ramps.has(song.id)) return;
      const v = Math.min(1, Math.max(0, songLevel(song)));
      if (audioCtx) graph.gain.gain.cancelScheduledValues(audioCtx.currentTime);
      graph.gain.gain.value = v;
    } else {
      audio.volume = Math.min(1, Math.max(0, songLevel(song) * state.master));
    }
  }

  function rmsFromAnalyser(analyser, data) {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    return Math.sqrt(sum / data.length);
  }

  // map rms (~0..0.7) to a lively 0..100 meter with fast attack, slow
  // release. sqrt curve lifts quiet passages so the meter sits higher.
  function meterPercent(rms, prev) {
    const target = Math.min(100, Math.sqrt(rms) * 150);
    return target > prev ? target : prev * 0.82 + target * 0.18;
  }

  function tickMeters() {
    let anyPlaying = false;

    graphById.forEach((graph, songId) => {
      const audio = audioById.get(songId);
      const strip = mixerById.get(songId);
      const playing = audio && !audio.paused && !audio.ended;
      if (playing) anyPlaying = true;
      const rms = playing ? rmsFromAnalyser(graph.analyser, graph.data) : 0;
      graph.level = meterPercent(rms, graph.level);
      const vuFill = strip && strip.querySelector(".vu-fill");
      if (vuFill) vuFill.style.setProperty("--level", `${graph.level}%`);

      // While a fade is automating the gain node, animate the on-screen
      // fader to track it (the audio fade itself runs on the audio thread).
      if (strip && state.ramps.has(songId)) {
        const pct = Math.round(Math.min(1, Math.max(0, graph.gain.gain.value)) * 100);
        strip.querySelector(".fader-input").value = String(pct);
        strip.querySelector(".strip-readout").textContent = String(pct);
        strip.querySelector(".fader-fill").style.setProperty("--level", `${pct}%`);
      }
    });

    if (masterAnalyser) {
      const rms = anyPlaying ? rmsFromAnalyser(masterAnalyser, masterData) : 0;
      masterMeterLevel = meterPercent(rms, masterMeterLevel);
      if (els.masterMeterL) els.masterMeterL.style.setProperty("--level", `${masterMeterLevel}%`);
      if (els.masterMeterR) els.masterMeterR.style.setProperty("--level", `${masterMeterLevel}%`);
    }

    // keep the loop alive while anything plays, plus a tail for decay
    if (anyPlaying || masterMeterLevel > 0.5) {
      meterRaf = requestAnimationFrame(tickMeters);
    } else {
      meterRaf = 0;
    }
  }

  function startMeters() {
    if (!meterRaf) meterRaf = requestAnimationFrame(tickMeters);
  }

  function setSongLevel(song, level) {
    state.levels.set(song.id, Math.min(1, Math.max(0, level)));
    applyOutputVolume(song);
    updateMixer(song);
    updateMasterMeter();
  }

  function fixInfiniteDuration(audio, song) {
    if (audio.dataset.durationFixed === "true") return;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.dataset.durationFixed = "true";
      return;
    }
    if (!audio.paused) return;
    audio.dataset.durationFixed = "pending";
    const onSeeked = () => {
      audio.removeEventListener("seeked", onSeeked);
      audio.currentTime = 0;
      audio.dataset.durationFixed = "true";
      updateMixer(song);
    };
    audio.addEventListener("seeked", onSeeked);
    try {
      audio.currentTime = 24 * 60 * 60;
    } catch (error) {
      audio.removeEventListener("seeked", onSeeked);
    }
  }

  function getAudio(song) {
    if (!audioById.has(song.id)) {
      const audio = ensureAudioContext() ? new BufferVoice(song.file) : new Audio(song.file);
      audio.preload = "auto";
      audio.loop = state.looping.has(song.id);
      audio.addEventListener("loadedmetadata", () => {
        fixInfiniteDuration(audio, song);
        updateMixer(song);
      });
      audio.addEventListener("durationchange", () => updateMixer(song));
      audio.addEventListener("timeupdate", () => updateMixer(song));
      audio.addEventListener("seeked", () => updateMixer(song));
      audio.addEventListener("ended", syncStatus);
      audioById.set(song.id, audio);
      applyOutputVolume(song);
    }

    return audioById.get(song.id);
  }

  function cancelRamp(songId) {
    const existing = state.ramps.get(songId);
    if (existing) {
      existing.cancelled = true;
      if (existing.timer) clearTimeout(existing.timer);
      // Hold the gain node at its current value so it doesn't snap.
      const graph = graphById.get(songId);
      if (graph && audioCtx) {
        const g = graph.gain.gain;
        const now = audioCtx.currentTime;
        const current = g.value;
        g.cancelScheduledValues(now);
        g.setValueAtTime(current, now);
      }
    }
    state.ramps.delete(songId);
  }

  // Keep the screen awake during the show so the OS can't dim/sleep the
  // display (which on many machines suspends audio or locks the booth).
  function requestWakeLock() {
    if (!("wakeLock" in navigator)) return;
    navigator.wakeLock.request("screen").then((lock) => {
      wakeLock = lock;
      lock.addEventListener("release", () => { wakeLock = null; });
    }).catch(() => { /* denied / unsupported — harmless */ });
  }

  function prepareAudioOutput(song) {
    ensureGraph(song);
    wakeAudio();
    startKeepAlive();
    applyOutputVolume(song);
    startMeters();
    state.showStarted = true;
    if (!wakeLock) requestWakeLock();
  }

  // Only one song plays at a time. Starting a song stops any other
  // playing song; cues/noises (song !== true) are left alone.
  function stopOtherSongs(current) {
    if (!current.song) return;
    songs.forEach((other) => {
      if (other === current || !other.song) return;
      const audio = audioById.get(other.id);
      if (audio && !audio.paused && !audio.ended) stopSong(other);
    });
  }

  async function playSong(song, { retry = true, at = 0 } = {}) {
    if (audioCtx && audioCtx.state === "closed") rebuildAudio();
    const audio = getAudio(song);
    stopOtherSongs(song);
    cancelRamp(song.id);
    audio.pause();
    audio.currentTime = at;
    audio.loop = state.looping.has(song.id);
    setSongLevel(song, defaultSongLevel(song));
    ensureMixer(song);
    prepareAudioOutput(song);
    flashCue(song);

    try {
      await audio.play();
      state.warning = "";
    } catch (error) {
      if (retry) {
        const replayed = rebuildAudio();
        if (!replayed.includes(song.id)) return playSong(song, { retry: false });
        return;
      }
      state.warning = `Could not play ${songName(song)}`;
    }

    syncStatus();
    if (retry) confirmPlayback(song);
  }

  function stopSong(song) {
    const audio = audioById.get(song.id);
    if (!audio) return;
    cancelRamp(song.id);
    if (audio.cancelFade) audio.cancelFade();
    showFading(song, false);
    audio.pause();
    audio.currentTime = 0;
    state.levels.delete(song.id);
    applyOutputVolume(song);
    removeMixer(song);
  }

  // A cue's `stopSound` is a tail (e.g. a phone being picked up) that
  // plays when its Stop button ends it. Preloaded and routed straight to
  // the master bus; it doesn't get a row or a mixer strip of its own.
  const stopSoundById = new Map();
  function getStopSound(song) {
    if (!song.stopSound || !ensureAudioContext()) return null;
    if (!stopSoundById.has(song.id)) {
      const voice = new BufferVoice(song.stopSound);
      const gain = audioCtx.createGain();
      gain.gain.value = (song.stopSoundVolume ?? song.volume ?? 80) / 100;
      voice.output.connect(gain);
      gain.connect(masterGain);
      voice.load().catch(() => {});
      stopSoundById.set(song.id, voice);
    }
    return stopSoundById.get(song.id);
  }

  // The Stop buttons: cues with `stopFade` (seconds) ramp out instead of
  // cutting, and cues with `stopSound` play their tail — only when the cue
  // is actually playing, started in the same instant so the hand-off is
  // seamless. STOP ALL / Esc stay instant and silent.
  function stopButton(song) {
    const audio = audioById.get(song.id);
    const tail = audio && !audio.paused && !audio.ended ? getStopSound(song) : null;
    if (tail) {
      tail.pause();
      tail.currentTime = 0;
      tail.play().catch(() => {});
    }
    // A second Stop while it's already fading cuts it straight away.
    if (song.stopFade && audio && audio.fadeOut && !audio.paused && !audio.fadeTimer) {
      showFading(song, true);
      audio.fadeOut(song.stopFade, () => {
        stopSong(song);
        syncStatus();
      });
      return;
    }
    stopSong(song);
    syncStatus();
  }

  // While a Stop is fading a song out, its Stop buttons read FADING
  // (press again to cut it).
  function showFading(song, fading) {
    rowById.get(song.id)?.classList.toggle("is-fading", fading);
    mixerById.get(song.id)?.classList.toggle("is-fading", fading);
  }

  function stopAll() {
    songs.forEach(stopSong);
    state.warning = "";
    syncStatus();
  }

  function loadSounds() {
    songs.forEach(getStopSound);
    songs.forEach((song) => {
      const audio = getAudio(song);
      if (!audio.paused) return;
      if (audio.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) return;
      audio.load();
    });
  }

  function syncVolumes() {
    songs.forEach((song) => {
      const audio = audioById.get(song.id);
      if (audio && !audio.paused) {
        applyOutputVolume(song);
        updateMixer(song);
      }
    });
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const wholeSeconds = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${minutes}:${wholeSeconds}`;
  }

  function ensureMixer(song) {
    if (mixerById.has(song.id)) return mixerById.get(song.id);

    const fragment = els.mixerTemplate.content.cloneNode(true);
    const strip = fragment.querySelector(".channel-strip");
    const volume = strip.querySelector(".fader-input");
    const output = strip.querySelector(".strip-readout");

    strip.querySelector(".scribble-name").textContent = songName(song);
    strip.querySelector(".channel-num").textContent = `CH ${song.id}`;

    volume.addEventListener("input", () => {
      const audio = audioById.get(song.id);
      if (!audio) return;
      setSongLevel(song, Number(volume.value) / 100);
      output.textContent = volume.value;
    });

    strip.querySelector(".strip-stop").addEventListener("click", () => stopButton(song));

    mixerById.set(song.id, strip);
    els.mixerList.append(fragment);
    els.emptyMixer.hidden = true;
    updateMixer(song);
    return strip;
  }

  function updateMixer(song) {
    const strip = mixerById.get(song.id);
    const audio = audioById.get(song.id);
    if (!strip || !audio) return;

    // During a fade the gain is automated; tickMeters animates the fader
    // from the live gain value, so don't overwrite it here.
    if (!state.ramps.has(song.id)) {
      const faderPct = Math.round(songLevel(song) * 100);
      strip.querySelector(".fader-input").value = String(faderPct);
      strip.querySelector(".strip-readout").textContent = String(faderPct);
      strip.querySelector(".fader-fill").style.setProperty("--level", `${faderPct}%`);
    }

    // VU meter is driven live by tickMeters (real audio level) once Web
    // Audio is running. Before that, show the static post-fader level.
    if (!audioCtx) {
      const meterPct = Math.min(100, Math.max(0, songLevel(song) * state.master * 100));
      const vuFill = strip.querySelector(".vu-fill");
      if (vuFill) vuFill.style.setProperty("--level", `${meterPct}%`);
    }

    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    strip.querySelector(".strip-time").textContent = `${formatTime(audio.currentTime)} / ${formatTime(duration)}`;
  }

  function updateMasterMeter() {
    // Once Web Audio is running the master meter is driven live by
    // tickMeters; this static estimate is only the pre-audio fallback.
    if (audioCtx) return;
    let sum = 0;
    mixerById.forEach((_strip, songId) => {
      const song = songs.find((s) => s.id === songId);
      const audio = audioById.get(songId);
      if (!song || !audio || audio.paused) return;
      sum += songLevel(song);
    });
    const pct = Math.min(1, sum * state.master) * 100;
    if (els.masterMeterL) els.masterMeterL.style.setProperty("--level", `${pct}%`);
    if (els.masterMeterR) els.masterMeterR.style.setProperty("--level", `${pct}%`);
  }

  function removeMixer(song) {
    const row = mixerById.get(song.id);
    if (!row) return;

    row.remove();
    mixerById.delete(song.id);
    els.emptyMixer.hidden = mixerById.size > 0;
  }

  function syncStatus() {
    const playing = songs.filter((song) => {
      const audio = audioById.get(song.id);
      return audio && !audio.paused && !audio.ended;
    });

    els.nowPlaying.textContent = playing.length ? playing.map(songName).join(", ") : state.warning || "Nothing playing.";
    document.body.classList.toggle("is-playing", playing.length > 0);
    if (els.boardMeta) {
      els.boardMeta.textContent = playing.length
        ? `${playing.length} channel${playing.length === 1 ? "" : "s"} active`
        : "Idle";
    }

    songs.forEach((song) => {
      const audio = audioById.get(song.id);
      const isPlaying = Boolean(audio && !audio.paused && !audio.ended);
      rowById.get(song.id)?.classList.toggle("is-playing", isPlaying);
      if (isPlaying) updateMixer(song);
      else removeMixer(song);
    });
    updateMasterMeter();
  }

  function renderSongs() {
    scenes.forEach((scene) => {
      if (scene.scene) {
        const heading = document.createElement("h2");
        heading.className = "section-heading";
        heading.textContent = scene.scene;
        els.list.append(heading);
      }

      (scene.cues || []).forEach((song) => {
        const fragment = els.template.content.cloneNode(true);
        const row = fragment.querySelector(".song-row");

        row.querySelector(".song-title").textContent = songName(song);
        // Fire on press, not release, so the sound starts the instant the
        // button goes down. Keyboard activation still arrives as a click.
        const playButton = row.querySelector(".play-button");
        playButton.addEventListener("pointerdown", (event) => {
          if (event.button === 0) playSong(song);
        });
        playButton.addEventListener("click", (event) => {
          if (event.detail === 0) playSong(song);
        });
        row.querySelector(".stop-button").addEventListener("click", () => stopButton(song));

        rowById.set(song.id, row);
        els.list.append(fragment);
      });
    });
  }

  function flashCue(song) {
    const row = rowById.get(song.id);
    if (!row) return;
    row.classList.remove("just-fired");
    void row.offsetWidth; // restart the animation
    row.classList.add("just-fired");
    setTimeout(() => row.classList.remove("just-fired"), 750);
  }

  function gainFromDb(db) {
    return db <= Number(els.master.min) ? 0 : Math.pow(10, db / 20);
  }

  function formatDb(db) {
    if (db <= Number(els.master.min)) return "−∞";
    return db > 0 ? `+${db}` : String(db);
  }

  function updateMasterFill() {
    if (!els.masterFill) return;
    const min = Number(els.master.min);
    const max = Number(els.master.max);
    const pct = ((Number(els.master.value) - min) / (max - min)) * 100;
    els.masterFill.style.setProperty("--level", `${pct}%`);
  }

  function applyMaster() {
    const db = Number(els.master.value);
    state.master = gainFromDb(db);
    els.masterOutput.textContent = formatDb(db);
    updateMasterFill();
    if (masterGain) masterGain.gain.value = state.master;
    else syncVolumes();
    updateMasterMeter();
  }

  els.master.addEventListener("input", applyMaster);
  wirePanKnob();
  applyMaster();

  els.stopAll.addEventListener("click", stopAll);

  if (els.boostToggle) {
    els.boostToggle.setAttribute("aria-pressed", String(state.boost));
    els.boostToggle.addEventListener("click", () => {
      state.boost = !state.boost;
      els.boostToggle.setAttribute("aria-pressed", String(state.boost));
      applyBoost();
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input, textarea, select")) return;

    if (event.key === "Escape") {
      stopAll();
      return;
    }
  });

  // Resume the audio context (and re-take the wake lock) when the tab
  // becomes visible again — both can be dropped while hidden.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    wakeAudio();
    if (state.showStarted && !wakeLock) requestWakeLock();
  });

  // Any tap/click also nudges a suspended context back to life (covers
  // OS audio interruptions like a phone call or notification). Phones only
  // allow audio to start on the release of the first tap, so listen for
  // that too.
  document.addEventListener("pointerdown", wakeAudio);
  ["pointerup", "touchend", "click", "keydown"].forEach((type) => {
    document.addEventListener(type, () => unlockAudio(false));
  });

  // Coming back from the back/forward cache or another app.
  window.addEventListener("pageshow", wakeAudio);
  window.addEventListener("focus", wakeAudio);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && sessionTrack.paused && navigator.userActivation && navigator.userActivation.hasBeenActive) {
      sessionTrack.play().catch(() => {});
    }
  });

  if (els.audioStatus) {
    els.audioStatus.addEventListener("click", (event) => {
      event.stopPropagation();
      unlockAudio(audioCtx && audioCtx.state !== "running");
    });
  }
  // Only nudge the engine while the board is on screen. Resuming in the
  // background fights iOS's lock-screen handling and makes audio stutter.
  setInterval(() => {
    if (document.hidden) return;
    if (audioCtx && audioCtx.state !== "running") wakeAudio();
    updateAudioStatus();
  }, 1000);

  // Last-resort resilience: never let a stray error or rejected promise
  // tear down the running board — swallow it and keep going.
  window.addEventListener("error", (event) => { event.preventDefault(); });
  window.addEventListener("unhandledrejection", (event) => { event.preventDefault(); });

  // Once the show has started, guard against an accidental reload / tab
  // close / navigation taking the board down mid-performance.
  window.addEventListener("beforeunload", (event) => {
    const playing = songs.some((song) => {
      const audio = audioById.get(song.id);
      return audio && !audio.paused && !audio.ended;
    });
    if (state.showStarted || playing) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  // Stop OS/hardware media keys (play/pause, next, etc.) from resuming
  // our paused audio elements behind the operator's back.
  if ("mediaSession" in navigator) {
    [
      "play", "pause", "stop", "seekto", "seekbackward",
      "seekforward", "previoustrack", "nexttrack"
    ].forEach((action) => {
      try {
        navigator.mediaSession.setActionHandler(action, () => {});
      } catch (error) {
        /* unsupported action — ignore */
      }
    });
  }

  const versionEl = document.querySelector("#version");
  if (versionEl) versionEl.textContent = VERSION;

  renderSongs();
  loadSounds();
  updateAudioStatus();
  syncStatus();

  // Offline support: register the service worker and have it pre-cache
  // every audio file so the board runs with no network (booth-wifi safe).
  if ("serviceWorker" in navigator) {
    const audioUrls = Array.from(new Set(songs.flatMap((song) => [song.file, song.stopSound].filter(Boolean))));
    const cacheAudio = () => {
      if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: "CACHE_AUDIO", urls: audioUrls });
      }
    };
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").then(() => {
        cacheAudio();
        navigator.serviceWorker.addEventListener("controllerchange", cacheAudio);
      }).catch(() => { /* offline support unavailable — board still works online */ });
    });
  }
})();
