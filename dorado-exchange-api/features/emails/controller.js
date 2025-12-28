import * as emailService from "#features/emails/service.js"

export async function sendCreatedEmail(req, res, next) {
  try {
    await emailService.sendCreatedEmail(req.body);
    return res.status(200).json({ success: true });
  } catch (err) {
    return next(err);
  }
}

export async function sendAcceptedEmail(req, res, next) {
  try {
    await emailService.sendAcceptedEmail(req.body);
    return res.status(200).json({ success: true });
  } catch (err) {
    return next(err);
  }
}
