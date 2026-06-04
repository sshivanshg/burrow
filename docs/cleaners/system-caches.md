# system-caches

Surfaces top-level dirs under `~/Library/Caches`. Most macOS apps treat
this as fully disposable, but a few misuse it for state, so we use an
allowlist + denylist:

- **SAFE_ALLOWLIST** — these come pre-checked. They include well-known
  cache piles: Google Chrome, Spotify, Slack, Discord, VS Code, Figma,
  Homebrew, Yarn, pip, JetBrains, Playwright, Cypress, Puppeteer, etc.
- **DENYLIST** — these are skipped entirely (`com.apple.WebKit.PluginProcess`,
  `com.apple.cloudkit`).
- Everything else shows up unchecked. You opt in.

## CLI

```bash
burrow clean system-caches        # interactive
burrow clean system-caches -l     # list only
burrow clean system-caches -n     # dry-run
burrow clean system-caches -y     # auto-clean allowlisted ones
```

## Safety

- Scope: `~/Library/Caches`.
- DENYLIST entries are refused by `isSafeToDelete` even if you ask for them.
- Refuses the root `~/Library/Caches` itself.

## Real-world expectation

On most Macs this is the biggest single win — several GB across Chrome,
Spotify, and dev tools.
