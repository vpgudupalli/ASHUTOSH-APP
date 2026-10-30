import React from 'react';
import { api, closeSocket, getSocket, navigate, ROLE_LABELS } from './api.js';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import Toasts, { useToasts } from './components/Toasts.jsx';
import Login from './views/Login.jsx';
import Dashboard from './views/Dashboard.jsx';
import PatientDetail from './views/PatientDetail.jsx';
import PrintReport from './views/PrintReport.jsx';
import AdminPanel from './views/AdminPanel.jsx';
import Account from './views/Account.jsx';
import Methodology from './views/Methodology.jsx';

// Tiny hash router: #/ , #/patients/12 , #/patients/12/print/34 , #/admin ...
function useRoute() {
  const read = () => window.location.hash.replace(/^#/, '') || '/';
  const [route, setRoute] = React.useState(read);
  React.useEffect(() => {
    const onHash = () => { setRoute(read()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}

// HIPAA automatic logoff: sign out after inactivity, with a 1-minute warning.
function useIdleLogout(enabled, minutes, onTimeout) {
  const [warning, setWarning] = React.useState(false);
  React.useEffect(() => {
    if (!enabled) return;
    let last = Date.now();
    let lastPing = Date.now();
    const activity = () => {
      last = Date.now();
      setWarning(false);
      // Keep the server session alive while the user is active.
      if (Date.now() - lastPing > 60_000) { lastPing = Date.now(); api('/auth/me').catch(() => {}); }
    };
    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, activity, { passive: true }));
    const timer = setInterval(() => {
      const idle = (Date.now() - last) / 60000;
      if (idle >= minutes) onTimeout();
      else setWarning(idle >= minutes - 1);
    }, 5000);
    return () => { events.forEach((e) => window.removeEventListener(e, activity)); clearInterval(timer); };
  }, [enabled, minutes, onTimeout]);
  return warning;
}

export default function App() {
  const [user, setUser] = React.useState(undefined); // undefined = loading, null = signed out
  const [config, setConfig] = React.useState({ idleMinutes: 15 });
  const [notice, setNotice] = React.useState('');
  const route = useRoute();
  const { toasts, push, dismiss } = useToasts();

  const refreshMe = React.useCallback(() => api('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null)), []);

  React.useEffect(() => {
    refreshMe();
    api('/config').then(setConfig).catch(() => {});
  }, [refreshMe]);

  const signOut = React.useCallback(async (message = '') => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    closeSocket();
    setUser(null);
    setNotice(message);
    navigate('/');
  }, []);

  const onIdle = React.useCallback(() => signOut('You were signed out after a period of inactivity to protect patient privacy.'), [signOut]);
  const idleWarning = useIdleLogout(!!user, config.idleMinutes, onIdle);

  React.useEffect(() => {
    const expired = () => { if (user) signOut('Your session ended. Please sign in again.'); };
    const mfa = () => navigate('/account');
    window.addEventListener('session-expired', expired);
    window.addEventListener('mfa-required', mfa);
    return () => { window.removeEventListener('session-expired', expired); window.removeEventListener('mfa-required', mfa); };
  }, [user, signOut]);

  // Live alerts for everyone signed in.
  React.useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    const onAssessment = (e) => {
      if (e.submittedBy.id === user.id) return;
      push({
        risk: e.risk,
        title: user.role === 'patient' ? 'Your care team updated your check-in' : `${e.patientName}: ${e.risk}${e.emergency ? ' – EMERGENCY SYMPTOMS' : ''}`,
        body: `New check-in by ${e.submittedBy.name}`,
        href: `/patients/${e.patientId}`,
      });
    };
    const onMessage = (e) => {
      if (e.sender.id === user.id) return;
      push({
        title: user.role === 'patient' ? `New message from ${e.sender.name}` : `Message from ${e.patientName}`,
        body: e.sender.role === 'patient' ? 'Patient' : ROLE_LABELS[e.sender.role],
        href: `/patients/${e.patientId}/messages`,
      });
    };
    socket.on('assessment:new', onAssessment);
    socket.on('message:new', onMessage);
    return () => { socket.off('assessment:new', onAssessment); socket.off('message:new', onMessage); };
  }, [user, push]);

  if (user === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  }

  const parts = route.split('/').filter(Boolean); // e.g. ['patients','12','print','34']
  let page;
  if (!user) {
    page = <Login notice={notice} onSignedIn={() => api('/auth/me').then((d) => { setNotice(''); navigate('/'); setUser(d.user); })} />;
  } else if (user.mfaSetupRequired || parts[0] === 'account') {
    page = <Account user={user} push={push} onChanged={refreshMe} />;
  } else if (parts[0] === 'methodology') {
    page = <Methodology />;
  } else if (user.role === 'patient') {
    if (!user.patientId) page = <div className="card">Your patient record is not set up yet. Please contact your care team.</div>;
    else if (parts[0] === 'patients' && parts[2] === 'print') page = <PrintReport patientId={user.patientId} assessmentId={parts[3]} user={user} />;
    else page = <PatientDetail key={route} id={user.patientId} user={user} push={push} tab={parts[2]} />;
  } else if (parts[0] === 'patients' && parts[2] === 'print') {
    page = <PrintReport patientId={Number(parts[1])} assessmentId={parts[3]} user={user} />;
  } else if (parts[0] === 'patients') {
    page = <PatientDetail key={route} id={Number(parts[1])} user={user} push={push} tab={parts[2]} />;
  } else if (parts[0] === 'admin' && user.role === 'admin') {
    page = <AdminPanel push={push} />;
  } else {
    page = <Dashboard user={user} push={push} />;
  }

  return (
    <div className="min-h-screen flex flex-col font-sans" data-name="app">
      <Header user={user} route={route} onLogout={() => signOut()} />
      {idleWarning && (
        <div className="no-print bg-amber-100 text-amber-900 text-sm text-center py-2">You will be signed out in about a minute due to inactivity. Move your mouse or press a key to stay signed in.</div>
      )}
      <main className="flex-grow bg-[var(--bg-canvas)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{page}</div>
      </main>
      <Footer />
      <Toasts toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
