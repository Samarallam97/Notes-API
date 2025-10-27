const fs = require('fs');

const errorHandler = (err, req, res, next) => {
 console.error('Error:', err);

 // Run this first to clean up files from multer on ANY error
 if (req.files && req.files.length > 0) {
  console.log('Error detected. Deleting uploaded files...');
  for (const file of req.files) {
   try {
    // Use unlinkSync for simple, synchronous deletion in an error handler
    fs.unlinkSync(file.path); 
    console.log(`Successfully deleted orphan file: ${file.path}`);
   } catch (unlinkErr) {
    console.error(`Failed to delete orphan file ${file.path}:`, unlinkErr);
   }
  }
 }

 let statusCode = err.statusCode || 500;
 let message = err.message || 'Internal Server Error';
  let formattedDetails = null; // <-- To hold our clean details

 // SQL Server errors
 if (err.number) {
  switch (err.number) {
   case 2627:
    statusCode = 400;
    message = 'Duplicate entry. This record already exists.';
    break;
   case 547:
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
  message = 'Validation failed'; 
  
    formattedDetails = err.details.map(detail => ({
   field: detail.path.join('.'),
   message: detail.message
  }));
 }

 // Multer file upload errors
 if (err.code === 'LIMIT_FILE_SIZE') {
  statusCode = 400;
  message = 'File too large. Maximum size is 5MB.';
 }

 // JWT errors
 if (err.name === 'JsonWebTokenError') {
  statusCode = 401;
  message = 'Invalid token';
 }

 if (err.name === 'TokenExpiredError') {
  statusCode = 401;
  message = 'Token expired';
 }

 res.status(statusCode).json({
  success: false,
  error: message,
    
  ...(formattedDetails ? { details: formattedDetails } : (
      process.env.NODE_ENV === 'development' && { 
     stack: err.stack,
     details: err.details 
    }
    ))
 });
};

module.exports = errorHandler;