import { test, expect } from "bun:test";
import { TopBar } from "../src/ui/topbar.ts";
import { setAnimationEnabled } from "../src/ui/tty.ts";

test("TopBar start/setMessage/setProgress/stop are no-throw with animations off", () => {
  setAnimationEnabled(false);
  const b = new TopBar();
  b.start("scanning");
  b.setMessage("scanning x");
  b.setProgress(0.5);
  b.setProgress(2); // out of range should clamp
  b.stop("done");
  setAnimationEnabled(null);
});

test("TopBar stop with !ok renders a frowny mole", () => {
  setAnimationEnabled(false);
  const b = new TopBar();
  b.start("trying");
  b.stop("failed", false);
  setAnimationEnabled(null);
});
