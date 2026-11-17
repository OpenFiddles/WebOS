# WebOS

> A browser-based desktop environment built with HTML, CSS, JavaScript, and browser APIs.

## About WebOS

WebOS provides a desktop-style workspace with draggable, resizable application windows, a launcher, dock, virtual file system, notes, browser, calculator, calendar, system monitor, WASM lab, and appearance settings.

The **FlairOS Emulator** app embeds the hosted FlairOS environment from [OpenFiddles/FlairOS](https://openfiddles.github.io/FlairOS/). It loads on demand inside a resizable WebOS window, so the emulator does not slow down the initial boot process.

## Run locally

Requires Node.js 24 or newer.

```sh
npm install
npm run dev
```

Then open http://localhost:3000.

## Deployment

The project is configured for Vercel. The deployment adds the cross-origin isolation headers used by browser features that need them.

## Appearance

Open **Better Settings** to choose a desktop theme, accent color, wallpaper preset or custom image, animation profile, and reduced-motion mode. Appearance preferences are stored locally in the current browser.

## Project notes

- The FlairOS page is hosted separately and requires an internet connection.
- The Alpine emulator assets are retained in the repository for future experiments but are not downloaded during normal WebOS startup.
- WebOS is licensed under GPL-3.0-or-later.
