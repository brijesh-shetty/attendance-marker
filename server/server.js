const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore: firebaseFirestore } = require('firebase-admin/firestore');
const { createClient: createSupabaseClient } = require('@supabase/supabase-js');
const path = require('path');

// dotenv MUST run before any module that reads process.env at load time
// (notification.js caches SMS_PROVIDER in its constructor, so if we required
// it before dotenv, it would default to 'fast2sms' regardless of the .env file).
require('dotenv').config({ path: path.join(__dirname, '.env') });

const notificationService = require('./services/notification');

const app = express();
const PORT = process.env.PORT || 5000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ROOT_DIR = path.join(__dirname, '..');
const SESSION_COOKIE = 'ga_session';
// Sliding-idle session: expires 15 minutes after the LAST authenticated
// request. Every request through `authenticate()` re-issues the cookie, so an
// active user is never logged out mid-work — only true idle time counts.
const SESSION_TTL_SECONDS = 15 * 60;
const DEVELOPMENT_JWT_SECRET = crypto.randomBytes(48).toString('hex');
const DEFAULT_BATCH = { id: '2026-12-1', batchNumber: 1, academicYear: 2026, grade: 12, active: true };

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://unpkg.com'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      workerSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: IS_PRODUCTION ? [] : null
    }
  },
  crossOriginResourcePolicy: { policy: 'same-origin' }
}));
// Resource uploads travel through JSON as base64, so we raise the JSON limit
// enough to admit one Firestore-sized document (~1 MB of raw file becomes ~1.4 MB
// after base64+envelope). Everything else — auth, marks, attendance — still
// fits comfortably.
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '25kb' }));

function readServiceAccount() {
  const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  const raw = encoded
    ? Buffer.from(encoded, 'base64').toString('utf8')
    : process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!raw) return null;

  try {
    const account = JSON.parse(raw);
    if (account.private_key) account.private_key = account.private_key.replace(/\\n/g, '\n');
    return account;
  } catch (error) {
    console.error('FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON.');
    return null;
  }
}

function getFirestore() {
  if (getApps().length) return firebaseFirestore();

  const serviceAccount = readServiceAccount();
  if (!serviceAccount) {
    const error = new Error('Firebase server credentials are not configured.');
    error.code = 'FIREBASE_NOT_CONFIGURED';
    throw error;
  }

  initializeApp({ credential: cert(serviceAccount) });
  return firebaseFirestore();
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key || url.includes('your-project') || key.includes('your_service_role_key')) {
    const error = new Error('Supabase credentials are not set.');
    error.code = 'SUPABASE_NOT_CONFIGURED';
    throw error;
  }
  return createSupabaseClient(url, key, {
    auth: { persistSession: false }
  });
}

function getJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (IS_PRODUCTION) {
    const error = new Error('JWT_SECRET must be set in production.');
    error.code = 'AUTH_NOT_CONFIGURED';
    throw error;
  }
  return process.env.DEV_JWT_SECRET || DEVELOPMENT_JWT_SECRET;
}

function getCookie(req, name) {
  const cookies = req.headers.cookie || '';
  const prefix = `${name}=`;
  const match = cookies.split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: IS_PRODUCTION,
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_SECONDS * 1000
  };
}

function issueSession(res, session) {
  const token = jwt.sign(session, getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: SESSION_TTL_SECONDS,
    issuer: 'galaxy-academy',
    audience: 'galaxy-academy-web'
  });
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

function clearSession(res) {
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
}

function authenticate(req, res, next) {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return res.status(401).json({ message: 'Authentication is required.' });

  try {
    const claims = jwt.verify(token, getJwtSecret(), {
      algorithms: ['HS256'],
      issuer: 'galaxy-academy',
      audience: 'galaxy-academy-web'
    });
    req.user = claims;
    // Slide the idle window: every authenticated request re-issues the cookie
    // with a fresh 15-minute TTL, so an active user is never logged out mid-
    // session. Strip the jwt-managed claims (iat, exp, iss, aud, nbf, jti)
    // before re-signing — jwt.sign() would otherwise refuse `expiresIn`.
    const { iat, exp, iss, aud, nbf, jti, ...payload } = claims;
    issueSession(res, payload);
    return next();
  } catch (error) {
    clearSession(res);
    return res.status(401).json({ message: 'Your session has expired. Please sign in again.' });
  }
}

function requireAdmin(req, res, next) {
  return authenticate(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access is required.' });
    return next();
  });
}

function requireStudent(req, res, next) {
  return authenticate(req, res, () => {
    if (req.user.role !== 'student' || !req.user.studentId) {
      return res.status(403).json({ message: 'Student access is required.' });
    }
    return next();
  });
}

function requireSameOrigin(req, res, next) {
  const origin = req.get('origin');
  if (!origin) return next();
  const expectedOrigin = `${req.protocol}://${req.get('host')}`;
  if (origin !== expectedOrigin) return res.status(403).json({ message: 'Cross-site requests are not allowed.' });
  return next();
}

function noStore(req, res, next) {
  res.set('Cache-Control', 'no-store');
  return next();
}

function text(value, name, { required = false, max = 200 } = {}) {
  if (value === undefined || value === null) {
    if (required) throw new Error(`${name} is required.`);
    return '';
  }
  if (typeof value !== 'string' && typeof value !== 'number') throw new Error(`${name} is invalid.`);
  const normalized = String(value).trim();
  if (required && !normalized) throw new Error(`${name} is required.`);
  if (normalized.length > max) throw new Error(`${name} is too long.`);
  if (/[<>]/.test(normalized)) throw new Error(`${name} contains unsupported characters.`);
  return normalized;
}

function documentId(value, name) {
  const id = text(value, name, { required: true, max: 120 });
  if (id.includes('/') || id.includes('..')) throw new Error(`${name} is invalid.`);
  return id;
}

function dateValue(value) {
  const date = text(value, 'Date', { required: true, max: 10 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('Date must use YYYY-MM-DD.');
  return date;
}

function phoneValue(value, name) {
  const phone = text(value, name, { max: 20 });
  if (phone && !/^[0-9+()\-\s]{7,20}$/.test(phone)) throw new Error(`${name} is invalid.`);
  return phone;
}

function testKey(testId, subject) {
  const normalizedTestId = text(testId, 'Test ID', { required: true, max: 80 });
  const normalizedSubject = text(subject, 'Subject', { required: true, max: 80 });
  const key = `${normalizedTestId.replace(/\s+/g, '')}_${normalizedSubject}`;
  return documentId(key, 'Test key');
}

// ── Batch scoping helpers ────────────────────────────────────
// activeBatchId returns the batch the caller is currently operating in.
// Admins carry `activeBatchId` on their session; students carry `batchId`.
// Any request without an explicit batch falls back to DEFAULT_BATCH so
// legacy data that was created before batch isolation stays reachable.
function activeBatchId(req) {
  if (req && req.user) {
    if (req.user.activeBatchId) return req.user.activeBatchId;
    if (req.user.batchId) return req.user.batchId;
  }
  return DEFAULT_BATCH.id;
}

// batchDocKey prefixes a natural key (attendance date, testKey, syllabus key)
// with the batch id so different batches can share the same natural key
// without colliding.
function batchDocKey(req, key) {
  return `${activeBatchId(req)}__${key}`;
}

// docBelongsToActiveBatch decides whether a Firestore doc belongs to the
// caller's batch. Untagged legacy docs are treated as DEFAULT_BATCH so no
// existing data is orphaned.
function docBelongsToActiveBatch(req, data) {
  const bid = activeBatchId(req);
  if (data && data.batchId) return data.batchId === bid;
  return bid === DEFAULT_BATCH.id;
}

// Split a batch-prefixed doc id back into its natural key. Untagged legacy
// docs return their id unchanged.
function stripBatchPrefix(docId, batchId) {
  const prefix = `${batchId}__`;
  return docId.startsWith(prefix) ? docId.slice(prefix.length) : docId;
}

async function allocateNextStudentNumber(db, batchId) {
  const snapshot = await db.collection('students').get();
  let maxNumber = 0;
  snapshot.forEach(item => {
    const data = item.data();
    const inBatch = data.batchId ? data.batchId === batchId : batchId === DEFAULT_BATCH.id;
    if (!inBatch) return;
    const num = Number(data.number);
    if (Number.isFinite(num) && num > maxNumber) maxNumber = num;
    // Also treat legacy purely-numeric doc ids as candidates.
    if (!Number.isFinite(num)) {
      const legacyNum = Number(item.id);
      if (Number.isFinite(legacyNum) && legacyNum > maxNumber) maxNumber = legacyNum;
    }
  });
  return maxNumber + 1;
}

function normalizeStudent(payload, requestedId) {
  const id = documentId(requestedId || payload.id, 'Student ID');
  return {
    id,
    name: text(payload.name, 'Student name', { required: true, max: 200 }),
    phone: phoneValue(payload.phone, 'Parent contact phone 1'),
    parentPhone: phoneValue(payload.parentPhone, 'Parent contact phone 2'),
    combination: text(payload.combination, 'Combination', { max: 20 }).toUpperCase(),
    college: text(payload.college, 'College', { max: 100 })
  };
}

function normalizeRecords(records) {
  if (!records || typeof records !== 'object' || Array.isArray(records)) throw new Error('Attendance records are invalid.');
  const entries = Object.entries(records);
  if (entries.length > 500) throw new Error('Too many attendance records.');
  const normalized = {};
  for (const [studentId, status] of entries) {
    if (studentId === '__leaveDay') {
      normalized.__leaveDay = status === true;
      continue;
    }
    const id = documentId(studentId, 'Student ID');
    if (status !== 'P' && status !== 'A') throw new Error('Attendance status must be P or A.');
    normalized[id] = status;
  }
  return normalized;
}

function normalizeResults(results) {
  if (!results || typeof results !== 'object' || Array.isArray(results)) throw new Error('Test results are invalid.');
  const entries = Object.entries(results);
  if (entries.length > 500) throw new Error('Too many test results.');
  const normalized = {};
  for (const [studentId, result] of entries) {
    const id = documentId(studentId, 'Student ID');
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('A test result is invalid.');
    normalized[id] = {
      present: result.present !== false,
      cetMarks: text(result.cetMarks, 'CET marks', { max: 12 }),
      theoryMarks: text(result.theoryMarks, 'Theory marks', { max: 12 }),
      totalMarks: text(result.totalMarks, 'Total marks', { max: 12 }),
      marks: text(result.marks, 'Marks', { max: 12 })
    };
  }
  return normalized;
}

function normalizeMetadata(metadata = {}) {
  const cet = Number.isFinite(Number(metadata.cetTotal)) ? Number(metadata.cetTotal) : 25;
  const theory = Number.isFinite(Number(metadata.theoryTotal)) ? Number(metadata.theoryTotal) : 25;
  const sum = Number.isFinite(Number(metadata.sumTotal)) ? Number(metadata.sumTotal) : (cet + theory);
  return {
    testType: text(metadata.testType, 'Test type', { max: 30 }) || 'Test',
    testNumber: text(metadata.testNumber, 'Test number', { max: 30 }),
    date: metadata.date ? dateValue(metadata.date) : '',
    cetTotal: cet,
    theoryTotal: theory,
    sumTotal: sum
  };
}

function publicStudent(student) {
  return {
    id: student.id,
    name: student.name,
    combination: student.combination || '',
    college: student.college || '',
    // Expose the per-batch student number so the UI can show "#5" instead of the
    // long internal doc id (e.g. "2026-12-1__5"). Legacy students without a
    // `number` fall back to the numeric part of their id when possible.
    number: Number.isFinite(Number(student.number))
      ? Number(student.number)
      : (Number.isFinite(Number(student.id)) ? Number(student.id) : null),
    batchId: student.batchId || null
  };
}

function clientError(res, error) {
  return res.status(400).json({ message: error.message || 'Invalid request.' });
}

function firebaseError(res, error) {
  if (error.code === 'FIREBASE_NOT_CONFIGURED') {
    return res.status(503).json({ message: 'Server database credentials are not configured.' });
  }
  if (error instanceof SyntaxError || /^(Student ID|Password|Current password|New password) /i.test(error.message || '')) {
    return clientError(res, error);
  }
  console.error('API error:', error);
  return res.status(500).json({ message: 'The server could not complete the request.' });
}

async function writeAudit(req, action, targetId = '') {
  try {
    const db = getFirestore();
    await db.collection('audit_logs').add({
      actorRole: req.user?.role || 'anonymous',
      actorId: req.user?.studentId || 'admin',
      action,
      targetId,
      occurredAt: new Date().toISOString(),
      ip: req.ip
    });
  } catch (error) {
    console.error('Audit log write failed:', error.message);
  }
}

async function commitWrites(db, writes) {
  for (let index = 0; index < writes.length; index += 400) {
    const batch = db.batch();
    writes.slice(index, index + 400).forEach(({ ref, data }) => batch.set(ref, data));
    await batch.commit();
  }
}

const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Try again in 15 minutes.' }
});

const studentLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many login attempts. Try again in 15 minutes.' }
});

const notificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Notification rate limit reached. Try again later.' }
});

app.use('/api', noStore);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', academy: 'Galaxy Academy API Server', timestamp: new Date().toISOString() });
});

app.post('/api/auth/admin/login', requireSameOrigin, adminLoginLimiter, async (req, res) => {
  try {
    const password = text(req.body.password, 'Password', { required: true, max: 500 });
    const hash = process.env.ADMIN_PASSWORD_HASH;
    if (!hash) return res.status(503).json({ message: 'Admin authentication is not configured.' });
    const valid = await bcrypt.compare(password, hash);
    if (!valid) return res.status(401).json({ message: 'Invalid credentials.' });

    issueSession(res, { role: 'admin' });
    req.user = { role: 'admin' };
    await writeAudit(req, 'admin.login');
    return res.json({ user: { role: 'admin' } });
  } catch (error) {
    return clientError(res, error);
  }
});

app.post('/api/auth/student/login', requireSameOrigin, studentLoginLimiter, async (req, res) => {
  try {
    const password = text(req.body.password, 'Password', { required: true, max: 500 });
    const db = getFirestore();

    // Two accepted login shapes:
    //   1) { studentId, password }         — legacy direct Firestore id
    //   2) { batchNumber, year, grade, number, password } — new per-batch username
    let studentId;
    if (req.body.studentId) {
      studentId = documentId(req.body.studentId, 'Student ID');
    } else {
      const batchNumber = Number(req.body.batchNumber);
      const year = Number(req.body.year);
      const grade = Number(req.body.grade);
      const number = Number(req.body.number);
      if (![batchNumber, year, grade, number].every(v => Number.isInteger(v) && v > 0)) {
        return res.status(400).json({ message: 'Please enter batch number, year, grade and student number.' });
      }
      const batchId = `${year}-${grade}-${batchNumber}`;
      // First try the canonical `{batchId}__{number}` doc key that new
      // students are created under.
      const composedId = `${batchId}__${number}`;
      let candidate = await db.collection('students').doc(composedId).get();
      if (!candidate.exists) {
        // Fall back to searching by matching batchId + number for imported
        // or manually-authored records that don't follow the composed id.
        const roster = await db.collection('students').get();
        const match = roster.docs.find(d => {
          const data = d.data() || {};
          const docBatch = data.batchId || DEFAULT_BATCH.id;
          const docNumber = Number.isFinite(Number(data.number))
            ? Number(data.number)
            : Number(d.id);
          return docBatch === batchId && docNumber === number;
        });
        if (!match) return res.status(401).json({ message: 'Invalid credentials.' });
        studentId = match.id;
      } else {
        studentId = composedId;
      }
    }

    const studentSnapshot = await db.collection('students').doc(studentId).get();
    if (!studentSnapshot.exists) return res.status(401).json({ message: 'Invalid credentials.' });

    const student = { id: studentSnapshot.id, ...studentSnapshot.data() };
    const credentialRef = db.collection('student_credentials').doc(studentId);
    const credentialSnapshot = await credentialRef.get();
    let valid = false;
    let mustChangePassword = false;

    if (credentialSnapshot.exists) {
      valid = await bcrypt.compare(password, credentialSnapshot.data().passwordHash);
      mustChangePassword = credentialSnapshot.data().mustChangePassword === true;
    } else {
      const legacyPassword = student.phone || student.parentPhone;
      valid = Boolean(legacyPassword) && password === legacyPassword;
      if (valid) {
        await credentialRef.set({
          passwordHash: await bcrypt.hash(password, 12),
          mustChangePassword: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        mustChangePassword = true;
      }
    }

    if (!valid) return res.status(401).json({ message: 'Invalid credentials.' });
    const studentBatch = student.batchId || DEFAULT_BATCH.id;
    issueSession(res, { role: 'student', studentId, batchId: studentBatch });
    req.user = { role: 'student', studentId, batchId: studentBatch };
    await writeAudit(req, 'student.login', studentId);
    return res.json({ student: publicStudent(student), mustChangePassword });
  } catch (error) {
    return firebaseError(res, error);
  }
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  try {
    if (req.user.role === 'admin') return res.json({ user: { role: 'admin' } });
    const db = getFirestore();
    const snapshot = await db.collection('students').doc(req.user.studentId).get();
    if (!snapshot.exists) {
      clearSession(res);
      return res.status(401).json({ message: 'Student account no longer exists.' });
    }
    return res.json({ user: { role: 'student', student: publicStudent({ id: snapshot.id, ...snapshot.data() }) } });
  } catch (error) {
    return firebaseError(res, error);
  }
});

app.post('/api/auth/logout', requireSameOrigin, authenticate, async (req, res) => {
  clearSession(res);
  await writeAudit(req, 'auth.logout', req.user.studentId || 'admin');
  return res.status(204).end();
});

app.post('/api/auth/student/change-password', requireSameOrigin, requireStudent, async (req, res) => {
  try {
    const currentPassword = text(req.body.currentPassword, 'Current password', { required: true, max: 500 });
    const newPassword = text(req.body.newPassword, 'New password', { required: true, max: 500 });
    if (newPassword.length < 12) return res.status(400).json({ message: 'New password must be at least 12 characters.' });
    if (newPassword === currentPassword) return res.status(400).json({ message: 'Choose a different password.' });

    const db = getFirestore();
    const credentialRef = db.collection('student_credentials').doc(req.user.studentId);
    const snapshot = await credentialRef.get();
    if (!snapshot.exists || !(await bcrypt.compare(currentPassword, snapshot.data().passwordHash))) {
      return res.status(401).json({ message: 'Current password is incorrect.' });
    }

    await credentialRef.update({
      passwordHash: await bcrypt.hash(newPassword, 12),
      mustChangePassword: false,
      updatedAt: new Date().toISOString()
    });
    await writeAudit(req, 'student.password_changed', req.user.studentId);
    return res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    return firebaseError(res, error);
  }
});

// Admin Batches / Branch Workspace Management
async function ensureDefaultBatch() {
  try {
    const db = getFirestore();
    const ref = db.collection('batches').doc(DEFAULT_BATCH.id);
    const snapshot = await ref.get();
    if (!snapshot.exists) await ref.set({ ...DEFAULT_BATCH, createdAt: Date.now(), updatedAt: Date.now() });
    return { ...DEFAULT_BATCH };
  } catch (err) {
    return { ...DEFAULT_BATCH };
  }
}

app.get('/api/admin/batches', requireAdmin, async (req, res) => {
  try {
    await ensureDefaultBatch();
    let batches = [{ ...DEFAULT_BATCH, studentCount: 0 }];
    try {
      const db = getFirestore();
      const [snapshot, studentsSnapshot] = await Promise.all([
        db.collection('batches').orderBy('academicYear', 'desc').get(),
        db.collection('students').get()
      ]);
      const counts = {};
      studentsSnapshot.forEach(item => {
        const id = item.data().batchId || DEFAULT_BATCH.id;
        counts[id] = (counts[id] || 0) + 1;
      });
      if (snapshot.docs && snapshot.docs.length > 0) {
        batches = snapshot.docs.map(item => ({ id: item.id, ...item.data(), studentCount: counts[item.id] || 0 }));
      }
    } catch (dbErr) {
      console.warn('Firestore batches fetch fallback:', dbErr.message);
    }

    return res.json({ batches, selectedBatchId: req.user?.activeBatchId || DEFAULT_BATCH.id });
  } catch (error) {
    return res.json({ batches: [{ ...DEFAULT_BATCH, studentCount: 0 }], selectedBatchId: DEFAULT_BATCH.id });
  }
});

app.post('/api/admin/batches', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const batchNumber = Number(req.body.batchNumber);
    const academicYear = Number(req.body.academicYear);
    const grade = Number(req.body.grade);
    if (!Number.isInteger(batchNumber) || batchNumber < 1 || batchNumber > 999) throw new Error('Batch number is invalid.');
    if (!Number.isInteger(academicYear) || academicYear < 2000 || academicYear > 2100) throw new Error('Academic year is invalid.');
    if (![11, 12].includes(grade)) throw new Error('Grade must be 11 or 12.');
    const id = `${academicYear}-${grade}-${batchNumber}`;
    const batch = { batchNumber, academicYear, grade, active: true, createdAt: Date.now(), updatedAt: Date.now() };

    try {
      const db = getFirestore();
      await db.collection('batches').doc(id).set(batch);
    } catch (dbErr) {
      console.warn('Firestore create batch save warning:', dbErr.message);
    }

    return res.status(201).json({ batch: { id, ...batch } });
  } catch (error) {
    return clientError(res, error);
  }
});

app.post('/api/admin/batches/select', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const batchId = text(req.body.batchId, 'Batch ID', { required: true, max: 100 });
    issueSession(res, { role: 'admin', activeBatchId: batchId });
    return res.json({ batch: { id: batchId, batchNumber: 1, academicYear: 2026, grade: 12, active: true } });
  } catch (error) {
    return clientError(res, error);
  }
});

app.get('/api/admin/students', requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('students').get();
    const bid = activeBatchId(req);
    const students = snapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(item => docBelongsToActiveBatch(req, item))
      // Ensure legacy students without a `number` still show a stable per-batch ordinal.
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((student, idx) => ({
        ...student,
        batchId: student.batchId || bid,
        number: Number.isFinite(Number(student.number))
          ? Number(student.number)
          : (Number.isFinite(Number(student.id)) ? Number(student.id) : idx + 1)
      }));
    return res.json({ students });
  } catch (error) {
    return firebaseError(res, error);
  }
});

app.post('/api/admin/students', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    const bid = activeBatchId(req);
    const number = await allocateNextStudentNumber(db, bid);
    // Compose a globally-unique doc id from batch + per-batch serial so that
    // two batches can each have "student 1" without their attendance/marks
    // records colliding under the same doc key.
    const generatedId = `${bid}__${number}`;
    const base = normalizeStudent({ ...req.body, id: req.body.id || generatedId });
    const student = { ...base, batchId: bid, number };
    await db.collection('students').doc(student.id).set(student);
    await writeAudit(req, 'student.saved', student.id);
    return res.status(201).json({ student });
  } catch (error) {
    return clientError(res, error);
  }
});

