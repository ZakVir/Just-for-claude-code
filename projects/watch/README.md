# watch

> Landing spot for files sent over `magic-wormhole` for the `watch` skill (video analysis).

## What it is

A drop folder for files received via [magic-wormhole](https://github.com/magic-wormhole/magic-wormhole)
(`sudo apt install magic-wormhole`), e.g. video files handed to the `/watch` skill.

## How to run

```bash
wormhole receive <code>
```

## Notes

- In this container, `/usr/bin/python3` is pinned to Python 3.11, but the `magic-wormhole`
  apt package's compiled deps (`python3-cffi`/`python3-nacl`) only install for the distro
  default (Python 3.12) under `/usr/lib/python3/dist-packages`. Running `wormhole` directly
  fails with `ModuleNotFoundError: No module named '_cffi_backend'`. Workaround: run it via
  `python3.12 -m wormhole ...` instead.
- Magic-wormhole needs a WebSocket connection (`ws://relay.magic-wormhole.io:4000`) plus a
  raw-TCP transit relay for the actual file transfer. This session's egress proxy only
  supports HTTPS on port 443 — WebSocket upgrades and non-443 ports are explicitly not
  proxied, so `wormhole receive` times out connecting to the relay in this remote
  environment. It would need to run somewhere with unrestricted outbound network access.
