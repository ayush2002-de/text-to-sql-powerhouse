import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';
import { VertexAI, VertexAIEmbeddings } from '@langchain/google-vertexai';
import dbPool from '../config/db.js';
import logger from '../config/logger.js';

// --- INITIALIZE CLIENTS ---
// We initialize these once when the server starts, not on every request.
const pinecone = new Pinecone();
const pineconeIndex = pinecone.index(process.env.PINECONE_INDEX_NAME);

const embeddings = new VertexAIEmbeddings({
  model: 'text-embedding-004',
});

const llm = new VertexAI({
  model: 'claude-sonnet-4@20250514', // A powerful and fast model for generation
  temperature: 0, // We want deterministic, factual SQL, so we set temperature to 0
});

const validateSqlSyntax = async sqlQuery => {
  const normalizedSql = sqlQuery.toLowerCase();
  const forbiddenKeywords = [
    'insert',
    'update',
    'delete',
    'drop',
    'create',
    'alter',
    'truncate',
    'grant',
    'revoke',
  ];
  if (
    forbiddenKeywords.some(keyword => normalizedSql.includes(` ${keyword} `))
  ) {
    return {
      isValid: false,
      error: 'Query contains a forbidden write-operation keyword.',
    };
  }

  const client = await dbPool.connect();
  try {
    await client.query(`EXPLAIN ${sqlQuery}`);
    return { isValid: true };
  } catch (error) {
    logger.error('SQL validation failed', {
      error: error.message,
      sqlQuery: `${sqlQuery.substring(0, 100)  }...`,
      service: 'SQL_GENERATOR',
    });
    return { isValid: false, error: error.message };
  } finally {
    client.release();
  }
};

// --- THE MAIN FUNCTION ---
export const generateSqlFromQuestion = async question => {
  logger.info('Starting SQL generation process', {
    questionLength: question.length,
    service: 'SQL_GENERATOR',
  });

  // STEP A (Embed): Turn the user's question into a vector
  logger.debug('Creating embedding for question', { service: 'SQL_GENERATOR' });
  const questionEmbedding = await embeddings.embedQuery(question);

  // STEP B (Retrieve): Query Pinecone to get the Top-N relevant tables
  logger.debug('Retrieving relevant tables from Pinecone', { service: 'SQL_GENERATOR' });
  const queryResults = await pineconeIndex.query({
    topK: 5, // Get the top 5 most similar table summaries
    vector: questionEmbedding,
    includeMetadata: true,
  });
  const relevantTables = queryResults.matches.map(match => match.metadata);
  logger.info('Retrieved relevant tables from Pinecone', {
    tableCount: relevantTables.length,
    tableNames: relevantTables.map(t => t.name),
    service: 'SQL_GENERATOR',
  });

  // STEP C (Re-rank): Use the LLM to pick the best tables from the retrieved list
  logger.debug('Re-ranking tables with LLM', { service: 'SQL_GENERATOR' });
  const rerankPrompt = `
        Based on the user's question, which of the following tables are the most relevant and necessary to answer it?

        Use the 'tier' as a strong indicator of table quality and priority. The hierarchy is: Gold (highest) > Silver > Bronze > Iron (lowest).
        Strongly prefer higher-tier tables over lower-tier ones. Avoid using 'Iron' tier tables if a better alternative exists, as they are likely deprecated or empty.

        User Question: "${question}"

        Tables:
        ${JSON.stringify(relevantTables, null, 2)}

        Return ONLY a comma-separated list of the best table names. For example: users,transactions
    `;
  const rerankResponse = await llm.invoke(rerankPrompt);
  const topTableNames = rerankResponse.split(',').map(t => t.trim());
  logger.info('LLM selected tables for SQL generation', {
    selectedTables: topTableNames,
    service: 'SQL_GENERATOR',
  });

  // STEP D (Generate): Construct the final prompt and get the SQL
  logger.debug('Generating final SQL query', { service: 'SQL_GENERATOR' });
  const finalTableSchemas = relevantTables
    .filter(t => topTableNames.includes(t.name))
    .map(t => `Table Name: ${t.name}\nColumns: ${t.schema}`)
    .join('\n\n');

  const finalPrompt = `
        You are an expert PrestoSQL writer. Your task is to write a single, correct, and efficient PrestoSQL query to answer the user's question using ONLY the provided table schemas.

        CRITICAL RULE: You MUST wrap all table and column names in double quotes (") to preserve their exact case. For example, a query involving the 'users' table and the 'createdAt' column should be written as SELECT "createdAt" FROM "users".

        User Question: "${question}"

        Table Schemas:
        ---
        ${finalTableSchemas}
        ---

        Write the SQL query. Output ONLY the SQL code, with no explanation or surrounding text.
    `;
  const finalResponse = await llm.invoke(finalPrompt);

  // Clean up the response to ensure it's just SQL
  const sqlQuery = finalResponse.replace(/```sql|```/g, '').trim();
  logger.info('SQL generation completed', {
    sqlLength: sqlQuery.length,
    service: 'SQL_GENERATOR',
  });
  logger.debug('Generated SQL query', {
    sql: sqlQuery,
    service: 'SQL_GENERATOR',
  });

  const validationResult = await validateSqlSyntax(sqlQuery);

  if (!validationResult.isValid) {
    logger.error('Generated SQL failed validation', {
      error: validationResult.error,
      sql: `${sqlQuery.substring(0, 100)  }...`,
      service: 'SQL_GENERATOR',
    });
    // If the SQL is invalid, we throw an error instead of returning it.
    throw new Error(`Generated SQL is invalid: ${validationResult.error}`);
  }

  logger.info('SQL validation passed successfully', {
    service: 'SQL_GENERATOR',
  });
  return sqlQuery;
};
