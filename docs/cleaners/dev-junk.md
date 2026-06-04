# dev-junk

Scans a project tree for build artifacts, dependency directories, and
toolchain caches that you can regenerate any time.

## What it finds

| Name | Tool | Pre-checked? |
|------|------|---|
| `node_modules` | npm/pnpm/yarn deps | ✓ |
| `.next` | Next.js build | ✓ |
| `.nuxt` | Nuxt build | ✓ |
| `.svelte-kit` | SvelteKit build | ✓ |
| `.turbo` | Turborepo cache | ✓ |
| `.parcel-cache` | Parcel cache | ✓ |
| `.cache` | generic cache | ✓ |
| `.vite` | Vite cache | ✓ |
| `coverage` | coverage reports | ✓ |
| `__pycache__` | Python bytecode | ✓ |
| `.pytest_cache` | pytest cache | ✓ |
| `.mypy_cache` | mypy cache | ✓ |
| `.ruff_cache` | ruff cache | ✓ |
| `.gradle` | Gradle cache | ✓ |
| `DerivedData` | Xcode build | ✓ |
| `dist` | build output | — |
| `build` | build output | — |
| `out` | build output | — |
| `target` | Rust/Java build | — |
| `venv` | Python venv | — |
| `.venv` | Python venv | — |

## CLI

```bash
burrow scan [path]            # interactive
burrow scan [path] -l         # list only, no prompts
burrow scan [path] --min 50   # hide items < 50 MB
burrow clean dev-junk -y .    # auto-clean cwd (safe items only)
```

## Safety

- Scope: the user-provided `[path]` (default `cwd`).
- `basename(path)` must be in the JUNK map.
- Walker doesn't follow symlinks.
- Walker doesn't descend into `node_modules`, `.git`, `.Trash`, `Library`.

## Extending

Add a new entry to the `JUNK` map in `src/cleaners/dev-junk.ts`. Mark
`safe: true` only for things that can be regenerated 100% of the time
with no loss of work (no `dist`, no `target`).
