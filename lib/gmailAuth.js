const { google } = require('googleapis');
const { supabaseAdmin } = require('./supabase');
const crypto = require('crypto');
const listenersAttached = new Set();

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

// Encrypt refresh token before storing
function encryptToken(text) {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

// Decrypt refresh token
function decryptToken(encrypted) {
  const [ivHex, enc] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let decrypted = decipher.update(enc, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// Get authenticated Gmail client for a user
// Keep track of attached handler per user to avoid duplicating listeners

async function getGmailClient(userId) {
  const { data: tokenRecord } = await supabaseAdmin
    .from('user_gmail_tokens')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (!tokenRecord) throw new Error('Gmail not connected');

  oauth2Client.setCredentials({
    access_token: tokenRecord.access_token,
    refresh_token: decryptToken(tokenRecord.refresh_token),
    expiry_date: tokenRecord.expiry_date,
  });

  // Attach the refresh handler only once per user
  if (!listenersAttached.has(userId)) {
    oauth2Client.on('tokens', async (tokens) => {
      if (tokens.refresh_token) {
        await supabaseAdmin
          .from('user_gmail_tokens')
          .update({
            access_token: tokens.access_token,
            refresh_token: encryptToken(tokens.refresh_token),
            expiry_date: tokens.expiry_date,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
      }
    });
    listenersAttached.add(userId);
  }

  return google.gmail({ version: 'v1', auth: oauth2Client });
}

module.exports = { oauth2Client, encryptToken, decryptToken, getGmailClient };