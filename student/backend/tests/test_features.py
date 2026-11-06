"""Every user action in the student app, sent the way the frontend sends it, as the role that uses it.

Each test checks the HTTP status and that the change is visible afterwards.
"""
import io

import pytest

from database import get_db
from helpers import ADMIN, ALEX, FACULTY, auth

CSE = 'Computer Science & Engineering'


@pytest.fixture(autouse=True)
def faculty_teaches_cse6(app):
    conn = get_db()
    fid = conn.execute("SELECT id FROM users WHERE email = ?", (FACULTY,)).fetchone()[0]
    conn.execute("INSERT OR IGNORE INTO teacher_classes (user_id, department, semester) VALUES (?, ?, 6)", (fid, CSE))
    conn.commit()
    conn.close()


def ok(r, *codes):
    codes = codes or (200, 201)
    assert r.status_code in codes, f'{r.status_code}: {r.get_data(as_text=True)[:300]}'
    return r.get_json(silent=True) or {}


def first_id(client, path, key, who=ALEX):
    data = ok(client.get(path, headers=auth(who)))
    rows = data[key] if key else data
    assert rows, f'no rows at {path}'
    return rows[0]['id']


def files(**kw):
    return {k: (io.BytesIO(b'%PDF-1.4 test'), v) for k, v in kw.items()}


# ---------------- Dashboard / assignments ----------------

def test_dashboard_pending_assignments_are_submittable(client):
    aid = ok(client.get('/api/dashboard/summary', headers=auth(ALEX)))['pending_assignments'][0]['id']
    ok(client.post(f'/api/assignments/{aid}/upload', data={'file': (io.BytesIO(b'x'), 'a.zip')}, headers=auth(ALEX), content_type='multipart/form-data'))
    assert all(a['id'] != aid for a in ok(client.get('/api/dashboard/summary', headers=auth(ALEX)))['pending_assignments'])


def test_assignment_upload_create_evaluate(client):
    ok(client.post('/api/assignments/1/upload', data={'file': (io.BytesIO(b'x'), 'sol.zip')}, headers=auth(ALEX), content_type='multipart/form-data'))
    ok(client.post('/api/assignments', json={'course_code': 'CS601', 'course_title': 'Term', 'title': 'New Lab', 'description': 'd', 'deadline_date': '2026-12-01 23:59', 'max_marks': 20, 'created_by': 'x'}, headers=auth(FACULTY)))
    assert any(a['title'] == 'New Lab' for a in ok(client.get('/api/assignments', headers=auth(ALEX)))['assignments'])
    ok(client.post('/api/assignments/1/evaluate', json={'scored_marks': 22, 'feedback': 'ok', 'student_id': 1}, headers=auth(FACULTY)))
    a = next(a for a in ok(client.get('/api/assignments', headers=auth(ALEX)))['assignments'] if a['id'] == 1)
    assert a['scored_marks'] == 22


# ---------------- Academics / attendance ----------------

def test_update_marks_as_faculty(client):
    mid = ok(client.get('/api/academics/performance', headers=auth(ALEX)))['marks'][0]['id']
    d = ok(client.put(f'/api/academics/marks/{mid}', json={'internal_marks': 28, 'lab_marks': 18, 'external_marks': 45}, headers=auth(FACULTY)))
    assert d['mark']['total_marks'] == 91


def test_mark_attendance_as_faculty(client):
    before = ok(client.get('/api/attendance', headers=auth(ALEX)))['attendance'][0]
    ok(client.post('/api/attendance/mark', json={'course_code': before['course_code'], 'action': 'present', 'date': 'Today', 'student_id': 1}, headers=auth(FACULTY)))
    after = next(r for r in ok(client.get('/api/attendance', headers=auth(ALEX)))['attendance'] if r['course_code'] == before['course_code'])
    assert after['total_hours'] == before['total_hours'] + 1


def test_attendance_calculator(client):
    d = ok(client.post('/api/attendance/calculate', json={'total_hours': 48, 'attended_hours': 42, 'od_hours': 2, 'target_percentage': 75, 'course_name': 'CS601'}, headers=auth(ALEX)))
    assert d


