const STOAT_API_URL = "https://api.revolt.chat";

// UI Elements
const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");
const tokenInput = document.getElementById("tokenInput");
const newPasswordInput = document.getElementById("newPasswordInput");

const emailGroup = document.getElementById("emailGroup");
const passwordGroup = document.getElementById("passwordGroup");
const tokenGroup = document.getElementById("tokenGroup");
const newPasswordGroup = document.getElementById("newPasswordGroup");

const loginButton = document.getElementById("loginButton");
const loginContainer = document.getElementById("loginContainer");
const loginLoadingIcon = document.getElementById("loginLoadingicon");
const loginStatusDiv = document.getElementById("loginStatusMessage");

const cardTitle = document.getElementById("cardTitle");
const cardSubtitle = document.getElementById("cardSubtitle");
const footerText = document.getElementById("footerText");
const backToLoginText = document.getElementById("backToLoginText");

let currentMode = "LOGIN"; // "LOGIN" | "FORGOT_REQ" | "FORGOT_CONFIRM"
let buttonEnabled = true;

// Status helper
function updateLoginStatus(text, isError = true) {
    if (!loginStatusDiv) return;
    loginStatusDiv.style.display = "";
    loginStatusDiv.style.color = isError ? "#ff666e" : "#57f287";
    loginStatusDiv.textContent = text;
}

function clearStatus() {
    if (!loginStatusDiv) return;
    loginStatusDiv.style.display = "none";
    loginStatusDiv.textContent = "";
}

// State Switchers
function showLoginUI(e) {
    if (e) e.preventDefault();
    currentMode = "LOGIN";
    clearStatus();

    cardTitle.textContent = "Welcome back!";
    cardSubtitle.textContent = "Glad to see you around!";

    emailGroup.style.display = "";
    passwordGroup.style.display = "";
    tokenGroup.style.display = "none";
    newPasswordGroup.style.display = "none";

    loginButton.textContent = "Login";
    footerText.style.display = "";
    backToLoginText.style.display = "none";
}

function showForgotPasswordUI(e) {
    if (e) e.preventDefault();
    currentMode = "FORGOT_REQ";
    clearStatus();

    cardTitle.textContent = "Reset Password";
    cardSubtitle.textContent = "Enter your email to receive a password reset token.";

    emailGroup.style.display = "";
    passwordGroup.style.display = "none";
    tokenGroup.style.display = "none";
    newPasswordGroup.style.display = "none";

    loginButton.textContent = "Send Reset Code";
    footerText.style.display = "none";
    backToLoginText.style.display = "";
}

function showResetConfirmUI() {
    currentMode = "FORGOT_CONFIRM";
    clearStatus();

    cardTitle.textContent = "Enter New Password";
    cardSubtitle.textContent = "Check your email for the reset token and enter it below.";

    emailGroup.style.display = "none";
    passwordGroup.style.display = "none";
    tokenGroup.style.display = "";
    newPasswordGroup.style.display = "";

    loginButton.textContent = "Update Password";
    footerText.style.display = "none";
    backToLoginText.style.display = "";
}

// Primary Action Switcher
function handlePrimaryAction() {
    if (currentMode === "LOGIN") {
        submitLogin();
    } else if (currentMode === "FORGOT_REQ") {
        requestPasswordReset();
    } else if (currentMode === "FORGOT_CONFIRM") {
        confirmPasswordReset();
    }
}

// 1. LOGIN API CALL
async function submitLogin() {
    if (!buttonEnabled) return;

    const identity = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!identity || !password) {
        updateLoginStatus("Username/Email and password are required.");
        return;
    }

    setLoading(true);

    try {
        function getPlatformName() {
            if (!window.electronAPI) return "Web";

            const platform = window.electronAPI.platform;
            switch (platform) {
                case 'win32': return 'Windows';
                case 'darwin': return 'macOS';
                case 'linux': return 'Linux';
                default: return 'Desktop';
            }
        }

        const clientName = window.electronAPI
            ? `Mocha Electron Client (${getPlatformName()})`
            : "Mocha Web Client";

        const response = await fetch(`${STOAT_API_URL}/auth/session/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: identity,
                password: password,
                friendly_name: clientName
            })
        });
        const data = await response.json();

        if (response.ok && data.token) {
            localStorage.setItem("stoat_token", data.token);
            window.location.href = "/app";
        } else if (data.type === "AccountUnverified") {
            updateLoginStatus("Account unverified. Check your email for verification.");
            resetUI();
        } else {
            const errorMsg = data.type ? `Error: ${data.type}` : "Invalid credentials.";
            updateLoginStatus(errorMsg);
            resetUI();
        }
    } catch (error) {
        console.error("Login request failed:", error);
        updateLoginStatus("Server connection failed.");
        resetUI();
    }
}

// 2. REQUEST PASSWORD RESET TOKEN API CALL
async function requestPasswordReset() {
    if (!buttonEnabled) return;

    const email = usernameInput.value.trim();
    if (!email) {
        updateLoginStatus("Please enter your email address.");
        return;
    }

    setLoading(true);

    try {
        const response = await fetch(`${STOAT_API_URL}/auth/session/password_reset`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email })
        });

        if (response.ok) {
            resetUI();
            showResetConfirmUI();
            updateLoginStatus("Reset code sent! Check your inbox.", false);
        } else {
            const data = await response.json();
            updateLoginStatus(data.type ? `Error: ${data.type}` : "Failed to request reset.");
            resetUI();
        }
    } catch (error) {
        console.error("Password reset request failed:", error);
        updateLoginStatus("Server connection failed.");
        resetUI();
    }
}

// 3. CONFIRM PASSWORD RESET WITH TOKEN API CALL
async function confirmPasswordReset() {
    if (!buttonEnabled) return;

    const token = tokenInput.value.trim();
    const newPassword = newPasswordInput.value;

    if (!token || !newPassword) {
        updateLoginStatus("Token and new password are required.");
        return;
    }

    setLoading(true);

    try {
        const response = await fetch(`${STOAT_API_URL}/auth/session/password_reset`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                token: token,
                password: newPassword
            })
        });

        if (response.ok) {
            resetUI();
            showLoginUI();
            updateLoginStatus("Password successfully reset! Please log in.", false);
        } else {
            const data = await response.json();
            updateLoginStatus(data.type ? `Error: ${data.type}` : "Invalid token or password.");
            resetUI();
        }
    } catch (error) {
        console.error("Password confirm failed:", error);
        updateLoginStatus("Server connection failed.");
        resetUI();
    }
}

// UI State Control
function setLoading(loading) {
    buttonEnabled = !loading;
    if (loginLoadingIcon) loginLoadingIcon.style.display = loading ? "" : "none";
    if (loginContainer) loginContainer.style.display = loading ? "none" : "";
}

function resetUI() {
    setLoading(false);
}

// Event Listeners for Keyboard Controls
[usernameInput, passwordInput, tokenInput, newPasswordInput].forEach((input) => {
    if (input) {
        input.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                handlePrimaryAction();
            }
        });
    }
});