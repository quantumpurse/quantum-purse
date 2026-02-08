const { app, BrowserWindow, session, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

function compareVersions(v1, v2) {
    if (!v1) return -1;
    const parts1 = v1.split(".").map(Number);
    const parts2 = v2.split(".").map(Number);

    const len = Math.max(parts1.length, parts2.length);
    for (let i = 0; i < len; i++) {
        const p1 = parts1[i] || 0;
        const p2 = parts2[i] || 0;
        if (p1 > p2) return 1;
        if (p1 < p2) return -1;
    }
    return 0;
}

function testnetToMainnet() {
    const userData = app.getPath('userData');
    const versionFile = path.join(userData, 'version.json');
    const indexedDbDir = path.join(userData, 'IndexedDB/')
    const currentVersion = app.getVersion();

    let previousVersion = "0.0.0";
    if (fs.existsSync(versionFile)) {
        try {
            previousVersion = JSON.parse(fs.readFileSync(versionFile, 'utf8')).version || "0.0.0";
        } catch (e) {
            previousVersion = "0.0.0";
        }
    }

    // V0.3.0 marks the first transition from testnet to mainnet
    const fromTestnet = compareVersions(previousVersion, "0.3.0") === -1;
    const toMainnet = compareVersions(currentVersion, "0.3.0") >= 0;

    // Store version in a local file
    if (previousVersion !== currentVersion) {
        fs.writeFileSync(versionFile, JSON.stringify({ version: currentVersion }));
    }

    return (fromTestnet && toMainnet && fs.existsSync(indexedDbDir));
}

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 905,
        height: 650,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            devTools: !app.isPackaged,
        },
    });

    mainWindow.setMinimumSize(905, 650);
    mainWindow.setMaximumSize(905, 650);
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));

    mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
        const parsedUrl = new URL(navigationUrl);
        if (parsedUrl.protocol !== 'file:') {
            event.preventDefault();
            shell.openExternal(navigationUrl);
        }
    });

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        try {
            const parsedUrl = new URL(url);
            if (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') {
                shell.openExternal(url);
            }
        } catch (e) {
            // nothing
        }
        return { action: 'deny' };
    });
}

app.whenReady().then(async () => {
    if (testnetToMainnet()) {
        const currentVersion = app.getVersion();
        const result = await dialog.showMessageBox({
            type: 'info',
            title: `Quantum Purse ${currentVersion}`,
            message: `Pre-release testnet data found!`,
            detail: `You SHOULD clean the testnet data for a smooth transition to mainnet. For the details, see https://github.com/tea2x/quantum-purse/issues/116`,
            buttons: ['✅ Delete Now (Recommended)', '⚠️ Eject Later (Not recommended)'],
            defaultId: 0,
            cancelId: 1,
        });

        // Delete Old Data Now button
        if (result.response === 0) {
            try {
                const userData = app.getPath('userData');
                const itemsToDelete = [
                    'IndexedDB',
                ];

                itemsToDelete.forEach(item => {
                    const itemPath = path.join(userData, item);
                    if (fs.existsSync(itemPath)) {
                        fs.rmSync(itemPath, { recursive: true, force: true });
                    }
                });
            } catch (error) {
                await dialog.showMessageBox({
                    type: 'error',
                    title: 'Error',
                    message: `Failed to delete testnet data: ${error.message}\n\nPlease delete manually via Settings → Eject Wallet.`,
                    buttons: ['OK']
                });
            }
        } else if (result.response === 1) {
            await dialog.showMessageBox({
                type: 'warning',
                title: 'Warning!',
                message: 'If you choose to eject later, do remember to eject before receiving mainnet assets!',
                buttons: ['OK']
            });
        }
    }

    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
        const responseHeaders = Object.assign({}, details.responseHeaders);
        responseHeaders['Cross-Origin-Opener-Policy'] = ['same-origin'];
        responseHeaders['Cross-Origin-Embedder-Policy'] = ['require-corp'];

        // for packaged app - containing mainnet build - only allow secure connections
        const connectSrc = app.isPackaged 
            ? "connect-src 'self' wss:; "
            : "connect-src 'self' http://localhost:8080 https://ckb-faucet-proxy.vercel.app ws: wss:; ";

        responseHeaders['Content-Security-Policy'] = [
            "default-src 'self'; " +
            "script-src 'self' 'wasm-unsafe-eval'; " +
            "style-src 'self' 'unsafe-inline'; " +
            "font-src 'self'; " +
            "img-src 'self'; " +
            connectSrc +
            "worker-src 'self' blob:; " +
            "manifest-src 'self'; " +
            "object-src 'none'; " +
            "base-uri 'self'; " +
            "form-action 'self'; " +
            "frame-ancestors 'none';"
        ];

        responseHeaders['X-Content-Type-Options'] = ['nosniff'];
        responseHeaders['X-Frame-Options'] = ['DENY'];

        callback({ responseHeaders });
    });

    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
        const allowedPermissions = ['clipboard-read', 'clipboard-sanitized-write', 'media'];
        callback(allowedPermissions.includes(permission));
    });

    createWindow();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
