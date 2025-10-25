const { getPool, sql } = require('../config/database');

// @desc    Get all notes for logged in user
// @route   GET /api/notes
// @access  Private
exports.getNotes = async (req, res, next) => {
  try {
    const pool = await getPool();

    const result = await pool
      .request()
      .input('userId', sql.Int, req.user.id)
      .query(`
        SELECT id, title, content, created_at, updated_at
        FROM Notes
        WHERE user_id = @userId
        ORDER BY updated_at DESC
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

// @desc    Get single note
// @route   GET /api/notes/:id
// @access  Private
exports.getNote = async (req, res, next) => {
  try {
    const pool = await getPool();

    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .input('userId', sql.Int, req.user.id)
      .query(`
        SELECT id, title, content, created_at, updated_at
        FROM Notes
        WHERE id = @id AND user_id = @userId
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Note not found'
      });
    }

    res.json({
      success: true,
      data: result.recordset[0]
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Create new note
// @route   POST /api/notes
// @access  Private
exports.createNote = async (req, res, next) => {
  try {
    const { title, content } = req.body;
    const pool = await getPool();

    const result = await pool
      .request()
      .input('userId', sql.Int, req.user.id)
      .input('title', sql.NVarChar, title)
      .input('content', sql.NVarChar, content || '')
      .query(`
        INSERT INTO Notes (user_id, title, content)
        OUTPUT INSERTED.id, INSERTED.title, INSERTED.content, INSERTED.created_at, INSERTED.updated_at
        VALUES (@userId, @title, @content)
      `);

    res.status(201).json({
      success: true,
      data: result.recordset[0]
    });
  } catch (err) {
    next(err);
  }
};

// @desc    Update note
// @route   PUT /api/notes/:id
// @access  Private
exports.updateNote = async (req, res, next) => {
  try {
    const { title, content } = req.body;
    const pool = await getPool();

    // First check if note exists and belongs to user
    const checkResult = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .input('userId', sql.Int, req.user.id)
      .query('SELECT id FROM Notes WHERE id = @id AND user_id = @userId');

    if (checkResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Note not found'
      });
    }

    // Update the note
    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .input('title', sql.NVarChar, title)
      .input('content', sql.NVarChar, content || '')
      .query(`
        UPDATE Notes
        SET title = @title, content = @content, updated_at = GETDATE()
        OUTPUT INSERTED.id, INSERTED.title, INSERTED.content, INSERTED.created_at, INSERTED.updated_at
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

// @desc    Delete note
// @route   DELETE /api/notes/:id
// @access  Private
exports.deleteNote = async (req, res, next) => {
  try {
    const pool = await getPool();

    const result = await pool
      .request()
      .input('id', sql.Int, req.params.id)
      .input('userId', sql.Int, req.user.id)
      .query('DELETE FROM Notes WHERE id = @id AND user_id = @userId');

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        error: 'Note not found'
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