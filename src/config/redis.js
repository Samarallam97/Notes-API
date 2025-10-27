const { createClient } = require('redis');

const redis = createClient({
  socket: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 5555,
  },
  // password: process.env.REDIS_PASSWORD || undefined,
});

redis.on('connect', () => console.log(' Connected to Redis'));
redis.on('error', (err) => console.error(' Redis connection error:', err));

(async () => {
  await redis.connect();
})();

module.exports = redis;
