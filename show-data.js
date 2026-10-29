// `song: true` marks a musical track — only one song plays at a time
// (starting one stops the previous song). Sound effects are not songs and layer freely.
window.SHOW_CUES = [
  {
    scene: "Cues",
    cues: [
      {
        id: "1",
        moment: "Top of show.",
        action: "Play opening song",
        track: "Opening Song",
        file: "assets/audio/opening-song.mp3",
        volume: 80,
        stopFade: 3,
        loop: false,
        song: true
      },
      {
        id: "2",
        moment: "Doorbell rings.",
        action: "Play doorbell",
        track: "Doorbell",
        file: "assets/audio/doorbell.mp3",
        volume: 80,
        loop: false
      },
      {
        id: "3",
        moment: "Phone rings. Stop plays the pickup.",
        action: "Play phone",
        track: "Phone",
        file: "assets/audio/phone.mp3",
        volume: 63.5, // 80 minus 2 dB
        stopSoundVolume: 80,
        stopFade: 0.02,
        stopSound: "assets/audio/phone-end.mp3",
        loop: false
      },
      {
        id: "4",
        moment: "Door closes.",
        action: "Play door close",
        track: "Door Close",
        file: "assets/audio/door-close.mp3",
        volume: 80,
        loop: false
      },
      {
        id: "5",
        moment: "Door opens and closes.",
        action: "Play door open and close",
        track: "Door Open & Close",
        file: "assets/audio/door-open-close.mp3",
        volume: 80,
        loop: false
      }
    ]
  }
];
