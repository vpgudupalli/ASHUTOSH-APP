import React from 'react';
import { api, closeSocket, getSocket, navigate } from './api.js';
import Header from './components/Header.jsx';
import Footer from './components/Footer.jsx';
import Toasts, { useToasts } from './components/Toasts.jsx';
import Login from './views/Login.jsx';
import Dashboard from './views/Dashboard.jsx';
import PatientDetail from './views/PatientDetail.jsx';
import AdminPanel from './views/AdminPanel.jsx';

// Tiny hash router: #/ , #/patients/12 , #/admin
function useRoute() {
  const read = () => window.location.hash.replace(/^#/, '') || '/';
  const [route, setRoute] = React.useState(read);
  React.useEffect(() => {
    const onHash = () => setRoute(read());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return route;
}


export default function App() {
  const [user, setUser] = React.useState(undefined); // undefined = loading, null = signed out
  const route = useRoute();
  const { toasts, push, dismiss } = useToasts();

  React.useEffect(() => {
    api('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null));
  }, []);

  // Live alerts for everyone signed in (staff see their patients, patients see their own record).
  React.useEffect(() => {
    if (!user) return;
    const socket = getSocket();
    const onAssessment = (e) => {
      if (e.submittedBy.id === user.id) return;
      push({
        risk: e.risk,
        title: user.role === 'patient' ? 'Your care team updated your assessment' : `${e.patientName}: ${e.risk}`,
        body: `Updated by ${e.submittedBy.name}`,
        href: `/patients/${e.patientId}`,
      });
    };
    socket.on('assessment:new', onAssessment);
    return () => socket.off('assessment:new', onAssessment);
  }, [user, push]);

  const logout = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    closeSocket();
    setUser(null);
    navigate('/');
  };

  if (user === undefined) {
    return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  }

  let page;
  if (!user) {
    page = <Login onSignedIn={() => api('/auth/me').then((d) => { navigate('/'); setUser(d.user); })} />;
  } else if (user.role === 'patient') {
    page = user.patientId
      ? <PatientDetail id={user.patientId} user={user} push={push} />
      : <div className="card">Your patient record is not set up yet. Please contact your care team.</div>;
  } else if (route.startsWith('/patients/')) {
    page = <PatientDetail id={Number(route.split('/')[2])} user={user} push={push} />;
  } else if (route === '/admin' && user.role === 'admin') {
    page = <AdminPanel push={push} />;
  } else {
    page = <Dashboard user={user} push={push} />;
  }

  return (
    <div className="min-h-screen flex flex-col font-sans" data-name="app">
      <Header user={user} route={route} onLogout={logout} />
      <main className="flex-grow bg-[var(--bg-canvas)]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">{page}</div>
      </main>
      <Footer />
      <Toasts toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
