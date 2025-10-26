const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const notesRoutes = require('./routes/notesRoutes');
const categoriesRoutes = require('./routes/categoriesRoutes');
const errorHandler = require('./middleware/errorHandler');
const { getPool } = require('./config/database');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Routes
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Notes API v2.0 - Advanced Features Edition',
    version: '2.0.0',
    documentation: '/api/docs',
    endpoints: {
      auth: '/api/auth',
      notes: '/api/notes',
      categories: '/api/categories'
    },
    features: [
      'Search & Filtering',
      'Pagination',
      'Categories & Tags',
      'Advanced Validation',
      'Performance Optimization'
    ]
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/categories', categoriesRoutes);

// API Documentation endpoint
app.get('/api/docs', (req, res) => {
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

// Error handler (must be last)
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    await getPool();
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📝 Environment: ${process.env.NODE_ENV}`);
      console.log(`📚 API Documentation: http://localhost:${PORT}/api/docs`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();