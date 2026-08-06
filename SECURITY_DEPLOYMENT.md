# Secure Firebase and Render deployment

The browser now uses only the Render API. Firestore credentials, Firestore writes, password hashes, and WhatsApp credentials remain on the server.

## Required Render environment variables

Set these in the Render service dashboard before deploying:

- `ADMIN_PASSWORD_HASH` — a bcrypt hash of a unique admin password of at least 14 characters. Generate it locally from `server` with `npm.cmd run hash:admin -- "your-long-password"` and paste only the generated hash into Render.
- `JWT_SECRET` — Render generates this from `render.yaml`; if setting it manually, use a long random value.
- `FIREBASE_SERVICE_ACCOUNT_BASE64` — base64-encoded contents of a Firebase service-account JSON key. Do not commit the JSON file.
- `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_ID` — only if WhatsApp absence notifications are enabled.

In PowerShell, encode a downloaded service-account file without displaying it:

```powershell
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Content .\service-account.json -Raw)))
```

Use a dedicated service account with only the Firestore permissions the service needs. Delete the downloaded JSON file after it has been stored in Render.

## Lock Firestore

After Render has deployed successfully with the service-account secret, publish the rules in `firebase/firestore.rules` from Firebase Console → Firestore Database → Rules. They deny every direct browser read and write. Firebase Admin on Render continues to work because it is server-side.

## Deployment checks

1. Visit `/api/health` and confirm it returns `status: ok`.
2. Sign in to `/admin/` with the new password.
3. Verify students, attendance, tests, payments, and student login work.
4. In a private browser window, confirm that `/api/admin/students` returns 401 and `/api/config/firebase` returns 404.
5. Clear browser site data on former admin/student devices only after confirming the Firestore records are present. This removes legacy local offline copies.

## Data migration notes

- Export a backup from the old admin portal before deploying if you ever used its offline/local mode. The secured admin backup import restores students, attendance, test data, syllabus, and payments through the protected server API.
- Existing custom student passwords were stored only in the old browser. They cannot be migrated safely. Each student initially signs in with the existing parent phone number once, then the portal requires a new 12-character password and stores only its bcrypt hash on the server.

## Operational rules

- Never add an admin password, Firebase web configuration, service-account JSON, Twilio token, or WhatsApp token to browser code or browser storage.
- Keep generic SMS broadcast disabled until its provider is implemented through a protected server route.
- Rotate the admin password and WhatsApp token if either was ever shared or entered in browser settings.
- Remove obsolete `ADMIN_PASSCODE` and browser Firebase configuration variables from Render once the new deployment is working; the secured application does not use them.
