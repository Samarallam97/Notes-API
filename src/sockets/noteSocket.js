const jwt = require('jsonwebtoken');

const setupNoteSocket = (io) => {
  // Authentication middleware for Socket.IO
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`👤 User ${socket.userId} connected to WebSocket`);

    // Join user's personal room
    socket.join(`user:${socket.userId}`);

    // Join note room when viewing a note
    socket.on('join-note', (noteId) => {
      socket.join(`note:${noteId}`);
      console.log(`User ${socket.userId} joined note ${noteId}`);
    });

    // Leave note room
    socket.on('leave-note', (noteId) => {
      socket.leave(`note:${noteId}`);
      console.log(`User ${socket.userId} left note ${noteId}`);
    });

    socket.on('disconnect', () => {
      console.log(`👤 User ${socket.userId} disconnected`);
    });
  });

  return io;
};

// Emit note update to all viewers
const emitNoteUpdate = (io, noteId, data) => {
  io.to(`note:${noteId}`).emit('note-updated', data);
};

// Emit notification to user
const emitNotification = (io, userId, notification) => {
  io.to(`user:${userId}`).emit('notification', notification);
};

module.exports = { setupNoteSocket, emitNoteUpdate, emitNotification };