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
let stoatWS = null;
let usersCache = {};
let lastMessageAuthorId = null;
let lastMessageType = null; 

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
    renderServerList([]); 

    const channels = await stoatFetch("/users/dms");
    await renderChannelList(channels || []);

    assignText(cLoadingText, "Setting up dashboard...");
    await openFriendsDashboard();

    assignText(cLoadingText, "Connecting to gateway...");
    connectToGateway();
}

function renderServerList(servers = []) {
    const serverContainer = document.querySelector('.sidebar-servers');
    if (!serverContainer) return;

    let staticHTML = `
        <button class="server-btn" onclick="openFriendsDashboard()" title="Home">
            <img class="server-btn-img" src="/images/newLogo256.png" alt="Home">
        </button>
        <div class="sidebar-divider"></div>
    `;

    let serverButtonsHTML = '';

    servers.forEach(server => {
        const iconUrl = server.icon 
            ? `${STOAT_AUTUMN}/icons/${server.icon._id}` 
            : '/images/buffer40.gif';

        const escapedName = (server.name || 'Server').replace(/'/g, "\\'");

        serverButtonsHTML += `
            <button class="server-btn" onclick="openServer('${server._id}', '${escapedName}')" title="${escapedName}">
                <img class="server-btn-img" src="${iconUrl}" alt="${escapedName}">
            </button>
        `;
    });

    let secondDividerHTML = servers.length > 0 ? `<div class="sidebar-divider"></div>` : '';

    let footerHTML = `
        <button class="server-btn" title="Add Server"><img class="server-btn-img" src="/images/iconNew.png" alt="Add Server"></button>
        <button class="server-btn" title="Explore"><img class="server-btn-img" src="/images/iconNav.png" alt="Explore"></button>
    `;

    serverContainer.innerHTML = staticHTML + serverButtonsHTML + secondDividerHTML + footerHTML;
}

async function openServer(serverId, serverName) {
    if (activeChannelTitle) activeChannelTitle.textContent = serverName;
    
    const channels = await stoatFetch(`/servers/${serverId}/channels`);
    if (channels) {
        await renderChannelList(channels);
    }
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

    await stoatFetch(`/channels/${channelId}`, { method: "DELETE" }).catch(() => {});

    if (currentChannelId === channelId) {
        openFriendsDashboard();
    }
}

async function renderMemberBoard(channelId) {
    if (!memberBoard) return;
    memberBoard.innerHTML = '<div class="placeholder-notice">Loading members...</div>';

    const channel = await stoatFetch(`/channels/${channelId}`);
    if (!channel) return;

    let userIds = [];

    if (channel.server) {
        const responseData = await stoatFetch(`/servers/${channel.server}/members`);
        if (responseData) {
            let membersList = Array.isArray(responseData) ? responseData : (responseData.members || []);
            if (responseData && Array.isArray(responseData.users)) {
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

    let html = "";
    for (const userId of userIds) {
        const profile = await getUserProfile(userId);
        const name = profile ? profile.username : userId;
        const avatarUrl = (profile && profile.avatar)
            ? `${STOAT_AUTUMN}/avatars/${profile.avatar._id}`
            : '/images/buffer40.gif';

        html += `
            <button class="button2">
                <div class="item-btn-avatar" style="background-image: url('${avatarUrl}');"></div>
                <div class="item-btn-label">${name}</div>
            </button>
        `;
    }
    memberBoard.innerHTML = html;
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
                        <div style="display: flex; align-items: center; gap: 12px;">
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

async function openChat(channelId, name) {
    currentChannelId = channelId;
    if (channelMessagesBox) channelMessagesBox.innerHTML = "";
    if (activeChannelTitle) activeChannelTitle.textContent = name;
    if (channelTextInput) channelTextInput.placeholder = `Message #${name}`;

    if (friendsViewLayout) friendsViewLayout.style.display = "none";
    if (activeChatLayout) activeChatLayout.style.display = "block";

    document.querySelectorAll('.sidebar-channels .button2').forEach(btn => {
        btn.classList.remove('active-channel');
    });
    
    const clickedElement = window.event?.currentTarget;
    if (clickedElement && clickedElement.tagName === 'BUTTON') {
        clickedElement.classList.add('active-channel');
    }

    const history = await stoatFetch(`/channels/${channelId}/messages`);
    if (history) {
        const messages = Array.isArray(history) ? history : (history.messages || []);
        
        lastMessageAuthorId = null;
        lastMessageType = null;

        for (const msg of [...messages].reverse()) {
            await appendMessageToFeed(msg);
        }
    }

    renderMemberBoard(channelId);
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

async function appendMessageToFeed(data) {
    if (!channelMessagesBox) return;

    const timeObj = parseUlidTimestamp(data._id);
    const timeString = timeObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    let cleanHTML = "";

    if (data.system) {
        let systemText = "System action performed.";
        if (data.system.type === "text") {
            systemText = data.system.content;
        } else if (data.system.type === "channel_renamed") {
            if (!usersCache[data.author]) await getUserProfile(data.author);
            const actor = usersCache[data.author]?.username || data.author;
            systemText = `${actor} renamed the channel to **${data.system.name}**`;
        }

        cleanHTML = `
            <div class="message-item system-notification" data-message-id="${data._id}" style="margin-top: 8px; margin-bottom: 8px; opacity: 0.75; font-size: 14px; padding-left: 72px;">
                <span class="message-content" style="color: #949ba4;">${systemText}</span>
            </div>
        `;
        lastMessageAuthorId = null; 
        lastMessageType = "system";
        channelMessagesBox.insertAdjacentHTML('beforeend', cleanHTML);
        scrollToBottom();
        return;
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

    if (lastMessageAuthorId === data.author && lastMessageType === "user") {
        cleanHTML = `
            <div class="message-item consecutive" data-message-id="${data._id}">
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
        if (!usersCache[data.author]) await getUserProfile(data.author);
        const authorProfile = usersCache[data.author];
        const authorName = authorProfile?.username || data.author;
        
        const avatarUrl = (authorProfile && authorProfile.avatar) 
            ? `${STOAT_AUTUMN}/avatars/${authorProfile.avatar._id}` 
            : '/images/buffer40.gif';

        cleanHTML = `
            <div class="message-item" data-message-id="${data._id}">
                <div class="message-avatar" style="background-image: url('${avatarUrl}');"></div>
                <div class="message-details">
                    <div class="message-header">
                        <span class="message-author">${authorName}</span>
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
    channelMessagesBox.insertAdjacentHTML('beforeend', cleanHTML);
    scrollToBottom();
}

if (channelTextInput) {
    channelTextInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") sendMessage();
    });
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
                
                const serverCount = packet.servers ? packet.servers.length : 0;
                assignText(cLoadingText, `Loaded ${serverCount} server${serverCount === 1 ? '' : 's'}! Finalizing...`);

                if (packet.servers && Array.isArray(packet.servers)) {
                    renderServerList(packet.servers);
                }
                if (packet.users && Array.isArray(packet.users)) {
                    packet.users.forEach(u => { usersCache[u._id] = u; });
                }

                setTimeout(() => {
                    dismissLoadingOverlay();
                }, 300);
                break;

            case "Message":
                if (packet.channel === currentChannelId) {
                    appendMessageToFeed(packet);
                } else {
                    const updatedChannels = await stoatFetch("/users/dms");
                    if (updatedChannels) await renderChannelList(updatedChannels);
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
                const remainingChannels = await stoatFetch("/users/dms");
                if (remainingChannels) await renderChannelList(remainingChannels);
                break;
        }
    };

    stoatWS.onclose = () => {
        console.warn("Disconnected from Stoat Gateway. Retrying in 5 seconds...");
        setTimeout(connectToGateway, 5000);
    };

    setTimeout(dismissLoadingOverlay, 6000);
}

initStoatClient(); // hi!