import React from 'react';
import { getSocket } from '../api.js';

// True while the live-update connection is up.
export function useSocketStatus(enabled) {
    const [connected, setConnected] = React.useState(false);
    React.useEffect(() => {
        if (!enabled) return;
        const socket = getSocket();
        const update = () => setConnected(socket.connected);
        update();
        socket.on('connect', update);
        socket.on('disconnect', update);
        return () => {
            socket.off('connect', update);
            socket.off('disconnect', update);
        };
    }, [enabled]);
    return connected;
}

// Runs `handler` whenever any of the given socket events fire.
export function useSocketEvents(events, handler) {
    const ref = React.useRef(handler);
    ref.current = handler;
    React.useEffect(() => {
        const socket = getSocket();
        const fn = (payload) => ref.current(payload);
        events.forEach((e) => socket.on(e, fn));
        // Refresh after reconnecting in case we missed events while offline.
        socket.io.on('reconnect', fn);
        return () => {
            events.forEach((e) => socket.off(e, fn));
            socket.io.off('reconnect', fn);
        };
    }, [events.join(',')]);
}
