// src/seed.js
import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';
import { VertexAIEmbeddings } from '@langchain/google-vertexai';
import { readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve current file location
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Go up one level to the parent, then into `content/`
const jsonPath = path.join(__dirname, '..', 'content', 'table-metadata.json');

// --- Main Seeding Function ---
const seedDatabase = async () => {
  try {
    console.log('🚀 Initializing clients...');
    // Initialize the Pinecone client
    const pinecone = new Pinecone();
    const pineconeIndex = pinecone.index(process.env.PINECONE_INDEX_NAME);

    const fileContent = await readFile(jsonPath, 'utf-8');
    const tableMetadata = JSON.parse(fileContent);

    // Initialize the Vertex AI Embeddings client
    const embeddings = new VertexAIEmbeddings({
      model: 'text-embedding-004',
    });

    console.log('🌱 Starting to seed the database...');
    for (const table of tableMetadata) {
      console.log(`Processing table: ${table.name}...`);

      // 1. Create embedding from the table summary
      const vector = await embeddings.embedQuery(table.summary);

      // 2. Upsert (update or insert) the vector into Pinecone
      await pineconeIndex.upsert([
        {
          id: table.name, // Use the table name as the unique ID
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
    }

    console.log('✅ Seeding complete!');
  } catch (error) {
    console.error('❌ An error occurred during seeding:', error);
  }
};

// --- Run the Seeding Process ---
seedDatabase();
