export function tsResetLoadedCorrectly() {
  const a = JSON.parse("{}");
  // @ts-expect-error If ts-reset is loaded, JSON.parse should return unknown
  console.log(a.value);
}

export function objectHelpersRejectCollections(
  map: Map<string, number>,
  set: Set<string>,
  record: Record<string, number>,
): void {
  // @ts-expect-error Object.entries on a Map is always empty
  // oxlint-disable-next-line typescript/no-unsafe-assignment typescript/no-deprecated
  _ = Object.entries(map).length;
  // @ts-expect-error Object.keys on a Set is always empty
  // oxlint-disable-next-line typescript/no-unsafe-assignment typescript/no-deprecated
  _ = Object.keys(set).length;
  // @ts-expect-error Object.values on a Map is always empty
  // oxlint-disable-next-line typescript/no-unsafe-assignment typescript/no-deprecated
  _ = Object.values(map).length;
  // @ts-expect-error Object.assign from a Map copies nothing
  // oxlint-disable-next-line typescript/no-unsafe-call typescript/no-deprecated
  Object.assign({}, map).get("key");

  // Plain records must still work with their normal return types.
  const entries: [string, number][] = Object.entries(record);
  void entries;
}
