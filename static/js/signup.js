
"use strict";

import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import {
    getFirestore,
    collection,
    doc,
    setDoc,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

import {
    query,
    where,
    getDocs,
} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

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


const signupForm = document.getElementById("signupForm");
const usernameInput = document.getElementById("username");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const termsInput = document.getElementById("terms");

const submitButton = document.getElementById("submitButton");
const formMessage = document.getElementById("formMessage");

const strengthBar = document.getElementById("strengthBar");
const strengthText = document.getElementById("strengthText");

const errors = {
    username: document.getElementById("usernameError"),
    email: document.getElementById("emailError"),
    password: document.getElementById("passwordError"),
    confirmPassword: document.getElementById("confirmPasswordError"),
    terms: document.getElementById("termsError")
};

function setError(field, message) {
    errors[field].textContent = message || "";
}

function clearErrors() {
    Object.keys(errors).forEach(function (field) {
        setError(field, "");
    });
}

function showMessage(message, type) {
    formMessage.textContent = message;
    formMessage.className = "form-message visible " + type;
}

function hideMessage() {
    formMessage.textContent = "";
    formMessage.className = "form-message";
}

function windowLocation(href)
{
    window.location.href = href;
}

/* Show / hide passwords */

document.querySelectorAll(".password-toggle").forEach(function (button) {
    button.addEventListener("click", function () {
        const input = document.getElementById(button.dataset.target);
        const showing = input.type === "text";

        input.type = showing ? "password" : "text";
        button.textContent = showing ? "SHOW" : "HIDE";
        button.setAttribute(
            "aria-label",
            showing ? "Show password" : "Hide password"
        );
    });
});

/* Password strength indicator */

function updatePasswordStrength() {
    const password = passwordInput.value;
    let score = 0;

    if (password.length >= 8) score++;
    if (password.length >= 12) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;

    const levels = [
        { width: "0%", color: "#ff7d91", text: "At least 8 characters" },
        { width: "20%", color: "#ff7d91", text: "Very weak" },
        { width: "40%", color: "#f0ad75", text: "Weak" },
        { width: "60%", color: "#e5d17c", text: "Fair" },
        { width: "80%", color: "#a7c98c", text: "Good" },
        { width: "100%", color: "#8de0b0", text: "Strong" }
    ];

    const level = password.length === 0
        ? levels[0]
        : levels[Math.min(score, 5)];

    strengthBar.style.width = level.width;
    strengthBar.style.background = level.color;
    strengthText.textContent = level.text;
}

passwordInput.addEventListener("input", updatePasswordStrength);

/* Basic form validation */

function validateForm() {
    clearErrors();
    hideMessage();

    let valid = true;

    const username = usernameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmPasswordInput.value;

    if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
        setError(
            "username",
            "Use 3–24 characters: letters, numbers or underscores."
        );
        valid = false;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email)) {
        setError("email", "Enter a valid email address.");
        valid = false;
    }

    if (password.length < 8) {
        setError("password", "Password must contain at least 8 characters.");
        valid = false;
    }

    if (password !== confirmPassword) {
        setError("confirmPassword", "The passwords do not match.");
        valid = false;
    }

    if (!termsInput.checked) {
        setError("terms", "Please agree before continuing.");
        valid = false;
    }

    return valid;
}

/*
 * Demo signup flow for a static GitHub Pages site.
 *
 * Important: hashing in browser JavaScript does NOT make this a secure
 * authentication system. Anyone can inspect client code and may be able
 * to access/alter Firestore if its rules permit anonymous access.
 * Do not use real/reused passwords or store sensitive user data with this
 * prototype. A production app needs a trusted server or an auth provider.
 */

function bytesToBase64Url(bytes) {
    let binary = "";
    bytes.forEach(function (byte) {
        binary += String.fromCharCode(byte);
    });
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomBytes(length) {
    const bytes = new Uint8Array(length);
    crypto.getRandomValues(bytes);
    return bytes;
}

async function hashPasswordInBrowser(password) {
    const iterations = 310000;
    const salt = randomBytes(16);

    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );

    const derivedBits = await crypto.subtle.deriveBits(
        {
            name: "PBKDF2",
            salt: salt,
            iterations: iterations,
            hash: "SHA-256"
        },
        keyMaterial,
        256
    );

    const hash = new Uint8Array(derivedBits);

    return [
        "pbkdf2-sha256",
        String(iterations),
        bytesToBase64Url(salt),
        bytesToBase64Url(hash)
    ].join("$");
}

function setSubmitting(isSubmitting) {
    submitButton.disabled = isSubmitting;
    submitButton.querySelector("span:first-child").textContent =
        isSubmitting ? "Creating account..." : "Create account";
}

signupForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    if (!validateForm()) {
        showMessage("Please check the highlighted fields.", "error");
        return;
    }

    const username = usernameInput.value.trim();
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    setSubmitting(true);
    clearErrors();
    hideMessage();

    try {
        // This prototype writes a new user record without reading the users
        // collection. Duplicate-account enforcement needs a trusted backend.
        const emailQuery = query(
            collection(db, "users"),
            where("email", "==", email)
        );

        const emailSnapshot = await getDocs(emailQuery);

        if (!emailSnapshot.empty) {
            showMessage(
                "An account with this email already exists. Please use another email.",
                "error"
            );
            return;
        }

        const passwordHash = await hashPasswordInBrowser(password);

        // Use a unique Firestore document ID for each account.
        // userId is set to the same value so projects can reference it.
        let userDocument;
        let userId;

        for (let attempt = 0; attempt < 5; attempt++) {
            userDocument = doc(collection(db, "users"));
            userId = userDocument.id;

            const existingUser = await getDocs(
                query(
                    collection(db, "users"),
                    where("userId", "==", userId)
                )
            );

            if (existingUser.empty) {
                break;
            }

            userDocument = null;
            userId = null;
        }

        if (!userDocument || !userId) {
            throw new Error("Could not generate a unique user ID. Please try again.");
        }

        await setDoc(userDocument, {
            userId: userId,
            username: username,
            email: email,
            password: passwordHash,
            createdAt: serverTimestamp()
        });

        localStorage.setItem("userId", userId);

        windowLocation("/papercut/projects.html");

        signupForm.reset();
        strengthBar.style.width = "0%";
        strengthText.textContent = "At least 8 characters";
    } catch (error) {
        console.error("Papercut signup error:", error);

        if (error && (error.code === "permission-denied" ||
            error.code === "firestore/permission-denied")) {
            showMessage(
                "Firestore blocked this request. Check your Firestore Rules. Don't make the whole database publicly readable/writable just to fix this.",
                "error"
            );
        } else if (error && error.code === "unavailable") {
            showMessage("Firestore is temporarily unavailable. Please try again.", "error");
        } else {
            showMessage(
                "Could not create the account. Check the browser console for the exact Firebase error.",
                "error"
            );
        }
    } finally {
        setSubmitting(false);
    }
});

[usernameInput, emailInput, passwordInput, confirmPasswordInput].forEach(
    function (input) {
        input.addEventListener("input", function () {
            hideMessage();
        });
    }
);