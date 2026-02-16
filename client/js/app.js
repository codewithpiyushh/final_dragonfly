// ==========================================
// 1. STATE MANAGEMENT
// ==========================================
let isLoginMode = true;
let currentUser = null;
let accumulatedText = "";
let streamTarget = "editor"; 
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
// 2. INITIALIZATION (UPDATED: BYPASS AUTH)
// ==========================================
window.addEventListener('DOMContentLoaded', () => {
    // Check for existing user, or create a default one to bypass login
    let storedUser = localStorage.getItem('user');
    
    if (!storedUser) {
        storedUser = "Administrator"; // Default Bypass User
        localStorage.setItem('user', storedUser);
    }
    
    currentUser = storedUser;
    updateUserProfile(currentUser);
    
    // FORCE LANDING PAGE (Dashboard)
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
        // Always show navbar unless explicitly in auth view (which is now hidden)
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

// ==========================================
// 4. AUTHENTICATION
// ==========================================
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
        if (isLoginMode) {
            response = await window.api.login(user, pass);
        } else {
            response = await window.api.register(user, pass);
        }

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
    const title = document.getElementById('auth-title');
    const btn = document.getElementById('auth-btn');
    const toggleText = document.getElementById('auth-toggle-text');
    const link = document.querySelector('.auth-footer a');
    const error = document.getElementById('auth-error');

    title.innerText = isLoginMode ? "Sign In" : "Register";
    btn.innerText = isLoginMode ? "Sign In" : "Register";
    toggleText.innerText = isLoginMode ? "Need an account? " : "Have an account? ";
    link.innerText = isLoginMode ? "Request Access" : "Sign In";
    error.innerText = "";
}

function logout() {
    localStorage.removeItem('user');
    window.location.reload();
}

// ==========================================
// 5. DASHBOARD (PROJECTS)
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
    
    if(!name || !lob || !dept) return;
    
    try {
        await window.api.createProject({
            name: name,
            lob: lob,
            department: dept,
            application: app,
            description: desc,
            owner: currentUser || "System"
        });
        closeCreateModal();
        await loadProjects();
    } catch(e) { 
        console.error("Error: " + e.message); 
    }
}

// ==========================================
// 6. WORKSPACE LOGIC
// ==========================================
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

        // 1. Load Editor Content
        if (project && project.current_content) {
            editor.innerHTML = project.current_content;
        } else {
            editor.innerHTML = `<h1 style="text-align:center;">Business Requirements Document</h1><p style="text-align:center;color:#666;">Draft</p><hr><p>Waiting for requirements...</p>`;
        }

        // 2. Load Prompts (Files)
        if (project && project.prompts) {
            promptFiles = project.prompts;
            ['mom', 'drafts', 'transcripts', 'chats'].forEach(type => {
                updatePromptCardUI(type);
            });
        }

    } catch(e) {
        console.error("Error loading content", e);
        editor.innerHTML = `<p style="color:red">Error loading document.</p>`;
    }
}

// ==========================================
// 7. GUIDED PROMPTS & FILE UPLOAD
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
    document.getElementById('hidden-file-input').value = "";
}

