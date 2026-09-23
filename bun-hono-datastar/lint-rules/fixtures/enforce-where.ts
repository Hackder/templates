declare const db: any;
declare const tx: any;
declare const table: unknown;
declare const other: any;

export const bad1 = db.delete(table);
export const bad2 = tx.update(table).set({});
export const bad3 = await db.update(table).set({}).returning();
export const ok1 = db.delete(table).where(true);
export const ok2 = tx.update(table).set({}).where(true).returning();
export const ok3 = other.delete(table);
export const ok4 = other.update(table).set({});
