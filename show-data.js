// `song: true` marks a musical track — only one song plays at a time
// (starting one stops any other playing song). Cues / noises (crickets,
// ghost, rooster, bells) are not songs and layer freely.
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
        loop: false,
        song: true
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
        volume: 40,
        fadeIn: 8,
        fadeOut: 3,
        loop: true
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
        loop: false,
        song: true
      },
      {
        id: "7",
        moment: "End of Sc III — transition out of Polonius's house.",
        action: "Play Lag Tuna",
        track: "Lag Tuna",
        file: "assets/audio/lag-tuna.m4a",
        volume: 80,
        fadeIn: 8,
        fadeOut: 3,
        loop: false,
        song: true
      },
      {
        id: "8",
        moment: "Sc IV — the platform again, cold night. Fade in & loop.",
        action: "Play crickets",
        track: "Cricket Chirps",
        file: "assets/audio/cricket-chirps.mp3",
        volume: 40,
        fadeIn: 8,
        fadeOut: 3,
        loop: true
      },
      {
        id: "10",
        moment: "End of Sc V — close of Act I, lights down.",
        action: "Play Lag Tuna",
        track: "Lag Tuna",
        file: "assets/audio/lag-tuna.m4a",
        volume: 80,
        fadeIn: 8,
        fadeOut: 3,
        loop: false,
        song: true
      }
    ]
  },
  {
    scene: "Act III",
    cues: [
      {
        id: "11",
        moment: "Sc I — top of the nunnery scene.",
        action: "Play Ophelia #1",
        track: "Ophelia #1",
        file: "assets/audio/ophelia-1.mp3",
        volume: 80,
        fadeIn: 8,
        fadeOut: 3,
        loop: false,
        song: true
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
        loop: false,
        song: true
      }
    ]
  },
  {
    scene: "Act IV",
    cues: [
      {
        id: "14",
        moment: "End of Act IV — into the funeral.",
        action: "Play Funeral #1",
        track: "Funeral #1",
        file: "assets/audio/funeral-1.mp3",
        volume: 80,
        fadeIn: 8,
        fadeOut: 3,
        loop: false,
        song: true
      }
    ]
  },
  {
    scene: "Act V",
    cues: [
      {
        id: "15",
        moment: "Sc I — churchyard, after the grave is filled.",
        action: "Play Funeral #2",
        track: "Funeral #2",
        file: "assets/audio/funeral-2.mp3",
        volume: 80,
        fadeIn: 8,
        fadeOut: 3,
        loop: false,
        song: true
      },
      {
        id: "17",
        moment: "End of show — fades out on its own.",
        action: "Play Finale",
        track: "Finale",
        file: "assets/audio/finale.mp3",
        volume: 70,
        fadeIn: 4,
        fadeOut: 0,
        loop: false,
        song: true
      }
    ]
  }
];