app.put('/api/admin/students/:studentId', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    const base = normalizeStudent(req.body, req.params.studentId);
    const existingSnap = await db.collection('students').doc(base.id).get();
    const existing = existingSnap.exists ? existingSnap.data() : {};
    // Never let an edit silently move a student to a different batch; keep
    // any batchId + number that were already set.
    const student = {
      ...base,
      batchId: existing.batchId || activeBatchId(req),
      number: Number.isFinite(Number(existing.number))
        ? Number(existing.number)
        : (Number.isFinite(Number(req.body.number)) ? Number(req.body.number) : undefined)
    };
    if (student.number === undefined) delete student.number;
    await db.collection('students').doc(student.id).set(student, { merge: false });
    await writeAudit(req, 'student.saved', student.id);
    return res.json({ student });
  } catch (error) {
    return clientError(res, error);
  }
});

app.delete('/api/admin/students/:studentId', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const studentId = documentId(req.params.studentId, 'Student ID');
    const db = getFirestore();
    // Refuse to delete a student that belongs to a different batch than the admin is currently on.
    const snap = await db.collection('students').doc(studentId).get();
    if (snap.exists && !docBelongsToActiveBatch(req, snap.data())) {
      return res.status(403).json({ message: 'This student belongs to a different batch.' });
    }
    await Promise.all([
      db.collection('students').doc(studentId).delete(),
      db.collection('student_credentials').doc(studentId).delete(),
      db.collection('payments').doc(studentId).delete()
    ]);
    await writeAudit(req, 'student.deleted', studentId);
    return res.status(204).end();
  } catch (error) {
    return clientError(res, error);
  }
});

app.post('/api/admin/students/:studentId/reset-password', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const studentId = documentId(req.params.studentId, 'Student ID');
    const db = getFirestore();
    const snap = await db.collection('students').doc(studentId).get();
    if (snap.exists && !docBelongsToActiveBatch(req, snap.data())) {
      return res.status(403).json({ message: 'This student belongs to a different batch.' });
    }
    await db.collection('student_credentials').doc(studentId).delete();
    await writeAudit(req, 'student.password_reset', studentId);
    return res.json({ message: 'Student password reset. The parent phone number is required for the next login.' });
  } catch (error) {
    return clientError(res, error);
  }
});

app.get('/api/admin/attendance', requireAdmin, async (req, res) => {
  try {
    const date = dateValue(req.query.date);
    const db = getFirestore();
    // Prefer the batch-scoped key; fall back to a legacy untagged doc when the
    // admin is on the default batch so old records still load.
    const scopedSnap = await db.collection('attendance').doc(batchDocKey(req, date)).get();
    if (scopedSnap.exists) return res.json({ records: scopedSnap.data().records || {} });
    if (activeBatchId(req) === DEFAULT_BATCH.id) {
      const legacySnap = await db.collection('attendance').doc(date).get();
      if (legacySnap.exists) return res.json({ records: legacySnap.data().records || {} });
    }
    return res.json({ records: {} });
  } catch (error) {
    return clientError(res, error);
  }
});

app.get('/api/admin/attendance/month', requireAdmin, async (req, res) => {
  try {
    const year = text(req.query.year, 'Year', { required: true, max: 4 });
    const month = text(req.query.month, 'Month', { required: true, max: 2 }).padStart(2, '0');
    if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month)) throw new Error('Year and month are invalid.');
    const monthPrefix = `${year}-${month}`;
    const bid = activeBatchId(req);
    const db = getFirestore();
    const snapshot = await db.collection('attendance').get();
    const records = {};
    snapshot.forEach(item => {
      const data = item.data() || {};
      const naturalDate = stripBatchPrefix(item.id, bid);
      if (!naturalDate.startsWith(monthPrefix)) return;
      if (!docBelongsToActiveBatch(req, data)) return;
      records[naturalDate] = data.records || {};
    });
    return res.json({ attendance: records });
  } catch (error) {
    return clientError(res, error);
  }
});

app.post('/api/admin/attendance', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const date = dateValue(req.body.date);
    const records = normalizeRecords(req.body.records);
    const bid = activeBatchId(req);
    const db = getFirestore();
    await db.collection('attendance').doc(batchDocKey(req, date))
      .set({ batchId: bid, date, records, updatedAt: Date.now() });
    await writeAudit(req, 'attendance.saved', date);
    return res.json({ records });
  } catch (error) {
    return clientError(res, error);
  }
});

app.get('/api/admin/tests', requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('tests').get();
    const tests = snapshot.docs
      .map(item => ({ key: item.id, ...item.data() }))
      .filter(item => docBelongsToActiveBatch(req, item))
      .map(data => ({
        key: data.key,
        testId: data.testId || '',
        subject: data.subject || '',
        testType: data.testType || 'Test',
        testNumber: data.testNumber || '',
        date: data.date || '',
        cetTotal: data.cetTotal !== undefined ? Number(data.cetTotal) : 25,
        theoryTotal: data.theoryTotal !== undefined ? Number(data.theoryTotal) : 25,
        sumTotal: data.sumTotal !== undefined ? Number(data.sumTotal)
                  : (Number(data.cetTotal ?? 25) + Number(data.theoryTotal ?? 25)),
        updatedAt: data.updatedAt || 0
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return res.json({ tests });
  } catch (error) {
    return firebaseError(res, error);
  }
});

app.get('/api/admin/tests/marks', requireAdmin, async (req, res) => {
  try {
    const key = testKey(req.query.testId, req.query.subject);
    const db = getFirestore();
    const scopedSnap = await db.collection('tests').doc(batchDocKey(req, key)).get();
    if (scopedSnap.exists) return res.json({ results: scopedSnap.data().results || {} });
    if (activeBatchId(req) === DEFAULT_BATCH.id) {
      const legacySnap = await db.collection('tests').doc(key).get();
      if (legacySnap.exists) return res.json({ results: legacySnap.data().results || {} });
    }
    return res.json({ results: {} });
  } catch (error) {
    return clientError(res, error);
  }
});

app.post('/api/admin/tests/marks', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const testId = text(req.body.testId, 'Test ID', { required: true, max: 80 });
    const subject = text(req.body.subject, 'Subject', { required: true, max: 80 });
    const key = testKey(testId, subject);
    const bid = activeBatchId(req);
    const results = normalizeResults(req.body.results);
    const metadata = normalizeMetadata(req.body.metadata);
    const payload = { testId, subject, results, batchId: bid, updatedAt: Date.now(), ...metadata };
    const db = getFirestore();
    await db.collection('tests').doc(batchDocKey(req, key)).set(payload);
    await writeAudit(req, 'test_marks.saved', key);
    return res.json({ test: { key: batchDocKey(req, key), ...payload } });
  } catch (error) {
    return clientError(res, error);
  }
});

app.get('/api/admin/syllabus', requireAdmin, async (req, res) => {
  try {
    const testId = text(req.query.testId, 'Test ID', { required: true, max: 80 });
    const key = documentId(testId.replace(/\s+/g, ''), 'Syllabus key');
    const db = getFirestore();
    const scopedSnap = await db.collection('syllabus').doc(batchDocKey(req, key)).get();
    if (scopedSnap.exists) return res.json({ subjects: scopedSnap.data().subjects || {} });
    if (activeBatchId(req) === DEFAULT_BATCH.id) {
      const legacySnap = await db.collection('syllabus').doc(key).get();
      if (legacySnap.exists) return res.json({ subjects: legacySnap.data().subjects || {} });
    }
    return res.json({ subjects: {} });
  } catch (error) {
    return clientError(res, error);
  }
});

app.post('/api/admin/syllabus', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const testId = text(req.body.testId, 'Test ID', { required: true, max: 80 });
    if (!req.body.subjects || typeof req.body.subjects !== 'object' || Array.isArray(req.body.subjects)) throw new Error('Syllabus is invalid.');
    const subjects = {};
    for (const [subject, content] of Object.entries(req.body.subjects)) {
      subjects[text(subject, 'Subject', { required: true, max: 80 })] = text(content, 'Syllabus', { max: 5000 });
    }
    const key = documentId(testId.replace(/\s+/g, ''), 'Syllabus key');
    const bid = activeBatchId(req);
    const db = getFirestore();
    await db.collection('syllabus').doc(batchDocKey(req, key))
      .set({ testId, subjects, batchId: bid, updatedAt: Date.now() });
    await writeAudit(req, 'syllabus.saved', key);
    return res.json({ subjects });
  } catch (error) {
    return clientError(res, error);
  }
});

app.get('/api/admin/payments', requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    // Fetch payments and the student roster in parallel; then keep only the
    // payment docs whose student belongs to the active batch. This scopes
    // fees to the batch without touching legacy payment documents.
    const [paymentsSnap, studentsSnap] = await Promise.all([
      db.collection('payments').get(),
      db.collection('students').get()
    ]);
    const studentBatch = new Map();
    studentsSnap.forEach(s => studentBatch.set(s.id, s.data().batchId || DEFAULT_BATCH.id));
    const bid = activeBatchId(req);
    const payments = {};
    paymentsSnap.forEach(item => {
      const data = item.data();
      // A payment doc belongs to the active batch when either its own batchId
      // matches, or (for legacy docs) its student's batchId matches.
      const paymentBatch = data.batchId || studentBatch.get(item.id) || DEFAULT_BATCH.id;
      if (paymentBatch !== bid) return;
      payments[item.id] = {
        totalFee: Number(data.totalFee) || 65000,
        records: data.records || {},
        transactions: Array.isArray(data.transactions) ? data.transactions : [],
        lastFeeMessage: data.lastFeeMessage || null
      };
    });
    return res.json({ payments });
  } catch (error) {
    return firebaseError(res, error);
  }
});

app.post('/api/admin/payments', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const studentId = documentId(req.body.studentId, 'Student ID');
    const monthYear = text(req.body.monthYear, 'Month', { required: true, max: 30 });
    const status = text(req.body.status, 'Payment status', { required: true, max: 10 });
    if (!['paid', 'due', 'partial'].includes(status)) throw new Error('Payment status is invalid.');
    const amount = text(req.body.amount, 'Amount', { max: 20 });
    if (amount && (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) < 0 || Number(amount) > 10000000)) {
      throw new Error('Amount must be a valid non-negative number.');
    }
    const notes = text(req.body.notes, 'Notes', { max: 1000 });
    const db = getFirestore();
    const ref = db.collection('payments').doc(studentId);
    const snapshot = await ref.get();
    const existing = snapshot.exists ? snapshot.data() : {};
    const records = existing.records || {};
    records[monthYear] = { status, amount, notes, updatedAt: Date.now() };
    await ref.set({ studentId, records, totalFee: Number(existing.totalFee) || 65000, batchId: activeBatchId(req) }, { merge: true });
    await writeAudit(req, 'payment.saved', studentId);
    return res.json({ payment: records[monthYear] });
  } catch (error) {
    return clientError(res, error);
  }
});

app.post('/api/admin/payments/:studentId/total-fee', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const studentId = documentId(req.params.studentId, 'Student ID');
    const totalFee = Number(req.body.totalFee);
    if (!Number.isFinite(totalFee) || totalFee < 0 || totalFee > 10000000) {
      throw new Error('Total fee must be a valid non-negative amount.');
    }
    const db = getFirestore();
    await db.collection('payments').doc(studentId).set({ studentId, totalFee, updatedAt: Date.now(), batchId: activeBatchId(req) }, { merge: true });
    await writeAudit(req, 'payment.total_fee_saved', studentId);
    return res.json({ totalFee });
  } catch (error) {
    return clientError(res, error);
  }
});

