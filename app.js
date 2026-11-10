// ============================================
// EMPLOYEE MANAGEMENT SYSTEM
// Firebase Authentication + Firestore
// ============================================

import { initializeApp, getApps } from
  "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  collection,
  writeBatch,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";


// ============================================
// 1. FIREBASE CONFIGURATION
// ============================================

const firebaseConfig = {
  apiKey: "AIzaSyDBjWmYDXeMtr04wFrf2VKJfh2cxVoLeY8",
  authDomain: "employee-management-system-v1.firebaseapp.com",
  projectId: "employee-management-system-v1",
  storageBucket: "employee-management-system-v1.firebasestorage.app",
  messagingSenderId: "793945224801",
  appId: "1:793945224801:web:1bc24e7a79fe018c31dc20"
};

const app = getApps().length
  ? getApps()[0]
  : initializeApp(firebaseConfig);

const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();


// Separate Firebase app for creating employee accounts.
// This keeps the manager's main login session unchanged.

const employeeApp = getApps().find(
  existingApp => existingApp.name === "employeeCreator"
) || initializeApp(firebaseConfig, "employeeCreator");

const employeeAuth = getAuth(employeeApp);


// ============================================
// 2. GLOBAL APPLICATION STATE
// ============================================

let currentUser = null;
let currentProfile = null;
let currentRole = null;

const loginScreen = document.getElementById("loginScreen");
const application = document.getElementById("app");
const loginMessage = document.getElementById("loginMessage");


// ============================================
// 3. HELPER FUNCTIONS
// ============================================

function showLoginMessage(message, type = "error") {
  loginMessage.textContent = message;
  loginMessage.className =
    type === "success"
      ? "message success-message"
      : "message";
}

function setLoading(button, loading, originalText) {
  button.disabled = loading;
  button.textContent = loading ? "Please wait..." : originalText;
}

function normalizeEmployeeId(employeeId) {
  return employeeId.trim().toLowerCase();
}

function employeeLoginEmail(employeeId) {
  return `${normalizeEmployeeId(employeeId)}@employee-management-system-v1.firebaseapp.com`;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function showApplication() {
  loginScreen.classList.add("hidden");
  application.classList.remove("hidden");
}

function showLogin() {
  application.classList.add("hidden");
  loginScreen.classList.remove("hidden");
}

function updateUserDetails(name, role) {
  const displayName = name || "User";
  const initial = displayName.charAt(0).toUpperCase();

  document.getElementById("sidebarUserName").textContent = displayName;
  document.getElementById("headerUserName").textContent = displayName;
  document.getElementById("sidebarUserRole").textContent = role;
  document.getElementById("userAvatar").textContent = initial;
  document.getElementById("headerAvatar").textContent = initial;
}


// ============================================
// 4. MANAGER GOOGLE LOGIN
// ============================================

document.getElementById("googleLogin").addEventListener("click", async function () {

  setLoading(this, true, "Sign in with Google");

  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    console.error(error);
    showLoginMessage(error.message);
  } finally {
    setLoading(this, false, "Sign in with Google");
  }

});


// ============================================
// 5. EMPLOYEE ID + PASSWORD LOGIN
// ============================================

document.getElementById("employeeLoginButton").addEventListener("click", async function () {

  const employeeId = document.getElementById("employeeId").value.trim();
  const password = document.getElementById("employeePassword").value;

  if (!employeeId || !password) {
    showLoginMessage("Please enter your Employee ID and password.");
    return;
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(employeeId)) {
    showLoginMessage("Employee ID can contain only letters, numbers, hyphens and underscores.");
    return;
  }

  setLoading(this, true, "Employee Login");
  showLoginMessage("");

  try {
    const email = employeeLoginEmail(employeeId);

    await signInWithEmailAndPassword(auth, email, password);

  } catch (error) {
    console.error(error);
    showLoginMessage("Invalid Employee ID or password.");
  } finally {
    setLoading(this, false, "Employee Login");
  }

});


// ============================================
// 6. CHECK USER ROLE AFTER LOGIN
// ============================================

