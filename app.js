(function () {
  const scenes = Array.isArray(window.SHOW_CUES) ? window.SHOW_CUES : [];
  const cues = scenes.flatMap((scene, sceneIndex) =>
    scene.cues.map((cue) => ({ ...cue, scene: scene.scene, sceneIndex }))
  );

  const audioByCue = new Map();
  const rowByCue = new Map();
  const state = {
    standbyIndex: 0,
    master: 0.85
  };

  const els = {
    clock: document.querySelector("#clock"),
    sceneList: document.querySelector("#sceneList"),
    rows: document.querySelector("#cueRows"),
    template: document.querySelector("#cueRowTemplate"),
    standby: document.querySelector("#standbyCue"),
    playing: document.querySelector("#playingCue"),
    master: document.querySelector("#masterVolume"),
    masterOutput: document.querySelector("#masterOutput"),
    go: document.querySelector("#goButton"),
    prev: document.querySelector("#previousCue"),
    next: document.querySelector("#nextCue"),
    panic: document.querySelector("#panicStop"),
    preload: document.querySelector("#preloadAll")
  };

  function cueLabel(cue) {
    return `${cue.id} · ${cue.moment}`;
  }

  function findCue(id) {
    return cues.find((cue) => cue.id === id);
  }

  function baseVolume(cue) {
    return ((cue.volume ?? 80) / 100) * state.master;
  }

  function getAudio(cue) {
    if (!cue.file) return null;

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
    if (cue.target) {
      fadeCue(findCue(cue.target), cue.fadeOut);
      advanceStandby();
      return;
    }

    const audio = getAudio(cue);
    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;
    audio.loop = Boolean(cue.loop);
    audio.volume = 0;

    try {
      await audio.play();
      ramp(audio, 0, baseVolume(cue), cue.fadeIn);
    } catch (error) {
      els.playing.textContent = `Missing file: ${cue.file}`;
    }

    advanceStandby();
    syncStatus();
  }

  function fadeCue(cue, seconds) {
    if (!cue) return;
    const audio = audioByCue.get(cue.id);
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
    syncStatus();
  }

  function stopAll() {
    cues.forEach(stopCue);
  }

  function preloadAll() {
    cues.forEach((cue) => getAudio(cue)?.load());
  }

  function setStandby(index) {
    state.standbyIndex = Math.max(0, Math.min(cues.length - 1, index));
    syncStatus();
    rowByCue.get(cues[state.standbyIndex]?.id)?.scrollIntoView({ block: "center" });
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
    els.standby.textContent = standby ? cueLabel(standby) : "End of show";

    const playing = cues.filter((cue) => {
      const audio = audioByCue.get(cue.id);
      return audio && !audio.paused && !audio.ended;
    });

    els.playing.textContent = playing.length ? playing.map((cue) => cue.id).join(", ") : "Nothing";

    cues.forEach((cue) => {
      const row = rowByCue.get(cue.id);
      const audio = audioByCue.get(cue.id);
      row?.classList.toggle("is-standby", cue === standby);
      row?.classList.toggle("is-playing", Boolean(audio && !audio.paused && !audio.ended));
    });

    document.querySelectorAll(".scene-button").forEach((button) => {
      button.setAttribute(
        "aria-current",
        String(Number(button.dataset.sceneIndex) === standby?.sceneIndex)
      );
    });
  }

  function renderScenes() {
    scenes.forEach((scene, sceneIndex) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "scene-button";
      button.dataset.sceneIndex = String(sceneIndex);
      button.innerHTML = `<strong>${scene.scene}</strong><span>${scene.cues.length} cues</span>`;
      button.addEventListener("click", () => {
        const firstCue = cues.findIndex((cue) => cue.sceneIndex === sceneIndex);
        setStandby(firstCue);
      });
      els.sceneList.append(button);
    });
  }

  function renderRows() {
    cues.forEach((cue, index) => {
      const fragment = els.template.content.cloneNode(true);
      const row = fragment.querySelector("tr");
      const volume = fragment.querySelector(".cue-volume");
      const volumeOutput = fragment.querySelector(".cue-volume-output");

      fragment.querySelector(".cue-id").textContent = cue.id;
      fragment.querySelector(".cue-moment").textContent = cue.moment;
      fragment.querySelector(".cue-action").textContent = cue.action;
      fragment.querySelector(".cue-track").textContent = cue.track || cue.target || "";
      fragment.querySelector(".cue-fade").textContent = cue.target ? `${cue.fadeOut || 0}s out` : `${cue.fadeIn || 0}s in / ${cue.fadeOut || 0}s out`;
      fragment.querySelector(".cue-loop").textContent = cue.loop ? "Yes" : "";

      volume.value = cue.volume ?? 0;
      volume.disabled = !cue.file;
      volumeOutput.textContent = cue.file ? `${volume.value}%` : "";
      volume.addEventListener("input", () => {
        cue.volume = Number(volume.value);
        volumeOutput.textContent = `${cue.volume}%`;
        syncVolumes();
      });

      fragment.querySelector(".row-play").addEventListener("click", () => fireCue(cue));
      fragment.querySelector(".row-fade").addEventListener("click", () => fadeCue(cue));
      fragment.querySelector(".row-stop").addEventListener("click", () => stopCue(cue));
      row.addEventListener("click", (event) => {
        if (!event.target.closest("button, input")) setStandby(index);
      });

      rowByCue.set(cue.id, row);
      els.rows.append(fragment);
    });
  }

  function tickClock() {
    els.clock.textContent = new Date().toLocaleTimeString([], { hour12: false });
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

  renderScenes();
  renderRows();
  syncStatus();
  tickClock();
  setInterval(tickClock, 1000);
})();
