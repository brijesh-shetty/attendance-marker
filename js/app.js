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
      resources: document.getElementById("resources-view"),
      replies: document.getElementById("replies-view"),
      exams: document.getElementById("exams-view"),
      discontinued: document.getElementById("discontinued-view")
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
        if (session.user.activeBatchId) {
          const batches = await db.getBatches();
          const batch = batches.batches.find(item => item.id === session.user.activeBatchId);
          if (batch) { this.activateBatch(batch); } else { await this.showBatchWorkspace(); }
        } else await this.showBatchWorkspace();
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

  async showBatchWorkspace() {
    this.hideLoginScreen();
    document.getElementById('app-container').style.display = 'none';
    document.getElementById('batch-overlay').style.display = 'flex';
    try {
      const result = await db.getBatches();
      const container = document.getElementById('batch-list-container');
      const batches = (result && Array.isArray(result.batches) && result.batches.length > 0)
        ? result.batches
        : [{ id: '2026-12-1', batchNumber: 1, academicYear: 2026, grade: 12, studentCount: 0 }];

      container.innerHTML = batches.map(batch => `<button class="card batch-select-card" data-batch-id="${this.escapeHtml(batch.id)}" style="text-align:left; cursor:pointer; padding:14px;"><strong>Batch ${batch.batchNumber}</strong><div style="font-size:.8rem; color:var(--text-muted); margin-top:4px;">Grade ${batch.grade} · ${batch.academicYear}</div><div style="font-size:.75rem; margin-top:7px; color:var(--primary-hover);">${batch.studentCount || 0} student(s)</div></button>`).join('');
      container.querySelectorAll('.batch-select-card').forEach(button => button.addEventListener('click', async () => {
        try {
          const batch = await db.selectBatch(button.dataset.batchId);
          this.activateBatch(batch);
        } catch (error) {
          this.showToast(error.message || 'Unable to select batch.', 'danger');
        }
      }));
    } catch (err) {
      console.error('Failed to show batch workspace:', err);
      this.activateBatch({ id: '2026-12-1', batchNumber: 1, academicYear: 2026, grade: 12 });
    }
  }

  activateBatch(batch) {
    this.activeBatch = batch;
    document.getElementById('batch-overlay').style.display = 'none';
    document.getElementById('app-container').style.display = '';
    document.getElementById('active-batch-label').textContent = `Batch ${batch.batchNumber} · Grade ${batch.grade} · ${batch.academicYear}`;
    this.hideLoginScreen();
    this.switchView('dashboard');
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
  // Promise-based in-app confirm that works reliably on mobile PWAs where
  // native window.confirm() is often silently suppressed. Returns Promise<boolean>.
  confirmAction(message, { okLabel = "Confirm", cancelLabel = "Cancel", danger = false } = {}) {
    return new Promise(resolve => {
      const backdrop = document.createElement("div");
      backdrop.style.cssText = "position:fixed; inset:0; z-index:9999; background:rgba(0,0,0,0.6); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; padding:16px; animation:fadeInModal 0.15s ease-out;";

      const modal = document.createElement("div");
      modal.style.cssText = "background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-lg); padding:20px; max-width:400px; width:100%; box-shadow:0 10px 30px rgba(0,0,0,0.5);";

      const msg = document.createElement("p");
      msg.style.cssText = "margin:0 0 16px; font-size:0.92rem; line-height:1.5; color:var(--text-main); white-space:pre-line;";
      msg.textContent = message;

      const btnRow = document.createElement("div");
      btnRow.style.cssText = "display:flex; gap:10px; justify-content:flex-end;";

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "btn btn-secondary";
      cancel.style.cssText = "flex:1; padding:11px 14px; font-size:0.9rem; touch-action:manipulation;";
      cancel.textContent = cancelLabel;

      const ok = document.createElement("button");
      ok.type = "button";
      ok.className = danger ? "btn btn-danger" : "btn btn-primary";
      ok.style.cssText = "flex:1; padding:11px 14px; font-size:0.9rem; touch-action:manipulation;";
      ok.textContent = okLabel;

      const cleanup = (value) => { backdrop.remove(); resolve(value); };
      // Support both pointer taps (touch + mouse) — some old Android versions
      // fire 'click' unreliably after backdrop insertion, but pointerup always works.
      const bind = (el, val) => {
        const handler = (e) => { e.preventDefault(); e.stopPropagation(); cleanup(val); };
        el.addEventListener("click", handler);
      };
      bind(cancel, false);
      bind(ok, true);
      backdrop.addEventListener("click", (e) => { if (e.target === backdrop) cleanup(false); });

      btnRow.append(cancel, ok);
      modal.append(msg, btnRow);
      backdrop.append(modal);
      document.body.appendChild(backdrop);
      // Focus OK so an Enter press confirms, Esc cancels.
      setTimeout(() => ok.focus(), 0);
      const keyHandler = (e) => {
        if (e.key === "Escape") { document.removeEventListener("keydown", keyHandler); cleanup(false); }
        if (e.key === "Enter") { document.removeEventListener("keydown", keyHandler); cleanup(true); }
      };
      document.addEventListener("keydown", keyHandler);
    });
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

  // Page Routing & Switching Tabs
  switchView(viewName) {
    if (!this.views[viewName]) return;

    // Leaving the replies tab always dismisses an open chat screen.
    if (viewName !== "replies" && this.chatOpen) this.closeConversation();

    // Deactivate current active states
    Object.values(this.views).forEach(view => view.classList.remove("active"));
    this.navItems.forEach(item => item.classList.remove("active"));

    // Activate selected states
    this.views[viewName].classList.add("active");
    const activeNav = document.querySelector(`.bottom-nav .nav-item[data-view="${viewName}"]`);
    if (activeNav) {
      activeNav.classList.add("active");
      // If the matched nav-item is hidden on mobile (nav-hide-mobile), highlight "More" button instead
      if (activeNav.classList.contains("nav-hide-mobile")) {
        const moreBtn = document.getElementById("nav-more-toggle");
        if (moreBtn) moreBtn.classList.add("active");
      }
    }

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
        await this.loadFeeFollowups();
        break;
      case "resources":
        await this.loadAdminResources();
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
      case "replies":
        await this.loadReplies();
        break;
      case "exams":
        await this.loadExamNotificationView();
        break;
      case "discontinued":
        await this.loadDiscontinuedStudents();
        break;
    }
    lucide.createIcons();
  }

  async loadPaymentsList() {
    const container = document.getElementById('payments-list-container');
    const detail = document.getElementById('payment-student-detail-container');
    const [students, allPayments] = await Promise.all([db.getStudents(), db.getPayments()]);

    // Build one summary object per student. `dueRatio` is used by the filter.
    const summaries = students.map((student, index) => {
      const paymentData = allPayments[student.id] || {};
      const totalFee = Number(paymentData.totalFee) || 65000;
      const transactions = Array.isArray(paymentData.transactions) ? paymentData.transactions : [];
      const paid = transactions.reduce((sum, transaction) => sum + (Number(transaction?.amount) || 0), 0);
      const balance = Math.max(totalFee - paid, 0);
      const dueRatio = totalFee > 0 ? balance / totalFee : 0;
      return { student, index, paymentData, transactions, totalFee, paid, balance, dueRatio };
    });

    // Save on the instance so the reminder-sender panel can read the same list
    // without another Firestore round trip.
    this.paymentSummaries = summaries;

    const filterEl = document.getElementById('payment-fee-filter');
    const filter = filterEl ? filterEl.value : 'all';
    const filtered = this.filterPaymentSummaries(summaries, filter);
    this.paymentFilteredIds = new Set(filtered.map(item => item.student.id));

    const countEl = document.getElementById('payment-filter-count');
    if (countEl) countEl.textContent = `${filtered.length} of ${summaries.length} student(s)`;

    container.innerHTML = filtered.length ? '' : '<p style="text-align:center; color:var(--text-muted); padding:20px;">No students match the current filter.</p>';
    filtered.forEach(item => {
      const state = this.getFeePaymentState(item.paid, item.totalFee);
      const row = document.createElement('div');
      row.setAttribute('role', 'button'); row.setAttribute('tabindex', '0'); row.setAttribute('aria-label', `Open fee details for ${item.student.name}`);
      row.className = 'card';
      row.style.cssText = `width:100%; text-align:left; margin-bottom:10px; padding:14px; cursor:pointer; color:inherit; border-left:4px solid ${state.color}; background:${state.background};`;
      // Show BOTH received and due, side by side, so admins don't have to open
      // the detail panel just to see whether a partial payment came in.
      row.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
          <div>
            <strong>${item.index + 1}. ${this.escapeHtml(item.student.name)}</strong>
            <span class="badge" style="font-size:.7rem; margin-left:6px;">#${this.escapeHtml(String(item.student.number || item.student.id))}</span>
            <div style="font-size:.72rem; color:${state.color}; font-weight:700; margin-top:4px;">${state.label}</div>
          </div>
          <div style="text-align:right; font-size:.78rem;">
            <div style="color:var(--text-muted);">Received</div>
            <strong style="display:block; color:var(--success);">${this.formatCurrency(item.paid)}</strong>
            <div style="color:var(--text-muted); margin-top:4px;">Due</div>
            <strong style="display:block; color:${item.balance > 0 ? 'var(--danger)' : 'var(--success)'};">${this.formatCurrency(item.balance)}</strong>
          </div>
        </div>`;
      const openDetails = () => { this.showPaymentStudentDetail(item, detail); detail.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
      row.addEventListener('click', openDetails);
      row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openDetails(); } });
      container.appendChild(row);
    });

    this.renderFeeReminderRecipients();
    this.renderFeesTotalSummary(summaries);
    this.loadFeeReminderLog();
    lucide.createIcons();
  }

  filterPaymentSummaries(summaries, filter) {
    if (filter === 'due-over-50') return summaries.filter(item => item.dueRatio > 0.5);
    if (filter === 'due-under-50') return summaries.filter(item => item.dueRatio > 0 && item.dueRatio <= 0.5);
    return summaries;
  }

  renderFeesTotalSummary(summaries) {
    const container = document.getElementById('fees-total-summary');
    if (!container) return;
    const totalStudents = summaries.length;
    const totalExpected = summaries.reduce((sum, item) => sum + item.totalFee, 0);
    const totalReceived = summaries.reduce((sum, item) => sum + item.paid, 0);
    const totalDue = summaries.reduce((sum, item) => sum + item.balance, 0);
    const dueStudents = summaries.filter(item => item.balance > 0).length;
    const fmt = (n) => this.formatCurrency(n);
    container.innerHTML = `
      <div><small style="color:var(--text-muted);">Students</small><strong style="display:block;">${totalStudents}</strong></div>
      <div><small style="color:var(--text-muted);">Total expected</small><strong style="display:block;">${fmt(totalExpected)}</strong></div>
      <div><small style="color:var(--text-muted);">Received</small><strong style="display:block; color:var(--success);">${fmt(totalReceived)}</strong></div>
      <div><small style="color:var(--text-muted);">Outstanding</small><strong style="display:block; color:${totalDue > 0 ? 'var(--danger)' : 'var(--success)'};">${fmt(totalDue)}</strong></div>
      <div><small style="color:var(--text-muted);">With balance</small><strong style="display:block;">${dueStudents} / ${totalStudents}</strong></div>`;
  }

  renderFeeReminderRecipients() {
    const listEl = document.getElementById('fee-reminder-recipients-list');
    const countEl = document.getElementById('fee-reminder-selection-count');
    if (!listEl) return;
    const selected = this.feeReminderSelection = this.feeReminderSelection || new Set();
    // Drop selections for students that no longer exist (e.g. deleted).
    const validIds = new Set((this.paymentSummaries || []).map(item => item.student.id));
    for (const id of Array.from(selected)) if (!validIds.has(id)) selected.delete(id);

    listEl.innerHTML = '';
    (this.paymentSummaries || []).forEach(item => {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex; align-items:center; gap:10px; padding:6px 8px; cursor:pointer; border-radius:6px;';
      row.onmouseover = () => row.style.background = 'var(--bg-card-hover)';
      row.onmouseout = () => row.style.background = 'transparent';
      const isChecked = selected.has(item.student.id);
      row.innerHTML = `
        <input type="checkbox" class="fee-reminder-cb" data-id="${this.escapeHtml(item.student.id)}" ${isChecked ? 'checked' : ''}>
        <span style="flex:1; font-size:.85rem;">${this.escapeHtml(item.student.name)} <span style="color:var(--text-muted); font-size:.72rem;">#${this.escapeHtml(String(item.student.number || item.student.id))}</span></span>
        <span style="font-size:.72rem; color:${item.balance > 0 ? 'var(--danger)' : 'var(--success)'};">Due ${this.formatCurrency(item.balance)}</span>`;
      row.querySelector('.fee-reminder-cb').addEventListener('change', event => {
        if (event.target.checked) selected.add(item.student.id);
        else selected.delete(item.student.id);
        if (countEl) countEl.textContent = `${selected.size} selected`;
      });
      listEl.appendChild(row);
    });
    if (countEl) countEl.textContent = `${selected.size} selected`;
  }

  async loadFeeReminderLog() {
    const container = document.getElementById('fee-reminder-log-container');
    if (!container) return;
    const today = this.getLocalDateString();
    try {
      const { logs } = await db.getFeeReminders(today);
      if (!logs || !logs.length) {
        container.innerHTML = '<p style="color:var(--text-muted); font-size:.8rem; margin:0;">No reminders sent today.</p>';
        return;
      }
      container.innerHTML = logs.map(log => {
        const time = new Date(log.sentAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        const succeeded = Number(log.succeeded || 0);
        const total = Number(log.total || 0);
        let icon = '✅';
        if (succeeded === 0) icon = '❌';
        else if (succeeded < total) icon = '⚠️';

        const names = (log.recipients || []).map(r =>
          `<li style="font-size:.75rem; ${r.success ? '' : 'color:var(--danger);'}">
             ${r.success ? '✓' : '✕'} ${this.escapeHtml(r.studentName || r.studentId)}${r.success ? '' : ` — ${this.escapeHtml(r.error || 'failed')}`}
           </li>`).join('');

        // Group distinct errors so the reason is impossible to miss.
        const errorReasons = Array.from(new Set((log.recipients || [])
          .filter(r => !r.success && r.error)
          .map(r => r.error)));
        const errorsHtml = errorReasons.length
          ? `<div style="margin-top:8px; padding:8px; border-left:3px solid var(--danger); background:rgba(239,68,68,.08); font-size:.72rem; color:var(--danger);">
               <strong>Errors:</strong>
               <ul style="margin:4px 0 0 16px; padding:0;">${errorReasons.map(e => `<li>${this.escapeHtml(e)}</li>`).join('')}</ul>
             </div>` : '';

        return `
          <div style="border-top:1px solid var(--border-color); padding:8px 0;">
            <div style="display:flex; justify-content:space-between; gap:8px; font-size:.8rem;">
              <strong>${icon} ${this.escapeHtml(log.templateName)}</strong>
              <span style="color:var(--text-muted);">${time} · ${succeeded}/${total} delivered</span>
            </div>
            <ul style="margin:6px 0 0 16px; padding:0;">${names}</ul>
            ${errorsHtml}
          </div>`;
      }).join('');
    } catch (err) {
      container.innerHTML = `<p style="color:var(--danger); font-size:.8rem;">Failed to load log: ${this.escapeHtml(err.message || '')}</p>`;
    }
  }

  async sendFeeReminders() {
    const templateName = (document.getElementById('fee-reminder-template-input').value || '').trim();
    if (!templateName) return this.showToast('Enter a template name first.', 'danger');
    const selected = Array.from(this.feeReminderSelection || []);
    if (!selected.length) return this.showToast('Select at least one student.', 'danger');
    if (!await this.confirmAction(`Send WhatsApp reminder “${templateName}” to ${selected.length} student(s)?`)) return;

    const btn = document.getElementById('fee-reminder-send-btn');
    btn.disabled = true;
    const originalLabel = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader" style="animation:spin 1s linear infinite; width:14px; height:14px;"></i> Sending';
    lucide.createIcons();

    try {
      const result = await db.sendFeeReminders({ studentIds: selected, templateName });
      // Surface the actual outcome — a total wipeout (0/N) is a danger toast
      // that includes the first error so the admin knows why (e.g. template
      // name typo → Meta 132001).
      const firstError = (result.recipients || []).find(r => !r.success)?.error;
      const severity = result.succeeded === 0 ? 'danger'
                     : result.failed > 0 ? 'danger' : 'success';
      const errSuffix = firstError ? ` — first error: ${firstError}` : '';
      this.showToast(`Reminders: ${result.succeeded}/${result.total} delivered, ${result.failed} failed${errSuffix}`, severity);
      // Only clear the picked list on a fully-clean send. If some (or all) failed
      // the admin usually wants to retry after fixing the template name.
      if (result.failed === 0) this.feeReminderSelection = new Set();
      this.renderFeeReminderRecipients();
      await this.loadFeeReminderLog();
    } catch (err) {
      this.showToast(`Failed to send reminders: ${err.message || 'Server error'}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalLabel;
      lucide.createIcons();
    }
  }

  getFeePaymentState(paid, totalFee) {
    if (paid >= totalFee) return { label: 'FULLY PAID', color: 'var(--success)', background: 'rgba(34,197,94,.12)' };
    if (paid < totalFee * 0.5) return { label: 'DUE', color: 'var(--danger)', background: 'rgba(239,68,68,.12)' };
    return { label: 'PARTIALLY PAID', color: '#f59e0b', background: 'rgba(245,158,11,.12)' };
  }

  /**
   * Export fee data to Google Sheets.
   * Generates a spreadsheet with: Student Name, Total Fee, Due As Of Today,
   * Installment 1, Installment 2, ... Installment N (amounts only).
   * On mobile: uses Web Share API so user can open directly in Google Sheets.
   * On desktop: downloads CSV file that can be opened in Google Sheets.
   */
  async openFeesInGoogleSheets() {
    const summaries = this.paymentSummaries;
    if (!summaries || summaries.length === 0) {
      this.showToast('No fee data available. Please wait for the payments list to load.', 'danger');
      return;
    }

    // Find the maximum number of installments (transactions) across all students
    const maxInstallments = summaries.reduce((max, item) => Math.max(max, item.transactions.length), 0);

    // Build the header row
    const headers = ['Student Name', 'Total Fee (₹)', 'Paid (₹)', 'Due As Of Today (₹)'];
    for (let i = 1; i <= maxInstallments; i++) {
      headers.push(`Installment ${i} (₹)`);
    }

    // Build data rows
    const rows = summaries.map(item => {
      const row = [
        item.student.name,
        item.totalFee,
        item.paid,
        item.balance
      ];
      // Add each installment amount (sorted chronologically)
      const sortedTxns = [...item.transactions].sort((a, b) =>
        String(a.date || '').localeCompare(String(b.date || ''))
      );
      for (let i = 0; i < maxInstallments; i++) {
        if (i < sortedTxns.length) {
          row.push(Number(sortedTxns[i].amount) || 0);
        } else {
          row.push('');
        }
      }
      return row;
    });

    // Build CSV
    const escapeCSV = (val) => {
      const str = String(val);
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const csvLines = [headers.map(escapeCSV).join(',')];
    rows.forEach(row => csvLines.push(row.map(escapeCSV).join(',')));
    const csv = csvLines.join('\n');

    const today = this.getLocalDateString();
    const fileName = `Fee_Report_${today}.csv`;
    const csvBlob = new Blob([csv], { type: 'text/csv' });
    const csvFile = new File([csvBlob], fileName, { type: 'text/csv' });

    // Detect mobile: has touch AND narrow viewport
    const isMobile = ('ontouchstart' in window || navigator.maxTouchPoints > 0) && window.innerWidth < 768;

    // Mobile: use Web Share API so user can "Open with Google Sheets" directly
    if (isMobile && navigator.canShare && navigator.canShare({ files: [csvFile] })) {
      try {
        await navigator.share({
          title: `Fee Report - ${today}`,
          files: [csvFile]
        });
        this.showToast('Fee report shared!');
        return;
      } catch (err) {
        // User cancelled share or share failed — fall through to download
        if (err.name === 'AbortError') return;
      }
    }

    // Desktop / fallback: download the CSV file
    const url = URL.createObjectURL(csvBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    this.showToast(`Downloaded ${fileName} — open it in Google Sheets.`);
  }

  showPaymentStudentDetail(item, detail) {
    const { student, paymentData, transactions, totalFee, paid, balance } = item;
    const state = this.getFeePaymentState(paid, totalFee);
    const history = transactions.map((transaction, index) => ({ transaction, index })).sort((a, b) => String(b.transaction.date || '').localeCompare(String(a.transaction.date || '')) || (Number(b.transaction.recordedAt) || 0) - (Number(a.transaction.recordedAt) || 0));
    const historyHtml = history.length ? history.map(({ transaction, index }) => `<div style="display:grid; grid-template-columns:1fr auto; gap:8px; padding:8px 0; border-bottom:1px solid var(--border-color);"><div><strong style="font-size:.82rem;">${this.escapeHtml(transaction.date)}</strong>${transaction.note ? `<div style="font-size:.75rem; color:var(--text-muted); margin-top:2px;">${this.escapeHtml(transaction.note)}</div>` : ''}</div><div style="display:flex; align-items:center; gap:6px;"><strong style="color:var(--success);">${this.formatCurrency(transaction.amount)}</strong><button class="btn btn-secondary edit-payment-btn" data-index="${index}" style="padding:4px 7px; font-size:.72rem;">Edit</button><button class="btn btn-danger delete-payment-btn" data-index="${index}" style="padding:4px 7px; font-size:.72rem;">Delete</button></div></div>`).join('') : '<p style="color:var(--text-muted); font-size:.8rem; margin:8px 0 0;">No payments recorded yet.</p>';
    detail.style.display = 'block';
    detail.innerHTML = `<div class="card" style="padding:14px; border-left:4px solid ${state.color};"><div style="display:flex; justify-content:space-between; gap:8px;"><div><h3 style="margin:0; font-size:1rem;">${this.escapeHtml(student.name)}</h3><span style="font-size:.75rem; color:${state.color}; font-weight:700;">${state.label}</span></div><button class="btn btn-secondary close-fee-detail-btn" style="padding:5px 9px;">Close</button></div><div style="display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:8px; margin-top:12px;"><div><small>Total fee</small><strong style="display:block;">${this.formatCurrency(totalFee)}</strong></div><div><small>Received fee</small><strong style="display:block; color:var(--success);">${this.formatCurrency(paid)}</strong></div><div><small>${balance > 0 ? 'Due' : 'Status'}</small><strong style="display:block; color:${state.color};">${balance > 0 ? this.formatCurrency(balance) : 'Paid in full'}</strong></div></div><div style="display:flex; gap:8px; margin-top:12px; align-items:end;"><div class="input-group" style="margin:0; flex:1;"><label>Total fee</label><input class="input-field detail-total-fee" type="number" min="0" step="0.01" value="${totalFee}"></div><button class="btn btn-secondary save-total-fee-btn" style="padding:9px 12px;">Save Total</button></div><div style="border-top:1px solid var(--border-color); margin-top:14px; padding-top:12px;"><strong style="font-size:.88rem;">Add payment received</strong><div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px;"><div class="input-group" style="margin:0;"><label>Payment date</label><input class="input-field detail-payment-date" type="date" value="${this.getLocalDateString()}"></div><div class="input-group" style="margin:0;"><label>Paid amount</label><input class="input-field detail-amount" type="number" min="0.01" step="0.01" placeholder="0.00"></div></div><div class="input-group" style="margin-top:8px;"><label>Note (optional)</label><input class="input-field detail-notes" maxlength="300" placeholder="e.g. UPI reference / instalment"></div><button class="btn btn-primary btn-full add-payment-btn" style="margin-top:8px;">Add Payment</button></div><div style="border-top:1px solid var(--border-color); margin-top:14px; padding-top:12px;"><strong style="font-size:.88rem;">Payment history</strong>${historyHtml}<div class="payment-edit-container"></div></div><div style="border-top:1px solid var(--border-color); margin-top:14px; padding-top:12px;"><div style="display:flex; justify-content:space-between; gap:8px;"><strong style="font-size:.85rem;">Parent Message Preview</strong><span style="font-size:.72rem; color:var(--text-muted);">${paymentData.lastFeeMessage ? `Last sent: ${this.escapeHtml(paymentData.lastFeeMessage.template || 'template')} · ${new Date(paymentData.lastFeeMessage.sentAt).toLocaleDateString('en-IN')}` : 'Not sent yet'}</span></div>      <select class="select-field detail-template" style="margin-top:8px;">
        <option value="fee_reminder">Fee reminder (Partial paid)</option>
        <option value="fee_reminder_zero">Fee reminder (0% paid)</option>
        <option value="eve_reminder">Eve reminder (1 day before deadline)</option>
        <option value="deadline_missed">Deadline missed (Same day follow-up)</option>
        <option value="final_warning">Final warning (3 days after deadline)</option>
        <option value="balance_reminder">Balance reminder</option>
        <option value="payment_thanks">Payment received / thank you</option>
      </select><div class="detail-preview" style="margin-top:8px; padding:9px; border-radius:7px; background:rgba(255,255,255,.04); font-size:.8rem; line-height:1.45;"></div><button class="btn btn-secondary btn-full copy-detail-message-btn" style="margin-top:8px;">Copy Preview for Review</button></div></div>`;
    const totalInput = detail.querySelector('.detail-total-fee'); const template = detail.querySelector('.detail-template'); const preview = detail.querySelector('.detail-preview');
    const render = () => { const newTotal = Number(totalInput.value) || 0; preview.textContent = this.buildFeeMessage(template.value, student, { totalFee: newTotal, paid, balance: Math.max(newTotal - paid, 0) }); };
    [totalInput, template].forEach(control => control.addEventListener('input', render)); render();
    detail.querySelectorAll('.edit-payment-btn').forEach(button => button.addEventListener('click', () => {
      const index = Number(button.dataset.index);
      const transaction = transactions[index];
      const editContainer = detail.querySelector('.payment-edit-container');
      editContainer.innerHTML = `<div class="card" style="margin-top:10px; padding:10px; border:1px solid var(--border-color);"><strong style="font-size:.82rem;">Edit payment entry</strong><div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:8px;"><div class="input-group" style="margin:0;"><label>Date</label><input class="input-field edit-payment-date" type="date" value="${this.escapeHtml(transaction.date || '')}"></div><div class="input-group" style="margin:0;"><label>Paid amount</label><input class="input-field edit-payment-amount" type="number" min="0.01" step="0.01" value="${Number(transaction.amount) || ''}"></div></div><div class="input-group" style="margin-top:8px;"><label>Note</label><input class="input-field edit-payment-note" maxlength="300" value="${this.escapeHtml(transaction.note || '')}"></div><div style="display:flex; gap:8px; margin-top:8px;"><button class="btn btn-primary save-payment-edit-btn" style="flex:1; padding:8px;">Save Change</button><button class="btn btn-secondary cancel-payment-edit-btn" style="flex:1; padding:8px;">Cancel</button></div></div>`;
      editContainer.querySelector('.cancel-payment-edit-btn').addEventListener('click', () => { editContainer.innerHTML = ''; });
      editContainer.querySelector('.save-payment-edit-btn').addEventListener('click', async () => {
        try {
          const date = editContainer.querySelector('.edit-payment-date').value;
          const amount = Number(editContainer.querySelector('.edit-payment-amount').value);
          const note = editContainer.querySelector('.edit-payment-note').value.trim();
          if (!date) throw new Error('Select the payment date.');
          if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid paid amount.');
          await db.updatePaymentTransaction(student.id, index, date, amount, note);
          this.showToast(`Payment entry for ${student.name} updated.`);
          detail.style.display = 'none';
          await this.loadPaymentsList();
        } catch (error) { this.showToast(error.message || 'Unable to update payment.', 'danger'); }
      });
    }));
    detail.querySelectorAll('.delete-payment-btn').forEach(button => button.addEventListener('click', async () => {
      const index = Number(button.dataset.index);
      const transaction = transactions[index];
      if (!transaction) return;
      if (!await this.confirmAction(`Delete payment of ${this.formatCurrency(transaction.amount)} on ${transaction.date}? This cannot be undone.`, { danger: true, okLabel: 'Delete' })) return;
      try {
        await db.deletePaymentTransaction(student.id, index);
        this.showToast(`Payment entry deleted for ${student.name}.`);
        detail.style.display = 'none';
        await this.loadPaymentsList();
      } catch (err) {
        this.showToast(err.message || 'Unable to delete payment.', 'danger');
      }
    }));
    if (history.length) {
      const wipeBtn = document.createElement('button');
      wipeBtn.className = 'btn btn-danger';
      wipeBtn.style.cssText = 'margin-top:8px; padding:6px 10px; font-size:.75rem;';
      wipeBtn.textContent = `Delete all ${history.length} payment(s) for this student`;
      wipeBtn.addEventListener('click', async () => {
        if (!await this.confirmAction(`This will erase ALL ${history.length} payment entries for ${student.name}. The total fee is kept. Continue?`, { danger: true, okLabel: 'Delete all' })) return;
        try {
          await db.deleteAllPaymentTransactions(student.id);
          this.showToast(`All payments cleared for ${student.name}.`);
          detail.style.display = 'none';
          await this.loadPaymentsList();
        } catch (err) {
          this.showToast(err.message || 'Unable to clear payments.', 'danger');
        }
      });
      detail.querySelector('.payment-edit-container').after(wipeBtn);
    }
    detail.querySelector('.close-fee-detail-btn').addEventListener('click', () => { detail.style.display = 'none'; detail.innerHTML = ''; });
    detail.querySelector('.save-total-fee-btn').addEventListener('click', async () => { try { const total = Number(totalInput.value); if (!Number.isFinite(total) || total < 0) throw new Error('Enter a valid total fee.'); await db.saveTotalFee(student.id, total); this.showToast(`Total fee for ${student.name} saved.`); detail.style.display = 'none'; await this.loadPaymentsList(); } catch (error) { this.showToast(error.message || 'Unable to save total fee.', 'danger'); } });
    detail.querySelector('.add-payment-btn').addEventListener('click', async () => { try { const date = detail.querySelector('.detail-payment-date').value; const amount = Number(detail.querySelector('.detail-amount').value); const note = detail.querySelector('.detail-notes').value.trim(); if (!date) throw new Error('Select the payment date.'); if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid paid amount.'); await db.addPaymentTransaction(student.id, date, amount, note); this.showToast(`Payment added for ${student.name}.`); detail.style.display = 'none'; await this.loadPaymentsList(); } catch (error) { this.showToast(error.message || 'Unable to add payment.', 'danger'); } });
    detail.querySelector('.copy-detail-message-btn').addEventListener('click', async () => { try { await navigator.clipboard.writeText(preview.textContent); this.showToast('Fee message copied. Review it before sending.'); } catch { this.showToast('Unable to copy the message.', 'danger'); } });
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
            <span class="badge" style="font-size: 0.7rem; background-color: rgba(59, 130, 246, 0.2); color: var(--student-accent-hover); padding: 2px 6px; border-radius: 4px; font-weight: 700;">#${student.number || student.id}</span>
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
      // IDs are globally unique across batches.
      const existingStudents = await db.getStudents();
      let maxId = 0;
      existingStudents.forEach(s => {
        const parsed = parseInt(String(s.id).split('-').pop(), 10);
        if (!isNaN(parsed) && parsed > maxId) maxId = parsed;
      });
      const batch = this.activeBatch;
      id = batch ? `${batch.academicYear}-${batch.grade}-${batch.batchNumber}-${String(maxId + 1).padStart(3, '0')}` : (maxId + 1).toString();
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
    if (await this.confirmAction(`Are you sure you want to remove ${name}?`, { danger: true, okLabel: 'Remove' })) {
      if (await this.confirmAction(`WARNING: This will permanently delete ${name} and all associated records. Press OK to proceed.`, { danger: true, okLabel: 'Delete permanently' })) {
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
            if (await this.confirmAction(`Reset password for Student #${student.number || student.id} (${student.name}) to parent phone number (${student.phone || student.parentPhone || 'default'})?`)) {
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

        // Discontinue button
        const discBtn = document.getElementById("detail-discontinue-btn");
        if (discBtn) {
          const newDiscBtn = discBtn.cloneNode(true);
          discBtn.parentNode.replaceChild(newDiscBtn, discBtn);
          newDiscBtn.addEventListener("click", () => {
            modal.classList.remove("active");
            this.openDiscontinueModal(studentId, student.name);
          });
        }

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

    // Refresh the "reminder sent" indicator whenever the picked date changes.
    this.loadAttendanceReminderLog(dateVal);

    const students = await db.getStudents();
    await this.populateReportStudentOptions(students);
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

    if (await this.confirmAction(`Are you sure you want to mark ${dateVal} as a Leave Day? Existing attendance for this day will be overwritten.`)) {
      await db.saveAttendance(dateVal, { __leaveDay: true });
      this.showToast(`Date ${dateVal} marked as a Leave Day.`);
      await this.loadAttendanceSetup();
      await this.loadDashboardData();
    }
  }

  async handleUnmarkLeaveDay() {
    const dateVal = document.getElementById("attendance-date-input").value;
    if (!dateVal) return;

    if (await this.confirmAction(`Are you sure you want to unmark ${dateVal} as a Leave Day?`)) {
      await db.saveAttendance(dateVal, {});
      this.showToast(`Leave day status removed for ${dateVal}.`);
      await this.loadAttendanceSetup();
      await this.loadDashboardData();
    }
  }

  async populateReportStudentOptions(studentsList) {
    const selectEl = document.getElementById("monthly-report-student-select");
    const containerEl = document.getElementById("report-student-checkboxes-list");
    if (!selectEl) return;

    const students = studentsList || await db.getStudents();
    const currentVal = selectEl.value;

    selectEl.innerHTML = `
      <option value="all">All Students</option>
      <option value="multiple">-- Select Multiple Students --</option>
    `;

    if (containerEl) containerEl.innerHTML = "";

    students.forEach(student => {
      const opt = document.createElement("option");
      opt.value = student.id;
      opt.textContent = `${student.name} ${student.combination ? `(${student.combination})` : ''}`;
      selectEl.appendChild(opt);

      if (containerEl) {
        const lbl = document.createElement("label");
        lbl.style.cssText = "display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: var(--text-main); cursor: pointer; background: rgba(255,255,255,0.03); padding: 6px 8px; border-radius: 4px; border: 1px solid var(--border-color);";
        lbl.innerHTML = `
          <input type="checkbox" class="report-student-cb" value="${student.id}" checked style="accent-color: var(--primary);">
          <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${student.name}</span>
        `;
        containerEl.appendChild(lbl);
      }
    });

    if (currentVal && Array.from(selectEl.options).some(o => o.value === currentVal)) {
      selectEl.value = currentVal;
    }
  }

  getSelectedStudentsForReport(students) {
    const studentSelectVal = document.getElementById("monthly-report-student-select")?.value || "all";
    if (studentSelectVal === "all") {
      return students;
    } else if (studentSelectVal === "multiple") {
      const selectedIds = Array.from(document.querySelectorAll(".report-student-cb:checked")).map(cb => cb.value);
      return students.filter(s => selectedIds.includes(s.id));
    } else {
      return students.filter(s => s.id === studentSelectVal);
    }
  }

  async loadMonthlyAttendanceReport() {
    const monthSelect = document.getElementById("monthly-report-select");
    if (!monthSelect) return;
    const yearMonthStr = monthSelect.value; // YYYY-MM
    const [year, month] = yearMonthStr.split("-").map(Number);

    const students = await db.getStudents();
    const targetStudents = this.getSelectedStudentsForReport(students);

    if (students.length === 0) {
      this.showToast("Please register students first.", "danger");
      return;
    }

    if (targetStudents.length === 0) {
      this.showToast("Please select at least one student for the report.", "danger");
      return;
    }

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

    if (classesHeld === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">No classes conducted in this month yet.</td></tr>`;
      reportResultsDiv.style.display = "block";
      return;
    }

    // Calculate per student attendance stats
    const reportData = [];

    targetStudents.forEach((student, idx) => {
      let attendedCount = 0;
      validDates.forEach(date => {
        const records = allAttendance[date] || {};
        const status = records[student.id];
        if (status === "P" || (status === undefined && Object.keys(records).length > 0)) {
          attendedCount++;
        }
      });

      const percentage = classesHeld > 0 ? Math.round((attendedCount / classesHeld) * 100) : 0;

      reportData.push({
        sNo: idx + 1,
        name: student.name,
        combination: student.combination || "",
        totalHeld: classesHeld,
        attended: attendedCount,
        percentage: percentage
      });
    });

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
    const targetStudents = this.getSelectedStudentsForReport(students);

    if (targetStudents.length === 0) {
      this.showToast("Please select at least one student to print.", "danger");
      return;
    }

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

    targetStudents.forEach((student, idx) => {
      let attendedCount = 0;
      validDates.forEach(date => {
        const records = allAttendance[date] || {};
        const status = records[student.id];
        if (status === "P" || (status === undefined && Object.keys(records).length > 0)) {
          attendedCount++;
        }
      });
      const percentage = classesHeld > 0 ? Math.round((attendedCount / classesHeld) * 100) : 0;
      reportData.push({
        sNo: idx + 1,
        name: student.name,
        combination: student.combination || "",
        attended: attendedCount,
        percentage: percentage
      });
    });

    const filterSubtitle = targetStudents.length < students.length
      ? (targetStudents.length === 1 ? `Student: <strong>${targetStudents[0].name}</strong>` : `Filter: <strong>${targetStudents.length} Selected Students</strong>`)
      : '';

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
        ${filterSubtitle ? `<span>${filterSubtitle}</span>` : ''}
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

  getSavedAdminNumbers() {
    let saved = [];
    try {
      saved = JSON.parse(localStorage.getItem("admin_numbers") || "[]");
    } catch (e) {
      saved = [];
    }
    if (!Array.isArray(saved) || saved.length === 0) {
      const oldPhone = localStorage.getItem("sir_phone_number");
      if (oldPhone) {
        saved = [{ id: "num_1", name: "Sir", phone: oldPhone }];
        localStorage.setItem("admin_numbers", JSON.stringify(saved));
      } else {
        saved = [];
      }
    }
    return saved;
  }

  saveAdminNumbersList(list) {
    localStorage.setItem("admin_numbers", JSON.stringify(list));
    if (list.length > 0) {
      localStorage.setItem("sir_phone_number", list[0].phone);
    }
  }

  renderSavedAdminChips() {
    const container = document.getElementById("saved-admin-numbers-container");
    if (!container) return;
    container.innerHTML = "";

    const list = this.getSavedAdminNumbers();
    if (list.length === 0) {
      container.innerHTML = `<span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">No saved numbers yet. Enter name & phone above and click "+ Save Number".</span>`;
      return;
    }

    const currentPhone = (document.getElementById("admin-phone-input").value || "").trim();

    list.forEach(item => {
      const chip = document.createElement("span");
      const isSelected = item.phone === currentPhone;
      chip.style.cssText = `display: inline-flex; align-items: center; gap: 6px; background: ${isSelected ? 'rgba(59, 130, 246, 0.25)' : 'rgba(255, 255, 255, 0.08)'}; border: 1px solid ${isSelected ? 'var(--primary)' : 'rgba(255, 255, 255, 0.15)'}; border-radius: 16px; padding: 4px 10px; font-size: 0.78rem; cursor: pointer; color: var(--text-main); transition: all 0.2s ease;`;

      chip.innerHTML = `
        <span class="chip-select-btn" data-id="${item.id}"><strong>${item.name}</strong> (${item.phone})</span>
        <span class="chip-remove-btn" data-id="${item.id}" title="Remove number" style="display: flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; background: rgba(239,68,68,0.25); color: var(--danger); font-size: 11px; font-weight: bold; line-height: 1; margin-left: 2px;">×</span>
      `;

      // Select handler
      chip.querySelector(".chip-select-btn").addEventListener("click", () => {
        document.getElementById("admin-name-input").value = item.name;
        document.getElementById("admin-phone-input").value = item.phone;
        this.renderSavedAdminChips();
        this.updateAdminReportTemplate();
      });

      // Remove handler
      chip.querySelector(".chip-remove-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        const updated = list.filter(num => num.id !== item.id);
        this.saveAdminNumbersList(updated);
        if (currentPhone === item.phone) {
          document.getElementById("admin-phone-input").value = "";
        }
        this.renderSavedAdminChips();
        this.showToast(`Removed ${item.name} (${item.phone})`, "info");
      });

      container.appendChild(chip);
    });
  }

  saveCurrentAdminNumber() {
    const nameVal = (document.getElementById("admin-name-input").value || "Anand Sir").trim();
    const phoneVal = (document.getElementById("admin-phone-input").value || "").trim();

    if (!phoneVal) {
      this.showToast("Please enter a phone number to save.", "danger");
      return;
    }

    const list = this.getSavedAdminNumbers();
    const existingIndex = list.findIndex(item => item.phone === phoneVal);

    if (existingIndex >= 0) {
      list[existingIndex].name = nameVal;
    } else {
      list.push({
        id: "num_" + Date.now(),
        name: nameVal,
        phone: phoneVal
      });
    }

    this.saveAdminNumbersList(list);
    this.renderSavedAdminChips();
    this.showToast(`Saved ${nameVal} (${phoneVal})`, "success");
  }

  clearAdminInputs() {
    document.getElementById("admin-phone-input").value = "";
    document.getElementById("admin-name-input").value = "Anand Sir";
    this.renderSavedAdminChips();
    this.updateAdminReportTemplate();
  }

  async openSendToAdminModal() {
    const dateVal = document.getElementById("attendance-date-input").value;
    if (!dateVal) {
      this.showToast("Please select an attendance date first.", "info");
      return;
    }

    const modal = document.getElementById("send-admin-modal");
    const phoneInput = document.getElementById("admin-phone-input");
    const nameInput = document.getElementById("admin-name-input");
    const mainSubjectEl = document.getElementById("attendance-subject-select");
    const adminSubjectEl = document.getElementById("admin-subject-select");

    if (mainSubjectEl && adminSubjectEl) {
      adminSubjectEl.value = mainSubjectEl.value;
    }

    // Load saved phone number if exists
    const list = this.getSavedAdminNumbers();
    if (list.length > 0 && !phoneInput.value) {
      nameInput.value = list[0].name || "Anand Sir";
      phoneInput.value = list[0].phone || "";
    } else if (!nameInput.value) {
      nameInput.value = "Anand Sir";
    }

    this.renderSavedAdminChips();
    await this.updateAdminReportTemplate();

    modal.classList.add("active");
    if (window.lucide) lucide.createIcons();
  }

  async updateAdminReportTemplate() {
    const dateVal = document.getElementById("attendance-date-input").value;
    const adminSubjectEl = document.getElementById("admin-subject-select");
    const mainSubjectEl = document.getElementById("attendance-subject-select");
    const subjectVal = (adminSubjectEl && adminSubjectEl.value) || (mainSubjectEl && mainSubjectEl.value) || "Tuition";

    const adminNameVal = (document.getElementById("admin-name-input").value || "Anand Sir").trim();

    const students = await db.getStudents();
    const records = await db.getAttendance(dateVal);

    const [y, m, d] = dateVal.split("-");
    const formattedDate = `${d}/${m}/${y}`;

    let present = 0;
    let absent = 0;
    const absentees = [];

    students.forEach(s => {
      const status = records[s.id];
      if (status === "A") {
        absent++;
        absentees.push(s);
      } else if (status === "P") {
        present++;
      }
    });

    const greeting = "Good morning Sir";

    const absenteeListText = absentees.length > 0
      ? absentees.map((s, idx) => `${idx + 1}. ${s.name}`).join(", ")
      : "None (All Present)";

    const template = `${greeting}, the absentee students for today ${formattedDate} in ${subjectVal} class are: ${absenteeListText}. Total Absent: ${absent}. Regards, Galaxy Academy.`;

    document.getElementById("admin-report-template").value = template;
  }

  handleCopyAdminReport() {
    const text = document.getElementById("admin-report-template").value;
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      this.showToast("Report copied to clipboard! 📋", "success");
    }).catch(err => {
      console.error("Clipboard copy failed:", err);
      this.showToast("Failed to copy report text.", "danger");
    });
  }

  handleOpenWhatsAppAdmin() {
    const phoneInput = document.getElementById("admin-phone-input");
    const rawPhone = phoneInput.value.trim();
    const text = document.getElementById("admin-report-template").value;

    if (rawPhone) {
      this.saveCurrentAdminNumber();
    }

    let cleanPhone = rawPhone.replace(/[^0-9]/g, "");
    if (cleanPhone.length === 10) {
      cleanPhone = "91" + cleanPhone;
    }

    const encodedText = encodeURIComponent(text);
    const waUrl = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodedText}`
      : `https://api.whatsapp.com/send?text=${encodedText}`;

    window.open(waUrl, "_blank");
  }

  async handleSendAdminAPI() {
    const phoneInput = document.getElementById("admin-phone-input");
    const rawPhone = phoneInput.value.trim();
    const text = document.getElementById("admin-report-template").value;
    const adminNameVal = (document.getElementById("admin-name-input").value || "Anand Sir").trim();
    const templateNameVal = document.getElementById("admin-template-name-input").value.trim();

    if (!rawPhone) {
      this.showToast("Please enter Admin phone number.", "danger");
      return;
    }

    if (!text) {
      this.showToast("Report message is empty.", "danger");
      return;
    }

    this.saveCurrentAdminNumber();

    this.showToast("Sending absentee report to Admin via server API...");

    const dateVal = document.getElementById("attendance-date-input").value;
    const subjectEl = document.getElementById("attendance-subject-select");
    const subjectVal = subjectEl ? subjectEl.value : "Tuition";

    const students = await db.getStudents();
    const records = await db.getAttendance(dateVal);

    const [y, m, d] = dateVal.split("-");
    const formattedDate = `${d}/${m}/${y}`;

    let present = 0;
    let absent = 0;
    const absentees = [];
    students.forEach(s => {
      if (records[s.id] === "A") {
        absent++;
        absentees.push(s.name);
      } else if (records[s.id] === "P") {
        present++;
      }
    });

    try {
      const response = await fetch('/api/notifications/alert-admin', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          phone: rawPhone,
          message: text,
          ...(templateNameVal ? { templateName: templateNameVal } : {}),
          details: {
            date: formattedDate,
            subject: subjectVal,
            absenteeList: absentees.length ? absentees.join(', ') : 'None',
            total: students.length,
            present: present,
            absent: absent,
            adminName: adminNameVal
          }
        })
      });

      const data = await response.json();
      if (response.ok && data.success) {
        this.showToast("✅ Absentee report sent to Admin successfully!", "success");
        document.getElementById("send-admin-modal").classList.remove("active");
      } else {
        throw new Error(data.message || 'Failed to send alert');
      }
    } catch (err) {
      console.error("Failed to send admin alert:", err);
      this.showToast(`Failed: ${err.message}`, "danger");
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
                 maxlength="3" 
                 ${isPresent ? "" : "disabled"} style="font-weight: bold;">
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
          totalInput.disabled = false;
          cetInput.value = "";
          theoryInput.value = "";
          totalInput.value = "";
        } else {
          cetInput.disabled = true;
          theoryInput.disabled = true;
          totalInput.disabled = true;
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

    container.querySelectorAll(".test-total-marks-field").forEach(input => {
      input.addEventListener("input", () => {
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
    const container = document.getElementById("test-students-list");
    const checkboxes = container.querySelectorAll(".test-attendance-checkbox");

    if (!checkboxes || checkboxes.length === 0) {
      console.warn("Marks sheet is not active or loaded; skipping save to protect data.");
      return;
    }

    const students = await db.getStudents();
    const results = {};

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
    const sumTotal = Number(document.getElementById("test-sum-total").value) || (cetTotal + theoryTotal);

    const meta = {
      testType: type,
      testNumber: num,
      date: date,
      cetTotal: cetTotal,
      theoryTotal: theoryTotal,
      sumTotal: sumTotal
    };

    const saveBtn = document.getElementById("save-test-marks-btn");
    const originalLabel = saveBtn ? saveBtn.innerHTML : null;
    if (saveBtn) { saveBtn.disabled = true; saveBtn.innerHTML = 'Saving...'; }

    try {
      await db.saveTestMarks(this.selectedTest, this.selectedSubject, results, meta);
    } catch (err) {
      // A silent save was the earlier bug — surface the failure to the admin
      // and keep the sheet open so nothing they typed is lost.
      console.error('Failed to save test marks:', err);
      this.showToast(`Failed to save test marks: ${err.message || 'Server error'}`, "danger");
      if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = originalLabel; }
      return;
    }

    if (saveBtn) { saveBtn.disabled = false; saveBtn.innerHTML = originalLabel; }
    this.showToast(`Test marks successfully saved.`);
    this.calculateAverageScoreBadge();

    // Go back to setup panel
    document.getElementById("test-setup-panel").style.display = "block";
    document.getElementById("test-sheet-panel").style.display = "none";

    // Refresh history list
    this.loadPreviousTests();
  }

  async printMarksSheet() {
    // Only persist if sheet panel is currently open and rendered
    const sheetPanel = document.getElementById("test-sheet-panel");
    if (sheetPanel && sheetPanel.style.display !== "none") {
      await this.handleSaveTestMarks();
    }

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

    if (!await this.confirmAction(`Are you sure you want to send WhatsApp notifications to the ${absentees.length} absent student(s)?`)) {
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
      if (!response.ok) throw new Error(data.message || 'Failed to send broadcast');

      // The server now returns { delivered, total, results:[{success,error}] }
      // so we can distinguish "0/2 delivered" (all failed) from partial and full success.
      const delivered = Number(data.delivered ?? 0);
      const total = Number(data.total ?? absenteePayload.length);
      const failedRecipients = (data.results || []).filter(r => !r.success);
      if (delivered === 0) {
        const firstError = failedRecipients[0]?.error || 'unknown error';
        this.showToast(`WhatsApp broadcast FAILED — 0/${total} delivered. First error: ${firstError}`, "danger");
      } else if (delivered < total) {
        this.showToast(`Partial send — ${delivered}/${total} delivered. ${failedRecipients.length} failed.`, "danger");
      } else {
        this.showToast(`Successfully sent ${delivered} WhatsApp notification(s)!`, "success");
      }
      // Refresh the log strip either way so the admin can see the recipient breakdown.
      this.loadAttendanceReminderLog(dateVal);
    } catch (err) {
      console.error("Failed to send WhatsApp broadcast:", err);
      this.showToast(`Failed to send WhatsApp notification: ${err.message || 'Check server console.'}`, "danger");
    }
  }

  async loadAttendanceReminderLog(dateVal) {
    const container = document.getElementById('attendance-reminder-log');
    if (!container || !dateVal) return;
    try {
      const { logs } = await db.getAttendanceReminders(dateVal);
      if (!logs || !logs.length) { container.innerHTML = ''; return; }
      const rows = logs.map(log => {
        const time = new Date(log.sentAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        const sent = Number(log.sent || 0);
        const total = Number(log.total || (log.recipients ? log.recipients.length : 0));
        // Match the icon + border color to actual delivery instead of always ✅.
        let icon = '✅'; let border = 'var(--success)'; let statusLabel = 'Absentee message sent';
        if (sent === 0) { icon = '❌'; border = 'var(--danger)'; statusLabel = 'Absentee message FAILED'; }
        else if (sent < total) { icon = '⚠️'; border = '#f59e0b'; statusLabel = 'Absentee message partially sent'; }

        const namesList = (log.recipients || []).map(r => {
          const tooltip = r.success ? '' : ` title="${this.escapeHtml(r.error || 'Unknown error')}"`;
          return `<span${tooltip} style="display:inline-block; padding:2px 6px; border-radius:10px; margin:2px; font-size:.68rem; background:${r.success ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)'}; color:${r.success ? 'var(--success)' : 'var(--danger)'}; cursor:${r.success ? 'default' : 'help'};">${r.success ? '✓' : '✕'} ${this.escapeHtml(r.studentName || r.phone || 'student')}</span>`;
        }).join('');

        // Also list the distinct error reasons below so admins can act without hovering each chip.
        const errorReasons = Array.from(new Set((log.recipients || [])
          .filter(r => !r.success && r.error)
          .map(r => r.error)));
        const errorsHtml = errorReasons.length
          ? `<div style="margin-top:8px; padding:8px; border-left:3px solid var(--danger); background:rgba(239,68,68,.08); font-size:.72rem; color:var(--danger);">
               <strong>Errors reported by WhatsApp:</strong>
               <ul style="margin:4px 0 0 16px; padding:0;">${errorReasons.map(e => `<li>${this.escapeHtml(e)}</li>`).join('')}</ul>
             </div>`
          : '';

        return `
          <div style="border-left:4px solid ${border}; border:1px solid var(--border-color); border-left-width:4px; border-radius:8px; padding:8px 10px; margin-top:6px; background:rgba(255,255,255,0.02);">
            <div style="display:flex; justify-content:space-between; font-size:.78rem;">
              <strong>${icon} ${this.escapeHtml(statusLabel)}</strong>
              <span style="color:var(--text-muted);">${time} · ${sent}/${total} delivered</span>
            </div>
            <div style="margin-top:6px;">${namesList}</div>
            ${errorsHtml}
          </div>`;
      }).join('');
      container.innerHTML = rows;
    } catch (err) {
      console.warn('Could not load attendance reminder log:', err.message);
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

    // Load CET / Theory totals
    const meta = await db.getTestMetadata(testId, subject);
    const cetTotal = meta.cetTotal !== undefined ? meta.cetTotal : 25;
    const theoryTotal = meta.theoryTotal !== undefined ? meta.theoryTotal : 25;
    const cetTotalEl = document.getElementById("test-cet-total");
    const theoryTotalEl = document.getElementById("test-theory-total");
    const sumTotalEl = document.getElementById("test-sum-total");

    if (cetTotalEl) cetTotalEl.value = cetTotal;
    if (theoryTotalEl) theoryTotalEl.value = theoryTotal;
    // Honour a stored custom sumTotal (e.g. 40 when cet+theory happens to be 50);
    // fall back to the cet+theory sum when the metadata doesn't provide one.
    const storedSum = Number(meta.sumTotal);
    if (sumTotalEl) sumTotalEl.value = Number.isFinite(storedSum) && storedSum > 0
      ? storedSum
      : (cetTotal + theoryTotal);
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
  formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2
    }).format(Number(amount) || 0);
  }

  escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character]));
  }

  buildFeeMessage(template, student, totals) {
    const name = student.name;
    const paid = this.formatCurrency(totals.paid);
    const balance = this.formatCurrency(totals.balance);
    const totalFee = this.formatCurrency(totals.totalFee);
    const deadline = totals.deadline || '[DATE]';
    const templates = {
      balance_reminder: `Dear Parent, this is a fee update for ${name}. Total tuition fee: ${totalFee}. Amount received: ${paid}. Outstanding balance: ${balance}. Please contact Galaxy Academy if you need any clarification.`,
      payment_thanks: `Dear Parent, thank you for the fee payment for ${name}. Total tuition fee: ${totalFee}. Amount received so far: ${paid}. Remaining balance: ${balance}. Regards, Galaxy Academy.`,
      fee_reminder: `Dear parent of ${name} 🙏\n\nHope your child is doing well in their studies!\n\nThis is a gentle reminder regarding the pending fee balance.\n\n💰 Total Fee: ${totalFee}\n✅ Received: ${paid}\n⏳ Balance Due: ${balance}\n📅 Due Date: ${deadline}\n\nKindly clear the balance before ${deadline} to ensure uninterrupted classes.\n\n💳 UPI / Cash accepted at the centre.\n\nFor queries, message us personally. Thank you! 🌟\n\n— Galaxy Academy 📚`,
      fee_reminder_zero: `Dear parent of ${name} 🙏\n\nHope your child is doing well!\n\nWe noticed that no fee payment has been received yet for this term.\n\n💰 Total Fee: ${totalFee}\n❌ Received: ₹0\n⏳ Full Amount Due: ${balance}\n📅 Due Date: ${deadline}\n\nKindly arrange at least a partial payment before ${deadline}. Even installments are welcome.\n\n💳 UPI / Cash accepted at the centre.\n\nFor queries or to discuss a payment plan, message us personally. Thank you! 🙏\n\n— Galaxy Academy 📚`,
      fee_followup_personal: `Dear parent of ${name} 🙏\n\nThank you for the payment of ${paid} received so far! ${name} is doing really well and we are happy to have them.\n\nJust a gentle reminder — the remaining fee balance of ${balance} is still pending.\n\nKindly arrange the payment before ${deadline}.\n🔹 Even partial payment is fine\n🔹 Monthly installments can be arranged\n\n💳 UPI / Cash at centre\n\nPlease reply to this message or call us to discuss. Thank you! 🙏\n\n— Galaxy Academy 📚`,
      fee_followup_personal_zero: `Dear parent of ${name} 🙏\n\nHope ${name} is doing well in their studies!\n\nWe wanted to personally reach out regarding the fee for this term. As of now, the full fee of ${totalFee} is still pending.\n\nWe completely understand that finances need planning. Please let us know:\n🔹 Can you arrange a partial payment before ${deadline}?\n🔹 Would monthly installments work better?\n\nWe want to ensure ${name}'s classes continue without interruption and are happy to work out a comfortable plan.\n\n💳 UPI / Cash at centre\n\nThank you for your trust! 🙏\n\n— Galaxy Academy 📚`,
      eve_reminder: `Dear parent of ${name} 🙏\n\nJust a reminder that tomorrow ${deadline} is the last date for the fee payment.\n\n⏳ Balance Due: ${balance}\n\nKindly arrange today itself to avoid any interruption to classes.\n\n💳 UPI / Cash accepted at the centre.\n\nThank you! 🙏\n\n— Galaxy Academy 📚`,
      deadline_missed: `Dear parent of ${name} 🙏\n\nToday ${deadline} was the last date for the fee payment of ${balance}.\n\nRequest you to kindly arrange the payment by tomorrow morning. Please confirm when you can pay.\n\n💳 UPI / Cash accepted at the centre.\n\nThank you for your understanding. 🙏\n\n— Galaxy Academy 📚`,
      final_warning: `Dear parent of ${name} 🙏\n\nThe fee balance of ${balance} for ${name}'s classes is now significantly overdue. The deadline was ${deadline}.\n\nRequest you to kindly arrange payment immediately to ensure ${name}'s classes continue without any interruption.\n\nPlease respond today. Thank you. 🙏\n\n— Galaxy Academy 📚`
    };
    return templates[template] || templates.balance_reminder;
  }

  async loadPaymentsListLegacy() {
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
      const paymentData = allPayments[student.id] || {};
      // Supports existing payment documents while using the new fee summary shape.
      const studentPayments = paymentData.records || paymentData;
      const currentPay = studentPayments[month] || { status: 'due', amount: '', notes: '' };
      const totalFee = Number(paymentData.totalFee) || 65000;
      const totalPaid = Object.values(studentPayments).reduce((sum, record) => {
        if (!record || record.status === 'due') return sum;
        const amount = Number(record.amount);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0);
      const balance = Math.max(totalFee - totalPaid, 0);

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
            <span style="font-weight: 700; font-size: 0.95rem;">${idx + 1}. ${this.escapeHtml(student.name)}</span>
            <span class="badge" style="font-size: 0.7rem; background-color: rgba(59, 130, 246, 0.2); color: var(--student-accent-hover); margin-left: 6px;">#${student.number || student.id}</span>
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            <select class="select-field pay-status-select" data-id="${student.id}" style="padding: 4px 8px; font-size: 0.8rem; width: auto;">
              <option value="due" ${currentPay.status === 'due' ? 'selected' : ''}>🔴 DUE</option>
              <option value="paid" ${currentPay.status === 'paid' ? 'selected' : ''}>✅ PAID</option>
              <option value="partial" ${currentPay.status === 'partial' ? 'selected' : ''}>🟡 PARTIAL</option>
            </select>
          </div>
        </div>
        <div style="display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:8px; margin-top:12px;">
          <div style="background:rgba(139,92,246,.08); padding:8px; border-radius:7px;"><div style="font-size:.7rem; color:var(--text-muted);">TOTAL FEE</div><strong class="fee-total-display">${this.formatCurrency(totalFee)}</strong></div>
          <div style="background:rgba(34,197,94,.08); padding:8px; border-radius:7px;"><div style="font-size:.7rem; color:var(--text-muted);">PAID</div><strong class="fee-paid-display">${this.formatCurrency(totalPaid)}</strong></div>
          <div style="background:rgba(239,68,68,.08); padding:8px; border-radius:7px;"><div style="font-size:.7rem; color:var(--text-muted);">BALANCE</div><strong class="fee-balance-display">${this.formatCurrency(balance)}</strong></div>
        </div>
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:12px;">
          <div class="input-group" style="margin:0;"><label>Total fee for this student</label><input class="input-field fee-total-input" type="number" min="0" step="0.01" value="${totalFee}"></div>
          <div class="input-group" style="margin:0;"><label>Payment received in ${this.escapeHtml(month)}</label><input class="input-field fee-amount-input" type="number" min="0" step="0.01" value="${this.escapeHtml(currentPay.amount || '')}" placeholder="0.00"></div>
        </div>
        <div class="input-group" style="margin:10px 0 0;"><label>Payment note (optional)</label><input class="input-field fee-notes-input" maxlength="300" value="${this.escapeHtml(currentPay.notes || '')}" placeholder="e.g. UPI reference / instalment"></div>
        <button class="btn btn-secondary btn-full save-fee-btn" style="margin-top:10px; padding:8px;">Save Fee Details</button>
        <div style="border-top:1px solid var(--border-color); margin-top:14px; padding-top:12px;">
          <div style="display:flex; justify-content:space-between; gap:8px; align-items:center;"><strong style="font-size:.85rem;">Parent Message Preview</strong><span class="fee-message-status" style="font-size:.72rem; color:var(--text-muted);">${paymentData.lastFeeMessage ? `Last sent: ${this.escapeHtml(paymentData.lastFeeMessage.template || 'template')} · ${new Date(paymentData.lastFeeMessage.sentAt).toLocaleDateString('en-IN')}` : 'Not sent yet'}</span></div>
          <select class="select-field fee-template-select" style="margin-top:8px; font-size:.82rem;"><option value="balance_reminder">Balance reminder</option><option value="payment_thanks">Payment received / thank you</option><option value="monthly_reminder">Monthly fee reminder</option></select>
          <div class="fee-message-preview" style="margin-top:8px; padding:9px; border-radius:7px; background:rgba(255,255,255,.04); font-size:.8rem; line-height:1.45;"></div>
          <div style="display:flex; gap:8px; margin-top:8px;"><button class="btn btn-secondary copy-fee-message-btn" style="flex:1; padding:8px;">Copy Preview</button><button class="btn btn-primary" style="flex:1; padding:8px;" disabled title="Enable only after Meta approves this message template">Send after template approval</button></div>
        </div>
      `;

      const statusInput = div.querySelector(".pay-status-select");
      const totalInput = div.querySelector(".fee-total-input");
      const amountInput = div.querySelector(".fee-amount-input");
      const notesInput = div.querySelector(".fee-notes-input");
      const templateInput = div.querySelector(".fee-template-select");
      const preview = div.querySelector(".fee-message-preview");
      const totals = () => {
        const updatedTotal = Number(totalInput.value) || 0;
        const updatedMonthAmount = Number(amountInput.value) || 0;
        const previousAmount = Number(currentPay.amount) || 0;
        const updatedPaid = Math.max(0, totalPaid - previousAmount + updatedMonthAmount);
        return { totalFee: updatedTotal, paid: updatedPaid, balance: Math.max(updatedTotal - updatedPaid, 0), month };
      };
      const renderPreview = () => { preview.textContent = this.buildFeeMessage(templateInput.value, student, totals()); };
      templateInput.addEventListener('change', renderPreview);
      totalInput.addEventListener('input', renderPreview);
      amountInput.addEventListener('input', renderPreview);
      renderPreview();

      div.querySelector(".save-fee-btn").addEventListener("click", async () => {
        try {
          const newTotal = Number(totalInput.value);
          const amount = amountInput.value.trim();
          if (!Number.isFinite(newTotal) || newTotal < 0) throw new Error('Enter a valid total fee.');
          await db.saveTotalFee(student.id, newTotal);
          await db.savePayment(student.id, month, statusInput.value, amount, notesInput.value.trim());
          this.showToast(`Fee details for ${student.name} saved.`);
          await this.loadPaymentsList();
        } catch (error) {
          this.showToast(error.message || 'Unable to save fee details.', 'danger');
        }
      });

      div.querySelector('.copy-fee-message-btn').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(preview.textContent);
          this.showToast('Fee message copied. Review it before sending to the parent.');
        } catch (error) {
          this.showToast('Unable to copy the message. Please select and copy it manually.', 'danger');
        }
      });

      container.appendChild(div);
    });

    if (container.children.length === 0) {
      container.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 16px;">No students match filter '${filter}'.</p>`;
    }
  }

  async loadPaymentsListMonthlyLegacy() {
    const month = document.getElementById("payment-month-select").value;
    const filter = document.getElementById("payment-filter-status").value;
    const container = document.getElementById("payments-list-container");
    const detail = document.getElementById("payment-student-detail-container");
    const [students, allPayments] = await Promise.all([db.getStudents(), db.getPayments()]);
    const dueStudents = [];
    const summaries = students.map((student, index) => {
      const paymentData = allPayments[student.id] || {};
      const records = paymentData.records || paymentData;
      const current = records[month] || { status: 'due', amount: '', notes: '' };
      const totalFee = Number(paymentData.totalFee) || 65000;
      const paid = Object.values(records).reduce((sum, record) => sum + (record?.status === 'due' ? 0 : (Number(record?.amount) || 0)), 0);
      const balance = Math.max(totalFee - paid, 0);
      const summary = { student, index, paymentData, records, current, totalFee, paid, balance, month };
      if (balance > 0) dueStudents.push(summary);
      return summary;
    });
    const displayed = filter === 'due' ? dueStudents : summaries;
    container.innerHTML = displayed.length ? '' : '<p style="text-align:center; color:var(--text-muted); padding:20px;">No students have an outstanding fee balance.</p>';
    displayed.forEach(item => {
      const row = document.createElement('div');
      row.setAttribute('role', 'button');
      row.setAttribute('tabindex', '0');
      row.setAttribute('aria-label', `Open fee details for ${item.student.name}`);
      row.className = 'card';
      row.style.cssText = 'width:100%; text-align:left; margin-bottom:10px; padding:14px; cursor:pointer; color:inherit;';
      row.innerHTML = `<div style="display:flex; justify-content:space-between; align-items:center; gap:10px;"><div><strong>${item.index + 1}. ${this.escapeHtml(item.student.name)}</strong><span class="badge" style="font-size:.7rem; margin-left:6px;">#${this.escapeHtml(String(item.student.number || item.student.id))}</span><div style="font-size:.75rem; color:var(--text-muted); margin-top:4px;">Tap to view fee details and message template</div></div><div style="text-align:right;"><div style="font-size:.7rem; color:var(--text-muted);">DUE AMOUNT</div><strong style="color:var(--danger); font-size:1rem;">${this.formatCurrency(item.balance)}</strong></div></div>`;
      const openDetails = () => {
        this.showPaymentStudentDetailMonthlyLegacy(item, detail);
        detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
      row.addEventListener('click', openDetails);
      row.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openDetails();
        }
      });
      container.appendChild(row);
    });
    document.getElementById('bulk-fee-message-help').textContent = `${dueStudents.length} student(s) have an outstanding balance. Previews are copied for review; no WhatsApp messages are sent yet.`;
    document.getElementById('copy-all-due-messages-btn').onclick = async () => {
      const template = document.getElementById('bulk-fee-template-select').value;
      const messages = dueStudents.map(item => this.buildFeeMessage(template, item.student, item)).join('\n\n---\n\n');
      if (!messages) return this.showToast('There are no due messages to copy.', 'info');
      try { await navigator.clipboard.writeText(messages); this.showToast(`${dueStudents.length} fee-message previews copied for review.`); }
      catch { this.showToast('Unable to copy messages. Please try again.', 'danger'); }
    };
  }

  showPaymentStudentDetailMonthlyLegacy(item, detail) {
    const { student, paymentData, current, totalFee, paid, balance, month } = item;
    detail.style.display = 'block';
    detail.innerHTML = `<div class="card" style="padding:14px;"><div style="display:flex; justify-content:space-between; gap:8px;"><div><h3 style="margin:0; font-size:1rem;">${this.escapeHtml(student.name)}</h3><span style="font-size:.75rem; color:var(--text-muted);">Fee details for ${this.escapeHtml(month)}</span></div><button class="btn btn-secondary close-fee-detail-btn" style="padding:5px 9px;">Close</button></div><div style="display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:8px; margin-top:12px;"><div><small>Total fee</small><strong style="display:block;">${this.formatCurrency(totalFee)}</strong></div><div><small>Paid</small><strong style="display:block; color:var(--success);">${this.formatCurrency(paid)}</strong></div><div><small>Balance</small><strong style="display:block; color:var(--danger);">${this.formatCurrency(balance)}</strong></div></div><div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-top:12px;"><div class="input-group" style="margin:0;"><label>Total fee</label><input class="input-field detail-total-fee" type="number" min="0" step="0.01" value="${totalFee}"></div><div class="input-group" style="margin:0;"><label>Received in ${this.escapeHtml(month)}</label><input class="input-field detail-amount" type="number" min="0" step="0.01" value="${this.escapeHtml(current.amount || '')}"></div></div><div class="input-group" style="margin-top:8px;"><label>Payment status</label><select class="select-field detail-status"><option value="due" ${current.status === 'due' ? 'selected' : ''}>Due</option><option value="partial" ${current.status === 'partial' ? 'selected' : ''}>Partial</option><option value="paid" ${current.status === 'paid' ? 'selected' : ''}>Paid</option></select></div><div class="input-group" style="margin-top:8px;"><label>Note</label><input class="input-field detail-notes" maxlength="300" value="${this.escapeHtml(current.notes || '')}"></div><button class="btn btn-primary btn-full save-detail-fee-btn" style="margin-top:8px;">Save Fee Details</button><div style="border-top:1px solid var(--border-color); margin-top:14px; padding-top:12px;"><div style="display:flex; justify-content:space-between; gap:8px;"><strong style="font-size:.85rem;">Parent Message Preview</strong><span style="font-size:.72rem; color:var(--text-muted);">${paymentData.lastFeeMessage ? `Last sent: ${this.escapeHtml(paymentData.lastFeeMessage.template || 'template')} · ${new Date(paymentData.lastFeeMessage.sentAt).toLocaleDateString('en-IN')}` : 'Not sent yet'}</span></div><select class="select-field detail-template" style="margin-top:8px;"><option value="balance_reminder">Balance reminder</option><option value="payment_thanks">Payment received / thank you</option><option value="monthly_reminder">Monthly fee reminder</option></select><div class="detail-preview" style="margin-top:8px; padding:9px; border-radius:7px; background:rgba(255,255,255,.04); font-size:.8rem; line-height:1.45;"></div><button class="btn btn-secondary btn-full copy-detail-message-btn" style="margin-top:8px;">Copy Preview for Review</button></div></div>`;
    const totalInput = detail.querySelector('.detail-total-fee'); const amountInput = detail.querySelector('.detail-amount'); const template = detail.querySelector('.detail-template'); const preview = detail.querySelector('.detail-preview');
    const render = () => { const newTotal = Number(totalInput.value) || 0; const newPaid = Math.max(0, paid - (Number(current.amount) || 0) + (Number(amountInput.value) || 0)); preview.textContent = this.buildFeeMessage(template.value, student, { totalFee: newTotal, paid: newPaid, balance: Math.max(newTotal - newPaid, 0), month }); };
    [totalInput, amountInput, template].forEach(control => control.addEventListener('input', render)); render();
    detail.querySelector('.close-fee-detail-btn').addEventListener('click', () => { detail.style.display = 'none'; detail.innerHTML = ''; });
    detail.querySelector('.save-detail-fee-btn').addEventListener('click', async () => { try { const total = Number(totalInput.value); if (!Number.isFinite(total) || total < 0) throw new Error('Enter a valid total fee.'); await db.saveTotalFee(student.id, total); await db.savePayment(student.id, month, detail.querySelector('.detail-status').value, amountInput.value.trim(), detail.querySelector('.detail-notes').value.trim()); this.showToast(`Fee details for ${student.name} saved.`); detail.style.display = 'none'; await this.loadPaymentsList(); } catch (error) { this.showToast(error.message || 'Unable to save fee details.', 'danger'); } });
    detail.querySelector('.copy-detail-message-btn').addEventListener('click', async () => { try { await navigator.clipboard.writeText(preview.textContent); this.showToast('Fee message copied. Review it before sending.'); } catch { this.showToast('Unable to copy the message.', 'danger'); } });
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
        if (view) this.switchView(view);
      });
    });
    document.getElementById("quick-attendance-btn").addEventListener("click", () => this.switchView("attendance"));
    document.getElementById("quick-tests-btn").addEventListener("click", () => this.switchView("tests"));
    document.getElementById("quick-payments-btn").addEventListener("click", () => this.switchView("payments"));

    // Mobile "More" dropdown toggle
    const moreToggle = document.getElementById("nav-more-toggle");
    const moreDropdown = document.getElementById("nav-more-dropdown");
    const moreOverlay = document.getElementById("nav-more-overlay");
    const moreClose = document.getElementById("nav-more-close");

    const openMoreDropdown = () => {
      moreDropdown.classList.add("active");
      moreOverlay.classList.add("active");
      // Highlight the currently active view in the More list
      const moreItems = moreDropdown.querySelectorAll(".nav-more-item");
      moreItems.forEach(mi => {
        mi.classList.toggle("active-view", mi.dataset.view === this.currentView);
      });
    };
    const closeMoreDropdown = () => {
      moreDropdown.classList.remove("active");
      moreOverlay.classList.remove("active");
    };

    if (moreToggle) moreToggle.addEventListener("click", openMoreDropdown);
    if (moreClose) moreClose.addEventListener("click", closeMoreDropdown);
    if (moreOverlay) moreOverlay.addEventListener("click", closeMoreDropdown);

    // Handle clicks on More dropdown items
    if (moreDropdown) {
      moreDropdown.querySelectorAll(".nav-more-item").forEach(item => {
        item.addEventListener("click", () => {
          const view = item.dataset.view;
          if (view) {
            this.switchView(view);
            closeMoreDropdown();
            // On mobile, when a "More" view is active, highlight the More button itself
            const moreBtn = document.getElementById("nav-more-toggle");
            if (moreBtn) {
              // Remove active from all visible nav items first (already done in switchView)
              moreBtn.classList.add("active");
            }
          }
        });
      });
    }


    // Discontinue modal handlers
    document.getElementById('discontinue-confirm-btn').addEventListener('click', () => this.handleDiscontinueStudent());
    document.getElementById('discontinue-cancel-btn').addEventListener('click', () => {
      document.getElementById('discontinue-modal').style.display = 'none';
    });

    // Discontinued detail close
    document.getElementById('disc-detail-close-btn').addEventListener('click', () => {
      document.getElementById('discontinued-detail-panel').style.display = 'none';
    });

    // Follow-up tab switching
    document.querySelectorAll('.followup-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.followup-tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.followup-tab-content').forEach(c => c.style.display = 'none');
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        if (tab === 'active') document.getElementById('followup-active-container').style.display = 'block';
        else if (tab === 'logs') document.getElementById('followup-logs-container').style.display = 'block';
        else if (tab === 'paid') document.getElementById('followup-paid-container').style.display = 'block';
      });
    });

    // Follow-up refresh
    document.getElementById('followup-refresh-btn').addEventListener('click', () => this.loadFeeFollowups());

    // Follow-up start
    document.getElementById('followup-start-btn').addEventListener('click', () => this.handleStartFollowups());

    // Follow-up stage modal
    document.getElementById('followup-stage-form').addEventListener('submit', (e) => this.handleFollowupStageSend(e));
    document.getElementById('followup-stage-cancel').addEventListener('click', () => {
      document.getElementById('followup-stage-modal').style.display = 'none';
    });
    document.getElementById('followup-stage-modal-close').addEventListener('click', () => {
      document.getElementById('followup-stage-modal').style.display = 'none';
    });

    // Login Screen Handlers
    document.getElementById("login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const inputVal = document.getElementById("login-passcode").value;
      try {
        await db.adminLogin(inputVal);
        await this.showBatchWorkspace();
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
    document.getElementById('change-batch-btn').addEventListener('click', () => this.showBatchWorkspace());
    document.getElementById('batch-form').addEventListener('submit', async event => {
      event.preventDefault();
      try {
        const batch = await db.createBatch(Number(document.getElementById('batch-number-input').value), Number(document.getElementById('batch-year-input').value), Number(document.getElementById('batch-grade-input').value));
        this.activateBatch(await db.selectBatch(batch.id));
      } catch (error) { this.showToast(error.message || 'Unable to create batch.', 'danger'); }
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

    // Send to Admin (Sir) Handlers
    const sendToAdminBtn = document.getElementById("send-to-admin-btn");
    if (sendToAdminBtn) sendToAdminBtn.addEventListener("click", () => this.openSendToAdminModal());

    const dashSendToAdminBtn = document.getElementById("dash-send-to-admin-btn");
    if (dashSendToAdminBtn) {
      dashSendToAdminBtn.addEventListener("click", () => {
        const today = this.getLocalDateString();
        const dateInput = document.getElementById("attendance-date-input");
        if (dateInput) dateInput.value = today;
        this.openSendToAdminModal();
      });
    }

    const sendAdminModalClose = document.getElementById("send-admin-modal-close");
    if (sendAdminModalClose) sendAdminModalClose.addEventListener("click", () => {
      document.getElementById("send-admin-modal").classList.remove("active");
    });

    const copyAdminReportBtn = document.getElementById("copy-admin-report-btn");
    if (copyAdminReportBtn) copyAdminReportBtn.addEventListener("click", () => this.handleCopyAdminReport());

    const openWhatsAppAdminBtn = document.getElementById("open-whatsapp-admin-btn");
    if (openWhatsAppAdminBtn) openWhatsAppAdminBtn.addEventListener("click", () => this.handleOpenWhatsAppAdmin());

    const sendAdminApiBtn = document.getElementById("send-admin-api-btn");
    if (sendAdminApiBtn) sendAdminApiBtn.addEventListener("click", () => this.handleSendAdminAPI());

    const saveAdminNumBtn = document.getElementById("save-admin-number-btn");
    if (saveAdminNumBtn) saveAdminNumBtn.addEventListener("click", () => this.saveCurrentAdminNumber());

    const clearAdminNumBtn = document.getElementById("clear-admin-number-btn");
    if (clearAdminNumBtn) clearAdminNumBtn.addEventListener("click", () => this.clearAdminInputs());

    const adminNameInputEl = document.getElementById("admin-name-input");
    if (adminNameInputEl) {
      adminNameInputEl.addEventListener("input", () => {
        if (document.getElementById("send-admin-modal").classList.contains("active")) {
          this.updateAdminReportTemplate();
        }
      });
    }

    const subjectSelectEl = document.getElementById("attendance-subject-select");
    if (subjectSelectEl) {
      subjectSelectEl.addEventListener("change", () => {
        const adminSub = document.getElementById("admin-subject-select");
        if (adminSub) adminSub.value = subjectSelectEl.value;
        if (document.getElementById("send-admin-modal").classList.contains("active")) {
          this.updateAdminReportTemplate();
        }
      });
    }

    const adminSubjectSelectEl = document.getElementById("admin-subject-select");
    if (adminSubjectSelectEl) {
      adminSubjectSelectEl.addEventListener("change", () => {
        const mainSub = document.getElementById("attendance-subject-select");
        if (mainSub) mainSub.value = adminSubjectSelectEl.value;
        if (document.getElementById("send-admin-modal").classList.contains("active")) {
          this.updateAdminReportTemplate();
        }
      });
    }

    const resetAdminTemplateBtn = document.getElementById("reset-admin-template-btn");
    if (resetAdminTemplateBtn) {
      resetAdminTemplateBtn.addEventListener("click", () => {
        this.updateAdminReportTemplate();
        this.showToast("Report text reset to default template.", "info");
      });
    }

    // Leave Day Handlers
    const leaveBtn = document.getElementById("attendance-leave-btn");
    if (leaveBtn) leaveBtn.addEventListener("click", () => this.handleMarkLeaveDay());

    const unleaveBtn = document.getElementById("attendance-unleave-btn");
    if (unleaveBtn) unleaveBtn.addEventListener("click", () => this.handleUnmarkLeaveDay());

    // Monthly Report Handlers
    const studentReportSelect = document.getElementById("monthly-report-student-select");
    if (studentReportSelect) {
      studentReportSelect.addEventListener("change", (e) => {
        const container = document.getElementById("monthly-report-student-checkboxes-container");
        if (container) {
          container.style.display = e.target.value === "multiple" ? "block" : "none";
        }
      });
    }

    const selectAllBtn = document.getElementById("report-select-all-students");
    if (selectAllBtn) {
      selectAllBtn.addEventListener("click", (e) => {
        e.preventDefault();
        document.querySelectorAll(".report-student-cb").forEach(cb => cb.checked = true);
      });
    }

    const deselectAllBtn = document.getElementById("report-deselect-all-students");
    if (deselectAllBtn) {
      deselectAllBtn.addEventListener("click", (e) => {
        e.preventDefault();
        document.querySelectorAll(".report-student-cb").forEach(cb => cb.checked = false);
      });
    }

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
    const feeFilter = document.getElementById("payment-fee-filter");
    if (feeFilter) feeFilter.addEventListener("change", () => this.loadPaymentsList());

    const viewSheetsBtn = document.getElementById("view-fees-in-sheets-btn");
    if (viewSheetsBtn) viewSheetsBtn.addEventListener("click", () => this.openFeesInGoogleSheets());

    const selectFilterBtn = document.getElementById("fee-reminder-select-filter-btn");
    if (selectFilterBtn) selectFilterBtn.addEventListener("click", () => {
      this.feeReminderSelection = this.feeReminderSelection || new Set();
      (this.paymentFilteredIds || new Set()).forEach(id => this.feeReminderSelection.add(id));
      this.renderFeeReminderRecipients();
    });
    const clearSelBtn = document.getElementById("fee-reminder-clear-btn");
    if (clearSelBtn) clearSelBtn.addEventListener("click", () => {
      this.feeReminderSelection = new Set();
      this.renderFeeReminderRecipients();
    });
    const sendReminderBtn = document.getElementById("fee-reminder-send-btn");
    if (sendReminderBtn) sendReminderBtn.addEventListener("click", () => this.sendFeeReminders());
    const refreshLogBtn = document.getElementById("fee-reminder-log-refresh-btn");
    if (refreshLogBtn) refreshLogBtn.addEventListener("click", () => this.loadFeeReminderLog());

    // Notification / Broadcast Handlers
    document.getElementById("send-absentees-sms-btn").addEventListener("click", () => this.handleSendAbsenteesSMS());

    // Exam Notification Handlers
    const examDateIds = ['exam-date-physics', 'exam-date-chemistry', 'exam-date-maths', 'exam-date-biocs'];
    examDateIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => this.updateExamPreview());
    });
    const examTypeSelect = document.getElementById('exam-type-select');
    if (examTypeSelect) examTypeSelect.addEventListener('change', () => this.updateExamPreview());
    const examSelectAllBtn = document.getElementById('exam-select-all-btn');
    if (examSelectAllBtn) examSelectAllBtn.addEventListener('click', () => {
      this.examStudentSelection = this.examStudentSelection || new Set();
      (this.examStudentsList || []).forEach(s => this.examStudentSelection.add(s.id));
      this.renderExamStudentList();
    });
    const examDeselectAllBtn = document.getElementById('exam-deselect-all-btn');
    if (examDeselectAllBtn) examDeselectAllBtn.addEventListener('click', () => {
      this.examStudentSelection = new Set();
      this.renderExamStudentList();
    });
    const examSendBtn = document.getElementById('exam-send-btn');
    if (examSendBtn) examSendBtn.addEventListener('click', () => this.sendExamNotifications());
    const examCopyBtn = document.getElementById('exam-copy-preview-btn');
    if (examCopyBtn) examCopyBtn.addEventListener('click', () => {
      const preview = document.getElementById('exam-message-preview');
      if (preview) {
        navigator.clipboard.writeText(preview.textContent).then(() => this.showToast('Message copied to clipboard!'));
      }
    });
    const examOpenWaBtn = document.getElementById('exam-open-whatsapp-btn');
    if (examOpenWaBtn) examOpenWaBtn.addEventListener('click', () => {
      const preview = document.getElementById('exam-message-preview');
      if (preview) {
        const encoded = encodeURIComponent(preview.textContent);
        window.open(`https://wa.me/?text=${encoded}`, '_blank');
      }
    });
    const examLogRefreshBtn = document.getElementById('exam-log-refresh-btn');
    if (examLogRefreshBtn) examLogRefreshBtn.addEventListener('click', () => this.loadExamNotificationLog());

    // Resource Management Handlers
    const openUploadResBtn = document.getElementById("open-upload-resource-modal-btn");
    if (openUploadResBtn) {
      openUploadResBtn.addEventListener("click", () => {
        document.getElementById("upload-resource-form").reset();
        document.getElementById("target-combination-group").style.display = "none";
        document.getElementById("target-student-group").style.display = "none";
        document.getElementById("upload-resource-modal").classList.add("active");
      });
    }

    const closeUploadResBtn = document.getElementById("upload-resource-modal-close");
    if (closeUploadResBtn) {
      closeUploadResBtn.addEventListener("click", () => {
        document.getElementById("upload-resource-modal").classList.remove("active");
      });
    }

    const cancelUploadResBtn = document.getElementById("upload-resource-cancel");
    if (cancelUploadResBtn) {
      cancelUploadResBtn.addEventListener("click", () => {
        document.getElementById("upload-resource-modal").classList.remove("active");
      });
    }

    const visSelect = document.getElementById("resource-visibility-select");
    if (visSelect) {
      visSelect.addEventListener("change", (e) => {
        const val = e.target.value;
        document.getElementById("target-combination-group").style.display = val === "combination" ? "block" : "none";
        document.getElementById("target-student-group").style.display = val === "student" ? "block" : "none";
      });
    }

    const uploadForm = document.getElementById("upload-resource-form");
    if (uploadForm) {
      uploadForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const fileInput = document.getElementById("resource-file-input");
        const titleInput = document.getElementById("resource-title-input");
        const descInput = document.getElementById("resource-desc-input");
        const visSelect = document.getElementById("resource-visibility-select");

        if (!fileInput.files || fileInput.files.length === 0) {
          return this.showToast("Please select a file to upload.", "danger");
        }

        const file = fileInput.files[0];
        // Firestore's per-document cap forces a real-world file ceiling of ~750 KB;
        // stop earlier here so the user gets a friendly message instead of a 400.
        const MAX_BYTES = 750 * 1024;
        if (file.size > MAX_BYTES) {
          return this.showToast(`File is too large (${(file.size / 1024).toFixed(0)} KB). Maximum is ${(MAX_BYTES / 1024).toFixed(0)} KB.`, "danger");
        }

        const payload = {
          title: titleInput.value.trim(),
          description: descInput.value.trim(),
          visibilityType: visSelect.value,
          originalFileName: file.name,
          mimeType: file.type || 'application/octet-stream'
        };

        if (visSelect.value === "combination") {
          const selectedCombs = Array.from(document.querySelectorAll('input[name="res-comb"]:checked')).map(cb => cb.value);
          if (selectedCombs.length === 0) {
            return this.showToast("Select at least one combination.", "danger");
          }
          payload.targetCombinations = JSON.stringify(selectedCombs);
        } else if (visSelect.value === "student") {
          const studentIdsVal = document.getElementById("resource-student-ids-input").value.trim();
          if (!studentIdsVal) {
            return this.showToast("Enter at least one Student ID.", "danger");
          }
          payload.targetStudentIds = JSON.stringify(studentIdsVal.split(',').map(s => s.trim()).filter(Boolean));
        }

        const submitBtn = document.getElementById("upload-resource-submit");
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i data-lucide="loader" style="animation:spin 1s linear infinite; width:14px; height:14px;"></i> Uploading...';
        lucide.createIcons();

        try {
          // Read the file as base64 and hand it over as JSON; the server keeps
          // the base64 payload in a Firestore doc so no separate object store
          // is needed.
          payload.contentBase64 = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = String(reader.result || '');
              const commaIndex = result.indexOf(',');
              resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
            };
            reader.onerror = () => reject(new Error('Unable to read the selected file.'));
            reader.readAsDataURL(file);
          });
          await db.uploadAdminResource(payload);
          this.showToast("Study resource uploaded successfully!");
          document.getElementById("upload-resource-modal").classList.remove("active");
          uploadForm.reset();
          await this.loadAdminResources();
        } catch (err) {
          this.showToast(err.message || 'Upload failed.', 'danger');
        } finally {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i data-lucide="upload"></i> Upload';
          lucide.createIcons();
        }
      });
    }
  }

  // ── WhatsApp 24-Hour Customer Service Window & Replies ──
  setupRepliesListeners() {
    const bindOnce = (id, event, handler) => {
      const el = document.getElementById(id);
      if (el && !el.dataset.bound) {
        el.dataset.bound = "true";
        el.addEventListener(event, handler);
      }
    };

    bindOnce("refresh-replies-btn", "click", () => this.loadReplies());
    bindOnce("chat-refresh-btn", "click", () => this.loadReplies());
    bindOnce("chat-back-btn", "click", () => this.closeConversation());
    bindOnce("send-reply-form", "submit", (e) => this.handleSendReply(e));
    bindOnce("trigger-template-modal-btn", "click", () => this.openTemplateModal());
    bindOnce("open-template-modal-direct-btn", "click", () => this.openTemplateModal());
    bindOnce("close-send-template-modal-btn", "click", () => this.closeTemplateModal());
    bindOnce("cancel-send-template-modal-btn", "click", () => this.closeTemplateModal());
    bindOnce("send-template-form", "submit", (e) => this.handleSendTemplate(e));
    bindOnce("template-name-select", "change", (e) => {
      const customGroup = document.getElementById("custom-template-name-group");
      if (customGroup) customGroup.style.display = e.target.value === "custom" ? "block" : "none";
    });

    // Hardware / browser back and Escape close the chat screen instead of leaving the portal.
    if (!this.chatNavBound) {
      this.chatNavBound = true;
      window.addEventListener("popstate", () => {
        if (this.chatOpen) this.closeConversation({ fromHistory: true });
      });
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && this.chatOpen) this.closeConversation();
      });
    }
  }

  async loadReplies() {
    this.setupRepliesListeners();
    const listEl = document.getElementById("conversations-list");
    const countEl = document.getElementById("replies-count");
    if (!listEl) return;

    if (!this.conversations) {
      listEl.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:30px;"><i data-lucide="loader" style="animation:spin 1s linear infinite; width:18px; height:18px;"></i> Loading...</p>';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    try {
      const conversations = await db.getConversations();
      this.conversations = conversations || [];
      const totalUnread = this.conversations.reduce((sum, c) => sum + (c.unread_count || 0), 0);

      if (countEl) {
        countEl.textContent = this.conversations.length
          ? `${this.conversations.length} conversation(s)${totalUnread ? ` · ${totalUnread} unread` : ''}`
          : '';
      }

      if (!this.conversations.length) {
        listEl.innerHTML = `
          <div style="text-align:center; padding:40px 16px; color:var(--text-muted);">
            <i data-lucide="inbox" style="width:36px; height:36px; margin-bottom:8px; opacity:0.4;"></i>
            <p style="font-size:0.85rem; margin:0;">No parent replies yet.</p>
            <p style="font-size:0.75rem; margin-top:4px;">Conversations will appear here when parents reply to WhatsApp notifications.</p>
          </div>`;
        if (this.chatOpen) this.closeConversation();
        if (typeof lucide !== 'undefined') lucide.createIcons();
        return;
      }

      listEl.innerHTML = '';
      this.conversations.forEach(conv => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `conversation-item${conv.unread_count ? ' unread' : ''}`;

        const lastMsg = conv.messages && conv.messages.length ? conv.messages[conv.messages.length - 1] : null;
        // Prefix "You:" for outbound so admins immediately see whether the
        // last activity in the thread was a parent message or their own reply.
        const lastText = lastMsg
          ? (lastMsg.direction === 'outbound'
              ? `<span style="color:#25D366; font-weight:600;">You:</span> ${this.escapeHtml(lastMsg.content)}`
              : this.escapeHtml(lastMsg.content))
          : 'No messages';
        const timeStr = conv.last_inbound_at
          ? new Date(conv.last_inbound_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
          : '';

        const badgeHtml = conv.is_window_open
          ? '<span class="chat-tag open">Open</span>'
          : '<span class="chat-tag expired">Expired</span>';

        item.innerHTML = `
          <div class="conv-row-top">
            <span class="conv-name">${this.escapeHtml(conv.profile_name || 'Parent')}</span>
            <span class="conv-time">${timeStr}</span>
          </div>
          <div class="conv-tags">
            ${conv.student_name ? `<span class="chat-tag student">${this.escapeHtml(conv.student_name)}</span>` : ''}
            ${badgeHtml}
            ${conv.unread_count ? `<span class="chat-tag unread">${conv.unread_count} new</span>` : ''}
          </div>
          <div class="conv-preview">
            <p>${lastText}</p>
            <i data-lucide="chevron-right" class="conv-chevron"></i>
          </div>`;

        item.addEventListener('click', () => this.openConversation(conv.wa_id));
        listEl.appendChild(item);
      });

      // Keep an already-open chat screen in sync with the refreshed data.
      if (this.chatOpen) {
        const activeConv = this.conversations.find(c => c.wa_id === this.activeWaId);
        if (activeConv) this.renderActiveThread(activeConv);
        else this.closeConversation();
      }

      if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (err) {
      console.error('Failed to load WhatsApp conversations:', err);
      listEl.innerHTML = `<p style="text-align:center; color:var(--danger); padding:20px;">Failed to load conversations. ${this.escapeHtml(err.message || '')}</p>`;
    }
  }

  openConversation(waId) {
    const conv = (this.conversations || []).find(c => c.wa_id === waId);
    const screen = document.getElementById("chat-screen");
    if (!conv || !screen) return;

    this.activeWaId = waId;
    this.renderActiveThread(conv);

    screen.classList.add("active");
    screen.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    this.chatOpen = true;

    try {
      history.pushState({ chatWaId: waId }, "");
      this.chatPushedState = true;
    } catch (err) {
      this.chatPushedState = false;
    }
  }

  closeConversation(options = {}) {
    const screen = document.getElementById("chat-screen");
    if (screen) {
      screen.classList.remove("active");
      screen.setAttribute("aria-hidden", "true");
    }
    document.body.style.overflow = "";

    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    const wasOpen = this.chatOpen;
    this.chatOpen = false;

    if (wasOpen && this.chatPushedState) {
      this.chatPushedState = false;
      if (!options.fromHistory) history.back();
    }
  }

  renderActiveThread(conv) {
    const nameEl = document.getElementById("active-contact-name");
    const phoneEl = document.getElementById("active-contact-phone");
    const studentBadge = document.getElementById("active-student-badge");

    if (nameEl) nameEl.textContent = conv.profile_name || "Parent";
    if (phoneEl) phoneEl.textContent = `+${conv.phone || conv.wa_id}`;
    if (studentBadge) {
      studentBadge.textContent = conv.student_name || "Unknown Student";
      studentBadge.style.background = conv.student_name ? "#25D366" : "var(--bg-card-hover)";
      studentBadge.style.color = conv.student_name ? "#05261a" : "var(--text-muted)";
    }

    this.updateWindowStatusBadge(conv);

    const msgsList = document.getElementById("thread-messages-list");
    if (!msgsList) return;

    msgsList.innerHTML = '';
    if (!conv.messages || !conv.messages.length) {
      msgsList.innerHTML = '<p class="chat-empty">No messages in this conversation thread yet.</p>';
      return;
    }

    conv.messages.forEach(msg => {
      const isOutbound = msg.direction === 'outbound';
      const bubble = document.createElement('div');
      bubble.className = `chat-bubble ${isOutbound ? 'outbound' : 'inbound'}`;

      const timeStr = msg.created_at
        ? new Date(msg.created_at).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
        : '';

      let statusIndicator = '';
      if (isOutbound) {
        statusIndicator = msg.status === 'failed'
          ? '<span class="failed">Failed</span>'
          : '<span class="sent">Sent</span>';
      }

      bubble.innerHTML = `
        <div>${this.escapeHtml(msg.content)}</div>
        <div class="chat-bubble-meta">${timeStr} ${statusIndicator}</div>`;
      msgsList.appendChild(bubble);
    });

    msgsList.scrollTop = msgsList.scrollHeight;
  }

  updateWindowStatusBadge(conv) {
    const badgeContainer = document.getElementById("window-status-badge-container");
    const replyInput = document.getElementById("reply-text-input");
    const sendBtn = document.getElementById("send-reply-btn");
    const expiredAlert = document.getElementById("chat-expired-alert");
    if (!badgeContainer) return;

    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }

    const expiresAt = conv.window_expires_at ? new Date(conv.window_expires_at).getTime() : null;
    const isOpen = Boolean(expiresAt && Date.now() < expiresAt);

    if (isOpen) {
      if (replyInput) {
        replyInput.disabled = false;
        replyInput.placeholder = "Type your reply message...";
      }
      if (sendBtn) sendBtn.disabled = false;
      if (expiredAlert) expiredAlert.style.display = "none";

      const tick = () => {
        const remainingMs = expiresAt - Date.now();
        if (remainingMs <= 0) {
          clearInterval(this.countdownInterval);
          this.countdownInterval = null;
          this.updateWindowStatusBadge({ ...conv, is_window_open: false, window_expires_at: null });
          return;
        }
        const hours = Math.floor(remainingMs / (1000 * 60 * 60));
        const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);

        badgeContainer.innerHTML = `
          <span style="background:rgba(37, 211, 102, 0.15); color:#25D366; font-size:0.75rem; font-weight:600; padding:5px 12px; border-radius:20px; border:1px solid rgba(37, 211, 102, 0.3); display:inline-flex; align-items:center; gap:6px;">
            <span style="width:8px; height:8px; border-radius:50%; background:#25D366; display:inline-block; animation:pulse 1.5s infinite;"></span>
            Reply window: ${hours}h ${minutes}m ${seconds}s left
          </span>`;
      };
      tick();
      this.countdownInterval = setInterval(tick, 1000);
    } else {
      if (replyInput) {
        replyInput.disabled = true;
        replyInput.value = "";
        replyInput.placeholder = "24-hour window expired — send a template";
      }
      if (sendBtn) sendBtn.disabled = true;
      if (expiredAlert) expiredAlert.style.display = "flex";

      badgeContainer.innerHTML = `
        <span style="background:rgba(239, 68, 68, 0.15); color:var(--danger); font-size:0.75rem; font-weight:600; padding:5px 12px; border-radius:20px; border:1px solid rgba(239, 68, 68, 0.3); display:inline-flex; align-items:center; gap:6px;">
          <span style="width:8px; height:8px; border-radius:50%; background:var(--danger); display:inline-block;"></span>
          24-hour window expired
        </span>`;
    }
  }

  async handleSendReply(e) {
    e.preventDefault();
    if (!this.activeWaId) return;
    const replyInput = document.getElementById("reply-text-input");
    const sendBtn = document.getElementById("send-reply-btn");
    const textValue = (replyInput?.value || "").trim();
    if (!textValue) return;

    try {
      sendBtn.disabled = true;
      sendBtn.innerHTML = '<i data-lucide="loader" style="animation:spin 1s linear infinite;"></i>';
      if (typeof lucide !== 'undefined') lucide.createIcons();

      await db.sendReply(this.activeWaId, textValue);
      this.showToast("WhatsApp reply sent successfully!", "success");
      if (replyInput) replyInput.value = "";
      await this.loadReplies();
    } catch (err) {
      if (err.message && err.message.includes("WINDOW_EXPIRED")) {
        this.showToast("24-hour customer service window expired. Please send an approved template instead.", "danger");
        const activeConv = (this.conversations || []).find(c => c.wa_id === this.activeWaId);
        if (activeConv) {
          this.updateWindowStatusBadge({ ...activeConv, is_window_open: false, window_expires_at: null });
        }
      } else {
        this.showToast(`Failed to send reply: ${err.message || 'Server error'}`, "danger");
      }
    } finally {
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i data-lucide="send"></i>';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    }
  }

  openTemplateModal() {
    if (!this.activeWaId) {
      this.showToast("Select a conversation first.", "info");
      return;
    }
    const conv = (this.conversations || []).find(c => c.wa_id === this.activeWaId);
    const modal = document.getElementById("send-template-modal");
    const waIdInput = document.getElementById("template-modal-wa-id");
    const recipientDisplay = document.getElementById("template-modal-recipient-display");
    const paramsInput = document.getElementById("template-params-input");

    if (modal && waIdInput && recipientDisplay) {
      waIdInput.value = this.activeWaId;
      recipientDisplay.value = `${conv?.profile_name || 'Parent'} (+${conv?.phone || this.activeWaId}) ${conv?.student_name ? `[Student: ${conv.student_name}]` : ''}`;
      if (paramsInput) paramsInput.value = conv?.student_name ? conv.student_name : "";
      modal.style.display = "flex";
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  }

  closeTemplateModal() {
    const modal = document.getElementById("send-template-modal");
    if (modal) modal.style.display = "none";
  }

  async handleSendTemplate(e) {
    e.preventDefault();
    const waId = document.getElementById("template-modal-wa-id")?.value;
    const templateSelect = document.getElementById("template-name-select")?.value;
    const customInput = document.getElementById("custom-template-name-input")?.value;
    const paramsInput = document.getElementById("template-params-input")?.value;
    const submitBtn = document.getElementById("submit-send-template-btn");

    const templateName = templateSelect === "custom" ? customInput.trim() : templateSelect;
    if (!waId || !templateName) {
      this.showToast("Please specify recipient and template name.", "danger");
      return;
    }

    const params = paramsInput ? paramsInput.split(",").map(p => p.trim()).filter(Boolean) : [];

    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i data-lucide="loader" style="animation:spin 1s linear infinite; width:14px; height:14px;"></i> Sending...';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }

      await db.sendTemplateReply(waId, templateName, params);
      this.showToast("Template message sent successfully!", "success");
      this.closeTemplateModal();
      await this.loadReplies();
    } catch (err) {
      this.showToast(`Failed to send template: ${err.message || 'Server error'}`, "danger");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i data-lucide="send"></i> Send Template';
        if (typeof lucide !== 'undefined') lucide.createIcons();
      }
    }
  }

  // ── Resources Management ─────────────────────────────
  async loadAdminResources() {
    const container = document.getElementById("admin-resources-list-container");
    container.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:30px;"><i data-lucide="loader" style="animation:spin 1s linear infinite; width:18px; height:18px;"></i> Loading study resources...</p>';
    lucide.createIcons();

    try {
      const resources = await db.getAdminResources();

      if (!resources || resources.length === 0) {
        container.innerHTML = `
          <div style="text-align: center; padding: 40px 20px;">
            <i data-lucide="folder-open" style="width: 42px; height: 42px; color: var(--text-muted); margin-bottom: 10px; opacity: 0.5;"></i>
            <h3 style="font-size: 1rem; color: var(--text-main); margin-bottom: 4px;">No Study Resources Uploaded Yet</h3>
            <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 16px;">Upload notes, PDFs, or assignments to share them with students.</p>
            <button class="btn btn-primary" id="empty-upload-resource-btn">
              <i data-lucide="upload-cloud"></i> Upload First Resource
            </button>
          </div>`;
        lucide.createIcons();
        document.getElementById("empty-upload-resource-btn")?.addEventListener("click", () => {
          document.getElementById("upload-resource-modal").classList.add("active");
        });
        return;
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

      container.innerHTML = `
        <div style="overflow-x: auto;">
          <table class="data-table">
            <thead>
              <tr>
                <th>Title / File</th>
                <th>Target Audience</th>
                <th>Size</th>
                <th>Date</th>
                <th style="text-align: right;">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${resources.map(item => {
        const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
        const sizeStr = formatFileSize(item.sizeBytes);
        let audienceLabel = 'All Students';
        if (item.visibilityType === 'combination') {
          audienceLabel = `Streams: ${(item.targetCombinations || []).join(', ')}`;
        } else if (item.visibilityType === 'student') {
          audienceLabel = `Students: #${(item.targetStudentIds || []).join(', #')}`;
        }

        return `
                  <tr>
                    <td>
                      <strong style="color: var(--text-main); font-size: 0.9rem;">${this.escapeHtml(item.title)}</strong>
                      ${item.description ? `<div style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">${this.escapeHtml(item.description)}</div>` : ''}
                      <div style="font-size: 0.74rem; color: var(--primary-hover); margin-top: 2px;">📁 ${this.escapeHtml(item.originalFileName)}</div>
                    </td>
                    <td>
                      <span class="badge-status paid" style="font-size: 0.72rem; padding: 2px 8px;">${this.escapeHtml(audienceLabel)}</span>
                    </td>
                    <td style="font-size: 0.8rem; color: var(--text-muted);">${sizeStr}</td>
                    <td style="font-size: 0.8rem; color: var(--text-muted);">${dateStr}</td>
                    <td style="text-align: right;">
                      <div style="display: inline-flex; gap: 6px;">
                        <a href="/api/admin/resources/${encodeURIComponent(item.id)}/download" target="_blank" download class="btn btn-secondary btn-sm" style="padding: 4px 8px; text-decoration: none; font-size: 0.78rem;" title="Download / Preview">
                          <i data-lucide="download" style="width: 14px; height: 14px;"></i>
                        </a>
                        <button class="btn btn-secondary btn-sm delete-resource-btn" data-id="${item.id}" style="padding: 4px 8px; font-size: 0.78rem; color: var(--danger, #ef4444); border-color: rgba(239, 68, 68, 0.3);" title="Delete Resource">
                          <i data-lucide="trash-2" style="width: 14px; height: 14px;"></i>
                        </button>
                      </div>
                    </td>
                  </tr>`;
      }).join('')}
            </tbody>
          </table>
        </div>`;

      // Wire delete buttons
      container.querySelectorAll('.delete-resource-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const resId = e.currentTarget.getAttribute('data-id');
          if (await this.confirmAction('Are you sure you want to delete this study resource? Students will no longer be able to download it.', { danger: true, okLabel: 'Delete' })) {
            try {
              await db.deleteAdminResource(resId);
              this.showToast('Resource deleted successfully.');
              await this.loadAdminResources();
            } catch (err) {
              this.showToast(err.message || 'Failed to delete resource.', 'danger');
            }
          }
        });
      });

      lucide.createIcons();
    } catch (error) {
      container.innerHTML = `<p style="text-align:center; color:var(--danger, #ef4444); padding:30px;">Failed to load study resources: ${this.escapeHtml(error.message)}</p>`;
    }
  }

  /* =========================================================================
     EXAM NOTIFICATIONS
     ========================================================================= */
  async loadExamNotificationView() {
    try {
      this.examStudentsList = await db.getStudents();
    } catch (err) {
      this.examStudentsList = [];
    }
    this.examStudentSelection = this.examStudentSelection || new Set();
    this.renderExamStudentList();
    this.updateExamPreview();
    this.loadExamNotificationLog();
  }

  renderExamStudentList() {
    const listEl = document.getElementById('exam-student-list');
    const countEl = document.getElementById('exam-student-selection-count');
    if (!listEl) return;
    const selected = this.examStudentSelection = this.examStudentSelection || new Set();
    const students = this.examStudentsList || [];

    // Drop selections for students that no longer exist.
    const validIds = new Set(students.map(s => s.id));
    for (const id of Array.from(selected)) if (!validIds.has(id)) selected.delete(id);

    listEl.innerHTML = '';
    if (!students.length) {
      listEl.innerHTML = '<p style="color:var(--text-muted); font-size:.8rem; text-align:center; padding:12px;">No students in this batch.</p>';
      if (countEl) countEl.textContent = '0 selected';
      return;
    }

    students.forEach(student => {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex; align-items:center; gap:10px; padding:6px 8px; cursor:pointer; border-radius:6px;';
      row.onmouseover = () => row.style.background = 'var(--bg-card-hover)';
      row.onmouseout = () => row.style.background = 'transparent';
      const isChecked = selected.has(student.id);
      row.innerHTML = `
        <input type="checkbox" class="exam-student-cb" data-id="${this.escapeHtml(student.id)}" ${isChecked ? 'checked' : ''}>
        <span style="flex:1; font-size:.85rem;">${this.escapeHtml(student.name)} <span style="color:var(--text-muted); font-size:.72rem;">#${this.escapeHtml(String(student.number || student.id))}</span></span>
        <span style="font-size:.72rem; color:var(--text-muted);">${this.escapeHtml(student.combination || '')}</span>`;
      row.querySelector('.exam-student-cb').addEventListener('change', event => {
        if (event.target.checked) selected.add(student.id);
        else selected.delete(student.id);
        if (countEl) countEl.textContent = `${selected.size} selected`;
      });
      listEl.appendChild(row);
    });
    if (countEl) countEl.textContent = `${selected.size} selected`;
  }

  getExamSubjectDates() {
    const physics = document.getElementById('exam-date-physics')?.value || '';
    const chemistry = document.getElementById('exam-date-chemistry')?.value || '';
    const maths = document.getElementById('exam-date-maths')?.value || '';
    const biocs = document.getElementById('exam-date-biocs')?.value || '';
    return { physics, chemistry, maths, biocs };
  }

  formatExamDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = String(d.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  }

  updateExamPreview() {
    const preview = document.getElementById('exam-message-preview');
    if (!preview) return;
    const dates = this.getExamSubjectDates();
    const examType = document.getElementById('exam-type-select')?.value || 'Mid-Term';
    const allFilled = dates.physics && dates.chemistry && dates.maths && dates.biocs;

    if (!allFilled) {
      preview.textContent = 'Fill in all 4 exam dates above to see the message preview.';
      return;
    }

    const msg = `Dear Parent,

This is to inform you about the upcoming ${examType} Examination.

📚Examination Schedule

1. Physics-${this.formatExamDate(dates.physics)}
2. Chemistry-${this.formatExamDate(dates.chemistry)}
3. Maths-${this.formatExamDate(dates.maths)}
4. Bio/CS-${this.formatExamDate(dates.biocs)}
📖 Portion: As per the PU Board syllabus.

Kindly take note of the above schedule and ensure that your child is well prepared for the examinations.

— Galaxy Academy`;
    preview.textContent = msg;
  }

  async sendExamNotifications() {
    const templateName = (document.getElementById('exam-template-name-input')?.value || '').trim();
    if (!templateName) return this.showToast('Enter a template name first.', 'danger');

    const dates = this.getExamSubjectDates();
    if (!dates.physics || !dates.chemistry || !dates.maths || !dates.biocs) {
      return this.showToast('Please fill in all 4 exam dates.', 'danger');
    }

    const selected = Array.from(this.examStudentSelection || []);
    if (!selected.length) return this.showToast('Select at least one student.', 'danger');

    const examType = document.getElementById('exam-type-select')?.value || 'Mid-Term';
    if (!await this.confirmAction(`Send "${examType}" exam schedule to ${selected.length} student(s) via WhatsApp template "${templateName}"?`)) return;

    const btn = document.getElementById('exam-send-btn');
    btn.disabled = true;
    const originalLabel = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader" style="animation:spin 1s linear infinite; width:14px; height:14px;"></i> Sending';
    lucide.createIcons();

    try {
      const subjects = [
        { name: 'Physics', date: this.formatExamDate(dates.physics) },
        { name: 'Chemistry', date: this.formatExamDate(dates.chemistry) },
        { name: 'Maths', date: this.formatExamDate(dates.maths) },
        { name: 'Bio/CS', date: this.formatExamDate(dates.biocs) }
      ];
      const preview = document.getElementById('exam-message-preview');
      const result = await db.sendExamNotifications({
        studentIds: selected,
        templateName,
        examType,
        subjects,
        message: preview ? preview.textContent : ''
      });

      const firstError = (result.recipients || []).find(r => !r.success)?.error;
      const severity = result.succeeded === 0 ? 'danger' : result.failed > 0 ? 'danger' : 'success';
      const errSuffix = firstError ? ` — first error: ${firstError}` : '';
      this.showToast(`Exam notifications: ${result.succeeded}/${result.total} delivered, ${result.failed} failed${errSuffix}`, severity);

      if (result.failed === 0) this.examStudentSelection = new Set();
      this.renderExamStudentList();
      await this.loadExamNotificationLog();
    } catch (err) {
      this.showToast(`Failed to send: ${err.message || 'Server error'}`, 'danger');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalLabel;
      lucide.createIcons();
    }
  }

  async loadExamNotificationLog() {
    const container = document.getElementById('exam-notification-log-container');
    if (!container) return;
    const today = this.getLocalDateString();
    try {
      const { logs } = await db.getExamNotificationLog(today);
      if (!logs || !logs.length) {
        container.innerHTML = '<p style="color:var(--text-muted); font-size:.8rem; margin:0;">No exam notifications sent today.</p>';
        return;
      }
      container.innerHTML = logs.map(log => {
        const time = new Date(log.sentAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
        const succeeded = Number(log.succeeded || 0);
        const total = Number(log.total || 0);
        let icon = '✅';
        if (succeeded === 0) icon = '❌';
        else if (succeeded < total) icon = '⚠️';

        const names = (log.recipients || []).map(r =>
          `<li style="font-size:.75rem; ${r.success ? '' : 'color:var(--danger);'}">
             ${r.success ? '✓' : '✕'} ${this.escapeHtml(r.studentName || r.studentId)}${r.success ? '' : ` — ${this.escapeHtml(r.error || 'failed')}`}
           </li>`).join('');

        const errorReasons = Array.from(new Set((log.recipients || [])
          .filter(r => !r.success && r.error)
          .map(r => r.error)));
        const errorsHtml = errorReasons.length
          ? `<div style="margin-top:8px; padding:8px; border-left:3px solid var(--danger); background:rgba(239,68,68,.08); font-size:.72rem; color:var(--danger);">
               <strong>Errors:</strong>
               <ul style="margin:4px 0 0 16px; padding:0;">${errorReasons.map(e => `<li>${this.escapeHtml(e)}</li>`).join('')}</ul>
             </div>` : '';

        const subjectsStr = (log.subjects || []).map(s => `${s.name}: ${s.date}`).join(' · ');

        return `
          <div style="border-top:1px solid var(--border-color); padding:8px 0;">
            <div style="display:flex; justify-content:space-between; gap:8px; font-size:.8rem;">
              <strong>${icon} ${this.escapeHtml(log.examType || 'Exam')} — ${this.escapeHtml(log.templateName)}</strong>
              <span style="color:var(--text-muted);">${time} · ${succeeded}/${total} delivered</span>
            </div>
            <div style="font-size:.72rem; color:var(--text-muted); margin-top:4px;">${this.escapeHtml(subjectsStr)}</div>
            <ul style="margin:6px 0 0 16px; padding:0;">${names}</ul>
            ${errorsHtml}
          </div>`;
      }).join('');
    } catch (err) {
      container.innerHTML = `<p style="color:var(--danger); font-size:.8rem;">Failed to load log: ${this.escapeHtml(err.message || '')}</p>`;
    }
  }

  /* =========================================================================
     DISCONTINUED STUDENTS
     ========================================================================= */
  openDiscontinueModal(studentId, studentName) {
    const modal = document.getElementById('discontinue-modal');
    document.getElementById('discontinue-student-id').value = studentId;
    document.getElementById('discontinue-modal-desc').textContent = `Are you sure you want to discontinue ${studentName}? They will be hidden from all active views but their data will be preserved.`;
    document.getElementById('discontinue-reason').value = '';
    modal.style.display = 'flex';
    lucide.createIcons();
  }

  async handleDiscontinueStudent() {
    const studentId = document.getElementById('discontinue-student-id').value;
    const reason = document.getElementById('discontinue-reason').value.trim();
    try {
      await db.discontinueStudent(studentId, reason);
      document.getElementById('discontinue-modal').style.display = 'none';
      this.showToast('Student discontinued successfully.');
      this.loadStudentsList();
      this.refreshViewData(this.currentView);
    } catch (error) {
      this.showToast(error.message || 'Failed to discontinue student.', 'danger');
    }
  }

  async loadDiscontinuedStudents() {
    const container = document.getElementById('discontinued-list-container');
    const summaryContainer = document.getElementById('discontinued-summary');
    const detailPanel = document.getElementById('discontinued-detail-panel');
    detailPanel.style.display = 'none';
    try {
      const students = await db.getDiscontinuedStudents();
      const totalOutstanding = students.reduce((sum, s) => sum + (s.payment?.balance || 0), 0);

      summaryContainer.innerHTML = `
        <div class="stat-card"><div class="stat-num" style="color:var(--danger);">${students.length}</div><div class="stat-label">Discontinued</div></div>
        <div class="stat-card"><div class="stat-num" style="color:#f59e0b;">₹${totalOutstanding.toLocaleString('en-IN')}</div><div class="stat-label">Outstanding</div></div>
      `;

      if (students.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:30px;">No discontinued students.</p>';
        return;
      }

      container.innerHTML = students.map(s => {
        const dateStr = s.discontinuedAt ? new Date(s.discontinuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';
        return `
          <div class="list-item" style="cursor:pointer; padding:12px 16px;" data-disc-id="${this.escapeHtml(s.id)}">
            <div style="flex:1;">
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span class="student-name">${this.escapeHtml(s.name)}</span>
                <span class="badge" style="font-size:.7rem; background:rgba(239,68,68,.15); color:var(--danger); padding:2px 6px; border-radius:4px;">Discontinued</span>
              </div>
              <div style="font-size:.75rem; color:var(--text-muted); margin-top:4px;">📅 ${dateStr}${s.discontinueReason ? ` · ${this.escapeHtml(s.discontinueReason)}` : ''}</div>
              <div style="font-size:.75rem; color:var(--text-muted); margin-top:2px;">💰 Fee: ₹${(s.payment?.totalFee || 0).toLocaleString('en-IN')} · Paid: ₹${(s.payment?.paid || 0).toLocaleString('en-IN')} · Balance: ₹${(s.payment?.balance || 0).toLocaleString('en-IN')}</div>
            </div>
          </div>
        `;
      }).join('');

      container.querySelectorAll('[data-disc-id]').forEach(el => {
        el.addEventListener('click', () => {
          const sid = el.dataset.discId;
          const student = students.find(s => s.id === sid);
          if (student) this.showDiscontinuedDetail(student);
        });
      });
    } catch (error) {
      container.innerHTML = `<p style="text-align:center; color:var(--danger); padding:30px;">${this.escapeHtml(error.message || 'Failed to load.')}</p>`;
    }
    lucide.createIcons();
  }

  showDiscontinuedDetail(student) {
    const panel = document.getElementById('discontinued-detail-panel');
    panel.style.display = 'block';
    document.getElementById('disc-detail-name').textContent = student.name;
    document.getElementById('disc-detail-reason').textContent = student.discontinueReason ? `Reason: ${student.discontinueReason}` : 'No reason given';
    document.getElementById('disc-detail-date').textContent = student.discontinuedAt ? `Discontinued: ${new Date(student.discontinuedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : '';

    // Payment tab
    const payDiv = document.getElementById('disc-detail-payment');
    const pay = student.payment || {};
    const txns = pay.transactions || [];
    payDiv.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(3,1fr); gap:8px; margin-bottom:12px;">
        <div style="text-align:center; padding:8px; background:var(--bg-secondary); border-radius:8px;"><div style="font-size:1.1rem; font-weight:700;">₹${(pay.totalFee || 0).toLocaleString('en-IN')}</div><div style="font-size:.7rem; color:var(--text-muted);">Total Fee</div></div>
        <div style="text-align:center; padding:8px; background:var(--bg-secondary); border-radius:8px;"><div style="font-size:1.1rem; font-weight:700; color:var(--success);">₹${(pay.paid || 0).toLocaleString('en-IN')}</div><div style="font-size:.7rem; color:var(--text-muted);">Paid</div></div>
        <div style="text-align:center; padding:8px; background:var(--bg-secondary); border-radius:8px;"><div style="font-size:1.1rem; font-weight:700; color:var(--danger);">₹${(pay.balance || 0).toLocaleString('en-IN')}</div><div style="font-size:.7rem; color:var(--text-muted);">Balance</div></div>
      </div>
      ${txns.length ? `<div style="font-size:.82rem; font-weight:600; margin-bottom:6px;">Transaction History</div>
        ${txns.map((t, i) => `<div style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px solid var(--border-color); font-size:.8rem;">
          <span>${i + 1}. ${t.date || 'N/A'}${t.note ? ` — ${this.escapeHtml(t.note)}` : ''}</span>
          <span style="font-weight:600;">₹${(Number(t.amount) || 0).toLocaleString('en-IN')}</span>
        </div>`).join('')}` : '<p style="color:var(--text-muted); font-size:.8rem;">No transactions recorded.</p>'}
    `;

    // Attendance tab
    const attDiv = document.getElementById('disc-detail-attendance');
    const att = student.attendance || [];
    if (att.length) {
      const present = att.filter(a => a.status === 'P').length;
      const pct = att.length > 0 ? ((present / att.length) * 100).toFixed(1) : 0;
      attDiv.innerHTML = `
        <div style="margin-bottom:10px; font-size:.85rem;">Attendance: <strong>${present}/${att.length}</strong> (${pct}%)</div>
        <div style="max-height:200px; overflow-y:auto; font-size:.78rem;">
          ${att.sort((a, b) => a.date.localeCompare(b.date)).map(a => `<div style="display:flex; justify-content:space-between; padding:3px 0; border-bottom:1px solid var(--border-color);">
            <span>${a.date}</span><span style="color:${a.status === 'P' ? 'var(--success)' : 'var(--danger)'}; font-weight:600;">${a.status}</span>
          </div>`).join('')}
        </div>
      `;
    } else {
      attDiv.innerHTML = '<p style="color:var(--text-muted); font-size:.8rem;">No attendance records.</p>';
    }

    // Marks tab
    const marksDiv = document.getElementById('disc-detail-marks');
    const marks = student.testMarks || [];
    if (marks.length) {
      marksDiv.innerHTML = `
        <div style="max-height:200px; overflow-y:auto; font-size:.78rem;">
          ${marks.map(m => `<div style="display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--border-color);">
            <span>${this.escapeHtml(m.testKey || '')} — ${this.escapeHtml(m.subject || '')}</span>
            <span style="font-weight:600;">${m.totalMarks || m.marks || 'N/A'}</span>
          </div>`).join('')}
        </div>
      `;
    } else {
      marksDiv.innerHTML = '<p style="color:var(--text-muted); font-size:.8rem;">No test marks recorded.</p>';
    }

    // Wire reactivate button
    const reactBtn = document.getElementById('disc-reactivate-btn');
    const newBtn = reactBtn.cloneNode(true);
    reactBtn.parentNode.replaceChild(newBtn, reactBtn);
    newBtn.addEventListener('click', async () => {
      if (await this.confirmAction(`Re-activate ${student.name}? They will return to all active views.`)) {
        try {
          await db.reactivateStudent(student.id);
          this.showToast(`${student.name} has been reactivated.`);
          this.loadDiscontinuedStudents();
        } catch (err) {
          this.showToast(err.message || 'Reactivation failed.', 'danger');
        }
      }
    });

    // Wire tab switching
    panel.querySelectorAll('.disc-detail-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        panel.querySelectorAll('.disc-detail-tab').forEach(b => b.classList.remove('active'));
        panel.querySelectorAll('.disc-detail-content').forEach(c => c.style.display = 'none');
        btn.classList.add('active');
        document.getElementById(`disc-detail-${btn.dataset.tab}`).style.display = 'block';
      });
    });

    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    lucide.createIcons();
  }

  /* =========================================================================
     FEE FOLLOW-UP PIPELINE
     ========================================================================= */
  async loadFeeFollowups() {
    try {
      const allFollowups = await db.getFeeFollowups('all');
      const active = allFollowups.filter(f => f.status === 'active');
      const paid = allFollowups.filter(f => f.status === 'paid');
      const exhausted = allFollowups.filter(f => f.status === 'exhausted');
      const allLogs = [];
      allFollowups.forEach(f => {
        (f.logs || []).forEach(log => {
          allLogs.push({ ...log, studentName: f.studentName, studentId: f.studentId || f.id });
        });
      });
      allLogs.sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));

      this.renderActiveFollowups(active);
      this.renderFollowupLogs(allLogs);
      this.renderPaidFollowups(paid);
    } catch (err) {
      document.getElementById('followup-active-list').innerHTML = `<p style="color:var(--danger); font-size:.8rem;">${this.escapeHtml(err.message || 'Failed to load.')}</p>`;
    }
    lucide.createIcons();
  }

  renderActiveFollowups(active) {
    const container = document.getElementById('followup-active-list');
    if (active.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted); font-size:.8rem; margin:0;">No active follow-ups.</p>';
      return;
    }

    const STAGE_NAMES = { 1: 'Group WhatsApp', 2: 'Personal WhatsApp', 3: 'Phone Call', 4: 'Face-to-Face' };
    const STAGE_COLORS = { 1: '#22c55e', 2: '#3b82f6', 3: '#f59e0b', 4: '#ef4444' };

    container.innerHTML = active.map(f => {
      const stage = f.currentStage || 1;
      const stageName = STAGE_NAMES[stage] || `Stage ${stage}`;
      const stageColor = STAGE_COLORS[stage] || 'var(--primary)';
      let suggestedHtml = '';
      if (f.suggestedNextDate) {
        const sugDate = new Date(f.suggestedNextDate);
        const now = Date.now();
        const diffDays = Math.ceil((f.suggestedNextDate - now) / 86400000);
        let dateColor = '#22c55e';
        if (diffDays <= 0) dateColor = '#ef4444';
        else if (diffDays <= 1) dateColor = '#f59e0b';
        suggestedHtml = `<div style="font-size:.72rem; color:${dateColor}; margin-top:4px;">📅 Suggested: ${sugDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}${diffDays <= 0 ? ' (overdue!)' : diffDays <= 1 ? ' (today)' : ''}</div>`;
      }
      return `
        <div class="card" style="padding:12px; margin-bottom:8px; border-left:4px solid ${stageColor};">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; flex-wrap:wrap;">
            <div style="flex:1; min-width:180px;">
              <div style="font-weight:600;">${this.escapeHtml(f.studentName || f.id)}</div>
              <div style="font-size:.75rem; color:var(--text-muted); margin-top:2px;">📱 ${this.escapeHtml(f.phone || 'N/A')} · Balance: ₹${(f.balance || 0).toLocaleString('en-IN')}</div>
              <div style="margin-top:6px;"><span style="display:inline-block; padding:2px 8px; font-size:.72rem; font-weight:700; border-radius:10px; color:white; background:${stageColor};">Stage ${stage} — ${stageName}</span></div>
              <div style="margin-top:4px; padding:6px 10px; background:rgba(139,92,246,.08); border-radius:6px; font-size:.78rem; color:var(--primary-hover);">⏳ Next: Stage ${Math.min(stage, 4)} — ${stageName}</div>
              ${suggestedHtml}
            </div>
            <div style="display:flex; flex-direction:column; gap:4px;">
              <button class="btn btn-primary followup-send-btn" data-student-id="${this.escapeHtml(f.studentId || f.id)}" data-stage="${stage}" data-student-name="${this.escapeHtml(f.studentName || '')}" style="padding:5px 12px; font-size:.75rem;">
                <i data-lucide="send" style="width:12px; height:12px;"></i> Send Stage ${stage}
              </button>
              <button class="btn btn-secondary followup-mark-paid-btn" data-student-id="${this.escapeHtml(f.studentId || f.id)}" style="padding:5px 12px; font-size:.75rem; border-color:var(--success); color:var(--success);">
                ✅ Mark Paid
              </button>
              <button class="btn btn-secondary followup-cancel-btn" data-student-id="${this.escapeHtml(f.studentId || f.id)}" style="padding:5px 12px; font-size:.75rem;">
                ✕ Cancel
              </button>
            </div>
          </div>
          ${(f.logs || []).length ? `<details style="margin-top:8px;"><summary style="font-size:.75rem; color:var(--text-muted); cursor:pointer;">View Logs (${f.logs.length})</summary>
            <div style="margin-top:6px; font-size:.72rem;">${f.logs.map(l => {
              const time = new Date(l.sentAt).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', hour12:true });
              return `<div style="padding:3px 0; border-bottom:1px solid var(--border-color);">${time} · Stage ${l.stage || '?'} · ${l.action || '?'}${l.note ? ` — ${this.escapeHtml(l.note)}` : ''}</div>`;
            }).join('')}</div>
          </details>` : ''}
        </div>
      `;
    }).join('');

    // Wire send buttons
    container.querySelectorAll('.followup-send-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openFollowupStageModal(btn.dataset.studentId, Number(btn.dataset.stage), btn.dataset.studentName);
      });
    });

    // Wire mark paid buttons
    container.querySelectorAll('.followup-mark-paid-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (await this.confirmAction('Mark this student as paid?')) {
          try {
            await db.markFollowupPaid(btn.dataset.studentId);
            this.showToast('Marked as paid.');
            this.loadFeeFollowups();
          } catch (err) { this.showToast(err.message || 'Failed.', 'danger'); }
        }
      });
    });

    // Wire cancel buttons
    container.querySelectorAll('.followup-cancel-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (await this.confirmAction('Cancel this follow-up?')) {
          try {
            await db.cancelFeeFollowup(btn.dataset.studentId);
            this.showToast('Follow-up cancelled.');
            this.loadFeeFollowups();
          } catch (err) { this.showToast(err.message || 'Failed.', 'danger'); }
        }
      });
    });
  }

  renderFollowupLogs(allLogs) {
    const container = document.getElementById('followup-logs-list');
    if (allLogs.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted); font-size:.8rem; margin:0;">No follow-up messages sent yet.</p>';
      return;
    }

    const ACTION_LABELS = { whatsapp_template: '📱 WhatsApp Template', whatsapp_personal: '💬 Personal WhatsApp', phone_call: '📞 Phone Call', face_to_face: '🤝 Face-to-Face', marked_paid: '✅ Marked Paid', auto_marked_paid: '✅ Auto Paid' };

    container.innerHTML = `
      <div style="max-height:400px; overflow-y:auto;">
        <table style="width:100%; border-collapse:collapse; font-size:.78rem;">
          <thead><tr style="background:var(--bg-secondary); position:sticky; top:0;">
            <th style="padding:6px 8px; text-align:left;">Date/Time</th>
            <th style="padding:6px 8px; text-align:left;">Student</th>
            <th style="padding:6px 8px; text-align:left;">Stage</th>
            <th style="padding:6px 8px; text-align:left;">Action</th>
            <th style="padding:6px 8px; text-align:left;">Note</th>
          </tr></thead>
          <tbody>
            ${allLogs.slice(0, 100).map(l => {
              const time = l.sentAt ? new Date(l.sentAt).toLocaleString('en-IN', { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit', hour12:true }) : 'N/A';
              return `<tr style="border-bottom:1px solid var(--border-color);">
                <td style="padding:6px 8px; white-space:nowrap;">${time}</td>
                <td style="padding:6px 8px;">${this.escapeHtml(l.studentName || l.studentId || '')}</td>
                <td style="padding:6px 8px;">${l.stage || '—'}</td>
                <td style="padding:6px 8px;">${ACTION_LABELS[l.action] || l.action || '—'}</td>
                <td style="padding:6px 8px; color:var(--text-muted);">${this.escapeHtml(l.note || '')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  renderPaidFollowups(paid) {
    const container = document.getElementById('followup-paid-list');
    const summaryContainer = document.getElementById('followup-paid-summary');

    if (paid.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted); font-size:.8rem; margin:0;">No students have paid through follow-ups yet.</p>';
      summaryContainer.innerHTML = '';
      return;
    }

    const totalCollected = paid.reduce((sum, f) => sum + (f.paid || 0), 0);
    summaryContainer.innerHTML = `
      <div class="stat-card"><div class="stat-num" style="color:var(--success);">${paid.length}</div><div class="stat-label">Recovered</div></div>
      <div class="stat-card"><div class="stat-num" style="color:var(--success);">₹${totalCollected.toLocaleString('en-IN')}</div><div class="stat-label">Collected</div></div>
    `;

    container.innerHTML = paid.map(f => {
      const lastPaidLog = (f.logs || []).filter(l => l.action === 'marked_paid' || l.action === 'auto_marked_paid').pop();
      const paidDate = lastPaidLog ? new Date(lastPaidLog.sentAt).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : 'N/A';
      return `
        <div class="list-item" style="padding:10px 16px;">
          <div style="flex:1;">
            <div style="font-weight:600;">${this.escapeHtml(f.studentName || f.id)} <span style="font-size:.72rem; color:var(--success); font-weight:700;">✅ PAID</span></div>
            <div style="font-size:.75rem; color:var(--text-muted); margin-top:2px;">Paid: ₹${(f.paid || 0).toLocaleString('en-IN')} · Stage at payment: ${f.currentStage || '?'} · Date: ${paidDate}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  openFollowupStageModal(studentId, stage, studentName) {
    const modal = document.getElementById('followup-stage-modal');
    const STAGE_NAMES = { 1: 'Group WhatsApp Reminder', 2: 'Personal WhatsApp', 3: 'Direct Phone Call', 4: 'Face-to-Face Meeting' };
    const DEFAULT_ACTIONS = { 1: 'whatsapp_template', 2: 'whatsapp_personal', 3: 'phone_call', 4: 'face_to_face' };

    document.getElementById('followup-stage-student-id').value = studentId;
    document.getElementById('followup-stage-number').value = stage;
    document.getElementById('followup-stage-student-name').value = studentName;
    document.getElementById('followup-stage-modal-title').textContent = `Stage ${stage} — ${STAGE_NAMES[stage] || 'Follow-Up'}`;
    document.getElementById('followup-stage-modal-desc').textContent = `Send stage ${stage} follow-up for ${studentName}.`;
    document.getElementById('followup-stage-action').value = DEFAULT_ACTIONS[stage] || 'whatsapp_template';
    document.getElementById('followup-stage-note').value = '';

    // Show/hide template name based on action
    const actionSelect = document.getElementById('followup-stage-action');
    const tplGroup = document.getElementById('followup-stage-template-group');
    const submitLabel = document.getElementById('followup-stage-submit-label');
    const updateVisibility = () => {
      const isWA = actionSelect.value.startsWith('whatsapp');
      tplGroup.style.display = isWA ? 'block' : 'none';
      submitLabel.textContent = isWA ? 'Send Now' : 'Log It';
    };
    updateVisibility();
    actionSelect.onchange = updateVisibility;

    modal.style.display = 'flex';
    lucide.createIcons();
  }

  async handleFollowupStageSend(e) {
    e.preventDefault();
    const studentId = document.getElementById('followup-stage-student-id').value;
    const stage = Number(document.getElementById('followup-stage-number').value);
    const action = document.getElementById('followup-stage-action').value;
    const templateName = document.getElementById('followup-stage-template').value;
    const note = document.getElementById('followup-stage-note').value;

    try {
      await db.sendFollowupStage(studentId, { stage, action, templateName, note });
      document.getElementById('followup-stage-modal').style.display = 'none';
      const isWA = action.startsWith('whatsapp');
      this.showToast(isWA ? 'WhatsApp message sent and logged.' : 'Action logged successfully.');
      this.loadFeeFollowups();
    } catch (error) {
      this.showToast(error.message || 'Failed to send/log stage.', 'danger');
    }
  }

  async handleStartFollowups() {
    // Use the same fee reminder selection checkboxes
    const checked = document.querySelectorAll('#fee-reminder-recipients-list input[type=checkbox]:checked');
    const studentIds = Array.from(checked).map(cb => cb.dataset.id);
    if (!studentIds.length) {
      this.showToast('Select students in the fee reminder list above first.', 'danger');
      return;
    }
    if (!await this.confirmAction(`Start follow-up pipeline for ${studentIds.length} student(s)?`)) return;
    try {
      const result = await db.startFeeFollowups(studentIds);
      const succeeded = (result.results || []).filter(r => r.success).length;
      const failed = (result.results || []).filter(r => !r.success);
      let msg = `Follow-up started for ${succeeded} student(s).`;
      if (failed.length) msg += ` ${failed.length} failed: ${failed.map(f => f.error || f.studentId).join(', ')}`;
      this.showToast(msg, failed.length ? 'danger' : undefined);
      this.loadFeeFollowups();
    } catch (error) {
      this.showToast(error.message || 'Failed to start follow-ups.', 'danger');
    }
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }
}

// Instantiate and initialize the app
const app = new AppController();

document.addEventListener("DOMContentLoaded", async () => {
  await db.ready;
  await app.init();
});
