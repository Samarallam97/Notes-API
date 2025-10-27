const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');
const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

require('dotenv').config();

const v1Routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const { generalLimiter, authLimiter } = require('./middleware/rateLimiter');
const { getPool } = require('./config/database');
const swaggerSpec = require('./config/swagger');
const { setupNoteSocket } = require('./sockets/noteSocket');
const { initializeScheduler } = require('./jobs/scheduler');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Store io instance in app for access in controllers
app.set('io', io);

// Setup WebSocket
setupNoteSocket(io);


// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Apply rate limiting
app.use('/api/', generalLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

// Request logging
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// API Documentation endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'API Documentation',
    baseURL: `http://localhost:${process.env.PORT || 3000}/api`,
    authentication: 'Bearer Token (JWT)',
    endpoints: {
      auth: {
        register: 'POST /auth/register',
        login: 'POST /auth/login',
        getProfile: 'GET /auth/me'
      },
      notes: {
        getAll: 'GET /notes?page=1&limit=10&search=keyword&category_id=1&is_pinned=true&sort=title&order=asc',
        getOne: 'GET /notes/:id',
        create: 'POST /notes',
        update: 'PUT /notes/:id',
        delete: 'DELETE /notes/:id',
        getTags: 'GET /notes/tags',
        getStats: 'GET /notes/stats'
      },
      categories: {
        getAll: 'GET /categories',
        create: 'POST /categories',
        update: 'PUT /categories/:id',
        delete: 'DELETE /categories/:id'
      }
    },
    queryParameters: {
      pagination: {
        page: 'Page number (default: 1)',
        limit: 'Items per page (default: 10, max: 100)'
      },
      search: {
        search: 'Search in title and content'
      },
      filtering: {
        category_id: 'Filter by category ID',
        is_pinned: 'Filter by pinned status (true/false)',
        date_from: 'Filter from date (YYYY-MM-DD)',
        date_to: 'Filter to date (YYYY-MM-DD)'
      },
      sorting: {
        sort: 'Sort field (title, created_at, updated_at)',
        order: 'Sort order (asc, desc)'
      }
    }
  });
});


// Health check
app.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

app.use('/api', v1Routes);

// Error handler (must be last)
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await getPool();
    
     if (process.env.NODE_ENV !== 'test') {
      initializeScheduler();
    }

    server.listen(PORT, () => {
      console.log(`
╔══════════════════════════════════════════════════════════════╗
║       Server:        http://localhost:${PORT}                  
║       Environment:   ${process.env.NODE_ENV || 'development'}                         ║
╚══════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();