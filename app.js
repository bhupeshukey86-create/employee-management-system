
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
  serverTimestamp,
  addDoc,
  query,
  where,
  orderBy,
  updateDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";


// ============================================
// 1. FIREBASE CONFIGURATION
// KEEP THESE VALUES UNCHANGED
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

const employeeApp = getApps().find(
  item => item.name === "employeeCreator"
) || initializeApp(firebaseConfig, "employeeCreator");

const employeeAuth = getAuth(employeeApp);


// ============================================
// 2. GLOBAL VARIABLES
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

function normalizeEmployeeId(value) {
  return value.trim().toLowerCase();
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

function showLoginMessage(message, type = "error") {
  loginMessage.textContent = message;
  loginMessage.className =
    type === "success" ? "message success-message" : "message";
}

function setLoading(button, loading, originalText) {
  button.disabled = loading;
  button.textContent = loading ? "Please wait..." : originalText;
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

function formatDate(value) {
  if (!value) return "-";
  return new Date(value + "T00:00:00").toLocaleDateString("en-IN");
}

function calculateLeaveDays(fromDate, toDate) {
  const start = new Date(fromDate + "T00:00:00");
  const end = new Date(toDate + "T00:00:00");
  return Math.floor((end - start) / 86400000) + 1;
}


// ============================================
// 4. MANAGER LOGIN
// ============================================

document.getElementById("googleLogin").addEventListener(
  "click",
  async function () {
    setLoading(this, true, "Sign in with Google");

    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error(error);
      showLoginMessage(error.message);
    } finally {
      setLoading(this, false, "Sign in with Google");
    }
  }
);


// ============================================
// 5. EMPLOYEE LOGIN
// ============================================

document.getElementById("employeeLoginButton").addEventListener(
  "click",
  async function () {
    const employeeId =
      document.getElementById("employeeId").value.trim();

    const password =
      document.getElementById("employeePassword").value;

    if (!employeeId || !password) {
      showLoginMessage("Enter Employee ID and password.");
      return;
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(employeeId)) {
      showLoginMessage("Invalid Employee ID format.");
      return;
    }

    setLoading(this, true, "Employee Login");
    showLoginMessage("");

    try {
      await signInWithEmailAndPassword(
        auth,
        employeeLoginEmail(employeeId),
        password
      );
    } catch (error) {
      console.error(error);
      showLoginMessage("Invalid Employee ID or password.");
    } finally {
      setLoading(this, false, "Employee Login");
    }
  }
);


// ============================================
// 6. AUTHENTICATION AND USER ROLE
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

    const userRef = doc(db, "users", user.uid);
    const userSnapshot = await getDoc(userRef);

    if (!userSnapshot.exists()) {
      await signOut(auth);
      showLoginMessage(
        "User profile not found. Contact the manager."
      );
      return;
    }

    currentProfile = userSnapshot.data();
    currentRole = currentProfile.role;

    if (currentProfile.active !== true) {
      await signOut(auth);
      showLoginMessage("Your account is inactive.");
      return;
    }

    if (
      currentRole === "employee" &&
      currentProfile.status !== "Active"
    ) {
      await signOut(auth);
      showLoginMessage("Your employee account is inactive.");
      return;
    }

    if (currentRole !== "manager" && currentRole !== "employee") {
      await signOut(auth);
      showLoginMessage("Invalid user role.");
      return;
    }

    document.querySelectorAll(".manager-only").forEach(element => {
      element.classList.toggle("hidden", currentRole !== "manager");
    });

    updateUserDetails(
      currentRole === "manager"
        ? currentProfile.name
        : currentProfile.employeeName,
      currentRole === "manager" ? "Manager" : "Employee"
    );

    showApplication();
    openPage("dashboard");

  } catch (error) {
    console.error("Authentication error:", error);
    showLoginMessage("Unable to load your account.");
    await signOut(auth);
  }
});


// ============================================
// 7. SIDEBAR NAVIGATION
// ============================================

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


// ============================================
// 8. PAGE NAVIGATION
// ============================================

