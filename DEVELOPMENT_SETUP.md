# Development Setup Guide

This document outlines the comprehensive development setup and coding practices implemented for the
Text-to-SQL Powerhouse project.

## 🛠️ Tools and Configuration

### Code Quality Tools

#### ESLint

- **Configuration**: `eslint.config.js`
- **Purpose**: Static code analysis and error detection
- **Rules**: Modern JavaScript best practices, ES6+ features, error prevention
- **Command**: `pnpm run lint` or `pnpm run lint:fix`

#### Prettier

- **Configuration**: `.prettierrc`
- **Purpose**: Consistent code formatting
- **Settings**: Single quotes, trailing commas, 2-space indentation
- **Command**: `pnpm run format` or `pnpm run format:check`

#### Husky + Lint-staged

- **Purpose**: Pre-commit hooks for code quality
- **Configuration**: `package.json` lint-staged section
- **Functionality**: Automatically runs ESLint and Prettier before commits

### VSCode Integration

#### Workspace Settings (`.vscode/settings.json`)

- Format on save enabled
- ESLint auto-fix on save
- Consistent editor configuration
- File associations for environment files

#### Recommended Extensions (`.vscode/extensions.json`)

- ESLint
- Prettier
- Git tools
- Node.js development tools
- PostgreSQL support

## 📁 Project Structure

```
text-to-sql-powerhouse/
├── .vscode/                    # VSCode workspace configuration
│   ├── settings.json          # Editor settings
│   └── extensions.json        # Recommended extensions
├── .husky/                    # Git hooks
│   └── pre-commit            # Pre-commit hook script
├── src/                      # Source code
│   ├── config/               # Configuration files
│   ├── routes/               # API routes
│   ├── services/             # Business logic
│   ├── seed.js              # Database seeding
│   └── syncSchema.js        # Schema synchronization
├── content/                  # Data files
│   ├── table-metadata.json  # Comprehensive table metadata
│   └── table-standard.json  # Table classification standards
├── .env.example             # Environment variables template
├── .gitignore              # Git ignore rules
├── .prettierrc             # Prettier configuration
├── .prettierignore         # Prettier ignore rules
├── eslint.config.js        # ESLint configuration
├── package.json            # Project dependencies and scripts
├── README.md               # Project documentation
├── CONTRIBUTING.md         # Contribution guidelines
├── CHANGELOG.md            # Version history
└── DEVELOPMENT_SETUP.md    # This file
```

## 🚀 Development Workflow

### Getting Started

1. **Clone and Install**:

   ```bash
   git clone <repository-url>
   cd text-to-sql-powerhouse
   pnpm install
   ```

2. **Environment Setup**:

   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Database Setup**:
   ```bash
   pnpm run inspect  # Sync schema
   pnpm run seed     # Seed data (optional)
   ```

### Daily Development

1. **Start Development Server**:

   ```bash
   pnpm run dev
   ```

2. **Code Quality Checks**:

   ```bash
   pnpm run lint        # Check for issues
   pnpm run lint:fix    # Auto-fix issues
   pnpm run format      # Format code
   ```

3. **Pre-commit Process**:
   - Automatic linting and formatting on commit
   - Ensures consistent code quality
   - Prevents commits with linting errors

### Available Scripts

| Script                  | Purpose                                  |
| ----------------------- | ---------------------------------------- |
| `pnpm start`            | Start production server                  |
| `pnpm run dev`          | Start development server with hot reload |
| `pnpm run seed`         | Seed database with sample data           |
| `pnpm run inspect`      | Synchronize database schema              |
| `pnpm run lint`         | Run ESLint                               |
| `pnpm run lint:fix`     | Fix ESLint issues automatically          |
| `pnpm run format`       | Format code with Prettier                |
| `pnpm run format:check` | Check code formatting                    |

## 📋 Code Standards

### JavaScript Style Guide

- **ES6+ Features**: Use modern JavaScript features
- **Imports**: ES6 module imports, combine imports from same module
- **Variables**: Prefer `const` over `let`, avoid `var`
- **Functions**: Use arrow functions for callbacks
- **Strings**: Use template literals for interpolation
- **Objects**: Use object shorthand and destructuring

### File Organization

- **Single Responsibility**: Each file has a focused purpose
- **Clear Naming**: Descriptive file and function names
- **Separation of Concerns**: Routes, services, and config are separate
- **Consistent Structure**: Follow established patterns

### Error Handling

- **Try-Catch**: Use for async operations
- **Meaningful Messages**: Provide clear error descriptions
- **Logging**: Log errors with appropriate context
- **Validation**: Validate inputs and handle edge cases

## 🔧 Configuration Details

### ESLint Rules

- **Code Quality**: No unused variables, prefer const, arrow functions
- **Code Style**: Single quotes, semicolons, consistent spacing
- **Best Practices**: Strict equality, curly braces, no eval
- **ES6+**: Object shorthand, destructuring, template literals
- **Error Prevention**: No await in loops (warning), atomic updates

### Prettier Settings

- **Quotes**: Single quotes for strings
- **Semicolons**: Always include
- **Trailing Commas**: Always in multiline
- **Tab Width**: 2 spaces
- **Print Width**: 80 characters
- **Line Endings**: LF (Unix style)

### Git Hooks

- **Pre-commit**: Runs lint-staged
- **Lint-staged**: Processes staged files with ESLint and Prettier
- **Auto-fix**: Attempts to fix issues automatically
- **Fail on Error**: Prevents commits with unfixable issues

## 🎯 Quality Metrics

### Current Status

- ✅ **ESLint**: 0 errors, 30 warnings (acceptable for logging)
- ✅ **Prettier**: All files formatted consistently
- ✅ **Git Hooks**: Pre-commit hooks configured
- ✅ **VSCode**: Workspace settings optimized
- ✅ **Documentation**: Comprehensive guides available

### Warnings Breakdown

- **Console Statements**: 25 warnings (acceptable for logging/debugging)
- **Await in Loop**: 5 warnings (acceptable for sequential operations)

## 📚 Additional Resources

- [ESLint Documentation](https://eslint.org/docs/)
- [Prettier Documentation](https://prettier.io/docs/)
- [Husky Documentation](https://typicode.github.io/husky/)
- [VSCode Settings Reference](https://code.visualstudio.com/docs/getstarted/settings)

## 🤝 Contributing

1. Follow the established code style
2. Run linting and formatting before committing
3. Write descriptive commit messages
4. Update documentation when needed
5. Test your changes thoroughly

For detailed contribution guidelines, see [CONTRIBUTING.md](./CONTRIBUTING.md).
