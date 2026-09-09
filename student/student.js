import { db } from "../js/db.js";

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));
}

function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let i = 0;
  while (size >= 1024 && i < units.length - 1) {
    size /= 1024;
    i++;
  }
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

class StudentPortalController {
  constructor() {
    this.currentStudent = null;
    this.currentView = "student-dashboard";
    this.views = {
      "student-dashboard": document.getElementById("student-dashboard-view"),
      "student-attendance": document.getElementById("student-attendance-view"),
      "student-marks": document.getElementById("student-marks-view"),
      "student-fees": document.getElementById("student-fees-view"),
      "student-resources": document.getElementById("student-resources-view")
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
    document.getElementById("display-student-id").textContent = `#${student.number || student.id}`;
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
      if (viewName === "student-resources") await this.loadResourcesList();
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

    const feeTotal = Number(payments.totalFee) || 65000;
    const feePaid = (payments.transactions || []).reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    document.getElementById("stat-student-fee-badge").innerHTML = `<span class="badge-status ${feePaid >= feeTotal ? 'paid' : 'due'}">${feePaid >= feeTotal ? 'PAID' : `DUE ₹${Math.max(feeTotal - feePaid, 0).toLocaleString('en-IN')}`}</span>`;

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

  async loadResourcesList() {
    const container = document.getElementById("student-resources-list-container");
    const resources = await db.getStudentResources();

    if (!resources || resources.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 40px 20px;">
          <i data-lucide="folder-open" style="width: 42px; height: 42px; color: var(--text-muted); margin-bottom: 10px;"></i>
          <h3 style="font-size: 1rem; color: var(--text-main); margin-bottom: 4px;">No Study Resources Available</h3>
          <p style="font-size: 0.8rem; color: var(--text-muted);">Notes and study materials uploaded by your teacher will appear here.</p>
        </div>`;
      return;
    }

    container.innerHTML = resources.map(item => {
      const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      const sizeStr = formatFileSize(item.sizeBytes);
      const isPdf = item.mimeType?.includes('pdf') || item.originalFileName?.toLowerCase().endsWith('.pdf');
      const iconName = isPdf ? 'file-text' : 'file';

      return `
        <div class="card" style="margin-bottom: 12px; border-left: 4px solid var(--student-accent); display: flex; justify-content: space-between; align-items: center; gap: 12px;">
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <i data-lucide="${iconName}" style="width: 18px; height: 18px; color: var(--student-accent); flex-shrink: 0;"></i>
              <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); margin: 0; word-break: break-word;">${escapeHtml(item.title)}</h4>
            </div>
            ${item.description ? `<p style="font-size: 0.82rem; color: var(--text-muted); margin: 0 0 6px 0; word-break: break-word;">${escapeHtml(item.description)}</p>` : ''}
            <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; gap: 12px; flex-wrap: wrap;">
              <span>📁 ${escapeHtml(item.originalFileName)}</span>
              <span>💾 ${sizeStr}</span>
              ${dateStr ? `<span>📅 ${dateStr}</span>` : ''}
            </div>
          </div>
          <a href="/api/student/resources/${encodeURIComponent(item.id)}/download" target="_blank" download class="btn btn-primary" style="padding: 8px 14px; font-size: 0.82rem; background-color: var(--student-accent); border-color: var(--student-accent); text-decoration: none; display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
            <i data-lucide="download" style="width: 14px; height: 14px;"></i> Download
          </a>
        </div>`;
    }).join('');
  }

  async loadFeesList() {
    const container = document.getElementById("student-fees-list-container");
    const payments = await db.getStudentPayments();
    const totalFee = Number(payments.totalFee) || 65000;
    const transactions = Array.isArray(payments.transactions) ? payments.transactions : [];
    const paid = transactions.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const due = Math.max(totalFee - paid, 0);
    container.innerHTML = `<div class="card" style="border-left:4px solid ${due ? 'var(--status-due)' : 'var(--status-paid)'}; margin-bottom:12px;"><div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px;"><div><small>Total fee</small><strong style="display:block;">₹${totalFee.toLocaleString('en-IN')}</strong></div><div><small>Received</small><strong style="display:block; color:var(--status-paid);">₹${paid.toLocaleString('en-IN')}</strong></div><div><small>Due</small><strong style="display:block; color:${due ? 'var(--status-due)' : 'var(--status-paid)'};">₹${due.toLocaleString('en-IN')}</strong></div></div></div>${transactions.length ? transactions.slice().sort((a,b) => String(b.date).localeCompare(String(a.date))).map(item => `<div class="fee-card"><div class="fee-card-info"><h4>Payment received</h4><p>Date: ${escapeHtml(item.date)}${item.note ? ` · ${escapeHtml(item.note)}` : ''}</p></div><strong style="color:var(--status-paid);">₹${(Number(item.amount) || 0).toLocaleString('en-IN')}</strong></div>`).join('') : '<p style="color:var(--text-muted);">No payment entries recorded yet.</p>'}`;
  }

  initEventListeners() {
    this.navItems.forEach(item => item.addEventListener("click", () => this.switchView(item.getAttribute("data-view"))));

    const previewEl = document.getElementById("student-login-preview");
    const updateLoginPreview = () => {
      if (!previewEl) return;
      const year = document.getElementById("student-year-input")?.value.trim();
      const grade = document.getElementById("student-grade-input")?.value;
      const batch = document.getElementById("student-batch-input")?.value.trim();
      const number = document.getElementById("student-number-input")?.value.trim();
      previewEl.textContent = (year && grade && batch && number)
        ? `${year}-${grade}-${batch}__${number}`
        : "year-grade-batch-number";
    };
    ["student-year-input", "student-grade-input", "student-batch-input", "student-number-input"]
      .forEach(id => document.getElementById(id)?.addEventListener("input", updateLoginPreview));
    updateLoginPreview();

    document.getElementById("student-login-form").addEventListener("submit", async event => {
      event.preventDefault();
      try {
        const legacyId = document.getElementById("student-id-input")?.value.trim();
        const password = document.getElementById("student-password-input").value;
        const year = document.getElementById("student-year-input")?.value.trim();
        const grade = document.getElementById("student-grade-input")?.value;
        const batchNumber = document.getElementById("student-batch-input")?.value.trim();
        const number = document.getElementById("student-number-input")?.value.trim();

        // Prefer the composed batch coordinates; fall back to the legacy Student
        // ID field for students that were created before batch isolation.
        const payload = { password };
        if (legacyId) {
          payload.studentId = legacyId;
        } else {
          if (!year || !grade || !batchNumber || !number) {
            throw new Error("Please fill in batch number, year, grade and student number.");
          }
          payload.year = year;
          payload.grade = grade;
          payload.batchNumber = batchNumber;
          payload.number = number;
        }

        const result = await db.studentLogin(payload);
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
