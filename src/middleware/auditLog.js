const { getPool, sql } = require('../config/database');

const auditLog = (action, entityType) => {
  return async (req, res, next) => {
    // Store original methods
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    // Capture request data
    const auditData = {
      userId: req.user?.id,
      action,
      entityType,
      entityId: req.params.id || null,
      oldValues: null,
      newValues: req.body ? JSON.stringify(req.body) : null,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('user-agent')
    };

    // log after success
    const logAudit = async (responseData) => {
      try {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const pool = await getPool();
          await pool
            .request()
            .input('userId', sql.Int, auditData.userId)
            .input('action', sql.NVarChar, auditData.action)
            .input('entityType', sql.NVarChar, auditData.entityType)
            .input('entityId', sql.Int, auditData.entityId || null)
            .input('oldValues', sql.NVarChar, auditData.oldValues)
            .input('newValues', sql.NVarChar, auditData.newValues)
            .input('ipAddress', sql.NVarChar, auditData.ipAddress)
            .input('userAgent', sql.NVarChar, auditData.userAgent)
            .query(`
              INSERT INTO Audit_Logs 
              (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent)
              VALUES (@userId, @action, @entityType, @entityId, @oldValues, @newValues, @ipAddress, @userAgent)
            `);
          
          console.log(`📝 Audit log: ${action} ${entityType} by user ${auditData.userId}`);
        }
      } catch (err) {
        console.error('Audit log error:', err);
      }
    };

    res.json = function(body) {
      logAudit(body);
      return originalJson(body);
    };

    res.send = function(body) {
      logAudit(body);
      return originalSend(body);
    };

    next();
  };
};

module.exports = auditLog;