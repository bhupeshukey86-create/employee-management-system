
/* =====================================================
   EMPLOYEE MANAGEMENT SYSTEM
   Firebase Authentication + Firestore
   ===================================================== */

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
  serverTimestamp,
  addDoc,
  query,
  where,
  orderBy,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";


/* =====================================================
   1. FIREBASE CONFIGURATION
   DO NOT CHANGE THESE VALUES
   ===================================================== */

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


// Secondary Firebase app keeps manager login unchanged
// when creating employee accounts.

const employeeApp = getApps().find(
  existingApp => existingApp.name === "employeeCreator"
) || initializeApp(firebaseConfig, "employeeCreator");

const employeeAuth = getAuth(employeeApp);


/* =====================================================
   2. GLOBAL APPLICATION STATE
   ===================================================== */

let currentUser = null;
let currentProfile = null;
let currentRole = null;


/* =====================================================
   3. HTML ELEMENT REFERENCES
   ===================================================== */

const loginScreen = document.getElementById("loginScreen");
const application = document.getElementById("app");
const loginMessage = document.getElementById("loginMessage");


/* =====================================================
   4. HELPER FUNCTIONS
   ===================================================== */

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


function showMessage(elementId, message, type = "error") {
  const element = document.getElementById(elementId);

  if (!element) return;

  element.innerHTML = `
    <div class="${type}-message">
      ${escapeHTML(message)}
    </div>
  `;
}


function formatDate(dateValue) {
  if (!dateValue) return "-";

  const date = new Date(dateValue + "T00:00:00");

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}


function calculateLeaveDays(fromDate, toDate) {
  const start = new Date(fromDate + "T00:00:00");
  const end = new Date(toDate + "T00:00:00");

  return Math.round((end - start) / 86400000) + 1;
}


function getStatusClass(status) {
  if (status === "Approved") return "status-approved";
  if (status === "Rejected") return "status-rejected";
  return "status-pending";
}


/* =====================================================
   5. MANAGER GOOGLE LOGIN
   ===================================================== */

document.getElementById("googleLogin").addEventListener(
  "click",
  async function () {

    setLoading(this, true, "Sign in with Google");

    try {
      await signInWithPopup(auth, googleProvider);

    } catch (error) {
      console.error(error);
      showLoginMessage("Unable to sign in with Google.");

    } finally {
      setLoading(this, false, "Sign in with Google");
    }
  }
);


/* =====================================================
   6. EMPLOYEE LOGIN
   ===================================================== */

document.getElementById("employeeLoginButton").addEventListener(
  "click",
  async function () {

    const employeeId =
      document.getElementById("employeeId").value.trim();

    const password =
      document.getElementById("employeePassword").value;

    if (!employeeId || !password) {
      showLoginMessage("Please enter Employee ID and Password.");
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(employeeId)) {
      showLoginMessage("Invalid Employee ID format.");
      return;
    }

    setLoading(this, true, "Employee Login");
    showLoginMessage("");

    try {
      const email = employeeLoginEmail(employeeId);

      await signInWithEmailAndPassword(auth, email, password);

    } catch (error) {
      console.error(error);
      showLoginMessage("Invalid Employee ID or Password.");

    } finally {
      setLoading(this, false, "Employee Login");
    }
  }
);


/* =====================================================
   7. AUTHENTICATION AND ROLE CHECK
   ===================================================== */

onAuthStateChanged(auth, async user => {

  if (!user) {
    currentUser = null;
    currentProfile = null;
    currentRole = null;

    document.querySelectorAll(".manager-only").forEach(element => {
      element.classList.add("hidden");
    });

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
        showLoginMessage("Employee profile not found.");
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
      showLoginMessage("Invalid account role.");
      return;
    }

    showApplication();
    openPage("dashboard");

  } catch (error) {

    console.error("Authentication error:", error);

    showLoginMessage("Unable to load your account.");
    await signOut(auth);
  }
});


/* =====================================================
   8. SIDEBAR NAVIGATION
   ===================================================== */

