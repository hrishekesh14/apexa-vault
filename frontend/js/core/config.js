(function () {
    const hostname = window.location.hostname || '';
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const defaultApiBase = isLocalhost
        ? 'http://localhost:5000/api'
        : window.__APEXA_API_URL__ || 'https://apexa-vault-2.onrender.com/api';

    const CONFIG = {
        API_BASE: defaultApiBase,
        TOKEN_KEY: 'apexa_token',
        REFRESH_KEY: 'apexa_refresh_token',
        USER_KEY: 'apexa_current_user',
        STORAGE_QUOTA_BYTES: 5 * 1024 * 1024 * 1024,
    };

    const clearAuthState = () => {
        localStorage.removeItem(CONFIG.TOKEN_KEY);
        localStorage.removeItem(CONFIG.REFRESH_KEY);
        localStorage.removeItem(CONFIG.USER_KEY);
        sessionStorage.removeItem(CONFIG.TOKEN_KEY);
        sessionStorage.removeItem(CONFIG.REFRESH_KEY);
        sessionStorage.removeItem(CONFIG.USER_KEY);
        document.cookie = 'apexa_refresh=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    };

    const triggerBlobDownload = (blob, fileName) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            URL.revokeObjectURL(url);
            if (a.parentNode) document.body.removeChild(a);
        }, 100);
    };

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const formatBytes = (bytes) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
        if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
        return `${(bytes / 1073741824).toFixed(2)} GB`;
    };

    const generateSecureId = (len = 16) => {
        const arr = crypto.getRandomValues(new Uint8Array(len));
        return Array.from(arr)
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('');
    };

    window.ApexaConfig = {
        CONFIG,
        clearAuthState,
        triggerBlobDownload,
        delay,
        formatBytes,
        generateSecureId,
    };
})();
