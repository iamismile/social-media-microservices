const logger = require("../utils/logger");
const Post = require("../models/Post");
const { validateCreatePost } = require("../utils/validation");
const { publishEvent } = require("../utils/rabbitmq");

const invalidatePostCache = async (req, input) => {
  const cachedKey = `post:${input}`;
  await req.redisClient.del(cachedKey);

  const keys = await req.redisClient.keys("posts:*");
  if (keys.length > 0) {
    await req.redisClient.del(...keys);
  }
};

const createPost = async (req, res) => {
  logger.info("Post create endpoint hit...");
  try {
    // validate the data
    const { error } = validateCreatePost(req.body);
    if (error) {
      const message = error.details[0].message;
      logger.warn(`Validation error: ${message}`);
      return res.status(400).json({
        success: false,
        message,
      });
    }

    const { content, mediaIds } = req.body;
    const newlyCreatedPost = new Post({
      user: req.user.userId,
      content,
      mediaIds: mediaIds || [],
    });

    await newlyCreatedPost.save();

    // publish post created event to rabbitmq
    await publishEvent("post.created", {
      postId: newlyCreatedPost._id.toString(),
      userId: req.user.userId,
      content: newlyCreatedPost.content,
      createdAt: newlyCreatedPost.createdAt,
    });

    // invalidate cache
    await invalidatePostCache(req, newlyCreatedPost._id.toString());
    logger.info("Post created successfully", newlyCreatedPost);

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
  logger.info("Post get all endpoint hit...");
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const startIndex = (page - 1) * limit;

    // first return from cache if exists
    const cacheKey = `posts:${page}:${limit}`;
    const cachedPosts = await req.redisClient.get(cacheKey);
    if (cachedPosts) {
      return res.status(200).json({
        success: true,
        ...JSON.parse(cachedPosts),
      });
    }

    const posts = await Post.find({})
      .sort({ createdAt: -1 })
      .skip(startIndex)
      .limit(limit);

    const totalNoOfPosts = await Post.countDocuments();

    const result = {
      posts,
      currentPage: page,
      totalPages: Math.ceil(totalNoOfPosts / limit),
      totalPosts: totalNoOfPosts,
    };

    // save response in redis cache
    await req.redisClient.setex(cacheKey, 300, JSON.stringify(result));

    res.status(200).json({
      success: true,
      ...result,
    });
  } catch (err) {
    logger.error("Posts fetching error occurred", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const getPost = async (req, res) => {
  logger.info("Post get one endpoint hit...");
  try {
    const postId = req.params.id;

    // first return from cache if exists
    const cacheKey = `post:${postId}`;
    const cachedPost = await req.redisClient.get(cacheKey);
    if (cachedPost) {
      return res.status(200).json({
        success: true,
        post: JSON.parse(cachedPost),
      });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // convert mongoose document to plain object
    const postData = post.toObject();

    // save response in redis cache
    await req.redisClient.setex(cacheKey, 300, JSON.stringify(postData));

    res.status(200).json({
      success: true,
      post: postData,
    });
  } catch (err) {
    logger.error("Post fetching error occurred", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const deletePost = async (req, res) => {
  logger.info("Post delete endpoint hit...");
  try {
    const post = await Post.findOneAndDelete({
      _id: req.params.id,
      user: req.user.userId,
    });
    if (!post) {
      return res.status(404).json({
        success: false,
        message: "Post not found",
      });
    }

    // publish post deleted event to rabbitmq
    await publishEvent("post.deleted", {
      postId: post._id.toString(),
      userId: req.user.userId,
      mediaIds: post.mediaIds,
    });

    // invalidate cache
    await invalidatePostCache(req, req.params.id);
    logger.info("Post deleted successfully", post.toObject());

    res.status(200).json({
      success: true,
      message: "Post deleted successfully",
    });
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
  getAllPosts,
  getPost,
  deletePost,
};
