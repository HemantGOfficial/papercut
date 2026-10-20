
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";

import {
    getFirestore,
    collection,
    query,
    where,
    getDocs,
    getDoc,
    addDoc,
    deleteDoc,
    doc,
    setDoc,
    serverTimestamp,
    updateDoc
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

/* ==========================================
   1. FIREBASE CONFIGURATION
   Firebase Console se apni config paste karo.
========================================== */

const firebaseConfig = {
    apiKey: "AIzaSyDi79OVkKxDCN5p6AImz-GD_TTjIO8bG3w",
    authDomain: "papercut-2f2e0.firebaseapp.com",
    projectId: "papercut-2f2e0",
    storageBucket: "papercut-2f2e0.firebasestorage.app",
    messagingSenderId: "86722372469",
    appId: "1:86722372469:web:3bd07c5ec87a9b4915293c"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

/* ==========================================
   2. USER CONNECTION

   Apne login system mein successful login ke
   baad current user's ID yahan expected key
   ke naam se available karna hoga.

   IMPORTANT: localStorage wala ID secure
   authentication ka replacement nahi hai.
========================================== */

const currentUserId =
    localStorage.getItem("userId") ||
    localStorage.getItem("papercutUserId") ||
    "";

const currentUsername =
    localStorage.getItem("papercutUsername") ||
    localStorage.getItem("username") ||
    "Writer";

/* ==========================================
   3. PAGE ELEMENTS
========================================== */

const projectsGrid = document.getElementById("projectsGrid");
const loadingState = document.getElementById("loadingState");
const emptyState = document.getElementById("emptyState");
const errorState = document.getElementById("errorState");
const noResultsState = document.getElementById("noResultsState");

const searchInput = document.getElementById("searchInput");
const sortSelect = document.getElementById("sortSelect");

const newProjectModal = document.getElementById("newProjectModal");
const deleteProjectModal = document.getElementById("deleteProjectModal");
const shareProjectModal = document.getElementById("shareProjectModal");
const groupManagerModal = document.getElementById("groupManagerModal");
const moveProjectModal = document.getElementById("moveProjectModal");
const openSharedProjectModal = document.getElementById("openSharedProjectModal");
const projectGroupsSection = document.getElementById("projectGroupsSection");
const ungroupedSection = document.getElementById("ungroupedSection");
const ungroupedGrid = document.getElementById("ungroupedGrid");
const groupNameInput = document.getElementById("groupNameInput");
const createGroupForm = document.getElementById("createGroupForm");
const groupManagerList = document.getElementById("groupManagerList");
const moveGroupSelect = document.getElementById("moveGroupSelect");

const newProjectForm = document.getElementById("newProjectForm");
const projectTitleInput = document.getElementById("projectTitle");
const projectTypeInput = document.getElementById("projectType");
const connectStorySelect = document.getElementById("connectStorySelect");
const connectScreenplaySelect = document.getElementById("connectScreenplaySelect");

const totalProjectsElement = document.getElementById("totalProjects");
const projectCountElement = document.getElementById("projectCount");
const libraryCountElement = document.getElementById("libraryCount");
const totalWordsElement = document.getElementById("totalWords");
const lastEditedElement = document.getElementById("lastEdited");
const footerCountElement = document.getElementById("footerCount");

const toastElement = document.getElementById("toast");

let allProjects = [];
let projectToDelete = null;
let activeShareProject = null;
let selectedShareUsers = [];
let searchedShareUser = null;
let projectGroups = [];
let projectToMove = null;
let toastTimeout = null;


async function getUserAccountData(userId) {
    if (!userId) {
        throw new Error("User ID nahi mili.");
    }

    const userRef = doc(db, "users", userId);
    const userSnapshot = await getDoc(userRef);

    if (!userSnapshot.exists()) {
        throw new Error("Is userId ka account nahi mila.");
    }

    const accountData = userSnapshot.data();

    // Password hash ko variables mein expose nahi karna.
    const {
        password,
        ...userData
    } = accountData;

    return userData;
}


async function loadCurrentUser() {
    const userId = localStorage.getItem("userId");

    if (!userId) {
        console.error("User login nahi hai ya userId missing hai.");
        return;
    }

    try {
        const userData = await getUserAccountData(userId);

        // Account data ko variables mein store karo.
        const currentUserId = userData.userId;
        const username = userData.username;
        const email = userData.email;
        const createdAt = userData.createdAt;

        // Poora available account data.
        console.log("Complete account data:", userData);

        // Individual variables.
        // console.log(currentUserId, username, email, createdAt);
        document.getElementById('username-space').innerHTML = username + "'s";

        return {
            userId: currentUserId,
            username,
            email,
            createdAt,
            userData
        };
    } catch (error) {
        console.error("Account data load nahi hua:", error);
    }
}

const currentAccount = await loadCurrentUser();

/* ==========================================
   4. HELPER FUNCTIONS
========================================== */

function showToast(message) {
    toastElement.textContent = message;
    toastElement.classList.add("show");

    clearTimeout(toastTimeout);

    toastTimeout = setTimeout(() => {
        toastElement.classList.remove("show");
    }, 3200);
}

function openModal(modal) {
    modal.classList.remove("hidden");
}

function closeModal(modal) {
    modal.classList.add("hidden");
}

function getTimestamp(value) {
    if (!value) return 0;

    if (typeof value.toMillis === "function") {
        return value.toMillis();
    }

    if (value instanceof Date) {
        return value.getTime();
    }

    if (typeof value === "number") {
        return value;
    }

    return 0;
}

function formatDate(value) {
    const timestamp = getTimestamp(value);

    if (!timestamp) {
        return "Just created";
    }

    const date = new Date(timestamp);
    const now = new Date();

    const difference = Math.max(0, now.getTime() - timestamp);
    const minutes = Math.floor(difference / 60000);
    const hours = Math.floor(difference / 3600000);
    const days = Math.floor(difference / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days} days ago`;

    return date.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric"
    });
}

function escapeHTML(value = "") {
    return String(value).replace(/[&<>"']/g, character => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
}

function getWordCount(content = "") {
    const trimmed = String(content).trim();

    return trimmed ? trimmed.split(/\s+/).length : 0;
}

function getPreview(content = "") {
    const text = String(content)
        .replace(/\r/g, "")
        .split("\n")
        .map(line => line.trim())
        .find(line => line.length > 0);

    return text || "FADE IN:";
}

function getProjectCoverClass(index) {
    return `cover-${index % 4}`;
}

function getProjectDocument(projectId) {
    return doc(db, "projects", projectId);
}

function setButtonLoading(button, isLoading, loadingText = "Please wait...") {
    if (isLoading) {
        button.dataset.originalText = button.textContent;
        button.textContent = loadingText;
        button.disabled = true;
    } else {
        button.textContent =
            button.dataset.originalText || button.textContent;
        button.disabled = false;
        delete button.dataset.originalText;
    }
}

function showPageError(message) {
    loadingState.classList.add("hidden");
    emptyState.classList.add("hidden");
    noResultsState.classList.add("hidden");
    projectsGrid.innerHTML = "";

    document.getElementById("errorText").textContent = message;
    errorState.classList.remove("hidden");
}

/* ==========================================
   5. INITIAL PAGE SETUP
========================================== */

document.getElementById("profileAvatar").textContent =
    currentUsername.trim().charAt(0).toUpperCase() || "P";

function requireUser() {
    if (!currentUserId) {
        showPageError(
            "No user ID was found. Connect your login page to this dashboard before loading projects."
        );

        return false;
    }

    return true;
}

/* ==========================================
   6. LOAD PROJECTS FROM FIRESTORE

   Expected collection:
   projects

   Expected fields:
   ownerId: string
   title: string
   content: string
   updatedAt: timestamp
   createdAt: timestamp (recommended)
   type: string (optional)
========================================== */

async function loadProjects() {
    if (!requireUser()) return;

    loadingState.classList.remove("hidden");
    errorState.classList.add("hidden");
    emptyState.classList.add("hidden");
    noResultsState.classList.add("hidden");
    projectsGrid.innerHTML = "";

    try {
        const projectDocs = new Map();
        for (const field of ["ownerId", "userId"]) {
            try {
                const snapshot = await getDocs(query(collection(db, "projects"), where(field, "==", currentUserId)));
                snapshot.docs.forEach(d => projectDocs.set(d.id, d));
            } catch (queryError) { console.warn("Project query by " + field + " was not available.", queryError); }
        }
        allProjects = [...projectDocs.values()].map(documentSnapshot => ({ ...documentSnapshot.data(), id: documentSnapshot.id, sourceCollection: "projects", ownerId: documentSnapshot.data().ownerId || documentSnapshot.data().userId }));
        // Story plans live in their own Firestore collection. Keep this query
        // independent from screenplay loading: a missing/locked stories
        // collection must never prevent the user's existing screenplays loading.
        const storyDocs = new Map();
        for (const field of ["ownerId", "userId"]) {
            try {
                const snapshot = await getDocs(
                    query(collection(db, "stories"), where(field, "==", currentUserId))
                );
                snapshot.docs.forEach(d => storyDocs.set(d.id, d));
            } catch (queryError) {
                // Firestore may reject a legacy-field query if rules/schema do
                // not support it. Continue loading other project documents.
                console.warn("Story query by " + field + " was not available.", queryError);
            }
        }

        const storyDocuments = [...storyDocs.values()];
        const storyProjects = storyDocuments.map(d => {
            const data = d.data();
            return {
                ...data,
                id: d.id,
                storyId: d.id,
                sourceCollection: "stories",
                type: "story",
                title: String(data.title || "").trim() || "Untitled story",
                content: data.synopsis || data.logline || "Story plan",
                ownerId: data.ownerId || data.userId || ""
            };
        });
        allProjects = allProjects.concat(storyProjects);

        if (connectStorySelect) {
            connectStorySelect.replaceChildren(new Option("No story connected", ""));
            storyDocuments.forEach(d => {
                const data = d.data();
                connectStorySelect.add(new Option(data.title || "Untitled story", d.id));
            });
            if (!storyDocuments.length) {
                const option = new Option("Create a story first to connect it", "__none__");
                option.disabled = true;
                connectStorySelect.add(option);
            }
        }
        if (connectScreenplaySelect) {
            connectScreenplaySelect.replaceChildren(new Option("No screenplay connected", ""));
            allProjects.filter(p => (p.type || "screenplay") !== "story").forEach(p => connectScreenplaySelect.add(new Option(p.title || "Untitled screenplay", p.id)));
        }
        // Project collections are stored independently so an empty group still exists.
        const groupDocs = new Map();
        for (const field of ["ownerId", "userId"]) {
            try {
                const snapshot = await getDocs(query(collection(db, "projectGroups"), where(field, "==", currentUserId)));
                snapshot.docs.forEach(d => groupDocs.set(d.id, d));
            } catch (queryError) {
                console.warn("Project group query by " + field + " was not available.", queryError);
            }
        }
        projectGroups = [...groupDocs.values()].map(d => ({ ...d.data(), id: d.id, name: String(d.data().name || "Untitled group") }));

        loadingState.classList.add("hidden");

        updateStatistics();
        renderProjects();
        renderGroupManager();

    } catch (error) {
        console.error("Could not load projects:", error);

        showPageError(
            "Projects could not be loaded. Check your Firebase configuration, Firestore permissions, and internet connection."
        );
    }
}

/* ==========================================
   7. UPDATE STATISTICS
========================================== */

function updateStatistics() {
    const count = allProjects.length;

    const totalWords = allProjects.reduce((total, project) => {
        return total + getWordCount(project.content || "");
    }, 0);

    totalProjectsElement.textContent = count;
    projectCountElement.textContent = count;
    libraryCountElement.textContent = `(${count})`;
    totalWordsElement.textContent = totalWords.toLocaleString("en-IN");

    const latestProject = [...allProjects].sort((a, b) => {
        return getTimestamp(b.updatedAt) - getTimestamp(a.updatedAt);
    })[0];

    lastEditedElement.textContent = latestProject
        ? formatDate(latestProject.updatedAt)
        : "Nothing yet";
}

/* ==========================================
   8. SEARCH AND SORT
========================================== */

function getVisibleProjects() {
    const searchTerm = searchInput.value.trim().toLowerCase();
    const sortMode = sortSelect.value;

    let projects = allProjects.filter(project => {
        const title = String(project.title || "").toLowerCase();
        const type = String(project.type || "").toLowerCase();
        const content = String(project.content || "").toLowerCase();

        return (
            title.includes(searchTerm) ||
            type.includes(searchTerm) ||
            content.includes(searchTerm)
        );
    });

    projects.sort((a, b) => {
        if (sortMode === "az") {
            return String(a.title || "").localeCompare(String(b.title || ""));
        }

        if (sortMode === "za") {
            return String(b.title || "").localeCompare(String(a.title || ""));
        }

        if (sortMode === "created") {
            return getTimestamp(b.createdAt) - getTimestamp(a.createdAt);
        }

        return getTimestamp(b.updatedAt) - getTimestamp(a.updatedAt);
    });

    return projects;
}

/* ==========================================
   9. RENDER PROJECT CARDS
========================================== */

function renderProjectCards(projects, targetGrid, indexOffset = 0) {
    targetGrid.innerHTML = "";
    projects.forEach((project, index) => {
        const card = document.createElement("article");
        card.className = "project-card";
        card.style.animationDelay = `${Math.min((index + indexOffset) * 35, 250)}ms`;
        const title = escapeHTML(project.title || "Untitled Project");
        const type = escapeHTML((project.type || "Screenplay").toLowerCase() === "story" ? "Story Plan" : "Screenplay");
        const preview = escapeHTML(getPreview(project.content || ""));
        const updatedDate = escapeHTML(formatDate(project.updatedAt));
        const wordCount = getWordCount(project.content || "");
        const coverClass = getProjectCoverClass(index + indexOffset);
        const group = projectGroups.find(item => item.id === project.groupId);
        const groupBadge = group ? `<span class="project-group-badge">▦ ${escapeHTML(group.name)}</span>` : "";
        card.innerHTML = `
            <div class="project-cover ${coverClass}">
                <div class="cover-label">PAPERCUT / DRAFT</div><div class="cover-type">${type}</div>
                <div class="cover-lines"><span></span><span></span><span></span></div><div class="cover-watermark">P</div>
            </div>
            <div class="project-card-body">
                <div class="project-title-row"><h3 class="project-title">${title}</h3>
                    <div class="card-menu-wrap">
                        <button class="card-menu-btn" type="button" data-action="menu" data-id="${escapeHTML(project.id)}" aria-label="Project options" aria-expanded="false">⋯</button>
                        <div class="card-menu hidden">
                            <button type="button" data-action="open" data-id="${escapeHTML(project.id)}">Open project ↗</button>
                            <button type="button" data-action="move-group" data-id="${escapeHTML(project.id)}">${group ? "Move / ungroup…" : "Add to group…"}</button>
                            ${(project.type || "screenplay").toLowerCase() !== "story" && project.sourceCollection !== "stories" ? `<button type="button" data-action="share" data-id="${escapeHTML(project.id)}">Share access…</button>` : ""}
                            <button type="button" class="menu-delete" data-action="delete" data-id="${escapeHTML(project.id)}">Delete project</button>
                        </div>
                    </div>
                </div>
                ${groupBadge}
                <p class="project-preview">${preview}</p>
                <div class="project-meta"><span>◷ ${updatedDate}</span><span>${wordCount.toLocaleString("en-IN")} words</span></div>
                <button class="open-project-btn" type="button" data-action="open" data-id="${escapeHTML(project.id)}">Open ${type.toLowerCase()} ↗</button>
            </div>`;
        targetGrid.appendChild(card);
    });
}

function renderProjects() {
    const projects = getVisibleProjects();
    projectsGrid.innerHTML = "";
    if (ungroupedGrid) ungroupedGrid.innerHTML = "";
    if (projectGroupsSection) projectGroupsSection.innerHTML = "";
    emptyState.classList.add("hidden");
    noResultsState.classList.add("hidden");

    if (allProjects.length === 0) {
        emptyState.classList.remove("hidden");
        projectGroupsSection?.classList.add("hidden");
        ungroupedSection?.classList.add("hidden");
        footerCountElement.textContent = "Showing 0 projects";
        return;
    }
    if (projects.length === 0) {
        noResultsState.classList.remove("hidden");
        projectGroupsSection?.classList.add("hidden");
        ungroupedSection?.classList.add("hidden");
        footerCountElement.textContent = "Showing 0 matching projects";
        return;
    }

    const groupedSections = projectGroups.map(group => ({
        group,
        projects: projects.filter(project => project.groupId === group.id)
    })).filter(section => section.projects.length > 0 || !searchInput.value.trim());
    const groupedIds = new Set(projectGroups.map(group => group.id));
    const ungrouped = projects.filter(project => !project.groupId || !groupedIds.has(project.groupId));

    if (projectGroupsSection) {
        projectGroupsSection.classList.toggle("hidden", groupedSections.length === 0);
        groupedSections.forEach(({ group, projects: groupProjects }, index) => {
            const section = document.createElement("section");
            section.className = "project-group-section";
            const heading = document.createElement("div");
            heading.className = "project-group-heading";
            heading.innerHTML = `<div class="project-group-title-wrap"><span class="group-folder-icon">▦</span><div><h3>${escapeHTML(group.name)}</h3><p>${groupProjects.length} ${groupProjects.length === 1 ? "project" : "projects"}${group.description ? " · " + escapeHTML(group.description) : ""}</p></div></div><div class="group-heading-actions"><button type="button" class="group-action-btn" data-group-action="rename" data-group-id="${escapeHTML(group.id)}">Rename</button><button type="button" class="group-action-btn group-delete-btn" data-group-action="delete" data-group-id="${escapeHTML(group.id)}">Delete group</button></div>`;
            section.appendChild(heading);
            const grid = document.createElement("div");
            grid.className = "projects-grid";
            section.appendChild(grid);
            renderProjectCards(groupProjects, grid, index * 3);
            projectGroupsSection.appendChild(section);
        });
    }

    if (ungroupedSection) {
        ungroupedSection.classList.toggle("hidden", ungrouped.length === 0);
        const ungroupedHeading = ungroupedSection.querySelector(".ungrouped-heading-count");
        if (ungroupedHeading) ungroupedHeading.textContent = `${ungrouped.length}`;
        renderProjectCards(ungrouped, ungroupedGrid);
    } else {
        renderProjectCards(projects, projectsGrid);
    }

    const groupCount = projects.filter(project => project.groupId && groupedIds.has(project.groupId)).length;
    footerCountElement.textContent = `Showing ${projects.length} of ${allProjects.length} projects · ${groupCount} in groups`;
}

function renderGroupManager() {
    if (!groupManagerList) return;
    groupManagerList.innerHTML = "";
    if (!projectGroups.length) {
        groupManagerList.innerHTML = '<p class="groups-empty-note">No groups yet. Create one for a series, season, sequel, or shared universe.</p>';
        return;
    }
    projectGroups.forEach(group => {
        const count = allProjects.filter(project => project.groupId === group.id).length;
        const row = document.createElement("div");
        row.className = "group-manager-row";
        row.innerHTML = `<div class="group-manager-icon">▦</div><div class="group-manager-copy"><strong>${escapeHTML(group.name)}</strong><span>${count} ${count === 1 ? "project" : "projects"}</span></div><button type="button" class="group-action-btn" data-group-action="rename" data-group-id="${escapeHTML(group.id)}">Rename</button><button type="button" class="group-action-btn group-delete-btn" data-group-action="delete" data-group-id="${escapeHTML(group.id)}">Delete</button>`;
        groupManagerList.appendChild(row);
    });
}

async function createProjectGroup(event) {
    event.preventDefault();
    if (!requireUser()) return;
    const name = groupNameInput.value.trim();
    if (!name) return showToast("Enter a name for this group.");
    if (name.length > 70) return showToast("Group name must be 70 characters or fewer.");
    const button = document.getElementById("createGroupSubmit");
    setButtonLoading(button, true, "Creating…");
    try {
        const duplicate = projectGroups.some(group => group.name.trim().toLowerCase() === name.toLowerCase());
        if (duplicate) return showToast("A group with that name already exists.");
        const ref = await addDoc(collection(db, "projectGroups"), { ownerId: currentUserId, userId: currentUserId, name, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        projectGroups.push({ id: ref.id, ownerId: currentUserId, userId: currentUserId, name });
        groupNameInput.value = "";
        renderProjects();
        renderGroupManager();
        showToast(`“${name}” group created.`);
    } catch (error) {
        console.error("Group creation failed:", error);
        showToast("Could not create group. Check Firestore rules for projectGroups.");
    } finally {
        setButtonLoading(button, false);
    }
}

function openMoveProjectModal(projectId) {
    const project = allProjects.find(item => item.id === projectId);
    if (!project) return showToast("Project not found.");
    projectToMove = project;
    document.getElementById("moveProjectName").textContent = project.title || "Untitled project";
    moveGroupSelect.replaceChildren(new Option("Keep in All Projects (ungrouped)", ""));
    projectGroups.forEach(group => moveGroupSelect.add(new Option(group.name, group.id)));
    moveGroupSelect.value = project.groupId || "";
    openModal(moveProjectModal);
}

async function saveProjectGroup() {
    if (!projectToMove || !requireUser()) return;
    const project = projectToMove;
    const groupId = moveGroupSelect.value || "";
    const group = projectGroups.find(item => item.id === groupId);
    const button = document.getElementById("saveMoveGroupBtn");
    setButtonLoading(button, true, "Saving…");
    try {
        const collectionName = project.sourceCollection === "stories" ? "stories" : "projects";
        const ref = doc(db, collectionName, project.id);
        const snapshot = await getDoc(ref);
        if (!snapshot.exists()) throw new Error("Project no longer exists.");
        const data = snapshot.data();
        if ((data.ownerId || data.userId) !== currentUserId) throw new Error("This project does not belong to this user.");
        await updateDoc(ref, { groupId, groupName: group?.name || "", updatedAt: serverTimestamp() });
        project.groupId = groupId;
        project.groupName = group?.name || "";
        project.updatedAt = new Date();
        closeModal(moveProjectModal);
        projectToMove = null;
        renderProjects();
        updateStatistics();
        showToast(group ? `Moved to “${group.name}”.` : "Project removed from its group.");
    } catch (error) {
        console.error("Could not update project group:", error);
        showToast("Could not save group assignment. Check Firestore permissions.");
    } finally {
        setButtonLoading(button, false);
    }
}

async function renameProjectGroup(groupId) {
    const group = projectGroups.find(item => item.id === groupId);
    if (!group) return;
    const nextName = window.prompt("Rename this project group:", group.name);
    if (nextName === null) return;
    const name = nextName.trim();
    if (!name || name.length > 70) return showToast("Enter a group name of 1–70 characters.");
    if (projectGroups.some(item => item.id !== groupId && item.name.toLowerCase() === name.toLowerCase())) return showToast("A group with that name already exists.");
    try {
        await updateDoc(doc(db, "projectGroups", groupId), { name, updatedAt: serverTimestamp() });
        projectGroups = projectGroups.map(item => item.id === groupId ? { ...item, name } : item);
        const affected = allProjects.filter(project => project.groupId === groupId);
        await Promise.all(affected.map(project => updateDoc(doc(db, project.sourceCollection === "stories" ? "stories" : "projects", project.id), { groupName: name })));
        affected.forEach(project => project.groupName = name);
        renderProjects(); renderGroupManager();
        showToast("Group renamed.");
    } catch (error) {
        console.error("Group rename failed:", error);
        showToast("Could not rename group. Check Firestore permissions.");
    }
}

async function deleteProjectGroup(groupId) {
    const group = projectGroups.find(item => item.id === groupId);
    if (!group) return;
    const count = allProjects.filter(project => project.groupId === groupId).length;
    if (!window.confirm(`Delete “${group.name}”? ${count} project(s) will remain in your library but become ungrouped.`)) return;
    try {
        const affected = allProjects.filter(project => project.groupId === groupId);
        await Promise.all(affected.map(project => updateDoc(doc(db, project.sourceCollection === "stories" ? "stories" : "projects", project.id), { groupId: "", groupName: "" })));
        await deleteDoc(doc(db, "projectGroups", groupId));
        affected.forEach(project => { project.groupId = ""; project.groupName = ""; });
        projectGroups = projectGroups.filter(item => item.id !== groupId);
        renderProjects(); renderGroupManager();
        showToast("Group deleted. Projects are still safe in All Projects.");
    } catch (error) {
        console.error("Group deletion failed:", error);
        showToast("Could not delete group. Check Firestore permissions.");
    }
}

/* ==========================================
   10. OPEN A PROJECT IN THE EDITOR

   Editor URL expected:
   editor.html?projectId=FIRESTORE_DOCUMENT_ID

   Your editor must read this parameter and load
   that document before this feature is complete.
========================================== */

function openProject(projectId) {
    const project = allProjects.find(item => item.id === projectId);

    if (!project) {
        showToast("This project could not be found. Refresh the page.");
        return;
    }

    if ((project.type || "screenplay").toLowerCase() === "story") {
        window.location.href = new URL(project.sourceCollection === "projects" ? "story.html?projectId=" + encodeURIComponent(projectId) + "&source=projects" : "story.html?storyId=" + encodeURIComponent(project.storyId || projectId), window.location.href).href;
        return;
    }
    const editorURL = new URL("editor.html", window.location.href);
    editorURL.searchParams.set("projectId", projectId);
    if (project.linkedStoryId) editorURL.searchParams.set("storyId", project.linkedStoryId);
    window.location.href = editorURL.href;
}

/* ==========================================
   11. CREATE A NEW PROJECT
========================================== */

function showNewProjectModal() {
    openModal(newProjectModal);
    projectTitleInput.value = "";

    setTimeout(() => {
        projectTitleInput.focus();
    }, 100);
}

async function createNewProject(event) {
    event.preventDefault();

    if (!requireUser()) return;

    const title = projectTitleInput.value.trim();
    const type = projectTypeInput.value;
    const submitButton = document.getElementById("createProjectSubmit");

    if (title.length < 1) {
        showToast("Please enter a project title.");
        return;
    }

    setButtonLoading(submitButton, true, "Creating...");

    try {
        if (type === "story") {
            const storyData = { ownerId: currentUserId, title, logline: "", synopsis: "", acts: [{id: crypto.randomUUID(), title: "Act 1", story: ""}, {id: crypto.randomUUID(), title: "Act 2", story: ""}, {id: crypto.randomUUID(), title: "Act 3", story: ""}], plotItems: [], connectedScreenplayId: connectScreenplaySelect?.value || "", groupId: "", groupName: "", createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
            const storyRef = await addDoc(collection(db, "stories"), storyData);
            closeModal(newProjectModal);
            window.location.href = new URL("story.html?storyId=" + encodeURIComponent(storyRef.id), window.location.href).href;
            return;
        }
        const newProject = { ownerId: currentUserId, title, type: "screenplay", content: "FADE IN:\n\n", linkedStoryId: connectStorySelect?.value || "", groupId: "", groupName: "", createdAt: serverTimestamp(), updatedAt: serverTimestamp() };
        const documentReference = await addDoc(collection(db, "projects"), newProject);
        closeModal(newProjectModal);
        showToast("Screenplay created. Opening your editor...");
        const editorURL = new URL("editor.html", window.location.href);
        editorURL.searchParams.set("projectId", documentReference.id);
        if (newProject.linkedStoryId) editorURL.searchParams.set("storyId", newProject.linkedStoryId);
        window.location.href = editorURL.href;

    } catch (error) {
        console.error("Project creation failed:", error);

        showToast(
            "Could not create the project. Check Firestore permissions."
        );

    } finally {
        setButtonLoading(submitButton, false);
    }
}

/* ==========================================
   12. DELETE PROJECT
========================================== */

function askToDeleteProject(projectId) {
    const project = allProjects.find(item => item.id === projectId);

    if (!project) {
        showToast("Project not found.");
        return;
    }

    projectToDelete = projectId;

    document.getElementById("deleteProjectName").textContent =
        project.title || "Untitled Project";

    openModal(deleteProjectModal);
}

async function confirmDeleteProject() {
    if (!projectToDelete) return;
    if (!requireUser()) return;

    const deleteButton = document.getElementById("confirmDeleteBtn");
    const projectId = projectToDelete;

    setButtonLoading(deleteButton, true, "Deleting...");

    try {
        /*
         * Re-read the document before deleting.
         * This is a useful consistency check, NOT a
         * replacement for secure Firestore rules.
         */
        const project = allProjects.find(item => item.id === projectId);
        const projectReference = doc(db, project?.sourceCollection === "stories" ? "stories" : "projects", projectId);
        const snapshot = await getDoc(projectReference);

        if (!snapshot.exists()) {
            throw new Error("Project no longer exists.");
        }

        if (snapshot.data().ownerId !== currentUserId) {
            throw new Error("This project does not belong to this user.");
        }

        await deleteDoc(projectReference);

        allProjects = allProjects.filter(project => project.id !== projectId);

        closeModal(deleteProjectModal);
        projectToDelete = null;

        updateStatistics();
        renderProjects();

        showToast("Project deleted.");

    } catch (error) {
        console.error("Project deletion failed:", error);

        showToast(
            "Could not delete the project. Check your Firestore permissions."
        );

    } finally {
        setButtonLoading(deleteButton, false);
    }
}

/* ==========================================
   13. SHARE PROJECT LINK
========================================== */

function shareModeValue() {
    return document.querySelector('input[name="shareMode"]:checked')?.value || "restricted";
}

function makeShareToken() {
    try {
        if (globalThis.crypto?.getRandomValues) {
            const bytes = new Uint8Array(32);
            globalThis.crypto.getRandomValues(bytes);
            return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
        }
    } catch (error) { console.warn("Secure token generation unavailable; using fallback.", error); }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function buildShareURL(project, mode = shareModeValue(), token = project?.shareToken || "") {
    // Keep the current app path but use the active origin. This allows testing on another
    // Live Server port as long as that port serves the same Papercut folder structure.
    const shareURL = new URL("editor.html", window.location.href);
    shareURL.searchParams.set("projectId", project.id);
    if (project.linkedStoryId) shareURL.searchParams.set("storyId", project.linkedStoryId);
    if (mode === "link" && token) shareURL.searchParams.set("shareToken", token);
    else shareURL.searchParams.delete("shareToken");
    return shareURL.href;
}

function renderSelectedShareUsers() {
    const target = document.getElementById("shareSelectedUsers");
    if (!target) return;
    if (!selectedShareUsers.length) {
        target.innerHTML = '<p class="share-user-empty">No additional people selected.</p>';
        return;
    }
    target.innerHTML = selectedShareUsers.map((user, index) => `
      <div class="share-user-row">
        <span class="share-user-meta"><strong>${escapeHTML(user.username || user.displayName || "Papercut user")}</strong><small>${escapeHTML(user.email || "Email unavailable")}</small></span>
        <button type="button" class="secondary-btn" data-remove-share-user="${index}">Remove</button>
      </div>`).join("");
}

function updateShareModeUI() {
    const mode = shareModeValue();
    const selectivePanel = document.getElementById("selectiveSharePanel");
    if (selectivePanel) selectivePanel.hidden = mode !== "selective";
    // Generate the token as soon as link sharing is selected, so the preview/copy URL
    // never silently omits the token. Saving is still required to activate it in Firestore.
    if (mode === "link" && activeShareProject && !activeShareProject.shareToken) {
        activeShareProject.shareToken = makeShareToken();
    }
    const link = document.getElementById("shareLinkInput");
    const hint = document.getElementById("shareLinkHint");
    if (link && activeShareProject) link.value = buildShareURL(activeShareProject, mode, activeShareProject.shareToken || "");
    if (hint) {
        hint.textContent = mode === "link"
            ? "Save sharing settings first to activate this link. After saving, copy it and open it on the other port/account. The target port must serve the same Papercut folder path."
            : mode === "selective"
                ? "Only the owner and the selected Papercut accounts can access this screenplay. Each existing account must have a userDirectory entry."
                : "Restricted: only the project owner can access this screenplay. The link does not grant access.";
    }
}

async function showShareModal(projectId) {
    const project = allProjects.find(item => item.id === projectId);
    if (!project) { showToast("Project not found."); return; }
    if ((project.type || "screenplay").toLowerCase() === "story" || project.sourceCollection === "stories") {
        showToast("Sharing from the editor currently supports screenplays. Story-plan sharing is not enabled yet.");
        return;
    }
    if ((project.ownerId || project.userId) !== currentUserId) {
        showToast("Only the project owner can change sharing settings.");
        return;
    }
    activeShareProject = project;
    try {
        const latest = await getDoc(doc(db, "projects", project.id));
        if (latest.exists()) activeShareProject = { ...project, ...latest.data(), id: project.id };
    } catch (error) { console.warn("Could not refresh share settings", error); }
    selectedShareUsers = Array.isArray(activeShareProject.sharedWith) ? activeShareProject.sharedWith.map(user => ({
        userId: String(user.userId || ""), email: String(user.email || ""), emailLowercase: String(user.emailLowercase || user.email || "").toLowerCase(), username: String(user.username || user.displayName || "Papercut user")
    })) : [];
    searchedShareUser = null;
    document.getElementById("shareUserEmail").value = "";
    document.getElementById("shareSearchStatus").textContent = "Search for an existing Papercut account by its email address.";
    document.getElementById("shareSearchResults").replaceChildren();
    const mode = ["restricted", "selective", "link"].includes(activeShareProject.shareMode) ? activeShareProject.shareMode : "restricted";
    document.querySelectorAll('input[name="shareMode"]').forEach(radio => { radio.checked = radio.value === mode; });
    document.getElementById("shareNote").textContent = `Manage who can access “${activeShareProject.title || "Untitled screenplay"}”.`;
    renderSelectedShareUsers();
    updateShareModeUI();
    openModal(shareProjectModal);
}

async function syncCurrentUserDirectory() {
    const candidateIds = [...new Set([
        localStorage.getItem("userId"),
        localStorage.getItem("papercutUserId"),
        currentUserId
    ].map(value => String(value || "").trim()).filter(Boolean))];
    if (!candidateIds.length) return;
    try {
        let account = null;
        let accountDocId = "";
        for (const candidateId of candidateIds) {
            try {
                const accountSnap = await getDoc(doc(db, "users", candidateId));
                if (accountSnap.exists()) {
                    account = accountSnap.data(); accountDocId = accountSnap.id; break;
                }
            } catch (error) { console.warn("Could not read account document by ID for directory sync.", error); }
            // Older sign-up flows used an auto-generated users document ID while storing the
            // LocalStorage ID in its userId field. Resolve that self-account mismatch safely.
            try {
                const byUserId = await getDocs(query(collection(db, "users"), where("userId", "==", candidateId)));
                if (!byUserId.empty) { const match = byUserId.docs[0]; account = match.data(); accountDocId = match.id; break; }
            } catch (error) { console.warn("Could not resolve legacy account by its userId field.", error); }
        }
        if (!account) {
            console.warn("Could not sync userDirectory: no matching users document was readable. Check the localStorage userId and Firestore rules.");
            return;
        }
        const email = String(account.email || "").trim();
        if (!email) return;
        const canonicalId = String(currentUserId || account.userId || accountDocId).trim();
        if (!canonicalId) return;
        // This directory intentionally contains only searchable profile fields, never passwords.
        const directoryRecord = {
            userId: canonicalId,
            email,
            emailLowercase: email.toLowerCase(),
            username: String(account.username || account.displayName || "Papercut user"),
            updatedAt: serverTimestamp()
        };
        await setDoc(doc(db, "userDirectory", canonicalId), directoryRecord, { merge: true });
        // If an earlier version wrote the entry under the localStorage ID, refresh that too
        // when it differs, so old records can still be found during migration.
        if (accountDocId && accountDocId !== canonicalId) {
            await setDoc(doc(db, "userDirectory", accountDocId), directoryRecord, { merge: true });
        }
    } catch (error) {
        console.warn("Could not update the safe user directory. Check Firestore read/write rules for userDirectory.", error);
    }
}

async function searchShareUser() {
    const enteredEmail = document.getElementById("shareUserEmail").value.trim();
    const email = enteredEmail.toLowerCase();
    const status = document.getElementById("shareSearchStatus");
    const results = document.getElementById("shareSearchResults");
    results.replaceChildren(); searchedShareUser = null;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { status.textContent = "Enter a valid email address."; return; }
    if (email === String(activeShareProject?.ownerEmail || "").trim().toLowerCase()) { status.textContent = "The project owner already has access."; return; }
    status.textContent = "Searching Papercut accounts…";
    try {
        const foundById = new Map();
        const failures = [];
        const collect = snap => snap.docs.forEach(d => foundById.set(d.id, { id: d.id, ...d.data() }));
        // Query the minimal directory first, covering both normalized and legacy email fields.
        for (const [field, value] of [["emailLowercase", email], ["email", email], ["email", enteredEmail]]) {
            try { collect(await getDocs(query(collection(db, "userDirectory"), where(field, "==", value)))); }
            catch (error) { failures.push(error); console.warn("userDirectory lookup failed for " + field, error); }
        }
        // Never query the password-bearing users collection by email. Legacy directory entries
        // are repaired by syncCurrentUserDirectory when that account signs into Projects.
        const found = [...foundById.values()].filter(account => String(account.email || "").trim().toLowerCase() === email);
        const ownIds = new Set([currentUserId, localStorage.getItem("userId") || "", localStorage.getItem("papercutUserId") || ""].filter(Boolean).map(String));
        const account = found.find(item => !ownIds.has(String(item.userId || item.id)) && !ownIds.has(String(item.id)));
        if (!account) {
            if (!found.length && failures.length >= 3) {
                status.textContent = "Email search was blocked by Firestore rules. Check read access for userDirectory; do not make password-bearing users records public.";
                return;
            }
            status.textContent = "No matching account found for this exact email. Ask that account to sign in and open Projects once so its safe userDirectory entry can be repaired, then retry.";
            return;
        }
        const user = { userId: String(account.userId || account.id), email: String(account.email), emailLowercase: email, username: String(account.username || account.displayName || "Papercut user") };
        if (!user.userId) { status.textContent = "This account record is missing its user ID."; return; }
        if (selectedShareUsers.some(item => item.userId === user.userId || item.emailLowercase === email)) { status.textContent = "This user already has access."; return; }
        searchedShareUser = user;
        results.innerHTML = `<div class="share-user-row"><span class="share-user-meta"><strong>${escapeHTML(user.username)}</strong><small>${escapeHTML(user.email)}</small></span><button type="button" class="primary-btn" id="addSearchedShareUserBtn">Add access</button></div>`;
        status.textContent = "Account found. Add this person to the access list.";
        document.getElementById("addSearchedShareUserBtn").addEventListener("click", () => {
            if (!searchedShareUser) return;
            selectedShareUsers.push(searchedShareUser); searchedShareUser = null;
            results.replaceChildren(); status.textContent = "User added to the list. Save sharing settings to apply access.";
            renderSelectedShareUsers();
        });
    } catch (error) {
        console.error("Could not search user accounts", error);
        status.textContent = "User search failed. Open DevTools Console and check Firestore rules/index errors.";
    }
}

async function saveShareSettings() {
    if (!activeShareProject) return;
    const mode = shareModeValue();
    if ((activeShareProject.ownerId || activeShareProject.userId) !== currentUserId) {
        showToast("Only the owner can change sharing settings."); return;
    }
    if (mode === "selective" && !selectedShareUsers.length) {
        showToast("Add at least one user, or choose Restricted."); return;
    }
    const saveButton = document.getElementById("saveShareSettingsBtn");
    saveButton.disabled = true; saveButton.textContent = "Saving…";
    try {
        const token = mode === "link" ? (activeShareProject.shareToken || makeShareToken()) : "";
        const sharedWith = mode === "selective" ? selectedShareUsers.map(user => ({ userId: user.userId, email: user.email, emailLowercase: user.emailLowercase || user.email.toLowerCase(), username: user.username || "Papercut user" })) : [];
        await updateDoc(doc(db, "projects", activeShareProject.id), {
            shareMode: mode,
            sharedWith,
            shareToken: token,
            sharingUpdatedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });
        activeShareProject.shareMode = mode; activeShareProject.sharedWith = sharedWith; activeShareProject.shareToken = token;
        const inLibrary = allProjects.find(item => item.id === activeShareProject.id);
        if (inLibrary) Object.assign(inLibrary, { shareMode: mode, sharedWith, shareToken: token });
        document.getElementById("shareLinkInput").value = buildShareURL(activeShareProject, mode, token);
        updateShareModeUI();
        showToast(mode === "restricted" ? "Project is now restricted to you." : mode === "selective" ? "Selected users can now access the project." : "Anyone with the link can now access the project.");
    } catch (error) {
        console.error("Could not save sharing settings", error);
        showToast("Could not save sharing settings. Check Firestore rules for projects.");
    } finally {
        saveButton.disabled = false; saveButton.textContent = "Save sharing settings";
    }
}

async function copyShareLink() {
    const shareInput = document.getElementById("shareLinkInput");
    const copyButton = document.getElementById("copyShareBtn");

    try {
        await navigator.clipboard.writeText(shareInput.value);
        showToast("Project link copied.");
    } catch (error) {
        // Fallback for browsers where Clipboard API is unavailable.
        shareInput.focus();
        shareInput.select();

        const copied = document.execCommand("copy");

        if (copied) {
            showToast("Project link copied.");
        } else {
            showToast("Select and copy the link manually.");
        }
    }
}

/* ==========================================
   14. PROJECT CARD ACTIONS
========================================== */

document.addEventListener("click", event => {
    const actionButton = event.target.closest("[data-action]");

    if (!actionButton) return;

    const action = actionButton.dataset.action;
    const projectId = actionButton.dataset.id;

    if (action === "menu") {
        const menu = actionButton
            .closest(".card-menu-wrap")
            .querySelector(".card-menu");

        const shouldOpen = menu.classList.contains("hidden");

        // Close other open menus first.
        document.querySelectorAll(".card-menu").forEach(item => {
            item.classList.add("hidden");
        });

        document.querySelectorAll(".card-menu-btn").forEach(item => {
            item.setAttribute("aria-expanded", "false");
        });

        if (shouldOpen) {
            menu.classList.remove("hidden");
            actionButton.setAttribute("aria-expanded", "true");
        }

        return;
    }

    document.querySelectorAll(".card-menu").forEach(menu => {
        menu.classList.add("hidden");
    });

    if (action === "open") {
        openProject(projectId);
    }

    if (action === "share") {
        showShareModal(projectId);
    }

    if (action === "move-group") {
        openMoveProjectModal(projectId);
    }

    if (action === "delete") {
        askToDeleteProject(projectId);
    }
});

document.addEventListener("click", event => {
    if (!event.target.closest(".card-menu-wrap")) {
        document.querySelectorAll(".card-menu").forEach(menu => {
            menu.classList.add("hidden");
        });

        document.querySelectorAll(".card-menu-btn").forEach(button => {
            button.setAttribute("aria-expanded", "false");
        });
    }
});

/* ==========================================
   OPEN A SHARED PROJECT FROM A PASTED LINK
========================================== */
function setSharedLinkStatus(message, kind = "") {
    const status = document.getElementById("sharedProjectLinkStatus");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("error", kind === "error");
    status.classList.toggle("success", kind === "success");
}

function parseSharedProjectLink(rawValue) {
    const raw = String(rawValue || "").trim();
    if (!raw) throw new Error("Paste a project sharing link first.");

    let parsed;
    try {
        // Accept a full URL, or a query string copied from a link.
        if (/(^|[?&])(projectId|id|scriptId|project)=/.test(raw) && !/^https?:\/\//i.test(raw)) {
            parsed = new URLSearchParams(raw.replace(/^.*?\?/, ""));
        } else {
            const url = new URL(raw, window.location.href);
            parsed = url.searchParams;
        }
    } catch {
        throw new Error("That link doesn't look valid. Paste the complete Papercut sharing link.");
    }

    const projectId = parsed.get("projectId") || parsed.get("id") || parsed.get("scriptId") || parsed.get("project");
    const shareToken = parsed.get("shareToken") || "";
    const storyId = parsed.get("storyId") || "";
    if (!projectId) throw new Error("No project ID was found in this link. Copy the link again from the owner's Share dialog.");
    return { projectId, shareToken, storyId };
}

function openSharedProjectDialog() {
    const input = document.getElementById("sharedProjectLinkInput");
    if (input) input.value = "";
    setSharedLinkStatus("Your account must have access to this project, or the link must include a valid sharing token.");
    openModal(openSharedProjectModal);
    window.setTimeout(() => input?.focus(), 40);
}

function openPastedSharedProject() {
    const input = document.getElementById("sharedProjectLinkInput");
    const button = document.getElementById("openSharedProjectSubmit");
    let details;
    try {
        details = parseSharedProjectLink(input?.value);
    } catch (error) {
        setSharedLinkStatus(error.message || "Could not read this sharing link.", "error");
        input?.focus();
        return;
    }

    // Build a destination using THIS app's current host/path. This avoids opening
    // the other person's localhost port (e.g. 5500 vs 5501) or external browser.
    const editorURL = new URL("editor.html", window.location.href);
    editorURL.searchParams.set("projectId", details.projectId);
    if (details.shareToken) editorURL.searchParams.set("shareToken", details.shareToken);
    if (details.storyId) editorURL.searchParams.set("storyId", details.storyId);

    setSharedLinkStatus("Opening the project in this Papercut workspace…", "success");
    if (button) { button.disabled = true; button.textContent = "Opening…"; }
    window.location.assign(editorURL.href);
}

/* ==========================================
   15. EVENT LISTENERS
========================================== */

document.getElementById("newProjectBtn").addEventListener(
    "click",
    showNewProjectModal
);

document.getElementById("emptyNewBtn").addEventListener(
    "click",
    showNewProjectModal
);

document.getElementById("sidebarNewBtn").addEventListener(
    "click",
    showNewProjectModal
);

newProjectForm.addEventListener("submit", createNewProject);

document.getElementById("confirmDeleteBtn").addEventListener(
    "click",
    confirmDeleteProject
);

document.getElementById("copyShareBtn").addEventListener(
    "click",
    copyShareLink
);

document.querySelectorAll('input[name="shareMode"]').forEach(radio => radio.addEventListener("change", updateShareModeUI));
document.getElementById("searchShareUserBtn")?.addEventListener("click", searchShareUser);
document.getElementById("shareUserEmail")?.addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); searchShareUser(); } });
document.getElementById("saveShareSettingsBtn")?.addEventListener("click", saveShareSettings);
document.getElementById("shareSelectedUsers")?.addEventListener("click", event => {
    const button = event.target.closest("[data-remove-share-user]");
    if (!button) return;
    selectedShareUsers.splice(Number(button.dataset.removeShareUser), 1);
    renderSelectedShareUsers();
});

document.getElementById("refreshBtn").addEventListener(
    "click",
    loadProjects
);

document.getElementById("openSharedProjectBtn")?.addEventListener("click", openSharedProjectDialog);
document.getElementById("openSharedProjectSubmit")?.addEventListener("click", openPastedSharedProject);
document.getElementById("sharedProjectLinkInput")?.addEventListener("keydown", event => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") openPastedSharedProject();
});

// Logout clears the custom Papercut session keys and returns to the home page.
document.getElementById("logoutBtn")?.addEventListener("click", () => {
    const confirmed = window.confirm("Log out of Papercut? Your saved projects will stay in your account.");
    if (!confirmed) return;

    ["userId", "papercutUserId", "username", "papercutUsername"].forEach(key => {
        localStorage.removeItem(key);
    });

    window.location.assign("/papercut/index.html");
});

document.getElementById("manageGroupsBtn")?.addEventListener("click", () => {
    renderGroupManager(); openModal(groupManagerModal);
});
document.getElementById("createGroupBtn")?.addEventListener("click", () => {
    renderGroupManager(); openModal(groupManagerModal); groupNameInput?.focus();
});
createGroupForm?.addEventListener("submit", createProjectGroup);
document.getElementById("saveMoveGroupBtn")?.addEventListener("click", saveProjectGroup);
document.addEventListener("click", event => {
    const button = event.target.closest("[data-group-action]");
    if (!button) return;
    const groupId = button.dataset.groupId;
    if (button.dataset.groupAction === "rename") renameProjectGroup(groupId);
    if (button.dataset.groupAction === "delete") deleteProjectGroup(groupId);
});

document.getElementById("retryBtn").addEventListener(
    "click",
    loadProjects
);

searchInput.addEventListener("input", renderProjects);
sortSelect.addEventListener("change", renderProjects);

document.querySelectorAll("[data-close]").forEach(button => {
    button.addEventListener("click", () => {
        const modal = document.getElementById(button.dataset.close);
        closeModal(modal);

        if (modal === deleteProjectModal) {
            projectToDelete = null;
        }
    });
});

document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
    backdrop.addEventListener("click", event => {
        if (event.target === backdrop) {
            closeModal(backdrop);

            if (backdrop === deleteProjectModal) {
                projectToDelete = null;
            }
        }
    });
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        document.querySelectorAll(".modal-backdrop").forEach(modal => {
            closeModal(modal);
        });

        projectToDelete = null;
    }
});

/* ==========================================
   16. START THE PAGE
========================================== */

loadProjects().then(async () => {
    await syncCurrentUserDirectory();
    const shareProjectId = new URLSearchParams(window.location.search).get("shareProjectId");
    if (shareProjectId) showShareModal(shareProjectId);
});

