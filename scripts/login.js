const STOAT_API_URL = "https://stoat.chat/api";

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

    cardTitle.setAttribute("data-i18n", "welcomeBack");
    cardTitle.textContent = t("welcomeBack");

    cardSubtitle.setAttribute("data-i18n", "gladToSeeYou");
    cardSubtitle.textContent = t("gladToSeeYou");

    emailGroup.style.display = "";
    passwordGroup.style.display = "";
    tokenGroup.style.display = "none";
    newPasswordGroup.style.display = "none";

    loginButton.setAttribute("data-i18n", "loginBtn");
    loginButton.textContent = t("loginBtn");

    footerText.style.display = "";
    backToLoginText.style.display = "none";
}

function showForgotPasswordUI(e) {
    if (e) e.preventDefault();
    currentMode = "FORGOT_REQ";
    clearStatus();

    cardTitle.setAttribute("data-i18n", "resetPasswordTitle");
    cardTitle.textContent = t("resetPasswordTitle");

    cardSubtitle.setAttribute("data-i18n", "resetPasswordSubtitle");
    cardSubtitle.textContent = t("resetPasswordSubtitle");

    emailGroup.style.display = "";
    passwordGroup.style.display = "none";
    tokenGroup.style.display = "none";
    newPasswordGroup.style.display = "none";

    loginButton.setAttribute("data-i18n", "sendResetCodeBtn");
    loginButton.textContent = t("sendResetCodeBtn");

    footerText.style.display = "none";
    backToLoginText.style.display = "";
}

function showResetConfirmUI() {
    currentMode = "FORGOT_CONFIRM";
    clearStatus();

    cardTitle.setAttribute("data-i18n", "enterNewPasswordTitle");
    cardTitle.textContent = t("enterNewPasswordTitle");

    cardSubtitle.setAttribute("data-i18n", "enterNewPasswordSubtitle");
    cardSubtitle.textContent = t("enterNewPasswordSubtitle");

    emailGroup.style.display = "none";
    passwordGroup.style.display = "none";
    tokenGroup.style.display = "";
    newPasswordGroup.style.display = "";

    loginButton.setAttribute("data-i18n", "updatePasswordBtn");
    loginButton.textContent = t("updatePasswordBtn");

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
        updateLoginStatus(t("credentialsRequired"));
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
            updateLoginStatus(t("accountUnverified"));
            resetUI();
        } else {
            const errorMsg = data.type ? `${t("errorPrefix")}${data.type}` : t("invalidCredentials");
            updateLoginStatus(errorMsg);
            resetUI();
        }
    } catch (error) {
        console.error("Login request failed:", error);
        updateLoginStatus(t("serverConnectionFailed"));
        resetUI();
    }
}

// 2. REQUEST PASSWORD RESET TOKEN API CALL
async function requestPasswordReset() {
    if (!buttonEnabled) return;

    const email = usernameInput.value.trim();
    if (!email) {
        updateLoginStatus(t("enterEmailRequired"));
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
            updateLoginStatus(t("resetCodeSent"), false);
        } else {
            const data = await response.json();
            updateLoginStatus(data.type ? `${t("errorPrefix")}${data.type}` : t("failedRequestReset"));
            resetUI();
        }
    } catch (error) {
        console.error("Password reset request failed:", error);
        updateLoginStatus(t("serverConnectionFailed"));
        resetUI();
    }
}

// 3. CONFIRM PASSWORD RESET WITH TOKEN API CALL
async function confirmPasswordReset() {
    if (!buttonEnabled) return;

    const token = tokenInput.value.trim();
    const newPassword = newPasswordInput.value;

    if (!token || !newPassword) {
        updateLoginStatus(t("tokenAndPasswordRequired"));
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
            updateLoginStatus(t("passwordResetSuccess"), false);
        } else {
            const data = await response.json();
            updateLoginStatus(data.type ? `${t("errorPrefix")}${data.type}` : t("invalidTokenOrPassword"));
            resetUI();
        }
    } catch (error) {
        console.error("Password confirm failed:", error);
        updateLoginStatus(t("serverConnectionFailed"));
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

document.addEventListener("DOMContentLoaded", () => {
    const langSelect = document.getElementById("loginLanguageSelect");
    if (langSelect) {
        // 1. Sync dropdown with stored language
        langSelect.value = currentLang();

        // 2. Listen for user selecting a new language
        langSelect.addEventListener("change", (e) => {
            localStorage.setItem("preferred_lang", e.target.value);
            if (typeof updatePageTranslations === "function") {
                updatePageTranslations();
            }
        });
    }

    // Run translations on initial load
    if (typeof updatePageTranslations === "function") {
        updatePageTranslations();
    }
});

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