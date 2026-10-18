declare const page: { locator: (selector: string) => unknown };
export const bad1 = page.locator("#add-form");
export const bad2 = page.locator(".rich-text");
export const bad3 = page.locator("section[id^='section-']");
export const bad4 = page.locator(`[title="${String(1)}"]`);
export const ok1 = page.locator("body");
export const ok2 = page.locator(`ol > li`);
