import React from 'react';
import { api, ROLE_LABELS } from '../api.js';
import { useSocketEvents } from './LiveStatus.jsx';
import { fmt } from './RiskBadge.jsx';

// Secure message thread between a patient and their care team, updated live.
export default function Messages({ patientId, user, push, onRead }) {
    const [messages, setMessages] = React.useState(null);
    const [text, setText] = React.useState('');
    const [sending, setSending] = React.useState(false);
    const endRef = React.useRef(null);

    const load = React.useCallback(() => {
        api(`/patients/${patientId}/messages`).then((d) => { setMessages(d.messages); onRead?.(); }).catch((e) => push({ error: true, title: e.message }));
    }, [patientId, push, onRead]);

    React.useEffect(load, [load]);
    React.useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [messages]);
    useSocketEvents(['message:new'], (e) => { if (!e || e.patientId === patientId) load(); });

    const send = async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        setSending(true);
        try {
            await api(`/patients/${patientId}/messages`, { method: 'POST', body: { body: text } });
            setText('');
            load();
        } catch (err) {
            push({ error: true, title: 'Message not sent', body: err.message });
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="card !p-0 flex flex-col h-[70vh] min-h-[420px]">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                <span className="icon-lock text-green-600"></span>
                <span className="font-medium text-slate-800">{user.role === 'patient' ? 'Messages with my care team' : 'Secure messages with patient'}</span>
                <span className="text-xs text-slate-400 ml-auto hidden sm:inline">Not for emergencies – call 911</span>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50/50">
                {messages === null && <div className="text-slate-400 text-sm">Loading…</div>}
                {messages?.length === 0 && <div className="text-slate-400 text-sm text-center py-10">No messages yet. Start the conversation below.</div>}
                {messages?.map((m) => {
                    const mine = m.sender_id === user.id;
                    const fromPatient = m.sender_role === 'patient';
                    return (
                        <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${mine ? 'bg-[var(--primary)] text-white rounded-br-sm' : fromPatient ? 'bg-white border border-amber-200 rounded-bl-sm' : 'bg-white border border-slate-200 rounded-bl-sm'}`}>
                                <div className={`text-xs mb-0.5 ${mine ? 'text-sky-100' : 'text-slate-500'}`}>
                                    {mine ? 'You' : m.sender_name}{!mine && m.sender_role ? ` · ${ROLE_LABELS[m.sender_role]}` : ''} · {fmt(m.created_at)}
                                </div>
                                <div className="whitespace-pre-wrap break-words">{m.body}</div>
                            </div>
                        </div>
                    );
                })}
                <div ref={endRef}></div>
            </div>
            <form onSubmit={send} className="p-3 border-t border-slate-100 flex gap-2">
                <textarea
                    value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Type a message…"
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) send(e); }}
                    className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-sky-500/20 resize-none"
                />
                <button type="submit" className="btn-primary self-end" disabled={sending || !text.trim()}><span className="icon-send"></span>Send</button>
            </form>
        </div>
    );
}
