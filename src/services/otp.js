
const crypto = require('crypto');
const prisma = require('../db');

const OTP_EXPIRY_MINUTES = 5;
const MAX_ATTEMPTS = 5;

function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function hashOtp(channel, destination, code) {
  const secret = process.env.OTP_SECRET;

  if (!secret) {
    throw new Error('OTP_SECRET is missing from .env');
  }

  return crypto
    .createHmac('sha256', secret)
    .update(`${channel}:${destination}:${code}`)
    .digest('hex');
}

function verifyHash(channel, destination, code, storedHash) {
  const actual = Buffer.from(
    hashOtp(channel, destination, code),
    'hex'
  );

  const expected = Buffer.from(storedHash, 'hex');

  return actual.length === expected.length &&
    crypto.timingSafeEqual(actual, expected);
}

async function createOtp(channel, destination) {
  const code = generateOtp();
  const codeHash = hashOtp(channel, destination, code);

  // Previous unused OTPs ko invalidate karo.
  await prisma.otpChallenge.updateMany({
    where: {
      channel,
      destination,
      consumedAt: null
    },
    data: {
      consumedAt: new Date()
    }
  });

  const challenge = await prisma.otpChallenge.create({
    data: {
      channel,
      destination,
      codeHash,
      expiresAt: new Date(
        Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000
      )
    }
  });

  return {
    id: challenge.id,
    code,
    expiresAt: challenge.expiresAt
  };
}

async function verifyOtp(channel, destination, code) {
  const challenge = await prisma.otpChallenge.findFirst({
    where: {
      channel,
      destination,
      consumedAt: null,
      expiresAt: { gt: new Date() }
    },
    orderBy: {
      createdAt: 'desc'
    }
  });

  if (!challenge || challenge.attempts >= MAX_ATTEMPTS) {
    return false;
  }

  const valid = verifyHash(
    channel,
    destination,
    code,
    challenge.codeHash
  );

  if (!valid) {
    const nextAttempts = challenge.attempts + 1;

    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: {
        attempts: { increment: 1 },
        ...(nextAttempts >= MAX_ATTEMPTS
          ? { consumedAt: new Date() }
          : {})
      }
    });

    return false;
  }

  await prisma.otpChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() }
  });

  return true;
}

module.exports = {
  createOtp,
  verifyOtp
};
