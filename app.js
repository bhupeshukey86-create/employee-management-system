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
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

// --------------------------------------------------
// 1. FIREBASE CONFIGURATION
// --------------------------------------------------

const firebaseConfig = {
  apiKey: "AIzaSyDBjWmYDXeMtr04wFrf2VKJfh2cxVoLeY8",
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

// --------------------------------------------------
// 2. HTML ELEMENTS AND USER VARIABLES
// --------------------------------------------------

const loginPage = document.getElementById("loginPage");
const appPage = document.getElementById("app");
const googleLogin = document.getElementById("googleLogin");
const logoutButton = document.getElementById("logoutButton");
const loginMessage = document.getElementById("loginMessage");
const userInfo = document.getElementById("userInfo");
const pageTitle = document.getElementById("pageTitle");
const pageContent = document.getElementById("pageContent");

let currentUser = null;
let currentRole = null;
let currentEmployees = [];

// --------------------------------------------------
// 3. GOOGLE LOGIN
// --------------------------------------------------

googleLogin.addEventListener("click", async () => {
  loginMessage.textContent = "Signing in...";

  try {
    await signInWithPopup(auth, provider);
  } catch (error) {
    console.error("Login error:", error);
    loginMessage.textContent = "Login failed: " + error.message;
  }
});

// --------------------------------------------------
// 4. CHECK USER AUTHORIZATION
// --------------------------------------------------

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentUser = null;
    currentRole = null;

    loginPage.hidden = false;
    appPage.hidden = true;
    return;
  }

  try {
    const userRef = doc(db, "authorizedUsers", user.uid);
    const userSnapshot = await getDoc(userRef);

    if (!userSnapshot.exists()) {
      throw new Error("Your account is not authorized. Contact your manager.");
    }

    const userData = userSnapshot.data();

    if (userData.active !== true) {
      throw new Error("Your account is inactive. Contact your manager.");
    }

    if (!["manager", "employee"].includes(userData.role)) {
      throw new Error("Invalid user role. Contact your manager.");
    }

    currentUser = user;
    currentRole = userData.role;

    loginPage.hidden = true;
    appPage.hidden = false;

    userInfo.textContent =
      `${user.displayName || user.email} | ${currentRole}`;

    setupNavigation();
    await showPage("dashboard");

  } catch (error) {
    console.error("Authorization error:", error);

    loginMessage.textContent = error.message;
    loginPage.hidden = false;
    appPage.hidden = true;

    await signOut(auth);
  }
});

// --------------------------------------------------
// 5. LOGOUT
// --------------------------------------------------

logoutButton.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (error) {
    alert("Logout failed: " + error.message);
  }
});

// --------------------------------------------------
// 6. NAVIGATION
// --------------------------------------------------

