const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../db');
const config = require('../config');
const storage = require('../storage');
const mozlog = require('../log');

const log = mozlog('send.auth');

const SALT_ROUNDS = 12;
const JWT_EXPIRY = '7d';

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, tier: user.tier },
    config.jwt_secret,
    { expiresIn: JWT_EXPIRY }
  );
}

exports.register = async function(req, res) {
  if (!config.jwt_secret) {
    return res.sendStatus(501);
  }
  const { email, password, name } = req.body;
  if (!email || !password || password.length < 8) {
    return res.status(400).json({ error: 'Email and password (min 8 chars) required' });
  }
  try {
    const existing = await prisma.user.findFirst({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }
    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        email,
        name: name || null,
        hashedPassword,
        tier: 'FREE',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    });
    const token = signToken(user);
    res.json({ token, id: user.id, email: user.email, name: user.name, tier: user.tier });
  } catch (e) {
    log.error('register', e);
    res.sendStatus(500);
  }
};

exports.login = async function(req, res) {
  if (!config.jwt_secret) {
    return res.sendStatus(501);
  }
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  try {
    const user = await prisma.user.findFirst({ where: { email } });
    if (!user || !user.hashedPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const valid = await bcrypt.compare(password, user.hashedPassword);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = signToken(user);
    res.json({ token, id: user.id, email: user.email, name: user.name, tier: user.tier });
  } catch (e) {
    log.error('login', e);
    res.sendStatus(500);
  }
};

exports.me = async function(req, res) {
  if (!req.localUser) {
    return res.sendStatus(401);
  }
  try {
    const user = await prisma.user.findUnique({ where: { id: req.localUser.id } });
    if (!user) {
      return res.sendStatus(401);
    }
    res.json({ id: user.id, email: user.email, name: user.name, tier: user.tier });
  } catch (e) {
    log.error('me', e);
    res.sendStatus(500);
  }
};

exports.deleteUpload = async function(req, res) {
  if (!req.localUser) {
    return res.sendStatus(401);
  }
  const { sendFileId } = req.params;
  try {
    const upload = await prisma.upload.findUnique({ where: { sendFileId } });
    if (!upload || upload.ownerId !== req.localUser.id) {
      return res.sendStatus(403);
    }
    try {
      await storage.del(sendFileId);
    } catch (e) {
      // storage may already be gone — continue with DB cleanup
    }
    await prisma.upload.delete({ where: { sendFileId } });
    res.sendStatus(200);
  } catch (e) {
    log.error('deleteUpload', e);
    res.sendStatus(500);
  }
};

exports.uploads = async function(req, res) {
  if (!req.localUser) {
    return res.sendStatus(401);
  }
  try {
    const rows = await prisma.upload.findMany({
      where: { ownerId: req.localUser.id },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    const enriched = await Promise.all(rows.map(async row => {
      let alive = false, ttlMs = 0, dlimit = 1, dl = 0;
      if (row.sendFileId) {
        try {
          const meta = await storage.metadata(row.sendFileId);
          if (meta) {
            alive = true;
            ttlMs = await storage.ttl(row.sendFileId);
            dlimit = meta.dlimit;
            dl = meta.dl;
          }
        } catch (e) {
          // file may have been deleted — leave alive=false
        }
      }
      return {
        id: row.sendFileId,
        name: row.name || null,
        size: Number(row.size),
        createdAt: row.createdAt,
        alive,
        ttlMs,
        dlimit,
        dl
      };
    }));
    res.json(enriched);
  } catch (e) {
    log.error('uploads', e);
    res.sendStatus(500);
  }
};
