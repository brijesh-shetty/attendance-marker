import { initializeApp, deleteApp, getApps } from "firebase/app";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  getDocs, 
  collection, 
  deleteDoc 
} from "firebase/firestore";

// Fetch Firebase config from server (env vars) instead of hardcoding in frontend
async function fetchFirebaseConfig() {
  try {
    const response = await fetch('/api/config/firebase');
    if (!response.ok) throw new Error('Failed to fetch Firebase config');
    const config = await response.json();
    // Cache for offline fallback
    if (config.apiKey && config.projectId) {
      localStorage.setItem('ga_firebase_config_cache', JSON.stringify(config));
    }
    return config;
  } catch (err) {
    console.warn('Could not fetch Firebase config from server. Using cached config.', err);
    const cached = localStorage.getItem('ga_firebase_config_cache');
    if (cached) {
      return JSON.parse(cached);
    }
    return { apiKey: '', authDomain: '', projectId: '', storageBucket: '', messagingSenderId: '', appId: '' };
  }
}

const DEFAULT_STUDENTS = [
  { id: "1", name: "SHAFFRINA HAIYED", combination: "CS", college: "JNC", phone: "9876543201", parentPhone: "" },
  { id: "2", name: "DIVYESH M", combination: "CS", college: "SFS", phone: "9876543202", parentPhone: "" },
  { id: "3", name: "ALWINA", combination: "CS", college: "JNC", phone: "9876543203", parentPhone: "" },
  { id: "4", name: "VANDHANA SHETTY", combination: "BIO", college: "JNC", phone: "9876543204", parentPhone: "" },
  { id: "5", name: "SHRADDA G", combination: "BIO", college: "JNC", phone: "9876543205", parentPhone: "" },
  { id: "6", name: "DEEPIKA BHUI", combination: "CS", college: "JNC", phone: "9876543206", parentPhone: "" },
  { id: "7", name: "JEEVITHA MAHESH", combination: "BIO", college: "JNC", phone: "9876543207", parentPhone: "" },
  { id: "8", name: "MADHUMITHA P", combination: "BIO", college: "JNC", phone: "9876543208", parentPhone: "" },
  { id: "9", name: "SARANYA R", combination: "CS", college: "JNC", phone: "9876543209", parentPhone: "" },
  { id: "10", name: "SONIKA M", combination: "CS", college: "SFS", phone: "9876543210", parentPhone: "" },
  { id: "11", name: "SAHANA M K", combination: "CS", college: "SFS", phone: "9876543211", parentPhone: "" },
  { id: "12", name: "GALLIBIOYINA MAHITHA", combination: "CS", college: "JNC", phone: "9876543212", parentPhone: "" },
  { id: "13", name: "KEVIN J", combination: "ELE", college: "SFS", phone: "9876543213", parentPhone: "" },
  { id: "14", name: "ROOPASHREE", combination: "BIO", college: "JNC", phone: "9876543214", parentPhone: "" },
  { id: "15", name: "KRUPA A", combination: "CS", college: "JNC", phone: "9876543215", parentPhone: "" },
  { id: "16", name: "NANDHANA", combination: "CS", college: "JNC", phone: "9876543216", parentPhone: "" },
  { id: "17", name: "THULASI SHREE", combination: "CS", college: "JNC", phone: "9876543217", parentPhone: "" },
  { id: "18", name: "HEMADRI G K", combination: "BIO", college: "JNC", phone: "9876543218", parentPhone: "" },
  { id: "19", name: "MONISH", combination: "CS", college: "CJC", phone: "9876543219", parentPhone: "" },
  { id: "20", name: "NAMRATHA", combination: "BIO", college: "CJC", phone: "9876543220", parentPhone: "" },
  { id: "21", name: "HILMA M B", combination: "BIO", college: "JNC", phone: "9876543221", parentPhone: "" },
  { id: "22", name: "ABHINAYA M", combination: "BIO", college: "JNC", phone: "9876543222", parentPhone: "" },
  { id: "23", name: "SUKRITI K SHETTY", combination: "BIO", college: "CJC", phone: "9876543223", parentPhone: "" },
  { id: "24", name: "SAGAR K V", combination: "ELE", college: "SFS", phone: "9876543224", parentPhone: "" },
  { id: "25", name: "NETHRA V", combination: "BIO", college: "SFS", phone: "9876543225", parentPhone: "" },
  { id: "26", name: "ANUSHKA G", combination: "CS", college: "JNC", phone: "9876543226", parentPhone: "" },
  { id: "27", name: "KANISHKA", combination: "CS", college: "JNC", phone: "9876543227", parentPhone: "" },
  { id: "28", name: "LIKITHA S N", combination: "CS", college: "JNC", phone: "9876543228", parentPhone: "" },
  { id: "29", name: "RISHI RAJ", combination: "ELE", college: "SFS", phone: "9876543229", parentPhone: "" },
  { id: "30", name: "JANANI K", combination: "BIO", college: "JNC", phone: "9876543230", parentPhone: "" },
  { id: "31", name: "MAHASRI", combination: "BIO", college: "JNC", phone: "9876543231", parentPhone: "" },
  { id: "32", name: "SHREEJA", combination: "BIO", college: "CJC", phone: "9876543232", parentPhone: "" },
  { id: "33", name: "DEEPTHI D", combination: "CS", college: "JNC", phone: "9876543233", parentPhone: "" },
  { id: "34", name: "DHANA LAKSHMI", combination: "CS", college: "JNC", phone: "9876543234", parentPhone: "" },
  { id: "35", name: "SHILPA", combination: "CS", college: "JNC", phone: "9876543235", parentPhone: "" }
];

