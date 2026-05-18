# Hamlet Show Control

A browser-based show-control board for running music and SFX live during a production.

## Run the board

Open `index.html` in a browser. No build step is required.

## Operator controls

- `Esc`: stop all audio immediately
- `STOP ALL`: emergency stop
- `Load sounds`: ask the browser to load every referenced audio file before the show

## Add production audio

Put audio files in `assets/audio`, then edit `show-data.js`.

Cue example:

```js
{
  id: "Q4",
  track: "Mousetrap Pulse",
  file: "assets/audio/mousetrap-pulse.mp3",
  volume: 74,
  fadeIn: 3,
  fadeOut: 7,
  loop: true
}
```

## Hosting

This project can be hosted on GitHub Pages, Netlify, Vercel, or any static web host.
