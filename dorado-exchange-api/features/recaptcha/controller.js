import * as recaptcha from "#providers/recaptcha/recaptcha.js"

export async function verifyRecaptcha (req, res, next) {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ error: "Missing captcha token" });
    }
    const isHuman = await recaptcha.verifyToken(token);
    return res.json(isHuman);
  } catch (err) {
    next(err);
  }
};
