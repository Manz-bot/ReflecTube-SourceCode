const DEFAULT_CONFIG = {
    masterSwitch: true,
    opacity: 100,
    blur: 20,
    saturation: 100,
    brightness: 75,
    contrast: 100,
    sepia: 0,
    invert: 0,
    hueLoop: false,
    sensitivity: 50,
    audioEnabled: true,
    cameraShake: false,
    cameraIntensity: 50,
    framerate: 30,
    smoothness: 60,
    resolution: 100,
    pointerActive: false,
    visualizerActive: false,
    // WebGL
    webglActive: false,
    // Ambient Mode Defaults
    ambientMode: false,
    ambientScale: 110
};

let config = { ...DEFAULT_CONFIG };

// UI Elements
const els = {
    masterSwitch: document.getElementById('masterSwitch'),
    opacity: document.getElementById('opacity'),
    blur: document.getElementById('blur'),
    saturation: document.getElementById('saturation'),
    brightness: document.getElementById('brightness'),
    contrast: document.getElementById('contrast'),
    contrast: document.getElementById('contrast'),
    sepia: document.getElementById('sepia'),
    invert: document.getElementById('invert'),
    hueLoop: document.getElementById('hueLoop'),
    sensitivity: document.getElementById('sensitivity'),
    framerate: document.getElementById('framerate'),
    smoothness: document.getElementById('smoothness'),
    resolution: document.getElementById('resolution'),
    audioEnabled: document.getElementById('audioEnabled'),
    cameraShake: document.getElementById('cameraShake'),
    cameraIntensity: document.getElementById('cameraIntensity'),
    pointerActive: document.getElementById('pointerActive'),
    visualizerActive: document.getElementById('visualizerActive'),
    webglActive: document.getElementById('webglActive'),
    ambientMode: document.getElementById('ambientMode'),
    ambientScale: document.getElementById('ambientScale'),
    ambientSettings: document.getElementById('ambient-settings'),
    resetBtn: document.getElementById('reset-btn')
};

const displayEls = {
    opacity: document.getElementById('val-opacity'),
    blur: document.getElementById('val-blur'),
    saturation: document.getElementById('val-saturation'),
    brightness: document.getElementById('val-brightness'),
    contrast: document.getElementById('val-contrast'),
    contrast: document.getElementById('val-contrast'),
    sepia: document.getElementById('val-sepia'),
    invert: document.getElementById('val-invert'),
    sensitivity: document.getElementById('val-sensitivity'),
    framerate: document.getElementById('val-framerate'),
    smoothness: document.getElementById('val-smoothness'),
    resolution: document.getElementById('val-resolution'),
    resolution: document.getElementById('val-resolution'),
    cameraIntensity: document.getElementById('val-cameraIntensity'),
    ambientScale: document.getElementById('val-ambientScale')
};

// Load saved settings
chrome.storage.sync.get(['rt_config'], (result) => {
    if (result.rt_config) {
        config = { ...DEFAULT_CONFIG, ...result.rt_config };
        // Migration: quality -> framerate
        if (result.rt_config.quality && !result.rt_config.framerate) {
            config.framerate = result.rt_config.quality;
        }
    }
    updateUI();
});

// Event Listeners (Handled at bottom with Speech logic)
// Object.keys(els).forEach(key => { ... });

els.resetBtn.addEventListener('click', () => {
    if (confirm("¿Restablecer toda la configuración por defecto?")) {
        config = { ...DEFAULT_CONFIG };
        saveAndNotify();
        updateUI();
    }
});

