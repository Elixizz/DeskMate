# Making DeskMate Plugins

## What a plugin is

A DeskMate plugin is a small web page (HTML, CSS and JavaScript) that DeskMate shows as its own tab, an always-visible bar at the bottom of the window, or both. If you can build a web page, you can build a plugin. There is no build step and no Node.js inside a plugin.

Only the password vault and Music come built into DeskMate. Everything else, including Claude Code tracking, is a plugin you add from the store. Music is a plugin too and uses exactly the same system described here.

Every plugin runs boxed in:

- **Its own storage.** `localStorage` and cookies are private to the plugin. No other plugin, and not the vault, can read them.
- **No files, no Node.** A plugin can't open files on the PC, run programs or reach DeskMate's internals.
- **Only the websites it declared.** Network requests to any host not listed in its permissions are blocked.
- **Special abilities only with permission.** Things like controlling other apps' music or reading Claude conversations go through the `deskmate` API. Each call is checked against the permissions the user approved at install.
- **Never the vault.** No permission exists that gives a plugin access to passwords or 2FA codes.

```
 Your plugin            DeskMate host                    Reachable, if the user approved it
 tab.html / bar.html ──► checks the approved         ──►  websites you listed
 own storage, no Node    permissions on every call   ──►  music, media, Claude
                                │                    ──►  dots, hotkeys, alerts
                                │ refused
                                ▼
 Never reachable: the vault, your files, other plugins, sites not listed
```

A plugin only talks to the host. The host lets through what the user approved and refuses everything else.

A plugin can have:

| Part | Where it shows | Size | Typical use |
| --- | --- | --- | --- |
| `tab` | Its own tab, in the main area | About 378 × 420 px | The plugin's main screen |
| `bar` | A strip at the bottom of the window, under every tab | Full width × 24–90 px (you choose) | Controls or info that should always be visible, like a music player |

Both pages stay loaded while DeskMate runs, even when hidden. That's how music keeps playing when the panel is closed.

## Quick start: your first plugin in 5 minutes

This builds **Quick Notes**: a tab with a text box that remembers what you type.

1. Make a folder anywhere, for example `Documents\deskmate-plugins\quick-notes`.
2. Create `manifest.json` in it:

```json
{
  "id": "quick-notes",
  "name": "Notes",
  "version": "1.0.0",
  "author": "Your name",
  "description": "A scratchpad that remembers what you type.",
  "tab": "tab.html",
  "permissions": []
}
```

3. Create `tab.html` next to it:

```html
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="/__deskmate/ui.css">
</head>
<body class="page">
  <textarea id="notes" class="grow" placeholder="Type anything..."></textarea>
  <div class="row">
    <span id="saved" class="muted small grow"></span>
    <button id="clear" class="ghost">Clear</button>
  </div>
  <script src="tab.js"></script>
</body>
</html>
```

4. Create `tab.js`:

```js
const box = document.querySelector('#notes');
box.value = localStorage.getItem('notes') || '';
box.oninput = () => {
  localStorage.setItem('notes', box.value);
  document.querySelector('#saved').textContent = 'Saved';
};
document.querySelector('#clear').onclick = () => {
  box.value = '';
  localStorage.removeItem('notes');
  deskmate.toast('Notes cleared');
};
```

5. In DeskMate, open the **Plugins** tab and click **From folder**. Pick your `quick-notes` folder.
6. DeskMate shows what the plugin is asking for. Here it's nothing special, so click **Allow and install**. A **Notes** tab appears.

While you work on it:

- Edit your files, then click **Reload** on the plugin's card in the Plugins tab. If you added new permissions, DeskMate asks you to approve them again.
- Click **DevTools** on the card to open Chrome DevTools for your plugin (console, elements, network). This only appears for plugins installed from a folder.
- DeskMate keeps its own copy of the plugin, so edits to your folder only show up after **Reload**.

## manifest.json reference

Every plugin folder needs a `manifest.json` at its top level. DeskMate refuses to install a plugin whose manifest breaks any of these rules, and says which one.

| Field | Required | Rules | Example |
| --- | --- | --- | --- |
| `id` | Yes | Lowercase letters, numbers and dashes, 2–41 characters. Must be unique; can't be `music` | `"quick-notes"` |
| `name` | Yes | Shown on the tab. 40 characters max; keep it short so tabs fit | `"Notes"` |
| `version` | Yes | Three numbers: `major.minor.patch`. Raise it for every store release | `"1.2.0"` |
| `author` | No | Shown on the install screen | `"Ryland"` |
| `description` | No | One sentence, shown in the Plugins tab and the store | `"A scratchpad..."` |
| `tab` | One of `tab` / `bar` | Path to the tab's page, inside the plugin folder | `"tab.html"` |
| `bar` | One of `tab` / `bar` | `{ "file": page, "height": 24–90 }` | `{ "file": "bar.html", "height": 64 }` |
| `permissions` | No | List of permission names (next section). Unknown names are refused | `["status", "net:api.github.com"]` |
| `hotkeys` | No | Up to 8 global shortcuts. Needs the `hotkeys` permission | `["Control+Alt+N"]` |

