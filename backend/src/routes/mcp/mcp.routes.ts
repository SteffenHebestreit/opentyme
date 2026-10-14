import { Router, Request, Response } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { authenticateKeycloak, extractKeycloakUser } from '../../middleware/auth/keycloak.middleware';
import { createMcpServer } from '../../services/mcp/mcp-server.service';
import { logger } from '../../utils/logger';
import { publicBaseUrl } from '../../utils/public-url';

const router = Router();

// Every 401/403 here points OAuth clients to the protected-resource metadata.
router.use((req: Request, res: Response, next) => {
  res.locals.resourceMetadata = `${publicBaseUrl(req)}/.well-known/oauth-protected-resource/api/mcp`;
  next();
});
router.use(authenticateKeycloak);
router.use(extractKeycloakUser);

/**
 * POST /api/mcp — OpenTyme's MCP server (Streamable HTTP). Stateless: every
 * request gets its own server and transport, answers are plain JSON, so no
 * session affinity is needed. GET (server-sent notifications) and DELETE
 * (session end) have nothing to do in stateless mode and answer 405.
 * Requires an API token with the "mcp" capability (or a signed-in session).
 */
router.post('/', async (req: Request, res: Response) => {
  const server = createMcpServer({
    bearerToken: req.headers.authorization ?? '',
    roles: req.user?.roles ?? [],
    permissions: req.authContext?.method === 'pat' ? req.authContext.permissions : null,
    writesAllowed: !(req.authContext?.method === 'pat' && req.authContext.approvalMode === 'in_app'),
  });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => {
    void transport.close();
    void server.close();
  });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error: unknown) {
    logger.error(`[MCP] Request failed: ${error instanceof Error ? error.message : String(error)}`);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
    }
  }
});

router.all('/', (_req: Request, res: Response) => {
  res
    .status(405)
    .set('Allow', 'POST')
    .json({ jsonrpc: '2.0', error: { code: -32000, message: 'This MCP server is stateless: use POST.' }, id: null });
});

export default router;
