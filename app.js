
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
  getDoc,
  getDocs,
  collection,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// 1. FIREBASE CONFIGURATION

const firebaseConfig = {
  apiKey: "AIzaSyDBjWmYDXeMtr04wFrf2VKJfh2cxVoLe8",
  authDomain: "employee-management-system-v1.firebaseapp.com",
  projectId: "employee-management-system-v1",
  storageBucket: "employee-management-system-v1.firebasestorage.app",
  messagingSenderId: "793945224801",
  appId: "1:793945224801:web:1bc24e7a79fe018c31dc20"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const provider = new GoogleAuthProvider();

// 2. HTML ELEMENTS

const loginPage = document.getElementById("loginPage");
const appPage = document.getElementById("app");
const googleLogin = document.getElementById("googleLogin");
const logoutButton = document.getElementById("logoutButton");
const loginMessage = document.getElementById("loginMessage");
const userInfo = document.getElementById("userInfo");
const pageTitle = document.getElementById("pageTitle");
const pageContent = document.getElementById("pageContent");
const sidebar = document.querySelector(".sidebar");
const mainContent = document.querySelector(".main-content");

let currentUser = null;
let currentRole = null;
let currentEmployees = [];

// 3. GOOGLE SIGN-IN

googleLogin.addEventListener("click", async () => {
  loginMessage.textContent = "Signing in...";

  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error(error);
    loginMessage.textContent = "Login failed: " + error.message;
  }
});

// 4. AUTHENTICATION AND AUTOMATIC ONBOARDING

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUser = null;
    currentRole = null;
    loginPage.hidden = false;
    appPage.hidden = true;
    return;
  }

  try {
    currentUser = user;

    if (!user.emailVerified) {
      throw new Error("Please sign in with a verified Google account.");
    }

    const authRef = doc(db, "authorizedUsers", user.uid);
    const authSnapshot = await getDoc(authRef);

    // Existing authorized manager or employee
    if (authSnapshot.exists()) {
      const authData = authSnapshot.data();

      if (authData.active !== true) {
        await showBlockedPage("Your account is inactive. Contact your manager.");
        return;
      }

      if (!["manager", "employee"].includes(authData.role)) {
        await showBlockedPage("Your account has an invalid role.");
        return;
      }

      currentRole = authData.role;

      if (currentRole === "employee") {
        const employeeRef = doc(db, "employees", user.uid);
        const employeeSnapshot = await getDoc(employeeRef);

        if (!employeeSnapshot.exists() ||
            employeeSnapshot.data().status !== "Active") {
          await showBlockedPage("Your employee profile is not active. Contact your manager.");
          return;
        }
      }

      await openApplication();
      return;
    }

    // First-time sign-in: create pending employee profile
    const employeeRef = doc(db, "employees", user.uid);
    const employeeSnapshot = await getDoc(employeeRef);

    if (!employeeSnapshot.exists()) {
      await setDoc(employeeRef, {
        uid: user.uid,
        email: user.email.toLowerCase(),
        employeeName: user.displayName || "",
        status: "Pending",
        createdAt: serverTimestamp()
      });
    }

    const latestEmployee = await getDoc(employeeRef);
    const status = latestEmployee.data()?.status;

    if (status === "Active") {
      await showBlockedPage(
        "Your profile is active, but your login authorization is not ready. Contact your manager."
      );
    } else if (status === "Rejected") {
      await showBlockedPage(
        "Your access request was rejected. Please contact your manager."
      );
    } else {
      await showPendingPage();
    }

  } catch (error) {
    console.error("Authentication error:", error);

    if (error.code === "permission-denied") {
      await showBlockedPage(
        "Access was denied. Please check your Firebase Security Rules or contact your manager."
      );
    } else {
      await showBlockedPage(error.message);
    }
  }
});

// 5. OPEN APPLICATION

async function openApplication() {
  loginPage.hidden = true;
  appPage.hidden = false;

  sidebar.hidden = false;
  mainContent.style.marginLeft = "";

  userInfo.textContent =
    `${currentUser.displayName || currentUser.email} | ${currentRole}`;

  setupNavigation();
  await showPage("dashboard");
}

// 6. PENDING APPROVAL SCREEN

