# Text-to-SQL Powerhouse 🚀

A powerful text-to-SQL conversion system with AI capabilities, built with Node.js, Express, and
LangChain.

## Features

- 🤖 AI-powered natural language to SQL conversion
- 📊 Comprehensive database schema management
- 🔍 Vector-based semantic search with Pinecone
- 🏗️ Modular architecture with clean separation of concerns
- 📝 Comprehensive table metadata and domain classification
- 🛡️ Type-safe database operations
- 🎯 RESTful API design

## Tech Stack

- **Backend**: Node.js, Express.js
- **AI/ML**: LangChain, Google Vertex AI
- **Database**: PostgreSQL
- **Vector Store**: Pinecone
- **Development**: ESLint, Prettier, Husky
- **Process Management**: Nodemon

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL database
- Google Cloud Platform account (for Vertex AI)
- Pinecone account

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd text-to-sql-powerhouse
```

2. Install dependencies:

```bash
pnpm install
```

3. Set up environment variables:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_database_name
DB_USER=your_username
DB_PASSWORD=your_password

# Google Vertex AI
GOOGLE_APPLICATION_CREDENTIALS=path/to/your/service-account.json
GOOGLE_CLOUD_PROJECT=your-project-id

# Pinecone Configuration
PINECONE_API_KEY=your_pinecone_api_key
PINECONE_INDEX_NAME=your_index_name

# Server Configuration
PORT=3001
```

4. Set up the database schema:

```bash
pnpm run inspect
```

5. Seed the database (optional):

```bash
pnpm run seed
```

### Development

Start the development server:

```bash
pnpm run dev
```

The server will be available at `http://localhost:3001`

## API Endpoints

### Generate SQL Query

**POST** `/api/generate-sql`

Convert natural language questions to SQL queries.

**Request Body:**

```json
{
  "question": "Show me all leads created in the last 30 days"
}
```

**Response:**

```json
{
  "sql": "SELECT * FROM lead WHERE createdAt >= NOW() - INTERVAL '30 days'"
}
```

## Project Structure

```
text-to-sql-powerhouse/
├── src/
│   ├── config/
│   │   └── db.js              # Database configuration
│   ├── routes/
│   │   └── api.js             # API route definitions
│   ├── services/
│   │   └── sqlGenerator.js    # Core SQL generation logic
│   ├── seed.js                # Database seeding script
│   └── syncSchema.js          # Schema synchronization
├── content/
│   ├── table-metadata.json    # Comprehensive table metadata
│   └── table-standard.json    # Table classification standards
├── index.js                   # Application entry point
├── package.json               # Project dependencies and scripts
├── eslint.config.js           # ESLint configuration
├── .prettierrc                # Prettier configuration
└── README.md                  # Project documentation
```

## Database Schema

The system manages a comprehensive database schema with the following domains:

- **Business Operations**: Core business structure and hierarchy
- **Sales & CRM**: Lead management and sales pipeline
- **Customer Management**: Organization and contact information
- **Marketing & Communications**: Campaigns, notifications, and messaging
- **User Management**: User accounts, teams, and roles
- **Performance Management**: Metrics and KPI tracking
- **Planning & Analytics**: AOP items and business planning
- **Customer Support**: Ticketing and support workflows
- **System Configuration**: Application settings and integrations

### Table Tiers

- **GOLD**: High-priority business-critical tables
- **IRON**: Standard operational tables
- **Core**: Essential system tables
- **Transactional**: Event and activity logs
- **Reference**: Lookup and junction tables

## Development Workflow

### Code Quality

This project uses ESLint and Prettier for code quality and formatting:

```bash
# Lint code
pnpm run lint

# Fix linting issues
pnpm run lint:fix

# Format code
pnpm run format

# Check formatting
pnpm run format:check
```

### Git Hooks

Pre-commit hooks are set up to automatically:

- Run ESLint and fix issues
- Format code with Prettier
- Ensure code quality before commits

### Scripts

- `pnpm start` - Start production server
- `pnpm run dev` - Start development server with hot reload
- `pnpm run seed` - Seed database with sample data
- `pnpm run inspect` - Synchronize database schema
- `pnpm run lint` - Run ESLint
- `pnpm run lint:fix` - Fix ESLint issues
- `pnpm run format` - Format code with Prettier
- `pnpm run format:check` - Check code formatting

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Run tests and linting: `pnpm run lint && pnpm run format:check`
5. Commit your changes: `git commit -m 'Add amazing feature'`
6. Push to the branch: `git push origin feature/amazing-feature`
7. Open a Pull Request

### Code Style Guidelines

- Use ES6+ features and modern JavaScript
- Follow the established ESLint configuration
- Write descriptive commit messages
- Add comments for complex logic
- Ensure all functions have proper error handling

## Environment Variables

| Variable                         | Description                 | Required           |
| -------------------------------- | --------------------------- | ------------------ |
| `DB_HOST`                        | PostgreSQL host             | Yes                |
| `DB_PORT`                        | PostgreSQL port             | Yes                |
| `DB_NAME`                        | Database name               | Yes                |
| `DB_USER`                        | Database username           | Yes                |
| `DB_PASSWORD`                    | Database password           | Yes                |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to GCP service account | Yes                |
| `GOOGLE_CLOUD_PROJECT`           | Google Cloud project ID     | Yes                |
| `PINECONE_API_KEY`               | Pinecone API key            | Yes                |
| `PINECONE_INDEX_NAME`            | Pinecone index name         | Yes                |
| `PORT`                           | Server port                 | No (default: 3001) |

## License

This project is licensed under the ISC License.

## Support

For support and questions, please open an issue in the repository.
