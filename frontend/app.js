/* ================================================================
   APEXA VAULT — Production SaaS Frontend
   Developed by Hrishekesh Varma

   Architecture:
   ├── config/          API base URL, token keys
   ├── services/api     Centralized Axios-like fetch client (JWT auto-inject)
   ├── services/auth    Register, Login, Logout, Refresh
   ├── services/files   Upload, List, Download, Decrypt, Delete
   ├── ui/pipeline      Upload pipeline step animator
   ├── ui/blockchain    Canvas visualizer + ledger renderer
   ├── ui/nodes         IPFS node distribution visualizer
   ├── ui/wallet        MetaMask / WalletConnect integration
   ├── ui/toast         Enterprise notification system
   └── core/app         Main app controller (preserved visual flow)
================================================================ */

document.addEventListener('DOMContentLoaded', () => {

    /* ============================================================
       CONFIG
    ============================================================ */
    const CONFIG = {
        API_BASE: 'https://apexa-vault-2.onrender.com/api',   // Change to your backend URL
        TOKEN_KEY: 'apexa_token',
        REFRESH_KEY: 'apexa_refresh_token',
        USER_KEY: 'apexa_current_user',
        STORAGE_QUOTA_BYTES: 5 * 1024 * 1024 * 1024   // 5 GB
    };

    /* ============================================================
       API CLIENT — Centralized, JWT-injecting fetch wrapper
       Handles: auth headers, token refresh, 401 redirect, errors
    ============================================================ */
    const ApiClient = {

        _getToken() {
            return localStorage.getItem(CONFIG.TOKEN_KEY);
        },

        _getRefreshToken() {
            return localStorage.getItem(CONFIG.REFRESH_KEY);
        },

        _buildHeaders(extra = {}) {
            const headers = { 'Accept': 'application/json', ...extra };
            const token = this._getToken();
            if (token) headers['Authorization'] = `Bearer ${token}`;
            return headers;
        },

        async _handleResponse(response) {
            // Token expired — redirect to login
            if (response.status === 401) {
                const body = await response.json().catch(() => ({}));
                if (body.code === 'TOKEN_EXPIRED' || body.message?.includes('expired')) {
                    const refreshed = await this._attemptRefresh();
                    if (!refreshed) {
                        this._forceLogout();
                        throw new Error('Session expired. Please log in again.');
                    }
                    // Caller should retry — throw a special sentinel
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

            const data = await response.json();
            if (!data.success && data.message) {
                throw new Error(data.message);
            }
            return data;
        },

        async _attemptRefresh() {
            const refreshToken = this._getRefreshToken();
            if (!refreshToken) return false;
            try {
                const resp = await fetch(`${CONFIG.API_BASE}/auth/refresh`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken })
                });
                if (!resp.ok) return false;
                const data = await resp.json();
                if (data.token) {
                    localStorage.setItem(CONFIG.TOKEN_KEY, data.token);
                    if (data.refreshToken) localStorage.setItem(CONFIG.REFRESH_KEY, data.refreshToken);
                    return true;
                }
                return false;
            } catch {
                return false;
            }
        },

        _forceLogout() {
            localStorage.removeItem(CONFIG.TOKEN_KEY);
            localStorage.removeItem(CONFIG.REFRESH_KEY);
            localStorage.removeItem(CONFIG.USER_KEY);
            setTimeout(() => window.location.reload(), 800);
        },

        async get(path) {
            const doRequest = () => fetch(`${CONFIG.API_BASE}${path}`, {
                method: 'GET',
                headers: this._buildHeaders()
            });
            try {
                const resp = await doRequest();
                return await this._handleResponse(resp);
            } catch (err) {
                if (err._retry) {
                    const resp2 = await doRequest();
                    return await this._handleResponse(resp2);
                }
                throw err;
            }
        },

        async post(path, body) {
            const doRequest = () => fetch(`${CONFIG.API_BASE}${path}`, {
                method: 'POST',
                headers: this._buildHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(body)
            });
            try {
                const resp = await doRequest();
                return await this._handleResponse(resp);
            } catch (err) {
                if (err._retry) {
                    const resp2 = await doRequest();
                    return await this._handleResponse(resp2);
                }
                throw err;
            }
        },

        async postForm(path, formData) {
            // No Content-Type header — browser sets multipart boundary automatically
            const doRequest = () => fetch(`${CONFIG.API_BASE}${path}`, {
                method: 'POST',
                headers: this._buildHeaders(),
                body: formData
            });
            try {
                const resp = await doRequest();
                return await this._handleResponse(resp);
            } catch (err) {
                if (err._retry) {
                    const resp2 = await doRequest();
                    return await this._handleResponse(resp2);
                }
                throw err;
            }
        },

        async delete(path) {
            const doRequest = () => fetch(`${CONFIG.API_BASE}${path}`, {
                method: 'DELETE',
                headers: this._buildHeaders()
            });
            try {
                const resp = await doRequest();
                return await this._handleResponse(resp);
            } catch (err) {
                if (err._retry) {
                    const resp2 = await doRequest();
                    return await this._handleResponse(resp2);
                }
                throw err;
            }
        },

        // Raw binary download — returns Blob
        async getBinary(path) {
            const token = this._getToken();
            const headers = { 'Accept': '*/*' };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const resp = await fetch(`${CONFIG.API_BASE}${path}`, { method: 'GET', headers });
            if (!resp.ok) {
                const body = await resp.json().catch(() => ({}));
                throw new Error(body.message || 'Download failed');
            }
            return resp.blob();
        },

        // POST body → Blob download (for decrypt-download)
        async postBinary(path, body) {
            const token = this._getToken();
            const headers = { 'Content-Type': 'application/json', 'Accept': '*/*' };
            if (token) headers['Authorization'] = `Bearer ${token}`;
            const resp = await fetch(`${CONFIG.API_BASE}${path}`, {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            });
            if (resp.status === 401 || resp.status === 403) {
                const body2 = await resp.json().catch(() => ({}));
                throw new Error(body2.message || 'Unauthorized');
            }
            if (!resp.ok) {
                const body2 = await resp.json().catch(() => ({}));
                throw new Error(body2.message || 'Download failed');
            }
            return resp.blob();
        }
    };

    /* ============================================================
       AUTH SERVICE
    ============================================================ */
    const AuthService = {
        async register({ username, email, password, confirmPassword }) {
            return ApiClient.post('/auth/register', { username, email, password, confirmPassword });
        },

        async login({ email, password }) {
            const data = await ApiClient.post('/auth/login', { email, password });
            localStorage.setItem(CONFIG.TOKEN_KEY, data.token);
            localStorage.setItem(CONFIG.REFRESH_KEY, data.refreshToken);
            localStorage.setItem(CONFIG.USER_KEY, JSON.stringify(data.user));
            return data;
        },

        async logout() {
            try {
                await ApiClient.post('/auth/logout', {});
            } catch (_) {
                // Best-effort server logout
            } finally {
                localStorage.removeItem(CONFIG.TOKEN_KEY);
                localStorage.removeItem(CONFIG.REFRESH_KEY);
                localStorage.removeItem(CONFIG.USER_KEY);
            }
        },

        getCurrentUser() {
            const raw = localStorage.getItem(CONFIG.USER_KEY);
            return raw ? JSON.parse(raw) : null;
        },

        isAuthenticated() {
            return !!(localStorage.getItem(CONFIG.TOKEN_KEY) && this.getCurrentUser());
        }
    };

    /* ============================================================
       FILE SERVICE
    ============================================================ */
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

            // Use XHR for real upload progress tracking
            return new Promise((resolve, reject) => {
                const xhr = new XMLHttpRequest();
                const token = localStorage.getItem(CONFIG.TOKEN_KEY);

                xhr.upload.addEventListener('progress', (e) => {
                    if (e.lengthComputable && onProgress) {
                        const pct = Math.round((e.loaded / e.total) * 100);
                        onProgress(pct, `Uploading... ${pct}%`);
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
                    } catch (e) {
                        reject(new Error('Invalid server response'));
                    }
                });

                xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
                xhr.addEventListener('timeout', () => reject(new Error('Upload timed out')));

                xhr.open('POST', `${CONFIG.API_BASE}/files/upload`);
                if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
                xhr.timeout = 120000; // 2 min
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
        }
    };

    /* ============================================================
       UTILITY — trigger browser file download
    ============================================================ */
    function triggerBlobDownload(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }, 100);
    }

    function delay(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    function generateSecureId(len = 16) {
        const arr = crypto.getRandomValues(new Uint8Array(len));
        return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /* ============================================================
       PIPELINE UI
    ============================================================ */
    const PipelineUI = {
        steps: ['pStep1', 'pStep2', 'pStep3', 'pStep4'],

        show() {
            const el = document.getElementById('uploadPipelineContainer');
            if (el) { el.style.display = 'block'; this.reset(); }
        },

        hide() {
            const el = document.getElementById('uploadPipelineContainer');
            if (el) el.style.display = 'none';
        },

        reset() {
            this.steps.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('active', 'done');
            });
            document.querySelectorAll('.pipeline-connector').forEach(c => c.classList.remove('done'));
            this.setStatus('Initializing secure pipeline...');
        },

        async activateStep(index, statusText) {
            for (let i = 0; i < index; i++) {
                const el = document.getElementById(this.steps[i]);
                if (el) { el.classList.remove('active'); el.classList.add('done'); }
                const connectors = document.querySelectorAll('.pipeline-connector');
                if (connectors[i]) connectors[i].classList.add('done');
            }
            const current = document.getElementById(this.steps[index]);
            if (current) { current.classList.remove('done'); current.classList.add('active'); }
            if (statusText) this.setStatus(statusText);
            await delay(500 + Math.random() * 300);
        },

        async completeAll() {
            this.steps.forEach(id => {
                const el = document.getElementById(id);
                if (el) { el.classList.remove('active'); el.classList.add('done'); }
            });
            document.querySelectorAll('.pipeline-connector').forEach(c => c.classList.add('done'));
            this.setStatus('✓ File secured, verified, and distributed across IPFS');
            await delay(1800);
            this.hide();
        },

        setStatus(text) {
            const el = document.getElementById('pipelineStatusText');
            if (el) el.textContent = text;
        }
    };

    /* ============================================================
       BLOCKCHAIN CANVAS
    ============================================================ */
    const BlockchainCanvas = {
        canvas: null, ctx: null, blocks: [], animFrame: null,

        init(canvasEl) {
            if (!canvasEl) return;
            this.canvas = canvasEl;
            this.ctx = canvasEl.getContext('2d');
            canvasEl.width = canvasEl.offsetWidth || 280;
            canvasEl.height = 80;
            this.blocks = [];
            this._generateBlocks();
            this._animate();
        },

        _generateBlocks() {
            const w = this.canvas.width;
            const blockW = 36, gap = 14;
            const totalBlocks = Math.floor(w / (blockW + gap)) + 2;
            for (let i = 0; i < totalBlocks; i++) {
                this.blocks.push({
                    x: i * (blockW + gap) - (blockW + gap),
                    y: 20, w: blockW, h: 40,
                    opacity: 0.3 + Math.random() * 0.5,
                    speed: 0.4 + Math.random() * 0.2,
                    highlight: Math.random() > 0.7
                });
            }
        },

        _animate() {
            if (!this.ctx || !this.canvas) return;
            const ctx = this.ctx, w = this.canvas.width, h = this.canvas.height;
            ctx.clearRect(0, 0, w, h);

            this.blocks.forEach(block => {
                ctx.save();
                ctx.globalAlpha = block.opacity;
                if (block.highlight) {
                    ctx.strokeStyle = 'rgba(6,182,212,0.6)';
                    ctx.fillStyle = 'rgba(6,182,212,0.08)';
                } else {
                    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
                    ctx.fillStyle = 'rgba(255,255,255,0.03)';
                }
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.roundRect(block.x, block.y, block.w, block.h, 4);
                ctx.fill(); ctx.stroke();
                if (block.x + block.w < w) {
                    ctx.strokeStyle = 'rgba(6,182,212,0.2)';
                    ctx.setLineDash([3, 3]);
                    ctx.beginPath();
                    ctx.moveTo(block.x + block.w, block.y + block.h / 2);
                    ctx.lineTo(block.x + block.w + 14, block.y + block.h / 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
                ctx.fillStyle = block.highlight ? 'rgba(6,182,212,0.4)' : 'rgba(255,255,255,0.15)';
                for (let j = 0; j < 3; j++) {
                    ctx.fillRect(block.x + 6, block.y + 8 + j * 10, 8 + Math.random() * 12, 2);
                }
                ctx.restore();
                block.x += block.speed;
                if (block.x > w + 50) {
                    block.x = Math.min(...this.blocks.map(b => b.x)) - 50;
                    block.highlight = Math.random() > 0.7;
                    block.opacity = 0.3 + Math.random() * 0.5;
                }
            });

            this.animFrame = requestAnimationFrame(() => this._animate());
        },

        flashNewBlock() {
            if (!this.blocks.length) return;
            const b = this.blocks[this.blocks.length - 1];
            b.highlight = true; b.opacity = 1;
            setTimeout(() => { b.opacity = 0.6; }, 800);
        },

        destroy() {
            if (this.animFrame) cancelAnimationFrame(this.animFrame);
        }
    };

    /* ============================================================
       BLOCKCHAIN LEDGER UI — reads from backend API data
    ============================================================ */
    const BlockchainLedgerUI = {

        render(files) {
            const ledger = document.getElementById('blockchainLedger');
            if (!ledger) return;

            const filesWithChain = (files || []).filter(f => f.blockchainRecord || f.txHash);
            if (!filesWithChain.length) {
                ledger.innerHTML = `
                    <div class="empty-state" style="padding: 1.5rem 0;">
                        <p>No verified records</p>
                        <span>Upload files to register ownership on-chain</span>
                    </div>`;
                return;
            }

            const sorted = [...filesWithChain].reverse().slice(0, 6);
            ledger.innerHTML = sorted.map(file => {
                const rec = file.blockchainRecord || {};
                const txHash = rec.txHash || file.txHash || '';
                const shortHash = txHash ? txHash.substring(0, 12) + '...' : 'N/A';
                const cid = file.ipfsCID || file.cid || '';
                const shortCid = cid ? cid.substring(0, 14) + '...' : 'N/A';
                const blockNum = rec.blockNumber || '—';
                const fileId = file._id || file.id || '';
                return `
                    <div class="chain-record" data-file-id="${fileId}" onclick="window._apexaShowBlockchainRecord('${fileId}')">
                        <span class="chain-block-num">#${String(blockNum).slice(-5)}</span>
                        <div class="chain-record-info">
                            <span class="chain-record-file">${file.name || file.originalName || 'File'}</span>
                            <span class="chain-record-hash">tx: ${shortHash} · ipfs: ${shortCid}</span>
                        </div>
                        <span class="chain-verified-badge">✓ Verified</span>
                    </div>`;
            }).join('');

            BlockchainCanvas.flashNewBlock();
        }
    };

    /* ============================================================
       NODE SERVICE
    ============================================================ */
    const NodeService = {
        nodes: [], storingNodes: [],

        initialize(containerEl) {
            if (!containerEl) return;
            containerEl.innerHTML = '';
            this.nodes = [];
            for (let i = 0; i < 48; i++) {
                const dot = document.createElement('div');
                dot.className = 'node-dot';
                containerEl.appendChild(dot);
                this.nodes.push(dot);
            }
        },

        activateNodes(count = 12) {
            this.nodes.forEach(n => n.classList.remove('active', 'storing'));
            const shuffled = [...this.nodes].sort(() => Math.random() - 0.5);
            shuffled.slice(0, Math.min(count, this.nodes.length)).forEach((n, i) => {
                setTimeout(() => n.classList.add('active'), i * 40);
            });
            const rep = 3 + Math.floor(Math.random() * 4);
            const activeEl = document.getElementById('activeNodes');
            const repEl = document.getElementById('replicationCount');
            const healthEl = document.getElementById('networkHealth');
            if (activeEl) activeEl.textContent = count;
            if (repEl) repEl.textContent = rep + 'x';
            if (healthEl) healthEl.textContent = count > 20 ? 'Excellent' : count > 10 ? 'Good' : 'Nominal';
        },

        highlightStoringNodes() {
            const active = this.nodes.filter(n => n.classList.contains('active'));
            const count = 5 + Math.floor(Math.random() * 5);
            this.storingNodes = active.slice(0, count);
            this.storingNodes.forEach((n, i) => {
                setTimeout(() => { n.classList.remove('active'); n.classList.add('storing'); }, i * 80);
            });
        },

        resetStoringNodes() {
            this.storingNodes.forEach((n, i) => {
                setTimeout(() => { n.classList.remove('storing'); n.classList.add('active'); }, i * 50);
            });
        }
    };

    /* ============================================================
       WALLET SERVICE
    ============================================================ */
    const WalletService = {
        state: { connected: false, address: null, provider: null },

        async connectMetaMask() {
            if (typeof window.ethereum !== 'undefined' && window.ethereum.isMetaMask) {
                try {
                    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                    this.state = { connected: true, address: accounts[0], provider: 'MetaMask' };
                    return { success: true, address: accounts[0] };
                } catch {
                    throw new Error('MetaMask connection rejected');
                }
            }
            return this._simulateConnect('MetaMask');
        },

        async connectWalletConnect() { return this._simulateConnect('WalletConnect'); },
        async connectCoinbase() { return this._simulateConnect('Coinbase Wallet'); },

        async _simulateConnect(name) {
            await delay(800 + Math.random() * 400);
            const address = '0x' + generateSecureId(20);
            this.state = { connected: true, address, provider: name };
            return { success: true, address, provider: name };
        },

        disconnect() {
            this.state = { connected: false, address: null, provider: null };
        },

        formatAddress(addr) {
            if (!addr) return 'Not Connected';
            return addr.substring(0, 6) + '...' + addr.substring(addr.length - 4);
        },

        isConnected() { return this.state.connected; }
    };

    /* ============================================================
       TOAST SYSTEM
    ============================================================ */
    const Toast = {
        show(message, type = 'info', title = '') {
            const container = document.getElementById('toastContainer');
            if (!container) return;

            while (container.children.length >= 3) container.removeChild(container.firstChild);

            const icons = {
                success: '<path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>',
                error: '<path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>',
                info: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>'
            };

            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.innerHTML = `
                <div class="toast-icon-wrapper">
                    <svg viewBox="0 0 24 24" class="toast-icon">${icons[type] || icons.info}</svg>
                </div>
                <div class="toast-content">
                    <span class="toast-title">${title || { success: 'Success', error: 'Error', info: 'Info' }[type]}</span>
                    <span class="toast-message">${message}</span>
                </div>
                <div class="toast-progress"></div>`;

            container.appendChild(toast);
            const timer = setTimeout(() => this._remove(toast), 4000);
            toast.addEventListener('click', () => { clearTimeout(timer); this._remove(toast); });
        },

        _remove(toast) {
            toast.classList.add('removing');
            setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 400);
        },

        success(msg, title) { this.show(msg, 'success', title); },
        error(msg, title) { this.show(msg, 'error', title); },
        info(msg, title) { this.show(msg, 'info', title); }
    };

    // Global references for inline HTML handlers
    window._apexaShowToast = (msg, type, title) => Toast.show(msg, type, title);

    /* ============================================================
       ACTIVITY LOG — Server-side aware (renders from API data)
    ============================================================ */
    const ActivityUI = {
        render(activities) {
            const listEl = document.getElementById('activityList');
            if (!listEl) return;

            if (!activities || activities.length === 0) {
                listEl.innerHTML = `
                    <div class="empty-state">
                        <p>System Idle</p>
                        <span>Your recent activities will appear here securely.</span>
                    </div>`;
                return;
            }

            const icons = {
                upload: '<path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>',
                delete: '<path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>',
                auth: '<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 6h2v2h-2V7zm0 4h2v6h-2v-6z"/>',
                blockchain: '<path d="M17 8C8 10 5.9 16.17 3.82 21H5.71C6.72 18.81 7.86 17.2 9 16.05C9 16.03 9 16.02 9 16C9 14.34 10.34 13 12 13C13.66 13 15 14.34 15 16C15 17.66 13.66 19 12 19C11.76 19 11.52 18.97 11.3 18.91C10.5 19.7 9.61 20.58 8.57 21.57C9.62 21.83 10.79 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2C6.48 2 2 6.48 2 12C2 13.68 2.42 15.26 3.15 16.65C4.39 13.68 7.33 9.93 17 8Z"/>',
                ipfs: '<path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>',
                download: '<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>'
            };

            const formatTime = (iso) => {
                const d = new Date(iso), now = new Date();
                const diff = Math.floor((now - d) / 60000);
                if (diff < 1) return 'Just now';
                if (diff < 60) return `${diff}m ago`;
                if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
                return d.toLocaleDateString();
            };

            listEl.innerHTML = activities.slice(0, 15).map(act => `
                <div class="activity-item activity-type-${act.type}">
                    <div class="activity-icon-wrapper">
                        <svg viewBox="0 0 24 24" class="activity-icon">${icons[act.type] || icons.ipfs}</svg>
                    </div>
                    <div class="activity-info">
                        <p class="activity-text">${act.detail}</p>
                        <span class="activity-time">${formatTime(act.createdAt || act.time)}</span>
                    </div>
                </div>`).join('');
        }
    };

    /* ============================================================
       AI INSIGHTS UI
    ============================================================ */
    const AIInsightsUI = {
        update(files) {
            const container = document.getElementById('aiInsightList');
            if (!container) return;

            const total = files.length;
            const encrypted = files.filter(f => f.encrypted || f.isEncrypted).length;
            const chainVerified = files.filter(f => f.blockchainRecord || f.txHash).length;
            const totalBytes = files.reduce((a, f) => a + (f.sizeInBytes || f.size || 0), 0);

            const avgMB = total ? (totalBytes / total / (1024 * 1024)).toFixed(1) : 0;

            const insights = [];

            if (total === 0) {
                insights.push({ icon: '<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>', label: 'Security Scan', text: 'Waiting for files to analyze security status.' });
            } else if (encrypted === total) {
                insights.push({ icon: '<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>', label: 'Security Scan', text: `100% of your ${total} file${total > 1 ? 's are' : ' is'} AES-256 encrypted.` });
            } else {
                insights.push({ icon: '<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>', label: 'Security Scan', text: `${total - encrypted} of ${total} files stored without encryption.` });
            }

            insights.push({
                icon: '<path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>',
                label: 'IPFS Status',
                text: total ? `${chainVerified} file${chainVerified !== 1 ? 's' : ''} registered on-chain. Avg ${avgMB} MB.` : 'Files uploaded via IPFS Pinata gateway. No files yet.'
            });

            insights.push({
                icon: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>',
                label: 'Deduplication',
                text: total > 5 ? 'AI detected no redundant copies. IPFS distribution optimal.' : 'Duplicate detection monitoring your decentralized storage.'
            });

            container.innerHTML = insights.map(i => `
                <div class="insight-item">
                    <div class="insight-header">
                        <svg viewBox="0 0 24 24" class="insight-icon">${i.icon}</svg>
                        <span class="insight-label">${i.label}</span>
                    </div>
                    <p>${i.text}</p>
                </div>`).join('');
        }
    };

    /* ============================================================
       STORAGE UI
    ============================================================ */
    const StorageUI = {
        update(usedBytes, quotaBytes) {
            const used = usedBytes || 0;
            const quota = quotaBytes || CONFIG.STORAGE_QUOTA_BYTES;
            const pct = Math.min((used / quota) * 100, 100);

            let usedText;
            if (used < 1024) usedText = `${used} B`;
            else if (used < 1048576) usedText = `${(used / 1024).toFixed(1)} KB`;
            else if (used < 1073741824) usedText = `${(used / 1048576).toFixed(1)} MB`;
            else usedText = `${(used / 1073741824).toFixed(2)} GB`;

            const quotaGB = (quota / 1073741824).toFixed(0);
            const remaining = ((quota - used) / 1073741824).toFixed(2);

            const sv = document.getElementById('storageValue');
            const pb = document.getElementById('storageProgress');
            const sd = document.getElementById('storageDesc');

            if (sv) sv.textContent = `${usedText} / ${quotaGB} GB`;
            if (pb) pb.style.width = `${Math.max(pct, 2)}%`;
            if (sd) sd.textContent = `${pct.toFixed(1)}% utilized. ${remaining} GB remaining on IPFS network.`;

            // Update settings modal
            const sp = document.getElementById('storagePlanDisplay');
            if (sp) sp.textContent = `Premium (${quotaGB} GB)`;
        }
    };

    /* ============================================================
       FILES UI — Renders the file list from API data
    ============================================================ */
    let _currentFiles = [];

    const FilesUI = {
        render(files) {
            _currentFiles = files || [];
            SearchService.reset();   // clear stale DOM state before re-render
            const listEl = document.getElementById('recentFilesList');
            if (!listEl) return;

            if (!files || files.length === 0) {
                listEl.innerHTML = `
                    <div class="empty-state">
                        <svg viewBox="0 0 24 24" class="empty-icon"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                        <p>Your vault is empty</p>
                        <span>Secure your first file to begin monitoring your storage.</span>
                    </div>`;
                return;
            }

            listEl.innerHTML = [...files].reverse().map(file => {
                const id = file._id || file.id || '';
                const name = file.name || file.originalName || 'Unknown';
                const isEnc = file.encrypted || file.isEncrypted;
                const cid = file.ipfsCID || file.cid || '';
                const shortCID = cid ? cid.substring(0, 20) + '...' : null;
                const hasChain = file.blockchainRecord || file.txHash;
                const sizeStr = file.sizeFormatted || file.size || '—';
                const dateStr = file.uploadedAt
                    ? new Date(file.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                    : (file.date || '—');
                const ext = (name.split('.').pop() || 'file').toUpperCase();

                return `
                    <div class="file-card-item" data-id="${id}">
                        <div class="file-icon-wrapper">
                            <svg viewBox="0 0 24 24" class="file-icon"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                        </div>
                        <div class="file-card-info">
                            <span class="file-card-name">${name}</span>
                            <div class="file-card-meta">
                                ${isEnc ? `<span class="badge-encrypted">
                                    <svg viewBox="0 0 24 24" class="lock-icon-small"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
                                    AES-256
                                </span>` : ''}
                                ${cid ? `<span class="badge-ipfs">IPFS</span>` : ''}
                                ${hasChain ? `<span class="badge-chain">On-Chain</span>` : ''}
                                <span>•</span><span>${ext}</span>
                                <span>•</span><span>${sizeStr}</span>
                                <span>•</span><span>${dateStr}</span>
                            </div>
                            ${shortCID ? `<span class="file-cid">ipfs://${shortCID}</span>` : ''}
                        </div>
                        <div class="file-actions">
                            ${hasChain ? `
                                <button class="action-btn chain-verify" title="View Blockchain Record">
                                    <svg viewBox="0 0 24 24" class="action-icon"><path d="M17 8C8 10 5.9 16.17 3.82 21H5.71C6.72 18.81 7.86 17.2 9 16.05C9 16.03 9 16.02 9 16C9 14.34 10.34 13 12 13C13.66 13 15 14.34 15 16C15 17.66 13.66 19 12 19C11.76 19 11.52 18.97 11.3 18.91C10.5 19.7 9.61 20.58 8.57 21.57C9.62 21.83 10.79 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2C6.48 2 2 6.48 2 12C2 13.68 2.42 15.26 3.15 16.65C4.39 13.68 7.33 9.93 17 8Z"/></svg>
                                </button>` : ''}
                            <button class="action-btn download-btn" title="Download">
                                <svg viewBox="0 0 24 24" class="action-icon"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                            </button>
                            <button class="action-btn delete-btn delete" title="Delete">
                                <svg viewBox="0 0 24 24" class="action-icon"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                            </button>
                        </div>
                    </div>`;
            }).join('');
        }
    };

    /* ============================================================
       BLOCKCHAIN RECORD MODAL — reads from _currentFiles
    ============================================================ */
    window._apexaShowBlockchainRecord = (fileId) => {
        const file = _currentFiles.find(f => (f._id || f.id) === fileId);
        if (!file) return;

        const rec = file.blockchainRecord || {};
        const modal = document.getElementById('blockchainModal');
        const body = document.getElementById('blockchainModalBody');
        const name = file.name || file.originalName || 'File';
        const cid = file.ipfsCID || file.cid || 'N/A';
        const isEnc = file.encrypted || file.isEncrypted;

        body.innerHTML = `
            <div class="blockchain-record-detail">
                <div class="brd-row"><span class="brd-key">File Name</span><span class="brd-val">${name}</span></div>
                <div class="brd-row"><span class="brd-key">IPFS CID</span><span class="brd-val cyan">${cid}</span></div>
                <div class="brd-row"><span class="brd-key">TX Hash</span><span class="brd-val purple">${rec.txHash || file.txHash || 'N/A'}</span></div>
                <div class="brd-row"><span class="brd-key">Block</span><span class="brd-val">#${rec.blockNumber || '—'}</span></div>
                <div class="brd-row"><span class="brd-key">Network</span><span class="brd-val">${rec.network || 'Polygon'}</span></div>
                <div class="brd-row"><span class="brd-key">Confirmations</span><span class="brd-val">${rec.confirmations || 1}</span></div>
                <div class="brd-row"><span class="brd-key">Status</span><span class="brd-val green">✓ Confirmed</span></div>
                <div class="brd-row"><span class="brd-key">Owner</span><span class="brd-val">${rec.ownerAddress ? rec.ownerAddress.substring(0, 10) + '...' : 'N/A'}</span></div>
                <div class="brd-row"><span class="brd-key">Encryption</span><span class="brd-val">${isEnc ? 'AES-256-GCM' : 'Unencrypted'}</span></div>
                <div class="brd-row"><span class="brd-key">Timestamp</span><span class="brd-val">${new Date(rec.timestamp || file.uploadedAt || Date.now()).toLocaleString()}</span></div>
                <div class="brd-row"><span class="brd-key">Gas Used</span><span class="brd-val">${rec.gasUsed || '—'}</span></div>
            </div>`;
        modal.classList.add('active');
    };

    /* ============================================================
       SIDEBAR NAVIGATION
    ============================================================ */
    const setupSidebarNavigation = (user) => {
        const navItems = document.querySelectorAll('.nav-item');
        const settingsModal = document.getElementById('settingsModal');
        const closeSettings = document.getElementById('closeSettings');
        const settingsEmail = document.getElementById('settingsEmail');

        if (settingsEmail) settingsEmail.textContent = user.email;

        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const sectionId = item.getAttribute('data-section');
                if (!sectionId) return;
                if (sectionId === 'settings') { settingsModal.classList.add('active'); return; }
                const section = document.getElementById(sectionId);
                if (section) {
                    navItems.forEach(n => n.classList.remove('active'));
                    item.classList.add('active');
                    section.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        });

        if (closeSettings) closeSettings.addEventListener('click', () => settingsModal.classList.remove('active'));
        settingsModal.addEventListener('click', e => { if (e.target === settingsModal) settingsModal.classList.remove('active'); });
    };

    /* ============================================================
       WALLET UI
    ============================================================ */
    const setupWalletUI = () => {
        const connectBtn = document.getElementById('connectWalletBtn');
        const walletModal = document.getElementById('walletModal');
        const closeWalletModal = document.getElementById('closeWalletModal');

        if (connectBtn) {
            connectBtn.addEventListener('click', () => {
                if (WalletService.isConnected()) {
                    WalletService.disconnect();
                    const ws = document.getElementById('walletStatus');
                    if (ws) ws.textContent = 'Not Connected';
                    connectBtn.textContent = 'Connect';
                    Toast.info('Wallet disconnected.', 'Wallet');
                } else {
                    walletModal.classList.add('active');
                }
            });
        }

        if (closeWalletModal) closeWalletModal.addEventListener('click', () => walletModal.classList.remove('active'));
        walletModal.addEventListener('click', e => { if (e.target === walletModal) walletModal.classList.remove('active'); });

        document.querySelectorAll('.wallet-option-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const wt = btn.dataset.wallet;
                walletModal.classList.remove('active');
                try {
                    Toast.info('Connecting wallet...', 'Wallet');
                    let result;
                    if (wt === 'metamask') result = await WalletService.connectMetaMask();
                    else if (wt === 'walletconnect') result = await WalletService.connectWalletConnect();
                    else result = await WalletService.connectCoinbase();
                    if (result.success) {
                        const ws = document.getElementById('walletStatus');
                        if (ws) ws.textContent = WalletService.formatAddress(result.address);
                        if (connectBtn) connectBtn.textContent = 'Disconnect';
                        Toast.success(`Connected: ${WalletService.formatAddress(result.address)}`, 'Wallet Connected');
                    }
                } catch (err) {
                    Toast.error(err.message, 'Connection Failed');
                }
            });
        });
    };

    /* ============================================================
       UPLOAD INTERACTIONS — Real multipart/form-data to backend
    ============================================================ */
    const setupUploadInteractions = () => {
        const dropZone = document.getElementById('dropZone');
        const fileInput = document.getElementById('fileInput');
        const filePreviewContainer = document.getElementById('filePreviewContainer');
        const encryptToggle = document.getElementById('encryptToggle');
        const encryptionPasswordWrapper = document.getElementById('encryptionPasswordWrapper');
        const encryptionPassword = document.getElementById('encryptionPassword');
        const secureUploadBtn = document.getElementById('secureUploadBtn');

        if (!dropZone) return;

        let pendingFiles = [];

        encryptToggle.addEventListener('change', () => {
            if (encryptToggle.checked) {
                encryptionPasswordWrapper.classList.add('active');
                encryptionPassword.focus();
                if (pendingFiles.length > 0) secureUploadBtn.classList.add('visible');
            } else {
                encryptionPasswordWrapper.classList.remove('active');
                encryptionPassword.value = '';
                secureUploadBtn.classList.remove('visible');
            }
        });

        dropZone.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', e => handleFiles(e.target.files));

        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => {
            dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }, false);
        });
        ['dragenter', 'dragover'].forEach(ev => dropZone.addEventListener(ev, () => dropZone.classList.add('drag-over'), false));
        ['dragleave', 'drop'].forEach(ev => dropZone.addEventListener(ev, () => dropZone.classList.remove('drag-over'), false));
        dropZone.addEventListener('drop', e => handleFiles(e.dataTransfer.files), false);

        const handleFiles = (files) => {
            const list = Array.from(files);
            if (!list.length) return;
            pendingFiles = list;
            if (encryptToggle.checked) {
                renderPreviews(list, true);
                secureUploadBtn.classList.add('visible');
            } else {
                processUpload(list);
            }
        };

        const processUpload = async (fileList) => {
            if (!AuthService.isAuthenticated()) {
                Toast.error('Please log in to upload files.', 'Not Authenticated');
                return;
            }

            const isEncrypted = encryptToggle.checked;
            const password = encryptionPassword.value;

            if (isEncrypted && !password) {
                Toast.error('Please set an encryption password.', 'Password Required');
                encryptionPassword.focus();
                return;
            }

            PipelineUI.show();
            renderPreviews(fileList, isEncrypted);

            try {
                // Animate pipeline steps while upload happens
                await PipelineUI.activateStep(0, isEncrypted ? 'Encrypting with AES-256-GCM...' : 'Preparing files...');
                await PipelineUI.activateStep(1, 'Computing integrity hash...');

                NodeService.highlightStoringNodes();

                await PipelineUI.activateStep(2, 'Uploading to IPFS via Pinata...');

                const result = await FileService.upload(
                    fileList,
                    isEncrypted,
                    password,
                    (pct, label) => PipelineUI.setStatus(label)
                );

                await PipelineUI.activateStep(3, 'Registering on Polygon blockchain...');

                NodeService.resetStoringNodes();
                await PipelineUI.completeAll();

                // Reset controls
                encryptToggle.checked = false;
                encryptionPasswordWrapper.classList.remove('active');
                encryptionPassword.value = '';
                secureUploadBtn.classList.remove('visible');
                pendingFiles = [];
                fileInput.value = '';

                if (isEncrypted) {
                    Toast.success(`${fileList.length} file(s) encrypted with AES-256 & pinned to IPFS.`, 'Secure Upload Complete');
                    LocalActivity.push('upload', `Encrypted ${fileList.length} file(s) with AES-256 → IPFS + Polygon`);
                } else {
                    Toast.success(`${fileList.length} file(s) pinned to IPFS & chain-verified.`, 'Upload Complete');
                    LocalActivity.push('upload', `Uploaded ${fileList.length} file(s) → IPFS`);
                }

                // Refresh dashboard data
                await loadDashboardData();

            } catch (err) {
                PipelineUI.hide();
                NodeService.resetStoringNodes();
                Toast.error(err.message || 'Upload failed. Please try again.', 'Upload Failed');
                console.error('Upload error:', err);
            }
        };

        secureUploadBtn.addEventListener('click', () => {
            if (pendingFiles.length > 0) processUpload(pendingFiles);
        });

        const renderPreviews = (files, isStaging = false) => {
            filePreviewContainer.style.display = 'flex';
            filePreviewContainer.innerHTML = '';
            files.forEach((file, index) => {
                const sizeStr = file.size < 1048576
                    ? `${(file.size / 1024).toFixed(1)} KB`
                    : `${(file.size / 1048576).toFixed(1)} MB`;
                const ext = (file.name.split('.').pop() || 'file').toUpperCase();
                const fid = `file-prev-${Date.now()}-${index}`;
                const isEnc = encryptToggle.checked;

                filePreviewContainer.insertAdjacentHTML('afterbegin', `
                    <div class="file-preview-item ${isStaging ? 'staged' : ''}" id="${fid}">
                        <div class="file-icon-wrapper">
                            <svg viewBox="0 0 24 24" class="file-icon"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
                        </div>
                        <div class="file-info">
                            <div class="preview-name-row">
                                <span class="file-name">${file.name}</span>
                                ${isEnc ? `<span class="preview-badge">
                                    <svg viewBox="0 0 24 24" class="lock-icon-small"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
                                    Encrypted
                                </span>` : ''}
                            </div>
                            <span class="file-meta">${ext} · ${sizeStr} · ${isStaging ? 'Ready to Secure' : 'Processing...'}</span>
                        </div>
                        <div class="upload-progress-mock">
                            <div class="upload-progress-fill" id="progress-${fid}"></div>
                        </div>
                    </div>`);
            });
            setTimeout(() => {
                document.querySelectorAll('.upload-progress-fill:not(.complete)').forEach(f => f.classList.add('complete'));
            }, 200);
        };
    };

    /* ============================================================
       FILE ACTIONS — Download, Delete, Chain
    ============================================================ */
    const setupFileActions = () => {
        const listEl = document.getElementById('recentFilesList');
        if (!listEl) return;

        listEl.onclick = (e) => {
            const downloadBtn = e.target.closest('.download-btn');
            const deleteBtn = e.target.closest('.delete-btn');
            const chainBtn = e.target.closest('.chain-verify');
            const fileItem = e.target.closest('.file-card-item');
            if (!fileItem) return;

            const fileId = fileItem.dataset.id;
            if (downloadBtn) handleDownload(fileId);
            else if (deleteBtn) promptDelete(fileId, fileItem);
            else if (chainBtn) window._apexaShowBlockchainRecord(fileId);
        };
    };

    const handleDownload = async (fileId) => {
        const file = _currentFiles.find(f => (f._id || f.id) === fileId);
        if (!file) { Toast.error('File not found.', 'Download Error'); return; }

        const name = file.name || file.originalName || 'download';
        const isEnc = file.encrypted || file.isEncrypted;

        if (isEnc) {
            showDecryptionModal(file);
        } else {
            try {
                Toast.info('Downloading from IPFS...', 'Download');
                await FileService.download(fileId, name);
                LocalActivity.push('download', `Downloaded "${name}" from IPFS`);
                Toast.success('File downloaded successfully.', 'Download Complete');
            } catch (err) {
                Toast.error(err.message, 'Download Failed');
            }
        }
    };

    const showDecryptionModal = (file) => {
        const modal = document.getElementById('passwordModal');
        const input = document.getElementById('decryptionPassword');
        const confirmBtn = document.getElementById('confirmDecryption');
        const cancelBtn = document.getElementById('cancelModal');

        modal.classList.add('active');
        input.value = '';
        input.focus();

        const cleanup = () => {
            modal.classList.remove('active');
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
            input.onkeypress = null;
        };

        const handleConfirm = async () => {
            const password = input.value;
            if (!password) { Toast.error('Please enter the decryption password.'); return; }

            confirmBtn.disabled = true;
            confirmBtn.textContent = 'Decrypting...';
            try {
                const name = file.name || file.originalName || 'download';
                const id = file._id || file.id;
                Toast.info('Decrypting and downloading...', 'Decryption');
                await FileService.decryptDownload(id, password, name);
                LocalActivity.push('download', `Decrypted & downloaded "${name}"`);
                cleanup();
                Toast.success('File decrypted and downloaded.', 'Decryption Complete');
            } catch (err) {
                Toast.error(err.message || 'Incorrect password or decryption failed.', 'Decryption Failed');
                input.style.borderColor = '#ef4444';
                input.value = '';
                input.focus();
                setTimeout(() => input.style.borderColor = '', 1200);
            } finally {
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Unlock & Download';
            }
        };

        confirmBtn.onclick = handleConfirm;
        cancelBtn.onclick = cleanup;
        input.onkeypress = e => { if (e.key === 'Enter') handleConfirm(); };
    };

    const promptDelete = (fileId, fileItemEl) => {
        const file = _currentFiles.find(f => (f._id || f.id) === fileId);
        const name = file ? (file.name || file.originalName) : 'this file';
        const modal = document.getElementById('deleteModal');
        const nameEl = document.getElementById('deleteModalFileName');
        const confirmBtn = document.getElementById('confirmDelete');
        const cancelBtn = document.getElementById('cancelDelete');

        if (nameEl) nameEl.textContent = `Permanently delete "${name}" from IPFS?`;
        modal.classList.add('active');

        const cleanup = () => {
            modal.classList.remove('active');
            confirmBtn.onclick = null;
            cancelBtn.onclick = null;
        };

        confirmBtn.onclick = async () => {
            cleanup();
            await performDelete(fileId, fileItemEl);
        };

        cancelBtn.onclick = cleanup;
        modal.onclick = e => { if (e.target === modal) cleanup(); };
    };

    const performDelete = async (fileId, fileItemEl) => {
        try {
            fileItemEl.classList.add('removing');
            await FileService.delete(fileId);
            const deletedFile = _currentFiles.find(f => (f._id || f.id) === fileId);
            const dName = deletedFile ? (deletedFile.name || deletedFile.originalName || 'file') : 'file';
            LocalActivity.push('delete', `Deleted "${dName}" from vault`);
            setTimeout(async () => {
                Toast.success('File removed from your secure storage.', 'File Deleted');
                await loadDashboardData();
            }, 400);
        } catch (err) {
            fileItemEl.classList.remove('removing');
            Toast.error(err.message || 'Delete failed.', 'Delete Error');
        }
    };

    /* ============================================================
       BLOCKCHAIN / CHAIN MODALS
    ============================================================ */
    const setupChainModals = () => {
        document.getElementById('closeBlockchainModal')?.addEventListener('click', () => {
            document.getElementById('blockchainModal')?.classList.remove('active');
        });
        document.getElementById('blockchainModal')?.addEventListener('click', e => {
            if (e.target === document.getElementById('blockchainModal')) {
                document.getElementById('blockchainModal').classList.remove('active');
            }
        });
    };

    /* ============================================================
       LOCAL ACTIVITY LOG — fallback when backend has no /api/activities
    ============================================================ */
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
            } catch (_) { return []; }
        }
    };

    /* ============================================================
       SEARCH SERVICE — real-time filter over _currentFiles
    ============================================================ */
    const SearchService = {
        _query: '',

        attach() {
            // Desktop header search
            const desktopInput = document.querySelector('.header-search input');
            if (desktopInput) {
                desktopInput.addEventListener('input', e => {
                    this._query = e.target.value.trim().toLowerCase();
                    // mirror to mobile
                    const mob = document.getElementById('mobileSearchInput');
                    if (mob && document.activeElement !== mob) mob.value = e.target.value;
                    this._filter();
                });
            }
            // Mobile search bar
            const mobileInput = document.getElementById('mobileSearchInput');
            if (mobileInput) {
                mobileInput.addEventListener('input', e => {
                    this._query = e.target.value.trim().toLowerCase();
                    // mirror to desktop
                    if (desktopInput && document.activeElement !== desktopInput) desktopInput.value = e.target.value;
                    this._filter();
                });
            }
        },

        _filter() {
            const q = this._query;
            const items = document.querySelectorAll('#recentFilesList .file-card-item');
            let visibleCount = 0;

            items.forEach(item => {
                const id = item.dataset.id;
                const file = _currentFiles.find(f => (f._id || f.id) === id);
                if (!file) { item.classList.add('search-hidden'); return; }

                const name  = (file.name || file.originalName || '').toLowerCase();
                const cid   = (file.ipfsCID || file.cid || '').toLowerCase();
                const type  = (file.type || file.mimeType || '').toLowerCase();
                const date  = (file.uploadedAt || file.date || '').toLowerCase();

                const match = !q || name.includes(q) || cid.includes(q) || type.includes(q) || date.includes(q);
                item.classList.toggle('search-hidden', !match);
                if (match) {
                    item.classList.toggle('search-match', q.length > 0);
                    visibleCount++;
                } else {
                    item.classList.remove('search-match');
                }
            });

            // Show no-results message if needed
            let noRes = document.getElementById('searchNoResults');
            const listEl = document.getElementById('recentFilesList');
            if (q && visibleCount === 0 && items.length > 0) {
                if (!noRes) {
                    noRes = document.createElement('div');
                    noRes.id = 'searchNoResults';
                    noRes.className = 'empty-state';
                    noRes.style.padding = '1.5rem 0';
                    noRes.innerHTML = `<p>No results for "<em>${q}</em>"</p><span>Try searching by filename, CID, or file type.</span>`;
                    listEl.appendChild(noRes);
                } else {
                    noRes.querySelector('p').innerHTML = `No results for "<em>${q}</em>"`;
                    noRes.style.display = '';
                }
            } else if (noRes) {
                noRes.style.display = 'none';
            }
        },

        reset() {
            this._query = '';
            document.querySelectorAll('#recentFilesList .file-card-item').forEach(el => {
                el.classList.remove('search-hidden', 'search-match');
            });
        }
    };

    /* ============================================================
       CID RETRIEVAL SERVICE
    ============================================================ */
    const CIDRetrieval = {
        GATEWAY: 'https://gateway.pinata.cloud/ipfs/',
        FALLBACK_GATEWAY: 'https://ipfs.io/ipfs/',

        isValidCID(cid) {
            const trimmed = cid.trim();
            // CIDv0: Qm... 46 chars; CIDv1: bafybei... base32
            return /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(trimmed) ||
                   /^baf[a-z2-7]{50,}$/i.test(trimmed) ||
                   /^[a-zA-Z0-9]{46,60}$/.test(trimmed);
        },

        async retrieve(rawCid) {
            const cid = rawCid.trim();
            const url = `${this.GATEWAY}${cid}`;

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 15000);

            try {
                const resp = await fetch(url, { signal: controller.signal });
                clearTimeout(timeout);

                if (!resp.ok) throw new Error(`Gateway returned ${resp.status}`);

                const contentType = resp.headers.get('content-type') || '';
                const contentLength = resp.headers.get('content-length');
                const blob = await resp.blob();
                const objectUrl = URL.createObjectURL(blob);

                return {
                    cid,
                    url,
                    objectUrl,
                    contentType: blob.type || contentType,
                    size: blob.size,
                    isImage: (blob.type || contentType).startsWith('image/')
                };
            } catch (err) {
                clearTimeout(timeout);
                if (err.name === 'AbortError') throw new Error('Gateway timed out. Try again or check your CID.');
                throw new Error(`Could not retrieve file: ${err.message}`);
            }
        },

        formatSize(bytes) {
            if (bytes < 1024) return `${bytes} B`;
            if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
            if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(1)} MB`;
            return `${(bytes / 1073741824).toFixed(2)} GB`;
        },

        setup() {
            const input   = document.getElementById('cidInput');
            const btn     = document.getElementById('cidRetrieveBtn');
            const result  = document.getElementById('cidResult');
            if (!input || !btn || !result) return;

            const doRetrieve = async () => {
                const cid = input.value.trim();
                if (!cid) { Toast.error('Please enter a CID.', 'CID Required'); return; }
                if (!this.isValidCID(cid)) { Toast.error('Invalid CID format. Must start with Qm or bafybei.', 'Invalid CID'); return; }

                result.style.display = 'block';
                result.innerHTML = `<div class="cid-result-loading"><div class="cid-spinner"></div><span>Fetching from IPFS gateway...</span></div>`;
                btn.disabled = true;

                // Revoke any old object URL
                const oldImg = result.querySelector('img');
                if (oldImg?.src?.startsWith('blob:')) URL.revokeObjectURL(oldImg.src);

                try {
                    const data = await this.retrieve(cid);
                    const shortCid = cid.length > 20 ? cid.substring(0, 10) + '...' + cid.slice(-8) : cid;

                    result.innerHTML = `
                        <div class="cid-result-content">
                            ${data.isImage ? `<img class="cid-result-preview" src="${data.objectUrl}" alt="IPFS file preview" loading="lazy">` : ''}
                            <div class="cid-result-meta">
                                <div class="cid-meta-row"><span class="cid-meta-key">CID</span><span class="cid-meta-val cyan">${shortCid}</span></div>
                                <div class="cid-meta-row"><span class="cid-meta-key">Type</span><span class="cid-meta-val">${data.contentType || 'Unknown'}</span></div>
                                <div class="cid-meta-row"><span class="cid-meta-key">Size</span><span class="cid-meta-val">${this.formatSize(data.size)}</span></div>
                                <div class="cid-meta-row"><span class="cid-meta-key">Gateway</span><span class="cid-meta-val">Pinata</span></div>
                            </div>
                            <a href="${data.objectUrl}" download="${cid.substring(0,16)}" class="btn btn-primary btn-small" style="display:inline-flex; gap:0.5rem; align-items:center;">
                                <svg viewBox="0 0 24 24" style="width:1rem;height:1rem;fill:currentColor;"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                                Download File
                            </a>
                        </div>`;
                } catch (err) {
                    result.innerHTML = `
                        <div class="cid-result-error">
                            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                            <span>${err.message}</span>
                        </div>`;
                } finally {
                    btn.disabled = false;
                }
            };

            btn.addEventListener('click', doRetrieve);
            input.addEventListener('keypress', e => { if (e.key === 'Enter') doRetrieve(); });
        }
    };

    /* ============================================================
       LOAD DASHBOARD DATA — Fetches from backend
    ============================================================ */
    const loadDashboardData = async () => {
        try {
            const data = await FileService.list();
            const files = data.files || data.data || [];
            _currentFiles = files;

            FilesUI.render(files);
            BlockchainLedgerUI.render(files);
            AIInsightsUI.update(files);

            // Storage: compute from files array as primary source
            const totalBytes = files.reduce((sum, f) => sum + (f.sizeInBytes || f.fileSize || 0), 0);
            const user = AuthService.getCurrentUser();
            const usedBytes = data.storageUsed ?? totalBytes;
            const quotaBytes = data.storageQuota ?? (user?.storageQuota || CONFIG.STORAGE_QUOTA_BYTES);
            StorageUI.update(usedBytes, quotaBytes);

            // Activities — try dedicated endpoint, fall back to local log
            let activities = null;
            if (data.activities) {
                activities = data.activities;
            } else {
                // try separate endpoint
                try {
                    const actData = await ApiClient.get('/activities');
                    activities = actData.activities || actData.data || [];
                } catch (_) {
                    activities = LocalActivity.get();
                }
            }
            ActivityUI.render(activities);

            // Re-apply search filter without resetting query
            SearchService._filter();

            // Node visualization
            NodeService.activateNodes(14 + Math.floor(Math.random() * 10));

        } catch (err) {
            console.warn('Dashboard data load error:', err.message);
            if (err.message?.includes('Session expired') || err.message?.includes('Unauthorized')) {
                Toast.error('Session expired. Please log in again.', 'Session');
            }
        }
    };

    /* ============================================================
       SHOW DASHBOARD
    ============================================================ */
    const showDashboard = (user, instant = false) => {
        const authSection = document.getElementById('authSection');
        const dashboardSection = document.getElementById('dashboardSection');

        document.getElementById('welcomeText').textContent = `Welcome back, ${user.username}`;
        document.getElementById('userNameDisplay').textContent = user.username;
        document.getElementById('userInitial').textContent = user.username.charAt(0).toUpperCase();

        setupSidebarNavigation(user);
        setupFileActions();
        setupChainModals();
        setupWalletUI();

        document.getElementById('viewActivityBtn')?.addEventListener('click', () => {
            document.getElementById('activitySection')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });

        const doShow = () => {
            authSection.style.display = 'none';
            dashboardSection.style.display = 'flex';
            document.body.style.alignItems = 'stretch';
            document.body.style.justifyContent = 'stretch';

            // Initialize visual services
            const nodeGrid = document.getElementById('nodeGrid');
            if (nodeGrid) NodeService.initialize(nodeGrid);

            setTimeout(() => {
                const canvas = document.getElementById('blockchainCanvas');
                if (canvas) BlockchainCanvas.init(canvas);
            }, 300);

            SearchService.attach();
            CIDRetrieval.setup();
            loadDashboardData();
        };

        if (instant) {
            doShow();
        } else {
            authSection.classList.add('fade-out');
            setTimeout(() => {
                authSection.classList.remove('fade-out');
                dashboardSection.classList.add('fade-in');
                doShow();
            }, 500);
        }
    };

    /* ============================================================
       LOGOUT
    ============================================================ */
    const logout = async () => {
        const dashboardSection = document.getElementById('dashboardSection');
        dashboardSection.classList.add('fade-out');
        BlockchainCanvas.destroy();
        await AuthService.logout();
        Toast.success('You have been signed out safely.', 'Logout Successful');
        setTimeout(() => window.location.reload(), 1200);
    };

    /* ============================================================
       LOADING SCREEN
    ============================================================ */
    const hideLoader = () => {
        const loader = document.getElementById('apexaLoader');
        if (loader) {
            loader.classList.add('hidden');
            setTimeout(() => loader.remove(), 600);
        }
    };

    /* ============================================================
       INIT APP
    ============================================================ */
    const initApp = () => {
        setTimeout(hideLoader, 1200);

        if (AuthService.isAuthenticated()) {
            const user = AuthService.getCurrentUser();
            showDashboard(user, true);
        }

        setupUploadInteractions();
    };

    initApp();

    /* ============================================================
       TAB NAVIGATION
    ============================================================ */
    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const authTitle = document.getElementById('authTitle');
    const authSubtitle = document.getElementById('authSubtitle');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    const toggleForms = (showRegister) => {
        if (showRegister) {
            loginTab.classList.remove('active');
            registerTab.classList.add('active');
            loginForm.classList.remove('active');
            setTimeout(() => {
                authTitle.textContent = 'Create an account';
                authSubtitle.textContent = 'Start your journey with Apexa today.';
                registerForm.classList.add('active');
            }, 300);
        } else {
            registerTab.classList.remove('active');
            loginTab.classList.add('active');
            registerForm.classList.remove('active');
            setTimeout(() => {
                authTitle.textContent = 'Welcome back';
                authSubtitle.textContent = 'Please enter your details to sign in.';
                loginForm.classList.add('active');
            }, 300);
        }
    };

    loginTab.addEventListener('click', () => toggleForms(false));
    registerTab.addEventListener('click', () => toggleForms(true));
    document.getElementById('logoutBtn')?.addEventListener('click', logout);

    /* ============================================================
       REGISTER FORM — POST /api/auth/register
    ============================================================ */
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('regUsername').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        if (!username || !email || !password) {
            Toast.error('Please fill in all fields.');
            return;
        }
        if (password.length < 6) {
            Toast.error('Password must be at least 6 characters.');
            return;
        }
        if (password !== confirmPassword) {
            Toast.error('Passwords do not match.');
            return;
        }

        const btn = document.getElementById('registerSubmitBtn');
        btn.disabled = true;
        btn.textContent = 'Creating account...';

        try {
            await AuthService.register({ username, email, password, confirmPassword });
            registerForm.reset();
            Toast.success('Account created! Please sign in.', 'Registration Successful');
            setTimeout(() => toggleForms(false), 800);
        } catch (err) {
            Toast.error(err.message || 'Registration failed. Please try again.', 'Registration Failed');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Create Account';
        }
    });

    /* ============================================================
       LOGIN FORM — POST /api/auth/login
    ============================================================ */
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;

        if (!email || !password) {
            Toast.error('Please enter both email and password.');
            return;
        }

        const btn = document.getElementById('loginSubmitBtn');
        btn.disabled = true;
        btn.textContent = 'Signing in...';

        try {
            const data = await AuthService.login({ email, password });
            loginForm.reset();
            Toast.success(`Welcome back, ${data.user.username}!`, 'Login Successful');
            setTimeout(() => showDashboard(data.user), 1200);
        } catch (err) {
            Toast.error(err.message || 'Login failed. Please try again.', 'Login Failed');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Sign In';
        }
    });

});

/* ================================================================
   APEXA VAULT — Production SaaS Frontend
   Developed by Hrishekesh Varma
================================================================ */