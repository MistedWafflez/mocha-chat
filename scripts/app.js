const STOAT_API_URL = "https://api.revolt.chat";
const STOAT_WS_URL = "wss://ws.revolt.chat?format=json";
const STOAT_AUTUMN = "https://autumn.revolt.chat";
const STOAT_TOKEN = localStorage.getItem("stoat_token");

const loadingContainer = document.getElementById("loadingContainer");
const cLoadingText = document.getElementById("cLoadingText");
const displayNameDisplay = document.getElementById("displayNameDisplay");
const profileNavigationButtom = document.getElementById("profileNavigationButtom");
const statusDisplay = document.getElementById("statusDisplay");
const chatsList = document.getElementById("chatsList");
const channelMessagesBox = document.getElementById("channelMessagesBox");
const channelTextInput = document.getElementById("channelTextInput");
const memberBoard = document.getElementById("memberBoard");
const activeChannelTitle = document.getElementById("activeChannelTitle");

const activeChatLayout = document.getElementById("activeChatLayout");
const friendsViewLayout = document.getElementById("friendsViewLayout");
const friendsRosterBox = document.getElementById("friendsRosterBox");
const friendsCountLabel = document.getElementById("friendsCountLabel");

const logoutBtn = document.getElementById("logoutBtn");
const openSettingsBtn = document.getElementById("openSettingsBtn");
const closeSettingsBtn = document.getElementById("closeSettingsBtn");
const settingsOverlay = document.getElementById("settingsOverlay");
const settingsUsername = document.getElementById("settingsUsername");
const settingsAvatar = document.getElementById("settingsAvatar");

let currentChannelId = null;
let currentServerId = null;
let stoatWS = null;
let usersCache = {};
let userDMsCache = [];
let lastMessageAuthorId = null;
let lastMessageType = null;
let currentMemberBoardChannelId = null;

function assignText(element, value) {
    if (element) element.textContent = value;
}

function scrollToBottom() {
    if (channelMessagesBox) {
        channelMessagesBox.scrollTop = channelMessagesBox.scrollHeight;
    }
}

function dismissLoadingOverlay() {
    if (loadingContainer && loadingContainer.style.display !== "none") {
        loadingContainer.classList.add("fade-out");
        setTimeout(() => {
            loadingContainer.style.display = "none";
        }, 400);
    }
}

function parseUlidTimestamp(id) {
    if (!id || id.length < 8) return new Date();
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    const timePart = id.substring(0, 8).toUpperCase();
    let timestamp = 0;

    for (let i = 0; i < timePart.length; i++) {
        const char = timePart[i];
        const value = alphabet.indexOf(char);
        if (value === -1) return new Date();
        timestamp = (timestamp * 32) + value;
    }

    const date = new Date(timestamp);
    return isNaN(date.getTime()) ? new Date() : date;
}

function handleLogout() {
    if (stoatWS) {
        stoatWS.close();
    }
    localStorage.removeItem("stoat_token");
    localStorage.removeItem("my_user_id");
    localStorage.removeItem("mocha_token");
    localStorage.removeItem("mocha_user");
    sessionStorage.clear();
    window.location.href = "/login";
}

function toggleSettings(show) {
    if (!settingsOverlay) return;
    if (show) {
        const myId = localStorage.getItem("my_user_id");
        if (myId && usersCache[myId]) {
            const me = usersCache[myId];
            if (settingsUsername) settingsUsername.textContent = me.username;
            if (settingsAvatar && me.avatar) {
                settingsAvatar.style.backgroundImage = `url(${STOAT_AUTUMN}/avatars/${me.avatar._id})`;
            }
        }
        settingsOverlay.classList.add("active");
    } else {
        settingsOverlay.classList.remove("active");
    }
}

async function stoatFetch(endpoint, options = {}) {
    if (!STOAT_TOKEN) return null;
    const headers = {
        "x-session-token": STOAT_TOKEN,
        "Content-Type": "application/json",
        ...options.headers
    };
    try {
        const response = await fetch(`${STOAT_API_URL}${endpoint}`, { ...options, headers });
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        return await response.json();
    } catch (err) {
        console.error(`Failed fetching ${endpoint}:`, err);
        return null;
    }
}

async function getUserProfile(userId) {
    if (usersCache[userId]) return usersCache[userId];
    const userData = await stoatFetch(`/users/${userId}`);
    if (userData) {
        usersCache[userId] = userData;
    }
    return userData;
}

async function getUserProfileData(userId) {
    const user = await getUserProfile(userId);
    if (!user) return null;

    const profile = await stoatFetch(`/users/${userId}/profile`).catch(() => null);

    return { user, profile };
}

async function openUserProfileModal(userId) {
    hideContextMenu();
    const data = await getUserProfileData(userId);
    if (!data || !data.user) return;

    const { user, profile } = data;

    const modalOverlay = document.getElementById("customModalOverlay");
    const modalTitle = document.getElementById("modalTitle");
    const modalBody = document.getElementById("modalBody");
    const modalActions = document.getElementById("modalActions");

    if (!modalOverlay) return;

    const avatarUrl = user.avatar
        ? `${STOAT_AUTUMN}/avatars/${user.avatar._id}`
        : '/images/buffer40.gif';

    const bannerId = profile?.background?._id || user.banner?._id;
    const bannerTag = profile?.background ? 'backgrounds' : 'banners';
    const bannerUrl = bannerId ? `${STOAT_AUTUMN}/${bannerTag}/${bannerId}` : null;

    const presence = user.status?.presence || (user.online ? "Online" : "Offline");
    const statusText = user.status?.text ? `${presence} — ${user.status.text}` : presence;
    const statusColor = user.online ? "#23a55a" : "#80848e";

    const bioText = profile?.content || "No bio provided.";

    modalTitle.textContent = user.username;

    modalBody.innerHTML = `
        <div class="user-profile-card">
            <div class="profile-card-banner" style="${bannerUrl ? `background-image: url('${bannerUrl}');` : ''}"></div>
            <div class="profile-card-header">
                <div class="profile-card-avatar" style="background-image: url('${avatarUrl}');">
                    <div class="profile-card-status" style="background-color: ${statusColor};"></div>
                </div>
            </div>
            <div class="profile-card-info">
                <div class="profile-card-username">${user.username}</div>
                <div class="profile-card-status-text">${statusText}</div>
                <div class="profile-card-divider"></div>
                <div class="profile-card-section-title">About Me</div>
                <div class="profile-card-bio">${bioText}</div>
            </div>
        </div>
    `;

    modalActions.innerHTML = `
        <button class="modal-btn modal-btn-secondary" onclick="closeCustomModal()">Close</button>
    `;

    modalOverlay.style.display = "flex";
}

