/**
 * Compact figlet-style burrowed logo with the URL + tagline rendered
 * inline to the right of the logo (Mole's actual layout).
 *
 *   _                                          _
 *  | |__  _   _ _ __ _ __ _____      _____  __| |
 *  | '_ \| | | | '__| '__/ _ \ \ /\ / / _ \/ _` |  https://github.com/sshivanshg/burrowed
 *  | |_) | |_| | |  | | | (_) \ V  V /  __/ (_| |  Dig out junk and reclaim disk space.
 *  |_.__/ \__,_|_|  |_|  \___/ \_/\_/ \___|\__,_|
 */
import { rgb, palette, dim } from "./theme.ts";
import { termWidth } from "./tty.ts";

const LOGO = [
  " _                                          _ ",
  "| |__  _   _ _ __ _ __ _____      _____  __| |",
  "| '_ \\| | | | '__| '__/ _ \\ \\ /\\ / / _ \\/ _` |",
  "| |_) | |_| | |  | | | (_) \\ V  V /  __/ (_| |",
  "|_.__/ \\__,_|_|  |_|  \\___/ \\_/\\_/ \\___|\\__,_|",
];

const URL = "https://github.com/sshivanshg/burrowed";
const TAGLINE = "Dig out junk and reclaim disk space.";

export function showBanner() {
  // For narrow terminals, fall back to a single-line title.
  if (termWidth() < 60) {
    console.log(rgb(palette.fur, "🐹 burrowed") + "  " + dim(TAGLINE));
    console.log();
    return;
  }
  const url = rgb(palette.sky, URL);
  const tag = rgb(palette.moss, TAGLINE);
  // Right-side text sits on rows 2 and 3 (0-indexed), matching Mole.
  const sideText = ["", "", `  ${url}`, `  ${tag}`, ""];
  for (let i = 0; i < LOGO.length; i++) {
    console.log(rgb(palette.fur, LOGO[i]) + sideText[i]);
  }
  console.log();
}