document.querySelectorAll(".nav-button").forEach(button => {

  button.addEventListener("click", () => {

    const page = button.dataset.page;

    if (
      button.classList.contains("manager-only") &&
      currentRole !== "manager"
    ) {
      return;
    }

    document.querySelectorAll(".nav-button").forEach(item => {
      item.classList.remove("active");
    });

    button.classList.add("active");

    openPage(page);
  });
});


/* =====================================================
   9. PAGE NAVIGATION
   ===================================================== */

function openPage(page) {

  const pageTitles = {
    dashboard: "Dashboard",
    employees: "Employee Details",
    leave: "Leave Management",
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
    renderLeaveManagement();

  } else if (page === "reports" && currentRole === "manager") {
    renderReports();

  } else if (page === "settings") {
    renderSettings();

  } else {
    renderDashboard();
  }
}


/* =====================================================
   10. DASHBOARD
   ===================================================== */

async function renderDashboard() {

  const content = document.getElementById("pageContent");

  if (currentRole === "manager") {

    content.innerHTML = `
      <h2 class="section-title">
        Welcome, ${escapeHTML(currentProfile.name)}
      </h2>

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
          <p>Pending Leave Applications</p>
          <h2 id="pendingLeaves">-</h2>
        </div>

        <div class="stat-card">
          <p>Approved Leaves</p>
          <h2 id="approvedLeaves">-</h2>
        </div>

      </div>

      <div class="panel">
        <div class="panel-header">
          <h2>Management Overview</h2>
        </div>

        <p>
          Manage employee accounts and review leave applications
          submitted by your employees.
        </p>
      </div>
    `;

    try {

      const employeeSnapshot =
        await getDocs(collection(db, "employees"));

      let activeCount = 0;

      employeeSnapshot.forEach(employee => {
        if (employee.data().status === "Active") {
          activeCount++;
        }
      });

      document.getElementById("totalEmployees").textContent =
        employeeSnapshot.size;

      document.getElementById("activeEmployees").textContent =
        activeCount;

      const leaveSnapshot =
        await getDocs(collection(db, "leaveApplications"));

      let pending = 0;
      let approved = 0;

      leaveSnapshot.forEach(leave => {
        if (leave.data().status === "Pending") pending++;
        if (leave.data().status === "Approved") approved++;
      });

      document.getElementById("pendingLeaves").textContent = pending;
      document.getElementById("approvedLeaves").textContent = approved;

    } catch (error) {
      console.error("Dashboard loading error:", error);
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
            <strong>${formatDate(currentProfile.joiningDate)}</strong>
          </div>

        </div>
      </div>

      <div class="panel">
        <h2>Leave Management</h2>
        <p>Apply for leave and track your application status.</p>
        <div class="form-actions">
          <button class="action-button" id="dashboardLeaveButton">
            Apply for Leave
          </button>
        </div>
      </div>
    `;

    document.getElementById("dashboardLeaveButton")
      .addEventListener("click", () => {
        document.querySelector('[data-page="leave"]').click();
      });
  }
}


/* =====================================================
   11. EMPLOYEE MANAGEMENT PAGE
   ===================================================== */

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
            <label>Company Email *</label>
            <input type="email" id="newEmployeeEmail"
              placeholder="employee@company.com" required>
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
          <button type="submit" class="action-button"
            id="createEmployeeButton">
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

      <div class="info-message">
        Permanent deletion is unavailable until secure backend
        deletion is configured. Discontinue preserves employee records.
      </div>

    </div>
  `;

  document.getElementById("employeeForm")
    .addEventListener("submit", createEmployee);

  await loadEmployeeTable();
}


/* =====================================================
   12. CREATE EMPLOYEE ACCOUNT
   ===================================================== */

async function createEmployee(event) {

  event.preventDefault();

  if (currentRole !== "manager" || !currentUser) return;

  const button = document.getElementById("createEmployeeButton");

  const employeeId =
    document.getElementById("newEmployeeId").value.trim();

  const employeeName =
    document.getElementById("newEmployeeName").value.trim();

  const password =
    document.getElementById("newEmployeePassword").value;

  const companyEmail =
    document.getElementById("newEmployeeEmail").value.trim();

  const department =
    document.getElementById("newEmployeeDepartment").value.trim();

  const designation =
    document.getElementById("newEmployeeDesignation").value.trim();

  const joiningDate =
    document.getElementById("newEmployeeJoiningDate").value;

  if (!/^[a-zA-Z0-9_-]+$/.test(employeeId)) {
    showMessage(
      "employeeFormMessage",
      "Employee ID can contain only letters, numbers, hyphens and underscores."
    );
    return;
  }

  if (password.length < 6) {
    showMessage(
      "employeeFormMessage",
      "Password must contain at least 6 characters."
    );
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
        employeeName,
        email: internalEmail,
        companyEmail,
        department,
        designation,
        joiningDate,
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

      showMessage(
        "employeeFormMessage",
        "Login account created, but employee records could not be saved. Check Firestore Rules before retrying."
      );

      return;
    }

    showMessage(
      "employeeFormMessage",
      `Employee ${employeeId} created successfully.`,
      "success"
    );

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
    }

    showMessage("employeeFormMessage", errorText);

  } finally {

    await signOut(employeeAuth).catch(console.error);

    setLoading(button, false, "Create Employee Account");
  }
}


