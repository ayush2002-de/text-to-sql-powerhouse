import express from 'express';
import { generateSqlFromQuestion } from '../services/sqlGenerator.js';
import logger from '../config/logger.js';

const router = express.Router();

// Define the route for POST /api/generate-sql
router.post('/generate-sql', async (req, res) => {
  const { question } = req.body;

  logger.info('SQL generation request received', {
    question: question ? `${question.substring(0, 100)  }...` : 'undefined',
    service: 'API',
  });

  if (!question) {
    logger.warn('SQL generation request missing question parameter', {
      service: 'API',
    });
    return res.status(400).json({ error: 'Question is required.' });
  }

  try {
    // Call our "brain" to do the work
    const sqlQuery = await generateSqlFromQuestion(question);

    logger.info('SQL generation completed successfully', {
      questionLength: question.length,
      sqlLength: sqlQuery.length,
      service: 'API',
    });

    // Send the result back to the client
    res.json({ sql: sqlQuery });
  } catch (error) {
    logger.error('Error in generate-sql route', {
      error: error.message,
      stack: error.stack,
      question: `${question.substring(0, 100)  }...`,
      service: 'API',
    });
    res.status(500).json({ error: 'Failed to generate SQL query.' });
  }
});

export default router;
