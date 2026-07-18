require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_mock');
const dbService = require('./db');
const User = require('./models/User');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

const JWT_SECRET = process.env.JWT_SECRET;

dbService.connect();

// Mock Storage for users without MongoDB
const MOCK_DB_FILE = './mockDB.json';
let mockUsers = [];
if (fs.existsSync(MOCK_DB_FILE)) {
  try {
    mockUsers = JSON.parse(fs.readFileSync(MOCK_DB_FILE, 'utf8'));
  } catch(e) {
    console.error("Fayldan o'qishda xatolik", e);
  }
}

const saveMockDB = () => {
  fs.writeFileSync(MOCK_DB_FILE, JSON.stringify(mockUsers, null, 2));
};

const MOCK_PAYMENTS_FILE = './mockPayments.json';
let mockPayments = [];
if (fs.existsSync(MOCK_PAYMENTS_FILE)) {
  try {
    mockPayments = JSON.parse(fs.readFileSync(MOCK_PAYMENTS_FILE, 'utf8'));
  } catch(e) {
    console.error("To'lov faylidan o'qishda xatolik", e);
  }
}

const saveMockPayments = () => {
  fs.writeFileSync(MOCK_PAYMENTS_FILE, JSON.stringify(mockPayments, null, 2));
};

let connectedUsers = new Map();

const findUserByEmail = async (email) => {
  if (dbService.isConnected()) return await User.findOne({ email });
  return mockUsers.find(u => u.email === email);
};

const findUserById = async (id) => {
  if (dbService.isConnected()) return await User.findById(id);
  return mockUsers.find(u => u._id === id || u.id === id);
};

const saveNewUser = async (userData) => {
  if (dbService.isConnected()) {
    const user = new User(userData);
    if ((await User.countDocuments()) === 0) user.isAdmin = true;
    await user.save();
    return user;
  }
  userData._id = uuidv4();
  userData.isBanned = false;
  userData.isPremium = false;
  userData.friends = [];
  userData.reportCount = 0;
  if (mockUsers.length === 0) userData.isAdmin = true;
  else userData.isAdmin = false;
  
  mockUsers.push(userData);
  saveMockDB();
  return userData;
};

const updateUser = async (userObj) => {
  if (dbService.isConnected()) {
    await userObj.save();
  } else {
    const idx = mockUsers.findIndex(u => u._id === userObj._id || u.id === userObj.id);
    if (idx !== -1) {
      mockUsers[idx] = userObj;
      saveMockDB();
    }
  }
};

const updateUserStatus = async (id, updates) => {
  if (dbService.isConnected()) {
    return await User.findByIdAndUpdate(id, updates, { new: true });
  }
  const idx = mockUsers.findIndex(u => u._id === id || u.id === id);
  if (idx !== -1) {
    mockUsers[idx] = { ...mockUsers[idx], ...updates };
    saveMockDB();
    return mockUsers[idx];
  }
  return null;
};


app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, age, gender, country, deviceId } = req.body;
    let user = await findUserByEmail(email);
    if (user) return res.status(400).json({ error: "Bu email band qilingan." });

    const hashedPassword = await bcrypt.hash(password, 10);
    user = await saveNewUser({ email, password: hashedPassword, name, age, gender, country, deviceId });

    const token = jwt.sign({ userId: user._id || user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id || user.id, name, age, gender, country, isBanned: user.isBanned, isPremium: user.isPremium, isAdmin: user.isAdmin } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server xatosi" });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await findUserByEmail(email);
    if (!user) return res.status(400).json({ error: "Email yoki parol xato." });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ error: "Email yoki parol xato." });

    if (user.isBanned) return res.status(403).json({ error: "Sizning akkauntingiz bloklangan!" });

    const token = jwt.sign({ userId: user._id || user.id }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id || user.id, name: user.name, age: user.age, gender: user.gender, country: user.country, isBanned: user.isBanned, isPremium: user.isPremium, isAdmin: user.isAdmin } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// TURN Server API
app.get('/api/turn', (req, res) => {
  res.json({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  });
});

