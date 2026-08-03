-- PostgreSQL Database Schema for Galaxy Academy

-- 1. Students Table
CREATE TABLE IF NOT EXISTS students (
    id SERIAL PRIMARY KEY,                    -- Sequential numeric Student ID starting from 1
    name VARCHAR(200) NOT NULL,
    combination VARCHAR(10),                   -- CS, BIO, ELE
    college VARCHAR(100),
    phone VARCHAR(15) NOT NULL,                -- Parent phone 1 (also default password)
    parent_phone_2 VARCHAR(15),                -- Parent phone 2
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- 2. Student Credentials Table
CREATE TABLE IF NOT EXISTS student_credentials (
    id SERIAL PRIMARY KEY,
    student_id INTEGER UNIQUE REFERENCES students(id) ON DELETE CASCADE,
    password_hash VARCHAR(255) NOT NULL,
    must_change_password BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW()
);

-- 3. Admin Credentials / Config
CREATE TABLE IF NOT EXISTS admin_config (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL
);

-- 4. Attendance Table
CREATE TABLE IF NOT EXISTS attendance (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    status CHAR(1) NOT NULL CHECK (status IN ('P', 'A')),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(student_id, date)
);

-- 5. Tests Metadata
CREATE TABLE IF NOT EXISTS tests (
    id SERIAL PRIMARY KEY,
    test_type VARCHAR(20) NOT NULL,            -- Test, Midterm, Final, Quiz
    test_number VARCHAR(10) NOT NULL,
    subject VARCHAR(50) NOT NULL,
    test_date DATE,
    syllabus TEXT,
    max_marks INTEGER DEFAULT 100,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(test_type, test_number, subject)
);

-- 6. Test Marks
CREATE TABLE IF NOT EXISTS test_marks (
    id SERIAL PRIMARY KEY,
    test_id INTEGER REFERENCES tests(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    marks VARCHAR(10),                         -- Numerical score or 'AB'
    is_present BOOLEAN DEFAULT true,
    UNIQUE(test_id, student_id)
);

-- 7. Monthly Fee Payments
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    student_id INTEGER REFERENCES students(id) ON DELETE CASCADE,
    month_year VARCHAR(30) NOT NULL,           -- e.g. 'July 2026'
    amount DECIMAL(10,2),
    status VARCHAR(20) DEFAULT 'due' CHECK (status IN ('paid', 'due', 'partial')),
    notes TEXT,
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(student_id, month_year)
);

-- 8. Announcements Log
CREATE TABLE IF NOT EXISTS announcements (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200),
    message TEXT NOT NULL,
    target_group VARCHAR(20) DEFAULT 'all',     -- all, CS, BIO, ELE
    sent_via VARCHAR(20) DEFAULT 'fast2sms',
    sent_at TIMESTAMP DEFAULT NOW()
);
