/**
 * Central registry of cleaners. The CLI iterates this to render the
 * dashboard, dispatch `burrow clean <id>`, and run the doctor check.
 *
 * To add a new cleaner: create src/cleaners/<id>.ts that exports a
 * default `Cleaner`, then import + push it here.
 */
import devJunk from "./dev-junk.ts";
import trash from "./trash.ts";
import logs from "./logs.ts";
import downloads from "./downloads.ts";
import systemCaches from "./system-caches.ts";
import type { Cleaner } from "../core/types.ts";

export const cleaners: Cleaner[] = [devJunk, systemCaches, trash, logs, downloads];

export function byId(id: string): Cleaner | undefined {
  return cleaners.find((c) => c.meta.id === id);
}

export function listIds(): string[] {
  return cleaners.map((c) => c.meta.id);
}
