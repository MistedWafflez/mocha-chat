const STOAT_API_URL = "https://api.revolt.chat";

const emailInput = document.getElementById("emailInput");
const displayNameInput = document.getElementById("displayNameInput");
const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");

const dobDay = document.getElementById("dobDay");
const dobYear = document.getElementById("dobYear");

const registerButton = document.getElementById("registerButton");
const registerContainer = document.getElementById("registerContainer");
const registerLoadingIcon = document.getElementById("registerLoadingIcon");
const registerStatusDiv = document.getElementById("registerStatusMessage");

let buttonEnabled = true;

// Populate Day and Year selectors dynamically
function populateDobOptions() {
    if (dobDay) {
        for (let i = 1; i <= 31; i++) {
            const opt = document.createElement("option");
            opt.value = i;
            opt.textContent = i;
            dobDay.appendChild(opt);
        }
    }

    if (dobYear) {
        const currentYear = new Date().getFullYear();
        for (let i = currentYear; i >= currentYear - 100; i--) {
            const opt = document.createElement("option");
            opt.value = i;
            opt.textContent = i;
            dobYear.appendChild(opt);
        }
    }
}

populateDobOptions();

function updateStatus(text) {
    if (!registerStatusDiv) return;
    registerStatusDiv.style.display = "";
    registerStatusDiv.textContent = text;
}

async function submitRegister() {
    if (!buttonEnabled) return;

    const email = emailInput.value.trim();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!email || !username || !password) {
        updateStatus("Email, Username, and Password are required.");
        return;
    }

    buttonEnabled = false;
    if (registerLoadingIcon) registerLoadingIcon.style.display = "";
    if (registerContainer) registerContainer.style.display = "none";

    try {
        const response = await fetch(`${STOAT_API_URL}/auth/account/create`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: email,
                username: username,
                password: password
            })
        });

        const data = await response.json();

        if (response.ok) {
            // Redirect to login page or app once created
            window.location.href = "/login?registered=true";
        } else {
            const errorMsg = data.type ? `Error: ${data.type}` : "Failed to create account.";
            updateStatus(errorMsg);
            resetUI();
        }
    } catch (error) {
        console.error("Registration failed:", error);
        updateStatus("Server connection failed.");
        resetUI();
    }
}

function resetUI() {
    buttonEnabled = true;
    if (registerLoadingIcon) registerLoadingIcon.style.display = "none";
    if (registerContainer) registerContainer.style.display = "";
}

if (registerButton) {
    registerButton.addEventListener("click", submitRegister);
}