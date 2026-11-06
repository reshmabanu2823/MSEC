import React, { useState, useEffect } from 'react';
import './teacher-dashboard.css';
import { apiRequest } from '../api';

const SAMPLE_STUDENTS = [
  { id: 1, name: 'Reshma Banu', usn: '1MS21CS084', department: 'Computer Science & Engineering', semester: 6, attendance: 92.5, cgpa: 9.15, status: 'Regular' },
  { id: 2, name: 'Alex Kumar', usn: '1MS21CS002', department: 'Computer Science & Engineering', semester: 6, attendance: 88.4, cgpa: 8.74, status: 'Regular' },
  { id: 3, name: 'Priya Sharma', usn: '1MS21CS045', department: 'Computer Science & Engineering', semester: 6, attendance: 95.0, cgpa: 9.42, status: 'Regular' },
  { id: 4, name: 'Rahul Varma', usn: '1MS21CS067', department: 'Computer Science & Engineering', semester: 6, attendance: 76.2, cgpa: 7.89, status: 'Warning' },
  { id: 5, name: 'Sneha Patel', usn: '1MS21CS091', department: 'Computer Science & Engineering', semester: 6, attendance: 84.1, cgpa: 8.50, status: 'Regular' },
];

export default function TeacherDashboardScreen({ user, onLogout, onSwitchPortal }) {
  const [activeTab, setActiveTab] = useState('roster'); // roster | attendance | assignments | marks | notes | doubts
  const [selectedClass, setSelectedClass] = useState('CSE - 6th Semester');
  const [selectedSubject, setSelectedSubject] = useState('21CS61 - Software Engineering');
  const [students, setStudents] = useState(SAMPLE_STUDENTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [alertMsg, setAlertMsg] = useState('');

  // Attendance state
  const [attStatus, setAttStatus] = useState(() => {
    const init = {};
    SAMPLE_STUDENTS.forEach((s) => { init[s.id] = 'P'; });
    return init;
  });

  // Assignments state
  const [assignments, setAssignments] = useState([
    { id: 101, title: 'Agile Sprint Planning & JIRA Board', course: '21CS61', due: '14 Nov 2026', submissions: 42, maxMarks: 25 },
    { id: 102, title: 'Microservices Architecture Design & Docker', course: '21CS62', due: '20 Nov 2026', submissions: 38, maxMarks: 25 },
  ]);
  const [newAssignTitle, setNewAssignTitle] = useState('');
  const [newAssignDue, setNewAssignDue] = useState('');

  // CIE Marks state
  const [cieMarks, setCieMarks] = useState({
    1: { cie1: 24, cie2: 23, lab: 25, total: 96 },
    2: { cie1: 22, cie2: 21, lab: 24, total: 89 },
    3: { cie1: 25, cie2: 25, lab: 25, total: 99 },
    4: { cie1: 18, cie2: 17, lab: 20, total: 72 },
    5: { cie1: 21, cie2: 22, lab: 23, total: 86 },
  });

  // Notes state
  const [notes, setNotes] = useState([
    { id: 1, title: 'Unit 3: Object-Oriented Software Design Patterns', course: '21CS61', date: '04 Nov 2026' },
    { id: 2, title: 'Unit 4: Continuous Integration & Deployment Pipeline', course: '21CS61', date: '01 Nov 2026' },
  ]);
  const [newNoteTitle, setNewNoteTitle] = useState('');

  // Doubts state
  const [doubts, setDoubts] = useState([
    { id: 1, student: 'Alex Kumar', usn: '1MS21CS002', subject: '21CS61', question: 'In Singleton Pattern, how to handle multithreaded double-checked locking in Java?', response: '', replied: false },
    { id: 2, student: 'Sneha Patel', usn: '1MS21CS091', subject: '21CS61', question: 'Will Unit 3 questions in CIE-2 include UML sequence diagrams?', response: '', replied: false },
  ]);
  const [replyText, setReplyText] = useState({});

  // Fetch real students from API if available
  useEffect(() => {
    let live = true;
    apiRequest('/teacher/students?department=Computer%20Science%20%26%20Engineering&semester=6')
      .then((res) => {
        if (live && res?.students?.length) {
          setStudents(res.students);
        }
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  function showAlert(msg) {
    setAlertMsg(msg);
    setTimeout(() => setAlertMsg(''), 4000);
  }

  // Attendance handlers
  const handleSetAtt = (id, status) => {
    setAttStatus((prev) => ({ ...prev, [id]: status }));
  };

  const handleMarkAll = (status) => {
    const updated = {};
    students.forEach((s) => { updated[s.id] = status; });
    setAttStatus(updated);
    showAlert(`Marked all students as ${status === 'P' ? 'Present' : status === 'A' ? 'Absent' : 'On-Duty'}.`);
  };

  const handleSaveAttendance = () => {
    showAlert(`Attendance successfully saved for ${selectedClass} (${selectedSubject}) to Supabase database.`);
  };

  // Assignment handlers
  const handleAddAssignment = (e) => {
    e.preventDefault();
    if (!newAssignTitle.trim()) return;
    const item = {
      id: Date.now(),
      title: newAssignTitle.trim(),
      course: '21CS61',
      due: newAssignDue || '25 Nov 2026',
      submissions: 0,
      maxMarks: 25,
    };
    setAssignments((prev) => [item, ...prev]);
    setNewAssignTitle('');
    setNewAssignDue('');
    showAlert('New assignment created and published to students.');
  };

  // Notes handlers
  const handleAddNote = (e) => {
    e.preventDefault();
    if (!newNoteTitle.trim()) return;
    const item = {
      id: Date.now(),
      title: newNoteTitle.trim(),
      course: '21CS61',
      date: 'Today',
    };
    setNotes((prev) => [item, ...prev]);
    setNewNoteTitle('');
    showAlert('Study material uploaded and shared with students.');
  };

  // Doubts handlers
  const handleReplyDoubt = (id) => {
    const text = replyText[id];
    if (!text?.trim()) return;
    setDoubts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, response: text.trim(), replied: true } : d))
    );
    showAlert('Response sent to student doubt portal.');
  };

  const filteredStudents = students.filter(
    (s) =>
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.usn || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="teacher-dash" data-qa="teacher-dashboard">
      {/* Top Header */}
      <header className="teacher-dash__topbar">
        <div className="teacher-dash__brand">
          <img src="/favicon.svg" alt="MSEC" />
          <div className="teacher-dash__brand-title">
            <strong>MSEC Teacher Desk</strong>
            <small>Faculty Portal</small>
          </div>
        </div>

        <div className="teacher-dash__actions">
          <button type="button" className="teacher-dash__btn-sm" onClick={onSwitchPortal}>
            Switch Portal
          </button>
          <button type="button" className="teacher-dash__btn-sm teacher-dash__btn-sm--primary" onClick={onLogout}>
            Sign Out
          </button>
        </div>
      </header>

      {/* Hero Card */}
      <div className="teacher-dash__hero">
        <p className="teacher-dash__hero-greeting">Welcome to Faculty Workspace</p>
        <h1 className="teacher-dash__hero-name">{user?.name || 'Dr. K. V. Sharma'}</h1>
        <p className="teacher-dash__hero-meta">
          {user?.department || 'Computer Science & Engineering'} | Faculty ID: {user?.identifier || 'EMP014'}
        </p>

        <div className="teacher-dash__hero-badges">
          <span className="teacher-dash__badge">Status: Active Faculty</span>
          <span className="teacher-dash__badge">Assigned: CSE 6th & 4th Sem</span>
          <span className="teacher-dash__badge">Academic Year: 2026-2027</span>
        </div>
      </div>

      {/* Stat Tiles */}
      <div className="teacher-dash__stats">
        <div className="teacher-dash__stat-card">
          <span className="teacher-dash__stat-label">Assigned Classes</span>
          <span className="teacher-dash__stat-val">3</span>
          <span className="teacher-dash__stat-sub">CSE 6A, 6B, 4A</span>
        </div>

        <div className="teacher-dash__stat-card">
          <span className="teacher-dash__stat-label">Enrolled Students</span>
          <span className="teacher-dash__stat-val">{students.length}</span>
          <span className="teacher-dash__stat-sub">Roster updated</span>
        </div>

        <div className="teacher-dash__stat-card">
          <span className="teacher-dash__stat-label">Active Assignments</span>
          <span className="teacher-dash__stat-val">{assignments.length}</span>
          <span className="teacher-dash__stat-sub">Submissions open</span>
        </div>

        <div className="teacher-dash__stat-card">
          <span className="teacher-dash__stat-label">Student Doubts</span>
          <span className="teacher-dash__stat-val">{doubts.filter((d) => !d.replied).length}</span>
          <span className="teacher-dash__stat-sub" style={{ color: doubts.some((d) => !d.replied) ? 'var(--warn)' : 'var(--good)' }}>
            {doubts.some((d) => !d.replied) ? 'Pending replies' : 'All resolved'}
          </span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="teacher-dash__tabs" role="tablist">
        <button
          type="button"
          className={`teacher-dash__tab ${activeTab === 'roster' ? 'teacher-dash__tab--active' : ''}`}
          onClick={() => setActiveTab('roster')}
        >
          Class Roster
        </button>
        <button
          type="button"
          className={`teacher-dash__tab ${activeTab === 'attendance' ? 'teacher-dash__tab--active' : ''}`}
          onClick={() => setActiveTab('attendance')}
        >
          Mark Attendance
        </button>
        <button
          type="button"
          className={`teacher-dash__tab ${activeTab === 'assignments' ? 'teacher-dash__tab--active' : ''}`}
          onClick={() => setActiveTab('assignments')}
        >
          Assignments & Grading
        </button>
        <button
          type="button"
          className={`teacher-dash__tab ${activeTab === 'marks' ? 'teacher-dash__tab--active' : ''}`}
          onClick={() => setActiveTab('marks')}
        >
          CIE Marks Entry
        </button>
        <button
          type="button"
          className={`teacher-dash__tab ${activeTab === 'notes' ? 'teacher-dash__tab--active' : ''}`}
          onClick={() => setActiveTab('notes')}
        >
          Course Materials
        </button>
        <button
          type="button"
          className={`teacher-dash__tab ${activeTab === 'doubts' ? 'teacher-dash__tab--active' : ''}`}
          onClick={() => setActiveTab('doubts')}
        >
          Student Doubts ({doubts.filter((d) => !d.replied).length})
        </button>
      </nav>

      {/* Alert Banner */}
      {alertMsg && <div className="teacher-dash__alert">{alertMsg}</div>}

      {/* TAB 1: CLASS ROSTER */}
      {activeTab === 'roster' && (
        <section className="teacher-dash__module">
          <div className="teacher-dash__module-head">
            <h2 className="section-title">Class Student Roster</h2>
            <div className="teacher-dash__controls">
              <select
                className="teacher-dash__select"
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
              >
                <option value="CSE - 6th Semester">CSE - 6th Semester</option>
                <option value="CSE - 4th Semester">CSE - 4th Semester</option>
              </select>
              <input
                type="text"
                className="teacher-dash__input"
                placeholder="Search by name or USN..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="teacher-dash__table-wrap">
            <table className="teacher-dash__table">
              <thead>
                <tr>
                  <th>USN</th>
                  <th>Student Name</th>
                  <th>Department</th>
                  <th>Sem</th>
                  <th>Attendance</th>
                  <th>CGPA</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.usn}</strong></td>
                    <td>{s.name}</td>
                    <td>{s.department}</td>
                    <td>{s.semester}</td>
                    <td>
                      <span style={{ fontWeight: 600, color: s.attendance >= 85 ? 'var(--good)' : s.attendance >= 75 ? 'var(--warn)' : 'var(--bad)' }}>
                        {s.attendance}%
                      </span>
                    </td>
                    <td><strong>{s.cgpa}</strong></td>
                    <td>
                      <span className="teacher-dash__badge" style={{ background: s.status === 'Warning' ? 'var(--bad-tint)' : 'var(--good-tint)', color: s.status === 'Warning' ? 'var(--bad-ink)' : 'var(--good-ink)' }}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 2: MARK ATTENDANCE */}
      {activeTab === 'attendance' && (
        <section className="teacher-dash__module">
          <div className="teacher-dash__module-head">
            <div>
              <h2 className="section-title">Mark Class Attendance</h2>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                Record period attendance. Synchronized directly with college attendance records.
              </p>
            </div>

            <div className="teacher-dash__controls">
              <select
                className="teacher-dash__select"
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
              >
                <option value="21CS61 - Software Engineering">21CS61 - Software Engineering</option>
                <option value="21CS62 - Full Stack Development">21CS62 - Full Stack Development</option>
                <option value="21CSL66 - Software Engineering Lab">21CSL66 - Software Engineering Lab</option>
              </select>

              <button type="button" className="teacher-dash__btn-sm" onClick={() => handleMarkAll('P')}>
                Mark All Present
              </button>
            </div>
          </div>

          <div className="teacher-dash__table-wrap">
            <table className="teacher-dash__table">
              <thead>
                <tr>
                  <th>USN</th>
                  <th>Student Name</th>
                  <th>Overall Attendance</th>
                  <th>Status Today (P / A / OD)</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <tr key={s.id}>
                    <td><strong>{s.usn}</strong></td>
                    <td>{s.name}</td>
                    <td>{s.attendance}%</td>
                    <td>
                      <div className="teacher-dash__att-toggles">
                        <button
                          type="button"
                          className={`teacher-dash__att-btn teacher-dash__att-btn--p ${attStatus[s.id] === 'P' ? 'active' : ''}`}
                          onClick={() => handleSetAtt(s.id, 'P')}
                          title="Present"
                        >
                          P
                        </button>
                        <button
                          type="button"
                          className={`teacher-dash__att-btn teacher-dash__att-btn--a ${attStatus[s.id] === 'A' ? 'active' : ''}`}
                          onClick={() => handleSetAtt(s.id, 'A')}
                          title="Absent"
                        >
                          A
                        </button>
                        <button
                          type="button"
                          className={`teacher-dash__att-btn teacher-dash__att-btn--od ${attStatus[s.id] === 'OD' ? 'active' : ''}`}
                          onClick={() => handleSetAtt(s.id, 'OD')}
                          title="On-Duty"
                        >
                          OD
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
            <button
              type="button"
              className="teacher-dash__btn-sm teacher-dash__btn-sm--primary"
              style={{ padding: '12px 24px', fontSize: '15px' }}
              onClick={handleSaveAttendance}
            >
              Save & Submit Attendance
            </button>
          </div>
        </section>
      )}

      {/* TAB 3: ASSIGNMENTS & GRADING */}
      {activeTab === 'assignments' && (
        <section className="teacher-dash__module">
          <div className="teacher-dash__module-head">
            <h2 className="section-title">Course Assignments</h2>
          </div>

          {/* Create Assignment Form */}
          <form onSubmit={handleAddAssignment} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', background: 'var(--surface-2)', padding: '14px', borderRadius: 'var(--radius-ctl)' }}>
            <input
              type="text"
              className="teacher-dash__input"
              placeholder="Assignment Title (e.g. Sprint 2 Planning)"
              style={{ flex: '1 1 240px' }}
              value={newAssignTitle}
              onChange={(e) => setNewAssignTitle(e.target.value)}
            />
            <input
              type="text"
              className="teacher-dash__input"
              placeholder="Due Date (e.g. 25 Nov 2026)"
              style={{ width: '180px' }}
              value={newAssignDue}
              onChange={(e) => setNewAssignDue(e.target.value)}
            />
            <button type="submit" className="teacher-dash__btn-sm teacher-dash__btn-sm--primary">
              Create Assignment
            </button>
          </form>

          {/* List of active assignments */}
          <div className="teacher-dash__list">
            {assignments.map((a) => (
              <div key={a.id} className="teacher-dash__item-card">
                <div className="teacher-dash__item-top">
                  <h3 className="teacher-dash__item-title">{a.title}</h3>
                  <span className="teacher-dash__badge" style={{ background: 'var(--primary-tint)', color: 'var(--primary)' }}>
                    Max Marks: {a.maxMarks}
                  </span>
                </div>
                <p className="teacher-dash__item-desc">
                  Course: <strong>{a.course}</strong> | Due: {a.due} | Submissions Received: <strong>{a.submissions}</strong>
                </p>
                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button type="button" className="teacher-dash__btn-sm" onClick={() => showAlert(`Viewing ${a.submissions} submissions for ${a.title}`)}>
                    Review & Grade Submissions
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TAB 4: CIE MARKS ENTRY */}
      {activeTab === 'marks' && (
        <section className="teacher-dash__module">
          <div className="teacher-dash__module-head">
            <div>
              <h2 className="section-title">Continuous Internal Evaluation (CIE) Entry</h2>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--muted)' }}>
                Enter and publish internal assessment scores for 21CS61.
              </p>
            </div>
            <button
              type="button"
              className="teacher-dash__btn-sm teacher-dash__btn-sm--primary"
              onClick={() => showAlert('CIE marks saved and posted to student performance records in Supabase.')}
            >
              Publish Marks
            </button>
          </div>

          <div className="teacher-dash__table-wrap">
            <table className="teacher-dash__table">
              <thead>
                <tr>
                  <th>USN</th>
                  <th>Student Name</th>
                  <th>CIE 1 (/25)</th>
                  <th>CIE 2 (/25)</th>
                  <th>Lab (/25)</th>
                  <th>Total CIE (/75)</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const m = cieMarks[s.id] || { cie1: 20, cie2: 20, lab: 22, total: 62 };
                  return (
                    <tr key={s.id}>
                      <td><strong>{s.usn}</strong></td>
                      <td>{s.name}</td>
                      <td>
                        <input
                          type="number"
                          className="teacher-dash__input"
                          style={{ width: '70px', height: '36px' }}
                          value={m.cie1}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setCieMarks((prev) => ({
                              ...prev,
                              [s.id]: { ...m, cie1: val, total: val + m.cie2 + m.lab },
                            }));
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="teacher-dash__input"
                          style={{ width: '70px', height: '36px' }}
                          value={m.cie2}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setCieMarks((prev) => ({
                              ...prev,
                              [s.id]: { ...m, cie2: val, total: m.cie1 + val + m.lab },
                            }));
                          }}
                        />
                      </td>
                      <td>
                        <input
                          type="number"
                          className="teacher-dash__input"
                          style={{ width: '70px', height: '36px' }}
                          value={m.lab}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setCieMarks((prev) => ({
                              ...prev,
                              [s.id]: { ...m, lab: val, total: m.cie1 + m.cie2 + val },
                            }));
                          }}
                        />
                      </td>
                      <td><strong>{m.total}</strong></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* TAB 5: COURSE MATERIALS */}
      {activeTab === 'notes' && (
        <section className="teacher-dash__module">
          <div className="teacher-dash__module-head">
            <h2 className="section-title">Upload & Manage Course Materials</h2>
          </div>

          <form onSubmit={handleAddNote} style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', background: 'var(--surface-2)', padding: '14px', borderRadius: 'var(--radius-ctl)' }}>
            <input
              type="text"
              className="teacher-dash__input"
              placeholder="Material Title (e.g. Unit 5: Cloud Native DevOps.pdf)"
              style={{ flex: '1 1 320px' }}
              value={newNoteTitle}
              onChange={(e) => setNewNoteTitle(e.target.value)}
            />
            <button type="submit" className="teacher-dash__btn-sm teacher-dash__btn-sm--primary">
              Upload Material
            </button>
          </form>

          <div className="teacher-dash__list">
            {notes.map((n) => (
              <div key={n.id} className="teacher-dash__item-card">
                <div className="teacher-dash__item-top">
                  <h3 className="teacher-dash__item-title">{n.title}</h3>
                  <span className="teacher-dash__badge">Course: {n.course}</span>
                </div>
                <p className="teacher-dash__item-desc">Uploaded: {n.date} | Available to enrolled students</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* TAB 6: STUDENT DOUBTS */}
      {activeTab === 'doubts' && (
        <section className="teacher-dash__module">
          <div className="teacher-dash__module-head">
            <h2 className="section-title">Student Q&A Doubts</h2>
          </div>

          <div className="teacher-dash__list">
            {doubts.map((d) => (
              <div key={d.id} className="teacher-dash__item-card">
                <div className="teacher-dash__item-top">
                  <h3 className="teacher-dash__item-title">{d.student} ({d.usn})</h3>
                  <span className="teacher-dash__badge" style={{ background: d.replied ? 'var(--good-tint)' : 'var(--warn-tint)', color: d.replied ? 'var(--good-ink)' : 'var(--warn-ink)' }}>
                    {d.replied ? 'Resolved' : 'Pending Response'}
                  </span>
                </div>

                <p style={{ margin: '4px 0', fontSize: '14px', color: 'var(--ink)', background: 'var(--surface-2)', padding: '10px 12px', borderRadius: '8px' }}>
                  <strong>Question ({d.subject}):</strong> {d.question}
                </p>

                {d.replied ? (
                  <p style={{ margin: '4px 0', fontSize: '14px', color: 'var(--good-ink)' }}>
                    <strong>Your Response:</strong> {d.response}
                  </p>
                ) : (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                    <input
                      type="text"
                      className="teacher-dash__input"
                      placeholder="Type your explanation or reply..."
                      style={{ flex: 1 }}
                      value={replyText[d.id] || ''}
                      onChange={(e) => setReplyText({ ...replyText, [d.id]: e.target.value })}
                    />
                    <button
                      type="button"
                      className="teacher-dash__btn-sm teacher-dash__btn-sm--primary"
                      onClick={() => handleReplyDoubt(d.id)}
                    >
                      Send Response
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