async function showPendingPage() {
  loginPage.hidden = true;
  appPage.hidden = false;

  sidebar.hidden = true;
  mainContent.style.marginLeft = "0";

  pageTitle.textContent = "Approval Pending";

  pageContent.innerHTML = `
    <div class="approval-message">
      <h2>Welcome, ${escapeHTML(currentUser.displayName || "Employee")}</h2>
      <h3>Your registration is awaiting manager approval.</h3>
      <p>Account: ${escapeHTML(currentUser.email)}</p>
      <p>Your manager must approve your account before you can access the system.</p>
      <button id="checkApprovalButton">Check Approval Status</button>
      <button id="pendingLogoutButton">Logout</button>
      <p id="approvalStatusMessage"></p>
    </div>
  `;

  document.getElementById("checkApprovalButton")
    .addEventListener("click", async () => {
      const message = document.getElementById("approvalStatusMessage");
      message.textContent = "Checking...";

      try {
        const authSnapshot = await getDoc(
          doc(db, "authorizedUsers", currentUser.uid)
        );

        if (authSnapshot.exists() &&
            authSnapshot.data().active === true &&
            authSnapshot.data().role === "employee") {
          await openApplication();
        } else {
          const employeeSnapshot = await getDoc(
            doc(db, "employees", currentUser.uid)
          );

          const status = employeeSnapshot.data()?.status;

          message.textContent =
            status === "Rejected"
              ? "Your request was rejected. Contact your manager."
              : "Your request is still awaiting approval.";
        }
      } catch (error) {
        message.textContent = "Unable to check status: " + error.message;
      }
    });

  document.getElementById("pendingLogoutButton")
    .addEventListener("click", () => signOut(auth));
}

// 7. BLOCKED ACCOUNT SCREEN

async function showBlockedPage(messageText) {
  loginPage.hidden = true;
  appPage.hidden = false;

  sidebar.hidden = true;
  mainContent.style.marginLeft = "0";

  pageTitle.textContent = "Account Access";

  pageContent.innerHTML = `
    <div class="approval-message">
      <h2>Access not available</h2>
      <p>${escapeHTML(messageText)}</p>
      <button id="blockedLogoutButton">Logout</button>
    </div>
  `;

  document.getElementById("blockedLogoutButton")
    .addEventListener("click", () => signOut(auth));
}

// 8. LOGOUT

logoutButton.addEventListener("click", async () => {
  await signOut(auth);
});

// 9. NAVIGATION

function setupNavigation() {
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.onclick = () => showPage(button.dataset.page);
  });
}

async function showPage(page) {
  const titles = {
    dashboard: "Dashboard",
    employees: "Employee Details",
    leave: "Leave Management",
    attendance: "Attendance",
    reports: "Reports",
    settings: "Settings"
  };

  pageTitle.textContent = titles[page] || "Dashboard";

  if (page === "dashboard") {
    pageContent.innerHTML = `
      <h2>Welcome to Employee Management System</h2>
      <p>Welcome, ${escapeHTML(currentUser.displayName || currentUser.email)}.</p>
      <p>Role: ${escapeHTML(currentRole)}</p>
    `;
  } else if (page === "employees") {
    await loadEmployeePage();
  } else {
    pageContent.innerHTML = `
      <h2>${escapeHTML(titles[page])}</h2>
      <p>This module will be developed next.</p>
    `;
  }
}

// 10. SAFE HTML DISPLAY

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

// 11. EMPLOYEE MODULE

async function loadEmployeePage() {
  pageContent.innerHTML = "<p>Loading employee information...</p>";

  try {
    if (currentRole === "manager") {
      await loadManagerEmployees();
    } else {
      await loadOwnProfile();
    }
  } catch (error) {
    console.error(error);
    pageContent.innerHTML =
      `<p>Unable to load employees: ${escapeHTML(error.message)}</p>`;
  }
}

// 12. MANAGER: VIEW EMPLOYEES AND REQUESTS

async function loadManagerEmployees() {
  const snapshot = await getDocs(collection(db, "employees"));

  currentEmployees = snapshot.docs.map((item) => ({
    uid: item.id,
    ...item.data()
  }));

  renderManagerEmployees();
}

