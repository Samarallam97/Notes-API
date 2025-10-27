const { getPool, sql } = require('../config/database');

// Get all templates (user's + public)
exports.getTemplates = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const pool = await getPool();

    const result = await pool
      .request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT id, name, description, title_template, content_template, 
               is_public, usage_count, created_at,
               CASE WHEN user_id = @userId THEN 1 ELSE 0 END as is_owner
        FROM Note_Templates
        WHERE user_id = @userId OR is_public = 1
        ORDER BY is_owner DESC, usage_count DESC, name
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

// Create template
exports.createTemplate = async (req, res, next) => {
  try {
    const { name, description, title_template, content_template, is_public } = req.body;
    const userId = req.user.id;
    const pool = await getPool();

    const result = await pool
      .request()
      .input('userId', sql.Int, userId)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || null)
      .input('titleTemplate', sql.NVarChar, title_template || null)
      .input('contentTemplate', sql.NVarChar, content_template || null)
      .input('isPublic', sql.Bit, is_public || false)
      .query(`
        INSERT INTO Note_Templates (user_id, name, description, title_template, content_template, is_public)
        OUTPUT INSERTED.*
        VALUES (@userId, @name, @description, @titleTemplate, @contentTemplate, @isPublic)
      `);

    res.status(201).json({
      success: true,
      data: result.recordset[0]
    });
  } catch (err) {
    next(err);
  }
};

// Create note from template
exports.useTemplate = async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const userId = req.user.id;
    const pool = await getPool();

    // Get template
    const templateResult = await pool
      .request()
      .input('templateId', sql.Int, templateId)
      .input('userId', sql.Int, userId)
      .query(`
        SELECT * FROM Note_Templates 
        WHERE id = @templateId AND (user_id = @userId OR is_public = 1)
      `);

    if (templateResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Template not found'
      });
    }

    const template = templateResult.recordset[0];

    // Create note from template
    const noteResult = await pool
      .request()
      .input('userId', sql.Int, userId)
      .input('title', sql.NVarChar, template.title_template || 'Untitled Note')
      .input('content', sql.NVarChar, template.content_template || '')
      .query(`
        INSERT INTO Notes (user_id, title, content)
        OUTPUT INSERTED.id, INSERTED.title, INSERTED.content, INSERTED.created_at, INSERTED.updated_at
        VALUES (@userId, @title, @content)
      `);

    // Increment usage count
    await pool
      .request()
      .input('templateId', sql.Int, templateId)
      .query('UPDATE Note_Templates SET usage_count = usage_count + 1 WHERE id = @templateId');

    res.status(201).json({
      success: true,
      data: noteResult.recordset[0]
    });
  } catch (err) {
    next(err);
  }
};

// Delete template
exports.deleteTemplate = async (req, res, next) => {
  try {
    const { templateId } = req.params;
    const userId = req.user.id;
    const pool = await getPool();

    const result = await pool
      .request()
      .input('templateId', sql.Int, templateId)
      .input('userId', sql.Int, userId)
      .query('DELETE FROM Note_Templates WHERE id = @templateId AND user_id = @userId');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        error: 'Template not found or you do not own it'
      });
    }

    res.json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (err) {
    next(err);
  }
};