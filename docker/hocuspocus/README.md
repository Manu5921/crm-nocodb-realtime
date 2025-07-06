# Hocuspocus Server for NocoDB CRM

Real-time collaborative editing server built with Hocuspocus and Y.js for NocoDB CRM.

## Features

- **Real-time Collaboration**: Multiple users can edit documents simultaneously
- **Redis Persistence**: Documents are persisted in Redis for scalability
- **Document Namespacing**: Organized by entity type (deal, contact, company, note, task, email)
- **Authentication**: Token-based authentication with user context
- **Throttling**: Protection against abuse with configurable limits
- **Health Monitoring**: Built-in health check and metrics endpoints
- **CORS Support**: Configurable CORS for frontend integration
- **Structured Logging**: JSON-formatted logs for production monitoring
- **Graceful Shutdown**: Proper cleanup on server termination

## Quick Start

### Using Docker Compose (Recommended)

1. **Clone and navigate to the directory**:
   ```bash
   cd /Users/manu/Documents/DEV/NocoDB/crm/docker/hocuspocus
   ```

2. **Copy environment configuration**:
   ```bash
   cp .env.example .env
   ```

3. **Start the services**:
   ```bash
   docker-compose up -d
   ```

4. **Verify the server is running**:
   ```bash
   curl http://localhost:3001/health
   ```

### Using Node.js Directly

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start Redis server**:
   ```bash
   # Using Docker
   docker run -d --name redis -p 6379:6379 redis:7-alpine
   
   # Or using local Redis installation
   redis-server
   ```

3. **Start the Hocuspocus server**:
   ```bash
   npm start
   ```

## API Endpoints

### WebSocket Connection
- **URL**: `ws://localhost:3001`
- **Document naming**: `entity_type:entity_id`
- **Example**: `deal:123`, `contact:456`

### HTTP Endpoints

#### Health Check
```bash
GET /health
```
Returns server health status and metrics.

#### Metrics
```bash
GET /metrics
```
Returns real-time server metrics.

#### API Info
```bash
GET /api/info
```
Returns server configuration and available endpoints.

## Document Naming Convention

Documents follow the format: `entity_type:entity_id`

**Allowed Entity Types**:
- `deal` - CRM deals/opportunities
- `contact` - Contact records
- `company` - Company records
- `note` - Notes and comments
- `task` - Tasks and to-dos
- `email` - Email records

**Examples**:
- `deal:123` - Deal with ID 123
- `contact:456` - Contact with ID 456
- `note:789` - Note with ID 789

## Frontend Integration

### Basic JavaScript Example

```javascript
import { HocuspocusProvider } from '@hocuspocus/provider'
import * as Y from 'yjs'

// Create a Y.js document
const ydoc = new Y.Doc()

// Connect to the Hocuspocus server
const provider = new HocuspocusProvider({
  url: 'ws://localhost:3001',
  name: 'deal:123', // Document name
  document: ydoc,
  token: 'your-auth-token', // Optional authentication token
})

// Get a shared type (e.g., for rich text editing)
const ytext = ydoc.getText('notes')

// Listen for changes
ytext.observe(event => {
  console.log('Document changed:', event)
})

// Make changes
ytext.insert(0, 'Hello, collaborative world!')
```

### With Tiptap Editor

```javascript
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import { HocuspocusProvider } from '@hocuspocus/provider'

const provider = new HocuspocusProvider({
  url: 'ws://localhost:3001',
  name: 'deal:123',
  token: 'your-auth-token',
})

const editor = new Editor({
  extensions: [
    StarterKit.configure({
      history: false, // Collaboration extension handles history
    }),
    Collaboration.configure({
      document: provider.document,
    }),
  ],
})
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HOCUSPOCUS_PORT` | `3001` | Server port |
| `HOCUSPOCUS_NAME` | `nocodb-crm-hocuspocus` | Server instance name |
| `REDIS_HOST` | `127.0.0.1` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_PASSWORD` | - | Redis password |
| `REDIS_DATABASE` | `0` | Redis database number |
| `REDIS_KEY_PREFIX` | `hocuspocus:` | Redis key prefix |
| `CORS_ORIGIN` | `http://localhost:3000` | Allowed CORS origins |
| `THROTTLE_ENABLED` | `true` | Enable connection throttling |
| `THROTTLE_LIMIT` | `15` | Max connections per IP per minute |
| `THROTTLE_BAN_TIME` | `5` | Ban time in minutes |
| `NODE_ENV` | `development` | Environment mode |

### Logging Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LOAD_DOCUMENT` | `true` | Log document load events |
| `LOG_CHANGE` | `true` | Log document changes |
| `LOG_CONNECT` | `true` | Log client connections |
| `LOG_DISCONNECT` | `true` | Log client disconnections |
| `LOG_AUTHENTICATE` | `true` | Log authentication attempts |
| `LOG_REQUEST` | `false` | Log HTTP requests |
| `LOG_UPGRADE` | `false` | Log WebSocket upgrades |

## Development

### Running in Development Mode

```bash
npm run dev
```

### Building Docker Image

```bash
docker build -t nocodb-crm-hocuspocus .
```

### Monitoring Logs

```bash
# Docker Compose
docker-compose logs -f hocuspocus

# Docker
docker logs -f nocodb-crm-hocuspocus

# Node.js
npm run dev
```

## Production Deployment

### Environment Setup

1. **Copy environment file**:
   ```bash
   cp .env.example .env
   ```

2. **Configure production settings**:
   ```bash
   # Edit .env file
   NODE_ENV=production
   REDIS_PASSWORD=your-secure-password
   CORS_ORIGIN=https://your-domain.com
   ```

3. **Deploy with Docker Compose**:
   ```bash
   docker-compose -f docker-compose.yml up -d
   ```

### Security Considerations

- **Authentication**: Implement proper token validation in the `onAuthenticate` hook
- **CORS**: Restrict CORS origins to your frontend domains
- **Redis**: Use password authentication for Redis
- **Throttling**: Enable throttling to prevent abuse
- **Monitoring**: Set up log aggregation and monitoring

### Scaling

For high-load scenarios:

1. **Multiple Server Instances**: Run multiple Hocuspocus servers
2. **Redis Clustering**: Use Redis Cluster for horizontal scaling
3. **Load Balancing**: Use a load balancer with sticky sessions
4. **Monitoring**: Monitor Redis memory usage and connection counts

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**:
   - Check Redis is running: `redis-cli ping`
   - Verify Redis host/port configuration
   - Check Redis password if using authentication

2. **WebSocket Connection Refused**:
   - Verify server is running: `curl http://localhost:3001/health`
   - Check CORS configuration
   - Ensure proper document naming format

3. **High Memory Usage**:
   - Monitor Redis memory: `redis-cli info memory`
   - Adjust Redis maxmemory settings
   - Check for memory leaks in extensions

### Debug Mode

Enable debug logging:
```bash
NODE_ENV=development npm start
```

### Health Check

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "service": "hocuspocus-server",
  "uptime": 120.5,
  "connections": 0,
  "documents": 0
}
```

## License

MIT License - see LICENSE file for details.