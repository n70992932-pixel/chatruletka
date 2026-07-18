const mongoose = require('mongoose');

let isConnected = false;

const connectDB = async () => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    console.warn('⚠️  MONGODB_URI topilmadi. Vaqtinchalik fayl-rejimiga o\'tildi (ma\'lumotlar yo\'qolishi mumkin!)');
    isConnected = false;
    return;
  }

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000
    });
    console.log('✅ MongoDB Atlas muvaffaqiyatli ulandi!');
    isConnected = true;
  } catch (error) {
    console.error('❌ MongoDB ulanishda xatolik:', error.message);
    console.warn('⚠️  Vaqtinchalik fayl-rejimiga o\'tildi.');
    isConnected = false;
  }
};

module.exports = { 
  connect: connectDB,
  isConnected: () => isConnected
};

