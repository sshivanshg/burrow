/**
 * Big ASCII banner shown at startup. Reveals row-by-row with a gradient
 * sweep so it feels like the title is being printed by a tunnel-driller.
 */
import { multiGradient, palette, dim } from "./theme.ts";
import { animationsEnabled, termWidth } from "./tty.ts";
import { sleep } from "./animations.ts";

const LOGO = [
  " ██████╗ ██╗   ██╗██████╗ ██████╗  ██████╗ ██╗    ██╗",
  " ██╔══██╗██║   ██║██╔══██╗██╔══██╗██╔═══██╗██║    ██║",
  " ██████╔╝██║   ██║██████╔╝██████╔╝██║   ██║██║ █╗ ██║",
  " ██╔══██╗██║   ██║██╔══██╗██╔══██╗██║   ██║██║███╗██║",
  " ██████╔╝╚██████╔╝██║  ██║██║  ██║╚██████╔╝╚███╔███╔╝",
  " ╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝  ╚══╝╚══╝ ",
];

const TAGLINE = "  dig out junk · reclaim disk · stay safe underground";

export async function showBanner() {
  // Skip the banner entirely for narrow terminals — the logo is 52 cols wide.
  if (termWidth() < 56) {
    console.log(multiGradient("🐹 burrow", [palette.dirt, palette.fur, palette.spark]));
    console.log(dim(TAGLINE.trim()));
    console.log();
    return;
  }
  if (!animationsEnabled()) {
    for (const line of LOGO) console.log(multiGradient(line, [palette.dirt, palette.fur, palette.spark]));
    console.log(dim(TAGLINE));
    console.log();
    return;
  }
  // Sweep reveal: each row prints with a slight stagger, gradient applied.
  for (const line of LOGO) {
    console.log(multiGradient(line, [palette.dirt, palette.fur, palette.spark]));
    await sleep(35);
  }
  await sleep(80);
  console.log(dim(TAGLINE));
  console.log();
}
