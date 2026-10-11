# DeskMate

DeskMate is an open-source desk widget built by [Lapis Studios](https://lapistudios.com) that you can add anything to. It ships with a password vault and music player, and the community builds **Mates** (add-ons) for the rest, like trackers, tools and games.

Press **Ctrl+Alt+D** and it pops up in the bottom-right corner of your screen. Press it again (or Esc) and it's gone.

## What's built in

- **Password vault**: AES-256 encrypted, stored only on your PC. Built-in authenticator (2FA codes, with QR import), an optional phone code to unlock, and an optional lock to your Windows account with automatic encrypted backups.
- **Music**: play your own music files and free internet radio, and control YouTube Music, Spotify or anything else playing on your PC from a player bar and global hotkeys (Ctrl+Alt+P, Ctrl+Alt+Left/Right).
- **Status pill**: shrink DeskMate to a few dots in the corner that Mates can light up.
- **Settings**: light, dark or match-Windows themes with any accent colour (Mates follow along), a sound for each Mate event, your own open shortcut, panel size and see-through, vault lock timers, and automatic updates for DeskMate and its Mates.

## Mates

**Want to build one? Read the [Mate guide](docs/PLUGINS.md).**

Everything else is a Mate (called a plugin in the code): a small web page (HTML, CSS, JavaScript) that gets its own tab, a bar at the bottom, or both. Mates run sandboxed. They can't see your vault, your files or other Mates, and they only get the abilities you approve when installing them.

- Add them from the puzzle-piece **Mates** button: from the **Supply Closet**, or **From folder** while you're building one.
- `verified-plugins/` holds the verified Mates (the Supply Closet's contents):
    - `claude` tracks what Claude Code did since you last checked, shows working/done/needs-input dots, and lets you reply in the background.
    - `schedule-one` is a Schedule I game reference: mixer, effects, ingredients and customer notes.
    - `timers` runs quick timers and clock-time reminders with Windows notifications. Anything that came due while DeskMate was closed shows up as missed.
    - `weather` shows current weather, the next 12 hours and 7 days for cities you type in, from Open-Meteo. It never uses your device location.
    - `gmail` signs in with Google to show new emails, notify you, and pull out sign-in codes. Read-only. Building it yourself needs your own Google OAuth client in `host/google-oauth.json`.
- Package a Mate for the Supply Closet with `node tools/pack-plugin.js <plugin-folder> --url <download-base-url>`.

## Install

Get `DeskMate-Installer.exe` (about 50 KB) from [deskmate.lapistudios.com](https://deskmate.lapistudios.com) or Releases and run it: it downloads the newest DeskMate, checks its checksum and installs it. Or download the full `DeskMate-Setup-<version>.exe` from Releases to install offline. No admin rights needed. The installer isn't code-signed yet, so Windows may show "Windows protected your PC": click **More info**, then **Run anyway**.

## Build from source

The web installer's source is `tools/web-installer/DeskMateInstaller.cs`; build it with the C# compiler that comes with Windows (command at the top of the file).


Requires Windows 10/11 and Node.js 18+.

```
npm install
npm start          # run in development
npm run dist       # build dist/DeskMate Setup <version>.exe
```

## License

Copyright © 2026 Lapis Studios.

DeskMate is free for any noncommercial use under the [PolyForm Noncommercial License 1.0.0](LICENSE): you can use it, change it and share it, but not sell it or a modified version of it. **Mates (plugins) are the exception**: you can build Mates for DeskMate and license or sell them however you like (see the plugin permission at the end of [LICENSE](LICENSE)). If you share a modified DeskMate, credit it as based on DeskMate by Lapis Studios; see [TRADEMARKS.md](TRADEMARKS.md).
