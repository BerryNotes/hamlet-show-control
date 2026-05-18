(function () {
  const scenes = Array.isArray(window.SHOW_CUES) ? window.SHOW_CUES : [];
  const cues = scenes.flatMap((scene, sceneIndex) =>
    scene.cues.map((cue) => ({ ...cue, scene: scene.scene, sceneIndex }))
  );

  const audioByCue = new Map();
  const rowByCue = new Map();
  const state = {
    standbyIndex: 0,
    master: 0.85,
    warning: ""
  };

  const els = {
    list: document.querySelector("#cueList"),
    template: document.querySelector("#cueTemplate"),
    standby: document.querySelector("#standbyCue"),
    standbyMoment: document.querySelector("#standbyMoment"),
    playing: document.querySelector("#playingCue"),
    master: document.querySelector("#masterVolume"),
    masterOutput: document.querySelector("#masterOutput"),
    go: document.querySelector("#goButton"),
    prev: document.querySelector("#previousCue"),
    next: document.querySelector("#nextCue"),
    panic: document.querySelector("#panicStop"),
    preload: document.querySelector("#preloadAll")
  };

  function findCue(id) {
    return cues.find((cue) => cue.id === id);
  }

  function baseVolume(cue) {
    return ((cue.volume ?? 80) / 100) * state.master;
  }

  function displayName(cue) {
    if (!cue) return "End of show";
    return cue.track || cue.action || cue.moment || cue.id;
  }

  function getAudio(cue) {
    if (!cue?.file) return null;

    if (!audioByCue.has(cue.id)) {
      const audio = new Audio(cue.file);
      audio.preload = "auto";
      audio.loop = Boolean(cue.loop);
      audio.volume = 0;
      audio.addEventListener("ended", syncStatus);
      audioByCue.set(cue.id, audio);
    }

    return audioByCue.get(cue.id);
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

  async function fireCue(cue) {
    if (!cue) return;

    if (cue.target) {
      fadeCue(findCue(cue.target), cue.fadeOut);
      advanceStandby();
      return;
    }

    const audio = getAudio(cue);
    if (!audio || (cue.volume === 0 && cue.file.includes("silence"))) {
      state.warning = "";
      advanceStandby();
      return;
    }

    audio.pause();
    audio.currentTime = 0;
    audio.loop = Boolean(cue.loop);
    audio.volume = 0;

    try {
      await audio.play();
      state.warning = "";
      ramp(audio, 0, baseVolume(cue), cue.fadeIn);
    } catch (error) {
      state.warning = `Missing sound: ${displayName(cue)}`;
    }

    advanceStandby();
    syncStatus();
  }

  function fadeCue(cue, seconds) {
    const audio = cue ? audioByCue.get(cue.id) : null;
    if (!audio || audio.paused) return;

    ramp(audio, audio.volume, 0, seconds ?? cue.fadeOut, () => {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = baseVolume(cue);
      syncStatus();
    });
  }

  function stopCue(cue) {
    const audio = audioByCue.get(cue.id);
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
    audio.volume = baseVolume(cue);
  }

  function stopAll() {
    cues.forEach(stopCue);
    state.warning = "";
    syncStatus();
  }

  function preloadAll() {
    cues.forEach((cue) => getAudio(cue)?.load());
    els.preload.textContent = "Sounds loaded";
  }

  function setStandby(index) {
    state.standbyIndex = Math.max(0, Math.min(cues.length, index));
    syncStatus();
    cues[state.standbyIndex] && rowByCue.get(cues[state.standbyIndex].id)?.scrollIntoView({ block: "center" });
  }

  function advanceStandby() {
    setStandby(state.standbyIndex + 1);
  }

  function syncVolumes() {
    cues.forEach((cue) => {
      const audio = audioByCue.get(cue.id);
      if (audio && !audio.paused) audio.volume = baseVolume(cue);
    });
  }

  function syncStatus() {
    const standby = cues[state.standbyIndex];
    els.standby.textContent = standby ? `${standby.id}: ${displayName(standby)}` : "End of show";
    els.standbyMoment.textContent = standby ? standby.moment : "";

    const playing = cues.filter((cue) => {
      const audio = audioByCue.get(cue.id);
      return audio && !audio.paused && !audio.ended;
    });

    els.playing.textContent = playing.length ? playing.map(displayName).join(", ") : state.warning || "Nothing";

    cues.forEach((cue) => {
      const row = rowByCue.get(cue.id);
      const audio = audioByCue.get(cue.id);
      row?.classList.toggle("is-next", cue === standby);
      row?.classList.toggle("is-playing", Boolean(audio && !audio.paused && !audio.ended));
    });
  }

  function renderList() {
    scenes.forEach((scene) => {
      const heading = document.createElement("h2");
      heading.textContent = scene.scene;
      els.list.append(heading);

      scene.cues.forEach((cue) => {
        const index = cues.findIndex((item) => item.id === cue.id);
        const fragment = els.template.content.cloneNode(true);
        const row = fragment.querySelector(".cue-row");
        row.querySelector(".cue-id").textContent = cue.id;
        row.querySelector(".cue-title").textContent = displayName(cue);
        row.querySelector(".cue-moment").textContent = cue.moment;
        row.addEventListener("click", () => setStandby(index));
        rowByCue.set(cue.id, row);
        els.list.append(fragment);
      });
    });
  }

  els.master.addEventListener("input", () => {
    state.master = Number(els.master.value) / 100;
    els.masterOutput.textContent = `${els.master.value}%`;
    syncVolumes();
  });

  els.go.addEventListener("click", () => fireCue(cues[state.standbyIndex]));
  els.prev.addEventListener("click", () => setStandby(state.standbyIndex - 1));
  els.next.addEventListener("click", () => setStandby(state.standbyIndex + 1));
  els.panic.addEventListener("click", stopAll);
  els.preload.addEventListener("click", preloadAll);

  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input")) return;
    if (event.code === "Space") {
      event.preventDefault();
      fireCue(cues[state.standbyIndex]);
    }
    if (event.key === "ArrowUp") setStandby(state.standbyIndex - 1);
    if (event.key === "ArrowDown") setStandby(state.standbyIndex + 1);
    if (event.key === "Escape") stopAll();
  });

  renderList();
  syncStatus();
})();