app.post('/api/admin/payments/:studentId/transactions', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const studentId = documentId(req.params.studentId, 'Student ID');
    const date = dateValue(req.body.date);
    const amount = Number(req.body.amount);
    const note = text(req.body.note, 'Payment note', { max: 300 });
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
      throw new Error('Paid amount must be greater than zero.');
    }
    const db = getFirestore();
    const ref = db.collection('payments').doc(studentId);
    const snapshot = await ref.get();
    const existing = snapshot.exists ? snapshot.data() : {};
    const transactions = Array.isArray(existing.transactions) ? existing.transactions : [];
    if (transactions.length >= 200) throw new Error('Payment history has reached its maximum size.');
    transactions.push({ id: crypto.randomUUID(), date, amount, note, recordedAt: Date.now() });
    await ref.set({ studentId, totalFee: Number(existing.totalFee) || 65000, transactions, updatedAt: Date.now(), batchId: activeBatchId(req) }, { merge: true });
    await writeAudit(req, 'payment.transaction_added', studentId);
    return res.status(201).json({ transaction: transactions.at(-1), transactions });
  } catch (error) {
    return clientError(res, error);
  }
});

app.patch('/api/admin/payments/:studentId/transactions/:transactionIndex', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const studentId = documentId(req.params.studentId, 'Student ID');
    const transactionIndex = Number(req.params.transactionIndex);
    if (!Number.isInteger(transactionIndex) || transactionIndex < 0) throw new Error('Payment record is invalid.');
    const date = dateValue(req.body.date);
    const amount = Number(req.body.amount);
    const note = text(req.body.note, 'Payment note', { max: 300 });
    if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) {
      throw new Error('Paid amount must be greater than zero.');
    }
    const db = getFirestore();
    const ref = db.collection('payments').doc(studentId);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new Error('Payment record was not found.');
    const existing = snapshot.data();
    const transactions = Array.isArray(existing.transactions) ? existing.transactions : [];
    if (!transactions[transactionIndex]) throw new Error('Payment entry was not found.');
    transactions[transactionIndex] = {
      ...transactions[transactionIndex],
      date,
      amount,
      note,
      updatedAt: Date.now()
    };
    await ref.set({ transactions, updatedAt: Date.now() }, { merge: true });
    await writeAudit(req, 'payment.transaction_updated', studentId);
    return res.json({ transaction: transactions[transactionIndex] });
  } catch (error) {
    return clientError(res, error);
  }
});

// Delete a single payment entry (for false / duplicate entries). The
// transactions array is shrunk in place; subsequent indices shift down as
// expected. Batch scoping is honored via docBelongsToActiveBatch.
app.delete('/api/admin/payments/:studentId/transactions/:transactionIndex',
  requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const studentId = documentId(req.params.studentId, 'Student ID');
    const transactionIndex = Number(req.params.transactionIndex);
    if (!Number.isInteger(transactionIndex) || transactionIndex < 0) throw new Error('Payment record is invalid.');
    const db = getFirestore();
    const ref = db.collection('payments').doc(studentId);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw new Error('Payment record was not found.');
    const existing = snapshot.data();
    if (!docBelongsToActiveBatch(req, existing)) {
      return res.status(403).json({ message: 'This payment belongs to a different batch.' });
    }
    const transactions = Array.isArray(existing.transactions) ? existing.transactions : [];
    if (!transactions[transactionIndex]) throw new Error('Payment entry was not found.');
    const removed = transactions.splice(transactionIndex, 1)[0];
    await ref.set({ transactions, updatedAt: Date.now() }, { merge: true });
    await writeAudit(req, 'payment.transaction_deleted', `${studentId}#${transactionIndex}`);
    return res.json({ removed, transactions });
  } catch (error) {
    return clientError(res, error);
  }
});

// Clear every payment entry for a student (nuclear "delete all payments"
// option — used only when the whole payment history was entered in error).
app.delete('/api/admin/payments/:studentId/transactions',
  requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const studentId = documentId(req.params.studentId, 'Student ID');
    const db = getFirestore();
    const ref = db.collection('payments').doc(studentId);
    const snapshot = await ref.get();
    if (snapshot.exists && !docBelongsToActiveBatch(req, snapshot.data())) {
      return res.status(403).json({ message: 'This payment belongs to a different batch.' });
    }
    await ref.set({ transactions: [], updatedAt: Date.now() }, { merge: true });
    await writeAudit(req, 'payment.transactions_cleared', studentId);
    return res.status(204).end();
  } catch (error) {
    return clientError(res, error);
  }
});

// ── Fee reminders (bulk WhatsApp send + daily log) ──────────
// POST body: { studentIds: string[], templateName: string, templateLanguage?: string, note?: string }
// Each student is sent the given template with 4 body variables:
//   {{1}} student name, {{2}} total fee, {{3}} received, {{4}} balance
app.post('/api/admin/fee-reminders', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const templateName = text(req.body.templateName, 'Template name', { required: true, max: 100 });
    const templateLanguage = text(req.body.templateLanguage, 'Template language', { max: 10 }) || 'en';
    const rawIds = Array.isArray(req.body.studentIds) ? req.body.studentIds : [];
    if (!rawIds.length) throw new Error('Select at least one student to remind.');
    if (rawIds.length > 200) throw new Error('Too many recipients in one send.');
    const studentIds = rawIds.map(id => documentId(id, 'Student ID'));

    const db = getFirestore();
    const bid = activeBatchId(req);

    // Load the roster + payments in one shot; refuse anything outside this batch.
    const [studentsSnap, paymentsSnap] = await Promise.all([
      db.collection('students').get(),
      db.collection('payments').get()
    ]);
    const studentsById = new Map();
    studentsSnap.forEach(d => {
      const data = { id: d.id, ...d.data() };
      if (docBelongsToActiveBatch(req, data)) studentsById.set(d.id, data);
    });
    const paymentsById = new Map();
    paymentsSnap.forEach(d => paymentsById.set(d.id, d.data() || {}));

    const results = [];
    for (const sid of studentIds) {
      const student = studentsById.get(sid);
      if (!student) {
        results.push({ studentId: sid, success: false, error: 'Student not in this batch.' });
        continue;
      }
      const phone = student.phone || student.parentPhone;
      if (!phone) {
        results.push({ studentId: sid, studentName: student.name, success: false, error: 'No parent phone on file.' });
        continue;
      }
      const pay = paymentsById.get(sid) || {};
      const totalFee = Number(pay.totalFee) || 65000;
      const received = Array.isArray(pay.transactions)
        ? pay.transactions.reduce((sum, t) => sum + (Number(t?.amount) || 0), 0) : 0;
      const balance = Math.max(totalFee - received, 0);
      const result = await notificationService.sendTemplate({
        to: phone,
        templateName,
        params: [student.name, String(totalFee), String(received), String(balance)],
        language: templateLanguage
      });
      results.push({
        studentId: sid, studentName: student.name, phone,
        success: !!result.success, error: result.error || null, messageId: result.messageId || null
      });
      await new Promise(r => setTimeout(r, 150)); // gentle pacing
    }

    // Persist a log row so admins can see today's reminder history per batch.
    const today = new Date().toISOString().slice(0, 10);
    const logId = `${bid}__${today}__${Date.now()}`;
    const sentBy = req.user && req.user.role === 'admin' ? 'admin' : 'system';
    const logDoc = {
      batchId: bid, date: today, templateName, templateLanguage,
      sentAt: Date.now(), sentBy,
      total: results.length,
      succeeded: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      recipients: results
    };
    await db.collection('fee_reminders').doc(logId).set(logDoc);
    await writeAudit(req, 'fee_reminders.sent', `${templateName}#${results.length}`);
    return res.json({ ...logDoc, id: logId });
  } catch (error) {
    return clientError(res, error);
  }
});

app.get('/api/admin/fee-reminders', requireAdmin, async (req, res) => {
  try {
    const date = dateValue(req.query.date);
    const db = getFirestore();
    const snap = await db.collection('fee_reminders').get();
    const logs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(d => docBelongsToActiveBatch(req, d) && d.date === date)
      .sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));
    return res.json({ logs });
  } catch (error) {
    return firebaseError(res, error);
  }
});

// ── Attendance reminders (one log entry per absentee-message broadcast) ──
async function writeAttendanceReminderLog(req, { date, subject, sent, absentees }) {
  const db = getFirestore();
  const bid = activeBatchId(req);
  const id = `${bid}__${date}__${Date.now()}`;
  await db.collection('attendance_reminders').doc(id).set({
    batchId: bid, date, subject: subject || '', sentAt: Date.now(),
    sentBy: req.user && req.user.role === 'admin' ? 'admin' : 'system',
    total: absentees.length, sent,
    recipients: absentees
  });
}

app.get('/api/admin/attendance-reminders', requireAdmin, async (req, res) => {
  try {
    const date = dateValue(req.query.date);
    const db = getFirestore();
    const snap = await db.collection('attendance_reminders').get();
    const logs = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(d => docBelongsToActiveBatch(req, d) && d.date === date)
      .sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));
    return res.json({ logs });
  } catch (error) {
    return firebaseError(res, error);
  }
});

app.get('/api/admin/export', requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    const [studentsSnapshot, attendanceSnapshot, testsSnapshot, syllabusSnapshot, paymentsSnapshot] = await Promise.all([
      db.collection('students').get(),
      db.collection('attendance').get(),
      db.collection('tests').get(),
      db.collection('syllabus').get(),
      db.collection('payments').get()
    ]);
    const bid = activeBatchId(req);
    const students = studentsSnapshot.docs
      .map(item => ({ id: item.id, ...item.data() }))
      .filter(item => docBelongsToActiveBatch(req, item));
    const studentIds = new Set(students.map(s => s.id));

    const attendance = {};
    attendanceSnapshot.forEach(item => {
      const data = item.data() || {};
      if (!docBelongsToActiveBatch(req, data)) return;
      attendance[stripBatchPrefix(item.id, bid)] = data.records || {};
    });
    const testMarks = {};
    const testMetadata = {};
    testsSnapshot.forEach(item => {
      const data = item.data() || {};
      if (!docBelongsToActiveBatch(req, data)) return;
      const naturalKey = stripBatchPrefix(item.id, bid);
      testMarks[naturalKey] = data.results || {};
      testMetadata[naturalKey] = {
        testId: data.testId || '', subject: data.subject || '', testType: data.testType || 'Test',
        testNumber: data.testNumber || '', date: data.date || '',
        cetTotal: data.cetTotal ?? 25, theoryTotal: data.theoryTotal ?? 25,
        sumTotal: data.sumTotal !== undefined ? Number(data.sumTotal)
                  : (Number(data.cetTotal ?? 25) + Number(data.theoryTotal ?? 25))
      };
    });
    const syllabus = {};
    syllabusSnapshot.forEach(item => {
      const data = item.data() || {};
      if (!docBelongsToActiveBatch(req, data)) return;
      syllabus[data.testId || stripBatchPrefix(item.id, bid)] = data.subjects || {};
    });
    const payments = {};
    paymentsSnapshot.forEach(item => {
      const data = item.data() || {};
      const paymentBatch = data.batchId || (studentIds.has(item.id) ? bid : DEFAULT_BATCH.id);
      if (paymentBatch !== bid) return;
      payments[item.id] = {
        totalFee: Number(data.totalFee) || 65000,
        records: data.records || {},
        transactions: Array.isArray(data.transactions) ? data.transactions : [],
        lastFeeMessage: data.lastFeeMessage || null
      };
    });
    return res.json({
      version: '3.1',
      batchId: bid,
      students,
      attendance,
      testMarks,
      testMetadata,
      syllabus,
      payments
    });
  } catch (error) {
    return firebaseError(res, error);
  }
});

