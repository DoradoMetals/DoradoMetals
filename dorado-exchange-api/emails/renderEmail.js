const fs = require('fs');
const path = require('path');

function renderTemplate(contentFile, { firstName = 'there', url }) {
  const layoutPath = path.join(__dirname, 'templates', 'baseLayout.raw.html');
  const contentPath = path.join(__dirname, 'templates', contentFile);

  const layout = fs.readFileSync(layoutPath, 'utf8');
  const content = fs.readFileSync(contentPath, 'utf8');

  const finalHtml = layout
    .replace('[BODY]', content)
    .replace(/\[First Name\]/g, firstName)
    .replace(/href=""/g, `href="${url}"`);

  return finalHtml;
}

// Specific email renderers
function renderAccountCreatedEmail({ firstName, url }) {
  return renderTemplate('accountCreated.raw.html', { firstName, url });
}

function renderResetPasswordEmail({ firstName, url }) {
  return renderTemplate('resetPassword.raw.html', { firstName, url });
}

function renderVerifyEmail({ firstName, url }) {
  return renderTemplate('verifyEmail.raw.html', { firstName, url });
}

function renderChangeEmail({ firstName, url }) {
  return renderTemplate('changeEmail.raw.html', { firstName, url });
}

function renderCreateAccountEmail({firstName, url}) {
  return renderTemplate('createAccount.raw.html', {firstName, url});
}

module.exports = {
  renderAccountCreatedEmail,
  renderResetPasswordEmail,
  renderVerifyEmail,
  renderChangeEmail,
  renderCreateAccountEmail,
};
