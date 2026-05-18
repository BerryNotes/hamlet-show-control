(function () {
  const scenes = Array.isArray(window.SHOW_CUES) ? window.SHOW_CUES : [];
  const songs = scenes.flatMap((scene) => scene.cues);
  const audioById = new Map();
  const rowById = new Map();
  const mixerById = new Map();

  const state = {
    master: 0.85,
    warning: "",
    looping: new Set()
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

  function songVolume(song) {
    return ((song.volume ?? 80) / 100) * state.master;
  }

  function getAudio(song) {
    if (!audioById.has(song.id)) {
      const audio = new Audio(song.file);
      audio.preload = "auto";
      audio.loop = state.looping.has(song.id);
      audio.volume = songVolume(song);
      audio.addEventListener("ended", syncStatus);
      audioById.set(song.id, audio);
    }

    return audioById.get(song.id);
  }

  function ramp(audio, from, to, seconds, onUpdate, done) {
    const duration = Math.max(0, seconds || 0) * 1000;
    if (!duration) {
      audio.volume = to;
      if (onUpdate) onUpdate();
      if (done) done();
      return;
    }

    const started = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      audio.volume = from + (to - from) * progress;
      if (onUpdate) onUpdate();
      if (progress < 1) requestAnimationFrame(step);
      else if (done) done();
    };

    requestAnimationFrame(step);
  }

  async function playSong(song) {
    const audio = getAudio(song);
    audio.pause();
    audio.currentTime = 0;
    audio.loop = state.looping.has(song.id);
    audio.volume = songVolume(song);
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
    audio.pause();
    audio.currentTime = 0;
    audio.loop = state.looping.has(song.id);
    audio.volume = 0;
    ensureMixer(song);
    updateMixer(song);

    try {
      await audio.play();
      state.warning = "";
      ramp(audio, 0, songVolume(song), song.fadeIn || 4, () => updateMixer(song), syncStatus);
    } catch (error) {
      state.warning = `Could not play ${songName(song)}`;
    }

    syncStatus();
  }

  function fadeSong(song) {
    const audio = audioById.get(song.id);
    if (!audio || audio.paused) return;

    ensureMixer(song);
    ramp(audio, audio.volume, 0, song.fadeOut ?? 5, () => updateMixer(song), () => {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = songVolume(song);
      removeMixer(song);
      syncStatus();
    });
  }

  function stopSong(song) {
    const audio = audioById.get(song.id);
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audio.volume = songVolume(song);
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
        audio.volume = songVolume(song);
        updateMixer(song);
      }
    });
  }

  function ensureMixer(song) {
    if (mixerById.has(song.id)) return mixerById.get(song.id);

    const fragment = els.mixerTemplate.content.cloneNode(true);
    const row = fragment.querySelector(".mixer-row");
    const volume = row.querySelector(".mixer-volume");
    const output = row.querySelector(".mixer-output");

    row.querySelector(".mixer-title").textContent = songName(song);
    volume.addEventListener("input", () => {
      const audio = audioById.get(song.id);
      if (!audio) return;
      audio.volume = Number(volume.value) / 100;
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

    const percent = Math.round(audio.volume * 100);
    row.querySelector(".mixer-volume").value = String(percent);
    row.querySelector(".mixer-output").textContent = `${percent}%`;
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
      row.querySelector(".song-note").textContent = song.moment;
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
