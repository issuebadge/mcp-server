# Contributing to IssueBadge MCP Server

We love your input! We want to make contributing to IssueBadge MCP Server as easy and transparent as possible, whether it's:

- Reporting a bug
- Discussing the current state of the code
- Submitting a fix
- Proposing new features
- Becoming a maintainer

## 🚀 Development Process

We use GitHub to host code, to track issues and feature requests, as well as accept pull requests.

### Pull Request Process

1. **Fork the repository** and create your branch from `main`
2. **Make your changes** with clear, concise commits
3. **Add tests** for any new functionality
4. **Update documentation** as needed
5. **Ensure the test suite passes**
6. **Make sure your code lints** without errors
7. **Submit a pull request**

## 🔧 Setting Up Development Environment

### Prerequisites

- Node.js 18+
- npm 8+
- Git
- A code editor (VS Code recommended)

### Local Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/mcp-server.git
cd mcp-server

# Add upstream remote
git remote add upstream https://github.com/issuebadge/mcp-server.git

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Build the project
npm run build

# Run in development mode
npm run dev
```

### Development Scripts

```bash
npm run build     # Build TypeScript to JavaScript
npm run dev       # Watch mode for development
npm run lint      # Lint code with ESLint
npm run format    # Format code with Prettier
npm run test      # Run tests
npm run clean     # Clean build directory
```

## 📝 Code Style

We use ESLint and Prettier to maintain consistent code style:

### TypeScript Guidelines

- Use TypeScript for all new code
- Provide proper type annotations
- Use interfaces for object shapes
- Prefer `const` over `let` when possible
- Use meaningful variable and function names

### Code Formatting

```typescript
// Good
interface BadgeConfig {
  name: string;
  description: string;
  organizationName: string;
}

const createBadge = async (config: BadgeConfig): Promise<Badge> => {
  // Implementation
};

// Avoid
function createBadge(name, desc, org) {
  // Implementation without types
}
```

### Error Handling

Always provide meaningful error messages:

```typescript
// Good
try {
  const result = await apiCall();
  return result;
} catch (error) {
  if (axios.isAxiosError(error)) {
    throw new Error(`API request failed: ${error.response?.data?.message || error.message}`);
  }
  throw error;
}

// Avoid
try {
  const result = await apiCall();
  return result;
} catch (error) {
  throw error; // No context provided
}
```

## 🧪 Testing

### Writing Tests

- Write tests for all new functionality
- Test both success and error cases
- Use descriptive test names
- Mock external dependencies

### Test Structure

```typescript
describe('IssueBadgeClient', () => {
  describe('validateKey', () => {
    it('should return success for valid API key', async () => {
      // Test implementation
    });

    it('should throw error for invalid API key', async () => {
      // Test implementation
    });
  });
});
```

## 📚 Documentation

### Code Documentation

- Use JSDoc comments for functions and classes
- Include parameter descriptions and return types
- Provide usage examples for complex functions

```typescript
/**
 * Creates a new badge template with the specified configuration.
 * 
 * @param config - Badge configuration including name, description, and organization
 * @returns Promise that resolves to the created badge information
 * @throws {Error} When API request fails or validation errors occur
 * 
 * @example
 * ```typescript
 * const badge = await client.createBadge({
 *   name: 'Web Development Certificate',
 *   description: 'Awarded for completing web development course',
 *   organizationName: 'Tech Academy'
 * });
 * ```
 */
async createBadge(config: BadgeConfig): Promise<CreatedBadge> {
  // Implementation
}
```

### README Updates

- Update README.md for any new features
- Include usage examples
- Update configuration options
- Add troubleshooting information

## 🐛 Bug Reports

Great bug reports should include:

1. **Quick summary** and/or background
2. **Steps to reproduce**
   - Be specific!
   - Give sample code if you can
3. **What you expected would happen**
4. **What actually happens**
5. **Environment details** (OS, Node.js version, etc.)

### Bug Report Template

```markdown
**Describe the bug**
A clear and concise description of what the bug is.

**To Reproduce**
Steps to reproduce the behavior:
1. Configure MCP server with '...'
2. Call tool '....'
3. See error

**Expected behavior**
A clear and concise description of what you expected to happen.

**Error logs**
```
[Include any error logs here]
```

**Environment:**
- OS: [e.g. macOS 14.0]
- Node.js: [e.g. 18.17.0]
- MCP Server Version: [e.g. 1.0.0]
- IssueBadge API Version: [e.g. v1]

**Additional context**
Add any other context about the problem here.
```

## 💡 Feature Requests

We love feature requests! Please provide:

1. **Clear description** of the feature
2. **Use case** - why would this be useful?
3. **Proposed implementation** (if you have ideas)
4. **Alternatives considered**

### Feature Request Template

```markdown
**Is your feature request related to a problem?**
A clear and concise description of what the problem is.

**Describe the solution you'd like**
A clear and concise description of what you want to happen.

**Describe alternatives you've considered**
A clear and concise description of any alternative solutions or features you've considered.

**Use case**
Describe how this feature would be used and who would benefit from it.

**Additional context**
Add any other context or screenshots about the feature request here.
```

## 🏷️ Commit Messages

Use clear and meaningful commit messages:

### Format

```
type(scope): brief description

Longer description if needed

- List any breaking changes
- Reference issues: Fixes #123
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```bash
feat(api): add support for custom badge fields

- Add custom_fields parameter to createBadge function
- Update TypeScript interfaces
- Add validation for field types

Fixes #45
```

```bash
fix(auth): handle expired OAuth tokens properly

Previously, expired tokens would cause unhandled rejections.
Now we catch the error and provide a clear message.

Fixes #67
```

## 🔄 Pull Request Guidelines

### Before Submitting

- [ ] Code follows the style guidelines
- [ ] Self-review of code completed
- [ ] Tests added for new functionality
- [ ] All tests pass
- [ ] Documentation updated
- [ ] No merge conflicts with main branch

### Pull Request Template

```markdown
## Description
Brief description of changes made.

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
Describe the tests you ran to verify your changes.

## Checklist
- [ ] My code follows the style guidelines
- [ ] I have performed a self-review of my own code
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
- [ ] New and existing unit tests pass locally with my changes

## Related Issues
Fixes #(issue number)
```

## 🚀 Release Process

### Versioning

We use [Semantic Versioning](https://semver.org/):

- **MAJOR**: Incompatible API changes
- **MINOR**: Backwards-compatible functionality additions
- **PATCH**: Backwards-compatible bug fixes

### Release Workflow

1. **Update version** in `package.json`
2. **Update CHANGELOG.md** with release notes
3. **Create release PR** to main branch
4. **Tag release** after merge
5. **Publish to npm** (maintainers only)

## 👥 Community

### Communication Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: General questions and community discussion
- **Email**: support@issuebadge.com for sensitive issues

### Code of Conduct

We are committed to providing a welcoming and inspiring community for all. Please read our [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

## 🙏 Recognition

Contributors will be recognized in:

- **README.md contributors section**
- **Release notes** for significant contributions
- **GitHub contributors graph**

## ❓ Questions?

Don't hesitate to ask! You can:

- Open a [GitHub Discussion](https://github.com/issuebadge/mcp-server/discussions)
- Create an [issue](https://github.com/issuebadge/mcp-server/issues) with the "question" label
- Email us at support@issuebadge.com

Thank you for contributing to IssueBadge MCP Server! 🎉