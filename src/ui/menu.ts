/**
 * Custom raw-stdin menu. Renders Mole-style:
 *
 *   ▸ 1. Clean       Free up disk space
 *     2. Uninstall   Remove apps completely
 *     3. Analyze     Explore disk usage
 *     4. Status      Monitor system health
 *
 *   ↑↓ | Enter | Q Quit
 *
 * Returns the selected item's `value`, or null if the user quits.
 *
 * Keys handled:
 *   ↑/↓      move selection
 *   1..9     jump to item N
 *   Enter    confirm
 *   q / Esc  quit (returns null)
 *   Ctrl-C   exit process
 *
 * Re-render strategy: save cursor on entry; on every redraw, restore
 * cursor and clear-to-end-of-screen, then paint. This avoids the
 * ghost-frame stacking that comes from cursor-up + clear-line when
 * the terminal scrolls between renders.
 */
import { rgb, palette, dim } from "./theme.ts";
import { hideCursor, showCursor, animationsEnabled } from "./tty.ts";

const SAVE_CURSOR = "\x1b[s";
const RESTORE_CURSOR = "\x1b[u";
const CLEAR_TO_END = "\x1b[J";

export interface MenuItem {
  value: string;
  label: string;
  description?: string;
  /** Override the default 1-based number key. Use 'q', 't' etc for footer items. */
  key?: string;
}

export interface MenuOpts {
  items: MenuItem[];
  /** Extra footer keybinding hints, e.g. ["M More", "T TouchID"]. */
  footerExtras?: string[];
  /** Active item index on first paint. */
  initial?: number;
}

export async function showMenu(opts: MenuOpts): Promise<string | null> {
  const items = opts.items;
  let active = Math.min(Math.max(opts.initial ?? 0, 0), items.length - 1);

  // Non-TTY fallback: print the menu and read a number from stdin.
  if (!process.stdin.isTTY || !animationsEnabled()) {
    return await fallbackMenu(items);
  }

  // Measure column widths for clean alignment.
  const numWidth = String(items.length).length + 2; // "1." width
  const labelWidth = Math.max(...items.map((i) => i.label.length)) + 2;

  let firstPaint = true;

  function render() {
    // First paint: save the current cursor position so subsequent
    // renders can return to it. Later paints: restore + wipe everything
    // below before re-drawing.
    if (firstPaint) {
      process.stdout.write(SAVE_CURSOR);
      firstPaint = false;
    } else {
      process.stdout.write(RESTORE_CURSOR + CLEAR_TO_END);
    }

    const lines: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const isActive = i === active;
      const arrow = isActive ? rgb(palette.spark, "▸") : " ";
      const num = `${i + 1}.`.padEnd(numWidth);
      const label = item.label.padEnd(labelWidth);
      const desc = item.description ?? "";
      const row = isActive
        ? `${arrow} ${rgb(palette.sky, num)}${rgb(palette.sky, label)}${dim(desc)}`
        : `${arrow} ${dim(num)}${dim(label)}${dim(desc)}`;
      lines.push(row);
    }
    lines.push("");
    const footer = [
      rgb(palette.shadow, "↑↓"),
      rgb(palette.shadow, "Enter"),
      ...(opts.footerExtras ?? []).map((s) => rgb(palette.shadow, s)),
      rgb(palette.shadow, "Q Quit"),
    ].join(rgb(palette.shadow, "  │  "));
    lines.push(footer);

    // One big write keeps the redraw atomic — terminals don't get a
    // chance to repaint a partially-cleared frame.
    process.stdout.write(lines.join("\n") + "\n");
  }

  hideCursor();
  render();

  return new Promise<string | null>((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    function cleanup() {
      stdin.removeListener("data", onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      showCursor();
    }

    function onData(key: string) {
      if (key === "\x1b[A" || key === "k") {
        active = (active - 1 + items.length) % items.length;
        render();
        return;
      }
      if (key === "\x1b[B" || key === "j") {
        active = (active + 1) % items.length;
        render();
        return;
      }
      if (key === "\r" || key === "\n") {
        cleanup();
        resolve(items[active].value);
        return;
      }
      if (key === "q" || key === "Q" || key === "\x1b") {
        cleanup();
        resolve(null);
        return;
      }
      if (key === "\x03") {
        // Ctrl-C
        cleanup();
        process.exit(130);
      }
      // Number key shortcut. Single-digit (1-9) auto-confirms; multi-digit
      // (10+) would need a different mechanism, so just no-op for now.
      if (/^[1-9]$/.test(key)) {
        const n = parseInt(key, 10) - 1;
        if (n < items.length) {
          active = n;
          cleanup();
          resolve(items[active].value);
          return;
        }
      }
    }

    stdin.on("data", onData);
  });
}

async function fallbackMenu(items: MenuItem[]): Promise<string | null> {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    console.log(
      `  ${i + 1}. ${item.label.padEnd(14)} ${dim(item.description ?? "")}`,
    );
  }
  console.log();
  return null;
}
