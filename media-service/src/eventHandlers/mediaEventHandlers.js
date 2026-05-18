const Media = require("../models/Media");
const { deleteMediaFromCloudinary } = require("../utils/cloudinary");
const logger = require("../utils/logger");

const handlePostDeleted = async (event) => {
  const { postId, mediaIds } = event;
  try {
    const mediaToDelete = await Media.find({ _id: { $in: mediaIds } });

    for (const media of mediaToDelete) {
      await deleteMediaFromCloudinary(media.publicId);
      await Media.findByIdAndDelete(media._id);
      logger.info(`Deleted media with ID: ${media._id} for post ID: ${postId}`);
    }

    logger.info(`Processed deletion of media for post ID: ${postId}`);
  } catch (err) {
    logger.error("Error handling post deleted event", err);
  }
};

module.exports = { handlePostDeleted };
