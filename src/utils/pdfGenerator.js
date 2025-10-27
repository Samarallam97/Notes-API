const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

const generateNotePDF = async (note, outputPath) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument();
      const writeStream = fs.createWriteStream(outputPath);

      doc.pipe(writeStream);

      // Title
      doc.fontSize(24).text(note.title, { align: 'center' });
      doc.moveDown();

      // Metadata
      doc.fontSize(10).fillColor('gray');
      doc.text(`Created: ${new Date(note.created_at).toLocaleString()}`);
      doc.text(`Updated: ${new Date(note.updated_at).toLocaleString()}`);
      
      if (note.category) {
        doc.text(`Category: ${note.category.name}`);
      }
      
      if (note.tags && note.tags.length > 0) {
        doc.text(`Tags: ${note.tags.join(', ')}`);
      }
      
      doc.moveDown();

      // Content
      doc.fontSize(12).fillColor('black');
      doc.text(note.content || 'No content', { align: 'left' });

      doc.end();

      writeStream.on('finish', () => resolve(outputPath));
      writeStream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
};

const generateMultipleNotesPDF = async (notes, outputPath, userInfo) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument();
      const writeStream = fs.createWriteStream(outputPath);

      doc.pipe(writeStream);

      // Cover page
      doc.fontSize(28).text('My Notes Export', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Exported by: ${userInfo.username}`, { align: 'center' });
      doc.text(`Date: ${new Date().toLocaleString()}`, { align: 'center' });
      doc.text(`Total Notes: ${notes.length}`, { align: 'center' });
      
      // Notes
      notes.forEach((note, index) => {
        doc.addPage();
        
        doc.fontSize(18).fillColor('blue').text(note.title);
        doc.moveDown(0.5);
        
        doc.fontSize(9).fillColor('gray');
        doc.text(`Created: ${new Date(note.created_at).toLocaleString()}`);
        if (note.category) {
          doc.text(`Category: ${note.category.name}`);
        }
        doc.moveDown();
        
        doc.fontSize(11).fillColor('black');
        doc.text(note.content || 'No content');
      });

      doc.end();

      writeStream.on('finish', () => resolve(outputPath));
      writeStream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = { generateNotePDF, generateMultipleNotesPDF };