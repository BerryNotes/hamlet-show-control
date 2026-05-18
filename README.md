# Hamlet Show Control

A browser-based show-control board for running music and SFX live during a production.

## Run the board

Open `index.html` in a browser. No build step is required.

## Operator controls

- `Space`: fire the standby cue
- `ArrowUp` / `ArrowDown`: move standby cue
- `Esc`: stop all audio immediately
- `GO`: fire the currently selected cue
- `STOP ALL`: emergency stop
- `Preload`: ask the browser to load every referenced audio file before the show

## Add production audio

Put audio files in `assets/audio`, then edit `show-data.js`.

Cue example:

```js
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
}
```

Fade-only cue example:

```js
{
  id: "Q5",
  moment: "Claudius rises",
  action: "Fade pulse",
  target: "Q4",
  fadeOut: 4
}
```

## Hosting

This project can be hosted on GitHub Pages, Netlify, Vercel, or any static web host.