The Music plugin's manifest, as a full example:

```json
{
  "id": "music",
  "name": "Music",
  "version": "1.0.0",
  "author": "DeskMate",
  "description": "Play your music files and free internet radio, and control YouTube Music or Spotify.",
  "tab": "tab.html",
  "bar": { "file": "bar.html", "height": 84 },
  "permissions": ["music-files", "media-control", "net:*", "hotkeys"],
  "hotkeys": ["Control+Alt+P", "Control+Alt+Right", "Control+Alt+Left"]
}
```

**Hotkey rules.** Each one is one or more modifiers plus one key, joined with `+`. Modifiers are `Control`, `Alt`, `Shift`, `Super`, and you need at least two of them, one being Ctrl or Alt. Keys are `A`–`Z`, `0`–`9`, `F1`–`F12`, `Left`, `Right`, `Up`, `Down`, `Space`, `Home`, `End`, `PageUp`, `PageDown`. Single-modifier shortcuts like Ctrl+V are refused, so a plugin can't take over everyday shortcuts in other apps. DeskMate's own `Control+Alt+D` and its backups are reserved. If another program already owns a shortcut, it just won't fire.

## Permissions

Ask only for what your plugin needs. The install screen lists every permission in plain words and colors the risky ones, and people are less likely to install a plugin that asks for a lot. A plugin with no permissions still gets its tab, its own storage and toasts.

| Permission | What it unlocks | Risk shown to users |
| --- | --- | --- |
| *(none)* | A tab and/or bar, `localStorage`, `deskmate.toast`, `setBadge`, messages between your own tab and bar, panel shown/hidden events | — |
| `net:<host>` | `fetch`, images, audio and WebSockets to that host. `net:api.github.com` = exactly that host; `net:*.github.com` = github.com and every subdomain | Low |
| `net:*` | Any website. Needed for things like radio streams from random servers | High |
| `notifications` | `deskmate.notify(title, body)`: Windows notifications | Low |
| `status` | `deskmate.status.set(...)`: your dots in the header and the corner pill | Low |
| `clipboard-write` | `navigator.clipboard.writeText(...)` | Low |
| `open-links` | `deskmate.openUrl(url)` and `target="_blank"` links open in the user's browser (https only) | Low |
| `hotkeys` | The global shortcuts listed in the manifest's `hotkeys` | Medium |
| `music-files` | `deskmate.music.*`: pick a music folder and play files from it. Only that folder, only audio | Medium |
| `media-control` | `deskmate.media.*`: see and control what other apps are playing, and their volume | High |
| `claude` | `deskmate.claude.*`: read Claude Code conversations and send replies as the user | High |

When an update adds a permission, DeskMate asks again before installing and marks the new ones with **NEW**. A plugin never gets a permission it didn't list, even if it was approved for an earlier version.

## The deskmate API

Every plugin page gets a global `deskmate` object. Calls that do something return a Promise. If the plugin lacks the permission a call needs, the Promise rejects with a message like `This plugin doesn't have the "status" permission`.

**Basics (no permission needed)**

| Call | What it does |
| --- | --- |
| `deskmate.info()` | Resolves to `{ id, version, permissions }`, where `permissions` is what the user approved |
| `deskmate.toast(text)` | Shows a short message at the bottom of the window (140 characters max) |
| `deskmate.setBadge(n)` | Shows a number on your tab, like unread items. `0` hides it |
| `deskmate.hide()` | Hides the DeskMate panel |
| `deskmate.send(message)` | Sends any JSON-able value to your plugin's own pages (tab and bar). Your own page receives it too, so tag messages with who sent them |
| `deskmate.onMessage(fn)` | `fn(message)` runs for every message from `send` |
| `deskmate.onShown(fn)` | `fn()` runs when the user opens the panel |
| `deskmate.onHidden(fn)` | `fn()` runs when the panel hides |
| `deskmate.mediaUrl(url)` | Returns a URL an `<audio>` tag can play. Needed for plain `http://` streams, which a secure page can't load directly. Still needs a `net:` permission for that host, and the stream can't redirect elsewhere |

**With permissions**