app.post('/api/admin/import', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const source = req.body.data;
    if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('Backup data is invalid.');
    const db = getFirestore();
    const writes = [];

    const bid = activeBatchId(req);

    if (source.students !== undefined) {
      if (!Array.isArray(source.students) || source.students.length > 500) throw new Error('Student backup data is invalid.');
      source.students.forEach(item => {
        const student = normalizeStudent(item);
        const record = {
          ...student,
          batchId: bid,
          number: Number.isFinite(Number(item.number)) ? Number(item.number) : undefined
        };
        if (record.number === undefined) delete record.number;
        writes.push({ ref: db.collection('students').doc(student.id), data: record });
      });
    }

    if (source.attendance !== undefined) {
      if (!source.attendance || typeof source.attendance !== 'object' || Array.isArray(source.attendance)) throw new Error('Attendance backup data is invalid.');
      Object.entries(source.attendance).forEach(([date, records]) => {
        const normalizedDate = dateValue(date);
        writes.push({
          ref: db.collection('attendance').doc(`${bid}__${normalizedDate}`),
          data: { batchId: bid, date: normalizedDate, records: normalizeRecords(records), updatedAt: Date.now() }
        });
      });
    }

    if (source.testMarks !== undefined) {
      if (!source.testMarks || typeof source.testMarks !== 'object' || Array.isArray(source.testMarks)) throw new Error('Test backup data is invalid.');
      Object.entries(source.testMarks).forEach(([key, results]) => {
        const metadata = source.testMetadata?.[key];
        if (!metadata) throw new Error(`Test metadata is missing for ${key}.`);
        const testId = text(metadata.testId, 'Test ID', { required: true, max: 80 });
        const subject = text(metadata.subject, 'Subject', { required: true, max: 80 });
        const normalizedKey = testKey(testId, subject);
        writes.push({
          ref: db.collection('tests').doc(`${bid}__${normalizedKey}`),
          data: { testId, subject, batchId: bid, results: normalizeResults(results), updatedAt: Date.now(), ...normalizeMetadata(metadata) }
        });
      });
    }

    if (source.syllabus !== undefined) {
      if (!source.syllabus || typeof source.syllabus !== 'object' || Array.isArray(source.syllabus)) throw new Error('Syllabus backup data is invalid.');
      Object.entries(source.syllabus).forEach(([testId, rawSubjects]) => {
        const normalizedTestId = text(testId, 'Test ID', { required: true, max: 80 });
        if (!rawSubjects || typeof rawSubjects !== 'object' || Array.isArray(rawSubjects)) throw new Error('Syllabus backup data is invalid.');
        const subjects = {};
        Object.entries(rawSubjects).forEach(([subject, content]) => {
          subjects[text(subject, 'Subject', { required: true, max: 80 })] = text(content, 'Syllabus', { max: 5000 });
        });
        const naturalKey = documentId(normalizedTestId.replace(/\s+/g, ''), 'Syllabus key');
        writes.push({
          ref: db.collection('syllabus').doc(`${bid}__${naturalKey}`),
          data: { testId: normalizedTestId, subjects, batchId: bid, updatedAt: Date.now() }
        });
      });
    }

    if (source.payments !== undefined) {
      if (!source.payments || typeof source.payments !== 'object' || Array.isArray(source.payments)) throw new Error('Payment backup data is invalid.');
      Object.entries(source.payments).forEach(([studentId, paymentData]) => {
        const id = documentId(studentId, 'Student ID');
        const rawRecords = paymentData?.records || paymentData;
        if (!rawRecords || typeof rawRecords !== 'object' || Array.isArray(rawRecords)) throw new Error('Payment backup data is invalid.');
        const records = {};
        Object.entries(rawRecords).forEach(([monthYear, record]) => {
          const status = text(record?.status, 'Payment status', { required: true, max: 10 });
          if (!['paid', 'due', 'partial'].includes(status)) throw new Error('Payment status is invalid.');
          records[text(monthYear, 'Month', { required: true, max: 30 })] = {
            status,
            amount: text(record.amount, 'Amount', { max: 20 }),
            notes: text(record.notes, 'Notes', { max: 1000 }),
            updatedAt: Number(record.updatedAt) || Date.now()
          };
        });
        const importedTotalFee = paymentData?.records ? Number(paymentData.totalFee) : 65000;
        if (!Number.isFinite(importedTotalFee) || importedTotalFee < 0 || importedTotalFee > 10000000) throw new Error('Payment total fee is invalid.');
        const transactions = Array.isArray(paymentData?.transactions) ? paymentData.transactions.map(transaction => {
          const amount = Number(transaction?.amount);
          if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) throw new Error('Payment transaction amount is invalid.');
          return { date: dateValue(transaction.date), amount, note: text(transaction.note, 'Payment note', { max: 300 }), recordedAt: Number(transaction.recordedAt) || Date.now() };
        }) : [];
        writes.push({ ref: db.collection('payments').doc(id), data: { studentId: id, records, totalFee: importedTotalFee, transactions, batchId: bid } });
      });
    }

    if (!writes.length) throw new Error('The backup contains no supported data.');
    await commitWrites(db, writes);
    await writeAudit(req, 'backup.imported', String(writes.length));
    return res.json({ message: 'Backup imported successfully.', imported: writes.length });
  } catch (error) {
    if (error.code === 'FIREBASE_NOT_CONFIGURED') return firebaseError(res, error);
    return clientError(res, error);
  }
});

app.get('/api/student/profile', requireStudent, async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('students').doc(req.user.studentId).get();
    if (!snapshot.exists) return res.status(404).json({ message: 'Student not found.' });
    return res.json({ student: publicStudent({ id: snapshot.id, ...snapshot.data() }) });
  } catch (error) {
    return firebaseError(res, error);
  }
});

app.get('/api/student/attendance', requireStudent, async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('attendance').get();
    const bid = activeBatchId(req);
    const attendance = [];
    snapshot.forEach(item => {
      const data = item.data() || {};
      if (!docBelongsToActiveBatch(req, data)) return;
      const records = data.records || {};
      if (records.__leaveDay || !records[req.user.studentId]) return;
      attendance.push({
        date: data.date || stripBatchPrefix(item.id, bid),
        status: records[req.user.studentId]
      });
    });
    attendance.sort((a, b) => b.date.localeCompare(a.date));
    return res.json({ attendance });
  } catch (error) {
    return firebaseError(res, error);
  }
});

app.get('/api/student/tests', requireStudent, async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('tests').get();
    const bid = activeBatchId(req);
    const tests = snapshot.docs
      .filter(item => docBelongsToActiveBatch(req, item.data() || {}))
      .map(item => {
        const data = item.data();
        const results = data.results || {};
        let total = 0;
        let count = 0;
        Object.values(results).forEach(result => {
          const mark = result?.present !== false ? (result.totalMarks ?? result.marks) : null;
          const numericMark = Number(mark);
          if (mark !== '' && mark !== null && Number.isFinite(numericMark)) {
            total += numericMark;
            count += 1;
          }
        });
        return {
          key: stripBatchPrefix(item.id, bid),
          testId: data.testId || '',
          subject: data.subject || '',
          testType: data.testType || 'Test',
          testNumber: data.testNumber || '',
          date: data.date || '',
          cetTotal: data.cetTotal ?? 25,
          theoryTotal: data.theoryTotal ?? 25,
          sumTotal: data.sumTotal !== undefined ? Number(data.sumTotal)
                    : (Number(data.cetTotal ?? 25) + Number(data.theoryTotal ?? 25)),
          updatedAt: data.updatedAt || 0,
          studentScore: results[req.user.studentId] || { present: true, marks: '--', cetMarks: '', theoryMarks: '', totalMarks: '' },
          classAverage: count ? Number((total / count).toFixed(1)) : null
        };
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return res.json({ tests });
  } catch (error) {
    return firebaseError(res, error);
  }
});

app.get('/api/student/payments', requireStudent, async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('payments').doc(req.user.studentId).get();
    return res.json({ payments: snapshot.exists ? (snapshot.data().records || {}) : {} });
  } catch (error) {
    return firebaseError(res, error);
  }
});

// ── Study Resources ─────────────────────────────────────────
// Files (PDFs, notes, images) are stored as base64 payloads inside their
// Firestore doc. Firestore's per-doc cap is 1 MB, and base64 expands binary
// content by ~33 %, so the practical raw-file ceiling is ~750 KB. Anything
// bigger is rejected up front. Resources are batch-scoped like every other
// admin write; students only see files whose visibility matches them.
const RESOURCE_MAX_RAW_BYTES = 750 * 1024;
const RESOURCE_ALLOWED_MIME_PREFIXES = ['application/pdf', 'image/', 'text/', 'application/msword',
  'application/vnd.openxmlformats-officedocument'];

function resourceMetadata(id, data) {
  return {
    id,
    title: data.title || '',
    description: data.description || '',
    originalFileName: data.originalFileName || '',
    mimeType: data.mimeType || 'application/octet-stream',
    sizeBytes: Number(data.sizeBytes) || 0,
    visibilityType: data.visibilityType || 'all',
    targetCombinations: Array.isArray(data.targetCombinations) ? data.targetCombinations : [],
    targetStudentIds: Array.isArray(data.targetStudentIds) ? data.targetStudentIds : [],
    createdAt: Number(data.createdAt) || 0,
    batchId: data.batchId || null
  };
}

function studentCanSeeResource(student, data) {
  const visibility = data.visibilityType || 'all';
  if (visibility === 'all') return true;
  if (visibility === 'combination') {
    return Array.isArray(data.targetCombinations)
      && data.targetCombinations.includes(String(student.combination || '').toUpperCase());
  }
  if (visibility === 'student') {
    return Array.isArray(data.targetStudentIds) && data.targetStudentIds.includes(student.id);
  }
  return false;
}

app.get('/api/admin/resources', requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('resources').get();
    const resources = snapshot.docs
      .map(d => ({ id: d.id, data: d.data() || {} }))
      .filter(item => docBelongsToActiveBatch(req, item.data))
      .map(item => resourceMetadata(item.id, item.data))
      .sort((a, b) => b.createdAt - a.createdAt);
    return res.json({ resources });
  } catch (error) {
    return firebaseError(res, error);
  }
});

app.post('/api/admin/resources', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const title = text(req.body.title, 'Title', { required: true, max: 200 });
    const description = text(req.body.description, 'Description', { max: 1000 });
    const originalFileName = text(req.body.originalFileName, 'File name', { required: true, max: 250 });
    const mimeType = text(req.body.mimeType, 'File type', { required: true, max: 120 });
    if (!RESOURCE_ALLOWED_MIME_PREFIXES.some(prefix => mimeType.startsWith(prefix))) {
      throw new Error('This file type is not supported.');
    }
    const contentBase64 = String(req.body.contentBase64 || '');
    if (!contentBase64) throw new Error('File content is missing.');
    // Sanity-check the raw size before we let it enter Firestore.
    const rawSize = Math.floor(contentBase64.length * 0.75);
    if (rawSize > RESOURCE_MAX_RAW_BYTES) {
      throw new Error(`File is too large. The maximum is ${(RESOURCE_MAX_RAW_BYTES / 1024).toFixed(0)} KB.`);
    }
    const visibilityType = text(req.body.visibilityType, 'Visibility', { required: true, max: 20 });
    if (!['all', 'combination', 'student'].includes(visibilityType)) throw new Error('Visibility is invalid.');
    let targetCombinations = [];
    let targetStudentIds = [];
    if (visibilityType === 'combination') {
      try { targetCombinations = JSON.parse(req.body.targetCombinations || '[]'); }
      catch { throw new Error('Target combinations are invalid.'); }
      if (!Array.isArray(targetCombinations) || !targetCombinations.length) throw new Error('Select at least one combination.');
      targetCombinations = targetCombinations
        .map(c => text(c, 'Combination', { max: 20 }).toUpperCase())
        .filter(Boolean);
    }
    if (visibilityType === 'student') {
      try { targetStudentIds = JSON.parse(req.body.targetStudentIds || '[]'); }
      catch { throw new Error('Target student IDs are invalid.'); }
      if (!Array.isArray(targetStudentIds) || !targetStudentIds.length) throw new Error('Enter at least one student.');
      targetStudentIds = targetStudentIds.map(id => documentId(id, 'Student ID'));
    }

    const bid = activeBatchId(req);
    const doc = {
      title, description, originalFileName, mimeType,
      sizeBytes: rawSize, contentBase64,
      visibilityType, targetCombinations, targetStudentIds,
      batchId: bid,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    const db = getFirestore();
    const ref = await db.collection('resources').add(doc);
    await writeAudit(req, 'resource.uploaded', ref.id);
    return res.status(201).json({ resource: resourceMetadata(ref.id, doc) });
  } catch (error) {
    return clientError(res, error);
  }
});