async function openHomeView() {
    currentServerId = null;

    document.querySelectorAll('.server-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById('btnHomeServer')?.classList.add('active');

    const headerContainer = document.getElementById('channelSidebarHeader');
    if (headerContainer) {
        headerContainer.innerHTML = `
            <div class="search-container">
                <input class="search-input" placeholder="Find or start a conversation">
            </div>
            <button class="button2 button2-small" onclick="openFriendsDashboard()">
                <div class="friends-icon"></div>
                <div class="friends-text">Friends</div>
            </button>
            <div class="channel-list-divider"></div>
        `;
    }

    await renderChannelList(userDMsCache);
    await openFriendsDashboard();
}

async function renderServerChannelList(channels) {
    if (!chatsList) return;
    let html = "";

    const textChannels = channels.filter(c => c.channel_type === "TextChannel" || !c.channel_type);

    if (textChannels.length > 0) {
        html += `<div class="channel-category-label">TEXT CHANNELS</div>`;
        for (const channel of textChannels) {
            const channelName = channel.name || "channel";
            const escapedName = channelName.replace(/'/g, "\\'");

            html += `
                <button onclick="openChat('${channel._id}', '${escapedName}')" class="button2 channel-item-btn" data-channel-id="${channel._id}">
                    <div class="server-channel-icon">#</div>
                    <div class="item-btn-label">${channelName}</div>
                </button>
            `;
        }
    } else {
        html = `<div class="placeholder-notice">No text channels available</div>`;
    }

    chatsList.innerHTML = html;
}

async function renderChannelList(channels) {
    if (!chatsList) return;
    let html = "";
    const myId = localStorage.getItem("my_user_id");

    const activeChannels = channels.filter(channel => {
        if (channel.active === false) return false;
        if (channel.channel_type === "Group" || channel.server) return true;
        return channel.channel_type === "DirectMessage";
    });

    for (const channel of activeChannels) {
        let channelName = channel.name;
        let iconUrl = '/images/buffer40.gif';
        const isDM = channel.channel_type === "DirectMessage" || channel.channel_type === "Group" || !channel.server;

        if (channel.channel_type === "DirectMessage" || (channel.recipients && channel.recipients.length === 2)) {
            let otherUserId = channel.recipients?.find(id => id !== myId) || channel.user;

            if (otherUserId) {
                const profile = await getUserProfile(otherUserId);
                if (profile) {
                    channelName = profile.username;
                    if (profile.avatar) {
                        iconUrl = `${STOAT_AUTUMN}/avatars/${profile.avatar._id}`;
                    }
                }
            }
        }
        else if (channel.channel_type === "Group" || (channel.recipients && channel.recipients.length > 2)) {
            if (channel.icon) {
                iconUrl = `${STOAT_AUTUMN}/icons/${channel.icon._id}`;
            }
            if (!channelName) channelName = "Group Chat";
        }

        if (!channelName) channelName = channel._id || "Chat";
        const escapedName = channelName.replace(/'/g, "\\'");

        const closeBtnHTML = isDM ? `
            <span class="close-channel-btn" onclick="closeChannel(event, '${channel._id}')" title="Close DM">✕</span>
        ` : '';

        html += `
            <button onclick="openChat('${channel._id}', '${escapedName}')" class="button2 channel-item-btn" data-channel-id="${channel._id}">
                <div class="item-btn-avatar" style="background-image: url('${iconUrl}');"></div>
                <div class="item-btn-label">${channelName}</div>
                ${closeBtnHTML}
            </button>
        `;
    }

    chatsList.innerHTML = html;
}

async function closeChannel(event, channelId) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    const btnToClose = document.querySelector(`[data-channel-id="${channelId}"]`);
    if (btnToClose) {
        btnToClose.remove();
    }

    await stoatFetch(`/channels/${channelId}`, { method: "DELETE" }).catch(() => { });

    if (currentChannelId === channelId) {
        openFriendsDashboard();
    }
}

// Synchronous HTML generator (removes microtask queue lag during bulk message rendering)
function generateMessageHTML(data) {
    const timeObj = parseUlidTimestamp(data._id);
    const timeString = timeObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (data.system) {
        let systemText = "System action performed.";
        if (data.system.type === "text") {
            systemText = data.system.content;
        } else if (data.system.type === "channel_renamed") {
            const actor = usersCache[data.author]?.username || data.author;
            systemText = `${actor} renamed the channel to **${data.system.name}**`;
        }

        lastMessageAuthorId = null;
        lastMessageType = "system";
        return `
            <div class="message-item system-notification" data-message-id="${data._id}" data-author-id="${data.author}" style="margin-top: 8px; margin-bottom: 8px; opacity: 0.75; font-size: 14px; padding-left: 72px;">
                <span class="message-content" style="color: #949ba4;">${systemText}</span>
            </div>
        `;
    }

    let mediaHTML = "";
    if (data.attachments && data.attachments.length > 0) {
        data.attachments.forEach(file => {
            if (file.tag === "attachments" || (file.metadata && file.metadata.type === "Image")) {
                mediaHTML += `
                    <div style="margin-top: 6px; display: block;">
                        <div style="display: inline-flex; border-radius: 4px; overflow: hidden; max-width: fit-content; background-color: #2b2d31; vertical-align: bottom;">
                            <img src="${STOAT_AUTUMN}/attachments/${file._id}/${file.filename}" 
                                 style="max-width: 400px; max-height: 300px; width: auto; height: auto; object-fit: contain; display: block; cursor: pointer;" 
                                 alt="Attachment">
                        </div>
                    </div>
                `;
            }
        });
    }

    const textHTML = data.content ? `<div class="message-content">${data.content}</div>` : '';
    let cleanHTML = "";

    if (lastMessageAuthorId === data.author && lastMessageType === "user") {
        cleanHTML = `
            <div class="message-item consecutive" data-message-id="${data._id}" data-author-id="${data.author}">
                <div class="message-consecutive-spacer">
                    <span class="message-hover-time">${timeString}</span>
                </div>
                <div class="message-details">
                    ${textHTML}
                    ${mediaHTML}
                </div>
            </div>
        `;
    } else {
        const authorProfile = usersCache[data.author];
        const authorName = authorProfile?.username || data.author;
        const avatarUrl = (authorProfile && authorProfile.avatar)
            ? `${STOAT_AUTUMN}/avatars/${authorProfile.avatar._id}`
            : '/images/buffer40.gif';

        cleanHTML = `
            <div class="message-item" data-message-id="${data._id}" data-author-id="${data.author}">
                <div class="message-avatar" style="background-image: url('${avatarUrl}'); cursor: pointer;" onclick="openUserProfileModal('${data.author}')"></div>
                <div class="message-details">
                    <div class="message-header">
                        <span class="message-author" style="cursor: pointer;" onclick="openUserProfileModal('${data.author}')">${authorName}</span>
                        <span class="message-timestamp">${timeString}</span>
                    </div>
                    ${textHTML}
                    ${mediaHTML}
                </div>
            </div>
        `;
    }

    lastMessageAuthorId = data.author;
    lastMessageType = "user";
    return cleanHTML;
}

// Fast channel opener
async function openChat(channelId, name) {
    currentChannelId = channelId;
    if (channelMessagesBox) channelMessagesBox.innerHTML = '<div class="placeholder-notice">Loading messages...</div>';
    if (activeChannelTitle) activeChannelTitle.textContent = name;
    if (channelTextInput) channelTextInput.placeholder = `Message #${name}`;

    if (friendsViewLayout) friendsViewLayout.style.display = "none";
    if (activeChatLayout) activeChatLayout.style.display = "block";

    document.querySelectorAll('.sidebar-channels .button2').forEach(btn => {
        btn.classList.remove('active-channel');
    });

    const targetBtn = document.querySelector(`[data-channel-id="${channelId}"]`);
    if (targetBtn) {
        targetBtn.classList.add('active-channel');
    }

    const history = await stoatFetch(`/channels/${channelId}/messages`);
    if (history) {
        const messages = Array.isArray(history) ? history : (history.messages || []);

        if (history.users && Array.isArray(history.users)) {
            history.users.forEach(u => { usersCache[u._id] = u; });
        }

        // Fetch missing message authors in parallel (bounded)
        const missingUserIds = [...new Set(
            messages
                .map(m => m.author)
                .filter(authorId => authorId && !usersCache[authorId])
        )].slice(0, 50);

        if (missingUserIds.length > 0) {
            await Promise.all(missingUserIds.map(id => getUserProfile(id)));
        }

        lastMessageAuthorId = null;
        lastMessageType = null;

        const chronologicalMessages = [...messages].reverse();
        let combinedHTML = "";

        for (const msg of chronologicalMessages) {
            combinedHTML += generateMessageHTML(msg);
        }

        if (channelMessagesBox) {
            channelMessagesBox.innerHTML = combinedHTML;
            scrollToBottom();
        }
    } else if (channelMessagesBox) {
        channelMessagesBox.innerHTML = '<div class="placeholder-notice">Failed to load messages.</div>';
    }

    renderMemberBoard(channelId);
}

async function renderMemberBoard(channelId) {
    if (!memberBoard) return;

    // Track active render session; cancels any previous ongoing render loop
    currentMemberBoardChannelId = channelId;
    memberBoard.innerHTML = '<div class="placeholder-notice">Loading members...</div>';

    const channel = await stoatFetch(`/channels/${channelId}`);
    
    // Abort if channel changed while fetching
    if (currentMemberBoardChannelId !== channelId) return;
    if (!channel) return;

    let userIds = [];

    if (channel.server) {
        const responseData = await stoatFetch(`/servers/${channel.server}/members`);
        
        // Abort if channel changed during server fetch
        if (currentMemberBoardChannelId !== channelId) return;

        if (responseData) {
            let membersList = Array.isArray(responseData) ? responseData : (responseData.members || []);
            
            if (Array.isArray(responseData.users)) {
                for (const u of responseData.users) {
                    if (u && u._id) usersCache[u._id] = u;
                }
            }
            
            userIds = membersList.map(m => {
                return (m.id && m.id.user) ? m.id.user : (m._id && m._id.user ? m._id.user : m._id);
            }).filter(Boolean);
        }
    } else if (channel.channel_type === "Group" || Array.isArray(channel.recipients)) {
        userIds = [...(channel.recipients || [])];
        const myId = localStorage.getItem("my_user_id");
        if (myId && !userIds.includes(myId)) userIds.push(myId);
    } else {
        memberBoard.innerHTML = '<div class="placeholder-notice">Direct Message</div>';
        return;
    }

    if (userIds.length === 0) {
        memberBoard.innerHTML = '<div class="placeholder-notice">No members found</div>';
        return;
    }

    memberBoard.innerHTML = '';

    // Safety limit: Don't flood the DOM with thousands of buttons
    const MAX_VISIBLE_MEMBERS = 100;
    const visibleUserIds = userIds.slice(0, MAX_VISIBLE_MEMBERS);

    const CHUNK_SIZE = 25;
    let index = 0;

    function renderNextChunk() {
        // Abort loop immediately if user selected a different channel
        if (currentMemberBoardChannelId !== channelId) return;

        if (index >= visibleUserIds.length) {
            // Append "+ X more members" notice if server exceeds capacity
            if (userIds.length > MAX_VISIBLE_MEMBERS) {
                const overflowNotice = document.createElement('div');
                overflowNotice.className = 'placeholder-notice';
                overflowNotice.style.padding = '8px';
                overflowNotice.textContent = `+ ${userIds.length - MAX_VISIBLE_MEMBERS} more members`;
                memberBoard.appendChild(overflowNotice);
            }
            return;
        }

        const fragment = document.createDocumentFragment();
        const chunk = visibleUserIds.slice(index, index + CHUNK_SIZE);

        for (const userId of chunk) {
            const profile = usersCache[userId];
            const name = profile ? profile.username : userId;
            const avatarUrl = (profile && profile.avatar)
                ? `${STOAT_AUTUMN}/avatars/${profile.avatar._id}`
                : '/images/buffer40.gif';

            const button = document.createElement('button');
            button.className = 'button2';
            button.onclick = () => openUserProfileModal(userId);

            button.innerHTML = `
                <div class="item-btn-avatar" style="background-image: url('${avatarUrl}');"></div>
                <div class="item-btn-label"></div>
            `;
            
            button.querySelector('.item-btn-label').textContent = name;
            fragment.appendChild(button);
        }

        memberBoard.appendChild(fragment);
        index += CHUNK_SIZE;

        if (index < visibleUserIds.length) {
            requestAnimationFrame(renderNextChunk);
        }
    }

    renderNextChunk();
}

async function openFriendsDashboard() {
    currentChannelId = null;
    lastMessageAuthorId = null;
    lastMessageType = null;

    if (activeChannelTitle) activeChannelTitle.textContent = "Friends";

    document.querySelectorAll('.sidebar-channels .button2').forEach(btn => {
        btn.classList.remove('active-channel');
    });

    if (activeChatLayout) activeChatLayout.style.display = "none";
    if (friendsViewLayout) friendsViewLayout.style.display = "block";

    if (memberBoard) {
        memberBoard.innerHTML = '<div class="placeholder-notice">Select a conversation to inspect member states.</div>';
    }
    if (!friendsRosterBox) return;

    friendsRosterBox.innerHTML = '<div class="placeholder-notice">Mapping active connections...</div>';

    const channels = await stoatFetch("/users/dms") || [];
    userDMsCache = channels;
    const myId = localStorage.getItem("my_user_id");
    let connectionsFound = 0;
    let html = "";

    for (const channel of channels) {
        if (channel.active === false) continue;

        if (channel.channel_type === "DirectMessage" || (channel.recipients && channel.recipients.length === 2)) {
            const otherUserId = channel.recipients?.find(id => id !== myId) || channel.user;
            if (otherUserId) {
                connectionsFound++;
                const profile = await getUserProfile(otherUserId);
                const name = profile ? profile.username : otherUserId;
                const avatarUrl = (profile && profile.avatar)
                    ? `${STOAT_AUTUMN}/avatars/${profile.avatar._id}`
                    : '/images/buffer40.gif';
                const escapedName = name.replace(/'/g, "\\'");

                const isOnline = profile && profile.online === true;
                const statusText = isOnline ? "Online" : "Offline";
                const labelColor = isOnline ? "#23a55a" : "#949ba4";
                const badgeColor = isOnline ? "#23a55a" : "#80848e";

                html += `
                    <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px; background-color: rgba(43, 45, 49, 0.4); border-radius: 8px; border: 1px solid rgba(255,255,255,0.02);">
                        <div style="display: flex; align-items: center; gap: 12px; cursor: pointer;" onclick="openUserProfileModal('${otherUserId}')">
                            <div style="width: 38px; height: 38px; background-image: url('${avatarUrl}'); background-size: cover; background-position: center; border-radius: 50%; position: relative;">
                                <div style="position: absolute; width: 14px; height: 14px; bottom: -2px; right: -2px; background-color: #1e1f22; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                                    <div style="height: 9px; width: 9px; background-color: ${badgeColor}; border-radius: 50%;"></div>
                                </div>
                            </div>
                            <div>
                                <div style="color: #f2f3f5; font-weight: 600; font-size: 15px;">${name}</div>
                                <div style="color: ${labelColor}; font-size: 12px; margin-top: 2px;">${statusText}</div>
                            </div>
                        </div>
                        <button onclick="openChat('${channel._id}', '${escapedName}')" style="background-color: #2b2d31; color: #b5bac1; padding: 6px 14px; border-radius: 4px; font-size: 13px; font-weight: 500;">
                            Message
                        </button>
                    </div>
                `;
            }
        }
    }

    if (friendsCountLabel) friendsCountLabel.textContent = connectionsFound;
    friendsRosterBox.innerHTML = connectionsFound > 0 ? html : '<div class="placeholder-notice">No active conversations found.</div>';
}



async function sendMessage() {
    const text = channelTextInput.value.trim();
    if (currentChannelId && text) {
        channelTextInput.value = "";
        channelTextInput.focus();
        await stoatFetch(`/channels/${currentChannelId}/messages`, {
            method: "POST",
            body: JSON.stringify({ content: text })
        });
    }
}

// Optimized appendMessageToFeed for real-time incoming WebSocket messages
async function appendMessageToFeed(data) {
    if (!channelMessagesBox) return;

    if (data.author && !usersCache[data.author]) {
        await getUserProfile(data.author);
    }

    const html = await generateMessageHTML(data);
    channelMessagesBox.insertAdjacentHTML('beforeend', html);
    scrollToBottom();
}

if (channelTextInput) {
    channelTextInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") sendMessage();
    });
}

// --- SERVER & CHANNEL MANAGEMENT FUNCTIONALITY --- //

// Updated renderServerList to hook up "Add Server" and "Explore" buttons
function renderServerList(servers = []) {
    const serverContainer = document.querySelector('.sidebar-servers');
    if (!serverContainer) return;

    let html = `
        <button class="server-btn ${!currentServerId ? 'active' : ''}" onclick="openHomeView()" title="Home" id="btnHomeServer">
            <img class="server-btn-img" src="/images/newLogo256.png" alt="Home">
        </button>
        <a class="server-btn" title="External Site" href="//mistedwafflez.com" target="_blank">
            <img class="server-btn-img" alt="Home" src="//mistedwafflez.com/pfp.jpg">
        </a>
        <div class="sidebar-divider"></div>
    `;

    servers.forEach(server => {
        const iconUrl = server.icon
            ? `${STOAT_AUTUMN}/icons/${server.icon._id}`
            : '/images/buffer40.gif';

        const escapedName = (server.name || 'Server').replace(/'/g, "\\'");
        const isActive = currentServerId === server._id;

        html += `
            <button class="server-btn ${isActive ? 'active' : ''}" data-server-id="${server._id}" onclick="openServer('${server._id}', '${escapedName}')" title="${escapedName}">
                <img class="server-btn-img" src="${iconUrl}" alt="${escapedName}">
            </button>
        `;
    });

    html += `
        <div class="sidebar-divider"></div>
        <button class="server-btn" title="Add Server" onclick="openAddServerModal()"><img class="server-btn-img" src="/images/iconNew.png" alt="Add Server"></button>
        <button class="server-btn" title="Explore" onclick="openExploreServersModal()"><img class="server-btn-img" src="/images/iconNav.png" alt="Explore"></button>
    `;

    serverContainer.innerHTML = html;
}

// Add global caches for servers and server channels
let serversCache = {};
let serverChannelsCache = {};

// 1. Updated initStoatClient() without invalid REST endpoints
async function initStoatClient() {
    if (logoutBtn) logoutBtn.addEventListener("click", handleLogout);
    if (openSettingsBtn) openSettingsBtn.addEventListener("click", () => toggleSettings(true));
    if (closeSettingsBtn) closeSettingsBtn.addEventListener("click", () => toggleSettings(false));

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && settingsOverlay?.classList.contains("active")) {
            toggleSettings(false);
        }
    });

    if (!STOAT_TOKEN) {
        window.location.href = "/login";
        return;
    }

    assignText(cLoadingText, "Verifying credentials...");

    const me = await stoatFetch("/users/@me");
    if (!me) {
        assignText(cLoadingText, "Authentication failed. Redirecting...");
        window.location.href = "/login";
        return;
    }

    localStorage.setItem("my_user_id", me._id);
    usersCache[me._id] = me;

    assignText(displayNameDisplay, me.username);
    assignText(statusDisplay, "Online");
    if (profileNavigationButtom && me.avatar) {
        profileNavigationButtom.style.backgroundImage = `url(${STOAT_AUTUMN}/avatars/${me.avatar._id})`;
    }

    assignText(cLoadingText, "Loading direct messages...");
    userDMsCache = await stoatFetch("/users/dms") || [];
    await renderChannelList(userDMsCache);

    assignText(cLoadingText, "Setting up dashboard...");
    await openFriendsDashboard();

    assignText(cLoadingText, "Connecting to gateway...");
    connectToGateway();
}



