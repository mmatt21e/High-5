# Install Five-O on a phone

The **Install Five-O** button appears on `/games/five-o`, in the lobby header,
and on player sign-in and registration screens. The Edge Games collection has
no game-install button of its own.

- When the browser provides an installation prompt, the button opens it after
  the player's tap. Dismissing it does not reopen it automatically.
- On iPhone/iPad, the button explains Safari's **Share → Add to Home Screen**
  flow, including the **Open as Web App** option when available.
- Android browsers without an available prompt get browser-menu instructions.
- The button is hidden in standalone app windows and after installation is
  accepted or reported by the browser during the current visit.

The installed app opens `/lobby`. Signed-out players go to sign-in with a lobby
callback. An internet connection is required for gameplay.

## Maintenance

`InstallGameProvider` retains the browser's one-use install event across client
navigation from the collection. Manual instructions use a native modal dialog
with keyboard dismissal and focus restoration.

The manifest keeps `id: "/"`, matching the old implicit identity, while changing
`start_url` to `/lobby`. This avoids treating the launch-route change as a new app.
Its root scope includes the existing authentication and play routes.

PNG icons at 192, 512, and Apple 180 pixels, plus a padded maskable icon, are
derived from the existing `public/icon.svg`. Regenerate them with
`node scripts/generate-install-icons.mjs`.

The service worker caches public static assets only. The manifest is fetched
from the network so later launch settings can update. Cache cleanup removes
only old `fiveo-static-*` caches.

## Verification — September 12, 2026

- Node 22.23.2: 37 test files / 305 tests passed, including nine install tests.
  Run with `vitest run --exclude '**/.Codex/**'` to exclude local QA snapshots.
- Lint, TypeScript, and an isolated Next.js production build passed.
- Nine browser checks passed using a disposable local database and browser
  profiles. Chromium reported zero installability errors. Checks covered
  320/360/390-pixel phone layouts, desktop, authentication on launch, native
  prompt-event handling, platform instructions, dialog focus/dismissal,
  standalone visibility, icons, and cache contents.
- Phone checks used Chromium viewport/user-agent emulation. A physical iPhone
  or Android installation was not performed. No public deployment was made.

Browser behavior references: [MDN install prompts](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/How_to/Trigger_install_prompt),
[Apple home-screen installation](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios),
and [manifest identity](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/id).