function updateUI() {
    els.masterSwitch.checked = config.masterSwitch;

    // Main Container Visibility
    const mainContainer = document.getElementById('main-settings-container');
    if (mainContainer) {
        mainContainer.style.display = config.masterSwitch ? 'block' : 'none';
        // Also hide/show reset btn if needed, but it's inside the container now.
    }

    els.opacity.value = config.opacity;
    els.blur.value = config.blur;
    els.saturation.value = config.saturation;
    els.brightness.value = config.brightness;
    els.contrast.value = config.contrast;
    els.sepia.value = config.sepia;
    els.invert.value = config.invert;
    els.hueLoop.checked = config.hueLoop;
    els.sensitivity.value = config.sensitivity;
    els.framerate.value = config.framerate;
    els.smoothness.value = config.smoothness;
    els.resolution.value = config.resolution;
    els.audioEnabled.checked = config.audioEnabled;
    els.cameraShake.checked = config.cameraShake;
    els.cameraIntensity.value = config.cameraIntensity;
    if (els.pointerActive) els.pointerActive.checked = config.pointerActive;
    if (els.visualizerActive) els.visualizerActive.checked = config.visualizerActive;
    if (els.ambientMode) els.ambientMode.checked = config.ambientMode;
    if (els.ambientScale) els.ambientScale.value = config.ambientScale;

    // Toggle Groups
    const audioGroup = document.getElementById('audio-settings');
    if (audioGroup) audioGroup.style.display = config.audioEnabled ? 'block' : 'none';

    const cameraGroup = document.getElementById('camera-settings');
    if (cameraGroup) cameraGroup.style.display = config.cameraShake ? 'block' : 'none';

    const ambientGroup = document.getElementById('ambient-settings');
    if (ambientGroup) ambientGroup.style.display = config.ambientMode ? 'block' : 'none';

    updateLabels();
}

function updateLabels() {
    displayEls.opacity.textContent = config.opacity + '%';
    displayEls.blur.textContent = config.blur + 'px';
    displayEls.saturation.textContent = config.saturation + '%';
    displayEls.brightness.textContent = config.brightness + '%';
    displayEls.contrast.textContent = config.contrast + '%';
    displayEls.sepia.textContent = config.sepia + '%';
    displayEls.invert.textContent = config.invert + '%';
    displayEls.sensitivity.textContent = config.sensitivity;

    displayEls.framerate.textContent = config.framerate + 'ms';
    displayEls.smoothness.textContent = config.smoothness;
    displayEls.resolution.textContent = config.resolution + 'px';
    if (displayEls.ambientScale) displayEls.ambientScale.textContent = config.ambientScale + '%';

    let camVal = parseInt(config.cameraIntensity);
    let camText = chrome.i18n.getMessage("ui_medium");
    if (camVal <= 20) camText = chrome.i18n.getMessage("ui_weak");
    else if (camVal >= 80) camText = chrome.i18n.getMessage("ui_strong");
    else if (camVal >= 40) camText = chrome.i18n.getMessage("ui_medium");
    displayEls.cameraIntensity.textContent = camText;
}

function updateConfigFromUI() {
    if (els.masterSwitch) config.masterSwitch = els.masterSwitch.checked;
    if (els.opacity) config.opacity = parseInt(els.opacity.value);
    if (els.blur) config.blur = parseInt(els.blur.value);
    if (els.saturation) config.saturation = parseInt(els.saturation.value);
    if (els.brightness) config.brightness = parseInt(els.brightness.value);
    if (els.contrast) config.contrast = parseInt(els.contrast.value);
    if (els.sepia) config.sepia = parseInt(els.sepia.value);
    if (els.invert) config.invert = parseInt(els.invert.value);
    if (els.hueLoop) config.hueLoop = els.hueLoop.checked;
    if (els.sensitivity) config.sensitivity = parseInt(els.sensitivity.value);
    if (els.framerate) config.framerate = parseInt(els.framerate.value);
    if (els.smoothness) config.smoothness = parseInt(els.smoothness.value);
    if (els.resolution) config.resolution = parseInt(els.resolution.value);
    if (els.cameraIntensity) config.cameraIntensity = parseInt(els.cameraIntensity.value);
    if (els.audioEnabled) config.audioEnabled = els.audioEnabled.checked;
    if (els.cameraShake) config.cameraShake = els.cameraShake.checked;
    if (els.pointerActive) config.pointerActive = els.pointerActive.checked;
    if (els.visualizerActive) config.visualizerActive = els.visualizerActive.checked;
    if (els.ambientMode) config.ambientMode = els.ambientMode.checked;
    if (els.ambientScale) config.ambientScale = parseInt(els.ambientScale.value);
    if (els.webglActive) config.webglActive = els.webglActive.checked;

    // Call updateUI to handle visibility logic (or just duplicate it here for responsiveness)
    // It's cleaner to duplicate just the display parts or call a shared "updateVisibility" function.
    // For now, let's just toggling inline to ensure it feels instant.

    const mainContainer = document.getElementById('main-settings-container');
    if (mainContainer) mainContainer.style.display = config.masterSwitch ? 'block' : 'none';

    const audioGroup = document.getElementById('audio-settings');
    if (audioGroup) audioGroup.style.display = config.audioEnabled ? 'block' : 'none';

    const cameraGroup = document.getElementById('camera-settings');
    if (cameraGroup) cameraGroup.style.display = config.cameraShake ? 'block' : 'none';

    const ambientGroup = document.getElementById('ambient-settings');
    if (ambientGroup) ambientGroup.style.display = config.ambientMode ? 'block' : 'none';

    updateLabels();
}