onAuthStateChanged(auth, async user => {

  if (!user) {
    currentUser = null;
    currentProfile = null;
    currentRole = null;
    showLogin();
    return;
  }

  try {
    currentUser = user;

    const userRef = doc(db, "authorizedUsers", user.uid);
    const userSnapshot = await getDoc(userRef);

    if (!userSnapshot.exists()) {
      await signOut(auth);
      showLoginMessage("Your account is not authorized. Contact your manager.");
      return;
    }

    const userData = userSnapshot.data();

    if (userData.active !== true) {
      await signOut(auth);
      showLoginMessage("Your account is inactive. Contact your manager.");
      return;
    }

    currentRole = userData.role;

    if (currentRole === "manager") {

      currentProfile = {
        name: user.displayName || user.email,
        email: user.email
      };

      document.querySelectorAll(".manager-only").forEach(element => {
        element.classList.remove("hidden");
      });

      updateUserDetails(currentProfile.name, "Manager");

    } else if (currentRole === "employee") {

      const employeeRef = doc(db, "employees", user.uid);
      const employeeSnapshot = await getDoc(employeeRef);

      if (!employeeSnapshot.exists()) {
        await signOut(auth);
        showLoginMessage("Employee profile not found. Contact your manager.");
        return;
      }

      currentProfile = employeeSnapshot.data();

      if (currentProfile.status !== "Active") {
        await signOut(auth);
        showLoginMessage("Your employee account is inactive.");
        return;
      }

      document.querySelectorAll(".manager-only").forEach(element => {
        element.classList.add("hidden");
      });

      updateUserDetails(currentProfile.employeeName, "Employee");

    } else {
      await signOut(auth);
      showLoginMessage("Invalid account role. Contact your manager.");
      return;
    }

    showApplication();
    openPage("dashboard");

  } catch (error) {
    console.error("Authentication check failed:", error);
    showLoginMessage("Unable to load your account. Please try again.");
    await signOut(auth);
  }

});


// ============================================
// 7. SIDEBAR NAVIGATION
// ============================================

document.querySelectorAll(".nav-button").forEach(button => {

  button.addEventListener("click", () => {

    const page = button.dataset.page;

    if (button.classList.contains("manager-only") &&
        currentRole !== "manager") {
      return;
    }

    document.querySelectorAll(".nav-button").forEach(item => {
      item.classList.remove("active");
    });

    button.classList.add("active");

    openPage(page);

  });

});


// ============================================
// 8. PAGE NAVIGATION
// ============================================

function openPage(page) {

  const pageTitles = {
    dashboard: "Dashboard",
    employees: "Employee Details",
    leave: "Leave Management",
    attendance: "Attendance",
    reports: "Reports",
    settings: "Settings"
  };

  document.getElementById("pageTitle").textContent =
    pageTitles[page] || "Dashboard";

  if (page === "dashboard") {
    renderDashboard();
  } else if (page === "employees" && currentRole === "manager") {
    renderEmployees();
  } else if (page === "leave") {
    renderPlaceholder("Leave Management");
  } else if (page === "attendance") {
    renderPlaceholder("Attendance");
  } else if (page === "reports" && currentRole === "manager") {
    renderPlaceholder("Reports");
  } else if (page === "settings") {
    renderSettings();
  } else {
    renderDashboard();
  }

}


// ============================================
// 9. DASHBOARD
// ============================================

