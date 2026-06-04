# 🐹 burrowed

> Dig out junk and reclaim disk space — a Mole-inspired macOS cleaner with cool terminal animations.

`burrowed` scans your Mac for the stuff that quietly eats gigabytes: dev
caches, Xcode DerivedData, browser caches, old downloads, leftover files
from uninstalled apps, duplicate files, the whole bestiary. It ranks what
it finds, lets you pick what to delete, and only ever touches things it
recognizes — never the wrong thing.

It's also fun: an animated mole digging tunnels across the top, gradient
progress bars, particle bursts when you free space. `--no-animation` if
you want it boring.

## Install

**Homebrew** (recommended)

```bash
brew tap sshivanshg/burrowed https://github.com/sshivanshg/burrowed
brew install burrowed
```

To upgrade later:
```bash
brew update && brew upgrade burrowed
```

**One-line installer** (no Homebrew)

```bash
curl -fsSL https://raw.githubusercontent.com/sshivanshg/burrowed/main/install.sh | bash
```

Detects your CPU, downloads the latest release binary, verifies the
SHA256, drops it in `~/.local/bin/burrowed`. To upgrade later: re-run
the same command.

**From source** (needs [Bun](https://bun.sh))

```bash
git clone https://github.com/sshivanshg/burrowed
cd burrowed && bun install
bun run index.ts                     # run from source
bun run build:current                # build a local single-file binary
```

### Verify install

```bash
burrowed --version
# expects: burrowed 0.3.x
```

## Use

```bash
burrowed                          # interactive dashboard — start here
burrowed scan ~/Projects          # scan dev-junk under a path
burrowed scan ~/Projects -l       # list-only, no prompts
burrowed clean system-caches      # pick + clean a specific category
burrowed clean homebrew -y        # clean without confirmations
burrowed uninstall Slack          # hunt leftover files for a removed app
burrowed score                    # 0–100 health score with trend
burrowed stats                    # lifetime reclaimed + sparkline
burrowed doctor                   # show which cleaners are available here
burrowed --help
```

## What it cleans

| Category           | What it touches                                              |
|--------------------|--------------------------------------------------------------|
| `dev-junk`         | `node_modules`, `.next`, `dist`, caches across project trees |
| `system-caches`    | `~/Library/Caches/*` — allowlisted apps pre-checked          |
| `xcode`            | DerivedData, Archives, iOS/watchOS device support, sim caches |
| `homebrew`         | `brew cleanup -s` + old downloads                            |
| `docker`           | `docker system prune --volumes` (no `-a`)                    |
| `browsers`         | Chrome / Safari / Firefox / Arc / Brave caches **only**       |
| `downloads`        | Files in `~/Downloads` older than N days                     |
| `large-files`      | Find the biggest individual files under a path                |
| `duplicates`       | Hash-based duplicate finder                                  |
| `trash`            | Items in `~/.Trash`                                          |
| `logs`             | Old files in `~/Library/Logs`                                |
| `mail-attachments` | Mail Downloads + iMessage attachment cache                   |
| `app-leftovers`    | Application Support / Preferences / Containers / etc.        |
| `dormant-apps`     | `.app` bundles you haven't opened in 90+ days                |

`burrowed doctor` shows which are available on your system right now.

## What it does that Mole doesn't

- **Quarantine** — `--quarantine` moves items to `~/.burrowed-quarantine/<timestamp>/`
  instead of `rm`. `burrowed restore <id>` brings them back. `burrowed purge-quarantine`
  permanently empties.
- **Lifetime stats** — `burrowed stats` shows total reclaimed, top categories
  with mini bars, last-30-day sparkline. Every clean is logged to
  `~/Library/Application Support/burrowed/history.jsonl`.
- **Composite 0–100 health score** — `burrowed score` rates your machine on
  disk free / reclaimable / dormant apps / clean recency, with a letter
  grade and a trend sparkline tracking your score over time.
- **Smart recommendations** — the dashboard shows "Biggest win" and
  "Easiest safe win" cards above the menu, scored by `size × habit-bias`.
- **Stale-aware dev-junk** — sorts projects by `staleness × size`, so
  untouched-90-day repos float to the top with a `Xd unused` badge.
- **Dormant app detection** — finds installed apps you haven't opened in
  90+ days via Spotlight's `kMDItemLastUsedDate`.
- **Cloud-aware picker** — detects iCloud-evicted files and items inside
  Dropbox / Drive / OneDrive mounts; badges them and refuses to pre-check.
- **TouchID-friendly Optimize menu** — purge memory, flush DNS, erase
  unified logs, thin Time Machine snapshots. One auth prompt per op,
  accepts your fingerprint when sudo-Touch-ID is configured.
- **Watch + Schedule** — `burrowed watch` polls disk and fires a macOS
  notification on threshold; `burrowed schedule daily|weekly|monthly`
  writes a `launchd` agent that runs cleanups in the background, always
  with `--quarantine` so background runs are reversible.

## Safety

`burrowed` exists to **not delete the wrong thing**. Every cleaner:

- Refuses to touch `/`, `$HOME`, `/etc`, `/System`, `/usr/bin`, etc.
- Refuses to touch anything outside its declared scope.
- Never follows symlinks.
- Has a per-category allowlist where applicable (e.g. `system-caches`
  has both an allowlist of well-known cache piles AND a denylist of
  apps that misbehave).
- Asks you to confirm before deleting (unless you pass `--yes`).
- Supports `--dry-run` everywhere.

See [SAFETY.md](./SAFETY.md) for the full guardrail spec.

## Flags

```
-h, --help           Show help
-V, --version        Print version + runtime + platform
-l, --list           Print findings and exit (no prompts)
-n, --dry-run        Walk the picker but never delete
-y, --yes            Skip confirmations (only with `clean <category>`)
    --quarantine     Move to ~/.burrowed-quarantine instead of `rm` (undoable)
    --json           Machine-readable output (disables animations)
    --no-animation   Plain output, no spinners or particles
-q, --quiet          Minimal output
    --depth <n>      Max folder depth (default 6)
    --min <MB>       Hide items smaller than this many MB
    --older-than <d> Age threshold in days (downloads/logs/purge)
    --threshold <%>  Disk-fill % at which `watch` notifies (default 85)
    --interval <s>   `watch` poll interval in seconds (default 60)
    --categories <l> Comma-separated list of categories for `schedule`
```

Environment:

- `BURROWED_NO_ANIMATION=1` — same as `--no-animation`
- `NO_COLOR=1` — disables ANSI color
- `CI=true` — disables animations automatically

## Release flow (maintainers)

One command. Everything after that is automated.

```bash
bun run release patch        # 0.3.0 → 0.3.1
bun run release minor        # 0.3.0 → 0.4.0
bun run release major        # 0.3.0 → 1.0.0
```

What it does locally: bumps `package.json` + `Formula/burrowed.rb` +
`BURROWED_VERSION` in `src/cli.ts`, commits, tags, pushes main + tag.

What GitHub Actions does on the tag push:

1. Runs the test suite.
2. Builds `burrowed-darwin-arm64` + `burrowed-darwin-x64` binaries.
3. Generates `SHA256SUMS`.
4. Publishes a GitHub release with the binaries + checksums attached.
5. Runs `scripts/update-formula.ts` to patch `Formula/burrowed.rb` with
   the real SHAs of the just-built binaries.
6. Commits + pushes the Formula update back to `main`.

End-user upgrade paths:

- `curl … install.sh` users: re-run the same one-liner.
- `brew` users: `brew update && brew upgrade burrowed`.

## Develop

```bash
bun test                      # full test suite
bun run demo                  # animation demo (visual smoke test)
bun run build:current         # ./burrowed binary for this arch
bun run build                 # darwin-arm64 + darwin-x64 binaries in dist/
```

Adding a new cleaner? See [CONTRIBUTING.md](./CONTRIBUTING.md) for the
`Cleaner` interface and what tests it has to ship with.

## A note on the name

This project was originally called `burrow`. We renamed to `burrowed`
because [Cloudflare's tunnel client](https://github.com/cloudflare/cloudflared)
already publishes a Homebrew formula under that name — keeping the
original name would have meant friends typing `brew install burrow` get
a tunnel client, not a Mac cleaner.

## License

MIT. See [LICENSE](./LICENSE).

Built with [Bun](https://bun.sh) + [@clack/prompts](https://github.com/natemoo-re/clack).
Inspired by [Mole](https://github.com/tw93/Mole).
