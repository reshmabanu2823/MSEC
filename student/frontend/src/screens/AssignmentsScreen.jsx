import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { apiRequest, apiUrl } from '../api';
import ErrorCard from '../components/ErrorCard';
import Sheet from './Sheet';
import './assignments.css';

export const OPEN_SUBMIT_KEY = 'msec-open-submit';
const DAY = 24 * 3600 * 1000;
const parseDeadline = (s) => new Date(String(s || '').replace(' ', 'T'));

// "Due in 2 days", "Due today", "Due tomorrow", "Overdue by 5 days".
export function dueText(deadline, now = new Date()) {
  const due = parseDeadline(deadline);
  if (Number.isNaN(due.getTime())) return '';
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOf(due) - startOf(now)) / DAY);
  if (due < now && days <= 0) {
    const late = Math.max(1, -days);
    return days === 0 ? 'Overdue today' : `Overdue by ${late} day${late === 1 ? '' : 's'}`;
  }
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
}

const isDone = (a) => a.submission_status === 'Submitted' || a.scored_marks != null;
const isLate = (a, now) => !isDone(a) && (a.submission_status === 'Late' || parseDeadline(a.deadline_date) < now);

function tone(a, now) {
  if (isDone(a)) return 'good';
  if (isLate(a, now)) return 'bad';
  return parseDeadline(a.deadline_date) - now < 2 * DAY ? 'warn' : 'primary';
}

function Row({ a, now, staff, onOpen, onSubmit, onGrade }) {
  const done = isDone(a);
  const line = done
    ? `${a.course_code} · ${a.scored_marks != null ? 'Graded' : 'Submitted'}`
    : `${a.course_code} · ${dueText(a.deadline_date, now)}`;
  return (
    <li className="asg-row">
      <button type="button" className="asg-row__main" onClick={() => onOpen(a)}>
        <span className={`asg-row__bar asg-row__bar--${tone(a, now)}`} aria-hidden="true" />
        <span className="asg-row__text">
          <strong>{a.title}</strong>
          <span>{line}</span>
        </span>
      </button>
      {staff ? (
        <button type="button" className="asg-pill" onClick={() => onGrade(a)}>Grade</button>
      ) : done ? (
        a.scored_marks != null
          ? <span className="asg-score">{`${a.scored_marks}/${a.max_marks}`}</span>
          : <span className="pill pill--good">Submitted</span>
      ) : (
        <button type="button" className="asg-pill" onClick={() => onSubmit(a)}>Submit</button>
      )}
    </li>
  );
}

function Section({ title, items, ...rest }) {
  if (!items.length) return null;
  return (
    <section className="asg-section">
      <h2 className="section-title">{title}</h2>
      <ul className="asg-list" aria-label={title}>
        {items.map((a) => <Row key={a.id} a={a} {...rest} />)}
      </ul>
    </section>
  );
}

