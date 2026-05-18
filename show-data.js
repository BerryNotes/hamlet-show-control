window.SHOW_CUES = [
  {
    scene: "House / Preset",
    cues: [
      {
        id: "Q0",
        moment: "Audience entering",
        action: "Start house bed",
        track: "Elsinore Night Preset",
        file: "assets/audio/q00-elsinore-night-preset.mp3",
        volume: 45,
        fadeIn: 8,
        fadeOut: 8,
        loop: true,
        note: "Cold castle exterior: sparse wind, distant crickets, low stone-room air."
      },
      {
        id: "Q0.5",
        moment: "House to places",
        action: "Fade house bed",
        target: "Q0",
        fadeOut: 10
      }
    ]
  },
  {
    scene: "Act I, Scene I - Platform",
    cues: [
      {
        id: "Q1",
        moment: "Scene begins: low blue, platform watch",
        action: "Start crickets",
        track: "Midnight Watch Crickets",
        file: "assets/audio/q01-midnight-watch-crickets.mp3",
        volume: 52,
        fadeIn: 3,
        fadeOut: 5,
        loop: true,
        note: "Naturalistic, not lush. This is the baseline for the soldiers."
      },
      {
        id: "Q2",
        moment: "Marcellus: 'Peace, break thee off. Look where it comes again.'",
        action: "Ghost pressure in",
        track: "Ghost Arrival Pressure",
        file: "assets/audio/q02-ghost-arrival-pressure.mp3",
        volume: 72,
        fadeIn: 1,
        fadeOut: 5,
        loop: true,
        note: "Crickets should feel swallowed by cold air. Low bowed metal / reversed breath."
      },
      {
        id: "Q2.5",
        moment: "Ghost fully visible",
        action: "Fade crickets",
        target: "Q1",
        fadeOut: 4
      },
      {
        id: "Q3",
        moment: "Horatio: 'I charge thee speak.'",
        action: "Ghost shimmer",
        track: "Question the Ghost",
        file: "assets/audio/q03-question-the-ghost.mp3",
        volume: 64,
        fadeIn: 0,
        fadeOut: 4,
        loop: false,
        note: "Short, uneasy response. Let the actor's silence carry it."
      },
      {
        id: "Q4",
        moment: "Rooster crows, Ghost exits",
        action: "Rooster / snap to morning",
        track: "Rooster Crow",
        file: "assets/audio/q04-rooster-crow.mp3",
        volume: 82,
        fadeIn: 0,
        fadeOut: 1,
        loop: false
      },
      {
        id: "Q4.5",
        moment: "After Ghost exit",
        action: "Fade ghost pressure",
        target: "Q2",
        fadeOut: 3
      }
    ]
  },
  {
    scene: "Act I, Scene II - Court",
    cues: [
      {
        id: "Q5",
        moment: "Scene change into state room / court entrance",
        action: "Court music",
        track: "Mirth in Funeral",
        file: "assets/audio/q05-mirth-in-funeral.mp3",
        volume: 62,
        fadeIn: 2,
        fadeOut: 5,
        loop: true,
        note: "Polished court music with something slightly sour underneath."
      },
      {
        id: "Q5.5",
        moment: "After toast, Claudius turns to Hamlet",
        action: "Fade court music",
        target: "Q5",
        fadeOut: 5
      },
      {
        id: "Q6",
        moment: "Hamlet alone: 'O that this too too solid flesh...'",
        action: "Memory tone",
        track: "Black Court Air",
        file: "assets/audio/q06-black-court-air.mp3",
        volume: 38,
        fadeIn: 4,
        fadeOut: 8,
        loop: true,
        note: "Almost subconscious. Can be cut if it competes with text."
      },
      {
        id: "Q6.5",
        moment: "Horatio enters",
        action: "Fade memory tone",
        target: "Q6",
        fadeOut: 4
      }
    ]
  },
  {
    scene: "Act I, Scene III - Polonius House",
    cues: [
      {
        id: "Q7",
        moment: "Laertes / Ophelia / Polonius domestic scene",
        action: "No music",
        track: "Silence",
        file: "assets/audio/q07-silence.mp3",
        volume: 0,
        fadeIn: 0,
        fadeOut: 0,
        loop: false,
        note: "Keep this dry and human unless a scene-change cover is needed."
      }
    ]
  },
  {
    scene: "Act I, Scene IV-V - Ghost Revelation",
    cues: [
      {
        id: "Q8",
        moment: "Return to platform: Hamlet and Horatio enter",
        action: "Start crickets",
        track: "Midnight Watch Crickets",
        file: "assets/audio/q01-midnight-watch-crickets.mp3",
        volume: 48,
        fadeIn: 3,
        fadeOut: 4,
        loop: true
      },
      {
        id: "Q9",
        moment: "Horatio: 'Look, my lord, it comes!'",
        action: "Ghost theme",
        track: "Ghost Beckons",
        file: "assets/audio/q09-ghost-beckons.mp3",
        volume: 76,
        fadeIn: 1,
        fadeOut: 6,
        loop: true,
        note: "The Ghost's main identity: low, old, wounded, not horror-movie loud."
      },
      {
        id: "Q9.5",
        moment: "Ghost appears, crickets quiet",
        action: "Fade crickets",
        target: "Q8",
        fadeOut: 3
      },
      {
        id: "Q10",
        moment: "Scene V begins / remote castle",
        action: "Deepen ghost theme",
        track: "Prison House Underscore",
        file: "assets/audio/q10-prison-house-underscore.mp3",
        volume: 70,
        fadeIn: 3,
        fadeOut: 10,
        loop: true,
        note: "Under the Ghost's revelation. Must leave room for Patrick's voice."
      },
      {
        id: "Q11",
        moment: "Ghost: 'Revenge his foul and most unnatural murder.'",
        action: "Murder sting",
        track: "Unnatural Murder",
        file: "assets/audio/q11-unnatural-murder.mp3",
        volume: 80,
        fadeIn: 0,
        fadeOut: 5,
        loop: false
      },
      {
        id: "Q12",
        moment: "Ghost exits: 'Adieu, adieu, adieu. Remember me.'",
        action: "Ghost vanishes",
        track: "Remember Me Tail",
        file: "assets/audio/q12-remember-me-tail.mp3",
        volume: 70,
        fadeIn: 0,
        fadeOut: 9,
        loop: false
      },
      {
        id: "Q12.5",
        moment: "Hamlet alone after Ghost",
        action: "Fade revelation bed",
        target: "Q10",
        fadeOut: 7
      },
      {
        id: "Q13",
        moment: "End Act I blackout",
        action: "Act out hit",
        track: "Act I End",
        file: "assets/audio/q13-act-one-end.mp3",
        volume: 78,
        fadeIn: 0,
        fadeOut: 8,
        loop: false
      }
    ]
  },
  {
    scene: "Act II - Surveillance",
    cues: [
      {
        id: "Q14",
        moment: "Act II opening / Polonius house",
        action: "Short transition",
        track: "After the Oath",
        file: "assets/audio/q14-after-the-oath.mp3",
        volume: 46,
        fadeIn: 1,
        fadeOut: 6,
        loop: false,
        note: "Brief cover only, then dry dialogue."
      },
      {
        id: "Q15",
        moment: "Rosencrantz and Guildenstern arrive",
        action: "Court comic flicker",
        track: "Useful Friends",
        file: "assets/audio/q15-useful-friends.mp3",
        volume: 48,
        fadeIn: 0,
        fadeOut: 3,
        loop: false,
        note: "Tiny social flourish if desired; can be omitted."
      },
      {
        id: "Q16",
        moment: "Hamlet: 'Denmark's a prison.'",
        action: "Prison color",
        track: "Denmark Is a Prison",
        file: "assets/audio/q16-denmark-prison.mp3",
        volume: 42,
        fadeIn: 2,
        fadeOut: 8,
        loop: true
      },
      {
        id: "Q16.5",
        moment: "Rosencrantz and Guildenstern exit",
        action: "Fade prison color",
        target: "Q16",
        fadeOut: 5
      },
      {
        id: "Q17",
        moment: "End Act II: 'My thoughts be bloody...'",
        action: "Resolve to revenge",
        track: "Bloody Thoughts",
        file: "assets/audio/q17-bloody-thoughts.mp3",
        volume: 78,
        fadeIn: 0,
        fadeOut: 7,
        loop: false
      }
    ]
  },
  {
    scene: "Act III - Ophelia / Prayer / Harp / Closet",
    cues: [
      {
        id: "Q18",
        moment: "To be or not to be",
        action: "Silence",
        track: "Silence",
        file: "assets/audio/q07-silence.mp3",
        volume: 0,
        fadeIn: 0,
        fadeOut: 0,
        loop: false,
        note: "Do not underscore unless rehearsal proves the room needs support."
      },
      {
        id: "Q19",
        moment: "Claudius kneels to pray",
        action: "Chapel pressure",
        track: "Words Without Thoughts",
        file: "assets/audio/q19-words-without-thoughts.mp3",
        volume: 40,
        fadeIn: 4,
        fadeOut: 6,
        loop: true,
        note: "Low organ-like pressure, restrained."
      },
      {
        id: "Q19.5",
        moment: "King exits after prayer",
        action: "Fade chapel pressure",
        target: "Q19",
        fadeOut: 5
      },
      {
        id: "Q20",
        moment: "Hamlet enters playing harp",
        action: "Live or recorded harp",
        track: "Hamlet Harp Figure",
        file: "assets/audio/q20-hamlet-harp-figure.mp3",
        volume: 58,
        fadeIn: 1,
        fadeOut: 4,
        loop: true,
        note: "If Evan can actually play, this should be live instead of playback."
      },
      {
        id: "Q20.5",
        moment: "Hamlet sets harp down",
        action: "Fade harp",
        target: "Q20",
        fadeOut: 3
      },
      {
        id: "Q21",
        moment: "Hamlet strikes sour chord before exit",
        action: "Sour harp chord",
        track: "Sour Chord",
        file: "assets/audio/q21-sour-chord.mp3",
        volume: 72,
        fadeIn: 0,
        fadeOut: 3,
        loop: false
      },
      {
        id: "Q22",
        moment: "Polonius killed behind curtain",
        action: "Dagger / body hit",
        track: "Arras Kill",
        file: "assets/audio/q22-arras-kill.mp3",
        volume: 86,
        fadeIn: 0,
        fadeOut: 2,
        loop: false,
        note: "Only if the practical stab/body sound is not enough."
      },
      {
        id: "Q23",
        moment: "Lights turn purple, lightning, Ghost enters closet",
        action: "Lightning / ghost return",
        track: "Closet Ghost",
        file: "assets/audio/q23-closet-ghost.mp3",
        volume: 78,
        fadeIn: 0,
        fadeOut: 6,
        loop: true
      },
      {
        id: "Q23.5",
        moment: "Ghost exits, lights warm",
        action: "Fade closet ghost",
        target: "Q23",
        fadeOut: 5
      },
      {
        id: "Q24",
        moment: "Intermission lights up",
        action: "Intermission music",
        track: "Intermission",
        file: "assets/audio/q24-intermission.mp3",
        volume: 55,
        fadeIn: 5,
        fadeOut: 8,
        loop: true
      }
    ]
  },
  {
    scene: "Act IV - Fallout / Ophelia / Laertes",
    cues: [
      {
        id: "Q24.5",
        moment: "Act IV begins",
        action: "Fade intermission",
        target: "Q24",
        fadeOut: 8
      },
      {
        id: "Q25",
        moment: "Hamlet: 'Safely stowed.'",
        action: "Uneasy room tone",
        track: "After Polonius",
        file: "assets/audio/q25-after-polonius.mp3",
        volume: 34,
        fadeIn: 3,
        fadeOut: 5,
        loop: true
      },
      {
        id: "Q25.5",
        moment: "Hamlet taken to King",
        action: "Fade uneasy tone",
        target: "Q25",
        fadeOut: 4
      },
      {
        id: "Q26",
        moment: "Ophelia first mad scene",
        action: "Ophelia songs",
        track: "Ophelia Song Support",
        file: "assets/audio/q26-ophelia-song-support.mp3",
        volume: 36,
        fadeIn: 1,
        fadeOut: 4,
        loop: true,
        note: "Prefer live singing. This can be a very light drone/pitch bed, not a full backing track."
      },
      {
        id: "Q26.5",
        moment: "Ophelia exits: 'Good night, sweet ladies'",
        action: "Fade song support",
        target: "Q26",
        fadeOut: 5
      },
      {
        id: "Q27",
        moment: "Noise within / Priest: Laertes rebellion",
        action: "Rabble outside",
        track: "Laertes Riot",
        file: "assets/audio/q27-laertes-riot.mp3",
        volume: 70,
        fadeIn: 2,
        fadeOut: 4,
        loop: true,
        note: "Muffled crowd: 'Laertes shall be king' can be recorded with cast."
      },
      {
        id: "Q28",
        moment: "King: 'The doors are broke.'",
        action: "Door break",
        track: "Doors Broke",
        file: "assets/audio/q28-doors-broke.mp3",
        volume: 84,
        fadeIn: 0,
        fadeOut: 2,
        loop: false
      },
      {
        id: "Q28.5",
        moment: "Laertes confronts King",
        action: "Fade rabble",
        target: "Q27",
        fadeOut: 5
      },
      {
        id: "Q29",
        moment: "Ophelia re-enters with flowers",
        action: "Fragile Ophelia color",
        track: "Flowers",
        file: "assets/audio/q29-flowers.mp3",
        volume: 36,
        fadeIn: 3,
        fadeOut: 6,
        loop: true
      },
      {
        id: "Q29.5",
        moment: "Ophelia exits",
        action: "Fade flowers",
        target: "Q29",
        fadeOut: 6
      },
      {
        id: "Q30",
        moment: "Queen: 'Your sister's drown'd, Laertes.'",
        action: "Brook lament",
        track: "Ophelia Drowned",
        file: "assets/audio/q30-ophelia-drowned.mp3",
        volume: 50,
        fadeIn: 3,
        fadeOut: 9,
        loop: true,
        note: "Water and distant voice fragments, very restrained under Gertrude."
      },
      {
        id: "Q30.5",
        moment: "End Act IV",
        action: "Fade brook lament",
        target: "Q30",
        fadeOut: 8
      }
    ]
  },
  {
    scene: "Act V, Scene I - Graveyard",
    cues: [
      {
        id: "Q31",
        moment: "Churchyard begins",
        action: "Graveyard air",
        track: "Churchyard Morning",
        file: "assets/audio/q31-churchyard-morning.mp3",
        volume: 38,
        fadeIn: 5,
        fadeOut: 6,
        loop: true,
        note: "Cool open air, distant birds, no sentiment."
      },
      {
        id: "Q32",
        moment: "Clowns dig / bones thrown",
        action: "Earth and bone sweeteners",
        track: "Grave Digging",
        file: "assets/audio/q32-grave-digging.mp3",
        volume: 55,
        fadeIn: 0,
        fadeOut: 2,
        loop: false,
        note: "Optional, only if props are too quiet."
      },
      {
        id: "Q33",
        moment: "Funeral procession enters with Ophelia",
        action: "Funeral bell / processional",
        track: "Ophelia Funeral",
        file: "assets/audio/q33-ophelia-funeral.mp3",
        volume: 58,
        fadeIn: 3,
        fadeOut: 7,
        loop: true
      },
      {
        id: "Q33.5",
        moment: "Hamlet reveals himself: 'This is I, Hamlet the Dane.'",
        action: "Fade funeral",
        target: "Q33",
        fadeOut: 3
      },
      {
        id: "Q34",
        moment: "Laertes and Hamlet grapple in grave",
        action: "Grave fight impact",
        track: "Grave Struggle",
        file: "assets/audio/q34-grave-struggle.mp3",
        volume: 78,
        fadeIn: 0,
        fadeOut: 3,
        loop: false
      },
      {
        id: "Q31.5",
        moment: "End graveyard",
        action: "Fade graveyard air",
        target: "Q31",
        fadeOut: 8
      }
    ]
  },
  {
    scene: "Act V, Scene II - Duel / Ending",
    cues: [
      {
        id: "Q35",
        moment: "Ophelia ghostly shroud crosses before duel setup",
        action: "Ophelia apparition",
        track: "White Shroud",
        file: "assets/audio/q35-white-shroud.mp3",
        volume: 44,
        fadeIn: 1,
        fadeOut: 5,
        loop: false
      },
      {
        id: "Q36",
        moment: "The court enters for duel",
        action: "Duel music begins",
        track: "The Wager",
        file: "assets/audio/q36-the-wager.mp3",
        volume: 62,
        fadeIn: 4,
        fadeOut: 8,
        loop: true,
        note: "Script says music continues through the act. Keep it rhythmic but transparent."
      },
      {
        id: "Q37",
        moment: "First hit",
        action: "Hit sweetener",
        track: "First Touch",
        file: "assets/audio/q37-first-touch.mp3",
        volume: 76,
        fadeIn: 0,
        fadeOut: 1,
        loop: false
      },
      {
        id: "Q38",
        moment: "Queen swoons / tray clatters",
        action: "Goblet tray clatter",
        track: "Poison Cup",
        file: "assets/audio/q38-poison-cup.mp3",
        volume: 84,
        fadeIn: 0,
        fadeOut: 2,
        loop: false
      },
      {
        id: "Q39",
        moment: "Queen: 'The drink, the drink! I am poison'd.'",
        action: "Music darkens",
        track: "The Trap Springs",
        file: "assets/audio/q39-trap-springs.mp3",
        volume: 70,
        fadeIn: 0,
        fadeOut: 6,
        loop: false
      },
      {
        id: "Q40",
        moment: "Hamlet stabs King / forces cup",
        action: "King death hit",
        track: "Then Venom",
        file: "assets/audio/q40-then-venom.mp3",
        volume: 86,
        fadeIn: 0,
        fadeOut: 5,
        loop: false
      },
      {
        id: "Q36.5",
        moment: "Hamlet dying with Horatio",
        action: "Fade duel music",
        target: "Q36",
        fadeOut: 10
      },
      {
        id: "Q41",
        moment: "Horatio: 'Good night, sweet prince...'",
        action: "Angels rest",
        track: "Flights of Angels",
        file: "assets/audio/q41-flights-of-angels.mp3",
        volume: 58,
        fadeIn: 5,
        fadeOut: 12,
        loop: true,
        note: "The emotional release. Simple, not syrupy."
      },
      {
        id: "Q42",
        moment: "Ghost emerges and takes throne",
        action: "Ghost final image",
        track: "Elsinore Remembers",
        file: "assets/audio/q42-elsinore-remembers.mp3",
        volume: 68,
        fadeIn: 3,
        fadeOut: 12,
        loop: true
      },
      {
        id: "Q41.5",
        moment: "Ghost settles on throne",
        action: "Fade angels rest",
        target: "Q41",
        fadeOut: 8
      },
      {
        id: "Q43",
        moment: "Curtain / blackout / bows prep",
        action: "End fade",
        target: "Q42",
        fadeOut: 12
      }
    ]
  }
];
