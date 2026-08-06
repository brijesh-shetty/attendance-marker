# Secure implementation plan

The application uses Render as the sole gateway to Firebase Firestore. Browser pages never receive Firebase credentials and never access Firestore directly.

## Data flow

1. Admin and student sign-in requests go to `/api/auth/*` on the same Render origin.
2. Render verifies the password and stores the signed session in an HTTP-only, secure cookie.
3. Protected API routes read and write Firestore through Firebase Admin using a Render-only service-account secret.
4. Firestore Rules deny every direct browser request.

## Configuration

Follow `SECURITY_DEPLOYMENT.md` for Render variables, service-account encoding, Firestore Rules, and post-deployment checks.

## Security constraints

- Do not recreate `/api/config/firebase`.
- Do not put passcodes, passwords, provider tokens, or service-account values in browser JavaScript, HTML, or local storage.
- Do not add direct Firebase SDK access in `js/` or `student/`.
- All messaging provider requests must originate on the server and require an authenticated admin session.
