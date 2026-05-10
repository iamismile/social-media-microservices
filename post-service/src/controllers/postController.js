const logger = require("../utils/logger");
const Post = require("../models/Post");

const createPost = async (req, res) => {
  logger.info("Post create endpoint hit...");
  try {
    const { content, mediaIds } = req.body;
    const newlyCreatedPost = new Post({
      user: req.user.userId,
      content,
      mediaIds: mediaIds || [],
    });

    logger.info("Post created successfully", newlyCreatedPost);
    await newlyCreatedPost.save();
    res.status(201).json({
      success: true,
      message: "Post created successfully",
    });
  } catch (err) {
    logger.error("Post create error occurred", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getAllPosts = async (req, res) => {
  try {
  } catch (err) {
    logger.error("Posts fetching error occurred", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getPost = async (req, res) => {
  try {
  } catch (err) {
    logger.error("Post fetching error occurred", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const deletePost = async (req, res) => {
  try {
  } catch (err) {
    logger.error("Post delete error occurred", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = {
  createPost,
};
