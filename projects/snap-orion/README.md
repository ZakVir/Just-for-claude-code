# snap-orion

A port of [**Snap**](https://github.com/deniza-png/snap) by Deniza that runs in the
[Orion browser](https://orionbrowser.com/) (Kagi's WebKit browser for macOS).

Snap your fingers and vanish from your own video in Google Meet. You stay in the
call. Your picture dissolves into particles and leaves an empty room behind,
until you snap again. Everything runs locally: no video or audio is sent anywhere.

All credit for the effect, snap detector and UI goes to the original project.
The upstream repo has no license file, so check with its author before
redistributing this port.

## What changed for Orion

| Upstream (Chrome) | This port | Why |
| --- | --- | --- |
| Content scripts use `"world": "MAIN"` | `loader.js` (normal content script) injects `page/*.js` into the page as `<script src>` tags from `web_accessible_resources` | `world: MAIN` is Chrome-only. Without it, the camera hook runs in the extension's isolated world and Meet never sees it. |
| Waits for `loadedmetadata` only | Also waits for the first decoded frame | WebKit can report `videoWidth = 0` at metadata time, which would size the effect canvas wrong. |
| Separate raw mic capture only | Falls back to a clone of Meet's own mic track if the raw capture fails or comes back muted | WebKit can refuse or mute a second capture of the same microphone. The fallback is less sensitive, and the pill says so. |
| AudioContext resumed on click/key | Also on `mousedown`, `touchstart` and tab refocus | WebKit's autoplay rules are stricter. |
| Hotkeys Cmd/Ctrl + Shift + X / H | Also **Ctrl + Option + X / H** | Orion/macOS can grab Cmd + Shift combos before the page sees them. |
| — | Patches the legacy `navigator.webkitGetUserMedia` too, and never mounts the pill twice | Belt and braces |

`page/effect.js` (the dissolve effect) is unchanged from upstream.

## Install in Orion (macOS)

1. Get this folder (`projects/snap-orion`) onto your Mac: download the repo ZIP
   and unzip it, or clone it.
2. Optional: run `./build.sh` to make `dist/snap-orion.zip` if you'd rather
   install from a single file.
3. In Orion, open **Tools → Extensions → Manage Extensions** and click
   **Add Extension**. Pick the `snap-orion` folder (or the zip).
4. Make sure the extension is enabled and allowed on `meet.google.com`.
5. Open Google Meet (reload the tab if it was already open) and allow camera and
   microphone access for `meet.google.com`.

After editing any file, remove and re-add the extension so Orion picks up the changes.

## How to use it

1. Join a Meet call. A small dark pill shows up in the top left.
2. Click the pill, then click **capture empty room**. Step out of frame for about 3 seconds.
3. Sit back down. When the status says **armed**, it's ready.
4. Snap your fingers to vanish. Snap again to come back.

Backups if the snap isn't heard: the **vanish / return** button, or
**Ctrl + Option + X** (Cmd/Ctrl + Shift + X also works where the browser
allows it). **Ctrl + Option + H** hides the pill.

## Troubleshooting

- **Pill never shows up.** Reload the Meet tab. Check the extension is enabled
  and has permission for `meet.google.com`. Open the Web Inspector console and
  look for `[snap]` messages.
- **Pill shows but says "waiting for camera" during a call.** Turn your camera
  off and on in Meet. The hook only catches camera requests made after the page loads.
- **"snap sound weak, use the hotkey".** Orion wouldn't give a second raw
  microphone stream, so the detector is listening through Meet's noise
  suppression. Snap closer to the mic, raise **snap sensitivity**, or use the hotkey.
- **Doesn't react to snaps / fires on its own.** Move the **snap sensitivity**
  slider right (more sensitive) or left (less sensitive).
- **Messy vanish or a ghost left behind.** The lighting changed. Capture the empty room again.

## Manual test checklist (Orion)

- [ ] Pill appears on meet.google.com after reload
- [ ] Camera preview in Meet still shows you (the stream goes through the canvas)
- [ ] Capture empty room → status goes to **armed**
- [ ] Ctrl + Option + X dissolves you, and again brings you back
- [ ] A finger snap toggles it
- [ ] Other participants see the effect

## Files

```
manifest.json      MV3 manifest: loader content script + web-accessible page scripts
loader.js          Isolated-world script that injects page/*.js into Meet
page/effect.js     Video pipeline + dissolve effect (upstream, unchanged)
page/snapdetect.js Microphone snap detector (+ WebKit fallbacks)
page/inject.js     getUserMedia hook, control pill, hotkeys (+ WebKit fixes)
build.sh           Zips the extension into dist/snap-orion.zip
```
