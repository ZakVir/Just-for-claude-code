# snap-macos

A native macOS port of [**Snap**](https://github.com/deniza-png/snap) by Deniza
(also ported to [Orion](../snap-orion) earlier in this workspace). Snap your
fingers and vanish from your own video. This version works in **FaceTime**
and any other app that reads from a camera — not just a browser — because
it installs a system-wide **virtual camera** ("Snap Camera") that apps pick
from their normal camera list.

All credit for the original effect, snap detector and UI concept goes to the
upstream project. The upstream repo has no license file, so check with its
author before redistributing this further.

## ⚠️ Before you build: read this

This was written in a Linux cloud container with **no macOS, no Xcode, and
no Swift compiler available**. Every file here was written by hand against
Apple's documented `CoreMediaIO`/`CMIOExtension` and `SystemExtensions`
APIs, but none of it could be compiled or run. The architecture is sound
and each piece (the audio detector, the Metal shader, the shared-state
plumbing) is written carefully, but the very first Xcode build may turn up
a wrong symbol name or a misconfigured entitlement — camera extensions are
a fairly obscure, sparsely-documented corner of macOS. **If that happens,
paste the exact error back and it'll get fixed quickly** — the design
doesn't need to change, just a symbol here or there.

## Why a virtual camera, not a browser extension

FaceTime isn't a web page — it doesn't run extensions. The only way to feed
a processed video stream into it (or Zoom, Photo Booth, QuickTime, etc.) on
modern macOS is a **Camera Extension**: a small system extension that
publishes a virtual camera device, which any app can select exactly like a
real webcam. That's what `SnapCameraExtension` is.

## How it's put together

```
Snap.app (menu bar, no Dock icon)          SnapCameraExtension (system extension)
├── owns: mic listening, global hotkey,    ├── owns: the real camera, the effect,
│         "capture background" countdown  │         and the virtual camera output
├── activates the extension on launch     ├── averages frames into the background
└── writes shared state ──────────────────▶   photo, runs the dissolve shader, and
                                               publishes "Snap Camera" to the OS
        ▲                                              │
        └────────── shared App Group container ────────┘
           (UserDefaults suite + background.png,
            Darwin notifications push "something changed")
```

There's no XPC/Mach-service connection between the two — deliberately, since
that's one of the fussier parts of this API to get right blind. Instead
both targets share a small `Shared/` module: settings (vanished, sensitivity)
live in an App Group `UserDefaults` suite, the captured photo is a PNG file
in the shared container, and a Darwin notification (`CFNotificationCenter`)
is what tells the other process "go re-read now" — plain `UserDefaults`
change notifications don't cross the process boundary on their own.

| Original (browser, JS) | This port (native, Swift) |
| --- | --- |
| `getUserMedia` hook in the Meet page | `SnapCameraExtension` opens the real camera itself via `AVCaptureSession`, so *any* app gets the effect, not just one site |
| Canvas 2D diff mask + particle animation | A Metal compute kernel (`DissolveShader.metal`): a soft colour-distance mask, a per-pixel staggered dissolve, and a short brighten/jitter "sparkle" as each pixel disappears — the same idea, reimplemented for the GPU rather than a literal pixel-for-pixel port |
| `captureBg()` averages 14 live frames | Same 14-frame countdown/trigger, but the extension keeps the *last* frame rather than averaging all 14 — simpler to get right without being able to test it; a straightforward follow-up if it turns out to matter |
| Web Audio `ScriptProcessorNode` + biquad highpass | `AVAudioEngine` tap + a one-pole highpass filter, feeding the *same* adaptive-floor burst-detection state machine as `snapdetect.js` |
| Floating pill UI + Cmd/Ctrl+Shift+H to hide it | A menu bar icon/popover instead — there's no in-frame overlay to hide, since this isn't drawn into the video at all |
| Cmd/Ctrl+Shift+X to vanish/return | Same, as a **global** hotkey (works while FaceTime, not Snap, has focus) |

## Requirements

- macOS 13 (Ventura) or later, Xcode 15+
- A free Apple ID is enough — no paid Developer Program membership needed
  for building and running this yourself locally
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) to generate the
  `.xcodeproj` from `project.yml` (`brew install xcodegen`). This avoids
  hand-editing a fragile Xcode project file; if you'd rather not install
  it, see **Manual Xcode setup** below.

## Build & install

