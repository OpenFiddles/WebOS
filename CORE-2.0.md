# WebOS Core 2.0

## Runtime API

The desktop exposes `window.WebOS` and `window.WebOSCore` after Core.js loads. The API is versioned and includes:

- `WebOS.system.getInfo()` and `WebOS.capabilities()`
- `WebOS.hardware`: WebGPU adapter inspection, WebUSB, Web Serial, WebHID, WebCodecs support checks and WebXR session requests
- `WebOS.storage`: quota estimate, persistence request and OPFS root access
- `WebOS.processes`: register/list/subscribe to WebOS-managed tasks

Example:

```js
const report = WebOS.capabilities();
const usage = await WebOS.storage.estimate();
```

## Hardware and permissions

Device chooser methods must be called directly from a user action (for example, a click handler). The browser owns the final permission decision. WebOS does not enumerate devices silently. WebGPU adapter/device requests, WebXR sessions, WebUSB, Web Serial and WebHID are browser- and device-dependent and generally require a secure context. Feature detection is not a guarantee that a request will succeed.

## Storage

The existing IndexedDB virtual filesystem remains the default user-visible filesystem. OPFS is an optional private storage backend for applications that need file-like binary storage. Host file picker access remains user-selected and browser-mediated. Storage estimates and persistence requests may be unavailable or denied.

## Process management

Task Manager tracks WebOS-managed windows and tasks. It does not claim operating-system process control, per-app CPU accounting, or unrestricted memory telemetry. Browsers do not provide those privileges to ordinary web applications.

## Runtime modes

1. Browser mode: standard Web APIs and the WebOS virtual filesystem.
2. Virtualized mode: v86/Linux guest integration, subject to guest assets and emulator configuration.
3. Optional native companion: a separately installed, explicitly trusted local service could provide additional host integration. It is not included or silently installed by this browser runtime.

## Security model and limitations

Current registered handlers execute in the desktop page realm. WebOS permission prompts are cooperative API gates, not a hardened JavaScript sandbox. Do not load untrusted executable handlers. A production app marketplace needs isolated origins/iframes with restrictive sandbox and CSP policies, signed packages, integrity checks, and a server-side trust model. Browser permissions cannot be bypassed by WebOS.

## App lifecycle

Apps are registered through `WebOSAppRegistry`. The Hardware Manager and Task Manager are registered as built-in desktop apps. The task supervisor reports lifecycle state, not privileged OS-level scheduling.
