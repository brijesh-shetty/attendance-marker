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

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyB2YJOFV6qFzDfuMjL2aGKHgq4Eb_f05Jo",
  authDomain: "galaxyacademy-5.firebaseapp.com",
  projectId: "galaxyacademy-5",
  storageBucket: "galaxyacademy-5.firebasestorage.app",
  messagingSenderId: "178445479028",
  appId: "1:178445479028:web:42dbad5f82cd4d3b6af521"
};

const DEFAULT_STUDENTS = [
  { id: "stu_sheet_1", name: "SHAFFRINA HAIYED", combination: "CS", college: "JNC", phone: "", parentPhone: "" },
  { id: "stu_sheet_2", name: "DIVYESH M", combination: "CS", college: "SFS", phone: "", parentPhone: "" },
  { id: "stu_sheet_3", name: "ALWINA", combination: "CS", college: "JNC", phone: "", parentPhone: "" },
  { id: "stu_sheet_4", name: "VANDHANA SHETTY", combination: "BIO", college: "JNC", phone: "", parentPhone: "" },
  { id: "stu_sheet_5", name: "SHRADDA G", combination: "BIO", college: "JNC", phone: "", parentPhone: "" },
  { id: "stu_sheet_6", name: "DEEPIKA BHUI", combination: "CS", college: "JNC", phone: "", parentPhone: "" },
  { id: "stu_sheet_7", name: "JEEVITHA MAHESH", combination: "BIO", college: "JNC", phone: "", parentPhone: "" },
  { id: "stu_sheet_8", name: "MADHUMITHA P", combination: "BIO", college: "JNC", phone: "", parentPhone: "" },
  { id: "stu_sheet_9", name: "SARANYA R", combination: "CS", college: "JNC", phone: "", parentPhone: "" },
  { id: "stu_sheet_10", name: "SONIKA M", combination: "CS", college: "SFS", phone: "", parentPhone: "" },
  { id: "stu_sheet_11", name: "SAHANA M K", combination: "CS", college: "SFS", phone: "", parentPhone: "" },
  { id: "stu_sheet_12", name: "GALLIBIOYINA MAHITHA", combination: "CS", college: "JNC", phone: "", parentPhone: "" },
  { id: "stu_sheet_13", name: "KEVIN J", combination: "ELE", college: "SFS", phone: "", parentPhone: "" },
  { id: "stu_sheet_14", name: "ROOPASHREE", combination: "BIO", college: "JNC", phone: "", parentPhone: "" },
  { id: "stu_sheet_15", name: "KRUPA A", combination: "CS", college: "JNC", phone: "", parentPhone: "" },
  { id: "stu_sheet_16", name: "NANDHANA", combination: "CS", college: "JNC", phone: "", parentPhone: "" },
  { id: "stu_sheet_17", name: "THULASI SHREE", combination: "CS", college: "JNC", phone: "", parentPhone: "" },
  { id: "stu_sheet_18", name: "HEMADRI G K", combination: "BIO", college: "JNC", phone: "", parentPhone: "" },
  { id: "stu_sheet_19", name: "MONISH", combination: "CS", college: "CJC", phone: "", parentPhone: "" },
  { id: "stu_sheet_20", name: "NAMRATHA", combination: "BIO", college: "CJC", phone: "", parentPhone: "" },
  { id: "stu_sheet_21", name: "HILMA M B", combination: "BIO", college: "JNC", phone: "", parentPhone: "" },
  { id: "stu_sheet_22", name: "ABHINAYA M", combination: "BIO", college: "JNC", phone: "", parentPhone: "" },
  { id: "stu_sheet_23", name: "SUKRITI K SHETTY", combination: "BIO", college: "CJC", phone: "", parentPhone: "" },
  { id: "stu_sheet_24", name: "SAGAR K V", combination: "ELE", college: "SFS", phone: "", parentPhone: "" },
  { id: "stu_sheet_25", name: "NETHRA V", combination: "BIO", college: "SFS", phone: "", parentPhone: "" },
  { id: "stu_sheet_26", name: "ANUSHKA G", combination: "CS", college: "JNC", phone: "", parentPhone: "" },
  { id: "stu_sheet_27", name: "KANISHKA", combination: "CS", college: "JNC", phone: "", parentPhone: "" },
  { id: "stu_sheet_28", name: "LIKITHA S N", combination: "CS", college: "JNC", phone: "", parentPhone: "" },
  { id: "stu_sheet_29", name: "RISHI RAJ", combination: "ELE", college: "SFS", phone: "", parentPhone: "" },
  { id: "stu_sheet_30", name: "JANANI K", combination: "BIO", college: "JNC", phone: "", parentPhone: "" },
  { id: "stu_sheet_31", name: "MAHASRI", combination: "BIO", college: "JNC", phone: "", parentPhone: "" },
  { id: "stu_sheet_32", name: "SHREEJA", combination: "BIO", college: "CJC", phone: "", parentPhone: "" },
  { id: "stu_sheet_33", name: "DEEPTHI D", combination: "CS", college: "JNC", phone: "", parentPhone: "" },
  { id: "stu_sheet_34", name: "DHANA LAKSHMI", combination: "CS", college: "JNC", phone: "", parentPhone: "" },
  { id: "stu_sheet_35", name: "SHILPA", combination: "CS", college: "JNC", phone: "", parentPhone: "" }
];

