import { relations, sql } from "drizzle-orm";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const collections = sqliteTable("collections", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
});

export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  collectionId: integer("collection_id")
    .notNull()
    .references(() => collections.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`),
});

export const collectionsRelations = relations(collections, ({ many }) => ({
  items: many(items),
}));

export const itemsRelations = relations(items, ({ one }) => ({
  collection: one(collections, {
    fields: [items.collectionId],
    references: [collections.id],
  }),
}));

/**
 * Signed-in browsers ("device sessions", see src/auth/devices.ts), not to be
 * confused with the per-tab view sessions in src/web/session.ts. Used only
 * when the password gate is on. The cookie holds a random token; only its
 * SHA-256 is stored, so a leaked database cannot be replayed as a login.
 * Instants are epoch milliseconds, which keeps `Date` out of the way.
 */
export const devices = sqliteTable("devices", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  createdAtMs: integer("created_at_ms").notNull(),
  lastSeenAtMs: integer("last_seen_at_ms").notNull(),
  lastIp: text("last_ip").notNull(),
  userAgent: text("user_agent").notNull(),
});