app.delete('/api/admin/resources/:resourceId', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const resourceId = documentId(req.params.resourceId, 'Resource ID');
    const db = getFirestore();
    const snap = await db.collection('resources').doc(resourceId).get();
    if (snap.exists && !docBelongsToActiveBatch(req, snap.data())) {
      return res.status(403).json({ message: 'This resource belongs to a different batch.' });
    }
    await db.collection('resources').doc(resourceId).delete();
    await writeAudit(req, 'resource.deleted', resourceId);
    return res.status(204).end();
  } catch (error) {
    return clientError(res, error);
  }
});

app.get('/api/admin/resources/:resourceId/download', requireAdmin, async (req, res) => {
  try {
    const resourceId = documentId(req.params.resourceId, 'Resource ID');
    const db = getFirestore();
    const snap = await db.collection('resources').doc(resourceId).get();
    if (!snap.exists) return res.status(404).json({ message: 'Resource not found.' });
    const data = snap.data();
    if (!docBelongsToActiveBatch(req, data)) return res.status(403).json({ message: 'This resource belongs to a different batch.' });
    const buffer = Buffer.from(data.contentBase64 || '', 'base64');
    res.setHeader('Content-Type', data.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition',
      `attachment; filename="${(data.originalFileName || 'resource').replace(/[^\w.\- ]/g, '_')}"`);
    return res.send(buffer);
  } catch (error) {
    return clientError(res, error);
  }
});

app.get('/api/student/resources', requireStudent, async (req, res) => {
  try {
    const db = getFirestore();
    const [studentSnap, resourcesSnap] = await Promise.all([
      db.collection('students').doc(req.user.studentId).get(),
      db.collection('resources').get()
    ]);
    if (!studentSnap.exists) return res.status(404).json({ message: 'Student not found.' });
    const student = { id: studentSnap.id, ...studentSnap.data() };
    const resources = resourcesSnap.docs
      .map(d => ({ id: d.id, data: d.data() || {} }))
      .filter(item => docBelongsToActiveBatch(req, item.data))
      .filter(item => studentCanSeeResource(student, item.data))
      .map(item => resourceMetadata(item.id, item.data))
      .sort((a, b) => b.createdAt - a.createdAt);
    return res.json({ resources });
  } catch (error) {
    return firebaseError(res, error);
  }
});

app.get('/api/student/resources/:resourceId/download', requireStudent, async (req, res) => {
  try {
    const resourceId = documentId(req.params.resourceId, 'Resource ID');
    const db = getFirestore();
    const [studentSnap, resourceSnap] = await Promise.all([
      db.collection('students').doc(req.user.studentId).get(),
      db.collection('resources').doc(resourceId).get()
    ]);
    if (!resourceSnap.exists) return res.status(404).json({ message: 'Resource not found.' });
    const data = resourceSnap.data();
    if (!docBelongsToActiveBatch(req, data)) return res.status(403).json({ message: 'Access denied.' });
    if (!studentSnap.exists) return res.status(404).json({ message: 'Student not found.' });
    const student = { id: studentSnap.id, ...studentSnap.data() };
    if (!studentCanSeeResource(student, data)) return res.status(403).json({ message: 'Access denied.' });
    const buffer = Buffer.from(data.contentBase64 || '', 'base64');
    res.setHeader('Content-Type', data.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition',
      `attachment; filename="${(data.originalFileName || 'resource').replace(/[^\w.\- ]/g, '_')}"`);
    return res.send(buffer);
  } catch (error) {
    return clientError(res, error);
  }
});

app.post('/api/notifications/whatsapp-absentee', requireSameOrigin, requireAdmin, notificationLimiter, async (req, res) => {
  try {
    const phone = phoneValue(req.body.phone, 'Phone number');
    if (!phone) return res.status(400).json({ message: 'Phone number is required.' });
    const result = await notificationService.sendViaWhatsApp(phone, {
      studentName: text(req.body.studentName, 'Student name', { max: 200 }),
      subject: text(req.body.subject, 'Subject', { max: 100 }),
      date: text(req.body.date, 'Date', { max: 30 })
    });
    await writeAudit(req, 'notification.whatsapp_single');
    return result.success ? res.json({ success: true, message: 'WhatsApp message sent.' }) : res.status(502).json({ message: result.error || 'WhatsApp delivery failed.' });
  } catch (error) {
    return clientError(res, error);
  }
});

app.post('/api/notifications/whatsapp-broadcast', requireSameOrigin, requireAdmin, notificationLimiter, async (req, res) => {
  try {
    if (!Array.isArray(req.body.absentees) || req.body.absentees.length === 0 || req.body.absentees.length > 100) {
      return res.status(400).json({ message: 'Provide between 1 and 100 recipients.' });
    }
    const absentees = req.body.absentees.map(item => ({
      phone: phoneValue(item.phone, 'Phone number'),
      studentName: text(item.studentName, 'Student name', { max: 200 }),
      subject: text(item.subject, 'Subject', { max: 100 }),
      date: text(item.date, 'Date', { max: 30 })
    }));
    if (absentees.some(item => !item.phone)) return res.status(400).json({ message: 'Every recipient needs a phone number.' });
    const results = await notificationService.broadcastWhatsApp(absentees);
    await writeAudit(req, 'notification.whatsapp_broadcast', String(absentees.length));

    // Log the broadcast for the given day so the attendance view can show
    // "Reminder sent at HH:MM" without a second Firestore read.
    const rawDate = absentees[0]?.date || '';
    // Client sends DD/MM/YYYY; normalize back to YYYY-MM-DD for consistent keys.
    const parts = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(rawDate);
    const isoDate = parts ? `${parts[3]}-${parts[2]}-${parts[1]}` : new Date().toISOString().slice(0, 10);
    try {
      const succeeded = results.filter(r => r.status && r.status.success).length;
      await writeAttendanceReminderLog(req, {
        date: isoDate,
        subject: absentees[0]?.subject || '',
        sent: succeeded,
        absentees: results.map(({ studentName, phone, status }) => ({
          studentName, phone, success: !!(status && status.success),
          error: status && status.error ? status.error : null
        }))
      });
    } catch (logErr) {
      // A logging failure must not fail the whole broadcast.
      console.warn('Attendance reminder log write failed:', logErr.message);
    }

    const perRecipient = results.map(({ studentName, phone, status }) => ({
      studentName, phone,
      success: !!(status && status.success),
      error: status && status.error ? status.error : null
    }));
    const delivered = perRecipient.filter(r => r.success).length;
    return res.json({
      success: delivered > 0,           // false when Meta rejected everything
      delivered,
      total: perRecipient.length,
      results: perRecipient
    });
  } catch (error) {
    return clientError(res, error);
  }
});

app.post('/api/notifications/alert-admin', requireSameOrigin, requireAdmin, notificationLimiter, async (req, res) => {
  try {
    const phone = phoneValue(req.body.phone, 'Admin phone number');
    if (!phone) return res.status(400).json({ message: 'Admin phone number is required.' });

    const templateName = req.body.templateName ? text(req.body.templateName, 'Template name', { max: 80 }) : undefined;

    let payload = req.body.message;
    if (req.body.details && typeof req.body.details === 'object') {
      payload = {
        date: text(req.body.details.date, 'Date', { max: 30 }),
        subject: text(req.body.details.subject, 'Subject', { max: 100 }),
        absenteeList: text(req.body.details.absenteeList, 'Absentee List', { max: 2000 }),
        total: req.body.details.total || 0,
        present: req.body.details.present || 0,
        absent: req.body.details.absent || 0,
        adminName: req.body.details.adminName ? text(req.body.details.adminName, 'Admin name', { max: 80 }) : 'Anand Sir',
        templateName: templateName,
        text: req.body.message ? text(req.body.message, 'Message text', { max: 4000 }) : ''
      };
    } else if (templateName) {
      payload = {
        templateName: templateName,
        text: text(req.body.message, 'Message text', { required: true, max: 4000 })
      };
    } else {
      payload = text(req.body.message, 'Message text', { required: true, max: 4000 });
    }
    
    const result = await notificationService.sendAdminAlert(phone, payload);
    await writeAudit(req, 'notification.alert_admin', phone);
    return result.success 
      ? res.json({ success: true, message: 'Absentee alert sent to Admin.' }) 
      : res.status(502).json({ message: result.error || 'Failed to deliver notification to Admin.' });
  } catch (error) {
    return clientError(res, error);
  }
});

// ───────────────────────────────────────────────────
// WhatsApp 24-Hour Customer Service Window Helpers & DB
// ───────────────────────────────────────────────────

async function upsertInboundConversationAndMessage({ waId, cleanPhone, profileName, matchedStudent, messageId, messageType, messageText, waTimestamp }) {
  const inboundTime = waTimestamp ? new Date(Number(waTimestamp) * 1000) : new Date();
  const inboundISO = inboundTime.toISOString();

  // 1. Store/Update in Supabase if configured
  try {
    const supabase = getSupabase();
    const { data: existingConv } = await supabase
      .from('conversations')
      .select('last_inbound_at')
      .eq('wa_id', waId)
      .maybeSingle();

    let newLastInboundAt = inboundISO;
    if (existingConv && existingConv.last_inbound_at) {
      const existingTime = new Date(existingConv.last_inbound_at).getTime();
      if (existingTime > inboundTime.getTime()) {
        newLastInboundAt = existingConv.last_inbound_at;
      }
    }

    await supabase.from('conversations').upsert({
      wa_id: waId,
      phone: cleanPhone,
      profile_name: profileName || '',
      student_id: matchedStudent?.id || null,
      student_name: matchedStudent?.name || null,
      last_inbound_at: newLastInboundAt,
      updated_at: new Date().toISOString()
    }, { onConflict: 'wa_id' });

    await supabase.from('messages').insert({
      conversation_id: waId,
      message_id: messageId || null,
      direction: 'inbound',
      message_type: messageType || 'text',
      content: messageText,
      status: 'received',
      read: false,
      created_at: inboundISO
    });
  } catch (err) {
    if (err.code !== 'SUPABASE_NOT_CONFIGURED') {
      console.error('Supabase inbound store error:', err.message);
    }
  }

  // 2. Store/Update in Firestore
  try {
    const db = getFirestore();
    const convRef = db.collection('conversations').doc(waId);
    const convSnap = await convRef.get();
    let newLastInboundAt = inboundISO;
    if (convSnap.exists && convSnap.data().last_inbound_at) {
      const existingTime = new Date(convSnap.data().last_inbound_at).getTime();
      if (existingTime > inboundTime.getTime()) {
        newLastInboundAt = convSnap.data().last_inbound_at;
      }
    }

    await convRef.set({
      wa_id: waId,
      phone: cleanPhone,
      profile_name: profileName || '',
      student_id: matchedStudent?.id || null,
      student_name: matchedStudent?.name || null,
      last_inbound_at: newLastInboundAt,
      updated_at: new Date().toISOString()
    }, { merge: true });

    await db.collection('messages').add({
      conversation_id: waId,
      messageId: messageId || null,
      direction: 'inbound',
      messageType: messageType || 'text',
      content: messageText,
      status: 'received',
      read: false,
      created_at: inboundISO
    });

    await db.collection('whatsapp_replies').add({
      messageId: messageId || null,
      from: waId,
      phone: cleanPhone,
      profileName,
      messageType,
      messageText,
      matchedStudentId: matchedStudent?.id || null,
      matchedStudentName: matchedStudent?.name || null,
      receivedAt: inboundISO,
      waTimestamp,
      read: false
    });
  } catch (err) {
    console.error('Firestore inbound store error:', err.message);
  }
}

