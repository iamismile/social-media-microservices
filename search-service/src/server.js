require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const Redis = require("ioredis");
const { RateLimiterRedis } = require("rate-limiter-flexible");
const errorHandler = require("./middleware/errorHandler");
const logger = require("./utils/logger");
const { connectToRabbitMQ, consumeEvent } = require("./utils/rabbitmq");
const searchRoutes = require("./routes/searchRoute");
const {
  handlePostCreated,
  handlePostDeleted,
} = require("./eventHandlers/searchEventHandlers");

const PORT = process.env.PORT || 3004;
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
  keyPrefix: "rl:search",
  points: 10, // 10 requests
  duration: 1, // per 1 second
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

// Routes
app.use(`/api/search`, searchRoutes);

// error handler
app.use(errorHandler);

async function startServer() {
  try {
    await connectToRabbitMQ();

    // consume events
    consumeEvent("post.created", handlePostCreated);
    consumeEvent("post.deleted", handlePostDeleted);

    app.listen(PORT, () => {
      logger.info(`Search service running on port ${PORT}`);
    });
  } catch (err) {
    logger.error("Failed to start search server", err);
    process.exit(1);
  }
}

startServer();

// unhandled promise rejection
process.on("unhandledRejection", (reason, promise) => {
  logger.info(`Unhandled Rejection at`, promise, "reason:", reason);
});
