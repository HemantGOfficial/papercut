
/* ==========================================
   PAPERCUT — LANDING PAGE
   Main JavaScript: js/script.js
   ========================================== */


/* ==========================================
   1. MOBILE NAVIGATION
   ========================================== */

const menuToggle = document.getElementById("menuToggle");
const navLinks = document.getElementById("navLinks");

if (menuToggle && navLinks) {

    menuToggle.addEventListener("click", () => {

        const isOpen = navLinks.classList.toggle("open");

        menuToggle.setAttribute(
            "aria-expanded",
            String(isOpen)
        );

    });


    // Close the mobile menu after clicking a link.

    navLinks.querySelectorAll("a").forEach((link) => {

        link.addEventListener("click", () => {

            navLinks.classList.remove("open");

            menuToggle.setAttribute(
                "aria-expanded",
                "false"
            );

        });

    });


    // Close the menu when the user presses Escape.

    document.addEventListener("keydown", (event) => {

        if (event.key === "Escape") {

            navLinks.classList.remove("open");

            menuToggle.setAttribute(
                "aria-expanded",
                "false"
            );

        }

    });

}


/* ==========================================
   2. CURRENT YEAR
   ========================================== */

const currentYear = document.getElementById("currentYear");

if (currentYear) {
    currentYear.textContent = new Date().getFullYear();
}


/* ==========================================
   3. FIREBASE CONFIGURATION
   ========================================== */

/*
    IMPORTANT:

    1. Create a Firebase project.
    2. Register your web app.
    3. Copy the Firebase web configuration.
    4. Paste the values below.

    Do not paste your Firebase Admin SDK private key
    or service account credentials into this file.

    The web configuration is not a server secret.
    Security must be enforced through Firebase rules.
*/


const firebaseConfig = {
    apiKey: "AIzaSyDi79OVkKxDCN5p6AImz-GD_TTjIO8bG3w",
    authDomain: "papercut-2f2e0.firebaseapp.com",
    projectId: "papercut-2f2e0",
    storageBucket: "papercut-2f2e0.firebasestorage.app",
    messagingSenderId: "86722372469",
    appId: "1:86722372469:web:3bd07c5ec87a9b4915293c"
};

// script.js

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
    getFirestore,
    collection,
    getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 1. Your Firebase configuration

// 2. Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 3. Get the user count and display it
async function updateUserCount() {
    const userCountElement = document.getElementById("user-count");

    if (!userCountElement) {
        console.error('Element with id="user-count" was not found.');
        return;
    }

    try {
        userCountElement.textContent = "Loading...";

        const usersCollection = collection(db, "users");
        const snapshot = await getCountFromServer(usersCollection);
        const totalUsers = snapshot.data().count;

        userCountElement.textContent = totalUsers.toLocaleString("en-IN");
    } catch (error) {
        console.error("Failed to fetch user count:", error);
        userCountElement.textContent = "—";
    }
}

updateUserCount();


/* ==========================================
   4. COMMUNITY USER COUNT
   ========================================== */

// const userCountElement = document.getElementById("userCount");
// const counterLabel = document.getElementById("counterLabel");
// const counterCaption = document.getElementById("counterCaption");


// function showUserCount(count) {

//     if (!userCountElement) {
//         return;
//     }

//     const totalUsers = Number(count);

//     if (
//         !Number.isSafeInteger(totalUsers) ||
//         totalUsers < 0
//     ) {
//         showCountUnavailable();
//         return;
//     }

//     userCountElement.textContent =
//         totalUsers.toLocaleString("en-IN");

//     if (counterLabel) {
//         counterLabel.textContent =
//             totalUsers === 1
//                 ? "Writer in the community"
//                 : "Writers and creators";
//     }

//     if (counterCaption) {
//         counterCaption.textContent =
//             totalUsers === 0
//                 ? "Be the first to join Papercut."
//                 : "And every story starts somewhere.";
//     }

// }


// function showCountUnavailable() {

//     if (userCountElement) {
//         userCountElement.textContent = "—";
//     }

//     if (counterLabel) {
//         counterLabel.textContent = "Writers and creators";
//     }

//     if (counterCaption) {
//         counterCaption.textContent =
//             "Be part of the story.";
//     }

// }


// /* ==========================================
//    5. LOAD COUNT FROM FIREBASE
//    ========================================== */

// async function loadCommunityCount() {

//     const configIsMissing =
//         !firebaseConfig.apiKey ||
//         !firebaseConfig.projectId ||
//         firebaseConfig.apiKey.startsWith("YOUR_") ||
//         firebaseConfig.projectId.startsWith("YOUR_");

//     if (configIsMissing) {

//         // Firebase has not been configured yet.
//         // Keep a neutral placeholder instead of inventing a number.

//         showCountUnavailable();

//         console.info(
//             "Papercut: Add your Firebase web configuration to enable the community count."
//         );

//         return;
//     }


//     try {

//         const { initializeApp, getApps } =
//             await import(
//                 "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js"
//             );

//         const { getFirestore, doc, getDoc } =
//             await import(
//                 "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js"
//             );


//         // Reuse an existing Firebase app if one exists.

//         const app = getApps().length
//             ? getApps()[0]
//             : initializeApp(firebaseConfig);


//         const db = getFirestore(app);


//         /*
//             Expected Firestore document:

//             Collection: publicStats
//             Document:   usage

//             Example document fields:

//             {
//                 totalUsers: 125
//             }

//             The number above is only an example.
//             Use the real count generated by your backend.
//         */

//         const statsRef = doc(db, "publicStats", "usage");

//         const statsSnapshot = await getDoc(statsRef);


//         if (!statsSnapshot.exists()) {

//             showCountUnavailable();

//             console.info(
//                 "Papercut: The publicStats/usage document has not been created yet."
//             );

//             return;
//         }


//         const stats = statsSnapshot.data();

//         showUserCount(stats.totalUsers);


//     } catch (error) {

//         // Keep the landing page usable even if Firebase is unavailable.

//         showCountUnavailable();

//         console.error(
//             "Papercut: Unable to load the community count.",
//             error
//         );

//     }

// }


// loadCommunityCount();


/* ==========================================
   6. OPTIONAL: SIMPLE SCROLL REVEALS
   ========================================== */

/*
    This section adds a subtle entrance animation.
    The page still works if IntersectionObserver is unavailable.
*/

const revealElements = document.querySelectorAll(
    ".feature-card, .section-heading, .upcoming-item, .cta-card"
);


if ("IntersectionObserver" in window) {

    const revealObserver = new IntersectionObserver(
        (entries, observer) => {

            entries.forEach((entry) => {

                if (!entry.isIntersecting) {
                    return;
                }

                entry.target.classList.add("is-visible");

                observer.unobserve(entry.target);

            });

        },
        {
            threshold: 0.12
        }
    );


    revealElements.forEach((element) => {

        element.classList.add("reveal");

        revealObserver.observe(element);

    });

}