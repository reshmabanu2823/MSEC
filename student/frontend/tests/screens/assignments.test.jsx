import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

vi.mock('../../src/api', async () => {
  class NetworkError extends Error {}
  return { apiRequest: vi.fn(), apiUrl: (p) => p, NetworkError };
});

import { apiRequest, NetworkError } from '../../src/api';
import AssignmentsView, { dueText } from '../../src/screens/AssignmentsScreen.jsx';

const NOW = new Date('2026-11-06T10:00:00');
const rows = [
  { id: 1, course_code: 'CS601', title: 'Raft Lab', description: 'Implement Raft', deadline_date: '2026-11-08 23:59', max_marks: 25, submission_status: 'Pending', scored_marks: null, feedback: null },
  { id: 2, course_code: 'CS602', title: 'MLP Report', description: '', deadline_date: '2026-11-03 12:00', max_marks: 30, submission_status: 'Submitted', scored_marks: 27, feedback: 'Great work', submitted_at: '2026-11-02 10:00' },
  { id: 3, course_code: 'CS603', title: 'Parser', description: 'LL(1)', deadline_date: '2026-11-01 12:00', max_marks: 20, submission_status: 'Late', scored_marks: null, feedback: null },
];

beforeEach(() => {
  apiRequest.mockReset();
  apiRequest.mockImplementation(async (url, opts) => {
    if (opts?.method) return { message: 'ok' };
    if (url.includes('/submissions')) return { submissions: [{ id: 9, student_id: 1, student_name: 'Alex Kumar', usn: '1MS21CS084', file_name: 'raft.zip', submitted_at: '2026-11-05 20:00', status: 'Submitted', scored_marks: null, feedback: null }] };
    if (url.includes('subject=CS602')) return { assignments: [rows[1]] };
    return { assignments: rows };
  });
});

describe('dueText', () => {
  it('describes deadlines relative to now', () => {
    expect(dueText('2026-11-08 23:59', NOW)).toBe('Due in 2 days');
    expect(dueText('2026-11-06 23:59', NOW)).toBe('Due today');
    expect(dueText('2026-11-07 09:00', NOW)).toBe('Due tomorrow');
    expect(dueText('2026-11-01 12:00', NOW)).toBe('Overdue by 5 days');
  });
});

