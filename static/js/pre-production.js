/* Papercut Pre-Production. Use the public Firebase WEB config from your existing project.
   Never place service-account keys/private credentials in browser JavaScript. */
(() => {
  "use strict";
  const firebaseConfig = { apiKey: "AIzaSyDi79OVkKxDCN5p6AImz-GD_TTjIO8bG3w", authDomain: "papercut-2f2e0.firebaseapp.com", projectId: "papercut-2f2e0", storageBucket: "papercut-2f2e0.firebasestorage.app", messagingSenderId: "86722372469", appId: "1:86722372469:web:3bd07c5ec87a9b4915293c" };
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const empty = () => ({ breakdown: [], locations: [], schedule: [], logs: [], props: [], shots: [], callsheet: { shootDate: "", productionDay: "1", generalCall: "07:00", wrapTime: "", locationName: "", address: "", weather: "", scenes: "", castCrew: "", notes: "" } });
  const state = { db: null, ready: false, userId: "", projects: [], project: null, screenplay: null, scenes: [], data: empty(), tab: "overview" };
  const specs = {
    breakdown: { title: "Script breakdown", eyebrow: "01 / PRE-PRODUCTION", desc: "Break scenes into the elements your crew needs to prepare.", key: "breakdown", add: "Add breakdown item", fields: [["scene", "Scene", "sceneSelect"], ["intExt", "INT / EXT", "select", ["INT", "EXT", "INT/EXT", "OTHER"]], ["time", "Time", "select", ["DAY", "NIGHT", "DAWN", "DUSK", "MORNING", "EVENING", "CONTINUOUS", "LATER", "UNKNOWN"]], ["location", "Location", "text"], ["description", "Scene Description", "textarea"], ["characters", "Characters", "text"], ["props", "Props", "text"]] },
    locations: { title: "Location breakdown", eyebrow: "02 / LOCATIONS", desc: "Keep locations, permissions and linked scenes organised.", key: "locations", add: "Add location", fields: [["name", "Location / set name", "text"], ["type", "Type", "select", ["INT", "EXT", "INT/EXT", "Studio", "Other"]], ["address", "Address", "text"], ["mapAddress", "Map location / Google Maps link", "mapInput"], ["scenes", "Linked scenes", "sceneMulti"], ["contact", "Contact person", "text"], ["permission", "Permission", "select", ["Not started", "Requested", "Approved", "Not required"]], ["status", "Readiness", "select", ["To scout", "Scouted", "Booked", "Ready"]], ["notes", "Notes", "text"]] },
    schedule: { title: "Shooting schedule", eyebrow: "03 / SCHEDULING", desc: "Build a practical shooting plan from your linked scenes.", key: "schedule", add: "Add schedule item", fields: [["day", "Shoot day", "number"], ["date", "Date", "date"], ["scene", "Scene", "sceneSelect"], ["location", "Location", "locationSelect"], ["start", "Start time", "text"], ["duration", "Duration (min)", "number"], ["cast", "Cast required", "text"], ["status", "Status", "select", ["Planned", "Confirmed", "Shot", "Moved"]], ["notes", "Notes", "text"]] },
    logs: { title: "Production log sheet", eyebrow: "04 / ON SET", desc: "Record takes, results and continuity notes while shooting.", key: "logs", add: "Add log entry", fields: [["date", "Date", "date"], ["scene", "Scene", "text"], ["shot", "Shot", "text"], ["take", "Take #", "number"], ["camera", "Camera / setup", "text"], ["result", "Take result", "select", ["Print", "Good", "NG", "Wild track", "MOS", "Hold"]], ["sound", "Sound roll / notes", "text"], ["continuity", "Continuity notes", "text"]] },
    props: { title: "Prop list", eyebrow: "06 / ART DEPARTMENT", desc: "Track which props are required for each scene.", key: "props", add: "Add scene props", fields: [["scene", "Scene", "sceneSelect"], ["name", "Props required", "text"], ["source", "Source / supplier", "text"], ["owner", "Responsible person", "text"], ["status", "Status", "select", ["To source", "Requested", "Acquired", "On set", "Returned"]], ["notes", "Notes", "text"]] },
    shots: { title: "Shot list", eyebrow: "07 / CAMERA", desc: "Plan coverage, framing and camera language for every scene.", key: "shots", add: "Add shot", fields: [["scene", "Scene", "text"], ["shotNo", "Shot #", "text"], ["size", "Shot size", "select", ["EWS", "WS", "MWS", "MS", "MCU", "CU", "ECU", "OTS", "POV", "Insert", "Two-shot", "Other"]], ["angle", "Angle", "select", ["Eye level", "High angle", "Low angle", "Bird's-eye", "Worm's-eye", "Dutch", "Other"]], ["movement", "Movement", "select", ["Static", "Pan", "Tilt", "Dolly", "Tracking", "Handheld", "Crane", "Zoom", "Other"]], ["lens", "Lens", "text"], ["description", "Action / framing", "text"], ["equipment", "Equipment", "text"], ["status", "Status", "select", ["Planned", "Ready", "Shot", "Cut"]], ["notes", "Notes", "text"]] }
  };
  const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const mapHref = v => { const q = String(v || "").trim(); if (/^https?:\/\//i.test(q)) return q; return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q) };
  const key = () => `papercut-preproduction:${state.project?.id || "unlinked"}`;
  function toast(msg, type = "") { const e = document.createElement("div"); e.className = "toast " + type; e.textContent = msg; $("#toasts").append(e); setTimeout(() => e.remove(), 4300) }
  function status(msg, type = "") { $("#syncStatus").textContent = msg; $("#dot").className = "dot " + type; $("#settingsStatus").textContent = msg }
  function saveLabel(msg, ok = false) { $("#saveState").textContent = msg; $("#saveState").style.color = ok ? "#82d8a8" : "" }
  function configured() { return firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("PASTE_") && firebaseConfig.projectId && !firebaseConfig.projectId.startsWith("PASTE_") && firebaseConfig.appId && !firebaseConfig.appId.startsWith("PASTE_") }
  function initFirebase() { if (!configured()) { status("Firebase config needed"); $("#connectionHint").textContent = "Add your Firebase web config in pre-production.js."; return } try { if (!window.firebase) throw Error("Firebase SDK did not load. Check internet access."); const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(firebaseConfig); state.db = app.firestore(); state.ready = true; status("Firebase connected", "good"); $("#connectionHint").textContent = "Connected to configured Firebase project." } catch (e) { status("Firebase connection error", "bad"); $("#connectionHint").textContent = e.message } }
  function localLoad() { try { state.data = { ...empty(), ...JSON.parse(localStorage.getItem(key()) || "{}") } } catch { state.data = empty() } counts() }
  function counts() { ["breakdown", "locations", "schedule", "logs", "props", "shots"].forEach(k => { const e = $("#count-" + k); if (e) e.textContent = (state.data[k] || []).length }) }
  function labels() { $("#activeProjectName").textContent = state.project?.title || "No screenplay linked" }
  function modal(id, open = true) { $("#" + id).hidden = !open }
  function getUserId() { return localStorage.getItem("userId") || localStorage.getItem("papercutUserId") || "" }
  function linkDialog() { state.userId = getUserId(); const account = $("#detectedAccount"); if (account) account.textContent = state.userId ? "Account detected · " + state.userId : "No logged-in account found in localStorage"; $("#projectResults").innerHTML = state.userId ? '<p class="empty">Loading screenplays from your Papercut account…</p>' : '<p class="empty">Log in to Papercut first. No account ID was found in localStorage.</p>'; modal("projectModal"); if (state.userId) findProjects() }
  async function findProjects() { const id = getUserId(); if (!id) { $("#projectResults").innerHTML = '<p class="empty">You are not logged in. Sign in to Papercut, then reopen this page.</p>'; return toast("Papercut login required; no account ID in localStorage.", "error") } if (!state.ready) { $("#projectResults").innerHTML = '<p class="empty">Firebase connection is not ready. Check the connection status below.</p>'; return toast("Firebase connection is not ready.", "error") } const b = $("#findProjectsBtn"); if (b) { b.disabled = true; b.textContent = "Loading…" } try { state.userId = id; const collection = state.db.collection("projects"); let docs = [], queryErrors = []; for (const field of ["ownerId", "userId"]) { try { const snap = await collection.where(field, "==", id).get(); for (const d of snap.docs) { if (!docs.some(x => x.id === d.id)) docs.push({ id: d.id, ...d.data() }) } } catch (e) { queryErrors.push(field + ": " + e.message) } } state.projects = docs.filter(p => p.ownerId === id || p.userId === id); const q = ($("#screenplaySearch")?.value || "").trim().toLowerCase(); const list = state.projects.filter(p => (p.title || "Untitled screenplay").toLowerCase().includes(q)); if (!list.length) { const detail = queryErrors.length ? "Firestore query error: " + queryErrors.join(" | ") : "The query ran but found no project documents whose ownerId or userId exactly matches the logged-in account."; $("#projectResults").innerHTML = `<p class="empty">No screenplays returned. ${esc(detail)}<br><br>Open Papercut Projects in the same browser and confirm the displayed projects belong to this account. If Projects page shows them but this page does not, send me the browser Console error and one project's field names (hide private data).</p>`; return } $("#projectResults").innerHTML = list.map((p) => `<div class="project-result"><div><b>${esc(p.title || "Untitled screenplay")}</b><small>${esc(p.id)} · ${(p.content || p.script || p.fountain || "").length.toLocaleString()} characters</small></div><button class="btn primary" data-pick="${esc(p.id)}">Select</button></div>`).join(""); $$('[data-pick]').forEach(x => x.onclick = () => { const p = state.projects.find(y => y.id === x.dataset.pick); if (p) chooseScreenplay(p) }) } catch (e) { console.error("Pre-Production screenplay load failed:", e); $("#projectResults").innerHTML = `<p class="empty">Could not load screenplays: ${esc(e.message)}. Check the browser Console and Firestore Rules.</p>` } finally { if (b) { b.disabled = false; b.textContent = "Refresh screenplays" } } }
  async function chooseScreenplay(p) {
    if (!state.project?.id) {
      toast("Open this workspace from Projects using its project ID.", "error");
      return;
    }
    if (!state.userId || (p.ownerId || p.userId) !== state.userId) {
      toast("This screenplay does not belong to the signed-in account.", "error");
      return;
    }
    state.screenplay = {
      id: p.id,
      title: p.title || "Untitled screenplay",
      content: String(p.content || p.script || p.fountain || ""),
      userId: state.userId
    };
    state.project.screenplayId = p.id;
    state.project.screenplayTitle = state.screenplay.title;
    state.project.userId = state.userId;
    state.project.ownerId = state.userId;
    try {
      await state.db.collection("preProductionProjects").doc(state.project.id).set({
        ownerId: state.userId,
        userId: state.userId,
        projectId: state.project.id,
        projectTitle: state.project.title,
        title: state.project.title,
        projectType: "pre-production",
        screenplayId: p.id,
        screenplayTitle: state.screenplay.title,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      localStorage.setItem("papercutActivePreProductionProject", JSON.stringify(state.project));
      localStorage.setItem("papercutActiveScreenplay", JSON.stringify(state.screenplay));
      extractScenes();
      labels();
      modal("projectModal", false);
      await cloudLoad();
      render();
      toast("Screenplay linked and saved to Firebase.", "good");
    } catch (e) {
      console.error("Could not link screenplay:", e);
      toast("Could not link screenplay in Firebase: " + e.message, "error");
    }
  }
    async function cloudLoad() {
    if (!state.ready || !state.project?.id) throw new Error("Workspace is not ready.");
    saveLabel("Loading…");
    try {
      const ref = state.db.collection("preProductionProjects").doc(state.project.id);
      const d = await ref.get();
      if (!d.exists) throw new Error("This Pre-Production project no longer exists.");
      const data = d.data() || {};
      if ((data.ownerId || data.userId) !== state.userId) throw new Error("You do not own this Pre-Production project.");
      state.project = {
        ...data,
        id: d.id,
        title: data.projectTitle || data.title || "Untitled Pre-Production",
        userId: data.userId || data.ownerId,
        ownerId: data.ownerId || data.userId
      };
      if (!data.screenplayId) throw new Error("This project has no linked screenplay. Reopen Projects and link a screenplay.");
      const scriptDoc = await state.db.collection("projects").doc(data.screenplayId).get();
      if (!scriptDoc.exists) throw new Error("The linked screenplay could not be found.");
      const scriptData = scriptDoc.data() || {};
      if ((scriptData.ownerId || scriptData.userId) !== state.userId) throw new Error("The linked screenplay does not belong to this account.");
      state.screenplay = {
        id: scriptDoc.id,
        title: scriptData.title || data.screenplayTitle || "Untitled screenplay",
        content: String(scriptData.content || scriptData.script || scriptData.fountain || ""),
        userId: state.userId
      };
      state.data = { ...empty(), ...(data.data || {}) };
      // localStorage is only a best-effort backup; Firebase is the source of truth.
      try {
        localStorage.setItem(key(), JSON.stringify(state.data));
        localStorage.setItem("papercutActivePreProductionProject", JSON.stringify(state.project));
        localStorage.setItem("papercutActiveScreenplay", JSON.stringify(state.screenplay));
      } catch (_) {}
      extractScenes();
      counts();
      labels();
      saveLabel("Synced", true);
      return true;
    } catch (e) {
      saveLabel("Sync failed");
      console.error("Pre-Production cloud load failed:", e);
      throw e;
    }
  }
    let timer;
  function persist() { counts(); try { localStorage.setItem(key(), JSON.stringify(state.data)) } catch { } saveLabel("Saving…"); clearTimeout(timer); timer = setTimeout(cloudSave, 650) }
  async function cloudSave() {
    if (!state.ready || !state.project?.id || !state.userId) {
      saveLabel("Not saved");
      return;
    }
    try {
      const ref = state.db.collection("preProductionProjects").doc(state.project.id);
      const snap = await ref.get();
      if (!snap.exists) throw new Error("Project document does not exist.");
      const existing = snap.data() || {};
      if ((existing.ownerId || existing.userId) !== state.userId) throw new Error("Ownership check failed; save blocked.");
      await ref.set({
        ownerId: state.userId,
        userId: state.userId,
        projectId: state.project.id,
        projectTitle: state.project.title,
        title: state.project.title,
        projectType: "pre-production",
        screenplayId: state.project.screenplayId || "",
        screenplayTitle: state.project.screenplayTitle || "",
        data: state.data,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        schemaVersion: 1
      }, { merge: true });
      saveLabel("Saved to Firebase", true);
    } catch (e) {
      console.error("Pre-Production save failed:", e);
      saveLabel("Save failed");
      toast("Firebase save failed: " + e.message, "error");
    }
  }
    function openTab(tab) { state.tab = tab; render(); window.scrollTo({ top: 0, behavior: "smooth" }) }
  function render() {
    $$(".nav").forEach(b => b.classList.toggle("active", b.dataset.tab === state.tab)); if (state.tab === "overview") { renderOverview(); return } if (state.tab === "callsheet") { renderCall(); return } const s = specs[state.tab]; if (!s) return; const rows = state.data[s.key] || []; $("#content").innerHTML = `<div class="module-head"><div><div class="eyebrow">${s.eyebrow}</div><h1>${s.title}</h1><p>${s.desc}</p></div><div class="module-actions">${["locations", "schedule"].includes(s.key) ? `<button class="btn quiet" id="importScenesBtn">＋ Import scenes</button>` : ""}<button class="btn quiet" id="exportModuleBtn">↗ Export</button><button class="btn primary" id="addBtn">＋ ${s.add}</button></div></div>${state.project ? `<div class="linked">● Linked screenplay <b>${esc(state.project.title)}</b><button class="text-button" id="changeLink">Change</button></div>` : `<div class="warning">↗ <span>No screenplay linked. Drafts stay local until linked.</span><button class="text-button" id="linkNow">Link screenplay</button></div>`}<div class="toolbar"><input class="search" id="search" placeholder="Search ${s.title.toLowerCase()}…"><span class="total" id="total">${rows.length} RECORDS</span></div><div id="records">${recordList(s, rows)}</div><p class="note">AUTOSAVES TO THIS BROWSER · FIREBASE SYNC WHEN CONFIGURED AND LINKED</p>`;
    $("#addBtn").onclick = () => add(s); $("#exportModuleBtn").onclick = () => exportDialog(s, rows); $("#importScenesBtn")?.addEventListener("click", () => importScenes(s)); $("#changeLink")?.addEventListener("click", linkDialog); $("#linkNow")?.addEventListener("click", linkDialog); $("#search").oninput = e => { const q = e.target.value.toLowerCase(), filtered = rows.filter(r => Object.values(r).some(v => String(v ?? "").toLowerCase().includes(q))); $("#records").innerHTML = recordList(s, filtered); bindRecords(s); $("#total").textContent = filtered.length + " RECORDS" }; bindRecords(s)
  }
  function recordList(s, rows) { if (!rows.length) return `<div class="empty-state"><span>✳</span><b>Nothing on the board. Yet.</b><p>Add your first record and start shaping the plan.</p><button class="btn primary" id="emptyAdd">＋ ${s.add}</button></div>`; return `<div class="records">${rows.map((r, i) => `<article class="record"><div class="record-head"><span class="record-no">${String(i + 1).padStart(2, "0")}</span><div class="record-title"><b>${esc(r.item || r.name || r.scene || r.shotNo || "Production record")}</b><small>${esc([r.scene, r.category, r.location, r.date].filter(Boolean).join(" · ") || "Editable production record")}</small></div><button class="delete" data-del="${esc(r.id)}" title="Delete">×</button></div><div class="fields">${s.fields.map(([k, label, type, opts]) => `<label>${label}${type === "sceneMulti" ? `<div class="tag-picker" data-tag-picker="${esc(r.id)}"><select class="location-scene-source" data-record="${esc(r.id)}" data-field="_locationSceneSource"><option value="">Choose location first…</option>${[...new Set([...state.scenes.map(sc => sc.location).filter(Boolean), ...state.data.locations.map(loc => loc.name).filter(Boolean)])].map(name => `<option value="${esc(name)}" ${(r._sceneLocation || r.name) === name ? "selected" : ""}>${esc(name)}</option>`).join("")}</select><details class="check-dropdown"><summary>Choose linked scenes <span>${String(r[k] || "").split(/[,;]+/).filter(x => x.trim()).length} selected</span></summary><div class="check-options">${state.scenes.filter(sc => r._sceneLocation && String(sc.location || "").trim().toLowerCase() === String(r._sceneLocation).trim().toLowerCase()).map(sc => { const selected = String(r[k] || "").split(/[,;]+/).map(x => x.trim()).includes(sc.scene); return `<label class="check-option"><input type="checkbox" data-scene-check="${esc(r.id)}" value="${esc(sc.scene)}" ${selected ? "checked" : ""}><span>${esc(sc.scene + " · " + sc.heading)}</span></label>` }).join("") || '<small>No scenes match this location. Link a screenplay or choose another location.</small>'}</div></details><div class="selected-tags">${String(r[k] || "").split(/[,;]+/).map(x => x.trim()).filter(Boolean).map(n => `<button type="button" class="scene-tag" data-remove-scene="${esc(r.id)}" data-scene="${esc(n)}">${esc(n)} ×</button>`).join("")}</div><small class="field-help">Choose a location, then check/uncheck scenes. Selected scenes appear as removable tags.</small></div>` : type === "mapInput" ? `<div class="map-input-wrap"><input type="text" data-record="${esc(r.id)}" data-field="${k}" value="${esc(r[k] || "")}" placeholder="Paste map link or landmark / coordinates"><a class="map-open" href="${esc(mapHref(r[k] || r.address || ""))}" target="_blank" rel="noopener">Open map ↗</a></div>` : type === "locationSelect" ? `<select data-record="${esc(r.id)}" data-field="${k}"><option value="">Choose location…</option>${[...new Map([...state.data.locations.map(loc => loc.name), ...state.scenes.map(sc => sc.location)].filter(Boolean).map(name => [String(name).trim().toLowerCase(), String(name).trim()])).values()].map(name => `<option value="${esc(name)}" ${String(r[k] || "").toLowerCase() === name.toLowerCase() ? "selected" : ""}>${esc(name)}</option>`).join("")}</select>` : type === "sceneSelect" ? `<select data-record="${esc(r.id)}" data-field="${k}"><option value="">Choose screenplay scene…</option>${state.scenes.map(sc => `<option value="${esc(sc.scene)}" ${r[k] === sc.scene ? "selected" : ""}>${esc(sc.scene + " · " + sc.heading)}</option>`).join("")}</select>` : type === "select" ? `<select data-record="${esc(r.id)}" data-field="${k}">${opts.map(o => `<option ${r[k] === o ? "selected" : ""}>${esc(o)}</option>`).join("")}</select>` : type === "textarea" ? `<textarea data-record="${esc(r.id)}" data-field="${k}" placeholder="${esc(label)}">${esc(r[k] || "")}</textarea>` : `<input type="${type}" data-record="${esc(r.id)}" data-field="${k}" value="${esc(r[k] || "")}" placeholder="${esc(label)}">`}</label>`).join("")}</div></article>`).join("")}</div>` }
  function add(s) { const r = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) }; s.fields.forEach(([k, , t, opts]) => r[k] = t === "select" ? opts[0] : ""); if (s.key === "locations") { r.scenes = ""; r.mapAddress = ""; r.address = "" } if (s.key === "schedule") { r.day = String(state.data.schedule[0]?.day || "1"); r.location = ""; r.scene = "" } if (s.key === "breakdown") { r.scene = ""; r.intExt = ""; r.time = ""; r.location = ""; r.description = ""; r.characters = ""; r.props = "" } state.data[s.key].unshift(r); persist(); render(); if (s.key === "breakdown") toast("Choose a screenplay scene to fill its heading, time, location and characters. Scene description stays manual."); $(`[data-record="${r.id}"]`)?.focus() }
  function bindRecords(s) {
    $("#emptyAdd")?.addEventListener("click", () => add(s));
    $$('[data-scene-check]').forEach(el => el.addEventListener('change', () => { const r = state.data.locations.find(x => x.id === el.dataset.sceneCheck); if (!r) return; let selected = String(r.scenes || "").split(/[,;]+/).map(x => x.trim()).filter(Boolean); if (el.checked) { if (!selected.includes(el.value)) selected.push(el.value) } else selected = selected.filter(x => x !== el.value); r.scenes = selected.join(", "); persist(); render(); const menu = document.querySelector(`[data-tag-picker="${r.id}"] details`); if (menu) menu.open = true }));
    $$('[data-remove-scene]').forEach(el => el.addEventListener('click', () => { const r = state.data.locations.find(x => x.id === el.dataset.removeScene); if (!r) return; r.scenes = String(r.scenes || "").split(/[,;]+/).map(x => x.trim()).filter(x => x && x !== el.dataset.scene).join(", "); persist(); render(); const menu = document.querySelector(`[data-tag-picker="${r.id}"] details`); if (menu) menu.open = true }));
    $$('[data-field="_locationSceneSource"]').forEach(el => el.addEventListener('change', () => { const r = state.data.locations.find(x => x.id === el.dataset.record); if (!r) return; r._sceneLocation = el.value; const matched = state.scenes.filter(sc => String(sc.location || "").trim().toLowerCase() === String(el.value || "").trim().toLowerCase()).map(sc => sc.scene); r.scenes = matched.join(", "); persist(); render() }));
    $$('[data-field="address"], [data-field="mapAddress"]').forEach(el => el.addEventListener('input', () => { const wrap = el.closest('.map-input-wrap'); const link = wrap?.querySelector('.map-open'); if (link) { const record = state.data[s.key].find(x => x.id === el.dataset.record); link.href = mapHref(el.dataset.field === "mapAddress" ? el.value : (record?.mapAddress || el.value)) } }));
    $$('[data-field]').forEach(el => el.addEventListener('change', () => {
      const r = state.data[s.key].find(x => x.id === el.dataset.record); if (!r) return;
      const field = el.dataset.field;
      r[field] = el.multiple ? [...el.selectedOptions].map(o => o.value).join(", ") : el.value;
      if (s.key === "breakdown" && field === "scene") {
        const sc = state.scenes.find(x => x.scene === el.value);
        if (sc) { r.intExt = sc.intExt; r.time = sc.time; r.location = sc.location; r.description = ""; r.characters = sc.characters.join(", "); r.props = sc.props.join(", "); persist(); render(); return }
      }
      if (s.key === "schedule" && field === "scene") {
        const sc = state.scenes.find(x => x.scene === el.value);
        if (sc) {
          const linkedLoc = state.data.locations.find(loc => String(loc.scenes || "").split(/[,;]+/).map(x => x.trim()).includes(sc.scene));
          r.location = linkedLoc?.name || sc.location || "";
          r.cast = Array.isArray(sc.characters) ? sc.characters.join(", ") : String(sc.characters || "");
          persist(); render(); return;
        }
      }
      if (s.key === "schedule" && field === "location") {
        const chosenLocation = String(r.location || "").trim();
        const locRecord = state.data.locations.find(l => String(l.name || "").trim().toLowerCase() === chosenLocation.toLowerCase());
        const linked = String(locRecord?.scenes || "").split(/[,;]+/).map(x => x.trim()).filter(Boolean);
        const matching = state.scenes.filter(sc => String(sc.location || "").trim().toLowerCase() === chosenLocation.toLowerCase() || linked.includes(sc.scene));
        r.scene = matching.some(sc => sc.scene === r.scene) ? r.scene : (matching[0]?.scene || "");
        const chosen = state.scenes.find(sc => sc.scene === r.scene);
        r.cast = chosen ? (Array.isArray(chosen.characters) ? chosen.characters.join(", ") : String(chosen.characters || "")) : "";
        persist(); render(); return;
      }
      if (s.key === "locations" && field === "name") {
        r._sceneLocation = r.name;
        const matching = state.scenes.filter(sc => String(sc.location || "").trim().toLowerCase() === String(r.name || "").trim().toLowerCase());
        r._sceneLocation = r.name;
        r.scenes = matching.map(sc => sc.scene).join(", ");
        persist(); render(); return;
      }
      persist();
    }));
    $$('[data-del]').forEach(el => el.addEventListener('click', () => { if (confirm('Delete this record?')) { state.data[s.key] = state.data[s.key].filter(r => r.id !== el.dataset.del); persist(); render() } }));
  }
  function renderOverview() { $("#content").innerHTML = `<section class="hero"><div class="hero-copy"><div class="eyebrow">THE WORK BEFORE “ACTION”</div><h1>Make the plan.<br><em>Make the film.</em></h1><p>Your production command centre. Connect an existing Papercut screenplay once, then organise the details that bring it to set.</p><div class="actions"><button class="btn primary" id="linkHero">＋ ${state.project ? "Change screenplay" : "Link a screenplay"}</button><button class="btn outline" id="explore">Explore workspace ↓</button></div></div><div class="art"><div class="slate"><small>SCENE</small><strong>01</strong><span>INT. / NIGHT</span></div></div></section>${state.project ? "" : `<section class="link-banner"><div class="link-icon">↗</div><div class="link-copy"><b>Your screenplay is the source of truth.</b><span>Link an existing Papercut project to start connecting scenes and production records.</span></div><button class="btn outline" id="bannerLink">Choose project</button></section>`}<section class="section-head"><div><div class="eyebrow">YOUR PRODUCTION DESK</div><h2>Everything behind the frame.</h2></div><span>7 connected tools · 1 workspace</span></section><div class="tool-grid">${[["breakdown", "▤", "Script breakdown", "Turn scenes into a practical list of cast, props, wardrobe and more."], ["locations", "⌖", "Location breakdown", "Track sets, addresses, permissions and requirements."], ["schedule", "▦", "Scheduling", "Organise scenes into shooting days."], ["logs", "☷", "Log sheet", "Record takes, notes and continuity details."], ["callsheet", "◷", "Call sheet", "Prepare a daily plan for cast and crew."], ["props", "◇", "Prop list", "Track props, quantities, owners and readiness."], ["shots", "▧", "Shot list", "Plan coverage, movement, framing and references."]].map((x, i) => `<button class="tool-card" data-open="${x[0]}"><div class="tool-icon">${x[1]}</div><b>${x[2]}</b><p>${x[3]}</p><span class="tool-meta">0${i + 1} / PRODUCTION</span></button>`).join("")}</div><footer class="footer"><span>© PAPERCUT STUDIO</span><span>GOOD FILMS ARE MADE TWICE: ON PAPER, THEN ON SET.</span><span>${esc(state.project?.title || "NO PROJECT LINKED").toUpperCase()}</span></footer>`; $("#linkHero").onclick = linkDialog; $("#bannerLink")?.addEventListener("click", linkDialog); $("#explore").onclick = () => $(".section-head").scrollIntoView({ behavior: "smooth" }); $$("[data-open]").forEach(b => b.onclick = () => openTab(b.dataset.open)) }
  function renderCall() {
    const c = state.data.callsheet; const days = [...new Set(state.data.schedule.map(x => String(x.day || "1")).filter(Boolean))].sort((a, b) => Number(a) - Number(b)); if (!days.length) days.push("1"); if (!days.includes(String(c.productionDay || "1"))) days.push(String(c.productionDay || "1")); days.sort((a, b) => Number(a) - Number(b));
    const fields = [["shootDate", "Shoot date", "date"], ["generalCall", "General call time", "text"], ["wrapTime", "Estimated wrap", "text"], ["locationName", "Primary location(s) for this day", "text"], ["address", "Address / meeting point", "text"], ["mapAddress", "Map location / Google Maps link", "mapInput"], ["weather", "Weather / safety notes", "text"], ["scenes", "Scenes scheduled for this day", "textarea"], ["castCrew", "Cast & crew call details", "textarea"], ["notes", "Production notes", "textarea"]];
    const applyDay = () => {
      const day = String(c.productionDay || "1");
      const items = state.data.schedule.filter(x => String(x.day || "1") === day);
      const locs = [...new Set(items.map(x => String(x.location || "").trim()).filter(Boolean))];
      c.locationName = locs.join(", ");
      c.scenes = [...new Set(items.map(x => { const n = String(x.scene || "").trim(); return n ? (/^SC\d+$/i.test(n) ? n : "SC" + n.replace(/^0*/, "").padStart(2, "0")) : "" }).filter(Boolean))].join(", ");
      const locationRecords = locs.map(name => state.data.locations.find(x => String(x.name || "").trim().toLowerCase() === name.toLowerCase())).filter(Boolean);
      c.address = locationRecords.map(x => [x.name, x.address].filter(Boolean).join(" — ")).join("\n");
      c.mapAddress = locs.map(name => { const rec = state.data.locations.find(x => String(x.name || "").trim().toLowerCase() === name.toLowerCase()); return rec?.mapAddress || rec?.map || name }).filter(Boolean).join("\n");
    };
    applyDay(); c._lastProductionDay = String(c.productionDay || "1")
    const scheduleDays = days.map(d => `<option value="${esc(d)}" ${String(c.productionDay || "1") === d ? "selected" : ""}>Day ${esc(d)}</option>`).join("");
    $("#content").innerHTML = `<div class="module-head"><div><div class="eyebrow">05 / DAILY PRODUCTION PLAN</div><h1>Call sheet</h1><p>Choose a production day to pull its scheduled scenes and locations in real time.</p></div><div class="module-actions"><button class="btn quiet" id="exportCall">↗ Export</button><button class="btn primary" id="saveCall">✓ Save call sheet</button></div></div><div class="call-paper"><div class="eyebrow">PAPERCUT PRODUCTION</div><h2>DAILY CALL SHEET</h2><p>${esc(state.project?.title || "Untitled production")}</p><hr><div class="call-fields"><label>Production day<select data-call="productionDay">${scheduleDays}</select></label>${fields.map(([k, l, t]) => `<label>${l}${t === "textarea" ? `<textarea rows="3" data-call="${k}">${esc(c[k] || "")}</textarea>` : t === "mapInput" ? `<div class="map-input-wrap"><input type="text" data-call="${k}" value="" placeholder="Paste map link or landmark / coordinates"><a class="map-open" href="${esc(mapHref(c[k] || c.address || ""))}" target="_blank" rel="noopener">Open map ↗</a></div>` : `<input type="${t}" data-call="${k}" value="${esc(c[k] || "")}" ${k === "generalCall" || k === "wrapTime" ? `placeholder="e.g. 07:00 AM"` : ""}>`}</label>`).join("")}</div><p>PLEASE ARRIVE PREPARED · KEEP THE SET SAFE · RESPECT THE SCHEDULE</p></div>`;
    $$('[data-call]').forEach(el => { el.addEventListener('input', () => { c[el.dataset.call] = el.value; if (el.dataset.call === "address" || el.dataset.call === "mapAddress") { const a = el.parentElement.querySelector('.map-open'); if (a) a.href = mapHref(c.mapAddress || c.address) } if (el.dataset.call !== "productionDay") persist() }); el.addEventListener('change', () => { c[el.dataset.call] = el.value; if (el.dataset.call === "productionDay") { c._lastProductionDay = ""; applyDay(); c._lastProductionDay = String(c.productionDay || "1"); persist(); renderCall() } else persist() }) });
    $("#saveCall").onclick = () => { persist(); toast("Call sheet saved.", "good") }; $("#exportCall").onclick = () => { const fake = { title: "Call sheet", key: "callsheet", fields: [["productionDay", "Production day"], ...[["shootDate", "Shoot date"], ["generalCall", "General call"], ["wrapTime", "Estimated wrap"], ["locationName", "Primary location(s)"], ["address", "Address"], ["mapAddress", "Map location"], ["weather", "Weather / safety notes"], ["scenes", "Scenes scheduled"], ["castCrew", "Cast & crew"], ["notes", "Notes"]].map(([k, l]) => [k, l, "text"])] }; exportDialog(fake, [state.data.callsheet]) }
  }
  function csv(s, rows) { const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`, keys = s.fields.map(x => x[0]), heads = s.fields.map(x => x[1]); download([heads.map(q).join(","), ...rows.map(r => keys.map(k => q(r[k])).join(","))].join("\r\n"), s.key + ".csv", "text/csv;charset=utf-8;") }
  function download(content, name, type) { const u = URL.createObjectURL(new Blob([content], { type })), a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 1000) }
  function exportAll() { if (!state.project) return toast("Link a screenplay first to export its production bundle.", "error"); download(JSON.stringify({ project: state.project, screenplay: state.screenplay, exportedAt: new Date().toISOString(), data: state.data }, null, 2), state.project.title.replace(/[^a-z0-9-_ ]/gi, "").replace(/\s+/g, "-") + "-preproduction.json", "application/json") }
  async function restore() {
    state.userId = getUserId();
    const params = new URLSearchParams(window.location.search);
    const projectId = (params.get("projectId") || "").trim();

    if (!projectId) {
      denyPreProductionAccess("No project ID was provided. Open Pre-Production from the Papercut Projects page.");
      return false;
    }
    if (!state.userId) {
      denyPreProductionAccess("No Papercut account ID was found. Sign in to Papercut, then reopen this project.");
      return false;
    }
    if (!state.ready) {
      denyPreProductionAccess("Firebase could not connect. Check your internet connection and Firebase configuration, then reload.");
      return false;
    }

    try {
      const ref = state.db.collection("preProductionProjects").doc(projectId);
      const snap = await ref.get();
      if (!snap.exists) {
        denyPreProductionAccess("This Pre-Production project was not found.");
        return false;
      }
      const p = snap.data() || {};
      const ownerId = p.ownerId || p.userId;
      if (!ownerId || ownerId !== state.userId) {
        denyPreProductionAccess("Access denied. This project belongs to another account.");
        return false;
      }
      if (!p.screenplayId) {
        denyPreProductionAccess("This project has no linked screenplay. Return to Projects and link a screenplay.");
        return false;
      }

      state.project = {
        ...p,
        id: snap.id,
        title: p.projectTitle || p.title || "Untitled Pre-Production",
        userId: p.userId || ownerId,
        ownerId
      };
      const loaded = await cloudLoad();
      if (!loaded) return false;
      return true;
    } catch (e) {
      console.error("Pre-Production project restore failed:", e);
      denyPreProductionAccess("Could not open this project: " + e.message);
      return false;
    }
  }

  function denyPreProductionAccess(message) {
    document.body.innerHTML = `<main style="min-height:100vh;display:grid;place-items:center;padding:32px;background:#101014;color:#f5f2fa;font:16px/1.6 system-ui,sans-serif"><section style="max-width:560px;text-align:center"><h1 style="font-size:28px">Workspace unavailable</h1><p>${esc(message)}</p><a href="/papercut/projects.html" style="display:inline-block;margin-top:16px;padding:11px 18px;border-radius:8px;background:#d7b8ff;color:#20142b;text-decoration:none;font-weight:700">Back to Projects</a></section></main>`;
  }
    function parseScenes(text) { const lines = String(text || "").replace(/\r/g, "").split("\n"), out = []; let cur = null, action = []; const flush = () => { if (cur) { cur.description = ""; out.push(cur) } action = [] }; for (let i = 0; i < lines.length; i++) { const line = lines[i].trim(); if (/^(INT\.?|EXT\.?|INT\.\/EXT\.?|EXT\.\/INT\.?|I\.E\.)\s+/i.test(line)) { flush(); const m = line.match(/^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|INT\.?|EXT\.?|I\.E\.)\s+(.+?)(?:\s+-\s+|\s+)(DAY|NIGHT|DAWN|DUSK|MORNING|EVENING|CONTINUOUS|LATER|MOMENTS LATER|SAME)(?:\s*#.*)?$/i); let heading = line.replace(/^\.+/, ""); let intExt = "", location = heading, time = "UNKNOWN"; const tm = heading.match(/\s*(?:-\s*|\s+)(DAY|NIGHT|DAWN|DUSK|MORNING|EVENING|CONTINUOUS|LATER|MOMENTS\s+LATER|SAME)\s*$/i); if (tm) { time = tm[1].toUpperCase().replace(/\s+/g, " "); location = heading.slice(0, tm.index).trim() } const im = location.match(/^(INT\.?\/EXT\.?|EXT\.?\/INT\.?|INT\.?|EXT\.?|I\.E\.)\s*/i); if (im) { intExt = im[1].toUpperCase().replace(/\./g, ""); location = location.slice(im[0].length).trim() } cur = { scene: String(out.length + 1).padStart(2, "0"), heading, intExt, time, location, description: "", characters: [], props: [] }; continue } if (!cur) continue; if (!line) continue; if (/^[A-Z][A-Z0-9 .()'’-]{1,35}$/.test(line) && !/^FADE|^CUT|^DISSOLVE|^CONTINUED/.test(line)) { const name = line.replace(/\s*\(.*\)$/, "").trim(); if (!cur.characters.includes(name)) cur.characters.push(name); continue }/* Scene description is intentionally not extracted from screenplay text. */ } flush(); return out.map((x, i) => ({ ...x, scene: String(i + 1).padStart(2, "0") })) }
  function extractScenes() { state.scenes = parseScenes(state.screenplay?.content || ""); if (state.project) state.project.screenplayId = state.screenplay?.id || state.project.screenplayId; }
  function importScenes(s) { if (!state.scenes.length) return toast("Link a screenplay with scene headings first.", "error"); let added = 0; state.scenes.forEach(sc => { if (s.key === "locations") { let loc = state.data.locations.find(x => (x.name || "").toLowerCase() === sc.location.toLowerCase()); if (!loc) { loc = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + added), name: sc.location, type: sc.intExt || "Other", address: "", mapAddress: "", scenes: state.scenes.filter(x => x.location.toLowerCase() === sc.location.toLowerCase()).map(x => x.scene).join(", "), contact: "", permission: "Not started", status: "To scout", notes: "Imported from screenplay" }; state.data.locations.push(loc); added++ } else { const nums = new Set((loc.scenes || "").split(/[,; ]+/).filter(Boolean)); state.scenes.filter(x => x.location.toLowerCase() === sc.location.toLowerCase()).forEach(x => nums.add(x.scene)); loc.scenes = [...nums].join(", ") } } else { if (!state.data.schedule.some(x => x.scene === sc.scene)) { state.data.schedule.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + added), day: "1", date: "", scene: sc.scene, location: sc.location, start: "", duration: "", cast: sc.characters.join(", "), status: "Planned", notes: "Imported from screenplay" }); added++ } } }); persist(); render(); toast(`Imported ${added} ${s.key === "locations" ? "location records" : "scene schedule items"}.`, "good") }
  function exportDialog(s, rows) { const choice = prompt("Export " + s.title + " as: type CSV, Excel, Word, or PDF"); if (!choice) return; const f = choice.trim().toLowerCase(); if (["csv"].includes(f)) return csv(s, rows); if (["excel", "xls", "xlsx"].includes(f)) return exportExcel(s, rows); if (["word", "doc", "docx"].includes(f)) return exportWord(s, rows); if (f === "pdf") return exportPDF(s, rows); toast("Choose CSV, Excel, Word, or PDF.", "error") }
  function exportTable(s, rows) { const esc2 = v => esc(v ?? ""); return `<h1>${esc(s.title)}</h1><p>Production: ${esc(state.project?.title || "Unlinked")} · Screenplay: ${esc(state.project?.screenplayTitle || state.screenplay?.title || "Not linked")} · Exported ${new Date().toLocaleString()}</p><table><thead><tr>${s.fields.map(f => `<th>${esc(f[1])}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${s.fields.map(f => `<td>${esc2(r[f[0]])}</td>`).join("")}</tr>`).join("")}</tbody></table>` }
  function exportExcel(s, rows) { const html = `<html><meta charset="utf-8"><style>body{font-family:Arial}h1{color:#35234f}table{border-collapse:collapse}th{background:#302044;color:white}td,th{border:1px solid #aaa;padding:8px;text-align:left}</style>${exportTable(s, rows)}</html>`; download(html, `${s.key}-breakdown.xls`, "application/vnd.ms-excel;charset=utf-8") }
  function exportWord(s, rows) { const html = `<html><meta charset="utf-8"><style>body{font-family:Arial}h1{font-size:24pt}table{border-collapse:collapse;width:100%}th{background:#ddd}td,th{border:1px solid #777;padding:6px;text-align:left}</style>${exportTable(s, rows)}</html>`; download(html, `${s.key}-report.doc`, `application/msword;charset=utf-8`) }
  function exportPDF(s, rows) { const w = window.open("", "_blank"); if (!w) return toast("Allow pop-ups to print this PDF.", "error"); w.document.write(`<html><head><title>${esc(s.title)}</title><meta charset="utf-8"><style>body{font:12px Arial;margin:28px;color:#222}h1{font-size:24px}p{color:#555}table{border-collapse:collapse;width:100%;font-size:10px}th{background:#e9e3f5}td,th{border:1px solid #999;padding:6px;text-align:left;vertical-align:top}tr{break-inside:avoid}@page{size:A4 landscape;margin:12mm}</style></head><body>${exportTable(s, rows)}<script>window.onload=()=>window.print()<\/script></body></html>`); w.document.close() }

  document.addEventListener("DOMContentLoaded", async () => {
    initFirebase();
    if (!state.ready) {
      denyPreProductionAccess("Firebase could not connect. Check the Firebase SDK scripts, internet connection, and configuration.");
      return;
    }
    const canOpen = await restore();
    if (!canOpen) return;

    $$("[data-tab]").forEach(b => b.addEventListener("click", () => openTab(b.dataset.tab)));
    $("#projectPicker").onclick = linkDialog;
    $("#findProjectsBtn").onclick = findProjects;
    $("#screenplaySearch")?.addEventListener("keydown", e => { if (e.key === "Enter") findProjects() });
    $("#screenplaySearch")?.addEventListener("input", () => {
      clearTimeout(window.__ppSearchTimer);
      window.__ppSearchTimer = setTimeout(findProjects, 180);
    });
    $("#settingsBtn").onclick = () => modal("settingsModal");
    $("#exportBtn").onclick = exportAll;
    $$("[data-close]").forEach(b => b.onclick = () => modal(b.dataset.close, false));
    $$(".backdrop").forEach(b => b.onclick = e => { if (e.target === b) modal(b.id, false) });
    render();
  });
})();
