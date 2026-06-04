# app-leftovers

The `uninstall` flow. Dragging an app to the Trash leaves caches,
preferences, application support, containers, launch agents, and logs
behind. This cleaner hunts for them.

## CLI

```bash
burrow uninstall Slack            # by display name
burrow uninstall com.tinyspeck.slackmacgap   # by bundle id
burrow uninstall figma -l         # list only
burrow uninstall figma -y         # delete anything found without confirm
```

## Where it looks

- `~/Library/Application Support/<name>*`
- `~/Library/Preferences/<name>*.plist`
- `~/Library/Saved Application State/<name>.savedState`
- `~/Library/Caches/<name>*`
- `~/Library/Containers/<name>*`
- `~/Library/Group Containers/group.<name>.*`
- `~/Library/LaunchAgents/<name>*.plist`
- `~/Library/Logs/<name>*`

## Matching

Case-insensitive, in this order:

1. Exact: `entry === name`
2. Prefix with separator: `entry` starts with `name.` or `name ` (matches `com.foo.bar`)
3. Substring: `entry` contains `name`

## Safety

- Scope: each of the 8 search roots above.
- All findings are **unchecked by default** — you verify them.
- Substring matching can produce false positives (e.g. uninstalling
  `notes` could match anything containing `notes`). The picker lets you
  uncheck individual items before confirming.
