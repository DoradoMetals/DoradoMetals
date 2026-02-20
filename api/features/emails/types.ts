export type EmailAttachment = {
  filename?: string;
  content?: string | Buffer;
  path?: string;
  cid?: string;
  contentType?: string;
  encoding?: string;
};

export type SendEmailArgs = {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachments?: EmailAttachment[];
};
