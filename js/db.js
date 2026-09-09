class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

class DatabaseManager {
  constructor() {
    // Kept for the existing app bootstrap. The server is now the only Firestore client.
    this.ready = Promise.resolve();
  }

  async request(endpoint, options = {}) {
    const response = await fetch(`/api${endpoint}`, {
      credentials: 'same-origin',
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers
      },
      ...options
    });

    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(data.message || 'The request failed.', response.status);
    return data;
  }

  async getSession() {
    return this.request('/auth/me');
  }

  async adminLogin(password) {
    return this.request('/auth/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password })
    });
  }

  async getBatches() {
    return this.request('/admin/batches');
  }

  async createBatch(batchNumber, academicYear, grade) {
    return (await this.request('/admin/batches', { method: 'POST', body: JSON.stringify({ batchNumber, academicYear, grade }) })).batch;
  }

  async selectBatch(batchId) {
    return (await this.request('/admin/batches/select', { method: 'POST', body: JSON.stringify({ batchId }) })).batch;
  }

  async studentLogin(credentials, passwordArg) {
    // Support both the legacy 2-argument shape (studentId, password) and the
    // new object form { batchNumber, year, grade, number, studentId, password }.
    const body = typeof credentials === 'string'
      ? { studentId: credentials, password: passwordArg }
      : credentials;
    return this.request('/auth/student/login', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  }

  async logout() {
    return this.request('/auth/logout', { method: 'POST' });
  }

  async getStudents() {
    return (await this.request('/admin/students')).students;
  }

  async saveStudent(student) {
    const id = encodeURIComponent(student.id);
    return (await this.request(`/admin/students/${id}`, {
      method: 'PUT',
      body: JSON.stringify(student)
    })).student;
  }

  async deleteStudent(studentId) {
    return this.request(`/admin/students/${encodeURIComponent(studentId)}`, { method: 'DELETE' });
  }

  async resetStudentPassword(studentId) {
    return this.request(`/admin/students/${encodeURIComponent(studentId)}/reset-password`, { method: 'POST' });
  }

  async getAttendance(dateString) {
    return (await this.request(`/admin/attendance?date=${encodeURIComponent(dateString)}`)).records;
  }

  async saveAttendance(dateString, records) {
    return this.request('/admin/attendance', {
      method: 'POST',
      body: JSON.stringify({ date: dateString, records })
    });
  }

  async getAllAttendanceForMonth(year, month) {
    return (await this.request(`/admin/attendance/month?year=${encodeURIComponent(year)}&month=${encodeURIComponent(month)}`)).attendance;
  }

  async getTestMarks(testId, subject) {
    return (await this.request(`/admin/tests/marks?testId=${encodeURIComponent(testId)}&subject=${encodeURIComponent(subject)}`)).results;
  }

  async saveTestMarks(testId, subject, results, metadata = {}) {
    return this.request('/admin/tests/marks', {
      method: 'POST',
      body: JSON.stringify({ testId, subject, results, metadata })
    });
  }

  async getTestMetadata(testId, subject) {
    const tests = await this.getAllTests();
    const match = tests.find(test => test.testId === testId && test.subject === subject);
    return match ? {
      testType: match.testType || 'Test',
      testNumber: match.testNumber || '',
      date: match.date || '',
      cetTotal: match.cetTotal ?? 25,
      theoryTotal: match.theoryTotal ?? 25,
      sumTotal: match.sumTotal ?? ((match.cetTotal ?? 25) + (match.theoryTotal ?? 25))
    } : { testType: 'Test', testNumber: '', date: '', cetTotal: 25, theoryTotal: 25, sumTotal: 50 };
  }

  async getAllTests() {
    return (await this.request('/admin/tests')).tests;
  }

  async getSyllabus(testId) {
    return (await this.request(`/admin/syllabus?testId=${encodeURIComponent(testId)}`)).subjects;
  }

  async saveSyllabus(testId, subjects) {
    return this.request('/admin/syllabus', {
      method: 'POST',
      body: JSON.stringify({ testId, subjects })
    });
  }

  async getPayments() {
    return (await this.request('/admin/payments')).payments;
  }

  async savePayment(studentId, monthYearStr, status, amount = '', notes = '') {
    return this.request('/admin/payments', {
      method: 'POST',
      body: JSON.stringify({ studentId, monthYear: monthYearStr, status, amount, notes })
    });
  }

  async saveTotalFee(studentId, totalFee) {
    return this.request(`/admin/payments/${encodeURIComponent(studentId)}/total-fee`, {
      method: 'POST',
      body: JSON.stringify({ totalFee })
    });
  }

  async addPaymentTransaction(studentId, date, amount, note = '') {
    return this.request(`/admin/payments/${encodeURIComponent(studentId)}/transactions`, {
      method: 'POST',
      body: JSON.stringify({ date, amount, note })
    });
  }

  async updatePaymentTransaction(studentId, transactionIndex, date, amount, note = '') {
    return this.request(`/admin/payments/${encodeURIComponent(studentId)}/transactions/${encodeURIComponent(transactionIndex)}`, {
      method: 'PATCH',
      body: JSON.stringify({ date, amount, note })
    });
  }

  async deletePaymentTransaction(studentId, transactionIndex) {
    return this.request(`/admin/payments/${encodeURIComponent(studentId)}/transactions/${encodeURIComponent(transactionIndex)}`, {
      method: 'DELETE'
    });
  }

  async deleteAllPaymentTransactions(studentId) {
    return this.request(`/admin/payments/${encodeURIComponent(studentId)}/transactions`, {
      method: 'DELETE'
    });
  }

  async sendFeeReminders(payload) {
    return this.request('/admin/fee-reminders', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async getFeeReminders(date) {
    return this.request(`/admin/fee-reminders?date=${encodeURIComponent(date)}`);
  }

  async getAttendanceReminders(date) {
    return this.request(`/admin/attendance-reminders?date=${encodeURIComponent(date)}`);
  }

  async exportJSON() {
    return JSON.stringify(await this.request('/admin/export'), null, 2);
  }

  async importJSON(jsonData) {
    let data;
    try {
      data = JSON.parse(jsonData);
    } catch (error) {
      throw new ApiError('The backup file is not valid JSON.', 400);
    }
    return this.request('/admin/import', {
      method: 'POST',
      body: JSON.stringify({ data })
    });
  }

  async getStudentProfile() {
    return (await this.request('/student/profile')).student;
  }

  async getStudentAttendance() {
    return (await this.request('/student/attendance')).attendance;
  }

  async getStudentTests() {
    return (await this.request('/student/tests')).tests;
  }

  async getStudentPayments() {
    return (await this.request('/student/payments')).payments;
  }

  async changeStudentPassword(currentPassword, newPassword) {
    return this.request('/auth/student/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
  }

  async getConversations() {
    return (await this.request('/replies/conversations')).conversations;
  }

  async sendReply(wa_id, text) {
    return this.request('/replies/send', {
      method: 'POST',
      body: JSON.stringify({ wa_id, text })
    });
  }

  async sendTemplateReply(wa_id, template_name, params = [], language = 'en') {
    return this.request('/replies/send-template', {
      method: 'POST',
      body: JSON.stringify({ wa_id, template_name, params, language })
    });
  }

  async getWhatsAppReplies(limit = 50) {
    return (await this.request(`/admin/whatsapp-replies?limit=${limit}`)).replies;
  }

  async markReplyRead(replyId) {
    return this.request(`/admin/whatsapp-replies/${encodeURIComponent(replyId)}/read`, {
      method: 'PATCH'
    });
  }

  async deleteReply(replyId) {
    return this.request(`/admin/whatsapp-replies/${encodeURIComponent(replyId)}`, {
      method: 'DELETE'
    });
  }

  async getAdminResources() {
    return (await this.request('/admin/resources')).resources;
  }

  async uploadAdminResource(payload) {
    return this.request('/admin/resources', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }

  async deleteAdminResource(resourceId) {
    return this.request(`/admin/resources/${encodeURIComponent(resourceId)}`, {
      method: 'DELETE'
    });
  }

  async getStudentResources() {
    return (await this.request('/student/resources')).resources;
  }
}

export const db = new DatabaseManager();
export { ApiError };
