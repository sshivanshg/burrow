# 🐹 burrow

> Dig out dev junk and reclaim disk space — a tiny, [Mole](https://github.com/tw93/Mole)-inspired cleaner you built yourself.

`burrow` scans a folder for build artifacts, caches, and dependency dirs
(`node_modules`, `.next`, `dist`, `target`, `venv`, `__pycache__`, …), shows
how much space each one is eating, and lets you tick exactly what to delete.

## Why it's safe
- **Pre-checks only low-risk items** (caches/deps); ambiguous ones like `dist`,
  `build`, `target`, `venv` start *unchecked* — you opt in.
- **Always confirms** before deleting, with the total it's about to free.
- **Guardrails:** never deletes the scan root, your home dir, `/`, anything
  outside the scan root, or any folder whose name isn't a known junk type.
- **Skips** `Library`, `.git`, `.Trash` and **never follows symlinks**.
- `--dry-run` and `--list` let you look without touching anything.

## Usage
```bash
burrow                 # scan the current folder
burrow ~/Projects      # scan all your projects
burrow ~/Projects -l   # just list findings + total (no prompts)
burrow . --min 50      # only show junk ≥ 50 MB
burrow ~/Projects -n   # walk the picker but delete nothing
burrow --help
```
Inside the picker: `space` toggles, `↑/↓` move, `enter` confirms.

## Develop
```bash
cd ~/Projects/burrow
bun run index.ts ~/Projects -l    # run from source
bun test                          # run the test suite
bun run compile                   # rebuild the binary
cp burrow ~/.local/bin/burrow     # reinstall
```

## Extend it
Add or change what counts as junk in the `JUNK` map in `index.ts`
(`safe: true` = pre-checked). Ideas for v2: a live system dashboard, an app
uninstaller that hunts down leftover `Application Support`/prefs, or a
`--json` output mode.

Built with [Bun](https://bun.sh) + [@clack/prompts](https://github.com/natemoo-re/clack).
