// `song: true` marks a musical track — only one song plays at a time
// (starting one stops the previous song). Cues / noises (crickets,
// rooster, bells) are not songs and layer freely.
window.SHOW_CUES = [
  {
    scene: "Sound Effects",
    cues: [
      {
        id: "1",
        moment: "Doorbell rings.",
        action: "Play doorbell",
        track: "Doorbell",
        file: "assets/audio/doorbell.mp3",
        volume: 80,
        loop: false
      },
      {
        id: "2",
        moment: "Phone rings.",
        action: "Play phone",
        track: "Phone",
        file: "assets/audio/phone.mp3",
        volume: 80,
        loop: false
      },
      {
        id: "3",
        moment: "Door closes.",
        action: "Play door close",
        track: "Door Close",
        file: "assets/audio/door-close.mp3",
        volume: 80,
        loop: false
      }
    ]
  }
];
