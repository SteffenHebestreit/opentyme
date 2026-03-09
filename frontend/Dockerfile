# Stage 1: Install Addons
FROM alpine:latest AS addon-installer

# Install required tools
RUN apk add --no-cache bash git jq

# Set working directory
WORKDIR /app

# Copy addon configuration and installation script
COPY addons.config.json ./
COPY scripts/install-addons.sh ./scripts/
COPY opentyme-addon-ai-analysis ./opentyme-addon-ai-analysis
COPY opentyme-addon-email-builder ./opentyme-addon-email-builder

# Make script executable
RUN chmod +x ./scripts/install-addons.sh

# Run addon installation using local sources (network not available at build time)
RUN mkdir -p frontend/src/plugins && \
    echo '{"addons":[{"name":"ai-expense-analysis","enabled":true,"source":{"type":"local","path":"./opentyme-addon-ai-analysis"}},{"name":"email-builder","enabled":true,"source":{"type":"local","path":"./opentyme-addon-email-builder"}}]}' > addons.build.json && \
    OPENTYME_ADDONS_CONFIG=addons.build.json ./scripts/install-addons.sh frontend || true

# Stage 2: Build the application
FROM node:20-alpine AS build

# Set working directory
WORKDIR /usr/src/app

# Copy package files
COPY frontend/package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY frontend/ .

# Copy installed plugins from addon-installer stage
COPY --from=addon-installer /app/frontend/src/plugins ./src/plugins

# Build the application
RUN npm run build

# Stage 3: Production environment
FROM nginx:1.27-alpine AS production

# Remove default Nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S frontend -u 1001

# Copy built application from build stage
COPY --from=build /usr/src/dist/frontend /usr/share/nginx/html

# Copy Nginx configuration
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

# Switch to non-root user
USER frontend

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:80/ || exit 1

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