const debounce = (func, wait) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
};

const saveToStorage = debounce(() => {
    chrome.storage.sync.set({ rt_config: config }, () => {
        if (chrome.runtime.lastError) {
            console.error("Storage Error:", chrome.runtime.lastError);
        }
    });
}, 500);

function saveAndNotify() {
    // Notify active tab IMMEDIATELY for live preview
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                type: 'UPDATE_SETTINGS',
                payload: config
            });
        }
    });

    // Debounced Storage Save
    saveToStorage();
}

function localizeHtml() {
    const objects = document.querySelectorAll('[data-i18n]');
    for (let c = 0; c < objects.length; c++) {
        const obj = objects[c];
        const valStr = obj.getAttribute('data-i18n');
        const msg = chrome.i18n.getMessage(valStr);
        if (msg) obj.textContent = msg;
    }
}

// Init Localization
localizeHtml();

// ----------------------------------------------------------------------
// VOICE FEEDBACK (SpeechSynthesis)
// ----------------------------------------------------------------------
const speech = new SpeechSynthesisUtterance();
let voices = [];

// Feature Name Mapping (ID -> i18n Key)
const featureMap = {
    'masterSwitch': 'settings_extension_switch',
    'audioEnabled': 'settings_audio_reactivity',
    'cameraShake': 'settings_camera_shake',
    'pointerActive': 'settings_pointer_follow',
    'visualizerActive': 'settings_visualizer_color',
    'ambientMode': 'settings_ambient_mode',
    'hueLoop': 'settings_hueloop'
};

