import 'dotenv/config';
import { VertexAI, VertexAIEmbeddings } from '@langchain/google-vertexai';
import { Pinecone } from '@pinecone-database/pinecone';
import dbPool from '../config/db.js';
import logger from '../config/logger.js';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve current file location
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Go up one level to the parent, then into `content/`
const tableStandardJsonPath = path.join(
  __dirname,
  '..',
  '..',
  'content',
  'table-standard.json',
);

const tableSqlJsonPath = path.join(
  __dirname,
  '..',
  '..',
  'content',
  'table-sql.json',
);

// --- CLIENT SETUPS ---
const llm = new VertexAI({ model: 'claude-sonnet-4@20250514', temperature: 0 });
const pinecone = new Pinecone();
const pineconeIndex = pinecone.index(process.env.PINECONE_INDEX_NAME);
const embeddings = new VertexAIEmbeddings({ model: 'text-embedding-004' });

// --- PIPELINE FUNCTIONS ---

const getDatabaseSchema = async () => {
  logger.info('Inspecting database to get table schemas', {
    service: 'SCHEMA_SYNC',
  });
  const client = await dbPool.connect();
  try {
    const res = await client.query(
      "SELECT t.table_name, c.column_name, c.data_type FROM information_schema.tables t JOIN information_schema.columns c ON t.table_name = c.table_name AND t.table_schema = c.table_schema WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE' ORDER BY t.table_name, c.ordinal_position;",
    );
    const tables = res.rows.reduce(
      (acc, { table_name, column_name, data_type }) => {
        if (!acc[table_name]) {
          acc[table_name] = [];
        }
        acc[table_name].push(`${column_name} ${data_type}`);
        return acc;
      },
      {},
    );
    const tableSchemas = Object.keys(tables).map(tableName => ({
      name: tableName,
      schema: tables[tableName].join(', '),
    }));

    logger.info('Database schema inspection completed', {
      tableCount: tableSchemas.length,
      tableNames: tableSchemas.map(t => t.name),
      service: 'SCHEMA_SYNC',
    });

    return tableSchemas;
  } finally {
    client.release();
  }
};

/**
 * Finds real-world sample queries for a specific table from the database logs.
 * @param {string} tableName - The name of the table to find queries for.
 * @returns {Promise<Array<string>>} An array of sample query strings.
 */
const findSampleQueriesForTable = async tableName => {
  // This query is specific to PostgreSQL and pg_stat_statements.
  // The `~* E'\\b"tableName"\\b'` is a regular expression to match the exact table name as a whole word.
  const sql = `
        SELECT query
        FROM pg_stat_statements
        WHERE
            query ILIKE 'SELECT%' AND
            (query ~* E'\\mfrom\\s+"?${tableName}"?\\M' OR query ~* E'\\mjoin\\s+"?${tableName}"?\\M')
        ORDER BY
            calls DESC
        LIMIT 3;
    `;
  const client = await dbPool.connect();
  try {
    const res = await client.query(sql);
    // We only return the query string itself.
    return res.rows.map(row => row.query);
  } finally {
    client.release();
  }
};

/**
 * For a given table, fetches distinct values for specified columns.
 * @param {string} tableName - The name of the table.
 * @param {Array<string>} columns - The columns to sample.
 * @returns {Promise<string>} A formatted string of sample values.
 */
const getSampleDataForTable = async (tableName, columns) => {
  if (!columns || columns.length === 0) {
    return '';
  }

  let profileString = '\n\nSample column values:\n';
  const client = await dbPool.connect();

  try {
    for (const column of columns) {
      const res = await client.query(
        `SELECT DISTINCT "${column}" FROM "${tableName}" LIMIT 10`,
      );
      const values = res.rows.map(r => r[column]).join(', ');
      profileString += `- ${column}: [${values}]\n`;
    }
  } catch (error) {
    logger.error(`Failed to get sample data for ${tableName}`, {
      error: error.message,
    });
    return ''; // Return empty string on error
  } finally {
    client.release();
  }

  return profileString;
};

/**
 * Takes a single table and its sample queries and generates a summary.
 * @param {{name: string, schema: string}} table - The table object.
 * @param {Array<string>} sampleQueries - Array of sample query strings.
 * @returns {Promise<{name: string, schema: string, summary: string}>}
 */
