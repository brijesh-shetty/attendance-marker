const crypto = require('crypto');
const express = require('express');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { cert, getApps, initializeApp } = require('firebase-admin/app');
const { getFirestore: firebaseFirestore } = require('firebase-admin/firestore');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const ROOT_DIR = path.join(__dirname, '..');
const SESSION_COOKIE = 'ga_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const DEVELOPMENT_JWT_SECRET = crypto.randomBytes(48).toString('hex');

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
app.use(express.json({ limit: '1mb' }));
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
    req.user = jwt.verify(token, getJwtSecret(), {
      algorithms: ['HS256'],
      issuer: 'galaxy-academy',
      audience: 'galaxy-academy-web'
    });
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
  return {
    testType: text(metadata.testType, 'Test type', { max: 30 }) || 'Test',
    testNumber: text(metadata.testNumber, 'Test number', { max: 30 }),
    date: metadata.date ? dateValue(metadata.date) : '',
    cetTotal: Number.isFinite(Number(metadata.cetTotal)) ? Number(metadata.cetTotal) : 25,
    theoryTotal: Number.isFinite(Number(metadata.theoryTotal)) ? Number(metadata.theoryTotal) : 25
  };
}

function publicStudent(student) {
  return {
    id: student.id,
    name: student.name,
    combination: student.combination || '',
    college: student.college || ''
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
    const studentId = documentId(req.body.studentId, 'Student ID');
    const password = text(req.body.password, 'Password', { required: true, max: 500 });
    const db = getFirestore();
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
    issueSession(res, { role: 'student', studentId });
    req.user = { role: 'student', studentId };
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

app.get('/api/admin/students', requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('students').get();
    const students = snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return res.json({ students });
  } catch (error) {
    return firebaseError(res, error);
  }
});

app.post('/api/admin/students', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const student = normalizeStudent(req.body);
    const db = getFirestore();
    await db.collection('students').doc(student.id).set(student);
    await writeAudit(req, 'student.saved', student.id);
    return res.status(201).json({ student });
  } catch (error) {
    return clientError(res, error);
  }
});

app.put('/api/admin/students/:studentId', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const student = normalizeStudent(req.body, req.params.studentId);
    const db = getFirestore();
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
    const snapshot = await db.collection('attendance').doc(date).get();
    return res.json({ records: snapshot.exists ? (snapshot.data().records || {}) : {} });
  } catch (error) {
    return clientError(res, error);
  }
});

app.get('/api/admin/attendance/month', requireAdmin, async (req, res) => {
  try {
    const year = text(req.query.year, 'Year', { required: true, max: 4 });
    const month = text(req.query.month, 'Month', { required: true, max: 2 }).padStart(2, '0');
    if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month)) throw new Error('Year and month are invalid.');
    const prefix = `${year}-${month}`;
    const db = getFirestore();
    const snapshot = await db.collection('attendance').get();
    const records = {};
    snapshot.forEach(item => {
      if (item.id.startsWith(prefix)) records[item.id] = item.data().records || {};
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
    const db = getFirestore();
    await db.collection('attendance').doc(date).set({ date, records, updatedAt: Date.now() });
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
    const tests = snapshot.docs.map(item => {
      const data = item.data();
      return {
        key: item.id,
        testId: data.testId || '',
        subject: data.subject || '',
        testType: data.testType || 'Test',
        testNumber: data.testNumber || '',
        date: data.date || '',
        cetTotal: data.cetTotal !== undefined ? Number(data.cetTotal) : 25,
        theoryTotal: data.theoryTotal !== undefined ? Number(data.theoryTotal) : 25,
        updatedAt: data.updatedAt || 0
      };
    }).sort((a, b) => b.updatedAt - a.updatedAt);
    return res.json({ tests });
  } catch (error) {
    return firebaseError(res, error);
  }
});

app.get('/api/admin/tests/marks', requireAdmin, async (req, res) => {
  try {
    const key = testKey(req.query.testId, req.query.subject);
    const db = getFirestore();
    const snapshot = await db.collection('tests').doc(key).get();
    return res.json({ results: snapshot.exists ? (snapshot.data().results || {}) : {} });
  } catch (error) {
    return clientError(res, error);
  }
});

app.post('/api/admin/tests/marks', requireSameOrigin, requireAdmin, async (req, res) => {
  try {
    const testId = text(req.body.testId, 'Test ID', { required: true, max: 80 });
    const subject = text(req.body.subject, 'Subject', { required: true, max: 80 });
    const key = testKey(testId, subject);
    const results = normalizeResults(req.body.results);
    const metadata = normalizeMetadata(req.body.metadata);
    const payload = { testId, subject, results, updatedAt: Date.now(), ...metadata };
    const db = getFirestore();
    await db.collection('tests').doc(key).set(payload);
    await writeAudit(req, 'test_marks.saved', key);
    return res.json({ test: { key, ...payload } });
  } catch (error) {
    return clientError(res, error);
  }
});

