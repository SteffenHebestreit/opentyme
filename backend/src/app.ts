import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import setupRoutes from './routes';
import { logger } from './utils/logger';
import { sanitizeRequestBody } from './middleware/sanitize.middleware';
import { sessionConfig, isKeycloakConfigured, logKeycloakConfig } from './config/keycloak.config';
import { swaggerSpec } from './config/swagger.config';
import recurringExpenseScheduler from './services/financial/recurring-expense-scheduler.service';

// Load environment variables
dotenv.config();

const app: Express = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));

// Rate limiting - DISABLED for development
// Uncomment and configure in production if needed
// const limiter = rateLimit({
//   windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
//   max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '1000'),
// });
// app.use(limiter);

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Apply sanitization middleware to all incoming request bodies after body parsing
app.use(sanitizeRequestBody);

// Swagger API Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Project Tracking API Docs',
  customfavIcon: '/favicon.ico'
}));

// Swagger JSON endpoint
app.get('/api-docs.json', (req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Keycloak configuration check
// Session middleware is still needed for other purposes
if (isKeycloakConfigured()) {
  logger.info('[Keycloak] Keycloak is properly configured');
  logKeycloakConfig();
  
  app.use(sessionConfig);
  
  logger.info('[Keycloak] Session middleware initialized');
} else {
  logger.warn('[Keycloak] Keycloak is not properly configured. Authentication will not work!');
  logger.warn('[Keycloak] Please check your environment variables.');
}

// Setup routes
setupRoutes(app);

// Health check endpoints (both /health and /api/health for compatibility)
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    message: 'Welcome to Project Tracking API',
    version: '1.0.0',
    documentation: '/api-docs',
    health: '/api/health',
  });
});

// Error handling middleware - must be last
app.use((err: Error, req: Request, res: Response, next: Function) => {
  logger.error('Unhandled error:', { error: err.message, stack: err.stack, path: req.path });
  
  if (process.env.NODE_ENV === 'production') {
    // Don't expose error details in production
    return res.status(500).json({ 
      status: 'error',
      message: 'Something went wrong!'
    });
  }
  
  return res.status(500).json({
    status: 'error',
    message: err.message,
    stack: err.stack,
  });
});

export { app };