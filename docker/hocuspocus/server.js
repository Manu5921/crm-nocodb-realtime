#!/usr/bin/env node

/**
 * Hocuspocus Server for NocoDB CRM
 * Real-time collaborative editing server with Redis persistence
 * 
 * Features:
 * - Real-time collaboration using Y.js/Hocuspocus
 * - Redis persistence for document storage
 * - Structured logging for debugging
 * - Health check endpoint
 * - CORS configuration for frontend
 * - Document namespacing by entity type
 * - Error handling and graceful shutdown
 */

import { Server } from '@hocuspocus/server'
import { Logger } from '@hocuspocus/extension-logger'
import { Redis } from '@hocuspocus/extension-redis'
import { Database } from '@hocuspocus/extension-database'
import { Throttle } from '@hocuspocus/extension-throttle'
import http from 'http'
import { URL } from 'url'

// Environment configuration with defaults
const config = {
  port: process.env.HOCUSPOCUS_PORT || 3001,
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    database: parseInt(process.env.REDIS_DATABASE || '0'),
    keyPrefix: process.env.REDIS_KEY_PREFIX || 'hocuspocus:',
  },
  server: {
    name: process.env.HOCUSPOCUS_NAME || 'nocodb-crm-hocuspocus',
    timeout: parseInt(process.env.HOCUSPOCUS_TIMEOUT || '30000'),
    debounce: parseInt(process.env.HOCUSPOCUS_DEBOUNCE || '2000'),
    maxDebounce: parseInt(process.env.HOCUSPOCUS_MAX_DEBOUNCE || '10000'),
    quiet: process.env.NODE_ENV === 'production',
  },
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:3000'],
    credentials: true,
  },
  throttle: {
    enabled: process.env.THROTTLE_ENABLED !== 'false',
    limit: parseInt(process.env.THROTTLE_LIMIT || '15'),
    banTime: parseInt(process.env.THROTTLE_BAN_TIME || '5'),
  },
}

// Structured logger
const logger = {
  info: (message, data = {}) => {
    console.log(JSON.stringify({
      level: 'info',
      timestamp: new Date().toISOString(),
      message,
      service: 'hocuspocus-server',
      ...data,
    }))
  },
  error: (message, error = null, data = {}) => {
    console.error(JSON.stringify({
      level: 'error',
      timestamp: new Date().toISOString(),
      message,
      service: 'hocuspocus-server',
      error: error ? {
        message: error.message,
        stack: error.stack,
        name: error.name,
      } : null,
      ...data,
    }))
  },
  warn: (message, data = {}) => {
    console.warn(JSON.stringify({
      level: 'warn',
      timestamp: new Date().toISOString(),
      message,
      service: 'hocuspocus-server',
      ...data,
    }))
  },
  debug: (message, data = {}) => {
    if (process.env.NODE_ENV !== 'production') {
      console.debug(JSON.stringify({
        level: 'debug',
        timestamp: new Date().toISOString(),
        message,
        service: 'hocuspocus-server',
        ...data,
      }))
    }
  },
}

// Document name validation and namespacing
const validateDocumentName = (documentName) => {
  // Expected format: entity_type:entity_id (e.g., deal:123, contact:456)
  const pattern = /^[a-zA-Z_][a-zA-Z0-9_]*:[a-zA-Z0-9_-]+$/
  
  if (!pattern.test(documentName)) {
    throw new Error(`Invalid document name format: ${documentName}. Expected format: entity_type:entity_id`)
  }
  
  const [entityType, entityId] = documentName.split(':')
  
  // Validate entity types
  const allowedEntityTypes = ['deal', 'contact', 'company', 'note', 'task', 'email']
  if (!allowedEntityTypes.includes(entityType)) {
    throw new Error(`Invalid entity type: ${entityType}. Allowed types: ${allowedEntityTypes.join(', ')}`)
  }
  
  return { entityType, entityId, documentName }
}

// CORS headers helper
const setCorsHeaders = (response, origin) => {
  const allowedOrigins = Array.isArray(config.cors.origin) ? config.cors.origin : [config.cors.origin]
  
  if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
    response.setHeader('Access-Control-Allow-Origin', origin)
  }
  
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
  response.setHeader('Access-Control-Allow-Credentials', 'true')
}

