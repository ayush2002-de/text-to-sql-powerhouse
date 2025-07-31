# Contributing to Text-to-SQL Powerhouse

Thank you for your interest in contributing to this project! This document provides guidelines and
information for contributors.

## Development Setup

### Prerequisites

- Node.js
- pnpm
- Git
- PostgreSQL
- Google Cloud Platform account
- Pinecone account

### Getting Started

1. Fork the repository
2. Clone your fork:

   ```bash
   git clone https://github.com/your-username/text-to-sql-powerhouse.git
   cd text-to-sql-powerhouse
   ```

3. Install dependencies:

   ```bash
   pnpm install
   ```

4. Set up environment variables:

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

5. Set up the database:
   ```bash
   pnpm run inspect
   pnpm run seed
   ```

## Code Style and Quality

This project uses ESLint and Prettier to maintain code quality and consistency.

### Linting

```bash
# Check for linting errors
pnpm run lint

# Automatically fix linting errors
pnpm run lint:fix
```

### Formatting

```bash
# Format all files
pnpm run format

# Check if files are properly formatted
pnpm run format:check
```

### Pre-commit Hooks

Pre-commit hooks are set up to automatically:

- Run ESLint and fix issues
- Format code with Prettier
- Ensure code quality before commits

## Coding Standards

### JavaScript Style Guide

- Use ES6+ features and modern JavaScript
- Prefer `const` over `let`, avoid `var`
- Use arrow functions for callbacks
- Use template literals for string interpolation
- Use destructuring for object and array assignments
- Use async/await instead of Promises when possible

### File Organization

- Keep files focused and single-purpose
- Use descriptive file and function names
- Group related functionality together
- Separate concerns (routes, services, config, etc.)

### Error Handling

- Always handle errors appropriately
- Use try-catch blocks for async operations
- Provide meaningful error messages
- Log errors with appropriate context

### Comments and Documentation

- Write self-documenting code with clear variable and function names
- Add comments for complex business logic
- Document API endpoints and their parameters
- Update README.md when adding new features

## Git Workflow

### Branch Naming

Use descriptive branch names with prefixes:

- `feature/` - New features
- `bugfix/` - Bug fixes
- `hotfix/` - Critical fixes
- `refactor/` - Code refactoring
- `docs/` - Documentation updates

Examples:

- `feature/add-user-authentication`
- `bugfix/fix-sql-generation-error`
- `refactor/improve-database-connection`

### Commit Messages

Write clear, descriptive commit messages:

```
type(scope): brief description

Longer description if needed

- List any breaking changes
- Reference issues: Fixes #123
```

Types:

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation
- `style` - Formatting changes
- `refactor` - Code refactoring
- `test` - Adding tests
- `chore` - Maintenance tasks

Examples:

```
feat(api): add user authentication endpoint

fix(sql): resolve query generation for complex joins

docs(readme): update installation instructions
```

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Ensure all tests pass and code is properly formatted
4. Update documentation if needed
5. Submit a pull request with:
   - Clear title and description
   - Reference to related issues
   - Screenshots if applicable
   - Testing instructions

## Testing

### Running Tests

```bash
pnpm test
```

### Writing Tests

- Write unit tests for new functions
- Test error conditions and edge cases
- Use descriptive test names
- Follow the AAA pattern (Arrange, Act, Assert)

## Database Changes

### Schema Modifications

1. Update the schema in the appropriate migration files
2. Update `table-metadata.json` with new table information
3. Update `table-standard.json` with tier and domain classifications
4. Run `pnpm run inspect` to sync changes
5. Test the changes thoroughly

### Adding New Tables

1. Define the table schema
2. Add metadata to `table-metadata.json`:
   ```json
   {
     "name": "tableName",
     "summary": "Description of the table purpose",
     "schema": "SQL schema definition",
     "tier": "GOLD|IRON|Core|Transactional|Reference",
     "domain": "Domain classification"
   }
   ```
3. Add classification to `table-standard.json`
4. Update documentation

## API Development

### Adding New Endpoints

1. Define routes in `src/routes/`
2. Implement business logic in `src/services/`
3. Add proper error handling
4. Document the endpoint in README.md
5. Add input validation
6. Write tests

### API Design Principles

- Use RESTful conventions
- Return consistent response formats
- Include proper HTTP status codes
- Validate input parameters
- Handle errors gracefully
- Use meaningful endpoint names

## Performance Considerations

- Optimize database queries
- Use connection pooling
- Implement caching where appropriate
- Monitor memory usage
- Profile slow operations

## Security Guidelines

- Validate all user inputs
- Use parameterized queries to prevent SQL injection
- Implement proper authentication and authorization
- Keep dependencies updated
- Don't commit sensitive information
- Use environment variables for configuration

## Documentation

### Code Documentation

- Document complex algorithms
- Explain business logic
- Add JSDoc comments for functions
- Keep documentation up to date

### API Documentation

- Document all endpoints
- Include request/response examples
- Specify required parameters
- Document error responses

## Getting Help

- Check existing issues and documentation
- Ask questions in discussions
- Reach out to maintainers
- Join the community chat (if available)

## Code Review Guidelines

### For Authors

- Keep pull requests focused and small
- Write clear descriptions
- Respond to feedback promptly
- Test your changes thoroughly

### For Reviewers

- Be constructive and respectful
- Focus on code quality and maintainability
- Check for security issues
- Verify tests are adequate
- Ensure documentation is updated

## Release Process

1. Update version in `package.json`
2. Update CHANGELOG.md
3. Create a release branch
4. Test thoroughly
5. Merge to main
6. Tag the release
7. Deploy to production

Thank you for contributing to Text-to-SQL Powerhouse! 🚀
