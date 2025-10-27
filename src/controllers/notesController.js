const { getPool, sql } = require('../config/database');
const APIFeatures = require('../utils/apiFeatures');
const { clearUserCache } = require('../middleware/cache');
const { softDelete, restore, permanentDelete } = require('../middleware/softDelete');
const { emitNoteUpdate } = require('../sockets/noteSocket');
const fs = require('fs');
const path = require('path');

// Get all notes (exclude soft-deleted by default)
exports.getNotes = async (req, res, next) => {
 try {
  const pool = await getPool();
  const features = new APIFeatures('n', req.query)
   .search()
   .filter()
   .sort()
   .paginate();

  const deletedCondition = req.includeDeleted ? '' : 'AND n.deleted_at IS NULL';

  const addInputs = (request) => {
   request.input('userId', sql.Int, req.user.id);

   if (features.searchParam) {
    request.input('search', sql.NVarChar, features.searchParam);
   }
   
   if (req.query.category_id) {
    request.input('filter_category_id', sql.Int, req.query.category_id);
   }

   if (req.query.is_pinned !== undefined) {
    const isPinnedValue = req.query.is_pinned === 'true' ? 1 : 0;
    request.input('filter_is_pinned', sql.Bit, isPinnedValue);
   }

   if (req.query.date_from) {
    request.input('filter_date_from', sql.DateTime, new Date(req.query.date_from));
   }
   
   if (req.query.date_to) {
    request.input('filter_date_to', sql.DateTime, new Date(req.query.date_to));
   }
  };

  const countQuery = `
   SELECT COUNT(*) as total
   FROM Notes n
   WHERE n.user_id = @userId
   ${features.searchCondition}
   ${features.filterCondition}
   ${deletedCondition}
  `;

  const countRequest = pool.request();
  addInputs(countRequest);

  const countResult = await countRequest.query(countQuery);
  const totalCount = countResult.recordset[0].total;

  const notesQuery = `
   SELECT 
    n.id, n.title, n.content, n.is_pinned,
    n.created_at, n.updated_at, n.deleted_at,
    c.id as category_id, c.name as category_name, c.color as category_color,
    (SELECT COUNT(*) FROM Attachments WHERE note_id = n.id) as attachment_count,
    (SELECT t.name FROM Note_Tags nt
    INNER JOIN Tags t ON nt.tag_id = t.id
    WHERE nt.note_id = n.id
    FOR JSON PATH) as tags_json
   FROM Notes n
   LEFT JOIN Categories c ON n.category_id = c.id
   WHERE n.user_id = @userId
   ${features.searchCondition}
   ${features.filterCondition}
   ${deletedCondition}
   ${features.sortSQL}
   ${features.pagination.sql}
  `;

  const notesRequest = pool.request();
  addInputs(notesRequest);

  const notesResult = await notesRequest.query(notesQuery);

  const notes = notesResult.recordset.map(note => ({
   id: note.id,
   title: note.title,
   content: note.content,
   is_pinned: note.is_pinned,
   created_at: note.created_at,
   updated_at: note.updated_at,
   deleted_at: note.deleted_at,
   attachment_count: note.attachment_count,
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

// Get trash (soft-deleted notes)
exports.getTrash = async (req, res, next) => {
  try {
    const pool = await getPool();

    const result = await pool
      .request()
      .input('userId', sql.Int, req.user.id)
      .query(`
        SELECT n.id, n.title, n.deleted_at, 
               u.username as deleted_by_username
        FROM Notes n
        LEFT JOIN Users u ON n.deleted_by = u.id
        WHERE n.user_id = @userId AND n.deleted_at IS NOT NULL
        ORDER BY n.deleted_at DESC
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

// Create note with optional attachments
exports.createNote = async (req, res, next) => {
  const pool = await getPool();
  const transaction = pool.transaction();

  try {
    await transaction.begin();

    const { title, content, category_id, is_pinned, tags } = req.body;

    const noteResult = await transaction
      .request()
      .input('userId', sql.Int, req.user.id)
      .input('title', sql.NVarChar, title)
      .input('content', sql.NVarChar, content || '')
      .input('categoryId', sql.Int, category_id || null)
      .input('isPinned', sql.Bit, is_pinned || false)
      .query(`
        INSERT INTO Notes (user_id, title, content, category_id, is_pinned)
        OUTPUT INSERTED.*
        VALUES (@userId, @title, @content, @categoryId, @isPinned)
      `);

    const note = noteResult.recordset[0];

    if (tags && tags.length > 0) {
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
              WHEN MATCHED THEN
                UPDATE SET name = source.name -- This dummy update ensures OUTPUT works
       OUTPUT INSERTED.id; -- 'INSERTED' refers to the row modified by INSERT or UPDATE
      `);

          const tagId = tagResult.recordset[0].id;

        await transaction
          .request()
          .input('noteId', sql.Int, note.id)
          .input('tagId', sql.Int, tagId)
          .query('INSERT INTO Note_Tags (note_id, tag_id) VALUES (@noteId, @tagId)');
      }
    }

    // Handle file attachments
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        await transaction
          .request()
          .input('noteId', sql.Int, note.id)
          .input('filename', sql.NVarChar, file.filename)
          .input('originalName', sql.NVarChar, file.originalname)
          .input('mimeType', sql.NVarChar, file.mimetype)
          .input('sizeBytes', sql.BigInt, file.size)
          .input('filePath', sql.NVarChar, file.path)
          .query(`
            INSERT INTO Attachments (note_id, filename, original_name, mime_type, size_bytes, file_path)
            VALUES (@noteId, @filename, @originalName, @mimeType, @sizeBytes, @filePath)
          `);
      }
    }

    await transaction.commit();

    // Clear cache
    await clearUserCache(req.user.id);

    res.status(201).json({
      success: true,
      data: {
        ...note,
        tags: tags || [],
        attachments: req.files ? req.files.map(f => ({
          filename: f.filename,
          original_name: f.originalname,
          mime_type: f.mimetype,
          size_bytes: f.size,
          file_path: f.path
        })) : []
      }
    });

  } catch (err) {
    
    try {
      await transaction.rollback();
    } catch (rollbackErr) {
      console.error('Failed to rollback transaction:', rollbackErr);
    }

    next(err);
  }
};

// Soft delete note
exports.deleteNote = async (req, res, next) => {
  try {
    const deleted = await softDelete('Notes', req.params.id, req.user.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Note not found'
      });
    }

    await clearUserCache(req.user.id);

    res.json({
      success: true,
      message: 'Note moved to trash'
    });
  } catch (err) {
    next(err);
  }
};

