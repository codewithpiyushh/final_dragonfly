// STATE
let isLoginMode = true;
let currentUser = null;
let accumulatedText = "";
let streamTarget = "editor"; 
let currentVersionHistory = [];

// PROMPTS STATE
let currentUploadType = "";
let promptFiles = { mom: [], drafts: [], transcripts: [], chats: [] };

// INIT
window.addEventListener('DOMContentLoaded', () => {
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
        currentUser = storedUser;
        updateUserProfile(currentUser);
        showView('view-dashboard');
        loadProjects();
        if (window.api && window.api.initSocket) window.api.initSocket(handleAgentStream);
    } else {
        showView('view-auth');
    }
});

function showView(viewId) {
    document.querySelectorAll('.view').forEach(v => {
        v.style.display = 'none';
        v.classList.remove('active');
    });
    const target = document.getElementById(viewId);
    if (target) {
        target.style.display = 'flex';
        target.classList.add('active');
    }
    const nav = document.getElementById('main-navbar');
    if (nav) nav.style.display = (viewId === 'view-auth') ? 'none' : 'flex';
}

function closeWorkspace() { showView('view-dashboard'); }

async function handleAuthAction() {
    const user = document.getElementById('auth-user').value;
    const pass = document.getElementById('auth-pass').value;
    const errorMsg = document.getElementById('auth-error');

    if (!user || !pass) {
        if(errorMsg) errorMsg.innerText = "Please enter credentials";
        return;
    }
    try {
        let response;
        if (isLoginMode) response = await window.api.login(user, pass);
        else response = await window.api.register(user, pass);

        currentUser = response.username;
        localStorage.setItem('user', currentUser);
        updateUserProfile(currentUser);
        
        if(window.api.initSocket) window.api.initSocket(handleAgentStream);
        await loadProjects();
        showView('view-dashboard'); 
    } catch (e) {
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

async function loadProjects() {
    try {
        if (!currentUser) return;
        const projects = await window.api.getProjects(currentUser);
        const tbody = document.getElementById('project-table-body');
        if (!tbody) return;
        
        if (projects.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px; color:#666;">No projects found.</td></tr>`;
            return;
        }

        tbody.innerHTML = projects.map(p => `
            <tr style="border-bottom: 1px solid #eee;">
                <td style="padding:12px; font-weight:600; color:#D32F2F;">${p.lob || '-'}</td>
                <td style="padding:12px; font-weight:500; color:#111;">${p.name}</td>
                <td style="padding:12px;"><span class="tag new" style="background:#E3F2FD; color:#1976D2; padding:4px 10px; border-radius:20px; font-size:11px; font-weight:600;">${p.projectType || 'New'}</span></td>
                <td style="padding:12px;">${p.application || '-'}</td>
                <td style="padding:12px;">${p.module || '-'}</td>
                <td style="padding:12px;">${p.owner || 'System'}</td>
                <td style="padding:12px; font-size:13px; color:#666;">${p.createdOn || '-'}</td>
                <td style="padding:12px; display:flex; align-items:center; gap:15px;">
                    <button onclick="openWorkspace('${p.id}', '${p.name}', '${p.lob}', '${p.department}')" 
                        style="background-color: white; border: 1px solid #D32F2F; color: #D32F2F; padding: 6px 16px; font-size: 11px; font-weight: 600; border-radius: 4px; cursor: pointer; text-transform: uppercase; white-space: nowrap;"
                        onmouseover="this.style.background='#D32F2F'; this.style.color='white';"
                        onmouseout="this.style.background='white'; this.style.color='#D32F2F';">
                        Open Workspace
                    </button>
                    <span class="material-icons-outlined" onclick="deleteProject('${p.id}')" style="cursor:pointer; color:#999; font-size:20px;" onmouseover="this.style.color='#D32F2F'" onmouseout="this.style.color='#999'" title="Delete Project">delete</span>
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

function openCreateModal() { document.getElementById('modal-create-project').style.display = 'flex'; }
function closeCreateModal() { document.getElementById('modal-create-project').style.display = 'none'; }

async function submitCreateProject() {
    const nameEl = document.getElementById('cp-name');
    const lobEl = document.getElementById('cp-lob');
    const deptEl = document.getElementById('cp-dept');
    const appEl = document.getElementById('cp-app');   
    const descEl = document.getElementById('cp-desc'); 

    const name = nameEl ? nameEl.value : "";
    const lob = lobEl ? lobEl.value : "";
    const dept = deptEl ? deptEl.value : "";
    const app = appEl ? appEl.value : "General";
    const desc = descEl ? descEl.value : "";
    
    if(!name || !lob || !dept) return alert("Please fill in all mandatory fields (*)");
    
    try {
        await window.api.createProject({
            name: name, lob: lob, department: dept, application: app, description: desc, owner: currentUser || "System"
        });
        closeCreateModal();
        await loadProjects();
    } catch(e) { alert("Error: " + e.message); }
}

// --- WORKSPACE ---
async function openWorkspace(id, name, lob, dept) {
    document.getElementById('ws-p-id').value = id;
    document.getElementById('ws-p-name').value = name;
    
    const lobSelect = document.getElementById('ws-p-lob');
    if(lobSelect) lobSelect.value = lob;
    const deptSelect = document.getElementById('ws-p-dept');
    if(deptSelect) deptSelect.value = dept;

    const editor = document.getElementById('brd-editor');
    editor.innerHTML = `<p style="text-align:center; color:#999; margin-top:50px;">Loading working version...</p>`;
    
    resetPromptUI();
    showView('view-workspace');

    try {
        const projects = await window.api.getProjects(currentUser); 
        const project = projects.find(p => p.id === id);

        if (project && project.current_content) {
            editor.innerHTML = project.current_content;
        } else {
            editor.innerHTML = `<h1 style="text-align:center;">Business Requirements Document</h1><p style="text-align:center;color:#666;">Draft</p><hr><p>Waiting for requirements...</p>`;
        }
    } catch(e) {
        console.error("Error loading content", e);
        editor.innerHTML = `<p style="color:red">Error loading document.</p>`;
    }
}

// --- COLLAPSIBLE SIDEBAR LOGIC ---
// ... (All previous state/init code) ...

// COLLAPSIBLE SIDEBAR LOGIC
function toggleRightSidebar() {
    const sidebar = document.getElementById('right-sidebar');
    const icon = document.getElementById('sidebar-icon');
    
    sidebar.classList.toggle('collapsed');
    
    if (sidebar.classList.contains('collapsed')) {
        icon.innerText = 'chevron_left'; // Click to open
    } else {
        icon.innerText = 'chevron_right'; // Click to close
    }
}

// --- GUIDED PROMPT LOGIC ---
function resetPromptUI() {
    promptFiles = { mom: [], drafts: [], transcripts: [], chats: [] };
    ['mom', 'drafts', 'transcripts', 'chats'].forEach(type => {
        const card = document.getElementById(`card-${type}`);
        const container = document.getElementById(`badge-container-${type}`);
        if(card) card.classList.remove('uploaded');
        if(container) container.innerHTML = '';
    });
}

function openUploadPrompt(type) {
    // If user clicks a card, we open the modal.
    // If user clicked the DELETE button, don't open modal (stop propagation is handled in HTML button click if needed, but here we check target)
    if(event.target.closest('.btn-delete-file')) return;

    currentUploadType = type;
    document.getElementById('upload-type-label').innerText = type;
    document.getElementById('modal-upload-prompt').style.display = 'flex';
}

function closeUploadPrompt() {
    document.getElementById('modal-upload-prompt').style.display = 'none';
    document.getElementById('hidden-file-input').value = "";
}

function handlePromptFileUpload(input) {
    if (input.files && input.files[0]) {
        const fileName = input.files[0].name;
        
        // 1. Add file
        promptFiles[currentUploadType].push(fileName);
        
        // 2. Update UI
        updatePromptCardUI(currentUploadType);

        // 3. Close Modal
        closeUploadPrompt();
    }
}

function updatePromptCardUI(type) {
    const card = document.getElementById(`card-${type}`);
    const container = document.getElementById(`badge-container-${type}`);
    const files = promptFiles[type];

    if (files.length > 0) {
        card.classList.add('uploaded');
        // Re-render all badges for this type
        container.innerHTML = files.map(f => `
            <div class="prompt-file-badge">
                <span class="material-icons-outlined" style="font-size:12px;">description</span> 
                <span style="max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f}</span>
                <span class="material-icons-outlined btn-delete-file" onclick="deletePromptFile('${type}', '${f}')">close</span>
            </div>
        `).join('');
    } else {
        card.classList.remove('uploaded');
        container.innerHTML = '';
    }
}

function deletePromptFile(type, fileName) {
    event.stopPropagation(); // Stop card click
    if(confirm(`Remove file "${fileName}"?`)) {
        // Remove from array
        promptFiles[type] = promptFiles[type].filter(f => f !== fileName);
        // Update UI
        updatePromptCardUI(type);
    }
}

function generateBRDFromPrompts() {
    let contextMessage = "I have uploaded the following project documents. Please analyze them and generate a comprehensive Business Requirements Document (BRD) structure and content based on them:\n\n";
    let hasFiles = false;

    for (const [type, files] of Object.entries(promptFiles)) {
        if (files.length > 0) {
            hasFiles = true;
            contextMessage += `[${type.toUpperCase()}]\nFiles: ${files.join(", ")}\n(Simulating content reading...)\n\n`;
        }
    }

    if (!hasFiles) {
        alert("Please upload at least one document (MOM, Draft, etc.) before generating.");
        return;
    }

    streamTarget = "editor";
    document.getElementById('brd-editor').innerHTML = ""; 
    accumulatedText = "";
    document.getElementById('brd-editor').innerHTML = `<p style="color:#666; font-style:italic;">Analyzing uploaded documents and generating BRD...</p><br>`;
    
    window.api.sendMessage(contextMessage);
}

// --- VERSIONING ---
async function saveVersionSnapshot() {
    const pid = document.getElementById('ws-p-id').value;
    const content = document.getElementById('brd-editor').innerHTML;
    const pName = document.getElementById('ws-p-name').value;
    const pLob = document.getElementById('ws-p-lob').value;
    const pDept = document.getElementById('ws-p-dept').value;

    let nextVersionNum = 1;
    try {
        const existingVersions = await window.api.getVersions(pid);
        if(existingVersions && existingVersions.length > 0) nextVersionNum = existingVersions.length + 1;
    } catch(e) { console.warn("Could not fetch version count, starting at 1"); }

    const versionName = `Version ${nextVersionNum}`;

    if(confirm(`Create new snapshot "${versionName}"?`)) {
        try {
            await window.api.saveVersion({
                projectId: pid, versionName: versionName, content: content,
                projectName: pName, lob: pLob, department: pDept
            });
            await window.api.saveProjectContent(pid, content);
            alert("Saved!");
        } catch(e) { alert("Save failed: " + e.message); }
    }
}

async function openVersionModal() {
    const pid = document.getElementById('ws-p-id').value;
    const list = document.getElementById('version-list');
    list.innerHTML = "<p style='text-align:center; color:#666;'>Loading history...</p>";
    
    try {
        const vers = await window.api.getVersions(pid);
        currentVersionHistory = vers;
        if (vers.length === 0) {
            list.innerHTML = "<p style='text-align:center; color:#999;'>No version history found.</p>";
            return;
        }
        list.innerHTML = vers.map((v, index) => `
            <div class="version-item" style="display:flex; justify-content:space-between; align-items:center; padding:15px; border-bottom:1px solid #eee;">
                <div>
                    <div style="font-weight:600; color:#333;">${v.versionName}</div>
                    <div style="font-size:11px; color:#666;">${v.lob || ''} - ${v.department || ''}</div>
                    <div style="font-size:10px; color:#999;">${v.timestamp}</div>
                </div>
                <button class="btn-sm" 
                    style="background:#D32F2F; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;"
                    onclick="restoreVersionByIndex(${index})">
                    Restore
                </button>
            </div>
        `).join('');
        document.getElementById('modal-versions').style.display='flex';
    } catch (e) {
        list.innerHTML = "<p style='color:red; text-align:center;'>Error loading versions.</p>";
        console.error(e);
    }
}

async function restoreVersionByIndex(index) {
    if(confirm("Restore this version?")) {
        const content = currentVersionHistory[index].content;
        const editor = document.getElementById('brd-editor');
        editor.innerHTML = content;
        document.getElementById('modal-versions').style.display = 'none';
        const pid = document.getElementById('ws-p-id').value;
        if(pid) await window.api.saveProjectContent(pid, content);
    }
}

// ... (Agent/TOC Logic) ...
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
        if(el) { el.value += chunk; el.scrollTop = el.scrollHeight; }
    } else {
        const el = document.getElementById('brd-editor');
        if(el) {
            accumulatedText += chunk;
            el.innerHTML = accumulatedText.replace(/\n/g, "<br>").replace(/### (.*?)(<br>|$)/g, "<h3>$1</h3>").replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");
            el.scrollTop = el.scrollHeight;
            updateTOCSidebar();
        }
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
window.restoreVersionByIndex = restoreVersionByIndex;
window.openUploadPrompt = openUploadPrompt;
window.closeUploadPrompt = closeUploadPrompt;
window.handlePromptFileUpload = handlePromptFileUpload;
window.generateBRDFromPrompts = generateBRDFromPrompts;
window.toggleRightSidebar = toggleRightSidebar;
window.deletePromptFile = deletePromptFile;