async function storeOutboundMessage({ waId, content, messageType = 'text', status = 'sent', errorMessage = null, messageId = null }) {
  const nowISO = new Date().toISOString();
  try {
    const supabase = getSupabase();
    await supabase.from('messages').insert({
      conversation_id: waId,
      message_id: messageId,
      direction: 'outbound',
      message_type: messageType,
      content,
      status,
      error_message: errorMessage,
      created_at: nowISO
    });
  } catch (err) {
    if (err.code !== 'SUPABASE_NOT_CONFIGURED') {
      console.error('Supabase outbound store error:', err.message);
    }
  }

  try {
    const db = getFirestore();
    await db.collection('messages').add({
      conversation_id: waId,
      messageId,
      direction: 'outbound',
      messageType,
      content,
      status,
      errorMessage,
      created_at: nowISO
    });
  } catch (err) {
    console.error('Firestore outbound store error:', err.message);
  }
}

async function getConversationsData() {
  const conversationsMap = new Map();

  try {
    const supabase = getSupabase();
    const { data: convs, error: convErr } = await supabase
      .from('conversations')
      .select('*')
      .order('updated_at', { ascending: false });

    if (!convErr && Array.isArray(convs)) {
      for (const c of convs) {
        const { data: msgs } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', c.wa_id)
          .order('created_at', { ascending: true });

        conversationsMap.set(c.wa_id, {
          wa_id: c.wa_id,
          phone: c.phone || c.wa_id,
          profile_name: c.profile_name || '',
          student_id: c.student_id || null,
          student_name: c.student_name || null,
          last_inbound_at: c.last_inbound_at || null,
          messages: (msgs || []).map(m => ({
            id: m.id,
            message_id: m.message_id,
            direction: m.direction,
            message_type: m.message_type,
            content: m.content,
            status: m.status,
            error_message: m.error_message,
            created_at: m.created_at
          }))
        });
      }
    }
  } catch (err) {
    // Ignore if Supabase not configured
  }

  try {
    const db = getFirestore();
    const convSnap = await db.collection('conversations').get();
    for (const doc of convSnap.docs) {
      const c = doc.data();
      const waId = c.wa_id || doc.id;
      if (!conversationsMap.has(waId)) {
        const msgsSnap = await db.collection('messages')
          .where('conversation_id', '==', waId)
          .get();

        const msgs = [];
        msgsSnap.forEach(mDoc => {
          const m = mDoc.data();
          msgs.push({
            id: mDoc.id,
            message_id: m.messageId || null,
            direction: m.direction || 'inbound',
            message_type: m.messageType || 'text',
            content: m.content || m.messageText || '',
            status: m.status || 'received',
            error_message: m.errorMessage || null,
            created_at: m.created_at || m.receivedAt || new Date().toISOString()
          });
        });
        msgs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

        conversationsMap.set(waId, {
          wa_id: waId,
          phone: c.phone || waId,
          profile_name: c.profile_name || '',
          student_id: c.student_id || null,
          student_name: c.student_name || null,
          last_inbound_at: c.last_inbound_at || null,
          messages: msgs
        });
      }
    }

    if (conversationsMap.size === 0) {
      const repliesSnap = await db.collection('whatsapp_replies').get();
      repliesSnap.forEach(doc => {
        const r = doc.data();
        const waId = r.from || r.phone;
        if (!waId) return;

        if (!conversationsMap.has(waId)) {
          conversationsMap.set(waId, {
            wa_id: waId,
            phone: r.phone || waId,
            profile_name: r.profileName || '',
            student_id: r.matchedStudentId || null,
            student_name: r.matchedStudentName || null,
            last_inbound_at: r.receivedAt || null,
            messages: []
          });
        }
        const conv = conversationsMap.get(waId);
        if (r.receivedAt) {
          if (!conv.last_inbound_at || new Date(r.receivedAt) > new Date(conv.last_inbound_at)) {
            conv.last_inbound_at = r.receivedAt;
          }
        }
        conv.messages.push({
          id: doc.id,
          message_id: r.messageId || null,
          direction: 'inbound',
          message_type: r.messageType || 'text',
          content: r.messageText || '',
          status: 'received',
          error_message: null,
          created_at: r.receivedAt || new Date().toISOString()
        });
      });

      for (const conv of conversationsMap.values()) {
        conv.messages.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      }
    }
  } catch (err) {
    console.error('Firestore getConversationsData error:', err.message);
  }

  const result = [];
  const now = new Date();

  for (const conv of conversationsMap.values()) {
    let window_expires_at = null;
    let is_window_open = false;

    if (conv.last_inbound_at) {
      const lastInboundTime = new Date(conv.last_inbound_at).getTime();
      if (!isNaN(lastInboundTime)) {
        const expiryMs = lastInboundTime + (24 * 60 * 60 * 1000);
        window_expires_at = new Date(expiryMs).toISOString();
        is_window_open = now.getTime() < expiryMs;
      }
    }

    const unread_count = conv.messages.filter(m => m.direction === 'inbound' && m.read === false).length;

    result.push({
      ...conv,
      window_expires_at,
      is_window_open,
      unread_count
    });
  }

  result.sort((a, b) => {
    const timeA = a.messages.length ? new Date(a.messages[a.messages.length - 1].created_at).getTime() : (a.last_inbound_at ? new Date(a.last_inbound_at).getTime() : 0);
    const timeB = b.messages.length ? new Date(b.messages[b.messages.length - 1].created_at).getTime() : (b.last_inbound_at ? new Date(b.last_inbound_at).getTime() : 0);
    return timeB - timeA;
  });

  return result;
}

// ───────────────────────────────────────────────────
// WhatsApp Webhook (incoming messages from parents)
// ───────────────────────────────────────────────────

// Verification endpoint – Meta sends a GET with hub.verify_token during webhook setup
app.get('/webhook/whatsapp', (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN || process.env.WHATSAPP_VERIFY_TOKEN || 'galaxy_academy_wa_hook_2026';
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('✅ WhatsApp webhook verified successfully.');
    return res.status(200).send(challenge);
  }
  console.warn('⚠️ WhatsApp webhook verification failed.');
  return res.sendStatus(403);
});

// Receive incoming messages – Meta POSTs message payloads here
app.post('/webhook/whatsapp', async (req, res) => {
  // Always respond 200 quickly so Meta doesn't retry
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const changes = entry?.changes?.[0]?.value;
    if (!changes || !changes.messages) return;

    const message = changes.messages[0];
    const contact = changes.contacts?.[0];
    const fromPhone = message.from; // e.g. '919876543210'
    const messageId = message.id;
    const timestamp = message.timestamp;
    const profileName = contact?.profile?.name || '';

    let messageText = '';
    const messageType = message.type;
    if (messageType === 'text') {
      messageText = message.text?.body || '';
    } else if (messageType === 'image') {
      messageText = `[Image] ${message.image?.caption || ''}`.trim();
    } else if (messageType === 'video') {
      messageText = `[Video] ${message.video?.caption || ''}`.trim();
    } else if (messageType === 'audio') {
      messageText = '[Voice message]';
    } else if (messageType === 'document') {
      messageText = `[Document] ${message.document?.filename || ''}`.trim();
    } else if (messageType === 'sticker') {
      messageText = '[Sticker]';
    } else if (messageType === 'reaction') {
      messageText = `[Reaction: ${message.reaction?.emoji || ''}]`;
    } else if (messageType === 'location') {
      messageText = `[Location: ${message.location?.latitude}, ${message.location?.longitude}]`;
    } else if (messageType === 'contacts') {
      messageText = '[Shared Contact]';
    } else if (messageType === 'button') {
      messageText = message.button?.text || '[Button reply]';
    } else if (messageType === 'interactive') {
      messageText = message.interactive?.button_reply?.title
        || message.interactive?.list_reply?.title
        || '[Interactive reply]';
    } else {
      messageText = `[${messageType || 'unknown'} message]`;
    }

    const cleanPhone = fromPhone.replace(/[^0-9]/g, '').slice(-10);

    let matchedStudent = null;
    try {
      const db = getFirestore();
      const studentsSnap = await db.collection('students').get();
      studentsSnap.forEach(doc => {
        const s = doc.data();
        const phone1 = (s.phone || '').replace(/[^0-9]/g, '').slice(-10);
        const phone2 = (s.parentPhone || '').replace(/[^0-9]/g, '').slice(-10);
        if ((phone1 && phone1 === cleanPhone) || (phone2 && phone2 === cleanPhone)) {
          matchedStudent = { id: doc.id, name: s.name };
        }
      });
    } catch (err) {
      console.error('Student matching failed:', err.message);
    }

    await upsertInboundConversationAndMessage({
      waId: fromPhone,
      cleanPhone,
      profileName,
      matchedStudent,
      messageId,
      messageType,
      messageText,
      waTimestamp: timestamp
    });

    console.log(`📩 WhatsApp reply from ${profileName || cleanPhone}: "${messageText}"`);

    if (messageType === 'text' && messageText.length > 0) {
      try {
        const waToken = process.env.WHATSAPP_TOKEN;
        const waPhoneId = process.env.PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;
        if (waToken && waPhoneId) {
          const studentRef = matchedStudent ? ` for ${matchedStudent.name}` : '';
          await fetch(`https://graph.facebook.com/v21.0/${waPhoneId}/messages`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${waToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: fromPhone,
              type: 'text',
              text: {
                body: `Thank you for your reply${studentRef}. We have noted your message. - Galaxy Academy`
              }
            })
          });
        }
      } catch (err) {
        console.error('Auto-reply failed:', err.message);
      }
    }
  } catch (err) {
    console.error('Webhook processing error:', err);
  }
});

// ── TradingView → WhatsApp alert bridge ──────────────────────────────────
// TradingView Pro/Pro+/Premium can POST JSON to a URL when an alert fires.
// This route validates a shared secret (TradingView does not sign requests),
// then forwards the alert to your personal WhatsApp number as an approved
// Utility template so it delivers reliably outside any 24-hour session window.
//
// Example alert JSON to paste into TradingView's "Message" field:
//   {"secret":"<same value as TRADINGVIEW_WEBHOOK_SECRET>",
//    "symbol":"{{ticker}}","action":"BUY","price":{{close}},"note":"RSI crossover"}
const tradingviewLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Rate limit reached for /webhook/tradingview.' }
});

// Accept both application/json (structured) and text/plain (TradingView's
// default when the Message field is left empty). We keep this scoped to the
// tradingview route so the global JSON limits still guard the rest of the API.
const acceptPlainOrJson = express.text({ type: '*/*', limit: '32kb' });

