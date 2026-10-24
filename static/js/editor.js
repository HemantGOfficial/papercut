(function () {
    'use strict';
    var T = [
        { id: 'scene', label: 'Scene heading', ph: 'INT. LOCATION - DAY' },
        { id: 'action', label: 'Action', ph: 'Describe what we see' },
        { id: 'character', label: 'Character', ph: 'CHARACTER' },
        { id: 'paren', label: 'Parenthetical', ph: '' },
        { id: 'dialogue', label: 'Dialogue', ph: 'Dialogue' },
        { id: 'transition', label: 'Transition', ph: 'CUT TO:' }
    ];
    var NEXT = { scene: 'action', action: 'action', character: 'dialogue', paren: 'dialogue', dialogue: 'action', transition: 'scene' };
    var W = { scene: 60, action: 60, character: 35, paren: 22, dialogue: 35, transition: 60 };
    var SCN = /^(INT|EXT|EST|INT\.?\/EXT|I\/E)[. ]/i;
    var KEY = 'papercut.v1', THEME = 'papercut.theme';
    function $(id) { return document.getElementById(id); }
    var paper = $('paper'), desk = $('desk'), nav = $('nav'), titleIn = $('title'), typesBar = $('types'), sheet = $('sheet'), fta = $('fta'), side = $('side');
    var cur = null, sceneBlocks = [], hiddenCharacterStats = new Set(), noteBlock = null, inspFrame = 0;
    var suggestionBox = document.createElement('div'), suggestionItems = [], suggestionIndex = 0, suggestionBlock = null;
    suggestionBox.className = 'suggestions'; suggestionBox.setAttribute('role', 'listbox'); document.body.append(suggestionBox);

    /* The whole screenplay is one editable host. The browser then handles selection across lines
       (drag, Shift+click, Shift+arrows, Ctrl+A) like any word processor, and Papercut only steps in
       when an edit would break the block structure. */
    try { paper.contentEditable = 'plaintext-only'; } catch (err) { paper.contentEditable = 'true'; }
    paper.spellcheck = true;

    var SAMPLE = [
        { t: 'scene', x: 'INT. MARLOWE THEATRE - PROJECTION BOOTH - NIGHT', n: 'Quiet opening. The cinema is empty, but Dev still runs the show every night.' },
        { t: 'action', x: 'A cramped room that smells of hot dust and old film. DEV (60s, cardigan, reading glasses on a string) threads a reel through the gate of a dented projector.' },
        { t: 'action', x: 'Through the booth window, the auditorium is empty. Every seat is folded up.' },
        { t: 'character', x: 'Mira' },
        { t: 'paren', x: 'from the doorway' },
        { t: 'dialogue', x: 'You know nobody is coming tonight.' },
        { t: 'character', x: 'Dev' },
        { t: 'dialogue', x: "The film doesn't know that." },
        { t: 'action', x: 'He throws the switch. The lamp ignites. A beam of light cuts the dark and lands on a bare white screen.' },
        { t: 'character', x: 'Dev' },
        { t: 'dialogue', x: 'Watch. It starts the same way every night.' },
        { t: 'transition', x: 'Smash cut to:' },
        { t: 'scene', x: 'EXT. MARLOWE THEATRE - MARQUEE - CONTINUOUS', n: 'Reveal the building from outside. Rain and neon set the mood.' },
        { t: 'action', x: 'The marquee flickers on, one letter at a time. NIGHT REEL. Rain streaks the neon.' }
    ];

    /* ---------- blocks ---------- */
    function ph(t) { for (var i = 0; i < T.length; i++)if (T[i].id === t) return T[i].ph; return ''; }
    function mk(t, x, n) {
        var b = document.createElement('div'); b.className = 'blk'; b.dataset.t = t; b.dataset.ph = ph(t);
        if (x) b.textContent = x;
        if (n) b.dataset.note = n;
        return b;
    }
    function setType(b, t) { b.dataset.t = t; b.dataset.ph = ph(t); }
    function blk(el) { var n = el && (el.nodeType === 1 ? el : el.parentElement); var b = n && n.closest && n.closest('.blk'); return b && paper.contains(b) ? b : null; }
    function idx(b) { return Array.prototype.indexOf.call(paper.children, b); }
    function data(forExport) {
        return Array.prototype.map.call(paper.children, function (b) {
            var r = { t: b.dataset.t, x: b.textContent };
            if (b.dataset.t === 'scene' && b.dataset.note) r.n = b.dataset.note;
            if (forExport && b.dataset.contd) r.c = true;
            return r;
        });
    }
    function render(d) {
        paper.replaceChildren(); cur = null;
        (d.length ? d : [{ t: 'action', x: '' }]).forEach(function (r) { paper.append(mk(r.t, r.x, r.n)); });
        changed(); syncTypes();
    }

    /* ---------- selection ---------- */
    function textOffset(b, node, off) {
        var r = document.createRange();
        r.selectNodeContents(b); r.setEnd(node, off);
        return r.toString().length;
    }
    function edge(node, off, isEnd) {
        if (!node || !paper.contains(node)) return null;
        var kids = paper.children, b;
        if (node === paper) {
            if (!kids.length) return null;
            if (off >= kids.length) { b = kids[kids.length - 1]; return { b: b, o: b.textContent.length }; }
            if (isEnd && off > 0) { b = kids[off - 1]; return { b: b, o: b.textContent.length }; }
            return { b: kids[off], o: 0 };
        }
        b = blk(node);
        return b ? { b: b, o: textOffset(b, node, off) } : null;
    }
    /* Where the selection starts and ends, as a block plus a character offset inside it. */
    function selSpan() {
        var s = getSelection();
        if (!s.rangeCount) return null;
        var r = s.getRangeAt(0), a = edge(r.startContainer, r.startOffset, false), z = edge(r.endContainer, r.endOffset, true);
        if (!a || !z) return null;
        return { a: a.b, ao: a.o, z: z.b, zo: z.o };
    }
    function focusBlock() {
        var s = getSelection();
        if (!s.rangeCount || !s.focusNode || !paper.contains(s.focusNode)) return null;
        if (s.focusNode === paper) { var k = paper.children; return k.length ? k[Math.min(s.focusOffset, k.length - 1)] : null; }
        return blk(s.focusNode);
    }
    function caretOffset(b) {
        var sp = selSpan();
        if (!sp) return { s: 0, e: 0 };
        var ia = idx(sp.a), iz = idx(sp.z), ib = idx(b);
        if (ib < ia || ib > iz) return { s: 0, e: 0 };
        return { s: ib === ia ? sp.ao : 0, e: ib === iz ? sp.zo : b.textContent.length };
    }
    function setCaret(b, off) {
        paper.focus({ preventScroll: true });
        var s = getSelection(), r = document.createRange(), n = off, w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT), node;
        while ((node = w.nextNode())) {
            if (n <= node.length) { r.setStart(node, n); r.collapse(true); s.removeAllRanges(); s.addRange(r); b.scrollIntoView({ block: 'nearest' }); return; }
            n -= node.length;
        }
        r.selectNodeContents(b); r.collapse(false); s.removeAllRanges(); s.addRange(r); b.scrollIntoView({ block: 'nearest' });
    }
    /* Every block the selection touches. A selection that only grazes the edge of a block does not count it. */
    function selectedBlocks() {
        var sp = selSpan();
        if (!sp) return cur && paper.contains(cur) ? [cur] : [];
        var ia = idx(sp.a), iz = idx(sp.z);
        if (iz > ia && sp.zo === 0) iz--;
        if (iz > ia && sp.ao === sp.a.textContent.length) ia++;
        return Array.prototype.slice.call(paper.children, ia, iz + 1);
    }
    /* The selected text as screenplay blocks (used for copy and cut across lines). */
    function spanBlocks(sp) {
        var ia = idx(sp.a), iz = idx(sp.z), out = [];
        for (var i = ia; i <= iz; i++) {
            var b = paper.children[i], x = b.textContent, r;
            if (i === iz) x = x.slice(0, sp.zo);
            if (i === ia) x = x.slice(sp.ao);
            r = { t: b.dataset.t, x: x };
            if (b.dataset.t === 'scene' && b.dataset.note && (i !== ia || sp.ao === 0)) r.n = b.dataset.note;
            out.push(r);
        }
        if (iz > ia && sp.zo === 0) out.pop();
        return out;
    }
    /* Delete a selection that spans several blocks.
       'remove' is Backspace / Delete / Cut: whole lines simply disappear.
       'replace' is typing, Enter or paste: the first block stays and takes the new text. */
    function deleteSpan(sp, mode) {
        var all = Array.prototype.slice.call(paper.children), A = sp.a, Z = sp.z, ao = sp.ao, zo = sp.zo, ia = all.indexOf(A), iz = all.indexOf(Z), i, target, caret;
        var whole = ia === 0 && ao === 0 && iz === all.length - 1 && zo === Z.textContent.length;
        if (mode === 'replace' && zo === 0 && iz > ia) { iz--; Z = all[iz]; zo = Z.textContent.length; }
        var head = A.textContent.slice(0, ao), tail = Z.textContent.slice(zo);
        if (mode === 'remove' && ao === 0 && iz > ia) {
            target = Z; caret = 0;
            if (zo > 0) Z.textContent = tail;
            for (i = ia; i < iz; i++)all[i].remove();
        } else {
            target = A; caret = ao;
            A.textContent = head + tail;
            for (i = ia + 1; i <= iz; i++)all[i].remove();
        }
        if (whole) { setType(target, 'action'); delete target.dataset.note; }
        setCaret(target, caret); setCur(target); changed(); syncTypes();
        return target;
    }
    function setCur(b) {
        if (cur === b) return;
        if (cur) cur.classList.remove('cur');
        cur = b;
        if (b) b.classList.add('cur');
        syncTypes(); markNav(); updateInspector();
        if (b && getSelection().isCollapsed) refreshSuggestions(b); else hideSuggestions();
    }
    function syncTypes() {
        var l = selectedBlocks(), t = null;
        if (l.length) { t = l[0].dataset.t; for (var i = 1; i < l.length; i++)if (l[i].dataset.t !== t) { t = null; break; } }
        Array.prototype.forEach.call(typesBar.querySelectorAll('.type'), function (btn) { btn.setAttribute('aria-pressed', btn.dataset.t === t ? 'true' : 'false'); });
    }

    /* ---------- history ---------- */
    var hist = [], fut = [], typing = false, tt;
    function curPos() {
        if (!cur || !paper.contains(cur)) return { i: 0, o: 0 };
        return { i: idx(cur), o: caretOffset(cur).s };
    }
    function snap() { var c = curPos(); return JSON.stringify({ d: data(), t: titleIn.value, i: c.i, o: c.o }); }
    function snapshot() {
        typing = false; clearTimeout(tt);
        var s = snap();
        if (hist[hist.length - 1] !== s) hist.push(s);
        if (hist.length > 150) hist.shift();
        fut = [];
    }
    function beforeEdit() { if (!typing) { snapshot(); typing = true; } clearTimeout(tt); tt = setTimeout(function () { typing = false; }, 800); }
    function apply(s) {
        var o = JSON.parse(s); render(o.d); titleIn.value = o.t || '';
        var b = paper.children[o.i];
        if (b) { setCaret(b, Math.min(o.o, b.textContent.length)); setCur(b); }
    }
    function undo() { if (!hist.length) return; fut.push(snap()); apply(hist.pop()); }
    function redo() { if (!fut.length) return; hist.push(snap()); apply(fut.pop()); }

    /* ---------- editing ---------- */
    function enter(b, quiet) {
        if (!quiet) snapshot();
        var t = b.dataset.t, txt = b.textContent, c = caretOffset(b);
        if (txt === '' && t !== 'action') { setType(b, 'action'); syncTypes(); changed(); return; }
        var before = txt.slice(0, c.s), after = txt.slice(c.e);
        b.textContent = before;
        var nb = mk(after ? t : NEXT[t], after);
        b.after(nb); setCaret(nb, 0); setCur(nb);
        nb.scrollIntoView({ block: 'nearest' });
        changed();
    }
    function nextType(t, d) {
        var i = 0;
        for (var k = 0; k < T.length; k++)if (T[k].id === t) i = k;
        return T[(i + d + T.length) % T.length].id;
    }
    /* Tab: every selected line moves to the next type together. */
    function cycle(d) {
        var list = selectedBlocks();
        if (!list.length) return;
        var t = nextType(list[0].dataset.t, d);
        list.forEach(function (x) { setType(x, t); });
        syncTypes(); changed(); updateInspector();
    }
    function applyType(t) {
        var list = selectedBlocks(), focused = !!selSpan();
        if (!list.length) list = [paper.lastElementChild];
        snapshot();
        list.forEach(function (x) { setType(x, t); });
        if (!focused) { setCaret(list[0], list[0].textContent.length); setCur(list[0]); }
        syncTypes(); changed(); updateInspector();
        if (list.length === 1) refreshSuggestions(list[0]);
    }
    function joinBack(b) {
        var p = b.previousElementSibling;
        snapshot();
        if (p) {
            if (p.textContent === '') { p.remove(); setCaret(b, 0); }
            else { var pl = p.textContent.length; p.textContent = p.textContent + b.textContent; b.remove(); setCaret(p, pl); setCur(p); }
        } else if (b.textContent === '' && b.dataset.t !== 'action') { setType(b, 'action'); syncTypes(); }
        changed();
    }
    function joinForward(b) {
        var n = b.nextElementSibling, l = b.textContent.length;
        snapshot();
        if (l === 0) { b.remove(); setCaret(n, 0); setCur(n); }
        else { b.textContent = b.textContent + n.textContent; n.remove(); setCaret(b, l); }
        changed();
    }
    paper.addEventListener('beforeinput', function (e) {
        var sp = selSpan(), it = e.inputType; if (!sp) return;
        if (/^format/.test(it)) { e.preventDefault(); return; }
        if (it === 'historyUndo') { e.preventDefault(); undo(); return; }
        if (it === 'historyRedo') { e.preventDefault(); redo(); return; }
        if (sp.a !== sp.z) {
            /* The selection spans several lines, so the blocks are edited here and the structure stays intact. */
            if (/^delete/.test(it)) { e.preventDefault(); snapshot(); deleteSpan(sp, 'remove'); return; }
            if (it === 'insertParagraph' || it === 'insertLineBreak') { e.preventDefault(); snapshot(); enter(deleteSpan(sp, 'replace'), true); return; }
            if (it === 'insertText' || it === 'insertReplacementText') {
                e.preventDefault(); beforeEdit(); deleteSpan(sp, 'replace');
                document.execCommand('insertText', false, e.data || '');
            }
            return;
        }
        var b = sp.a;
        if (it === 'insertText' && e.data === '(') {
            if (b.dataset.t === 'paren') { e.preventDefault(); return; }
            if (b.textContent === '') { e.preventDefault(); snapshot(); setType(b, 'paren'); syncTypes(); changed(); return; }
        }
        if (it === 'insertText' && e.data === ')' && b.dataset.t === 'paren') {
            e.preventDefault();
            var pc = caretOffset(b);
            if (b.textContent !== '' && pc.s === pc.e && pc.s === b.textContent.length) enter(b);
            return;
        }
        /* A plaintext-only host reports Enter as insertLineBreak, so both inputs start a new screenplay line. */
        if (it === 'insertParagraph' || it === 'insertLineBreak') { e.preventDefault(); enter(b); return; }
        if (/^delete/.test(it)) {
            var c = caretOffset(b);
            if (c.s === c.e) {
                if (/Backward$/.test(it) && c.s === 0) { e.preventDefault(); joinBack(b); return; }
                if (/Forward$/.test(it) && c.s === b.textContent.length && b.nextElementSibling) { e.preventDefault(); joinForward(b); return; }
            }
        }
        if (/^(insert|delete)/.test(it)) beforeEdit();
    });
    paper.addEventListener('keydown', function (e) {
        var sp = selSpan(), b = sp ? sp.a : null; if (!b) return;
        var mod = e.ctrlKey || e.metaKey, k = e.key;
        if (suggestionBox.classList.contains('open')) {
            if (k === 'ArrowDown') { e.preventDefault(); moveSuggestion(1); return; }
            if (k === 'ArrowUp') { e.preventDefault(); moveSuggestion(-1); return; }
            if ((k === 'Enter' || k === 'Tab') && suggestionItems.length) { e.preventDefault(); applySuggestion(suggestionBlock || b, suggestionItems[suggestionIndex]); return; }
            if (k === 'Escape') { e.preventDefault(); hideSuggestions(); return; }
        }
        if (mod && !e.altKey && (k === 'z' || k === 'Z')) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
        if (mod && !e.altKey && (k === 'y' || k === 'Y')) { e.preventDefault(); redo(); return; }
        if (k === 'Tab' && !mod && !e.altKey) { e.preventDefault(); snapshot(); cycle(e.shiftKey ? -1 : 1); return; }
        if (e.altKey && !mod && /^Digit[1-6]$/.test(e.code)) { e.preventDefault(); applyType(T[+e.code.slice(5) - 1].id); return; }
    });
    paper.addEventListener('input', function (e) {
        var sp = selSpan(), b = sp ? sp.z : null; if (!b) return;
        var foreign = false;
        for (var ch = b.firstElementChild; ch; ch = ch.nextElementSibling)if (!ch.classList.contains('pb')) foreign = true;
        if (foreign) { var o = caretOffset(b).s; b.textContent = b.textContent; setCaret(b, o); }
        if (b.textContent === '' && b.childNodes.length) b.replaceChildren();
        var bt = b.dataset.t;
        if (e.inputType === 'insertText' && e.data && e.data.length === 1 && !e.isComposing && (bt === 'action' || bt === 'dialogue') && e.data !== e.data.toUpperCase()) {
            var co = caretOffset(b).s, tx = b.textContent;
            if (co > 0 && tx.charAt(co - 1) === e.data && (co === 1 || /[.!?…]["'”’)\]]*\s+$/.test(tx.slice(0, co - 1)))) {
                b.textContent = tx.slice(0, co - 1) + e.data.toUpperCase() + tx.slice(co);
                setCaret(b, co);
            }
        }
        if (bt === 'action' && SCN.test(b.textContent)) { setType(b, 'scene'); syncTypes(); bt = 'scene'; }
        changed();
        refreshSuggestions(b);
    });
    /* Clipboard blocks carry their element types (and scene notes), so a copied scene pastes back as a scene. */
    function jsonBlocks(cd) {
        var j = '';
        try { j = cd.getData('application/x-papercut'); } catch (err) { }
        if (!j) return null;
        try {
            var a = JSON.parse(j);
            if (Array.isArray(a) && a.length) return a.map(function (r) { return { t: T.some(function (x) { return x.id === r.t; }) ? r.t : 'action', x: String(r.x == null ? '' : r.x), n: r.n ? String(r.n) : '' }; });
        } catch (err) { }
        return null;
    }
    function clipSelection(e, cut) {
        var sp = selSpan();
        if (!sp || sp.a === sp.z || !e.clipboardData) return;
        var list = spanBlocks(sp);
        e.preventDefault();
        e.clipboardData.setData('text/plain', fountainOf(list, ''));
        e.clipboardData.setData('application/x-papercut', JSON.stringify(list));
        if (cut) { snapshot(); deleteSpan(sp, 'remove'); }
    }
    paper.addEventListener('copy', function (e) { clipSelection(e, false); });
    paper.addEventListener('cut', function (e) { clipSelection(e, true); });
    paper.addEventListener('paste', function (e) {
        var sp = selSpan(); if (!sp) return;
        e.preventDefault();
        var cd = e.clipboardData || window.clipboardData;
        var txt = (cd.getData('text/plain') || '').replace(/\r/g, ''), jb = jsonBlocks(cd);
        if (!txt && !jb) return;
        snapshot();
        var b = sp.a;
        if (sp.a !== sp.z) b = deleteSpan(sp, 'replace');
        var s = getSelection();
        if (!jb && txt.indexOf('\n') === -1) {
            if (s.rangeCount) { var r = s.getRangeAt(0); r.deleteContents(); var tn = document.createTextNode(txt); r.insertNode(tn); r.setStartAfter(tn); r.collapse(true); s.removeAllRanges(); s.addRange(r); }
            changed(); return;
        }
        var c = caretOffset(b), full = b.textContent, before = full.slice(0, c.s), after = full.slice(c.e);
        var parsed = jb || parseFountain(txt).blocks, last = b;
        if (before === '') { setType(b, parsed[0].t); b.textContent = parsed[0].x; if (parsed[0].n) b.dataset.note = parsed[0].n; parsed = parsed.slice(1); }
        else { b.textContent = before; }
        parsed.forEach(function (r) { var nb = mk(r.t, r.x, r.n); last.after(nb); last = nb; });
        if (after) { var tail = mk(last.dataset.t === 'dialogue' ? 'dialogue' : b.dataset.t, after); last.after(tail); }
        setCaret(last, last.textContent.length); setCur(last); changed();
    });
    paper.addEventListener('drop', function (e) { e.preventDefault(); });
    paper.addEventListener('dragstart', function (e) { e.preventDefault(); });
    paper.addEventListener('focusout', function () { setTimeout(function () { if (!suggestionBox.contains(document.activeElement)) hideSuggestions(); }, 100); });
    desk.addEventListener('mousedown', function (e) {
        if (e.target !== desk && e.target !== paper && !(e.target.classList && e.target.classList.contains('paper'))) return;
        if (!paper.children.length) return;
        /* A click in blank paper space should move to the nearest visible screenplay block,
           not blindly focus the final block (which can scroll to the last page). */
        var blocks = Array.prototype.slice.call(paper.querySelectorAll('.blk'));
        if (!blocks.length) return;
        var y = e.clientY, chosen = blocks[0], best = Infinity, chosenRect = null;
        blocks.forEach(function (b) {
            var r = b.getBoundingClientRect();
            var dist = y < r.top ? r.top - y : (y > r.bottom ? y - r.bottom : 0);
            if (dist < best) { best = dist; chosenRect = r; chosen = b; }
        });
        e.preventDefault();
        var rect = chosenRect || chosen.getBoundingClientRect();
        setCaret(chosen, y < (rect.top + rect.bottom) / 2 ? 0 : chosen.textContent.length);
        setCur(chosen);
    });
    document.addEventListener('mousedown', function (e) { if (!suggestionBox.contains(e.target) && !paper.contains(e.target)) hideSuggestions(); });
    window.addEventListener('resize', hideSuggestions);
    document.addEventListener('selectionchange', function () {
        var b = focusBlock();
        if (!b) return;
        if (b !== cur) setCur(b);
        else { syncTypes(); updateInspector(); if (!getSelection().isCollapsed) hideSuggestions(); }
    });

    /* ---------- editor suggestions (scene headings, time, transitions, existing cast, extensions) ---------- */
    var TIME_SUGGESTIONS = ['DAY', 'NIGHT', 'MORNING', 'EVENING', 'DAWN', 'DUSK', 'SUNSET', 'SUNRISE', 'LATER', 'CONTINUOUS', 'SAME TIME', 'MOMENTS LATER', 'PRE-DAWN'];
    var TRANSITION_SUGGESTIONS = ['CUT TO:', 'SMASH CUT TO:', 'MATCH CUT TO:', 'JUMP CUT TO:', 'DISSOLVE TO:', 'FADE IN:', 'FADE OUT.', 'FADE TO BLACK.', 'WIPE TO:', 'IRIS OUT.', 'END.'];
    var EXTENSIONS = [
        { label: 'V.O.', note: 'Voice over' },
        { label: 'O.S.', note: 'Off screen' },
        { label: 'O.C.', note: 'Off camera' },
        { label: 'PHONE', note: 'Heard through a phone' },
        { label: 'FILTER', note: 'Heard through a speaker or filter' },
        { label: "CONT'D", note: 'Same character continues' }
    ];
    function knownCharacters() {
        var seen = {}, out = [];
        Array.prototype.forEach.call(paper.children, function (x) {
            if (x.dataset.t === 'character') {
                var name = normalizedCharacter(x.textContent);
                if (name && !seen[name]) { seen[name] = true; out.push(name); }
            }
        });
        return out.sort();
    }
    function hideSuggestions() { suggestionBox.classList.remove('open'); suggestionBox.replaceChildren(); suggestionItems = []; suggestionIndex = 0; suggestionBlock = null; }
    function showSuggestions(b, items) {
        if (!items.length) { hideSuggestions(); return; }
        suggestionItems = items.slice(0, 10); suggestionIndex = 0; suggestionBlock = b; suggestionBox.replaceChildren();
        suggestionItems.forEach(function (item, i) {
            var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'suggestion' + (i === 0 ? ' active' : ''); btn.setAttribute('role', 'option');
            var main = document.createElement('span'); main.textContent = item.label; btn.append(main);
            if (item.note) { var small = document.createElement('small'); small.textContent = item.note; btn.append(small); }
            btn.addEventListener('mousedown', function (e) { e.preventDefault(); applySuggestion(b, item); });
            suggestionBox.append(btn);
        });
        var r = b.getBoundingClientRect(), width = Math.min(360, window.innerWidth - 24);
        suggestionBox.style.width = width + 'px';
        suggestionBox.style.left = Math.max(12, Math.min(r.left, window.innerWidth - width - 12)) + 'px';
        suggestionBox.style.top = Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 250)) + 'px';
        suggestionBox.classList.add('open');
    }
    function sceneSuggestions(txt) {
        var v = txt.trim(), items = [];
        var timePart = v.match(/^(.*?\s-\s)(.*)$/);
        if (timePart) {
            var prefix = timePart[2].toUpperCase();
            TIME_SUGGESTIONS.filter(function (x) { return !prefix || x.indexOf(prefix) === 0; }).forEach(function (x) { items.push({ label: timePart[1] + x, note: 'Scene time', value: timePart[1] + x }); });
        } else if (/^(?:INT\.?|EXT\.?|EST\.?|INT\.\/EXT\.?|I\/E\.?)\s*$/i.test(v)) {
            var base = v.toUpperCase().replace(/\s+$/, '');
            ['DAY', 'NIGHT', 'MORNING', 'EVENING', 'DAWN', 'DUSK', 'CONTINUOUS'].forEach(function (tm) { items.push({ label: base + ' [LOCATION] - ' + tm, note: 'Scene heading template', value: base + ' [LOCATION] - ' + tm }); });
        } else if (/^(?:INT|EXT|EST|I\/E)/i.test(v) && !v.includes(' - ')) {
            ['INT.', 'EXT.', 'INT./EXT.', 'EST.'].filter(function (x) { return x.indexOf(v.toUpperCase()) === 0; }).forEach(function (x) { items.push({ label: x, note: 'Scene prefix', value: x + ' ' }); });
        }
        return items;
    }
    /* Typing "(" after a character name offers V.O., O.S., PHONE and the other extensions. */
    function extensionSuggestions(text) {
        var open = text.lastIndexOf('('), items = [];
        if (open < 0 || text.indexOf(')', open) >= 0) return null;
        var typed = text.slice(open + 1).trim().toUpperCase(), base = text.slice(0, open).replace(/\s+$/, '');
        EXTENSIONS.filter(function (x) { return !typed || x.label.indexOf(typed) === 0; }).forEach(function (x) {
            items.push({ label: x.label, note: x.note, value: (base ? base + ' ' : '') + '(' + x.label + ')' });
        });
        return items;
    }
    function getSuggestions(b) {
        var text = b.textContent || '', trim = text.trim(), items = [];
        if (b.dataset.t === 'character') {
            var ext = extensionSuggestions(text);
            if (ext) return ext;
            var q = trim.toUpperCase();
            knownCharacters().filter(function (n) { return n !== q && (!q || n.indexOf(q) === 0); }).forEach(function (n) { items.push({ label: n, note: 'Existing character · reuse spelling', value: n }); });
        } else if (b.dataset.t === 'scene') {
            items = sceneSuggestions(text);
        } else if (b.dataset.t === 'transition') {
            var q2 = trim.toUpperCase();
            TRANSITION_SUGGESTIONS.filter(function (x) { return !q2 || x.indexOf(q2) === 0; }).forEach(function (x) { items.push({ label: x, note: 'Transition', value: x }); });
        }
        return items;
    }
    function applySuggestion(b, item) {
        if (!b || !paper.contains(b)) return;
        snapshot(); b.textContent = item.value; setCur(b); setCaret(b, b.textContent.length); hideSuggestions(); changed();
    }
    function refreshSuggestions(b) {
        if (!b || !paper.contains(b)) { hideSuggestions(); return; }
        showSuggestions(b, getSuggestions(b));
    }
    function moveSuggestion(d) {
        if (!suggestionBox.classList.contains('open') || !suggestionItems.length) return false;
        suggestionIndex = (suggestionIndex + d + suggestionItems.length) % suggestionItems.length;
        Array.prototype.forEach.call(suggestionBox.querySelectorAll('.suggestion'), function (el, i) { el.classList.toggle('active', i === suggestionIndex); });
        suggestionBox.querySelectorAll('.suggestion')[suggestionIndex].scrollIntoView({ block: 'nearest' });
        return true;
    }

    /* ---------- type buttons ---------- */
    T.forEach(function (t, i) {
        var btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'type'; btn.dataset.t = t.id; btn.textContent = t.label;
        btn.title = t.label + ' (Alt+' + (i + 1) + ')'; btn.setAttribute('aria-pressed', 'false');
        btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
        btn.addEventListener('click', function () { applyType(t.id); });
        typesBar.append(btn);
    });
    var hint = document.createElement('span');
    hint.className = 'hint'; hint.textContent = 'Enter new line · Tab changes type · Drag, Shift+click or Ctrl+A to select · Ctrl+Z undo';
    typesBar.append(hint);

    /* ---------- stats and scene navigator ---------- */
    function wrapN(s, w) {
        if (!s) return 1;
        var n = 1, c = 0, ws = s.split(/\s+/);
        for (var i = 0; i < ws.length; i++) {
            var L = ws[i].length; if (!L) continue;
            if (c === 0) c = L; else if (c + 1 + L <= w) c += 1 + L; else { n++; c = L; }
            while (c > w) { n++; c -= w; }
        }
        return n;
    }
    /* Pagination. Units are lines (1 line = 1em). A page holds CH lines between a 1in top and bottom margin. */
    var PH = 66, GAP = 3, TOPM = 6, BOTM = 6, CH = 54;
    function kn(t) { return t === 'scene' || t === 'character' || t === 'paren'; }
    function splittable(it) { return (it.t === 'action' || it.t === 'dialogue') && it.n >= 4; }
    function plan(items) {
        var P = { push: {}, split: {}, top: {}, at: {}, at2: {}, pg: [], pages: 1 }, y = 0, page = 0;
        function need(i, d) {
            var nx = items[i + 1];
            if (!nx || d > 3) return 0;
            return nx.mt + (kn(nx.t) ? nx.n + need(i + 1, d + 1) : (splittable(nx) ? 2 : nx.n));
        }
        for (var i = 0; i < items.length; i++) {
            var it = items[i], mt = y === 0 ? 0 : it.mt, n = it.n, keep = kn(it.t) ? need(i, 0) : 0;
            if (y === 0) P.top[i] = true;
            if (y + mt + n + keep <= CH) { P.at[i] = [page, y + mt]; P.pg[i] = page; y += mt + n; continue; }
            var room = CH - (y + mt);
            if (splittable(it) && room >= 2) {
                var f = Math.min(Math.floor(room), n - 2);
                if (f >= 2) {
                    P.at[i] = [page, y + mt]; P.pg[i] = page; P.split[i] = { at: f, gap: CH - (y + mt + f) };
                    page++; P.at2[i] = [page, 0]; y = n - f; continue;
                }
            }
            if (y === 0) { P.at[i] = [page, 0]; P.pg[i] = page; y += mt + n; continue; }
            P.push[i] = Math.max(0, CH - y); P.top[i] = true; page++; P.at[i] = [page, 0]; P.pg[i] = page; y = n;
        }
        P.pages = page + 1;
        return P;
    }
    function lineStart(b, n, em) {
        b.normalize();
        var tn = b.firstChild;
        if (!tn || tn.nodeType !== 3 || !tn.length) return 0;
        var top0 = b.getBoundingClientRect().top, lo = 0, hi = tn.length - 1, r = document.createRange(), want = n * em - em / 2, rt;
        while (lo < hi) {
            var mid = (lo + hi) >> 1;
            r.setStart(tn, mid); r.setEnd(tn, mid + 1);
            rt = r.getBoundingClientRect();
            if (rt.top - top0 >= want) hi = mid; else lo = mid + 1;
        }
        r.setStart(tn, lo); r.setEnd(tn, lo + 1);
        rt = r.getBoundingClientRect();
        return (rt.top - top0 >= want) ? lo : 0;
    }
    function clearLayout(bl) {
        var dirty = [];
        bl.forEach(function (b) {
            b.style.marginTop = '';
            var s = b.querySelectorAll('.pb');
            if (s.length) { for (var k = 0; k < s.length; k++)s[k].remove(); dirty.push(b); }
        });
        dirty.forEach(function (b) { b.normalize(); });
    }
    function measureItems(bl, em) {
        return bl.map(function (b) {
            return { t: b.dataset.t, n: Math.max(1, Math.round(b.getBoundingClientRect().height / em)), mt: Math.round(parseFloat(getComputedStyle(b).marginTop) / em * 100) / 100 };
        });
    }
    function paginate() {
        var em = parseFloat(getComputedStyle(paper).fontSize) || 16, bl = Array.prototype.slice.call(paper.children);
        clearLayout(bl);
        var items = measureItems(bl, em);
        var P = plan(items), cuts = [];
        Object.keys(P.split).forEach(function (k) {
            var off = lineStart(bl[k], P.split[k].at, em);
            if (off > 0) cuts.push({ b: bl[k], off: off, h: P.split[k].gap + BOTM + GAP + TOPM });
        });
        bl.forEach(function (b, i) {
            if (P.push[i] != null) b.style.marginTop = (P.push[i] + BOTM + GAP + TOPM) + 'em';
            else if (P.top[i]) b.style.marginTop = '0';
        });
        cuts.forEach(function (c) {
            var tn = c.b.firstChild;
            if (!tn || tn.nodeType !== 3) return;
            var rest = tn.splitText(c.off), sp = document.createElement('span');
            sp.className = 'pb'; sp.contentEditable = 'false'; sp.style.height = c.h + 'em';
            c.b.insertBefore(sp, rest);
        });
        var pe = $('pages');
        while (pe.children.length < P.pages) {
            var k = pe.children.length, sh = document.createElement('div');
            sh.className = 'leaf'; sh.style.top = (k * (PH + GAP)) + 'em';
            if (k > 0) { var pn = document.createElement('div'); pn.className = 'pn'; pn.textContent = (k + 1) + '.'; sh.append(pn); }
            pe.append(sh);
        }
        while (pe.children.length > P.pages) pe.lastChild.remove();
        paper.style.minHeight = (P.pages * PH + (P.pages - 1) * GAP) + 'em';
        return P;
    }
    /* "MIRA (V.O.) (CONT'D)" and "MIRA" are the same character. */
    function normalizedCharacter(x) { return x.trim().replace(/(?:\s*\([^)]*\))+\s*$/, '').replace(/\s+\^$/, '').replace(/:$/, '').trim().toUpperCase(); }
    /* When the same character speaks again after only action lines (same scene, no one else in between),
       the cue gets (CONT'D) automatically. The text itself is untouched; CSS draws it. */
    function refreshContd() {
        var last = '';
        Array.prototype.forEach.call(paper.children, function (b) {
            var t = b.dataset.t;
            if (t === 'scene' || t === 'transition') last = '';
            if (t !== 'character') return;
            var name = normalizedCharacter(b.textContent), manual = /\(\s*(?:CONT'?D|CONTINUED)\s*\)/i.test(b.textContent);
            if (name && name === last && !manual) b.dataset.contd = '1'; else delete b.dataset.contd;
            if (name) last = name;
        });
    }
    function sceneOf(b) { while (b && b.dataset.t !== 'scene') b = b.previousElementSibling; return b; }
    function collectCharacterStats() {
        var all = {}, sceneMap = new Map(), activeScene = null, dialogues = 0, chars = 0, words = 0;
        Array.prototype.forEach.call(paper.children, function (b) {
            var t = b.dataset.t, x = b.textContent || '';
            chars += x.length;
            var m = x.trim().match(/\S+/g); words += m ? m.length : 0;
            if (t === 'scene') {
                activeScene = {}; sceneMap.set(b, activeScene);
            }
            if (!activeScene) activeScene = {};
            if (t === 'character') {
                var name = normalizedCharacter(x);
                if (name) {
                    if (!all[name]) all[name] = { dialogues: 0 };
                    if (!activeScene[name]) activeScene[name] = { dialogues: 0 };
                }
            }
            if (t === 'dialogue') {
                dialogues++;
                var prev = b.previousElementSibling;
                while (prev && (prev.dataset.t === 'paren' || prev.dataset.t === 'dialogue')) prev = prev.previousElementSibling;
                if (prev && prev.dataset.t === 'character') {
                    var nm = normalizedCharacter(prev.textContent);
                    if (nm) {
                        if (!all[nm]) all[nm] = { dialogues: 0 };
                        all[nm].dialogues++;
                        if (!activeScene[nm]) activeScene[nm] = { dialogues: 0 };
                        activeScene[nm].dialogues++;
                    }
                }
            }
        });
        var currentSceneBlock = cur && paper.contains(cur) ? sceneOf(cur) : null;
        var scene = currentSceneBlock && sceneMap.has(currentSceneBlock) ? sceneMap.get(currentSceneBlock) : {};
        return { all: all, scene: scene, chars: chars, dialogues: dialogues, words: words };
    }
    /* The inspector redraws at most once per frame, so dragging a selection stays smooth. */
    function updateInspector() {
        if (inspFrame) return;
        inspFrame = requestAnimationFrame(function () { inspFrame = 0; renderInspector(); });
    }
    function renderInspector() {
        var stats = collectCharacterStats(), b = cur && paper.contains(cur) ? cur : null, picked = selectedBlocks();
        function label(el) { return (T.find(function (t) { return t.id === el.dataset.t; }) || { label: el.dataset.t }).label; }
        if (picked.length > 1) {
            var same = picked.every(function (x) { return x.dataset.t === picked[0].dataset.t; }), letters = 0;
            picked.forEach(function (x) { letters += x.textContent.length; });
            $('inspectType').textContent = picked.length + ' lines · ' + (same ? label(picked[0]) : 'mixed types');
            $('inspectLength').textContent = letters.toLocaleString() + ' characters selected';
        } else {
            $('inspectType').textContent = b ? label(b) : 'No selection';
            $('inspectLength').textContent = (b ? b.textContent.length : 0).toLocaleString() + ' characters';
        }
        $('totalChars').textContent = stats.chars.toLocaleString(); $('totalDialogues').textContent = stats.dialogues.toLocaleString(); $('totalCast').textContent = Object.keys(stats.all).length.toLocaleString(); $('totalWords').textContent = stats.words.toLocaleString();
        var sel = $('characterFilter'), old = sel.value, names = Object.keys(stats.all).sort(); sel.replaceChildren(); var opt = document.createElement('option'); opt.value = '__all'; opt.textContent = 'All characters'; sel.append(opt); names.forEach(function (n) { var o = document.createElement('option'); o.value = n; o.textContent = n; sel.append(o); }); if (names.indexOf(old) >= 0) sel.value = old;
        var filter = sel.value, fd = filter === '__all' ? stats.dialogues : (stats.all[filter] ? stats.all[filter].dialogues : 0); $('filteredDialogues').textContent = fd.toLocaleString();
        function list(id, source) { var el = $(id); el.replaceChildren(); var keys = Object.keys(source).sort(); keys = keys.filter(function (n) { return !hiddenCharacterStats.has(n); }); if (!keys.length) { var p = document.createElement('p'); p.className = 'muted'; p.textContent = 'No visible characters.'; el.append(p); return; } keys.forEach(function (n) { var row = document.createElement('div'); row.className = 'character-row'; var name = document.createElement('span'); name.textContent = n; var count = document.createElement('small'); count.textContent = source[n].dialogues + ' dialogue' + (source[n].dialogues === 1 ? '' : 's'); row.append(name, count); el.append(row); }); }
        list('allCharacters', stats.all); list('sceneCharacters', stats.scene);
        var opts = $('characterOptions'); opts.replaceChildren(); names.forEach(function (n) { var label = document.createElement('label'), cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !hiddenCharacterStats.has(n); cb.addEventListener('change', function () { if (cb.checked) hiddenCharacterStats.delete(n); else hiddenCharacterStats.add(n); updateInspector(); }); label.append(cb, document.createTextNode(n)); opts.append(label); }); $('characterMenuLabel').textContent = 'Show / hide characters (' + names.length + ')';
        renderNote();
    }
    $('characterFilter').addEventListener('change', updateInspector);

    /* ---------- scene notes ---------- */
    /* Each scene heading can carry a short note, so you can see what a scene holds without reading it. */
    function renderNote() {
        var area = $('sceneNote'), label = $('noteScene'), sb = cur && paper.contains(cur) ? sceneOf(cur) : null;
        noteBlock = sb;
        if (!sb) {
            area.disabled = true;
            if (document.activeElement !== area) area.value = '';
            label.textContent = 'Place the cursor inside a scene';
            return;
        }
        var no = sceneBlocks.indexOf(sb) + 1, v = sb.dataset.note || '';
        area.disabled = false;
        label.textContent = 'Scene ' + (no || '') + ' · ' + (sb.textContent.trim() || 'Untitled scene');
        if (document.activeElement !== area && area.value !== v) area.value = v;
    }
    $('sceneNote').addEventListener('input', function () {
        if (!noteBlock || !paper.contains(noteBlock)) return;
        beforeEdit();
        if (this.value.trim()) noteBlock.dataset.note = this.value; else delete noteBlock.dataset.note;
        changed();
    });
    function update() {
        var words = 0, scenes = [], pl;
        refreshContd();
        pl = paginate();
        Array.prototype.forEach.call(paper.children, function (b, i) {
            var t = b.dataset.t, x = b.textContent;
            if (t === 'scene') scenes.push({ b: b, page: pl.pg[i] + 1 });
            var m = x.trim().match(/\S+/g); words += m ? m.length : 0;
        });
        var pages = pl.pages;
        $('pg').textContent = pages; $('mn').textContent = pages;
        $('wd').textContent = words.toLocaleString(); $('sn').textContent = scenes.length;
        sceneBlocks = scenes.map(function (s) { return s.b; });
        nav.replaceChildren();
        if (!scenes.length) {
            var p = document.createElement('p'); p.className = 'empty';
            p.textContent = 'No scenes yet. Start a line with INT. or EXT. to add one.'; nav.append(p);
        }
        scenes.forEach(function (s, k) {
            var a = document.createElement('button'); a.type = 'button'; a.className = 'sc'; a.dataset.k = k;
            var n = document.createElement('span'), t = document.createElement('span'), pg = document.createElement('span');
            n.className = 'n'; n.textContent = (k + 1) + '.';
            var txt = s.b.textContent.trim();
            t.className = 't' + (txt ? '' : ' none'); t.textContent = txt || 'Untitled scene';
            pg.className = 'p'; pg.textContent = 'p.' + s.page;
            a.append(n, t, pg);
            var note = s.b.dataset.note;
            if (note) {
                var nt = document.createElement('span'); nt.className = 'nt'; nt.textContent = note.replace(/\s+/g, ' ').trim();
                a.title = note; a.append(nt);
            }
            a.addEventListener('click', function () {
                s.b.scrollIntoView({ block: 'center' }); setCaret(s.b, s.b.textContent.length); setCur(s.b);
                side.classList.remove('open');
            });
            nav.append(a);
        });
        var activeSceneBlock = cur && paper.contains(cur) ? sceneOf(cur) : null;
        window.papercutCurrentSceneTitle = activeSceneBlock ? activeSceneBlock.textContent.trim() : '';
        markNav(); updateInspector();
    }
    function markNav() {
        var k = -1;
        sceneBlocks.forEach(function (s, i) {
            if (cur && paper.contains(cur) && (s === cur || (s.compareDocumentPosition(cur) & Node.DOCUMENT_POSITION_FOLLOWING))) k = i;
        });
        Array.prototype.forEach.call(nav.children, function (c) {
            if (c.classList.contains('sc')) c.classList.toggle('on', +c.dataset.k === k);
        });
    }

    /* ---------- saving ---------- */
    var st, sv;
    function setStatus(s) { $('saved').textContent = s; }
    function save() {
        try { setStatus('Saving to cloud…'); window.dispatchEvent(new CustomEvent('papercut:save-request', { detail: { title: titleIn.value, content: toFountain() } })); }
        catch (err) { setStatus('Not saved: browser storage is off'); }
    }
    function changed() {
        setStatus('Editing…');
        clearTimeout(st); st = setTimeout(update, 120);
        clearTimeout(sv); sv = setTimeout(save, 600);
    }
    titleIn.addEventListener('input', function () { beforeEdit(); changed(); });

    /* ---------- Fountain ---------- */
    function fountainOf(list, title) {
        var d = list.filter(function (b) { return b.x.trim(); }), out = '', ti = (title || '').trim();
        if (ti) out += 'Title: ' + ti + '\n\n';
        d.forEach(function (b, i) {
            var p = d[i - 1], x = b.x.replace(/\s+$/, '');
            if (b.t === 'scene') {
                x = x.toUpperCase();
                if (!SCN.test(x)) x = '.' + x;
            } else if (b.t === 'character') {
                x = x.toUpperCase();
                if (!/[A-Z]/.test(x)) x = '@' + x;
                if (b.c) x += " (CONT'D)";
            } else if (b.t === 'paren') {
                x = '(' + x.replace(/^\(|\)$/g, '') + ')';
            } else if (b.t === 'transition') {
                x = x.toUpperCase();
                if (!/TO:$/.test(x)) x = '> ' + x;
            } else if (b.t === 'action') {
                // Agar action line kisi character/dialogue/paren ke turant baad aa rahi hai,
                // toh Fountain format mein usko dialogue banne se rokne ke liye '!' force karna zaroori hai.
                var afterDialogueContext = p && (p.t === 'character' || p.t === 'dialogue' || p.t === 'paren');
                if (afterDialogueContext || (x === x.toUpperCase() && /[A-Z]/.test(x))) {
                    if (x[0] !== '!') x = '!' + x;
                }
            }
            var joined = (b.t === 'dialogue' || b.t === 'paren') && p && (p.t === 'character' || p.t === 'paren' || p.t === 'dialogue');
            out += (i === 0 ? '' : joined ? '\n' : '\n\n') + x;
            /* Scene notes travel as a Fountain note, [[like this]], right under the heading. */
            if (b.t === 'scene' && b.n && b.n.trim()) out += '\n\n[[' + b.n.trim().replace(/\n\s*\n+/g, '\n').replace(/\]\]/g, '] ]') + ']]';
        });
        return out + '\n';
    }
    function toFountain() { refreshContd(); return fountainOf(data(true), titleIn.value); }
    /* How pasted or loaded Fountain text is read:
       - a line starting with ! is action, @ is a character, . is a scene heading
       - INT. / EXT. (and friends) is a scene heading, CUT TO: style lines are transitions
       - any other line in ALL CAPS is a character
       - lines right after a character, with no gap, are dialogue (a line in brackets is a parenthetical)
       - a blank line ends the dialogue; whatever comes next is action
       - [[text]] under a scene heading becomes that scene's note */
    function parseFountain(src) {
        var lines = String(src).replace(/\r\n?/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').split('\n'), i = 0, title = '', out = [], ctx = '', joinable = false;
        var KEYS = /^(title|credit|authors?|source|draft date|date|contact|copyright)\s*:/i;
        function plain(s) {
            return s.replace(/\[\[[\s\S]*?\]\]/g, '').replace(/\*\*\*(.+?)\*\*\*/g, '$1').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1').replace(/(^|\s)_(.+?)_(?=\s|[.,!?;:)]|$)/g, '$1$2').trim();
        }
        function isTransition(l) { return /^(?:CUT TO:|MATCH CUT TO:|SMASH CUT TO:|JUMP CUT TO:|FADE IN:|FADE OUT\.?|FADE TO BLACK\.?|DISSOLVE TO:|WIPE TO:|IRIS OUT\.?|THE END\.?|END\.)$/i.test(l) || /^[A-Z0-9 .,'’()\-]+TO:$/.test(l); }
        function isCharacter(l) {
            var x = l.replace(/^@/, '').replace(/\s*\^$/, '').replace(/:$/, '').trim();
            return x.length > 0 && x.length < 45 && /[A-Z]/.test(x) && x === x.toUpperCase() && !/[.!?]$/.test(x) && !isTransition(x) && !SCN.test(x) && !/^\(.+\)$/.test(x);
        }
        while (i < lines.length && !lines[i].trim()) i++;
        if (i < lines.length && KEYS.test(lines[i].trim())) {
            while (i < lines.length && lines[i].trim()) {
                var m = lines[i].match(/^\s*([A-Za-z ]+):\s*(.*)$/);
                if (m && /^title$/i.test(m[1])) {
                    title = m[2].trim();
                    if (!title && i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1])) title = lines[i + 1].trim();
                }
                i++;
            }
            title = plain(title);
        }
        for (; i < lines.length; i++) {
            var l = lines[i].trim();
            if (!l) { ctx = ''; joinable = false; continue; }
            if (l.slice(0, 2) === '[[') {
                var note = l;
                while (note.indexOf(']]') < 0 && i + 1 < lines.length && lines[i + 1].trim()) { i++; note += '\n' + lines[i].trim(); }
                var nm = note.match(/^\[\[([\s\S]*?)\]\]/), last = out[out.length - 1];
                if (nm && last && last.t === 'scene' && !last.n) last.n = nm[1].trim();
                l = note.replace(/^\[\[[\s\S]*?\]\]/, '').trim();
                if (!l) continue;
            }
            if (/^={3,}$/.test(l) || /^#+\s/.test(l) || /^=\s/.test(l)) continue;
            var t = 'action', x = l, forced = false;
            if (l[0] === '!') { x = l.slice(1); ctx = ''; forced = true; }
            else if (l[0] === '@') { t = 'character'; x = l.slice(1); ctx = 'char'; }
            else if (l[0] === '.' && l[1] !== '.') { t = 'scene'; x = l.slice(1); ctx = ''; }
            else if (SCN.test(l)) { t = 'scene'; ctx = ''; }
            else if (l[0] === '>' && !/<\s*$/.test(l)) { t = 'transition'; x = l.slice(1); ctx = ''; }
            else if (isTransition(l)) { t = 'transition'; ctx = ''; }
            else if (ctx && /^\(.*\)$/.test(l)) { t = 'paren'; x = l.slice(1, -1); ctx = 'paren'; }
            else if (isCharacter(l)) { t = 'character'; ctx = 'char'; }
            else if (ctx) { t = 'dialogue'; ctx = 'dlg'; }
            else { if (l[0] === '>') x = l.replace(/^>\s*/, '').replace(/\s*<$/, ''); ctx = ''; }
            x = plain(x);
            if (t === 'scene') x = x.replace(/\s*#[^#\s]+#\s*$/, '');
            if (t === 'character') x = x.replace(/\s*\^$/, '').replace(/:$/, '').replace(/\s*\((?:CONT'?D|CONTINUED)\)\s*$/i, '').trim();
            if (!x) continue;
            /* Consecutive action lines with no gap are one paragraph. */
            if (t === 'action' && !forced && joinable && out.length && out[out.length - 1].t === 'action') { out[out.length - 1].x += ' ' + x; continue; }
            out.push({ t: t, x: x });
            joinable = t === 'action' && !forced;
        }
        if (!out.length) out.push({ t: 'action', x: '' });
        return { title: title, blocks: out };
    }
    function flash(btn, txt) {
        var o = btn.dataset.o || btn.textContent; btn.dataset.o = o; btn.textContent = txt;
        setTimeout(function () { btn.textContent = o; }, 1500);
    }
    $('fbtn').addEventListener('click', function () { fta.value = toFountain(); sheet.hidden = false; fta.focus(); });
    $('fclose').addEventListener('click', function () { sheet.hidden = true; });
    sheet.addEventListener('mousedown', function (e) { if (e.target === sheet) sheet.hidden = true; });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !sheet.hidden) sheet.hidden = true; });
    $('fcopy').addEventListener('click', function () {
        var btn = $('fcopy');
        function fb() {
            fta.focus(); fta.select();
            try { document.execCommand('copy') ? flash(btn, 'Copied') : flash(btn, 'Press Ctrl+C'); } catch (err) { flash(btn, 'Press Ctrl+C'); }
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(fta.value).then(function () { flash(btn, 'Copied'); }, fb);
        } else fb();
    });
    $('fload').addEventListener('click', function () {
        if (!fta.value.trim()) return;
        snapshot();
        var r = parseFountain(fta.value);
        render(r.blocks); if (r.title) titleIn.value = r.title;
        sheet.hidden = true; var first = paper.firstElementChild; if (first) { setCaret(first, first.textContent.length); setCur(first); } changed();
    });

    /* ---------- Final Draft (.fdx) ---------- */
    var FDX_TYPES = { scene: 'Scene Heading', action: 'Action', character: 'Character', paren: 'Parenthetical', dialogue: 'Dialogue', transition: 'Transition' };
    function esc(s) {
        return String(s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    /* The text of a block the way it reads on the page. */
    function elementText(b) {
        var x = b.x.replace(/\s+$/, '');
        if (b.t === 'scene' || b.t === 'character' || b.t === 'transition') x = x.toUpperCase();
        if (b.t === 'paren') x = '(' + x.replace(/^\(|\)$/g, '') + ')';
        if (b.t === 'character' && b.c) x += " (CONT'D)";
        return x;
    }
    function exportList() { refreshContd(); return data(true).filter(function (b) { return b.x.trim(); }); }
    function buildFdx() {
        var list = exportList(), ti = titleIn.value.trim(), sceneNo = 0;
        var xml = '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n<FinalDraft DocumentType="Script" Template="No" Version="5">\n  <Content>\n';
        list.forEach(function (b) {
            var num = '';
            if (b.t === 'scene') { sceneNo++; num = ' Number="' + sceneNo + '"'; }
            xml += '    <Paragraph' + num + ' Type="' + FDX_TYPES[b.t] + '">\n      <Text>' + esc(elementText(b)) + '</Text>\n    </Paragraph>\n';
        });
        xml += '  </Content>\n';
        if (ti) xml += '  <TitlePage>\n    <Content>\n      <Paragraph Alignment="Center">\n        <Text>' + esc(ti.toUpperCase()) + '</Text>\n      </Paragraph>\n    </Content>\n  </TitlePage>\n';
        return xml + '</FinalDraft>\n';
    }

    /* ---------- Word (.docx) ----------
       A .docx is a zip of XML parts. The zip is written here (stored, no compression), so no library is needed.
       Page: US Letter, Courier New 12pt, 1.5in left margin, 1in other margins, page number top right from page 2. */
    var CRC_TABLE = null;
    function crc32(bytes) {
        if (!CRC_TABLE) {
            CRC_TABLE = [];
            for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++)c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC_TABLE[n] = c >>> 0; }
        }
        var crc = 0xFFFFFFFF;
        for (var i = 0; i < bytes.length; i++)crc = CRC_TABLE[(crc ^ bytes[i]) & 255] ^ (crc >>> 8);
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    function zipStore(files, mime) {
        var enc = new TextEncoder(), chunks = [], dir = [], offset = 0, now = new Date();
        var dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
        var dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
        files.forEach(function (f) {
            var name = enc.encode(f.name), body = enc.encode(f.data), crc = crc32(body);
            var head = new DataView(new ArrayBuffer(30));
            head.setUint32(0, 0x04034b50, true); head.setUint16(4, 20, true); head.setUint16(6, 0x0800, true); head.setUint16(8, 0, true);
            head.setUint16(10, dosTime, true); head.setUint16(12, dosDate, true); head.setUint32(14, crc, true);
            head.setUint32(18, body.length, true); head.setUint32(22, body.length, true); head.setUint16(26, name.length, true); head.setUint16(28, 0, true);
            chunks.push(new Uint8Array(head.buffer), name, body);
            var ent = new DataView(new ArrayBuffer(46));
            ent.setUint32(0, 0x02014b50, true); ent.setUint16(4, 20, true); ent.setUint16(6, 20, true); ent.setUint16(8, 0x0800, true); ent.setUint16(10, 0, true);
            ent.setUint16(12, dosTime, true); ent.setUint16(14, dosDate, true); ent.setUint32(16, crc, true);
            ent.setUint32(20, body.length, true); ent.setUint32(24, body.length, true); ent.setUint16(28, name.length, true);
            ent.setUint32(42, offset, true);
            dir.push(new Uint8Array(ent.buffer), name);
            offset += 30 + name.length + body.length;
        });
        var dirSize = 0;
        dir.forEach(function (c) { dirSize += c.length; });
        var end = new DataView(new ArrayBuffer(22));
        end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
        end.setUint32(12, dirSize, true); end.setUint32(16, offset, true);
        return new Blob(chunks.concat(dir, [new Uint8Array(end.buffer)]), { type: mime });
    }
    var DOCX_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    var DOCX_STYLES = { scene: 'SceneHeading', action: 'Action', character: 'Character', paren: 'Parenthetical', dialogue: 'Dialogue', transition: 'Transition' };
    var DOCX_PAGE = '<w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="2160" w:header="720" w:footer="720" w:gutter="0"/>';
    function docxStyle(id, name, ppr, rpr) {
        return '<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + name + '"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr>' + ppr + '</w:pPr>' + (rpr ? '<w:rPr>' + rpr + '</w:rPr>' : '') + '</w:style>';
    }
    function buildDocx() {
        var list = exportList(), ti = titleIn.value.trim(), body = '';
        if (ti) {
            body += '<w:p><w:pPr><w:spacing w:before="4320" w:after="0"/><w:jc w:val="center"/></w:pPr><w:r><w:t xml:space="preserve">' + esc(ti.toUpperCase()) + '</w:t></w:r></w:p>';
            body += '<w:p><w:pPr><w:sectPr>' + DOCX_PAGE + '</w:sectPr></w:pPr></w:p>';
        }
        list.forEach(function (b) {
            body += '<w:p><w:pPr><w:pStyle w:val="' + DOCX_STYLES[b.t] + '"/></w:pPr><w:r><w:t xml:space="preserve">' + esc(elementText(b)) + '</w:t></w:r></w:p>';
        });
        body += '<w:sectPr><w:headerReference w:type="default" r:id="rId2"/>' + DOCX_PAGE + '<w:pgNumType w:start="1"/><w:titlePg/></w:sectPr>';
        var head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
        var styles = head + '<w:styles ' + DOCX_NS + '><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Courier New" w:hAnsi="Courier New" w:eastAsia="Courier New" w:cs="Courier New"/><w:sz w:val="24"/><w:szCs w:val="24"/><w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="0" w:line="240" w:lineRule="exact"/></w:pPr></w:pPrDefault></w:docDefaults>'
            + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>'
            + docxStyle('SceneHeading', 'Scene Heading', '<w:keepNext/><w:spacing w:before="480"/>', '<w:b/><w:caps/>')
            + docxStyle('Action', 'Action', '<w:spacing w:before="240"/>', '')
            + docxStyle('Character', 'Character', '<w:keepNext/><w:spacing w:before="240"/><w:ind w:left="2880" w:right="720"/>', '<w:caps/>')
            + docxStyle('Parenthetical', 'Parenthetical', '<w:keepNext/><w:ind w:left="2160" w:right="3312"/>', '')
            + docxStyle('Dialogue', 'Dialogue', '<w:ind w:left="1440" w:right="2160"/>', '')
            + docxStyle('Transition', 'Transition', '<w:spacing w:before="240"/><w:jc w:val="right"/>', '<w:caps/>')
            + '</w:styles>';
        var header = head + '<w:hdr ' + DOCX_NS + '><w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>2</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r><w:r><w:t>.</w:t></w:r></w:p></w:hdr>';
        var core = head + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + esc(ti || 'Screenplay') + '</dc:title><dc:creator>Papercut</dc:creator></cp:coreProperties>';
        var files = [
            { name: '[Content_Types].xml', data: head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
            { name: '_rels/.rels', data: head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
            { name: 'word/_rels/document.xml.rels', data: head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/></Relationships>' },
            { name: 'word/document.xml', data: head + '<w:document ' + DOCX_NS + '><w:body>' + body + '</w:body></w:document>' },
            { name: 'word/styles.xml', data: styles },
            { name: 'word/header1.xml', data: header },
            { name: 'docProps/core.xml', data: core }
        ];
        return zipStore(files, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    }

    /* ---------- PDF (US Letter, Courier 12pt, same page plan as the editor) ---------- */
    function wrapLines(s, w) {
        var out = [], cur = '';
        s.split(/\s+/).forEach(function (wd) {
            if (!wd) return;
            while (wd.length > w) { if (cur) { out.push(cur); cur = ''; } out.push(wd.slice(0, w)); wd = wd.slice(w); }
            if (!cur) cur = wd; else if (cur.length + 1 + wd.length <= w) cur += ' ' + wd; else { out.push(cur); cur = wd; }
        });
        if (cur || !out.length) out.push(cur);
        return out;
    }
    function clean(s) {
        return s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/—/g, '--').replace(/–/g, '-').replace(/…/g, '...').replace(/[^\x00-\xFF]/g, '?');
    }
    var IND = { scene: 0, action: 0, character: 20, paren: 15, dialogue: 10, transition: 0 };
    var CONTD = " (CONT'D)";
    /* The PDF copies the editor exactly: same blocks (blank ones included), same line breaks as the browser
       laid them out, same page plan. Line breaks are read back from the clean layout of each block. */
    function pdfItems() {
        refreshContd();
        var em = parseFloat(getComputedStyle(paper).fontSize) || 16, bl = Array.prototype.slice.call(paper.children);
        clearLayout(bl);
        var items = measureItems(bl, em);
        items.forEach(function (it, i) {
            var b = bl[i], txt = b.textContent, lines = null;
            it.contd = !!b.dataset.contd;
            if (it.n > 1 && txt) {
                var offs = [0], ok = true;
                for (var j = 1; j < it.n; j++) {
                    var o = lineStart(b, j, em);
                    if (o <= offs[offs.length - 1] || o >= txt.length) { ok = false; break; }
                    offs.push(o);
                }
                if (ok) lines = offs.map(function (o, j) { return txt.slice(o, j + 1 < offs.length ? offs[j + 1] : txt.length); });
            }
            /* (CONT'D) is drawn by CSS, so it is not in the text: add it to the last line, or wrap with it. */
            if (lines) { if (it.contd) lines[lines.length - 1] += CONTD; }
            else lines = it.n > 1 ? wrapLines(txt + (it.contd ? CONTD : ''), W[it.t]) : [txt + (it.contd ? CONTD : '')];
            it.lines = lines.map(function (l) { return l.replace(/\s+$/, ''); });
            it.n = it.lines.length;
        });
        update();
        return items;
    }
    function buildPdf() {
        var J = window.jspdf && window.jspdf.jsPDF;
        if (!J) return null;
        var items = pdfItems(), k;
        items.forEach(function (it) {
            var L = it.lines.length;
            it.lines = it.lines.map(function (l, j) {
                var x = clean(l);
                if (it.t === 'scene' || it.t === 'character' || it.t === 'transition') x = x.toUpperCase();
                if (it.t === 'paren') { if (j === 0) x = '(' + x; if (j === L - 1) x += ')'; }
                return x;
            });
            it.blank = !it.lines.some(function (l) { return l.trim(); });
        });
        var P = plan(items), last = -1;
        items.forEach(function (it, i) {
            if (it.blank) return;
            last = Math.max(last, P.split[i] ? P.at2[i][0] : P.at[i][0]);
        });
        if (last < 0) return null;
        var pages = last + 1;
        var doc = new J({ unit: 'pt', format: 'letter' }), ti = clean(titleIn.value.trim()), base = 0;
        doc.setFontSize(12);
        if (ti) { doc.setFont('courier', 'normal'); doc.text(ti.toUpperCase(), 306, 300, { align: 'center' }); doc.addPage(); base = 1; }
        for (k = 1; k < pages; k++)doc.addPage();
        items.forEach(function (it, i) {
            if (it.blank) return;
            doc.setFont('courier', it.t === 'scene' ? 'bold' : 'normal');
            var s = P.split[i];
            var segs = s ? [{ p: P.at[i][0], y: P.at[i][1], a: 0, b: s.at }, { p: P.at2[i][0], y: 0, a: s.at, b: it.n }] : [{ p: P.at[i][0], y: P.at[i][1], a: 0, b: it.n }];
            segs.forEach(function (sg) {
                doc.setPage(base + sg.p + 1);
                for (var r = sg.a; r < sg.b; r++) {
                    var ln = it.lines[r], x = 108 + IND[it.t] * 7.2;
                    if (it.t === 'transition') x = 108 + 60 * 7.2 - ln.length * 7.2;
                    doc.text(ln, x, 72 + (sg.y + r - sg.a) * 12 + 9.6);
                }
            });
        });
        doc.setFont('courier', 'normal');
        for (k = 1; k < pages; k++) { doc.setPage(base + k + 1); doc.text((k + 1) + '.', 540, 45.6, { align: 'right' }); }
        return doc.output('blob');
    }

    /* ---------- export menu ---------- */
    var exportBtn = $('exportBtn'), exportList_ = $('exportList'), notifyTimer;
    function plainDownload(blob, name) {
        var u = URL.createObjectURL(blob), a = document.createElement('a');
        a.href = u; a.download = name; document.body.append(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(u); }, 4000);
    }
    function saveFile(blob, name) {
        return new Promise(function (resolve) {
            if (window.claude && typeof window.claude.use === 'function') {
                window.claude.use('downloads').then(function (d) {
                    if (!d) { plainDownload(blob, name); resolve('saved'); return; }
                    d.save({ filename: name, data: blob }).then(function () { resolve('saved'); }, function (err) { resolve(err && err.code === 'declined' ? 'cancelled' : 'failed'); });
                }, function () { plainDownload(blob, name); resolve('saved'); });
            } else { plainDownload(blob, name); resolve('saved'); }
        });
    }
    function notify(msg) {
        setStatus(msg);
        clearTimeout(notifyTimer);
        notifyTimer = setTimeout(function () { setStatus('Saved'); }, 3000);
    }
    function fileBase() { return (titleIn.value.trim() || 'screenplay').replace(/[^\w\- ]+/g, '').replace(/\s+/g, '-').toLowerCase() || 'screenplay'; }
    function runExport(kind) {
        var name = fileBase(), blob = null;
        try {
            if (kind === 'pdf') {
                if (!window.jspdf) { notify('PDF tool could not load'); return; }
                blob = buildPdf(); name += '.pdf';
            } else if (kind === 'fountain') {
                blob = new Blob([toFountain()], { type: 'text/plain;charset=utf-8' }); name += '.fountain';
            } else if (kind === 'fdx') {
                blob = new Blob([buildFdx()], { type: 'application/xml' }); name += '.fdx';
            } else if (kind === 'docx') {
                blob = buildDocx(); name += '.docx';
            } else if (kind === 'wpcut') {
                blob = buildWpcut(); name += '.wpcut';
            }
        } catch (err) { notify('Export failed'); return; }
        if (!blob) { notify('Nothing to export yet'); return; }
        saveFile(blob, name).then(function (r) { notify(r === 'saved' ? 'Exported ' + name : r === 'cancelled' ? 'Export cancelled' : 'Could not save ' + name); });
    }
    function setMenu(open) { exportList_.hidden = !open; exportBtn.setAttribute('aria-expanded', String(open)); }
    exportBtn.addEventListener('click', function () { setMenu(exportList_.hidden); });
    document.addEventListener('mousedown', function (e) { if (!exportList_.hidden && !$('exportMenu').contains(e.target)) setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !exportList_.hidden) { setMenu(false); exportBtn.focus(); } });
    [['pdfbtn', 'pdf'], ['exfountain', 'fountain'], ['exfdx', 'fdx'], ['exdocx', 'docx'], ['exwpcut', 'wpcut']].forEach(function (p) {
        $(p[0]).addEventListener('click', function () { setMenu(false); runExport(p[1]); });
    });

    /*PURE-START*/
    /* ---------- Import: shared helpers ---------- */
    var TYPE_IDS = T.map(function (t) { return t.id; });
    function cleanText(s) {
        return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u200B\uFEFF]/g, '').replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function stripBom(s) { return String(s).replace(/^\uFEFF/, ''); }
    function titleFromFile(name) { return String(name || '').replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    /* Exported titles are printed in capitals; bring "NIGHT REEL" back to "Night Reel". */
    function nicerTitle(s) {
        s = cleanText(s);
        if (s && s === s.toUpperCase() && /[A-Z]/.test(s)) s = s.toLowerCase().replace(/(^|[\s\-(“"'])([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
        return s;
    }
    function stripContd(x) { return x.replace(/\s*\((?:CONT'?D|CONTINUED)\.?\)\s*/ig, ' ').replace(/\s*\^$/, '').replace(/\s+/g, ' ').trim(); }

    /* ---------- Import: Final Draft (.fdx) ----------
       An .fdx is XML. Every <Paragraph Type="..."> is one element; its text is split over <Text> runs.
       Notes attached to a scene heading (<ScriptNote>) become that scene's note. */
    var FDX_IN = {
        'scene heading': 'scene', 'action': 'action', 'general': 'action', 'shot': 'action',
        'character': 'character', 'parenthetical': 'paren', 'dialogue': 'dialogue', 'transition': 'transition'
    };
    function fdxParagraphText(p) {
        var s = '';
        for (var c = p.firstElementChild; c; c = c.nextElementSibling) if (c.nodeName === 'Text') s += c.textContent;
        return s;
    }
    function parseFdx(src) {
        var xml = new DOMParser().parseFromString(stripBom(src), 'application/xml');
        if (xml.getElementsByTagName('parsererror').length || !xml.documentElement || xml.documentElement.nodeName !== 'FinalDraft') throw new Error('This is not a valid Final Draft (.fdx) file.');
        var root = xml.documentElement, content = null, title = '', k, c;
        for (c = root.firstElementChild; c; c = c.nextElementSibling) if (c.nodeName === 'Content') { content = c; break; }
        if (!content) throw new Error('No script content found in this .fdx file.');
        var out = [], paras = content.getElementsByTagName('Paragraph');
        for (k = 0; k < paras.length; k++) {
            var p = paras[k], inNote = false, a = p.parentNode;
            while (a && a !== content) { if (a.nodeName === 'ScriptNote') { inNote = true; break; } a = a.parentNode; }
            if (inNote) continue;
            var type = FDX_IN[String(p.getAttribute('Type') || 'Action').toLowerCase()];
            if (!type) { if (/^(cast list|new act|end of act)$/i.test(p.getAttribute('Type') || '')) continue; type = 'action'; }
            var x = cleanText(fdxParagraphText(p));
            if (type === 'character') x = stripContd(x);
            if (type === 'paren') x = x.replace(/^\(\s*/, '').replace(/\s*\)$/, '').trim();
            if (!x) continue;
            var rec = { t: type, x: x };
            if (type === 'scene') {
                var notes = p.getElementsByTagName('ScriptNote'), nt = [], j;
                for (j = 0; j < notes.length; j++) {
                    var np = notes[j].getElementsByTagName('Paragraph'), s = '', q;
                    for (q = 0; q < np.length; q++) s += (s ? '\n' : '') + cleanText(fdxParagraphText(np[q]));
                    if (s.trim()) nt.push(s.trim());
                }
                if (nt.length) rec.n = nt.join('\n');
            }
            out.push(rec);
        }
        var tp = null;
        for (c = root.firstElementChild; c; c = c.nextElementSibling) if (c.nodeName === 'TitlePage') { tp = c; break; }
        if (tp) {
            var tps = tp.getElementsByTagName('Paragraph');
            for (k = 0; k < tps.length && !title; k++) title = cleanText(fdxParagraphText(tps[k]));
        }
        return { title: nicerTitle(title), blocks: out };
    }

    /* ---------- Import: PDF ----------
       pdf.js gives every piece of text with its position on the page. A screenplay PDF is typeset on a fixed
       grid (Courier 12pt), so the left edge of a line tells its element type:
         left margin ........ scene heading / action / transition (told apart by the words)
         about 1.0in in ..... dialogue        about 1.5in in ..... parenthetical
         about 2.0-2.2in in . character cue   far right ........... transition
       Margins are measured from the page itself (the leftmost text column), so Letter, A4 and shifted margins all work.
       Page numbers, CONTINUED: / (MORE) marks and scene numbers in the margins are removed. */
    var PDF_TRANS = /^(?:CUT TO:|MATCH CUT TO:|SMASH CUT TO:|JUMP CUT TO:|FADE IN:|FADE OUT\.?|FADE TO BLACK\.?|DISSOLVE TO:|WIPE TO:|IRIS OUT\.?|THE END\.?|END\.)$/i;
    function pdfIsTransition(l) { return PDF_TRANS.test(l) || /^[A-Z0-9 .,'’()\-]+TO:$/.test(l); }
    function median(a) { if (!a.length) return 0; var s = a.slice().sort(function (x, y) { return x - y; }); return s[s.length >> 1]; }
    function pctile(a, p) { if (!a.length) return 0; var s = a.slice().sort(function (x, y) { return x - y; }); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }
    function joinPdfItems(its) {
        var out = '', prev = null;
        its.forEach(function (it) {
            var s = it.s;
            if (prev && it.x - (prev.x + prev.w) > it.fs * 0.15 && !/\s$/.test(out) && !/^\s/.test(s)) out += ' ';
            out += s; prev = it;
        });
        return out.replace(/\s+/g, ' ').trim();
    }
    var SCNUM = /^\d{1,4}[A-Z]{0,2}\.?$/;
    function pdfPageLines(pg, pi) {
        var its = pg.items.filter(function (i) { return i.s && i.s.trim(); }), rows = [], row = null, lines = [];
        its.sort(function (a, b) { return a.y - b.y || a.x - b.x; });
        its.forEach(function (it) {
            if (row && Math.abs(it.y - row.y) <= Math.max(2, it.fs * 0.35)) row.items.push(it);
            else { row = { y: it.y, items: [it] }; rows.push(row); }
        });
        rows.forEach(function (r) {
            var a = r.items.sort(function (p, q) { return p.x - q.x; }), fs = 0;
            a.forEach(function (i) { fs = Math.max(fs, i.fs); });
            if (r.y < 62 || pg.h - r.y < 50) return;                        /* running header, footer, page number */
            if (a.length > 1 && SCNUM.test(a[0].s.trim()) && a[1].x - (a[0].x + a[0].w) > fs * 2 && SCN.test(joinPdfItems(a.slice(1)))) a = a.slice(1);
            if (a.length > 1 && SCNUM.test(a[a.length - 1].s.trim()) && a[a.length - 1].x - (a[a.length - 2].x + a[a.length - 2].w) > fs * 3 && SCN.test(joinPdfItems(a.slice(0, -1)))) a = a.slice(0, -1);
            var text = joinPdfItems(a);
            if (!text) return;
            if (/^\(?CONTINUED:?\)?(?:\s*\(?\d+\)?)?$/i.test(text) || /^\(?CONT'?D\.?\)?$/i.test(text)) return;
            var last = a[a.length - 1], ln = { pg: pi, y: r.y, x0: a[0].x, x1: last.x + last.w, text: text, fs: fs };
            if (/^\(MORE\)$/i.test(text)) ln.mark = 'more';
            lines.push(ln);
        });
        return lines;
    }
    function pdfToBlocks(pages, fileTitle) {
        var perPage = pages.map(function (pg, i) { return pdfPageLines(pg, i); }), total = 0;
        perPage.forEach(function (a) { total += a.length; });
        if (!total) throw new Error('No selectable text found in this PDF. If it is a scan, run OCR on it first.');
        /* A first page with no scene heading, no FADE IN: and only a few lines is the title page. */
        var title = '', first = 0, p0 = perPage[0];
        function hasScene(arr) { return arr.some(function (l) { return SCN.test(l.text) || /^FADE IN:?$/i.test(l.text); }); }
        if (perPage.length > 1 && p0.length && p0.length <= 25 && !hasScene(p0) && perPage.slice(1).some(hasScene)) {
            first = 1;
            var tl = [], gapMax = p0[0].fs * 2.4;
            for (var q = 0; q < p0.length; q++) { if (q && p0[q].y - p0[q - 1].y > gapMax) break; tl.push(p0[q].text); }
            title = nicerTitle(tl.join(' '));
        }
        var lines = [];
        perPage.forEach(function (a, i) { if (i >= first) a.forEach(function (l) { lines.push(l); }); });
        var body = lines.filter(function (l) { return !l.mark; });
        if (!body.length) throw new Error('No script text found in this PDF.');
        /* Left margin = leftmost column that holds a real share of the lines. */
        var fsMed = median(body.map(function (l) { return l.fs; })) || 12, step = Math.max(2, fsMed * 0.35), bins = {}, need = Math.max(2, Math.ceil(body.length * 0.04));
        body.forEach(function (l) { var k = Math.round(l.x0 / step); (bins[k] = bins[k] || []).push(l.x0); });
        var keys = Object.keys(bins).map(Number).sort(function (a, b) { return a - b; }), base = body[0].x0;
        for (var bi = 0; bi < keys.length; bi++) if (bins[keys[bi]].length >= need) { base = median(bins[keys[bi]]); break; }
        /* Normal line spacing, so a bigger jump means a blank line. */
        var diffs = [];
        for (var di = 1; di < body.length; di++) { var d = body[di].y - body[di - 1].y; if (body[di].pg === body[di - 1].pg && d >= fsMed * 0.8 && d <= fsMed * 1.8) diffs.push(d); }
        var lh = median(diffs) || fsMed;
        body.forEach(function (l) {
            var dx = l.x0 - base;
            l.k = dx >= 200 ? 'trans' : dx >= 128 ? 'char' : dx >= 90 ? 'paren' : dx >= 20 ? 'dlg' : 'left';
        });
        /* How far a full line reaches, per kind: tells whether a paragraph carries on over a page break. */
        var reach = {};
        ['left', 'dlg'].forEach(function (k) {
            var xs = body.filter(function (l) { return l.k === k; }).map(function (l) { return l.x1; });
            reach[k] = xs.length >= 5 ? pctile(xs, 0.9) : 1e9;
        });
        var blocks = [], prev = null, more = false, lastChar = '', merge = false;
        lines.forEach(function (l) {
            if (l.mark === 'more') { more = true; return; }
            var m = more; more = false;
            var gap = false;
            if (prev) {
                if (prev.pg === l.pg) gap = (l.y - prev.y) > lh * 1.45;
                else gap = !(reach[prev.k] && prev.x1 >= reach[prev.k] - fsMed);
            }
            var last = blocks[blocks.length - 1], t = l.text;
            if (l.k === 'char') {
                var name = stripContd(t);
                if (!name) { prev = l; return; }
                if (m && name.replace(/\s*\([^)]*\)\s*$/, '').toUpperCase() === lastChar && last && last.t === 'dialogue') merge = true;    /* same speaker carries on after (MORE) */
                else { blocks.push({ t: 'character', x: name }); lastChar = name.replace(/\s*\([^)]*\)\s*$/, '').toUpperCase(); merge = false; }
            } else if (l.k === 'paren') {
                var inner = t.replace(/^\(\s*/, '').replace(/\)\s*$/, '');
                if (last && last.t === 'paren' && last.o && !gap) { last.x += ' ' + inner; last.o = !/\)\s*$/.test(t); }
                else { blocks.push({ t: 'paren', x: inner, o: !/\)\s*$/.test(t) }); }
            } else if (l.k === 'dlg') {
                if (last && last.t === 'dialogue' && (merge || m || !gap)) last.x += ' ' + t;
                else blocks.push({ t: 'dialogue', x: t });
                merge = false;
            } else if (l.k === 'trans') {
                blocks.push({ t: 'transition', x: t }); merge = false;
            } else {
                merge = false;
                if (SCN.test(t) || /^\.[A-Za-z]/.test(t)) blocks.push({ t: 'scene', x: t.replace(/^\./, '').replace(/\s*#[^#\s]+#\s*$/, '') });
                else if (pdfIsTransition(t)) blocks.push({ t: 'transition', x: t });
                else if (last && last.t === 'scene' && !gap && prev && prev.k === 'left' && t === t.toUpperCase()) last.x += ' ' + t;
                else if (last && last.t === 'action' && !gap) last.x += ' ' + t;
                else blocks.push({ t: 'action', x: t });
            }
            prev = l;
        });
        blocks.forEach(function (b) { delete b.o; b.x = cleanText(b.x); });
        blocks = blocks.filter(function (b) { return b.x; });
        if (!blocks.length) throw new Error('No script text found in this PDF.');
        return { title: title || fileTitle || '', blocks: blocks, pages: pages.length, titlePage: first === 1 };
    }

    /* ---------- PaperCut file (.wpcut) ----------
       A .wpcut is plain JSON (readable, diff-able) with a version number and a CRC32 checksum of the script:
         { format:"wpcut", version:1, generator, title, createdAt, stats, script:[{type,text,note?}], sceneFolders:[{name,scenes:[n]}], checksum }
       Folders refer to scenes by their number in the script (0 = first scene), so they survive renames. */
    var WPCUT_VERSION = 1;
    function sceneKeysOf(list) {
        var counts = {};
        return list.map(function (b) {
            if (b.t !== 'scene') return null;
            var h = (b.x || '').trim().replace(/\s+/g, ' ').toLowerCase() || 'untitled scene';
            counts[h] = (counts[h] || 0) + 1;
            return h + '||' + counts[h];
        });
    }
    function wpcutChecksum(script) { return 'crc32:' + ('00000000' + crc32(new TextEncoder().encode(JSON.stringify(script))).toString(16)).slice(-8); }
    function parseWpcut(src) {
        var o;
        try { o = JSON.parse(stripBom(src)); } catch (err) { throw new Error('This is not a valid .wpcut file (it could not be read).'); }
        if (!o || o.format !== 'wpcut' || !Array.isArray(o.script)) throw new Error('This is not a PaperCut (.wpcut) file.');
        var warn = '';
        if (typeof o.version === 'number' && o.version > WPCUT_VERSION) warn = 'made by a newer PaperCut, some details may be missing';
        var blocks = [];
        o.script.forEach(function (r) {
            if (!r || typeof r !== 'object') return;
            var t = TYPE_IDS.indexOf(r.type) >= 0 ? r.type : 'action', x = String(r.text == null ? '' : r.text).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
            var rec = { t: t, x: x };
            if (t === 'scene' && r.note) rec.n = String(r.note);
            blocks.push(rec);
        });
        if (o.checksum && !warn && o.checksum !== wpcutChecksum(o.script)) warn = 'the file was edited outside PaperCut';
        var folders = Array.isArray(o.sceneFolders) ? o.sceneFolders.filter(function (g) { return g && typeof g.name === 'string' && Array.isArray(g.scenes); }).map(function (g) {
            return { name: g.name.slice(0, 120), scenes: g.scenes.filter(function (n) { return Number.isInteger(n) && n >= 0; }) };
        }) : [];
        return { title: typeof o.title === 'string' ? o.title.trim() : '', blocks: blocks, folders: folders, warn: warn };
    }
    /*PURE-END*/

    /*WIRE-START*/
    function buildWpcut() {
        refreshContd();
        var all = data(false), keysAll = sceneKeysOf(all).filter(function (k) { return k; });
        var list = all.filter(function (b) { return b.t === 'scene' || b.x.trim(); });
        var script = list.map(function (b) {
            var r = { type: b.t, text: b.x.replace(/\s+$/, '') };
            if (b.t === 'scene' && b.n && b.n.trim()) r.note = b.n.trim();
            return r;
        });
        var folders = [], api = window.papercutSceneGroups;
        if (api) {
            try {
                api.get().forEach(function (g) {
                    var nums = (g.sceneKeys || []).map(function (k) { return keysAll.indexOf(k); }).filter(function (n) { return n >= 0; }).sort(function (a, b) { return a - b; });
                    folders.push({ name: g.name || 'Scene group', scenes: nums });
                });
            } catch (err) { }
        }
        var doc = {
            format: 'wpcut', version: WPCUT_VERSION, generator: 'PaperCut',
            title: titleIn.value.trim(), createdAt: new Date().toISOString(),
            stats: { elements: script.length, scenes: keysAll.length, words: parseInt(String($('wd').textContent).replace(/\D/g, ''), 10) || 0, pages: parseInt($('pg').textContent, 10) || 1 },
            script: script, sceneFolders: folders, checksum: wpcutChecksum(script)
        };
        return new Blob([JSON.stringify(doc, null, 2) + '\n'], { type: 'application/json' });
    }

    /* ---------- Import: reading files and loading them into the editor ---------- */
    var PDFJS_VER = '3.11.174', PDFJS_BASE = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/' + PDFJS_VER + '/';
    var pdfLibPromise = null;
    function loadPdfJs() {
        if (window.pdfjsLib) { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.js'; return Promise.resolve(window.pdfjsLib); }
        if (pdfLibPromise) return pdfLibPromise;
        pdfLibPromise = new Promise(function (resolve, reject) {
            var s = document.createElement('script');
            s.src = PDFJS_BASE + 'pdf.min.js';
            s.onload = function () {
                if (!window.pdfjsLib) { reject(new Error('PDF reader did not start.')); return; }
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_BASE + 'pdf.worker.min.js';
                resolve(window.pdfjsLib);
            };
            s.onerror = function () { pdfLibPromise = null; reject(new Error('Could not load the PDF reader. Check your internet connection.')); };
            document.head.append(s);
        });
        return pdfLibPromise;
    }
    function readPdfPages(buf) {
        return loadPdfJs().then(function (lib) { return lib.getDocument({ data: new Uint8Array(buf) }).promise; }).then(function (doc) {
            var out = [], chain = Promise.resolve();
            function one(n) {
                return doc.getPage(n).then(function (page) {
                    var vp = page.getViewport({ scale: 1 });
                    return page.getTextContent().then(function (tc) {
                        var items = [];
                        tc.items.forEach(function (it) {
                            if (typeof it.str !== 'string' || !it.str.trim()) return;
                            var pt = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
                            items.push({ s: it.str, x: pt[0], y: pt[1], w: it.width || 0, fs: Math.hypot(it.transform[0], it.transform[1]) || it.height || 12 });
                        });
                        out.push({ w: vp.width, h: vp.height, items: items });
                    });
                });
            }
            for (var n = 1; n <= doc.numPages; n++) (function (k) { chain = chain.then(function () { setStatus('Reading PDF page ' + k + ' of ' + doc.numPages + '…'); return one(k); }); })(n);
            return chain.then(function () { return out; });
        }).catch(function (err) {
            if (err && err.name === 'PasswordException') throw new Error('This PDF is password protected. Remove the password and try again.');
            throw err;
        });
    }
    var IMPORT_KINDS = {
        fountain: { accept: '.fountain,.spmd,.txt,text/plain', label: 'Fountain' },
        fdx: { accept: '.fdx,.xml', label: 'Final Draft' },
        pdf: { accept: '.pdf,application/pdf', label: 'PDF' },
        wpcut: { accept: '.wpcut', label: 'PaperCut' }
    };
    function kindFromName(name) {
        var m = /\.([a-z0-9]+)$/i.exec(name || ''), e = m ? m[1].toLowerCase() : '';
        return e === 'fountain' || e === 'spmd' || e === 'txt' ? 'fountain' : e === 'fdx' ? 'fdx' : e === 'pdf' ? 'pdf' : e === 'wpcut' ? 'wpcut' : '';
    }
    function readImport(file, kind) {
        if (kind === 'pdf') return file.arrayBuffer().then(function (buf) { return readPdfPages(buf); }).then(function (pages) { return pdfToBlocks(pages, titleFromFile(file.name)); });
        return file.text().then(function (txt) {
            if (kind === 'fdx') return parseFdx(txt);
            if (kind === 'wpcut') return parseWpcut(txt);
            var r = parseFountain(stripBom(txt));
            return { title: r.title, blocks: r.blocks };
        });
    }
    function applyFolders(folders, blocks) {
        var api = window.papercutSceneGroups;
        if (!api) return;
        var keys = sceneKeysOf(blocks).filter(function (k) { return k; });
        var groups = folders.map(function (g, i) {
            return { id: Date.now().toString(36) + i, name: g.name, sceneKeys: g.scenes.map(function (n) { return keys[n]; }).filter(function (k) { return k; }) };
        });
        try { api.put(groups); setTimeout(function () { try { api.render(); } catch (err) { } }, 400); } catch (err) { }
    }
    function finishImport(res, file, kind) {
        var blocks = res.blocks || [], filled = blocks.filter(function (b) { return b.x.trim(); }).length, scenes = blocks.filter(function (b) { return b.t === 'scene'; }).length;
        if (!filled) throw new Error('No script text found in this file.');
        var hasContent = data().some(function (b) { return b.x.trim(); });
        if (hasContent && !window.confirm('Import "' + file.name + '"?\n' + filled + ' elements, ' + scenes + ' scenes.\n\nThis replaces the current script. You can undo with Ctrl+Z.')) { notify('Import cancelled'); return; }
        snapshot();
        render(blocks);
        var cur_ = titleIn.value.trim(), title = res.title || ((!cur_ || /^(Untitled screenplay|Loading screenplay…)$/.test(cur_)) ? titleFromFile(file.name) : cur_);
        titleIn.value = title;
        if (kind === 'wpcut') applyFolders(res.folders || [], blocks);
        var f = paper.firstElementChild; if (f) { setCaret(f, f.textContent.length); setCur(f); }
        changed();
        notify('Imported ' + file.name + ' · ' + filled + ' elements' + (kind === 'pdf' ? ' (check the element types)' : '') + (res.warn ? ' · ' + res.warn : ''));
    }
    function runImport(file, kind) {
        kind = kind || kindFromName(file.name);
        if (!kind) { notify('Unsupported file type'); window.alert('PaperCut can import .fountain, .fdx, .pdf and .wpcut files.'); return; }
        setStatus('Importing ' + file.name + '…');
        readImport(file, kind).then(function (res) { finishImport(res, file, kind); }).catch(function (err) {
            var msg = (err && err.message) || String(err);
            notify('Import failed');
            window.alert('Could not import ' + file.name + '\n\n' + msg);
        });
    }
    var importBtn = $('importBtn'), importList_ = $('importList'), importFile = $('importFile'), importKind = '';
    function setImportMenu(open) { importList_.hidden = !open; importBtn.setAttribute('aria-expanded', String(open)); }
    importBtn.addEventListener('click', function () { var o = importList_.hidden; setMenu(false); setImportMenu(o); });
    exportBtn.addEventListener('click', function () { if (!exportList_.hidden) setImportMenu(false); });
    document.addEventListener('mousedown', function (e) { if (!importList_.hidden && !$('importMenu').contains(e.target)) setImportMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !importList_.hidden) { setImportMenu(false); importBtn.focus(); } });
    [['imfountain', 'fountain'], ['imfdx', 'fdx'], ['impdf', 'pdf'], ['imwpcut', 'wpcut']].forEach(function (p) {
        $(p[0]).addEventListener('click', function () {
            setImportMenu(false); importKind = p[1];
            importFile.accept = IMPORT_KINDS[p[1]].accept; importFile.value = ''; importFile.click();
        });
    });
    importFile.addEventListener('change', function () {
        var f = importFile.files && importFile.files[0];
        if (f) runImport(f, importKind || kindFromName(f.name));
        importFile.value = '';
    });
    /* Drop a .fountain / .fdx / .pdf / .wpcut file anywhere on the page to import it. */
    document.addEventListener('dragover', function (e) { if (e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], 'Files') >= 0) e.preventDefault(); });
    document.addEventListener('drop', function (e) {
        var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (!f) return;
        var k = kindFromName(f.name);
        e.preventDefault();
        if (k) runImport(f, k); else notify('Unsupported file type');
    });
    /*WIRE-END*/

    /* ---------- toolbar actions ---------- */
    var armed = false, armT;
    $('newbtn').addEventListener('click', function () {
        var btn = $('newbtn');
        if (!armed) {
            armed = true; btn.textContent = 'Clear everything?'; btn.classList.add('primary');
            armT = setTimeout(function () { armed = false; btn.textContent = 'New script'; btn.classList.remove('primary'); }, 3000); return;
        }
        clearTimeout(armT); armed = false; btn.textContent = 'New script'; btn.classList.remove('primary');
        snapshot(); titleIn.value = ''; render([{ t: 'scene', x: '' }]);
        var f = paper.firstElementChild; setCaret(f, 0); setCur(f);
    });
    $('scenesBtn').addEventListener('click', function () { side.classList.toggle('open'); });
    function isDark() {
        var a = document.documentElement.dataset.theme;
        return a ? a === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    $('theme').addEventListener('click', function () {
        var n = isDark() ? 'light' : 'dark';
        document.documentElement.dataset.theme = n;
        try { localStorage.setItem(THEME, n); } catch (err) { }
    });
    try { var th = localStorage.getItem(THEME); if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th; } catch (err) { }

    window.addEventListener('papercut:load-cloud-project', function (event) {
        var detail = event.detail || {};
        titleIn.value = detail.title || 'Untitled screenplay';
        if (detail.content) { var parsedCloud = parseFountain(detail.content); render(parsedCloud.blocks || parsedCloud); }
        else { render([{t:'action',x:''}]); }
        update(); updateInspector(); setStatus('Loaded from Firestore');
    });
    /* ---------- boot ---------- */
    titleIn.value = 'Loading screenplay…';
    render([{ t: 'action', x: '' }]);
    update(); updateInspector(); setStatus('Saved');
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(update);
    var rz; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(update, 200); });
})();


function back()
{
    window.location.href = "../projects/";
}

/* Papercut Story Planner integration: zoom, scene groups and animated right tabs. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const groupParams=new URLSearchParams(location.search); const groupProjectId=groupParams.get('projectId')||groupParams.get('id')||groupParams.get('scriptId')||groupParams.get('project')||'new-script'; const ZKEY='papercut.editor.zoom', GKEY='papercut.sceneGroups:'+groupProjectId, SKEY='papercut.story.cache';
  let zoom=Number(localStorage.getItem(ZKEY)||100), selectedActId=null;
  const paper=$('paper'), page=document.querySelector('.paper'), nav=$('nav');
  function setZoom(v){ zoom=Math.max(60,Math.min(160,v)); if(page) page.style.zoom=(zoom/100); $('zoomLabel').textContent=zoom+'%'; localStorage.setItem(ZKEY,String(zoom)); }
  $('zoomIn')?.addEventListener('click',()=>setZoom(zoom+10)); $('zoomOut')?.addEventListener('click',()=>setZoom(zoom-10)); $('zoomReset')?.addEventListener('click',()=>setZoom(100)); setZoom(zoom);
  document.querySelectorAll('[data-right-tab]').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('[data-right-tab]').forEach(b=>{b.classList.toggle('active',b===btn);b.setAttribute('aria-selected',String(b===btn));});
    document.querySelectorAll('[data-right-panel]').forEach(p=>{const on=p.dataset.rightPanel===btn.dataset.rightTab;p.hidden=!on;p.classList.toggle('active',on);});
  }));
  const storyCacheKey=()=>SKEY+':'+(localStorage.getItem('papercutActiveStoryId')||new URLSearchParams(location.search).get('storyId')||localStorage.getItem('papercutUserId')||'default');
  function readStory(){return window.papercutStoryData||null}
  function writeStory(nextStory){window.papercutStoryData=nextStory;window.dispatchEvent(new CustomEvent('papercut:save-story-request',{detail:{story:nextStory}}));}
  function renderStoryPanel(){const story=readStory(),wrap=$('editorStorySections'),beats=$('editorBeatList');if(!wrap||!beats)return;wrap.replaceChildren();beats.replaceChildren();
    if(!story||!Array.isArray(story.acts)||!story.acts.length){wrap.innerHTML='<p class="muted">No story linked yet. Open Story Planner to create one.</p>';beats.innerHTML='<p class="muted">No beats yet. Add them in Story Planner.</p>';return;}
    story.acts.forEach((act,i)=>{const card=document.createElement('button');card.type='button';card.className='editor-act-card'+(selectedActId===act.id?' selected':'');card.innerHTML='<strong></strong><span></span>';card.querySelector('strong').textContent=act.title||('Act '+(i+1));card.querySelector('span').textContent=(act.story||'').slice(0,120)||'No story text yet';card.addEventListener('click',()=>{selectedActId=act.id;$('editorStoryQuickEdit').value=act.story||'';renderStoryPanel();});wrap.append(card);});
    if(!selectedActId||!story.acts.some(a=>a.id===selectedActId))selectedActId=story.acts[0].id;$('editorStoryQuickEdit').value=story.acts.find(a=>a.id===selectedActId)?.story||'';
    const allItems=Array.isArray(story.plotItems)?story.plotItems:[];if(!allItems.length){beats.innerHTML='<p class="muted">No plot nodes yet. Add sequences, montages, scenes, or beats in Story Planner.</p>';return;}
    const byId=new Map(allItems.map(x=>[x.id,x]));const children=new Map();allItems.forEach(x=>{if(x.parentId&&byId.has(x.parentId)){if(!children.has(x.parentId))children.set(x.parentId,[]);children.get(x.parentId).push(x);}});const seen=new Set();
    const addTreeNode=(item,depth)=>{if(seen.has(item.id))return;seen.add(item.id);const childItems=children.get(item.id)||[];const parent=byId.get(item.parentId);const row=document.createElement('div');row.className='editor-beat-row editor-plot-node'+(item.done?' is-done':'');row.style.setProperty('--plot-depth',Math.min(depth,8));row.dataset.itemId=item.id;
      const cb=document.createElement('input');cb.type='checkbox';cb.checked=!!item.done;cb.title='Mark complete';cb.setAttribute('aria-label','Mark '+(item.title||item.type)+' complete');cb.addEventListener('change',()=>{const s=readStory();const it=(s.plotItems||[]).find(x=>x.id===item.id);if(it){it.done=cb.checked;writeStory(s);renderStoryPanel();}});
      const content=document.createElement('div');content.className='editor-plot-node-content';const title=document.createElement('input');title.className='editor-beat-title';title.value=item.title||'';title.setAttribute('aria-label','Edit '+item.type+' title');title.addEventListener('change',()=>{const s=readStory();const it=(s.plotItems||[]).find(x=>x.id===item.id);if(it){it.title=title.value;writeStory(s);renderStoryPanel();}});
      const meta=document.createElement('small');meta.className='editor-plot-node-meta';meta.textContent=`${item.type} · Parent: ${parent?(parent.title||parent.type):'None'} · ${childItems.length} child${childItems.length===1?'':'ren'}`;
      const childNames=document.createElement('div');childNames.className='editor-plot-child-summary';childNames.textContent=childItems.length?'Children: '+childItems.map(c=>`${c.type}: ${c.title||c.type}`).join(' · '):(item.type==='Sequence'||item.type==='Montage'?'Connected scenes: 0':'Children: None');
      content.append(title,meta,childNames);const del=document.createElement('button');del.type='button';del.className='editor-beat-delete';del.textContent='×';del.title='Delete node';del.addEventListener('click',()=>{if(!confirm(`Delete “${item.title||item.type}”?`))return;const s=readStory();s.plotItems=(s.plotItems||[]).filter(x=>x.id!==item.id);s.plotItems.forEach(x=>{if(x.parentId===item.id)x.parentId='';});writeStory(s);renderStoryPanel();});row.append(cb,content,del);beats.append(row);childItems.forEach(child=>addTreeNode(child,depth+1));};
    allItems.filter(x=>!x.parentId||!byId.has(x.parentId)).forEach(x=>addTreeNode(x,0));allItems.forEach(x=>addTreeNode(x,0));
    const sc=window.papercutCurrentSceneTitle||'';$('editorCurrentScene').textContent=sc||'Select a scene in the script.';
  }
  $('saveEditorStory')?.addEventListener('click',()=>{const s=readStory();if(!s)return;const a=s.acts.find(x=>x.id===selectedActId);if(a){a.story=$('editorStoryQuickEdit').value;writeStory(s);renderStoryPanel();$('saved').textContent='Story saved';}});
  // Folder/file scene grouping. Dragging files changes membership only; script order never changes.
  const groupForm=$('sceneGroupForm'), groupsWrap=$('sceneGroups');
  if(nav)nav.classList.add('scene-nav-source');
  function sceneButtons(){return Array.from(nav.querySelectorAll('.sc'));}
  function normalizedHeading(b){return (b.querySelector('.t')?.textContent||'Untitled scene').trim().replace(/\s+/g,' ').toLowerCase();}
  function sceneKey(b,i){const heading=normalizedHeading(b);const siblings=sceneButtons().slice(0,i+1).filter(x=>normalizedHeading(x)===heading).length;return `${heading}||${siblings}`;}
  function getGroups(){try{return JSON.parse(localStorage.getItem(GKEY)||'[]').map(g=>({...g,sceneKeys:Array.isArray(g.sceneKeys)?g.sceneKeys:[]}));}catch(e){return[]}}
  function putGroups(groups){localStorage.setItem(GKEY,JSON.stringify(groups));}
  function makeSceneFile(button,index){
    const file=document.createElement('button');file.type='button';file.className='scene-file';file.draggable=true;
    file.dataset.sceneKey=sceneKey(button,index);file.dataset.sceneIndex=String(index);
    const icon=document.createElement('span');icon.className='scene-file-icon';icon.textContent='▤';
    const name=document.createElement('span');name.className='scene-file-name';name.textContent=`${index+1}. ${button.querySelector('.t')?.textContent||'Untitled scene'}`;
    const pageNo=document.createElement('small');pageNo.textContent=button.querySelector('.p')?.textContent||'';file.append(icon,name,pageNo);
    file.addEventListener('click',()=>button.click());
    file.addEventListener('dragstart',e=>{e.dataTransfer.setData('text/plain',file.dataset.sceneKey);e.dataTransfer.effectAllowed='move';file.classList.add('dragging');});
    file.addEventListener('dragend',()=>file.classList.remove('dragging'));
    return file;
  }
  const wiredDropZones=new WeakSet();
  function dropZone(el,groupId){if(wiredDropZones.has(el))return;wiredDropZones.add(el);el.addEventListener('dragover',e=>{e.preventDefault();el.classList.add('drop-target');e.dataTransfer.dropEffect='move';});el.addEventListener('dragleave',e=>{if(!el.contains(e.relatedTarget))el.classList.remove('drop-target');});el.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();el.classList.remove('drop-target');const key=e.dataTransfer.getData('text/plain');if(!key)return;const groups=getGroups();groups.forEach(g=>g.sceneKeys=g.sceneKeys.filter(k=>k!==key));if(groupId){const g=groups.find(x=>x.id===groupId);if(g)g.sceneKeys.push(key);}putGroups(groups);renderGroups();});}
  function renderGroups(){
    if(!groupsWrap||!nav)return;
    const scenes=sceneButtons(),keys=scenes.map((b,i)=>sceneKey(b,i)),groups=getGroups();
    scenes.forEach(b=>b.classList.remove('grouped-scene'));
    groupsWrap.replaceChildren();
    // The screenplay navigator is temporarily empty while the editor restores/paginates the script.
    // Never prune saved memberships during that loading window, or groups vanish after reopening.
    if(!scenes.length){const empty=document.createElement('div');empty.className='scene-folder-empty';empty.textContent='Restoring scenes… groups will reappear when the script is ready.';groupsWrap.append(empty);return;}
    // Migrate memberships saved by the older index|heading key format to stable heading/occurrence keys.
    const legacyKeys=scenes.map((b,i)=>[`${i}|${normalizedHeading(b)}`,keys[i]]);
    const legacyMap=new Map(legacyKeys);
    groups.forEach(g=>{g.sceneKeys=g.sceneKeys.map(k=>legacyMap.get(k)||k).filter(k=>keys.includes(k));});
    const firstIndex=g=>Math.min(...g.sceneKeys.map(k=>keys.indexOf(k)).filter(i=>i>=0),Infinity);
    groups.sort((a,b)=>firstIndex(a)-firstIndex(b));putGroups(groups);
    const assigned=new Set(groups.flatMap(g=>g.sceneKeys));
    // A dedicated drop target is necessary because folders stop drop-event bubbling.
    // Users can always drag a scene here to remove it from whichever group owns it.
    const ungroupZone=document.createElement('div');
    ungroupZone.className='scene-ungroup-dropzone';
    ungroupZone.textContent='↥  Drop a scene here to remove it from its group';
    groupsWrap.append(ungroupZone);
    dropZone(ungroupZone,null);
    const renderFolder=g=>{
      const folder=document.createElement('section');folder.className='scene-folder';folder.dataset.groupId=g.id;
      const head=document.createElement('div');head.className='scene-folder-head';
      const icon=document.createElement('span');icon.className='scene-folder-icon';icon.textContent='▰';
      const title=document.createElement('strong');title.textContent=g.name||'Scene group';
      const count=document.createElement('small');count.textContent=String(g.sceneKeys.length);
      const del=document.createElement('button');del.type='button';del.className='scene-folder-delete';del.textContent='×';del.title='Delete folder';del.addEventListener('click',()=>{if(!confirm(`Delete folder “${g.name}”? Scenes will remain in the script.`))return;putGroups(getGroups().filter(x=>x.id!==g.id));renderGroups();});
      head.append(icon,title,count,del);folder.append(head);
      const files=document.createElement('div');files.className='scene-folder-files';
      scenes.forEach((b,i)=>{if(g.sceneKeys.includes(keys[i]))files.append(makeSceneFile(b,i));});
      if(!files.children.length){const empty=document.createElement('div');empty.className='scene-folder-empty';empty.textContent='Drop scenes here';files.append(empty);}
      folder.append(files);dropZone(folder,g.id);groupsWrap.append(folder);
    };
    // Render ungrouped scene files and folders at their chronological anchor position.
    const foldersAt=new Map();groups.forEach(g=>{const idx=firstIndex(g);if(!foldersAt.has(idx))foldersAt.set(idx,[]);foldersAt.get(idx).push(g);});
    scenes.forEach((b,i)=>{
      (foldersAt.get(i)||[]).forEach(renderFolder);
      if(!assigned.has(keys[i])){const file=makeSceneFile(b,i);dropZone(file,null);groupsWrap.append(file);}
    });
    groups.filter(g=>firstIndex(g)===Infinity).forEach(renderFolder);
    if(!scenes.length){const empty=document.createElement('div');empty.className='scene-folder-empty';empty.textContent='Add INT. or EXT. scene headings to create scene files.';groupsWrap.append(empty);}
    groupsWrap.classList.add('scene-groups-dropzone');
    // Dropping onto the general navigator removes a scene from its folder, without changing screenplay order.
    dropZone(groupsWrap,null);
  }
  window.papercutSceneGroups={get:getGroups,put:putGroups,render:renderGroups};
  $('createSceneGroup')?.addEventListener('click',()=>{groupForm.hidden=!groupForm.hidden;if(!groupForm.hidden)$('sceneGroupName').focus();});
  $('cancelSceneGroup')?.addEventListener('click',()=>{groupForm.hidden=true;$('sceneGroupName').value='';});
  $('saveSceneGroup')?.addEventListener('click',()=>{const name=$('sceneGroupName').value.trim();if(!name){alert('Enter a folder name.');return;}const groups=getGroups();groups.push({id:Date.now().toString(36),name,sceneKeys:[]});putGroups(groups);$('sceneGroupName').value='';groupForm.hidden=true;renderGroups();});
  if(nav){new MutationObserver(()=>renderGroups()).observe(nav,{childList:true});}
  window.addEventListener('papercut:story-loaded',renderStoryPanel);
  renderStoryPanel();renderGroups();
})();
