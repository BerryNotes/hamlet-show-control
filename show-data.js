window.SHOW_CUES = [
  {
    scene: "House",
    cues: [
      {
        id: "Q0",
        moment: "House opens",
        action: "Start bed",
        track: "Pre-show Atmosphere",
        file: "assets/audio/pre-show.mp3",
        volume: 62,
        fadeIn: 2,
        fadeOut: 6,
        loop: true
      },
      {
        id: "Q0.5",
        moment: "House to half",
        action: "Fade bed",
        target: "Q0",
        fadeOut: 8
      }
    ]
  },
  {
    scene: "Act I, Scene I",
    cues: [
      {
        id: "Q1",
        moment: "Ghost entrance",
        action: "Play hit",
        track: "Ghost Appears",
        file: "assets/audio/ghost-appears.mp3",
        volume: 86,
        fadeIn: 0,
        fadeOut: 4,
        loop: false
      },
      {
        id: "Q2",
        moment: "Ghost exits",
        action: "Fade",
        target: "Q1",
        fadeOut: 5
      }
    ]
  },
  {
    scene: "Act II",
    cues: [
      {
        id: "Q3",
        moment: "Players enter",
        action: "Play music",
        track: "Players Arrival",
        file: "assets/audio/players-arrive.mp3",
        volume: 78,
        fadeIn: 1,
        fadeOut: 4,
        loop: false
      }
    ]
  },
  {
    scene: "Act III",
    cues: [
      {
        id: "Q4",
        moment: "The Mousetrap begins",
        action: "Start pulse",
        track: "Mousetrap Pulse",
        file: "assets/audio/mousetrap-pulse.mp3",
        volume: 74,
        fadeIn: 3,
        fadeOut: 7,
        loop: true
      },
      {
        id: "Q5",
        moment: "Claudius rises",
        action: "Sting",
        track: "Claudius Sting",
        file: "assets/audio/claudius-sting.mp3",
        volume: 92,
        fadeIn: 0,
        fadeOut: 3,
        loop: false
      }
    ]
  },
  {
    scene: "Act IV",
    cues: [
      {
        id: "Q6",
        moment: "Ophelia enters",
        action: "Start vocal",
        track: "Ophelia Fragment",
        file: "assets/audio/ophelia-fragment.mp3",
        volume: 70,
        fadeIn: 2,
        fadeOut: 6,
        loop: false
      }
    ]
  },
  {
    scene: "Act V",
    cues: [
      {
        id: "Q7",
        moment: "Duel turn",
        action: "Fight hit",
        track: "Final Duel Hit",
        file: "assets/audio/final-duel-hit.mp3",
        volume: 94,
        fadeIn: 0,
        fadeOut: 2,
        loop: false
      },
      {
        id: "Q8",
        moment: "Final image",
        action: "Play end",
        track: "End State",
        file: "assets/audio/end-state.mp3",
        volume: 78,
        fadeIn: 4,
        fadeOut: 10,
        loop: true
      }
    ]
  }
];
