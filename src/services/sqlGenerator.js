import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';
import { VertexAI, VertexAIEmbeddings } from '@langchain/google-vertexai';
import dbPool from '../config/db.js';
import logger from '../config/logger.js';

// --- INITIALIZE CLIENTS ---
const pinecone = new Pinecone();

const embeddings = new VertexAIEmbeddings({
  model: 'text-embedding-004',
});

const llm = new VertexAI({
  model: 'claude-sonnet-4@20250514', // A powerful and fast model for generation
  temperature: 0, // We want deterministic, factual SQL, so we set temperature to 0
});

const validateSqlSyntax = async sqlQuery => {
  logger.debug('Starting SQL syntax validation', {
    queryLength: sqlQuery.length,
    service: 'SQL_GENERATOR',
  });

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

  const foundForbiddenKeyword = forbiddenKeywords.find(keyword =>
    normalizedSql.includes(` ${keyword} `),
  );

  if (foundForbiddenKeyword) {
    logger.warn('SQL validation failed - forbidden keyword detected', {
      forbiddenKeyword: foundForbiddenKeyword,
      service: 'SQL_GENERATOR',
    });
    return {
      isValid: false,
      error: 'Query contains a forbidden write-operation keyword.',
    };
  }

  const client = await dbPool.connect();
  try {
    logger.debug('Executing EXPLAIN query for validation', {
      service: 'SQL_GENERATOR',
    });
    await client.query(`EXPLAIN ${sqlQuery}`);
    logger.info('SQL validation passed', {
      service: 'SQL_GENERATOR',
    });
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

const retrieveContext = async question => {
  logger.debug('Starting context retrieval process', {
    question: question.substring(0, 100) + (question.length > 100 ? '...' : ''),
    service: 'SQL_GENERATOR',
  });

  logger.debug('Generating question embedding', { service: 'SQL_GENERATOR' });
  const questionEmbedding = await embeddings.embedQuery(question);

  const tableIndex = pinecone.index(process.env.PINECONE_INDEX_NAME);
  const queryIndex = pinecone.index(process.env.PINECONE_QUERY_INDEX_NAME);

  logger.debug('Querying Pinecone indexes for relevant context', {
    service: 'SQL_GENERATOR',
  });
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
    tableNames: relevantTables.map(t => t.name),
    service: 'SQL_GENERATOR',
  });
  return { relevantTables, relevantExampleQueries };
};

export const buildCombinedPrompt = (
  question,
  relevantTables,
  relevantExampleQueries,
) => `
    You are an expert SQL writer. Your task is to write a single, correct SQL query to answer the user's question by analyzing the provided context.
    First, select the most appropriate table(s) from the 'Table Schemas' list. Then, generate the query.

    ===Rules for Table Selection
    1. Use the 'tier' as a strong indicator of table quality. The priority is: Gold > Silver > Bronze > Iron.
    2. Avoid 'Iron' tier tables if a better alternative exists.

    ===Rules for SQL Generation
    1. Your response must start with <@query@> or <@explanation@>.
    2. Respond only with a valid SQL query inside the <@query@> section.
    3. CRITICAL RULE: Wrap all table and column names in double quotes (").
    4. If the context is insufficient, explain what is missing in the <@explanation@> section.

    ===SQL Dialect
    PrestoSQL

    ===Table Schemas
    ${JSON.stringify(relevantTables, null, 2)}

    ===Example Queries (for inspiration)
    ${JSON.stringify(relevantExampleQueries, null, 2)}

    ===Question
    ${question}
  `;

const parseAndValidateResponse = async response => {
  logger.debug('Starting response parsing and validation', {
    responseLength: response.length,
    service: 'SQL_GENERATOR',
  });

  let sqlQuery = response;
  while (sqlQuery.includes('<@query@>')) {
    sqlQuery = sqlQuery.replace(/<@query@>/g, '').replace(/<\/@query@>/g, '');
  }
  sqlQuery = response.match(/<@query@>([\s\S]*?)<\/@query@>/) ? sqlQuery : '';

  if (!sqlQuery) {
    logger.warn('No SQL query found in LLM response', {
      service: 'SQL_GENERATOR',
    });
    const explanationMatch = response.match(/<@explanation@>([\s\S]*)/);
    if (explanationMatch && explanationMatch[1]) {
      const explanation = explanationMatch[1].trim();
      logger.info('LLM provided explanation instead of query', {
        explanation:
          explanation.substring(0, 200) +
          (explanation.length > 200 ? '...' : ''),
        service: 'SQL_GENERATOR',
      });
      throw new Error(`LLM explanation: ${explanation}`);
    }
    logger.error('Invalid response format from LLM', {
      service: 'SQL_GENERATOR',
    });
    throw new Error('Invalid response format from LLM or empty query.');
  }

  logger.debug('Extracted SQL query from LLM response', {
    queryLength: sqlQuery.length,
    service: 'SQL_GENERATOR',
  });

  const validationResult = await validateSqlSyntax(sqlQuery);
  if (!validationResult.isValid) {
    logger.error('Generated SQL failed validation', {
      error: validationResult.error,
      service: 'SQL_GENERATOR',
    });
    throw new Error(`Generated SQL is invalid: ${validationResult.error}`);
  }

  logger.info('SQL parsing and validation completed successfully', {
    finalQueryLength: sqlQuery.length,
    service: 'SQL_GENERATOR',
  });
  return sqlQuery;
};

// --- MAIN ORCHESTRATOR FUNCTION ---

export const generateSqlFromQuestion = async question => {
  const startTime = Date.now();
  logger.info('Starting SQL generation process', {
    questionLength: question.length,
    question: question.substring(0, 100) + (question.length > 100 ? '...' : ''),
    service: 'SQL_GENERATOR',
  });

  try {
    const { relevantTables, relevantExampleQueries } =
      await retrieveContext(question);

    logger.debug('Building combined prompt for LLM', {
      tableCount: relevantTables.length,
      exampleQueryCount: relevantExampleQueries.length,
      service: 'SQL_GENERATOR',
    });

    const combinedPrompt = buildCombinedPrompt(
      question,
      relevantTables,
      relevantExampleQueries,
    );

    logger.debug('Invoking LLM for SQL generation', {
      promptLength: combinedPrompt.length,
      service: 'SQL_GENERATOR',
    });

    const finalResponse = await llm.invoke(combinedPrompt);

    logger.debug('Received response from LLM', {
      responseLength: finalResponse.length,
      service: 'SQL_GENERATOR',
    });

    const sqlQuery = await parseAndValidateResponse(finalResponse);

    const duration = Date.now() - startTime;
    logger.info('SQL generation completed successfully', {
      duration: `${duration}ms`,
      finalQueryLength: sqlQuery.length,
      service: 'SQL_GENERATOR',
    });

    return sqlQuery;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error('SQL generation failed', {
      error: error.message,
      duration: `${duration}ms`,
      stack: error.stack,
      service: 'SQL_GENERATOR',
    });
    throw error;
  }
};
