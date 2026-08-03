// Notification Service (Fast2SMS + WhatsApp Business API ready)

class NotificationService {
  constructor() {
    this.provider = process.env.SMS_PROVIDER || 'fast2sms';
    this.fast2smsKey = process.env.FAST2SMS_API_KEY || '';
  }

  /**
   * Send notification to a student's parent phone
   * @param {string} phoneNumber 10-digit or E.164 phone number
   * @param {string} message Text message content
   */
  async sendSMS(phoneNumber, message) {
    if (this.provider === 'fast2sms') {
      return await this.sendViaFast2SMS(phoneNumber, message);
    } else if (this.provider === 'whatsapp') {
      return await this.sendViaWhatsApp(phoneNumber, message);
    } else {
      console.log(`[Notification Stub] To: ${phoneNumber} | Message: ${message}`);
      return { success: true, message: "Stubbed send success" };
    }
  }

  /**
   * Send SMS using Fast2SMS DLT Quick SMS API
   */
  async sendViaFast2SMS(phoneNumber, message) {
    if (!this.fast2smsKey) {
      console.warn("Fast2SMS API Key not configured in environment variables.");
      return { success: false, error: "Fast2SMS API Key missing" };
    }

    // Clean phone number to 10 digits
    const cleanPhone = phoneNumber.replace(/[^0-9]/g, '').slice(-10);

    try {
      const response = await fetch('https://www.fast2sms.com/dev/bulkV2', {
        method: 'POST',
        headers: {
          'authorization': this.fast2smsKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          route: 'q',
          message: message,
          numbers: cleanPhone
        })
      });

      const data = await response.json();
      return { success: data.return === true, data };
    } catch (err) {
      console.error("Fast2SMS request failed:", err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Send WhatsApp notification for an absent student using Meta Cloud API
   * @param {string} phoneNumber Parent phone number (10-digit or E.164)
   * @param {object} details { studentName, date, contactNumber }
   */
  async sendViaWhatsApp(phoneNumber, details = {}) {
    const waToken = process.env.WHATSAPP_TOKEN;
    const waPhoneId = process.env.WHATSAPP_PHONE_ID;
    const templateName = process.env.WHATSAPP_TEMPLATE_NAME || 'absence_notification';

    if (!waToken || !waPhoneId) {
      console.warn("WhatsApp Business API credentials not configured yet.");
      return { success: false, error: "WhatsApp credentials missing (WHATSAPP_TOKEN or WHATSAPP_PHONE_ID)" };
    }

    // Clean phone number to E.164 digits without '+' (e.g. 919876543210)
    let cleanPhone = (phoneNumber || '').replace(/[^0-9]/g, '');
    if (cleanPhone.length === 10) {
      cleanPhone = '91' + cleanPhone;
    }

    const studentName = details.studentName || 'Student';
    const subject = details.subject || 'Tuition';
    const dateStr = details.date || new Date().toLocaleDateString('en-IN');

    const url = `https://graph.facebook.com/v20.0/${waPhoneId}/messages`;

    const payload = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateName === 'hello_world' ? 'en_US' : 'en' }
      }
    };

    // If using custom absence template (abseentee / absence_notification) with 3 parameters: {{1}}, {{2}}, {{3}}
    if (templateName !== 'hello_world') {
      payload.template.components = [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: studentName }, // {{1}}
            { type: 'text', text: subject },     // {{2}}
            { type: 'text', text: dateStr }      // {{3}}
          ]
        }
      ];
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${waToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (response.ok && data.messages) {
        console.log(`✅ WhatsApp sent to ${cleanPhone} (Student: ${studentName})`);
        return { success: true, messageId: data.messages[0].id };
      } else {
        console.error("❌ WhatsApp API request failed:", data);
        return { success: false, error: data.error?.message || 'API request failed', data };
      }
    } catch (err) {
      console.error("WhatsApp API exception:", err);
      return { success: false, error: err.message };
    }
  }

  /**
   * Broadcast WhatsApp notifications to a list of absentees
   * @param {Array} absentees Array of { phone, studentName, date, contactNumber }
   */
  async broadcastWhatsApp(absentees) {
    const results = [];
    for (const item of absentees) {
      const res = await this.sendViaWhatsApp(item.phone, item);
      results.push({ phone: item.phone, studentName: item.studentName, status: res });
      // Small delay between requests to keep rate safe
      await new Promise(r => setTimeout(r, 200));
    }
    return results;
  }
}

module.exports = new NotificationService();
