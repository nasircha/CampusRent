const crypto = require('crypto');

function encryptionKey() {
  const raw = process.env.COLLEGE_ID_ENCRYPTION_KEY || '';
  let key;
  if (/^[a-f0-9]{64}$/i.test(raw)) key = Buffer.from(raw, 'hex');
  else {
    try { key = Buffer.from(raw, 'base64'); } catch (_) { key = Buffer.alloc(0); }
  }
  if (!key || key.length !== 32) {
    const error = new Error('College ID secure storage is not configured.'); error.status = 503; throw error;
  }
  return key;
}

function encryptCollegeId(buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encryptedData = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return { encryptedData, iv, authTag: cipher.getAuthTag() };
}

function decryptCollegeId(record) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(record.iv));
  decipher.setAuthTag(Buffer.from(record.authTag));
  return Buffer.concat([decipher.update(Buffer.from(record.encryptedData)), decipher.final()]);
}

module.exports = { encryptCollegeId, decryptCollegeId };