function handlePromptFileUpload(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const reader = new FileReader();
        
        reader.onload = async function(e) {
            const content = e.target.result;
            
            promptFiles[currentUploadType].push({
                name: file.name,
                content: content,
                type: file.type
            });

            updatePromptCardUI(currentUploadType);
            
            // Auto-Save Prompts
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
                <span style="max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${f.name}</span>
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
    let contextMessage = "I have uploaded the following project documents. Please analyze their content below and generate a comprehensive Business Requirements Document (BRD) based SPECIFICALLY on them:\n\n";
    let hasFiles = false;

    for (const [type, files] of Object.entries(promptFiles)) {
        if (files.length > 0) {
            hasFiles = true;
            contextMessage += `--- SECTION: ${type.toUpperCase()} ---\n`;
            files.forEach(f => {
                const safeContent = f.content.length > 10000 ? f.content.substring(0, 10000) + "...[truncated]" : f.content;
                contextMessage += `FILE: ${f.name}\nCONTENT:\n${safeContent}\n\n`;
            });
        }
    }

    if (!hasFiles) return;

    streamTarget = "editor";
    document.getElementById('brd-editor').innerHTML = `<p style="color:#666; font-style:italic;">Reading uploaded documents and generating BRD...</p><br>`;
    accumulatedText = "";
    
    window.api.sendMessage(contextMessage);
}

// ==========================================
// 8. VERSION CONTROL (AUTO-NUMBERED)
// ==========================================
async function saveVersionSnapshot() {
    const pid = document.getElementById('ws-p-id').value;
    const content = document.getElementById('brd-editor').innerHTML;
    
    const pName = document.getElementById('ws-p-name').value;
    const pLob = document.getElementById('ws-p-lob').value;
    const pDept = document.getElementById('ws-p-dept').value;

    let nextVersionNum = 1;
    try {
        const existingVersions = await window.api.getVersions(pid);
        if(existingVersions && existingVersions.length > 0) {
            nextVersionNum = existingVersions.length + 1;
        }
    } catch(e) { console.warn("Version count failed"); }

    const versionName = `Version ${nextVersionNum}`;

    try {
        await window.api.saveVersion({
            projectId: pid, 
            versionName: versionName, 
            content: content,
            projectName: pName, 
            lob: pLob, 
            department: pDept
        });

        await window.api.saveProjectContent(pid, content);
    } catch(e) { console.error("Save failed: " + e.message); }
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
                <button class="btn-sm" style="background:#D32F2F; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer;" onclick="restoreVersionByIndex(${index})">Restore</button>
            </div>
        `).join('');
        
        document.getElementById('modal-versions').style.display='flex';
    } catch (e) { console.error(e); }
}

async function restoreVersionByIndex(index) {
    const content = currentVersionHistory[index].content;
    const editor = document.getElementById('brd-editor');
    editor.innerHTML = content;
    document.getElementById('modal-versions').style.display = 'none';

    const pid = document.getElementById('ws-p-id').value;
    if(pid) await window.api.saveProjectContent(pid, content);
}

// ==========================================
// 9. AGENT & TOC UTILITIES (SPLIT MODE)
// ==========================================
function openTocModal() { 
    // Clear 3 columns
    document.getElementById('toc-structure').value = ""; // Column 1
    document.getElementById('toc-context').value = "";   // Column 2
    document.getElementById('toc-persona-editor').innerHTML = ""; // Column 3

    document.getElementById('modal-toc').style.display='flex'; 
}

function closeTocModal() { 
    document.getElementById('modal-toc').style.display='none'; 
}

// UPDATED: Sets correct target for streaming
function suggestTOCStructure() {
    streamTarget = "modal_split"; // FORCE TARGET TO MODAL
    accumulatedText = "";
    
    document.getElementById('toc-structure').value = "";
    document.getElementById('toc-context').value = "";
    
    const pName = document.getElementById('ws-p-name').value;
    const pLob = document.getElementById('ws-p-lob').value;
    
    // Prompt asking for side-by-side content
    window.api.sendMessage(`For project "${pName}" (LOB: ${pLob}), generate two things:
1. A concise Project Summary/Description (What is this about?).
2. A numbered list of BRD Structure Headings.

You MUST separate them with the string "|||".
Format:
[Project Summary Text]
|||
[List of Headings]`);
}

function generateFullBRDFromTOC() {
    const pName = document.getElementById('ws-p-name').value;
    const pLob = document.getElementById('ws-p-lob').value;
    
    const structure = document.getElementById('toc-structure').value;
    const summary = document.getElementById('toc-context').value;
    const persona = document.getElementById('toc-persona-editor').innerHTML;

    if(!structure && !summary) return;

    closeTocModal();
    streamTarget = "editor"; // SWITCH BACK TO MAIN EDITOR
    document.getElementById('brd-editor').innerHTML = "";
    accumulatedText = "";
    
    const prompt = `Generate a full Business Requirements Document (BRD) for Project "${pName}" (${pLob}) based on:
    
    [REQUIRED STRUCTURE/HEADINGS]
    ${structure}
    
    [PROJECT SUMMARY/CONTEXT]
    ${summary}
    
    [TARGET AUDIENCE/PERSONA]
    ${persona}
    
    Please write the full document content following the structure provided. Use ### for main headers.`;

    window.api.sendMessage(prompt);
}

function sendToAgent() {
    const val = document.getElementById('agent-input').value;
    if(!val) return;
    
    document.getElementById('brd-editor').innerHTML += `<div style="background:#E3F2FD;padding:10px;margin:10px 0;"><strong>User:</strong> ${val}</div>`;
    
    streamTarget = "editor"; // Explicitly set main editor target
    window.api.sendMessage(val);
    document.getElementById('agent-input').value = "";
}

function handleAgentStream(chunk) {
    // Force check: If modal is open, we likely want to fill the modal, unless user explicitly clicked "Send to Agent" from main view.
    // The suggestTOCStructure sets 'modal_split'.
    
    if (streamTarget === 'modal_split') {
        accumulatedText += chunk;
        const parts = accumulatedText.split("|||");
        
        // Fill Summary (Col 2)
        if (parts[0]) {
            document.getElementById('toc-context').value = parts[0].trim();
        }
        // Fill Structure (Col 1) only if separator arrived
        if (parts.length > 1) {
            document.getElementById('toc-structure').value = parts[1].trim();
        }
    } 
    else {
        // Default to Main Editor
        const el = document.getElementById('brd-editor');
        if(el) {
            accumulatedText += chunk;
            let formatted = accumulatedText
                .replace(/\n/g, "<br>")
                .replace(/### (.*?)(<br>|$)/g, "<h3>$1</h3>")
                .replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");
            
            el.innerHTML = formatted;
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
        h += `<div class="toc-item" onclick="document.getElementById('${hd.id}').scrollIntoView()">${hd.innerText}</div>`; 
    });
    
    if(h) cont.innerHTML = h;
}

function saveBRD() {
    const html = `<html><body>${document.getElementById('brd-editor').innerHTML}</body></html>`;
    const url = URL.createObjectURL(new Blob([html], {type:'application/msword'}));
    const a = document.createElement('a');
    a.href=url; a.download="BRD.doc"; a.click();
}

// ==========================================
// 10. EXPORTS (Global Window Binding)
// ==========================================
window.handleAuthAction = handleAuthAction;
window.toggleAuthMode = toggleAuthMode;
window.logout = logout;

// Dashboard
window.openCreateModal = openCreateModal;
window.closeCreateModal = closeCreateModal;
window.submitCreateProject = submitCreateProject;
window.openWorkspace = openWorkspace;
window.closeWorkspace = closeWorkspace;
window.deleteProject = deleteProject;

// Workspace Actions
window.saveBRD = saveBRD;
window.openTocModal = openTocModal;
window.closeTocModal = closeTocModal;
window.suggestTOCStructure = suggestTOCStructure;
window.generateFullBRDFromTOC = generateFullBRDFromTOC;
window.sendToAgent = sendToAgent;

// Versioning
window.openVersionModal = openVersionModal;
window.saveVersionSnapshot = saveVersionSnapshot;
window.restoreVersionByIndex = restoreVersionByIndex;

// Guided Prompts & Sidebar
window.openUploadPrompt = openUploadPrompt;
window.closeUploadPrompt = closeUploadPrompt;
window.handlePromptFileUpload = handlePromptFileUpload;
window.generateBRDFromPrompts = generateBRDFromPrompts;
window.toggleRightSidebar = toggleRightSidebar;
window.deletePromptFile = deletePromptFile;
