// Default config
const DEFAULT_CONFIG = {
    masterSwitch: true,
    opacity: 100,
    blur: 20,
    saturation: 100,
    brightness: 75,
    contrast: 100,
    sepia: 0,
    sensitivity: 50,
    audioEnabled: true,
    cameraShake: false,
    cameraIntensity: 50,
    framerate: 30,
    smoothness: 60,
    resolution: 80,
    legacyMode: false,
    pointerActive: false,
    visualizerActive: false
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
    sepia: document.getElementById('sepia'),
    sensitivity: document.getElementById('sensitivity'),
    framerate: document.getElementById('framerate'),
    smoothness: document.getElementById('smoothness'),
    resolution: document.getElementById('resolution'),
    audioEnabled: document.getElementById('audioEnabled'),
    cameraShake: document.getElementById('cameraShake'),
    cameraIntensity: document.getElementById('cameraIntensity'),
    legacyMode: document.getElementById('legacyMode'),
    pointerActive: document.getElementById('pointerActive'),
    visualizerActive: document.getElementById('visualizerActive'),
    resetBtn: document.getElementById('reset-btn')
};

const displayEls = {
    opacity: document.getElementById('val-opacity'),
    blur: document.getElementById('val-blur'),
    saturation: document.getElementById('val-saturation'),
    brightness: document.getElementById('val-brightness'),
    contrast: document.getElementById('val-contrast'),
    sepia: document.getElementById('val-sepia'),
    sensitivity: document.getElementById('val-sensitivity'),
    framerate: document.getElementById('val-framerate'),
    smoothness: document.getElementById('val-smoothness'),
    resolution: document.getElementById('val-resolution'),
    cameraIntensity: document.getElementById('val-cameraIntensity')
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
    els.opacity.value = config.opacity;
    els.blur.value = config.blur;
    els.saturation.value = config.saturation;
    els.brightness.value = config.brightness;
    els.contrast.value = config.contrast;
    els.sepia.value = config.sepia;
    els.sensitivity.value = config.sensitivity;
    els.framerate.value = config.framerate;
    els.smoothness.value = config.smoothness;
    els.resolution.value = config.resolution;
    els.audioEnabled.checked = config.audioEnabled;
    els.cameraShake.checked = config.cameraShake;
    els.cameraIntensity.value = config.cameraIntensity;
    if (els.legacyMode) els.legacyMode.checked = config.legacyMode;
    if (els.pointerActive) els.pointerActive.checked = config.pointerActive;
    if (els.visualizerActive) els.visualizerActive.checked = config.visualizerActive;

    updateLabels();
}

function updateLabels() {
    displayEls.opacity.textContent = config.opacity + '%';
    displayEls.blur.textContent = config.blur + 'px';
    displayEls.saturation.textContent = config.saturation + '%';
    displayEls.brightness.textContent = config.brightness + '%';
    displayEls.contrast.textContent = config.contrast + '%';
    displayEls.sepia.textContent = config.sepia + '%';
    displayEls.sensitivity.textContent = config.sensitivity;

    displayEls.framerate.textContent = config.framerate + 'ms';
    displayEls.smoothness.textContent = config.smoothness;
    displayEls.resolution.textContent = config.resolution + 'px';

    let camVal = parseInt(config.cameraIntensity);
    let camText = chrome.i18n.getMessage("ui_medium");
    if (camVal <= 20) camText = chrome.i18n.getMessage("ui_weak");
    else if (camVal >= 80) camText = chrome.i18n.getMessage("ui_strong");
    else if (camVal >= 40) camText = chrome.i18n.getMessage("ui_medium");
    displayEls.cameraIntensity.textContent = camText;
}

function updateConfigFromUI() {
    config.masterSwitch = els.masterSwitch.checked;
    config.opacity = parseInt(els.opacity.value);
    config.blur = parseInt(els.blur.value);
    config.saturation = parseInt(els.saturation.value);
    config.brightness = parseInt(els.brightness.value);
    config.contrast = parseInt(els.contrast.value);
    config.sepia = parseInt(els.sepia.value);
    config.sensitivity = parseInt(els.sensitivity.value);
    config.framerate = parseInt(els.framerate.value);
    config.smoothness = parseInt(els.smoothness.value);
    config.resolution = parseInt(els.resolution.value);
    config.cameraIntensity = parseInt(els.cameraIntensity.value);
    config.audioEnabled = els.audioEnabled.checked;
    config.cameraShake = els.cameraShake.checked;
    if (els.legacyMode) config.legacyMode = els.legacyMode.checked;
    if (els.pointerActive) config.pointerActive = els.pointerActive.checked;
    if (els.visualizerActive) config.visualizerActive = els.visualizerActive.checked;
    updateLabels();
}

function saveAndNotify() {
    // Save to storage
    chrome.storage.sync.set({ rt_config: config });

    // Notify active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
                type: 'UPDATE_SETTINGS',
                payload: config
            });
        }
    });
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
    'legacyMode': 'settings_legacy_mode',
    'pointerActive': 'settings_pointer_follow',
    'visualizerActive': 'settings_visualizer_color'
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

// Update Event Listeners to trigger speech
Object.keys(els).forEach(key => {
    if (key === 'resetBtn') return;
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
