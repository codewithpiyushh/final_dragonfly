// STATE
let isLoginMode = true;
let currentUser = null;
let accumulatedText = "";
let streamTarget = "editor"; 

// INIT
window.addEventListener('DOMContentLoaded', () => {
    console.log("App Initialized");
    const storedUser = localStorage.getItem('user');
    
    if (storedUser) {
        currentUser = storedUser;
        updateUserProfile(currentUser);
        // FORCE SWITCH TO DASHBOARD
        showView('view-dashboard');
        loadProjects();
        if (window.api && window.api.initSocket) window.api.initSocket(handleAgentStream);
    } else {
        // FORCE SWITCH TO AUTH
        showView('view-auth');
    }
});

// --- NAVIGATION (CRITICAL FIX) ---
function showView(viewId) {
    console.log("Switching to view:", viewId);

    // 1. Get all views
    const views = document.querySelectorAll('.view');
    
    // 2. Hide ALL views forcefully
    views.forEach(v => {
        v.style.display = 'none';       // Inline CSS override
        v.classList.remove('active');   // Class removal
    });

    // 3. Show ONLY the target view
    const target = document.getElementById(viewId);
    if (target) {
        target.style.display = 'flex';  // Inline CSS override
        target.classList.add('active'); // Class addition
    } else {
        console.error("View not found:", viewId);
    }

    // 4. Toggle Navbar visibility
    const nav = document.getElementById('main-navbar');
    if (nav) {
        if (viewId === 'view-auth') {
            nav.style.display = 'none';
        } else {
            nav.style.display = 'flex';
        }
    }
}

function closeWorkspace() { showView('view-dashboard'); }

// --- AUTH ---
async function handleAuthAction() {
    const userBtn = document.getElementById('auth-user');
    const passBtn = document.getElementById('auth-pass');
    const errorMsg = document.getElementById('auth-error');

    const user = userBtn.value;
    const pass = passBtn.value;

    if (!user || !pass) {
        if(errorMsg) errorMsg.innerText = "Please enter credentials";
        return;
    }

    try {
        let response;
        if (isLoginMode) response = await window.api.login(user, pass);
        else response = await window.api.register(user, pass);

        // Login Success
        currentUser = response.username;
        localStorage.setItem('user', currentUser);
        updateUserProfile(currentUser);
        
        if(window.api.initSocket) window.api.initSocket(handleAgentStream);
        
        // CRITICAL: Load data THEN switch view
        await loadProjects();
        showView('view-dashboard'); 

    } catch (e) {
        console.error(e);
        if(errorMsg) errorMsg.innerText = e.message;
    }
}

function updateUserProfile(name) {
    const el = document.getElementById('current-username');
    const nav = document.getElementById('nav-user-profile');
    if(el) el.innerText = name;
    if(nav) nav.style.display = 'flex';
}

function toggleAuthMode() {
    isLoginMode = !isLoginMode;
    document.getElementById('auth-title').innerText = isLoginMode ? "Sign In" : "Register";
    document.getElementById('auth-btn').innerText = isLoginMode ? "Sign In" : "Register";
    document.getElementById('auth-toggle-text').innerText = isLoginMode ? "Need an account? " : "Have an account? ";
    document.querySelector('.auth-footer a').innerText = isLoginMode ? "Request Access" : "Sign In";
    document.getElementById('auth-error').innerText = "";
}

function logout() {
    localStorage.removeItem('user');
    window.location.reload();
}

