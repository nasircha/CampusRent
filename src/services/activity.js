const prisma = require('../db');

async function recordActivity(user, event) {
  if (!user || !['signup', 'login', 'logout'].includes(event)) return;
  try {
    await prisma.userActivity.create({
      data: {
        userId: user.id || null,
        name: user.name || 'Unknown user',
        college: user.college || '',
        email: String(user.email || '').trim().toLowerCase(),
        event
      }
    });
  } catch (error) {
    console.error('Could not record user activity:', error.message);
  }
}

module.exports = { recordActivity };
