const { auth } = require("../auth"); // Import BetterAuth instance

const authenticateUser = async (req, res, next) => {
  try {
    const session = await auth.getSession(req); // Extract session from request

    if (!session || !session.user) {
      return res.status(401).json({ message: "Unauthorized: No valid session" });
    }

    req.user = session.user; // Attach authenticated user to the request
    next();
  } catch (error) {
    console.error("Error in authentication middleware:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

module.exports = authenticateUser;