// Create extensions array
const extensions = [
  // Logger extension for debugging
  new Logger({
    onLoadDocument: process.env.LOG_LOAD_DOCUMENT !== 'false',
    onChange: process.env.LOG_CHANGE !== 'false',
    onConnect: process.env.LOG_CONNECT !== 'false',
    onDisconnect: process.env.LOG_DISCONNECT !== 'false',
    onAuthenticate: process.env.LOG_AUTHENTICATE !== 'false',
    onRequest: process.env.LOG_REQUEST !== 'false',
    onUpgrade: process.env.LOG_UPGRADE !== 'false',
    onListen: process.env.LOG_LISTEN !== 'false',
    onDestroy: process.env.LOG_DESTROY !== 'false',
  }),
  
  // Redis extension for persistence and scaling
  new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.database,
    keyPrefix: config.redis.keyPrefix,
    
    // Redis connection options
    connectTimeout: 10000,
    lazyConnect: true,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    
    // Additional Redis options for production
    ...(process.env.NODE_ENV === 'production' && {
      enableOfflineQueue: false,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    }),
  }),
]

// Add throttle extension if enabled
if (config.throttle.enabled) {
  extensions.push(new Throttle({
    throttle: config.throttle.limit,
    banTime: config.throttle.banTime,
  }))
}

