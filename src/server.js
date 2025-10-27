const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIO = require('socket.io');

require('dotenv').config();

const v1Routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const { generalLimiter, authLimiter } = require('./middleware/rateLimiter');
const { getPool } = require('./config/database');
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
    authentication: 'Bearer Token (JWT)'
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