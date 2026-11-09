
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// 1. Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDBjWmYDXeMtr04wFrf2VKJfh2cxVoLeY8",
  authDomain: "employee-management-system-v1.firebaseapp.com",
  projectId: "employee-management-system-v1",
  storageBucket: "employee-management-system-v1.firebasestorage.app",
  messagingSenderId: "793945224801",
  appId: "1:945224801:web:1bc24e7a79fe018c31dc20"
};

// 2. Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const provider = new GoogleAuthProvider();

// 3. Website elements
const loginPage = document.getElementById("loginPage");
const appPage = document.getElementById("app");
const loginButton = document.getElementById("googleLogin");
const logoutButton = document.getElementById("logoutButton");
const loginMessage = document.getElementById("loginMessage");
const userInfo = document.getElementById("userInfo");
const pageTitle = document.getElementById("pageTitle");
const pageContent = document.getElementById("pageContent");

// 4. Google login
loginButton.addEventListener("click", async () => {
  loginMessage.textContent = "Signing in...";

  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error(error);
    loginMessage.textContent = "Login failed: " + error.message;
  }
});

// 5. Check approved user in Firestore
async function checkUser(user) {
  const userRef = doc(db, "authorizedUsers", user.uid);
  const userSnapshot = await getDoc(userRef);

  if (!userSnapshot.exists()) {
    await signOut(auth);
    loginMessage.textContent =
      "Access not approved. Please contact your manager.";
    return;
  }

  const userData = userSnapshot.data();

  if (userData.active !== true) {
    await signOut(auth);
    loginMessage.textContent =
      "Your account is inactive. Please contact your manager.";
    return;
  }

  // Display authorized application
  loginPage.hidden = true;
  appPage.hidden = false;

  userInfo.textContent =
    user.displayName + " | " + userData.role;

  showPage("dashboard");
}

// 6. Authentication state
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      await checkUser(user);
    } catch (error) {
      console.error(error);
      await signOut(auth);
      loginPage.hidden = false;
      appPage.hidden = true;
      loginMessage.textContent =
        "Unable to verify your access. Please try again.";
    }
  } else {
    loginPage.hidden = false;
    appPage.hidden = true;
  }
});

// 7. Dashboard navigation
function showPage(page) {
  const pages = {
    dashboard: "Dashboard",
    employees: "Employee Details",
    leave: "Leave Management",
    attendance: "Attendance Management",
    reports: "Reports",
    settings: "Settings"
  };

  pageTitle.textContent = pages[page] || "Dashboard";

  pageContent.innerHTML = `
    <h2>${pages[page] || "Dashboard"}</h2>
    <p>This module will be developed in the next stage.</p>
  `;
}

document.querySelectorAll("[data-page]").forEach(button => {
  button.addEventListener("click", () => {
    showPage(button.dataset.page);
  });
});

// 8. Logout
logoutButton.addEventListener("click", async () => {
  await signOut(auth);
});
