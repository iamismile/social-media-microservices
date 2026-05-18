const { uploadMediaToCloudinary } = require("../utils/cloudinary");
const logger = require("../utils/logger");
const Media = require("../models/Media");

const uploadMedia = async (req, res) => {
  logger.info("Starting media upload");

  try {
    if (!req.file) {
      logger.error("No file found. Please add a file and try again!");
      return res.status(400).json({
        success: false,
        message: "No file found. Please add a file and try again!",
      });
    }

    const { originalname: originalName, mimetype: mimeType } = req.file;
    const userId = req.user.userId;

    logger.info(`File details: name=${originalName}, type=${mimeType}`);
    logger.info("Uploading to cloudinary starting...");

    const cloudinaryUploadResult = await uploadMediaToCloudinary(req.file);
    logger.info(
      `Cloudinary upload successful. Public ID: ${cloudinaryUploadResult.public_id}`,
    );

    const newMedia = new Media({
      publicId: cloudinaryUploadResult.public_id,
      originalName,
      mimeType,
      url: cloudinaryUploadResult.secure_url,
      userId,
    });
    await newMedia.save();

    res.status(201).json({
      success: true,
      message: "Media uploaded successfully",
      media: {
        id: newMedia.id,
        url: newMedia.url,
      },
    });
  } catch (err) {
    logger.error("Media upload error occurred", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getAllMedias = async (req, res) => {
  try {
    const results = await Media.find({});
    res.json({ results });
  } catch (err) {
    logger.error("Medias fetching error occurred", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = { uploadMedia, getAllMedias };