// Modal for Creating or Joining a Server
function openAddServerModal() {
    hideContextMenu();
    const modalOverlay = document.getElementById("customModalOverlay");
    const modalTitle = document.getElementById("modalTitle");
    const modalBody = document.getElementById("modalBody");
    const modalActions = document.getElementById("modalActions");

    if (!modalOverlay) return;

    modalTitle.textContent = "Add a Server";
    modalBody.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 16px;">
            <div style="display: flex; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">
                <button id="tabCreateServerBtn" class="modal-tab active" onclick="switchServerTab('create')">Create Server</button>
                <button id="tabJoinServerBtn" class="modal-tab" onclick="switchServerTab('join')">Join Server</button>
            </div>

            <div id="sectionCreateServer">
                <p style="font-size: 13px; color: #a69a8f; margin-bottom: 12px;">Give your server a personality with a name and optional description.</p>
                <label style="font-size: 12px; color: #ba8c63; font-weight: 600; display: block; margin-bottom: 4px;">SERVER NAME</label>
                <input type="text" id="serverNameInput" placeholder="My Awesome Server" class="modal-input" style="width: 100%; margin-bottom: 12px;">
                <label style="font-size: 12px; color: #ba8c63; font-weight: 600; display: block; margin-bottom: 4px;">DESCRIPTION (OPTIONAL)</label>
                <input type="text" id="serverDescInput" placeholder="A cozy hangout space" class="modal-input" style="width: 100%;">
            </div>

            <div id="sectionJoinServer" style="display: none;">
                <p style="font-size: 13px; color: #a69a8f; margin-bottom: 12px;">Enter an invite code or link below to join an existing server.</p>
                <label style="font-size: 12px; color: #ba8c63; font-weight: 600; display: block; margin-bottom: 4px;">INVITE CODE OR URL</label>
                <input type="text" id="serverInviteInput" placeholder="e.g. ABC123XYZ or https://revolt.chat/invite/XYZ" class="modal-input" style="width: 100%;">
            </div>
        </div>
    `;

    modalActions.innerHTML = `
        <button class="modal-btn modal-btn-secondary" onclick="closeCustomModal()">Cancel</button>
        <button id="serverSubmitBtn" class="modal-btn modal-btn-primary" onclick="submitCreateServer()">Create Server</button>
    `;

    modalOverlay.style.display = "flex";
}

function switchServerTab(tab) {
    const createSec = document.getElementById("sectionCreateServer");
    const joinSec = document.getElementById("sectionJoinServer");
    const createBtn = document.getElementById("tabCreateServerBtn");
    const joinBtn = document.getElementById("tabJoinServerBtn");
    const submitBtn = document.getElementById("serverSubmitBtn");

    if (tab === "create") {
        createSec.style.display = "block";
        joinSec.style.display = "none";
        createBtn.classList.add("active");
        joinBtn.classList.remove("active");
        submitBtn.textContent = "Create Server";
        submitBtn.onclick = submitCreateServer;
    } else {
        createSec.style.display = "none";
        joinSec.style.display = "block";
        createBtn.classList.remove("active");
        joinBtn.classList.add("active");
        submitBtn.textContent = "Join Server";
        submitBtn.onclick = submitJoinServer;
    }
}

async function submitJoinServer() {
    const inviteInput = document.getElementById("serverInviteInput");
    let code = inviteInput ? inviteInput.value.trim() : "";

    if (!code) {
        alert("Please enter an invite code or link.");
        return;
    }

    // Extract code if user pasted a full URL
    if (code.includes("/")) {
        code = code.split("/").pop();
    }

    const res = await stoatFetch(`/invites/${code}`, { method: "POST" });
    if (res) {
        closeCustomModal();
        const updatedServers = await stoatFetch("/users/servers") || await stoatFetch("/servers") || [];
        renderServerList(updatedServers);

        if (res.server) {
            openServer(res.server._id, res.server.name);
        } else {
            openHomeView();
        }
    } else {
        alert("Invalid invite code or unable to join server.");
    }
}

// Server Actions Dropdown Menu
function toggleServerMenu(event, serverId, serverName) {
    event.stopPropagation();
    hideContextMenu();

    const menu = document.getElementById("contextMenu");
    if (!menu) return;

    menu.innerHTML = `
        <div class="context-item" onclick="openCreateChannelModal('${serverId}')">➕ Create Channel</div>
        <div class="context-item" onclick="openCreateInviteModal()">🔗 Create Invite</div>
        <div class="context-divider"></div>
        <div class="context-item danger" onclick="confirmLeaveServer('${serverId}', '${serverName.replace(/'/g, "\\'")}')">🚪 Leave Server</div>
    `;

    const rect = event.currentTarget.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${rect.left}px`;
    menu.style.display = "block";
}

