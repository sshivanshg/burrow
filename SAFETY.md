# Safety guarantees

`burrowed` is in the business of `rm -rf`-ing parts of your computer.
The whole point is to do that **safely**, every time. This document
spells out every guardrail.

## Global guardrails — every cleaner inherits these

In `src/core/safety.ts`, `passesCommonGuards(path, scope)` enforces:

- `path` is not `/`
- `path` is not your home directory (`$HOME`)
- `path` is not `~/Library`, `~/Desktop`, `~/Documents`, `~/Downloads`,
  `~/Pictures`, `~/Movies`, `~/Music` — the user-owned top folders.
- `path` does not start with `/System`, `/Library/Apple`, `/private/var/db`,
  `/usr/bin`, `/usr/sbin`, `/bin`, `/sbin`, `/etc`.
- `path` is **under** the cleaner's declared scope (an absolute prefix check).
- `path` is **not a symlink** (`lstat` check). `burrowed` never follows symlinks.

If any of these fails, `isSafeToDelete()` returns `false` and the cleaner
silently refuses to delete that path. There is no flag that disables these.

## Per-cleaner guardrails

| Cleaner            | Scope (root)                                  | Additional checks                                  |
|--------------------|-----------------------------------------------|----------------------------------------------------|
| `dev-junk`         | the user-provided `--root` (default cwd)      | `basename(path)` must be in the JUNK map           |
| `system-caches`    | `~/Library/Caches`                            | `basename(path)` not in DENYLIST                   |
| `xcode`            | DerivedData / Archives / DeviceSupport / Caches | path must be under one of the buckets             |
| `homebrew`         | brew cache dirs OR virtual `brew:cleanup`     | virtual op shells out to real `brew cleanup -s`    |
| `docker`           | virtual `docker:prune`                        | runs `docker system prune -f --volumes` (no `-a`)  |
| `browsers`         | per-browser cache dirs                        | Firefox path must end in `cache2`                  |
| `downloads`        | `~/Downloads`                                 | top-level only, never recurses into subfolders     |
| `large-files`      | the user-provided `--root` (default `$HOME`)  | scope guard only — user explicitly picks each file |
| `duplicates`       | the user-provided `--root` (default `$HOME`)  | scope guard only; canonical copy never surfaced    |
| `trash`            | `~/.Trash`                                    | refuses the Trash root itself                      |
| `logs`             | `~/Library/Logs`                              | refuses the Logs root itself                       |
| `mail-attachments` | Mail Downloads + iMessage Attachments         | refuses the root dir itself                        |
| `app-leftovers`    | each of 8 `~/Library` roots                   | name match (exact / prefix / substring)            |

## Default-checked vs default-unchecked

In the picker, low-risk findings come **pre-checked** so you can hit
enter; ambiguous ones come **unchecked** so you have to opt in.

Unchecked by default:

- `dev-junk`: `dist`, `build`, `out`, `target`, `venv`, `.venv`
  (these can hold ship-ready artifacts).
- `xcode`: `Archives` (sometimes shipped to App Store Connect).
- `downloads`, `large-files`, `duplicates`, `mail-attachments`,
  `app-leftovers`: ALL unchecked (user files — verify before deleting).

## What we never touch

- Browser **history**, **cookies**, **saved passwords**, **bookmarks**,
  **profile state**, **extensions**. Only cache directories.
- iMessage / Mail **databases** — only the `Attachments` cache dirs.
- Anything that requires **full-disk access** unless macOS has already
  granted it.
- Anything **outside** the declared cleaner scope.

## Testing

`tests/cleaners.safety.test.ts` runs a contract test against every
registered cleaner — they all have to refuse `/`, `$HOME`, `/etc`,
`/System`, `/usr/bin/env`, `/etc/passwd`. New cleaners must pass this
test or CI fails.

`burrowed.test.ts` covers the size + walk + safety primitives end-to-end.

## Reporting a safety bug

If you find a path `burrowed` deletes that it shouldn't, open an issue
with the exact command, your macOS version, and the path — that's a
priority-zero bug.
