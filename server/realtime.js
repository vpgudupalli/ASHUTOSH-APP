// Live updates over Socket.IO. Each signed-in user joins a private room
// (`user:<id>`); admins also join `admins`. Events go only to people allowed
// to see that patient. Staff-only events (notes, follow-ups) never reach the patient.
import { Server } from 'socket.io';
import { parseCookie } from 'cookie';
import { query } from './db.js';
import { COOKIE_NAME, sessionFromToken } from './auth.js';

let io;

export function initRealtime(httpServer) {
  io = new Server(httpServer);

  io.use(async (socket, next) => {
    const cookies = parseCookie(socket.handshake.headers.cookie || '');
    const session = await sessionFromToken(cookies[COOKIE_NAME]);
    if (!session) return next(new Error('unauthorized'));
    socket.data.user = session.user;
    next();
  });

  io.on('connection', (socket) => {
    const { user } = socket.data;
    socket.join(`user:${user.id}`);
    if (user.role === 'admin') socket.join('admins');
  });
}

async function careTeamRooms(patientId) {
  const rows = await query('SELECT staff_id FROM assignments WHERE patient_id = $1', [patientId]);
  return ['admins', ...rows.map((r) => `user:${r.staff_id}`)];
}

async function patientRoom(patientId) {
  const rows = await query('SELECT user_id FROM patients WHERE id = $1 AND user_id IS NOT NULL', [patientId]);
  return rows.map((r) => `user:${r.user_id}`);
}

// To the care team AND the patient (assessments, messages).
export async function notifyPatient(patientId, event, payload) {
  if (!io) return;
  io.to([...(await careTeamRooms(patientId)), ...(await patientRoom(patientId))]).emit(event, payload);
}

// To the care team only (internal notes, follow-ups, reviews).
export async function notifyCareTeam(patientId, event, payload) {
  if (!io) return;
  io.to(await careTeamRooms(patientId)).emit(event, payload);
}

export function notifyAdmins(event, payload) {
  io?.to('admins').emit(event, payload);
}

export function notifyUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}