app.get('/api/admin/syllabus', requireAdmin, async (req, res) => {
  try {
    const testId = text(req.query.testId, 'Test ID', { required: true, max: 80 });
    const key = documentId(testId.replace(/\s+/g, ''), 'Syllabus key');
    const db = getFirestore();
    const snapshot = await db.collection('syllabus').doc(key).get();
    return res.json({ subjects: snapshot.exists ? (snapshot.data().subjects || {}) : {} });
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
    const db = getFirestore();
    await db.collection('syllabus').doc(key).set({ testId, subjects, updatedAt: Date.now() });
    await writeAudit(req, 'syllabus.saved', key);
    return res.json({ subjects });
  } catch (error) {
    return clientError(res, error);
  }
});

app.get('/api/admin/payments', requireAdmin, async (req, res) => {
  try {
    const db = getFirestore();
    const snapshot = await db.collection('payments').get();
    const payments = {};
    snapshot.forEach(item => { payments[item.id] = item.data().records || {}; });
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
    const notes = text(req.body.notes, 'Notes', { max: 1000 });
    const db = getFirestore();
    const ref = db.collection('payments').doc(studentId);
    const snapshot = await ref.get();
    const records = snapshot.exists ? (snapshot.data().records || {}) : {};
    records[monthYear] = { status, amount, notes, updatedAt: Date.now() };
    await ref.set({ studentId, records });
    await writeAudit(req, 'payment.saved', studentId);
    return res.json({ payment: records[monthYear] });
  } catch (error) {
    return clientError(res, error);
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
    const attendance = {};
    attendanceSnapshot.forEach(item => { attendance[item.id] = item.data().records || {}; });
    const testMarks = {};
    const testMetadata = {};
    testsSnapshot.forEach(item => {
      const data = item.data();
      testMarks[item.id] = data.results || {};
      testMetadata[item.id] = {
        testId: data.testId || '', subject: data.subject || '', testType: data.testType || 'Test',
        testNumber: data.testNumber || '', date: data.date || '', cetTotal: data.cetTotal ?? 25, theoryTotal: data.theoryTotal ?? 25
      };
    });
    const syllabus = {};
    syllabusSnapshot.forEach(item => { syllabus[item.data().testId || item.id] = item.data().subjects || {}; });
    const payments = {};
    paymentsSnapshot.forEach(item => { payments[item.id] = item.data().records || {}; });
    return res.json({
      version: '3.0',
      students: studentsSnapshot.docs.map(item => ({ id: item.id, ...item.data() })),
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

    if (source.students !== undefined) {
      if (!Array.isArray(source.students) || source.students.length > 500) throw new Error('Student backup data is invalid.');
      source.students.forEach(item => {
        const student = normalizeStudent(item);
        writes.push({ ref: db.collection('students').doc(student.id), data: student });
      });
    }

    if (source.attendance !== undefined) {
      if (!source.attendance || typeof source.attendance !== 'object' || Array.isArray(source.attendance)) throw new Error('Attendance backup data is invalid.');
      Object.entries(source.attendance).forEach(([date, records]) => {
        const normalizedDate = dateValue(date);
        writes.push({ ref: db.collection('attendance').doc(normalizedDate), data: { date: normalizedDate, records: normalizeRecords(records), updatedAt: Date.now() } });
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
          ref: db.collection('tests').doc(normalizedKey),
          data: { testId, subject, results: normalizeResults(results), updatedAt: Date.now(), ...normalizeMetadata(metadata) }
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
        writes.push({
          ref: db.collection('syllabus').doc(documentId(normalizedTestId.replace(/\s+/g, ''), 'Syllabus key')),
          data: { testId: normalizedTestId, subjects, updatedAt: Date.now() }
        });
      });
    }

    if (source.payments !== undefined) {
      if (!source.payments || typeof source.payments !== 'object' || Array.isArray(source.payments)) throw new Error('Payment backup data is invalid.');
      Object.entries(source.payments).forEach(([studentId, rawRecords]) => {
        const id = documentId(studentId, 'Student ID');
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
        writes.push({ ref: db.collection('payments').doc(id), data: { studentId: id, records } });
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
    const attendance = [];
    snapshot.forEach(item => {
      const records = item.data().records || {};
      if (!records.__leaveDay && records[req.user.studentId]) attendance.push({ date: item.id, status: records[req.user.studentId] });
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
    const tests = snapshot.docs.map(item => {
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
        key: item.id,
        testId: data.testId || '',
        subject: data.subject || '',
        testType: data.testType || 'Test',
        testNumber: data.testNumber || '',
        date: data.date || '',
        cetTotal: data.cetTotal ?? 25,
        theoryTotal: data.theoryTotal ?? 25,
        updatedAt: data.updatedAt || 0,
        studentScore: results[req.user.studentId] || { present: true, marks: '--', cetMarks: '', theoryMarks: '', totalMarks: '' },
        classAverage: count ? Number((total / count).toFixed(1)) : null
      };
    }).sort((a, b) => b.updatedAt - a.updatedAt);
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

const notificationService = require('./services/notification');

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
    return res.json({ success: true, total: results.length, results: results.map(({ studentName, status }) => ({ studentName, success: status.success })) });
  } catch (error) {
    return clientError(res, error);
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
