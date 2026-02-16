// ==========================================
// 1. STATE MANAGEMENT
// ==========================================
let isLoginMode = true;
let currentUser = null;
let accumulatedText = "";
let streamTarget = "editor"; // editor, modal_split
let currentVersionHistory = [];

// Guided Prompts State
let currentUploadType = "";
let promptFiles = {
    mom: [],
    drafts: [],
    transcripts: [],
    chats: []
};

// ==========================================
// 2. INITIALIZATION (BYPASS AUTH)
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    let storedUser = localStorage.getItem('user');
    
    if (!storedUser) {
        storedUser = "Administrator"; 
        localStorage.setItem('user', storedUser);
    }
    
    currentUser = storedUser;
    updateUserProfile(currentUser);
    
    // Direct landing to Dashboard
    showView('view-dashboard');
    loadProjects();
    
    if (window.api && window.api.initSocket) {
        window.api.initSocket(handleAgentStream);
    }
});

// ==========================================
// 3. NAVIGATION & VIEW CONTROLLER
// ==========================================
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
    if (nav) {
        nav.style.display = (viewId === 'view-auth') ? 'none' : 'flex';
    }
}

function closeWorkspace() {
    showView('view-dashboard');
}

function toggleRightSidebar() {
    const sidebar = document.getElementById('right-sidebar');
    const icon = document.getElementById('sidebar-icon');
    
    sidebar.classList.toggle('collapsed');
    
    if (sidebar.classList.contains('collapsed')) {
        icon.innerText = 'chevron_left'; 
    } else {
        icon.innerText = 'chevron_right'; 
    }
}

function updateUserProfile(name) {
    const el = document.getElementById('current-username');
    const nav = document.getElementById('nav-user-profile');
    if(el) el.innerText = name;
    if(nav) nav.style.display = 'flex';
}

function logout() {
    localStorage.removeItem('user');
    window.location.reload();
}

