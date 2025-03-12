const { auth } = require("../auth");
const { fromNodeHeaders } = require("better-auth/node");

const requireAuth = async (req, res, next) => {

  try {
    if (!req.headers) {
      return res.status(400).json({ error: "Bad Request", message: "Headers are missing" });
    }

    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });

    if (!session || !session.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.user = session.user; // Attach user data to the request
    next();
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = { requireAuth };
