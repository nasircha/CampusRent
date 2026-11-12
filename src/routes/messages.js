
const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);


function directChatPair(a, b) {
  return a < b ? { starterId: a, receiverId: b } : { starterId: b, receiverId: a };
}

// Search verified Gmail accounts by the part before @gmail.com.
router.get('/users/search', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (!/^[a-z0-9._]{3,30}$/.test(q)) {
      return res.json({ users: [] });
    }
    const users = await prisma.user.findMany({
      where: {
        id: { not: req.user.id },
        emailVerified: true,
        email: { startsWith: q, endsWith: '@gmail.com' }
      },
      select: { id: true, name: true, college: true, email: true },
      take: 10,
      orderBy: { name: 'asc' }
    });
    res.json({ users: users.map(u => ({
      id: u.id, name: u.name, college: u.college,
      emailHint: u.email.replace(/^(.{2}).*(@gmail\\.com)$/, '$1•••$2')
    })) });
  } catch (error) { next(error); }
});

// Direct-message requests: inbox and sent requests.
router.get('/requests', async (req, res, next) => {
  try {
    const rows = await prisma.directMessageRequest.findMany({
      where: { OR: [{ receiverId: req.user.id }, { senderId: req.user.id }] },
      include: {
        sender: { select: { id: true, name: true, college: true } },
        receiver: { select: { id: true, name: true, college: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ requests: rows });
  } catch (error) { next(error); }
});

router.post('/requests', async (req, res, next) => {
  try {
    const parsed = z.object({ userId: z.string().min(1) }).safeParse(req.body || {});
    if (!parsed.success || parsed.data.userId === req.user.id)
      return res.status(400).json({ error: 'Choose another student.' });
    const target = await prisma.user.findFirst({
      where: { id: parsed.data.userId, emailVerified: true, email: { endsWith: '@gmail.com' } },
      select: { id: true }
    });
    if (!target) return res.status(404).json({ error: 'Verified Gmail account not found.' });
    const pair = directChatPair(req.user.id, target.id);
    const existingChat = await prisma.directChat.findUnique({ where: { starterId_receiverId: pair } });
    if (existingChat) return res.status(409).json({ error: 'You are already connected. Find the chat in Messages.' });
    const request = await prisma.directMessageRequest.upsert({
      where: { senderId_receiverId: { senderId: req.user.id, receiverId: target.id } },
      create: { senderId: req.user.id, receiverId: target.id },
      update: { status: 'pending' }
    });
    res.status(201).json({ request });
  } catch (error) { next(error); }
});

router.patch('/requests/:id', async (req, res, next) => {
  try {
    const parsed = z.object({ decision: z.enum(['approved', 'declined']) }).safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Choose approve or decline.' });
    const request = await prisma.directMessageRequest.findUnique({ where: { id: req.params.id } });
    if (!request || request.receiverId !== req.user.id)
      return res.status(404).json({ error: 'Message request not found.' });
    if (request.status !== 'pending')
      return res.status(409).json({ error: 'This request has already been handled.' });
    const updated = await prisma.$transaction(async tx => {
      const row = await tx.directMessageRequest.update({
        where: { id: request.id }, data: { status: parsed.data.decision }
      });
      if (parsed.data.decision === 'approved') {
        const pair = directChatPair(request.senderId, request.receiverId);
        await tx.directChat.upsert({
          where: { starterId_receiverId: pair },
          create: pair, update: {}
        });
      }
      return row;
    });
    res.json({ request: updated });
  } catch (error) { next(error); }
});

// Accepted personal chats.
router.get('/direct', async (req, res, next) => {
  try {
    const chats = await prisma.directChat.findMany({
      where: { OR: [{ starterId: req.user.id }, { receiverId: req.user.id }] },
      include: {
        starter: { select: { id: true, name: true, college: true } },
        receiver: { select: { id: true, name: true, college: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 }
      },
      orderBy: { updatedAt: 'desc' }
    });
    res.json({ chats });
  } catch (error) { next(error); }
});

router.get('/direct/:id/messages', async (req, res, next) => {
  try {
    const chat = await prisma.directChat.findUnique({ where: { id: req.params.id } });
    if (!chat || (chat.starterId !== req.user.id && chat.receiverId !== req.user.id))
      return res.status(404).json({ error: 'Chat not found.' });
    const now = new Date();
    await prisma.directChatMessage.updateMany({
      where: { chatId: chat.id, senderId: { not: req.user.id }, seenAt: null },
      data: { seenAt: now }
    });
    const messages = await prisma.directChatMessage.findMany({
      where: { chatId: chat.id },
      include: { sender: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'asc' }
    });
    const otherId = chat.starterId === req.user.id ? chat.receiverId : chat.starterId;
    const other = await prisma.user.findUnique({
      where: { id: otherId }, select: { id: true, name: true, college: true }
    });
    res.json({ chat, other, messages });
  } catch (error) { next(error); }
});

router.post('/direct/:id/messages', async (req, res, next) => {
  try {
    const parsed = z.object({ body: z.string().trim().min(1).max(2000) }).safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Message must contain 1 to 2000 characters.' });
    const chat = await prisma.directChat.findUnique({ where: { id: req.params.id } });
    if (!chat || (chat.starterId !== req.user.id && chat.receiverId !== req.user.id))
      return res.status(404).json({ error: 'Chat not found.' });
    const message = await prisma.$transaction(async tx => {
      const created = await tx.directChatMessage.create({
        data: { chatId: chat.id, senderId: req.user.id, body: parsed.data.body },
        include: { sender: { select: { id: true, name: true } } }
      });
      await tx.directChat.update({ where: { id: chat.id }, data: { updatedAt: new Date() } });
      return created;
    });
    res.status(201).json({ message });
  } catch (error) { next(error); }
});

// Get all conversations
router.get('/', async (req, res, next) => {
  try {
    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { renterId: req.user.id },
          { item: { ownerId: req.user.id } }
        ]
      },
      include: {
        item: {
          select: {
            id: true,
            title: true,
            photo: true,
            ownerId: true,
            owner: { select: { id: true, name: true } }
          }
        },
        renter: { select: { id: true, name: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          include: {
            sender: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    const conversationsWithUnread = await Promise.all(
      conversations.map(async function(c) {
        const isRenter = c.renterId === req.user.id;

        const lastReadAt = isRenter
          ? c.renterLastReadAt
          : c.ownerLastReadAt;

        const unreadCount = await prisma.message.count({
          where: {
            conversationId: c.id,
            senderId: { not: req.user.id },
            ...(lastReadAt ? {
              createdAt: { gt: lastReadAt }
            } : {})
          }
        });

        return {
          ...c,
          unreadCount: unreadCount
        };
      })
    );

    res.json({ conversations: conversationsWithUnread });
  } catch (error) {
    next(error);
  }
});

// Start or find a conversation for an item
router.post('/', async (req, res, next) => {
  try {
    const parsed = z.object({
      itemId: z.string().min(1)
    }).safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid item ID is required.' });
    }

    const item = await prisma.item.findUnique({
      where: { id: parsed.data.itemId },
      select: { id: true, ownerId: true, status: true }
    });

    if (!item || item.status === 'deleted') {
      return res.status(404).json({ error: 'Listing not found.' });
    }

    if (item.ownerId === req.user.id) {
      return res.status(400).json({ error: 'You cannot message yourself.' });
    }

    const conversation = await prisma.conversation.upsert({
      where: {
        itemId_renterId: {
          itemId: item.id,
          renterId: req.user.id
        }
      },
      create: {
        itemId: item.id,
        renterId: req.user.id
      },
      update: {},
      include: {
        item: {
          select: {
            id: true,
            title: true,
            photo: true,
            ownerId: true,
            owner: { select: { id: true, name: true } }
          }
        }
      }
    });

    res.status(200).json({ conversation });
  } catch (error) {
    next(error);
  }
});

// Get messages in a conversation

router.get('/:id/messages', async (req, res, next) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: {
        item: {
          select: {
            id: true,
            title: true,
            ownerId: true,
            owner: { select: { id: true, name: true } }
          }
        },
        renter: { select: { id: true, name: true } }
      }
    });

    if (
      !conversation ||
      (conversation.renterId !== req.user.id &&
       conversation.item.ownerId !== req.user.id)
    ) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    const now = new Date();

    const readField = conversation.renterId === req.user.id
      ? 'renterLastReadAt'
      : 'ownerLastReadAt';

    await prisma.$transaction([
      prisma.conversation.update({
        where: { id: conversation.id },
        data: { [readField]: now }
      }),
      prisma.message.updateMany({
        where: {
          conversationId: conversation.id,
          senderId: { not: req.user.id },
          seenAt: null
        },
        data: { seenAt: now }
      })
    ]);

    const messages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      include: {
        sender: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: 'asc' }
    });

    res.json({ conversation, messages });
  } catch (error) {
    next(error);
  }
});


// Send a message
router.post('/:id/messages', async (req, res, next) => {
  try {
    const parsed = z.object({
      body: z.string().trim().min(1).max(2000)
    }).safeParse(req.body || {});

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Message must contain 1 to 2000 characters.'
      });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: {
        item: { select: { ownerId: true } }
      }
    });

    if (
      !conversation ||
      (conversation.renterId !== req.user.id &&
       conversation.item.ownerId !== req.user.id)
    ) {
      return res.status(404).json({ error: 'Conversation not found.' });
    }

    const now = new Date();
    const readField = conversation.renterId === req.user.id
      ? 'renterLastReadAt'
      : 'ownerLastReadAt';

    const message = await prisma.$transaction(async tx => {
      const created = await tx.message.create({
        data: {
          conversationId: conversation.id,
          senderId: req.user.id,
          body: parsed.data.body
        },
        include: {
          sender: { select: { id: true, name: true } }
        }
      });

      await tx.conversation.update({
        where: { id: conversation.id },
        data: { [readField]: now }
      });

      return created;
    });

    res.status(201).json({ message });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
