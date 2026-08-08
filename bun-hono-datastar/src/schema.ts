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