async function renderDashboard() {

  const content = document.getElementById("pageContent");

  if (currentRole === "manager") {

    content.innerHTML = `
      <h2 class="section-title">Welcome, ${escapeHTML(currentProfile.name)}</h2>

      <div class="dashboard-grid">
        <div class="stat-card">
          <p>Total Employees</p>
          <h2 id="totalEmployees">-</h2>
        </div>

        <div class="stat-card">
          <p>Active Employees</p>
          <h2 id="activeEmployees">-</h2>
        </div>

        <div class="stat-card">
          <p>Pending Leaves</p>
          <h2>-</h2>
        </div>

        <div class="stat-card">
          <p>Today's Attendance</p>
          <h2>-</h2>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header">
          <h2>Management Overview</h2>
        </div>
        <p>Use Employee Details to create and manage employee accounts.</p>
      </div>
    `;

    try {
      const snapshot = await getDocs(collection(db, "employees"));
      let activeCount = 0;

      snapshot.forEach(employee => {
        if (employee.data().status === "Active") {
          activeCount++;
        }
      });

      document.getElementById("totalEmployees").textContent = snapshot.size;
      document.getElementById("activeEmployees").textContent = activeCount;

    } catch (error) {
      console.error(error);
    }

  } else {

    content.innerHTML = `
      <h2 class="section-title">
        Welcome, ${escapeHTML(currentProfile.employeeName)}
      </h2>

      <div class="dashboard-grid">
        <div class="stat-card">
          <p>Employee ID</p>
          <h2>${escapeHTML(currentProfile.employeeId)}</h2>
        </div>

        <div class="stat-card">
          <p>Department</p>
          <h2>${escapeHTML(currentProfile.department || "-")}</h2>
        </div>

        <div class="stat-card">
          <p>Designation</p>
          <h2>${escapeHTML(currentProfile.designation || "-")}</h2>
        </div>

        <div class="stat-card">
          <p>Account Status</p>
          <h2>${escapeHTML(currentProfile.status)}</h2>
        </div>
      </div>

      <div class="panel">
        <h2 class="section-title">My Employee Profile</h2>

        <div class="profile-grid">
          <div class="profile-item">
            <span>Employee Name</span>
            <strong>${escapeHTML(currentProfile.employeeName)}</strong>
          </div>

          <div class="profile-item">
            <span>Employee ID</span>
            <strong>${escapeHTML(currentProfile.employeeId)}</strong>
          </div>

          <div class="profile-item">
            <span>Department</span>
            <strong>${escapeHTML(currentProfile.department || "-")}</strong>
          </div>

          <div class="profile-item">
            <span>Designation</span>
            <strong>${escapeHTML(currentProfile.designation || "-")}</strong>
          </div>

          <div class="profile-item">
            <span>Joining Date</span>
            <strong>${escapeHTML(currentProfile.joiningDate || "-")}</strong>
          </div>
        </div>
      </div>
    `;

  }

}


// ============================================
// 10. EMPLOYEE MANAGEMENT PAGE
// ============================================

async function renderEmployees() {

  if (currentRole !== "manager") return;

  const content = document.getElementById("pageContent");

  content.innerHTML = `
    <div class="panel">

      <div class="panel-header">
        <h2>Create New Employee Account</h2>
      </div>

      <form id="employeeForm">

        <div class="form-grid">

          <div class="form-group">
            <label>Employee ID *</label>
            <input type="text" id="newEmployeeId"
              placeholder="Example: EMP001" required>
          </div>

          <div class="form-group">
            <label>Employee Name *</label>
            <input type="text" id="newEmployeeName"
              placeholder="Enter employee name" required>
          </div>

          <div class="form-group">
            <label>Initial Password *</label>
            <input type="password" id="newEmployeePassword"
              minlength="6" placeholder="Minimum 6 characters" required>
          </div>

          <div class="form-group">
            <label>Company Email</label>
            <input type="email" id="newEmployeeEmail"
              placeholder="employee@company.com">
          </div>

          <div class="form-group">
            <label>Department</label>
            <input type="text" id="newEmployeeDepartment"
              placeholder="Enter department">
          </div>

          <div class="form-group">
            <label>Designation</label>
            <input type="text" id="newEmployeeDesignation"
              placeholder="Enter designation">
          </div>

          <div class="form-group">
            <label>Joining Date</label>
            <input type="date" id="newEmployeeJoiningDate">
          </div>

        </div>

        <div id="employeeFormMessage"></div>

        <div class="form-actions">
          <button type="submit" class="action-button" id="createEmployeeButton">
            Create Employee Account
          </button>
        </div>

      </form>

    </div>

    <div class="panel">

      <div class="panel-header">
        <h2>Employee Records</h2>
      </div>

      <div id="employeeTableArea">
        Loading employees...
      </div>

    </div>
  `;

  document.getElementById("employeeForm").addEventListener(
    "submit",
    createEmployee
  );

  await loadEmployeeTable();

}


// ============================================
// 11. CREATE EMPLOYEE ACCOUNT
// ============================================