| Call | Permission | What it does |
| --- | --- | --- |
| `deskmate.status.set({ dots, tooltip })` | `status` | Publishes up to 6 dots, each `{ color: '#rrggbb' or null, pulse: true/false }`. `null` = gray. `tooltip` shows on hover (120 characters) |
| `deskmate.notify(title, body)` | `notifications` | Windows notification, titled with your plugin's name |
| `deskmate.openUrl(url)` | `open-links` | Opens an `https://` link in the user's browser |
| `deskmate.onHotkey(fn)` | `hotkeys` | `fn(accelerator)` runs when one of your manifest hotkeys is pressed, even with DeskMate hidden |
| `deskmate.music.pickFolder()` | `music-files` | Asks the user to choose a music folder. Resolves to its path, or `null` if they cancel |
| `deskmate.music.folder()` | `music-files` | The current music folder, or `null` |
| `deskmate.music.tracks()` | `music-files` | `[{ name, url }]` for every audio file in the folder. `url` plays directly in `<audio>` |
| `deskmate.media.sessions()` | `media-control` | What other apps are playing: `[{ app, title, artist, album, status, pos, end, updated, vol, canNext, canPrev }]` |
| `deskmate.media.art(app)` | `media-control` | Cover art for that app's current track as an image data URL, or `null` |
| `deskmate.media.command(app, action)` | `media-control` | `action` is `toggle`, `play`, `pause`, `next`, `prev`, `seek:<seconds>` or `vol:<0–1>` |
| `deskmate.claude.activity(since)` | `claude` | Claude Code sessions active since a timestamp (ms), with prompts, files changed, commands and the last reply |
| `deskmate.claude.state(sessionId)` | `claude` | `{ state, title, id }`, where `state` is `working`, `done`, `input` or `none` |
| `deskmate.claude.reply(sessionId, text)` | `claude` | Sends a reply in the background. Resolves to `{ result }` or `{ error }` |
| `deskmate.claude.revealFile(path)` | `claude` | Shows a file in Explorer |

Everything a normal web page can do also works: `fetch` (to your `net:` hosts), `localStorage`, `IndexedDB`, `<audio>`, `<canvas>`, timers and so on. Pages stay loaded in the background, so timers keep running when the panel is hidden.

## Styling: look like DeskMate

Link the shared stylesheet and your plugin matches DeskMate's dark theme with no extra work:

```html
<link rel="stylesheet" href="/__deskmate/ui.css">
```

Put `class="page"` on `<body>` for DeskMate's padding and a full-height column. Then use these classes:

| Class | Use it on | Looks like |
| --- | --- | --- |
| *(plain)* `button` | Main actions | Orange button |
| `button.ghost` | Secondary actions | Dark gray button |
| `button.icon` | Small symbol buttons (⏯ ⏭) | No background until hover |
| `.row` | A horizontal group | Items side by side, 6 px apart |
| `.grow` | The item in a row that should take the leftover space | Stretches |
| `.list` | A scrolling list that fills the remaining height | Thin scrollbar |
| `.card` | A box for one item | Rounded, slightly lighter |
| `.chips` + `.chip` | Small tags; `button.chip` for clickable ones | Tiny rounded labels |
| `.seg` + `.segbtn` (+ `.active`) | A two- or three-way switch | Segmented control |
| `.track` (+ `.playing`) | A clickable list row | Highlights on hover |
| `.muted`, `.small`, `.ellipsis`, `.err`, `.hidden`, `.empty` | Text helpers | Gray text, smaller text, cut off with …, red text, hidden, centered empty-state message |

Colors are CSS variables, so use them instead of hard-coding: `--bg`, `--panel`, `--card`, `--line`, `--text`, `--muted`, `--accent` (orange), `--accent-2`, `--ok` (green), `--bad` (red).

You can add your own `.css` files too. Plugin pages have a solid background, so you don't need to worry about the window's rounded corners.

## Recipes

**Save settings.** Use `localStorage`. It's private to your plugin and survives restarts and updates. It's deleted when the plugin is removed.

```js
const prefs = JSON.parse(localStorage.getItem('prefs') || '{}');
prefs.city = 'Littleton';
localStorage.setItem('prefs', JSON.stringify(prefs));
```

**Call a web API.** List the host in `permissions`, then use `fetch`. The API must allow cross-origin requests (most public JSON APIs do). Here, `"net:api.open-meteo.com"`:

```js
const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=39.6&longitude=-105&current=temperature_2m');
const data = await r.json();
document.querySelector('#temp').textContent = data.current.temperature_2m + '°C';
```

**Tab and bar working together.** Keep the real work (state, audio, timers) in one page, usually the tab, and let the other one only display and send commands. Tag messages so a page ignores its own:

```js
// bar.js
document.querySelector('#play').onclick = () => deskmate.send({ from: 'bar', cmd: 'toggle' });
deskmate.onMessage((m) => { if (m.from === 'tab') document.querySelector('#title').textContent = m.title; });

// tab.js
deskmate.onMessage((m) => { if (m.from === 'bar' && m.cmd === 'toggle') togglePlay(); });
setInterval(() => deskmate.send({ from: 'tab', title: currentTitle }), 500);
```

