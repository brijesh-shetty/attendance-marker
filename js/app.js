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
      broadcast: document.getElementById("broadcast-view")
    };

    this.navItems = document.querySelectorAll(".bottom-nav .nav-item");
    this.toastContainer = document.getElementById("toast-container");
    
    // Bind Event Listeners
    this.initEventListeners();
  }

  init() {
    // Set default date picker to today in India Standard Time
    const today = this.getLocalDateString();
    document.getElementById("attendance-date-input").value = today;
    document.getElementById("test-date-input").value = today;

    // Initialize UI Components
    lucide.createIcons();

    // Check session login state
    if (this.isLoggedIn()) {
      this.hideLoginScreen();
      this.switchView("dashboard");
    } else {
      this.showLoginScreen();
    }

    // Register Service Worker for offline PWA support
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => console.log('PWA Service Worker registered successfully:', reg.scope))
        .catch(err => console.error('PWA Service Worker registration failed:', err));
    }
  }

  isLoggedIn() {
    return sessionStorage.getItem("ga_logged_in") === "true";
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
    const totalRecords = Object.keys(records).length;

    const absenteesListDiv = document.getElementById("dashboard-absentees-list");
    absenteesListDiv.innerHTML = "";

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
    const filtered = students.filter(s => s.name.toLowerCase().includes(searchTerm));

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
            ${student.combination ? `<span class="badge" style="font-size: 0.7rem; background-color: rgba(139, 92, 246, 0.15); color: var(--primary-hover); padding: 2px 6px; border-radius: 4px; font-weight: 600; text-transform: uppercase;">${student.combination}</span>` : ''}
            ${student.college ? `<span class="badge" style="font-size: 0.7rem; background-color: rgba(255, 255, 255, 0.05); color: var(--text-muted); padding: 2px 6px; border-radius: 4px; font-weight: 500; text-transform: uppercase;">${student.college}</span>` : ''}
          </div>
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
    const id = document.getElementById("student-id-field").value;
    const name = document.getElementById("student-name-field").value.trim();
    const combination = document.getElementById("student-combination-field").value;
    const college = document.getElementById("student-college-field").value.trim();
    const phone = document.getElementById("student-phone-field").value.trim();
    const parentPhone = document.getElementById("parent-phone-field").value.trim();

    if (!name) return;

    const studentData = { name, phone, parentPhone, combination, college };
    if (id) studentData.id = id;

    await db.saveStudent(studentData);
    document.getElementById("student-modal").classList.remove("active");
    this.showToast(id ? "Student record updated." : "New student registered successfully!");
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
      const student = students.find(s => s.id === studentId);
      if (student) {
        document.getElementById("detail-student-name").textContent = student.name;
        document.getElementById("detail-student-combination").textContent = student.combination || "N/A";
        document.getElementById("detail-student-college").textContent = student.college || "N/A";
        document.getElementById("detail-parent-phone-1").textContent = student.phone || "N/A";
        document.getElementById("detail-parent-phone-2").textContent = student.parentPhone || "N/A";
        
        const editBtn = document.getElementById("detail-edit-btn");
        const deleteBtn = document.getElementById("detail-delete-btn");
        
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
    
    const hasRecords = Object.keys(records).length > 0;
    const reportBox = document.getElementById("attendance-print-report");
    
    if (hasRecords) {
      this.renderAttendancePrintPreview(dateVal, students, records);
      reportBox.style.display = "block";
    } else {
      reportBox.style.display = "none";
    }
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
      <div class="print-summary">
        <p><strong>Total Students:</strong> ${students.length}</p>
        <p><strong>Present Count:</strong> ${present}</p>
        <p><strong>Absent Count:</strong> ${absent}</p>
        <p><strong>List of Absentees:</strong> ${absentees.length > 0 ? absentees.join(", ") : 'None'}</p>
      </div>
      <div class="signature-area">
        <div class="signature-line">Class Instructor Signature</div>
        <div class="signature-line">Academy Director Stamp</div>
      </div>
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

    students.forEach((student, idx) => {
      // Default score values: empty marks, checked present
      const studentScoreData = scores[student.id] || { present: true, marks: "" };
      const isPresent = studentScoreData.present !== false;
      const marksVal = studentScoreData.marks;

      const div = document.createElement("div");
      div.className = "score-entry-row";
      div.innerHTML = `
        <div class="student-info">
          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 4px;">
            <span class="student-name">${idx + 1}. ${student.name}</span>
            ${student.combination ? `<span class="badge" style="font-size: 0.7rem; background-color: rgba(139, 92, 246, 0.15); color: var(--primary-hover); padding: 2px 6px; border-radius: 4px; font-weight: 600; text-transform: uppercase;">${student.combination}</span>` : ''}
            ${student.college ? `<span class="badge" style="font-size: 0.7rem; background-color: rgba(255, 255, 255, 0.05); color: var(--text-muted); padding: 2px 6px; border-radius: 4px; font-weight: 500; text-transform: uppercase;">${student.college}</span>` : ''}
          </div>
          <span class="student-contact">📲 Parent 1: ${student.phone || 'N/A'}</span>
        </div>
        <div class="score-controls">
          <label class="switch">
            <input type="checkbox" class="test-attendance-checkbox" data-id="${student.id}" ${isPresent ? "checked" : ""}>
            <span class="slider"></span>
          </label>
          <input type="text" class="score-input test-marks-field" data-id="${student.id}" 
                 value="${isPresent ? marksVal : 'AB'}" 
                 placeholder="--" 
                 maxlength="3" 
                 ${isPresent ? "" : "disabled"}>
        </div>
      `;
      container.appendChild(div);
    });

    // Attach listeners to test attendance switches to disable/enable marks text field
    container.querySelectorAll(".test-attendance-checkbox").forEach(box => {
      box.addEventListener("change", (e) => {
        const studentId = e.target.getAttribute("data-id");
        const input = container.querySelector(`.test-marks-field[data-id="${studentId}"]`);
        if (e.target.checked) {
          input.disabled = false;
          input.value = "";
        } else {
          input.disabled = true;
          input.value = "AB";
        }
        this.calculateAverageScoreBadge();
      });
    });

    container.querySelectorAll(".test-marks-field").forEach(input => {
      input.addEventListener("input", () => this.calculateAverageScoreBadge());
    });

    this.calculateAverageScoreBadge();
  }

  calculateAverageScoreBadge() {
    const markFields = document.querySelectorAll(".test-marks-field");
    let totalScore = 0;
    let scoreCount = 0;

    markFields.forEach(field => {
      if (!field.disabled && field.value.trim() !== "") {
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
    const marksFields = document.querySelectorAll(".test-marks-field");
    const results = {};

    marksFields.forEach(field => {
      const studentId = field.getAttribute("data-id");
      const isPresent = !field.disabled;
      const val = field.value.trim();

      results[studentId] = {
        present: isPresent,
        marks: isPresent ? (val === "" ? "" : val) : "AB"
      };
    });

    const type = document.getElementById("test-type-select").value;
    const num = document.getElementById("test-num-input").value.trim();
    const date = document.getElementById("test-date-input").value;
    const meta = {
      testType: type,
      testNumber: num,
      date: date
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
    // Sync current UI fields to Firestore/Storage first
    await this.handleSaveTestMarks();

    const students = await db.getStudents();
    const scores = await db.getTestMarks(this.selectedTest, this.selectedSubject);
    const syllabus = await db.getSyllabus(this.selectedTest);
    const syllabusText = syllabus[this.selectedSubject] || "General Core Syllabus Modules";

    let totalScore = 0;
    let scoreCount = 0;
    let highestScore = 0;
    const absentees = [];

    students.forEach(s => {
      const data = scores[s.id] || { present: true, marks: "" };
      if (data.present === false || data.marks === "AB") {
        absentees.push(s.name);
      } else if (data.marks !== "") {
        const score = parseFloat(data.marks);
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
        <h2>Student Performance Marks Sheet</h2>
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
            <th style="width: 80px;" class="text-center">S.No.</th>
            <th>Student Name</th>
            <th style="width: 200px;" class="text-center">Marks Obtained</th>
          </tr>
        </thead>
        <tbody>
          ${students.map((student, index) => {
            const data = scores[student.id] || { present: true, marks: "" };
            let displayVal = data.marks;
            let statusClass = "";

            if (data.present === false || data.marks === "AB") {
              displayVal = "AB";
              statusClass = "text-danger";
            }

            return `
              <tr>
                <td class="text-center">${index + 1}</td>
                <td><strong>${student.name}</strong></td>
                <td class="text-center ${statusClass}" style="font-weight: bold; font-size: 11pt;">
                  ${displayVal}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
      <div class="print-summary">
        <p><strong>Total Scored:</strong> ${scoreCount} Students</p>
        <p><strong>Class Average Score:</strong> ${average}</p>
        <p><strong>Highest Score:</strong> ${scoreCount > 0 ? highestScore : '-'}</p>
        <p><strong>Absentees:</strong> ${absentees.length > 0 ? absentees.join(", ") : 'None'}</p>
      </div>
      <div class="signature-area">
        <div class="signature-line">Class Instructor Signature</div>
        <div class="signature-line">Academy Director Stamp</div>
      </div>
    `;

    // Trigger printing dialog
    window.print();
  }

  /* =========================================================================
     TWILIO SMS OPERATIONS
     ========================================================================= */
  async sendSMS(toNumber, messageText) {
    const settings = db.getSettings();
    const sid = settings.twilioSid;
    const token = settings.twilioToken;
    const fromNumber = settings.twilioPhone;

    if (!sid || !token || !fromNumber) {
      throw new Error("Twilio is not configured. Go to settings to set SID, Token, and Phone.");
    }

    // Format phone number to E.164 (ensure it starts with + and country code, e.g. +91 for India)
    let formattedTo = toNumber.trim();
    if (!formattedTo.startsWith("+")) {
      formattedTo = formattedTo.replace(/^0+/, "");
      if (formattedTo.length === 10) {
        formattedTo = "+91" + formattedTo;
      } else {
        formattedTo = "+" + formattedTo;
      }
    }

    const targetUrl = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
    const proxyUrl = `https://corsproxy.io/?` + encodeURIComponent(targetUrl);
    const authHeader = "Basic " + btoa(`${sid}:${token}`);

    const response = await fetch(proxyUrl, {
      method: "POST",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        To: formattedTo,
        From: fromNumber,
        Body: messageText
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errObj;
      try { errObj = JSON.parse(errorText); } catch(e) {}
      const errMsg = errObj ? errObj.message : `HTTP error! Status: ${response.status}`;
      throw new Error(errMsg);
    }

    return await response.json();
  }

  async handleSendAbsenteesSMS() {
    const dateVal = document.getElementById("attendance-date-input").value;
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

    if (!confirm(`Are you sure you want to send SMS notifications to the ${absentees.length} absent student(s)?\n(Note: If you are using a Twilio Trial Account, messages will only deliver to Verified Caller IDs)`)) {
      return;
    }

    let successCount = 0;
    let failCount = 0;
    const formattedDate = new Date(dateVal).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

    this.showToast(`Starting SMS broadcast to ${absentees.length} parents...`);

    for (const student of absentees) {
      const phone = student.phone || student.parentPhone;
      if (!phone) {
        failCount++;
        console.warn(`No phone number recorded for student: ${student.name}`);
        continue;
      }

      const msg = `Dear Parent, your ward ${student.name} was ABSENT today (${formattedDate}) from Galaxy Academy.`;
      
      try {
        await this.sendSMS(phone, msg);
        successCount++;
      } catch (err) {
        failCount++;
        console.error(`Failed to send SMS to ${student.name} (${phone}):`, err);
      }
    }

    if (successCount > 0) {
      this.showToast(`Successfully sent ${successCount} SMS notification(s)!`, "success");
    }
    if (failCount > 0) {
      this.showToast(`Failed to send ${failCount} SMS. Check logs.`, "danger");
    }
  }

  async handleSendBroadcast() {
    const target = document.getElementById("broadcast-subject-select").value;
    const msgText = document.getElementById("broadcast-message-input").value.trim();

    if (!msgText) {
      this.showToast("Please enter an announcement message first.", "danger");
      return;
    }

    const students = await db.getStudents();
    let targets = [];

    if (target === "all") {
      targets = students;
    } else {
      targets = students.filter(s => s.combination && s.combination.toUpperCase() === target.toUpperCase());
    }

    if (targets.length === 0) {
      this.showToast("No students found in the selected target class.", "info");
      return;
    }

    if (!confirm(`Are you sure you want to send this broadcast SMS to all ${targets.length} parents?\n(Note: If you are using a Twilio Trial Account, messages will only deliver to Verified Caller IDs)`)) {
      return;
    }

    let successCount = 0;
    let failCount = 0;

    this.showToast(`Sending broadcast to ${targets.length} parents...`);

    for (const student of targets) {
      const phone = student.phone || student.parentPhone;
      if (!phone) {
        failCount++;
        continue;
      }

      try {
        await this.sendSMS(phone, msgText);
        successCount++;
      } catch (err) {
        failCount++;
        console.error(`Failed to send broadcast to ${student.name} (${phone}):`, err);
      }
    }

    if (successCount > 0) {
      this.showToast(`Broadcast completed: ${successCount} sent successfully!`, "success");
      document.getElementById("broadcast-message-input").value = "";
    }
    if (failCount > 0) {
      this.showToast(`Failed to deliver ${failCount} messages.`, "danger");
    }
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
     PORTAL SETTINGS
     ========================================================================= */
  openSettingsModal() {
    const settings = db.getSettings();
    document.getElementById("db-mode-select").value = settings.mode;
    document.getElementById("settings-passcode-field").value = settings.passcode || "1234";
    document.getElementById("fb-api-key").value = settings.apiKey || "";
    document.getElementById("fb-auth-domain").value = settings.authDomain || "";
    document.getElementById("fb-project-id").value = settings.projectId || "";
    document.getElementById("fb-app-id").value = settings.appId || "";

    document.getElementById("twilio-sid-field").value = settings.twilioSid || "";
    document.getElementById("twilio-token-field").value = settings.twilioToken || "";
    document.getElementById("twilio-phone-field").value = settings.twilioPhone || "";
 
    const fbFields = document.getElementById("firebase-config-fields");
    fbFields.style.display = settings.mode === "firebase" ? "block" : "none";
 
    document.getElementById("settings-modal").classList.add("active");
    lucide.createIcons();
  }

  async handleSaveSettings() {
    const mode = document.getElementById("db-mode-select").value;
    const passcode = document.getElementById("settings-passcode-field").value.trim();
    const fbApiKey = document.getElementById("fb-api-key").value.trim();
    const fbAuthDomain = document.getElementById("fb-auth-domain").value.trim();
    const fbProjectId = document.getElementById("fb-project-id").value.trim();
    const fbAppId = document.getElementById("fb-app-id").value.trim();

    const twilioSid = document.getElementById("twilio-sid-field").value.trim();
    const twilioToken = document.getElementById("twilio-token-field").value.trim();
    const twilioPhone = document.getElementById("twilio-phone-field").value.trim();
 
    const currentSettings = db.getSettings();
    const newSettings = { 
      mode, 
      passcode: passcode || currentSettings.passcode || "1234",
      apiKey: fbApiKey, 
      authDomain: fbAuthDomain, 
      projectId: fbProjectId, 
      appId: fbAppId,
      twilioSid,
      twilioToken,
      twilioPhone
    };
    
    // Save settings (triggers initFirebase)
    await db.saveSettings(newSettings);

    document.getElementById("settings-modal").classList.remove("active");
    this.showToast("Settings saved successfully.");

    if (mode === "firebase") {
      if (fbApiKey && fbProjectId) {
        this.showToast("Firebase loaded. Uploading offline updates to cloud...");
        const syncResult = await db.pushLocalDataToCloud();
        if (syncResult.success) {
          this.showToast("Cloud sync completed. Data is now live!");
        } else {
          this.showToast(`Cloud connection configured. Using offline cache. Error: ${syncResult.error}`, "danger");
        }
      } else {
        this.showToast("Please enter Firebase Credentials before selecting cloud sync.", "danger");
      }
    }

    // Refresh active panel view
    this.refreshViewData(this.currentView);
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
    reader.onload = async (evt) => {
      const success = await db.importJSON(evt.target.result);
      if (success) {
        this.showToast("Database successfully restored from backup!");
        this.refreshViewData(this.currentView);
        document.getElementById("settings-modal").classList.remove("active");
      } else {
        this.showToast("Restoration failed. Invalid backup file structure.", "danger");
      }
    };
    reader.readAsText(file);
    // Reset file value
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

    // Login Screen Handlers
    document.getElementById("login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const inputVal = document.getElementById("login-passcode").value;
      const isValid = await db.verifyPasscode(inputVal);
      if (isValid) {
        sessionStorage.setItem("ga_logged_in", "true");
        this.hideLoginScreen();
        this.switchView("dashboard");
        document.getElementById("login-passcode").value = "";
        this.showToast("Login successful. Welcome admin!");
      } else {
        this.showToast("Incorrect passcode. Access Denied.", "danger");
      }
    });

    document.getElementById("lock-portal-btn").addEventListener("click", () => {
      sessionStorage.removeItem("ga_logged_in");
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

    // Toggle Firebase inputs visibility on database select change
    document.getElementById("db-mode-select").addEventListener("change", (e) => {
      const fbFields = document.getElementById("firebase-config-fields");
      fbFields.style.display = e.target.value === "firebase" ? "block" : "none";
    });

    // Backup & Restore settings controls
    document.getElementById("export-backup-btn").addEventListener("click", () => this.handleDataExport());
    document.getElementById("import-backup-trigger").addEventListener("click", () => {
      document.getElementById("import-backup-file").click();
    });
    document.getElementById("import-backup-file").addEventListener("change", (e) => this.handleDataImport(e));
    document.getElementById("seed-sheet-data-btn").addEventListener("click", async () => {
      if (confirm("This will clear your current student database and load the 35 students from the Class Sheet. Do you want to proceed?")) {
        try {
          await db.seedStudentSheetData();
          this.showToast("Student database successfully seeded from the sheet!");
          this.refreshViewData(this.currentView);
          document.getElementById("settings-modal").classList.remove("active");
        } catch (e) {
          this.showToast("Seeding failed.", "danger");
        }
      }
    });

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

    // Twilio SMS View Handlers
    document.getElementById("send-absentees-sms-btn").addEventListener("click", () => this.handleSendAbsenteesSMS());
    document.getElementById("send-broadcast-btn").addEventListener("click", () => this.handleSendBroadcast());
  }
}

// Instantiate and initialize the app
const app = new AppController();
window.app = app; // Expose globally for diagnostics and inline click handlers

document.addEventListener("DOMContentLoaded", () => {
  app.init();
});
