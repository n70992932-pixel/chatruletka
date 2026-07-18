const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/chatruletka', {
      serverSelectionTimeoutMS: 2000 // Tezroq xatoni ushlash uchun
    });
    console.log('✅ MongoDB muvaffaqiyatli ulandi!');
    isConnected = true;
  } catch (error) {
    console.error('⚠️ MongoDB topilmadi. Avtomatik In-Memory (Xotira) rejimiga o\'tildi!');
    isConnected = false;
  }
};

module.exports = { 
  connect: connectDB,
  isConnected: () => isConnected
};