**Status dots.** With the `status` permission, show up to 6 dots in the header and the corner pill. Only call it when something changes:

```js
const up = await checkMySite();
deskmate.status.set({
  dots: [{ color: up ? '#3ccf6e' : '#ff5d6c', pulse: !up }],
  tooltip: up ? 'Site is up' : 'Site is DOWN',
});
```

**A hotkey.** Add `"hotkeys"` to `permissions` and `"hotkeys": ["Control+Alt+N"]` to the manifest, then:

```js
deskmate.onHotkey((key) => { if (key === 'Control+Alt+N') newNote(); });
```

**Play audio.** Files from the user's folder (`music-files`) play directly. For internet streams, add a `net:` permission and wrap the URL:

```js
audio.src = deskmate.mediaUrl('http://stream.example.com/live.mp3');
audio.play();
```

**Work in the background.** Your pages keep running when the panel is closed, so a `setInterval` that checks something every minute keeps working. Use `onShown` to refresh right when the user opens the panel, and `onHidden` to pause expensive work.

## Publishing to the store

The store is one `index.json` file plus a zip per plugin, hosted at any `https://` address. Each DeskMate user pastes that address once under **Plugins → Store**. Whoever runs the store decides what goes in it.

**As a plugin author:**

1. Raise `version` in your `manifest.json`.
2. From the DeskMate folder, pack your plugin:

```
node tools/pack-plugin.js path\to\quick-notes --url https://YOUR-STORE-HOST/deskmate/plugins/
```

3. It writes `dist/quick-notes-1.0.0.zip` and prints the entry for `index.json`, including the zip's sha256 checksum.
4. Send the zip and the printed entry to whoever runs the store.

**As the store owner:** upload the zip to the address in its `download` field, and add or replace the entry in `index.json`:

```json
{
  "name": "DeskMate plugins",
  "plugins": [
    {
      "id": "quick-notes",
      "name": "Notes",
      "version": "1.0.0",
      "author": "Your name",
      "description": "A scratchpad that remembers what you type.",
      "permissions": [],
      "download": "https://YOUR-STORE-HOST/deskmate/plugins/quick-notes-1.0.0.zip",
      "sha256": "<printed by pack-plugin>"
    }
  ]
}
```

**What DeskMate checks when someone installs:**

- The downloaded zip's sha256 must match `index.json` exactly. Any change in transit or on the server means it refuses to install.
- The zip's `manifest.json` must have the same `id` and `version` as the listing, and must pass every manifest rule.
- The user sees the permissions from the zip's manifest, not from the listing, and approves them before anything is installed.
- Zips over 20 MB are refused, as are zips with paths that try to escape the plugin folder.

**Updates.** When the store lists a newer `version` than the one installed, the Plugins store shows **Update**. Updating keeps the plugin's saved data. If the new version asks for new permissions, the user approves those first.

## Rules, limits and troubleshooting

**Limits to design around**

- The window is 380 × 560 px and doesn't resize. Your tab gets roughly 378 × 420 px, less if other plugins have bars.
- Keep bars short (most look right at 40–80 px). Every enabled plugin's bar stacks at the bottom and takes space from all tabs.
- Pages can't navigate away from your plugin. Links to websites need `open-links` and open in the user's browser.
- No downloads, no file pickers (except `music.pickFolder`), no camera, microphone or location.
- Pressing Esc in your page hides the DeskMate panel.

**Troubleshooting**

| Problem | Likely cause | Fix |
| --- | --- | --- |
| `Bad plugin manifest: ...` when installing | A manifest rule is broken; the message names it | Fix that field, then install or Reload again |
| `fetch` fails with no clear error | The host isn't in your `net:` permissions, or the API doesn't allow cross-origin requests | Add `net:<host>`. Open DevTools → Console for the exact reason |
| A `deskmate.*` call rejects with a permission message | The permission isn't in your manifest, or the user hasn't approved it | Add it to `permissions`, then Reload and approve |
| Radio or stream won't play | Plain `http://` URL used directly | Wrap it: `deskmate.mediaUrl(url)` |
| Hotkey does nothing | Another program owns that shortcut, or the hotkey isn't in the manifest | Pick a different combination |
| Edits don't show up | DeskMate runs its own copy of your plugin | Click **Reload** on its card |
| Tab is blank | An error in your script, or a wrong file path in `tab` | Open **DevTools** and check the Console |

**Be a good plugin**

- Ask for the narrowest permission that works: `net:api.example.com` rather than `net:*`.
- Don't publish status dots or badges on every tick. Update them only when the value changes.
- Never ask users to type passwords into a plugin. That's what the vault is for, and plugins can't reach it on purpose.

## License for plugins

Plugins that use DeskMate only through the plugin API are your own work. You can license and sell them however you like; see the plugin permission at the end of [LICENSE](../LICENSE).