# ---------------- Timetable ----------------

def test_timetable_crud_as_faculty(client):
    payload = {'day_of_week': 2, 'start_time': '15:00', 'end_time': '16:00', 'course_code': 'CS699', 'course_title': 'Test Slot', 'faculty_name': 'Dr. X', 'room': 'LH-1'}
    created = ok(client.post('/api/timetable', json=payload, headers=auth(FACULTY)))
    rows = ok(client.get('/api/timetable?view=daily&day=2', headers=auth(ALEX)))
    flat = str(rows)
    assert 'CS699' in flat
    tid = created.get('id') or created.get('entry', {}).get('id')
    assert tid, created
    ok(client.put(f'/api/timetable/{tid}', json={**payload, 'room': 'LH-9'}, headers=auth(FACULTY)))
    ok(client.delete(f'/api/timetable/{tid}', headers=auth(FACULTY)))
    assert 'CS699' not in str(ok(client.get('/api/timetable?view=daily&day=2', headers=auth(ALEX))))


# ---------------- Notes ----------------

def test_notes_upload_and_download(client):
    ok(client.post('/api/notes/upload', data={**files(file='graphs.pdf'), 'course_code': 'CS601', 'course_title': 'DS', 'title': 'Graph Notes', 'document_type': 'Lecture Notes', 'uploaded_by': 'x'}, headers=auth(FACULTY), content_type='multipart/form-data'))
    notes = ok(client.get('/api/notes', headers=auth(ALEX)))
    items = notes.get('notes') or notes.get('materials') or []
    nid = next(n['id'] for n in items if n['title'] == 'Graph Notes')
    r = client.get(f'/api/notes/{nid}/download', headers=auth(ALEX))
    assert r.status_code == 200 and r.data.startswith(b'%PDF')


# ---------------- Examinations ----------------

def test_hall_ticket_publish_and_revaluation(client):
    ok(client.post('/api/examinations/hall-ticket/publish', json={'is_published': 0}, headers=auth(ADMIN)))
    ok(client.post('/api/examinations/hall-ticket/publish', json={'is_published': 1}, headers=auth(ADMIN)))
    ok(client.post('/api/examinations/revaluation', json={'course_code': 'CS601', 'application_type': 'Photocopy'}, headers=auth(ALEX)))
    revals = ok(client.get('/api/examinations/revaluation', headers=auth(ALEX)))['revaluations']
    assert any(r['course_code'] == 'CS601' and r['usn'] == '1MS21CS084' for r in revals)


# ---------------- GPA ----------------

def test_gpa_calculate_save_delete(client):
    courses = [{'name': 'A', 'credits': 4, 'grade': 'O', 'grade_point': 10}, {'name': 'B', 'credits': 3, 'grade': 'A+', 'grade_point': 9}]
    assert ok(client.post('/api/gpa/calculate-sgpa', json={'courses': courses}, headers=auth(ALEX)))['sgpa'] > 9
    ok(client.post('/api/gpa/save-semester', json={'semester': 7, 'courses': courses}, headers=auth(ALEX)))
    hist = ok(client.get('/api/gpa/history', headers=auth(ALEX)))['history']
    rec = next(h for h in hist if h['semester'] == 7)
    ok(client.post('/api/gpa/calculate-cgpa', json={'semesters': [{'credits': 20, 'sgpa': 9}, {'credits': 22, 'sgpa': 8}]}, headers=auth(ALEX)))
    ok(client.delete(f"/api/gpa/history/{rec['id']}", headers=auth(ALEX)))
    assert all(h['semester'] != 7 for h in ok(client.get('/api/gpa/history', headers=auth(ALEX)))['history'])


# ---------------- Profile ----------------