function setupNavigation() {
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.onclick = () => {
      showPage(button.dataset.page);
    };
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
      <p>Your role: <strong>${escapeHTML(currentRole)}</strong></p>
      <p>Select a module from the left navigation menu.</p>
    `;
  }

  else if (page === "employees") {
    await loadEmployeePage();
  }

  else {
    pageContent.innerHTML = `
      <h2>${escapeHTML(titles[page] || "Module")}</h2>
      <p>This module will be developed in the next step.</p>
    `;
  }
}

// --------------------------------------------------
// 7. HTML ESCAPING
// --------------------------------------------------

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };

    return replacements[character];
  });
}

// --------------------------------------------------
// 8. LOAD EMPLOYEE DETAILS PAGE
// --------------------------------------------------

async function loadEmployeePage() {
  pageContent.innerHTML = "<p>Loading employee details...</p>";

  try {
    if (currentRole === "manager") {
      await loadManagerEmployeePage();
    } else {
      await loadOwnEmployeeProfile();
    }
  } catch (error) {
    console.error("Employee page error:", error);

    pageContent.innerHTML = `
      <h2>Unable to load employee details</h2>
      <p>${escapeHTML(error.message)}</p>
    `;
  }
}

// --------------------------------------------------
// 9. MANAGER: LOAD ALL EMPLOYEES
// --------------------------------------------------

async function loadManagerEmployeePage() {
  const employeeCollection = collection(db, "employees");
  const snapshot = await getDocs(employeeCollection);

  currentEmployees = snapshot.docs.map((employeeDoc) => ({
    uid: employeeDoc.id,
    ...employeeDoc.data()
  }));

  renderManagerEmployeePage();
}

function renderManagerEmployeePage() {
  const rows = currentEmployees.map((employee) => `
    <tr>
      <td>${escapeHTML(employee.employeeId)}</td>
      <td>${escapeHTML(employee.employeeName)}</td>
      <td>${escapeHTML(employee.email)}</td>
      <td>${escapeHTML(employee.department)}</td>
      <td>${escapeHTML(employee.designation)}</td>
      <td>${escapeHTML(employee.status)}</td>
      <td>
        <button class="edit-button"
          data-action="edit"
          data-uid="${escapeHTML(employee.uid)}">
          Edit
        </button>

        <button class="delete-button"
          data-action="delete"
          data-uid="${escapeHTML(employee.uid)}">
          Delete
        </button>
      </td>
    </tr>
  `).join("");

  pageContent.innerHTML = `
    <div class="employee-header">
      <div>
        <h2>Employee Details</h2>
        <p>Total employees: ${currentEmployees.length}</p>
      </div>

      <button id="addEmployeeButton">+ Add Employee</button>
    </div>

    <div id="employeeFormContainer"></div>

    <div class="table-container">
      <table class="employee-table">
        <thead>
          <tr>
            <th>Employee ID</th>
            <th>Name</th>
            <th>Email</th>
            <th>Department</th>
            <th>Designation</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          ${rows || `
            <tr>
              <td colspan="7">No employee records found.</td>
            </tr>
          `}
        </tbody>
      </table>
    </div>
  `;

  document.getElementById("addEmployeeButton")
    .addEventListener("click", () => {
      showEmployeeForm();
    });

  document.querySelectorAll("[data-action='edit']")
    .forEach((button) => {
      button.addEventListener("click", () => {
        const employee = currentEmployees.find(
          (item) => item.uid === button.dataset.uid
        );

        if (employee) showEmployeeForm(employee);
      });
    });

  document.querySelectorAll("[data-action='delete']")
    .forEach((button) => {
      button.addEventListener("click", async () => {
        await deleteEmployee(button.dataset.uid);
      });
    });
}

// --------------------------------------------------
// 10. MANAGER: ADD / EDIT EMPLOYEE FORM
// --------------------------------------------------

function showEmployeeForm(employee = null) {
  const isEditing = employee !== null;

  const formContainer = document.getElementById(
    "employeeFormContainer"
  );

  formContainer.innerHTML = `
    <div class="employee-form-card">

      <h3>${isEditing ? "Edit Employee" : "Add New Employee"}</h3>

      <form id="employeeForm">

        <label>Firebase Authentication UID *</label>
        <input
          type="text"
          name="uid"
          value="${escapeHTML(employee?.uid || "")}"
          ${isEditing ? "readonly" : ""}
          required
          placeholder="Enter employee Firebase UID"
        >

        <label>Employee ID *</label>
        <input
          type="text"
          name="employeeId"
          value="${escapeHTML(employee?.employeeId || "")}"
          required
          placeholder="Example: EMP001"
        >

        <label>Employee Name *</label>
        <input
          type="text"
          name="employeeName"
          value="${escapeHTML(employee?.employeeName || "")}"
          required
          placeholder="Enter employee name"
        >

        <label>Email *</label>
        <input
          type="email"
          name="email"
          value="${escapeHTML(employee?.email || "")}"
          required
          placeholder="Enter Google account email"
        >

        <label>Department *</label>
        <input
          type="text"
          name="department"
          value="${escapeHTML(employee?.department || "")}"
          required
          placeholder="Example: Engineering"
        >

        <label>Designation *</label>
        <input
          type="text"
          name="designation"
          value="${escapeHTML(employee?.designation || "")}"
          required
          placeholder="Example: Design Engineer"
        >

        <label>Joining Date *</label>
        <input
          type="date"
          name="joiningDate"
          value="${escapeHTML(employee?.joiningDate || "")}"
          required
        >

        <label>Reporting Manager Email *</label>
        <input
          type="email"
          name="managerEmail"
          value="${escapeHTML(employee?.managerEmail || "")}"
          required
          placeholder="Enter reporting manager email"
        >

        <label>Employment Status</label>
        <select name="status">
          <option value="Active"
            ${employee?.status === "Active" || !employee ? "selected" : ""}>
            Active
          </option>

          <option value="Inactive"
            ${employee?.status === "Inactive" ? "selected" : ""}>
            Inactive
          </option>
        </select>

        <div class="form-actions">
          <button type="submit">
            ${isEditing ? "Update Employee" : "Save Employee"}
          </button>

          <button type="button" id="cancelEmployeeForm">
            Cancel
          </button>
        </div>

        <p id="employeeFormMessage" role="status"></p>

      </form>
    </div>
  `;

  document.getElementById("cancelEmployeeForm")
    .addEventListener("click", () => {
      formContainer.innerHTML = "";
    });

  document.getElementById("employeeForm")
    .addEventListener("submit", async (event) => {
      event.preventDefault();

      await saveEmployee(event, isEditing);
    });
}

// --------------------------------------------------
// 11. MANAGER: SAVE EMPLOYEE
// --------------------------------------------------

async function saveEmployee(event, isEditing) {
  const form = event.target;
  const message = document.getElementById("employeeFormMessage");
  const submitButton = form.querySelector("button[type='submit']");

  const formData = new FormData(form);

  const uid = formData.get("uid").trim();

  const employeeData = {
    employeeId: formData.get("employeeId").trim(),
    employeeName: formData.get("employeeName").trim(),
    email: formData.get("email").trim().toLowerCase(),
    department: formData.get("department").trim(),
    designation: formData.get("designation").trim(),
    joiningDate: formData.get("joiningDate"),
    managerEmail: formData.get("managerEmail").trim().toLowerCase(),
    status: formData.get("status")
  };

  if (!uid || Object.values(employeeData).some((value) => !value)) {
    message.textContent = "Please complete all required fields.";
    return;
  }

  if (currentRole !== "manager") {
    message.textContent = "Only managers can save employee records.";
    return;
  }

  const duplicate = currentEmployees.find((employee) =>
    employee.employeeId.toLowerCase() === employeeData.employeeId.toLowerCase()
    && employee.uid !== uid
  );

  if (duplicate) {
    message.textContent = "This Employee ID is already in use.";
    return;
  }

  submitButton.disabled = true;
  message.textContent = "Saving employee...";

  try {
    const employeeRef = doc(db, "employees", uid);

    if (isEditing) {
      await updateDoc(employeeRef, {
        ...employeeData,
        updatedAt: serverTimestamp()
      });
    } else {
      const existingEmployee = await getDoc(employeeRef);

      if (existingEmployee.exists()) {
        throw new Error("An employee record already exists for this UID.");
      }

      await setDoc(employeeRef, {
        ...employeeData,
        uid: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    alert(isEditing
      ? "Employee updated successfully."
      : "Employee added successfully."
    );

    await loadManagerEmployeePage();

  } catch (error) {
    console.error("Save employee error:", error);
    message.textContent = "Error: " + error.message;
    submitButton.disabled = false;
  }
}

// --------------------------------------------------
// 12. MANAGER: DELETE EMPLOYEE
// --------------------------------------------------

async function deleteEmployee(uid) {
  if (currentRole !== "manager") {
    alert("Only managers can delete employee records.");
    return;
  }

  const employee = currentEmployees.find(
    (item) => item.uid === uid
  );

  if (!employee) return;

  const confirmed = confirm(
    `Are you sure you want to delete ${employee.employeeName}'s record?`
  );

  if (!confirmed) return;

  try {
    await deleteDoc(doc(db, "employees", uid));

    alert("Employee record deleted successfully.");

    await loadManagerEmployeePage();

  } catch (error) {
    console.error("Delete employee error:", error);
    alert("Unable to delete employee: " + error.message);
  }
}