function openPage(page) {
  const titles = {
    dashboard: "Dashboard",
    employees: "Employee Details",
    leave: "Leave Management",
    reports: "Reports",
    settings: "Settings"
  };

  document.getElementById("pageTitle").textContent =
    titles[page] || "Dashboard";

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


// ============================================
// 9. DASHBOARD
// ============================================

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
          <p>Pending Leave Requests</p>
          <h2 id="pendingLeaves">-</h2>
        </div>

        <div class="stat-card">
          <p>Approved Leaves</p>
          <h2 id="approvedLeaves">-</h2>
        </div>
      </div>

      <div class="panel">
        <h2>Management Overview</h2>
        <p>Manage employee records and review leave applications.</p>
      </div>
    `;

    try {
      const usersSnapshot = await getDocs(
        query(collection(db, "users"), where("role", "==", "employee"))
      );

      let activeCount = 0;

      usersSnapshot.forEach(item => {
        if (item.data().status === "Active") activeCount++;
      });

      document.getElementById("totalEmployees").textContent =
        usersSnapshot.size;

      document.getElementById("activeEmployees").textContent =
        activeCount;

      const leaveSnapshot = await getDocs(
        collection(db, "leaveApplications")
      );

      let pending = 0;
      let approved = 0;

      leaveSnapshot.forEach(item => {
        if (item.data().status === "Pending") pending++;
        if (item.data().status === "Approved") approved++;
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
            <span>Personal Email</span>
            <strong>${escapeHTML(currentProfile.personalEmail || "-")}</strong>
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

        <button class="action-button" id="applyLeaveShortcut">
          Apply for Leave
        </button>
      </div>
    `;

    document.getElementById("applyLeaveShortcut")
      .addEventListener("click", () => openPage("leave"));
  }
}


// ============================================
// 10. EMPLOYEE MANAGEMENT
// ============================================

async function renderEmployees() {
  if (currentRole !== "manager") return;

  const content = document.getElementById("pageContent");

  content.innerHTML = `
    <div class="panel">
      <h2 class="section-title">Create New Employee</h2>

      <form id="employeeForm">
        <div class="form-grid">

          <div class="form-group">
            <label>Employee ID *</label>
            <input id="newEmployeeId" required
              placeholder="Example: EMP001">
          </div>

          <div class="form-group">
            <label>Employee Name *</label>
            <input id="newEmployeeName" required>
          </div>

          <div class="form-group">
            <label>Initial Password *</label>
            <input type="password" id="newEmployeePassword"
              minlength="6" required>
          </div>

          <div class="form-group">
            <label>Personal Email *</label>
            <input type="email" id="newEmployeePersonalEmail"
              placeholder="personal@gmail.com" required>
          </div>

          <div class="form-group">
            <label>Department</label>
            <input id="newEmployeeDepartment">
          </div>

          <div class="form-group">
            <label>Designation</label>
            <input id="newEmployeeDesignation">
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
      <h2 class="section-title">Employee Records</h2>
      <div id="employeeTableArea">Loading employees...</div>
    </div>
  `;

  document.getElementById("employeeForm")
    .addEventListener("submit", createEmployee);

  await loadEmployeeTable();
}


// ============================================
// 11. CREATE EMPLOYEE
// ============================================

