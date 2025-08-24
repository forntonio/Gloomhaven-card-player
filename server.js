const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Helper functions for database operations
function loadDb() {
  const data = fs.readFileSync(path.join(__dirname, 'db.json'), 'utf8');
  return JSON.parse(data);
}

function saveDb(db) {
  fs.writeFileSync(path.join(__dirname, 'db.json'), JSON.stringify(db, null, 2));
}

// Session storage in memory. Maps token to username.
const sessions = {};

// Parse the body of a request (JSON only)
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        if (body) {
          resolve(JSON.parse(body));
        } else {
          resolve({});
        }
      } catch (e) {
        reject(e);
      }
    });
  });
}

// Parse cookies from request headers
function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const key = parts.shift().trim();
    const value = decodeURIComponent(parts.join('='));
    list[key] = value;
  });
  return list;
}

// Generate a random token for session
function generateToken() {
  return crypto.randomBytes(16).toString('hex');
}

// Generate a password hash using pbkdf2
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

// Verify a password against a stored hash
function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));
}

// Require authentication for an endpoint. Optionally require a specific role.
function requireAuth(req, res, role) {
  const cookies = parseCookies(req);
  const token = cookies.token;
  if (!token || !sessions[token]) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return null;
  }
  const username = sessions[token];
  const db = loadDb();
  const user = db.users.find(u => u.username === username);
  if (!user) {
    delete sessions[token];
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Unauthorized' }));
    return null;
  }
  if (role && user.role !== role) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return null;
  }
  return user;
}

