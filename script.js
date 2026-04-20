function vaultApp() {
    return {
        screen: 'selection',
        registry: {},
        activeVaultId: null,
        masterKey: '',
        error: '',
        searchQuery: '',
        toast: { show: false, message: '', showUndo: false },
        newEntry: { site: '', user: '', pass: '' },
        setup: { name: '', key1: '', key2: '' },
        vault: [],
        theme: 'light',
        deletedVault: null,
        deletedVaultId: null,
        showLengthPicker: false,
        passLength: 16,

        get filteredVault() {
            if (!this.searchQuery) return this.vault;
            return this.vault.filter(e => e.site.toLowerCase().includes(this.searchQuery.toLowerCase()));
        },

        init() {
            if (window.location.search.includes('clear=true')) {
                localStorage.clear();
                window.location.search = '';
            }
            const saved = localStorage.getItem('vault_registry');
            if (saved) {
                try { this.registry = JSON.parse(saved); } catch(e) { this.registry = {}; }
            }
            this.initTheme();
            this.$nextTick(() => lucide.createIcons());
        },

        initTheme() {
            const savedTheme = localStorage.getItem('vault_theme');
            if (savedTheme) {
                this.theme = savedTheme;
            } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                this.theme = 'dark';
            }
            this.applyTheme();
        },

        applyTheme() {
            document.documentElement.setAttribute('data-theme', this.theme);
            localStorage.setItem('vault_theme', this.theme);
        },

        toggleTheme() {
            this.theme = this.theme === 'light' ? 'dark' : 'light';
            this.applyTheme();
        },

        async createNewVault() {
            if (!this.setup.name || !this.setup.key1) return;
            if (this.setup.key1 !== this.setup.key2) {
                this.error = "Passwords do not match";
                return;
            }
            const id = 'v_' + Date.now();
            this.registry[id] = { name: this.setup.name, created: new Date().toISOString(), itemCount: 0 };
            this.activeVaultId = id;
            this.masterKey = this.setup.key1;
            this.vault = [];
            await this.saveVaultData();
            this.saveRegistry();
            this.screen = 'app';
            this.setup = { name: '', key1: '', key2: '' };
            this.showToast("Vault Created");
            this.$nextTick(() => lucide.createIcons());
        },

        deleteVault(id) {
            const vault = this.registry[id];
            this.deletedVault = vault;
            this.deletedVaultId = id;
            delete this.registry[id];
            this.saveRegistry();
            localStorage.removeItem(`data_${id}`);
            this.showToastWithUndo(`"${vault.name}" deleted`);
            this.$nextTick(() => lucide.createIcons());
        },

        undoDelete() {
            if (this.deletedVault && this.deletedVaultId) {
                this.registry[this.deletedVaultId] = this.deletedVault;
                this.saveRegistry();
                this.deletedVault = null;
                this.deletedVaultId = null;
                this.showToast("Restored");
                this.$nextTick(() => lucide.createIcons());
            }
        },

        selectVault(id) {
            this.activeVaultId = id;
            this.screen = 'unlock';
            this.error = '';
            this.$nextTick(() => lucide.createIcons());
        },

        async unlockActiveVault() {
            const encrypted = localStorage.getItem(`data_${this.activeVaultId}`);
            if (!encrypted) {
                this.vault = [];
                this.screen = 'app';
                return;
            }
            try {
                const decrypted = await this.decrypt(encrypted, this.masterKey);
                this.vault = JSON.parse(decrypted).map(e => ({ ...e, visible: false }));
                this.screen = 'app';
                this.error = '';
            } catch (e) {
                this.error = "Incorrect password";
            }
            this.$nextTick(() => lucide.createIcons());
        },

        async lockVault() {
            await this.saveVaultData();
            this.screen = 'selection';
            this.masterKey = '';
            this.vault = [];
            this.activeVaultId = null;
            this.$nextTick(() => lucide.createIcons());
        },

        async addEntry() {
            if (!this.newEntry.site || !this.newEntry.pass) return;
            this.vault.unshift({ ...this.newEntry, visible: false });
            this.newEntry = { site: '', user: '', pass: '' };
            await this.saveVaultData();
            this.showToast("Stored");
            this.$nextTick(() => lucide.createIcons());
        },

        async deleteEntry(index) {
            this.vault.splice(index, 1);
            await this.saveVaultData();
        },

        async saveVaultData() {
            if (this.activeVaultId) {
                try {
                    const enc = await this.encrypt(JSON.stringify(this.vault), this.masterKey);
                    localStorage.setItem(`data_${this.activeVaultId}`, enc);
                    if (!this.registry[this.activeVaultId]) {
                        this.registry[this.activeVaultId] = { name: "Recovered", created: new Date().toISOString(), itemCount: 0 };
                    }
                    this.registry[this.activeVaultId].itemCount = this.vault.length;
                    this.saveRegistry();
                } catch (e) { console.error("Persistence error", e); }
            }
        },

        saveRegistry() { localStorage.setItem('vault_registry', JSON.stringify(this.registry)); },

        async exportVault() {
            if (!this.activeVaultId || !this.registry[this.activeVaultId]) return;
            const data = await this.encrypt(JSON.stringify(this.vault), this.masterKey);
            const pkg = { name: this.registry[this.activeVaultId].name, data: data };
            const blob = new Blob([JSON.stringify(pkg)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${this.registry[this.activeVaultId].name}.json`;
            a.click();
        },

        triggerImport() { document.getElementById('importFile').click(); },

        handleImport(event) {
            const file = event.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const pkg = JSON.parse(e.target.result);
                    const id = 'v_' + Date.now();
                    this.registry[id] = { name: pkg.name || 'Imported Vault', created: new Date().toISOString(), itemCount: 0 };
                    localStorage.setItem(`data_${id}`, pkg.data);
                    this.saveRegistry();
                    this.showToast("Vault Integrated");
                } catch(err) { console.error("Integration error", err); }
            };
            reader.readAsText(file);
        },

        generatePass() {
            const c = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$%&*";
            let p = "";
            for (let i = 0; i < this.passLength; i++) p += c.charAt(Math.floor(Math.random() * c.length));
            this.newEntry.pass = p;
        },

        copyToClipboard(text) {
            const el = document.createElement('textarea');
            el.value = text;
            document.body.appendChild(el);
            el.select();
            document.execCommand('copy');
            document.body.removeChild(el);
            this.showToast("Copied to Clipboard");
        },

        showToast(m) {
            this.toast.message = m;
            this.toast.show = true;
            this.toast.showUndo = false;
            setTimeout(() => this.toast.show = false, 3500);
        },

        showToastWithUndo(m) {
            this.toast.message = m;
            this.toast.show = true;
            this.toast.showUndo = true;
            setTimeout(() => {
                this.toast.show = false;
                this.deletedVault = null;
                this.deletedVaultId = null;
            }, 5500);
        },

        async encrypt(text, key) {
            const enc = new TextEncoder();
            const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(key), "PBKDF2", false, ["deriveKey"]);
            const cryptoKey = await crypto.subtle.deriveKey(
                { name: "PBKDF2", salt: enc.encode('vault_v2'), iterations: 100000, hash: "SHA-256" },
                keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt"]
            );
            const iv = crypto.getRandomValues(new Uint8Array(12));
            const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, enc.encode(text));
            const combined = new Uint8Array(iv.length + ciphertext.byteLength);
            combined.set(iv); combined.set(new Uint8Array(ciphertext), iv.length);
            return btoa(String.fromCharCode(...combined));
        },

        async decrypt(base64, key) {
            const enc = new TextEncoder();
            const combined = new Uint8Array(atob(base64).split("").map(c => c.charCodeAt(0)));
            const iv = combined.slice(0, 12);
            const ciphertext = combined.slice(12);
            const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(key), "PBKDF2", false, ["deriveKey"]);
            const cryptoKey = await crypto.subtle.deriveKey(
                { name: "PBKDF2", salt: enc.encode('vault_v2'), iterations: 100000, hash: "SHA-256" },
                keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
            );
            const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, ciphertext);
            return new TextDecoder().decode(decrypted);
        }
    }
}
