# Build Stage
FROM node:22-alpine as build

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (deterministic)
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build args for environment variables
ARG VITE_SUPABASE_URL=https://placeholder.supabase.co
ARG VITE_SUPABASE_ANON_KEY=placeholder-anon-key
ARG VITE_APP_NAME=Wallet
ARG VITE_APP_URL=https://wallet.cortexx.online
ARG VITE_APP_ENVIRONMENT=production
ARG VITE_ENABLE_ANALYTICS=false
ARG VITE_ENABLE_DEBUG_LOGS=false

# Set environment variables for build
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_APP_NAME=$VITE_APP_NAME
ENV VITE_APP_URL=$VITE_APP_URL
ENV VITE_APP_ENVIRONMENT=$VITE_APP_ENVIRONMENT
ENV VITE_ENABLE_ANALYTICS=$VITE_ENABLE_ANALYTICS
ENV VITE_ENABLE_DEBUG_LOGS=$VITE_ENABLE_DEBUG_LOGS

# Build the application
RUN npm run build

# Production Stage
FROM nginx:alpine

# Copy built assets from build stage
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Add labels for Docker Hub
LABEL maintainer="Cortexx"
LABEL description="Wallet - Consultoria Financeira Inteligente"

EXPOSE 80

# Native healthcheck using wget in Alpine
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
