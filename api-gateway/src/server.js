require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Redis = require("ioredis");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const proxy = require("express-http-proxy");
const logger = require("./utils/logger");
const errorHandler = require("./middleware/errorHandler");

const PORT = process.env.PORT || 3000;
const app = express();

// connect to redis
const redisClient = new Redis(process.env.REDIS_URL);

// rate limiting
const rateLimitOptions = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // max requests per window per IP
  standardHeaders: true, // adds RateLimit-* headers to response
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Sensitive endpoint rate limit exceeded for IP: ${req.ip}`);

    res.status(429).json({
      success: false,
      message: "Too many requests",
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000),
    });
  },
  store: new RedisStore({
    sendCommand: (...args) => redisClient.call(...args),
  }),
});

// proxy options
const proxyOptions = {
  // Rewrite path: strip the gateway prefix before forwarding
  // e.g. GET /v1/auth/register → GET /api/auth/register (on :3001)
  proxyReqPathResolver: (req) => {
    return req.originalUrl.replace(/^\/v1/, "/api");
  },

  // Handle proxy errors
  proxyErrorHandler: (err, res, next) => {
    logger.error(`Proxy error: ${err.message}`);
    res.status(500).json({
      success: false,
      message: `Internal server error`,
      error: err.message,
    });
  },
};

// middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  logger.info(`Received ${req.method} request to ${req.url}`);
  logger.info("Request body", { body: req.body });
  next();
});

app.use(rateLimitOptions);

// setting up proxy for identity service
app.use(
  "/v1/auth",
  proxy(process.env.IDENTITY_SERVICE_URL, {
    ...proxyOptions,

    // Mutate outgoing request options before they're sent upstream.
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      proxyReqOpts.headers["Content-Type"] = "application/json";
      return proxyReqOpts;
    },

    // Transform the upstream response before sending to client.
    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
      logger.info(
        `Response received from Identity service: ${proxyRes.statusCode}`,
      );
      return proxyResData;
    },
  }),
);

// error handler
app.use(errorHandler);

app.listen(PORT, () => {
  logger.info(`API Gateway is running on port ${PORT}`);
  logger.info(
    `Identity service is running on ${process.env.IDENTITY_SERVICE_URL}`,
  );
  logger.info(`Redis URL ${process.env.REDIS_URL}`);
});
