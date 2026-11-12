const jwt = require('jsonwebtoken');
const prisma = require('../db');

function isAdminEmail(email) {
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  return !!adminEmail && String(email || '').trim().toLowerCase() === adminEmail;
}

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ error: 'Please log in to continue.' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, name: true, college: true, email: true } });
    if (!user) return res.status(401).json({ error: 'Your session is no longer valid. Please log in again.' });
    req.user = { ...user, isAdmin: isAdminEmail(user.email) };
    next();
  } catch (_) { return res.status(401).json({ error: 'Your session is invalid or expired. Please log in again.' }); }
}

function requireAdmin(req, res, next) {
  if (!req.user || !req.user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });
  next();
}

module.exports = { requireAuth, requireAdmin, isAdminEmail };