def test_profile_update_and_photo(client):
    ok(client.put('/api/profile', json={'phone': '+91 90000 00000', 'blood_group': 'B+'}, headers=auth(ALEX)))
    assert ok(client.get('/api/profile', headers=auth(ALEX)))['profile']['phone'] == '+91 90000 00000'
    d = ok(client.post('/api/profile/photo', data={'photo': (io.BytesIO(b'\x89PNG'), 'me.png')}, headers=auth(ALEX), content_type='multipart/form-data'))
    assert client.get(d['photo_url']).status_code == 200
    ok(client.get('/api/profile/digital-id', headers=auth(ALEX)))


# ---------------- Placements ----------------

def test_placements_full_flow(client):
    ok(client.post('/api/placements/drives', json={'company_name': 'TestCo', 'job_title': 'SDE', 'job_type': 'Full-time', 'ctc_or_stipend': '20 LPA', 'location': 'BLR', 'eligibility_cgpa': 7, 'eligible_branches': 'CSE', 'skills_required': 'Python', 'description': 'x', 'drive_date': '2026-12-01', 'deadline_date': '2026-11-30'}, headers=auth(ADMIN)))
    drives = ok(client.get('/api/placements/drives', headers=auth(ALEX)))['drives']
    did = next(d['id'] for d in drives if d['company_name'] == 'TestCo')
    ok(client.post('/api/placements/resumes/upload', data={**files(resume='cv.pdf'), 'title': 'Main CV'}, headers=auth(ALEX), content_type='multipart/form-data'))
    resumes = ok(client.get('/api/placements/resumes', headers=auth(ALEX)))['resumes']
    r = client.get(f"/api/placements/resumes/{resumes[0]['id']}/download", headers=auth(ALEX))
    assert r.status_code == 200
    ok(client.post('/api/placements/apply', json={'drive_id': did, 'resume_name': resumes[0]['title']}, headers=auth(ALEX)))
    apps = ok(client.get('/api/placements/applications', headers=auth(ALEX)))['applications']
    app_id = next(a['id'] for a in apps if a['drive_id'] == did)
    ok(client.put(f'/api/placements/applications/{app_id}/status', json={'status': 'Shortlisted', 'remarks': 'Status updated to Shortlisted'}, headers=auth(ADMIN)))
    ok(client.post('/api/placements/resume-builder', json={'full_name': 'Alex Kumar', 'email': 'a@x', 'phone': '1', 'headline': 'SDE', 'summary': 's', 'education': [], 'skills': ['Go'], 'projects': [], 'certifications': []}, headers=auth(ALEX)))
    ok(client.get('/api/placements/resume-builder', headers=auth(ALEX)))
    ok(client.get('/api/placements/interview-prep', headers=auth(ALEX)))


# ---------------- Projects ----------------

def test_projects_create_join_feedback(client):
    ok(client.post('/api/projects', data={'title': 'My Robot', 'category': 'Mini Project', 'description': 'd', 'technologies': 'Python', 'github_url': '', 'demo_url': '', 'team_status': 'Open', 'open_roles': 'ML', 'guide_name': 'Dr. X', **files(document_file='r.pdf')}, headers=auth(ALEX), content_type='multipart/form-data'))
    projects = ok(client.get('/api/projects', headers=auth(ALEX)))['projects']
    pid = next(p['id'] for p in projects if p['title'] == 'My Robot')
    ok(client.get(f'/api/projects/{pid}', headers=auth(ALEX)))
    other = next(p['id'] for p in projects if p['title'] != 'My Robot')
    ok(client.post(f'/api/projects/{other}/teammate-request', json={'role_applied': 'ML', 'message': 'hi'}, headers=auth(ALEX)))
    ok(client.post(f'/api/projects/{pid}/feedback', json={'faculty_name': 'x', 'score': 40, 'max_score': 50, 'comments': 'good'}, headers=auth(FACULTY)))
    r = client.get(f'/api/projects/{pid}/document/download', headers=auth(ALEX))
    assert r.status_code == 200


# ---------------- Events ----------------

