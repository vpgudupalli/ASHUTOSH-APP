// Live updates over Socket.IO. Each signed-in user joins a private room
// (`user:<id>`); admins also join `admins`. Events go only to people allowed
// to see that patient.
import { Server } from 'socket.io';
import { parseCookie } from 'cookie';
import { query } from './db.js';
import { COOKIE_NAME, userFromToken } from './auth.js';

let io;

export function initRealtime(httpServer) {
  io = new Server(httpServer);

  io.use(async (socket, next) => {
    const cookies = parseCookie(socket.handshake.headers.cookie || '');
    const user = await userFromToken(cookies[COOKIE_NAME]);
    if (!user) return next(new Error('unauthorized'));
    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const { user } = socket.data;
    socket.join(`user:${user.id}`);
    if (user.role === 'admin') socket.join('admins');
  });
}

// Rooms of everyone who may see this patient: admins, assigned staff, and the patient.
async function roomsForPatient(patientId) {
  const rows = await query(
    `SELECT staff_id AS uid FROM assignments WHERE patient_id = $1
     UNION SELECT user_id AS uid FROM patients WHERE id = $1 AND user_id IS NOT NULL`,
    [patientId]
  );
  return ['admins', ...rows.map((r) => `user:${r.uid}`)];
}

export async function notifyPatient(patientId, event, payload) {
  if (!io) return;
  io.to(await roomsForPatient(patientId)).emit(event, payload);
}

export function notifyUser(userId, event, payload) {
  io?.to(`user:${userId}`).emit(event, payload);
}