/* =====================================================
   13. LOAD EMPLOYEE TABLE
   ===================================================== */

async function loadEmployeeTable() {

  const area = document.getElementById("employeeTableArea");

  if (!area || currentRole !== "manager") return;

  area.innerHTML = "Loading employees...";

  try {

    const snapshot = await getDocs(collection(db, "employees"));

    if (snapshot.empty) {
      area.innerHTML = "<p>No employee records found.</p>";
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

            <button type="button"
              class="delete-button"
              disabled
              title="Secure backend setup required">
              Permanent Delete
            </button>
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
              <th>Actions</th>
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


/* =====================================================
   14. DISCONTINUE EMPLOYEE
   ===================================================== */

async function discontinueEmployee(employeeUid, button) {

  if (currentRole !== "manager" || !currentUser) return;

  const confirmed = confirm(
    "Do you want to discontinue this employee?\n\n" +
    "Their login access will be disabled and their records preserved."
  );

  if (!confirmed) return;

  const originalText = button.textContent;

  button.disabled = true;
  button.textContent = "Processing...";

  try {

    const batch = writeBatch(db);

    batch.update(doc(db, "employees", employeeUid), {
      status: "Inactive",
      updatedAt: serverTimestamp(),
      discontinuedAt: serverTimestamp(),
      discontinuedBy: currentUser.email || currentUser.uid
    });

    batch.update(doc(db, "authorizedUsers", employeeUid), {
      active: false,
      updatedAt: serverTimestamp()
    });

    await batch.commit();

    alert("Employee discontinued. Records have been preserved.");

    await loadEmployeeTable();

  } catch (error) {

    console.error(error);

    button.disabled = false;
    button.textContent = originalText;

    alert(
      "Unable to discontinue employee. Check Firestore Rules."
    );
  }
}


/* =====================================================
   15. LEAVE MANAGEMENT PAGE
   ===================================================== */

async function renderLeaveManagement() {

  const content = document.getElementById("pageContent");

  if (currentRole === "employee") {

    content.innerHTML = `

      <div class="panel">

        <div class="panel-header">
          <h2>Apply for Leave</h2>
        </div>

        <form id="leaveApplicationForm">

          <div class="form-grid">

            <div class="form-group">
              <label>Leave Type *</label>

              <select id="leaveType" required>
                <option value="">Select Leave Type</option>
                <option value="Casual Leave">Casual Leave</option>
                <option value="Sick Leave">Sick Leave</option>
                <option value="Earned Leave">Earned Leave</option>
                <option value="Unpaid Leave">Unpaid Leave</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div class="form-group">
              <label>From Date *</label>
              <input type="date" id="leaveFromDate" required>
            </div>

            <div class="form-group">
              <label>To Date *</label>
              <input type="date" id="leaveToDate" required>
            </div>

          </div>

          <div class="form-group">
            <label>Reason for Leave *</label>
            <textarea id="leaveReason"
              placeholder="Explain the reason for your leave..."
              required></textarea>
          </div>

          <div id="leaveFormMessage"></div>

          <div class="form-actions">

            <button type="submit" class="action-button"
              id="submitLeaveButton">
              Submit Leave Application
            </button>

          </div>

        </form>

      </div>

      <div class="panel">

        <div class="panel-header">
          <h2>My Leave Applications</h2>
        </div>

        <div id="myLeaveApplications">
          Loading leave applications...
        </div>

      </div>
    `;

    const today = new Date().toISOString().split("T")[0];

    document.getElementById("leaveFromDate").min = today;
    document.getElementById("leaveToDate").min = today;

    document.getElementById("leaveFromDate").addEventListener(
      "change",
      function () {
        document.getElementById("leaveToDate").min = this.value;
      }
    );

    document.getElementById("leaveApplicationForm")
      .addEventListener("submit", submitLeaveApplication);

    await loadMyLeaveApplications();

  } else if (currentRole === "manager") {

    content.innerHTML = `

      <div class="leave-summary-grid">

        <div class="leave-summary-card">
          <p>Total Applications</p>
          <h3 id="managerTotalLeaves">-</h3>
        </div>

        <div class="leave-summary-card">
          <p>Pending Applications</p>
          <h3 id="managerPendingLeaves">-</h3>
        </div>

        <div class="leave-summary-card">
          <p>Approved Applications</p>
          <h3 id="managerApprovedLeaves">-</h3>
        </div>

      </div>

      <div class="panel">

        <div class="panel-header">
          <h2>Employee Leave Applications</h2>
        </div>

        <div id="managerLeaveApplications">
          Loading leave applications...
        </div>

      </div>
    `;

    await loadManagerLeaveApplications();
  }
}


/* =====================================================
   16. EMPLOYEE SUBMITS LEAVE APPLICATION
   ===================================================== */

async function submitLeaveApplication(event) {

  event.preventDefault();

  if (currentRole !== "employee" || !currentUser) return;

  const button = document.getElementById("submitLeaveButton");

  const leaveType = document.getElementById("leaveType").value;
  const fromDate = document.getElementById("leaveFromDate").value;
  const toDate = document.getElementById("leaveToDate").value;
  const reason = document.getElementById("leaveReason").value.trim();

  if (!leaveType || !fromDate || !toDate || !reason) {

    showMessage(
      "leaveFormMessage",
      "Please complete all required fields."
    );

    return;
  }

  if (toDate < fromDate) {

    showMessage(
      "leaveFormMessage",
      "To Date cannot be earlier than From Date."
    );

    return;
  }

  const totalDays = calculateLeaveDays(fromDate, toDate);

  setLoading(button, true, "Submit Leave Application");

  try {

    await addDoc(collection(db, "leaveApplications"), {

      employeeUid: currentUser.uid,
      employeeId: currentProfile.employeeId,
      employeeName: currentProfile.employeeName,
      employeeEmail: currentProfile.companyEmail || "",

      leaveType,
      fromDate,
      toDate,
      totalDays,
      reason,

      status: "Pending",
      managerMessage: "",

      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()

    });

    showMessage(
      "leaveFormMessage",
      "Leave application submitted successfully. It is now pending manager review.",
      "success"
    );

    document.getElementById("leaveApplicationForm").reset();

    await loadMyLeaveApplications();

  } catch (error) {

    console.error("Leave submission error:", error);

    showMessage(
      "leaveFormMessage",
      "Unable to submit leave application. Check Firestore Rules."
    );

  } finally {

    setLoading(button, false, "Submit Leave Application");
  }
}


/* =====================================================
   17. LOAD EMPLOYEE LEAVE HISTORY
   ===================================================== */

async function loadMyLeaveApplications() {

  const area = document.getElementById("myLeaveApplications");

  if (!area || currentRole !== "employee") return;

  area.innerHTML = "Loading...";

  try {

    const leaveQuery = query(
      collection(db, "leaveApplications"),
      where("employeeUid", "==", currentUser.uid),
      orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(leaveQuery);

    if (snapshot.empty) {

      area.innerHTML = `
        <p>No leave applications submitted yet.</p>
      `;

      return;
    }

    let rows = "";

    snapshot.forEach(leaveDoc => {

      const leave = leaveDoc.data();

      rows += `
        <tr>

          <td>${escapeHTML(leave.leaveType)}</td>

          <td>${formatDate(leave.fromDate)}</td>

          <td>${formatDate(leave.toDate)}</td>

          <td>${escapeHTML(leave.totalDays)}</td>

          <td>
            <span class="status ${getStatusClass(leave.status)}">
              ${escapeHTML(leave.status)}
            </span>
          </td>

          <td>${escapeHTML(leave.managerMessage || "-")}</td>

        </tr>
      `;
    });

    area.innerHTML = `
      <div class="table-container">

        <table>

          <thead>
            <tr>
              <th>Leave Type</th>
              <th>From Date</th>
              <th>To Date</th>
              <th>Days</th>
              <th>Status</th>
              <th>Manager Message</th>
            </tr>
          </thead>

          <tbody>${rows}</tbody>

        </table>

      </div>
    `;

  } catch (error) {

    console.error(error);

    area.innerHTML = `
      <div class="error-message">
        Unable to load leave history. Check Firestore Rules.
      </div>
    `;
  }
}


/* =====================================================
   18. MANAGER LOADS ALL LEAVE APPLICATIONS
   ===================================================== */

async function loadManagerLeaveApplications() {

  if (currentRole !== "manager") return;

  const area = document.getElementById("managerLeaveApplications");

  if (!area) return;

  area.innerHTML = "Loading applications...";

  try {

    const leaveQuery = query(
      collection(db, "leaveApplications"),
      orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(leaveQuery);

    let pending = 0;
    let approved = 0;
    let rows = "";

    snapshot.forEach(leaveDoc => {

      const leave = leaveDoc.data();

      if (leave.status === "Pending") pending++;
      if (leave.status === "Approved") approved++;

      const isPending = leave.status === "Pending";

      rows += `
        <tr>

          <td>${escapeHTML(leave.employeeId)}</td>

          <td>${escapeHTML(leave.employeeName)}</td>

          <td>${escapeHTML(leave.leaveType)}</td>

          <td>${formatDate(leave.fromDate)}</td>

          <td>${formatDate(leave.toDate)}</td>

          <td>${escapeHTML(leave.totalDays)}</td>

          <td>${escapeHTML(leave.reason)}</td>

          <td>
            <span class="status ${getStatusClass(leave.status)}">
              ${escapeHTML(leave.status)}
            </span>
          </td>

          <td>
            ${
              isPending
                ? `
                  <button class="approve-button"
                    data-leave-id="${escapeHTML(leaveDoc.id)}"
                    data-decision="Approved">
                    Approve
                  </button>

                  <button class="reject-button"
                    data-leave-id="${escapeHTML(leaveDoc.id)}"
                    data-decision="Rejected">
                    Reject
                  </button>
                `
                : escapeHTML(leave.managerMessage || "-")
            }
          </td>

        </tr>
      `;
    });

    document.getElementById("managerTotalLeaves").textContent =
      snapshot.size;

    document.getElementById("managerPendingLeaves").textContent =
      pending;

    document.getElementById("managerApprovedLeaves").textContent =
      approved;

    if (snapshot.empty) {

      area.innerHTML = "<p>No leave applications received.</p>";
      return;
    }

    area.innerHTML = `
      <div class="table-container">

        <table>

          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Employee Name</th>
              <th>Leave Type</th>
              <th>From</th>
              <th>To</th>
              <th>Days</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Manager Action</th>
            </tr>
          </thead>

          <tbody>${rows}</tbody>

        </table>

      </div>

      <div class="info-message">
        Select Approve or Reject to record your decision and add a message.
      </div>
    `;

    area.querySelectorAll("[data-decision]").forEach(button => {

      button.addEventListener("click", async () => {

        await reviewLeaveApplication(
          button.dataset.leaveId,
          button.dataset.decision,
          button
        );

      });
    });

  } catch (error) {

    console.error(error);

    area.innerHTML = `
      <div class="error-message">
        Unable to load applications. Check Firestore Rules.
      </div>
    `;
  }
}


/* =====================================================
   19. MANAGER APPROVES OR REJECTS LEAVE
   ===================================================== */

async function reviewLeaveApplication(leaveId, decision, button) {

  if (currentRole !== "manager" || !currentUser) return;

  if (!["Approved", "Rejected"].includes(decision)) return;

  const managerMessage = prompt(
    `Enter your message for the employee (${decision}):`
  );

  if (managerMessage === null) return;

  const confirmed = confirm(
    `Confirm ${decision.toLowerCase()} decision for this leave application?`
  );

  if (!confirmed) return;

  button.disabled = true;

  try {

    const leaveRef = doc(db, "leaveApplications", leaveId);

    await updateDoc(leaveRef, {

      status: decision,
      managerMessage: managerMessage.trim(),

      reviewedBy: currentUser.email || currentUser.uid,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp()

    });

    alert(
      `Leave application ${decision.toLowerCase()} successfully.`
    );

    await loadManagerLeaveApplications();

  } catch (error) {

    console.error("Leave review error:", error);

    button.disabled = false;

    alert(
      "Unable to update leave application. Check Firestore Rules."
    );
  }
}


/* =====================================================
   20. MANAGER REPORTS
   ===================================================== */

async function renderReports() {

  if (currentRole !== "manager") return;

  const content = document.getElementById("pageContent");

  content.innerHTML = `

    <h2 class="section-title">Leave Reports</h2>

    <div class="panel">

      <div class="panel-header">
        <h2>Leave Application Report</h2>
      </div>

      <div id="leaveReportArea">
        Generating report...
      </div>

    </div>
  `;

  try {

    const snapshot = await getDocs(
      query(
        collection(db, "leaveApplications"),
        orderBy("createdAt", "desc")
      )
    );

    let pending = 0;
    let approved = 0;
    let rejected = 0;

    let rows = "";

    snapshot.forEach(leaveDoc => {

      const leave = leaveDoc.data();

      if (leave.status === "Pending") pending++;
      if (leave.status === "Approved") approved++;
      if (leave.status === "Rejected") rejected++;

      rows += `
        <tr>
          <td>${escapeHTML(leave.employeeId)}</td>
          <td>${escapeHTML(leave.employeeName)}</td>
          <td>${escapeHTML(leave.leaveType)}</td>
          <td>${formatDate(leave.fromDate)}</td>
          <td>${formatDate(leave.toDate)}</td>
          <td>${escapeHTML(leave.totalDays)}</td>
          <td>${escapeHTML(leave.status)}</td>
        </tr>
      `;
    });

    document.getElementById("leaveReportArea").innerHTML = `

      <div class="leave-summary-grid">

        <div class="leave-summary-card">
          <p>Total Applications</p>
          <h3>${snapshot.size}</h3>
        </div>

        <div class="leave-summary-card">
          <p>Pending</p>
          <h3>${pending}</h3>
        </div>

        <div class="leave-summary-card">
          <p>Approved</p>
          <h3>${approved}</h3>
        </div>

        <div class="leave-summary-card">
          <p>Rejected</p>
          <h3>${rejected}</h3>
        </div>

      </div>

      <div class="table-container">

        <table>

          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Name</th>
              <th>Leave Type</th>
              <th>From</th>
              <th>To</th>
              <th>Days</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            ${rows || "<tr><td colspan='7'>No records found.</td></tr>"}
          </tbody>

        </table>

      </div>
    `;

  } catch (error) {

    console.error(error);

    document.getElementById("leaveReportArea").innerHTML = `
      <div class="error-message">
        Unable to generate report. Check Firestore Rules.
      </div>
    `;
  }
}


/* =====================================================
   21. SETTINGS PAGE
   ===================================================== */

function renderSettings() {

  const content = document.getElementById("pageContent");

  if (currentRole === "employee") {

    content.innerHTML = `

      <div class="panel">

        <h2 class="section-title">My Account</h2>

        <p>Employee ID: ${escapeHTML(currentProfile.employeeId)}</p>
        <p>Name: ${escapeHTML(currentProfile.employeeName)}</p>
        <p>Department: ${escapeHTML(currentProfile.department || "-")}</p>
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


/* =====================================================
   22. LOGOUT
   ===================================================== */

document.getElementById("logoutButton").addEventListener(
  "click",
  async () => {

    try {
      await signOut(auth);

    } catch (error) {

      console.error("Logout failed:", error);

      alert("Unable to log out. Please try again.");
    }
  }
);