function initSpeech() {
    speech.volume = 1;
    speech.rate = 1;
    speech.pitch = 1;
    speech.lang = chrome.i18n.getUILanguage() || 'en';

    // Load voices
    const loadVoices = () => {
        voices = window.speechSynthesis.getVoices();
        // Try to find a voice that matches the UI language
        const targetLang = speech.lang.substring(0, 2); // 'en' or 'es'
        const bestVoice = voices.find(v => v.lang.startsWith(targetLang));
        if (bestVoice) speech.voice = bestVoice;
        else if (voices.length > 0) speech.voice = voices[0];
    };

    if (window.speechSynthesis.onvoiceschanged !== undefined) {
        window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    loadVoices();
}

function speakChange(elementId, isChecked) {
    if (!featureMap[elementId]) return;

    try {
        // Get Feature Name
        const key = featureMap[elementId];
        const featureName = chrome.i18n.getMessage(key) || elementId;

        // Get Status
        // Fallback strings if json update failed
        const isSpanish = chrome.i18n.getUILanguage().startsWith('es');
        const enabledText = isSpanish ? "Activado" : "Enabled";
        const disabledText = isSpanish ? "Desactivado" : "Disabled";

        // Try to get from i18n if available (assuming previous step might have worked or user added them)
        const i18nEnabled = chrome.i18n.getMessage("ui_enabled");
        const i18nDisabled = chrome.i18n.getMessage("ui_disabled");

        const status = isChecked ? (i18nEnabled || enabledText) : (i18nDisabled || disabledText);

        speech.text = `${featureName}: ${status}`;
        window.speechSynthesis.cancel(); // Stop previous
        window.speechSynthesis.speak(speech);
    } catch (e) {
        console.warn("Speech Error:", e);
    }
}

initSpeech();

const USER = "Manz-bot";
const REPO = "ReflecTube-SourceCode";
const BRANCH = "main";
const MANIFEST_URL = `https://raw.githubusercontent.com/${USER}/${REPO}/${BRANCH}/manifest.json`;

// Version Check
(async () => {
    try {
        const localManifest = chrome.runtime.getManifest();
        const localVersion = localManifest.version;
        console.log(MANIFEST_URL);
        const response = await fetch(MANIFEST_URL);
        if (response.ok) {
            const remoteManifest = await response.json();
            const remoteVersion = remoteManifest.version;

            console.log(`Local: ${localVersion} | Remote: ${remoteVersion}`);

            if (localVersion !== remoteVersion) {
                const updateMsg = document.getElementById('update-msg');
                const updateBtn = document.getElementById('update-btn');

                if (updateMsg && updateBtn) {
                    //Chequear numericamente si la nueva version es mayor que la local
                    const localVersionParts = localVersion.split('.').map(Number);
                    const remoteVersionParts = remoteVersion.split('.').map(Number);

                    let isUpdateAvailable = false;
                    for (let i = 0; i < localVersionParts.length; i++) {
                        if (remoteVersionParts[i] > localVersionParts[i]) {
                            isUpdateAvailable = true;
                            break;
                        }
                    }

                    if (isUpdateAvailable) {
                        updateMsg.querySelector('div').textContent = updateMsg.querySelector('div').textContent.replace("{version}", remoteVersion);
                        updateMsg.style.display = 'block';
                        updateBtn.addEventListener('click', () => {
                            const downloadUrl = `https://github.com/${USER}/${REPO}/archive/refs/heads/${BRANCH}.zip`;
                            const downloadLink = document.createElement('a');
                            downloadLink.href = downloadUrl;
                            downloadLink.download = `${REPO}-${remoteVersion}.zip`;
                            document.body.appendChild(downloadLink);
                            downloadLink.click();
                            document.body.removeChild(downloadLink);
                        });
                    }
                }
            }
        }
    } catch (error) {
        console.error("Error checking version:", error);
    }
})();

// Tooltips Logic
const tooltipContainer = document.getElementById('tooltip-container');

function showTooltip(e, text) {
    if (!tooltipContainer) return;
    tooltipContainer.textContent = text;
    tooltipContainer.style.display = 'block';
    moveTooltip(e);
}

function hideTooltip() {
    if (!tooltipContainer) return;
    tooltipContainer.style.display = 'none';
}

function moveTooltip(e) {
    if (!tooltipContainer) return;
    // Position tooltip near the mouse but ensure it stays on screen
    const x = e.clientX + 10;
    const y = e.clientY + 10;
    tooltipContainer.style.left = `${x}px`;
    tooltipContainer.style.top = `${y}px`;

    // Boundary check (basic)
    const rect = tooltipContainer.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        tooltipContainer.style.left = `${e.clientX - rect.width - 10}px`;
    }
    if (rect.bottom > window.innerHeight) {
        tooltipContainer.style.top = `${e.clientY - rect.height - 10}px`;
    }
}

document.querySelectorAll('[data-tooltip]').forEach(el => {
    el.addEventListener('mouseenter', (e) => {
        const key = el.getAttribute('data-tooltip');
        const text = chrome.i18n.getMessage(key);
        if (text) showTooltip(e, text);
    });
    el.addEventListener('mouseleave', hideTooltip);
    el.addEventListener('mousemove', moveTooltip);
});

