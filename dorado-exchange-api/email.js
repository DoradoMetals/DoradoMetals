const nodemailer = require("nodemailer") ;

// Create a transport (replace these settings with your actual SMTP provider)
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || "587"),
  secure: false, // Set to true if using port 465
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

const sendEmail = async ({ to, subject, text }) => {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM, // Your email sender address
    to,
    subject,
    text,
  });

  console.log(`📨 Sent email to ${to} with subject: ${subject}`);
}

module.exports = {
  sendEmail,
}