1. `brew install xcodegen` (one-time)
2. `cd projects/snap-macos && xcodegen generate` → creates `Snap.xcodeproj`
3. `open Snap.xcodeproj`
4. Select the **Snap** target → *Signing & Capabilities* → pick your team
   (your personal Apple ID account is fine). Do the same for the
   **SnapCameraExtension** target — **both must use the same team**, and
   both need the `group.com.snap.app` App Group capability (Xcode may
   prompt to register it automatically; if not, add it under *+ Capability
   → App Groups*).
5. In Terminal, one time: `systemextensionsctl developer on` — this lets
   macOS load a system extension you built locally without full
   notarization. It may ask you to reboot.
6. Build & run the **Snap** scheme (Cmd+R). It will ask macOS to activate
   the camera extension; approve it in **System Settings → General → Login
   Items & Extensions** (look for "Snap" or "Camera Extensions").
7. Grant Snap camera and microphone access when prompted, and Input
   Monitoring access (for the global hotkey) if asked.
8. Open **FaceTime → Video menu → Camera → Snap Camera** (or any other
   app's camera picker).
9. Click the Snap menu bar icon → **capture empty room**, step out of frame
   for 3 seconds, then snap your fingers (or Cmd/Ctrl+Shift+X) to vanish.

### Manual Xcode setup (no XcodeGen)

1. File → New → Project → macOS → App, product name `Snap`, interface
   SwiftUI. Delete the placeholder `ContentView.swift`/`SnapApp.swift` it
   creates and add the files from `SnapApp/` and `Shared/` instead.
2. File → New → Target → search "System Extension" → **Camera Extension**,
   product name `SnapCameraExtension`. Delete its placeholder source files
   and add the files from `SnapCameraExtension/` and `Shared/` instead.
3. Set both targets' bundle identifiers to `com.snap.app` and
   `com.snap.app.camera-extension` (or update `Shared/Constants.swift` to
   match whatever you pick).
4. Add the App Group `group.com.snap.app` capability to both targets, and
   apply the two `.entitlements`/`Info.plist` files provided here (or copy
   their contents into what Xcode generated).
5. Continue from step 5 above.

### Re-installing after a rebuild

System extensions are stickier than a normal app: macOS keeps the old
version registered until the new one is explicitly activated again.
Rebuilding and re-running the Snap app target re-triggers activation
automatically; if the OS still shows old behavior, run
`systemextensionsctl list` to check what's registered, or
`systemextensionsctl uninstall <TEAMID> com.snap.app.camera-extension`
before reinstalling.

## Troubleshooting

- **"Snap Camera" doesn't show up in FaceTime.** Check
  `systemextensionsctl list` — if it's not there, re-run the Snap app and
  approve it in System Settings. Quit and reopen FaceTime after approving.
- **Extension needs approval and nothing happens.** The approval prompt
  sometimes only appears after opening System Settings yourself: General →
  Login Items & Extensions → Camera Extensions.
- **Vanish/return does nothing.** Make sure you captured a background
  first (the status dot turns green once armed), and that some app has
  actually opened "Snap Camera" — the extension only runs its capture
  session while a client is using it, same as a normal webcam.
- **Global hotkey doesn't fire.** Grant Snap access under System Settings
  → Privacy & Security → Input Monitoring.
- **Messy dissolve or a visible ghost.** Re-capture the empty room — the
  lighting has likely drifted since the last capture.

## Privacy

Same as the browser version: everything runs locally, on-device. No video
or audio ever leaves the machine, and the microphone is only used to detect
the snap sound itself — never recorded or sent anywhere.

## Files

```
project.yml                                 XcodeGen config — generates Snap.xcodeproj
Shared/Constants.swift                      Bundle IDs, app group ID, notification names
Shared/SharedState.swift                    App-group + Darwin-notification bridge between the two targets
SnapApp/                                    Menu bar host app (SwiftUI)
  SnapApp.swift, AppDelegate.swift            App entry, menu bar scene
  SnapController.swift                        Orchestrates everything the UI can do
  SnapDetector.swift                          Finger-snap detector (AVAudioEngine port of snapdetect.js)
  HotkeyManager.swift                         Global Cmd/Ctrl+Shift+X hotkey
  ExtensionInstaller.swift                    Activates the camera extension
  MenuBarView.swift                           The popover UI
SnapCameraExtension/                        The virtual camera (system extension)
  main.swift, SnapProviderSource.swift,       CMIOExtension boilerplate: provider -> device -> stream
  SnapDeviceSource.swift, SnapStreamSource.swift
  EffectEngine.swift                          Background capture + dissolve state machine, drives the Metal shader
  DissolveShader.metal                        The actual per-pixel dissolve/sparkle effect
```
