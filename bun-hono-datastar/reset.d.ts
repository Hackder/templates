import "@total-typescript/ts-reset";

type NotAnObjectRecord =
  | ReadonlyMap<unknown, unknown>
  | ReadonlySet<unknown>
  | WeakMap<WeakKey, unknown>
  | WeakSet<WeakKey>;

declare global {
  interface ObjectConstructor {
    /** @deprecated Object.entries on a Map/Set is always empty. Use .entries() on the collection. */
    entries(o: NotAnObjectRecord): never;
    /** @deprecated Object.keys on a Map/Set is always empty. Use .keys() on the collection. */
    keys(o: NotAnObjectRecord): never;
    /** @deprecated Object.values on a Map/Set is always empty. Use .values() on the collection. */
    values(o: NotAnObjectRecord): never;
    /** @deprecated Object.assign from a Map/Set copies nothing. */
    // oxlint-disable-next-line anti-slop/no-object-parameters
    assign(target: object, source: NotAnObjectRecord): never;
  }
}
