const redis = require("../config/redis");

const cache = (duration = 300) => {
  // duration in seconds
  return async (req, res, next) => {
    if (req.method !== "GET") {
      return next();
    }

    const key = `cache:${req.user.id}:${req.originalUrl}`;

    try {
      const cachedData = await redis.get(key);

      if (cachedData) {
        console.log("Cache hit:", key);
        return res.json(JSON.parse(cachedData));
      }

      console.log("Cache miss:", key);

      const originalJson = res.json.bind(res);

      res.json = (body) => {

        redis
          .set(key, JSON.stringify(body), {
            EX: duration, 
          })
          .catch((err) => {
            console.error("Cache set error:", err);
          });

        // Send the original response
        return originalJson(body);
      };

      next();
    } catch (err) {
      console.error("Cache error:", err);
      next(); 
    }
  };
};

// Clear cache for user
const clearUserCache = async (userId) => {
  try {
    // WARNING: redis.keys() is blocking and not for production use.
    // Consider using redis.scan() for large key sets.
    const keys = await redis.keys(`cache:${userId}:*`);

    if (keys.length > 0) {

      await redis.del(keys);
      console.log(`Cleared ${keys.length} cache keys for user ${userId}`);
    }
  } catch (err) {
    console.error("Error clearing cache:", err);
  }
};

module.exports = { cache, clearUserCache };
