const { getGmailClient } = require('./gmailAuth');

async function sendGmailEmail(userId, to, subject, body) {
  const gmail = await getGmailClient(userId);
  
  // Build MIME message
  const message = [
    `To: ${to}`,
    `Subject: ${subject}`,
    `Content-Type: text/plain; charset=UTF-8`,
    '',
    body,
  ].join('\n');

  // Base64url encode
  const encodedMessage = Buffer.from(message).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  // Send
  const sendRes = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encodedMessage,
    },
  });
  const apiMessageId = sendRes.data.id;
  console.log('📤 Email sent, API ID:', apiMessageId);

  // Try to retrieve the real Message‑ID header (case‑insensitive)
  let headerMessageId = apiMessageId; // fallback
  try {
    const msg = await gmail.users.messages.get({
      userId: 'me',
      id: apiMessageId,
      format: 'metadata',
      metadataHeaders: ['Message-ID'],   // Gmail may return it as 'Message-Id'
    });

    if (msg.data.payload && msg.data.payload.headers) {
      const headers = msg.data.payload.headers;
      const found = headers.find(h => h.name.toLowerCase() === 'message-id');
      if (found) {
        headerMessageId = found.value;
        console.log('✅ Real Message‑ID:', headerMessageId);
      } else {
        console.warn('⚠️ Message‑ID header not found in metadata');
      }
    }
  } catch (err) {
    console.error('❌ Failed to fetch real Message‑ID:', err.message);
  }

  return {
    messageId: apiMessageId,           // short API ID (kept for reference)
    headerMessageId: headerMessageId,  // long RFC 2822 ID (for reply detection)
  };
}

module.exports = { sendGmailEmail };