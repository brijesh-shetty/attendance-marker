// Notification Service (Fast2SMS + WhatsApp Business API ready)

class NotificationService {
  constructor() {
    // Both values are read lazily via getters below so this module works even
    // if it happens to be required before dotenv has populated process.env.
  }

  // Prefer WhatsApp when its credentials are present, regardless of what
  // SMS_PROVIDER says — that way an admin who set up WhatsApp doesn't get
  // silently routed to Fast2SMS just because SMS_PROVIDER is missing.
  get provider() {
    const explicit = (process.env.SMS_PROVIDER || '').toLowerCase();
    if (explicit === 'whatsapp' || explicit === 'fast2sms') return explicit;
    if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID) return 'whatsapp';
    if (process.env.FAST2SMS_API_KEY) return 'fast2sms';
    return 'stub';
  }

  get fast2smsKey() { return process.env.FAST2SMS_API_KEY || ''; }

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
   * Send any approved WhatsApp template to any recipient. Reusable by
   * absence alerts, TradingView forwarding, etc.
   * @param {object} opts
   * @param {string} opts.to Recipient in E.164 digits (10-digit Indian numbers
   *   are auto-prefixed with 91).
   * @param {string} opts.templateName Meta-approved template name.
   * @param {Array<string|number>} [opts.params=[]] Body {{1}}, {{2}} … values.
   * @param {string} [opts.language='en']
   */
  async sendTemplate({ to, templateName, params = [], language = 'en' }) {
    const waToken = process.env.WHATSAPP_TOKEN;
    const waPhoneId = process.env.WHATSAPP_PHONE_ID;
    if (!waToken || !waPhoneId) {
      return { success: false, error: 'WhatsApp credentials missing (WHATSAPP_TOKEN or WHATSAPP_PHONE_ID).' };
    }
    if (!to) return { success: false, error: 'Recipient phone is required.' };
    if (!templateName) return { success: false, error: 'Template name is required.' };

    let cleanPhone = String(to).replace(/[^0-9]/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

    const url = `https://graph.facebook.com/v20.0/${waPhoneId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      to: cleanPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: language }
      }
    };
    if (params.length) {
      payload.template.components = [{
        type: 'body',
        parameters: params.map(value => ({ type: 'text', text: String(value) }))
      }];
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${waToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (response.ok && data.messages) {
        return { success: true, messageId: data.messages[0].id, data };
      }
      return {
        success: false,
        error: data.error?.message || 'WhatsApp API request failed.',
        code: data.error?.code,
        data
      };
    } catch (err) {
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

  /**
   * Send direct absentee alert to Admin / Sir
   * @param {string} phoneNumber Admin phone number
   * @param {string|object} data Message text string or structured object
   */
  async sendAdminAlert(phoneNumber, data) {
    if (this.provider === 'fast2sms') {
      const message = typeof data === 'string' ? data : data.text || '';
      return await this.sendViaFast2SMS(phoneNumber, message);
    }

    const waToken = process.env.WHATSAPP_TOKEN;
    const waPhoneId = process.env.WHATSAPP_PHONE_ID;
    const templateName = (typeof data === 'object' && data.templateName)
      ? data.templateName
      : (process.env.WHATSAPP_ADMIN_TEMPLATE || 'admin_absentee_alert');
    const templateLanguage = process.env.WHATSAPP_ADMIN_TEMPLATE_LANGUAGE || 'en';

    if (!waToken || !waPhoneId) {
      const message = typeof data === 'string' ? data : data.text || '';
      if (this.fast2smsKey) {
        return await this.sendViaFast2SMS(phoneNumber, message);
      }
      console.log(`[Notification Stub] Alert Admin to: ${phoneNumber}\nTemplate: ${templateName}\nMessage:\n${message}`);
      return { success: true, message: "Stubbed send success" };
    }

    let cleanPhone = (phoneNumber || '').replace(/[^0-9]/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

    const url = `https://graph.facebook.com/v20.0/${waPhoneId}/messages`;
    
    let payload;
    if (typeof data === 'object' && data.date) {
      payload = {
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLanguage },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: data.date },         // {{1}} Date
                { type: 'text', text: data.subject },      // {{2}} Subject
                { type: 'text', text: data.absenteeList }, // {{3}} Absentee List
                { type: 'text', text: String(data.absent) } // {{4}} Total Absent
              ]
            }
          ]
        }
      };
    } else {
      payload = {
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'text',
        text: { body: typeof data === 'string' ? data : data.text }
      };
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
      const resData = await response.json();
      if (response.ok && resData.messages) return { success: true, data: resData };
      const error = resData?.error?.message || 'WhatsApp API request failed.';
      console.error(`Admin WhatsApp alert failed: ${error}`, resData?.error?.code ? `(Meta code ${resData.error.code})` : '');
      return { success: false, error, data: resData };
    } catch (err) {
      console.error("Admin WhatsApp alert failed:", err);
      return { success: false, error: err.message };
    }
  }
}

module.exports = new NotificationService();