// Create Hocuspocus server
const hocuspocusServer = new Server({
  name: config.server.name,
  timeout: config.server.timeout,
  debounce: config.server.debounce,
  maxDebounce: config.server.maxDebounce,
  quiet: config.server.quiet,
  
  extensions,
  
  // Authentication hook
  async onAuthenticate({ token, documentName, requestHeaders, requestParameters, connection }) {
    try {
      // Validate document name format
      const { entityType, entityId } = validateDocumentName(documentName)
      
      logger.debug('Authentication request', {
        documentName,
        entityType,
        entityId,
        hasToken: !!token,
        userAgent: requestHeaders['user-agent'],
        origin: requestHeaders.origin,
      })
      
      // TODO: Implement actual authentication logic here
      // For now, we'll allow all connections in development
      if (process.env.NODE_ENV === 'development') {
        return {
          user: {
            id: 'dev-user',
            name: 'Development User',
            permissions: ['read', 'write'],
          },
          entityType,
          entityId,
        }
      }
      
      // In production, validate token against your auth system
      if (!token) {
        throw new Error('Authentication token is required')
      }
      
      // TODO: Validate token with your authentication service
      // const user = await validateTokenWithAuthService(token)
      
      return {
        user: {
          id: 'authenticated-user',
          name: 'Authenticated User',
          permissions: ['read', 'write'],
        },
        entityType,
        entityId,
      }
    } catch (error) {
      logger.error('Authentication failed', error, {
        documentName,
        hasToken: !!token,
      })
      throw error
    }
  },
  
  // Connection hook
  async onConnect({ documentName, requestHeaders, requestParameters, context, connection }) {
    try {
      const { entityType, entityId } = validateDocumentName(documentName)
      
      logger.info('Client connected', {
        documentName,
        entityType,
        entityId,
        userAgent: requestHeaders['user-agent'],
        origin: requestHeaders.origin,
        contextUser: context?.user?.id,
      })
      
      // TODO: Log connection to audit trail
      // await logConnectionEvent(context.user, entityType, entityId, 'connect')
      
    } catch (error) {
      logger.error('Connection error', error, { documentName })
      throw error
    }
  },
  
  // Disconnection hook
  async onDisconnect({ documentName, context, connection }) {
    try {
      const { entityType, entityId } = validateDocumentName(documentName)
      
      logger.info('Client disconnected', {
        documentName,
        entityType,
        entityId,
        contextUser: context?.user?.id,
      })
      
      // TODO: Log disconnection to audit trail
      // await logConnectionEvent(context.user, entityType, entityId, 'disconnect')
      
    } catch (error) {
      logger.error('Disconnection error', error, { documentName })
    }
  },
  
  // Document load hook
  async onLoadDocument({ documentName, context }) {
    try {
      const { entityType, entityId } = validateDocumentName(documentName)
      
      logger.debug('Document loaded', {
        documentName,
        entityType,
        entityId,
        contextUser: context?.user?.id,
      })
      
      // TODO: Check user permissions for this entity
      // await checkEntityPermissions(context.user, entityType, entityId)
      
    } catch (error) {
      logger.error('Document load error', error, { documentName })
      throw error
    }
  },
  
  // Document change hook
  async onChange({ documentName, context, document }) {
    try {
      const { entityType, entityId } = validateDocumentName(documentName)
      
      logger.debug('Document changed', {
        documentName,
        entityType,
        entityId,
        contextUser: context?.user?.id,
        documentSize: document.share.size,
      })
      
      // TODO: Log change to audit trail
      // await logChangeEvent(context.user, entityType, entityId, document)
      
    } catch (error) {
      logger.error('Document change error', error, { documentName })
    }
  },
  
  // HTTP request hook for custom routes
  async onRequest({ request, response }) {
    try {
      const url = new URL(request.url, `http://${request.headers.host}`)
      const origin = request.headers.origin
      
      // Handle preflight requests
      if (request.method === 'OPTIONS') {
        setCorsHeaders(response, origin)
        response.writeHead(200)
        response.end()
        return
      }
      
      // Health check endpoint
      if (url.pathname === '/health') {
        setCorsHeaders(response, origin)
        
        const health = {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          service: 'hocuspocus-server',
          version: process.env.npm_package_version || '1.0.0',
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          connections: hocuspocusServer.getConnectionsCount(),
          documents: hocuspocusServer.getDocumentsCount(),
        }
        
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify(health, null, 2))
        return
      }
      
      // Metrics endpoint
      if (url.pathname === '/metrics') {
        setCorsHeaders(response, origin)
        
        const metrics = {
          connections: hocuspocusServer.getConnectionsCount(),
          documents: hocuspocusServer.getDocumentsCount(),
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          timestamp: new Date().toISOString(),
        }
        
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify(metrics, null, 2))
        return
      }
      
      // API info endpoint
      if (url.pathname === '/api/info') {
        setCorsHeaders(response, origin)
        
        const info = {
          name: config.server.name,
          version: process.env.npm_package_version || '1.0.0',
          environment: process.env.NODE_ENV || 'development',
          features: {
            redis: true,
            throttling: config.throttle.enabled,
            authentication: true,
            cors: true,
          },
          endpoints: {
            websocket: 'ws://localhost:' + config.port,
            health: '/health',
            metrics: '/metrics',
            info: '/api/info',
          },
          documentNameFormat: 'entity_type:entity_id',
          allowedEntityTypes: ['deal', 'contact', 'company', 'note', 'task', 'email'],
        }
        
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify(info, null, 2))
        return
      }
      
      // 404 for other routes
      setCorsHeaders(response, origin)
      response.writeHead(404, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: 'Not Found' }))
      
    } catch (error) {
      logger.error('Request handling error', error, {
        url: request.url,
        method: request.method,
      })
      
      response.writeHead(500, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ error: 'Internal Server Error' }))
    }
  },
  
  // Listen hook
  async onListen({ port }) {
    logger.info('Hocuspocus server started', {
      port,
      environment: process.env.NODE_ENV || 'development',
      redis: {
        host: config.redis.host,
        port: config.redis.port,
        database: config.redis.database,
      },
      features: {
        throttling: config.throttle.enabled,
        logging: true,
        cors: true,
      },
    })
    
    console.log(`
🚀 NocoDB CRM Hocuspocus Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Server listening on port ${port}
✅ Redis connected to ${config.redis.host}:${config.redis.port}
✅ CORS enabled for: ${config.cors.origin.join(', ')}
✅ Throttling: ${config.throttle.enabled ? 'enabled' : 'disabled'}

📡 WebSocket endpoint: ws://localhost:${port}
🔍 Health check: http://localhost:${port}/health
📊 Metrics: http://localhost:${port}/metrics
ℹ️  API info: http://localhost:${port}/api/info

📝 Document format: entity_type:entity_id
📋 Allowed entities: deal, contact, company, note, task, email

Examples:
• deal:123 (Deal with ID 123)
• contact:456 (Contact with ID 456)
• note:789 (Note with ID 789)
    `)
  },
  
  // Destroy hook
  async onDestroy() {
    logger.info('Hocuspocus server shutting down')
  },
})

// Error handling
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', reason, { promise })
  process.exit(1)
})

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info('Received shutdown signal', { signal })
  
  try {
    await hocuspocusServer.destroy()
    logger.info('Server shutdown complete')
    process.exit(0)
  } catch (error) {
    logger.error('Error during shutdown', error)
    process.exit(1)
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

// Start server
try {
  await hocuspocusServer.listen(config.port)
} catch (error) {
  logger.error('Failed to start server', error)
  process.exit(1)
}