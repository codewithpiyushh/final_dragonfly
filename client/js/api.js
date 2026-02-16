const API_CONFIG = {
    BASE: "http://localhost:8000/api",
    WS: "ws://localhost:8000/ws/chat"
};

window.api = {
    login: async (username, password) => {
        const res = await fetch(`${API_CONFIG.BASE}/login`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username, password})
        });
        if (!res.ok) throw new Error((await res.json()).detail || "Login failed");
        return await res.json();
    },

    register: async (username, password) => {
        const res = await fetch(`${API_CONFIG.BASE}/register`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({username, password})
        });
        if (!res.ok) throw new Error((await res.json()).detail || "Registration failed");
        return await res.json();
    },

    // UPDATED: Accepts owner parameter
    getProjects: async (owner) => {
        const url = owner ? `${API_CONFIG.BASE}/projects?owner=${owner}` : `${API_CONFIG.BASE}/projects`;
        const res = await fetch(url);
        return await res.json();
    },
    
    createProject: async (data) => {
        const res = await fetch(`${API_CONFIG.BASE}/projects`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        return await res.json();
    },

    deleteProject: async (id) => {
        const res = await fetch(`${API_CONFIG.BASE}/projects/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error("Delete failed");
        return await res.json();
    },

    saveVersion: async (data) => {
        const res = await fetch(`${API_CONFIG.BASE}/versions`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
        return await res.json();
    },
    // ... existing functions ...

    // NEW: Function to save current editor state
    saveProjectContent: async (id, content) => {
        const res = await fetch(`${API_CONFIG.BASE}/projects/${id}/content`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ content })
        });
        if (!res.ok) throw new Error("Failed to auto-save content");
        return await res.json();
    },

    // ... socket logic ...
    getVersions: async (projectId) => {
        const res = await fetch(`${API_CONFIG.BASE}/versions/${projectId}`);
        return await res.json();
    },

    socket: null,
    initSocket: (onMessage) => {
        window.api.socket = new WebSocket(API_CONFIG.WS);
        window.api.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === 'stream' && onMessage) onMessage(data.message);
        };
    },
    sendMessage: (text) => {
        const s = window.api.socket;
        if(s && s.readyState === WebSocket.OPEN) s.send(JSON.stringify({ input: text }));
    }
};