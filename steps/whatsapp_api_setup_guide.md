# WhatsApp Cloud API — Complete Setup Guide (No Business Registration)

## What You Need Before Starting

| Item | Details |
|:---|:---|
| **Facebook account** | Your personal one works |
| **Phone number** | One that is **NOT** currently on WhatsApp (buy a ₹20 SIM or remove WhatsApp from an existing number) |
| **Business registration?** | ❌ **NOT needed** to start. You can test and send to up to 250 contacts/day without it |

---

## Pricing (Your Cost)

| Item | Cost |
|:---|:---|
| Meta Platform Fee | **₹0** (Cloud API is free) |
| Utility messages (absence alerts) | **~₹0.35–₹0.50 per message** |
| Service messages (user replies) | **Free** |
| Monthly estimate (30 msgs/day × 22 days) | **~₹230–₹330/month** |

> [!NOTE]
> No monthly subscription. You only pay per message sent. Meta deducts from a prepaid wallet you top up.

---

## STEP 1: Create a Meta Developer Account

1. Go to **[developers.facebook.com](https://developers.facebook.com/)**
2. Log in with your **personal Facebook account**
3. Click **"Get Started"** (top right)
4. Accept the terms → Verify your email → Done

> You are now a Meta Developer. Takes ~2 minutes.

---

## STEP 2: Create a Meta Business Portfolio

1. Go to **[business.facebook.com](https://business.facebook.com/)**
2. Click **"Create Account"** / **"Create a Business Portfolio"**
3. Fill in:
   - **Business name:** `[Your Name] Tuition` (e.g., "Sharma Tuition Classes")
   - **Your name:** Your real name
   - **Email:** Your email
4. Click **Submit**

> [!IMPORTANT]
> This is NOT a business registration — it's just Meta's way of organizing business assets. Anyone can create one with a Facebook account.

---

## STEP 3: Create a WhatsApp App

1. Go to **[developers.facebook.com/apps](https://developers.facebook.com/apps/)**
2. Click **"Create App"**
3. Select use case: **"Other"** → Then **"Business"**
4. Fill in:
   - **App name:** `Tuition Attendance Bot`
   - **Contact email:** Your email
   - **Business Portfolio:** Select the one you created in Step 2
5. Click **"Create App"**
6. On the next screen, find **"WhatsApp"** and click **"Set Up"**

---

## STEP 4: Add Your Phone Number

1. In the App Dashboard, go to **WhatsApp → API Setup**
2. You'll see a **test phone number** provided by Meta (you can use this to test first)
3. Click **"Add Phone Number"** to add your own number
4. Enter the number → Choose **SMS** or **Voice Call** verification
5. Enter the OTP → Your number is now linked

> [!WARNING]
> The phone number you add must **NOT** be registered on WhatsApp or WhatsApp Business app. If it is, go to the app → Settings → Account → Delete Account first. Wait 5 minutes, then add it here.

---

## STEP 5: Create a Utility Message Template

This is the message format that Meta must approve before you can send it.

1. In the App Dashboard, go to **WhatsApp → Message Templates** (or go to [business.facebook.com/wa/manage/message-templates](https://business.facebook.com/wa/manage/message-templates))
2. Click **"Create Template"**
3. Fill in:

| Field | Value |
|:---|:---|
| **Category** | `Utility` |
| **Name** | `absence_notification` |
| **Language** | `English` or `Hindi` (or both) |

4. In the **Body**, write your template with variables:

```
Hello {{1}},

This is to inform you that your child {{2}} was absent from the {{3}} class today ({{4}}).

Please contact us if you have any concerns.

— {{5}} Tuition Classes
```

Where:
- `{{1}}` = Parent name
- `{{2}}` = Student name
- `{{3}}` = Subject
- `{{4}}` = Date
- `{{5}}` = Your tuition name

5. Add **sample values** for each variable (required for approval):
   - `{{1}}` → `Mr. Sharma`
   - `{{2}}` → `Rahul`
   - `{{3}}` → `Mathematics`
   - `{{4}}` → `01 Aug 2026`
   - `{{5}}` → `ABC`

6. Click **Submit**

> [!TIP]
> Utility templates are usually auto-approved within **2-10 minutes** by Meta's AI. You'll get a notification once approved.

---

## STEP 6: Generate a Permanent Access Token

The temporary token in the dashboard expires in 24 hours. For production, you need a permanent one.

### 6a. Create a System User
1. Go to **[business.facebook.com/settings](https://business.facebook.com/settings)**
2. Navigate to **Users → System Users** (left sidebar)
3. Click **"Add"**
4. Name: `whatsapp-bot`
5. Role: **Admin**
6. Click **"Create System User"**

### 6b. Assign Assets
1. Select the system user you just created
2. Click **"Assign Assets"**
3. **Apps** tab → Select your app → Toggle **"Full Control"** → Save
4. **WhatsApp Accounts** tab → Select your WABA → Toggle **"Full Control"** → Save

### 6c. Generate Token
1. Click **"Generate New Token"**
2. Select your app
3. Check these permissions:
   - ✅ `whatsapp_business_messaging`
   - ✅ `whatsapp_business_management`
4. Click **"Generate Token"**
5. **⚠️ COPY THIS TOKEN IMMEDIATELY** — it won't be shown again

---

## STEP 7: Send Your First Message (Test)

### Using cURL (test from terminal):
```bash
curl -X POST "https://graph.facebook.com/v20.0/YOUR_PHONE_NUMBER_ID/messages" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "messaging_product": "whatsapp",
    "to": "919876543210",
    "type": "template",
    "template": {
      "name": "absence_notification",
      "language": { "code": "en" },
      "components": [
        {
          "type": "body",
          "parameters": [
            { "type": "text", "text": "Mr. Sharma" },
            { "type": "text", "text": "Rahul" },
            { "type": "text", "text": "Mathematics" },
            { "type": "text", "text": "01 Aug 2026" },
            { "type": "text", "text": "ABC" }
          ]
        }
      ]
    }
  }'
```

### Using JavaScript (for your app):
```javascript
async function sendAbsenceWhatsApp(parentPhone, parentName, studentName, subject, date, tutionName) {
  const PHONE_NUMBER_ID = 'YOUR_PHONE_NUMBER_ID';  // From Step 4
  const ACCESS_TOKEN = 'YOUR_ACCESS_TOKEN';          // From Step 6

  const response = await fetch(
    `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: parentPhone,  // Format: "919876543210" (country code + number, no +)
        type: 'template',
        template: {
          name: 'absence_notification',
          language: { code: 'en' },
          components: [
            {
              type: 'body',
              parameters: [
                { type: 'text', text: parentName },
                { type: 'text', text: studentName },
                { type: 'text', text: subject },
                { type: 'text', text: date },
                { type: 'text', text: tutionName },
              ],
            },
          ],
        },
      }),
    }
  );

  const data = await response.json();
  if (data.messages) {
    console.log('✅ WhatsApp sent to', parentPhone);
  } else {
    console.error('❌ Failed:', data.error);
  }
  return data;
}
```

### Broadcast (send to multiple absentees):
```javascript
async function broadcastAbsenceNotifications(absentees) {
  // absentees = [{ parentPhone, parentName, studentName, subject, date }]
  const results = [];

  for (const student of absentees) {
    const result = await sendAbsenceWhatsApp(
      student.parentPhone,
      student.parentName,
      student.studentName,
      student.subject,
      new Date().toLocaleDateString('en-IN'),
      'Your Tuition Name'
    );
    results.push(result);

    // Rate limit: Meta allows ~80 messages/second, but be safe
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  return results;
}
```

---

## STEP 8: Add Prepaid Balance (to actually send)

1. Go to **[business.facebook.com/billing](https://business.facebook.com/billing)**
2. Add a **payment method** (Credit/Debit card or UPI)
3. Add balance (minimum ~₹500 to start)
4. Messages will be deducted from this balance

---

## Limitations Without Business Verification

| Feature | Without Verification | With Verification |
|:---|:---|:---|
| Messages per day | **250** | 1,000 → 10,000 → unlimited |
| Send templates | ✅ Yes | ✅ Yes |
| Receive messages | ✅ Yes | ✅ Yes |
| Green tick badge | ❌ No | ✅ Yes |
| Multiple phone numbers | ❌ No (1 only) | ✅ Yes |

> [!NOTE]
> **250 messages/day is more than enough** for a tuition class. Even if you have 50 students and all are absent, that's only 50 messages. You likely won't ever need verification.

---

## Summary: What You're Doing

```
┌───────────────────────────────────────────────┐
│  YOUR APP (marks attendance)                   │
│      ↓                                         │
│  Identifies absentees                          │
│      ↓                                         │
│  Calls Meta Graph API                          │
│      ↓                                         │
│  WhatsApp delivers message to parent's phone   │
│      ↓                                         │
│  Parent sees: "Your child Rahul was absent     │
│  from Mathematics class today"                 │
└───────────────────────────────────────────────┘

Total cost: ~₹0.40 per message, no subscription, no registration
```

---

## Quick Reference: IDs You'll Need

After setup, save these in your server's `.env` file:

```env
WHATSAPP_PHONE_NUMBER_ID=1234567890      # From API Setup page
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxx...       # From Step 6
WHATSAPP_TEMPLATE_NAME=absence_notification
```
