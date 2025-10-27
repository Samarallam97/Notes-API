const path = require('path');
const fs = require('fs');

// Validate file type
const isValidFileType = (mimetype) => {
  const allowedTypes = (process.env.ALLOWED_FILE_TYPES || '').split(',');
  return allowedTypes.includes(mimetype);
};

// Validate file size
const isValidFileSize = (size) => {
  const maxSize = parseInt(process.env.MAX_FILE_SIZE || '5242880'); // 5MB default
  return size <= maxSize;
};

// Get file extension from mimetype
const getExtensionFromMimeType = (mimetype) => {
  const mimeMap = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'application/pdf': '.pdf',
    'text/plain': '.txt',
    'application/msword': '.doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
    'application/vnd.ms-excel': '.xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx'
  };
  return mimeMap[mimetype] || '';
};

// Generate unique filename
const generateUniqueFilename = (originalname) => {
  const timestamp = Date.now();
  const randomString = Math.random().toString(36).substring(2, 15);
  const ext = path.extname(originalname);
  const nameWithoutExt = path.basename(originalname, ext);
  
  // Sanitize filename - remove special characters
  const sanitizedName = nameWithoutExt.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  
  return `${sanitizedName}_${timestamp}_${randomString}${ext}`;
};

// Format file size to human readable
const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

// Delete file from filesystem
const deleteFile = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error('Error deleting file:', err);
        reject(err);
      } else {
        console.log('✅ File deleted:', filePath);
        resolve();
      }
    });
  });
};

// Delete multiple files
const deleteFiles = async (filePaths) => {
  const deletePromises = filePaths.map(filePath => deleteFile(filePath));
  return Promise.allSettled(deletePromises);
};

// Check if file exists
const fileExists = (filePath) => {
  return fs.existsSync(filePath);
};

// Get file info
const getFileInfo = (filePath) => {
  try {
    const stats = fs.statSync(filePath);
    return {
      exists: true,
      size: stats.size,
      created: stats.birthtime,
      modified: stats.mtime,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory()
    };
  } catch (err) {
    return { exists: false };
  }
};

// Create upload directory if it doesn't exist
const ensureUploadDir = () => {
  const uploadDir = process.env.UPLOAD_PATH || './uploads';
  
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('✅ Upload directory created:', uploadDir);
  }
  
  // Create subdirectories for organization
  const subdirs = ['attachments', 'exports', 'temp'];
  subdirs.forEach(subdir => {
    const subdirPath = path.join(uploadDir, subdir);
    if (!fs.existsSync(subdirPath)) {
      fs.mkdirSync(subdirPath, { recursive: true });
    }
  });
};

// Clean up old temporary files (older than 24 hours)
const cleanupTempFiles = () => {
  const tempDir = path.join(process.env.UPLOAD_PATH || './uploads', 'temp');
  
  if (!fs.existsSync(tempDir)) return;
  
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  
  fs.readdir(tempDir, (err, files) => {
    if (err) {
      console.error('Error reading temp directory:', err);
      return;
    }
    
    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;
        
        if (now - stats.mtimeMs > maxAge) {
          fs.unlink(filePath, (err) => {
            if (!err) {
              console.log('🗑️ Cleaned up old temp file:', file);
            }
          });
        }
      });
    });
  });
};

// Validate uploaded file
const validateFile = (file) => {
  const errors = [];
  
  if (!file) {
    errors.push('No file provided');
    return { valid: false, errors };
  }
  
  if (!isValidFileType(file.mimetype)) {
    errors.push(`File type ${file.mimetype} is not allowed`);
  }
  
  if (!isValidFileSize(file.size)) {
    errors.push(`File size ${formatFileSize(file.size)} exceeds maximum allowed size`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

// Get safe download path (prevent directory traversal)
const getSafeDownloadPath = (filename) => {
  const uploadDir = process.env.UPLOAD_PATH || './uploads';
  const safeName = path.basename(filename); // Remove any directory components
  return path.join(uploadDir, 'attachments', safeName);
};

module.exports = {
  isValidFileType,
  isValidFileSize,
  getExtensionFromMimeType,
  generateUniqueFilename,
  formatFileSize,
  deleteFile,
  deleteFiles,
  fileExists,
  getFileInfo,
  ensureUploadDir,
  cleanupTempFiles,
  validateFile,
  getSafeDownloadPath
};