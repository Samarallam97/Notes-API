const { getPool, sql } = require('../config/database');

// @desc    Get all categories for user
// @route   GET /api/categories
// @access  Private
exports.getCategories = async (req, res, next) => {
  try {
    const pool = await getPool();

    const result = await pool
      .request()
      .input('userId', sql.Int, req.user.id)
      .query(`
        SELECT c.id, c.name, c.color, c.created_at,
               COUNT(n.id) as note_count
        FROM Categories c
        LEFT JOIN Notes n ON c.id = n.category_id
        WHERE c.user_id = @userId
        GROUP BY c.id, c.name, c.color, c.created_at
        ORDER BY c.name
      `);

    res.json({
      success: true,
      count: result.recordset.length,
      data: result.recordset
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create new category
// @route   POST /api/categories
// @access  Private
exports.createCategory = async (req, res, next) => {
  try {
    const { name, color } = req.body;
    const pool = await getPool();

    const result = await pool
      .request()
      .input('userId', sql.Int, req.user.id)
      .input('name', sql.NVarChar, name)
      .input('color', sql.NVarChar, color || '#3B82F6')
      .query(`
        INSERT INTO Categories (user_id, name, color)
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.color, INSERTED.created_at
        VALUES (@userId, @name, @color)
      `);

    res.status(201).json({
      success: true,
      data: result.recordset[0]
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update category
// @route   PUT /api/categories/:id
// @access  Private
exports.updateCategory = async (req, res, next) => {
  try {
    const { name, color } = req.body;
    const pool = await getPool();

    const checkResult = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .input('userId', sql.Int, req.user.id)
      .query('SELECT id FROM Categories WHERE id = @id AND user_id = @userId');

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .input('name', sql.NVarChar, name)
      .input('color', sql.NVarChar, color)
      .query(`
        UPDATE Categories
        SET name = @name, color = @color
        OUTPUT INSERTED.id, INSERTED.name, INSERTED.color, INSERTED.created_at
        WHERE id = @id
      `);

    res.json({
      success: true,
      data: result.recordset[0]
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Delete category
// @route   DELETE /api/categories/:id
// @access  Private
exports.deleteCategory = async (req, res, next) => {
  try {
    const pool = await getPool();

    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .input('userId', sql.Int, req.user.id)
      .query('DELETE FROM Categories WHERE id = @id AND user_id = @userId');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        error: 'Category not found'
      });
    }

    res.json({
      success: true,
      data: {}
    });
  } catch (err) {
    next(err);
  }
};