class DatabaseManager {
  constructor() {
    this.firebaseApp = null;
    this.firestore = null;
    this.config = this.getSettings();
    this.initFirebase();
  }

  // Load configuration from local storage
  getSettings() {
    const hasDefault = DEFAULT_FIREBASE_CONFIG.apiKey && DEFAULT_FIREBASE_CONFIG.projectId;
    const defaultSettings = {
      mode: hasDefault ? 'firebase' : 'local', // 'local' or 'firebase'
      apiKey: DEFAULT_FIREBASE_CONFIG.apiKey || '',
      authDomain: DEFAULT_FIREBASE_CONFIG.authDomain || '',
      projectId: DEFAULT_FIREBASE_CONFIG.projectId || '',
      appId: DEFAULT_FIREBASE_CONFIG.appId || '',
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
        console.log("Firebase Firestore loaded successfully for Galaxy Academy.");
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
          const pcode = docSnap.data().passcode;
          if (pcode) {
            this.config.passcode = pcode;
            localStorage.setItem('galaxy_academy_settings', JSON.stringify(this.config));
            return pcode;
          }
        } else {
          // Initialize server passcode
          const pcode = this.config.passcode || '1234';
          await setDoc(docRef, { passcode: pcode });
          return pcode;
        }
      } catch (err) {
        console.warn("Failed to fetch passcode from Firebase server. Using local passcode.", err);
      }
    }
    return this.config.passcode || '1234';
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
        console.log("Firebase students collection is empty. Auto-seeding 35 default students...");
        for (const student of DEFAULT_STUDENTS) {
          const docRef = doc(this.firestore, "students", student.id);
          await setDoc(docRef, student);
        }
        console.log("Auto-seed complete: 35 students uploaded to Firebase.");
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
      date: metadata.date || ''
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
            date: data.date || ''
          };
        }
      } catch (err) {
        console.error("Firebase get metadata failed.", err);
      }
    }
    const local = localStorage.getItem(`test_meta_${key}`);
    return local ? JSON.parse(local) : { testType: 'Test', testNumber: '', date: '' };
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
            results,
            testType: meta.testType || 'Test',
            testNumber: meta.testNumber || '',
            date: meta.date || '',
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
      console.log("Firebase cloud sync completed successfully.");
      return { success: true };
    } catch (err) {
      console.error("Failed cloud migration.", err);
      return { success: false, error: err.message || err.toString() };
    }
  }
}

// Single instance of database controller
export const db = new DatabaseManager();
window.appDbInstance = db; // expose to window for diagnostic checks
