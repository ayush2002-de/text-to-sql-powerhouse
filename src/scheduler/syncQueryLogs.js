import 'dotenv/config';
import dbPool from '../config/db.js';
import { VertexAI, VertexAIEmbeddings } from '@langchain/google-vertexai';
import { Pinecone } from '@pinecone-database/pinecone';
import crypto from 'crypto';
import { createServiceLogger } from '../config/logger.js';
// import { readFile } from 'fs/promises';
// import path from 'path';
// import { fileURLToPath } from 'url';
// import fs from 'fs';

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

/**
 * Runs async tasks in controlled parallel batches
 * @param {Array<Function>} tasks - Array of functions that return a Promise
 * @param {number} concurrency - Max number of concurrent tasks
 */
const runWithConcurrency = async (tasks, concurrency = 5) => {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < tasks.length) {
      const currentIndex = index++;
      try {
        const result = await tasks[currentIndex]();
        results[currentIndex] = result;
      } catch (err) {
        results[currentIndex] = { error: err.message };
      }
    }
  }

  await Promise.all(
    Array(concurrency)
      .fill(null)
      .map(() => worker()),
  );
  return results;
};

/**
 * Takes sanitized queries and uses an LLM to generate a natural language summary for each.
 * @param {Array<string>} sanitizedQueries - The array of sanitized query strings.
 * @param {number} delayMs - Optional cooldown period between each LLM call in milliseconds.
 * @returns {Promise<Array<{summary: string, sanitizedQuery: string}>>}
 */
const summarizeQueries = async (sanitizedQueries, concurrency = 10) => {
  logger.info(
    `Generating AI summaries for ${sanitizedQueries.length} queries with concurrency = ${concurrency}...`,
  );

  const tasks = sanitizedQueries.map(query => async () => {
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

  return runWithConcurrency(tasks, concurrency);
};

/**
 * Embeds query summaries and upserts them to Pinecone with concurrency and batching.
 * @param {Array<{summary: string, sanitizedQuery: string}>} summarizedIntents
 * @param {number} concurrency - Number of parallel embeddings to run
 * @param {number} batchSize - Number of vectors to send in each upsert batch
 */
const embedAndStoreQueries = async (
  summarizedIntents,
  concurrency = 10,
  batchSize = 20,
) => {
  logger.info(
    `Embedding and storing ${summarizedIntents.length} query intents...`,
  );

  // Helper to embed a single summary and return the Pinecone vector format
  const embedTask = async ({ summary, sanitizedQuery }) => {
    const id = crypto.createHash('md5').update(sanitizedQuery).digest('hex');
    const vector = await embeddings.embedQuery(summary);
    return {
      id,
      values: vector,
      metadata: {
        summary,
        query: sanitizedQuery,
      },
    };
  };

  // Run embedding in parallel with limited concurrency
  const embedWithConcurrency = async (items, concurrency) => {
    const results = [];
    let index = 0;

    async function worker() {
      while (index < items.length) {
        const i = index++;
        try {
          results[i] = await embedTask(items[i]);
        } catch (err) {
          logger.error(
            `Embedding failed for query ${items[i].sanitizedQuery}: ${err.message}`,
          );
          results[i] = null; // Optional: skip failed items
        }
      }
    }

    await Promise.all(Array(concurrency).fill(0).map(worker));
    return results.filter(Boolean); // Remove any nulls
  };

  const embeddedVectors = await embedWithConcurrency(
    summarizedIntents,
    concurrency,
  );

  // Batch upsert to Pinecone
  for (let i = 0; i < embeddedVectors.length; i += batchSize) {
    const batch = embeddedVectors.slice(i, i + batchSize);
    try {
      await queryIntentsIndex.upsert(batch);
    } catch (err) {
      logger.error(`Upsert batch failed at index ${i}: ${err.message}`);
    }
  }

  logger.info('Pinecone upsert for query intents complete.');
};

// --- MAIN JOB ORCHESTRATOR ---
export const runQueryLogSync = async () => {
  logger.info('🚀 Starting query log sync job...');

  try {
    // const fileContent = await readFile(jsonPath, 'utf-8');
    // const rawQueries = JSON.parse(fileContent);
    const rawQueries = await fetchRecentQueries();
    if (!Array.isArray(rawQueries) || rawQueries.length === 0) {
      logger.warn('⚠️ No queries found in input JSON. Skipping sync.');
      return;
    }

    const sanitizedQueries = sanitizeQueries(rawQueries);
    logger.info(`🧼 Sanitized ${sanitizedQueries.length} queries.`);

    const summarizedIntents = await summarizeQueries(sanitizedQueries, 10);
    logger.info(`🧠 Generated ${summarizedIntents.length} query summaries.`);

    await embedAndStoreQueries(summarizedIntents, 10, 50);
    logger.info('✅ Query log sync job completed successfully.');
  } catch (error) {
    logger.error('❌ Query log sync job failed:', {
      error: error.message,
      stack: error.stack,
    });
  }
};
