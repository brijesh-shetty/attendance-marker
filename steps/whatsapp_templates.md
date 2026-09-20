# WhatsApp Fee Follow-Up Templates

> These are ready to submit to **Meta Business Manager** for approval. Each uses 5 body variables:
> - `{{1}}` = Student name
> - `{{2}}` = Total fee
> - `{{3}}` = Amount received
> - `{{4}}` = Balance due
> - `{{5}}` = Payment deadline / due date (e.g. `25th Sept 2026`)

---

## Stage 1 — Group WhatsApp Reminder

### Template: `fee_reminder` (for parents who have paid partially)

```
Dear parent of {{1}} 🙏

Hope your child is doing well in their studies!

This is a gentle reminder regarding the pending fee balance.

💰 Total Fee: ₹{{2}}
✅ Received: ₹{{3}}
⏳ Balance Due: ₹{{4}}
📅 Due Date: {{5}}

Kindly clear the balance before {{5}} to ensure uninterrupted classes.

💳 UPI / Cash accepted at the centre.

For queries, message us personally. Thank you! 🌟

— Galaxy Academy 📚
```

### Template: `fee_reminder_zero` (for parents who have NOT paid at all)

```
Dear parent of {{1}} 🙏

Hope your child is doing well!

We noticed that no fee payment has been received yet for this term.

💰 Total Fee: ₹{{2}}
❌ Received: ₹0
⏳ Full Amount Due: ₹{{4}}
📅 Due Date: {{5}}

We understand that finances need planning. Kindly arrange at least a partial payment before {{5}}. Even installments are welcome.

💳 UPI / Cash accepted at the centre.

For queries or to discuss a payment plan, message us personally. Thank you! 🙏

— Galaxy Academy 📚
```

---

## Stage 2 — Personal WhatsApp (Individual)

### Template: `fee_followup_personal` (partial payment)

```
Dear parent of {{1}} 🙏

Thank you for the payment of ₹{{3}} received so far! {{1}} is doing really well and we are happy to have them.

Just a gentle reminder — the remaining fee balance of ₹{{4}} is still pending.

Kindly arrange the payment before {{5}}.
🔹 Even partial payment is fine
🔹 Monthly installments can be arranged

💳 UPI / Cash at centre

Please reply to this message or call us to discuss. Thank you! 🙏

— Galaxy Academy 📚
```

### Template: `fee_followup_personal_zero` (zero payment)

```
Dear parent of {{1}} 🙏

Hope {{1}} is doing well in their studies!

We wanted to personally reach out regarding the fee for this term. As of now, the full fee of ₹{{2}} is still pending.

We completely understand that finances need planning. Please let us know:
🔹 Can you arrange a partial payment before {{5}}?
🔹 Would monthly installments work better?

We want to ensure {{1}}'s classes continue without interruption and are happy to work out a comfortable plan.

💳 UPI / Cash at centre

Thank you for your trust! 🙏

— Galaxy Academy 📚
```

---

## Stage 2.5 — Deadline-Based Auto Reminders

### Template: `eve_reminder` (one day before deadline)

```
Dear parent of {{1}} 🙏

Just a reminder that tomorrow {{5}} is the last date for the fee payment.

⏳ Balance Due: ₹{{4}}

Kindly arrange today itself to avoid any interruption to classes.

💳 UPI / Cash accepted at the centre.

Thank you! 🙏

— Galaxy Academy 📚
```

### Template: `deadline_missed` (deadline day / same day follow-up)

```
Dear parent of {{1}} 🙏

Today {{5}} was the last date for the fee payment of ₹{{4}}.

Request you to kindly arrange the payment by tomorrow morning. Please confirm when you can pay.

💳 UPI / Cash accepted at the centre.

Thank you for your understanding. 🙏

— Galaxy Academy 📚
```

### Template: `final_warning` (3 days after deadline)

```
Dear parent of {{1}} 🙏

The fee balance of ₹{{4}} for {{1}}'s classes is now significantly overdue. The deadline was {{5}}.

Request you to kindly arrange payment immediately to ensure {{1}}'s classes continue without any interruption.

Please respond today. Thank you. 🙏

— Galaxy Academy 📚
```

---

## Stage 3 — Phone Call Script (not a WhatsApp template — logged only)

> **Call between 6pm–8pm when parents are available**

### If partial payment received:
```
"Hello, this is [Name] from Galaxy Academy. Calling regarding {{1}}'s fee balance.
Thank you for the ₹{{3}} received. The remaining ₹{{4}} is still pending.
When would it be convenient to arrange payment? Even partial is fine to start."
```

### If zero payment:
```
"Hello, this is [Name] from Galaxy Academy. Calling regarding {{1}}'s tuition fee.
The full fee of ₹{{2}} is pending for this term. We understand things need planning.
When can you arrange at least a partial payment? We can also work out installments."
```

> **Important:** Always get a SPECIFIC date commitment. Note their exact words.

---

## Stage 4 — Face-to-Face Meeting Script (logged only)

> **Catch during drop-off/pick-up — request private 2-minute conversation**

### Approach:
```
"Could we speak privately for 2 minutes? {{1}} has been doing great in class
and I want to ensure they continue. The fee balance of ₹{{4}} is pending.
Can we sort it out today? I have flexible options — installments, UPI, cash."
```

> **Triggers to use:**
> - Show child's recent test scores / progress
> - "Most parents have already cleared their dues"
> - Offer post-dated cheque option
> - Last resort: "We have students on the waitlist — I want to secure {{1}}'s seat first"

---

## Summary Table

| Template Name | Stage | Use When | Sends Via API? |
|---|---|---|---|
| `fee_reminder` | 1 | Partial payment received | ✅ Yes |
| `fee_reminder_zero` | 1 | No payment at all | ✅ Yes |
| `fee_followup_personal` | 2 | Partial payment, personal | ✅ Yes |
| `fee_followup_personal_zero` | 2 | Zero payment, personal | ✅ Yes |
| `eve_reminder` | 2.5 | One day before deadline | ✅ Yes |
| `deadline_missed` | 2.5 | Deadline day / same day | ✅ Yes |
| `final_warning` | 2.5 | 3 days after deadline | ✅ Yes |
| *(phone call script)* | 3 | After Stage 2 fails | ❌ Logged only |
| *(face-to-face script)* | 4 | After Stage 3 fails | ❌ Logged only |

> [!IMPORTANT]
> Submit the 7 WhatsApp templates (`fee_reminder`, `fee_reminder_zero`, `fee_followup_personal`, `fee_followup_personal_zero`, `eve_reminder`, `deadline_missed`, `final_warning`) to **Meta Business Manager → WhatsApp Manager → Message Templates** for approval before they can be sent via the API.

