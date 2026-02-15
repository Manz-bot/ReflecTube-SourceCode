// ReflecTube — Background Service Worker
// Handles: Update badge notification

const USER = "Manz-bot";
const REPO = "ReflecTube-SourceCode";
const BRANCH = "main";
const MANIFEST_URL = `https://raw.githubusercontent.com/${USER}/${REPO}/${BRANCH}/manifest.json`;

// Compare version strings numerically (e.g. "0.8.6" vs "0.9.0")
function isNewerVersion(local, remote) {
    const lp = local.split('.').map(Number);
    const rp = remote.split('.').map(Number);
    for (let i = 0; i < Math.max(lp.length, rp.length); i++) {
        const l = lp[i] || 0;
        const r = rp[i] || 0;
        if (r > l) return true;
        if (r < l) return false;
    }
    return false;
}

async function checkForUpdate() {
    try {
        const localVersion = chrome.runtime.getManifest().version;
        const response = await fetch(MANIFEST_URL, { cache: 'no-cache' });
        if (!response.ok) return;

        const remoteManifest = await response.json();
        const remoteVersion = remoteManifest.version;

        if (isNewerVersion(localVersion, remoteVersion)) {
            // Update available — show red badge dot
            chrome.action.setBadgeText({ text: '!' });
            chrome.action.setBadgeBackgroundColor({ color: '#f44336' });
            chrome.action.setBadgeTextColor({ color: '#ffffff' });
            // Store the flag so popup knows
            chrome.storage.local.set({ rt_update_available: true, rt_update_version: remoteVersion });
        } else {
            chrome.action.setBadgeText({ text: '' });
            chrome.storage.local.set({ rt_update_available: false });
        }
    } catch (e) {
        // Network error — silent fail, keep existing badge state
        console.log('ReflecTube: Update check failed', e.message);
    }
}

// Check on install/update
chrome.runtime.onInstalled.addListener(() => {
    checkForUpdate();
});
/*
// Check periodically (every 6 hours)
chrome.alarms.create('rt-update-check', { periodInMinutes: 360 });
chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'rt-update-check') {
        checkForUpdate();
    }
});
*/
// Also check on browser startup
chrome.runtime.onStartup.addListener(() => {
    checkForUpdate();
});