// ==========================================
// 4. DASHBOARD (PROJECTS)
// ==========================================
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
                <td style="padding:12px;"><span class="tag new">${p.projectType || 'New'}</span></td>
                <td style="padding:12px;">${p.application || '-'}</td>
                <td style="padding:12px;">${p.module || '-'}</td>
                <td style="padding:12px;">${p.owner || 'System'}</td>
                <td style="padding:12px; font-size:13px; color:#666;">${p.createdOn || '-'}</td>
                <td style="padding:12px; display:flex; align-items:center; gap:15px;">
                    <button class="btn-open-formal" onclick="openWorkspace('${p.id}', '${p.name}', '${p.lob}', '${p.department}')">
                        Open Workspace
                    </button>
                    <span class="material-icons-outlined" onclick="deleteProject('${p.id}')" style="cursor:pointer; color:#999; font-size:20px;">delete</span>
                </td>
            </tr>
        `).join('');
    } catch (e) { console.error(e); }
}

async function deleteProject(id) {
    try { 
        await window.api.deleteProject(id); 
        await loadProjects(); 
    } catch(e) { console.error(e.message); }
}

function openCreateModal() { 
    document.getElementById('modal-create-project').style.display = 'flex'; 
}

function closeCreateModal() { 
    document.getElementById('modal-create-project').style.display = 'none'; 
}

async function submitCreateProject() {
    const name = document.getElementById('cp-name').value;
    const lob = document.getElementById('cp-lob').value;
    const dept = document.getElementById('cp-dept').value;
    const app = document.getElementById('cp-app').value || "General";
    const desc = document.getElementById('cp-desc').value;
    
    if(!name || !lob || !dept) return;
    
    try {
        await window.api.createProject({
            name, lob, department: dept, application: app, description: desc, owner: currentUser || "System"
        });
        closeCreateModal();
        await loadProjects();
    } catch(e) { console.error(e); }
}

// ==========================================
// 5. WORKSPACE LOGIC
// ==========================================
async function openWorkspace(id, name, lob, dept) {
    document.getElementById('ws-p-id').value = id;
    document.getElementById('ws-p-name').value = name;
    document.getElementById('ws-p-lob').value = lob;
    document.getElementById('ws-p-dept').value = dept;

    const editor = document.getElementById('brd-editor');
    editor.innerHTML = `<p style="text-align:center; color:#999; margin-top:50px;">Loading workspace...</p>`;
    
    resetPromptUI();
    showView('view-workspace');

    try {
        const projects = await window.api.getProjects(currentUser); 
        const project = projects.find(p => p.id === id);

        if (project && project.current_content) {
            editor.innerHTML = project.current_content;
        } else {
            editor.innerHTML = `<h1 style="text-align:center;">Business Requirements Document</h1><p style="text-align:center;color:#666;">Draft</p>`;
        }

        if (project && project.prompts) {
            promptFiles = project.prompts;
            ['mom', 'drafts', 'transcripts', 'chats'].forEach(t => updatePromptCardUI(t));
        }
    } catch(e) { console.error(e); }
}

// ==========================================
// 6. GUIDED PROMPTS
// ==========================================
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
    if(event.target.closest('.btn-delete-file')) return;
    currentUploadType = type;
    document.getElementById('upload-type-label').innerText = type;
    document.getElementById('modal-upload-prompt').style.display = 'flex';
}

function closeUploadPrompt() {
    document.getElementById('modal-upload-prompt').style.display = 'none';
}

function handlePromptFileUpload(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = async function(e) {
            promptFiles[currentUploadType].push({ name: file.name, content: e.target.result });
            updatePromptCardUI(currentUploadType);
            const pid = document.getElementById('ws-p-id').value;
            if(pid) await window.api.saveProjectPrompts(pid, promptFiles);
            closeUploadPrompt();
        };
        reader.readAsText(file);
    }
}

function updatePromptCardUI(type) {
    const card = document.getElementById(`card-${type}`);
    const container = document.getElementById(`badge-container-${type}`);
    const files = promptFiles[type];
    if (files && files.length > 0) {
        card.classList.add('uploaded');
        container.innerHTML = files.map(f => `
            <div class="prompt-file-badge">
                <span class="material-icons-outlined" style="font-size:12px;">description</span> 
                <span>${f.name}</span>
                <span class="material-icons-outlined btn-delete-file" onclick="deletePromptFile('${type}', '${f.name}')">close</span>
            </div>
        `).join('');
    } else {
        card.classList.remove('uploaded');
        container.innerHTML = '';
    }
}

async function deletePromptFile(type, fileName) {
    event.stopPropagation();
    promptFiles[type] = promptFiles[type].filter(f => f.name !== fileName);
    updatePromptCardUI(type);
    const pid = document.getElementById('ws-p-id').value;
    if(pid) await window.api.saveProjectPrompts(pid, promptFiles);
}

function generateBRDFromPrompts() {
    let contextMessage = "Generate a BRD based on these contents:\n\n";
    let hasFiles = false;
    for (const [type, files] of Object.entries(promptFiles)) {
        if (files.length > 0) {
            hasFiles = true;
            files.forEach(f => contextMessage += `[${type}] ${f.name}: ${f.content.substring(0, 5000)}\n`);
        }
    }
    if (!hasFiles) return;
    streamTarget = "editor";
    document.getElementById('brd-editor').innerHTML = "";
    accumulatedText = "";
    window.api.sendMessage(contextMessage);
}

// ==========================================
// 7. VERSIONING
// ==========================================
async function saveVersionSnapshot() {
    const pid = document.getElementById('ws-p-id').value;
    const content = document.getElementById('brd-editor').innerHTML;
    try {
        const existing = await window.api.getVersions(pid);
        const versionName = `Version ${existing.length + 1}`;
        await window.api.saveVersion({ projectId: pid, versionName, content });
        await window.api.saveProjectContent(pid, content);
    } catch(e) { console.error(e); }
}

async function openVersionModal() {
    const pid = document.getElementById('ws-p-id').value;
    const list = document.getElementById('version-list');
    try {
        const vers = await window.api.getVersions(pid);
        currentVersionHistory = vers;
        list.innerHTML = vers.map((v, i) => `
            <div class="version-item">
                <div><strong>${v.versionName}</strong><br><small>${v.timestamp}</small></div>
                <button class="btn-sm" onclick="restoreVersionByIndex(${i})">Restore</button>
            </div>
        `).join('');
        document.getElementById('modal-versions').style.display='flex';
    } catch (e) { console.error(e); }
}

async function restoreVersionByIndex(index) {
    const content = currentVersionHistory[index].content;
    document.getElementById('brd-editor').innerHTML = content;
    document.getElementById('modal-versions').style.display = 'none';
    const pid = document.getElementById('ws-p-id').value;
    if(pid) await window.api.saveProjectContent(pid, content);
}

// ==========================================
// 8. 3-COLUMN TOC MODAL LOGIC
// ==========================================
function openTocModal() { 
    document.getElementById('toc-structure').value = ""; 
    document.getElementById('toc-context').value = "";   
    document.getElementById('toc-persona-editor').innerHTML = ""; 
    document.getElementById('modal-toc').style.display='flex'; 
}

function closeTocModal() { 
    document.getElementById('modal-toc').style.display='none'; 
}

function suggestTOCStructure() {
    streamTarget = "modal_split"; 
    accumulatedText = "";
    document.getElementById('toc-structure').value = "";
    document.getElementById('toc-context').value = "";
    
    const pName = document.getElementById('ws-p-name').value;
    window.api.sendMessage(`For project "${pName}", generate: 1. Project Summary ||| 2. Numbered BRD Headings. Separate with "|||".`);
}

function generateFullBRDFromTOC() {
    const struct = document.getElementById('toc-structure').value;
    const context = document.getElementById('toc-context').value;
    const persona = document.getElementById('toc-persona-editor').innerHTML;
    if(!struct && !context) return;
    closeTocModal();
    streamTarget = "editor";
    document.getElementById('brd-editor').innerHTML = "";
    accumulatedText = "";
    window.api.sendMessage(`Generate BRD. Structure: ${struct}. Summary: ${context}. Persona: ${persona}. Use ### headers.`);
}

