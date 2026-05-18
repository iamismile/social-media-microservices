const express = require("express");
const multer = require("multer");
const { authenticateRequest } = require("../middleware/authMiddleware");
const { uploadMedia, getAllMedias } = require("../controllers/mediaController");
const logger = require("../utils/logger");

const router = express.Router();

// Configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
}).single("file");

router.post(
  "/upload",
  authenticateRequest,
  (req, res, next) => {
    upload(req, res, function (err) {
      if (err instanceof multer.MulterError) {
        logger.error("Multer error while uploading:", err);
        return res.status(400).json({
          success: false,
          message: "Multer error while uploading",
          error: err.message,
          stack: err.stack,
        });
      } else if (err) {
        logger.error("Unknown error while uploading:", err);
        return res.status(500).json({
          success: false,
          message: "Unknown error while uploading",
          error: err.message,
          stack: err.stack,
        });
      }

      next();
    });
  },
  uploadMedia,
);

router.get("/", authenticateRequest, getAllMedias);

module.exports = router;
