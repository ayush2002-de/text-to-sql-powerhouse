import 'dotenv/config';
import { Pool } from 'pg';

// Creates a single, shared connection pool for the entire application.
const dbPool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
});

export default dbPool;
