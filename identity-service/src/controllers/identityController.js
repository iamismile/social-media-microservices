const User = require("../models/User");
const logger = require("../utils/logger");
const { validateRegistration } = require("../utils/validation");
const generateTokens = require("../utils/generateToken");

const registerUser = async (req, res) => {
  logger.info("Registration endpoint hit...");
  try {
    // validate the data
    const { error } = validateRegistration(req.body);
    if (error) {
      const message = error.details[0].message;
      logger.warn(`Validation error: ${message}`);
      return res.status(400).json({
        success: false,
        message,
      });
    }

    const { email, password, username } = req.body;

    // check already registered user
    let user = await User.findOne({ $or: [{ email }, { username }] });
    if (user) {
      logger.warn("User already exists");
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    // if not registered create a new one
    user = new User({ username, email, password });
    await user.save();
    logger.warn("User saved successfully", user._id);

    // create tokens
    const { accessToken, refreshToken } = await generateTokens(user);
    res.status(201).json({
      success: true,
      message: "User registered successfully",
      accessToken,
      refreshToken,
    });
  } catch (err) {
    logger.error("Registration error occurred", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = {
  registerUser,
};