// Modal to Create Channel inside Server
function openCreateChannelModal(serverId) {
    hideContextMenu();
    const modalOverlay = document.getElementById("customModalOverlay");
    const modalTitle = document.getElementById("modalTitle");
    const modalBody = document.getElementById("modalBody");
    const modalActions = document.getElementById("modalActions");

    if (!modalOverlay) return;

    modalTitle.textContent = "Create Channel";
    modalBody.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 12px;">
            <label style="font-size: 12px; color: #ba8c63; font-weight: 600;">CHANNEL NAME</label>
            <input type="text" id="channelNameInput" placeholder="new-channel" class="modal-input" style="width: 100%;">
            <label style="font-size: 12px; color: #ba8c63; font-weight: 600;">CHANNEL TYPE</label>
            <select id="channelTypeInput" class="modal-input" style="width: 100%; background: #12100e; color: #fff;">
                <option value="TextChannel">Text Channel</option>
                <option value="VoiceChannel">Voice Channel</option>
            </select>
        </div>
    `;

    modalActions.innerHTML = `
        <button class="modal-btn modal-btn-secondary" onclick="closeCustomModal()">Cancel</button>
        <button class="modal-btn modal-btn-primary" onclick="submitCreateChannel('${serverId}')">Create Channel</button>
    `;

    modalOverlay.style.display = "flex";
}

async function submitCreateChannel(serverId) {
    const nameInput = document.getElementById("channelNameInput");
    const typeInput = document.getElementById("channelTypeInput");

    const name = nameInput ? nameInput.value.trim() : "";
    const type = typeInput ? typeInput.value : "TextChannel";

    if (!name) {
        alert("Please enter a channel name.");
        return;
    }

    const res = await stoatFetch(`/servers/${serverId}/channels`, {
        method: "POST",
        body: JSON.stringify({ name, type })
    });

    if (res) {
        closeCustomModal();
        const channels = await stoatFetch(`/servers/${serverId}/channels`);
        if (channels) {
            await renderServerChannelList(channels);
            openChat(res._id, res.name || name);
        }
    } else {
        alert("Failed to create channel.");
    }
}

// Modal to Create Invite for current active channel
async function openCreateInviteModal() {
    hideContextMenu();
    if (!currentChannelId) return;

    const res = await stoatFetch(`/channels/${currentChannelId}/invites`, { method: "POST" });
    if (!res || !res._id) {
        alert("Failed to generate invite.");
        return;
    }

    const inviteCode = res._id;
    const modalOverlay = document.getElementById("customModalOverlay");
    const modalTitle = document.getElementById("modalTitle");
    const modalBody = document.getElementById("modalBody");
    const modalActions = document.getElementById("modalActions");

    if (!modalOverlay) return;

    modalTitle.textContent = "Server Invite Created";
    modalBody.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 8px;">
            <p style="font-size: 13px; color: #a69a8f;">Share this invite code with your friends:</p>
            <input type="text" readonly value="${inviteCode}" id="inviteCodeDisplay" class="modal-input" style="width: 100%; font-weight: bold; text-align: center;">
        </div>
    `;

    modalActions.innerHTML = `
        <button class="modal-btn modal-btn-primary" onclick="navigator.clipboard.writeText('${inviteCode}'); closeCustomModal();">Copy Code & Close</button>
    `;

    modalOverlay.style.display = "flex";
}

