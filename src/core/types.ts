/**
 * Shared types every cleaner speaks. A cleaner emits `Finding`s during
 * scan; the picker/CLI turns user selections back into `Finding[]` to
 * pass to `clean`.
 */

export interface Finding {
  /** Absolute path to the thing that would be removed. */
  path: string;
  /** Bytes the path occupies on disk. */
  size: number;
  /** Cleaner that produced this finding (e.g. "dev-junk", "xcode"). */
  category: string;
  /** Short label, e.g. "node_modules", "DerivedData". */
  label: string;
  /** Human description shown next to the label. */
  description?: string;
  /** Pre-checked in the picker. Low-risk only. */
  safe?: boolean;
}

export interface CleanerMeta {
  id: string;
  title: string;
  description: string;
  /** Default --safe flag: true means the cleaner is OK without confirmations. */
  defaultSafe?: boolean;
  /** Returns false when the underlying tool/system isn't available here. */
  available?: () => boolean | Promise<boolean>;
}

export interface ScanOpts {
  /** Restrict the scan to this root (used by dev-junk + large-files). */
  root?: string;
  /** Max depth for directory walks. */
  depth?: number;
  /** Hide items smaller than this many MB. */
  minMB?: number;
  /** Age threshold in days, used by `downloads`, `logs`. */
  olderThanDays?: number;
}

export interface CleanOpts {
  dryRun: boolean;
  onProgress?: (removed: number, total: number, freed: number) => void;
}

export interface CleanResult {
  removed: number;
  failed: number;
  freed: number;
  errors: Array<{ path: string; error: string }>;
}

export interface Cleaner {
  meta: CleanerMeta;
  scan(opts: ScanOpts): Promise<Finding[]>;
  /** Per-cleaner safety check. Receives an absolute path. */
  isSafeToDelete(path: string, opts: ScanOpts): boolean;
  clean(picks: Finding[], opts: CleanOpts & ScanOpts): Promise<CleanResult>;
}