def test_events_register_create_delete_certificate(client):
    events = ok(client.get('/api/events', headers=auth(ALEX)))['events']
    regs = {r['event_id'] for r in ok(client.get('/api/events/my-registrations', headers=auth(ALEX)))['registrations']}
    eid = next(e['id'] for e in events if e['id'] not in regs and e.get('status') != 'Completed')
    ok(client.post(f'/api/events/{eid}/register', headers=auth(ALEX)))
    assert eid in {r['event_id'] for r in ok(client.get('/api/events/my-registrations', headers=auth(ALEX)))['registrations']}
    ok(client.post(f'/api/events/{eid}/certificate/upload', data={**files(certificate='cert.pdf'), 'usn': '1MS21CS084', 'certificate_title': 'Participation'}, headers=auth(FACULTY), content_type='multipart/form-data'))
    reg = next(r for r in ok(client.get('/api/events/my-registrations', headers=auth(ALEX)))['registrations'] if r['event_id'] == eid)
    assert client.get(f"/api/events/certificates/{reg['reg_id']}/download", headers=auth(ALEX)).status_code == 200
    ok(client.post('/api/events', json={'title': 'Test Fest', 'category': 'Workshop', 'club_name': 'ACM', 'description': 'd', 'event_date': '2026-12-10', 'event_time': '10:00', 'venue': 'Hall', 'total_seats': 50, 'registration_deadline': '2026-12-05'}, headers=auth(FACULTY)))
    new = next(e['id'] for e in ok(client.get('/api/events', headers=auth(ALEX)))['events'] if e['title'] == 'Test Fest')
    ok(client.delete(f'/api/events/{new}', headers=auth(FACULTY)))


# ---------------- Library ----------------

def test_library_full_flow(client):
    ok(client.post('/api/library/books', json={'title': 'Test Book', 'author': 'A', 'isbn': '978-0000000001', 'category': 'CS', 'edition': '1st', 'publisher': 'P', 'shelf_location': 'S1', 'total_copies': 2}, headers=auth(ADMIN)))
    books = ok(client.get('/api/library/books?q=Test Book', headers=auth(ALEX)))['books']
    bid = next(b['id'] for b in books if b['title'] == 'Test Book')
    ok(client.put(f'/api/library/books/{bid}', json={'title': 'Test Book 2', 'author': 'A', 'isbn': '978-0000000001', 'category': 'CS', 'edition': '2nd', 'publisher': 'P', 'shelf_location': 'S1', 'total_copies': 3}, headers=auth(ADMIN)))
    ok(client.post('/api/library/issue', json={'book_id': bid, 'usn': '1MS21CS084', 'student_name': 'Alex Kumar', 'days': 14}, headers=auth(ADMIN)))
    mine = ok(client.get('/api/library/my-books', headers=auth(ALEX)))
    loans = mine.get('borrowed_books') or mine.get('books') or mine.get('records') or []
    rec = next(r for r in loans if r.get('book_id') == bid or r.get('title') in ('Test Book 2',))
    ok(client.post(f"/api/library/return/{rec.get('id') or rec.get('borrow_id')}", json={'remarks': 'fine'}, headers=auth(ADMIN)))
    ok(client.get('/api/library/history', headers=auth(ALEX)))
    ok(client.delete(f'/api/library/books/{bid}', headers=auth(ADMIN)))


# ---------------- Campus services ----------------

def test_services_flows(client):
    ok(client.get('/api/services/bus-routes', headers=auth(ALEX)))
    canteen = ok(client.get('/api/services/canteen', headers=auth(ALEX)))
    items = canteen.get('menu') or canteen.get('items') or []
    if isinstance(items, dict):
        items = [i for v in items.values() for i in v]
    ok(client.put(f"/api/services/canteen/{items[0]['id']}/availability", json={'availability': 'Sold Out'}, headers=auth(ADMIN)))
    ok(client.post('/api/services/lost-found', json={'report_type': 'Lost', 'item_title': 'Blue Bottle', 'category': 'Personal Items', 'description': 'steel', 'location_reported': 'Library', 'date_reported': '2026-11-06'}, headers=auth(ALEX)))
    lf = ok(client.get('/api/services/lost-found', headers=auth(ALEX)))
    lf_items = lf.get('items') or lf.get('lost_found') or []
    mine = next(i for i in lf_items if i['item_title'] == 'Blue Bottle')
    other = next(i for i in lf_items if i['item_title'] != 'Blue Bottle')
    ok(client.post(f"/api/services/lost-found/{other['id']}/message", json={'sender_contact': '+91', 'message': 'is it mine?'}, headers=auth(ALEX)))
    ok(client.get(f"/api/services/lost-found/{other['id']}/messages", headers=auth(ALEX)))
    ok(client.put(f"/api/services/lost-found/{mine['id']}/status", json={'status': 'Resolved'}, headers=auth(ALEX)))
    ok(client.get('/api/services/facilities', headers=auth(ALEX)))