class DatabaseManager {
  constructor() {
    this.firebaseApp = null;
    this.firestore = null;
    this.ready = this._init(); // Async initialization — await db.ready before first use
  }

  async _init() {
    const firebaseConfig = await fetchFirebaseConfig();
    this.config = this.getSettings(firebaseConfig);
    await this.initFirebase();
  }

  // Load configuration from local storage
  getSettings(firebaseConfig = {}) {
    const hasDefault = firebaseConfig.apiKey && firebaseConfig.projectId;
    const defaultSettings = {
      mode: hasDefault ? 'firebase' : 'local', // 'local' or 'firebase'
      apiKey: firebaseConfig.apiKey || '',
      authDomain: firebaseConfig.authDomain || '',
      projectId: firebaseConfig.projectId || '',
      appId: firebaseConfig.appId || '',
      passcode: '1234',
      twilioSid: '',
      twilioToken: '',
      twilioPhone: ''
    };
    try {
      const stored = localStorage.getItem('galaxy_academy_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.passcode === undefined) {
          parsed.passcode = '1234';
        }
        return { ...defaultSettings, ...parsed };
      }
      return defaultSettings;
    } catch (e) {
      return defaultSettings;
    }
  }

  // Save settings
  async saveSettings(newSettings) {
    this.config = { ...this.config, ...newSettings };
    localStorage.setItem('galaxy_academy_settings', JSON.stringify(this.config));
    await this.initFirebase();
    if (this.isFirebaseActive() && newSettings.passcode) {
      try {
        const docRef = doc(this.firestore, "config", "passcode");
        await setDoc(docRef, { passcode: newSettings.passcode });
      } catch (err) {
        console.error("Failed to sync passcode to Firebase:", err);
      }
    }
  }

  // Initializing Firebase Cloud sync if selected
  async initFirebase() {
    // Delete existing apps if they were previously configured (to allow settings change)
    const existingApps = getApps();
    for (const app of existingApps) {
      try {
        await deleteApp(app);
      } catch (err) {
        console.warn("Failed to delete existing Firebase app instance", err);
      }
    }

    if (this.config.mode === 'firebase' && this.config.apiKey && this.config.projectId) {
      try {
        const firebaseConfig = {
          apiKey: this.config.apiKey,
          authDomain: this.config.authDomain,
          projectId: this.config.projectId,
          appId: this.config.appId
        };
        // Initialize default app
        this.firebaseApp = initializeApp(firebaseConfig);
        this.firestore = getFirestore(this.firebaseApp);
        // Sync passcode from server
        await this.getPasscode();
        // Auto-seed students to Firebase if the collection is empty
        await this.autoSeedStudentsToFirebase();
      } catch (err) {
        console.error("Failed to initialize Firebase. Falling back to local offline mode.", err);
        this.firestore = null;
      }
    } else {
      this.firebaseApp = null;
      this.firestore = null;
    }
  }

  // Helper to execute a promise with a timeout (prevents database hangs under offline/unstable networks)
  async runWithTimeout(promise, timeoutMs = 2500) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error("Database request timeout"));
      }, timeoutMs);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => {
      clearTimeout(timeoutId);
    });
  }

  // Passcode verification & sync operations
  async getPasscode() {
    if (this.isFirebaseActive()) {
      try {
        const docRef = doc(this.firestore, "config", "passcode");
        const docSnap = await this.runWithTimeout(getDoc(docRef), 2000);
        if (docSnap.exists()) {
          let pcode = docSnap.data().passcode;
          if (pcode && pcode.startsWith("AIzaSy")) {
            console.warn("[DB] Corrupted passcode detected (API Key). Resetting to '1234'...");
            pcode = "1234";
            setDoc(docRef, { passcode: "1234" }).catch(e => {});
          }
          if (pcode) {
            this.config.passcode = pcode;
            localStorage.setItem('galaxy_academy_settings', JSON.stringify(this.config));
            return pcode;
          }
        } else {
          // Initialize server passcode in background without blocking
          const pcode = this.config.passcode || '1234';
          setDoc(docRef, { passcode: pcode }).catch(err => {
            console.warn("Failed to initialize server passcode in Firebase:", err);
          });
          return pcode;
        }
      } catch (err) {
        console.warn("Failed to fetch passcode from Firebase server. Using local passcode.", err);
      }
    }
    let localPasscode = this.config.passcode || '1234';
    if (localPasscode.startsWith("AIzaSy")) {
      localPasscode = "1234";
      this.config.passcode = "1234";
      localStorage.setItem('galaxy_academy_settings', JSON.stringify(this.config));
    }
    return localPasscode;
  }

  async verifyPasscode(inputPasscode) {
    const correct = await this.getPasscode();
    return inputPasscode === correct;
  }

  isFirebaseActive() {
    return this.config.mode === 'firebase' && this.firestore !== null;
  }

  // Auto-seed: if Firebase students collection is empty, upload all DEFAULT_STUDENTS
  async autoSeedStudentsToFirebase() {
    if (!this.isFirebaseActive()) return;
    try {
      const colRef = collection(this.firestore, "students");
      const snapshot = await this.runWithTimeout(getDocs(colRef), 2500);
      if (snapshot.empty) {
        for (const student of DEFAULT_STUDENTS) {
          const docRef = doc(this.firestore, "students", student.id);
          await setDoc(docRef, student);
        }
      }
    } catch (err) {
      console.error("Auto-seed failed:", err);
    }
  }

  /* ---------------- STUDENT CRUD ---------------- */
  async getStudents() {
    if (this.isFirebaseActive()) {
      try {
        const colRef = collection(this.firestore, "students");
        const snapshot = await this.runWithTimeout(getDocs(colRef), 2500);
        const list = [];
        snapshot.forEach(doc => {
          list.push({ id: doc.id, ...doc.data() });
        });
        if (list.length > 0) {
          return list.sort((a, b) => a.name.localeCompare(b.name));
        }
      } catch (err) {
        console.error("Firebase read failed. Pulling from local storage.", err);
      }
    }
    // Local fallback
    const local = localStorage.getItem('ga_students');
    let students = local ? JSON.parse(local) : [];
    if (students.length === 0) {
      students = [...DEFAULT_STUDENTS];
      localStorage.setItem('ga_students', JSON.stringify(students));
    }
    return students.sort((a, b) => a.name.localeCompare(b.name));
  }

  async saveStudent(student) {
    if (!student.id) {
      student.id = 'stu_' + Date.now() + Math.random().toString(36).substr(2, 5);
    }
    
    if (this.isFirebaseActive()) {
      try {
        const docRef = doc(this.firestore, "students", student.id);
        await setDoc(docRef, student);
      } catch (err) {
        console.error("Firebase save failed. Writing to local storage.", err);
      }
    }
    
    // Save locally
    const students = await this.getStudents();
    const index = students.findIndex(s => s.id === student.id);
    if (index >= 0) {
      students[index] = student;
    } else {
      students.push(student);
    }
    localStorage.setItem('ga_students', JSON.stringify(students));
    return student;
  }

  async deleteStudent(studentId) {
    if (this.isFirebaseActive()) {
      try {
        const docRef = doc(this.firestore, "students", studentId);
        await deleteDoc(docRef);
      } catch (err) {
        console.error("Firebase delete failed.", err);
      }
    }
    const students = await this.getStudents();
    const filtered = students.filter(s => s.id !== studentId);
    localStorage.setItem('ga_students', JSON.stringify(filtered));
  }

  async seedStudentSheetData() {
    const students = [...DEFAULT_STUDENTS];
    localStorage.setItem('ga_students', JSON.stringify(students));
    
    if (this.isFirebaseActive()) {
      try {
        for (const student of students) {
          const docRef = doc(this.firestore, "students", student.id);
          await setDoc(docRef, student);
        }
      } catch (err) {
        console.error("Firebase seeding failed:", err);
      }
    }
    return students;
  }

  /* ---------------- ATTENDANCE OPERATIONS ---------------- */
  async getAttendance(dateString) {
    const fallbackId = `att_${dateString}`;
    if (this.isFirebaseActive()) {
      try {
        const docRef = doc(this.firestore, "attendance", dateString);
        const docSnap = await this.runWithTimeout(getDoc(docRef), 2000);
        if (docSnap.exists()) {
          return docSnap.data().records || {};
        }
      } catch (err) {
        console.error("Firebase attendance load failed.", err);
      }
    }
    const local = localStorage.getItem(fallbackId);
    return local ? JSON.parse(local) : {};
  }

  async saveAttendance(dateString, records) {
    if (this.isFirebaseActive()) {
      try {
        const docRef = doc(this.firestore, "attendance", dateString);
        await setDoc(docRef, { date: dateString, records });
      } catch (err) {
        console.error("Firebase attendance save failed.", err);
      }
    }
    localStorage.setItem(`att_${dateString}`, JSON.stringify(records));
  }

  /* ---------------- TEST SERIES OPERATIONS ---------------- */
  async getTestMarks(testId, subject) {
    const key = `${testId.replace(/\s+/g, '')}_${subject}`;
    if (this.isFirebaseActive()) {
      try {
        const docRef = doc(this.firestore, "tests", key);
        const docSnap = await this.runWithTimeout(getDoc(docRef), 2500);
        if (docSnap.exists()) {
          return docSnap.data().results || {};
        }
      } catch (err) {
        console.error("Firebase test scores load failed.", err);
      }
    }
    const local = localStorage.getItem(`test_marks_${key}`);
    return local ? JSON.parse(local) : {};
  }

  async saveTestMarks(testId, subject, results, metadata = {}) {
    const key = `${testId.replace(/\s+/g, '')}_${subject}`;
    const payload = {
      testId,
      subject,
      results,
      updatedAt: Date.now(),
      testType: metadata.testType || 'Test',
      testNumber: metadata.testNumber || '',
      date: metadata.date || '',
      cetTotal: metadata.cetTotal !== undefined ? Number(metadata.cetTotal) : 25,
      theoryTotal: metadata.theoryTotal !== undefined ? Number(metadata.theoryTotal) : 25
    };
    
    if (this.isFirebaseActive()) {
      try {
        const docRef = doc(this.firestore, "tests", key);
        await setDoc(docRef, payload);
      } catch (err) {
        console.error("Firebase test scores save failed.", err);
      }
    }
    
    localStorage.setItem(`test_marks_${key}`, JSON.stringify(results));
    localStorage.setItem(`test_meta_${key}`, JSON.stringify({
      testId,
      subject,
      testType: metadata.testType || 'Test',
      testNumber: metadata.testNumber || '',
      date: metadata.date || '',
      cetTotal: metadata.cetTotal !== undefined ? Number(metadata.cetTotal) : 25,
      theoryTotal: metadata.theoryTotal !== undefined ? Number(metadata.theoryTotal) : 25,
      updatedAt: payload.updatedAt
    }));
  }

  async getTestMetadata(testId, subject) {
    const key = `${testId.replace(/\s+/g, '')}_${subject}`;
    if (this.isFirebaseActive()) {
      try {
        const docRef = doc(this.firestore, "tests", key);
        const docSnap = await this.runWithTimeout(getDoc(docRef), 2000);
        if (docSnap.exists()) {
          const data = docSnap.data();
          return {
            testType: data.testType || 'Test',
            testNumber: data.testNumber || '',
            date: data.date || '',
            cetTotal: data.cetTotal !== undefined ? Number(data.cetTotal) : 25,
            theoryTotal: data.theoryTotal !== undefined ? Number(data.theoryTotal) : 25
          };
        }
      } catch (err) {
        console.error("Firebase get metadata failed.", err);
      }
    }
    const local = localStorage.getItem(`test_meta_${key}`);
    if (local) {
      try {
        const data = JSON.parse(local);
        return {
          testType: data.testType || 'Test',
          testNumber: data.testNumber || '',
          date: data.date || '',
          cetTotal: data.cetTotal !== undefined ? Number(data.cetTotal) : 25,
          theoryTotal: data.theoryTotal !== undefined ? Number(data.theoryTotal) : 25
        };
      } catch (e) {
        console.error("Failed to parse test meta local storage:", e);
      }
    }
    return { testType: 'Test', testNumber: '', date: '', cetTotal: 25, theoryTotal: 25 };
  }

  async getAllTests() {
    const list = [];
    if (this.isFirebaseActive()) {
      try {
        const colRef = collection(this.firestore, "tests");
        const snapshot = await this.runWithTimeout(getDocs(colRef), 3000);
        snapshot.forEach(doc => {
          const data = doc.data();
          list.push({
            key: doc.id,
            testId: data.testId || '',
            subject: data.subject || '',
            testType: data.testType || 'Test',
            testNumber: data.testNumber || '',
            date: data.date || '',
            cetTotal: data.cetTotal !== undefined ? Number(data.cetTotal) : 25,
            theoryTotal: data.theoryTotal !== undefined ? Number(data.theoryTotal) : 25,
            updatedAt: data.updatedAt || 0
          });
        });
        return list.sort((a, b) => b.updatedAt - a.updatedAt);
      } catch (err) {
        console.error("Firebase load tests failed, pulling local.", err);
      }
    }
    // Pull local fallback
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('test_meta_')) {
        try {
          const rawKey = key.replace('test_meta_', '');
          const data = JSON.parse(localStorage.getItem(key));
          list.push({
            key: rawKey,
            testId: data.testId || '',
            subject: data.subject || '',
            testType: data.testType || 'Test',
            testNumber: data.testNumber || '',
            date: data.date || '',
            cetTotal: data.cetTotal !== undefined ? Number(data.cetTotal) : 25,
            theoryTotal: data.theoryTotal !== undefined ? Number(data.theoryTotal) : 25,
            updatedAt: data.updatedAt || 0
          });
        } catch (e) {
          console.error("Failed to parse local test meta:", e);
        }
      }
    }
    return list.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /* ---------------- SYLLABUS OPERATIONS ---------------- */
  async getSyllabus(testId) {
    const key = testId.replace(/\s+/g, '');
    if (this.isFirebaseActive()) {
      try {
        const docRef = doc(this.firestore, "syllabus", key);
        const docSnap = await this.runWithTimeout(getDoc(docRef), 2500);
        if (docSnap.exists()) {
          return docSnap.data().subjects || {};
        }
      } catch (err) {
        console.error("Firebase syllabus load failed.", err);
      }
    }
    const local = localStorage.getItem(`syllabus_${key}`);
    return local ? JSON.parse(local) : {};
  }

  async saveSyllabus(testId, subjects) {
    const key = testId.replace(/\s+/g, '');
    if (this.isFirebaseActive()) {
      try {
        const docRef = doc(this.firestore, "syllabus", key);
        await setDoc(docRef, { testId, subjects, updatedAt: Date.now() });
      } catch (err) {
        console.error("Firebase syllabus save failed.", err);
      }
    }
    localStorage.setItem(`syllabus_${key}`, JSON.stringify(subjects));
  }

  /* ---------------- BACKUP & DATA CONVERTER ---------------- */
  async exportJSON() {
    const students = await this.getStudents();
    const syllabus = {};
    const attendance = {};
    const testMarks = {};
    const testMetadata = {};

    // Gather all tests dynamically
    const allTests = await this.getAllTests();
    for (const test of allTests) {
      const key = test.key;
      testMarks[key] = await this.getTestMarks(test.testId, test.subject);
      testMetadata[key] = {
        testId: test.testId,
        subject: test.subject,
        testType: test.testType,
        testNumber: test.testNumber,
        date: test.date
      };
      
      if (!syllabus[test.testId]) {
        syllabus[test.testId] = await this.getSyllabus(test.testId);
      }
    }

    // Capture attendance records from localStorage keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('att_')) {
        const date = key.replace('att_', '');
        attendance[date] = JSON.parse(localStorage.getItem(key));
      }
    }

    return JSON.stringify({
      version: "2.0",
      students,
      attendance,
      testMarks,
      testMetadata,
      syllabus
    }, null, 2);
  }

  async importJSON(jsonData) {
    try {
      const data = JSON.parse(jsonData);
      
      // Load students
      if (Array.isArray(data.students)) {
        for (const student of data.students) {
          await this.saveStudent(student);
        }
      }

      // Load attendance
      if (data.attendance) {
        for (const [date, records] of Object.entries(data.attendance)) {
          await this.saveAttendance(date, records);
        }
      }

      // Load test marks and metadata
      if (data.testMarks) {
        for (const [key, results] of Object.entries(data.testMarks)) {
          const parts = key.split('_');
          const rawTestId = parts[0];
          const subject = parts[1];
          
          let meta = { testType: 'Test', testNumber: '', date: '' };
          if (data.testMetadata && data.testMetadata[key]) {
            meta = data.testMetadata[key];
          } else {
            // Parse from key for compatibility
            const match = rawTestId.match(/^([a-zA-Z]+)(\d+)$/);
            if (match) {
              meta.testType = match[1];
              meta.testNumber = match[2];
            }
          }
          const displayTestId = meta.testId || `${meta.testType} ${meta.testNumber}`;
          await this.saveTestMarks(displayTestId, subject, results, meta);
        }
      }

      // Load syllabus
      if (data.syllabus) {
        for (const [testId, subjects] of Object.entries(data.syllabus)) {
          await this.saveSyllabus(testId, subjects);
        }
      }

      return true;
    } catch (err) {
      console.error("Backup import failed.", err);
      return false;
    }
  }

  // Push all local offline storage records to Firestore (Upload sync)
  async pushLocalDataToCloud() {
    if (!this.isFirebaseActive()) return { success: false, error: "Firebase is not active. Check configuration." };
    try {
      console.log("Syncing offline local storage to Firebase cloud...");
      const students = await this.getStudents();
      for (const s of students) {
        const docRef = doc(this.firestore, "students", s.id);
        await setDoc(docRef, s);
      }
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key.startsWith('att_')) {
          const date = key.replace('att_', '');
          const records = JSON.parse(localStorage.getItem(key));
          const docRef = doc(this.firestore, "attendance", date);
          await setDoc(docRef, { date, records });
        }
        
        if (key.startsWith('test_marks_')) {
          const rawKey = key.replace('test_marks_', '');
          const parts = rawKey.split('_');
          const testId = parts[0].replace('Test', 'Test ');
          const subject = parts[1];
          const results = JSON.parse(localStorage.getItem(key));
          
          // Fetch local metadata if exists
          const metaKey = `test_meta_${rawKey}`;
          const localMeta = localStorage.getItem(metaKey);
          const meta = localMeta ? JSON.parse(localMeta) : {};
          
          const docRef = doc(this.firestore, "tests", rawKey);
          await setDoc(docRef, { 
            testId: meta.testId || testId, 
            subject, 
            cetTotal: meta.cetTotal !== undefined ? Number(meta.cetTotal) : 25,
            theoryTotal: meta.theoryTotal !== undefined ? Number(meta.theoryTotal) : 25,
            updatedAt: meta.updatedAt || Date.now()
          });
        }
        
        if (key.startsWith('syllabus_')) {
          const testId = key.replace('syllabus_Test', 'Test ');
          const subjects = JSON.parse(localStorage.getItem(key));
          const docRef = doc(this.firestore, "syllabus", key.replace('syllabus_', ''));
          await setDoc(docRef, { testId, subjects });
        }
      }
      return { success: true };
    } catch (err) {
      console.error("Failed cloud migration.", err);
      return { success: false, error: err.message || err.toString() };
    }
  }

  /* ---------------- ATTENDANCE MONTHLY OPERATIONS ---------------- */
  async getAllAttendanceForMonth(year, month) {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const result = {};
    
    if (this.isFirebaseActive()) {
      try {
        const colRef = collection(this.firestore, "attendance");
        const snapshot = await this.runWithTimeout(getDocs(colRef), 3000);
        snapshot.forEach(doc => {
          const date = doc.id; // YYYY-MM-DD
          if (date.startsWith(prefix)) {
            result[date] = doc.data().records || {};
          }
        });
        return result;
      } catch (err) {
        console.error("Firebase load attendance for month failed, pulling local.", err);
      }
    }
    
    // Local fallback
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(`att_${prefix}`)) {
        const date = key.replace('att_', '');
        try {
          result[date] = JSON.parse(localStorage.getItem(key)) || {};
        } catch (e) {
          console.error("Failed to parse local attendance data:", e);
        }
      }
    }
    return result;
  }

  /* ---------------- PAYMENTS OPERATIONS ---------------- */
  async getPayments() {
    const local = localStorage.getItem('ga_payments');
    return local ? JSON.parse(local) : {};
  }

  async savePayment(studentId, monthYearStr, status, amount = "", notes = "") {
    const payments = await this.getPayments();
    if (!payments[studentId]) payments[studentId] = {};
    payments[studentId][monthYearStr] = {
      status, // 'paid', 'due', 'partial'
      amount,
      notes,
      updatedAt: Date.now()
    };
    localStorage.setItem('ga_payments', JSON.stringify(payments));
    
    if (this.isFirebaseActive()) {
      try {
        const docRef = doc(this.firestore, "payments", studentId);
        await setDoc(docRef, { studentId, records: payments[studentId] });
      } catch (e) {
        console.warn("Failed to sync payment to Firebase:", e);
      }
    }
    return payments[studentId][monthYearStr];
  }

  async getStudentPayments(studentId) {
    const payments = await this.getPayments();
    return payments[studentId] || {};
  }

  /* ---------------- STUDENT AUTH & CREDENTIALS ---------------- */
  async verifyStudentLogin(studentId, password) {
    const students = await this.getStudents();
    const student = students.find(s => s.id.toString() === studentId.toString());
    if (!student) return { success: false, message: "Student ID not found." };

    // Check custom password storage
    const customPass = localStorage.getItem(`stu_pass_${student.id}`);
    const expectedPass = customPass || student.phone || student.parentPhone || "123456";

    if (password === expectedPass) {
      return { success: true, student };
    } else {
      return { success: false, message: "Incorrect password." };
    }
  }

  async changeStudentPassword(studentId, oldPassword, newPassword) {
    const verification = await this.verifyStudentLogin(studentId, oldPassword);
    if (!verification.success) {
      return { success: false, message: "Current password is incorrect." };
    }
    localStorage.setItem(`stu_pass_${studentId}`, newPassword);
    return { success: true, message: "Password updated successfully!" };
  }

  async resetStudentPassword(studentId) {
    localStorage.removeItem(`stu_pass_${studentId}`);
    return { success: true, message: "Password reset to parent phone number!" };
  }
}

// Single instance of database controller
export const db = new DatabaseManager();
