import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

// The simulated government service's own tables, kept apart from ours on
// purpose (ARCHITECTURE §6). Citizens are keyed by a hash of the NIC, so
// no NIC is stored in plain text even here (FR-PLAT-02). A null score is
// a person with no credit history.
export const mockGovCitizens = sqliteTable("mock_gov_citizens", {
  nicHash: text("nic_hash").primaryKey(),
  score: integer("score"),
});

export const mockGovIpCalls = sqliteTable(
  "mock_gov_ip_calls",
  {
    ip: text("ip").notNull(),
    day: text("day").notNull(),
    calls: integer("calls").notNull(),
  },
  (table) => [primaryKey({ columns: [table.ip, table.day] })],
);

export const mockGovSettings = sqliteTable("mock_gov_settings", {
  id: integer("id").primaryKey(),
  failureMode: text("failure_mode").notNull(),
});