const generateSummaryForTable = async (
  table,
  sampleQueries,
  sampleDataText,
) => {
  const prompt = `
    You are a data analyst that can help summarize SQL tables.
    Summarize the table below using all the provided context to understand its structure, common uses, and key data values.

    ===Table Schema
    ${table.schema}

    ===Sample Queries
    ${sampleQueries.join('\n\n')}

    ===Sample Categorized Column Data
    ${sampleDataText}

    ===Response Guideline
    - You shall write the summary based only on the provided information.
    - Note that the sampled queries and data are only a small sample and do not represent all possible uses or values.
    - **Use the 'Sample Categorized Column Data' to understand the specific values and categories contained within key columns.**
    - Do not use any subjective adjectives to describe the table (e.g., 'important', 'comprehensive').
    - Do not mention the sampled queries or data directly in your summary. Only talk objectively about the type of data the table contains and its potential utilities.
    - Please include potential use cases, such as the kinds of questions that can be answered or the analysis that can be done with this table.
        `;
  const summary = await llm.invoke(prompt);
  return { ...table, summary: summary.trim() };
};

const upsertToPinecone = async enrichedTables => {
  logger.info('Starting Pinecone upsert operation', {
    tableCount: enrichedTables.length,
    service: 'SCHEMA_SYNC',
  });

  for (const table of enrichedTables) {
    const vector = await embeddings.embedQuery(table.summary);
    await pineconeIndex.upsert([
      {
        id: table.name,
        values: vector,
        metadata: {
          name: table.name,
          summary: table.summary,
          schema: table.schema,
          tier: table.tier || 'IRON',
          domain: table.domain || 'IRON',
        },
      },
    ]);

    logger.debug('Upserted table to Pinecone', {
      tableName: table.name,
      tier: table.tier || 'IRON',
      domain: table.domain || 'IRON',
      service: 'SCHEMA_SYNC',
    });
  }

  logger.info('Pinecone upsert operation completed', {
    tableCount: enrichedTables.length,
    service: 'SCHEMA_SYNC',
  });
};

// --- MAIN JOB ORCHESTRATOR ---
export const runSchemaSync = async () => {
  logger.info('Starting database schema sync job', {
    service: 'SCHEMA_SYNC',
  });

  try {
    const allTables = await getDatabaseSchema();
    const enrichedTables = [];
    logger.debug('Loading table metadata from file', {
      filePath: tableSqlJsonPath,
      service: 'SCHEMA_SYNC',
    });

    // const tableSqlfileContent = await readFile(tableSqlJsonPath, 'utf-8');
    // const tableSqlData = JSON.parse(tableSqlfileContent);

    const fileContent = await readFile(tableStandardJsonPath, 'utf-8');
    const tableMetadata = JSON.parse(fileContent);
    for (const table of allTables) {
      logger.info(`Processing table: ${table.name}`, {
        service: 'SCHEMA_SYNC',
      });

      const sampleQueries = await findSampleQueriesForTable(table.name);
      const sampleDataText = await getSampleDataForTable(
        table.name,
        tableMetadata[table.name]?.categoricalColumns || [],
      );

      // const sampleQueries = tableSqlData[table.name] || [];
      if (sampleQueries.length === 0) {
        logger.warn(`No sample queries found for table: ${table.name}`, {
          service: 'SCHEMA_SYNC',
        });
      }

      const enrichedTable = await generateSummaryForTable(
        table,
        sampleQueries,
        sampleDataText,
      );
      enrichedTables.push(enrichedTable);
    }

    logger.debug('Loading table metadata from file', {
      filePath: tableStandardJsonPath,
      service: 'SCHEMA_SYNC',
    });

    const newEnrichedTables = enrichedTables.map(table => ({
      ...table,
      ...(tableMetadata[table.name] || {}),
    }));

    logger.info('Enriched schema with metadata', {
      enrichedTableCount: newEnrichedTables.length,
      metadataKeys: Object.keys(tableMetadata).length,
      service: 'SCHEMA_SYNC',
    });

    await upsertToPinecone(newEnrichedTables);

    logger.info('Sync job completed successfully', {
      totalTables: newEnrichedTables.length,
      service: 'SCHEMA_SYNC',
    });
  } catch (error) {
    logger.error('Sync job failed', {
      error: error.message,
      stack: error.stack,
      service: 'SCHEMA_SYNC',
    });
  }
};
