export const bad1 = new Date();
export const bad2 = Date.now();
export const bad3 = Date.parse("2024-01-01");
export const bad4 = Date.UTC(2024, 0);
export const ok = Temporal.Now.instant();
