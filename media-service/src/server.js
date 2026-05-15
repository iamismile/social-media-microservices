require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const Redis = require("ioredis");
const { rateLimit } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const mediaRoutes = require("./routes/mediaRoute");
const errorHandler = require("./middleware/errorHandler");
const logger = require("./utils/logger");

const PORT = process.env.PORT || 3003;
const app = express();

// connect to mongodb
mongoose
  .connect(process.env.MONGO_DB_URI)
  .then(() => logger.info("Connected to mongodb"))
  .catch((err) => logger.error("Mongo connection error", err));

// connect to redis
const redisClient = new Redis(process.env.REDIS_URL);

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

// sensitive endpoint rate limiter
app.use("/api/media", sensitiveEndpointsLimiter);

// Routes
app.use(`/api/media`, mediaRoutes);

// error handler
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`Media service running on port ${PORT}`);
});

// unhandled promise rejection
process.on("unhandledRejection", (reason, promise) => {
  logger.info(`Unhandled Rejection at`, promise, "reason:", reason);
});
