require("dotenv").config();
const mongoose = require("mongoose");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const { RateLimiterRedis } = require("rate-limiter-flexible");
const Redis = require("ioredis");
const { rateLimit } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const logger = require("./utils/logger");
const routes = require("./routes/identityRoute");
const errorHandler = require("./middleware/errorHandler");

const PORT = process.env.PORT || 3001;
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
app.use("/api/auth/register", sensitiveEndpointsLimiter);

// Routes
app.use("/api/auth", routes);

// error handler
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Identity service running on port ${PORT}`);
});

// unhandled promise rejection
process.on("unhandledRejection", (reason, promise) => {
  logger.info(`Unhandled Rejection at`, promise, "reason:", reason);
});
