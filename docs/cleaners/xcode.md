# xcode

Cleans Xcode's notorious storage hogs.

## What it touches

- `~/Library/Developer/Xcode/DerivedData/*` — pre-checked.
  Xcode rebuilds these the next time you open a project.
- `~/Library/Developer/Xcode/iOS DeviceSupport/*` — pre-checked.
  Symbols downloaded for every physical iOS device that ever plugged in.
- `~/Library/Developer/Xcode/watchOS DeviceSupport/*` — pre-checked.
- `~/Library/Developer/CoreSimulator/Caches/*` — pre-checked.
- `~/Library/Developer/Xcode/Archives/*` — **unchecked**. Archives are
  sometimes the build you uploaded to App Store Connect; people have
  regretted deleting them.

## CLI

```bash
burrowed clean xcode
```

## Safety

- Scope: each of the 5 buckets above; never reaches outside them.
- Refuses the bucket roots themselves.

## Available?

`burrowed doctor` skips xcode when neither `~/Library/Developer/Xcode`
nor `~/Library/Developer/CoreSimulator` exists.
