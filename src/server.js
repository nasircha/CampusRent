require('dotenv').config();
const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const prisma = require('./db');
const app = express();
// Vercel runs Express behind a trusted proxy.
app.set('trust proxy', 1);
const PORT = Number(process.env.PORT || 3000);
if (!process.env.DATABASE_URL || !process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error('Missing DATABASE_URL or JWT_SECRET (must be at least 32 characters).'); process.exit(1);
}
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
if (process.env.CORS_ORIGIN) app.use(cors({ origin: process.env.CORS_ORIGIN.split(',').map(s => s.trim()), credentials: false }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-7', legacyHeaders: false }));
app.get('/api/health', async (_req, res) => { await prisma.$queryRaw`SELECT 1`; res.json({ ok: true, service: 'CampusRent API' }); });
app.use('/api/auth', require('./routes/auth'));
app.use('/api/bootstrap', require('./routes/bootstrap'));
app.use('/api/items', require('./routes/items'));
app.use('/api/rentals', require('./routes/rentals'));
app.use('/api/messages', require('./routes/messages'));
app.use('/uploads', express.static(path.join(__dirname, '../uploads'), { maxAge: '7d', immutable: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.get('*path', (_req, res) => res.sendFile(path.join(__dirname, '../public/index.html')));
app.use((err, _req, res, _next) => {
  console.error(err);
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `Photo must be smaller than ${process.env.MAX_UPLOAD_MB || 5} MB.` });
  if (err.message === 'Upload a JPEG, PNG, WebP, or GIF image.') return res.status(400).json({ error: err.message });
  if (err instanceof SyntaxError && 'body' in err) return res.status(400).json({ error: 'Invalid request body.' });
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong. Please try again.' });
});
const server = app.listen(PORT, () => console.log(`CampusRent running at http://localhost:${PORT}`));
async function shutdown() { server.close(); await prisma.$disconnect(); process.exit(0); }
process.on('SIGINT', shutdown); process.on('SIGTERM', shutdown);
