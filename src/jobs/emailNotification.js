const nodemailer = require('nodemailer');

// Configure email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

// Send note shared notification
const sendNoteSharedEmail = async (recipientEmail, sharedBy, noteTitle) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM,
    to: recipientEmail,
    subject: 'A note has been shared with you',
    html: `
      <h2>Note Shared</h2>
      <p><strong>user with id :${sharedBy}</strong> has shared a note with you:</p>
      <p><strong>Title:</strong> ${noteTitle}</p>
      <p><a href="${process.env.API_BASE_URL}">View in Notes App</a></p>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent to ${recipientEmail}`);
  } catch (err) {
    console.error('Email send error:', err);
  }
};

module.exports = { sendNoteSharedEmail };