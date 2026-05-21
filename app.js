(function () {
  const VERSION = "v0.9.11";
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
    ramps: new Map()
  };

  // Web Audio analysis graph (built lazily on first play)
  let audioCtx = null;
  let masterGain = null;
  let masterAnalyser = null;
  let masterData = null;
  let masterMeterLevel = 0;
  const graphById = new Map();
  let meterRaf = 0;

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
    stopAll: document.querySelector("#stopAll")
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
    audioCtx = new Ctx();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = state.master;
    masterAnalyser = audioCtx.createAnalyser();
    masterAnalyser.fftSize = 512;
    masterData = new Uint8Array(masterAnalyser.fftSize);
    masterGain.connect(masterAnalyser);
    masterAnalyser.connect(audioCtx.destination);
    return audioCtx;
  }

  function ensureGraph(song) {
    if (graphById.has(song.id)) return graphById.get(song.id);
    if (!ensureAudioContext()) return null;
    const audio = audioById.get(song.id);
    if (!audio) return null;

    let source;
    try {
      source = audioCtx.createMediaElementSource(audio);
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
      const audio = new Audio(song.file);
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

  // rAF ramp — fallback only when Web Audio is unavailable.
  function startRamp(song, from, to, seconds, onUpdate, done) {
    cancelRamp(song.id);
    const token = { cancelled: false };
    state.ramps.set(song.id, token);

    const finish = () => {
      if (token.cancelled) return;
      state.ramps.delete(song.id);
      if (done) done();
    };

    const duration = Math.max(0, seconds || 0) * 1000;
    if (!duration) {
      if (onUpdate) onUpdate(to);
      finish();
      return;
    }

    const started = performance.now();
    const step = (now) => {
      if (token.cancelled) return;
      const progress = Math.min(1, (now - started) / duration);
      const value = from + (to - from) * progress;
      if (onUpdate) onUpdate(value);
      if (progress < 1) requestAnimationFrame(step);
      else finish();
    };

    requestAnimationFrame(step);
  }

  // Fade using native gain-node automation when possible, so the fade
  // runs on the audio thread and is unaffected by tab backgrounding /
  // requestAnimationFrame throttling. Falls back to the rAF ramp.
  function fade(song, to, seconds, onComplete) {
    cancelRamp(song.id);
    const graph = graphById.get(song.id);
    const from = songLevel(song);
    const clampedTo = Math.min(1, Math.max(0, to));

    if (graph && audioCtx) {
      const g = graph.gain.gain;
      const now = audioCtx.currentTime;
      const safeFrom = Math.max(0.0001, from);
      const safeTo = Math.max(0.0001, clampedTo);
      g.cancelScheduledValues(now);
      g.setValueAtTime(safeFrom, now);
      if (seconds > 0) g.linearRampToValueAtTime(safeTo, now + seconds);
      else g.setValueAtTime(clampedTo, now);

      state.levels.set(song.id, clampedTo);

      const token = { cancelled: false, timer: 0 };
      state.ramps.set(song.id, token);
      token.timer = setTimeout(() => {
        if (token.cancelled) return;
        state.ramps.delete(song.id);
        g.cancelScheduledValues(audioCtx.currentTime);
        g.value = clampedTo;
        updateMixer(song);
        if (onComplete) onComplete();
      }, Math.max(0, seconds) * 1000 + 80);

      startMeters();
      updateMixer(song);
    } else {
      startRamp(song, from, clampedTo, seconds, (level) => setSongLevel(song, level), onComplete);
    }
  }

  function prepareAudioOutput(song) {
    ensureGraph(song);
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    applyOutputVolume(song);
    startMeters();
  }

  async function playSong(song) {
    const audio = getAudio(song);
    cancelRamp(song.id);
    audio.pause();
    audio.currentTime = 0;
    audio.loop = state.looping.has(song.id);
    setSongLevel(song, defaultSongLevel(song));
    ensureMixer(song);
    prepareAudioOutput(song);

    try {
      await audio.play();
      state.warning = "";
    } catch (error) {
      state.warning = `Could not play ${songName(song)}`;
    }

    syncStatus();
  }

  async function fadeInSong(song) {
    const audio = getAudio(song);
    cancelRamp(song.id);
    const wasPaused = audio.paused;
    const startLevel = wasPaused ? 0 : songLevel(song);
    if (wasPaused) {
      audio.currentTime = 0;
      audio.loop = state.looping.has(song.id);
    }
    setSongLevel(song, startLevel);
    ensureMixer(song);
    prepareAudioOutput(song);
    updateMixer(song);

    try {
      if (wasPaused) await audio.play();
      state.warning = "";
      fade(song, defaultSongLevel(song), song.fadeIn || 4, syncStatus);
    } catch (error) {
      state.warning = `Could not play ${songName(song)}`;
    }

    syncStatus();
  }

  function fadeSong(song) {
    const audio = audioById.get(song.id);
    if (!audio || audio.paused) return;

    ensureMixer(song);
    fade(song, 0, song.fadeOut ?? 5, () => {
      audio.pause();
      audio.currentTime = 0;
      state.levels.delete(song.id);
      applyOutputVolume(song);
      removeMixer(song);
      syncStatus();
    });
  }

  function stopSong(song) {
    const audio = audioById.get(song.id);
    if (!audio) return;
    cancelRamp(song.id);
    audio.pause();
    audio.currentTime = 0;
    state.levels.delete(song.id);
    applyOutputVolume(song);
    removeMixer(song);
  }

  function stopAll() {
    songs.forEach(stopSong);
    state.warning = "";
    syncStatus();
  }

  function loadSounds() {
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

  function toggleLoop(song, force) {
    const shouldLoop = typeof force === "boolean" ? force : !state.looping.has(song.id);
    if (shouldLoop) state.looping.add(song.id);
    else state.looping.delete(song.id);

    const audio = audioById.get(song.id);
    if (audio) audio.loop = shouldLoop;

    const row = rowById.get(song.id);
    if (row) row.querySelector(".loop-button")?.setAttribute("aria-pressed", String(shouldLoop));
    const strip = mixerById.get(song.id);
    if (strip) strip.querySelector(".strip-loop")?.setAttribute("aria-pressed", String(shouldLoop));
  }

  function ensureMixer(song) {
    if (mixerById.has(song.id)) return mixerById.get(song.id);

    const fragment = els.mixerTemplate.content.cloneNode(true);
    const strip = fragment.querySelector(".channel-strip");
    const volume = strip.querySelector(".fader-input");
    const output = strip.querySelector(".strip-readout");
    const loopBtn = strip.querySelector(".strip-loop");
    const fadeBtn = strip.querySelector(".strip-fade");

    strip.querySelector(".scribble-name").textContent = songName(song);
    strip.querySelector(".channel-num").textContent = `CH ${song.id}`;
    loopBtn.setAttribute("aria-pressed", String(state.looping.has(song.id)));

    volume.addEventListener("input", () => {
      const audio = audioById.get(song.id);
      if (!audio) return;
      setSongLevel(song, Number(volume.value) / 100);
      output.textContent = volume.value;
    });

    loopBtn.addEventListener("click", () => toggleLoop(song));
    fadeBtn.addEventListener("click", () => fadeSong(song));

    strip.querySelector(".strip-stop").addEventListener("click", () => {
      stopSong(song);
      syncStatus();
    });

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

    els.nowPlaying.textContent = playing.length ? playing.map(songName).join(", ") : state.warning || "Nothing";
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
    songs.forEach((song) => {
      const fragment = els.template.content.cloneNode(true);
      const row = fragment.querySelector(".song-row");

      row.querySelector(".song-title").textContent = songName(song);
      row.querySelector(".play-button").addEventListener("click", () => playSong(song));
      row.querySelector(".fade-in-button").addEventListener("click", () => fadeInSong(song));
      row.querySelector(".loop-button").addEventListener("click", () => toggleLoop(song));
      row.querySelector(".fade-button").addEventListener("click", () => fadeSong(song));
      row.querySelector(".stop-button").addEventListener("click", () => {
        stopSong(song);
        syncStatus();
      });

      rowById.set(song.id, row);
      els.list.append(fragment);
    });
  }

  function updateMasterFill() {
    if (els.masterFill) els.masterFill.style.setProperty("--level", `${els.master.value}%`);
  }

  els.master.addEventListener("input", () => {
    state.master = Number(els.master.value) / 100;
    els.masterOutput.textContent = els.master.value;
    updateMasterFill();
    if (masterGain) masterGain.gain.value = state.master;
    else syncVolumes();
    updateMasterMeter();
  });
  updateMasterFill();

  els.stopAll.addEventListener("click", stopAll);

  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input")) return;
    if (event.key === "Escape") stopAll();
  });

  // Resume the audio context if the browser suspended it while hidden.
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
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
  syncStatus();
})();
