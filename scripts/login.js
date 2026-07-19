const STOAT_API_URL = "https://api.revolt.chat";

const usernameInput = document.getElementById("usernameInput");
const passwordInput = document.getElementById("passwordInput");
const loginButton = document.getElementById("loginButton");
const loginContainer = document.getElementById("loginContainer");
const loginLoadingIcon = document.getElementById("loginLoadingicon");
const loginStatusDiv = document.getElementById("loginStatusMessage");

let buttonEnabled = true;

function updateLoginStatus(text) {
    if (!loginStatusDiv) return;
    loginStatusDiv.style.display = "";
    loginStatusDiv.textContent = text;
}

async function submitLogin() {
    if (!buttonEnabled) return;

    const identity = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!identity || !password) {
        updateLoginStatus("Username/Email and password are required.");
        return;
    }

    buttonEnabled = false;
    if (loginLoadingIcon) loginLoadingIcon.style.display = "";
    if (loginContainer) loginContainer.style.display = "none";

    try {
        const response = await fetch(`${STOAT_API_URL}/auth/session/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: identity,
                password: password,
                friendly_name: "Mocha Web Client"
            })
        });

        const data = await response.json();

        if (response.ok && data.token) {
            localStorage.setItem("stoat_token", data.token);
            window.location.href = "/app";
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

function resetUI() {
    buttonEnabled = true;
    if (loginLoadingIcon) loginLoadingIcon.style.display = "none";
    if (loginContainer) loginContainer.style.display = "";
}

if (loginButton) {
    loginButton.addEventListener("click", submitLogin);
}

if (passwordInput) {
    passwordInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            submitLogin();
        }
    });
}