
import { initializeApp, getApps, getApp } from
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
  setDoc,
  addDoc,
  collection,
  getDocs,
  query,
  where,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// =====================================
// FIREBASE CONFIGURATION
// =====================================

const firebaseConfig = {
  apiKey: "AIzaSyDBjWmYDXeMtr04wFrf2VKJfh2cxVoLeY8",
  authDomain: "employee-management-system-v1.firebaseapp.com",
  projectId: "employee-management-system-v1",
  storageBucket: "employee-management-system-v1.firebasestorage.app",
  messagingSenderId: "793945224801",
  appId: "1:793945224801:web:1bc24e7a79fe018c31dc20"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();

const MANAGER_EMAIL = "bhupeshukey86@gmail.com";
const EMPLOYEE_AUTH_DOMAIN =
  "employee-management-system-v1.firebaseapp.com";

// Secondary Firebase app keeps the manager signed in
// while creating employee accounts.
const creatorApp = getApps().some(
  item => item.name === "employeeCreator"
)
  ? getApp("employeeCreator")
  : initializeApp(firebaseConfig, "employeeCreator");

const creatorAuth = getAuth(creatorApp);

// =====================================
// APPLICATION STATE
// =====================================

let currentUser = null;
let currentProfile = null;
let currentRole = null;

// =====================================
// HTML ELEMENT HELPERS
// =====================================

const $ = selector => document.querySelector(selector);

function showMessage(message, type = "info") {
  const element = $("#loginMessage");

  if (!element) {
    alert(message);
    return;
  }

  element.textContent = message;
  element.className = `message message-${type}`;
  element.classList.remove("hidden");
}

function clearMessage() {
  const element = $("#loginMessage");

  if (element) {
    element.textContent = "";
    element.className = "hidden";
  }
}

function showLogin() {
  $("#loginScreen")?.classList.remove("hidden");
  $("#app")?.classList.add("hidden");
}

function showApplication() {
  $("#loginScreen")?.classList.add("hidden");
  $("#app")?.classList.remove("hidden");
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

function formatDate(value) {
  if (!value) return "-";

  const date = value.toDate
    ? value.toDate()
    : new Date(value);

  return date.toLocaleDateString("en-IN");
}

function normalizedEmployeeId(value) {
  return String(value || "").trim().toUpperCase();
}

function employeeLoginEmail(employeeId) {
  return (
    normalizedEmployeeId(employeeId).toLowerCase() +
    "@" +
    EMPLOYEE_AUTH_DOMAIN
  );
}

// =====================================
// MANAGER GOOGLE LOGIN
// =====================================

$("#googleLogin")?.addEventListener("click", async () => {
  clearMessage();

  try {
    const result = await signInWithPopup(auth, googleProvider);

    const user = result.user;
    const email = (user.email || "").toLowerCase();

    if (email !== MANAGER_EMAIL.toLowerCase()) {
      await signOut(auth);
      showMessage(
        "Unauthorized manager account. Please use the authorized Google account.",
        "error"
      );
      return;
    }

    await createManagerProfile(user);

  } catch (error) {
    console.error("Manager login error:", error);
    showMessage(error.message, "error");
  }
});

// =====================================
// AUTOMATIC MANAGER PROFILE
// =====================================

async function createManagerProfile(user) {
  const managerRef = doc(db, "users", user.uid);
  const managerSnapshot = await getDoc(managerRef);

  if (!managerSnapshot.exists()) {
    await setDoc(managerRef, {
      uid: user.uid,
      name: user.displayName || "Manager",
      email: MANAGER_EMAIL,
      role: "manager",
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  } else {
    const data = managerSnapshot.data();

    if (
      data.role !== "manager" ||
      data.email?.toLowerCase() !== MANAGER_EMAIL.toLowerCase()
    ) {
      await signOut(auth);
      throw new Error("Manager profile verification failed.");
    }

    if (data.active === false) {
      await signOut(auth);
      throw new Error("This manager account is inactive.");
    }
  }
}

// =====================================
// EMPLOYEE LOGIN
// =====================================

$("#employeeLoginButton")?.addEventListener("click", async () => {
  clearMessage();

  const employeeId = normalizedEmployeeId(
    $("#employeeId")?.value
  );

  const password = $("#employeePassword")?.value || "";

  if (!employeeId || !password) {
    showMessage("Enter Employee ID and password.", "error");
    return;
  }

  try {
    const result = await signInWithEmailAndPassword(
      auth,
      employeeLoginEmail(employeeId),
      password
    );

    const profileRef = doc(db, "users", result.user.uid);
    const profileSnapshot = await getDoc(profileRef);

    if (!profileSnapshot.exists()) {
      await signOut(auth);
      throw new Error("Employee profile not found.");
    }

    const profile = profileSnapshot.data();

    if (
      profile.role !== "employee" ||
      profile.active !== true ||
      profile.employeeId !== employeeId
    ) {
      await signOut(auth);
      throw new Error(
        "Employee account is inactive or not authorized."
      );
    }

  } catch (error) {
    console.error("Employee login error:", error);
    showMessage(
      "Login failed. Check your Employee ID and password, or contact the manager.",
      "error"
    );
  }
});

// =====================================
// AUTHENTICATION STATE
// =====================================

onAuthStateChanged(auth, async user => {
  if (!user) {
    currentUser = null;
    currentProfile = null;
    currentRole = null;
    showLogin();
    return;
  }

  try {
    const email = (user.email || "").toLowerCase();

    // Manager account
    if (email === MANAGER_EMAIL.toLowerCase()) {
      await createManagerProfile(user);
    }

    const profileSnapshot = await getDoc(
      doc(db, "users", user.uid)
    );

    if (!profileSnapshot.exists()) {
      await signOut(auth);
      showLogin();
      showMessage("User profile not found.", "error");
      return;
    }

    const profile = profileSnapshot.data();

    if (profile.active !== true) {
      await signOut(auth);
      showLogin();
      showMessage("Your account is inactive.", "error");
      return;
    }

    if (
      profile.role === "manager" &&
      email !== MANAGER_EMAIL.toLowerCase()
    ) {
      await signOut(auth);
      showLogin();
      showMessage("Unauthorized manager account.", "error");
      return;
    }

    if (!["manager", "employee"].includes(profile.role)) {
      await signOut(auth);
      showLogin();
      showMessage("Invalid account role.", "error");
      return;
    }

    currentUser = user;
    currentProfile = profile;
    currentRole = profile.role;

    showApplication();
    updateUserInformation();
    configureNavigation();
    loadPage("dashboard");

  } catch (error) {
    console.error("Authentication state error:", error);
    await signOut(auth);
    showLogin();
    showMessage(error.message, "error");
  }
});

// =====================================
// USER INFORMATION
// =====================================

function updateUserInformation() {
  const name = currentProfile.name || "User";
  const initial = name.charAt(0).toUpperCase();

  if ($("#sidebarUserName")) {
    $("#sidebarUserName").textContent = name;
  }

  if ($("#sidebarUserRole")) {
    $("#sidebarUserRole").textContent =
      currentRole === "manager" ? "Manager" : "Employee";
  }

  if ($("#headerUserName")) {
    $("#headerUserName").textContent = name;
  }

  if ($("#userAvatar")) {
    $("#userAvatar").textContent = initial;
  }

  if ($("#headerAvatar")) {
    $("#headerAvatar").textContent = initial;
  }
}

// =====================================
// NAVIGATION
// =====================================

function configureNavigation() {
  document.querySelectorAll(".manager-only").forEach(element => {
    element.classList.toggle(
      "hidden",
      currentRole !== "manager"
    );
  });

  document.querySelectorAll(".nav-button").forEach(button => {
    button.onclick = () => {
      const page = button.dataset.page;

      if (
        currentRole !== "manager" &&
        ["employees", "reports", "settings"].includes(page)
      ) {
        return;
      }

      document.querySelectorAll(".nav-button").forEach(item => {
        item.classList.remove("active");
      });

      button.classList.add("active");
      loadPage(page);
    };
  });
}

function loadPage(page) {
  const titles = {
    dashboard: "Dashboard",
    employees: "Employee Management",
    leave: "Leave Management",
    reports: "Reports",
    settings: "Settings"
  };

  if ($("#pageTitle")) {
    $("#pageTitle").textContent = titles[page] || "Dashboard";
  }

  if (page === "dashboard") {
    currentRole === "manager"
      ? renderManagerDashboard()
      : renderEmployeeDashboard();
  }

  if (page === "employees" && currentRole === "manager") {
    renderEmployees();
  }

  if (page === "leave") {
    renderLeavePage();
  }

  if (page === "reports" && currentRole === "manager") {
    renderReports();
  }

  if (page === "settings" && currentRole === "manager") {
    renderSettings();
  }
}

// =====================================
// MANAGER DASHBOARD
// =====================================

async function renderManagerDashboard() {
  const [employeeSnapshot, leaveSnapshot] = await Promise.all([
    getDocs(collection(db, "users")),
    getDocs(collection(db, "leaveApplications"))
  ]);

  const employees = employeeSnapshot.docs
    .map(item => item.data())
    .filter(item => item.role === "employee");

  const active = employees.filter(
    item => item.active === true
  ).length;

  const pending = leaveSnapshot.docs
    .map(item => item.data())
    .filter(item => item.status === "Pending").length;

  $("#pageContent").innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <h3>Total Employees</h3>
        <div class="stat-number">${employees.length}</div>
      </div>

      <div class="stat-card">
        <h3>Active Employees</h3>
        <div class="stat-number">${active}</div>
      </div>

      <div class="stat-card">
        <h3>Inactive Employees</h3>
        <div class="stat-number">${employees.length - active}</div>
      </div>

      <div class="stat-card">
        <h3>Pending Leave Requests</h3>
        <div class="stat-number">${pending}</div>
      </div>
    </div>

    <div class="dashboard-card">
      <h3>Welcome, ${escapeHTML(currentProfile.name)}</h3>
      <p>Manage employee records and review leave applications.</p>
    </div>
  `;
}

// =====================================
// EMPLOYEE DASHBOARD
// =====================================

async function renderEmployeeDashboard() {
  const leaveSnapshot = await getDocs(
    query(
      collection(db, "leaveApplications"),
      where("employeeUid", "==", currentUser.uid)
    )
  );

  const leaves = leaveSnapshot.docs.map(item => item.data());

  const pending = leaves.filter(
    item => item.status === "Pending"
  ).length;

  const approved = leaves.filter(
    item => item.status === "Approved"
  ).length;

  $("#pageContent").innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <h3>Leave Applications</h3>
        <div class="stat-number">${leaves.length}</div>
      </div>

      <div class="stat-card">
        <h3>Pending</h3>
        <div class="stat-number">${pending}</div>
      </div>

      <div class="stat-card">
        <h3>Approved</h3>
        <div class="stat-number">${approved}</div>
      </div>
    </div>

    <div class="profile-card">
      <h3>My Profile</h3>
      <p><strong>Name:</strong> ${escapeHTML(currentProfile.name)}</p>
      <p><strong>Employee ID:</strong> ${escapeHTML(currentProfile.employeeId)}</p>
      <p><strong>Department:</strong> ${escapeHTML(currentProfile.department)}</p>
      <p><strong>Designation:</strong> ${escapeHTML(currentProfile.designation)}</p>
      <p><strong>Personal Email:</strong> ${escapeHTML(currentProfile.personalEmail)}</p>
      <p><strong>Joining Date:</strong> ${escapeHTML(currentProfile.joiningDate)}</p>
    </div>
  `;
}

// =====================================
// EMPLOYEE MANAGEMENT
// =====================================

async function renderEmployees() {
  const snapshot = await getDocs(collection(db, "users"));

  const employees = snapshot.docs
    .map(item => ({
      uid: item.id,
      ...item.data()
    }))
    .filter(item => item.role === "employee");

  let rows = "";

  employees.forEach(employee => {
    rows += `
      <tr>
        <td>${escapeHTML(employee.employeeId)}</td>
        <td>${escapeHTML(employee.name)}</td>
        <td>${escapeHTML(employee.department)}</td>
        <td>${escapeHTML(employee.designation)}</td>
        <td>${escapeHTML(employee.personalEmail)}</td>
        <td>
          <span class="status ${
            employee.active ? "status-active" : "status-inactive"
          }">
            ${employee.active ? "Active" : "Inactive"}
          </span>
        </td>
        <td>
          ${
            employee.active
              ? `<button class="danger-button"
                  onclick="discontinueEmployee('${employee.uid}')">
                  Discontinue
                </button>`
              : "-"
          }
        </td>
      </tr>
    `;
  });

  $("#pageContent").innerHTML = `
    <div class="form-container">
      <h3>Add New Employee</h3>

      <form id="employeeForm">
        <div class="form-group">
          <label>Employee ID</label>
          <input id="newEmployeeId" required>
        </div>

        <div class="form-group">
          <label>Employee Name</label>
          <input id="newEmployeeName" required>
        </div>

        <div class="form-group">
          <label>Personal Email</label>
          <input id="newPersonalEmail" type="email" required>
        </div>

        <div class="form-group">
          <label>Department</label>
          <input id="newDepartment" required>
        </div>

        <div class="form-group">
          <label>Designation</label>
          <input id="newDesignation" required>
        </div>

        <div class="form-group">
          <label>Joining Date</label>
          <input id="newJoiningDate" type="date" required>
        </div>

        <div class="form-group">
          <label>Initial Password</label>
          <input id="newEmployeePassword"
                 type="password"
                 minlength="6"
                 required>
        </div>

        <button class="primary-button" type="submit">
          Create Employee
        </button>
      </form>

      <p id="employeeFormMessage"></p>
    </div>

    <div class="dashboard-card">
      <h3>Employee Details</h3>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Employee ID</th>
              <th>Name</th>
              <th>Department</th>
              <th>Designation</th>
              <th>Personal Email</th>
              <th>Status</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;

  $("#employeeForm").addEventListener("submit", createEmployee);
}

// =====================================
// CREATE EMPLOYEE
// =====================================

async function createEmployee(event) {
  event.preventDefault();

  if (currentRole !== "manager") {
    return;
  }

  const employeeId = normalizedEmployeeId(
    $("#newEmployeeId").value
  );

  const name = $("#newEmployeeName").value.trim();
  const personalEmail = $("#newPersonalEmail").value.trim();
  const department = $("#newDepartment").value.trim();
  const designation = $("#newDesignation").value.trim();
  const joiningDate = $("#newJoiningDate").value;
  const password = $("#newEmployeePassword").value;

  const message = $("#employeeFormMessage");

  try {
    const existing = await getDocs(
      query(
        collection(db, "users"),
        where("employeeId", "==", employeeId)
      )
    );

    if (!existing.empty) {
      throw new Error("Employee ID already exists.");
    }

    const credential = await createUserWithEmailAndPassword(
      creatorAuth,
      employeeLoginEmail(employeeId),
      password
    );

    const employee = credential.user;

    await setDoc(doc(db, "users", employee.uid), {
      uid: employee.uid,
      employeeId,
      name,
      personalEmail,
      department,
      designation,
      joiningDate,
      role: "employee",
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    await signOut(creatorAuth);

    message.textContent = "Employee created successfully.";
    message.className = "message message-success";

    $("#employeeForm").reset();
    await renderEmployees();

  } catch (error) {
    console.error("Employee creation error:", error);

    if (creatorAuth.currentUser) {
      await signOut(creatorAuth);
    }

    message.textContent = error.message;
    message.className = "message message-error";
  }
}

// =====================================
// DISCONTINUE EMPLOYEE
// =====================================

window.discontinueEmployee = async function(uid) {
  if (currentRole !== "manager") return;

  const confirmed = confirm(
    "Are you sure you want to discontinue this employee?"
  );

  if (!confirmed) return;

  try {
    await updateDoc(doc(db, "users", uid), {
      active: false,
      updatedAt: serverTimestamp()
    });

    alert("Employee discontinued successfully.");
    await renderEmployees();

  } catch (error) {
    console.error(error);
    alert("Unable to discontinue employee: " + error.message);
  }
};

// =====================================
// LEAVE MANAGEMENT
// =====================================

async function renderLeavePage() {
  if (currentRole === "manager") {
    await renderManagerLeave();
  } else {
    await renderEmployeeLeave();
  }
}

// EMPLOYEE LEAVE APPLICATION

async function renderEmployeeLeave() {
  const snapshot = await getDocs(
    query(
      collection(db, "leaveApplications"),
      where("employeeUid", "==", currentUser.uid)
    )
  );

  const leaves = snapshot.docs
    .map(item => ({
      id: item.id,
      ...item.data()
    }))
    .sort((a, b) => {
      const dateA = a.createdAt?.toMillis?.() || 0;
      const dateB = b.createdAt?.toMillis?.() || 0;
      return dateB - dateA;
    });

  let rows = "";

  leaves.forEach(leave => {
    rows += `
      <tr>
        <td>${escapeHTML(leave.leaveType)}</td>
        <td>${escapeHTML(leave.fromDate)}</td>
        <td>${escapeHTML(leave.toDate)}</td>
        <td>
          <span class="status status-${String(leave.status).toLowerCase()}">
            ${escapeHTML(leave.status)}
          </span>
        </td>
        <td>${escapeHTML(leave.managerMessage || "-")}</td>
      </tr>
    `;
  });

  $("#pageContent").innerHTML = `
    <div class="form-container">
      <h3>Apply for Leave</h3>

      <form id="leaveForm">
        <div class="form-group">
          <label>Leave Type</label>
          <select id="leaveType" required>
            <option value="">Select Leave Type</option>
            <option>Casual Leave</option>
            <option>Sick Leave</option>
            <option>Earned Leave</option>
            <option>Other</option>
          </select>
        </div>

        <div class="form-group">
          <label>From Date</label>
          <input id="leaveFrom" type="date" required>
        </div>

        <div class="form-group">
          <label>To Date</label>
          <input id="leaveTo" type="date" required>
        </div>

        <div class="form-group">
          <label>Reason</label>
          <textarea id="leaveReason" required></textarea>
        </div>

        <button class="primary-button" type="submit">
          Submit Leave Application
        </button>
      </form>

      <p id="leaveFormMessage"></p>
    </div>

    <div class="dashboard-card">
      <h3>My Leave History</h3>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Leave Type</th>
              <th>From</th>
              <th>To</th>
              <th>Status</th>
              <th>Manager Message</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;

  $("#leaveForm").addEventListener("submit", submitLeave);
}

// SUBMIT LEAVE APPLICATION

async function submitLeave(event) {
  event.preventDefault();

  const leaveType = $("#leaveType").value;
  const fromDate = $("#leaveFrom").value;
  const toDate = $("#leaveTo").value;
  const reason = $("#leaveReason").value.trim();

  const message = $("#leaveFormMessage");

  if (toDate < fromDate) {
    message.textContent = "To Date cannot be earlier than From Date.";
    message.className = "message message-error";
    return;
  }

  try {
    await addDoc(collection(db, "leaveApplications"), {
      employeeUid: currentUser.uid,
      employeeId: currentProfile.employeeId,
      employeeName: currentProfile.name,
      personalEmail: currentProfile.personalEmail,
      leaveType,
      fromDate,
      toDate,
      reason,
      status: "Pending",
      managerMessage: "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    message.textContent = "Leave application submitted successfully.";
    message.className = "message message-success";

    await renderEmployeeLeave();

  } catch (error) {
    console.error(error);
    message.textContent = error.message;
    message.className = "message message-error";
  }
}

// =====================================
// MANAGER LEAVE REVIEW
// =====================================

async function renderManagerLeave() {
  const snapshot = await getDocs(
    collection(db, "leaveApplications")
  );

  const leaves = snapshot.docs
    .map(item => ({
      id: item.id,
      ...item.data()
    }))
    .sort((a, b) => {
      const dateA = a.createdAt?.toMillis?.() || 0;
      const dateB = b.createdAt?.toMillis?.() || 0;
      return dateB - dateA;
    });

  let rows = "";

  leaves.forEach(leave => {
    rows += `
      <tr>
        <td>${escapeHTML(leave.employeeName)}</td>
        <td>${escapeHTML(leave.employeeId)}</td>
        <td>${escapeHTML(leave.leaveType)}</td>
        <td>${escapeHTML(leave.fromDate)}</td>
        <td>${escapeHTML(leave.toDate)}</td>
        <td>${escapeHTML(leave.reason)}</td>
        <td>${escapeHTML(leave.status)}</td>
        <td>
          ${
            leave.status === "Pending"
              ? `
                <input id="message-${leave.id}"
                       placeholder="Manager message">

                <button class="success-button"
                  onclick="reviewLeave('${leave.id}', 'Approved')">
                  Approve
                </button>

                <button class="danger-button"
                  onclick="reviewLeave('${leave.id}', 'Rejected')">
                  Reject
                </button>
              `
              : escapeHTML(leave.managerMessage || "-")
          }
        </td>
      </tr>
    `;
  });

  $("#pageContent").innerHTML = `
    <div class="dashboard-card">
      <h3>Employee Leave Requests</h3>

      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Employee</th>
              <th>Employee ID</th>
              <th>Leave Type</th>
              <th>From</th>
              <th>To</th>
              <th>Reason</th>
              <th>Status</th>
              <th>Review</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

// APPROVE OR REJECT LEAVE

window.reviewLeave = async function(id, status) {
  if (currentRole !== "manager") return;

  const message =
    $(`#message-${CSS.escape(id)}`)?.value.trim() || "";

  try {
    await updateDoc(doc(db, "leaveApplications", id), {
      status,
      managerMessage: message,
      reviewedBy: currentUser.uid,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    alert(`Leave application ${status.toLowerCase()}.`);
    await renderManagerLeave();

  } catch (error) {
    console.error(error);
    alert("Unable to update leave: " + error.message);
  }
};

// =====================================
// REPORTS
// =====================================

async function renderReports() {
  const snapshot = await getDocs(collection(db, "users"));

  const employees = snapshot.docs
    .map(item => item.data())
    .filter(item => item.role === "employee");

  const active = employees.filter(
    item => item.active === true
  ).length;

  const inactive = employees.length - active;

  $("#pageContent").innerHTML = `
    <div class="stats-grid">
      <div class="stat-card">
        <h3>Total Employees</h3>
        <div class="stat-number">${employees.length}</div>
      </div>

      <div class="stat-card">
        <h3>Active Employees</h3>
        <div class="stat-number">${active}</div>
      </div>

      <div class="stat-card">
        <h3>Inactive Employees</h3>
        <div class="stat-number">${inactive}</div>
      </div>
    </div>
  `;
}

// =====================================
// SETTINGS
// =====================================

function renderSettings() {
  $("#pageContent").innerHTML = `
    <div class="dashboard-card">
      <h3>Account Settings</h3>
      <p><strong>Manager:</strong> ${escapeHTML(currentProfile.name)}</p>
      <p><strong>Email:</strong> ${escapeHTML(currentProfile.email)}</p>
      <p><strong>Role:</strong> Manager</p>
    </div>
  `;
}

// =====================================
// LOGOUT
// =====================================

$("#logoutButton")?.addEventListener("click", async () => {
  try {
    await signOut(auth);
    currentUser = null;
    currentProfile = null;
    currentRole = null;
    showLogin();
  } catch (error) {
    console.error(error);
    alert("Unable to log out: " + error.message);
  }
});