describe('AssignmentsScreen (student)', () => {
  it('summary counts and grouped lists like the design', async () => {
    render(<AssignmentsView userRole="student" now={NOW} />);
    const due = await screen.findByRole('list', { name: 'Due soon' });
    expect(within(due).getByText('Raft Lab')).toBeInTheDocument();
    expect(within(due).getByText('CS601 · Due in 2 days')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Overdue' })).getByText('CS603 · Overdue by 5 days')).toBeInTheDocument();
    const done = screen.getByRole('list', { name: 'Done' });
    expect(within(done).getByText('27/30')).toBeInTheDocument();
    const summary = screen.getByRole('group', { name: 'Assignment summary' });
    expect(within(summary).getAllByText('1', { selector: 'strong' })).toHaveLength(3);
  });

  it('subject chips filter through the API', async () => {
    render(<AssignmentsView userRole="student" now={NOW} />);
    await screen.findByText('Raft Lab');
    const chips = screen.getByRole('group', { name: 'Subject' });
    fireEvent.click(within(chips).getByRole('button', { name: 'CS602' }));
    await waitFor(() => expect(apiRequest).toHaveBeenLastCalledWith('/assignments?subject=CS602'));
    expect(await screen.findByText('MLP Report')).toBeInTheDocument();
    expect(within(chips).getByRole('button', { name: 'CS602' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('ignores a late response from an older filter', async () => {
    let releaseFirst;
    apiRequest.mockImplementation((url) => {
      if (url === '/assignments') return new Promise((r) => { releaseFirst = () => r({ assignments: rows }); });
      return Promise.resolve({ assignments: [rows[1]] });
    });
    render(<AssignmentsView userRole="student" now={NOW} chips={['CS601', 'CS602']} />);
    fireEvent.click(within(screen.getByRole('group', { name: 'Subject' })).getByRole('button', { name: 'CS602' }));
    expect(await screen.findByText('MLP Report')).toBeInTheDocument();
    releaseFirst();
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByText('Raft Lab')).toBeNull();
  });

  it('row opens details with description, score and feedback', async () => {
    render(<AssignmentsView userRole="student" now={NOW} />);
    fireEvent.click(await screen.findByRole('button', { name: /MLP Report/ }));
    const sheet = screen.getByRole('dialog', { name: 'MLP Report' });
    expect(within(sheet).getByText('27 / 30')).toBeInTheDocument();
    expect(within(sheet).getByText('“Great work”')).toBeInTheDocument();
  });

  it('Submit uploads the file; Escape closes; focus starts in the dialog', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: 'Uploaded' }) });
    vi.stubGlobal('fetch', fetchMock);
    render(<AssignmentsView userRole="student" now={NOW} />);
    await screen.findByText('Raft Lab');
    fireEvent.click(screen.getAllByRole('button', { name: 'Submit' })[0]);
    expect(screen.getByLabelText(/Choose file/)).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Submit' })[0]);
    fireEvent.change(screen.getByLabelText(/Choose file/), { target: { files: [new File(['x'], 'a.pdf')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload submission' }));
    expect(await screen.findByText('Uploaded')).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/assignments/1/upload');
    expect(init.method).toBe('POST');
    expect(init.body.get('file').name).toBe('a.pdf');
  });

  it('upload network failure shows the offline state in the dialog', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    render(<AssignmentsView userRole="student" now={NOW} />);
    await screen.findByText('Raft Lab');
    fireEvent.click(screen.getAllByRole('button', { name: 'Submit' })[0]);
    fireEvent.change(screen.getByLabelText(/Choose file/), { target: { files: [new File(['x'], 'a.pdf')] } });
    fireEvent.click(screen.getByRole('button', { name: 'Upload submission' }));
    expect(await within(screen.getByRole('dialog')).findByText("Can't reach the server")).toBeInTheDocument();
  });

  it('load failure shows ErrorCard and Try again refetches', async () => {
    apiRequest.mockRejectedValueOnce(new NetworkError('x'));
    render(<AssignmentsView userRole="student" now={NOW} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Raft Lab')).toBeInTheDocument();
  });

  it('opens the upload sheet when arriving from Home Submit', async () => {
    sessionStorage.setItem('msec-open-submit', '1');
    render(<AssignmentsView userRole="student" now={NOW} />);
    expect(await screen.findByRole('dialog', { name: 'Submit: Raft Lab' })).toBeInTheDocument();
    expect(sessionStorage.getItem('msec-open-submit')).toBeNull();
  });

  it('students do not see staff actions', async () => {
    render(<AssignmentsView userRole="student" now={NOW} />);
    await screen.findByText('Raft Lab');
    expect(screen.queryByRole('button', { name: 'New assignment' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Grade' })).toBeNull();
  });
});

describe('AssignmentsScreen (staff)', () => {
  it('creates an assignment with the same payload', async () => {
    render(<AssignmentsView userRole="faculty" now={NOW} />);
    await screen.findByText('Raft Lab');
    fireEvent.click(screen.getByRole('button', { name: 'New assignment' }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'New Lab' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Do it' } });
    fireEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/assignments', expect.objectContaining({ method: 'POST' })));
    const body = JSON.parse(apiRequest.mock.calls.find(([u, o]) => u === '/assignments' && o?.method)[1].body);
    expect(body).toMatchObject({ course_code: 'CS601', title: 'New Lab', description: 'Do it', max_marks: 25 });
  });

  it('grades a real submission with the student id', async () => {
    render(<AssignmentsView userRole="admin" now={NOW} />);
    await screen.findByText('Raft Lab');
    fireEvent.click(screen.getAllByRole('button', { name: 'Grade' })[0]);
    const sheet = await screen.findByRole('dialog', { name: 'Raft Lab · Submissions' });
    expect(await within(sheet).findByText('Alex Kumar')).toBeInTheDocument();
    expect(within(sheet).getByText('raft.zip')).toBeInTheDocument();
    fireEvent.change(within(sheet).getByLabelText('Marks for Alex Kumar'), { target: { value: '22' } });
    fireEvent.change(within(sheet).getByLabelText('Feedback for Alex Kumar'), { target: { value: 'Solid' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Save grade for Alex Kumar' }));
    await waitFor(() => expect(apiRequest).toHaveBeenCalledWith('/assignments/1/evaluate', {
      method: 'POST',
      body: JSON.stringify({ scored_marks: 22, feedback: 'Solid', student_id: 1 }),
    }));
  });
});
