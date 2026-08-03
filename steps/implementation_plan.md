# Secure Firebase Credentials & Deploy to Render

The Firebase config (API key, project ID, etc.) is currently **hardcoded** in [db.js](file:///c:/Users/Lenovo/projects/TUTION/js/db.js#L12-L19), which means anyone viewing your GitHub repo or inspecting the browser source can see it. The WhatsApp token in [.env](file:///c:/Users/Lenovo/projects/TUTION/server/.env) is already gitignored but needs to be set as Render environment variables.

## User Review Required

> [!CAUTION]
> Your Firebase credentials and WhatsApp token are currently exposed in the Git history if you've already pushed commits. After this change, you should **rotate your Firebase API key** and **WhatsApp token** in their respective consoles.

> [!IMPORTANT]
> **Render Deployment Type**: This project will be deployed as a **Web Service** (Node.js), NOT a Static Site, because the Express server handles both the API routes and serves the frontend files.

## Proposed Changes

### 1. Server — Serve Firebase Config via API Endpoint

#### [MODIFY] [server.js](file:///c:/Users/Lenovo/projects/TUTION/server/server.js)

Add a new `GET /api/config/firebase` endpoint that reads Firebase credentials from environment variables and returns them to the frontend. This keeps secrets server-side — the frontend fetches them at runtime instead of having them hardcoded.

```js
// New endpoint — returns Firebase config from env vars
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
```

---

### 2. Server — Add Firebase vars to .env files

#### [MODIFY] [.env](file:///c:/Users/Lenovo/projects/TUTION/server/.env)

Add the Firebase variables (keeping your actual values local):
```
FIREBASE_API_KEY=AIzaSyB2YJOFV6qFzDfuMjL2aGKHgq4Eb_f05Jo
FIREBASE_AUTH_DOMAIN=galaxyacademy-5.firebaseapp.com
FIREBASE_PROJECT_ID=galaxyacademy-5
FIREBASE_STORAGE_BUCKET=galaxyacademy-5.firebasestorage.app
FIREBASE_MESSAGING_SENDER_ID=178445479028
FIREBASE_APP_ID=1:178445479028:web:42dbad5f82cd4d3b6af521
```

#### [MODIFY] [.env.example](file:///c:/Users/Lenovo/projects/TUTION/server/.env.example)

Add placeholder Firebase vars so new users know what to configure.

---

### 3. Frontend — Remove hardcoded credentials from db.js

#### [MODIFY] [db.js](file:///c:/Users/Lenovo/projects/TUTION/js/db.js)

- **Remove** the hardcoded `DEFAULT_FIREBASE_CONFIG` object (lines 12-19)
- **Add** a `fetchFirebaseConfig()` function that calls `GET /api/config/firebase`
- **Update** the `DatabaseManager` constructor to fetch config from the server on init
- If the fetch fails (e.g. offline), fall back to localStorage cached config or local-only mode

---

### 4. Render Deployment Setup

#### [NEW] [render.yaml](file:///c:/Users/Lenovo/projects/TUTION/render.yaml)

Render blueprint file for one-click deploy:
```yaml
services:
  - type: web
    name: galaxy-academy
    runtime: node
    rootDir: server
    buildCommand: npm install
    startCommand: node server.js
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 5000
```

> [!NOTE]
> The `rootDir: server` tells Render to use `server/` as the working directory. Since `server.js` serves static files from `../` (the parent), Render needs the full repo available. We'll adjust the static path or Render config accordingly.

#### Render Environment Variables to Set (via Render Dashboard)

| Variable | Value |
|---|---|
| `PORT` | `5000` (or Render's default) |
| `FIREBASE_API_KEY` | Your Firebase API key |
| `FIREBASE_AUTH_DOMAIN` | `galaxyacademy-5.firebaseapp.com` |
| `FIREBASE_PROJECT_ID` | `galaxyacademy-5` |
| `FIREBASE_STORAGE_BUCKET` | `galaxyacademy-5.firebasestorage.app` |
| `FIREBASE_MESSAGING_SENDER_ID` | `178445479028` |
| `FIREBASE_APP_ID` | `1:178445479028:web:42dbad5f82cd4d3b6af521` |
| `WHATSAPP_TOKEN` | Your WhatsApp token |
| `WHATSAPP_PHONE_ID` | `1212978718570396` |
| `WHATSAPP_TEMPLATE_NAME` | `abseentee` |
| `ACADEMY_CONTACT` | `9876543210` |

---

### 5. Git Safety

#### [MODIFY] [.gitignore](file:///c:/Users/Lenovo/projects/TUTION/.gitignore)

Already covers `.env` files — no changes needed. The critical fix is removing the hardcoded Firebase config from `db.js` (step 3).

## Open Questions

1. **Root directory for Render**: Render can either use the repo root or `server/` as the root directory. Since `server.js` references `path.join(__dirname, '../')` for static files, we should run from `server/` with the full repo cloned. Does that work for you, or would you prefer to restructure the project?

2. **Firebase Security Rules**: Are your Firestore security rules currently set to allow open reads/writes? If so, we should tighten them since the project will be publicly hosted.

## Verification Plan

### Manual Verification
1. Start the server locally (`node server.js` from `server/`)
2. Visit `http://localhost:5000/api/config/firebase` — should return Firebase config from `.env`
3. Open admin portal — should still connect to Firebase normally
4. Check that `db.js` has **no hardcoded credentials** in the source code
5. Push to GitHub and verify `.env` is not included
6. Deploy to Render and verify the app works with environment variables
