import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
export const records = sqliteTable("kroad_records", {
  key: text("key").primaryKey(), content: text("content").notNull(), updatedAt: integer("updated_at").notNull(),
});
export const leases = sqliteTable("kroad_leases", {
  name: text("name").primaryKey(), owner: text("owner").notNull(), expiresAt: integer("expires_at").notNull(),
});
export const limits = sqliteTable("kroad_limits", {
  key: text("key").primaryKey(), count: integer("count").notNull(), expiresAt: integer("expires_at").notNull(),
});
