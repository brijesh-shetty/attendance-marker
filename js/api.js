// API Client helper for Galaxy Academy REST API

const API_BASE_URL = window.location.origin.includes('localhost')
  ? 'http://localhost:5000/api'
  : '/api';

class ApiClient {
  constructor() {
    this.baseUrl = API_BASE_URL;
  }

  getToken() {
    return localStorage.getItem('ga_jwt_token') || sessionStorage.getItem('ga_jwt_token');
  }

  async request(endpoint, options = {}) {
    const token = this.getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options.headers
    };

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        ...options,
        headers
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || `API error: ${response.status}`);
      }
      return data;
    } catch (err) {
      console.warn(`[API] Request to ${endpoint} failed:`, err.message);
      throw err;
    }
  }

  // Auth endpoints
  async adminLogin(passcode) {
    return this.request('/auth/admin-login', {
      method: 'POST',
      body: JSON.stringify({ passcode })
    });
  }

  async studentLogin(studentId, password) {
    return this.request('/auth/student-login', {
      method: 'POST',
      body: JSON.stringify({ studentId, password })
    });
  }

  // Students endpoints
  async getStudents() {
    return this.request('/students');
  }

  async saveStudent(student) {
    return this.request('/students', {
      method: 'POST',
      body: JSON.stringify(student)
    });
  }

  // Attendance endpoints
  async getAttendance(dateString) {
    return this.request(`/attendance?date=${dateString}`);
  }

  async saveAttendance(dateString, records) {
    return this.request('/attendance', {
      method: 'POST',
      body: JSON.stringify({ date: dateString, records })
    });
  }

  // Tests endpoints
  async getTestMarks(testId, subject) {
    return this.request(`/tests/marks?testId=${encodeURIComponent(testId)}&subject=${encodeURIComponent(subject)}`);
  }

  // Payments endpoints
  async getPayments(studentId = null) {
    return this.request(studentId ? `/payments?studentId=${studentId}` : '/payments');
  }

  async savePayment(studentId, monthYear, status, amount, notes) {
    return this.request('/payments', {
      method: 'POST',
      body: JSON.stringify({ studentId, monthYear, status, amount, notes })
    });
  }
}

export const api = new ApiClient();
