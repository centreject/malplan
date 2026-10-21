// Undo for one action: only the records it touched go back, so later changes (a check-off, a sync reload) stay.

/**
 * `current` with the change from `before` to `after` reverted: changed records get their old version back,
 * removed ones return at their old position, added ones go away. Untouched records keep their current state.
 * "Touched" is by reference: domain updates return untouched records as the same object.
 */
export function revertChange<T extends { id: string }>(current: T[], before: T[], after: T[]): T[] {
  const old = new Map(before.map((record) => [record.id, record]));
  const changed = new Map(after.map((record) => [record.id, record]));
  const touched = new Set([...old.keys(), ...changed.keys()].filter((id) => old.get(id) !== changed.get(id)));

  const result = current.flatMap((record) => {
    const previous = old.get(record.id);

    if (!touched.has(record.id)) {
      return [record];
    }

    return previous === undefined ? [] : [previous];
  });

  const present = new Set(result.map((record) => record.id));

  before.forEach((record, index) => {
    if (touched.has(record.id) && !present.has(record.id)) {
      result.splice(Math.min(index, result.length), 0, record);
    }
  });

  return result;
}
