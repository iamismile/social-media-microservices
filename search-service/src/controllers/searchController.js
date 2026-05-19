const logger = require("../utils/logger");
const Search = require("../models/Search");

const searchPostController = async (req, res) => {
  logger.info("Search endpoint hit...");

  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: "query is required",
      });
    }

    const results = await Search.find(
      {
        $text: { $search: query },
      },
      {
        score: { $meta: "textScore" },
      },
    )
      .sort({ score: { $meta: "textScore" } })
      .limit(10);

    res.status(200).json({
      success: true,
      data: results,
    });
  } catch (err) {
    logger.error("Search error occurred", err);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = {
  searchPostController,
};