// Serve static files from the public directory
function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const pathname = decodeURIComponent(url.pathname.replace(/^\/public\//, ''));
  const filePath = path.join(__dirname, 'public', pathname);
  if (!filePath.startsWith(path.join(__dirname, 'public'))) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath);
    const mimeMap = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.svg': 'image/svg+xml',
      '.json': 'application/json'
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

// Create the HTTP server
const server = http.createServer(async (req, res) => {
  // Redirect root to login page
  if (req.method === 'GET' && (req.url === '/' || req.url === '/public')) {
    res.writeHead(302, { Location: '/public/login.html' });
    res.end();
    return;
  }
  // Serve static assets
  if (req.method === 'GET' && req.url.startsWith('/public/')) {
    serveStatic(req, res);
    return;
  }
  // Login endpoint
  if (req.method === 'POST' && req.url === '/api/login') {
    try {
      const body = await parseBody(req);
      const { username, password } = body;
      const db = loadDb();
      const user = db.users.find(u => u.username === username);
      if (!user) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid username or password' }));
        return;
      }
      // If passwordHash is null, set new password
      if (user.passwordHash === null) {
        if (!password || password.length < 4) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Password must be at least 4 characters' }));
          return;
        }
        user.passwordHash = hashPassword(password);
        saveDb(db);
      } else {
        // verify
        if (!verifyPassword(password, user.passwordHash)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid username or password' }));
          return;
        }
      }
      // create session
      const token = generateToken();
      sessions[token] = user.username;
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `token=${token}; HttpOnly; Path=/`
      });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }
  // Get current user info
  if (req.method === 'GET' && req.url === '/api/user') {
    const user = requireAuth(req, res);
    if (!user) return;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ username: user.username, role: user.role }));
    return;
  }
  // Users: create new user
  if (req.method === 'POST' && req.url === '/api/users') {
    const currentUser = requireAuth(req, res, 'admin');
    if (!currentUser) return;
    try {
      const body = await parseBody(req);
      const { username, role } = body;
      if (!username || !role || !(role === 'admin' || role === 'player')) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid data' }));
        return;
      }
      const db = loadDb();
      if (db.users.find(u => u.username === username)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Username already exists' }));
        return;
      }
      db.users.push({ username, passwordHash: null, role });
      saveDb(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }
  // Users: list all users (admin only)
  if (req.method === 'GET' && req.url === '/api/users') {
    const currentUser = requireAuth(req, res, 'admin');
    if (!currentUser) return;
    const db = loadDb();
    const usersList = db.users.map(u => ({ username: u.username, role: u.role }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(usersList));
    return;
  }
  // Users: reset password
  if (req.method === 'POST' && req.url.startsWith('/api/users/') && req.url.endsWith('/reset')) {
    const currentUser = requireAuth(req, res, 'admin');
    if (!currentUser) return;
    const username = decodeURIComponent(req.url.split('/')[3]);
    const db = loadDb();
    const user = db.users.find(u => u.username === username);
    if (!user) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'User not found' }));
      return;
    }
    user.passwordHash = null;
    saveDb(db);
    // remove sessions for that user
    for (const token in sessions) {
      if (sessions[token] === username) delete sessions[token];
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
    return;
  }
  // Games list
  if (req.method === 'GET' && req.url === '/api/games') {
    const user = requireAuth(req, res);
    if (!user) return;
    const db = loadDb();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(db.games));
    return;
  }
  // Add game
  if (req.method === 'POST' && req.url === '/api/games') {
    const currentUser = requireAuth(req, res, 'admin');
    if (!currentUser) return;
    try {
      const body = await parseBody(req);
      const { name } = body;
      if (!name) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Name required' }));
        return;
      }
      const db = loadDb();
      const id = db.nextIds.gameId++;
      db.games.push({ id, name });
      saveDb(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id, name }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }
  // Classes list (filtered by gameId query param)
  if (req.method === 'GET' && req.url.startsWith('/api/classes')) {
    const user = requireAuth(req, res);
    if (!user) return;
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const gameId = urlObj.searchParams.get('gameId');
    const db = loadDb();
    let result = db.classes;
    if (gameId) {
      const gid = parseInt(gameId, 10);
      result = result.filter(cls => cls.gameId === gid);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }
  // Add class
  if (req.method === 'POST' && req.url === '/api/classes') {
    const currentUser = requireAuth(req, res, 'admin');
    if (!currentUser) return;
    try {
      const body = await parseBody(req);
      const { gameId, name, handSize } = body;
      const db = loadDb();
      if (!name || !gameId || !handSize) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid data' }));
        return;
      }
      const id = db.nextIds.classId++;
      db.classes.push({ id, gameId: parseInt(gameId, 10), name, handSize: parseInt(handSize, 10) });
      saveDb(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id, gameId: parseInt(gameId, 10), name, handSize: parseInt(handSize, 10) }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }
  // Cards list (filtered by classId and level)
  if (req.method === 'GET' && req.url.startsWith('/api/cards')) {
    const user = requireAuth(req, res);
    if (!user) return;
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const classId = urlObj.searchParams.get('classId');
    const levelParam = urlObj.searchParams.get('level');
    const level = levelParam ? parseInt(levelParam, 10) : null;
    const db = loadDb();
    let cards = db.cards;
    if (classId) {
      cards = cards.filter(c => c.classId === parseInt(classId, 10));
    }
    if (level !== null) {
      cards = cards.filter(c => c.level <= level);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(cards));
    return;
  }
  // Add card
  if (req.method === 'POST' && req.url === '/api/cards') {
    const currentUser = requireAuth(req, res, 'admin');
    if (!currentUser) return;
    try {
      const body = await parseBody(req);
      let { classId, name, level, image } = body;
      if (!classId || !name || level === undefined) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid data' }));
        return;
      }
      const db = loadDb();
      const id = db.nextIds.cardId++;
      level = parseInt(level, 10);
      classId = parseInt(classId, 10);
      db.cards.push({ id, classId, name, level, image: image || '' });
      saveDb(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id, classId, name, level, image: image || '' }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }
  // Characters list
  if (req.method === 'GET' && req.url === '/api/characters') {
    const user = requireAuth(req, res);
    if (!user) return;
    const db = loadDb();
    let chars;
    if (user.role === 'admin') {
      chars = db.characters;
    } else {
      chars = db.characters.filter(ch => ch.username === user.username);
    }
    // Return minimal info
    const result = chars.map(ch => ({ id: ch.id, name: ch.name, gameId: ch.gameId, classId: ch.classId, level: ch.level }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    return;
  }
  // Create character
  if (req.method === 'POST' && req.url === '/api/characters') {
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const body = await parseBody(req);
      let { name, gameId, classId, level } = body;
      if (!name || !gameId || !classId || level === undefined) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid data' }));
        return;
      }
      const db = loadDb();
      gameId = parseInt(gameId, 10);
      classId = parseInt(classId, 10);
      level = parseInt(level, 10);
      // verify game and class exist
      const game = db.games.find(g => g.id === gameId);
      const cls = db.classes.find(c => c.id === classId);
      if (!game || !cls || cls.gameId !== gameId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid game or class' }));
        return;
      }
      const id = db.nextIds.characterId++;
      db.characters.push({ id, username: user.username, name, gameId, classId, level, zones: { hand: [], active: [], discard: [], lost: [] } });
      saveDb(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id, name, gameId, classId, level }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }
  // Get character details
  if (req.method === 'GET' && req.url.startsWith('/api/characters/')) {
    const parts = req.url.split('/').filter(Boolean);
    const idStr = parts[1];
    // handle special endpoints below
    if (idStr && !isNaN(idStr)) {
      const user = requireAuth(req, res);
      if (!user) return;
      const charId = parseInt(idStr, 10);
      const db = loadDb();
      const ch = db.characters.find(c => c.id === charId);
      if (!ch) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Character not found' }));
        return;
      }
      if (user.role !== 'admin' && ch.username !== user.username) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden' }));
        return;
      }
      // Build detailed response: zones with card info
      const classCards = db.cards.filter(c => c.classId === ch.classId);
      function cardInfo(id) {
        const card = classCards.find(c => c.id === id);
        if (!card) return null;
        return { id: card.id, name: card.name, level: card.level, image: card.image };
      }
      function activeInfo(obj) {
        const card = classCards.find(c => c.id === obj.id);
        if (!card) return null;
        return { id: card.id, name: card.name, level: card.level, image: card.image, counter: obj.counter };
      }
      const zones = {
        hand: ch.zones.hand.map(cardInfo).filter(Boolean),
        active: ch.zones.active.map(activeInfo).filter(Boolean),
        discard: ch.zones.discard.map(cardInfo).filter(Boolean),
        lost: ch.zones.lost.map(cardInfo).filter(Boolean)
      };
      const response = {
        id: ch.id,
        name: ch.name,
        gameId: ch.gameId,
        classId: ch.classId,
        level: ch.level,
        handSize: db.classes.find(c => c.id === ch.classId).handSize,
        zones
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(response));
      return;
    }
  }
  // Set character hand
  if (req.method === 'POST' && req.url.startsWith('/api/characters/') && req.url.endsWith('/hand')) {
    const parts = req.url.split('/').filter(Boolean);
    const charId = parseInt(parts[1], 10);
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const body = await parseBody(req);
      const { cardIds } = body;
      if (!Array.isArray(cardIds)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid data' }));
        return;
      }
      const db = loadDb();
      const ch = db.characters.find(c => c.id === charId);
      if (!ch) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Character not found' }));
        return;
      }
      if (user.role !== 'admin' && ch.username !== user.username) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden' }));
        return;
      }
      const cls = db.classes.find(c => c.id === ch.classId);
      const allCards = db.cards.filter(c => c.classId === ch.classId && c.level <= ch.level);
      const validIds = new Set(allCards.map(c => c.id));
      // ensure selected cards are valid and number matches handSize
      if (cardIds.length !== cls.handSize) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Hand must contain exactly ${cls.handSize} cards` }));
        return;
      }
      for (const cid of cardIds) {
        if (!validIds.has(cid)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid card selection' }));
          return;
        }
      }
      // assign hand and clear other zones
      ch.zones.hand = cardIds.slice();
      ch.zones.active = [];
      ch.zones.discard = [];
      ch.zones.lost = [];
      saveDb(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }
  // Move card between zones
  if (req.method === 'POST' && req.url.startsWith('/api/characters/') && req.url.endsWith('/move')) {
    const parts = req.url.split('/').filter(Boolean);
    const charId = parseInt(parts[1], 10);
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const body = await parseBody(req);
      const { cardId, fromZone, toZone } = body;
      const validZones = ['hand', 'active', 'discard', 'lost'];
      if (!cardId || !validZones.includes(fromZone) || !validZones.includes(toZone)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid data' }));
        return;
      }
      if (fromZone === toZone) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
        return;
      }
      const db = loadDb();
      const ch = db.characters.find(c => c.id === charId);
      if (!ch) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Character not found' }));
        return;
      }
      if (user.role !== 'admin' && ch.username !== user.username) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden' }));
        return;
      }
      // Remove from source zone
      let removed = false;
      if (fromZone === 'active') {
        const index = ch.zones.active.findIndex(obj => obj.id === cardId);
        if (index >= 0) {
          ch.zones.active.splice(index, 1);
          removed = true;
        }
      } else {
        const index = ch.zones[fromZone].indexOf(cardId);
        if (index >= 0) {
          ch.zones[fromZone].splice(index, 1);
          removed = true;
        }
      }
      if (!removed) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Card not found in source zone' }));
        return;
      }
      // Add to target zone
      if (toZone === 'active') {
        ch.zones.active.push({ id: cardId, counter: 0 });
      } else {
        ch.zones[toZone].push(cardId);
      }
      saveDb(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }
  // Update counter on active card
  if (req.method === 'POST' && req.url.startsWith('/api/characters/') && req.url.endsWith('/counter')) {
    const parts = req.url.split('/').filter(Boolean);
    const charId = parseInt(parts[1], 10);
    const user = requireAuth(req, res);
    if (!user) return;
    try {
      const body = await parseBody(req);
      const { cardId, delta } = body;
      if (!cardId || typeof delta !== 'number') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid data' }));
        return;
      }
      const db = loadDb();
      const ch = db.characters.find(c => c.id === charId);
      if (!ch) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Character not found' }));
        return;
      }
      if (user.role !== 'admin' && ch.username !== user.username) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Forbidden' }));
        return;
      }
      const obj = ch.zones.active.find(o => o.id === cardId);
      if (!obj) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Card not in active zone' }));
        return;
      }
      obj.counter = Math.max(0, obj.counter + delta);
      saveDb(db);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
    return;
  }
  // Default 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

// Start the server
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

module.exports = server;
