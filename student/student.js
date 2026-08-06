import { db } from "../js/db.js";

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

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
    try {
      const session = await db.getSession();
      if (session.user?.role === 'student' && session.user.student) {
        this.loginSuccess(session.user.student);
        return;
      }
    } catch (error) {
      // A missing or expired cookie is the normal logged-out state.
    }
    this.showLoginScreen();
  }

  showLoginScreen() {
    document.getElementById("student-login-overlay").style.display = "flex";
  }

  hideLoginScreen() {
    document.getElementById("student-login-overlay").style.display = "none";
  }

  loginSuccess(student, mustChangePassword = false) {
    this.currentStudent = student;
    this.hideLoginScreen();
    document.getElementById("display-student-name").textContent = student.name;
    document.getElementById("dash-welcome-name").textContent = student.name.split(" ")[0];
    document.getElementById("display-student-id").textContent = `#${student.id}`;
    document.getElementById("display-student-comb").textContent = student.combination || "PU";
    document.getElementById("student-avatar-initials").textContent = student.name.charAt(0).toUpperCase();
    this.switchView("student-dashboard");

    if (mustChangePassword) {
      this.showToast("Please replace your temporary password now.", "info");
      document.getElementById("change-pass-form").reset();
      document.getElementById("change-pass-modal").classList.add("active");
    }
  }

  showToast(message, type = "success") {
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    const text = document.createElement("span");
    text.textContent = message;
    const close = document.createElement("i");
    close.setAttribute("data-lucide", "x");
    close.style.cssText = "width:16px; height:16px; cursor:pointer;";
    close.addEventListener("click", () => toast.remove());
    toast.append(text, close);
    this.toastContainer.appendChild(toast);
    lucide.createIcons();
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  switchView(viewName) {
    if (!this.views[viewName] || !this.currentStudent) return;
    Object.values(this.views).forEach(view => view.classList.remove("active"));
    this.navItems.forEach(item => item.classList.remove("active"));
    this.views[viewName].classList.add("active");
    document.querySelector(`.bottom-nav .nav-item[data-view="${viewName}"]`)?.classList.add("active");
    this.currentView = viewName;
    this.refreshViewData(viewName);
  }

  async refreshViewData(viewName) {
    try {
      if (viewName === "student-dashboard") await this.loadDashboardData();
      if (viewName === "student-attendance") await this.loadAttendanceHistory();
      if (viewName === "student-marks") await this.loadMarksList();
      if (viewName === "student-fees") await this.loadFeesList();
      lucide.createIcons();
    } catch (error) {
      if (error.status === 401) this.showLoginScreen();
      this.showToast(error.message || "Unable to load your data.", "danger");
    }
  }

  async loadDashboardData() {
    const [attendance, payments, tests] = await Promise.all([
      db.getStudentAttendance(), db.getStudentPayments(), db.getStudentTests()
    ]);
    const presentClasses = attendance.filter(item => item.status === 'P').length;
    const percentage = attendance.length ? Math.round((presentClasses / attendance.length) * 100) : 100;
    document.getElementById("stat-student-attendance").textContent = `${percentage}%`;

    const recentDiv = document.getElementById("dash-recent-attendance-list");
    recentDiv.innerHTML = attendance.length
      ? attendance.slice(0, 3).map(item => `
          <div class="attendance-day-card ${item.status === 'P' ? 'present' : 'absent'}" style="margin-bottom: 6px;">
            <span>📅 ${escapeHtml(item.date)}</span>
            <span class="badge-status ${item.status === 'P' ? 'paid' : 'due'}">${item.status === 'P' ? 'PRESENT' : 'ABSENT'}</span>
          </div>`).join('')
      : '<p style="color: var(--text-muted); font-style: italic;">No attendance recorded yet.</p>';

    const currentMonth = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(new Date());
    const currentFee = payments[currentMonth] || { status: 'due' };
    const feeBadge = currentFee.status === 'paid' ? 'paid' : currentFee.status === 'partial' ? 'partial' : 'due';
    document.getElementById("stat-student-fee-badge").innerHTML = `<span class="badge-status ${feeBadge}">${feeBadge.toUpperCase()}</span>`;

    const latestTestDiv = document.getElementById("dash-latest-test-info");
    if (!tests.length) {
      latestTestDiv.innerHTML = '<p style="color: var(--text-muted); font-style: italic;">No test results published yet.</p>';
      return;
    }
    const latest = tests[0];
    const score = latest.studentScore;
    const total = score.present === false ? 'AB' : (score.totalMarks || score.marks || '--');
    const split = score.present !== false && score.cetMarks !== ''
      ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">CET: ${escapeHtml(score.cetMarks)} | Theory: ${escapeHtml(score.theoryMarks)}</div>` : '';
    latestTestDiv.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
        <div>
          <strong style="color: var(--text-main); display: block; font-size: 1rem;">${escapeHtml(latest.testId)} (${escapeHtml(latest.subject)})</strong>
          <span style="font-size: 0.8rem; color: var(--text-muted);">Date: ${escapeHtml(latest.date || 'N/A')}</span>${split}
        </div>
        <div style="font-size: 1.4rem; font-weight: 800; color: var(--student-accent-hover);">${escapeHtml(total)}</div>
      </div>`;
  }

  async loadAttendanceHistory() {
    const container = document.getElementById("student-attendance-history-container");
    const attendance = await db.getStudentAttendance();
    const presentCount = attendance.filter(item => item.status === 'P').length;
    document.getElementById("student-attendance-summary-badge").textContent = `${presentCount} / ${attendance.length} Present`;
    container.innerHTML = attendance.length ? attendance.map(item => `
      <div class="attendance-day-card ${item.status === 'P' ? 'present' : 'absent'}">
        <div><span style="font-weight: 600; display: block;">${escapeHtml(item.date)}</span><span style="font-size: 0.75rem; color: var(--text-muted);">Galaxy Academy Daily Log</span></div>
        <span class="badge-status ${item.status === 'P' ? 'paid' : 'due'}">${item.status === 'P' ? '✅ PRESENT' : '❌ ABSENT'}</span>
      </div>`).join('') : '<p style="text-align: center; color: var(--text-muted); padding: 20px;">No attendance records found.</p>';
  }

  async loadMarksList() {
    const container = document.getElementById("student-marks-list-container");
    const tests = await db.getStudentTests();
    if (!tests.length) {
      container.innerHTML = '<div class="card"><p style="text-align: center; color: var(--text-muted); padding: 20px;">No tests recorded yet.</p></div>';
      return;
    }
    container.innerHTML = tests.map(test => {
      const score = test.studentScore;
      const total = score.present === false ? 'AB' : (score.totalMarks || score.marks || '--');
      const split = score.present !== false && score.cetMarks !== ''
        ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">CET: ${escapeHtml(score.cetMarks)} | Theory: ${escapeHtml(score.theoryMarks)}</div>` : '';
      return `
        <div class="card">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div><h3 style="margin: 0; font-size: 1.1rem; color: var(--text-main);">${escapeHtml(test.testId)} — ${escapeHtml(test.subject)}</h3><span style="font-size: 0.8rem; color: var(--text-muted);">Test Date: ${escapeHtml(test.date || 'N/A')}</span>${split}</div>
            <div style="text-align: right;"><div style="font-size: 1.4rem; font-weight: 800; color: ${total === 'AB' ? 'var(--status-due)' : 'var(--student-accent-hover)'};">${escapeHtml(total)}</div><span style="font-size: 0.75rem; color: var(--text-muted);">Class Avg: ${test.classAverage ?? '--'}</span></div>
          </div>
        </div>`;
    }).join('');
  }

  async loadFeesList() {
    const container = document.getElementById("student-fees-list-container");
    const payments = await db.getStudentPayments();
    const formatter = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });
    const today = new Date();
    const months = Array.from({ length: 6 }, (_, offset) => formatter.format(new Date(today.getFullYear(), today.getMonth() + offset, 1)));
    container.innerHTML = months.map(month => {
      const record = payments[month] || { status: 'due', amount: '', notes: '' };
      const statusClass = record.status === 'paid' ? 'paid' : record.status === 'partial' ? 'partial' : 'due';
      const statusLabel = record.status === 'paid' ? 'PAID ✅' : record.status === 'partial' ? 'PARTIAL 🟡' : 'FEE DUE 🔴';
      return `<div class="fee-card"><div class="fee-card-info"><h4>${escapeHtml(month)} Tuition Fee</h4><p>${record.amount ? `Amount: ₹${escapeHtml(record.amount)}` : 'Monthly Coaching Fee'}${record.notes ? ` • ${escapeHtml(record.notes)}` : ''}</p></div><span class="badge-status ${statusClass}">${statusLabel}</span></div>`;
    }).join('');
  }

  initEventListeners() {
    this.navItems.forEach(item => item.addEventListener("click", () => this.switchView(item.getAttribute("data-view"))));

    document.getElementById("student-login-form").addEventListener("submit", async event => {
      event.preventDefault();
      try {
        const id = document.getElementById("student-id-input").value.trim();
        const password = document.getElementById("student-password-input").value;
        const result = await db.studentLogin(id, password);
        this.loginSuccess(result.student, result.mustChangePassword);
        this.showToast(`Welcome back, ${result.student.name}!`);
      } catch (error) {
        this.showToast(error.message || "Invalid Student ID or password.", "danger");
      }
    });

    document.getElementById("student-logout-btn").addEventListener("click", async () => {
      try { await db.logout(); } catch (error) { console.warn('Logout request failed:', error); }
      this.currentStudent = null;
      this.showLoginScreen();
      this.showToast("Logged out successfully.");
    });

    const changePassModal = document.getElementById("change-pass-modal");
    document.getElementById("open-change-pass-btn").addEventListener("click", () => {
      document.getElementById("change-pass-form").reset();
      changePassModal.classList.add("active");
    });
    document.getElementById("change-pass-modal-close").addEventListener("click", () => changePassModal.classList.remove("active"));
    document.getElementById("change-pass-cancel").addEventListener("click", () => changePassModal.classList.remove("active"));
    document.getElementById("change-pass-form").addEventListener("submit", async event => {
      event.preventDefault();
      const oldPassword = document.getElementById("old-pass-field").value;
      const newPassword = document.getElementById("new-pass-field").value;
      const confirmation = document.getElementById("confirm-pass-field").value;
      if (newPassword !== confirmation) return this.showToast("New passwords do not match.", "danger");
      if (newPassword.length < 12) return this.showToast("Password must be at least 12 characters.", "danger");
      try {
        const result = await db.changeStudentPassword(oldPassword, newPassword);
        changePassModal.classList.remove("active");
        this.showToast(result.message || "Password updated successfully.");
      } catch (error) {
        this.showToast(error.message || "Password update failed.", "danger");
      }
    });
  }
}

const studentApp = new StudentPortalController();

document.addEventListener("DOMContentLoaded", async () => {
  await db.ready;
  await studentApp.init();
});