// Recognise a "structured" TradingView alert — one with any of the four
// well-known fields we know how to format. Anything else is treated as plain
// text (either JSON we don't recognise, or the urlencoded pass-through case).
function isStructuredAlert(obj) {
  return !!(obj && (obj.symbol || obj.action || obj.side || obj.price !== undefined
    || obj.note || obj.message));
}

app.post('/webhook/tradingview', tradingviewLimiter, acceptPlainOrJson, async (req, res) => {
  const expectedSecret = process.env.TRADINGVIEW_WEBHOOK_SECRET;
  if (!expectedSecret) {
    console.warn('TRADINGVIEW_WEBHOOK_SECRET is not set; refusing every TradingView webhook until it is.');
    return res.sendStatus(503);
  }

  // Body can arrive in one of three shapes depending on Content-Type:
  //   • text/plain            → req.body is a string (from express.text())
  //   • application/json      → req.body is an object (from express.json())
  //   • application/x-www-form-urlencoded (curl -d default, TradingView too)
  //                           → req.body is an object where the raw text ends up
  //                             as a single key with an empty value.
  let raw = '';
  let parsed = null;

  if (typeof req.body === 'string') {
    raw = req.body;
    try { parsed = raw ? JSON.parse(raw) : null; } catch { parsed = null; }
  } else if (req.body && typeof req.body === 'object') {
    parsed = req.body;
    // Detect the "urlencoded plain text" case: exactly one key with empty value.
    const keys = Object.keys(parsed);
    if (keys.length === 1 && parsed[keys[0]] === '' && !isStructuredAlert(parsed)) {
      raw = keys[0];
      parsed = null;
    }
  }

  // Accept the secret either in the URL query (?secret=…) or in the JSON body.
  // URL query is what lets you leave TradingView's Message field completely
  // empty and still authenticate — TradingView's default plain text has no
  // room for a secret.
  const providedSecret = String(req.query.secret || (parsed && parsed.secret) || '');
  const secretsMatch = expectedSecret.length === providedSecret.length &&
    crypto.timingSafeEqual(Buffer.from(expectedSecret), Buffer.from(providedSecret));
  if (!secretsMatch) return res.sendStatus(403);

  // Ack immediately so TradingView doesn't retry while we call Meta.
  res.sendStatus(200);

  const to = process.env.MY_PERSONAL_WA_ID;
  if (!to) {
    console.warn('MY_PERSONAL_WA_ID is not set; TradingView alert dropped.');
    return;
  }

  const templateName = process.env.TRADINGVIEW_TEMPLATE_NAME || 'trading_alert';
  const language = process.env.TRADINGVIEW_TEMPLATE_LANGUAGE || 'en';

  // Build the single {{1}} body variable. Priority:
  //   1) Structured JSON with fields → compact "SYMBOL · ACTION · price · note"
  //   2) Plain text (TradingView default or the admin's custom message) as-is
  //   3) Fallback so Meta never receives an empty parameter (it rejects those)
  let alertText;
  if (parsed && typeof parsed === 'object') {
    const bits = [
      parsed.symbol, parsed.action || parsed.side,
      parsed.price !== undefined ? `₹${parsed.price}` : '',
      parsed.note || parsed.message || ''
    ].map(v => String(v || '').trim()).filter(Boolean);
    alertText = bits.length ? bits.join(' · ') : raw;
  } else {
    alertText = raw;
  }
  alertText = (alertText || 'Alert triggered').trim().slice(0, 1000); // Meta caps template body params at 1024 chars

  try {
    const result = await notificationService.sendTemplate({
      to, templateName, params: [alertText], language
    });
    if (!result.success) {
      console.error('TradingView alert forward failed:', result.error, result.data || '');
    } else {
      console.log(`📈 TradingView alert forwarded to ${to}: ${alertText}`);
    }
  } catch (err) {
    console.error('TradingView webhook handler crashed:', err);
  }
});

// Admin API — fetch WhatsApp conversations (includes 24h window status)
app.get('/api/replies/conversations', requireAdmin, async (req, res) => {
  try {
    const conversations = await getConversationsData();
    return res.json({ conversations });
  } catch (error) {
    return firebaseError(res, error);
  }
});

// Admin API — send free-form text reply (enforces 24-hour customer service window)
app.post('/api/replies/send', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const wa_id = text(req.body.wa_id || req.body.phone, 'WhatsApp ID', { required: true, max: 30 });
    const messageText = text(req.body.text || req.body.message, 'Message text', { required: true, max: 4096 });

    const conversations = await getConversationsData();
    const conv = conversations.find(c => c.wa_id === wa_id || c.phone === wa_id);

    const lastInboundAt = conv?.last_inbound_at ? new Date(conv.last_inbound_at) : null;
    const now = new Date();
    const windowExpiresAt = lastInboundAt ? new Date(lastInboundAt.getTime() + 24 * 60 * 60 * 1000) : null;
    const isWindowOpen = Boolean(windowExpiresAt && now < windowExpiresAt);

    if (!isWindowOpen) {
      return res.status(400).json({
        error: 'WINDOW_EXPIRED',
        message: '24-hour customer service window expired — send a template to re-engage',
        window_expires_at: windowExpiresAt ? windowExpiresAt.toISOString() : null
      });
    }

    const waToken = process.env.WHATSAPP_TOKEN;
    const waPhoneId = process.env.PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!waToken || !waPhoneId) {
      return res.status(503).json({ error: 'CONFIG_MISSING', message: 'WhatsApp API credentials missing (WHATSAPP_TOKEN or PHONE_NUMBER_ID)' });
    }

    const payload = {
      messaging_product: 'whatsapp',
      to: wa_id,
      type: 'text',
      text: { body: messageText }
    };

    const response = await fetch(`https://graph.facebook.com/v21.0/${waPhoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${waToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok || data.error) {
      const errCode = data.error?.code;
      if (errCode === 131047 || errCode === 131026) {
        await storeOutboundMessage({ waId: wa_id, content: messageText, messageType: 'text', status: 'failed', errorMessage: `Meta 24h window expired (code ${errCode})` });
        return res.status(400).json({
          error: 'WINDOW_EXPIRED',
          message: 'WhatsApp Cloud API rejected send: 24-hour customer service window has expired.',
          window_expires_at: windowExpiresAt ? windowExpiresAt.toISOString() : null
        });
      }

      await storeOutboundMessage({ waId: wa_id, content: messageText, messageType: 'text', status: 'failed', errorMessage: data.error?.message || 'Meta API error' });
      return res.status(500).json({ error: 'META_API_ERROR', message: data.error?.message || 'Failed to send WhatsApp message.' });
    }

    const messageId = data.messages?.[0]?.id || null;
    await storeOutboundMessage({ waId: wa_id, content: messageText, messageType: 'text', status: 'sent', messageId });

    return res.json({ ok: true, messageId });
  } catch (error) {
    return clientError(res, error);
  }
});

// Admin API — send template message (allowed anytime outside 24h window)
app.post('/api/replies/send-template', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const wa_id = text(req.body.wa_id || req.body.phone, 'WhatsApp ID', { required: true, max: 30 });
    const template_name = text(req.body.template_name, 'Template name', { required: true, max: 100 });
    const languageCode = text(req.body.language || 'en', 'Language code', { max: 10 }) || 'en';
    const params = Array.isArray(req.body.params) ? req.body.params : [];

    const waToken = process.env.WHATSAPP_TOKEN;
    const waPhoneId = process.env.PHONE_NUMBER_ID || process.env.WHATSAPP_PHONE_ID || process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!waToken || !waPhoneId) {
      return res.status(503).json({ error: 'CONFIG_MISSING', message: 'WhatsApp API credentials missing (WHATSAPP_TOKEN or PHONE_NUMBER_ID)' });
    }

    const components = [];
    if (params.length > 0) {
      components.push({
        type: 'body',
        parameters: params.map(p => ({ type: 'text', text: String(p) }))
      });
    }

    const payload = {
      messaging_product: 'whatsapp',
      to: wa_id,
      type: 'template',
      template: {
        name: template_name,
        language: { code: languageCode },
        ...(components.length ? { components } : {})
      }
    };

    const response = await fetch(`https://graph.facebook.com/v21.0/${waPhoneId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${waToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    const templateSummary = `[Template: ${template_name}]${params.length ? ` (${params.join(', ')})` : ''}`;

    if (!response.ok || data.error) {
      await storeOutboundMessage({ waId: wa_id, content: templateSummary, messageType: 'template', status: 'failed', errorMessage: data.error?.message || 'Meta template send error' });
      return res.status(500).json({ error: 'META_API_ERROR', message: data.error?.message || 'Failed to send template message.' });
    }

    const messageId = data.messages?.[0]?.id || null;
    await storeOutboundMessage({ waId: wa_id, content: templateSummary, messageType: 'template', status: 'sent', messageId });

    return res.json({ ok: true, messageId });
  } catch (error) {
    return clientError(res, error);
  }
});

// Admin API — fetch WhatsApp replies (legacy)
app.get('/api/admin/whatsapp-replies', requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const snapshot = await db.collection('whatsapp_replies')
      .orderBy('receivedAt', 'desc')
      .limit(limit)
      .get();

    const replies = [];
    snapshot.forEach(doc => {
      replies.push({ id: doc.id, ...doc.data() });
    });
    return res.json({ replies });
  } catch (error) {
    return firebaseError(res, error);
  }
});

// Admin API — mark a reply as read
app.patch('/api/admin/whatsapp-replies/:id/read', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    const replyId = documentId(req.params.id, 'Reply ID');
    await db.collection('whatsapp_replies').doc(replyId).update({ read: true });
    return res.json({ success: true });
  } catch (error) {
    return firebaseError(res, error);
  }
});

// Admin API — delete a reply
app.delete('/api/admin/whatsapp-replies/:id', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    const replyId = documentId(req.params.id, 'Reply ID');
    await db.collection('whatsapp_replies').doc(replyId).delete();
    return res.json({ success: true });
  } catch (error) {
    return firebaseError(res, error);
  }
});

// Only publish the browser assets required by the application. Server code and environment files are never static.
app.use('/admin', express.static(path.join(ROOT_DIR, 'admin')));
app.use('/student', express.static(path.join(ROOT_DIR, 'student')));
app.use('/css', express.static(path.join(ROOT_DIR, 'css')));
app.use('/js', express.static(path.join(ROOT_DIR, 'js')));
app.get('/sw.js', (req, res) => res.sendFile(path.join(ROOT_DIR, 'sw.js')));
app.get('/manifest.json', (req, res) => res.sendFile(path.join(ROOT_DIR, 'manifest.json')));
app.get('/robots.txt', (req, res) => res.sendFile(path.join(ROOT_DIR, 'robots.txt')));
app.get('/sitemap.xml', (req, res) => res.sendFile(path.join(ROOT_DIR, 'sitemap.xml')));
app.get('/privacy', (req, res) => res.sendFile(path.join(ROOT_DIR, 'privacy.html')));
app.get('/privacy.html', (req, res) => res.sendFile(path.join(ROOT_DIR, 'privacy.html')));
app.get('/', (req, res) => res.sendFile(path.join(ROOT_DIR, 'index.html')));

app.use((req, res) => res.status(404).json({ message: 'Not found.' }));
app.use((error, req, res, next) => {
  if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON request body.' });
  console.error('Unhandled server error:', error);
  return res.status(500).json({ message: 'Unexpected server error.' });
});

app.listen(PORT, () => {
  console.log(`Galaxy Academy Backend Server listening on port ${PORT}`);
});
