const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files (landing, admin, student)
app.use(express.static(path.join(__dirname, '../')));

const notificationService = require('./services/notification');

// Health Check API
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', academy: 'Galaxy Academy API Server', timestamp: new Date() });
});

// Firebase Config API — serves credentials from env vars so they're not hardcoded in frontend
app.get('/api/config/firebase', (req, res) => {
  res.json({
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FIREBASE_APP_ID || ''
  });
});

// Single Absentee WhatsApp Notification API
app.post('/api/notifications/whatsapp-absentee', async (req, res) => {
  const { phone, studentName, date, contactNumber } = req.body;
  if (!phone) {
    return res.status(400).json({ success: false, error: 'Phone number is required' });
  }

  const result = await notificationService.sendViaWhatsApp(phone, {
    studentName,
    date,
    contactNumber
  });

  if (result.success) {
    res.json({ success: true, message: 'WhatsApp message sent', data: result });
  } else {
    res.status(500).json({ success: false, error: result.error, details: result.data });
  }
});

// Broadcast WhatsApp to Multiple Absentees API
app.post('/api/notifications/whatsapp-broadcast', async (req, res) => {
  const { absentees } = req.body; // Array of { phone, studentName, date, contactNumber }
  if (!Array.isArray(absentees) || absentees.length === 0) {
    return res.status(400).json({ success: false, error: 'Absentees list is required' });
  }

  const results = await notificationService.broadcastWhatsApp(absentees);
  res.json({ success: true, total: results.length, results });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🚀 Galaxy Academy Backend Server running on http://localhost:${PORT}`);
});