function handleAgentStream(chunk) {
    if (streamTarget === 'modal_split') {
        accumulatedText += chunk;
        const parts = accumulatedText.split("|||");
        if (parts[0]) document.getElementById('toc-context').value = parts[0].trim();
        if (parts.length > 1) document.getElementById('toc-structure').value = parts[1].trim();
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
    cont.innerHTML = Array.from(headers).map((h, i) => {
        if(!h.id) h.id = "h" + i;
        return `<div class="toc-item" onclick="document.getElementById('${h.id}').scrollIntoView()">${h.innerText}</div>`;
    }).join('');
}

function saveBRD() {
    const blob = new Blob([`<html><body>${document.getElementById('brd-editor').innerHTML}</body></html>`], {type:'application/msword'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = "BRD.doc";
    a.click();
}

function sendToAgent() {
    const val = document.getElementById('agent-input').value;
    if(!val) return;
    document.getElementById('brd-editor').innerHTML += `<div style="background:#E3F2FD;padding:10px;margin:10px 0;"><strong>User:</strong> ${val}</div>`;
    streamTarget = "editor";
    window.api.sendMessage(val);
    document.getElementById('agent-input').value = "";
}

// Global Exports
window.openCreateModal = openCreateModal;
window.closeCreateModal = closeCreateModal;
window.submitCreateProject = submitCreateProject;
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
window.handlePromptFileUpload = handlePromptFileUpload;
window.generateBRDFromPrompts = generateBRDFromPrompts;
window.toggleRightSidebar = toggleRightSidebar;
window.deletePromptFile = deletePromptFile;
window.logout = logout;
