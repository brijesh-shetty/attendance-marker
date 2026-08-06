import { db } from "./db.js";

class AppController {
  constructor() {
    this.currentView = "dashboard";
    this.selectedTest = "Test 1";
    this.selectedSubject = "Maths";
    this.selectedSyllabusTest = "Test 1";
    this.editingStudentId = null;

    this.views = {
      dashboard: document.getElementById("dashboard-view"),
      students: document.getElementById("students-view"),
      attendance: document.getElementById("attendance-view"),
      tests: document.getElementById("tests-view"),
      payments: document.getElementById("payments-view"),
      broadcast: document.getElementById("broadcast-view")
    };

    this.navItems = document.querySelectorAll(".bottom-nav .nav-item");
    this.toastContainer = document.getElementById("toast-container");
    
    // Bind Event Listeners
    this.initEventListeners();
  }

  async init() {
    // Set default date picker to today in India Standard Time
    const today = this.getLocalDateString();
    document.getElementById("attendance-date-input").value = today;
    document.getElementById("test-date-input").value = today;

    // Initialize UI Components
    lucide.createIcons();

    // The server, not browser storage, decides whether this is an admin session.
    try {
      const session = await db.getSession();
      if (session.user?.role === "admin") {
        this.hideLoginScreen();
        await this.switchView("dashboard");
      } else {
        this.showLoginScreen();
      }
    } catch (error) {
      this.showLoginScreen();
    }

    // Register Service Worker for offline PWA support
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js')
        .then(reg => console.log('PWA Service Worker registered successfully:', reg.scope))
        .catch(err => console.error('PWA Service Worker registration failed:', err));
    }
  }

  showLoginScreen() {
    document.getElementById("login-overlay").style.display = "flex";
  }

  hideLoginScreen() {
    document.getElementById("login-overlay").style.display = "none";
  }

  // Get current date string in YYYY-MM-DD format
  getLocalDateString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Show customized alert notifications
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

  // Page Routing & Switching Tabs
  switchView(viewName) {
    if (!this.views[viewName]) return;
    
    // Deactivate current active states
    Object.values(this.views).forEach(view => view.classList.remove("active"));
    this.navItems.forEach(item => item.classList.remove("active"));

    // Activate selected states
    this.views[viewName].classList.add("active");
    const activeNav = document.querySelector(`.bottom-nav .nav-item[data-view="${viewName}"]`);
    if (activeNav) activeNav.classList.add("active");

    this.currentView = viewName;
    
    // Refresh page data
    this.refreshViewData(viewName);
  }

  async refreshViewData(viewName) {
    switch (viewName) {
      case "dashboard":
        await this.loadDashboardData();
        break;
      case "students":
        await this.loadStudentsList();
        break;
      case "attendance":
        await this.loadAttendanceSetup();
        break;
      case "payments":
        await this.loadPaymentsList();
        break;
      case "broadcast":
        document.getElementById("broadcast-message-input").value = "";
        break;
      case "tests":
        document.getElementById("test-setup-panel").style.display = "block";
        document.getElementById("test-sheet-panel").style.display = "none";
        if (!document.getElementById("test-date-input").value) {
          document.getElementById("test-date-input").value = this.getLocalDateString();
        }
        await this.loadTestSyllabus();
        await this.loadPreviousTests();
        break;
    }
    lucide.createIcons();
  }

  /* =========================================================================
     DASHBOARD VIEW
     ========================================================================= */
  async loadDashboardData() {
    const students = await db.getStudents();
    document.getElementById("stat-total-students").textContent = students.length;

    const today = this.getLocalDateString();
    const records = await db.getAttendance(today);
    
    const absenteesListDiv = document.getElementById("dashboard-absentees-list");
    absenteesListDiv.innerHTML = "";

    if (records && records.__leaveDay === true) {
      document.getElementById("stat-attendance-today").textContent = "Leave";
      absenteesListDiv.innerHTML = `<p style="color: #f59e0b; font-weight: 500;">Today is marked as a Leave Day! 🗓️</p>`;
      return;
    }

    const totalRecords = Object.keys(records).length;

    if (totalRecords > 0 && students.length > 0) {
      let presentCount = 0;
      let absentees = [];

      students.forEach(student => {
        const status = records[student.id];
        if (status === "P") {
          presentCount++;
        } else if (status === "A") {
          absentees.push(student.name);
        }
      });

      const percentage = Math.round((presentCount / students.length) * 100);
      document.getElementById("stat-attendance-today").textContent = `${percentage}%`;

      if (absentees.length > 0) {
        const ul = document.createElement("ul");
        ul.style.listStyleType = "none";
        ul.style.paddingLeft = "0";
        absentees.forEach(name => {
          const li = document.createElement("li");
          li.style.color = "var(--danger)";
          li.style.padding = "4px 0";
          li.innerHTML = `❌ ${name}`;
          ul.appendChild(li);
        });
        absenteesListDiv.appendChild(ul);
      } else {
        absenteesListDiv.innerHTML = `<p style="color: var(--success); font-weight: 500;">All students are marked Present today! ✅</p>`;
      }
    } else {
      document.getElementById("stat-attendance-today").textContent = "0%";
      absenteesListDiv.innerHTML = `<p style="color: var(--text-muted); font-style: italic;">No attendance submitted for today.</p>`;
    }
  }

  /* =========================================================================
     STUDENTS VIEW
     ========================================================================= */
  async loadStudentsList() {
    const students = await db.getStudents();
    const container = document.getElementById("students-list-container");
    container.innerHTML = "";

    const searchTerm = document.getElementById("student-search-input").value.toLowerCase();
    const filtered = students.filter(s => 
      s.name.toLowerCase().includes(searchTerm) || 
      s.id.toString().includes(searchTerm)
    );

    if (filtered.length === 0) {
      container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 20px;">No students found.</p>`;
      return;
    }

    filtered.forEach((student, idx) => {
      const div = document.createElement("div");
      div.className = "list-item";
      div.style.cursor = "pointer";
      div.innerHTML = `
        <div class="student-info" style="flex: 1;">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span class="student-name">${idx + 1}. ${student.name}</span>
            <span class="badge" style="font-size: 0.7rem; background-color: rgba(59, 130, 246, 0.2); color: var(--student-accent-hover); padding: 2px 6px; border-radius: 4px; font-weight: 700;">ID: #${student.id}</span>
            ${student.combination ? `<span class="badge" style="font-size: 0.7rem; background-color: rgba(139, 92, 246, 0.15); color: var(--primary-hover); padding: 2px 6px; border-radius: 4px; font-weight: 600; text-transform: uppercase;">${student.combination}</span>` : ''}
            ${student.college ? `<span class="badge" style="font-size: 0.7rem; background-color: rgba(255, 255, 255, 0.05); color: var(--text-muted); padding: 2px 6px; border-radius: 4px; font-weight: 500; text-transform: uppercase;">${student.college}</span>` : ''}
          </div>
          <span style="font-size: 0.75rem; color: var(--text-muted); display: block; margin-top: 4px;">📲 Parent / Default Password: ${student.phone || student.parentPhone || 'N/A'}</span>
        </div>
        <button class="btn btn-secondary btn-icon-only view-details-btn" data-id="${student.id}" style="padding: 6px;">
          <i data-lucide="eye" style="width: 16px; height: 16px;"></i>
        </button>
      `;
      div.addEventListener("click", () => {
        this.openStudentDetailsModal(student.id);
      });
      container.appendChild(div);
    });
  }

  openStudentModal(studentId = null) {
    this.editingStudentId = studentId;
    const modal = document.getElementById("student-modal");
    const title = document.getElementById("student-modal-title");
    const form = document.getElementById("student-form");

    if (studentId) {
      title.textContent = "Edit Student Profile";
      db.getStudents().then(students => {
        const student = students.find(s => s.id === studentId);
        if (student) {
          document.getElementById("student-id-field").value = student.id;
          document.getElementById("student-name-field").value = student.name;
          document.getElementById("student-combination-field").value = student.combination || "";
          document.getElementById("student-college-field").value = student.college || "";
          document.getElementById("student-phone-field").value = student.phone || "";
          document.getElementById("parent-phone-field").value = student.parentPhone || "";
        }
      });
    } else {
      title.textContent = "Register New Student";
      form.reset();
      document.getElementById("student-id-field").value = "";
    }
    modal.classList.add("active");
    lucide.createIcons();
  }

  async handleStudentSubmit(e) {
    e.preventDefault();
    let id = document.getElementById("student-id-field").value;
    const name = document.getElementById("student-name-field").value.trim();
    const combination = document.getElementById("student-combination-field").value;
    const college = document.getElementById("student-college-field").value.trim();
    const phone = document.getElementById("student-phone-field").value.trim();
    const parentPhone = document.getElementById("parent-phone-field").value.trim();

    if (!name) return;

    if (!id) {
      // Auto-assign sequential integer ID starting from 1
      const existingStudents = await db.getStudents();
      let maxId = 0;
      existingStudents.forEach(s => {
        const parsed = parseInt(s.id, 10);
        if (!isNaN(parsed) && parsed > maxId) maxId = parsed;
      });
      id = (maxId + 1).toString();
    }

    const studentData = { id, name, phone, parentPhone, combination, college };

    await db.saveStudent(studentData);
    document.getElementById("student-modal").classList.remove("active");
    this.showToast(`Student #${id} saved successfully! Default password: ${phone || parentPhone || '123456'}`);
    this.loadStudentsList();
  }

  async handleDeleteStudent(studentId) {
    const students = await db.getStudents();
    const student = students.find(s => s.id === studentId);
    const name = student ? student.name : "this student";
    if (confirm(`Are you sure you want to remove ${name}?`)) {
      if (confirm(`WARNING: This will permanently delete ${name} and all associated records. Press OK to proceed.`)) {
        await db.deleteStudent(studentId);
        this.showToast("Student deleted.", "danger");
        document.getElementById("student-details-modal").classList.remove("active");
        this.loadStudentsList();
      }
    }
  }

  openStudentDetailsModal(studentId) {
    const modal = document.getElementById("student-details-modal");
    db.getStudents().then(students => {
      const student = students.find(s => s.id.toString() === studentId.toString());
      if (student) {
        document.getElementById("detail-student-id").textContent = `#${student.id}`;
        document.getElementById("detail-student-name").textContent = student.name;
        document.getElementById("detail-student-combination").textContent = student.combination || "N/A";
        document.getElementById("detail-student-college").textContent = student.college || "N/A";
        document.getElementById("detail-parent-phone-1").textContent = student.phone || "N/A";
        document.getElementById("detail-parent-phone-2").textContent = student.parentPhone || "N/A";
        
        const editBtn = document.getElementById("detail-edit-btn");
        const deleteBtn = document.getElementById("detail-delete-btn");
        const resetPassBtn = document.getElementById("reset-password-btn");

        if (resetPassBtn) {
          const newResetBtn = resetPassBtn.cloneNode(true);
          resetPassBtn.parentNode.replaceChild(newResetBtn, resetPassBtn);
          newResetBtn.addEventListener("click", async () => {
            if (confirm(`Reset password for Student #${student.id} (${student.name}) to parent phone number (${student.phone || student.parentPhone || 'default'})?`)) {
              const res = await db.resetStudentPassword(student.id);
              this.showToast(res.message, "success");
            }
          });
        }
        
        const newEditBtn = editBtn.cloneNode(true);
        const newDeleteBtn = deleteBtn.cloneNode(true);
        editBtn.parentNode.replaceChild(newEditBtn, editBtn);
        deleteBtn.parentNode.replaceChild(newDeleteBtn, deleteBtn);
        
        newEditBtn.addEventListener("click", () => {
          modal.classList.remove("active");
          this.openStudentModal(studentId);
        });
        
        newDeleteBtn.addEventListener("click", () => {
          this.handleDeleteStudent(studentId);
        });
        
        modal.classList.add("active");
        lucide.createIcons();
      }
    });
  }

  /* =========================================================================
     ATTENDANCE VIEW
     ========================================================================= */
  async loadAttendanceSetup() {
    document.getElementById("attendance-setup-panel").style.display = "block";
    document.getElementById("attendance-sheet-panel").style.display = "none";

    const dateVal = document.getElementById("attendance-date-input").value;
    if (!dateVal) return;

    const students = await db.getStudents();
    const records = await db.getAttendance(dateVal);
    
    const isLeaveDay = records && records.__leaveDay === true;
    const startBtn = document.getElementById("attendance-start-btn");
    const leaveBtn = document.getElementById("attendance-leave-btn");
    const unleaveBtn = document.getElementById("attendance-unleave-btn");
    const leaveBanner = document.getElementById("attendance-leave-banner");
    const reportBox = document.getElementById("attendance-print-report");

    if (isLeaveDay) {
      if (leaveBanner) leaveBanner.style.display = "flex";
      if (startBtn) {
        startBtn.disabled = true;
        startBtn.innerHTML = `<i data-lucide="play"></i> Attendance Blocked (Leave Day)`;
      }
      if (leaveBtn) leaveBtn.style.display = "none";
      if (unleaveBtn) unleaveBtn.style.display = "block";
      if (reportBox) reportBox.style.display = "none";
    } else {
      if (leaveBanner) leaveBanner.style.display = "none";
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.innerHTML = `<i data-lucide="play"></i> Take / Edit Attendance`;
      }
      if (leaveBtn) leaveBtn.style.display = "block";
      if (unleaveBtn) unleaveBtn.style.display = "none";

      const hasRecords = Object.keys(records).length > 0;
      if (hasRecords) {
        this.renderAttendancePrintPreview(dateVal, students, records);
        if (reportBox) reportBox.style.display = "block";
      } else {
        if (reportBox) reportBox.style.display = "none";
      }
    }
    lucide.createIcons();
  }

  async loadAttendanceList() {
    const dateVal = document.getElementById("attendance-date-input").value;
    if (!dateVal) return;

    const students = await db.getStudents();
    const records = await db.getAttendance(dateVal);
    const container = document.getElementById("attendance-list-container");
    
    container.innerHTML = "";

    if (students.length === 0) {
      container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 20px;">Please register students first under the Students tab.</p>`;
      return;
    }

    students.forEach((student, idx) => {
      const isPresent = records[student.id] !== "A"; // default to Present if new/not specified
      const div = document.createElement("div");
      div.className = "attendance-row";
      div.innerHTML = `
        <div class="student-info">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <span class="student-name">${idx + 1}. ${student.name}</span>
            ${student.combination ? `<span class="badge" style="font-size: 0.7rem; background-color: rgba(139, 92, 246, 0.15); color: var(--primary-hover); padding: 2px 6px; border-radius: 4px; font-weight: 600; text-transform: uppercase;">${student.combination}</span>` : ''}
            ${student.college ? `<span class="badge" style="font-size: 0.7rem; background-color: rgba(255, 255, 255, 0.05); color: var(--text-muted); padding: 2px 6px; border-radius: 4px; font-weight: 500; text-transform: uppercase;">${student.college}</span>` : ''}
          </div>
        </div>
        <label class="switch">
          <input type="checkbox" class="attendance-checkbox" data-id="${student.id}" ${isPresent ? "checked" : ""}>
          <span class="slider"></span>
        </label>
      `;
      container.appendChild(div);
    });
  }

  async handleSaveAttendance() {
    const dateVal = document.getElementById("attendance-date-input").value;
    if (!dateVal) return;

    const checkboxes = document.querySelectorAll(".attendance-checkbox");
    const records = {};

    checkboxes.forEach(box => {
      const studentId = box.getAttribute("data-id");
      records[studentId] = box.checked ? "P" : "A";
    });

    await db.saveAttendance(dateVal, records);
    this.showToast(`Attendance recorded for ${dateVal}.`);
    
    // Exit to setup panel
    await this.loadAttendanceSetup();
  }

  async handleMarkLeaveDay() {
    const dateVal = document.getElementById("attendance-date-input").value;
    if (!dateVal) return;
    
    if (confirm(`Are you sure you want to mark ${dateVal} as a Leave Day? Existing attendance for this day will be overwritten.`)) {
      await db.saveAttendance(dateVal, { __leaveDay: true });
      this.showToast(`Date ${dateVal} marked as a Leave Day.`);
      await this.loadAttendanceSetup();
      await this.loadDashboardData();
    }
  }

  async handleUnmarkLeaveDay() {
    const dateVal = document.getElementById("attendance-date-input").value;
    if (!dateVal) return;
    
    if (confirm(`Are you sure you want to unmark ${dateVal} as a Leave Day?`)) {
      await db.saveAttendance(dateVal, {});
      this.showToast(`Leave day status removed for ${dateVal}.`);
      await this.loadAttendanceSetup();
      await this.loadDashboardData();
    }
  }

  async loadMonthlyAttendanceReport() {
    const monthSelect = document.getElementById("monthly-report-select");
    if (!monthSelect) return;
    const yearMonthStr = monthSelect.value; // YYYY-MM
    const [year, month] = yearMonthStr.split("-").map(Number);

    const students = await db.getStudents();
    const allAttendance = await db.getAllAttendanceForMonth(year, month);

    const reportResultsDiv = document.getElementById("monthly-report-results");
    const tbody = document.getElementById("monthly-report-tbody");
    
    if (!tbody || !reportResultsDiv) return;

    tbody.innerHTML = "";

    // Count how many classes were held (excluding leave days)
    let classesHeld = 0;
    const validDates = [];

    for (const [date, records] of Object.entries(allAttendance)) {
      if (records && records.__leaveDay !== true) {
        classesHeld++;
        validDates.push(date);
      }
    }

    if (students.length === 0) {
      this.showToast("Please register students first.", "danger");
      return;
    }

    if (classesHeld === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">No classes conducted in this month yet.</td></tr>`;
      reportResultsDiv.style.display = "block";
      return;
    }

    // Calculate per student attendance stats
    const reportData = [];
    let sumPercentages = 0;

    students.forEach((student, idx) => {
      let attendedCount = 0;
      validDates.forEach(date => {
        const records = allAttendance[date] || {};
        const status = records[student.id];
        if (status === "P" || (status === undefined && Object.keys(records).length > 0)) {
          attendedCount++;
        }
      });

      const percentage = classesHeld > 0 ? Math.round((attendedCount / classesHeld) * 100) : 0;
      sumPercentages += percentage;

      reportData.push({
        sNo: idx + 1,
        name: student.name,
        combination: student.combination || "",
        totalHeld: classesHeld,
        attended: attendedCount,
        percentage: percentage
      });
    });

    const classAverage = reportData.length > 0 ? Math.round(sumPercentages / reportData.length) : 0;

    // Render summary rows
    reportData.forEach(row => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="text-align: center;">${row.sNo}</td>
        <td>
          <strong>${row.name}</strong>
          ${row.combination ? `<span class="badge" style="font-size: 0.7rem; background-color: rgba(139, 92, 246, 0.15); color: var(--primary-hover); padding: 2px 6px; border-radius: 4px; font-weight: 600; margin-left: 6px;">${row.combination}</span>` : ""}
        </td>
        <td style="text-align: center;">${row.totalHeld}</td>
        <td style="text-align: center;">${row.attended}</td>
        <td style="text-align: center; font-weight: bold; color: ${row.percentage < 75 ? 'var(--danger)' : 'var(--success)'};">${row.percentage}%</td>
      `;
      tbody.appendChild(tr);
    });

    // Render footer average row
    const footerTr = document.createElement("tr");
    footerTr.style.backgroundColor = "rgba(255, 255, 255, 0.03)";
    footerTr.style.fontWeight = "bold";
    footerTr.innerHTML = `
      <td colspan="2" style="text-align: right; padding-right: 15px;">Class Average:</td>
      <td colspan="2" style="text-align: center;">${classesHeld} Days Conducted</td>
      <td style="text-align: center; color: var(--primary-hover); font-size: 1rem;">${classAverage}%</td>
    `;
    tbody.appendChild(footerTr);

    reportResultsDiv.style.display = "block";
    lucide.createIcons();
  }

  async printMonthlyAttendanceReport() {
    const monthSelect = document.getElementById("monthly-report-select");
    if (!monthSelect) return;
    const yearMonthStr = monthSelect.value;
    const [year, month] = yearMonthStr.split("-").map(Number);
    const monthName = monthSelect.options[monthSelect.selectedIndex].text;

    const students = await db.getStudents();
    const allAttendance = await db.getAllAttendanceForMonth(year, month);

    let classesHeld = 0;
    const validDates = [];
    for (const [date, records] of Object.entries(allAttendance)) {
      if (records && records.__leaveDay !== true) {
        classesHeld++;
        validDates.push(date);
      }
    }

    if (classesHeld === 0) {
      this.showToast("No classes to print for this month.", "info");
      return;
    }

    const reportData = [];
    let sumPercentages = 0;

    students.forEach((student, idx) => {
      let attendedCount = 0;
      validDates.forEach(date => {
        const records = allAttendance[date] || {};
        const status = records[student.id];
        if (status === "P" || (status === undefined && Object.keys(records).length > 0)) {
          attendedCount++;
        }
      });
      const percentage = classesHeld > 0 ? Math.round((attendedCount / classesHeld) * 100) : 0;
      sumPercentages += percentage;
      reportData.push({
        sNo: idx + 1,
        name: student.name,
        combination: student.combination || "",
        attended: attendedCount,
        percentage: percentage
      });
    });

    const classAverage = reportData.length > 0 ? Math.round(sumPercentages / reportData.length) : 0;

    const printRoot = document.getElementById("print-sheet-root");
    printRoot.innerHTML = `
      <div class="print-header">
        <h1>GALAXY ACADEMY</h1>
        <p class="address">ABOVE PUNJAB NATIONAL BANK, NEAR MANGALA KALYANA MANTAPA,<br>KORAMANGALA, BANGALORE -95 &nbsp;|&nbsp; PH: 8088761586, 63043 00052</p>
      </div>
      <div class="print-meta">
        <span>Report: <strong>Monthly Attendance Report</strong></span>
        <span>Month: <strong>${monthName}</strong></span>
        <span>Total Classes: <strong>${classesHeld}</strong></span>
      </div>
      <table class="print-table">
        <thead>
          <tr>
            <th style="width: 60px;" class="text-center">S.No.</th>
            <th>Student Name</th>
            <th style="width: 100px;" class="text-center">Classes Held</th>
            <th style="width: 100px;" class="text-center">Attended</th>
            <th style="width: 100px;" class="text-center">Percentage</th>
          </tr>
        </thead>
        <tbody>
          ${reportData.map(row => `
            <tr>
              <td class="text-center">${row.sNo}</td>
              <td>
                <strong>${row.name}</strong>
                ${row.combination ? `<span style="font-size: 0.8rem; color: #555; margin-left: 8px;">(${row.combination})</span>` : ''}
              </td>
              <td class="text-center">${classesHeld}</td>
              <td class="text-center">${row.attended}</td>
              <td class="text-center" style="font-weight: bold;">${row.percentage}%</td>
            </tr>
          `).join('')}
          <tr style="font-weight: bold; background-color: #f2f2f2 !important;">
            <td colspan="2" style="text-align: right; padding-right: 20px;">Class Average:</td>
            <td class="text-center">${classesHeld}</td>
            <td class="text-center">-</td>
            <td class="text-center" style="font-size: 11pt;">${classAverage}%</td>
          </tr>
        </tbody>
      </table>
    `;

    window.print();
  }

  async handleDownloadAbsentees() {
    const dateVal = document.getElementById("attendance-date-input").value;
    if (!dateVal) return;

    const students = await db.getStudents();
    const records = await db.getAttendance(dateVal);
    
    let absent = 0;
    const absentees = [];

    students.forEach(s => {
      if (records[s.id] === "A") {
        absent++;
        absentees.push(s);
      }
    });

    if (absentees.length === 0) {
      this.showToast("No absentees to download for this date!", "info");
      return;
    }

    // Format the text content cleanly - only the date and the list of absentee names
    let content = `Absentees list (${dateVal}):\n`;
    absentees.forEach((s, idx) => {
      let details = [];
      if (s.combination) details.push(s.combination);
      if (s.college) details.push(s.college);
      const detailStr = details.length > 0 ? ` (${details.join(', ')})` : '';
      content += `${idx + 1}. ${s.name}${detailStr}\n`;
    });

    try {
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `absentees_${dateVal}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.showToast("Absentees list downloaded successfully.");
    } catch (e) {
      console.error(e);
      this.showToast("Failed to download absentees list.", "danger");
    }
  }

  // Generates report values and binds print views
  renderAttendancePrintPreview(dateString, students, records) {
    const reportBox = document.getElementById("attendance-print-report");
    const reportDetails = document.getElementById("attendance-report-details");

    let present = 0;
    let absent = 0;
    const absentees = [];

    students.forEach(s => {
      if (records[s.id] === "A") {
        absent++;
        absentees.push(s.name);
      } else {
        present++;
      }
    });

    // If records are empty, hide the preview panel
    if (Object.keys(records).length === 0) {
      reportBox.style.display = "none";
      return;
    }

    reportBox.style.display = "block";
    reportDetails.innerHTML = `
      <p style="margin-bottom: 8px;"><strong>Date:</strong> ${dateString}</p>
      <p style="margin-bottom: 8px;"><strong>Summary:</strong> Total: ${students.length} | Present: <span style="color:var(--success);">${present}</span> | Absent: <span style="color:var(--danger);">${absent}</span></p>
      <p><strong>Absentees:</strong> ${absentees.length > 0 ? `<span style="color:var(--danger);">${absentees.join(", ")}</span>` : '<span style="color:var(--success);">None</span>'}</p>
    `;

    // Populate Print container for browser printing
    const printRoot = document.getElementById("print-sheet-root");
    printRoot.innerHTML = `
      <div class="print-header">
        <h1>GALAXY ACADEMY</h1>
        <h2>Daily Student Attendance Report</h2>
      </div>
      <div class="print-meta">
        <span>Date: ${dateString}</span>
        <span>Total Attendance: ${present} / ${students.length}</span>
      </div>
      <table class="print-table">
        <thead>
          <tr>
            <th style="width: 80px;" class="text-center">S.No.</th>
            <th>Student Name</th>
            <th style="width: 150px;" class="text-center">Status</th>
          </tr>
        </thead>
        <tbody>
          ${students.map((student, index) => {
            const status = records[student.id] === "A" ? "❌ ABSENT (AB)" : "✅ PRESENT";
            const statusClass = records[student.id] === "A" ? "text-danger" : "";
            return `
              <tr>
                <td class="text-center">${index + 1}</td>
                <td>
                  <strong>${student.name}</strong>
                  ${student.combination ? `<span style="font-size: 0.8rem; color: #555; margin-left: 8px;">(${student.combination})</span>` : ''}
                </td>
                <td class="text-center ${statusClass}">${status}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  /* =========================================================================
     TEST SERIES PORTAL
     ========================================================================= */
  async loadTestList() {
    const type = document.getElementById("test-type-select").value;
    const num = document.getElementById("test-num-input").value.trim();
    this.selectedTest = `${type} ${num}`;
    this.selectedSubject = document.getElementById("subject-select").value;

    const students = await db.getStudents();
    const scores = await db.getTestMarks(this.selectedTest, this.selectedSubject);
    const container = document.getElementById("test-students-list");
    
    container.innerHTML = "";

    // Show syllabus preview if exists
    const syllabus = await db.getSyllabus(this.selectedTest);
    const previewDiv = document.getElementById("test-syllabus-info-card");
    const previewText = document.getElementById("test-syllabus-preview-text");
    
    if (syllabus[this.selectedSubject]) {
      previewText.textContent = syllabus[this.selectedSubject];
      previewDiv.style.display = "block";
    } else {
      previewText.textContent = "Not filled yet. Fill topics in the Syllabus tab.";
      previewDiv.style.display = "block";
    }

    if (students.length === 0) {
      container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 20px;">Please register students under the Students tab.</p>`;
      return;
    }

    const meta = await db.getTestMetadata(this.selectedTest, this.selectedSubject);
    const cetTotal = meta.cetTotal !== undefined ? meta.cetTotal : 25;
    const theoryTotal = meta.theoryTotal !== undefined ? meta.theoryTotal : 25;
    const sumTotal = cetTotal + theoryTotal;

    // Update form header labels dynamically
    const headerCet = document.getElementById("header-cet-label");
    const headerTheory = document.getElementById("header-theory-label");
    const headerTotal = document.getElementById("header-total-label");
    if (headerCet) headerCet.textContent = `CET /${cetTotal}`;
    if (headerTheory) headerTheory.textContent = `Theory /${theoryTotal}`;
    if (headerTotal) headerTotal.textContent = `Total /${sumTotal}`;

    students.forEach((student, idx) => {
      const studentScoreData = scores[student.id] || { present: true, cetMarks: "", theoryMarks: "", totalMarks: "", marks: "" };
      const isPresent = studentScoreData.present !== false;
      
      let cetVal = studentScoreData.cetMarks !== undefined ? studentScoreData.cetMarks : "";
      let theoryVal = studentScoreData.theoryMarks !== undefined ? studentScoreData.theoryMarks : "";
      let totalVal = studentScoreData.totalMarks !== undefined ? studentScoreData.totalMarks : (studentScoreData.marks || "");

      const div = document.createElement("div");
      div.className = "marks-split-row";
      div.style.alignItems = "center";
      div.innerHTML = `
        <div class="student-info" style="padding-left: 4px;">
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span class="student-name" style="font-weight: 600;">${idx + 1}. ${student.name}</span>
            ${student.combination ? `<span class="badge" style="font-size: 0.7rem; background-color: rgba(139, 92, 246, 0.15); color: var(--primary-hover); padding: 2px 6px; border-radius: 4px; font-weight: 600; text-transform: uppercase;">${student.combination}</span>` : ''}
          </div>
        </div>
        <div style="display: flex; justify-content: center;">
          <label class="switch">
            <input type="checkbox" class="test-attendance-checkbox" data-id="${student.id}" ${isPresent ? "checked" : ""}>
            <span class="slider"></span>
          </label>
        </div>
        <div>
          <input type="text" class="score-split-input test-cet-marks-field" data-id="${student.id}" 
                 value="${isPresent ? cetVal : 'AB'}" 
                 placeholder="--" 
                 maxlength="3" 
                 ${isPresent ? "" : "disabled"}>
        </div>
        <div>
          <input type="text" class="score-split-input test-theory-marks-field" data-id="${student.id}" 
                 value="${isPresent ? theoryVal : 'AB'}" 
                 placeholder="--" 
                 maxlength="3" 
                 ${isPresent ? "" : "disabled"}>
        </div>
        <div>
          <input type="text" class="score-split-input test-total-marks-field" data-id="${student.id}" 
                 value="${isPresent ? totalVal : 'AB'}" 
                 placeholder="--" 
                 disabled style="font-weight: bold; background-color: rgba(255, 255, 255, 0.05);">
        </div>
      `;
      container.appendChild(div);
    });

    const updateRowTotal = (studentId) => {
      const cetInput = container.querySelector(`.test-cet-marks-field[data-id="${studentId}"]`);
      const theoryInput = container.querySelector(`.test-theory-marks-field[data-id="${studentId}"]`);
      const totalInput = container.querySelector(`.test-total-marks-field[data-id="${studentId}"]`);
      
      if (cetInput.disabled) {
        totalInput.value = "AB";
        return;
      }
      
      const cet = parseFloat(cetInput.value.trim());
      const theory = parseFloat(theoryInput.value.trim());
      
      let total = "";
      if (!isNaN(cet) && !isNaN(theory)) {
        total = cet + theory;
      } else if (!isNaN(cet)) {
        total = cet;
      } else if (!isNaN(theory)) {
        total = theory;
      }
      totalInput.value = total;
    };

    // Attach listeners to test attendance switches to disable/enable marks text fields
    container.querySelectorAll(".test-attendance-checkbox").forEach(box => {
      box.addEventListener("change", (e) => {
        const studentId = e.target.getAttribute("data-id");
        const cetInput = container.querySelector(`.test-cet-marks-field[data-id="${studentId}"]`);
        const theoryInput = container.querySelector(`.test-theory-marks-field[data-id="${studentId}"]`);
        const totalInput = container.querySelector(`.test-total-marks-field[data-id="${studentId}"]`);
        if (e.target.checked) {
          cetInput.disabled = false;
          theoryInput.disabled = false;
          cetInput.value = "";
          theoryInput.value = "";
          totalInput.value = "";
        } else {
          cetInput.disabled = true;
          theoryInput.disabled = true;
          cetInput.value = "AB";
          theoryInput.value = "AB";
          totalInput.value = "AB";
        }
        this.calculateAverageScoreBadge();
      });
    });

    container.querySelectorAll(".test-cet-marks-field, .test-theory-marks-field").forEach(input => {
      input.addEventListener("input", (e) => {
        const studentId = e.target.getAttribute("data-id");
        updateRowTotal(studentId);
        this.calculateAverageScoreBadge();
      });
    });

    this.calculateAverageScoreBadge();
  }

  calculateAverageScoreBadge() {
    const totalFields = document.querySelectorAll(".test-total-marks-field");
    let totalScore = 0;
    let scoreCount = 0;

    totalFields.forEach(field => {
      if (field.value.trim() !== "" && field.value.trim() !== "AB") {
        const score = parseFloat(field.value.trim());
        if (!isNaN(score)) {
          totalScore += score;
          scoreCount++;
        }
      }
    });

    const badge = document.getElementById("test-average-badge");
    if (scoreCount > 0) {
      const avg = (totalScore / scoreCount).toFixed(1);
      badge.textContent = `Class Avg: ${avg}`;
      badge.style.display = "inline-block";
    } else {
      badge.style.display = "none";
    }
  }

  async handleSaveTestMarks() {
    const students = await db.getStudents();
    const results = {};
    const container = document.getElementById("test-students-list");

    students.forEach(student => {
      const checkbox = container.querySelector(`.test-attendance-checkbox[data-id="${student.id}"]`);
      const cetInput = container.querySelector(`.test-cet-marks-field[data-id="${student.id}"]`);
      const theoryInput = container.querySelector(`.test-theory-marks-field[data-id="${student.id}"]`);
      const totalInput = container.querySelector(`.test-total-marks-field[data-id="${student.id}"]`);
      
      const isPresent = checkbox ? checkbox.checked : true;
      const cetVal = cetInput ? cetInput.value.trim() : "";
      const theoryVal = theoryInput ? theoryInput.value.trim() : "";
      const totalVal = totalInput ? totalInput.value.trim() : "";

      results[student.id] = {
        present: isPresent,
        cetMarks: isPresent ? cetVal : "AB",
        theoryMarks: isPresent ? theoryVal : "AB",
        totalMarks: isPresent ? totalVal : "AB",
        marks: isPresent ? totalVal : "AB"
      };
    });

    const type = document.getElementById("test-type-select").value;
    const num = document.getElementById("test-num-input").value.trim();
    const date = document.getElementById("test-date-input").value;
    
    const cetTotal = Number(document.getElementById("test-cet-total").value) || 25;
    const theoryTotal = Number(document.getElementById("test-theory-total").value) || 25;

    const meta = {
      testType: type,
      testNumber: num,
      date: date,
      cetTotal: cetTotal,
      theoryTotal: theoryTotal
    };

    await db.saveTestMarks(this.selectedTest, this.selectedSubject, results, meta);
    this.showToast(`Test marks successfully saved.`);
    this.calculateAverageScoreBadge();
    
    // Go back to setup panel
    document.getElementById("test-setup-panel").style.display = "block";
    document.getElementById("test-sheet-panel").style.display = "none";
    
    // Refresh history list
    this.loadPreviousTests();
  }

  async printMarksSheet() {
    // Persist current UI fields through the protected server API first.
    await this.handleSaveTestMarks();

    const students = await db.getStudents();
    const scores = await db.getTestMarks(this.selectedTest, this.selectedSubject);
    const syllabus = await db.getSyllabus(this.selectedTest);
    const syllabusText = syllabus[this.selectedSubject] || "General Core Syllabus Modules";

    const meta = await db.getTestMetadata(this.selectedTest, this.selectedSubject);
    const cetTotal = meta.cetTotal !== undefined ? meta.cetTotal : 25;
    const theoryTotal = meta.theoryTotal !== undefined ? meta.theoryTotal : 25;
    const sumTotal = cetTotal + theoryTotal;

    let totalScore = 0;
    let scoreCount = 0;
    let highestScore = 0;
    const absentees = [];

    students.forEach(s => {
      const data = scores[s.id] || { present: true, totalMarks: "", marks: "" };
      const isPresent = data.present !== false;
      const totalVal = data.totalMarks !== undefined ? data.totalMarks : data.marks;
      
      if (!isPresent || totalVal === "AB") {
        absentees.push(s.name);
      } else if (totalVal !== undefined && totalVal !== "") {
        const score = parseFloat(totalVal);
        if (!isNaN(score)) {
          totalScore += score;
          scoreCount++;
          if (score > highestScore) highestScore = score;
        }
      }
    });

    const average = scoreCount > 0 ? (totalScore / scoreCount).toFixed(1) : "-";

    const printRoot = document.getElementById("print-sheet-root");
    printRoot.innerHTML = `
      <div class="print-header">
        <h1>GALAXY ACADEMY</h1>
        <p class="address">ABOVE PUNJAB NATIONAL BANK, NEAR MANGALA KALYANA MANTAPA,<br>KORAMANGALA, BANGALORE -95 &nbsp;|&nbsp; PH: 8088761586, 63043 00052</p>
      </div>
      <div class="print-meta">
        <span>Test Series: <strong>${this.selectedTest}</strong></span>
        <span>Subject: <strong>${this.selectedSubject}</strong></span>
        <span>Date Printed: ${this.getLocalDateString()}</span>
      </div>
      <div style="font-size:10pt; margin-bottom:15px; border-bottom:1px solid #eee; padding-bottom:8px;">
        <strong>Syllabus Coverage:</strong> ${syllabusText}
      </div>
      <table class="print-table">
        <thead>
          <tr>
            <th style="width: 60px;" class="text-center">S.No.</th>
            <th>Student Name</th>
            <th style="width: 100px;" class="text-center">CET /${cetTotal}</th>
            <th style="width: 100px;" class="text-center">Theory /${theoryTotal}</th>
            <th style="width: 100px;" class="text-center">Total /${sumTotal}</th>
          </tr>
        </thead>
        <tbody>
          ${students.map((student, index) => {
            const data = scores[student.id] || { present: true, cetMarks: "", theoryMarks: "", totalMarks: "", marks: "" };
            const isPresent = data.present !== false;
            
            let cetVal = isPresent ? (data.cetMarks !== undefined ? data.cetMarks : "") : "AB";
            let theoryVal = isPresent ? (data.theoryMarks !== undefined ? data.theoryMarks : "") : "AB";
            let totalVal = isPresent ? (data.totalMarks !== undefined ? data.totalMarks : (data.marks || "")) : "AB";
            
            const statusClass = !isPresent ? "text-danger" : "";

            return `
              <tr>
                <td class="text-center">${index + 1}</td>
                <td>
                  <strong>${student.name}</strong>
                  ${student.combination ? `<span style="font-size: 0.8rem; color: #555; margin-left: 8px;">(${student.combination})</span>` : ''}
                </td>
                <td class="text-center ${statusClass}">${cetVal}</td>
                <td class="text-center ${statusClass}">${theoryVal}</td>
                <td class="text-center ${statusClass}" style="font-weight: bold;">
                  ${totalVal}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    // Trigger printing dialog
    window.print();
  }

  async handleSendAbsenteesSMS() {
    const dateVal = document.getElementById("attendance-date-input").value;
    const subjectVal = document.getElementById("attendance-subject-select").value;
    const students = await db.getStudents();
    const records = await db.getAttendance(dateVal);
    
    const absentees = [];
    students.forEach(s => {
      if (records[s.id] === "A") {
        absentees.push(s);
      }
    });

    if (absentees.length === 0) {
      this.showToast("No absentees to send messages to today!", "info");
      return;
    }

    if (!confirm(`Are you sure you want to send WhatsApp notifications to the ${absentees.length} absent student(s)?`)) {
      return;
    }

    // Format date cleanly to DD/MM/YYYY
    const dateObj = new Date(dateVal);
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    const formattedDate = `${day}/${month}/${year}`;

    this.showToast(`Starting WhatsApp broadcast to ${absentees.length} parents...`);

    const absenteePayload = [];
    absentees.forEach(student => {
      const phone = student.phone || student.parentPhone;
      if (phone) {
        absenteePayload.push({
          phone: phone,
          studentName: student.name,
          subject: subjectVal,
          date: formattedDate
        });
      }
    });

    try {
      const response = await fetch('/api/notifications/whatsapp-broadcast', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ absentees: absenteePayload })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        this.showToast(`Successfully sent ${data.total} WhatsApp notification(s)!`, "success");
      } else {
        throw new Error(data.message || 'Failed to send broadcast');
      }
    } catch (err) {
      console.error("Failed to send WhatsApp broadcast:", err);
      this.showToast(`Failed to send WhatsApp notification. Check server console.`, "danger");
    }
  }

  async handleSendBroadcast() {
    this.showToast("General SMS broadcast is disabled until it is implemented as a protected server-side integration.", "info");
  }

  /* =========================================================================
     SYLLABUS PLANNER (INTEGRATED INTO TESTS VIEW)
     ========================================================================= */
  async loadTestSyllabus() {
    const type = document.getElementById("test-type-select").value;
    const num = document.getElementById("test-num-input").value.trim();
    const testId = `${type} ${num}`;
    const subject = document.getElementById("subject-select").value;
    const syllabus = await db.getSyllabus(testId);
    
    document.getElementById("test-syllabus-input").value = syllabus[subject] || "";

    // Load CET / Theory totals
    const meta = await db.getTestMetadata(testId, subject);
    const cetTotal = meta.cetTotal !== undefined ? meta.cetTotal : 25;
    const theoryTotal = meta.theoryTotal !== undefined ? meta.theoryTotal : 25;
    const cetTotalEl = document.getElementById("test-cet-total");
    const theoryTotalEl = document.getElementById("test-theory-total");
    const sumTotalEl = document.getElementById("test-sum-total");

    if (cetTotalEl) cetTotalEl.value = cetTotal;
    if (theoryTotalEl) theoryTotalEl.value = theoryTotal;
    if (sumTotalEl) sumTotalEl.value = cetTotal + theoryTotal;
  }

  async loadPreviousTests() {
    const container = document.getElementById("previous-tests-container");
    container.innerHTML = "";
    
    const tests = await db.getAllTests();
    if (tests.length === 0) {
      container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.85rem; font-style: italic; text-align: center; padding: 12px 0;">No tests recorded yet.</p>`;
      return;
    }
    
    tests.forEach(test => {
      const div = document.createElement("div");
      div.className = "history-item";
      
      const dateStr = test.date ? new Date(test.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'No Date';
      
      div.innerHTML = `
        <div class="history-meta">
          <span class="history-title">${test.testId}</span>
          <span class="history-subtitle">${test.subject} | ${dateStr}</span>
        </div>
        <i data-lucide="chevron-right" style="width: 16px; height: 16px; color: var(--text-muted);"></i>
      `;
      
      div.addEventListener("click", async () => {
        // Parse type and number
        const match = test.testId.match(/^([a-zA-Z\s]+)\s+(\d+)$/);
        if (match) {
          document.getElementById("test-type-select").value = match[1].trim();
          document.getElementById("test-num-input").value = match[2].trim();
        } else {
          document.getElementById("test-type-select").value = "Test";
          document.getElementById("test-num-input").value = test.testId.replace("Test ", "");
        }
        
        document.getElementById("test-date-input").value = test.date || "";
        document.getElementById("subject-select").value = test.subject;
        
        await this.loadTestSyllabus();
        
        // Navigate directly to editing
        this.selectedTest = test.testId;
        this.selectedSubject = test.subject;
        
        // Show sheet panel
        document.getElementById("test-active-label").textContent = `Test: ${this.selectedTest} | Subject: ${this.selectedSubject} | Date: ${test.date || 'N/A'}`;
        document.getElementById("test-setup-panel").style.display = "none";
        document.getElementById("test-sheet-panel").style.display = "block";
        this.loadTestList();
      });
      
      container.appendChild(div);
    });
    
    lucide.createIcons();
  }

  /* =========================================================================
     PAYMENTS MANAGER
     ========================================================================= */
  async loadPaymentsList() {
    const month = document.getElementById("payment-month-select").value;
    const filter = document.getElementById("payment-filter-status").value;
    const container = document.getElementById("payments-list-container");
    container.innerHTML = "";

    const students = await db.getStudents();

    if (students.length === 0) {
      container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 20px;">No students registered.</p>`;
      return;
    }

    const allPayments = await db.getPayments();

    students.forEach((student, idx) => {
      const studentPayments = allPayments[student.id] || {};
      const currentPay = studentPayments[month] || { status: 'due', amount: '', notes: '' };

      if (filter !== "all" && currentPay.status !== filter) {
        return;
      }

      const div = document.createElement("div");
      div.className = "card";
      div.style.marginBottom = "10px";
      div.style.padding = "14px";
      div.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div>
            <span style="font-weight: 700; font-size: 0.95rem;">${idx + 1}. ${student.name}</span>
            <span class="badge" style="font-size: 0.7rem; background-color: rgba(59, 130, 246, 0.2); color: var(--student-accent-hover); margin-left: 6px;">ID: #${student.id}</span>
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            <select class="select-field pay-status-select" data-id="${student.id}" style="padding: 4px 8px; font-size: 0.8rem; width: auto;">
              <option value="due" ${currentPay.status === 'due' ? 'selected' : ''}>🔴 DUE</option>
              <option value="paid" ${currentPay.status === 'paid' ? 'selected' : ''}>✅ PAID</option>
              <option value="partial" ${currentPay.status === 'partial' ? 'selected' : ''}>🟡 PARTIAL</option>
            </select>
          </div>
        </div>
      `;

      div.querySelector(".pay-status-select").addEventListener("change", async (e) => {
        const newStatus = e.target.value;
        await db.savePayment(student.id, month, newStatus);
        this.showToast(`Fee status for ${student.name} (${month}) updated to ${newStatus.toUpperCase()}`);
      });

      container.appendChild(div);
    });

    if (container.children.length === 0) {
      container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 16px;">No students match filter '${filter}'.</p>`;
    }
  }

  /* =========================================================================
     PORTAL SETTINGS
     ========================================================================= */
  openSettingsModal() {
    document.getElementById("settings-modal").classList.add("active");
    lucide.createIcons();
  }

  async handleSaveSettings() {
    document.getElementById("settings-modal").classList.remove("active");
    this.showToast("Server security settings are managed through Render environment variables.");
  }

  async handleDataExport() {
    try {
      const dataStr = await db.exportJSON();
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `galaxy_academy_backup_${this.getLocalDateString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      this.showToast("Backup exported.");
    } catch (e) {
      this.showToast("Backup export failed.", "danger");
    }
  }

  handleDataImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async event => {
      try {
        const result = await db.importJSON(event.target.result);
        this.showToast(result.message || "Backup imported successfully.");
        this.refreshViewData(this.currentView);
        document.getElementById("settings-modal").classList.remove("active");
      } catch (error) {
        this.showToast(error.message || "Backup import failed.", "danger");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  /* =========================================================================
     BIND EVENT HANDLERS
     ========================================================================= */
  initEventListeners() {
    // Bottom navigation clicks
    this.navItems.forEach(item => {
      item.addEventListener("click", () => {
        const view = item.getAttribute("data-view");
        this.switchView(view);
      });
    });
    document.getElementById("quick-attendance-btn").addEventListener("click", () => this.switchView("attendance"));
    document.getElementById("quick-tests-btn").addEventListener("click", () => this.switchView("tests"));
    document.getElementById("quick-payments-btn").addEventListener("click", () => this.switchView("payments"));

    // Login Screen Handlers
    document.getElementById("login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const inputVal = document.getElementById("login-passcode").value;
      try {
        await db.adminLogin(inputVal);
        this.hideLoginScreen();
        this.switchView("dashboard");
        document.getElementById("login-passcode").value = "";
        this.showToast("Login successful. Welcome admin!");
      } catch (err) {
        console.error("[Login] Error validating passcode:", err);
        this.showToast(err.message || "Login failed.", "danger");
      }
    });

    document.getElementById("lock-portal-btn").addEventListener("click", async () => {
      try {
        await db.logout();
      } catch (err) {
        console.warn("Logout request failed:", err);
      }
      this.showLoginScreen();
      this.showToast("Logged out & locked portal successfully.");
    });

    // Settings Modal controls
    document.getElementById("open-settings-btn").addEventListener("click", () => this.openSettingsModal());
    document.getElementById("settings-modal-close").addEventListener("click", () => {
      document.getElementById("settings-modal").classList.remove("active");
    });
    document.getElementById("settings-cancel-btn").addEventListener("click", () => {
      document.getElementById("settings-modal").classList.remove("active");
    });
    document.getElementById("settings-save-btn").addEventListener("click", () => this.handleSaveSettings());

    // Backup & Restore settings controls
    document.getElementById("export-backup-btn").addEventListener("click", () => this.handleDataExport());
    document.getElementById("import-backup-trigger").addEventListener("click", () => document.getElementById("import-backup-file").click());
    document.getElementById("import-backup-file").addEventListener("change", event => this.handleDataImport(event));

    // Student CRUD modal triggers
    document.getElementById("add-student-trigger-btn").addEventListener("click", () => this.openStudentModal());
    document.getElementById("student-modal-close").addEventListener("click", () => {
      document.getElementById("student-modal").classList.remove("active");
    });
    document.getElementById("student-modal-cancel").addEventListener("click", () => {
      document.getElementById("student-modal").classList.remove("active");
    });
    document.getElementById("student-details-modal-close").addEventListener("click", () => {
      document.getElementById("student-details-modal").classList.remove("active");
    });
    document.getElementById("student-form").addEventListener("submit", (e) => this.handleStudentSubmit(e));

    // Student search input filter
    document.getElementById("student-search-input").addEventListener("input", () => this.loadStudentsList());

    // Attendance View Handlers
    document.getElementById("attendance-date-input").addEventListener("change", () => this.loadAttendanceSetup());
    document.getElementById("attendance-start-btn").addEventListener("click", () => {
      const dateVal = document.getElementById("attendance-date-input").value;
      if (!dateVal) {
        this.showToast("Please select a date first.", "danger");
        return;
      }
      document.getElementById("attendance-active-date-label").textContent = `Date: ${dateVal}`;
      document.getElementById("attendance-setup-panel").style.display = "none";
      document.getElementById("attendance-sheet-panel").style.display = "block";
      this.loadAttendanceList();
    });
    document.getElementById("cancel-attendance-btn").addEventListener("click", () => this.loadAttendanceSetup());
    document.getElementById("mark-all-present-btn").addEventListener("click", () => {
      document.querySelectorAll(".attendance-checkbox").forEach(box => box.checked = true);
    });
    document.getElementById("save-attendance-btn").addEventListener("click", () => this.handleSaveAttendance());
    document.getElementById("download-absentees-btn").addEventListener("click", () => this.handleDownloadAbsentees());
    
    // Leave Day Handlers
    const leaveBtn = document.getElementById("attendance-leave-btn");
    if (leaveBtn) leaveBtn.addEventListener("click", () => this.handleMarkLeaveDay());
    
    const unleaveBtn = document.getElementById("attendance-unleave-btn");
    if (unleaveBtn) unleaveBtn.addEventListener("click", () => this.handleUnmarkLeaveDay());

    // Monthly Report Handlers
    const genReportBtn = document.getElementById("generate-monthly-report-btn");
    if (genReportBtn) genReportBtn.addEventListener("click", () => this.loadMonthlyAttendanceReport());

    const printReportBtn = document.getElementById("print-monthly-report-btn");
    if (printReportBtn) printReportBtn.addEventListener("click", () => this.printMonthlyAttendanceReport());

    // Test Series View Handlers
    document.getElementById("test-type-select").addEventListener("change", () => this.loadTestSyllabus());
    document.getElementById("test-num-input").addEventListener("input", () => this.loadTestSyllabus());
    document.getElementById("subject-select").addEventListener("change", () => this.loadTestSyllabus());
    document.getElementById("test-start-btn").addEventListener("click", async () => {
      const type = document.getElementById("test-type-select").value;
      const num = document.getElementById("test-num-input").value.trim();
      if (!num) {
        this.showToast("Please enter a test number.", "danger");
        return;
      }
      
      const date = document.getElementById("test-date-input").value;
      if (!date) {
        this.showToast("Please select a test date.", "danger");
        return;
      }

      this.selectedTest = `${type} ${num}`;
      this.selectedSubject = document.getElementById("subject-select").value;
      
      // Auto-save edited syllabus
      const syllabusVal = document.getElementById("test-syllabus-input").value.trim();
      const savedSyllabus = await db.getSyllabus(this.selectedTest);
      savedSyllabus[this.selectedSubject] = syllabusVal;
      await db.saveSyllabus(this.selectedTest, savedSyllabus);

      document.getElementById("test-active-label").textContent = `Test: ${this.selectedTest} | Subject: ${this.selectedSubject} | Date: ${date}`;
      document.getElementById("test-setup-panel").style.display = "none";
      document.getElementById("test-sheet-panel").style.display = "block";
      this.loadTestList();
    });
    document.getElementById("cancel-test-marks-btn").addEventListener("click", () => {
      document.getElementById("test-setup-panel").style.display = "block";
      document.getElementById("test-sheet-panel").style.display = "none";
    });
    document.getElementById("save-test-marks-btn").addEventListener("click", () => this.handleSaveTestMarks());
    document.getElementById("print-test-sheet-btn").addEventListener("click", () => this.printMarksSheet());

    // Payments View Handlers
    const payMonth = document.getElementById("payment-month-select");
    const payFilter = document.getElementById("payment-filter-status");
    if (payMonth) payMonth.addEventListener("change", () => this.loadPaymentsList());
    if (payFilter) payFilter.addEventListener("change", () => this.loadPaymentsList());

    // Notification / Broadcast Handlers
    document.getElementById("send-absentees-sms-btn").addEventListener("click", () => this.handleSendAbsenteesSMS());
    document.getElementById("send-broadcast-btn").addEventListener("click", () => this.handleSendBroadcast());
  }
}

// Instantiate and initialize the app
const app = new AppController();

document.addEventListener("DOMContentLoaded", async () => {
  await db.ready;
  await app.init();
});
