/**
 * macOS Notification Center via osascript. Best-effort — silent on
 * platforms without `osascript` or when the user has disabled
 * terminal notifications.
 */

export function notify(title: string, body: string) {
  if (process.platform !== "darwin") return;
  const safeTitle = title.replace(/"/g, "'");
  const safeBody = body.replace(/"/g, "'");
  try {
    Bun.spawnSync(
      [
        "osascript",
        "-e",
        `display notification "${safeBody}" with title "${safeTitle}" sound name "Pop"`,
      ],
      { stderr: "ignore", stdout: "ignore" },
    );
  } catch {
    // ignore — notifications aren't critical
  }
}
