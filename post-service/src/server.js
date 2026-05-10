require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const Redis = require("ioredis");
const { RateLimiterRedis } = require("rate-limiter-flexible");
const { rateLimit } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const cors = require("cors");
const helmet = require("helmet");
const logger = require("./utils/logger");
const postRoutes = require("./routes/postRoute");
const errorHandler = require("./middleware/errorHandler");

const PORT = process.env.PORT || 3002;
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
  keyPrefix: "middleware",
  points: 10,
  duration: 1,
});

// IP based rate limiting for sensitive endpoint
const sensitiveEndpointsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
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

// sensitive endpoint rate limiter
app.use("/api/posts/create-post", sensitiveEndpointsLimiter);

// Routes
app.use(
  `/api/posts`,
  (req, res, next) => {
    req.redisClient = redisClient;
    next();
  },
  postRoutes,
);

// error handler
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Post service running on port ${PORT}`);
});

// unhandled promise rejection
process.on("unhandledRejection", (reason, promise) => {
  logger.info(`Unhandled Rejection at`, promise, "reason:", reason);
});
