(function () {
  const VERSION = "v0.23.0";
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
    ramps: new Map(),
    boost: true,
    showStarted: false
  };

  // Web Audio analysis graph (built lazily on first play)
  let audioCtx = null;
  let masterGain = null;
  let masterAnalyser = null;
  let masterData = null;
  let masterMeterLevel = 0;
  let masterComp = null;
  let masterMakeup = null;
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
    goButton: document.querySelector("#goButton"),
    standbyName: document.querySelector("#standbyName")
  };

  state.standbyIndex = songs.length ? 0 : -1;

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

    // Master bus: compressor tames peaks + makeup gain lifts the average
    // loudness, so the show plays louder without clipping when cues overlap.
    // The BOOST button toggles this on/off (see applyBoost).
    masterComp = audioCtx.createDynamicsCompressor();
    masterComp.attack.value = 0.003;
    masterComp.release.value = 0.25;
    masterMakeup = audioCtx.createGain();

    masterGain.connect(masterComp);
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
    const clampedTo = Math.min(1, Math.max(0, to));

    if (graph && audioCtx) {
      const g = graph.gain.gain;
      const now = audioCtx.currentTime;
      // Start from the channel's actual current gain so a fade-out begins
      // wherever the fader is now, not from the cue's default level.
      const safeFrom = Math.max(0.0001, g.value);
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
      startRamp(song, songLevel(song), clampedTo, seconds, (level) => setSongLevel(song, level), onComplete);
    }
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
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
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
      if (audio && !audio.paused && !audio.ended) fadeSong(other);
    });
  }

  async function playSong(song) {
    const audio = getAudio(song);
    stopOtherSongs(song);
    cancelRamp(song.id);
    audio.pause();
    audio.currentTime = 0;
    audio.loop = state.looping.has(song.id);
    setSongLevel(song, defaultSongLevel(song));
    ensureMixer(song);
    prepareAudioOutput(song);
    flashCue(song);

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
    stopOtherSongs(song);
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
    flashCue(song);

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

    els.nowPlaying.textContent = playing.length ? playing.map(songName).join(", ") : state.warning || "The rest is silence.";
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
        row.querySelector(".play-button").addEventListener("click", () => playSong(song));
        row.querySelector(".fade-in-button").addEventListener("click", () => fadeInSong(song));
        row.querySelector(".loop-button").addEventListener("click", () => toggleLoop(song));
        row.querySelector(".fade-button").addEventListener("click", () => fadeSong(song));
        row.querySelector(".stop-button").addEventListener("click", () => {
          stopSong(song);
          syncStatus();
        });

        // Click anywhere on the card (not a button) to arm it as standby.
        row.addEventListener("click", (event) => {
          if (event.target.closest("button")) return;
          setStandby(songs.indexOf(song));
        });

        rowById.set(song.id, row);
        els.list.append(fragment);
      });
    });
  }

  function setStandby(index) {
    if (!songs.length) {
      state.standbyIndex = -1;
    } else {
      state.standbyIndex = Math.min(songs.length - 1, Math.max(0, index));
    }
    updateStandbyView();
  }

  function moveStandby(delta) {
    if (!songs.length) return;
    const base = state.standbyIndex < 0 ? 0 : state.standbyIndex + delta;
    setStandby(base);
  }

  function updateStandbyView() {
    songs.forEach((song, i) => {
      rowById.get(song.id)?.classList.toggle("is-standby", i === state.standbyIndex);
    });
    const song = songs[state.standbyIndex];
    if (els.standbyName) els.standbyName.textContent = song ? songName(song) : "—";
    if (els.goButton) els.goButton.disabled = !song;
    if (song) {
      rowById.get(song.id)?.scrollIntoView({ block: "nearest" });
    }
  }

  function fireStandby() {
    const song = songs[state.standbyIndex];
    if (!song) return;
    playSong(song);
    moveStandby(1);
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
  applyMaster();

  els.stopAll.addEventListener("click", stopAll);
  if (els.goButton) els.goButton.addEventListener("click", fireStandby);

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

    // Show-control transport: Space fires the armed cue, arrows move it.
    if (event.key === " " || event.code === "Space") {
      event.preventDefault();
      fireStandby();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveStandby(1);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      moveStandby(-1);
    }
  });

  // Resume the audio context (and re-take the wake lock) when the tab
  // becomes visible again — both can be dropped while hidden.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    if (state.showStarted && !wakeLock) requestWakeLock();
  });

  // Any tap/click also nudges a suspended context back to life (covers
  // OS audio interruptions like a phone call or notification).
  document.addEventListener("pointerdown", () => {
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  });

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

  // Rotating Hamlet epigraphs in the tagline (skipped if reduced motion).
  const taglineEl = document.querySelector("#tagline");
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (taglineEl && !reduceMotion) {
    const quotes = [
      "The play’s the thing.",
      "To be, or not to be.",
      "Though this be madness, yet there is method in’t.",
      "Brevity is the soul of wit.",
      "What a piece of work is a man.",
      "Alas, poor Yorick.",
      "The rest is silence."
    ];
    let qi = 0;
    setInterval(() => {
      qi = (qi + 1) % quotes.length;
      taglineEl.classList.add("is-fading");
      setTimeout(() => {
        taglineEl.textContent = "“" + quotes[qi] + "”";
        taglineEl.classList.remove("is-fading");
      }, 600);
    }, 7000);
  }

  renderSongs();
  loadSounds();
  syncStatus();
  updateStandbyView();

  // Offline support: register the service worker and have it pre-cache
  // every audio file so the board runs with no network (booth-wifi safe).
  if ("serviceWorker" in navigator) {
    const audioUrls = Array.from(new Set(songs.map((song) => song.file)));
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
