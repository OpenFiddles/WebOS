# WebOS

> A browser-based desktop environment built with HTML, CSS, JavaScript, and browser APIs.

WebOS brings a desktop-style workspace to the web. It includes a window manager, launcher, dock, virtual filesystem, built-in applications, a developer platform, and JavaScript/WebAssembly runtime experiments.

- **Live deployment:** https://web-os-iota.vercel.app
- **GitLab repository:** https://gitlab.com/openfiddles/WebOS
- **Project namespace:** OpenFiddles
- **Current package version:** 0.6
- **Citation metadata:** [CITATION.cff](CITATION.cff)
- **License:** GNU GPL v3.0 or later (see [LICENSE](LICENSE))

## Features

### Desktop experience
- Draggable, resizable, minimizable, and maximizable application windows.
- Launcher, taskbar, dock, desktop shortcuts, and desktop context menu.
- Appearance settings for themes, accent colors, custom wallpapers, animation profiles, reduced motion, and macOS/Windows/ChromeOS/Linux-inspired desktop presets.
- Window chrome presets and a live window designer for radius, blur, opacity, shadow, borders, and titlebar colors, plus custom CSS and reusable starter styles.
- Local session lock options: PIN/passcode, 3×3 pattern, or convenience swipe screen; PIN and pattern verifiers are salted PBKDF2 hashes stored locally.
- Animated desktop atmospheres (aurora, stars, mesh, waves, and rainfall), with reduced-motion support.
- Separate desktop and mobile interfaces selected by a shared automatic Interface Mode service. Phones open the touch-first mobile shell; tablets use the responsive hybrid desktop layout; laptops and desktops use the full desktop workspace. Manual overrides are available through `window.WebOSInterfaceMode.setPreference("auto" | "desktop" | "mobile")`.

### Built-in applications
The app registry currently includes Files, Notes, Better Settings, System Monitor, Calculator, Calendar, Documentation, Animation Studio, App Creator, WASM Lab, and the FlairOS Emulator.

The exact set of available applications can change as the project develops.

### Files and persistence
- WebOS provides a virtual filesystem backed by IndexedDB.
- Filesystem data and WASM app data use browser-local storage and are scoped by the current WebOS profile.
- Browser site-data clearing, browser storage eviction, or changing browser profiles can make locally stored data unavailable. Export or back up important work.
- The current Files importer is oriented toward supported text formats; do not assume that arbitrary binary files can be imported into the virtual filesystem.

### Developer platform and WebAssembly
- The WASM runtime supports installed app projects with WebAssembly, JavaScript, or combined JavaScript + WebAssembly runtime modes.
- App and module records are stored in IndexedDB.
- The runtime exposes a WebOS host API and selected compatibility imports, including a **basic** WASI Preview 1 subset. It is not a complete WASI implementation.
- App Creator and the in-app Documentation app provide additional guidance. Runtime and API details are evolving.

### Emulator experiments
- The FlairOS Emulator app opens the separately hosted FlairOS project from https://openfiddles.github.io/FlairOS/ directly in an embedded frame; sites that block embedding may need to be opened externally.
- The repository also contains v86-related emulator assets and a Debian emulator page. These are experimental assets and should not be confused with a fully integrated Linux subsystem.
- The separately hosted FlairOS environment requires network access.

## Requirements

- Node.js **24 or newer**.
- npm.
- A modern browser with JavaScript, IndexedDB, and service-worker support for the full experience.

## Run locally

```sh
git clone https://gitlab.com/openfiddles/WebOS.git
cd WebOS
npm install
npm run dev
```

Open http://localhost:3000.

For a non-watch server process:

```sh
npm start
```

The application is served by the Express server in `server.js`, which serves the `public/` directory and exposes lightweight Node.js API endpoints.

## Deployment

The repository includes `vercel.json` for Vercel deployment. It routes requests through `server.js` and configures cross-origin isolation response headers used by browser capabilities that require them.

The built-in WebOS Browser and its server-side proxy have been removed. WebOS remains a browser-hosted desktop environment, and links opened from apps are handed to the user's normal browser.

## Project structure

```text
.
├── server.js                 # Express static server and Node.js API endpoints
├── vercel.json               # Vercel routing and response headers
├── package.json              # Runtime requirements and npm scripts
├── LICENSE
├── public/
│   ├── index.html            # Main entry and desktop/mobile selection
│   ├── sw.js                 # Service worker and asset cache
│   ├── html/                 # Boot, display, mobile, and emulator pages
│   ├── css/                  # Boot and display styles
│   ├── images/               # UI and documentation assets
│   └── js/
│       ├── app.js            # Main application bootstrap
│       ├── boot/             # Boot flow
│       └── os/
│           ├── core/         # Shared interface-mode selection
│           ├── desktop/      # Filesystem, permissions, device info, WASM runtime
│           ├── mobile/       # Mobile runtime
│           └── window/       # Window manager and application modules
└── CHANGELOG
```

## Development notes

- Keep the existing modular separation between boot, desktop services, window/application modules, styles, and HTML.
- When adding a static asset or script needed at startup, review `public/sw.js` and its cache version. A stale service-worker cache can make deployed changes appear missing.
- Keep the mobile entry point in mind when changing shared boot or application behavior.
- Avoid describing browser APIs as native operating-system access. Capabilities such as battery, network information, filesystem access, and device details are browser- and permission-dependent.
- Do not treat an iframe alone as a complete security boundary. Review the actual embedding, origin, sandbox, permissions, and message-handling behavior of each app.

## Tests and quality checks

The current `package.json` test script is a placeholder and does **not** run an automated test suite. Do not interpret a successful `npm test` as evidence that the project passed tests. Before submitting changes, at minimum:

1. Run `npm install` with Node.js 24 or newer.
2. Run `npm run dev` and exercise the affected feature in a browser.
3. Check browser developer tools for console errors and failed network requests.
4. Test desktop and mobile entry points when shared code or styles change.
5. Verify service-worker cache behavior when changing startup assets.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the contribution workflow and [SECURITY.md](SECURITY.md) for security reporting guidance.

## Acknowledgements and third-party components

WebOS uses third-party packages listed in `package.json` and includes emulator-related assets and integrations. Their licenses and notices remain applicable to those components. In particular, the FlairOS environment is hosted separately; consult its own repository for its source, licensing, and contribution information.

## License

WebOS is distributed under the GNU General Public License, version 3 or (at your option) any later version. See [LICENSE](LICENSE).


## Core 2.0 platform services

WebOS Core 2.0 adds a versioned browser system API, hardware capability reporting, Hardware Manager, Task Manager, optional OPFS access, network online/offline events, and app-client access to supported services. See [Core 2.0 overview](CORE-2.0.md) and [developer API guide](docs/CORE-2.0-API.md). Hardware choosers remain user-initiated and subject to browser support and native permissions. This is not unrestricted host-OS access.
