window.SHOW_CUES = [
  {
    scene: "Pre-Show",
    cues: [
      {
        id: "1",
        moment: "Top of show — opening music.",
        action: "Play overture",
        track: "Overture",
        file: "assets/audio/overture.mp3",
        volume: 80,
        fadeIn: 8,
        fadeOut: 3,
        loop: false
      },
      {
        id: "2",
        moment: "Straight after the overture — bells toll midnight.",
        action: "Play bells",
        track: "Midnight Bells",
        file: "assets/audio/midnight-bells.mp3",
        volume: 80,
        fadeIn: 8,
        fadeOut: 3,
        loop: false
      }
    ]
  },
  {
    scene: "Act I",
    cues: [
      {
        id: "3",
        moment: "Sc I — platform, night. Fade in & loop.",
        action: "Play crickets",
        track: "Cricket Chirps",
        file: "assets/audio/cricket-chirps.mp3",
        volume: 80,
        fadeIn: 8,
        fadeOut: 3,
        loop: true
      },
      {
        id: "4",
        moment: "Sc I — the Ghost first appears.",
        action: "Play ghost noise",
        track: "Ghost Noise",
        file: "assets/audio/ghost-noise.mp3",
        volume: 80,
        fadeIn: 8,
        fadeOut: 3,
        loop: false
      },
      {
        id: "5",
        moment: "Sc I — the cock crows, Ghost exits.",
        action: "Play Rooster",
        track: "Rooster",
        file: "assets/audio/rooster.mp3",
        volume: 80,
        fadeIn: 2,
        fadeOut: 2,
        loop: false
      },
      {
        id: "6",
        moment: "Sc II — room of state, court assembles.",
        action: "Play Court #1",
        track: "Court #1",
        file: "assets/audio/court-1.mp3",
        volume: 80,
        fadeIn: 8,
        fadeOut: 3,
        loop: false
      },
      {
        id: "8",
        moment: "Sc IV — the platform again, cold night.",
        action: "Play crickets",
        track: "Cricket Chirps",
        file: "assets/audio/cricket-chirps.mp3",
        volume: 80,
        fadeIn: 8,
        fadeOut: 3,
        loop: true
      },
      {
        id: "9",
        moment: "Sc IV — Ghost enters, lights turn purple.",
        action: "Play ghost noise",
        track: "Ghost Noise",
        file: "assets/audio/ghost-noise.mp3",
        volume: 80,
        fadeIn: 8,
        fadeOut: 3,
        loop: false
      }
    ]
  },
  {
    scene: "Act II",
    cues: [
      {
        id: "10",
        moment: "Sc II — King & Queen receive Rosencrantz and Guildenstern.",
        action: "Play Court #2",
        track: "Court #2",
        file: "assets/audio/court-2.mp3",
        volume: 80,
        fadeIn: 8,
        fadeOut: 3,
        loop: false
      }
    ]
  },
  {
    scene: "Act III",
    cues: [
      {
        id: "11",
        moment: "Sc I — after the nunnery scene, Ophelia alone.",
        action: "Play Ophelia #2",
        track: "Ophelia #2",
        file: "assets/audio/ophelia-2.mp3",
        volume: 80,
        fadeIn: 8,
        fadeOut: 3,
        loop: false
      },
      {
        id: "12",
        moment: "Sc III — Hamlet plays the harp.",
        action: "Play Lag Tuna",
        track: "Lag Tuna",
        file: "assets/audio/lag-tuna.m4a",
        volume: 80,
        fadeIn: 8,
        fadeOut: 3,
        loop: false
      },
      {
        id: "13",
        moment: "End of Act III — intermission.",
        action: "Play intermission",
        track: "Intermission",
        file: "assets/audio/intermission.mp3",
        volume: 80,
        fadeIn: 8,
        fadeOut: 3,
        loop: false
      }
    ]
  },
  {
    scene: "Act IV",
    cues: [
      {
        id: "14",
        moment: "Sc V — after Ophelia's mad songs, led off.",
        action: "Play Ophelia #2",
        track: "Ophelia #2",
        file: "assets/audio/ophelia-2.mp3",
        volume: 80,
        fadeIn: 8,
        fadeOut: 3,
        loop: false
      },
      {
        id: "15",
        moment: "End of Act IV — into the funeral.",
        action: "Play Funeral #1",
        track: "Funeral #1",
        file: "assets/audio/funeral-1.mp3",
        volume: 80,
        fadeIn: 8,
        fadeOut: 3,
        loop: false
      }
    ]
  },
  {
    scene: "Act V",
    cues: [
      {
        id: "16",
        moment: "Sc I — churchyard, after the grave is filled.",
        action: "Play Funeral #2",
        track: "Funeral #2",
        file: "assets/audio/funeral-2.mp3",
        volume: 80,
        fadeIn: 8,
        fadeOut: 3,
        loop: false
      },
      {
        id: "17",
        moment: "Sc II — the final duel; music runs through the act.",
        action: "Play Ophelia #1",
        track: "Ophelia #1",
        file: "assets/audio/ophelia-1.mp3",
        volume: 80,
        fadeIn: 8,
        fadeOut: 3,
        loop: false
      }
    ]
  }
];
