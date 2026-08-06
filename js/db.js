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

  async studentLogin(studentId, password) {
    return this.request('/auth/student/login', {
      method: 'POST',
      body: JSON.stringify({ studentId, password })
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
      theoryTotal: match.theoryTotal ?? 25
    } : { testType: 'Test', testNumber: '', date: '', cetTotal: 25, theoryTotal: 25 };
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
}

export const db = new DatabaseManager();
export { ApiError };
