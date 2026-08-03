require('dotenv').config();
const notificationService = require('./services/notification');

// Get phone number from command line args or use prompt
const targetPhone = process.argv[2];

if (!targetPhone) {
  console.log('\n❌ Please provide a 10-digit target phone number.');
  console.log('Usage: node test_whatsapp.js 9876543210\n');
  process.exit(1);
}

console.log(`🚀 Sending test WhatsApp template (${process.env.WHATSAPP_TEMPLATE_NAME}) to ${targetPhone}...`);

notificationService.sendViaWhatsApp(targetPhone, {
  studentName: 'Test Student',
  subject: 'Physics',
  date: new Date().toLocaleDateString('en-IN')
}).then(res => {
  if (res.success) {
    console.log('🎉 SUCCESS! WhatsApp message sent. Message ID:', res.messageId);
  } else {
    console.log('❌ FAILED! Error:', res.error);
    if (res.data) {
      console.log('Details:', JSON.stringify(res.data, null, 2));
    }
  }
});
