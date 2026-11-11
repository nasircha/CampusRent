
const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');

const { createOtp, verifyOtp } = require('../services/otp');
const { sendOtpEmail } = require('../services/email');

const credentials = z.object({
  email: z.string().email().max(254).transform(v => v.toLowerCase().trim()),
  password: z.string().min(8).max(128)
});

const signup = credentials.extend({
  name: z.string().trim().min(2).max(80),
  college: z.string().trim().max(100).optional().default('')
});

const verifySignup = signup.extend({
  otp: z.string().regex(/^\d{6}$/, 'Enter a valid 6-digit OTP.')
});
const resetPasswordSchema = z.object({
  email: z.string().email().max(254).transform(v => v.toLowerCase().trim()),
  otp: z.string().regex(/^\d{6}$/, 'Enter a valid 6-digit OTP.'),
  newPassword: z.string().min(8).max(128)
});

function issue(user) {
  return jwt.sign(
    { sub: user.id },
    process.env.JWT_SECRET,
    { expiresIn: '7d', issuer: 'campusrent' }
  );
}

// STEP 1: Send OTP
router.post('/send-otp', async (req, res, next) => {
  try {
    const parsed = signup.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0].message
      });
    }

    const { name, college, email } = parsed.data;

    const existing = await prisma.user.findUnique({
      where: { email }
    });

    if (existing) {
      return res.status(409).json({
        error: 'This email is already registered. Please log in.'
      });
    }

    const challenge = await createOtp('EMAIL', email);

    try {
      await sendOtpEmail(email, challenge.code);
    } catch (error) {
      await prisma.otpChallenge.update({
        where: { id: challenge.id },
        data: { consumedAt: new Date() }
      });
      throw error;
    }

    res.json({
      message: 'OTP sent successfully. Check your email.',
      expiresIn: 300
    });

  } catch (error) {
    next(error);
  }
});

// STEP 2: Verify OTP and create account
router.post('/verify-otp', async (req, res, next) => {
  try {
    const parsed = verifySignup.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0].message
      });
    }

    const { name, college, email, password, otp } = parsed.data;

    const existing = await prisma.user.findUnique({
      where: { email }
    });

    if (existing) {
      return res.status(409).json({
        error: 'This email is already registered. Please log in.'
      });
    }

    const valid = await verifyOtp('EMAIL', email, otp);

    if (!valid) {
      return res.status(400).json({
        error: 'Invalid or expired OTP. Please try again.'
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        college,
        email,
        passwordHash,
        emailVerified: true
      },
      select: {
        id: true,
        name: true,
        college: true,
        email: true
      }
    });

    res.status(201).json({
      token: issue(user),
      user
    });

  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(409).json({
        error: 'This email is already registered. Please log in.'
      });
    }

    next(error);
  }
});
// STEP 3: Send password reset OTP
router.post('/forgot-password', async (req, res, next) => {
  try {
    const parsed = z.object({
      email: z.string().email().max(254).transform(v => v.toLowerCase().trim())
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: 'Enter a valid email address.' });
    }

    const { email } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });

    if (user) {
      const challenge = await createOtp('EMAIL', email);

      try {
        await sendOtpEmail(email, challenge.code);
      } catch (error) {
        await prisma.otpChallenge.update({
          where: { id: challenge.id },
          data: { consumedAt: new Date() }
        });
        throw error;
      }
    }

    res.json({
      message: 'If this email is registered, a password reset OTP has been sent.'
    });
  } catch (error) {
    next(error);
  }
});
// STEP 4: Reset password using OTP
router.post('/reset-password', async (req, res, next) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: parsed.error.issues[0].message
      });
    }

    const { email, otp, newPassword } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(400).json({
        error: 'Invalid or expired OTP.'
      });
    }

    const valid = await verifyOtp('EMAIL', email, otp);

    if (!valid) {
      return res.status(400).json({
        error: 'Invalid or expired OTP.'
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { email },
      data: { passwordHash }
    });

    res.json({
      message: 'Password reset successfully. Please log in.'
    });
  } catch (error) {
    next(error);
  }
});
// Direct registration disabled
router.post('/register', (_req, res) => {
  res.status(403).json({
    error: 'Email verification is required before registration.'
  });
});

// Existing login
router.post('/login', async (req, res, next) => {
  try {
    const parsed = credentials.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Enter a valid email and password.'
      });
    }

    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email }
    });

    if (
      !user ||
      !(await bcrypt.compare(
        parsed.data.password,
        user.passwordHash
      ))
    ) {
      return res.status(401).json({
        error: 'Email or password is incorrect.'
      });
    }

    const safe = {
      id: user.id,
      name: user.name,
      college: user.college,
      email: user.email
    };

    res.json({
      token: issue(safe),
      user: safe
    });

  } catch (error) {
    next(error);
  }
});

router.post('/logout', (_req, res) => {
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
