const jwt = require('jsonwebtoken');
const { getPool, sql } = require('../config/database');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Not authorized to access this route'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token'
    });
  }
};

// Check if user has permission to access/edit shared note
const checkNotePermission = (requiredPermission = 'read') => {
  return async (req, res, next) => {
    try {
      const noteId = req.params.id;
      const userId = req.user.id;
      const pool = await getPool();

      // Check if user owns the note
      const ownerResult = await pool
        .request()
        .input('noteId', sql.Int, noteId)
        .input('userId', sql.Int, userId)
        .query('SELECT id FROM Notes WHERE id = @noteId AND user_id = @userId AND deleted_at IS NULL');

      if (ownerResult.recordset.length > 0) {
        req.isOwner = true;
        return next();
      }

      // Check if note is shared with user
      const shareResult = await pool
        .request()
        .input('noteId', sql.Int, noteId)
        .input('userId', sql.Int, userId)
        .query(`
          SELECT permission 
          FROM Shared_Notes 
          WHERE note_id = @noteId AND shared_with = @userId
        `);

      if (shareResult.recordset.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'You do not have permission to access this note'
        });
      }

      const userPermission = shareResult.recordset[0].permission;
      
      if (requiredPermission === 'edit' && userPermission === 'read') {
        return res.status(403).json({
          success: false,
          error: 'You only have read permission for this note'
        });
      }

      req.isOwner = false;
      req.permission = userPermission;
      next();
    } catch (err) {
      next(err);
    }
  };
};

// Admin only middleware
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin'  && req.user.role !== 'root-admin') {
    return res.status(403).json({
      success: false,
      error: 'Admin access required'
    });
  }
  next();
};

const rootAdminOnly = (req, res, next) => {
  if (req.user.role !== 'root-admin') {
    return res.status(403).json({
      success: false,
      error: 'Root admin access required'
    });
  }
  next();
};

module.exports = { protect, checkNotePermission, adminOnly , rootAdminOnly};