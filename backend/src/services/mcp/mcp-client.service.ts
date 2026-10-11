/**
 * MCP (Model Context Protocol) Client Service
 * 
 * Communicates with Docker MCP Gateway via Streamable HTTP transport
 * The gateway runs on the host machine and aggregates all MCP servers
 * 
 * This allows AI-powered web research for financial analysis and tax law lookups.
 *
 * Optional: the gateway is only contacted when MCP_GATEWAY_URL is set. Without
 * it the AfA analysis runs without web research.
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

/** How long the startup connection attempt may take before it is abandoned. */
const CONNECT_TIMEOUT_MS = 10_000;

/**
 * MCP Client Manager
 * Connects to Docker MCP Gateway via HTTP
 */
export class MCPClientService {
  private gatewayClient: any = null;
  private isInitialized: boolean = false;
  private readonly gatewayUrl: string | null;

  constructor(gatewayUrl: string | undefined = process.env.MCP_GATEWAY_URL) {
    this.gatewayUrl = gatewayUrl?.trim() || null;
  }

  /** Whether a gateway URL is configured at all. */
  isConfigured(): boolean {
    return this.gatewayUrl !== null;
  }

  /**
   * Connect to Docker MCP Gateway
   * Uses Streamable HTTP transport to connect to the gateway
   */
  async connectToGateway(): Promise<void> {
    if (this.gatewayClient) {
      logger.info('Already connected to MCP Gateway');
      return;
    }
    if (!this.gatewayUrl) {
      throw new Error('MCP_GATEWAY_URL is not set');
    }

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

    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        client.connect(transport),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`no answer within ${CONNECT_TIMEOUT_MS / 1000} s`)),
            CONNECT_TIMEOUT_MS
          );
        }),
      ]);
    } catch (error) {
      await client.close().catch(() => undefined);
      throw error;
    } finally {
      if (timer) clearTimeout(timer);
    }

    this.gatewayClient = client;
    logger.info(`Connected to MCP Gateway at ${this.gatewayUrl}`);
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
   * Initialize connection to Docker MCP Gateway.
   * The gateway automatically discovers all MCP servers installed in Docker Desktop.
   *
   * Never throws. Skips (one info line) when MCP_GATEWAY_URL is not set.
   *
   * @returns true when connected, false when skipped or failed
   */
  async initializeConnections(): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }

    if (!this.gatewayUrl) {
      logger.info('MCP gateway not configured (MCP_GATEWAY_URL unset) — AI web research disabled');
      return false;
    }

    logger.info(`Connecting to MCP gateway at ${this.gatewayUrl}...`);

    try {
      await this.connectToGateway();
      
      // List available tools to verify connection
      const tools = await this.getTools();
      if (tools.length > 0) {
        logger.info(`MCP gateway connected. Web research tools: ${tools.map(t => t.name).join(', ')}`);
      } else {
        logger.warn('MCP gateway connected, but it offers no web search/fetch tools — AI web research disabled');
      }

      this.isInitialized = true;
      return true;
    } catch (error: any) {
      logger.warn(`MCP gateway unavailable (${error?.message}) — AI web research disabled`);
      if (this.gatewayClient) {
        await this.gatewayClient.close().catch(() => undefined);
        this.gatewayClient = null;
      }
      return false;
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
