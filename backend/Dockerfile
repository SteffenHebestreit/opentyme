# Stage 1: Build the application
FROM node:24-alpine AS build

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including devDependencies like TypeScript)
RUN npm install

# Copy source code
COPY . .

# Compile TypeScript
RUN npm run build

# Stage 2: Production environment
FROM node:24-alpine AS production

# Install postgresql-client for backup/restore scripts and Docker CLI for MCP Gateway
RUN apk add --no-cache postgresql-client docker-cli

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./

# Install ALL dependencies including dev dependencies for testing
RUN npm install && npm cache clean --force

# Copy built application from build stage
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/node_modules ./node_modules

# Copy backup scripts
COPY scripts ./scripts
RUN chmod +x ./scripts/*.sh

# Copy source files and tests for development (needed for Jest testing)
COPY --from=build /usr/src/app/src /usr/src/app/src
COPY --from=build /usr/src/app/tests /usr/src/app/tests
COPY --from=build /usr/src/app/jest.config.js /usr/src/app/jest.config.js
COPY --from=build /usr/src/app/tsconfig.json /usr/src/app/tsconfig.json

# Create logs directory
RUN mkdir -p /usr/src/app/logs

# Create backups directory
RUN mkdir -p /usr/src/app/backups

# Copy any other necessary files
COPY ./.env.production* ./

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Start the application
CMD ["node", "dist/index.js"]
