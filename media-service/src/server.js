require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const Redis = require("ioredis");
const { rateLimit } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const { RateLimiterRedis } = require("rate-limiter-flexible");
const mediaRoutes = require("./routes/mediaRoute");
const errorHandler = require("./middleware/errorHandler");
const logger = require("./utils/logger");
const { connectToRabbitMQ, consumeEvent } = require("./utils/rabbitmq");
const { handlePostDeleted } = require("./eventHandlers/mediaEventHandlers");

const PORT = process.env.PORT || 3003;
const app = express();

// connect to mongodb
mongoose
  .connect(process.env.MONGO_DB_URI)
  .then(() => logger.info("Connected to mongodb"))
  .catch((err) => logger.error("Mongo connection error", err));

// connect to redis
const redisClient = new Redis(process.env.REDIS_URL);

// DDos protection and rate limiting
const ratelimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "rl:media",
  points: 10,
  duration: 1,
});

// IP based rate limiting for sensitive endpoint
const sensitiveEndpointsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Sensitive endpoint rate limit exceeded for IP: ${req.ip}`);

    res.status(429).json({
      success: false,
      message: "Too many requests",
    });
  },
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
  }),
});

// middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  logger.info(`Received ${req.method} request to ${req.url}`);
  logger.info("Request body", { body: req.body });
  next();
});

// DDoS protection
app.use((req, res, next) => {
  ratelimiter
    .consume(req.ip)
    .then(() => next())
    .catch((err) => {
      logger.warn(`Rate limit exceeded for IP: ${req.ip}`);

      res.status(429).json({
        success: false,
        message: "Too many requests",
      });
    });
});

// sustained abuse protection (only for write operation)
app.post("/api/media/upload", sensitiveEndpointsLimiter);

// Routes
app.use(`/api/media`, mediaRoutes);

// error handler
app.use(errorHandler);

async function startServer() {
  try {
    await connectToRabbitMQ();

    // consume all the events
    await consumeEvent("post.deleted", handlePostDeleted);

    app.listen(PORT, () => {
      logger.info(`Media service running on port ${PORT}`);
    });
  } catch (err) {
    logger.error("Failed to start server", err);
    process.exit(1);
  }
}

startServer();

// unhandled promise rejection
process.on("unhandledRejection", (reason, promise) => {
  logger.info(`Unhandled Rejection at`, promise, "reason:", reason);
});
