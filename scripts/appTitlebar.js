function initAppTitlebar() {
    if (!window.electronAPI) {
        return;
    }

    const minBtn = document.getElementById('min-btn');
    const maxBtn = document.getElementById('max-btn');
    const closeBtn = document.getElementById('close-btn');

    if (!minBtn || !maxBtn || !closeBtn) {
        return false;
    }

    document.body.classList.add('is-electron');

    const titlebar = document.querySelector('.custom-titlebar');
    if (titlebar) {
        titlebar.classList.add('is-electron');
    }

    const controls = document.getElementById('electron-controls');
    if (controls) {
        controls.style.display = 'flex';
    }

    const brandLink = document.querySelector('.brand-logo a');
    if (brandLink) {
        brandLink.removeAttribute('href');
        brandLink.onclick = (e) => e.preventDefault();
    }

    minBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.electronAPI.minimize();
    };

    maxBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.electronAPI.maximize();
    };

    closeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        window.electronAPI.close();
    };

    return true;
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!initAppTitlebar()) {
            setTimeout(initAppTitlebar, 100);
        }
    });
} else {
    if (!initAppTitlebar()) {
        setTimeout(initAppTitlebar, 100);
    }
}