# ---------------- Notifications & communications ----------------

def test_notifications_and_appointments(client):
    ok(client.post('/api/notifications', json={'title': 'Test Notice', 'content': 'c', 'category': 'Examination', 'priority': 'High', 'target_role': 'student'}, headers=auth(ADMIN)))
    notes = ok(client.get('/api/notifications', headers=auth(ALEX)))['notifications']
    nid = next(n['id'] for n in notes if n['title'] == 'Test Notice')
    ok(client.put(f'/api/notifications/{nid}/read', headers=auth(ALEX)))
    ok(client.post('/api/notifications/mark-all-read', headers=auth(ALEX)))
    ok(client.delete(f'/api/notifications/{nid}', headers=auth(ADMIN)))
    ok(client.get('/api/communications/faculty-directory', headers=auth(ALEX)))
    ok(client.post('/api/communications/appointments', json={'faculty_name': 'Dr. K. V. Sharma', 'department': CSE, 'purpose': 'Project', 'requested_date': '2026-11-20', 'requested_slot': '10:00 AM'}, headers=auth(ALEX)))
    appts = ok(client.get('/api/communications/appointments', headers=auth(ALEX)))['appointments']
    mine = next(a for a in appts if a['purpose'] == 'Project')
    assert mine['usn'] == '1MS21CS084'
    ok(client.put(f"/api/communications/appointments/{mine['id']}/status", json={'status': 'Confirmed', 'remarks': 'ok'}, headers=auth(FACULTY)))


# ---------------- Doubts ----------------

def test_doubts_flow(client):
    ok(client.post('/api/doubts', data={'subject_code': 'CS601', 'subject_name': 'DS', 'faculty_name': 'Dr. X', 'title': 'Paxos?', 'question': 'why'}, headers=auth(ALEX), content_type='multipart/form-data'))
    doubts = ok(client.get('/api/doubts', headers=auth(ALEX)))['doubts']
    did = next(d['id'] for d in doubts if d['title'] == 'Paxos?')
    ok(client.post(f'/api/doubts/{did}/respond', data={'response_text': 'because quorum'}, headers=auth(FACULTY), content_type='multipart/form-data'))
    d = next(d for d in ok(client.get('/api/doubts', headers=auth(ALEX)))['doubts'] if d['id'] == did)
    assert d['responses'] and d['status'] == 'Answered'
    ok(client.put(f'/api/doubts/{did}/status', json={'status': 'Resolved'}, headers=auth(FACULTY)))


# ---------------- Faculty mentor ----------------

