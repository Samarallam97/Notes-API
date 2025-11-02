const { getPool, sql } = require('../config/database');
const { sendNoteSharedEmail } = require('../jobs/emailNotification');
const { emitNotification } = require('../sockets/noteSocket');

// Share a note with another user
exports.shareNote = async (req, res, next) => {
  try {
    const { email, permission } = req.body;
    const noteId = req.params.id;
    const userId = req.user.id;
    const pool = await getPool();

    // Get recipient user
    const userResult = await pool
      .request()
      .input('email', sql.NVarChar, email)
      .query('SELECT id, username, email FROM Users WHERE email = @email');

    if (userResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found with that email'
      });
    }

    const recipient = userResult.recordset[0];

    if (recipient.id === userId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot share note with yourself'
      });
    }

    // Verify note ownership
    const noteResult = await pool
      .request()
      .input('noteId', sql.Int, noteId)
      .input('userId', sql.Int, userId)
      .query('SELECT id, title, user_id FROM Notes WHERE id = @noteId AND user_id = @userId AND deleted_at IS NULL');

    if (noteResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Note not found or you do not own this note'
      });
    }

    const note = noteResult.recordset[0];

    // Share the note
    const shareResult = await pool
      .request()
      .input('noteId', sql.Int, noteId)
      .input('sharedBy', sql.Int, userId)
      .input('sharedWith', sql.Int, recipient.id)
      .input('permission', sql.NVarChar, permission)
      .query(`
        MERGE Shared_Notes AS target
        USING (SELECT @noteId as note_id, @sharedWith as shared_with) AS source
        ON target.note_id = source.note_id AND target.shared_with = source.shared_with
        WHEN MATCHED THEN
          UPDATE SET permission = @permission
        WHEN NOT MATCHED THEN
          INSERT (note_id, shared_by, shared_with, permission)
          VALUES (@noteId, @sharedBy, @sharedWith, @permission)
        OUTPUT INSERTED.id, INSERTED.permission, INSERTED.created_at;
      `);

    // Send email notification (background job)
    console.log(userId);
    
    sendNoteSharedEmail(recipient.email, userId || req.user.email, note.title)
      .catch(err => console.error('Email notification failed:', err));

    // Send real-time notification via WebSocket
    if (req.app.get('io')) {
      emitNotification(req.app.get('io'), recipient.id, {
        type: 'note_shared',
        message: `user with id : ${userId} shared a note with you: ${note.title}`,
        noteId: noteId,
        timestamp: new Date()
      });
    }

    res.status(201).json({
      success: true,
      message: 'Note shared successfully',
      data: {
        sharedWith: {
          id: recipient.id,
          username: recipient.username,
          email: recipient.email
        },
        permission: permission,
        noteTitle: note.title
      }
    });
  } catch (err) {
    next(err);
  }
};

// Get all users a note is shared with
exports.getSharedUsers = async (req, res, next) => {
  try {
    const noteId = req.params.id;
    const userId = req.user.id;
    const pool = await getPool();

    // Verify ownership
    const noteResult = await pool
      .request()
      .input('noteId', sql.Int, noteId)
      .input('userId', sql.Int, userId)
      .query('SELECT id FROM Notes WHERE id = @noteId AND user_id = @userId');

    if (noteResult.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Note not found or you do not own this note'
      });
    }

    // Get shared users
    const result = await pool
      .request()
      .input('noteId', sql.Int, noteId)
      .query(`
        SELECT 
          sn.id, sn.permission, sn.created_at,
          u.id as user_id, u.username, u.email
        FROM Shared_Notes sn
        INNER JOIN Users u ON sn.shared_with = u.id
        WHERE sn.note_id = @noteId
        ORDER BY sn.created_at DESC
      `);

    res.json({
      success: true,
      count: result.recordset.length,
      data: result.recordset.map(row => ({
        shareId: row.id,
        user: {
          id: row.user_id,
          username: row.username,
          email: row.email
        },
        permission: row.permission,
        sharedAt: row.created_at
      }))
    });
  } catch (err) {
    next(err);
  }
};

// Get notes shared with me
exports.getSharedWithMe = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const pool = await getPool();

    const result = await pool
      .request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          n.id, n.title, n.content, n.is_pinned, n.created_at, n.updated_at,
          sn.permission,
          u.id as owner_id, u.username as owner_username,
          c.id as category_id, c.name as category_name, c.color as category_color
        FROM Shared_Notes sn
        INNER JOIN Notes n ON sn.note_id = n.id
        INNER JOIN Users u ON n.user_id = u.id
        LEFT JOIN Categories c ON n.category_id = c.id
        WHERE sn.shared_with = @userId AND n.deleted_at IS NULL
        ORDER BY n.updated_at DESC
      `);

    res.json({
      success: true,
      count: result.recordset.length,
      data: result.recordset.map(row => ({
        id: row.id,
        title: row.title,
        content: row.content,
        is_pinned: row.is_pinned,
        created_at: row.created_at,
        updated_at: row.updated_at,
        permission: row.permission,
        owner: {
          id: row.owner_id,
          username: row.owner_username
        },
        category: row.category_id ? {
          id: row.category_id,
          name: row.category_name,
          color: row.category_color
        } : null
      }))
    });
  } catch (err) {
    next(err);
  }
};

// Revoke share access
exports.revokeShare = async (req, res, next) => {
  try {
    const { shareId } = req.params;
    const userId = req.user.id;
    const pool = await getPool();

    // Verify ownership and delete
    const result = await pool
      .request()
      .input('shareId', sql.Int, shareId)
      .input('userId', sql.Int, userId)
      .query(`
        DELETE FROM Shared_Notes
        WHERE id = @shareId 
        AND note_id IN (SELECT id FROM Notes WHERE user_id = @userId)
      `);

    if (result.rowsAffected[0] === 0) {
      return res.status(404).json({
        success: false,
        error: 'Share not found or you do not have permission'
      });
    }

    res.json({
      success: true,
      message: 'Share access revoked successfully'
    });
  } catch (err) {
    next(err);
  }
};