// P2P To'lov So'rovini qabul qilish
app.post('/api/payment/request', async (req, res) => {
  try {
    const { userId, username, receiptInfo } = req.body;
    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });

    const newRequest = {
      id: Date.now().toString(),
      userId,
      username,
      receiptInfo,
      status: 'pending',
      date: new Date().toISOString()
    };
    mockPayments.push(newRequest);
    saveMockPayments();
    
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server xatosi" });
  }
});

// Admin API Middleware
const requireAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Token yo'q" });
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await findUserById(decoded.userId);
    if (!user || !user.isAdmin) return res.status(403).json({ error: "Ruxsat yo'q" });
    req.user = user;
    next();
  } catch (err) {
    res.status(401).json({ error: "Yaroqsiz token" });
  }
};

// Admin API Routes
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    let allUsers = [];
    if (dbService.isConnected()) {
      allUsers = await User.find({}, '-password');
    } else {
      allUsers = mockUsers.map(({ password, ...rest }) => rest);
    }
    res.json(allUsers);
  } catch (err) {
    res.status(500).json({ error: "Admin API xatosi" });
  }
});

app.post('/api/admin/ban', requireAdmin, async (req, res) => {
  try {
    const { userId, isBanned } = req.body;
    const user = await findUserById(userId);
    if (!user) return res.status(404).json({ error: "Topilmadi" });
    
    user.isBanned = isBanned;
    await updateUser(user);
    
    if (isBanned) {
      io.emit('user-banned', userId);
    }
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: "Admin API xatosi" });
  }
});

app.post('/api/admin/unban', requireAdmin, async (req, res) => {
  try {
    const { userId } = req.body;
    const user = await findUserById(userId);
    if (user) {
      user.isBanned = false;
      user.banExpiresAt = null;
      await updateUser(user);
      return res.json({ success: true });
    }
    res.status(404).json({ error: "Topilmadi" });
  } catch (err) {
    res.status(500).json({ error: "Xatolik" });
  }
});

// Admin to'lovlarni olishi
app.get('/api/admin/payments', requireAdmin, async (req, res) => {
  try {
    res.json(mockPayments);
  } catch (err) {
    res.status(500).json({ error: "Xatolik" });
  }
});

// Admin to'lovni tasdiqlashi
app.post('/api/admin/payments/approve', requireAdmin, async (req, res) => {
  try {
    const { requestId } = req.body;
    const payment = mockPayments.find(p => p.id === requestId);
    if (!payment) return res.status(404).json({ error: "Topilmadi" });

    const user = await findUserById(payment.userId);
    if (user) {
      user.isPremium = true;
      await updateUser(user);
      payment.status = 'approved';
      saveMockPayments();
      // Inform user via socket if they are connected
      const socketId = Array.from(connectedUsers.entries()).find(([_, u]) => u.userId === user.id || u.userId === user._id)?.[0];
      if (socketId) {
        io.to(socketId).emit('premium-activated');
      }
      return res.json({ success: true });
    }
    res.status(404).json({ error: "User topilmadi" });
  } catch (err) {
    res.status(500).json({ error: "Xatolik" });
  }
});

// Admin to'lovni rad etishi
app.post('/api/admin/payments/reject', requireAdmin, async (req, res) => {
  try {
    const { requestId } = req.body;
    const payment = mockPayments.find(p => p.id === requestId);
    if (!payment) return res.status(404).json({ error: "Topilmadi" });

    payment.status = 'rejected';
    saveMockPayments();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Xatolik" });
  }
});

// Friends API
app.get('/api/friends', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: "Token yo'q" });
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await findUserById(decoded.userId);
    if (!user) return res.status(404).json({ error: "Topilmadi" });
    
    let friends = [];
    for(let id of (user.friends || [])) {
       let f = await findUserById(id);
       if (f) friends.push({ id: f._id || f.id, name: f.name, country: f.country, gender: f.gender });
    }
    res.json(friends);
  } catch (err) {
    res.status(500).json({ error: "Xatolik" });
  }
});