async function createEmployee(event) {
  event.preventDefault();

  if (currentRole !== "manager" || !currentUser) return;

  const button = document.getElementById("createEmployeeButton");
  const message = document.getElementById("employeeFormMessage");

  const employeeId =
    document.getElementById("newEmployeeId").value.trim();

  const employeeName =
    document.getElementById("newEmployeeName").value.trim();

  const password =
    document.getElementById("newEmployeePassword").value;

  const personalEmail =
    document.getElementById("newEmployeePersonalEmail").value.trim();

  const department =
    document.getElementById("newEmployeeDepartment").value.trim();

  const designation =
    document.getElementById("newEmployeeDesignation").value.trim();

  const joiningDate =
    document.getElementById("newEmployeeJoiningDate").value;

  if (!/^[a-zA-Z0-9_-]+$/.test(employeeId)) {
    message.innerHTML =
      '<div class="error-message">Invalid Employee ID format.</div>';
    return;
  }

  if (password.length < 6) {
    message.innerHTML =
      '<div class="error-message">Password must have at least 6 characters.</div>';
    return;
  }

  const normalizedId = normalizeEmployeeId(employeeId);

  setLoading(button, true, "Create Employee Account");

  try {
    const existing = await getDocs(
      query(
        collection(db, "users"),
        where("employeeId", "==", normalizedId)
      )
    );

    if (!existing.empty) {
      throw new Error("This Employee ID already exists.");
    }

    const credential = await createUserWithEmailAndPassword(
      employeeAuth,
      employeeLoginEmail(employeeId),
      password
    );

    const employeeUid = credential.user.uid;

    const employeeData = {
      uid: employeeUid,
      employeeId: normalizedId,
      employeeName,
      personalEmail,
      department,
      designation,
      joiningDate,
      role: "employee",
      active: true,
      status: "Active",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(
      doc(db, "users", employeeUid),
      employeeData
    );

    message.innerHTML = `
      <div class="success-message">
        Employee account created successfully!<br>
        Employee ID: <strong>${escapeHTML(employeeId)}</strong>
      </div>
    `;

    document.getElementById("employeeForm").reset();
    await loadEmployeeTable();

  } catch (error) {
    console.error("Employee creation error:", error);

    message.innerHTML = `
      <div class="error-message">
        ${escapeHTML(error.message || "Unable to create employee.")}
      </div>
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

  try {
    const snapshot = await getDocs(
      query(collection(db, "users"), where("role", "==", "employee"))
    );

    if (snapshot.empty) {
      area.innerHTML = '<div class="empty-state">No employees found.</div>';
      return;
    }

    let rows = "";

    snapshot.forEach(item => {
      const employee = item.data();
      const active = employee.status === "Active";

      rows += `
        <tr>
          <td>${escapeHTML(employee.employeeId)}</td>
          <td>${escapeHTML(employee.employeeName)}</td>
          <td>${escapeHTML(employee.personalEmail || "-")}</td>
          <td>${escapeHTML(employee.department || "-")}</td>
          <td>${escapeHTML(employee.designation || "-")}</td>
          <td>${escapeHTML(employee.status)}</td>
          <td>
            ${
              active
                ? `<button class="action-button discontinue-button"
                    data-uid="${escapeHTML(item.id)}">
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
              <th>Personal Email</th>
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
      button.addEventListener("click", () =>
        discontinueEmployee(button.dataset.uid, button)
      );
    });

  } catch (error) {
    console.error(error);
    area.innerHTML =
      '<div class="error-message">Unable to load employee records.</div>';
  }
}


// ============================================
// 13. DISCONTINUE EMPLOYEE
// ============================================

async function discontinueEmployee(uid, button) {
  if (currentRole !== "manager") return;

  if (!confirm(
    "Discontinue this employee? Their login will be disabled, " +
    "but their records will be preserved."
  )) return;

  button.disabled = true;

  try {
    await updateDoc(doc(db, "users", uid), {
      active: false,
      status: "Inactive",
      discontinuedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    alert("Employee discontinued successfully.");
    await loadEmployeeTable();

  } catch (error) {
    console.error(error);
    alert("Unable to discontinue employee. Check Firestore Rules.");
    button.disabled = false;
  }
}


// ============================================
// 14. LEAVE MANAGEMENT
// ============================================

async function renderLeaveManagement() {
  const content = document.getElementById("pageContent");

  if (currentRole === "employee") {
    content.innerHTML = `
      <div class="panel">
        <h2 class="section-title">Apply for Leave</h2>

        <form id="leaveForm">
          <div class="form-grid">

            <div class="form-group">
              <label>Leave Type *</label>
              <select id="leaveType" required>
                <option value="">Select leave type</option>
                <option>Casual Leave</option>
                <option>Sick Leave</option>
                <option>Earned Leave</option>
                <option>Unpaid Leave</option>
                <option>Other</option>
              </select>
            </div>

            <div class="form-group">
              <label>From Date *</label>
              <input type="date" id="fromDate" required>
            </div>

            <div class="form-group">
              <label>To Date *</label>
              <input type="date" id="toDate" required>
            </div>

          </div>

          <div class="form-group">
            <label>Reason *</label>
            <textarea id="leaveReason" rows="4"
              maxlength="2000" required></textarea>
          </div>

          <div id="leaveFormMessage"></div>

          <button type="submit" class="action-button"
            id="submitLeaveButton">
            Submit Leave Application
          </button>
        </form>
      </div>

      <div class="panel">
        <h2 class="section-title">My Leave Applications</h2>
        <div id="myLeaveHistory">Loading leave history...</div>
      </div>
    `;

    document.getElementById("leaveForm")
      .addEventListener("submit", submitLeaveApplication);

    await loadEmployeeLeaveHistory();

  } else {
    content.innerHTML = `
      <div class="panel">
        <h2 class="section-title">Employee Leave Applications</h2>
        <div id="managerLeaveList">Loading leave applications...</div>
      </div>
    `;

    await loadManagerLeaveApplications();
  }
}


// ============================================
// 15. EMPLOYEE SUBMITS LEAVE
// ============================================

async function submitLeaveApplication(event) {
  event.preventDefault();

  const button = document.getElementById("submitLeaveButton");
  const message = document.getElementById("leaveFormMessage");

  const leaveType = document.getElementById("leaveType").value;
  const fromDate = document.getElementById("fromDate").value;
  const toDate = document.getElementById("toDate").value;
  const reason = document.getElementById("leaveReason").value.trim();

  if (!fromDate || !toDate || toDate < fromDate) {
    message.innerHTML =
      '<div class="error-message">Please select valid leave dates.</div>';
    return;
  }

  const totalDays = calculateLeaveDays(fromDate, toDate);

  setLoading(button, true, "Submit Leave Application");

  try {
    await addDoc(collection(db, "leaveApplications"), {
      employeeUid: currentUser.uid,
      employeeId: currentProfile.employeeId,
      employeeName: currentProfile.employeeName,
      personalEmail: currentProfile.personalEmail || "",
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

    message.innerHTML =
      '<div class="success-message">Leave application submitted successfully.</div>';

    document.getElementById("leaveForm").reset();
    await loadEmployeeLeaveHistory();

  } catch (error) {
    console.error("Leave submission error:", error);
    message.innerHTML =
      '<div class="error-message">Unable to submit leave application. Check Firestore Rules.</div>';
  } finally {
    setLoading(button, false, "Submit Leave Application");
  }
}


// ============================================
// 16. EMPLOYEE LEAVE HISTORY
// ============================================

async function loadEmployeeLeaveHistory() {
  const area = document.getElementById("myLeaveHistory");
  if (!area) return;

  try {
    const leaveQuery = query(
      collection(db, "leaveApplications"),
      where("employeeUid", "==", currentUser.uid),
      orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(leaveQuery);

    if (snapshot.empty) {
      area.innerHTML =
        '<div class="empty-state">You have not applied for leave yet.</div>';
      return;
    }

    let html = `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Leave Type</th>
              <th>From</th>
              <th>To</th>
              <th>Days</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Manager Reply</th>
            </tr>
          </thead>
          <tbody>
    `;

    snapshot.forEach(item => {
      const leave = item.data();

      html += `
        <tr>
          <td>${escapeHTML(leave.leaveType)}</td>
          <td>${formatDate(leave.fromDate)}</td>
          <td>${formatDate(leave.toDate)}</td>
          <td>${escapeHTML(leave.totalDays)}</td>
          <td>${escapeHTML(leave.reason)}</td>
          <td>${escapeHTML(leave.status)}</td>
          <td>${escapeHTML(leave.managerMessage || "No reply yet")}</td>
        </tr>
      `;
    });

    html += "</tbody></table></div>";
    area.innerHTML = html;

  } catch (error) {
    console.error("Employee leave history error:", error);
    area.innerHTML =
      '<div class="error-message">Unable to load leave history. Check Firestore Rules and indexes.</div>';
  }
}


// ============================================
// 17. MANAGER LEAVE APPLICATIONS
// ============================================

async function loadManagerLeaveApplications() {
  const area = document.getElementById("managerLeaveList");
  if (!area) return;

  try {
    const leaveQuery = query(
      collection(db, "leaveApplications"),
      orderBy("createdAt", "desc")
    );

    const snapshot = await getDocs(leaveQuery);

    if (snapshot.empty) {
      area.innerHTML =
        '<div class="empty-state">No leave applications received.</div>';
      return;
    }

    let html = `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Employee ID</th>
              <th>Leave Type</th>
              <th>Dates</th>
              <th>Days</th>
              <th>Reason</th>
              <th>Decision</th>
            </tr>
          </thead>
          <tbody>
    `;

    snapshot.forEach(item => {
      const leave = item.data();

      html += `
        <tr>
          <td>${escapeHTML(leave.employeeName)}</td>
          <td>${escapeHTML(leave.employeeId)}</td>
          <td>${escapeHTML(leave.leaveType)}</td>
          <td>${formatDate(leave.fromDate)} - ${formatDate(leave.toDate)}</td>
          <td>${escapeHTML(leave.totalDays)}</td>
          <td>${escapeHTML(leave.reason)}</td>
          <td>
            ${
              leave.status === "Pending"
                ? `<button class="approve-button"
                    data-id="${escapeHTML(item.id)}"
                    data-status="Approved">Approve</button>
                   <button class="reject-button"
                    data-id="${escapeHTML(item.id)}"
                    data-status="Rejected">Reject</button>`
                : `<strong>${escapeHTML(leave.status)}</strong>
                   <p>${escapeHTML(leave.managerMessage || "")}</p>`
            }
          </td>
        </tr>
      `;
    });

    html += "</tbody></table></div>";
    area.innerHTML = html;

    area.querySelectorAll(".approve-button, .reject-button")
      .forEach(button => {
        button.addEventListener("click", () =>
          reviewLeaveApplication(
            button.dataset.id,
            button.dataset.status
          )
        );
      });

  } catch (error) {
    console.error("Manager leave loading error:", error);
    area.innerHTML =
      '<div class="error-message">Unable to load leave applications. Check Firestore Rules.</div>';
  }
}


// ============================================
// 18. MANAGER APPROVES OR REJECTS LEAVE
// ============================================

async function reviewLeaveApplication(leaveId, decision) {
  if (currentRole !== "manager") return;

  const managerMessage = prompt(
    `Enter your message for this ${decision.toLowerCase()} decision:`
  );

  if (managerMessage === null) return;

  if (managerMessage.trim().length > 2000) {
    alert("Message cannot exceed 2000 characters.");
    return;
  }

  try {
    await updateDoc(doc(db, "leaveApplications", leaveId), {
      status: decision,
      managerMessage: managerMessage.trim(),
      reviewedBy: currentUser.email || currentUser.uid,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    alert(`Leave application ${decision.toLowerCase()}.`);
    await loadManagerLeaveApplications();

  } catch (error) {
    console.error("Leave review error:", error);
    alert("Unable to update leave application. Check Firestore Rules.");
  }
}


// ============================================
// 19. REPORTS
// ============================================

async function renderReports() {
  const content = document.getElementById("pageContent");

  content.innerHTML = `
    <div class="panel">
      <h2 class="section-title">Leave Reports</h2>
      <div id="leaveReportArea">Loading reports...</div>
    </div>
  `;

  try {
    const snapshot = await getDocs(
      collection(db, "leaveApplications")
    );

    let pending = 0;
    let approved = 0;
    let rejected = 0;

    snapshot.forEach(item => {
      const status = item.data().status;
      if (status === "Pending") pending++;
      if (status === "Approved") approved++;
      if (status === "Rejected") rejected++;
    });

    document.getElementById("leaveReportArea").innerHTML = `
      <div class="dashboard-grid">
        <div class="stat-card"><p>Pending</p><h2>${pending}</h2></div>
        <div class="stat-card"><p>Approved</p><h2>${approved}</h2></div>
        <div class="stat-card"><p>Rejected</p><h2>${rejected}</h2></div>
        <div class="stat-card"><p>Total Applications</p><h2>${snapshot.size}</h2></div>
      </div>
    `;

  } catch (error) {
    console.error(error);
    document.getElementById("leaveReportArea").textContent =
      "Unable to load reports.";
  }
}


// ============================================
// 20. SETTINGS
// ============================================

function renderSettings() {
  const content = document.getElementById("pageContent");

  if (currentRole === "employee") {
    content.innerHTML = `
      <div class="panel">
        <h2 class="section-title">My Account</h2>
        <p>Employee ID: ${escapeHTML(currentProfile.employeeId)}</p>
        <p>Name: ${escapeHTML(currentProfile.employeeName)}</p>
        <p>Personal Email: ${escapeHTML(currentProfile.personalEmail || "-")}</p>
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
// 21. LOGOUT
// ============================================

document.getElementById("logoutButton").addEventListener(
  "click",
  async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error(error);
      alert("Unable to log out.");
    }
  }
);
