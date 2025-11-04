# IssueBadge MCP Server

[![npm version](https://badge.fury.io/js/issuebadge-mcp-server.svg)](https://badge.fury.io/js/issuebadge-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-blue)](https://modelcontextprotocol.io/)

A Model Context Protocol (MCP) server for interacting with the IssueBadge API. This server enables AI assistants like Claude and ChatGPT to manage digital badges and certificates using natural language.

<a href="https://glama.ai/mcp/servers/@issuebadge/mcp-server">
  <img width="380" height="200" src="https://glama.ai/mcp/servers/@issuebadge/mcp-server/badge" alt="IssueBadge Server MCP server" />
</a>

## 🌟 Features

- **🤖 AI-Powered Badge Management**: Use natural language to create, issue, and manage badges
- **🔐 Dual Authentication**: Support for both Laravel Sanctum and OAuth2
- **🏆 Complete Badge Lifecycle**: Create templates, issue to recipients, and verify authenticity
- **📊 Multi-tenant Support**: Secure tenant isolation for enterprise use
- **🛡️ Idempotency Protection**: Prevent duplicate operations with built-in safeguards
- **📧 Automated Notifications**: Automatic email delivery with verification URLs
- **🎨 Custom Fields**: Flexible metadata and custom field support

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ 
- npm 8+
- IssueBadge API account with API key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/issuebadge/mcp-server.git
   cd mcp-server
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env with your IssueBadge API credentials
   ```

4. **Build the project**
   ```bash
   npm run build
   ```

5. **Test the server**
   ```bash
   npm test
   ```

## ⚙️ Configuration

Create a `.env` file based on `.env.example`:

```env
# API Configuration
ISSUEBADGE_BASE_URL=https://app.issuebadge.com/api/v1
ISSUEBADGE_API_KEY=

# OAuth2 Configuration (Alternative)
ISSUEBADGE_OAUTH_URL=https://app.issuebadge.com/api/v1/oauth
ISSUEBADGE_OAUTH_TOKEN=your_oauth_token_here

# Authentication Method (sanctum or oauth2)
AUTH_METHOD=sanctum

# Server Configuration
MCP_SERVER_NAME=IssueBadge MCP Server
MCP_SERVER_VERSION=1.0.0

# Optional Settings
REQUEST_TIMEOUT=30000
DEBUG=false
MAX_RETRIES=3
RETRY_DELAY=1000
```

## 🔧 Integration

### Claude Desktop

Add this server to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "issuebadge": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-server/dist/index.js"],
      "env": {
        "ISSUEBADGE_BASE_URL": "https://app.issuebadge.com
/api/v1",
        "ISSUEBADGE_API_KEY": "",
        "AUTH_METHOD": "sanctum"
      }
    }
  }
}
```

### ChatGPT Actions

1. Create a new Custom GPT in ChatGPT
2. Import the OpenAPI specification from your IssueBadge instance
3. Configure Bearer token authentication with your API key
4. Start managing badges through conversation!

## 🛠️ Available Tools

### 1. `validate_key`
Validates IssueBadge API keys for authentication.

**Parameters:**
- `api_key` (string, required): The API key to validate

**Example:**
```
"Validate my API key: 1|abcdef123456789..."
```

### 2. `get_all_badges`
Retrieves all available badges for the authenticated organization.

**Parameters:**
- `limit` (number, optional): Maximum badges to return (default: 100)

**Example:**
```
"Show me all available badges"
"List the first 50 badges"
```

### 3. `create_badge`
Creates a new badge template with optional custom fields.

**Parameters:**
- `name` (string, required): Badge name
- `description` (string, required): Badge description  
- `issuing_organization_name` (string, required): Organization name
- `idempotency_key` (string, required): Unique identifier
- `custom_fields` (array, optional): Custom field definitions
- And more optional parameters...

**Example:**
```
"Create a badge called 'Web Development Certificate' for completing our full-stack course"
"Create a Python certification badge with custom fields for completion date and final score"
```

### 4. `issue_badge`
Issues a badge to a recipient with optional metadata.

**Parameters:**
- `badge_id` (string, required): Badge ID from creation
- `name` (string, required): Recipient's full name
- `idempotency_key` (string, required): Unique identifier
- `email` (string, optional): Recipient's email
- `metadata` (object, optional): Custom field values

**Example:**
```
"Issue the Web Development badge to John Doe with email john@example.com"
"Issue Python certification to Alice with completion date today and score 95%"
```

## 💬 Natural Language Examples

### Creating Badges
```
Human: "Create a badge for JavaScript mastery with fields for completion date and project count"

AI: I'll create a JavaScript mastery badge with the custom fields you specified.

✨ Badge Created Successfully!
🏷️ Badge Name: JavaScript Mastery Certificate
🆔 Badge ID: js_mastery_2024_001
📋 Custom fields: completion_date (date), project_count (number)
```

### Issuing Badges
```
Human: "Issue the JavaScript badge to Sarah Chen with completion date December 1st and 5 projects completed"

AI: I'll issue the JavaScript mastery badge to Sarah Chen with the specified details.

🎉 Badge Issued Successfully!
📧 Recipient: Sarah Chen  
🔗 Verification URL: https://yourdomain.com/verify/xyz123
📅 Completion Date: 2024-12-01
📊 Projects: 5
```

### Batch Operations
```
Human: "Create completion badges for all students in my Python course who scored above 85%"

AI: I'll help you create and issue completion badges for high-performing students. First, let me create a Python Course Completion badge, then we can issue it to qualified students.

[Creates badge and processes student list]
```

## 🏗️ Development

### Building from Source

```bash
# Clone the repository
git clone https://github.com/issuebadge/mcp-server.git
cd mcp-server

# Install dependencies
npm install

# Build TypeScript
npm run build

# Run in development mode
npm run dev

# Lint code
npm run lint

# Format code
npm run format
```

### Project Structure

```
mcp-server/
├── src/
│   └── index.ts          # Main MCP server implementation
├── dist/                 # Compiled JavaScript (generated)
├── .env.example         # Environment configuration template
├── package.json         # Node.js dependencies and scripts
├── tsconfig.json        # TypeScript configuration
└── README.md           # This file
```

## 🔒 Security

- All API communications use HTTPS
- API keys are validated before each request
- Idempotency keys prevent duplicate operations
- Multi-tenant data isolation
- Request timeout protection
- Comprehensive error handling

## 📊 Error Handling

The MCP server provides detailed error messages for common issues:

- **Authentication Errors**: Invalid API keys or expired tokens
- **Validation Errors**: Missing required parameters or invalid formats
- **Network Errors**: Connection timeouts or service unavailability
- **Business Logic Errors**: Duplicate operations or insufficient permissions

## 🌍 Use Cases

### Educational Institutions
- **Course Completion**: Automatically issue badges when students complete courses
- **Skill Validation**: Create skill-based badges with assessment scores
- **Graduation Certificates**: Bulk issue graduation badges with academic details

### Corporate Training
- **Certification Programs**: Manage professional certifications with expiration dates
- **Compliance Training**: Track and verify mandatory training completion
- **Skill Development**: Issue badges for internal skill development programs

### Event Management
- **Conference Attendance**: Issue attendance badges for events and workshops
- **Achievement Tracking**: Create progressive badge systems for ongoing programs
- **Speaker Recognition**: Manage speaker and participant recognition badges

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines:

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Commit your changes**: `git commit -m 'Add amazing feature'`
4. **Push to the branch**: `git push origin feature/amazing-feature`
5. **Open a Pull Request**

### Development Guidelines

- Follow TypeScript best practices
- Add comprehensive error handling
- Include JSDoc comments for functions
- Update tests for new features
- Follow semantic versioning

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Getting Help

- **📖 Documentation**: Check this README and inline code comments
- **🐛 Bug Reports**: [Open an issue](https://github.com/issuebadge/mcp-server/issues)
- **💬 Discussions**: [GitHub Discussions](https://github.com/issuebadge/mcp-server/discussions)
- **📧 Email**: support@issuebadge.com

### Troubleshooting

#### Common Issues

**1. API Key Validation Failed**
```bash
# Check API key format (should start with number|)
# Verify the key hasn't expired
# Ensure correct base URL
```

**2. Connection Timeout**
```bash
# Check network connectivity
# Verify IssueBadge service status
# Increase REQUEST_TIMEOUT in .env
```

**3. Badge Creation Errors**
```bash
# Verify required fields are provided
# Check idempotency key uniqueness
# Validate organization permissions
```

## 🔗 Related Projects

- **[IssueBadge API](https://docs.issuebadge.com)**: Core badge management platform
- **[Model Context Protocol](https://modelcontextprotocol.io)**: MCP specification and tools
- **[Claude Desktop](https://claude.ai/desktop)**: AI assistant with MCP support

## 📈 Roadmap

### Version 1.1
- [ ] Batch badge operations
- [ ] Advanced filtering and search
- [ ] Webhook integration
- [ ] Badge template management

### Version 1.2  
- [ ] Analytics and reporting tools
- [ ] Custom badge validation rules
- [ ] Integration with learning management systems
- [ ] Advanced workflow automation

### Version 2.0
- [ ] Blockchain verification support
- [ ] Multi-language badge content
- [ ] Advanced branding customization
- [ ] Enterprise SSO integration

---

**Ready to revolutionize your badge management?** Get started with IssueBadge MCP Server and experience the power of conversational badge administration!

*Built with ❤️ by the IssueBadge team*