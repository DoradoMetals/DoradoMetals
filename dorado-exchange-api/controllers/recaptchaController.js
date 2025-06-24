const recaptchaService = require("../services/recaptchaService");

const verifyRecaptcha = async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: "Missing captcha token" });
    }
    const isHuman = await recaptchaService.verifyToken(token);
    return res.json(isHuman);
  } catch (err) {
    next(err);
  }
};

module.exports = {
  verifyRecaptcha,
}
