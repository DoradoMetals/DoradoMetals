const axios = require("axios")

async function verifyToken(token) {
  if (!token) {
    throw new Error("Captcha token is missing");
  }

  const params = new URLSearchParams();
  params.append("secret", process.env.RECAPTCHA_SECRET_KEY);
  params.append("response", token);

  const threshold = parseFloat(process.env.RECAPTCHA_THRESHOLD || "0.5");

  const response = await axios.post(
    "https://www.google.com/recaptcha/api/siteverify",
    params
  );
  const { success, score } = response.data;

  return success && (score || 0) >= threshold;
}

module.exports = {
  verifyToken,
};
