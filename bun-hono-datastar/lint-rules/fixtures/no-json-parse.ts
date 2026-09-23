export const bad1 = JSON.parse("{}");
export const bad2 = JSON.parse("[]", (_key, value: unknown) => value);
export const bad3 = JSON.parse;
export const bad4 = ["{}"].map(JSON.parse as (text: string) => unknown);
export const bad5 = JSON["parse"]("{}");
export const ok = JSON.stringify({});