def test_mentor_flows(client):
    mm = ok(client.get('/api/mentor/my-mentor', headers=auth(ALEX)))
    mentor_id = mm.get('mentor_id') or mm.get('id')
    assert mentor_id, mm
    ok(client.post('/api/mentor/messages', json={'mentor_id': mentor_id, 'student_id': 1, 'subject': 'Hi', 'message': 'question'}, headers=auth(ALEX)))
    ok(client.get('/api/mentor/messages', headers=auth(ALEX)))
    ok(client.post('/api/mentor/discussions', json={'mentor_id': mentor_id, 'group_name': mm.get('group_name', 'Group A'), 'category': 'General', 'title': 'Study plan', 'content': 'c'}, headers=auth(ALEX)))
    topics = ok(client.get(f'/api/mentor/discussions?mentor_id={mentor_id}', headers=auth(ALEX)))
    tlist = topics if isinstance(topics, list) else topics.get('discussions', [])
    tid = next(t['id'] for t in tlist if t['title'] == 'Study plan')
    ok(client.post(f'/api/mentor/discussions/{tid}/reply', json={'reply_text': 'agree'}, headers=auth(ALEX)))
    ok(client.put(f'/api/mentor/discussions/{tid}/pin', headers=auth(FACULTY)))
    ok(client.delete(f'/api/mentor/discussions/{tid}', headers=auth(FACULTY)))
    ok(client.post('/api/mentor/meetings/request', json={'mentor_id': mentor_id, 'student_id': 1, 'requested_date': '2026-11-21', 'requested_slot': '02:00 PM', 'meeting_type': 'Online', 'agenda': 'career'}, headers=auth(ALEX)))
    meetings = ok(client.get('/api/mentor/meetings', headers=auth(ALEX)))
    mlist = meetings if isinstance(meetings, list) else meetings.get('meetings', [])
    mid = mlist[0]['id']
    ok(client.put(f'/api/mentor/meetings/{mid}/status', json={'status': 'Approved', 'meeting_link': 'https://meet.example/x', 'mentor_notes': 'ok'}, headers=auth(FACULTY)))
    ok(client.get('/api/mentor/mentor-book?student_id=1', headers=auth(FACULTY)))
    ok(client.post('/api/mentor/mentor-book/session', json={'student_id': 1, 'mentor_id': mentor_id, 'session_date': '2026-11-06', 'session_type': 'One-on-One', 'semester': 6, 'topics_discussed': 'x', 'mentor_suggestions': 's', 'action_items': 'y'}, headers=auth(FACULTY)))
    ok(client.put('/api/mentor/mentor-book/remarks', json={'student_id': 1, 'mentor_id': mentor_id, 'semester': 6, 'academic_observations': 'good', 'strengths': 'x', 'mentor_recommendations': 'y'}, headers=auth(FACULTY)))
    ok(client.put('/api/mentor/mentor-book/development', json={'student_id': 1, 'technical_skills': 'Go'}, headers=auth(FACULTY)))
    ok(client.post('/api/mentor/mentor-book/feedback', json={'mentor_id': mentor_id, 'session_title': 'Review', 'rating': 5, 'usefulness': 'Very useful', 'feedback_text': 'great'}, headers=auth(ALEX)))
    ok(client.get('/api/mentor/mentees', headers=auth(FACULTY)))
    ok(client.get('/api/mentor/admin/overview', headers=auth(ADMIN)))
    ok(client.post('/api/mentor/admin/assign', json={'student_id': 1, 'mentor_id': mentor_id, 'group_name': 'Group A'}, headers=auth(ADMIN)))


# ---------------- Fees ----------------

def test_fees_payment_and_scholarship(client):
    details = ok(client.get('/api/fees/student-details?semester=6&academic_year=2025-2026', headers=auth(ALEX)))
    records = details.get('fee_records') or details.get('records') or []
    pending = [r for r in records if (r.get('outstanding_amount') or 0) > 0]
    assert pending, details.keys()
    rec = pending[0]
    order = ok(client.post('/api/fees/payment/initiate', json={'student_id': 1, 'semester': 6, 'academic_year': '2025-2026', 'selected_record_ids': [rec['id']], 'payment_amount': 100, 'payment_method': 'UPI'}, headers=auth(ALEX)))
    txn = order.get('transaction_id') or order.get('order', {}).get('transaction_id')
    ok(client.post('/api/fees/payment/confirm', json={'transaction_id': txn, 'selected_record_ids': [rec['id']], 'payment_amount': 100, 'simulate_failure': False}, headers=auth(ALEX)))
    assert ok(client.get(f'/api/fees/receipt/{txn}', headers=auth(ALEX)))
    ok(client.get('/api/fees/transactions', headers=auth(ALEX)))
    ok(client.get('/api/fees/report?academic_year=2025-2026', headers=auth(ALEX)))
    sch = ok(client.get('/api/fees/scholarships', headers=auth(ALEX)))
    slist = sch if isinstance(sch, list) else sch.get('scholarships', [])
    ok(client.post('/api/fees/scholarship-applications', json={'student_id': 1, 'scholarship_id': slist[-1]['id'], 'application_text': 'need'}, headers=auth(ALEX)), 200, 201, 409)
    apps = ok(client.get('/api/fees/scholarship-applications', headers=auth(ADMIN)))
    alist = apps if isinstance(apps, list) else apps.get('applications', [])
    ok(client.put(f"/api/fees/scholarship-applications/{alist[0]['id']}/review", json={'status': 'Approved', 'approved_amount': 1000, 'admin_remarks': 'ok', 'admin_id': 1}, headers=auth(ADMIN)))
    ok(client.post('/api/fees/structures', json={'semester': 6, 'academic_year': '2025-2026', 'fee_category': 'Lab Fees', 'total_amount': 1500, 'due_date': '2026-12-01', 'department': CSE}, headers=auth(ADMIN)))
    ok(client.get('/api/fees/admin/overview?academic_year=2025-2026', headers=auth(ADMIN)))


