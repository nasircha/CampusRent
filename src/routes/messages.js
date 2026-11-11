
const router = require('express').Router();
const { z } = require('zod');
const prisma = require('../db');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

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
