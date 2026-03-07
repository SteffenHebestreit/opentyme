# Stage 1: Build the application
FROM node:24-alpine AS build

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY backend/package*.json ./

# Install ALL dependencies (including devDependencies like TypeScript)
RUN npm install

# Copy source code
COPY backend/src ./src
COPY backend/tests ./tests
COPY backend/scripts ./scripts
COPY backend/config ./config
COPY backend/migrations ./migrations
COPY backend/jest.config.js backend/tsconfig.json backend/nodemon.json ./

# Make scripts executable
RUN chmod +x ./scripts/*.sh || true

# Create plugins directory
RUN mkdir -p ./src/plugins

# Compile TypeScript
RUN npm run build

# Stage 2: Production environment
FROM node:24-alpine AS production

# Install required tools (including git and jq for runtime addon installation)
# aws-cli is required by backup.sh / restore.sh for S3 storage operations
RUN apk add --no-cache postgresql-client docker-cli bash git jq aws-cli

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY backend/package*.json ./

# Install ALL dependencies including dev dependencies for testing
RUN npm install && npm cache clean --force

# Copy built application from build stage
COPY --from=build /usr/src/app/dist ./dist
COPY --from=build /usr/src/app/node_modules ./node_modules

# Copy source files and tests for development (needed for Jest testing and hot reload)
COPY --from=build /usr/src/app/src ./src
COPY --from=build /usr/src/app/tests ./tests
COPY --from=build /usr/src/app/jest.config.js ./
COPY --from=build /usr/src/app/tsconfig.json ./
COPY --from=build /usr/src/app/nodemon.json ./

# Copy scripts
COPY --from=build /usr/src/app/scripts ./scripts

# Create directories
RUN mkdir -p /usr/src/app/logs /usr/src/app/backups /usr/src/app/src/plugins

# Copy addon configuration and scripts to /app-root for runtime installation
# Addons are cloned from GitHub at container startup by docker-entrypoint.sh
RUN mkdir -p /app-root/scripts
COPY addons.config.json /app-root/
COPY scripts/install-addons.sh /app-root/scripts/

# Copy entrypoint script
COPY backend/docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# Copy any environment files (optional — skip if none exist)
RUN echo "Note: production env files are injected at runtime via docker-compose"

# Expose port
EXPOSE 8000

# Use entrypoint script
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]

# Default command
CMD ["npm", "run", "dev"]
