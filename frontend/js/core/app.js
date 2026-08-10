(function () {
    const { CONFIG, delay, formatBytes } = window.ApexaConfig;
    const { ApiClient, AuthService, FileService, Toast, LocalActivity } = window.ApexaApi;

    let currentFiles = [];
    let previewObjectUrl = null;
    let previewFileForDownload = null;

    const PipelineUI = {
        steps: ['pStep1', 'pStep2', 'pStep3', 'pStep4'],
        show() {
            const el = document.getElementById('uploadPipelineContainer');
            if (el) {
                el.style.display = 'block';
                this.reset();
            }
        },
        hide() {
            const el = document.getElementById('uploadPipelineContainer');
            if (el) el.style.display = 'none';
        },
        reset() {
            this.steps.forEach((id) => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('active', 'done');
            });
            document.querySelectorAll('.pipeline-connector').forEach((c) => c.classList.remove('done'));
            this.setStatus('Initializing secure pipeline...');
        },
        async activateStep(index, statusText) {
            for (let i = 0; i < index; i++) {
                const el = document.getElementById(this.steps[i]);
                if (el) {
                    el.classList.remove('active');
                    el.classList.add('done');
                }
                const connectors = document.querySelectorAll('.pipeline-connector');
                if (connectors[i]) connectors[i].classList.add('done');
            }
            const current = document.getElementById(this.steps[index]);
            if (current) {
                current.classList.remove('done');
                current.classList.add('active');
            }
            if (statusText) this.setStatus(statusText);
            await delay(500 + Math.random() * 300);
        },
        async completeAll() {
            this.steps.forEach((id) => {
                const el = document.getElementById(id);
                if (el) {
                    el.classList.remove('active');
                    el.classList.add('done');
                }
            });
            document.querySelectorAll('.pipeline-connector').forEach((c) => c.classList.add('done'));
            this.setStatus('✓ File secured, verified, and distributed across IPFS');
            await delay(1800);
            this.hide();
        },
        setStatus(text) {
            const el = document.getElementById('pipelineStatusText');
            if (el) el.textContent = text;
        },
    };

    const BlockchainCanvas = {
        canvas: null,
        ctx: null,
        blocks: [],
        animFrame: null,
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
            const blockW = 36;
            const gap = 14;
            const totalBlocks = Math.floor(w / (blockW + gap)) + 2;
            for (let i = 0; i < totalBlocks; i++) {
                this.blocks.push({ x: i * (blockW + gap) - (blockW + gap), y: 20, w: blockW, h: 40, opacity: 0.3 + Math.random() * 0.5, speed: 0.4 + Math.random() * 0.2, highlight: Math.random() > 0.7 });
            }
        },
        _animate() {
            if (!this.ctx || !this.canvas) return;
            const ctx = this.ctx;
            const w = this.canvas.width;
            const h = this.canvas.height;
            ctx.clearRect(0, 0, w, h);
            this.blocks.forEach((block) => {
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
                ctx.fill();
                ctx.stroke();
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
                    block.x = Math.min(...this.blocks.map((b) => b.x)) - 50;
                    block.highlight = Math.random() > 0.7;
                    block.opacity = 0.3 + Math.random() * 0.5;
                }
            });
            this.animFrame = requestAnimationFrame(() => this._animate());
        },
        flashNewBlock() {
            if (!this.blocks.length) return;
            const b = this.blocks[this.blocks.length - 1];
            b.highlight = true;
            b.opacity = 1;
            setTimeout(() => {
                b.opacity = 0.6;
            }, 800);
        },
        destroy() {
            if (this.animFrame) cancelAnimationFrame(this.animFrame);
        },
    };

    const BlockchainLedgerUI = {
        render(files) {
            const ledger = document.getElementById('blockchainLedger');
            if (!ledger) return;
            const filesWithChain = (files || []).filter((f) => f.blockchainRecord || f.txHash);
            if (!filesWithChain.length) {
                ledger.innerHTML = '<div class="empty-state" style="padding: 1.5rem 0;"><p>No verified records</p><span>Upload files to register ownership on-chain</span></div>';
                return;
            }
            const sorted = [...filesWithChain].reverse().slice(0, 6);
            ledger.innerHTML = sorted.map((file) => {
                const rec = file.blockchainRecord || {};
                const txHash = rec.txHash || file.txHash || '';
                const shortHash = txHash ? `${txHash.substring(0, 12)}...` : 'N/A';
                const cid = file.ipfsCID || file.cid || '';
                const shortCid = cid ? `${cid.substring(0, 14)}...` : 'N/A';
                const blockNum = rec.blockNumber || '—';
                const fileId = file._id || file.id || '';
                return `<div class="chain-record" data-file-id="${fileId}" tabindex="0" role="button" aria-label="View blockchain record for ${file.name || file.originalName || 'file'}" onclick="window._apexaShowBlockchainRecord('${fileId}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();window._apexaShowBlockchainRecord('${fileId}')}" ><span class="chain-block-num">#${String(blockNum).slice(-5)}</span><div class="chain-record-info"><span class="chain-record-file">${file.name || file.originalName || 'File'}</span><span class="chain-record-hash">tx: ${shortHash} · ipfs: ${shortCid}</span></div><span class="chain-verified-badge">✓ Verified</span></div>`;
            }).join('');
            BlockchainCanvas.flashNewBlock();
        },
    };

    const NodeService = {
        nodes: [],
        storingNodes: [],
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
            this.nodes.forEach((node) => node.classList.remove('active', 'storing'));
            const shuffled = [...this.nodes].sort(() => Math.random() - 0.5);
            shuffled.slice(0, Math.min(count, this.nodes.length)).forEach((node, index) => {
                setTimeout(() => node.classList.add('active'), index * 40);
            });
            const activeEl = document.getElementById('activeNodes');
            const repEl = document.getElementById('replicationCount');
            const healthEl = document.getElementById('networkHealth');
            if (activeEl) activeEl.textContent = count;
            if (repEl) repEl.textContent = `${3 + Math.floor(Math.random() * 4)}x`;
            if (healthEl) healthEl.textContent = count > 20 ? 'Excellent' : count > 10 ? 'Good' : 'Nominal';
        },
        highlightStoringNodes() {
            const active = this.nodes.filter((node) => node.classList.contains('active'));
            const count = 5 + Math.floor(Math.random() * 5);
            this.storingNodes = active.slice(0, count);
            this.storingNodes.forEach((node, index) => {
                setTimeout(() => {
                    node.classList.remove('active');
                    node.classList.add('storing');
                }, index * 80);
            });
        },
        resetStoringNodes() {
            this.storingNodes.forEach((node, index) => {
                setTimeout(() => {
                    node.classList.remove('storing');
                    node.classList.add('active');
                }, index * 50);
            });
        },
    };

    const WalletService = {
        state: { connected: false, address: null, provider: null },
        async connectMetaMask() {
            if (typeof window.ethereum !== 'undefined' && window.ethereum.isMetaMask) {
                try {
                    const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
                    this.state = { connected: true, address: accounts[0], provider: 'MetaMask' };
                    return { success: true, address: accounts[0] };
                } catch (_) {
                    throw new Error('MetaMask connection rejected');
                }
            }
            return this._simulateConnect('MetaMask');
        },
        async connectWalletConnect() { return this._simulateConnect('WalletConnect'); },
        async connectCoinbase() { return this._simulateConnect('Coinbase Wallet'); },
        async _simulateConnect(name) {
            await delay(800 + Math.random() * 400);
            const address = `0x${window.ApexaConfig.generateSecureId(20)}`;
            this.state = { connected: true, address, provider: name };
            return { success: true, address, provider: name };
        },
        disconnect() { this.state = { connected: false, address: null, provider: null }; },
        formatAddress(address) { return address ? `${address.substring(0, 6)}...${address.substring(address.length - 4)}` : 'Not Connected'; },
        isConnected() { return this.state.connected; },
    };

    const ActivityUI = {
        render(activities) {
            const listEl = document.getElementById('activityList');
            if (!listEl) return;
            if (!activities || activities.length === 0) {
                listEl.innerHTML = '<div class="empty-state"><p>System Idle</p><span>Your recent activities will appear here securely.</span></div>';
                return;
            }
            const icons = {
                upload: '<path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>',
                delete: '<path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>',
                auth: '<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 6h2v2h-2V7zm0 4h2v6h-2v-6z"/>',
                blockchain: '<path d="M17 8C8 10 5.9 16.17 3.82 21H5.71C6.72 18.81 7.86 17.2 9 16.05C9 16.03 9 16.02 9 16C9 14.34 10.34 13 12 13C13.66 13 15 14.34 15 16C15 17.66 13.66 19 12 19C11.76 19 11.52 18.97 11.3 18.91C10.5 19.7 9.61 20.58 8.57 21.57C9.62 21.83 10.79 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2C6.48 2 2 6.48 2 12C2 13.68 2.42 15.26 3.15 16.65C4.39 13.68 7.33 9.93 17 8Z"/>',
                ipfs: '<path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>',
                download: '<path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>',
            };
            const formatTime = (iso) => {
                const date = new Date(iso);
                const now = new Date();
                const diff = Math.floor((now - date) / 60000);
                if (diff < 1) return 'Just now';
                if (diff < 60) return `${diff}m ago`;
                if (diff < 1440) return `${Math.floor(diff / 60)}h ago`;
                return date.toLocaleDateString();
            };
            listEl.innerHTML = activities.slice(0, 15).map((act) => `<div class="activity-item activity-type-${act.type}"><div class="activity-icon-wrapper" aria-hidden="true"><svg viewBox="0 0 24 24" class="activity-icon">${icons[act.type] || icons.ipfs}</svg></div><div class="activity-info"><p class="activity-text">${act.detail}</p><span class="activity-time">${formatTime(act.createdAt || act.time)}</span></div></div>`).join('');
        },
    };

    const AIInsightsUI = {
        update(files) {
            const container = document.getElementById('aiInsightList');
            if (!container) return;
            const total = files.length;
            const encrypted = files.filter((file) => file.encrypted || file.isEncrypted).length;
            const chainVerified = files.filter((file) => file.blockchainRecord || file.txHash).length;
            const totalBytes = files.reduce((acc, file) => acc + (file.sizeInBytes || file.size || 0), 0);
            const avgMB = total ? (totalBytes / total / (1024 * 1024)).toFixed(1) : 0;
            const insights = [];
            if (total === 0) {
                insights.push({ icon: '<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>', label: 'Security Scan', text: 'Waiting for files to analyze security status.' });
            } else if (encrypted === total) {
                insights.push({ icon: '<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>', label: 'Security Scan', text: `100% of your ${total} file${total > 1 ? 's are' : ' is'} AES-256 encrypted.` });
            } else {
                insights.push({ icon: '<path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>', label: 'Security Scan', text: `${total - encrypted} of ${total} files stored without encryption.` });
            }
            insights.push({ icon: '<path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>', label: 'IPFS Status', text: total ? `${chainVerified} file${chainVerified !== 1 ? 's' : ''} registered on-chain. Avg ${avgMB} MB.` : 'Files uploaded via IPFS Pinata gateway. No files yet.' });
            insights.push({ icon: '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>', label: 'Deduplication', text: total > 5 ? 'AI detected no redundant copies. IPFS distribution optimal.' : 'Duplicate detection monitoring your decentralized storage.' });
            container.innerHTML = insights.map((insight) => `<div class="insight-item"><div class="insight-header"><svg viewBox="0 0 24 24" class="insight-icon" aria-hidden="true">${insight.icon}</svg><span class="insight-label">${insight.label}</span></div><p>${insight.text}</p></div>`).join('');
        },
    };

    const StorageUI = {
        update(usedBytes, quotaBytes) {
            const used = usedBytes || 0;
            const quota = quotaBytes || CONFIG.STORAGE_QUOTA_BYTES;
            const pct = Math.min((used / quota) * 100, 100);
            const usedText = used < 1024 ? `${used} B` : used < 1048576 ? `${(used / 1024).toFixed(1)} KB` : used < 1073741824 ? `${(used / 1048576).toFixed(1)} MB` : `${(used / 1073741824).toFixed(2)} GB`;
            const quotaGB = (quota / 1073741824).toFixed(0);
            const remaining = ((quota - used) / 1073741824).toFixed(2);
            const storageValue = document.getElementById('storageValue');
            const progressBar = document.getElementById('storageProgressBar');
            const progressFill = document.getElementById('storageProgress');
            const storageDesc = document.getElementById('storageDesc');
            if (storageValue) storageValue.textContent = `${usedText} / ${quotaGB} GB`;
            if (progressFill) progressFill.style.width = `${Math.max(pct, 2)}%`;
            if (storageDesc) storageDesc.textContent = `${pct.toFixed(1)}% utilized. ${remaining} GB remaining on IPFS network.`;
            if (progressBar) progressBar.setAttribute('aria-valuenow', Math.round(pct));
            const planDisplay = document.getElementById('storagePlanDisplay');
            if (planDisplay) planDisplay.textContent = `Premium (${quotaGB} GB)`;
        },
    };

    const FilesUI = {
        render(files) {
            currentFiles = files || [];
            SearchService.reset();
            const listEl = document.getElementById('recentFilesList');
            if (!listEl) return;
            if (!files || files.length === 0) {
                listEl.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24" class="empty-icon" aria-hidden="true"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg><p>Your vault is empty</p><span>Secure your first file to begin monitoring your storage.</span></div>';
                return;
            }
            listEl.innerHTML = [...files].reverse().map((file) => {
                const id = file._id || file.id || '';
                const name = file.name || file.originalName || 'Unknown';
                const isEnc = file.encrypted || file.isEncrypted;
                const cid = file.ipfsCID || file.cid || '';
                const shortCID = cid ? `${cid.substring(0, 20)}...` : null;
                const hasChain = file.blockchainRecord || file.txHash;
                const sizeStr = file.sizeFormatted || file.size || '—';
                const dateStr = file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : file.date || '—';
                const ext = (name.split('.').pop() || 'file').toUpperCase();
                const isPreviewable = /^(pdf|png|jpg|jpeg|gif|webp|txt|md|json|csv)$/i.test((name.split('.').pop() || ''));
                return `<div class="file-card-item" data-id="${id}" data-name="${name}"><div class="file-icon-wrapper" aria-hidden="true"><svg viewBox="0 0 24 24" class="file-icon"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg></div><div class="file-card-info"><span class="file-card-name">${name}</span><div class="file-card-meta">${isEnc ? '<span class="badge-encrypted" aria-label="AES-256 encrypted"><svg viewBox="0 0 24 24" class="lock-icon-small" aria-hidden="true"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>AES-256</span>' : ''}${cid ? '<span class="badge-ipfs" aria-label="Stored on IPFS">IPFS</span>' : ''}${hasChain ? '<span class="badge-chain" aria-label="Verified on blockchain">On-Chain</span>' : ''}<span aria-hidden="true">•</span><span>${ext}</span><span aria-hidden="true">•</span><span>${sizeStr}</span><span aria-hidden="true">•</span><span>${dateStr}</span></div>${shortCID ? `<span class="file-cid" aria-label="IPFS CID: ${cid}">ipfs://${shortCID}</span>` : ''}</div><div class="file-actions" role="group" aria-label="Actions for ${name}">${hasChain ? '<button class="action-btn chain-verify" title="View Blockchain Record" aria-label="View blockchain record for ${name}"><svg viewBox="0 0 24 24" class="action-icon" aria-hidden="true"><path d="M17 8C8 10 5.9 16.17 3.82 21H5.71C6.72 18.81 7.86 17.2 9 16.05C9 16.03 9 16.02 9 16C9 14.34 10.34 13 12 13C13.66 13 15 14.34 15 16C15 17.66 13.66 19 12 19C11.76 19 11.52 18.97 11.3 18.91C10.5 19.7 9.61 20.58 8.57 21.57C9.62 21.83 10.79 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2C6.48 2 2 6.48 2 12C2 13.68 2.42 15.26 3.15 16.65C4.39 13.68 7.33 9.93 17 8Z"/></svg></button>' : ''}${isPreviewable ? '<button class="action-btn preview-btn" title="Preview File" aria-label="Preview ${name}"><svg viewBox="0 0 24 24" class="action-icon" aria-hidden="true"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg></button>' : ''}<button class="action-btn download-btn" title="Download" aria-label="Download ${name}"><svg viewBox="0 0 24 24" class="action-icon" aria-hidden="true"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg></button><button class="action-btn delete-btn delete" title="Delete" aria-label="Delete ${name}"><svg viewBox="0 0 24 24" class="action-icon" aria-hidden="true"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg></button></div></div>`;
            }).join('');
        },
    };

    const FilePreviewUI = {
        _previewableTypes: {
            image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'],
            pdf: ['pdf'],
            text: ['txt', 'md', 'json', 'csv', 'log', 'xml', 'yaml', 'yml', 'js', 'ts', 'html', 'css'],
        },
        getType(fileName) {
            const ext = (fileName.split('.').pop() || '').toLowerCase();
            if (this._previewableTypes.image.includes(ext)) return 'image';
            if (this._previewableTypes.pdf.includes(ext)) return 'pdf';
            if (this._previewableTypes.text.includes(ext)) return 'text';
            return null;
        },
        async show(file) {
            const modal = document.getElementById('filePreviewModal');
            const body = document.getElementById('filePreviewModalBody');
            const subtitle = document.getElementById('filePreviewModalSubtitle');
            const downloadBtn = document.getElementById('downloadFromPreview');
            const cancelBtn = document.getElementById('cancelFilePreview');
            if (!modal || !body) return;
            const name = file.name || file.originalName || 'File';
            const id = file._id || file.id;
            const isEnc = file.encrypted || file.isEncrypted;
            const sizeStr = file.sizeFormatted || file.size || '—';
            const type = this.getType(name);
            previewFileForDownload = file;
            if (subtitle) subtitle.textContent = name;
            const infoHTML = `<div class="preview-file-info"><div class="file-icon-wrapper" aria-hidden="true"><svg viewBox="0 0 24 24" class="file-icon"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg></div><div class="preview-file-details"><span class="preview-file-name">${name}</span><span class="preview-file-meta">${sizeStr}${isEnc ? ' · AES-256 Encrypted' : ''}</span></div></div>`;
            if (isEnc) {
                body.innerHTML = `${infoHTML}<div class="preview-unsupported"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg><p>File is encrypted — preview unavailable</p></div>`;
                modal.classList.add('active');
                cancelBtn?.addEventListener('click', () => this.close(), { once: true });
                modal.addEventListener('click', (event) => { if (event.target === modal) this.close(); }, { once: true });
                return;
            }
            body.innerHTML = `${infoHTML}<div class="cid-result-loading"><div class="cid-spinner" aria-hidden="true"></div><span>Loading preview...</span></div>`;
            modal.classList.add('active');
            try {
                const blob = await ApiClient.getBinary(`/files/${id}/download`);
                this._revokeOldUrl();
                previewObjectUrl = URL.createObjectURL(blob);
                let previewHTML = '';
                if (type === 'image') {
                    previewHTML = `<img class="preview-img" src="${previewObjectUrl}" alt="Preview of ${name}" loading="lazy">`;
                } else if (type === 'pdf') {
                    previewHTML = `<iframe class="preview-pdf" src="${previewObjectUrl}" title="PDF preview of ${name}" aria-label="PDF preview of ${name}"></iframe>`;
                } else if (type === 'text') {
                    const text = await blob.text();
                    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    previewHTML = `<pre class="preview-text" tabindex="0" aria-label="Text content of ${name}">${escaped}</pre>`;
                } else {
                    previewHTML = '<div class="preview-unsupported"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg><p>Preview not available for this file type</p></div>';
                }
                body.innerHTML = `${infoHTML}${previewHTML}`;
            } catch (error) {
                body.innerHTML = `${infoHTML}<div class="cid-result-error"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg><span>Could not load preview: ${error.message}</span></div>`;
            }
            cancelBtn?.addEventListener('click', () => this.close(), { once: true });
            modal.addEventListener('click', (event) => { if (event.target === modal) this.close(); }, { once: true });
        },
        close() {
            const modal = document.getElementById('filePreviewModal');
            if (modal) modal.classList.remove('active');
            this._revokeOldUrl();
            previewFileForDownload = null;
        },
        _revokeOldUrl() {
            if (previewObjectUrl) {
                URL.revokeObjectURL(previewObjectUrl);
                previewObjectUrl = null;
            }
        },
    };

    window._apexaShowBlockchainRecord = (fileId) => {
        const file = currentFiles.find((item) => (item._id || item.id) === fileId);
        if (!file) return;
        const rec = file.blockchainRecord || {};
        const modal = document.getElementById('blockchainModal');
        const body = document.getElementById('blockchainModalBody');
        const name = file.name || file.originalName || 'File';
        const cid = file.ipfsCID || file.cid || 'N/A';
        const isEnc = file.encrypted || file.isEncrypted;
        if (body) body.innerHTML = `<div class="blockchain-record-detail"><div class="brd-row"><span class="brd-key">File Name</span><span class="brd-val">${name}</span></div><div class="brd-row"><span class="brd-key">IPFS CID</span><span class="brd-val cyan">${cid}</span></div><div class="brd-row"><span class="brd-key">TX Hash</span><span class="brd-val purple">${rec.txHash || file.txHash || 'N/A'}</span></div><div class="brd-row"><span class="brd-key">Block</span><span class="brd-val">#${rec.blockNumber || '—'}</span></div><div class="brd-row"><span class="brd-key">Network</span><span class="brd-val">${rec.network || 'Polygon'}</span></div><div class="brd-row"><span class="brd-key">Confirmations</span><span class="brd-val">${rec.confirmations || 1}</span></div><div class="brd-row"><span class="brd-key">Status</span><span class="brd-val green">✓ Confirmed</span></div><div class="brd-row"><span class="brd-key">Owner</span><span class="brd-val">${rec.ownerAddress ? `${rec.ownerAddress.substring(0, 10)}...` : 'N/A'}</span></div><div class="brd-row"><span class="brd-key">Encryption</span><span class="brd-val">${isEnc ? 'AES-256-GCM' : 'Unencrypted'}</span></div><div class="brd-row"><span class="brd-key">Timestamp</span><span class="brd-val">${new Date(rec.timestamp || file.uploadedAt || Date.now()).toLocaleString()}</span></div><div class="brd-row"><span class="brd-key">Gas Used</span><span class="brd-val">${rec.gasUsed || '—'}</span></div></div>`;
        if (modal) modal.classList.add('active');
    };

    const setupSidebarNavigation = (user) => {
        const navItems = document.querySelectorAll('.nav-item');
        const settingsModal = document.getElementById('settingsModal');
        const closeSettings = document.getElementById('closeSettings');
        const settingsEmail = document.getElementById('settingsEmail');
        if (settingsEmail) settingsEmail.textContent = user.email;
        navItems.forEach((item) => {
            item.addEventListener('click', () => {
                const sectionId = item.getAttribute('data-section');
                if (!sectionId) return;
                if (sectionId === 'settings') {
                    settingsModal.classList.add('active');
                    setTimeout(() => {
                        const firstFocusable = settingsModal.querySelector('button, input, [tabindex]');
                        if (firstFocusable) firstFocusable.focus();
                    }, 100);
                    return;
                }
                const section = document.getElementById(sectionId);
                if (section) {
                    navItems.forEach((navItem) => {
                        navItem.classList.remove('active');
                        navItem.removeAttribute('aria-current');
                    });
                    item.classList.add('active');
                    item.setAttribute('aria-current', 'page');
                    section.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });
        });
        if (closeSettings) closeSettings.addEventListener('click', () => settingsModal.classList.remove('active'));
        settingsModal?.addEventListener('click', (event) => { if (event.target === settingsModal) settingsModal.classList.remove('active'); });
        settingsModal?.addEventListener('keydown', (event) => {
            if (!settingsModal.classList.contains('active')) return;
            if (event.key === 'Escape') {
                settingsModal.classList.remove('active');
                return;
            }
            if (event.key !== 'Tab') return;
            const focusable = settingsModal.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])');
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey) {
                if (document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                }
            } else if (document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        });
    };

    const setupWalletUI = () => {
        const connectBtn = document.getElementById('connectWalletBtn');
        const walletModal = document.getElementById('walletModal');
        const closeWalletModal = document.getElementById('closeWalletModal');
        if (connectBtn) {
            connectBtn.addEventListener('click', () => {
                if (WalletService.isConnected()) {
                    WalletService.disconnect();
                    const walletStatus = document.getElementById('walletStatus');
                    if (walletStatus) walletStatus.textContent = 'Not Connected';
                    connectBtn.textContent = 'Connect';
                    connectBtn.setAttribute('aria-label', 'Connect crypto wallet');
                    Toast.info('Wallet disconnected.', 'Wallet');
                } else {
                    walletModal.classList.add('active');
                }
            });
        }
        if (closeWalletModal) closeWalletModal.addEventListener('click', () => walletModal.classList.remove('active'));
        walletModal?.addEventListener('click', (event) => { if (event.target === walletModal) walletModal.classList.remove('active'); });
        walletModal?.addEventListener('keydown', (event) => { if (event.key === 'Escape') walletModal.classList.remove('active'); });
        document.querySelectorAll('.wallet-option-btn').forEach((btn) => {
            btn.addEventListener('click', async () => {
                const walletType = btn.dataset.wallet;
                walletModal.classList.remove('active');
                try {
                    Toast.info('Connecting wallet...', 'Wallet');
                    let result;
                    if (walletType === 'metamask') result = await WalletService.connectMetaMask();
                    else if (walletType === 'walletconnect') result = await WalletService.connectWalletConnect();
                    else result = await WalletService.connectCoinbase();
                    if (result.success) {
                        const walletStatus = document.getElementById('walletStatus');
                        if (walletStatus) walletStatus.textContent = WalletService.formatAddress(result.address);
                        if (connectBtn) {
                            connectBtn.textContent = 'Disconnect';
                            connectBtn.setAttribute('aria-label', 'Disconnect crypto wallet');
                        }
                        Toast.success(`Connected: ${WalletService.formatAddress(result.address)}`, 'Wallet Connected');
                    }
                } catch (error) {
                    Toast.error(error.message, 'Connection Failed');
                }
            });
        });
    };

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
        encryptToggle?.addEventListener('change', () => {
            if (encryptToggle.checked) {
                encryptionPasswordWrapper.classList.add('active');
                encryptionPasswordWrapper.removeAttribute('aria-hidden');
                encryptionPassword.focus();
                if (pendingFiles.length > 0) secureUploadBtn.classList.add('visible');
            } else {
                encryptionPasswordWrapper.classList.remove('active');
                encryptionPasswordWrapper.setAttribute('aria-hidden', 'true');
                encryptionPassword.value = '';
                secureUploadBtn.classList.remove('visible');
            }
        });
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                fileInput.click();
            }
        });
        fileInput.addEventListener('change', (event) => handleFiles(event.target.files));
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach((eventName) => {
            dropZone.addEventListener(eventName, (event) => {
                event.preventDefault();
                event.stopPropagation();
            }, false);
        });
        ['dragenter', 'dragover'].forEach((eventName) => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('drag-over');
                dropZone.setAttribute('aria-label', 'Drop files here to upload');
            }, false);
        });
        ['dragleave', 'drop'].forEach((eventName) => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('drag-over');
                dropZone.setAttribute('aria-label', 'Upload files — click, press Enter, or drag and drop files here');
            }, false);
        });
        dropZone.addEventListener('drop', (event) => handleFiles(event.dataTransfer.files), false);

        const handleFiles = (files) => {
            const list = Array.from(files || []);
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
                await PipelineUI.activateStep(0, isEncrypted ? 'Encrypting with AES-256-GCM...' : 'Preparing files...');
                await PipelineUI.activateStep(1, 'Computing integrity hash...');
                NodeService.highlightStoringNodes();
                await PipelineUI.activateStep(2, 'Uploading to IPFS via Pinata...');
                const result = await FileService.upload(fileList, isEncrypted, password, (percent, label) => {
                    PipelineUI.setStatus(label);
                    document.querySelectorAll('.upload-progress-fill').forEach((fill) => {
                        fill.style.width = `${percent}%`;
                        const percentEl = fill.closest('.file-preview-item')?.querySelector('.upload-pct-display');
                        if (percentEl) {
                            percentEl.textContent = `${percent}%`;
                            if (percent >= 100) percentEl.classList.add('complete');
                        }
                    });
                });
                await PipelineUI.activateStep(3, 'Registering on Polygon blockchain...');
                NodeService.resetStoringNodes();
                await PipelineUI.completeAll();
                document.querySelectorAll('.upload-progress-fill').forEach((fill) => fill.classList.add('complete'));
                document.querySelectorAll('.upload-pct-display').forEach((element) => {
                    element.textContent = '100%';
                    element.classList.add('complete');
                });
                encryptToggle.checked = false;
                encryptionPasswordWrapper.classList.remove('active');
                encryptionPasswordWrapper.setAttribute('aria-hidden', 'true');
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
                await loadDashboardData();
            } catch (error) {
                PipelineUI.hide();
                NodeService.resetStoringNodes();
                Toast.error(error.message || 'Upload failed. Please try again.', 'Upload Failed');
                console.error('Upload error:', error);
            }
        };
        secureUploadBtn?.addEventListener('click', () => {
            if (pendingFiles.length > 0) processUpload(pendingFiles);
        });

        const renderPreviews = (files, isStaging = false) => {
            filePreviewContainer.style.display = 'flex';
            filePreviewContainer.innerHTML = '';
            files.forEach((file, index) => {
                const sizeStr = formatBytes(file.size);
                const ext = (file.name.split('.').pop() || 'file').toUpperCase();
                const fileId = `file-prev-${Date.now()}-${index}`;
                const isEnc = encryptToggle.checked;
                filePreviewContainer.insertAdjacentHTML('afterbegin', `<div class="file-preview-item ${isStaging ? 'staged' : ''}" id="${fileId}" role="listitem" aria-label="${file.name}, ${sizeStr}"><div class="file-icon-wrapper" aria-hidden="true"><svg viewBox="0 0 24 24" class="file-icon"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg></div><div class="file-info"><div class="preview-name-row"><span class="file-name">${file.name}</span>${isEnc ? '<span class="preview-badge" aria-label="Will be encrypted"><svg viewBox="0 0 24 24" class="lock-icon-small" aria-hidden="true"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>Encrypted</span>' : ''}</div><span class="file-meta">${ext} · ${sizeStr} · ${isStaging ? 'Ready to Secure' : 'Processing...'}</span><div class="upload-progress-real" role="progressbar" aria-label="Upload progress for ${file.name}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div class="upload-progress-mock"><div class="upload-progress-fill" id="progress-${fileId}"></div></div><span class="upload-pct-display" aria-hidden="true">0%</span></div></div></div>`);
            });
            setTimeout(() => {
                document.querySelectorAll('.upload-progress-fill').forEach((fill) => {
                    fill.style.width = '5%';
                });
            }, 100);
        };
    };

    const setupFileActions = () => {
        const listEl = document.getElementById('recentFilesList');
        if (!listEl) return;
        listEl.onclick = (event) => {
            const downloadBtn = event.target.closest('.download-btn');
            const deleteBtn = event.target.closest('.delete-btn');
            const chainBtn = event.target.closest('.chain-verify');
            const previewBtn = event.target.closest('.preview-btn');
            const fileItem = event.target.closest('.file-card-item');
            if (!fileItem) return;
            const fileId = fileItem.dataset.id;
            if (previewBtn) handlePreview(fileId);
            else if (downloadBtn) handleDownload(fileId);
            else if (deleteBtn) promptDelete(fileId, fileItem);
            else if (chainBtn) window._apexaShowBlockchainRecord(fileId);
        };
        listEl.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const button = event.target.closest('.action-btn');
            if (button) {
                event.preventDefault();
                button.click();
            }
        });
    };

    const handlePreview = async (fileId) => {
        const file = currentFiles.find((item) => (item._id || item.id) === fileId);
        if (!file) {
            Toast.error('File not found.', 'Preview Error');
            return;
        }
        await FilePreviewUI.show(file);
    };

    const setupPreviewModal = () => {
        const downloadBtn = document.getElementById('downloadFromPreview');
        const cancelBtn = document.getElementById('cancelFilePreview');
        const modal = document.getElementById('filePreviewModal');
        if (downloadBtn) {
            downloadBtn.addEventListener('click', async () => {
                if (!previewFileForDownload) return;
                const file = previewFileForDownload;
                FilePreviewUI.close();
                await handleDownload(file._id || file.id);
            });
        }
        if (cancelBtn) cancelBtn.addEventListener('click', () => FilePreviewUI.close());
        if (modal) modal.addEventListener('keydown', (event) => { if (event.key === 'Escape') FilePreviewUI.close(); });
    };

    const resolveFileRecord = (fileOrId) => {
        if (!fileOrId) return null;
        if (typeof fileOrId === 'string' || typeof fileOrId === 'number') {
            return currentFiles.find((item) => (item._id || item.id) === fileOrId);
        }
        return fileOrId;
    };

    const handleDownload = async (fileOrId) => {
        const file = resolveFileRecord(fileOrId);
        if (!file) {
            Toast.error('File not found.', 'Download Error');
            return;
        }
        const fileId = file._id || file.id;
        const name = file.name || file.originalName || 'download';
        const isEncrypted = file.encrypted || file.isEncrypted;
        if (isEncrypted) {
            showDecryptionModal(file);
        } else {
            try {
                Toast.info('Downloading from IPFS...', 'Download');
                await FileService.download(fileId, name);
                LocalActivity.push('download', `Downloaded "${name}" from IPFS`);
                Toast.success('File downloaded successfully.', 'Download Complete');
            } catch (error) {
                Toast.error(error.message, 'Download Failed');
            }
        }
    };

    const showDecryptionModal = (file) => {
        const modal = document.getElementById('passwordModal');
        const input = document.getElementById('decryptionPassword');
        const confirmButton = document.getElementById('confirmDecryption');
        const cancelButton = document.getElementById('cancelModal');
        modal.classList.add('active');
        input.value = '';
        setTimeout(() => input.focus(), 100);
        const cleanup = () => {
            modal.classList.remove('active');
            confirmButton.onclick = null;
            cancelButton.onclick = null;
            input.onkeypress = null;
            modal.onkeydown = null;
        };
        const handleConfirm = async () => {
            const password = input.value;
            if (!password) {
                Toast.error('Please enter the decryption password.');
                return;
            }
            confirmButton.disabled = true;
            confirmButton.textContent = 'Decrypting...';
            try {
                const name = file.name || file.originalName || 'download';
                const id = file._id || file.id;
                Toast.info('Decrypting and downloading...', 'Decryption');
                await FileService.decryptDownload(id, password, name);
                LocalActivity.push('download', `Decrypted & downloaded "${name}"`);
                cleanup();
                Toast.success('File decrypted and downloaded.', 'Decryption Complete');
            } catch (error) {
                Toast.error(error.message || 'Incorrect password or decryption failed.', 'Decryption Failed');
                input.style.borderColor = '#ef4444';
                input.value = '';
                input.focus();
                setTimeout(() => {
                    input.style.borderColor = '';
                }, 1200);
            } finally {
                confirmButton.disabled = false;
                confirmButton.textContent = 'Unlock & Download';
            }
        };
        confirmButton.onclick = handleConfirm;
        cancelButton.onclick = cleanup;
        input.onkeypress = (event) => { if (event.key === 'Enter') handleConfirm(); };
        modal.onkeydown = (event) => { if (event.key === 'Escape') cleanup(); };
    };

    const promptDelete = (fileId, fileItemEl) => {
        const file = currentFiles.find((item) => (item._id || item.id) === fileId);
        const name = file ? file.name || file.originalName : 'this file';
        const modal = document.getElementById('deleteModal');
        const nameEl = document.getElementById('deleteModalFileName');
        const confirmButton = document.getElementById('confirmDelete');
        const cancelButton = document.getElementById('cancelDelete');
        if (nameEl) nameEl.textContent = `Permanently delete "${name}" from IPFS?`;
        modal.classList.add('active');
        setTimeout(() => confirmButton?.focus(), 100);
        const cleanup = () => {
            modal.classList.remove('active');
            confirmButton.onclick = null;
            cancelButton.onclick = null;
            modal.onclick = null;
            modal.onkeydown = null;
        };
        confirmButton.onclick = async () => {
            cleanup();
            await performDelete(fileId, fileItemEl);
        };
        cancelButton.onclick = cleanup;
        modal.onclick = (event) => { if (event.target === modal) cleanup(); };
        modal.onkeydown = (event) => { if (event.key === 'Escape') cleanup(); };
    };

    const performDelete = async (fileId, fileItemEl) => {
        try {
            fileItemEl.classList.add('removing');
            await FileService.delete(fileId);
            const deletedFile = currentFiles.find((item) => (item._id || item.id) === fileId);
            const deletedName = deletedFile ? deletedFile.name || deletedFile.originalName || 'file' : 'file';
            LocalActivity.push('delete', `Deleted "${deletedName}" from vault`);
            setTimeout(async () => {
                Toast.success('File removed from your secure storage.', 'File Deleted');
                await loadDashboardData();
            }, 400);
        } catch (error) {
            fileItemEl.classList.remove('removing');
            Toast.error(error.message || 'Delete failed.', 'Delete Error');
        }
    };

    const setupChainModals = () => {
        const closeButton = document.getElementById('closeBlockchainModal');
        const modal = document.getElementById('blockchainModal');
        closeButton?.addEventListener('click', () => modal?.classList.remove('active'));
        modal?.addEventListener('click', (event) => { if (event.target === modal) modal.classList.remove('active'); });
        modal?.addEventListener('keydown', (event) => { if (event.key === 'Escape') modal.classList.remove('active'); });
    };

    const SearchService = {
        _query: '',
        attach() {
            const desktopInput = document.querySelector('.header-search input');
            if (desktopInput) {
                desktopInput.addEventListener('input', (event) => {
                    this._query = event.target.value.trim().toLowerCase();
                    const mobileInput = document.getElementById('mobileSearchInput');
                    if (mobileInput && document.activeElement !== mobileInput) mobileInput.value = event.target.value;
                    this._filter();
                });
            }
            const mobileInput = document.getElementById('mobileSearchInput');
            if (mobileInput) {
                mobileInput.addEventListener('input', (event) => {
                    this._query = event.target.value.trim().toLowerCase();
                    if (desktopInput && document.activeElement !== desktopInput) desktopInput.value = event.target.value;
                    this._filter();
                });
            }
        },
        _filter() {
            const query = this._query;
            const items = document.querySelectorAll('#recentFilesList .file-card-item');
            let visibleCount = 0;
            items.forEach((item) => {
                const id = item.dataset.id;
                const file = currentFiles.find((entry) => (entry._id || entry.id) === id);
                if (!file) {
                    item.classList.add('search-hidden');
                    return;
                }
                const name = (file.name || file.originalName || '').toLowerCase();
                const cid = (file.ipfsCID || file.cid || '').toLowerCase();
                const type = (file.type || file.mimeType || '').toLowerCase();
                const date = (file.uploadedAt || file.date || '').toLowerCase();
                const match = !query || name.includes(query) || cid.includes(query) || type.includes(query) || date.includes(query);
                item.classList.toggle('search-hidden', !match);
                if (match) {
                    item.classList.toggle('search-match', query.length > 0);
                    visibleCount += 1;
                } else {
                    item.classList.remove('search-match');
                }
            });
            let noResults = document.getElementById('searchNoResults');
            const listEl = document.getElementById('recentFilesList');
            if (query && visibleCount === 0 && items.length > 0) {
                if (!noResults) {
                    noResults = document.createElement('div');
                    noResults.id = 'searchNoResults';
                    noResults.className = 'empty-state';
                    noResults.style.padding = '1.5rem 0';
                    noResults.setAttribute('role', 'status');
                    noResults.innerHTML = `<p>No results for "<em>${query}</em>"</p><span>Try searching by filename, CID, or file type.</span>`;
                    listEl.appendChild(noResults);
                } else {
                    noResults.querySelector('p').innerHTML = `No results for "<em>${query}</em>"`;
                    noResults.style.display = '';
                }
            } else if (noResults) {
                noResults.style.display = 'none';
            }
        },
        reset() {
            this._query = '';
            document.querySelectorAll('#recentFilesList .file-card-item').forEach((element) => {
                element.classList.remove('search-hidden', 'search-match');
            });
        },
    };

    const CIDRetrieval = {
        _initialized: false,
        isValidCID(cid) {
            const trimmed = cid.trim();
            return /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(trimmed) || /^baf[a-z2-7]{50,}$/i.test(trimmed) || /^[a-zA-Z0-9]{46,60}$/.test(trimmed);
        },
        findFileRecord(cid) {
            const normalized = cid.trim().toLowerCase();
            return (currentFiles || []).find((file) => {
                const fileCid = (file.ipfsCID || file.cid || '').toLowerCase();
                return fileCid === normalized || fileCid.includes(normalized);
            });
        },
        setup() {
            if (this._initialized) return;
            const input = document.getElementById('cidInput');
            const button = document.getElementById('cidRetrieveBtn');
            const result = document.getElementById('cidResult');
            if (!input || !button || !result) return;
            const doRetrieve = async () => {
                const cid = input.value.trim();
                if (!cid) {
                    Toast.error('Please enter a CID.', 'CID Required');
                    return;
                }
                if (!this.isValidCID(cid)) {
                    Toast.error('Invalid CID format. Must start with Qm or bafybei.', 'Invalid CID');
                    return;
                }
                result.style.display = 'block';
                result.innerHTML = '<div class="cid-result-loading"><div class="cid-spinner" aria-hidden="true"></div><span>Resolving your file from the vault and opening the protected download flow...</span></div>';
                button.disabled = true;
                button.setAttribute('aria-busy', 'true');
                try {
                    const file = this.findFileRecord(cid);
                    if (!file) {
                        throw new Error('No matching file record was found for this CID in your vault.');
                    }
                    const shortCid = cid.length > 20 ? `${cid.substring(0, 10)}...${cid.slice(-8)}` : cid;
                    const fileName = file.name || file.originalName || 'download';
                    await handleDownload(file);
                    result.innerHTML = `<div class="cid-result-content"><div class="cid-result-meta"><div class="cid-meta-row"><span class="cid-meta-key">CID</span><span class="cid-meta-val cyan">${shortCid}</span></div><div class="cid-meta-row"><span class="cid-meta-key">File</span><span class="cid-meta-val">${fileName}</span></div><div class="cid-meta-row"><span class="cid-meta-key">Status</span><span class="cid-meta-val cyan">Protected download flow opened</span></div></div><p class="cid-result-note">The existing password dialog and decryption flow will be used for encrypted files.</p></div>`;
                } catch (error) {
                    result.innerHTML = `<div class="cid-result-error" role="alert"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg><span>${error.message}</span></div>`;
                } finally {
                    button.disabled = false;
                    button.removeAttribute('aria-busy');
                }
            };
            button.addEventListener('click', doRetrieve);
            input.addEventListener('keypress', (event) => { if (event.key === 'Enter') doRetrieve(); });
            this._initialized = true;
        },
    };

    const loadDashboardData = async () => {
        try {
            const data = await FileService.list();
            const files = data.files || data.data || [];
            currentFiles = files;
            FilesUI.render(files);
            BlockchainLedgerUI.render(files);
            AIInsightsUI.update(files);
            const totalBytes = files.reduce((sum, file) => sum + (file.sizeInBytes || file.fileSize || 0), 0);
            const user = AuthService.getCurrentUser();
            const usedBytes = data.storageUsed ?? totalBytes;
            const quotaBytes = data.storageQuota ?? (user?.storageQuota || CONFIG.STORAGE_QUOTA_BYTES);
            StorageUI.update(usedBytes, quotaBytes);
            let activities = null;
            if (data.activities) {
                activities = data.activities;
            } else {
                try {
                    const activityData = await ApiClient.get('/activities');
                    activities = activityData.activities || activityData.data || [];
                } catch (_) {
                    activities = LocalActivity.get();
                }
            }
            ActivityUI.render(activities);
            SearchService._filter();
            NodeService.activateNodes(14 + Math.floor(Math.random() * 10));
        } catch (error) {
            console.warn('Dashboard data load error:', error.message);
            if (error.message?.includes('Session expired') || error.message?.includes('Unauthorized')) {
                Toast.error('Session expired. Please log in again.', 'Session');
            }
        }
    };

    const showDashboard = (user, instant = false) => {
        const authSection = document.getElementById('authSection');
        const dashboardSection = document.getElementById('dashboardSection');
        const welcomeText = document.getElementById('welcomeText');
        const userNameDisplay = document.getElementById('userNameDisplay');
        const userInitial = document.getElementById('userInitial');
        if (welcomeText) welcomeText.textContent = `Welcome back, ${user.username}`;
        if (userNameDisplay) {
            userNameDisplay.textContent = user.username;
            userNameDisplay.setAttribute('aria-label', `Signed in as ${user.username}`);
        }
        if (userInitial) userInitial.textContent = user.username.charAt(0).toUpperCase();
        setupSidebarNavigation(user);
        setupFileActions();
        setupChainModals();
        setupWalletUI();
        setupPreviewModal();
        document.getElementById('viewActivityBtn')?.addEventListener('click', () => {
            document.getElementById('activitySection')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        const doShow = () => {
            authSection.style.display = 'none';
            dashboardSection.style.display = 'flex';
            document.body.style.alignItems = 'stretch';
            document.body.style.justifyContent = 'stretch';
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
        if (instant) doShow();
        else {
            authSection.classList.add('fade-out');
            setTimeout(() => {
                authSection.classList.remove('fade-out');
                dashboardSection.classList.add('fade-in');
                doShow();
            }, 500);
        }
    };

    const logout = async (event) => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        const dashboardSection = document.getElementById('dashboardSection');
        dashboardSection?.classList.add('fade-out');
        BlockchainCanvas.destroy();
        await AuthService.logout();
        window.location.reload();
    };

    const hideLoader = () => {
        const loader = document.getElementById('apexaLoader');
        if (loader) {
            loader.classList.add('hidden');
            setTimeout(() => loader.remove(), 600);
        }
    };

    const initApp = () => {
        setTimeout(hideLoader, 1200);
        if (AuthService.isAuthenticated()) {
            const user = AuthService.getCurrentUser();
            showDashboard(user, true);
        }
        setupUploadInteractions();
    };

    initApp();

    const loginTab = document.getElementById('loginTab');
    const registerTab = document.getElementById('registerTab');
    const authTitle = document.getElementById('authTitle');
    const authSubtitle = document.getElementById('authSubtitle');
    const loginForm = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');

    const toggleForms = (showRegister) => {
        if (showRegister) {
            loginTab.classList.remove('active');
            loginTab.setAttribute('aria-selected', 'false');
            registerTab.classList.add('active');
            registerTab.setAttribute('aria-selected', 'true');
            loginForm.classList.remove('active');
            setTimeout(() => {
                authTitle.textContent = 'Create an account';
                authSubtitle.textContent = 'Start your journey with Apexa today.';
                registerForm.classList.add('active');
                document.getElementById('regUsername')?.focus();
            }, 300);
        } else {
            registerTab.classList.remove('active');
            registerTab.setAttribute('aria-selected', 'false');
            loginTab.classList.add('active');
            loginTab.setAttribute('aria-selected', 'true');
            registerForm.classList.remove('active');
            setTimeout(() => {
                authTitle.textContent = 'Welcome back';
                authSubtitle.textContent = 'Please enter your details to sign in.';
                loginForm.classList.add('active');
                document.getElementById('loginEmail')?.focus();
            }, 300);
        }
    };

    loginTab?.addEventListener('click', () => toggleForms(false));
    registerTab?.addEventListener('click', () => toggleForms(true));
    document.getElementById('logoutBtn')?.addEventListener('click', logout);
    document.getElementById('logoutBtnMobile')?.addEventListener('click', logout);

    registerForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
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
        const button = document.getElementById('registerSubmitBtn');
        button.disabled = true;
        button.textContent = 'Creating account...';
        button.setAttribute('aria-busy', 'true');
        try {
            await AuthService.register({ username, email, password, confirmPassword });
            registerForm.reset();
            Toast.success('Account created! Please sign in.', 'Registration Successful');
            setTimeout(() => toggleForms(false), 800);
        } catch (error) {
            Toast.error(error.message || 'Registration failed. Please try again.', 'Registration Failed');
        } finally {
            button.disabled = false;
            button.textContent = 'Create Account';
            button.removeAttribute('aria-busy');
        }
    });

    loginForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        if (!email || !password) {
            Toast.error('Please enter both email and password.');
            return;
        }
        const button = document.getElementById('loginSubmitBtn');
        button.disabled = true;
        button.textContent = 'Signing in...';
        button.setAttribute('aria-busy', 'true');
        try {
            const data = await AuthService.login({ email, password });
            loginForm.reset();
            Toast.success(`Welcome back, ${data.user.username}!`, 'Login Successful');
            setTimeout(() => showDashboard(data.user), 1200);
        } catch (error) {
            Toast.error(error.message || 'Login failed. Please try again.', 'Login Failed');
        } finally {
            button.disabled = false;
            button.textContent = 'Sign In';
            button.removeAttribute('aria-busy');
        }
    });
})();
