(function () {
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
    seekTargets: new Map()
  };

  const els = {
    list: document.querySelector("#songList"),
    template: document.querySelector("#songTemplate"),
    mixerList: document.querySelector("#mixerList"),
    mixerTemplate: document.querySelector("#mixerTemplate"),
    emptyMixer: document.querySelector("#emptyMixer"),
    nowPlaying: document.querySelector("#nowPlaying"),
    master: document.querySelector("#masterVolume"),
    masterOutput: document.querySelector("#masterOutput"),
    load: document.querySelector("#loadSounds"),
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
  }

  function getAudio(song) {
    if (!audioById.has(song.id)) {
      const audio = new Audio(song.file);
      audio.preload = "auto";
      audio.loop = state.looping.has(song.id);
      audio.addEventListener("loadedmetadata", () => updateMixer(song));
      audio.addEventListener("timeupdate", () => updateMixer(song));
      audio.addEventListener("seeked", () => {
        const target = state.seekTargets.get(song.id);
        if (Number.isFinite(target) && Math.abs(audio.currentTime - target) > 1.5) return;
        if (Number.isFinite(target)) state.seekTargets.delete(song.id);
        updateMixer(song);
      });
      audio.addEventListener("ended", syncStatus);
      audioById.set(song.id, audio);
      applyOutputVolume(song);
    }

    return audioById.get(song.id);
  }

  function ramp(from, to, seconds, onUpdate, done) {
    const duration = Math.max(0, seconds || 0) * 1000;
    if (!duration) {
      if (onUpdate) onUpdate(to);
      if (done) done();
      return;
    }

    const started = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      const value = from + (to - from) * progress;
      if (onUpdate) onUpdate(value);
      if (progress < 1) requestAnimationFrame(step);
      else if (done) done();
    };

    requestAnimationFrame(step);
  }

  async function playSong(song) {
    const audio = getAudio(song);
    state.seekTargets.delete(song.id);
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
    state.seekTargets.delete(song.id);
    audio.pause();
    audio.currentTime = 0;
    audio.loop = state.looping.has(song.id);
    setSongLevel(song, 0);
    ensureMixer(song);
    updateMixer(song);

    try {
      await audio.play();
      state.warning = "";
      ramp(0, defaultSongLevel(song), song.fadeIn || 4, (level) => setSongLevel(song, level), syncStatus);
    } catch (error) {
      state.warning = `Could not play ${songName(song)}`;
    }

    syncStatus();
  }

  function fadeSong(song) {
    const audio = audioById.get(song.id);
    if (!audio || audio.paused) return;

    ensureMixer(song);
    ramp(songLevel(song), 0, song.fadeOut ?? 5, (level) => setSongLevel(song, level), () => {
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
    state.seekTargets.delete(song.id);
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
    songs.forEach((song) => getAudio(song).load());
    els.load.textContent = "Sounds loaded";
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
    const row = fragment.querySelector(".mixer-row");
    const durationBar = row.querySelector(".duration-bar");
    const volume = row.querySelector(".mixer-volume");
    const output = row.querySelector(".mixer-output");

    row.querySelector(".mixer-title").textContent = songName(song);

    const setDurationBar = (ratio) => {
      const clamped = Math.min(1, Math.max(0, ratio));
      const percent = clamped * 100;
      durationBar.style.setProperty("--progress", `${percent}%`);
      durationBar.setAttribute("aria-valuenow", String(Math.round(clamped * 1000)));
    };

    const showSeekTime = (seconds) => {
      const audio = audioById.get(song.id);
      if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;

      const clampedSeconds = Math.min(audio.duration, Math.max(0, seconds));
      setDurationBar(clampedSeconds / audio.duration);
      row.dataset.seekTarget = String(clampedSeconds);
      row.querySelector(".duration-time").textContent = `${formatTime(clampedSeconds)} / ${formatTime(audio.duration)}`;
    };

    const applySeekTime = (seconds) => {
      const audio = audioById.get(song.id);
      if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;

      const target = Math.min(audio.duration, Math.max(0, seconds));
      state.seekTargets.set(song.id, target);
      showSeekTime(target);

      const forceSeek = () => {
        if (state.seekTargets.get(song.id) !== target) return;
        try {
          audio.currentTime = target;
        } catch (error) {
          state.warning = `Could not seek ${songName(song)}`;
        }
      };

      forceSeek();
      setTimeout(forceSeek, 80);
      setTimeout(forceSeek, 250);
      setTimeout(() => updateMixer(song), 350);
      setTimeout(() => {
        if (state.seekTargets.get(song.id) === target && Math.abs(audio.currentTime - target) < 1.5) {
          state.seekTargets.delete(song.id);
          updateMixer(song);
        }
      }, 1000);
    };

    const seekToRatio = (ratio) => {
      const audio = audioById.get(song.id);
      if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      showSeekTime(Math.min(1, Math.max(0, ratio)) * audio.duration);
    };

    const seekToPointer = (event) => {
      const rect = durationBar.getBoundingClientRect();
      if (!rect.width) return;
      seekToRatio((event.clientX - rect.left) / rect.width);
    };

    durationBar.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      row.dataset.seeking = "true";
      durationBar.setPointerCapture(event.pointerId);
      seekToPointer(event);
    });

    durationBar.addEventListener("pointermove", (event) => {
      if (row.dataset.seeking !== "true") return;
      seekToPointer(event);
    });

    durationBar.addEventListener("pointerup", (event) => {
      const target = Number(row.dataset.seekTarget);
      if (Number.isFinite(target)) applySeekTime(target);
      row.dataset.seeking = "false";
      if (durationBar.hasPointerCapture(event.pointerId)) durationBar.releasePointerCapture(event.pointerId);
      updateMixer(song);
    });

    durationBar.addEventListener("pointercancel", () => {
      row.dataset.seeking = "false";
      updateMixer(song);
    });

    durationBar.addEventListener("keydown", (event) => {
      const audio = audioById.get(song.id);
      if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
      const step = event.shiftKey ? 10 : 2;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        applySeekTime(Math.max(0, audio.currentTime - step));
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        applySeekTime(Math.min(audio.duration, audio.currentTime + step));
      }
    });

    volume.addEventListener("input", () => {
      const audio = audioById.get(song.id);
      if (!audio) return;
      setSongLevel(song, Number(volume.value) / 100);
      output.textContent = `${volume.value}%`;
    });

    mixerById.set(song.id, row);
    els.mixerList.append(fragment);
    els.emptyMixer.hidden = true;
    updateMixer(song);
    return row;
  }

  function updateMixer(song) {
    const row = mixerById.get(song.id);
    const audio = audioById.get(song.id);
    if (!row || !audio) return;

    const percent = Math.round(songLevel(song) * 100);
    row.querySelector(".mixer-volume").value = String(percent);
    row.querySelector(".mixer-output").textContent = `${percent}%`;

    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    const target = state.seekTargets.get(song.id);
    const displayTime = Number.isFinite(target) ? target : audio.currentTime;
    const progress = duration ? (displayTime / duration) * 1000 : 0;
    const durationBar = row.querySelector(".duration-bar");
    if (row.dataset.seeking !== "true") {
      const clampedProgress = Math.min(1000, Math.max(0, progress));
      durationBar.style.setProperty("--progress", `${clampedProgress / 10}%`);
      durationBar.setAttribute("aria-valuenow", String(Math.round(clampedProgress)));
    }
    row.querySelector(".duration-time").textContent = `${formatTime(displayTime)} / ${formatTime(duration)}`;
  }

  function removeMixer(song) {
    const row = mixerById.get(song.id);
    if (!row) return;

    row.remove();
    mixerById.delete(song.id);
    state.seekTargets.delete(song.id);
    els.emptyMixer.hidden = mixerById.size > 0;
  }

  function syncStatus() {
    const playing = songs.filter((song) => {
      const audio = audioById.get(song.id);
      return audio && !audio.paused && !audio.ended;
    });

    els.nowPlaying.textContent = playing.length ? playing.map(songName).join(", ") : state.warning || "Nothing";

    songs.forEach((song) => {
      const audio = audioById.get(song.id);
      const isPlaying = Boolean(audio && !audio.paused && !audio.ended);
      rowById.get(song.id)?.classList.toggle("is-playing", isPlaying);
      if (isPlaying) updateMixer(song);
      else removeMixer(song);
    });
  }

  function renderSongs() {
    songs.forEach((song) => {
      const fragment = els.template.content.cloneNode(true);
      const row = fragment.querySelector(".song-row");

      row.querySelector(".song-title").textContent = songName(song);
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

  els.master.addEventListener("input", () => {
    state.master = Number(els.master.value) / 100;
    els.masterOutput.textContent = `${els.master.value}%`;
    syncVolumes();
  });

  els.load.addEventListener("click", loadSounds);
  els.stopAll.addEventListener("click", stopAll);

  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input")) return;
    if (event.key === "Escape") stopAll();
  });

  renderSongs();
  loadSounds();
  syncStatus();
})();