# ---------------- Student-owned actions that were wrongly staff-only ----------------

def test_student_returns_own_book_only(client):
    from helpers import make_user
    ok(client.post('/api/library/books', json={'title': 'Own Book', 'author': 'A', 'isbn': '978-0000000099', 'category': 'CS', 'edition': '1', 'publisher': 'P', 'shelf_location': 'S', 'total_copies': 1}, headers=auth(ADMIN)))
    bid = next(b['id'] for b in ok(client.get('/api/library/books?q=Own Book', headers=auth(ALEX)))['books'] if b['title'] == 'Own Book')
    ok(client.post('/api/library/issue', json={'book_id': bid, 'usn': '1MS21CS084', 'student_name': 'Alex Kumar', 'days': 7}, headers=auth(ADMIN)))
    rec = next(r for r in ok(client.get('/api/library/my-books', headers=auth(ALEX)))['borrowed_books'] if r.get('book_id') == bid or r.get('title') == 'Own Book')
    rid = rec.get('id') or rec.get('borrow_id')
    make_user('thief@gmail.com', name='Thief')
    assert client.post(f'/api/library/return/{rid}', json={}, headers=auth('thief@gmail.com')).status_code == 403
    ok(client.post(f'/api/library/return/{rid}', json={'remarks': ''}, headers=auth(ALEX)))


def test_student_replies_to_own_doubt_only_and_name_is_not_spoofable(client):
    from helpers import make_user
    ok(client.post('/api/doubts', data={'subject_code': 'CS602', 'subject_name': 'ML', 'faculty_name': 'Dr. X', 'title': 'Own Q', 'question': 'q'}, headers=auth(ALEX), content_type='multipart/form-data'))
    did = next(d['id'] for d in ok(client.get('/api/doubts', headers=auth(ALEX)))['doubts'] if d['title'] == 'Own Q')
    make_user('nosy@gmail.com', name='Nosy')
    assert client.post(f'/api/doubts/{did}/respond', data={'response_text': 'x'}, headers=auth('nosy@gmail.com'), content_type='multipart/form-data').status_code == 403
    ok(client.post(f'/api/doubts/{did}/respond', data={'response_text': 'thanks', 'responder_name': 'Dr. Fake'}, headers=auth(ALEX), content_type='multipart/form-data'))
    d = next(d for d in ok(client.get('/api/doubts', headers=auth(ALEX)))['doubts'] if d['id'] == did)
    assert d['responses'][-1]['responder_name'] == 'Alex Kumar' and d['responses'][-1]['responder_role'] == 'student'
    assert d['status'] != 'Answered'


def test_student_edits_own_portfolio(client):
    ok(client.put('/api/mentor/mentor-book/development', json={'student_id': 2, 'technical_skills': 'Rust, Go'}, headers=auth(ALEX)))
    book = ok(client.get('/api/mentor/mentor-book', headers=auth(ALEX)))
    assert 'Rust, Go' in str(book)