async function createEmployee(event) {

  event.preventDefault();

  if (currentRole !== "manager" || !currentUser) {
    return;
  }

  const button = document.getElementById("createEmployeeButton");
  const message = document.getElementById("employeeFormMessage");

  const employeeId = document.getElementById("newEmployeeId").value.trim();
  const employeeName = document.getElementById("newEmployeeName").value.trim();
  const password = document.getElementById("newEmployeePassword").value;
  const companyEmail = document.getElementById("newEmployeeEmail").value.trim();
  const department = document.getElementById("newEmployeeDepartment").value.trim();
  const designation = document.getElementById("newEmployeeDesignation").value.trim();
  const joiningDate = document.getElementById("newEmployeeJoiningDate").value;

  if (!/^[a-zA-Z0-9_-]+$/.test(employeeId)) {
    message.innerHTML = `
      <div class="error-message">
        Employee ID can contain only letters, numbers, hyphens and underscores.
      </div>
    `;
    return;
  }

  if (password.length < 6) {
    message.innerHTML = `
      <div class="error-message">
        Password must contain at least 6 characters.
      </div>
    `;
    return;
  }

  const normalizedId = normalizeEmployeeId(employeeId);
  const internalEmail = employeeLoginEmail(employeeId);

  setLoading(button, true, "Create Employee Account");

  try {

    const credential = await createUserWithEmailAndPassword(
      employeeAuth,
      internalEmail,
      password
    );

    const employeeUid = credential.user.uid;

    try {

      const batch = writeBatch(db);

      const employeeRef = doc(db, "employees", employeeUid);
      const authorizationRef = doc(db, "authorizedUsers", employeeUid);

      batch.set(employeeRef, {
        uid: employeeUid,
        employeeId: normalizedId,
        employeeName: employeeName,
        email: internalEmail,
        companyEmail: companyEmail,
        department: department,
        designation: designation,
        joiningDate: joiningDate,
        managerEmail: currentUser.email,
        status: "Active",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      batch.set(authorizationRef, {
        email: internalEmail,
        role: "employee",
        active: true,
        createdAt: serverTimestamp()
      });

      await batch.commit();

    } catch (firestoreError) {

      console.error(firestoreError);

      message.innerHTML = `
        <div class="error-message">
          The login account was created, but the employee profile could not
          be saved. Do not create this Employee ID again yet.
          Check Firestore Rules and contact the administrator.
        </div>
      `;

      return;
    }

    message.innerHTML = `
      <div class="success-message">
        Employee account created successfully!<br>
        Employee ID: <strong>${escapeHTML(employeeId)}</strong>
      </div>
    `;

    document.getElementById("employeeForm").reset();

    await loadEmployeeTable();

  } catch (error) {

    console.error(error);

    let errorText = "Unable to create employee account.";

    if (error.code === "auth/email-already-in-use") {
      errorText = "This Employee ID already exists.";
    } else if (error.code === "auth/weak-password") {
      errorText = "Please use a stronger password.";
    } else if (error.code === "auth/operation-not-allowed") {
      errorText = "Email/Password authentication is not enabled.";
    } else if (error.code === "permission-denied") {
      errorText = "Firestore permission denied. Check your Firestore Rules.";
    }

    message.innerHTML = `
      <div class="error-message">${escapeHTML(errorText)}</div>
    `;

  } finally {

    await signOut(employeeAuth).catch(console.error);

    setLoading(button, false, "Create Employee Account");

  }

}


// ============================================
// 12. LOAD EMPLOYEE TABLE
// ============================================

async function loadEmployeeTable() {

  const area = document.getElementById("employeeTableArea");

  if (!area || currentRole !== "manager") return;

  area.innerHTML = "Loading employees...";

  try {

    const snapshot = await getDocs(collection(db, "employees"));

    if (snapshot.empty) {
      area.innerHTML = `
        <div class="empty-state">
          No employee records found.
        </div>
      `;
      return;
    }

    let rows = "";

    snapshot.forEach(employeeDoc => {

      const employee = employeeDoc.data();
      const isActive = employee.status === "Active";

      rows += `
        <tr>
          <td>${escapeHTML(employee.employeeId)}</td>
          <td>${escapeHTML(employee.employeeName)}</td>
          <td>${escapeHTML(employee.department || "-")}</td>
          <td>${escapeHTML(employee.designation || "-")}</td>

          <td>
            <span class="status ${
              isActive ? "status-active" : "status-inactive"
            }">
              ${escapeHTML(employee.status || "Unknown")}
            </span>
          </td>

          <td>
            ${
              isActive
                ? `<button type="button"
                    class="action-button discontinue-button"
                    data-employee-uid="${escapeHTML(employeeDoc.id)}">
                    Discontinue
                  </button>`
                : `<span class="inactive-label">Discontinued</span>`
            }
          </td>
        </tr>
      `;

    });

    area.innerHTML = `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Name</th>
              <th>Department</th>
              <th>Designation</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>

          <tbody>${rows}</tbody>

        </table>
      </div>
    `;

    area.querySelectorAll(".discontinue-button").forEach(button => {

      button.addEventListener("click", async () => {

        await discontinueEmployee(
          button.dataset.employeeUid,
          button
        );

      });

    });

  } catch (error) {

    console.error(error);

    area.innerHTML = `
      <div class="error-message">
        Unable to load employee records. Check Firestore Rules.
      </div>
    `;

  }

}


// ============================================
// 13. DISCONTINUE EMPLOYEE
// ============================================

async function discontinueEmployee(employeeUid, button) {

  if (currentRole !== "manager" || !currentUser || !employeeUid) {
    alert("Only the manager can discontinue an employee.");
    return;
  }

  const confirmed = confirm(
    "Are you sure you want to discontinue this employee?\n\n" +
    "The employee's login access will be disabled. " +
    "Their employee records will be preserved and will not be deleted."
  );

  if (!confirmed) {
    return;
  }

  const originalText = button.textContent;

  button.disabled = true;
  button.textContent = "Processing...";

  try {

    const employeeRef = doc(db, "employees", employeeUid);
    const authorizationRef = doc(db, "authorizedUsers", employeeUid);

    const batch = writeBatch(db);

    batch.update(employeeRef, {
      status: "Inactive",
      updatedAt: serverTimestamp(),
      discontinuedAt: serverTimestamp(),
      discontinuedBy: currentUser.email || currentUser.uid
    });

    batch.update(authorizationRef, {
      active: false,
      updatedAt: serverTimestamp()
    });

    await batch.commit();

    alert(
      "Employee discontinued successfully.\n" +
      "Login access has been disabled and employee records are preserved."
    );

    await loadEmployeeTable();

  } catch (error) {

    console.error("Employee discontinuation failed:", error);

    button.disabled = false;
    button.textContent = originalText;

    if (error.code === "permission-denied") {

      alert(
        "Permission denied. Please check your Firestore Rules. " +
        "Both employee and authorizedUsers documents must allow manager updates."
      );

    } else {

      alert("Unable to discontinue this employee. Please try again.");

    }

  }

}


// ============================================
// 14. SETTINGS PAGE
// ============================================

function renderSettings() {

  const content = document.getElementById("pageContent");

  if (currentRole === "employee") {

    content.innerHTML = `
      <div class="panel">
        <h2 class="section-title">My Account</h2>
        <p>Employee ID: ${escapeHTML(currentProfile.employeeId)}</p>
        <p>Name: ${escapeHTML(currentProfile.employeeName)}</p>
        <p>Role: Employee</p>
      </div>
    `;

  } else {

    content.innerHTML = `
      <div class="panel">
        <h2 class="section-title">Manager Settings</h2>
        <p>Manager Name: ${escapeHTML(currentProfile.name)}</p>
        <p>Manager Email: ${escapeHTML(currentProfile.email)}</p>
      </div>
    `;

  }

}


// ============================================
// 15. PLACEHOLDER PAGES
// ============================================

function renderPlaceholder(title) {

  document.getElementById("pageContent").innerHTML = `
    <div class="panel">
      <h2 class="section-title">${escapeHTML(title)}</h2>

      <div class="empty-state">
        This module will be developed in the next stage.
      </div>

    </div>
  `;

}


// ============================================
// 16. LOGOUT
// ============================================

document.getElementById("logoutButton").addEventListener("click", async () => {

  try {

    await signOut(auth);

  } catch (error) {

    console.error("Logout failed:", error);
    alert("Unable to log out. Please try again.");

  }

});
