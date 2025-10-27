const { getPool, sql } = require('../config/database');

// Middleware to exclude soft-deleted items
const excludeDeleted = (req, res, next) => {
  req.includeDeleted = req.query.include_deleted === 'true' && req.user?.role === 'admin';
  next();
};

// Helper function to soft delete
const softDelete = async (tableName, id, userId) => {
  const pool = await getPool();
  
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .input('userId', sql.Int, userId)
    .query(`
      UPDATE ${tableName}
      SET deleted_at = GETDATE(), deleted_by = @userId
      WHERE id = @id AND user_id = @userId AND deleted_at IS NULL
    `);

  return result.rowsAffected[0] > 0;
};

// Helper function to restore
const restore = async (tableName, id, userId) => {
  const pool = await getPool();
  
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .input('userId', sql.Int, userId)
    .query(`
      UPDATE ${tableName}
      SET deleted_at = NULL, deleted_by = NULL
      WHERE id = @id AND user_id = @userId AND deleted_at IS NOT NULL
    `);

  return result.rowsAffected[0] > 0;
};

// Helper function to permanently delete
const permanentDelete = async (tableName, id, userId) => {
  const pool = await getPool();
  
  const result = await pool
    .request()
    .input('id', sql.Int, id)
    .input('userId', sql.Int, userId)
    .query(`
      DELETE FROM ${tableName}
      WHERE id = @id AND user_id = @userId AND deleted_at IS NOT NULL
    `);

  return result.rowsAffected[0] > 0;
};

module.exports = { excludeDeleted, softDelete, restore, permanentDelete };