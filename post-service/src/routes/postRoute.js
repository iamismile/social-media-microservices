const express = require("express");
const { createPost } = require("../controllers/postController");
const { authenticateRequest } = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authenticateRequest);

router.post("/create-post", createPost);

module.exports = router;
