/**
 * TTY + animation policy. Single place that decides whether we paint
 * frames or fall back to plain output.
 *
 * Disabled when: not a TTY, NO_COLOR set, BURROW_NO_ANIMATION set,
 * CI=true, or the runtime override is off.
 */
let override: boolean | null = null;

export function setAnimationEnabled(on: boolean | null) {
  override = on;
}

export function animationsEnabled(): boolean {
  if (override !== null) return override;
  if (!process.stdout.isTTY) return false;
  if (process.env.NO_COLOR) return false;
  if (process.env.BURROW_NO_ANIMATION) return false;
  if (process.env.CI === "true") return false;
  return true;
}

export function colorEnabled(): boolean {
  if (process.env.NO_COLOR) return false;
  if (!process.stdout.isTTY && !process.env.FORCE_COLOR) return false;
  return true;
}

export function termWidth(fallback = 80): number {
  return process.stdout.columns ?? fallback;
}

/** Hide / show the cursor. Safe no-op when animations are off. */
export function hideCursor() {
  if (animationsEnabled()) process.stdout.write("\x1b[?25l");
}
export function showCursor() {
  if (animationsEnabled()) process.stdout.write("\x1b[?25h");
}

/** Clear the last N lines that we wrote (cursor must be at column 0). */
export function clearLines(n: number) {
  if (!animationsEnabled() || n <= 0) return;
  for (let i = 0; i < n; i++) {
    if (i > 0) process.stdout.write("\x1b[1A"); // up one
    process.stdout.write("\x1b[2K\r"); // clear line, return
  }
}

/** Restore cursor on exit so a Ctrl-C never leaves it hidden. */
export function installCursorGuard() {
  const restore = () => {
    process.stdout.write("\x1b[?25h");
  };
  process.on("exit", restore);
  process.on("SIGINT", () => {
    restore();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    restore();
    process.exit(143);
  });
}
