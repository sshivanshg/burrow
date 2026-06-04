# 🐹 burrow

> Dig out junk and reclaim disk space — a Mole-inspired macOS cleaner with cool terminal animations.

`burrow` scans your Mac for the stuff that quietly eats gigabytes: dev
caches, Xcode DerivedData, browser caches, old downloads, leftover files
from uninstalled apps, duplicate files, the whole bestiary. It ranks what
it finds, lets you pick what to delete, and only ever touches things it
recognizes — never the wrong thing.

It's also fun: animated mole spinners, gradient progress bars, particle
bursts when you free space. Or `--no-animation` and it stays out of your
way.

## Install

**One-line installer** (no Homebrew needed)

```bash
curl -fsSL https://raw.githubusercontent.com/sshivanshg/burrow/main/install.sh | bash
```

Detects your CPU (arm64 / x64), downloads the right binary from the
latest release, verifies the SHA256, drops it in `~/.local/bin/burrow`.
**To update later:** re-run the same command.

**Homebrew**

> Note: there's an unrelated `burrow` in homebrew-core (Cloudflare's
> tunnel client). Install ours with the **full tap path** so brew picks
> the right one:

```bash
brew tap sshivanshg/burrow https://github.com/sshivanshg/burrow
brew install sshivanshg/burrow/burrow
```

**To update later:**

```bash
brew update && brew upgrade sshivanshg/burrow/burrow
```

**From source** (needs [Bun](https://bun.sh))

```bash
git clone https://github.com/sshivanshg/burrow
cd burrow && bun install
bun run index.ts                     # run from source
bun run build:current                # build a local single-file binary
```

### Verify install

```bash
burrow --help | head -3
# expects: 🐹 burrow — dig out junk and reclaim disk space
```

## Use

```bash
burrow                          # interactive dashboard — start here
burrow scan ~/Projects          # scan dev-junk under a path
burrow scan ~/Projects -l       # list-only, no prompts
burrow clean system-caches      # pick + clean a specific category
burrow clean homebrew -y        # clean without confirmations
burrow uninstall Slack          # hunt leftover files for a removed app
burrow doctor                   # show which cleaners are available here
burrow --help
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

`burrow doctor` shows which are available on your system right now.

## Safety

`burrow` exists to **not delete the wrong thing**. Every cleaner:

- Refuses to touch `/`, `$HOME`, `/etc`, `/System`, `/usr/bin`, etc.
- Refuses to touch anything outside its declared scope.
- Never follows symlinks.
- Has a per-category allowlist where applicable (system-caches has both
  an allowlist of well-known cache piles *and* a denylist of misbehaving apps).
- Asks you to confirm before deleting (unless you pass `--yes`).
- Supports `--dry-run` everywhere.

See [SAFETY.md](./SAFETY.md) for the full guardrail spec.

## Flags

```
-l, --list           Print findings and exit (no prompts)
-n, --dry-run        Walk the picker but never delete
-y, --yes            Skip confirmations (only with `clean <category>`)
    --json           Machine-readable output (disables animations)
    --no-animation   Plain output, no spinners or particles
-q, --quiet          Minimal output
    --depth <n>      Max folder depth (default 6)
    --min <MB>       Hide items smaller than this many MB
    --older-than <d> Age threshold in days (downloads/logs)
-h, --help           Show this help
```

Environment:

- `BURROW_NO_ANIMATION=1` — same as `--no-animation`
- `NO_COLOR=1` — disables ANSI color
- `CI=true` — disables animations automatically

## Release flow (maintainers)

One command cuts a release. Everything after that is automated.

```bash
bun run release patch        # 0.2.0 → 0.2.1
bun run release minor        # 0.2.0 → 0.3.0
bun run release major        # 0.2.0 → 1.0.0
```

What `bun run release` does locally:

1. Verifies a clean working tree on `main`, pulls --rebase.
2. Bumps `package.json` + `Formula/burrow.rb` to the next version.
3. Commits `Release vX.Y.Z`.
4. Tags `vX.Y.Z`.
5. Pushes main + tag.

What GitHub Actions does on the tag push (`.github/workflows/release.yml`):

1. Runs the test suite.
2. Builds `burrow-darwin-arm64` + `burrow-darwin-x64` binaries.
3. Generates `SHA256SUMS`.
4. Publishes a GitHub release with the binaries + checksums attached.
5. Runs `scripts/update-formula.ts` to patch `Formula/burrow.rb` with
   the real SHAs of the just-built binaries.
6. Commits + pushes the Formula update back to `main`.

End-user upgrade paths after a release lands:

- `curl … install.sh` users: re-run the same one-liner.
- `brew` users: `brew update && brew upgrade sshivanshg/burrow/burrow`.

No manual SHA-juggling, no formula-tap-repo bookkeeping.

## Develop

```bash
bun test                      # full test suite (cleaner safety + animations)
bun run demo                  # animation demo (visual smoke test)
bun run build:current         # ./burrow binary for this arch
bun run build                 # darwin-arm64 + darwin-x64 binaries in dist/
```

Adding a new cleaner? See [CONTRIBUTING.md](./CONTRIBUTING.md) for the
`Cleaner` interface and what tests it has to ship with.

## Why it exists

Mac cleaners are either too aggressive (delete the wrong thing), too
chatty (CleanMyMac level of UI), or too narrow (each one cleans one
thing). `burrow` is one tool, safe-by-default, that knows about every
common Mac junk pile and lets you decide.

The mole likes it underground.

## License

MIT. See [LICENSE](./LICENSE).

Built with [Bun](https://bun.sh) + [@clack/prompts](https://github.com/natemoo-re/clack).
Inspired by [Mole](https://github.com/tw93/Mole).