// --------------------------------------------------
// 13. EMPLOYEE: VIEW OWN PROFILE ONLY
// --------------------------------------------------

async function loadOwnEmployeeProfile() {
  const employeeRef = doc(db, "employees", currentUser.uid);
  const employeeSnapshot = await getDoc(employeeRef);

  if (!employeeSnapshot.exists()) {
    pageContent.innerHTML = `
      <h2>Employee Profile Not Found</h2>
      <p>Please contact your manager to create your employee record.</p>
    `;
    return;
  }

  const employee = employeeSnapshot.data();

  pageContent.innerHTML = `
    <h2>My Employee Details</h2>

    <div class="profile-card">

      <p><strong>Employee ID:</strong>
        ${escapeHTML(employee.employeeId)}</p>

      <p><strong>Name:</strong>
        ${escapeHTML(employee.employeeName)}</p>

      <p><strong>Email:</strong>
        ${escapeHTML(employee.email)}</p>

      <p><strong>Department:</strong>
        ${escapeHTML(employee.department)}</p>

      <p><strong>Designation:</strong>
        ${escapeHTML(employee.designation)}</p>

      <p><strong>Joining Date:</strong>
        ${escapeHTML(employee.joiningDate)}</p>

      <p><strong>Reporting Manager:</strong>
        ${escapeHTML(employee.managerEmail)}</p>

      <p><strong>Status:</strong>
        ${escapeHTML(employee.status)}</p>

    </div>
  `;
}
