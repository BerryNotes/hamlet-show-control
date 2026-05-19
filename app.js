(function () {
  const VERSION = "v0.8.3";
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

  function applyOutputVolume(song) {
    const audio = audioById.get(song.id);
    if (audio) audio.volume = Math.min(1, Math.max(0, songLevel(song) * state.master));
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
    if (existing) existing.cancelled = true;
    state.ramps.delete(songId);
  }

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

  async function playSong(song) {
    const audio = getAudio(song);
    cancelRamp(song.id);
    audio.pause();
    audio.currentTime = 0;
    audio.loop = state.looping.has(song.id);
    setSongLevel(song, defaultSongLevel(song));
    ensureMixer(song);

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
    const startLevel = audio.paused ? 0 : songLevel(song);
    if (audio.paused) {
      audio.currentTime = 0;
      audio.loop = state.looping.has(song.id);
    }
    setSongLevel(song, startLevel);
    ensureMixer(song);
    updateMixer(song);

    try {
      if (audio.paused) await audio.play();
      state.warning = "";
      startRamp(song, startLevel, defaultSongLevel(song), song.fadeIn || 4, (level) => setSongLevel(song, level), syncStatus);
    } catch (error) {
      state.warning = `Could not play ${songName(song)}`;
    }

    syncStatus();
  }

  function fadeSong(song) {
    const audio = audioById.get(song.id);
    if (!audio || audio.paused) return;

    ensureMixer(song);
    startRamp(song, songLevel(song), 0, song.fadeOut ?? 5, (level) => setSongLevel(song, level), () => {
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

  function ensureMixer(song) {
    if (mixerById.has(song.id)) return mixerById.get(song.id);

    const fragment = els.mixerTemplate.content.cloneNode(true);
    const strip = fragment.querySelector(".channel-strip");
    const volume = strip.querySelector(".fader-input");
    const output = strip.querySelector(".strip-readout");
    const muteBtn = strip.querySelector(".strip-mute");

    strip.querySelector(".scribble-name").textContent = songName(song);
    strip.querySelector(".channel-num").textContent = `CH ${song.id}`;

    volume.addEventListener("input", () => {
      const audio = audioById.get(song.id);
      if (!audio) return;
      setSongLevel(song, Number(volume.value) / 100);
      output.textContent = volume.value;
    });

    muteBtn.addEventListener("click", () => {
      const audio = audioById.get(song.id);
      if (!audio) return;
      const next = !audio.muted;
      audio.muted = next;
      muteBtn.setAttribute("aria-pressed", String(next));
      updateMixer(song);
    });

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

    const faderPct = Math.round(songLevel(song) * 100);
    strip.querySelector(".fader-input").value = String(faderPct);
    strip.querySelector(".strip-readout").textContent = String(faderPct);
    strip.querySelector(".fader-fill").style.setProperty("--level", `${faderPct}%`);

    const outLevel = audio.muted ? 0 : songLevel(song) * state.master;
    const meterPct = Math.min(100, Math.max(0, outLevel * 100));
    const vuFill = strip.querySelector(".vu-fill");
    if (vuFill) vuFill.style.setProperty("--level", `${meterPct}%`);

    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    strip.querySelector(".strip-time").textContent = `${formatTime(audio.currentTime)} / ${formatTime(duration)}`;
  }

  function updateMasterMeter() {
    let sum = 0;
    mixerById.forEach((_strip, songId) => {
      const song = songs.find((s) => s.id === songId);
      const audio = audioById.get(songId);
      if (!song || !audio || audio.paused || audio.muted) return;
      sum += songLevel(song);
    });
    const level = Math.min(1, sum * state.master);
    const pct = level * 100;
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
      const momentEl = row.querySelector(".song-moment");
      if (momentEl) momentEl.textContent = song.moment || "";
      row.querySelector(".play-button").addEventListener("click", () => playSong(song));
      row.querySelector(".fade-in-button").addEventListener("click", () => fadeInSong(song));
      row.querySelector(".loop-button").addEventListener("click", (event) => {
        const shouldLoop = !state.looping.has(song.id);
        if (shouldLoop) state.looping.add(song.id);
        else state.looping.delete(song.id);

        const audio = audioById.get(song.id);
        if (audio) audio.loop = shouldLoop;

        event.currentTarget.setAttribute("aria-pressed", String(shouldLoop));
      });
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
    syncVolumes();
    updateMasterMeter();
  });
  updateMasterFill();

  els.stopAll.addEventListener("click", stopAll);

  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input")) return;
    if (event.key === "Escape") stopAll();
  });

  const versionEl = document.querySelector("#version");
  if (versionEl) versionEl.textContent = VERSION;

  renderSongs();
  loadSounds();
  syncStatus();
})();
