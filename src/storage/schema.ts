import * as v from "valibot";

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export const JsonSchema: v.GenericSchema<Json> = v.lazy(() =>
  v.union([v.null(), v.boolean(), v.number(), v.string(), v.array(JsonSchema), v.record(v.string(), JsonSchema)]),
);

/** Field name of the tombstone; value `true` marks the entity deleted. */
export const DELETED = "_deleted";

export const EntityKindSchema = v.picklist(["item", "category", "tab", "settings"]);

export type EntityKind = v.InferOutput<typeof EntityKindSchema>;

/** One field write. `ts` is the writing device's clock in ms at edit time. */
export const ChangeSchema = v.object({
  ts: v.pipe(v.number(), v.safeInteger()),
  device: v.pipe(v.string(), v.minLength(1)),
  entity: EntityKindSchema,
  id: v.pipe(v.string(), v.minLength(1)),
  field: v.pipe(v.string(), v.minLength(1)),
  value: JsonSchema,
});

export type Change = v.InferOutput<typeof ChangeSchema>;

export const SnapshotSchema = v.object({
  version: v.literal(1),
  compactedAt: v.number(),
  /** Per device: the highest ts folded in. Log entries at or below it are already in `entities`. */
  seen: v.record(v.string(), v.number()),
  /** The winning change per (entity, id, field), so merging after compaction keeps working. */
  entities: v.array(ChangeSchema),
});

export type Snapshot = v.InferOutput<typeof SnapshotSchema>;

export function emptySnapshot(): Snapshot {
  return { version: 1, compactedAt: 0, seen: {}, entities: [] };
}

type Decoded<T> = { ok: true; value: T } | { ok: false; error: string };

function decode<T extends v.GenericSchema>(schema: T, text: string): Decoded<v.InferOutput<T>> {
  try {
    const result = v.safeParse(schema, JSON.parse(text));

    return result.success ? { ok: true, value: result.output } : { ok: false, error: v.summarize(result.issues) };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export type ParsedLog = { changes: Change[]; errors: string[] };

/** Parses a JSON Lines log owned by `device`. Bad lines are skipped and reported, never thrown. */
export function parseLog(text: string, device: string): ParsedLog {
  const changes: Change[] = [];
  const errors: string[] = [];

  for (const [index, line] of text.split("\n").entries()) {
    if (line.trim() === "") continue;

    const decoded = decode(ChangeSchema, line);

    if (!decoded.ok) errors.push(`line ${index + 1}: ${decoded.error}`);
    else if (decoded.value.device !== device) errors.push(`line ${index + 1}: written by "${decoded.value.device}" in ${device}'s log`);
    else changes.push(decoded.value);
  }

  return { changes, errors };
}

export type ParsedSnapshot = { snapshot: Snapshot; error?: string };

export function parseSnapshot(text: string): ParsedSnapshot {
  const decoded = decode(SnapshotSchema, text);

  return decoded.ok ? { snapshot: decoded.value } : { snapshot: emptySnapshot(), error: decoded.error };
}
