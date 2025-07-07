#!/usr/bin/env node

/**
 * IssueBadge MCP Server
 * 
 * This MCP server provides tools for interacting with the IssueBadge API:
 * - validate_key: Validate API authentication tokens
 * - get_all_badges: Retrieve all available badges
 * - issue_badge: Issue a badge to a recipient
 * - create_badge: Create a new badge template
 * 
 * Usage: node dist/index.js
 * 
 * @author IssueBadge Team
 * @version 1.0.0
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import FormData from 'form-data';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';

// Load environment variables
dotenv.config();

// Configuration interface
interface Config {
  baseUrl: string;
  oauthUrl: string;
  apiKey: string;
  oauthToken: string;
  authMethod: 'sanctum' | 'oauth2';
  requestTimeout: number;
  debug: boolean;
  serverName: string;
  serverVersion: string;
  maxRetries: number;
  retryDelay: number;
}

// Configuration with defaults
const CONFIG: Config = {
  baseUrl: process.env.ISSUEBADGE_BASE_URL || 'https://yourdomain.com/api/v1',
  oauthUrl: process.env.ISSUEBADGE_OAUTH_URL || 'https://yourdomain.com/api/v1/oauth',
  apiKey: process.env.ISSUEBADGE_API_KEY || '',
  oauthToken: process.env.ISSUEBADGE_OAUTH_TOKEN || '',
  authMethod: (process.env.AUTH_METHOD as 'sanctum' | 'oauth2') || 'sanctum',
  requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '30000'),
  debug: process.env.DEBUG === 'true',
  serverName: process.env.MCP_SERVER_NAME || 'IssueBadge MCP Server',
  serverVersion: process.env.MCP_SERVER_VERSION || '1.0.0',
  maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
  retryDelay: parseInt(process.env.RETRY_DELAY || '1000'),
};

// Validation schemas
const ValidateKeySchema = z.object({
  api_key: z.string().describe('The API key to validate'),
});

const GetAllBadgesSchema = z.object({
  limit: z.number().optional().describe('Maximum number of badges to return (default: 100)'),
});

const IssueBadgeSchema = z.object({
  badge_id: z.string().describe('Encrypted badge ID from badge creation'),
  name: z.string().describe('Recipient full name'),
  email: z.string().email().optional().describe('Recipient email address'),
  phone: z.string().optional().describe('Recipient phone number'),
  idempotency_key: z.string().describe('Unique key to prevent duplicate issuance'),
  metadata: z.record(z.any()).optional().describe('Custom field values and additional metadata'),
});

const CreateBadgeSchema = z.object({
  name: z.string().describe('Badge name'),
  description: z.string().describe('Badge description'),
  issuing_organization_name: z.string().describe('Name of the issuing organization'),
  idempotency_key: z.string().describe('Unique key to prevent duplicate badge creation'),
  nickname: z.string().optional().describe('Optional badge nickname'),
  left_panel_description: z.string().optional().describe('Additional description for left panel'),
  organization_id: z.string().optional().describe('Existing organization ID'),
  comment: z.string().optional().describe('Additional comments'),
  expire_date: z.string().optional().describe('Badge expiration date (YYYY-MM-DD)'),
  badge_logo_path: z.string().optional().describe('Path to badge logo file'),
  custom_fields: z.array(z.object({
    name: z.string().describe('Field name'),
    type: z.enum(['text', 'email', 'number', 'date']).default('text').describe('Field type'),
    required: z.boolean().default(false).describe('Whether field is required'),
  })).optional().describe('Custom fields for this badge'),
});

// API Response interfaces
interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

interface Badge {
  id: string;
  name: string;
}

interface IssuedBadge {
  success: boolean;
  IssueId: string;
  publicUrl: string;
}

interface CreatedBadge {
  success: boolean;
  badgeId: string;
  organizationId: string;
}

// API Client
class IssueBadgeClient {
  private client: AxiosInstance;

  constructor() {
    const baseURL = CONFIG.authMethod === 'oauth2' ? CONFIG.oauthUrl : CONFIG.baseUrl;
    const token = CONFIG.authMethod === 'oauth2' ? CONFIG.oauthToken : CONFIG.apiKey;

    if (!token) {
      throw new Error(`Missing ${CONFIG.authMethod === 'oauth2' ? 'OAuth token' : 'API key'}. Please check your environment configuration.`);
    }

    this.client = axios.create({
      baseURL,
      timeout: CONFIG.requestTimeout,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': `${CONFIG.serverName}/${CONFIG.serverVersion}`,
      },
    });

    // Add response interceptor for debugging and error handling
    this.client.interceptors.response.use(
      (response) => {
        if (CONFIG.debug) {
          console.error(`[DEBUG] ${response.config.method?.toUpperCase()} ${response.config.url} - ${response.status}`);
        }
        return response;
      },
      (error) => {
        if (CONFIG.debug) {
          console.error(`[DEBUG] ${error.config?.method?.toUpperCase()} ${error.config?.url} - ${error.response?.status || 'Network Error'}`);
          console.error(`[DEBUG] Error details:`, error.response?.data || error.message);
        }
        return Promise.reject(error);
      }
    );

    // Add request interceptor for retry logic
    this.client.interceptors.request.use((config) => {
      if (CONFIG.debug) {
        console.error(`[DEBUG] Making request to ${config.method?.toUpperCase()} ${config.url}`);
      }
      return config;
    });
  }

  async validateKey(apiKey: string): Promise<ApiResponse> {
    const response = await this.client.post('/validate-key', { api_key: apiKey });
    return response.data;
  }

  async getAllBadges(limit = 100): Promise<ApiResponse<Badge[]>> {
    const response = await this.client.get('/badge/getall', {
      params: { limit },
    });
    return response.data;
  }

  async issueBadge(data: z.infer<typeof IssueBadgeSchema>): Promise<IssuedBadge> {
    const response = await this.client.post('/issue/create', data);
    return response.data;
  }

  async createBadge(data: z.infer<typeof CreateBadgeSchema>): Promise<CreatedBadge> {
    const { badge_logo_path, ...badgeData } = data;
    
    if (badge_logo_path) {
      // Handle file upload
      const formData = new FormData();
      
      // Add file
      try {
        const fileBuffer = readFileSync(badge_logo_path);
        const fileName = badge_logo_path.split('/').pop() || 'badge_logo.png';
        formData.append('badge_logo', fileBuffer, {
          filename: fileName,
        });
      } catch (error) {
        throw new Error(`Failed to read badge logo file: ${error}`);
      }
      
      // Add other fields
      Object.entries(badgeData).forEach(([key, value]) => {
        if (value !== undefined) {
          if (key === 'custom_fields') {
            formData.append(key, JSON.stringify(value));
          } else {
            formData.append(key, String(value));
          }
        }
      });

      const response = await this.client.post('/badge/create', formData, {
        headers: {
          ...formData.getHeaders(),
        },
      });
      return response.data;
    } else {
      // JSON request without file
      const response = await this.client.post('/badge/create', badgeData);
      return response.data;
    }
  }
}

// Initialize client
let apiClient: IssueBadgeClient;

try {
  apiClient = new IssueBadgeClient();
} catch (error) {
  console.error('Failed to initialize IssueBadge client:', error);
  process.exit(1);
}

// Define tools
const tools: Tool[] = [
  {
    name: 'validate_key',
    description: 'Validate an IssueBadge API key for authentication. Use this to test if your API credentials are working correctly.',
    inputSchema: {
      type: 'object',
      properties: {
        api_key: {
          type: 'string',
          description: 'The API key to validate (usually starts with a number and pipe, e.g., "1|abc123...")',
        },
      },
      required: ['api_key'],
    },
  },
  {
    name: 'get_all_badges',
    description: 'Retrieve all available badges for the authenticated organization. Returns a list of badges with their IDs and names.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Maximum number of badges to return (default: 100, max: 100)',
          default: 100,
          minimum: 1,
          maximum: 100,
        },
      },
      required: [],
    },
  },
  {
    name: 'issue_badge',
    description: 'Issue a badge to a recipient. This creates a digital certificate and sends notification email with verification URL.',
    inputSchema: {
      type: 'object',
      properties: {
        badge_id: {
          type: 'string',
          description: 'Encrypted badge ID from badge creation (get this from get_all_badges or create_badge)',
        },
        name: {
          type: 'string',
          description: 'Recipient\'s full name (will appear on the certificate)',
        },
        email: {
          type: 'string',
          format: 'email',
          description: 'Recipient\'s email address (optional, but recommended for notifications)',
        },
        phone: {
          type: 'string',
          description: 'Recipient\'s phone number (optional)',
        },
        idempotency_key: {
          type: 'string',
          description: 'Unique key to prevent duplicate issuance (e.g., "issue_john_doe_2024_001")',
        },
        metadata: {
          type: 'object',
          description: 'Custom field values and additional metadata (e.g., completion_date, score, etc.)',
          additionalProperties: true,
        },
      },
      required: ['badge_id', 'name', 'idempotency_key'],
    },
  },
  {
    name: 'create_badge',
    description: 'Create a new badge template with optional custom fields and branding. This badge can then be issued to recipients.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Badge name (e.g., "Web Development Certificate")',
        },
        description: {
          type: 'string',
          description: 'Badge description (e.g., "Awarded for completing the full-stack web development course")',
        },
        issuing_organization_name: {
          type: 'string',
          description: 'Name of the issuing organization (e.g., "Tech Academy")',
        },
        idempotency_key: {
          type: 'string',
          description: 'Unique key to prevent duplicate badge creation (e.g., "badge_webdev_2024_001")',
        },
        nickname: {
          type: 'string',
          description: 'Optional badge nickname or short name',
        },
        left_panel_description: {
          type: 'string',
          description: 'Additional description for the left panel of the certificate',
        },
        organization_id: {
          type: 'string',
          description: 'Existing organization ID (optional, will create new organization if not provided)',
        },
        comment: {
          type: 'string',
          description: 'Additional comments or notes about the badge',
        },
        expire_date: {
          type: 'string',
          pattern: '^\\d{4}-\\d{2}-\\d{2}$',
          description: 'Badge expiration date in YYYY-MM-DD format (optional)',
        },
        badge_logo_path: {
          type: 'string',
          description: 'Path to badge logo file (jpeg,png,jpg,gif,svg, max 2MB)',
        },
        custom_fields: {
          type: 'array',
          description: 'Custom fields for this badge (e.g., completion date, score, instructor)',
          items: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Field name (e.g., "Completion Date")',
              },
              type: {
                type: 'string',
                enum: ['text', 'email', 'number', 'date'],
                description: 'Field type',
                default: 'text',
              },
              required: {
                type: 'boolean',
                description: 'Whether this field is required when issuing the badge',
                default: false,
              },
            },
            required: ['name'],
          },
        },
      },
      required: ['name', 'description', 'issuing_organization_name', 'idempotency_key'],
    },
  },
];

// Create and start server
const server = new Server(
  {
    name: CONFIG.serverName,
    version: CONFIG.serverVersion,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'validate_key': {
        const validatedArgs = ValidateKeySchema.parse(args);
        const result = await apiClient.validateKey(validatedArgs.api_key);
        return {
          content: [
            {
              type: 'text',
              text: `✅ API Key Validation Result:\n\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }

      case 'get_all_badges': {
        const validatedArgs = GetAllBadgesSchema.parse(args);
        const result = await apiClient.getAllBadges(validatedArgs.limit);
        
        if (result.success && result.data) {
          const badgeList = result.data.map((badge: Badge, index: number) => 
            `${index + 1}. ${badge.name} (ID: ${badge.id})`
          ).join('\n');
          
          return {
            content: [
              {
                type: 'text',
                text: `🏆 Available Badges (${result.data.length}):\n\n${badgeList}\n\n${JSON.stringify(result, null, 2)}`,
              },
            ],
          };
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `📋 Badge List Result:\n\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }

      case 'issue_badge': {
        const validatedArgs = IssueBadgeSchema.parse(args);
        const result = await apiClient.issueBadge(validatedArgs);
        
        if (result.success) {
          return {
            content: [
              {
                type: 'text',
                text: `🎉 Badge Issued Successfully!\n\n📧 Recipient: ${validatedArgs.name}\n🆔 Issue ID: ${result.IssueId}\n🔗 Verification URL: ${result.publicUrl}\n\n${JSON.stringify(result, null, 2)}`,
              },
            ],
          };
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `📜 Badge Issuance Result:\n\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }

      case 'create_badge': {
        const validatedArgs = CreateBadgeSchema.parse(args);
        const result = await apiClient.createBadge(validatedArgs);
        
        if (result.success) {
          return {
            content: [
              {
                type: 'text',
                text: `✨ Badge Created Successfully!\n\n🏷️ Badge Name: ${validatedArgs.name}\n🆔 Badge ID: ${result.badgeId}\n🏢 Organization ID: ${result.organizationId}\n\nYou can now issue this badge to recipients using the badge ID.\n\n${JSON.stringify(result, null, 2)}`,
              },
            ],
          };
        }
        
        return {
          content: [
            {
              type: 'text',
              text: `🎨 Badge Creation Result:\n\n${JSON.stringify(result, null, 2)}`,
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data?.message || error.message;
      const errorDetails = error.response?.data || {};
      const statusCode = error.response?.status || 'Unknown';
      
      return {
        content: [
          {
            type: 'text',
            text: `❌ API Error (${statusCode}): ${errorMessage}\n\n📋 Details:\n${JSON.stringify(errorDetails, null, 2)}\n\n💡 Tip: Check your API credentials and ensure the IssueBadge service is accessible.`,
          },
        ],
        isError: true,
      };
    }

    if (error instanceof z.ZodError) {
      const validationErrors = error.errors.map(err => 
        `- ${err.path.join('.')}: ${err.message}`
      ).join('\n');
      
      return {
        content: [
          {
            type: 'text',
            text: `⚠️ Validation Error:\n\n${validationErrors}\n\n💡 Please check the required parameters and their formats.`,
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: `💥 Unexpected Error: ${error instanceof Error ? error.message : String(error)}\n\n🔧 Please check your configuration and try again.`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  if (CONFIG.debug) {
    console.error(`[DEBUG] 🚀 ${CONFIG.serverName} v${CONFIG.serverVersion} started`);
    console.error(`[DEBUG] 🔐 Auth method: ${CONFIG.authMethod}`);
    console.error(`[DEBUG] 🌐 Base URL: ${CONFIG.authMethod === 'oauth2' ? CONFIG.oauthUrl : CONFIG.baseUrl}`);
    console.error(`[DEBUG] 🛠️ Available tools: validate_key, get_all_badges, issue_badge, create_badge`);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  console.error('\n👋 IssueBadge MCP Server shutting down...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('\n👋 IssueBadge MCP Server shutting down...');
  process.exit(0);
});

main().catch((error) => {
  console.error('💥 Server startup error:', error);
  process.exit(1);
});