require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Redis = require("ioredis");
const helmet = require("helmet");
const { rateLimit } = require("express-rate-limit");
const { RedisStore } = require("rate-limit-redis");
const { RateLimiterRedis } = require("rate-limiter-flexible");
const proxy = require("express-http-proxy");
const logger = require("./utils/logger");
const errorHandler = require("./middleware/errorHandler");
const { validateToken } = require("./middleware/authMiddleware");

const PORT = process.env.PORT || 3000;
const app = express();

// connect to redis
const redisClient = new Redis(process.env.REDIS_URL);

// DDos protection and rate limiting
const ratelimiter = new RateLimiterRedis({
  storeClient: redisClient,
  keyPrefix: "rl:gateway", // unique prefix for gateway
  points: 10,
  duration: 1,
});

// IP based rate limiting for sensitive endpoint
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

// sustained abuse protection
app.use(rateLimitOptions);

// setting up proxy for identity service
app.use(
  "/v1/auth",
  proxy(process.env.IDENTITY_SERVICE_URL, {
    ...proxyOptions,

    // Mutate outgoing request options before they're sent upstream.
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      proxyReqOpts.headers["content-type"] = "application/json";
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

// setting up proxy for post service
app.use(
  "/v1/posts",
  validateToken,
  proxy(process.env.POST_SERVICE_URL, {
    ...proxyOptions,

    // Mutate outgoing request options before they're sent upstream.
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      proxyReqOpts.headers["content-type"] = "application/json";
      proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;

      return proxyReqOpts;
    },

    // Transform the upstream response before sending to client.
    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
      logger.info(
        `Response received from Post service: ${proxyRes.statusCode}`,
      );
      return proxyResData;
    },
  }),
);

// setting up proxy for media service
app.use(
  "/v1/media",
  validateToken,
  proxy(process.env.MEDIA_SERVICE_URL, {
    ...proxyOptions,

    // Mutate outgoing request options before they're sent upstream.
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;

      const contentType = srcReq.headers["content-type"] || "";
      if (!contentType.startsWith("multipart/form-data")) {
        proxyReqOpts.headers["content-type"] = "application/json";
      }

      return proxyReqOpts;
    },

    // Transform the upstream response before sending to client.
    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
      logger.info(
        `Response received from Media service: ${proxyRes.statusCode}`,
      );
      return proxyResData;
    },

    parseReqBody: false, // Don't let the proxy parse the body, especially for file uploads
  }),
);

// setting up proxy for search service
app.use(
  "/v1/search",
  validateToken,
  proxy(process.env.SEARCH_SERVICE_URL, {
    ...proxyOptions,

    // Mutate outgoing request options before they're sent upstream.
    proxyReqOptDecorator: (proxyReqOpts, srcReq) => {
      proxyReqOpts.headers["content-type"] = "application/json";
      proxyReqOpts.headers["x-user-id"] = srcReq.user.userId;

      return proxyReqOpts;
    },

    // Transform the upstream response before sending to client.
    userResDecorator: (proxyRes, proxyResData, userReq, userRes) => {
      logger.info(
        `Response received from Search service: ${proxyRes.statusCode}`,
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
  logger.info(`Post service is running on ${process.env.POST_SERVICE_URL}`);
  logger.info(`Media service is running on ${process.env.MEDIA_SERVICE_URL}`);
  logger.info(`Search service is running on ${process.env.SEARCH_SERVICE_URL}`);
  logger.info(`Redis URL ${process.env.REDIS_URL}`);
});
