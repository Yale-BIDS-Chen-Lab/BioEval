import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// see: https://orm.drizzle.team/docs/tutorials/drizzle-with-supabase
const client = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const db = drizzle({ client });

export { db };
