const mockConnect = jest.fn();
const mockListTools = jest.fn();
const mockClose = jest.fn();

jest.mock(
  '@modelcontextprotocol/sdk/client/index.js',
  () => ({
    Client: jest.fn().mockImplementation(() => ({
      connect: (...args: unknown[]) => mockConnect(...args),
      listTools: (...args: unknown[]) => mockListTools(...args),
      close: (...args: unknown[]) => mockClose(...args),
    })),
  })
);
jest.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: jest.fn(),
}));

import { MCPClientService } from '../../src/services/mcp/mcp-client.service';

describe('MCP gateway client', () => {
  beforeEach(() => {
    mockConnect.mockReset();
    mockListTools.mockReset();
    mockClose.mockReset().mockResolvedValue(undefined);
  });

  it('skips the gateway when MCP_GATEWAY_URL is not set', async () => {
    const client = new MCPClientService(undefined);
    await expect(client.initializeConnections()).resolves.toBe(false);
    expect(client.isConfigured()).toBe(false);
    expect(client.isConnected()).toBe(false);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('treats a blank MCP_GATEWAY_URL as unset', async () => {
    const client = new MCPClientService('   ');
    await expect(client.initializeConnections()).resolves.toBe(false);
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('returns false (and never throws) when the gateway is down', async () => {
    mockConnect.mockRejectedValue(new Error('fetch failed'));
    const client = new MCPClientService('http://gateway:3100');
    await expect(client.initializeConnections()).resolves.toBe(false);
    expect(client.isConnected()).toBe(false);
  });

  it('returns true when connected', async () => {
    mockConnect.mockResolvedValue(undefined);
    mockListTools.mockResolvedValue({ tools: [{ name: 'search' }, { name: 'docker_exec' }] });
    const client = new MCPClientService('http://gateway:3100');
    await expect(client.initializeConnections()).resolves.toBe(true);
    expect(client.isConnected()).toBe(true);
    // only the web research tools are exposed
    await expect(client.getTools()).resolves.toEqual([
      expect.objectContaining({ name: 'search' }),
    ]);
  });
});