function confirmLeaveServer(serverId, serverName) {
    hideContextMenu();
    const modalOverlay = document.getElementById("customModalOverlay");
    const modalTitle = document.getElementById("modalTitle");
    const modalBody = document.getElementById("modalBody");
    const modalActions = document.getElementById("modalActions");

    if (!modalOverlay) return;

    modalTitle.textContent = `Leave '${serverName}'?`;
    modalBody.innerHTML = `<p style="font-size: 14px; color: #e3deda;">Are you sure you want to leave this server? You won't be able to rejoin unless re-invited.</p>`;

    modalActions.innerHTML = `
        <button class="modal-btn modal-btn-secondary" onclick="closeCustomModal()">Cancel</button>
        <button class="modal-btn modal-btn-danger" onclick="submitLeaveServer('${serverId}')">Leave Server</button>
    `;

    modalOverlay.style.display = "flex";
}

// Updated openServer() that correctly resolves channel ID strings to channel objects
async function openServer(serverId, serverName) {
    currentServerId = serverId;

    document.querySelectorAll('.server-btn').forEach(btn => btn.classList.remove('active'));
    const serverBtn = document.querySelector(`.server-btn[data-server-id="${serverId}"]`);
    if (serverBtn) serverBtn.classList.add('active');

    const headerContainer = document.getElementById('channelSidebarHeader');
    if (headerContainer) {
        headerContainer.innerHTML = `
            <div class="server-header-banner" onclick="toggleServerMenu(event, '${serverId}', '${serverName.replace(/'/g, "\\'")}')">
                <span class="server-header-name">${serverName}</span>
                <span class="server-header-arrow">▼</span>
            </div>
            <div class="channel-list-divider"></div>
        `;
    }

    let channelIds = [];

    // Fetch server details
    const serverRes = await stoatFetch(`/servers/${serverId}`);
    if (serverRes) {
        const serverData = serverRes.server || serverRes;
        serversCache[serverId] = serverData;
        
        if (Array.isArray(serverData.channels)) {
            channelIds = serverData.channels;
        }
    } else if (serversCache[serverId]?.channels) {
        channelIds = serversCache[serverId].channels;
    }

    // Map raw IDs or objects into full Channel objects from cache
    const channelObjects = channelIds
        .map(item => typeof item === 'object' ? item : serverChannelsCache[item])
        .filter(Boolean);

    if (channelObjects.length > 0) {
        await renderServerChannelList(channelObjects);

        // Auto-open first text channel
        const firstTextChannel = channelObjects.find(c => c && (c.channel_type === "TextChannel" || !c.channel_type));
        if (firstTextChannel && firstTextChannel._id) {
            openChat(firstTextChannel._id, firstTextChannel.name || "general");
        }
    } else {
        renderServerChannelList([]);
    }
}

