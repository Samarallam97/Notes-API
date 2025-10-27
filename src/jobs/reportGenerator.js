const { getPool, sql } = require('../config/database');
const { generateMultipleNotesPDF } = require('../utils/pdfGenerator');
const { createObjectCsvWriter } = require('csv-writer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

// Email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

/**
 * Generate weekly summary report for user
 */
const generateWeeklySummaryReport = async (userId) => {
  try {
    const pool = await getPool();
    
    // Get user info
    const userResult = await pool
      .request()
      .input('userId', sql.Int, userId)
      .query('SELECT username, email FROM Users WHERE id = @userId');
    
    if (userResult.recordset.length === 0) {
      throw new Error('User not found');
    }
    
    const user = userResult.recordset[0];
    
    // Get statistics for the past week
    const statsResult = await pool
      .request()
      .input('userId', sql.Int, userId)
      .query(`
        DECLARE @WeekAgo DATETIME = DATEADD(day, -7, GETDATE());
        
        SELECT 
          COUNT(*) as notes_created_this_week,
          (SELECT COUNT(*) FROM Notes WHERE user_id = @userId AND deleted_at IS NULL) as total_active_notes,
          (SELECT COUNT(*) FROM Notes WHERE user_id = @userId AND deleted_at IS NOT NULL) as notes_in_trash,
          (SELECT COUNT(*) FROM Categories WHERE user_id = @userId AND deleted_at IS NULL) as total_categories,
          (SELECT COUNT(*) FROM Tags WHERE user_id = @userId) as total_tags,
          (SELECT COUNT(*) FROM Attachments a 
           INNER JOIN Notes n ON a.note_id = n.id 
           WHERE n.user_id = @userId) as total_attachments,
          (SELECT COUNT(DISTINCT shared_with) 
           FROM Shared_Notes sn 
           INNER JOIN Notes n ON sn.note_id = n.id 
           WHERE n.user_id = @userId) as users_shared_with
        FROM Notes
        WHERE user_id = @userId 
        AND created_at >= @WeekAgo
      `);
    
    const stats = statsResult.recordset[0];
    
    // Get most active categories
    const categoriesResult = await pool
      .request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT TOP 5 
          c.name, 
          c.color,
          COUNT(n.id) as note_count
        FROM Categories c
        LEFT JOIN Notes n ON c.id = n.category_id AND n.deleted_at IS NULL
        WHERE c.user_id = @userId AND c.deleted_at IS NULL
        GROUP BY c.id, c.name, c.color
        ORDER BY note_count DESC
      `);
    
    // Get most used tags
    const tagsResult = await pool
      .request()
      .input('userId', sql.Int, userId)
      .query(`
        SELECT TOP 5 
          t.name,
          COUNT(nt.note_id) as usage_count
        FROM Tags t
        LEFT JOIN Note_Tags nt ON t.id = nt.tag_id
        WHERE t.user_id = @userId
        GROUP BY t.id, t.name
        ORDER BY usage_count DESC
      `);
    
    // Generate report content
    const report = {
      user: {
        username: user.username,
        email: user.email
      },
      period: {
        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date().toISOString()
      },
      statistics: stats,
      topCategories: categoriesResult.recordset,
      topTags: tagsResult.recordset
    };
    
    // Generate HTML email
    const htmlEmail = generateReportHTML(report);
    
    // Send email
    await transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: user.email,
      subject: `Your Weekly Notes Summary - ${new Date().toLocaleDateString()}`,
      html: htmlEmail
    });
    
    console.log(`📧 Weekly report sent to ${user.email}`);
    
    return report;
  } catch (err) {
    console.error('Error generating weekly report:', err);
    throw err;
  }
};

/**
 * Generate monthly analytics report
 */
const generateMonthlyAnalyticsReport = async (userId) => {
  try {
    const pool = await getPool();
    
    // Get user info
    const userResult = await pool
      .request()
      .input('userId', sql.Int, userId)
      .query('SELECT username, email FROM Users WHERE id = @userId');
    
    const user = userResult.recordset[0];
    
    // Get monthly statistics
    const monthlyStatsResult = await pool
      .request()
      .input('userId', sql.Int, userId)
      .query(`
        DECLARE @MonthAgo DATETIME = DATEADD(month, -1, GETDATE());
        
        SELECT 
          COUNT(*) as notes_created_this_month,
          AVG(LEN(content)) as avg_note_length,
          SUM(CASE WHEN is_pinned = 1 THEN 1 ELSE 0 END) as pinned_notes,
          (SELECT COUNT(*) FROM Audit_Logs WHERE user_id = @userId AND created_at >= @MonthAgo) as total_actions
        FROM Notes
        WHERE user_id = @userId 
        AND created_at >= @MonthAgo
        AND deleted_at IS NULL
      `);
    
    // Get daily note creation trend
    const trendResult = await pool
      .request()
      .input('userId', sql.Int, userId)
      .query(`
        DECLARE @MonthAgo DATETIME = DATEADD(month, -1, GETDATE());
        
        SELECT 
          CAST(created_at AS DATE) as date,
          COUNT(*) as notes_created
        FROM Notes
        WHERE user_id = @userId 
        AND created_at >= @MonthAgo
        AND deleted_at IS NULL
        GROUP BY CAST(created_at AS DATE)
        ORDER BY date
      `);
    
    const report = {
      user,
      period: 'Last 30 Days',
      statistics: monthlyStatsResult.recordset[0],
      trend: trendResult.recordset
    };
    
    // Generate and save PDF report
    const filename = `monthly-report-${userId}-${Date.now()}.pdf`;
    const outputPath = path.join(process.env.UPLOAD_PATH || './uploads', 'exports', filename);
    
    // You can implement PDF generation for analytics here
    
    console.log(`📊 Monthly report generated for user ${userId}`);
    
    return report;
  } catch (err) {
    console.error('Error generating monthly report:', err);
    throw err;
  }
};

/**
 * Generate audit log report (Admin only)
 */
const generateAuditLogReport = async (startDate, endDate) => {
  try {
    const pool = await getPool();
    
    const result = await pool
      .request()
      .input('startDate', sql.DateTime, new Date(startDate))
      .input('endDate', sql.DateTime, new Date(endDate))
      .query(`
        SELECT 
          al.id,
          al.action,
          al.entity_type,
          al.entity_id,
          al.ip_address,
          al.created_at,
          u.username,
          u.email
        FROM Audit_Logs al
        INNER JOIN Users u ON al.user_id = u.id
        WHERE al.created_at BETWEEN @startDate AND @endDate
        ORDER BY al.created_at DESC
      `);
    
    // Generate CSV
    const filename = `audit-log-${Date.now()}.csv`;
    const outputPath = path.join(process.env.UPLOAD_PATH || './uploads', 'exports', filename);
    
    const csvWriter = createObjectCsvWriter({
      path: outputPath,
      header: [
        { id: 'id', title: 'Log ID' },
        { id: 'username', title: 'User' },
        { id: 'email', title: 'Email' },
        { id: 'action', title: 'Action' },
        { id: 'entity_type', title: 'Entity Type' },
        { id: 'entity_id', title: 'Entity ID' },
        { id: 'ip_address', title: 'IP Address' },
        { id: 'created_at', title: 'Timestamp' }
      ]
    });
    
    await csvWriter.writeRecords(result.recordset);
    
    console.log(`📋 Audit log report generated: ${filename}`);
    
    return outputPath;
  } catch (err) {
    console.error('Error generating audit log report:', err);
    throw err;
  }
};

/**
 * Generate HTML email template for weekly report
 */
const generateReportHTML = (report) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #3B82F6; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
        .stat-box { background: white; padding: 15px; margin: 10px 0; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .stat-label { color: #6b7280; font-size: 14px; }
        .stat-value { font-size: 32px; font-weight: bold; color: #3B82F6; }
        .list-item { padding: 10px; border-bottom: 1px solid #e5e7eb; }
        .tag { display: inline-block; padding: 4px 12px; margin: 4px; background: #dbeafe; color: #1e40af; border-radius: 12px; font-size: 12px; }
        .footer { text-align: center; margin-top: 20px; color: #6b7280; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📊 Your Weekly Notes Summary</h1>
          <p>${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        
        <div class="content">
          <h2>Hello ${report.user.username}! 👋</h2>
          <p>Here's your productivity summary for the past week:</p>
          
          <div class="stat-box">
            <div class="stat-label">Notes Created This Week</div>
            <div class="stat-value">${report.statistics.notes_created_this_week}</div>
          </div>
          
          <div class="stat-box">
            <div class="stat-label">Total Active Notes</div>
            <div class="stat-value">${report.statistics.total_active_notes}</div>
          </div>
          
          <div class="stat-box">
            <div class="stat-label">Categories & Tags</div>
            <div style="display: flex; justify-content: space-around; margin-top: 10px;">
              <div>
                <div class="stat-value" style="font-size: 24px;">${report.statistics.total_categories}</div>
                <div class="stat-label">Categories</div>
              </div>
              <div>
                <div class="stat-value" style="font-size: 24px;">${report.statistics.total_tags}</div>
                <div class="stat-label">Tags</div>
              </div>
            </div>
          </div>
          
          <h3>📁 Top Categories</h3>
          ${report.topCategories.map(cat => `
            <div class="list-item">
              <span style="color: ${cat.color};">●</span> ${cat.name} 
              <span style="float: right; color: #6b7280;">${cat.note_count} notes</span>
            </div>
          `).join('')}
          
          <h3>🏷️ Most Used Tags</h3>
          <div style="padding: 10px;">
            ${report.topTags.map(tag => `
              <span class="tag">${tag.name} (${tag.usage_count})</span>
            `).join('')}
          </div>
          
          ${report.statistics.users_shared_with > 0 ? `
            <div class="stat-box">
              <div class="stat-label">Collaboration</div>
              <p>You've shared notes with <strong>${report.statistics.users_shared_with}</strong> user(s) this week! 🤝</p>
            </div>
          ` : ''}
          
          <div style="text-align: center; margin-top: 30px;">
            <a href="${process.env.API_BASE_URL}" style="display: inline-block; padding: 12px 24px; background: #3B82F6; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
              View All Notes
            </a>
          </div>
        </div>
        
        <div class="footer">
          <p>This is an automated report from Notes API</p>
          <p>To stop receiving these emails, please update your notification settings</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

/**
 * Schedule weekly reports for all users (to be called by cron job)
 */
const scheduleWeeklyReports = async () => {
  try {
    const pool = await getPool();
    
    const usersResult = await pool.request().query('SELECT id, email FROM Users');
    
    console.log(`📅 Starting weekly reports for ${usersResult.recordset.length} users...`);
    
    for (const user of usersResult.recordset) {
      try {
        await generateWeeklySummaryReport(user.id);
      } catch (err) {
        console.error(`Failed to generate report for user ${user.id}:`, err);
      }
    }
    
    console.log('✅ Weekly reports completed');
  } catch (err) {
    console.error('Error scheduling weekly reports:', err);
  }
};

module.exports = {
  generateWeeklySummaryReport,
  generateMonthlyAnalyticsReport,
  generateAuditLogReport,
  scheduleWeeklyReports,
  generateReportHTML
};