// Update Event Listeners to trigger speech
Object.keys(els).forEach(key => {
    if (key === 'resetBtn' || key === 'ambientSettings') return; // Skip containers/buttons
    if (els[key]) {
        els[key].addEventListener('input', (e) => {
            updateConfigFromUI();
            saveAndNotify();

            // Trigger speech only for checkboxes (toggles)
            if (e.target.type === 'checkbox') {
                speakChange(key, e.target.checked);
            }
        });
    }
});

// ----------------------------------------------------------------------
// PROFILE MANAGER
// ----------------------------------------------------------------------
const ProfileManager = (() => {
    const els = {
        select: document.getElementById('profile-select'),
        btnSave: document.getElementById('profile-save-btn'),
        btnDelete: document.getElementById('profile-delete-btn'),
        btnExport: document.getElementById('profile-export-btn'),
        btnImport: document.getElementById('profile-import-btn'),

        // Modal
        modal: document.getElementById('new-profile-modal'),
        inputNewName: document.getElementById('new-profile-input'),
        btnCancelNew: document.getElementById('cancel-new-profile'),
        btnConfirmNew: document.getElementById('confirm-new-profile')
    };

    let profiles = { "Default": { ...DEFAULT_CONFIG } };
    let previousSelectValue = "Default";
    let lastProfileName = "Default";

    function init() {
        if (!els.select) return;

        // Load Profiles and Last Selected
        chrome.storage.sync.get(['rt_profiles', 'rt_last_profile'], (res) => {
            if (res.rt_profiles) {
                profiles = res.rt_profiles;
            }
            if (res.rt_last_profile && profiles[res.rt_last_profile]) {
                lastProfileName = res.rt_last_profile;
                previousSelectValue = res.rt_last_profile;
            }
            renderSelect();

            // If the persisted profile is not Default, enforce loading its settings to UI
            // But usually, the page loads with saved config. We just need UI sync.
            // If we want to ensure config matches profile:
            if (lastProfileName !== "Default") {
                loadProfile(lastProfileName);
            }
        });

        // -----------------------
        // SELECT HANDLER
        // -----------------------
        els.select.addEventListener('change', (e) => {
            if (els.select.value === '_NEW_') {
                openNewProfileModal();
            } else {
                previousSelectValue = els.select.value;
                loadProfile(els.select.value);
            }
        });

        // -----------------------
        // MODAL HANDLERS
        // -----------------------
        if (els.btnCancelNew) {
            els.btnCancelNew.addEventListener('click', () => {
                closeNewProfileModal();
                els.select.value = previousSelectValue; // Revert select
            });
        }

        if (els.btnConfirmNew) {
            els.btnConfirmNew.addEventListener('click', () => {
                const name = els.inputNewName.value.trim();
                if (name && name !== "Default" && name !== "_NEW_") {
                    saveProfile(name);
                    closeNewProfileModal();
                } else {
                    alert("Invalid name.");
                }
            });
        }

        // Allow Enter key in modal
        if (els.inputNewName) {
            els.inputNewName.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') els.btnConfirmNew.click();
                if (e.key === 'Escape') els.btnCancelNew.click();
            });
        }

        // -----------------------
        // BUTTON ACTIONS
        // -----------------------
        els.btnSave.addEventListener('click', () => {
            const current = els.select.value;

            // If on Default, FORCE "Save As" (Modal)
            if (current === 'Default') {
                openNewProfileModal();
                return;
            }

            // If creating new via select
            if (current === '_NEW_') return;

            // Otherwise, confirm overwrite
            const msg = chrome.i18n.getMessage("profile_alert_overwrite", { name: current }).replace("{name}", current);
            if (confirm(msg)) {
                saveProfile(current);
            }
        });

        els.btnDelete.addEventListener('click', () => {
            const name = els.select.value;
            if (name === "Default" || name === "_NEW_") {
                alert("Cannot delete Default profile.");
                return;
            }
            const msg = chrome.i18n.getMessage("profile_alert_delete", { name: name }).replace("{name}", name);
            if (confirm(msg)) {
                deleteProfile(name);
            }
        });

        // -----------------------
        // EXPORT / IMPORT
        // -----------------------
        if (els.btnExport) {
            els.btnExport.addEventListener('click', () => {
                // Export ALL data (current config + profiles)
                chrome.storage.sync.get(['rt_config', 'rt_profiles', 'rt_last_profile'], (items) => {
                    const data = JSON.stringify(items, null, 2);
                    const blob = new Blob([data], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);

                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `reflectube_backup_${new Date().toISOString().slice(0, 10)}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                });
            });
        }

        if (els.btnImport) {
            // Setup hidden input listener
            const fileInput = document.getElementById('import-file-input');
            if (fileInput) {
                fileInput.addEventListener('change', async (e) => {
                    if (!e.target.files.length) return;
                    const file = e.target.files[0];
                    try {
                        const text = await file.text();
                        const data = JSON.parse(text);

                        // Validate/Safety check?
                        // We expect keys: rt_config, rt_profiles, rt_last_profile
                        // Or just merge whatever is there.

                        if (confirm("Esto sobreescribirá tu configuración actual. ¿Continuar?")) {
                            chrome.storage.sync.set(data, () => {
                                alert("Configuración importada exitosamente.");
                                location.reload();
                            });
                        }
                    } catch (err) {
                        alert("Error al importar: " + err.message);
                    }
                    // Reset input
                    fileInput.value = '';
                });
            }

            els.btnImport.addEventListener('click', () => {
                if (fileInput) fileInput.click();
            });
        }
    }

    function openNewProfileModal() {
        els.inputNewName.value = "My Profile " + (Object.keys(profiles).length);
        els.modal.style.display = 'flex';
        els.inputNewName.focus();
        els.inputNewName.select();
    }

    function closeNewProfileModal() {
        els.modal.style.display = 'none';
    }

    function renderSelect() {
        els.select.innerHTML = '';

        // Add Default
        const defOpt = document.createElement('option');
        defOpt.value = "Default";
        defOpt.textContent = "Default";
        els.select.appendChild(defOpt);

        // Add User Profiles
        Object.keys(profiles).forEach(name => {
            if (name === "Default") return;
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            els.select.appendChild(opt);
        });

        // Add "New Profile" Option
        const newOpt = document.createElement('option');
        newOpt.value = "_NEW_";
        newOpt.textContent = chrome.i18n.getMessage("profile_new_option");
        els.select.appendChild(newOpt);

        // Restore value or Last Selected
        // If we have a 'previousSelectValue' tracked from init check, use it
        if (profiles[previousSelectValue]) {
            els.select.value = previousSelectValue;
        } else {
            els.select.value = "Default";
        }
    }

    function loadProfile(name) {
        if (profiles[name]) {
            config = { ...DEFAULT_CONFIG, ...profiles[name] };
            updateUI();

            // Save current config AND update last selected profile
            saveAndNotify();
            chrome.storage.sync.set({ 'rt_last_profile': name });

            previousSelectValue = name;
        }
    }

    function saveProfile(name, specificData = null) {
        const dataToSave = specificData || { ...config };
        profiles[name] = dataToSave;

        // Save to storage (profiles AND last selected)
        chrome.storage.sync.set({
            'rt_profiles': profiles,
            'rt_last_profile': name
        }, () => {
            previousSelectValue = name;
            renderSelect();
            els.select.value = name;
            if (typeof speakChange === 'function') speakChange("Profile Saved", true);
        });
    }

    function deleteProfile(name) {
        delete profiles[name];
        // Reset to Default
        chrome.storage.sync.set({
            rt_profiles: profiles,
            rt_last_profile: "Default"
        }, () => {
            previousSelectValue = "Default";
            renderSelect();
            loadProfile("Default");
        });
    }

    return { init };
})();

// Init Profiles
ProfileManager.init();
