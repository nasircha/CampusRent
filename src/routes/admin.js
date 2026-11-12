const router = require('express').Router();
const prisma = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

router.get('/activity', requireAuth, requireAdmin, async (_req, res, next) => {
  try {
    const [totalUsers, verifiedUsers, totalSignups, totalLogins, totalLogouts, todaySignups, todayLogins, users, activities, lastLogins, userEvents] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { emailVerified: true } }),
      prisma.userActivity.count({ where: { event: 'signup' } }),
      prisma.userActivity.count({ where: { event: 'login' } }),
      prisma.userActivity.count({ where: { event: 'logout' } }),
      prisma.userActivity.count({ where: { event: 'signup', createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) } } }),
      prisma.userActivity.count({ where: { event: 'login', createdAt: { gte: new Date(new Date().setHours(0,0,0,0)) } } }),
      prisma.user.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, name: true, college: true, email: true, emailVerified: true, createdAt: true } }),
      prisma.userActivity.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, userId: true, name: true, college: true, email: true, event: true, createdAt: true } }),
      prisma.userActivity.groupBy({ by: ['userId'], where: { event: 'login', userId: { not: null } }, _max: { createdAt: true } }),
      prisma.userActivity.groupBy({ by: ['userId', 'event'], where: { userId: { not: null } }, _count: { _all: true } })
    ]);
    const loginMap = Object.fromEntries(lastLogins.filter(x => x.userId).map(x => [x.userId, x._max.createdAt]));
    const eventMap = {};
    userEvents.forEach(x => { if (!eventMap[x.userId]) eventMap[x.userId] = { signupCount: 0, loginCount: 0, logoutCount: 0 }; eventMap[x.userId][x.event + 'Count'] = x._count._all; });
    res.json({ summary: { totalUsers, verifiedUsers, totalSignups, totalLogins, totalLogouts, todaySignups, todayLogins }, users: users.map(u => ({ ...u, lastLoginAt: loginMap[u.id] || null, ...(eventMap[u.id] || { signupCount: 0, loginCount: 0, logoutCount: 0 }) })), activities });
  } catch (error) { next(error); }
});

module.exports = router;
