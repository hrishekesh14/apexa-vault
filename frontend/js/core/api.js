(function () {
    const { CONFIG, clearAuthState } = window.ApexaConfig;

    const ApiClient = {
        _getToken() {
            return sessionStorage.getItem(CONFIG.TOKEN_KEY) || localStorage.getItem(CONFIG.TOKEN_KEY);
        },

        _getRefreshToken() {
            return localStorage.getItem(CONFIG.REFRESH_KEY) || sessionStorage.getItem(CONFIG.REFRESH_KEY);
        },

        _buildHeaders(extra = {}) {
            const headers = { Accept: 'application/json', ...extra };
            const token = this._getToken();
            if (token) headers.Authorization = `Bearer ${token}`;
            return headers;
        },

        async _handleResponse(response) {
            if (response.status === 401) {
                const body = await response.json().catch(() => ({}));
                if (body.code === 'TOKEN_EXPIRED' || body.message?.includes('expired')) {
                    const refreshed = await this._attemptRefresh();
                    if (!refreshed) {
                        this._forceLogout();
                        throw new Error('Session expired. Please log in again.');
                    }
                    throw { _retry: true };
                }
                this._forceLogout();
                throw new Error(body.message || 'Unauthorized');
            }

            if (response.status === 403) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.message || 'Access forbidden');
            }

            if (response.status === 404) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.message || 'Resource not found');
            }

            if (response.status === 429) {
                throw new Error('Too many requests. Please slow down.');
            }

            if (response.status >= 500) {
                throw new Error('Server error. Please try again later.');
            }

            const data = await response.json().catch(() => ({}));
            if (!data.success && data.message) {
                throw new Error(data.message);
            }
            return data;
        },

        async _attemptRefresh() {
            const refreshToken = this._getRefreshToken();
            if (!refreshToken) return false;
            try {
                const response = await fetch(`${CONFIG.API_BASE}/auth/refresh`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken }),
                    credentials: 'include',
                });
                if (!response.ok) return false;
                const data = await response.json();
                if (data.token) {
                    sessionStorage.setItem(CONFIG.TOKEN_KEY, data.token);
                    if (data.refreshToken) {
                        localStorage.setItem(CONFIG.REFRESH_KEY, data.refreshToken);
                        sessionStorage.setItem(CONFIG.REFRESH_KEY, data.refreshToken);
                    }
                    return true;
                }
                return false;
            } catch (_) {
                return false;
            }
        },

        _forceLogout() {
            clearAuthState();
            window.location.reload();
        },

        async get(path) {
            const doRequest = () =>
                fetch(`${CONFIG.API_BASE}${path}`, {
                    method: 'GET',
                    headers: this._buildHeaders(),
                    credentials: 'include',
                });
            try {
                const response = await doRequest();
                return await this._handleResponse(response);
            } catch (error) {
                if (error._retry) {
                    const response = await doRequest();
                    return await this._handleResponse(response);
                }
                throw error;
            }
        },

        async post(path, body) {
            const doRequest = () =>
                fetch(`${CONFIG.API_BASE}${path}`, {
                    method: 'POST',
                    headers: this._buildHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify(body),
                    credentials: 'include',
                });
            try {
                const response = await doRequest();
                return await this._handleResponse(response);
            } catch (error) {
                if (error._retry) {
                    const response = await doRequest();
                    return await this._handleResponse(response);
                }
                throw error;
            }
        },

        async postForm(path, formData) {
            const doRequest = () =>
                fetch(`${CONFIG.API_BASE}${path}`, {
                    method: 'POST',
                    headers: this._buildHeaders(),
                    body: formData,
                    credentials: 'include',
                });
            try {
                const response = await doRequest();
                return await this._handleResponse(response);
            } catch (error) {
                if (error._retry) {
                    const response = await doRequest();
                    return await this._handleResponse(response);
                }
                throw error;
            }
        },

        async delete(path) {
            const doRequest = () =>
                fetch(`${CONFIG.API_BASE}${path}`, {
                    method: 'DELETE',
                    headers: this._buildHeaders(),
                    credentials: 'include',
                });
            try {
                const response = await doRequest();
                return await this._handleResponse(response);
            } catch (error) {
                if (error._retry) {
                    const response = await doRequest();
                    return await this._handleResponse(response);
                }
                throw error;
            }
        },

        async getBinary(path) {
            const token = this._getToken();
            const headers = { Accept: '*/*' };
            if (token) headers.Authorization = `Bearer ${token}`;
            const response = await fetch(`${CONFIG.API_BASE}${path}`, {
                method: 'GET',
                headers,
                credentials: 'include',
            });
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(body.message || 'Download failed');
            }
            return response.blob();
        },

        async postBinary(path, body) {
            const token = this._getToken();
            const headers = { 'Content-Type': 'application/json', Accept: '*/*' };
            if (token) headers.Authorization = `Bearer ${token}`;
            const response = await fetch(`${CONFIG.API_BASE}${path}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                credentials: 'include',
            });
            if (response.status === 401 || response.status === 403) {
                const errorBody = await response.json().catch(() => ({}));
                throw new Error(errorBody.message || 'Unauthorized');
            }
            if (!response.ok) {
                const errorBody = await response.json().catch(() => ({}));
                throw new Error(errorBody.message || 'Download failed');
            }
            return response.blob();
        },
    };

    const AuthService = {
        async register(payload) {
            return ApiClient.post('/auth/register', payload);
        },

        async login(payload) {
            const data = await ApiClient.post('/auth/login', payload);
            sessionStorage.setItem(CONFIG.TOKEN_KEY, data.token);
            localStorage.setItem(CONFIG.REFRESH_KEY, data.refreshToken);
            sessionStorage.setItem(CONFIG.REFRESH_KEY, data.refreshToken);
            localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(data.user));
            return data;
        },

        async logout() {
            const token = this._getAccessToken();
            const refreshToken = this._getRefreshToken();
            try {
                if (token || refreshToken) {
                    await fetch(`${CONFIG.API_BASE}/auth/logout`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(token ? { Authorization: `Bearer ${token}` } : {}),
                        },
                        body: JSON.stringify({ refreshToken }),
                        credentials: 'include',
                    }).catch(() => {});
                }
            } finally {
                clearAuthState();
            }
        },

        _getAccessToken() {
            return sessionStorage.getItem(CONFIG.TOKEN_KEY) || localStorage.getItem(CONFIG.TOKEN_KEY);
        },

        _getRefreshToken() {
            return localStorage.getItem(CONFIG.REFRESH_KEY) || sessionStorage.getItem(CONFIG.REFRESH_KEY);
        },

        getCurrentUser() {
            const raw = localStorage.getItem(CONFIG.USER_KEY);
            return raw ? JSON.parse(raw) : null;
        },

        isAuthenticated() {
            return !!(this._getAccessToken() && this.getCurrentUser());
        },
    };

    const FileService = {
        async list() {
            return ApiClient.get('/files');
        },

        async get(id) {
            return ApiClient.get(`/files/${id}`);
        },

        async upload(files, encrypt, encryptionPassword, onProgress) {
            const formData = new FormData();
            for (const file of files) {
                formData.append('files', file);
            }
            formData.append('encrypt', encrypt ? 'true' : 'false');
            if (encrypt && encryptionPassword) {
                formData.append('encryptionPassword', encryptionPassword);
            }

            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                const token = AuthService._getAccessToken();

                xhr.upload.addEventListener('progress', (event) => {
                    if (event.lengthComputable && onProgress) {
                        const percent = Math.round((event.loaded / event.total) * 100);
                        onProgress(percent, `Uploading... ${percent}%`);
                    }
                });

                xhr.addEventListener('load', () => {
                    try {
                        const data = JSON.parse(xhr.responseText);
                        if (xhr.status === 401) {
                            ApiClient._forceLogout();
                            reject(new Error('Session expired'));
                            return;
                        }
                        if (xhr.status >= 400 || !data.success) {
                            reject(new Error(data.message || 'Upload failed'));
                            return;
                        }
                        resolve(data);
                    } catch (_) {
                        reject(new Error('Invalid server response'));
                    }
                });

                xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
                xhr.addEventListener('timeout', () => reject(new Error('Upload timed out')));

                xhr.open('POST', `${CONFIG.API_BASE}/files/upload`);
                if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                xhr.timeout = 120000;
                xhr.send(formData);
            });
        },

        async download(id, fileName) {
            const blob = await ApiClient.getBinary(`/files/${id}/download`);
            triggerBlobDownload(blob, fileName);
        },

        async decryptDownload(fileId, password, fileName) {
            const blob = await ApiClient.postBinary('/files/decrypt-download', { fileId, password });
            triggerBlobDownload(blob, fileName);
        },

        async delete(id) {
            return ApiClient.delete(`/files/${id}`);
        },
    };

    const Toast = {
        show(message, type = 'info', title = '') {
            const container = document.getElementById('toastContainer');
            if (!container) return;

            while (container.children.length >= 3) container.removeChild(container.firstChild);

            const icons = {
                success: '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>',
                error: '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>',
                info: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>',
            };

            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.setAttribute('role', 'alert');
            toast.setAttribute('aria-live', 'assertive');
            toast.innerHTML = `
                <div class="toast-icon-wrapper" aria-hidden="true">
                    <svg viewBox="0 0 24 24" class="toast-icon">${icons[type] || icons.info}</svg>
                </div>
                <div class="toast-content">
                    <span class="toast-title">${title || { success: 'Success', error: 'Error', info: 'Info' }[type]}</span>
                    <span class="toast-message">${message}</span>
                </div>
                <div class="toast-progress" aria-hidden="true"></div>`;

            container.appendChild(toast);
            const timer = setTimeout(() => this._remove(toast), 4000);
            toast.addEventListener('click', () => {
                clearTimeout(timer);
                this._remove(toast);
            });
        },

        _remove(toast) {
            toast.classList.add('removing');
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 400);
        },

        success(msg, title) { this.show(msg, 'success', title); },
        error(msg, title) { this.show(msg, 'error', title); },
        info(msg, title) { this.show(msg, 'info', title); },
    };

    const LocalActivity = {
        _key: () => `apexa_activity_${AuthService.getCurrentUser()?.id || 'anon'}`,

        push(type, detail) {
            try {
                const key = this._key();
                const list = JSON.parse(localStorage.getItem(key) || '[]');
                list.unshift({ type, detail, createdAt: new Date().toISOString() });
                localStorage.setItem(key, JSON.stringify(list.slice(0, 30)));
            } catch (_) {}
        },

        get() {
            try {
                return JSON.parse(localStorage.getItem(this._key()) || '[]');
            } catch (_) {
                return [];
            }
        },
    };

    window.ApexaApi = {
        ApiClient,
        AuthService,
        FileService,
        Toast,
        LocalActivity,
    };
    window._apexaShowToast = (message, type, title) => Toast.show(message, type, title);
})();