// Fixed submitCreateServer() without invalid REST endpoint fetches
async function submitCreateServer() {
    const nameInput = document.getElementById("serverNameInput");
    const descInput = document.getElementById("serverDescInput");

    const name = nameInput ? nameInput.value.trim() : "";
    const description = descInput ? descInput.value.trim() : "";

    if (!name) {
        alert("Please enter a server name.");
        return;
    }

    const payload = { name };
    if (description) payload.description = description;

    const res = await stoatFetch("/servers/create", {
        method: "POST",
        body: JSON.stringify(payload)
    });

    if (res && (res.server || res._id)) {
        const newServer = res.server || res;
        serversCache[newServer._id] = newServer;
        closeCustomModal();

        renderServerList(Object.values(serversCache));
        openServer(newServer._id, newServer.name);
    } else {
        alert("Failed to create server. Please try again.");
    }
}

// Fixed submitJoinServer()
async function submitJoinServer() {
    const inviteInput = document.getElementById("serverInviteInput");
    let code = inviteInput ? inviteInput.value.trim() : "";

    if (!code) {
        alert("Please enter an invite code or link.");
        return;
    }

    if (code.includes("/")) {
        code = code.split("/").pop();
    }

    const res = await stoatFetch(`/invites/${code}`, { method: "POST" });
    if (res) {
        closeCustomModal();
        if (res.server) {
            serversCache[res.server._id] = res.server;
            renderServerList(Object.values(serversCache));
            openServer(res.server._id, res.server.name);
        } else {
            openHomeView();
        }
    } else {
        alert("Invalid invite code or unable to join server.");
    }
}

