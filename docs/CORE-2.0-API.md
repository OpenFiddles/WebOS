# WebOS Core 2.0 API Guide

## App client APIs

The first argument passed to every registered app handler is a `WebOSAppClient` instance.

```js
function openHardwareDemo(api) {
  const button = api.ui.createElement("button", {text:"Choose USB device"});
  button.addEventListener("click", async () => {
    try {
      const device = await api.hardware.requestUSB([]);
      console.log("Selected device", device.productName);
    } catch (error) { console.warn(error); }
  });
  return api.windows.create("Hardware demo", button);
}
```

### Namespaces
- `api.system.getInfo()`, `api.system.capabilities()`
- `api.hardware.capabilities()`, `requestUSB(filters)`, `requestSerial(options)`, `requestHID(filters)`, `gpuInfo()`, `codecSupport(kind, config)`, `requestXR(mode, options)`
- `api.storage.estimate()`, `persist()`, `openPrivateRoot()`
- `api.processes.register(info)`, `list()`, `subscribe(callback)`
- `api.network.isOnline()`, `onChange(callback)`
- Existing `api.filesystem`, `api.permissions`, `api.clipboard`, `api.geolocation`, `api.notifications`, `api.windows`, and `api.ui` remain available.

### User activation
Call chooser methods from the original user event handler. Do not place a WebOS permission dialog before a browser chooser: the dialog can consume transient user activation required by WebUSB, Web Serial, WebHID, and WebXR. The browser's native chooser is the device authorization step.

## App manifests

Registry manifests now preserve an optional `permissions` string array as metadata. This metadata is descriptive and does not grant access. Apps must still request WebOS permissions for supported cooperative APIs, and the host browser enforces its own permissions.

## Current platform boundary
WebOS is still a browser desktop. Its process manager observes WebOS windows and explicitly registered tasks; it cannot terminate arbitrary host processes or promise CPU scheduling. Network APIs expose online/offline state only; they do not bypass CORS, origin policy, or browser networking restrictions.


## Mobile PWA platform runtime

The mobile PWA loads `/js/os/mobile/PlatformRuntime.js` after shared services.
It exposes `window.WebOSPlatform` and `WebOS.platform` with browser-mediated
capability detection rather than assuming native device privileges.

- `formFactor`: phone, tablet, or desktop, recalculated on viewport changes.
- `viewport.get()` and `viewport.getSafeAreaInsets()`: visual viewport, orientation,
  scale, pixel ratio, and display cutout insets.
- `input`: touch, hover, pointer precision, reduced-motion preference, and touch points.
- `lifecycle`: page visibility state and subscription.
- `network`: online state and subscription.
- `install`: PWA install state and user-gesture install prompt when supported.
- `capabilities`: service workers, notifications, sharing, file handling, File System
  Access, and OPFS feature detection.

Detection does not grant permissions or guarantee support. The runtime emits
`webos:platform-ready` and `webos:platform:<event>` events. It is included in the
mobile service-worker core cache.