// Restore note from trash
exports.restoreNote = async (req, res, next) => {
  try {
    const restored = await restore('Notes', req.params.id, req.user.id);

    if (!restored) {
      return res.status(404).json({
        success: false,
        error: 'Note not found in trash'
      });
    }

    await clearUserCache(req.user.id);

    res.json({
      success: true,
      message: 'Note restored successfully'
    });
  } catch (err) {
    next(err);
  }
};

// Permanently delete note
exports.permanentDeleteNote = async (req, res, next) => {
  try {
    const pool = await getPool();

    // Get attachments before deleting
    const attachmentsResult = await pool
      .request()
      .input('noteId', sql.Int, req.params.id)
      .query('SELECT file_path FROM Attachments WHERE note_id = @noteId');

    const deleted = await permanentDelete('Notes', req.params.id, req.user.id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Note not found in trash'
      });
    }

    // Delete attachment files
    for (const attachment of attachmentsResult.recordset) {
      fs.unlink(attachment.file_path, (err) => {
        if (err) console.error('Failed to delete file:', err);
      });
    }

    await clearUserCache(req.user.id);

    res.json({
      success: true,
      message: 'Note permanently deleted'
    });
  } catch (err) {
    next(err);
  }
};

// Get note attachments
exports.getAttachments = async (req, res, next) => {
  try {
    const pool = await getPool();

    const result = await pool
      .request()
      .input('noteId', sql.Int, req.params.id)
      .query(`
        SELECT a.id, a.filename, a.original_name, a.mime_type, 
               a.size_bytes, a.created_at
        FROM Attachments a
        INNER JOIN Notes n ON a.note_id = n.id
        WHERE a.note_id = @noteId AND n.user_id = ${req.user.id}
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

// Download attachment
exports.downloadAttachment = async (req, res, next) => {
  try {
    const pool = await getPool();

    const result = await pool
      .request()
      .input('attachmentId', sql.Int, req.params.attachmentId)
      .query(`
        SELECT a.file_path, a.original_name, a.mime_type
        FROM Attachments a
        INNER JOIN Notes n ON a.note_id = n.id
        WHERE a.id = @attachmentId AND n.user_id = ${req.user.id}
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Attachment not found'
      });
    }

    const attachment = result.recordset[0];
    res.download(attachment.file_path, attachment.original_name);
  } catch (err) {
    next(err);
  }
};