// Fixed submitLeaveServer()
async function submitLeaveServer(serverId) {
    await stoatFetch(`/servers/${serverId}`, { method: "DELETE" });
    delete serversCache[serverId];
    closeCustomModal();
    renderServerList(Object.values(serversCache));
    openHomeView();
}

function openExploreServersModal() {
    hideContextMenu();
    alert("Server Discovery / Explore feature coming soon!");
}

function connectToGateway() {
    stoatWS = new WebSocket(STOAT_WS_URL);

    stoatWS.onopen = () => {
        console.log("Connected to Stoat Gateway. Authenticating...");
        assignText(cLoadingText, "Authenticating session...");
        stoatWS.send(JSON.stringify({ type: "Authenticate", token: STOAT_TOKEN }));
    };

    stoatWS.onmessage = async (event) => {
        const packet = JSON.parse(event.data);

        switch (packet.type) {
            case "Authenticated":
                console.log("Successfully Authenticated with Gateway!");
                assignText(cLoadingText, "Fetching servers & user state...");
                break;

            case "Ready":
                console.log("Gateway Ready payload received:", packet);

                // Cache servers
                if (packet.servers && Array.isArray(packet.servers)) {
                    packet.servers.forEach(s => { serversCache[s._id] = s; });
                    renderServerList(packet.servers);
                }

                // Cache all channel objects
                if (packet.channels && Array.isArray(packet.channels)) {
                    packet.channels.forEach(c => { serverChannelsCache[c._id] = c; });
                }

                // Cache users
                if (packet.users && Array.isArray(packet.users)) {
                    packet.users.forEach(u => { usersCache[u._id] = u; });
                }

                setTimeout(() => { dismissLoadingOverlay(); }, 300);
                break;

            case "Message":
                if (packet.channel === currentChannelId) {
                    appendMessageToFeed(packet);
                } else if (!currentServerId) {
                    const updatedChannels = await stoatFetch("/users/dms");
                    if (updatedChannels) {
                        userDMsCache = updatedChannels;
                        await renderChannelList(updatedChannels);
                    }
                }
                break;

            case "MessageUpdate":
                if (packet.channel === currentChannelId) {
                    const msgElement = document.querySelector(`[data-message-id="${packet.id}"]`);
                    if (msgElement) {
                        let contentElement = msgElement.querySelector('.message-content');
                        if (!contentElement) {
                            const detailsElement = msgElement.querySelector('.message-details');
                            if (detailsElement) {
                                contentElement = document.createElement('div');
                                contentElement.className = 'message-content';
                                detailsElement.insertBefore(contentElement, detailsElement.firstChild);
                            }
                        }
                        if (contentElement && packet.data && packet.data.content !== undefined) {
                            contentElement.textContent = packet.data.content;
                            if (!msgElement.querySelector('.edited-tag')) {
                                contentElement.insertAdjacentHTML('beforeend', ' <span class="edited-tag" style="font-size: 11px; color: #949ba4;">(edited)</span>');
                            }
                        }
                    }
                }
                break;

            case "MessageDelete":
                if (packet.channel === currentChannelId) {
                    const msgElement = document.querySelector(`[data-message-id="${packet.id}"]`);
                    if (msgElement) {
                        msgElement.remove();
                    }
                }
                break;

            case "BulkDelete":
            case "MessageAppend":
                if (packet.channel === currentChannelId && Array.isArray(packet.ids)) {
                    packet.ids.forEach(id => {
                        const msgElement = document.querySelector(`[data-message-id="${id}"]`);
                        if (msgElement) msgElement.remove();
                    });
                }
                break;

            case "ChannelDelete":
                if (packet.id === currentChannelId) {
                    openFriendsDashboard();
                }
                if (!currentServerId) {
                    const remainingChannels = await stoatFetch("/users/dms");
                    if (remainingChannels) {
                        userDMsCache = remainingChannels;
                        await renderChannelList(remainingChannels);
                    }
                }
                break;
        }
    };

    stoatWS.onclose = () => {
        console.warn("Disconnected from Stoat Gateway. Retrying in 5 seconds...");
        setTimeout(connectToGateway, 5000);
    };

    setTimeout(dismissLoadingOverlay, 6000);
}

