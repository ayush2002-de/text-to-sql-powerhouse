import 'dotenv/config';
import dbPool from '../config/db.js';
import { VertexAI, VertexAIEmbeddings } from '@langchain/google-vertexai';
import { Pinecone } from '@pinecone-database/pinecone';
import crypto from 'crypto';
import { createServiceLogger } from '../config/logger.js';
// import { readFile } from 'fs/promises';
// import path from 'path';
// import { fileURLToPath } from 'url';

// // Resolve current file location
// const __filename = fileURLToPath(import.meta.url);
// const __dirname = path.dirname(__filename);

// // Go up one level to the parent, then into `content/`
// const jsonPath = path.join(__dirname, '..', '..', 'content', 'sql-dump.json');

// --- CLIENT SETUPS ---
const logger = createServiceLogger('QueryLogSync');
const llm = new VertexAI({ model: 'claude-sonnet-4@20250514' });
const embeddings = new VertexAIEmbeddings({ model: 'text-embedding-004' });
const pinecone = new Pinecone();
// Connect to our NEW index for query intents
const queryIntentsIndex = pinecone.index(process.env.PINECONE_QUERY_INDEX_NAME);

// --- JOB TO SYNC QUERY LOGS ---
const fetchRecentQueries = async () => {
  logger.info('Fetching recent queries from database logs...');
  const client = await dbPool.connect();
  try {
    const res = await client.query(`
            SELECT query, SUM(calls) as total_calls
            FROM pg_stat_statements
            WHERE query LIKE 'SELECT%'
            GROUP BY queryid, query
            ORDER BY total_calls DESC
            LIMIT 100;
        `);
    return res.rows.map(row => row.query);
  } finally {
    client.release();
  }
};
const sanitizeQueries = queries => {
  logger.info('Sanitizing queries...');
  return queries.map(query =>
    query
      .replace(/WHERE\s+\S+\s*=\s*'.*?'/g, "WHERE column = 'value'")
      .replace(/AND\s+\S+\s*=\s*'.*?'/g, "AND column = 'value'")
      .replace(/WHERE\s+\S+\s*=\s*\d+/g, 'WHERE column = 123')
      .replace(/AND\s+\S+\s*=\s*\d+/g, 'AND column = 123'),
  );
};

// --- NEW: THE AUTOMATED SUMMARIZER FUNCTION ---
/**
 * Takes sanitized queries and uses an LLM to generate a natural language summary for each.
 * @param {Array<string>} sanitizedQueries - The array of sanitized query strings.
 * @returns {Promise<Array<{summary: string, sanitizedQuery: string}>>}
 */
const summarizeQueries = async sanitizedQueries => {
  logger.info(
    `Generating AI summaries for ${sanitizedQueries.length} queries...`,
  );

  const summaryPromises = sanitizedQueries.map(async query => {
    const prompt = `
            You are an expert data analyst. Analyze the following SQL query and describe its business purpose in one clear sentence. Focus on what the query achieves, not just a literal description.

            SQL Query:
            \`\`\`sql
            ${query}
            \`\`\`

            Example: For 'SELECT "product_name", SUM("amount") FROM "transactions" GROUP BY "product_name"', a good summary is "Calculates the total sales revenue for each product."

            Your Summary:
        `;
    const summary = await llm.invoke(prompt);
    return { summary: summary.trim(), sanitizedQuery: query };
  });

  // Run all summarization requests in parallel for efficiency
  return Promise.all(summaryPromises);
};

/**
 * Takes summarized query intents, creates embeddings, and upserts them to Pinecone.
 * @param {Array<{summary: string, sanitizedQuery: string}>} summarizedIntents
 */
const embedAndStoreQueries = async summarizedIntents => {
  logger.info(
    `Embedding and storing ${summarizedIntents.length} query intents...`,
  );

  for (const intent of summarizedIntents) {
    // Create a stable ID for the query by hashing it
    const id = crypto
      .createHash('md5')
      .update(intent.sanitizedQuery)
      .digest('hex');

    // Create an embedding for the natural language summary
    const vector = await embeddings.embedQuery(intent.summary);

    // Upsert the data into our query-intents index
    await queryIntentsIndex.upsert([
      {
        id,
        values: vector,
        metadata: {
          summary: intent.summary,
          query: intent.sanitizedQuery,
        },
      },
    ]);
  }
  logger.info('Pinecone upsert for query intents complete.');
};

// --- MAIN JOB ORCHESTRATOR ---
export const runQueryLogSync = async () => {
  logger.info('Starting query log sync job...');
  try {
    const rawQueries = await fetchRecentQueries();
    // const fileContent = await readFile(jsonPath, 'utf-8');
    // const rawQueries = JSON.parse(fileContent);
    const sanitizedQueries = sanitizeQueries(rawQueries);
    const summarizedIntents = await summarizeQueries(sanitizedQueries);
    await embedAndStoreQueries(summarizedIntents);
    logger.info('✅ Query log sync job completed successfully.');
  } catch (error) {
    logger.error('❌ Query log sync job failed:', {
      error: error.message,
      stack: error.stack,
    });
  }
};