function renderManagerEmployees() {
  const pending = currentEmployees.filter(
    (employee) => employee.status === "Pending"
  );

  const approved = currentEmployees.filter(
    (employee) => employee.status === "Active"
  );

  const rejected = currentEmployees.filter(
    (employee) => employee.status === "Rejected"
  );

  const pendingRows = pending.map((employee) => `
    <tr>
      <td>${escapeHTML(employee.employeeName)}</td>
      <td>${escapeHTML(employee.email)}</td>
      <td>Pending</td>
      <td>
        <button data-approve="${escapeHTML(employee.uid)}">Approve</button>
        <button data-reject="${escapeHTML(employee.uid)}">Reject</button>
      </td>
    </tr>
  `).join("");

  const approvedRows = approved.map((employee) => `
    <tr>
      <td>${escapeHTML(employee.employeeId || "-")}</td>
      <td>${escapeHTML(employee.employeeName)}</td>
      <td>${escapeHTML(employee.email)}</td>
      <td>${escapeHTML(employee.department || "-")}</td>
      <td>${escapeHTML(employee.designation || "-")}</td>
      <td>${escapeHTML(employee.status)}</td>
    </tr>
  `).join("");

  const rejectedRows = rejected.map((employee) => `
    <tr>
      <td>${escapeHTML(employee.employeeName)}</td>
      <td>${escapeHTML(employee.email)}</td>
      <td>Rejected</td>
    </tr>
  `).join("");

  pageContent.innerHTML = `
    <h2>Employee Management</h2>

    <h3>Pending Approval (${pending.length})</h3>
    <div class="table-container">
      <table class="employee-table">
        <thead>
          <tr>
            <th>Name</th><th>Email</th><th>Status</th><th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${pendingRows || '<tr><td colspan="4">No pending requests.</td></tr>'}
        </tbody>
      </table>
    </div>

    <h3>Approved Employees (${approved.length})</h3>
    <div class="table-container">
      <table class="employee-table">
        <thead>
          <tr>
            <th>Employee ID</th><th>Name</th><th>Email</th>
            <th>Department</th><th>Designation</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${approvedRows || '<tr><td colspan="6">No approved employees.</td></tr>'}
        </tbody>
      </table>
    </div>

    <h3>Rejected Requests (${rejected.length})</h3>
    <div class="table-container">
      <table class="employee-table">
        <thead>
          <tr><th>Name</th><th>Email</th><th>Status</th></tr>
        </thead>
        <tbody>
          ${rejectedRows || '<tr><td colspan="3">No rejected requests.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;

  document.querySelectorAll("[data-approve]").forEach((button) => {
    button.addEventListener("click", () => {
      approveEmployee(button.dataset.approve);
    });
  });

  document.querySelectorAll("[data-reject]").forEach((button) => {
    button.addEventListener("click", () => {
      rejectEmployee(button.dataset.reject);
    });
  });
}

// 13. MANAGER: APPROVE EMPLOYEE

async function approveEmployee(uid) {
  const employee = currentEmployees.find((item) => item.uid === uid);

  if (!employee || employee.status !== "Pending") return;

  const employeeId = prompt("Enter Employee ID (example: EMP001):");
  if (!employeeId?.trim()) return;

  const department = prompt("Enter Department:");
  if (!department?.trim()) return;

  const designation = prompt("Enter Designation:");
  if (!designation?.trim()) return;

  const joiningDate = prompt("Enter Joining Date (YYYY-MM-DD):");
  if (!joiningDate?.trim() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(joiningDate)) {
    alert("Enter the joining date in YYYY-MM-DD format.");
    return;
  }

  const managerEmail = currentUser.email.toLowerCase();

  try {
    const batch = writeBatch(db);

    const employeeRef = doc(db, "employees", uid);
    const authRef = doc(db, "authorizedUsers", uid);

    batch.update(employeeRef, {
      employeeId: employeeId.trim(),
      department: department.trim(),
      designation: designation.trim(),
      joiningDate,
      managerEmail,
      status: "Active",
      approvedAt: serverTimestamp(),
      approvedBy: currentUser.uid,
      updatedAt: serverTimestamp()
    });

    batch.set(authRef, {
      email: employee.email.toLowerCase(),
      role: "employee",
      active: true,
      createdAt: serverTimestamp()
    });

    await batch.commit();

    alert("Employee approved successfully!");
    await loadManagerEmployees();

  } catch (error) {
    console.error(error);
    alert("Approval failed: " + error.message);
  }
}

// 14. MANAGER: REJECT EMPLOYEE

async function rejectEmployee(uid) {
  const employee = currentEmployees.find((item) => item.uid === uid);

  if (!employee || employee.status !== "Pending") return;

  if (!confirm(`Reject access request for ${employee.employeeName}?`)) {
    return;
  }

  try {
    await updateDoc(doc(db, "employees", uid), {
      status: "Rejected",
      rejectedAt: serverTimestamp(),
      rejectedBy: currentUser.uid
    });

    alert("Employee request rejected.");
    await loadManagerEmployees();

  } catch (error) {
    console.error(error);
    alert("Rejection failed: " + error.message);
  }
}

// 15. EMPLOYEE: VIEW OWN PROFILE

async function loadOwnProfile() {
  const snapshot = await getDoc(
    doc(db, "employees", currentUser.uid)
  );

  if (!snapshot.exists()) {
    pageContent.innerHTML = "<p>Employee profile not found.</p>";
    return;
  }

  const employee = snapshot.data();

  pageContent.innerHTML = `
    <h2>My Employee Profile</h2>
    <div class="profile-card">
      <p><strong>Employee ID:</strong> ${escapeHTML(employee.employeeId)}</p>
      <p><strong>Name:</strong> ${escapeHTML(employee.employeeName)}</p>
      <p><strong>Email:</strong> ${escapeHTML(employee.email)}</p>
      <p><strong>Department:</strong> ${escapeHTML(employee.department)}</p>
      <p><strong>Designation:</strong> ${escapeHTML(employee.designation)}</p>
      <p><strong>Joining Date:</strong> ${escapeHTML(employee.joiningDate)}</p>
      <p><strong>Reporting Manager:</strong> ${escapeHTML(employee.managerEmail)}</p>
      <p><strong>Status:</strong> ${escapeHTML(employee.status)}</p>
    </div>
  `;
}