function GradeSheet({ assignment, onClose, onSaved }) {
  const [subs, setSubs] = useState(null);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState({});
  const [saved, setSaved] = useState({});

  useEffect(() => {
    apiRequest(`/assignments/${assignment.id}/submissions`)
      .then((r) => {
        setSubs(r.submissions || []);
        setDraft(Object.fromEntries((r.submissions || []).map((s) => [s.student_id, { marks: s.scored_marks ?? '', feedback: s.feedback || '' }])));
      })
      .catch(setError);
  }, [assignment.id]);

  async function save(s) {
    const d = draft[s.student_id] || {};
    setError(null);
    try {
      await apiRequest(`/assignments/${assignment.id}/evaluate`, {
        method: 'POST',
        body: JSON.stringify({ scored_marks: parseInt(d.marks, 10) || 0, feedback: d.feedback || '', student_id: s.student_id }),
      });
      setSaved((v) => ({ ...v, [s.student_id]: true }));
      onSaved();
    } catch (err) {
      setError(err);
    }
  }

  const set = (id, key) => (e) => setDraft((v) => ({ ...v, [id]: { ...v[id], [key]: e.target.value } }));

  return (
    <Sheet title={`${assignment.title} · Submissions`} onClose={onClose}>
      <p className="assignments__note">{assignment.course_code} · out of {assignment.max_marks} marks</p>
      {error && <ErrorCard error={error} />}
      {!subs && !error && <div className="empty-state">Loading submissions…</div>}
      {subs && !subs.length && <div className="empty-state">No submissions yet from your classes.</div>}
      {subs && subs.length > 0 && (
        <ul className="asg-subs">
          {subs.map((s) => (
            <li key={s.id} className="asg-sub">
              <div className="asg-sub__who">
                <strong>{s.student_name}</strong>
                <span>{s.usn} · {s.submitted_at}</span>
                <span className="asg-sub__file">{s.file_name}</span>
              </div>
              <div className="asg-sub__grade">
                <label className="field"><span>Marks</span>
                  <input type="number" min="0" max={assignment.max_marks} aria-label={`Marks for ${s.student_name}`} value={draft[s.student_id]?.marks ?? ''} onChange={set(s.student_id, 'marks')} />
                </label>
                <label className="field asg-sub__feedback"><span>Feedback</span>
                  <input aria-label={`Feedback for ${s.student_name}`} value={draft[s.student_id]?.feedback ?? ''} onChange={set(s.student_id, 'feedback')} />
                </label>
                <button type="button" className="btn btn-primary" aria-label={`Save grade for ${s.student_name}`} onClick={() => save(s)}>
                  {saved[s.student_id] ? 'Saved' : 'Save'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="sheet-actions"><button type="button" className="btn" onClick={onClose}>Close</button></div>
    </Sheet>
  );
}

const DEFAULT_COURSES = ['CS601', 'CS602', 'CS603', 'CS604', 'CS605'];

export default function AssignmentsView({ userRole, now: nowProp, chips: chipsProp }) {
  const now = useMemo(() => nowProp || new Date(), [nowProp]);
  const staff = userRole === 'faculty' || userRole === 'admin';
  const [assignments, setAssignments] = useState([]);
  const [codes, setCodes] = useState(chipsProp || []);
  const [subject, setSubject] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [detail, setDetail] = useState(null);
  const [uploading, setUploading] = useState(null);
  const [file, setFile] = useState(null);
  const [uploadMsg, setUploadMsg] = useState('');
  const [grading, setGrading] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ course: 'CS601', title: '', description: '', deadline: '2026-11-20 23:59', marks: 25 });
  const [dialogError, setDialogError] = useState(null);
  const requestId = useRef(0);

  const load = useCallback(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    const url = subject === 'ALL' ? '/assignments' : `/assignments?subject=${subject}`;
    return apiRequest(url)
      .then((res) => {
        if (id !== requestId.current) return;
        const list = res.assignments || [];
        setAssignments(list);
        if (subject === 'ALL') setCodes((prev) => [...new Set([...prev, ...list.map((a) => a.course_code)])].sort());
        const wanted = sessionStorage.getItem(OPEN_SUBMIT_KEY);
        if (wanted) {
          sessionStorage.removeItem(OPEN_SUBMIT_KEY);
          const target = list.find((a) => String(a.id) === wanted);
          if (target) setUploading(target);
        }
      })
      .catch((err) => { if (id === requestId.current) setError(err); })
      .finally(() => { if (id === requestId.current) setLoading(false); });
  }, [subject]);

  useEffect(() => {
    load();
    return () => { requestId.current += 1; };
  }, [load]);

  const groups = useMemo(() => {
    const byDeadline = (a, b) => parseDeadline(a.deadline_date) - parseDeadline(b.deadline_date);
    return {
      due: assignments.filter((a) => !isDone(a) && !isLate(a, now)).sort(byDeadline),
      late: assignments.filter((a) => isLate(a, now)).sort(byDeadline),
      done: assignments.filter(isDone).sort((a, b) => byDeadline(b, a)),
    };
  }, [assignments, now]);

  const close = () => { setDetail(null); setUploading(null); setCreating(false); setGrading(null); setDialogError(null); setUploadMsg(''); setFile(null); };
  const openSubmit = (a) => { close(); setUploading(a); };

  async function upload(e) {
    e?.preventDefault();
    setDialogError(null);
    setUploadMsg('');
    const body = new FormData();
    if (file) body.append('file', file);
    try {
      const res = await fetch(apiUrl(`/api/assignments/${uploading.id}/upload`), { method: 'POST', body });
      const data = await res.json();
      setUploadMsg(data.message || 'Submitted.');
      setTimeout(() => { close(); load(); }, 900);
    } catch (err) {
      setDialogError(err);
    }
  }

  async function create(e) {
    e?.preventDefault();
    setDialogError(null);
    try {
      await apiRequest('/assignments', {
        method: 'POST',
        body: JSON.stringify({
          course_code: form.course, course_title: 'Course Term Work', title: form.title, description: form.description,
          deadline_date: form.deadline, max_marks: parseInt(form.marks, 10) || 0, created_by: 'Faculty Member',
        }),
      });
    } catch (err) {
      setDialogError(err);
      return;
    }
    close();
    setForm((f) => ({ ...f, title: '', description: '' }));
    load();
  }

  const setF = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const chips = ['ALL', ...(codes.length ? codes : DEFAULT_COURSES)];
  const rowProps = { now, staff, onOpen: setDetail, onSubmit: openSubmit, onGrade: (a) => { close(); setGrading(a); } };

  return (
    <div className="page assignments" data-qa="assignments-screen">
      <div className="asg-summary" role="group" aria-label="Assignment summary">
        <div className="asg-stat asg-stat--primary"><strong>{groups.due.length}</strong><span>Due</span></div>
        <div className="asg-stat"><strong>{groups.late.length}</strong><span>Overdue</span></div>
        <div className="asg-stat"><strong>{groups.done.length}</strong><span>{staff ? 'Closed' : 'Done'}</span></div>
      </div>

      <div className="asg-toolbar">
        <div className="asg-chips" role="group" aria-label="Subject">
          {chips.map((c) => (
            <button key={c} type="button" className="asg-chip" aria-pressed={subject === c} onClick={() => setSubject(c)}>
              {c === 'ALL' ? 'All' : c}
            </button>
          ))}
        </div>
        {staff && (
          <button type="button" className="btn btn-primary asg-new" onClick={() => { close(); setCreating(true); }}>
            New assignment
          </button>
        )}
      </div>

      {error ? (
        <ErrorCard error={error} onRetry={load} />
      ) : loading && !assignments.length ? (
        <div className="empty-state">Loading assignments…</div>
      ) : !assignments.length ? (
        <div className="empty-state">No assignments{subject !== 'ALL' ? ` for ${subject}` : ''} yet.</div>
      ) : (
        <div className="asg-sections">
          <Section title="Due soon" items={groups.due} {...rowProps} />
          <Section title="Overdue" items={groups.late} {...rowProps} />
          <Section title="Done" items={groups.done} {...rowProps} />
        </div>
      )}

      {detail && (
        <Sheet title={detail.title} onClose={close}>
          <p className="assignments__note">{detail.course_code} · {isDone(detail) ? `Deadline ${detail.deadline_date}` : dueText(detail.deadline_date, now)}</p>
          {detail.description && <p className="asg-detail__desc">{detail.description}</p>}
          <dl className="asg-detail__facts">
            <div><dt>Deadline</dt><dd>{detail.deadline_date}</dd></div>
            <div><dt>Max marks</dt><dd>{detail.max_marks}</dd></div>
            <div><dt>Status</dt><dd>{isLate(detail, now) ? 'Overdue' : detail.submission_status}</dd></div>
            {detail.scored_marks != null && <div><dt>Score</dt><dd className="asg-detail__score">{`${detail.scored_marks} / ${detail.max_marks}`}</dd></div>}
          </dl>
          {detail.feedback && <blockquote className="asg-detail__feedback">{`“${detail.feedback}”`}</blockquote>}
          <div className="sheet-actions">
            <button type="button" className="btn" onClick={close}>Close</button>
            {!staff && !isDone(detail) && <button type="button" className="btn btn-primary" onClick={() => openSubmit(detail)}>Submit</button>}
            {staff && <button type="button" className="btn btn-primary" onClick={() => rowProps.onGrade(detail)}>Grade</button>}
          </div>
        </Sheet>
      )}

      {uploading && (
        <Sheet title={`Submit: ${uploading.title}`} onClose={close} onSubmit={upload}>
          <p className="assignments__note">{uploading.course_code} · {dueText(uploading.deadline_date, now)}</p>
          {dialogError && <ErrorCard error={dialogError} onRetry={upload} />}
          <label className="field asg-file">
            <span>Choose file (PDF, ZIP, DOCX)</span>
            <input type="file" aria-label="Choose file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </label>
          {uploadMsg && <p className="ink-good" role="status">{uploadMsg}</p>}
          <div className="sheet-actions sticky-actions">
            <button type="button" className="btn" onClick={close}>Cancel</button>
            <button type="submit" className="btn btn-primary">Upload submission</button>
          </div>
        </Sheet>
      )}

      {creating && (
        <Sheet title="New assignment" onClose={close} onSubmit={create}>
          {dialogError && <ErrorCard error={dialogError} onRetry={create} />}
          <label className="field"><span>Course</span>
            <select value={form.course} onChange={setF('course')} aria-label="Course">
              {(codes.length ? codes : DEFAULT_COURSES).map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="field"><span>Title</span><input required value={form.title} onChange={setF('title')} aria-label="Title" /></label>
          <label className="field"><span>Description</span><textarea value={form.description} onChange={setF('description')} aria-label="Description" /></label>
          <div className="assignments__pair">
            <label className="field"><span>Deadline</span><input value={form.deadline} onChange={setF('deadline')} aria-label="Deadline" /></label>
            <label className="field"><span>Max marks</span><input type="number" value={form.marks} onChange={setF('marks')} aria-label="Max marks" /></label>
          </div>
          <div className="sheet-actions">
            <button type="button" className="btn" onClick={close}>Cancel</button>
            <button type="submit" className="btn btn-primary">Publish</button>
          </div>
        </Sheet>
      )}

      {grading && <GradeSheet assignment={grading} onClose={close} onSaved={load} />}
    </div>
  );
}
