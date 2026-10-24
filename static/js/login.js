
"use strict";

import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";

import {
    getFirestore,
    collection,
    query,
    where,
    getDocs
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

function base64UrlToBytes(value) {
    const base64 = value
        .replace(/-/g, "+")
        .replace(/_/g, "/");

    const padded =
        base64 + "=".repeat((4 - base64.length % 4) % 4);

    const binary = atob(padded);

    return Uint8Array.from(
        binary,
        character => character.charCodeAt(0)
    );
}

async function verifyPassword(password, storedHash) {
    try {
        const parts = storedHash.split("$");

        if (
            parts.length !== 4 ||
            parts[0] !== "pbkdf2-sha256"
        ) {
            return false;
        }

        const iterations = Number(parts[1]);

        if (!Number.isInteger(iterations) || iterations < 1) {
            return false;
        }

        const salt = base64UrlToBytes(parts[2]);
        const expectedHash = base64UrlToBytes(parts[3]);

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
            expectedHash.length * 8
        );

        const actualHash = new Uint8Array(derivedBits);

        if (actualHash.length !== expectedHash.length) {
            return false;
        }

        let difference = 0;

        for (let i = 0; i < actualHash.length; i++) {
            difference |= actualHash[i] ^ expectedHash[i];
        }

        return difference === 0;
    } catch (error) {
        console.error("Password verification error:", error);
        return false;
    }
}

const loginForm = document.getElementById("loginForm");

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const rememberMeInput = document.getElementById("rememberMe");

const passwordToggle = document.getElementById("passwordToggle");
const submitButton = document.getElementById("submitButton");
const formMessage = document.getElementById("formMessage");

const emailError = document.getElementById("emailError");
const passwordError = document.getElementById("passwordError");


/* ========================================
   SHOW / HIDE PASSWORD
======================================== */

passwordToggle.addEventListener("click", function () {
    const isHidden = passwordInput.type === "password";

    passwordInput.type = isHidden ? "text" : "password";

    passwordToggle.textContent = isHidden ? "HIDE" : "SHOW";

    passwordToggle.setAttribute(
        "aria-label",
        isHidden ? "Hide password" : "Show password"
    );

    passwordToggle.setAttribute(
        "aria-pressed",
        String(isHidden)
    );
});


/* ========================================
   MESSAGE HELPERS
======================================== */

function showMessage(message, type) {
    formMessage.textContent = message;

    formMessage.className = "form-message visible " + type;
}

function hideMessage() {
    formMessage.textContent = "";

    formMessage.className = "form-message";
}

function clearErrors() {
    emailError.textContent = "";
    passwordError.textContent = "";
}


/* ========================================
   VALIDATE FORM
======================================== */

function validateForm() {
    clearErrors();
    hideMessage();

    let isValid = true;

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!email) {
        emailError.textContent = "Please enter your email address.";
        isValid = false;
    } else if (!emailPattern.test(email)) {
        emailError.textContent = "Enter a valid email address.";
        isValid = false;
    }

    if (!password) {
        passwordError.textContent = "Please enter your password.";
        isValid = false;
    }

    return isValid;
}


/* ========================================
   LOGIN SUBMISSION
======================================== */

loginForm.addEventListener("submit", async function (event) {
    event.preventDefault();

    if (!validateForm()) {
        showMessage(
            "Please check the highlighted fields.",
            "error"
        );
        return;
    }

    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    submitButton.disabled = true;
    submitButton.querySelector("span:first-child").textContent =
        "Signing in...";

    try {
        const userQuery = query(
            collection(db, "users"),
            where("email", "==", email)
        );

        const snapshot = await getDocs(userQuery);

        if (snapshot.empty) {
            showMessage("Invalid email or password.", "error");
            return;
        }

        const userData = snapshot.docs[0].data();

        const passwordMatches = await verifyPassword(
            password,
            userData.password
        );

        if (!passwordMatches) {
            showMessage("Invalid email or password.", "error");
            return;
        }

        // Prototype session only; not secure authentication.

        localStorage.setItem("userId", userData.userId)
        window.location.href = "../workspace/projects/"

        // Temporary: verify login before adding your home-page redirect.
    } catch (error) {
        console.error("Papercut login error:", error);

        if (error.code === "permission-denied") {
            showMessage(
                "Firestore denied access. Check the Rules for the users collection.",
                "error"
            );
        } else {
            showMessage(
                "Login failed. Check the browser console for details.",
                "error"
            );
        }
    } finally {
        submitButton.disabled = false;
        submitButton.querySelector("span:first-child").textContent =
            "Sign in to your account";
    }
});


/* ========================================
   CLEAR MESSAGES WHILE TYPING
======================================== */

emailInput.addEventListener("input", function () {
    emailError.textContent = "";
    hideMessage();
});

passwordInput.addEventListener("input", function () {
    passwordError.textContent = "";
    hideMessage();
});