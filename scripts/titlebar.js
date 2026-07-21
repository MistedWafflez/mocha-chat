window.addEventListener('DOMContentLoaded', () => {
    if (window.electronAPI) {
        const titlebar = document.querySelector('.custom-titlebar');
        
        if (titlebar) {
            titlebar.classList.add('is-electron');
            
            const controls = document.getElementById('electron-controls');
            if (controls) controls.style.display = 'flex';
        }

        const brandLink = document.querySelector('.brand-logo a');
        if (brandLink) {
            brandLink.removeAttribute('href'); // Removes anchor link behavior entirely
            brandLink.addEventListener('click', (e) => e.preventDefault());
        }

        document.getElementById('min-btn')?.addEventListener('click', () => window.electronAPI.minimize());
        document.getElementById('max-btn')?.addEventListener('click', () => window.electronAPI.maximize());
        document.getElementById('close-btn')?.addEventListener('click', () => window.electronAPI.close());
    }
});