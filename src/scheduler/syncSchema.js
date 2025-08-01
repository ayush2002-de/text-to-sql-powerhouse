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
const jsonPath = path.join(
  __dirname,
  '..',
  '..',
  'content',
  'table-standard.json',
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

const generateSummaries = async tables => {
  logger.info('Generating AI summaries for tables', {
    tableCount: tables.length,
    service: 'SCHEMA_SYNC',
  });
  const summaryPromises = tables.map(async table => {
    const prompt = `Based on the table name "${table.name}" and columns "${table.schema}", generate a concise, one-sentence summary of its business purpose for a semantic search system.`;
    const summary = await llm.invoke(prompt);
    return { ...table, summary: summary.trim() };
  });
  const results = await Promise.all(summaryPromises);

  logger.info('AI summary generation completed', {
    tableCount: results.length,
    service: 'SCHEMA_SYNC',
  });

  return results;
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
    const rawSchema = await getDatabaseSchema();
    const summarizedSchema = await generateSummaries(rawSchema);

    logger.debug('Loading table metadata from file', {
      filePath: jsonPath,
      service: 'SCHEMA_SYNC',
    });

    const fileContent = await readFile(jsonPath, 'utf-8');
    const tableMetadata = JSON.parse(fileContent);

    const enrichedSchema = summarizedSchema.map(table => ({
      ...table,
      ...(tableMetadata[table.name] || {}),
    }));

    logger.info('Enriched schema with metadata', {
      enrichedTableCount: enrichedSchema.length,
      metadataKeys: Object.keys(tableMetadata).length,
      service: 'SCHEMA_SYNC',
    });

    await upsertToPinecone(enrichedSchema);

    logger.info('Sync job completed successfully', {
      totalTables: enrichedSchema.length,
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
