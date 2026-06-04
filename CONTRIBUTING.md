# Contributing to burrow

Thanks for digging in. burrow is a Mac cleaning tool that has to delete
files on people's actual computers — so the bar for new code is high:
**safety first, speed second, polish third.**

## Setup

```bash
git clone https://github.com/sshivanshg/burrow
cd burrow
bun install
bun test
bun run index.ts ~/Projects -l   # sanity check
```

## Adding a new cleaner

Every cleaner lives in `src/cleaners/<name>.ts` and must export:

```ts
export const meta = {
  id: "my-cleaner",
  title: "What it cleans, in 5 words",
  description: "One-line longer description.",
};

export async function scan(opts): Promise<Finding[]>;   // read-only, never deletes
export function isSafeToDelete(path: string): boolean;  // guardrails
export async function clean(picked: Finding[], opts): Promise<CleanResult>;
```

And ship with:

- A test file at `src/cleaners/<name>.test.ts` that proves
  `isSafeToDelete` refuses:
  - `/`
  - `$HOME`
  - any path outside the cleaner's scope
  - symlinks
- An entry in `docs/cleaners/<name>.md` explaining *exactly* what gets
  touched and what doesn't.

If your cleaner shells out (`brew`, `docker`, `xcrun`), it must
**gracefully no-op** when the tool isn't installed, never error.

## Animations

Animations live in `src/ui/animations.ts`. They must:

- Detect TTY and degrade to plain output when piped.
- Respect `--no-animation` and `NO_COLOR` / `BURROW_NO_ANIMATION`.
- Never block deletion; if the animation throws, the cleaner keeps going.

## Commits

Plain, real commit messages. Short subject, optional body explaining
*why*. No co-author trailers.

## Releases

Tag `vX.Y.Z`, push the tag. CI builds binaries and attaches them to the
GitHub release.