// Delete attachment
exports.deleteAttachment = async (req, res, next) => {
  try {
    const pool = await getPool();

    const result = await pool
      .request()
      .input('attachmentId', sql.Int, req.params.attachmentId)
      .query(`
        DELETE FROM Attachments
        OUTPUT DELETED.file_path
        WHERE id = @attachmentId 
        AND note_id IN (SELECT id FROM Notes WHERE user_id = ${req.user.id})
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Attachment not found'
      });
    }

    // Delete file
    fs.unlink(result.recordset[0].file_path, (err) => {
      if (err) console.error('Failed to delete file:', err);
    });

    res.json({
      success: true,
      message: 'Attachment deleted successfully'
    });
  } catch (err) {
    next(err);
  }
};

// Get statistics
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
          SUM(CASE WHEN deleted_at IS NOT NULL THEN 1 ELSE 0 END) as trash_count,
          COUNT(DISTINCT category_id) as categories_used,
          (SELECT COUNT(*) FROM Categories WHERE user_id = @userId AND deleted_at IS NULL) as total_categories,
          (SELECT COUNT(*) FROM Tags WHERE user_id = @userId) as total_tags,
          (SELECT COUNT(*) FROM Attachments a INNER JOIN Notes n ON a.note_id = n.id WHERE n.user_id = @userId) as total_attachments,
          (SELECT COUNT(*) FROM Shared_Notes sn INNER JOIN Notes n ON sn.note_id = n.id WHERE n.user_id = @userId) as shared_count
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


// Get a single note by ID
exports.getSingleNote = async (req, res, next) => {
 try {
  const { id: noteId } = req.params;
  const pool = await getPool();

  const query = `
   SELECT 
    n.id, n.title, n.content, n.is_pinned,
    n.created_at, n.updated_at, n.deleted_at,
    c.id as category_id, c.name as category_name, c.color as category_color,
    
    -- Get tags as a JSON array
    (SELECT t.name FROM Note_Tags nt
    INNER JOIN Tags t ON nt.tag_id = t.id
    WHERE nt.note_id = n.id
    FOR JSON PATH) as tags_json,
    
    -- Get attachments as a JSON array
    (SELECT 
      a.id, a.filename, a.original_name, 
      a.mime_type, a.size_bytes, a.file_path 
    FROM Attachments a
    WHERE a.note_id = n.id
    FOR JSON PATH) as attachments_json
   
   FROM Notes n
   LEFT JOIN Categories c ON n.category_id = c.id
   WHERE n.id = @noteId AND n.deleted_at IS NULL
  `;

  const result = await pool.request()
   .input('noteId', sql.Int, noteId)
   .query(query);

  if (result.recordset.length === 0) {
      // If no note is found (or it's soft-deleted)
   return next(new AppError('Note not found', 404)); 
  }

  const note = result.recordset[0];

  const formattedNote = {
   id: note.id,
   title: note.title,
   content: note.content,
   is_pinned: note.is_pinned,
   created_at: note.created_at,
   updated_at: note.updated_at,
   deleted_at: note.deleted_at,
   category: note.category_id ? {
    id: note.category_id,
    name: note.category_name,
    color: note.category_color
   } : null,
      // Parse the JSON string from SQL into a clean array of strings
   tags: note.tags_json ? JSON.parse(note.tags_json).map(t => t.name) : [],
      // Parse the JSON string from SQL into an array of attachment objects
   attachments: note.attachments_json ? JSON.parse(note.attachments_json) : []
  };

  res.json({
   success: true,
   data: formattedNote
  });
  
 } catch (err) {
  next(err);
 }
};

// Update a note
exports.updateNote = async (req, res, next) => {
 const noteId = req.params.id;
 const userId = req.user.id; 
 const { title, content, category_id, is_pinned, tags } = req.body;

 const pool = await getPool();
 const transaction = pool.transaction();
 let transactionBegun = false; 

 try {
  await transaction.begin();
    transactionBegun = true; 


  const noteResult = await transaction.request()
   .input('noteId', sql.Int, noteId)
   .input('title', sql.NVarChar, title)
   .input('content', sql.NVarChar, content || '')
   .input('categoryId', sql.Int, category_id || null)
   .input('isPinned', sql.Bit, is_pinned || false)
   .query(`
    UPDATE Notes 
    SET 
     title = @title,
     content = @content,
     category_id = @categoryId,
     is_pinned = @isPinned,
     updated_at = GETDATE()
    OUTPUT INSERTED.*
    WHERE id = @noteId
   `);

  if (noteResult.recordset.length === 0) {
   await transaction.rollback();
      transactionBegun = false;
   return next(new AppError('Note not found', 404)); 
  }

  const updatedNote = noteResult.recordset[0];

  //Clear old tags
  await transaction.request()
   .input('noteId', sql.Int, noteId)
   .query('DELETE FROM Note_Tags WHERE note_id = @noteId');

  //Add new tags
  let newTags = [];
  if (tags && tags.length > 0) {
   newTags = tags; 
   for (const tagName of tags) {

    const tagResult = await transaction.request()
     .input('userId', sql.Int, updatedNote.user_id) 
     .input('tagName', sql.NVarChar, tagName)
     .query(`
      MERGE Tags AS target
      USING (SELECT @userId as user_id, @tagName as name) AS source
      ON target.user_id = source.user_id AND target.name = source.name
      WHEN NOT MATCHED THEN
       INSERT (user_id, name) VALUES (source.user_id, source.name)
      WHEN MATCHED THEN 
       UPDATE SET name = source.name 
      OUTPUT INSERTED.id;
     `);

    const tagId = tagResult.recordset[0].id;
    await transaction.request()
     .input('noteId', sql.Int, noteId)
     .input('tagId', sql.Int, tagId)
     .query('INSERT INTO Note_Tags (note_id, tag_id) VALUES (@noteId, @tagId)');
   }
  }

  // Add new attachments
  if (req.files && req.files.length > 0) {
   for (const file of req.files) {
    await transaction.request()
     .input('noteId', sql.Int, noteId)
     .input('filePath', sql.NVarChar, file.path)
     .query(`
      INSERT INTO Attachments (note_id, filename, original_name, mime_type, size_bytes, file_path)
      VALUES (@noteId, @filename, @originalName, @mimeType, @sizeBytes, @filePath)
     `);
   }
  }

  await transaction.commit();
    transactionBegun = false;

  // We should clear the cache for BOTH the owner and the editor
  await clearUserCache(userId); // Clear for editor
    if (userId !== updatedNote.user_id) {
      await clearUserCache(updatedNote.user_id); // Clear for owner
    }

  res.status(200).json({
   success: true,
   data: {
    ...updatedNote,
    tags: newTags,
    attachments: req.files || [] 
   }
  });

 } catch (err) {
  // Only roll back if the transaction successfully began
  if (transactionBegun) {
   await transaction.rollback();
  }
  next(err);
 }
};

// Get all tags with note counts
exports.getTags = async (req, res, next) => {
 try {
  const pool = await getPool();

  const query = `
   SELECT 
    t.id, 
    t.name, 
    COUNT(nt.note_id) as note_count
   FROM Tags t
   LEFT JOIN Note_Tags nt ON t.id = nt.tag_id
   WHERE t.user_id = @userId
   GROUP BY t.id, t.name
   ORDER BY t.name ASC
  `;

  const result = await pool.request()
   .input('userId', sql.Int, req.user.id)
   .query(query);

  res.status(200).json({
   success: true,
   count: result.recordset.length,
   data: result.recordset
  });

 } catch (err) {
  next(err);
 }
};