// --- PROJECTS ---
async function loadProjects() {
    try {
        const projects = await window.api.getProjects();
        const tbody = document.getElementById('project-table-body');
        if (!tbody) return;
        
        if (projects.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#666;">No projects found.</td></tr>`;
            return;
        }

        tbody.innerHTML = projects.map(p => `
            <tr>
                <td style="font-weight:600; color:#D32F2F;">${p.lob || '-'}</td>
                <td onclick="openWorkspace('${p.id}', '${p.name}')" style="cursor:pointer; font-weight:500; color:#111;">${p.name}</td>
                <td><span class="tag new">${p.projectType || 'New'}</span></td>
                <td>${p.application || '-'}</td>
                <td>${p.module || '-'}</td>
                <td>${p.owner || 'System'}</td>
                <td style="font-size:13px; color:#666;">${p.createdOn || '-'}</td>
                <td style="text-align:center;">
                    <button class="icon-btn delete-btn" onclick="deleteProject('${p.id}')" title="Delete">
                        <span class="material-icons-outlined" style="font-size:18px;">delete</span>
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (e) { console.error(e); }
}

async function deleteProject(id) {
    if(confirm("Delete this project?")) {
        try { await window.api.deleteProject(id); await loadProjects(); }
        catch(e) { alert(e.message); }
    }
}

// --- CREATE PROJECT ---
function openCreateModal() { document.getElementById('modal-create-project').style.display = 'flex'; }
function closeCreateModal() { document.getElementById('modal-create-project').style.display = 'none'; }

async function submitCreateProject() {
    const name = document.getElementById('cp-name').value;
    const lob = document.getElementById('cp-lob').value;
    const dept = document.getElementById('cp-dept').value;
    
    if(!name || !lob || !dept) return alert("Fill mandatory fields (*)");
    
    try {
        await window.api.createProject({
            name, lob, department: dept,
            application: document.getElementById('cp-app').value,
            description: document.getElementById('cp-desc').value,
            owner: currentUser
        });
        closeCreateModal();
        await loadProjects();
    } catch(e) { alert(e.message); }
}

// --- WORKSPACE & AGENT ---
function openWorkspace(id, name) {
    document.getElementById('ws-p-id').value = id;
    document.getElementById('ws-p-name').value = name;
    document.getElementById('brd-editor').innerHTML = `<h1 style="text-align:center;">Business Requirements Document</h1><p style="text-align:center;color:#666;">Draft</p><hr>`;
    showView('view-workspace');
}

function openTocModal() { document.getElementById('modal-toc').style.display='flex'; }
function closeTocModal() { document.getElementById('modal-toc').style.display='none'; }

function suggestTOCStructure() {
    streamTarget = "modal";
    document.getElementById('toc-draft-input').value = "";
    window.api.sendMessage(`Generate a TOC list for "${document.getElementById('ws-p-name').value}". No details.`);
}

function generateFullBRDFromTOC() {
    const toc = document.getElementById('toc-draft-input').value;
    if(!toc) return alert("Add content first");
    closeTocModal();
    streamTarget = "editor";
    document.getElementById('brd-editor').innerHTML = "";
    accumulatedText = "";
    window.api.sendMessage(`Write detailed BRD based on:\n${toc}\nUse ### headers.`);
}

function sendToAgent() {
    const val = document.getElementById('agent-input').value;
    if(!val) return;
    document.getElementById('brd-editor').innerHTML += `<div style="background:#E3F2FD;padding:10px;margin:10px 0;"><strong>User:</strong> ${val}</div>`;
    streamTarget = "editor";
    window.api.sendMessage(val);
    document.getElementById('agent-input').value = "";
}

function handleAgentStream(chunk) {
    if(streamTarget === 'modal') {
        const el = document.getElementById('toc-draft-input');
        el.value += chunk;
        el.scrollTop = el.scrollHeight;
    } else {
        const el = document.getElementById('brd-editor');
        accumulatedText += chunk;
        el.innerHTML = accumulatedText.replace(/\n/g, "<br>").replace(/### (.*?)(<br>|$)/g, "<h3>$1</h3>").replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");
        el.scrollTop = el.scrollHeight;
        updateTOCSidebar();
    }
}

function updateTOCSidebar() {
    const headers = document.querySelectorAll('#brd-editor h3');
    const cont = document.getElementById('toc-list-container');
    if(!cont) return;
    let h = "";
    headers.forEach((hd, i) => { 
        if(!hd.id) hd.id="h"+i; 
        h+=`<div class="toc-item" onclick="document.getElementById('${hd.id}').scrollIntoView()">${hd.innerText}</div>`; 
    });
    if(h) cont.innerHTML=h;
}

function saveBRD() {
    const html = `<html><body>${document.getElementById('brd-editor').innerHTML}</body></html>`;
    const url = URL.createObjectURL(new Blob([html], {type:'application/msword'}));
    const a = document.createElement('a');
    a.href=url; a.download="BRD.doc"; a.click();
}

async function saveVersionSnapshot() {
    const pid = document.getElementById('ws-p-id').value;
    const name = prompt("Version Name:");
    if(name) {
        await window.api.saveVersion({projectId:pid, versionName:name, content:document.getElementById('brd-editor').innerHTML});
        alert("Saved");
    }
}

async function openVersionModal() {
    const pid = document.getElementById('ws-p-id').value;
    const list = document.getElementById('version-list');
    list.innerHTML = "Loading...";
    const vers = await window.api.getVersions(pid);
    list.innerHTML = vers.map(v => `
        <div class="version-item">
            <div><b>${v.versionName}</b><br><small>${v.timestamp}</small></div>
            <button class="btn-sm" onclick='restoreVersion(${JSON.stringify(v.content)})'>Restore</button>
        </div>
    `).join('') || "No versions.";
    document.getElementById('modal-versions').style.display='flex';
}

function restoreVersion(c) {
    if(confirm("Restore?")) {
        document.getElementById('brd-editor').innerHTML=c;
        document.getElementById('modal-versions').style.display='none';
    }
}

// EXPORTS
window.handleAuthAction = handleAuthAction;
window.toggleAuthMode = toggleAuthMode;
window.logout = logout;
window.openCreateModal = openCreateModal;
window.closeCreateModal = closeCreateModal;
window.submitCreateProject = submitCreateProject;
window.openWorkspace = openWorkspace;
window.closeWorkspace = closeWorkspace;
window.deleteProject = deleteProject;
window.saveBRD = saveBRD;
window.openTocModal = openTocModal;
window.closeTocModal = closeTocModal;
window.suggestTOCStructure = suggestTOCStructure;
window.generateFullBRDFromTOC = generateFullBRDFromTOC;
window.sendToAgent = sendToAgent;
window.openVersionModal = openVersionModal;
window.saveVersionSnapshot = saveVersionSnapshot;
window.restoreVersion = restoreVersion;
