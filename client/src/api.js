import { io } from 'socket.io-client';

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Let the app react to an expired session or required MFA setup wherever it happens.
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('session-expired'));
    if (data.code === 'MFA_SETUP_REQUIRED') window.dispatchEvent(new Event('mfa-required'));
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const ROLE_LABELS = {
  admin: 'Administrator',
  provider: 'Provider',
  np: 'Nurse Practitioner',
  case_manager: 'Case Manager',
  patient: 'Patient',
};

// One shared socket per signed-in session; the session cookie authenticates it.
let socket = null;
export function getSocket() {
  if (!socket) socket = io({ withCredentials: true });
  return socket;
}
export function closeSocket() {
  socket?.disconnect();
  socket = null;
}

export const navigate = (path) => { window.location.hash = path; };
