// Global error handling middleware
const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Default error
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // SQL Server specific errors
  if (err.number) {
    switch (err.number) {
      case 2627: // Duplicate key
        statusCode = 400;
        message = 'Duplicate entry. This record already exists.';
        break;
      case 547: // Foreign key constraint
        statusCode = 400;
        message = 'Invalid reference. Related record not found.';
        break;
      default:
        message = 'Database error occurred';
    }
  }

  // Joi validation errors
  if (err.isJoi) {
    statusCode = 400;
    message = err.details[0].message;
  }
  
  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = errorHandler;