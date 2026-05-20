const Search = require("../models/Search");
const logger = require("../utils/logger");

const handlePostCreated = async (event) => {
  const { postId, userId, content, createdAt } = event;
  try {
    const newSearchEntry = new Search({
      postId,
      userId,
      content,
      createdAt,
    });
    await newSearchEntry.save();

    logger.info(`Added post with ID: ${postId} to search index`);
  } catch (err) {
    logger.error("Error handling post created event", err);
  }
};

const handlePostDeleted = async (event) => {
  const { postId } = event;
  try {
    await Search.findOneAndDelete({ postId });
    logger.info(`Deleted Search post for post ID: ${postId}`);
  } catch (err) {
    logger.error("Error handling post deleted event", err);
  }
};

module.exports = { handlePostCreated, handlePostDeleted };
