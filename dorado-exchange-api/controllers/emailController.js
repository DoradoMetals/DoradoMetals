const emailService = require('../services/emailService');

async function sendCreatedEmail(req, res, next) {
  try {
    await emailService.sendCreatedEmail(req.body);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('sendCreatedEmail failed:', err);
    return next(err);
  }
}

async function sendAcceptedEmail(req, res, next) {
  try {
    await emailService.sendAcceptedEmail(req.body);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('sendAcceptedEmail failed:', err);
    return next(err);
  }
}

module.exports = {
  sendCreatedEmail,
  sendAcceptedEmail
};
