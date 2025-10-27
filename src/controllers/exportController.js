const { getPool, sql } = require('../config/database');
const { generateNotePDF, generateMultipleNotesPDF } = require('../utils/pdfGenerator');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');
const fs = require('fs');

exports.exportNotePDF = async (req, res, next) => {
  try {
    const noteId = req.params.id;
    const userId = req.user.id;
    const pool = await getPool();

    const result = await pool
      .request()
      .input('noteId', sql.Int, noteId)
      .input('userId', sql.Int, userId)
      .query(`
        SELECT n.*, c.name as category_name,
          (SELECT t.name FROM Note_Tags nt
            INNER JOIN Tags t ON nt.tag_id = t.id
            WHERE nt.note_id = n.id
            FOR JSON PATH) as tags_json
        FROM Notes n
        LEFT JOIN Categories c ON n.category_id = c.id
        WHERE n.id = @noteId AND n.user_id = @userId AND n.deleted_at IS NULL
      `);

    if (result.recordset.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Note not found'
      });
    }

    const note = result.recordset[0];
    note.category = note.category_name ? { name: note.category_name } : null;
    note.tags = note.tags_json ? JSON.parse(note.tags_json).map(t => t.name) : [];

    // Generate PDF
    const filename = `note-${noteId}-${Date.now()}.pdf`;
    const outputPath = path.join(process.env.UPLOAD_PATH || './uploads', filename);
    
    await generateNotePDF(note, outputPath);

    res.download(outputPath, filename, (err) => {
      if (err) {
        console.error('Download error:', err);
      }
      // Clean up file after download
      fs.unlink(outputPath, (unlinkErr) => {
        if (unlinkErr) console.error('File cleanup error:', unlinkErr);
      });
    });
  } catch (err) {
    next(err);
  }
};

exports.exportAllNotesPDF = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const pool = await getPool();

    // Get user info
    const userResult = await pool
      .request()
      .input('userId', sql.Int, userId)
      .query('SELECT username, email FROM Users WHERE id = @userId');

    const userInfo = userResult.recordset[0];

    // Get all notes
    const notesResult = await pool
      .request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT n.*, c.name as category_name
        FROM Notes n
        LEFT JOIN Categories c ON n.category_id = c.id
        WHERE n.user_id = @userId AND n.deleted_at IS NULL
        ORDER BY n.updated_at DESC
      `);

    const notes = notesResult.recordset.map(note => ({
      ...note,
      category: note.category_name ? { name: note.category_name } : null
    }));

    // Generate PDF
    const filename = `all-notes-${Date.now()}.pdf`;
    const outputPath = path.join(process.env.UPLOAD_PATH || './uploads', filename);
    
    await generateMultipleNotesPDF(notes, outputPath, userInfo);

    res.download(outputPath, filename, (err) => {
      if (err) {
        console.error('Download error:', err);
      }
      fs.unlink(outputPath, (unlinkErr) => {
        if (unlinkErr) console.error('File cleanup error:', unlinkErr);
      });
    });
  } catch (err) {
    next(err);
  }
};

// Export notes as JSON
exports.exportJSON = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const pool = await getPool();

    const result = await pool
      .request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT 
          n.id, n.title, n.content, n.is_pinned, n.created_at, n.updated_at,
          c.name as category_name,
          (SELECT t.name 
           FROM Note_Tags nt
           INNER JOIN Tags t ON nt.tag_id = t.id
           WHERE nt.note_id = n.id
           FOR JSON PATH) as tags_json
        FROM Notes n
        LEFT JOIN Categories c ON n.category_id = c.id
        WHERE n.user_id = @userId AND n.deleted_at IS NULL
        ORDER BY n.updated_at DESC
      `);

    // Process the notes to be more JSON-friendly
    const notes = result.recordset.map(note => ({
      id: note.id,
      title: note.title,
      content: note.content,
      is_pinned: note.is_pinned,
      created_at: note.created_at,
      updated_at: note.updated_at,
      category: note.category_name || null,
      tags: note.tags_json ? JSON.parse(note.tags_json).map(t => t.name) : [],
    }));

    const filename = `notes-export-${Date.now()}.json`;
    
    // Set headers to trigger browser download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    
    // Send the JSON data
    res.status(200).json(notes);

  } catch (err) {
    next(err);
  }
};

// Export notes as CSV
exports.exportCSV = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const pool = await getPool();

    const result = await pool
      .request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT n.id, n.title, n.content, n.is_pinned, n.created_at, n.updated_at,
               c.name as category_name
        FROM Notes n
        LEFT JOIN Categories c ON n.category_id = c.id
        WHERE n.user_id = @userId AND n.deleted_at IS NULL
        ORDER BY n.updated_at DESC
      `);

    const filename = `notes-export-${Date.now()}.csv`;
    const outputPath = path.join(process.env.UPLOAD_PATH || './uploads', filename);

    const csvWriter = createObjectCsvWriter({
      path: outputPath,
      header: [
        { id: 'id', title: 'ID' },
        { id: 'title', title: 'Title' },
        { id: 'content', title: 'Content' },
        { id: 'category_name', title: 'Category' },
        { id: 'is_pinned', title: 'Pinned' },
        { id: 'created_at', title: 'Created At' },
        { id: 'updated_at', title: 'Updated At' }
      ]
    });

    await csvWriter.writeRecords(result.recordset);

    res.download(outputPath, filename, (err) => {
      if (err) {
        console.error('Download error:', err);
      }
      fs.unlink(outputPath, (unlinkErr) => {
        if (unlinkErr) console.error('File cleanup error:', unlinkErr);
      });
    });
  } catch (err) {
    next(err);
  }
};

// Import notes from JSON
exports.importJSON = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const notes = req.body.notes;

    if (!Array.isArray(notes)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid format. Expected array of notes.'
      });
    }

    const pool = await getPool();
    const transaction = pool.transaction();
    await transaction.begin();

    let imported = 0;
    let errors = [];

    try {
      for (const note of notes) {
        try {
          await transaction
            .request()
            .input('userId', sql.Int, userId)
            .input('title', sql.NVarChar, note.title || 'Imported Note')
            .input('content', sql.NVarChar, note.content || '')
            .input('isPinned', sql.Bit, note.is_pinned || false)
            .query(`
              INSERT INTO Notes (user_id, title, content, is_pinned)
              VALUES (@userId, @title, @content, @isPinned)
            `);
          imported++;
        } catch (err) {
          errors.push(`Failed to import note: ${note.title || 'Untitled'}`);
        }
      }

      await transaction.commit();

      res.json({
        success: true,
        message: `Successfully imported ${imported} notes`,
        imported,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) {
    next(err);
  }
};