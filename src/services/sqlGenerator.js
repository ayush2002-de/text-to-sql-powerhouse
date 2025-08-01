import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';
import { VertexAI, VertexAIEmbeddings } from '@langchain/google-vertexai';
import dbPool from '../config/db.js';
import logger from '../config/logger.js';

// --- INITIALIZE CLIENTS ---
// We initialize these once when the server starts, not on every request.
const pinecone = new Pinecone();

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
      sqlQuery: `${sqlQuery.substring(0, 100)}...`,
      service: 'SQL_GENERATOR',
    });
    return { isValid: false, error: error.message };
  } finally {
    client.release();
  }
};

// --- THE MAIN FUNCTION ---
export const generateSqlFromQuestion = async question => {
  logger.info('Starting SQL generation with re-rank step', {
    questionLength: question.length,
    service: 'SQL_GENERATOR',
  });

  // --- Step 1: Embed question and retrieve from both indexes ---
  const questionEmbedding = await embeddings.embedQuery(question);
  const tableIndex = pinecone.index(process.env.PINECONE_INDEX_NAME);
  const queryIndex = pinecone.index(process.env.PINECONE_QUERY_INDEX_NAME);

  const [tableResults, queryResults] = await Promise.all([
    tableIndex.query({
      topK: 5,
      vector: questionEmbedding,
      includeMetadata: true,
    }),
    queryIndex.query({
      topK: 3,
      vector: questionEmbedding,
      includeMetadata: true,
    }),
  ]);

  const relevantTables = tableResults.matches.map(match => match.metadata);
  const relevantExampleQueries = queryResults.matches.map(
    match => match.metadata,
  );

  logger.info('Retrieved context from Pinecone', {
    tableCount: relevantTables.length,
    exampleQueryCount: relevantExampleQueries.length,
  });

  // --- Step 2 : Re-rank tables using all available context ---
  logger.debug('Re-ranking tables with LLM using tables and example queries', {
    service: 'SQL_GENERATOR',
  });
  const rerankPrompt = `
        Your primary task is to select the most relevant table(s) to answer the user's question. Make your decision by analyzing the "Available Tables" and their summaries.

        You can use the "Example Queries" as a secondary source of context to help understand how tables are typically joined, but your main decision should be based on the user's question and the table descriptions. Prioritize 'Gold' tier tables.

        User Question: "${question}"

        Available Tables:
        ${JSON.stringify(relevantTables, null, 2)}

        Example Queries (for secondary context):
        ${JSON.stringify(relevantExampleQueries, null, 2)}

        Return ONLY a comma-separated list of the best table names.
        `;
  const rerankResponse = await llm.invoke(rerankPrompt);
  const topTableNames = rerankResponse.split(',').map(t => t.trim());

  logger.info('LLM re-ranked and selected tables for SQL generation', {
    selectedTables: topTableNames,
  });

  // --- Step 3: Generate SQL with focused context ---
  logger.debug('Generating final SQL query', { service: 'SQL_GENERATOR' });
  const finalTableSchemas = relevantTables
    .filter(t => topTableNames.includes(t.name))
    .map(t => `Table Name: ${t.name}\nColumns: ${t.schema}`)
    .join('\n\n');

  const finalPrompt = `
        You are an expert SQL writer. Your primary task is to write a SQL query to answer the user's question using ONLY the provided "Table Schemas".

        If helpful, you may use the "Example Queries" for inspiration on complex joins or logic, but do not copy them directly if they are not a good fit. Your main focus is the user's question and the provided schemas.

        ===Response Guidelines
        1. The response must always start with <@query@> or <@explanation@>.
        2. Respond only with a valid SQL query inside the <@query@> section.
        3. CRITICAL RULE: You MUST wrap all table and column names in double quotes (").
        4. If context is insufficient, explain what information is missing in the <@explanation@> section.

        ===SQL Dialect
        PrestoSQL

        ===Table Schemas
        ${finalTableSchemas}

        ===Example Queries (for inspiration, if helpful)
        ${JSON.stringify(relevantExampleQueries, null, 2)}

        ===Question
        ${question}
        `;

  const finalResponse = await llm.invoke(finalPrompt);

  // --- Final parsing and validation logic remains the same ---
  const queryMatch = finalResponse.match(/<@query@>([\s\S]*)/);
  const explanationMatch = finalResponse.match(/<@explanation@>([\s\S]*)/);

  if (queryMatch && queryMatch[1]) {
    // SUCCESS PATH: A query was found.
    const sqlQuery = queryMatch[1].trim();

    // Your existing logging and validation logic fits perfectly here.
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
        sql: `${sqlQuery.substring(0, 100)}...`,
        service: 'SQL_GENERATOR',
      });
      // If the SQL is invalid, we throw an error instead of returning it.
      throw new Error(`Generated SQL is invalid: ${validationResult.error}`);
    }

    logger.info('SQL validation passed successfully', {
      service: 'SQL_GENERATOR',
    });
    return sqlQuery;
  } else if (explanationMatch && explanationMatch[1]) {
    // FAILURE PATH 1: LLM provided an explanation.
    const explanation = explanationMatch[1].trim();
    logger.error('LLM could not generate query, provided explanation', {
      explanation,
      service: 'SQL_GENERATOR',
    });
    throw new Error(`LLM explanation: ${explanation}`);
  } else {
    // FAILURE PATH 2: LLM did not follow the format.
    logger.error('Invalid response format from LLM', {
      response: finalResponse,
      service: 'SQL_GENERATOR',
    });
    throw new Error(
      'Invalid response format from LLM. No <@query@> or <@explanation@> tag found.',
    );
  }
};
