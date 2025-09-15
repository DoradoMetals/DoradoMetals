import * as emailService from '../services/emailService.js';

export async function sendCreatedEmail(req, res, next) {
  try {
    await emailService.sendCreatedEmail(req.body);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('sendCreatedEmail failed:', err);
    return next(err);
  }
}

export async function sendAcceptedEmail(req, res, next) {
  try {
    await emailService.sendAcceptedEmail(req.body);
    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('sendAcceptedEmail failed:', err);
    return next(err);
  }
}
