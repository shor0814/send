const crypto = require('crypto');
const storage = require('../storage');
const config = require('../config');
const mozlog = require('../log');
const Limiter = require('../limiter');
const { encryptedSize } = require('../../app/utils');
const prisma = require('../db');

const log = mozlog('send.upload');

module.exports = async function(req, res) {
  const newId = crypto.randomBytes(8).toString('hex');
  const metadata = req.header('X-File-Metadata');
  const auth = req.header('Authorization');
  if (!metadata || !auth) {
    return res.sendStatus(400);
  }
  const owner = crypto.randomBytes(10).toString('hex');
  const meta = {
    owner,
    metadata,
    auth: auth.split(' ')[1],
    nonce: crypto.randomBytes(16).toString('base64')
  };

  try {
    const limiter = new Limiter(encryptedSize(config.max_file_size));
    const fileStream = req.pipe(limiter);
    //this hasn't been updated to expiration time setting yet
    //if you want to fallback to this code add this
    await storage.set(newId, fileStream, meta, config.default_expire_seconds);

    // Track upload ownership in PostgreSQL for logged-in local users
    if (req.localUser && req.localUser.id) {
      try {
        await prisma.upload.create({
          data: {
            id: crypto.randomUUID(),
            sendFileId: newId,
            size: BigInt(limiter.length || 0),
            ownerId: req.localUser.id,
            type: req.header('Content-Type') || 'application/octet-stream',
            createdAt: new Date()
          }
        });
      } catch (e) {
        log.error('pg-upload-create', e);
        // non-fatal
      }
    }

    const url = `${config.deriveBaseUrl(req)}/download/${newId}/`;
    res.set('WWW-Authenticate', `send-v1 ${meta.nonce}`);
    res.json({
      url,
      owner: meta.owner,
      id: newId
    });
  } catch (e) {
    if (e.message === 'limit') {
      return res.sendStatus(413);
    }
    log.error('upload', e);
    res.sendStatus(500);
  }
};
