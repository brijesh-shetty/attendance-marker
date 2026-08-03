# Setting Up Facebook Business Page & Meta Business Account for Galaxy Academy

## Part 1: Create Facebook Business Page

### Step 1 — Log in to Facebook
1. Go to **[facebook.com](https://www.facebook.com)** and log in with your personal account.
2. If you don't have a Facebook account, create one with your email/phone.

### Step 2 — Create a New Page
1. On the left sidebar, click **"Pages"**.
2. Click the **"Create New Page"** button (top-left).
3. Fill in the details:

| Field | What to Enter |
|---|---|
| **Page Name** | `Galaxy Academy` |
| **Category** | Type `Tutor/Teacher` or `Education` — select the best match |
| **Bio (optional)** | `PU Coaching & Tuition Center` |

4. Click **"Create Page"**.

### Step 3 — Add Page Details
1. **Profile Picture**: Upload a Galaxy Academy logo (or skip for now).
2. **Cover Photo**: Upload a banner image (or skip for now).
3. **Contact Info**:
   - Click **"Edit Page Info"** (under the cover photo area).
   - **Website**: Enter your GitHub Pages deployment URL (e.g., `https://brijesh-shetty.github.io/attendance-marker/`)
   - **Phone**: Leave empty (you'll use the Twilio virtual number later)
   - **Email**: Your email (optional)
   - **Location**: Enter Galaxy Academy's address
4. Click **Save**.

### Step 4 — Publish the Page
1. Your page is now live at `facebook.com/GalaxyAcademy` (or similar URL).
2. **Copy the Page URL** — you'll need it for the next step.

> [!TIP]
> Post at least 1–2 posts on the page (e.g., "Welcome to Galaxy Academy!") to make it look legitimate. Meta reviews this during WhatsApp verification.

---

## Part 2: Create Meta Business Account

### Step 1 — Go to Meta Business Suite
1. Open **[business.facebook.com](https://business.facebook.com)** in your browser.
2. If prompted, log in with the **same Facebook account** you used to create the page.

### Step 2 — Create a Business Account
1. Click **"Create an Account"** (or "Get Started").
2. Fill in:

| Field | What to Enter |
|---|---|
| **Business Name** | `Galaxy Academy` |
| **Your Name** | Your full name (as the developer/admin) |
| **Business Email** | Your email address |

3. Click **"Submit"**.

### Step 3 — Add Your Facebook Page
1. After account creation, go to **Settings** (gear icon, bottom-left).
2. Navigate to **"Business Settings"** → **"Accounts"** → **"Pages"**.
3. Click **"Add"** → **"Add a Page"**.
4. Search for **"Galaxy Academy"** (the page you just created).
5. Click **"Add Page"**.
6. Since you are the page admin, it will be linked instantly.

### Step 4 — Verify Your Business (Optional but Recommended)
1. In Business Settings, go to **"Security Center"**.
2. Click **"Start Verification"**.
3. You'll need:
   - **Business Website**: Your GitHub Pages URL
   - **Business Address**: Galaxy Academy's physical address
   - **A document** (one of these):
     - Electricity/water bill in your name or the academy's name
     - Bank statement showing your name/address
     - Any government-issued letter with address
4. Verification takes **1–3 business days**.

> [!NOTE]
> Business verification is **not mandatory** to start using WhatsApp sandbox with Twilio. But it IS required later for full production access with a branded "Galaxy Academy" WhatsApp profile.

---

## Part 3: Connect to Twilio (Next Steps)

Once both accounts are ready, the next steps will be:

1. **Sign up at [twilio.com](https://www.twilio.com/try-twilio)** — use your email, get $15 free credit
2. In Twilio Console → **Messaging** → **WhatsApp** → **Senders**
3. Connect your Meta Business Account to Twilio
4. Submit a **message template** for approval:
   ```
   Dear Parent, your ward {{1}} was absent on {{2}} for {{3}} class.
   — Galaxy Academy
   ```
5. Template approval takes **24–48 hours** from Meta
6. I write a Firebase Cloud Function to send messages via Twilio API

---

## Checklist

- [ ] Created Facebook account (or logged into existing one)
- [ ] Created "Galaxy Academy" Facebook Page
- [ ] Added page details (category, bio, website URL)
- [ ] Published at least 1 post on the page
- [ ] Created Meta Business Account at business.facebook.com
- [ ] Linked the Galaxy Academy page to the Business Account
- [ ] (Optional) Started business verification
- [ ] Signed up for Twilio account

---

## Timeline

| Task | Time |
|---|---|
| Create FB Page | 5 minutes |
| Create Meta Business Account | 5 minutes |
| Link Page to Business Account | 2 minutes |
| Business Verification | 1–3 days |
| Twilio Signup | 5 minutes |
| WhatsApp Template Approval | 1–2 days |
| **Total setup time** | **~15 min setup + 2–3 days waiting** |
