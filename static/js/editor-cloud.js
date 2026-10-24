import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getFirestore, doc, getDoc, getDocs, collection, query, where, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDi79OVkKxDCN5p6AImz-GD_TTjIO8bG3w",
  authDomain: "papercut-2f2e0.firebaseapp.com",
  projectId: "papercut-2f2e0",
  storageBucket: "papercut-2f2e0.firebasestorage.app",
  messagingSenderId: "86722372469",
  appId: "1:86722372469:web:3bd07c5ec87a9b4915293c"
};
const db = getFirestore(initializeApp(firebaseConfig));
const params = new URLSearchParams(location.search);
const projectId = (params.get('projectId') || params.get('id'));
const incomingShareToken = params.get('shareToken') || '';
const userId = localStorage.getItem('userId') || localStorage.getItem('papercutUserId') || '';
const $ = id => document.getElementById(id);
let project = null;
let linkedStory = null;
let storyList = [];
let saveChain = Promise.resolve();
let currentUserEmail = '';
let canEditProject = false;
let isProjectOwner = false;

function status(message) {
  const el = $('saved');
  if (el) el.textContent = message;
}
function showStory(story) {
  window.papercutStoryData = story || null;
  window.dispatchEvent(new CustomEvent('papercut:story-loaded'));
}
function setStoryPanelLinkControls() {
  const selects = [$('linkStorySelect'), $('linkStorySelectBeats')].filter(Boolean);
  for (const select of selects) {
    const current = select.value;
    select.replaceChildren(new Option('Choose a story to link…', ''));
    storyList.forEach(story => select.add(new Option(story.title || 'Untitled story', story.id)));
    select.value = current || project?.linkedStoryId || '';
  }
}
async function getCurrentUserEmail() {
  if (!userId) return '';
  try {
    const account = await getDoc(doc(db, 'users', userId));
    return account.exists() ? String(account.data().email || '').trim().toLowerCase() : '';
  } catch (error) { console.warn('Could not load account email for sharing check.', error); return ''; }
}
function projectAccessAllowed(data) {
  const ownerId = data.ownerId || data.userId || '';
  if (userId && ownerId === userId) return true;
  const mode = data.shareMode || 'restricted';
  if (mode === 'link' && incomingShareToken && data.shareToken && incomingShareToken === data.shareToken) return true;
  if (mode === 'selective' && userId) {
    const list = Array.isArray(data.sharedWith) ? data.sharedWith : [];
    return list.some(person => String(person.userId || '') === userId || (currentUserEmail && String(person.emailLowercase || person.email || '').trim().toLowerCase() === currentUserEmail));
  }
  return false;
}

async function loadStoryList() {
  const found = new Map();
  for (const field of ['ownerId', 'userId']) {
    try {
      const snap = await getDocs(query(collection(db, 'stories'), where(field, '==', userId)));
      snap.docs.forEach(d => found.set(d.id, { id: d.id, ...d.data() }));
    } catch (error) { console.warn('Story query by ' + field + ' was not available.', error); }
  }
  storyList = [...found.values()];
  setStoryPanelLinkControls();
}
async function loadLinkedStory() {
  const storyId = project?.linkedStoryId || '';
  if (!storyId) {
    linkedStory = null;
    showStory(null);
    return;
  }
  const snap = await getDoc(doc(db, 'stories', storyId));
  if (!snap.exists() || (snap.data().ownerId || snap.data().userId) !== userId) {
    linkedStory = null;
    showStory(null);
    status('Linked story unavailable');
    return;
  }
  linkedStory = { id: snap.id, ...snap.data() };
  if (linkedStory.connectedScreenplayId !== projectId) {
    try { await setDoc(doc(db, 'stories', storyId), { connectedScreenplayId: projectId, updatedAt: serverTimestamp() }, { merge: true }); linkedStory.connectedScreenplayId = projectId; }
    catch (error) { console.warn('Could not synchronize the reverse story link.', error); }
  }
  showStory(linkedStory);
  setStoryPanelLinkControls();
}
async function linkStoryFrom(selectId) {
  const storyId = $(selectId)?.value || '';
  if (!project || (project.ownerId || project.userId) !== userId) return;
  if (!storyId) {
    alert('Choose a story first.');
    return;
  }
  const target = storyList.find(s => s.id === storyId);
  if (!target || (target.ownerId || target.userId) !== userId) {
    alert('You can only link a story owned by your account.');
    return;
  }
  try {
    await setDoc(doc(db, 'projects', projectId), { linkedStoryId: storyId, updatedAt: serverTimestamp() }, { merge: true });
    await setDoc(doc(db, 'stories', storyId), { connectedScreenplayId: projectId, updatedAt: serverTimestamp() }, { merge: true });
    project.linkedStoryId = storyId;
    target.connectedScreenplayId = projectId;
    await loadLinkedStory();
    status('Story linked');
  } catch (error) {
    console.error(error);
    alert('Could not link story. Check Firestore rules for projects and stories.');
  }
}

