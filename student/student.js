import { db } from "../js/db.js";

class StudentPortalController {
  constructor() {
    this.currentStudent = null;
    this.currentView = "student-dashboard";

    this.views = {
      "student-dashboard": document.getElementById("student-dashboard-view"),
      "student-attendance": document.getElementById("student-attendance-view"),
      "student-marks": document.getElementById("student-marks-view"),
      "student-fees": document.getElementById("student-fees-view")
    };

    this.navItems = document.querySelectorAll(".bottom-nav .nav-item");
    this.toastContainer = document.getElementById("toast-container");

    this.initEventListeners();
  }

  async init() {
    lucide.createIcons();

    // Check saved session
    const savedStudentId = sessionStorage.getItem("ga_student_logged_id");
    if (savedStudentId) {
      const students = await db.getStudents();
      const student = students.find(s => s.id.toString() === savedStudentId.toString());
      if (student) {
        this.loginSuccess(student);
        return;
      }
    }
    this.showLoginScreen();
  }

  showLoginScreen() {
    document.getElementById("student-login-overlay").style.display = "flex";
  }

  hideLoginScreen() {
    document.getElementById("student-login-overlay").style.display = "none";
  }

  loginSuccess(student) {
    this.currentStudent = student;
    sessionStorage.setItem("ga_student_logged_id", student.id);
    this.hideLoginScreen();

    // Set UI elements
    document.getElementById("display-student-name").textContent = student.name;
    document.getElementById("dash-welcome-name").textContent = student.name.split(" ")[0];
    document.getElementById("display-student-id").textContent = `#${student.id}`;
    document.getElementById("display-student-comb").textContent = student.combination || "PU";
    document.getElementById("student-avatar-initials").textContent = student.name.charAt(0).toUpperCase();

    this.switchView("student-dashboard");
  }

  showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${message}</span>
      <i data-lucide="x" style="width:16px; height:16px; cursor:pointer;" onclick="this.parentElement.remove()"></i>
    `;
    this.toastContainer.appendChild(toast);
    lucide.createIcons();
    
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  switchView(viewName) {
    if (!this.views[viewName]) return;
    
    Object.values(this.views).forEach(v => v.classList.remove("active"));
    this.navItems.forEach(item => item.classList.remove("active"));

    this.views[viewName].classList.add("active");
    const activeNav = document.querySelector(`.bottom-nav .nav-item[data-view="${viewName}"]`);
    if (activeNav) activeNav.classList.add("active");

    this.currentView = viewName;
    this.refreshViewData(viewName);
  }

  async refreshViewData(viewName) {
    if (!this.currentStudent) return;
    const studentId = this.currentStudent.id;

    switch (viewName) {
      case "student-dashboard":
        await this.loadDashboardData();
        break;
      case "student-attendance":
        await this.loadAttendanceHistory();
        break;
      case "student-marks":
        await this.loadMarksList();
        break;
      case "student-fees":
        await this.loadFeesList();
        break;
    }
    lucide.createIcons();
  }

  /* ---------------- DASHBOARD ---------------- */
  async loadDashboardData() {
    const studentId = this.currentStudent.id;
    
    // Attendance Stats
    let totalClasses = 0;
    let presentClasses = 0;
    const recentAttList = [];

    // Scan localStorage for attendance dates
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('att_')) {
        const dateStr = key.replace('att_', '');
        try {
          const records = JSON.parse(localStorage.getItem(key)) || {};
          if (records.__leaveDay === true) {
            continue; // Skip leave days
          }
          if (records[studentId]) {
            totalClasses++;
            const status = records[studentId];
            if (status === "P") presentClasses++;
            recentAttList.push({ date: dateStr, status });
          }
        } catch (e) {
          console.error("Error parsing local attendance record:", e);
        }
      }
    }

    recentAttList.sort((a, b) => new Date(b.date) - new Date(a.date));

    const attPct = totalClasses > 0 ? Math.round((presentClasses / totalClasses) * 100) : 100;
    document.getElementById("stat-student-attendance").textContent = `${attPct}%`;

    const recentDiv = document.getElementById("dash-recent-attendance-list");
    recentDiv.innerHTML = "";

    if (recentAttList.length === 0) {
      recentDiv.innerHTML = `<p style="color: var(--text-muted); font-style: italic;">No attendance recorded yet.</p>`;
    } else {
      const sliced = recentAttList.slice(0, 3);
      sliced.forEach(item => {
        const div = document.createElement("div");
        div.className = `attendance-day-card ${item.status === 'P' ? 'present' : 'absent'}`;
        div.style.marginBottom = "6px";
        div.innerHTML = `
          <span>📅 ${item.date}</span>
          <span class="badge-status ${item.status === 'P' ? 'paid' : 'due'}">${item.status === 'P' ? 'PRESENT' : 'ABSENT'}</span>
        `;
        recentDiv.appendChild(div);
      });
    }

    // Fee Status Badge
    const payments = await db.getStudentPayments(studentId);
    const currentMonth = "July 2026";
    const currentFee = payments[currentMonth] || { status: 'due' };

    const feeBadgeEl = document.getElementById("stat-student-fee-badge");
    if (currentFee.status === 'paid') {
      feeBadgeEl.innerHTML = `<span class="badge-status paid">PAID</span>`;
    } else if (currentFee.status === 'partial') {
      feeBadgeEl.innerHTML = `<span class="badge-status partial">PARTIAL</span>`;
    } else {
      feeBadgeEl.innerHTML = `<span class="badge-status due">DUE</span>`;
    }

    // Latest Test Score
    const tests = await db.getAllTests();
    const latestTestDiv = document.getElementById("dash-latest-test-info");
    latestTestDiv.innerHTML = "";

    if (tests.length === 0) {
      latestTestDiv.innerHTML = `<p style="color: var(--text-muted); font-style: italic;">No test results published yet.</p>`;
    } else {
      const latestTest = tests[0];
      const marks = await db.getTestMarks(latestTest.testId, latestTest.subject);
      const studentScore = marks[studentId] || { present: true, marks: "--", cetMarks: "", theoryMarks: "", totalMarks: "" };
      
      const isPresent = studentScore.present !== false;
      const totalScore = isPresent ? (studentScore.totalMarks !== undefined ? studentScore.totalMarks : (studentScore.marks || "--")) : "AB";
      
      let splitDetails = "";
      if (isPresent && studentScore.cetMarks !== undefined && studentScore.cetMarks !== "") {
        splitDetails = `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">CET: ${studentScore.cetMarks} | Theory: ${studentScore.theoryMarks}</div>`;
      }

      latestTestDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <div>
            <strong style="color: var(--text-main); display: block; font-size: 1rem;">${latestTest.testId} (${latestTest.subject})</strong>
            <span style="font-size: 0.8rem; color: var(--text-muted);">Date: ${latestTest.date || 'N/A'}</span>
            ${splitDetails}
          </div>
          <div style="font-size: 1.4rem; font-weight: 800; color: var(--student-accent-hover);">
            ${totalScore}
          </div>
        </div>
      `;
    }
  }

  /* ---------------- ATTENDANCE HISTORY ---------------- */
  async loadAttendanceHistory() {
    const studentId = this.currentStudent.id;
    const container = document.getElementById("student-attendance-history-container");
    container.innerHTML = "";

    const list = [];
    let presentCount = 0;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('att_')) {
        const dateStr = key.replace('att_', '');
        try {
          const records = JSON.parse(localStorage.getItem(key)) || {};
          if (records.__leaveDay === true) {
            continue; // Skip leave days
          }
          if (records[studentId]) {
            const status = records[studentId];
            if (status === "P") presentCount++;
            list.push({ date: dateStr, status });
          }
        } catch (e) {
          console.error("Error parsing local attendance record:", e);
        }
      }
    }

    list.sort((a, b) => new Date(b.date) - new Date(a.date));

    document.getElementById("student-attendance-summary-badge").textContent = `${presentCount} / ${list.length} Present`;

    if (list.length === 0) {
      container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 20px;">No attendance records found.</p>`;
      return;
    }

    list.forEach(item => {
      const div = document.createElement("div");
      div.className = `attendance-day-card ${item.status === 'P' ? 'present' : 'absent'}`;
      div.innerHTML = `
        <div>
          <span style="font-weight: 600; display: block;">${item.date}</span>
          <span style="font-size: 0.75rem; color: var(--text-muted);">Galaxy Academy Daily Log</span>
        </div>
        <span class="badge-status ${item.status === 'P' ? 'paid' : 'due'}">
          ${item.status === 'P' ? '✅ PRESENT' : '❌ ABSENT'}
        </span>
      `;
      container.appendChild(div);
    });
  }

  /* ---------------- MARKS LIST ---------------- */
  async loadMarksList() {
    const studentId = this.currentStudent.id;
    const container = document.getElementById("student-marks-list-container");
    container.innerHTML = "";

    const tests = await db.getAllTests();

    if (tests.length === 0) {
      container.innerHTML = `<div class="card"><p style="text-align: center; color: var(--text-muted); padding: 20px;">No tests recorded yet.</p></div>`;
      return;
    }

    for (const test of tests) {
      const scores = await db.getTestMarks(test.testId, test.subject);
      const studentData = scores[studentId] || { present: true, cetMarks: "", theoryMarks: "", totalMarks: "", marks: "--" };
      
      const isPresent = studentData.present !== false;
      const scoreVal = isPresent ? (studentData.totalMarks !== undefined ? studentData.totalMarks : (studentData.marks || "--")) : "AB";

      // Calculate class average
      let total = 0, count = 0;
      Object.values(scores).forEach(sc => {
        const scIsPresent = sc.present !== false;
        const scMarks = scIsPresent ? (sc.totalMarks !== undefined ? sc.totalMarks : sc.marks) : "AB";
        if (scIsPresent && scMarks !== "AB" && scMarks !== "" && scMarks !== undefined) {
          const num = parseFloat(scMarks);
          if (!isNaN(num)) { total += num; count++; }
        }
      });
      const avg = count > 0 ? (total / count).toFixed(1) : "--";

      let splitDetails = "";
      if (isPresent && studentData.cetMarks !== undefined && studentData.cetMarks !== "") {
        splitDetails = `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">CET: ${studentData.cetMarks} | Theory: ${studentData.theoryMarks}</div>`;
      }

      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div>
            <h3 style="margin: 0; font-size: 1.1rem; color: var(--text-main);">${test.testId} — ${test.subject}</h3>
            <span style="font-size: 0.8rem; color: var(--text-muted);">Test Date: ${test.date || 'N/A'}</span>
            ${splitDetails}
          </div>
          <div style="text-align: right;">
            <div style="font-size: 1.4rem; font-weight: 800; color: ${scoreVal === 'AB' ? 'var(--status-due)' : 'var(--student-accent-hover)'};">
              ${scoreVal}
            </div>
            <span style="font-size: 0.75rem; color: var(--text-muted);">Class Avg: ${avg}</span>
          </div>
        </div>
      `;
      container.appendChild(card);
    }
  }

  /* ---------------- FEES LIST ---------------- */
  async loadFeesList() {
    const studentId = this.currentStudent.id;
    const container = document.getElementById("student-fees-list-container");
    container.innerHTML = "";

    const months = ["July 2026", "August 2026", "September 2026", "October 2026", "November 2026", "December 2026"];
    const payments = await db.getStudentPayments(studentId);

    months.forEach(month => {
      const record = payments[month] || { status: 'due', amount: '', notes: '' };
      const statusClass = record.status === 'paid' ? 'paid' : (record.status === 'partial' ? 'partial' : 'due');
      const statusLabel = record.status === 'paid' ? 'PAID ✅' : (record.status === 'partial' ? 'PARTIAL 🟡' : 'FEE DUE 🔴');

      const card = document.createElement("div");
      card.className = "fee-card";
      card.innerHTML = `
        <div class="fee-card-info">
          <h4>${month} Tuition Fee</h4>
          <p>${record.amount ? 'Amount: ₹' + record.amount : 'Monthly Coaching Fee'}${record.notes ? ' • ' + record.notes : ''}</p>
        </div>
        <span class="badge-status ${statusClass}">${statusLabel}</span>
      `;
      container.appendChild(card);
    });
  }

  /* ---------------- EVENT LISTENERS ---------------- */
  initEventListeners() {
    // Navigation
    this.navItems.forEach(item => {
      item.addEventListener("click", () => {
        const view = item.getAttribute("data-view");
        this.switchView(view);
      });
    });

    // Login Form Submit
    document.getElementById("student-login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = document.getElementById("student-id-input").value.trim();
      const pass = document.getElementById("student-password-input").value.trim();

      const result = await db.verifyStudentLogin(id, pass);
      if (result.success) {
        this.loginSuccess(result.student);
        this.showToast(`Welcome back, ${result.student.name}!`);
      } else {
        this.showToast(result.message || "Invalid Student ID or password.", "danger");
      }
    });

    // Logout
    document.getElementById("student-logout-btn").addEventListener("click", () => {
      sessionStorage.removeItem("ga_student_logged_id");
      this.currentStudent = null;
      this.showLoginScreen();
      this.showToast("Logged out successfully.");
    });

    // Change Password Modal Controls
    const changePassModal = document.getElementById("change-pass-modal");
    document.getElementById("open-change-pass-btn").addEventListener("click", () => {
      document.getElementById("change-pass-form").reset();
      changePassModal.classList.add("active");
    });
    document.getElementById("change-pass-modal-close").addEventListener("click", () => {
      changePassModal.classList.remove("active");
    });
    document.getElementById("change-pass-cancel").addEventListener("click", () => {
      changePassModal.classList.remove("active");
    });

    document.getElementById("change-pass-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!this.currentStudent) return;

      const oldPass = document.getElementById("old-pass-field").value.trim();
      const newPass = document.getElementById("new-pass-field").value.trim();
      const confirmPass = document.getElementById("confirm-pass-field").value.trim();

      if (newPass !== confirmPass) {
        this.showToast("New passwords do not match.", "danger");
        return;
      }

      if (newPass.length < 4) {
        this.showToast("Password must be at least 4 characters long.", "danger");
        return;
      }

      const res = await db.changeStudentPassword(this.currentStudent.id, oldPass, newPass);
      if (res.success) {
        changePassModal.classList.remove("active");
        this.showToast(res.message, "success");
      } else {
        this.showToast(res.message, "danger");
      }
    });
  }
}

// Instantiate student app
const studentApp = new StudentPortalController();
window.studentApp = studentApp;

document.addEventListener("DOMContentLoaded", async () => {
  await db.ready; // Wait for Firebase config to load from server
  studentApp.init();
});
