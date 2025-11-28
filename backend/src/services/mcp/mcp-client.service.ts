/**
 * MCP (Model Context Protocol) Client Service
 * 
 * Communicates with Docker MCP Gateway via Streamable HTTP transport
 * The gateway runs on the host machine and aggregates all MCP servers
 * 
 * This allows AI-powered web research for financial analysis and tax law lookups.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { logger } from '../../utils/logger';

interface MCPTool {
  name: string;
  description: string;
  inputSchema: any;
  _serverName?: string;
  _originalName?: string;
}

/**
 * MCP Client Manager
 * Connects to Docker MCP Gateway running on host machine via HTTP
 */
export class MCPClientService {
  private gatewayClient: any = null;
  private isInitialized: boolean = false;
  private gatewayUrl: string;

  constructor() {
    // Gateway runs on host machine (Windows) at port 3100
    // @ts-ignore - process is available in Node.js runtime
    this.gatewayUrl = process.env.MCP_GATEWAY_URL || 'http://host.docker.internal:3100';
  }

  /**
   * Connect to Docker MCP Gateway
   * Uses Streamable HTTP transport to connect to gateway on host
   */
  async connectToGateway(): Promise<void> {
    if (this.gatewayClient) {
      logger.info('Already connected to MCP Gateway');
      return;
    }

    try {
      const client = new Client(
        {
          name: 'tyme-backend',
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      // Connect using Streamable HTTP transport
      const transport = new StreamableHTTPClientTransport(new URL(this.gatewayUrl));
      
      await client.connect(transport);
      this.gatewayClient = client;

      logger.info(`✓ Connected to MCP Gateway at ${this.gatewayUrl}`);
    } catch (error: any) {
      logger.error('Failed to connect to MCP Gateway:', error.message);
      throw error;
    }
  }

  /**
   * Get available tools from the MCP Gateway
   * Returns only DuckDuckGo web search and fetch tools
   */
  async getTools(serverName?: string): Promise<MCPTool[]> {
    if (!this.gatewayClient) {
      throw new Error('Not connected to MCP Gateway');
    }

    try {
      const response = await this.gatewayClient.listTools();
      
      // Filter to only allow DuckDuckGo web search and content fetching tools
      const allowedTools = [
        'search',           // DuckDuckGo search
        'fetch',            // Fetch content
        'fetch_content',    // Fetch content (alternative name)
        'duckduckgo_search',
        'web_search'
      ];
      
      const tools = response.tools
        .filter((tool: any) => {
          const toolName = tool.name.toLowerCase();
          // Exact match or starts with duckduckgo_
          return allowedTools.includes(toolName) || 
                 toolName.startsWith('duckduckgo_') ||
                 (toolName.includes('fetch') && toolName.includes('content'));
        })
        .map((tool: any) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          _originalName: tool.name,
        }));

      // Optionally filter by server name if provided
      if (serverName) {
        return tools.filter((tool: MCPTool) => 
          tool.name.toLowerCase().includes(serverName.toLowerCase())
        );
      }

      logger.info(`Filtered to ${tools.length} DuckDuckGo tool(s): ${tools.map((t: MCPTool) => t.name).join(', ')}`);
      return tools;
    } catch (error: any) {
      logger.error('Failed to get tools from MCP Gateway:', error.message);
      throw error;
    }
  }

  /**
   * Call a tool through the MCP Gateway
   * Only allows DuckDuckGo web search and fetch tools
   */
  async callTool(serverName: string, toolName: string, args: any): Promise<any> {
    if (!this.gatewayClient) {
      throw new Error('Not connected to MCP Gateway');
    }

    // Security: Validate that only DuckDuckGo web search and fetch tools can be called
    const allowedTools = [
      'search',
      'fetch',
      'fetch_content',
      'duckduckgo_search',
      'web_search'
    ];
    const toolNameLower = toolName.toLowerCase();
    const isAllowed = allowedTools.includes(toolNameLower) || 
                      toolNameLower.startsWith('duckduckgo_') ||
                      (toolNameLower.includes('fetch') && toolNameLower.includes('content'));
    
    if (!isAllowed) {
      logger.warn(`Blocked attempt to call unauthorized tool: ${toolName}`);
      throw new Error(`Tool ${toolName} is not allowed. Only DuckDuckGo search and fetch tools are permitted.`);
    }

    try {
      logger.info(`Calling MCP tool: ${toolName}`);
      logger.debug(`Tool arguments:`, args);

      const response = await this.gatewayClient.callTool({
        name: toolName,
        arguments: args,
      });

      logger.info(`MCP tool ${toolName} completed successfully`);
      return response;
    } catch (error: any) {
      logger.error(`Failed to call tool ${toolName}:`, error.message);
      throw error;
    }
  }

  /**
   * Initialize connection to Docker MCP Gateway
   * The gateway automatically discovers all MCP servers installed in Docker Desktop
   */
  async initializeConnections(): Promise<void> {
    if (this.isInitialized) {
      logger.info('MCP Gateway already initialized');
      return;
    }

    logger.info('Initializing MCP Gateway connection...');

    try {
      await this.connectToGateway();
      
      // List available tools to verify connection
      const tools = await this.getTools();
      logger.info(`✓ MCP Gateway initialized. Available tools: ${tools.length}`);
      
      // Log available tool names for debugging
      if (tools.length > 0) {
        const toolNames = tools.map(t => t.name).slice(0, 5);
        logger.debug(`Sample tools: ${toolNames.join(', ')}${tools.length > 5 ? '...' : ''}`);
      } else {
        logger.warn('⚠ No MCP tools available. Make sure MCP servers are installed in Docker Desktop.');
        logger.warn('  Install servers via: Docker Desktop > MCP Toolkit > Catalog');
      }

      this.isInitialized = true;
    } catch (error: any) {
      logger.error('❌ Failed to initialize MCP Gateway:', error.message);
      logger.warn('  Make sure Docker Desktop is running and MCP Toolkit is enabled');
      logger.warn('  You can verify with: docker mcp server list');
    }
  }

  /**
   * Disconnect from MCP Gateway
   */
  async disconnect(): Promise<void> {
    if (!this.gatewayClient) {
      return;
    }

    logger.info('Disconnecting from MCP Gateway...');

    try {
      await this.gatewayClient.close();
      this.gatewayClient = null;
      this.isInitialized = false;
      logger.info('✓ Disconnected from MCP Gateway');
    } catch (error: any) {
      logger.error('Error disconnecting from MCP Gateway:', error.message);
    }
  }

  /**
   * Check if connected to the gateway
   */
  isConnected(serverName?: string): boolean {
    return this.gatewayClient !== null && this.isInitialized;
  }

  /**
   * Get list of connected servers
   * Note: With the gateway, all installed servers are available
   */
  getConnectedServers(): string[] {
    if (!this.isInitialized) {
      return [];
    }
    return ['docker-mcp-gateway'];
  }

  /**
   * Health check for MCP Gateway
   */
  async healthCheck(): Promise<Record<string, { connected: boolean; toolCount?: number; error?: string }>> {
    const health: Record<string, { connected: boolean; toolCount?: number; error?: string }> = {};

    if (!this.gatewayClient) {
      health['docker-mcp-gateway'] = {
        connected: false,
        error: 'Not connected',
      };
      return health;
    }

    try {
      const tools = await this.getTools();
      health['docker-mcp-gateway'] = {
        connected: true,
        toolCount: tools.length,
      };
    } catch (error: any) {
      health['docker-mcp-gateway'] = {
        connected: false,
        error: error.message,
      };
    }

    return health;
  }
}

// Singleton instance
export const mcpClient = new MCPClientService();
