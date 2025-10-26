const { getPool, sql } = require('../config/database');
const APIFeatures = require('../utils/apiFeatures');

// @desc    Get all notes with pagination, search, and filters
// @route   GET /api/notes
// @access  Private
exports.getNotes = async (req, res, next) => {
  try {
    const pool = await getPool();

    const features = new APIFeatures('n', req.query) // 'n' is the alias
      .search()
      .filter()
      .sort()
      .paginate();

    // *** NEW: Helper function to add all parameters ***
    const addAllParams = (request) => {
      // Add search param
      if (features.searchParam) {
        request.input('search', sql.NVarChar, features.searchParam);
      }
      // Add all filter params
      for (const [key, param] of Object.entries(features.filterParams)) {
        request.input(key, param.type, param.value);
      }
    };

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) as total
      FROM Notes n
      LEFT JOIN Categories c ON n.category_id = c.id
      WHERE n.user_id = @userId
      ${features.searchCondition}
      ${features.filterCondition}
    `;

    const countRequest = pool.request().input('userId', sql.Int, req.user.id);
    addAllParams(countRequest); // <-- Use helper
    
    const countResult = await countRequest.query(countQuery);
    const totalCount = countResult.recordset[0].total;

    // Get notes with tags and category
    const notesQuery = `
      SELECT 
        n.id, n.title, n.content, n.is_pinned,
        n.created_at, n.updated_at,
        c.id as category_id, c.name as category_name, c.color as category_color,
        (
          SELECT t.name
          FROM Note_Tags nt
          INNER JOIN Tags t ON nt.tag_id = t.id
          WHERE nt.note_id = n.id
          FOR JSON PATH
        ) as tags_json
      FROM Notes n
      LEFT JOIN Categories c ON n.category_id = c.id
      WHERE n.user_id = @userId
      ${features.searchCondition}
      ${features.filterCondition}
      ${features.sortSQL}
      ${features.pagination.sql}
    `;

    const notesRequest = pool.request().input('userId', sql.Int, req.user.id);
    addAllParams(notesRequest); // <-- Use helper
    
    const notesResult = await notesRequest.query(notesQuery);

    // Process results to include tags
    // THIS IS THE LINE THAT WAS FIXED
    const notes = notesResult.recordset.map(note => ({
      id: note.id,
      title: note.title,
      content: note.content,
      is_pinned: note.is_pinned,
      created_at: note.created_at,
      updated_at: note.updated_at,
      category: note.category_id ? {
        id: note.category_id,
        name: note.category_name,
        color: note.category_color
      } : null,
      tags: note.tags_json ? JSON.parse(note.tags_json).map(t => t.name) : []
    }));

    res.json({
      success: true,
      count: notes.length,
      pagination: features.getPaginationMeta(totalCount),
      data: notes
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
        SELECT 
          n.id, n.title, n.content, n.is_pinned,
          n.created_at, n.updated_at,
          c.id as category_id, c.name as category_name, c.color as category_color,
          (
            SELECT t.id, t.name
            FROM Note_Tags nt
            INNER JOIN Tags t ON nt.tag_id = t.id
            WHERE nt.note_id = n.id
            FOR JSON PATH
          ) as tags_json
        FROM Notes n
        LEFT JOIN Categories c ON n.category_id = c.id
        WHERE n.id = @id AND n.user_id = @userId
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Note not found'
      });
    }

    const note = result.recordset[0];
    res.json({
      success: true,
      data: {
        id: note.id,
        title: note.title,
        content: note.content,
        is_pinned: note.is_pinned,
        created_at: note.created_at,
        updated_at: note.updated_at,
        category: note.category_id ? {
          id: note.category_id,
          name: note.category_name,
          color: note.category_color
        } : null,
        tags: note.tags_json ? JSON.parse(note.tags_json) : []
      }
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
    const { title, content, category_id, is_pinned, tags } = req.body;
    const pool = await getPool();
    const transaction = pool.transaction();

    await transaction.begin();

    try {
      // Insert note
      const noteResult = await transaction
        .request()
        .input('userId', sql.Int, req.user.id)
        .input('title', sql.NVarChar, title)
        .input('content', sql.NVarChar, content || '')
        .input('categoryId', sql.Int, category_id || null)
        .input('isPinned', sql.Bit, is_pinned || false)
        .query(`
          INSERT INTO Notes (user_id, title, content, category_id, is_pinned)
          OUTPUT INSERTED.id, INSERTED.title, INSERTED.content, INSERTED.category_id, 
                 INSERTED.is_pinned, INSERTED.created_at, INSERTED.updated_at
          VALUES (@userId, @title, @content, @categoryId, @isPinned)
        `);

      const note = noteResult.recordset[0];

      // Handle tags if provided
      if (tags && tags.length > 0) {
        for (const tagName of tags) {
          // Get or create tag
          const tagResult = await transaction
            .request()
            .input('userId', sql.Int, req.user.id)
            .input('tagName', sql.NVarChar, tagName)
            .query(`
              MERGE Tags AS target
              USING (SELECT @userId as user_id, @tagName as name) AS source
              ON target.user_id = source.user_id AND target.name = source.name
              WHEN NOT MATCHED THEN
                INSERT (user_id, name) VALUES (source.user_id, source.name)
              OUTPUT INSERTED.id;
            `);

          const tagId = tagResult.recordset[0].id;

          // Link tag to note
          await transaction
            .request()
            .input('noteId', sql.Int, note.id)
            .input('tagId', sql.Int, tagId)
            .query('INSERT INTO Note_Tags (note_id, tag_id) VALUES (@noteId, @tagId)');
        }
      }

      await transaction.commit();

      res.status(201).json({
        success: true,
        data: {
          ...note,
          tags: tags || []
        }
      });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    next(err);
  }
};

// @desc    Update note
// @route   PUT /api/notes/:id
// @access  Private
exports.updateNote = async (req, res, next) => {
  try {
    const { title, content, category_id, is_pinned, tags } = req.body;
    const pool = await getPool();
    const transaction = pool.transaction();

    await transaction.begin();

    try {
      // Check ownership
      const checkResult = await transaction
        .request()
        .input('id', sql.Int, req.params.id)
        .input('userId', sql.Int, req.user.id)
        .query('SELECT id FROM Notes WHERE id = @id AND user_id = @userId');

      if (checkResult.recordset.length === 0) {
        await transaction.rollback();
        return res.status(404).json({
          success: false,
          error: 'Note not found'
        });
      }

      // Update note
      const noteResult = await transaction
        .request()
        .input('id', sql.Int, req.params.id)
        .input('title', sql.NVarChar, title)
        .input('content', sql.NVarChar, content || '')
        .input('categoryId', sql.Int, category_id || null)
        .input('isPinned', sql.Bit, is_pinned || false)
        .query(`
          UPDATE Notes
          SET title = @title, content = @content, category_id = @categoryId,
              is_pinned = @isPinned, updated_at = GETDATE()
          OUTPUT INSERTED.id, INSERTED.title, INSERTED.content, INSERTED.category_id,
                 INSERTED.is_pinned, INSERTED.created_at, INSERTED.updated_at
          WHERE id = @id
        `);

      const note = noteResult.recordset[0];

      // Update tags if provided
      if (tags !== undefined) {
        // Remove existing tags
        await transaction
          .request()
          .input('noteId', sql.Int, req.params.id)
          .query('DELETE FROM Note_Tags WHERE note_id = @noteId');

        // Add new tags
        if (tags.length > 0) {
          for (const tagName of tags) {
            const tagResult = await transaction
              .request()
              .input('userId', sql.Int, req.user.id)
              .input('tagName', sql.NVarChar, tagName)
              .query(`
                MERGE Tags AS target
                USING (SELECT @userId as user_id, @tagName as name) AS source
                ON target.user_id = source.user_id AND target.name = source.name
                WHEN NOT MATCHED THEN
                  INSERT (user_id, name) VALUES (source.user_id, source.name)
                OUTPUT INSERTED.id;
              `);

            const tagId = tagResult.recordset[0].id;

            await transaction
              .request()
              .input('noteId', sql.Int, req.params.id)
              .input('tagId', sql.Int, tagId)
              .query('INSERT INTO Note_Tags (note_id, tag_id) VALUES (@noteId, @tagId)');
          }
        }
      }

      await transaction.commit();

      res.json({
        success: true,
        data: {
          ...note,
          tags: tags || []
        }
      });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
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

// @desc    Get all tags for user
// @route   GET /api/notes/tags
// @access  Private
exports.getTags = async (req, res, next) => {
  try {
    const pool = await getPool();

    const result = await pool
      .request()
      .input('userId', sql.Int, req.user.id)
      .query(`
        SELECT t.id, t.name, COUNT(nt.note_id) as usage_count
        FROM Tags t
        LEFT JOIN Note_Tags nt ON t.id = nt.tag_id
        WHERE t.user_id = @userId
        GROUP BY t.id, t.name
        ORDER BY usage_count DESC, t.name
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

// @desc    Get notes statistics
// @route   GET /api/notes/stats
// @access  Private
exports.getStats = async (req, res, next) => {
  try {
    const pool = await getPool();

    const result = await pool
      .request()
      .input('userId', sql.Int, req.user.id)
      .query(`
        SELECT 
          COUNT(*) as total_notes,
          SUM(CASE WHEN is_pinned = 1 THEN 1 ELSE 0 END) as pinned_notes,
          COUNT(DISTINCT category_id) as categories_used,
          (SELECT COUNT(*) FROM Categories WHERE user_id = @userId) as total_categories,
          (SELECT COUNT(*) FROM Tags WHERE user_id = @userId) as total_tags
        FROM Notes
        WHERE user_id = @userId
      `);

    res.json({
      success: true,
      data: result.recordset[0]
    });
  } catch (err) {
    next(err);
  }
};