async function bootCloudEditor() {
  if (!projectId) {
    alert('Open a screenplay from Projects or use a valid shared link.');
    location.replace('../projects/');
    return;
  }
  try {
    if (userId) currentUserEmail = await getCurrentUserEmail();
    const snap = await getDoc(doc(db, 'projects', projectId));
    if (!snap.exists()) {
      alert('This screenplay project does not exist.');
      location.replace('../projects/');
      return;
    }
    project = { id: snap.id, ...snap.data() };
    isProjectOwner = !!userId && (project.ownerId === userId || project.userId === userId);
    canEditProject = projectAccessAllowed(project);
    if (!canEditProject) {
      alert('Access denied. Ask the owner to add your Papercut account or share a valid access link.');
      location.replace(userId ? '../projects/' : '../../login/');
      return;
    }
    if ((project.type || 'screenplay').toLowerCase() === 'story') {
      alert('This is a story plan, not a screenplay. Open it from Projects.');
      location.replace('../projects/');
      return;
    }
    window.dispatchEvent(new CustomEvent('papercut:load-cloud-project', {
      detail: { title: project.title || 'Untitled screenplay', content: typeof project.content === 'string' ? project.content : '' }
    }));
    if (userId) await loadStoryList();
    if (isProjectOwner) await loadLinkedStory();
    else { linkedStory = null; showStory(null); }
    const shareButton = $('shareProjectBtn');
    if (shareButton) { shareButton.onclick = () => { if (!isProjectOwner) { alert('Only the project owner can change sharing settings.'); return; } location.href = `../projects/?shareProjectId=${encodeURIComponent(projectId)}`; }; shareButton.hidden = !isProjectOwner; }
    const plannerButton = $('storyPageBtn');
    if (plannerButton) plannerButton.onclick = () => {
      if (!isProjectOwner) { alert('Only the screenplay owner can open or link its private Story Planner.'); return; }
      location.href = project.linkedStoryId ? `../story/?storyId=${encodeURIComponent(project.linkedStoryId)}` : '../story/';
    };
    status(isProjectOwner ? 'Loaded from Firestore · Owner' : 'Shared project · Changes sync to owner');
    if (!isProjectOwner) {
      const storyButton = $('storyPageBtn');
      if (storyButton) { storyButton.disabled = true; storyButton.title = 'Story Planner is available to the owner only'; }
      const linkButtons = [$('linkStoryBtn'), $('linkStoryBtnBeats'), $('saveEditorStory')].filter(Boolean);
      linkButtons.forEach(button => { button.disabled = true; button.title = 'Only the owner can manage linked story data'; });
    }
  } catch (error) {
    console.error(error);
    status('Cloud load failed');
    alert('Could not load this screenplay from Firestore. Check your connection and Firestore rules.');
  }
}

window.addEventListener('papercut:save-request', event => {
  if (!project || !canEditProject) return;
  const detail = event.detail || {};
  saveChain = saveChain.then(async () => {
    const fresh = await getDoc(doc(db, 'projects', projectId));
    if (!fresh.exists() || !projectAccessAllowed(fresh.data())) {
      canEditProject = false;
      status('Sharing access revoked');
      alert('The owner has changed sharing settings. Your edits can no longer be saved.');
      return;
    }
    await setDoc(doc(db, 'projects', projectId), {
      title: detail.title || project.title || 'Untitled screenplay',
      content: String(detail.content || ''),
      contentFormat: 'fountain',
      type: 'screenplay',
      ownerId: fresh.data().ownerId || fresh.data().userId || userId,
      updatedAt: serverTimestamp()
    }, { merge: true });
    project.title = detail.title || project.title;
    project.content = String(detail.content || '');
    status('Synced to Firestore');
  }).catch(error => {
    console.error('Screenplay cloud save failed:', error);
    status('Cloud save failed');
  });
});
window.addEventListener('papercut:save-story-request', event => {
  const updated = event.detail?.story;
  if (!updated?.id || !project || !isProjectOwner) return;
  saveChain = saveChain.then(async () => {
    const ref = doc(db, 'stories', updated.id);
    const snap = await getDoc(ref);
    if (!snap.exists() || (snap.data().ownerId || snap.data().userId) !== userId) throw new Error('Story owner check failed');
    const payload = { ...updated, updatedAt: serverTimestamp() };
    delete payload.id;
    await setDoc(ref, payload, { merge: true });
    linkedStory = { ...updated };
    showStory(linkedStory);
    status('Story synced');
  }).catch(error => {
    console.error('Story sync failed:', error);
    status('Story sync failed');
  });
});
$('linkStoryBtn')?.addEventListener('click', () => linkStoryFrom('linkStorySelect'));
$('linkStoryBtnBeats')?.addEventListener('click', () => linkStoryFrom('linkStorySelectBeats'));
bootCloudEditor();