function closeCustomModal() {
    const modalOverlay = document.getElementById("customModalOverlay");
    if (modalOverlay) modalOverlay.style.display = "none";
}

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeCustomModal();
});

function promptEditMessage(msgId) {
    hideContextMenu();
    const msgElem = document.querySelector(`[data-message-id="${msgId}"] .message-content`);
    if (!msgElem) return;

    const currentText = msgElem.innerText.replace(" (edited)", "");

    const modalOverlay = document.getElementById("customModalOverlay");
    const modalTitle = document.getElementById("modalTitle");
    const modalBody = document.getElementById("modalBody");
    const modalActions = document.getElementById("modalActions");

    if (!modalOverlay) return;

    modalTitle.textContent = "Edit Message";
    modalBody.innerHTML = `
        <div>Modify your message below:</div>
        <input type="text" id="modalEditInput" class="modal-input" value="${currentText.replace(/"/g, '&quot;')}">
    `;

    modalActions.innerHTML = `
        <button class="modal-btn modal-btn-secondary" onclick="closeCustomModal()">Cancel</button>
        <button class="modal-btn modal-btn-primary" id="confirmEditBtn">Save Changes</button>
    `;

    modalOverlay.style.display = "flex";

    const editInput = document.getElementById("modalEditInput");
    editInput.focus();
    editInput.select();

    const saveEdit = async () => {
        const newText = editInput.value.trim();
        closeCustomModal();
        if (newText && newText !== currentText) {
            await stoatFetch(`/channels/${currentChannelId}/messages/${msgId}`, {
                method: "PATCH",
                body: JSON.stringify({ content: newText })
            });
        }
    };

    document.getElementById("confirmEditBtn").onclick = saveEdit;
    editInput.onkeydown = (e) => {
        if (e.key === "Enter") saveEdit();
    };
}

function deleteMessageAction(msgId) {
    hideContextMenu();

    const modalOverlay = document.getElementById("customModalOverlay");
    const modalTitle = document.getElementById("modalTitle");
    const modalBody = document.getElementById("modalBody");
    const modalActions = document.getElementById("modalActions");

    if (!modalOverlay) return;

    modalTitle.textContent = "Delete Message";
    modalBody.innerHTML = `Are you sure you want to delete this message? This action cannot be undone.`;

    modalActions.innerHTML = `
        <button class="modal-btn modal-btn-secondary" onclick="closeCustomModal()">Cancel</button>
        <button class="modal-btn modal-btn-danger" id="confirmDeleteBtn">Delete</button>
    `;

    modalOverlay.style.display = "flex";

    document.getElementById("confirmDeleteBtn").onclick = async () => {
        closeCustomModal();
        await stoatFetch(`/channels/${currentChannelId}/messages/${msgId}`, {
            method: "DELETE"
        });
    };
}

function showContextMenu(x, y, items) {
    const menuEl = document.getElementById("contextMenu");
    if (!menuEl) return;

    let html = "";
    items.forEach(item => {
        if (item.type === "divider") {
            html += `<div class="context-menu-divider"></div>`;
        } else {
            const dangerClass = item.danger ? "danger" : "";
            html += `
                <div class="context-menu-item ${dangerClass}" onclick="${item.action}">
                    ${item.label}
                </div>
            `;
        }
    });

    menuEl.innerHTML = html;
    menuEl.style.display = "flex";

    const menuWidth = menuEl.offsetWidth || 170;
    const menuHeight = menuEl.offsetHeight || 120;
    const posX = x + menuWidth > window.innerWidth ? x - menuWidth : x;
    const posY = y + menuHeight > window.innerHeight ? y - menuHeight : y;

    menuEl.style.left = `${posX}px`;
    menuEl.style.top = `${posY}px`;
}

function hideContextMenu() {
    const menuEl = document.getElementById("contextMenu");
    if (menuEl) menuEl.style.display = "none";
}

async function copyMessageContent(msgId) {
    hideContextMenu();
    const msgElem = document.querySelector(`[data-message-id="${msgId}"] .message-content`);
    if (msgElem) {
        await navigator.clipboard.writeText(msgElem.innerText.replace(" (edited)", ""));
    }
}

async function copyMessageId(msgId) {
    hideContextMenu();
    await navigator.clipboard.writeText(msgId);
}

document.addEventListener("contextmenu", (e) => {
    const messageItem = e.target.closest(".message-item");
    if (messageItem && currentChannelId) {
        e.preventDefault();
        const msgId = messageItem.dataset.messageId;
        const authorId = messageItem.dataset.authorId;
        const myId = localStorage.getItem("my_user_id");

        const isMyMessage = authorId === myId;

        const menuItems = [
            { label: "View Profile", action: `openUserProfileModal('${authorId}')` },
            { label: "Copy Text", action: `copyMessageContent('${msgId}')` },
            { label: "Copy Message ID", action: `copyMessageId('${msgId}')` }
        ];

        if (isMyMessage) {
            menuItems.push({ type: "divider" });
            menuItems.push({ label: "Edit Message", action: `promptEditMessage('${msgId}')` });
            menuItems.push({ label: "Delete Message", action: `deleteMessageAction('${msgId}')`, danger: true });
        }

        showContextMenu(e.clientX, e.clientY, menuItems);
    } else {
        hideContextMenu();
    }
});

document.addEventListener("click", () => hideContextMenu());

initStoatClient();