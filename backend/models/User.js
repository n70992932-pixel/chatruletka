const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String },
  age: { type: Number },
  gender: { type: String },
  country: { type: String, required: true },
  deviceId: { type: String, required: true },
  isBanned: { type: Boolean, default: false },
  isPremium: { type: Boolean, default: false },
  isAdmin: { type: Boolean, default: false },
  friends: { type: Array, default: [] },
  reportCount: { type: Number, default: 0 },
  isVerified: { type: Boolean, default: false },
  verificationCode: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
