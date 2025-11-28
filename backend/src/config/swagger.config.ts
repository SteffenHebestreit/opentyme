import swaggerJsdoc from 'swagger-jsdoc';

const swaggerDefinition = {
  openapi: '3.0.0',
  info: {
    title: 'Project Tracking API',
    version: '1.0.0',
    description: `
      A comprehensive project tracking and time management API for freelancers and small businesses.
      
      ## Features
      - User authentication with Keycloak (OAuth 2.0)
      - Client management
      - Project tracking
      - Time entry logging
      - Invoice generation
      - Payment tracking
      - Multi-tenant architecture
      
      ## Authentication
      Most endpoints require authentication using Keycloak OAuth 2.0.
      Include the access token in the Authorization header:
      \`Authorization: Bearer <your_access_token>\`
    `,
    contact: {
      name: 'API Support',
      email: 'support@example.com'
    },
    license: {
      name: 'MIT',
      url: 'https://opensource.org/licenses/MIT'
    }
  },
  servers: [
    {
      url: 'http://localhost/api',
      description: 'Development server (Traefik proxy)'
    },
    {
      url: 'http://localhost:8000/api',
      description: 'Development server (Direct)'
    },
    {
      url: 'https://api.yourdomain.com/api',
      description: 'Production server'
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your Keycloak access token'
      },
      keycloakAuth: {
        type: 'oauth2',
        description: 'Keycloak OAuth 2.0 authentication',
        flows: {
          authorizationCode: {
            authorizationUrl: 'http://localhost/auth/realms/tyme/protocol/openid-connect/auth',
            tokenUrl: 'http://localhost/auth/realms/tyme/protocol/openid-connect/token',
            scopes: {
              openid: 'OpenID Connect scope',
              profile: 'User profile information',
              email: 'User email address'
            }
          }
        }
      }
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'string',
            description: 'Error message'
          },
          details: {
            type: 'object',
            description: 'Additional error details'
          },
          timestamp: {
            type: 'string',
            format: 'date-time',
            description: 'Error timestamp'
          },
          path: {
            type: 'string',
            description: 'Request path that caused the error'
          }
        }
      },
      Client: {
        type: 'object',
        required: ['id', 'user_id', 'name', 'status'],
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Unique client identifier'
          },
          user_id: {
            type: 'string',
            format: 'uuid',
            description: 'ID of the user who owns this client'
          },
          name: {
            type: 'string',
            description: 'Client name',
            example: 'Acme Corporation'
          },
          email: {
            type: 'string',
            format: 'email',
            nullable: true,
            description: 'Client email address',
            example: 'contact@acme.com'
          },
          phone: {
            type: 'string',
            nullable: true,
            description: 'Client phone number',
            example: '+1234567890'
          },
          address: {
            type: 'string',
            nullable: true,
            description: 'Client physical address'
          },
          notes: {
            type: 'string',
            nullable: true,
            description: 'Additional notes about the client'
          },
          status: {
            type: 'string',
            enum: ['active', 'inactive'],
            description: 'Client status',
            example: 'active'
          },
          created_at: {
            type: 'string',
            format: 'date-time',
            description: 'Client creation timestamp'
          },
          updated_at: {
            type: 'string',
            format: 'date-time',
            description: 'Last update timestamp'
          }
        }
      },
      CreateClientDto: {
        type: 'object',
        required: ['name'],
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 255,
            description: 'Client name',
            example: 'Acme Corporation'
          },
          email: {
            type: 'string',
            format: 'email',
            description: 'Client email address',
            example: 'contact@acme.com'
          },
          phone: {
            type: 'string',
            maxLength: 50,
            description: 'Client phone number',
            example: '+1234567890'
          },
          address: {
            type: 'string',
            maxLength: 1000,
            description: 'Client physical address'
          },
          notes: {
            type: 'string',
            description: 'Additional notes about the client'
          },
          status: {
            type: 'string',
            enum: ['active', 'inactive'],
            default: 'active',
            description: 'Client status'
          }
        }
      },
      UpdateClientDto: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 255,
            description: 'Client name'
          },
          email: {
            type: 'string',
            format: 'email',
            description: 'Client email address'
          },
          phone: {
            type: 'string',
            maxLength: 50,
            description: 'Client phone number'
          },
          address: {
            type: 'string',
            maxLength: 1000,
            description: 'Client physical address'
          },
          notes: {
            type: 'string',
            description: 'Additional notes about the client'
          },
          status: {
            type: 'string',
            enum: ['active', 'inactive'],
            description: 'Client status'
          }
        }
      },
      Project: {
        type: 'object',
        required: ['id', 'user_id', 'client_id', 'name', 'status'],
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Unique project identifier'
          },
          user_id: {
            type: 'string',
            format: 'uuid',
            description: 'ID of the user who owns this project'
          },
          client_id: {
            type: 'string',
            format: 'uuid',
            description: 'ID of the client this project belongs to'
          },
          name: {
            type: 'string',
            description: 'Project name',
            example: 'Website Redesign'
          },
          description: {
            type: 'string',
            nullable: true,
            description: 'Project description'
          },
          status: {
            type: 'string',
            enum: ['active', 'completed', 'on_hold', 'cancelled'],
            description: 'Project status',
            example: 'active'
          },
          start_date: {
            type: 'string',
            format: 'date',
            nullable: true,
            description: 'Project start date'
          },
          end_date: {
            type: 'string',
            format: 'date',
            nullable: true,
            description: 'Project end date'
          },
          hourly_rate: {
            type: 'number',
            format: 'decimal',
            nullable: true,
            description: 'Hourly rate for this project',
            example: 75.00
          },
          currency: {
            type: 'string',
            description: 'Currency code',
            example: 'USD',
            default: 'USD'
          },
          tags: {
            type: 'array',
            items: {
              type: 'string'
            },
            nullable: true,
            description: 'Project tags for categorization',
            example: ['web', 'design', 'frontend']
          },
          created_at: {
            type: 'string',
            format: 'date-time',
            description: 'Project creation timestamp'
          },
          updated_at: {
            type: 'string',
            format: 'date-time',
            description: 'Last update timestamp'
          }
        }
      },
      CreateProjectDto: {
        type: 'object',
        required: ['name', 'client_id'],
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 255,
            description: 'Project name',
            example: 'Website Redesign'
          },
          client_id: {
            type: 'string',
            format: 'uuid',
            description: 'ID of the client this project belongs to'
          },
          description: {
            type: 'string',
            description: 'Project description'
          },
          status: {
            type: 'string',
            enum: ['active', 'completed', 'on_hold', 'cancelled'],
            default: 'active',
            description: 'Project status'
          },
          start_date: {
            type: 'string',
            format: 'date',
            description: 'Project start date'
          },
          end_date: {
            type: 'string',
            format: 'date',
            description: 'Project end date'
          },
          hourly_rate: {
            type: 'number',
            format: 'decimal',
            description: 'Hourly rate for this project',
            example: 75.00
          },
          currency: {
            type: 'string',
            description: 'Currency code',
            example: 'USD',
            default: 'USD'
          },
          tags: {
            type: 'array',
            items: {
              type: 'string'
            },
            description: 'Project tags for categorization',
            example: ['web', 'design', 'frontend']
          }
        }
      },
      TimeEntry: {
        type: 'object',
        required: ['id', 'user_id', 'project_id', 'date_start'],
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Unique time entry identifier'
          },
          user_id: {
            type: 'string',
            format: 'uuid',
            description: 'ID of the user who created this entry'
          },
          project_id: {
            type: 'string',
            format: 'uuid',
            description: 'ID of the project this entry belongs to'
          },
          description: {
            type: 'string',
            nullable: true,
            description: 'Description of work performed',
            example: 'Implemented user authentication'
          },
          date_start: {
            type: 'string',
            format: 'date-time',
            description: 'Start time of the work session'
          },
          date_end: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'End time of the work session'
          },
          duration_hours: {
            type: 'number',
            format: 'decimal',
            nullable: true,
            description: 'Duration in hours',
            example: 2.5
          },
          is_billable: {
            type: 'boolean',
            default: true,
            description: 'Whether this entry is billable'
          },
          category: {
            type: 'string',
            nullable: true,
            description: 'Work category',
            example: 'Development'
          },
          tags: {
            type: 'array',
            items: {
              type: 'string'
            },
            nullable: true,
            description: 'Entry tags',
            example: ['backend', 'authentication']
          },
          created_at: {
            type: 'string',
            format: 'date-time',
            description: 'Entry creation timestamp'
          },
          updated_at: {
            type: 'string',
            format: 'date-time',
            description: 'Last update timestamp'
          }
        }
      },
      Invoice: {
        type: 'object',
        required: ['id', 'user_id', 'client_id', 'invoice_number', 'status', 'issue_date', 'due_date'],
        properties: {
          id: {
            type: 'string',
            format: 'uuid',
            description: 'Unique invoice identifier'
          },
          user_id: {
            type: 'string',
            format: 'uuid',
            description: 'ID of the user who created this invoice'
          },
          client_id: {
            type: 'string',
            format: 'uuid',
            description: 'ID of the client being invoiced'
          },
          project_id: {
            type: 'string',
            format: 'uuid',
            nullable: true,
            description: 'ID of the project this invoice is for'
          },
          invoice_number: {
            type: 'string',
            description: 'Unique invoice number',
            example: 'INV-2025-001'
          },
          status: {
            type: 'string',
            enum: ['draft', 'sent', 'paid', 'overdue', 'cancelled'],
            description: 'Invoice status',
            example: 'sent'
          },
          issue_date: {
            type: 'string',
            format: 'date',
            description: 'Invoice issue date'
          },
          due_date: {
            type: 'string',
            format: 'date',
            description: 'Invoice due date'
          },
          sub_total: {
            type: 'number',
            format: 'decimal',
            nullable: true,
            description: 'Subtotal amount',
            example: 1500.00
          },
          tax_rate: {
            type: 'number',
            format: 'decimal',
            default: 0.00,
            description: 'Tax rate percentage',
            example: 10.00
          },
          tax_amount: {
            type: 'number',
            format: 'decimal',
            default: 0.00,
            description: 'Tax amount',
            example: 150.00
          },
          total_amount: {
            type: 'number',
            format: 'decimal',
            nullable: true,
            description: 'Total amount including tax',
            example: 1650.00
          },
          currency: {
            type: 'string',
            description: 'Currency code',
            example: 'USD',
            default: 'USD'
          },
          notes: {
            type: 'string',
            nullable: true,
            description: 'Additional invoice notes'
          },
          created_at: {
            type: 'string',
            format: 'date-time',
            description: 'Invoice creation timestamp'
          },
          updated_at: {
            type: 'string',
            format: 'date-time',
            description: 'Last update timestamp'
          }
        }
      }
    },
    responses: {
      Unauthorized: {
        description: 'Unauthorized - Invalid or missing authentication token',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            },
            example: {
              error: 'Unauthorized',
              timestamp: '2025-10-11T10:00:00Z',
              path: '/api/clients'
            }
          }
        }
      },
      Forbidden: {
        description: 'Forbidden - Insufficient permissions',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            },
            example: {
              error: 'Forbidden',
              details: 'You do not have permission to access this resource',
              timestamp: '2025-10-11T10:00:00Z'
            }
          }
        }
      },
      NotFound: {
        description: 'Resource not found',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            },
            example: {
              error: 'Not found',
              details: 'The requested resource does not exist',
              timestamp: '2025-10-11T10:00:00Z'
            }
          }
        }
      },
      ValidationError: {
        description: 'Validation error - Invalid request data',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            },
            example: {
              error: 'Validation failed',
              details: {
                field: 'email',
                message: 'Invalid email format'
              },
              timestamp: '2025-10-11T10:00:00Z'
            }
          }
        }
      },
      ServerError: {
        description: 'Internal server error',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            },
            example: {
              error: 'Internal server error',
              timestamp: '2025-10-11T10:00:00Z'
            }
          }
        }
      }
    }
  },
  tags: [
    {
      name: 'Authentication',
      description: 'User authentication and authorization endpoints'
    },
    {
      name: 'Clients',
      description: 'Client management endpoints'
    },
    {
      name: 'Projects',
      description: 'Project management endpoints'
    },
    {
      name: 'Time Entries',
      description: 'Time tracking endpoints'
    },
    {
      name: 'Invoices',
      description: 'Invoice management endpoints'
    },
    {
      name: 'Payments',
      description: 'Payment tracking endpoints'
    },
    {
      name: 'System',
      description: 'System administration endpoints'
    }
  ]
};

const options: swaggerJsdoc.Options = {
  swaggerDefinition,
  apis: [
    './src/routes/**/*.ts',
    './src/controllers/**/*.ts',
    './src/models/**/*.ts'
  ]
};

export const swaggerSpec = swaggerJsdoc(options);
