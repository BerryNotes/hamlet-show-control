(function () {
  const scenes = Array.isArray(window.SHOW_CUES) ? window.SHOW_CUES : [];
  const songs = scenes.flatMap((scene) => scene.cues);
  const audioById = new Map();
  const rowById = new Map();

  const state = {
    master: 0.85,
    warning: ""
  };

  const els = {
    list: document.querySelector("#songList"),
    template: document.querySelector("#songTemplate"),
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
      audio.loop = Boolean(song.loop);
      audio.volume = songVolume(song);
      audio.addEventListener("ended", syncStatus);
      audioById.set(song.id, audio);
    }

    return audioById.get(song.id);
  }

  function ramp(audio, from, to, seconds, done) {
    const duration = Math.max(0, seconds || 0) * 1000;
    if (!duration) {
      audio.volume = to;
      if (done) done();
      return;
    }

    const started = performance.now();
    const step = (now) => {
      const progress = Math.min(1, (now - started) / duration);
      audio.volume = from + (to - from) * progress;
      if (progress < 1) requestAnimationFrame(step);
      else if (done) done();
    };

    requestAnimationFrame(step);
  }

  async function playSong(song) {
    const audio = getAudio(song);
    audio.pause();
    audio.currentTime = 0;
    audio.loop = Boolean(song.loop);
    audio.volume = 0;

    try {
      await audio.play();
      state.warning = "";
      ramp(audio, 0, songVolume(song), song.fadeIn ?? 1);
    } catch (error) {
      state.warning = `Could not play ${songName(song)}`;
    }

    syncStatus();
  }

  function fadeSong(song) {
    const audio = audioById.get(song.id);
    if (!audio || audio.paused) return;

    ramp(audio, audio.volume, 0, song.fadeOut ?? 5, () => {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = songVolume(song);
      syncStatus();
    });
  }

  function stopSong(song) {
    const audio = audioById.get(song.id);
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audio.volume = songVolume(song);
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
      if (audio && !audio.paused) audio.volume = songVolume(song);
    });
  }

  function syncStatus() {
    const playing = songs.filter((song) => {
      const audio = audioById.get(song.id);
      return audio && !audio.paused && !audio.ended;
    });

    els.nowPlaying.textContent = playing.length ? playing.map(songName).join(", ") : state.warning || "Nothing";

    songs.forEach((song) => {
      const audio = audioById.get(song.id);
      rowById.get(song.id)?.classList.toggle("is-playing", Boolean(audio && !audio.paused && !audio.ended));
    });
  }

  function renderSongs() {
    songs.forEach((song) => {
      const fragment = els.template.content.cloneNode(true);
      const row = fragment.querySelector(".song-row");

      row.querySelector(".song-title").textContent = songName(song);
      row.querySelector(".song-note").textContent = song.moment;
      row.querySelector(".play-button").addEventListener("click", () => playSong(song));
      row.querySelector(".fade-button").addEventListener("click", () => fadeSong(song));

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
  syncStatus();
})();
