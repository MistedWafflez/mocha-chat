// ====== 1. Configuration ======
const STOAT_API_URL = "https://api.revolt.chat"; // Or your self-hosted instance API URL

// ====== 2. DOM Elements ======
const usernameInput = document.getElementById("usernameInput"); // Used for email or username in Stoat
const passwordInput = document.getElementById("passwordInput");
const loginButton = document.getElementById("loginButton");
const loginContainer = document.getElementById("loginContainer");
const loginLoadingIcon = document.getElementById("loginLoadingicon");
const loginStatusDiv = document.getElementById("loginStatusMessage");

let buttonEnabled = true;

// ====== 3. Helper Functions ======
function updateLoginStatus(text) {
    if (!loginStatusDiv) return;
    loginStatusDiv.style.display = "";
    loginStatusDiv.textContent = text;
}

// ====== 4. Stoat Authentication Strategy ======
async function submitLogin() {
    if (!buttonEnabled) return;

    const identity = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!identity || !password) {
        updateLoginStatus("Username/Email and password are required.");
        return;
    }

    // Update UI state to loading
    buttonEnabled = false;
    if (loginLoadingIcon) loginLoadingIcon.style.display = "";
    if (loginContainer) loginContainer.style.display = "none";

    try {
        // Stoat authentication session creation
        const response = await fetch(`${STOAT_API_URL}/auth/session/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                email: identity, // Stoat typically uses Email for direct logins
                password: password,
                friendly_name: "Stoat Web Client"
            })
        });

        const data = await response.json();

        if (response.ok && data.token) {
            // Save the session token securely in the browser storage
            localStorage.setItem("stoat_token", data.token);
            
            // Redirect to your main application interface
            window.location.href = "/app";
        } else {
            // Handle API specific error responses
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

// ====== 5. Event Listeners ======
if (loginButton) {
    loginButton.addEventListener("click", submitLogin);
}

// Optional: Enter key listener for password field
if (passwordInput) {
    passwordInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            submitLogin();
        }
    });
}