io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Token topilmadi. Avtorizatsiyadan o'ting."));
  
  jwt.verify(token, JWT_SECRET, async (err, decoded) => {
    if (err) return next(new Error("Yaroqsiz token."));
    const user = await findUserById(decoded.userId);
    if (!user) return next(new Error("Foydalanuvchi topilmadi."));
    if (user.isBanned) return next(new Error("Siz bloklangansiz."));
    
    socket.user = user;
    socket.decodedUserId = decoded.userId;
    next();
  });
});

let waitingUsers = [];

const broadcastOnlineCount = () => {
  io.emit('online-count', io.engine.clientsCount);
};

io.on('connection', (socket) => {
  broadcastOnlineCount();
  connectedUsers.set(socket.decodedUserId, socket.id);

  const matchUsers = () => {
    for (let i = 0; i < waitingUsers.length; i++) {
      for (let j = i + 1; j < waitingUsers.length; j++) {
        const u1 = waitingUsers[i];
        const u2 = waitingUsers[j];
        
        const u1Target = u1.profile.targetGender; 
        const u2Target = u2.profile.targetGender;
        
        const u1Match = u1Target === 'Barchasi' || u1Target === u2.profile.gender;
        const u2Match = u2Target === 'Barchasi' || u2Target === u1.profile.gender;

        if (u1Match && u2Match) {
          waitingUsers.splice(j, 1);
          waitingUsers.splice(i, 1);

          const roomName = `room-${u1.id}-${u2.id}`;
          u1.join(roomName);
          u2.join(roomName);

          u1.emit('matched', { room: roomName, initiator: true, partnerProfile: u2.profile, partnerDbId: u2.user._id || u2.user.id });
          u2.emit('matched', { room: roomName, initiator: false, partnerProfile: u1.profile, partnerDbId: u1.user._id || u1.user.id });
          
          return matchUsers(); 
        }
      }
    }
  };

  socket.on('start-search', (targetGender) => {
    if (socket.user.isBanned) {
      socket.emit('banned');
      return;
    }
    
    socket.profile = { 
      name: socket.user.name, 
      age: socket.user.age, 
      gender: socket.user.gender, 
      country: socket.user.country,
      targetGender: targetGender || 'Barchasi'
    };
    
    const rooms = Array.from(socket.rooms);
    rooms.forEach(room => {
      if (room !== socket.id) {
        socket.to(room).emit('partner-disconnected');
        socket.leave(room);
      }
    });

    if (!waitingUsers.find(u => u.id === socket.id)) {
      waitingUsers.push(socket);
      matchUsers();
    }
  });

  socket.on('stop-search', () => {
    waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
    const rooms = Array.from(socket.rooms);
    rooms.forEach(room => {
      if (room !== socket.id) {
        socket.to(room).emit('partner-disconnected');
        socket.leave(room);
      }
    });
  });

  socket.on('report', async (partnerDbId) => {
    // XAVFSIZLIK: faqat joriy room'dagi suhbatdoshni report qilish mumkin
    const currentRoom = Array.from(socket.rooms).find(r => r.startsWith('room-'));
    if (!currentRoom) return; // Agar room'da bo'lmasa — ignore

    // Room'dagi boshqa foydalanuvchilarni topamiz
    const usersInRoom = Array.from(io.sockets.adapter.rooms.get(currentRoom) || []);
    const partnerSocket = usersInRoom
      .filter(sid => sid !== socket.id)
      .map(sid => io.sockets.sockets.get(sid))
      .find(s => s);

    // Agar partnerDbId room'dagi haqiqiy suhbatdoshga to'g'ri kelmasa — ignore
    if (!partnerSocket) return;
    const realPartnerId = String(partnerSocket.user?._id || partnerSocket.user?.id || '');
    if (String(partnerDbId) !== realPartnerId) return; // Soxta ID — bloklash

    if (partnerDbId) {
      const partner = await findUserById(partnerDbId);
      if (partner) {
        partner.reportCount = (partner.reportCount || 0) + 1;
        if (partner.reportCount >= 3) {
          partner.isBanned = true;
          io.emit('user-banned', partnerDbId);
        }
        await updateUser(partner);
      }
    }
    // Reporter'ni roomdan chiqaramiz
    waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
    socket.to(currentRoom).emit('partner-disconnected');
    socket.leave(currentRoom);
  });

  socket.on('auto-ban', async (partnerDbId) => {
    // XAVFSIZLIK: faqat joriy room'dagi suhbatdoshni auto-ban qilish mumkin
    const currentRoom = Array.from(socket.rooms).find(r => r.startsWith('room-'));
    if (!currentRoom) return; // Room'siz bo'lsa — ignore

    const usersInRoom = Array.from(io.sockets.adapter.rooms.get(currentRoom) || []);
    const partnerSocket = usersInRoom
      .filter(sid => sid !== socket.id)
      .map(sid => io.sockets.sockets.get(sid))
      .find(s => s);

    if (!partnerSocket) return;
    const realPartnerId = String(partnerSocket.user?._id || partnerSocket.user?.id || '');
    if (String(partnerDbId) !== realPartnerId) return; // Soxta ID — bloklash

    if (partnerDbId) {
      const partner = await findUserById(partnerDbId);
      if (partner) {
        partner.isBanned = true;
        partner.reportCount = (partner.reportCount || 0) + 10;
        await updateUser(partner);
        io.emit('user-banned', partnerDbId);
      }
    }
    // Reporter'ni roomdan chiqaramiz
    waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
    socket.to(currentRoom).emit('partner-disconnected');
    socket.leave(currentRoom);
  });

  socket.on('private-message', (data) => {
    const targetSocketId = connectedUsers.get(data.toDbId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('private-message', { from: socket.decodedUserId, text: data.text });
    }
  });

  socket.on('send-gift', (data) => {
    const targetSocketId = connectedUsers.get(data.toDbId);
    if (targetSocketId) {
      io.to(targetSocketId).emit('receive-gift', { emoji: data.emoji });
    }
  });

  socket.on('add-friend', async () => {
    const room = Array.from(socket.rooms).find(r => r.startsWith('room-'));
    if (!room) return;
    
    const friendRequests = {};
    if (!friendRequests[room]) friendRequests[room] = new Set();
    friendRequests[room].add(socket.id);
    
    if (friendRequests[room].size === 2) {
      const usersInRoom = Array.from(io.sockets.adapter.rooms.get(room) || []);
      if (usersInRoom.length === 2) {
        const u1 = io.sockets.sockets.get(usersInRoom[0]);
        const u2 = io.sockets.sockets.get(usersInRoom[1]);
        if (u1 && u2) {
           const user1 = await findUserById(u1.user._id || u1.user.id);
           const user2 = await findUserById(u2.user._id || u2.user.id);
           if (!user1.friends) user1.friends = [];
           if (!user2.friends) user2.friends = [];
           
           if (!user1.friends.includes(user2._id || user2.id)) user1.friends.push(user2._id || user2.id);
           if (!user2.friends.includes(user1._id || user1.id)) user2.friends.push(user1._id || user1.id);
           
           await updateUser(user1);
           await updateUser(user2);
           
           io.to(room).emit('friend-added');
        }
      }
    }
  });

  socket.on('offer', (data) => socket.to(data.room).emit('offer', data.offer));
  socket.on('answer', (data) => socket.to(data.room).emit('answer', data.answer));
  socket.on('ice-candidate', (data) => socket.to(data.room).emit('ice-candidate', data.candidate));
  socket.on('chat-message', (data) => socket.to(data.room).emit('chat-message', data.message));

  socket.on('disconnect', () => {
    connectedUsers.delete(socket.decodedUserId);
    waitingUsers = waitingUsers.filter(user => user.id !== socket.id);
    const rooms = Array.from(socket.rooms);
    rooms.forEach(room => {
      if (room !== socket.id) {
        socket.to(room).emit('partner-disconnected');
      }
    });
    broadcastOnlineCount();
  });
});

const PORT = process.env.PORT || 5005;
server.listen(PORT, () => {
  console.log(`Server ${PORT}-portda ishga tushdi.`);
});
