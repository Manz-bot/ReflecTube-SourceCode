// Default Configuration
let config = {
    masterSwitch: true,
    opacity: 100,
    blur: 20,
    saturation: 100,
    brightness: 75,
    contrast: 100,
    contrast: 100,
    sepia: 0,
    invert: 0,
    hueLoop: false,
    sensitivity: 50,
    audioEnabled: true,
    cameraShake: false,
    cameraIntensity: 50,
    framerate: 30,    // Time in ms between checks
    smoothness: 60,   // 0-100, controls the fade factor
    resolution: 100,   // Pixel width of the internal canvas
    legacyMode: false, // Switch between Modern (One Canvas) and Legacy (Dual Canvas)
    pointerActive: false, // Inverted pointer follow
    visualizerActive: false, // Dynamic visualizer
    ambientMode: false, // Smart Ambient Mode
    ambientScale: 110 // Scale %
};

// ----------------------------------------------------------------------
// SETTINGS & INIT
// ----------------------------------------------------------------------

// Load settings
if (chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(['rt_config'], (result) => {
        if (result.rt_config) {
            config = { ...config, ...result.rt_config };
            // Migration
            if (result.rt_config.quality && !result.rt_config.framerate) {
                config.framerate = result.rt_config.quality;
            }
        }
        init();
    });
}

// Listen for updates
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'UPDATE_SETTINGS') {
        const oldLegacy = config.legacyMode;
        const oldAmbient = config.ambientMode;
        config = { ...config, ...request.payload };

        applyGlobalStyles();

        // Handle Master Switch Toggle
        const container = document.getElementById('rt-container');
        if (container) {
            container.style.display = config.masterSwitch ? 'flex' : 'none';
        }

        // Pointer Update
        PointerManager.updateState();

        // Visualizer Update
        VisualizerManager.updateState();

        // Handle Mode Switch or Re-init
        if (config.legacyMode !== oldLegacy || config.ambientMode !== oldAmbient) {
            restartEngine();
        } else {
            // Live update for active engine if needed
            if (config.ambientMode && AmbientEngine.isActive()) {
                AmbientEngine.updateConfig();
            }
        }
    }
});

function applyGlobalStyles() {
    const root = document.documentElement;
    const container = document.getElementById('rt-container');

    if (container) {
        if (config.cameraShake) {
            container.classList.add('camhand');
        } else {
            container.classList.remove('camhand');
        }
    }

    // CSS Variables
    root.style.setProperty('--rt_opacity', config.opacity + '%');
    root.style.setProperty('--rt_blur', config.blur + 'px');
    root.style.setProperty('--rt_saturate', config.saturation + '%');
    root.style.setProperty('--rt_brightness', (config.brightness || 100) + '%');
    root.style.setProperty('--rt_contrast', (config.contrast || 100) + '%');
    root.style.setProperty('--rt_sepia', (config.sepia || 0) + '%');
    root.style.setProperty('--rt_invert', (config.invert || 0) + '%');

    if (!config.hueLoop) {
        root.style.setProperty('--rt_hue-rotate', '0deg');
    }

    // Camera Intensity
    const factor = config.cameraIntensity / 50;
    root.style.setProperty('--fuerza', factor.toFixed(2));

    // Effect Update
    EffectManager.updateState();
}

function init() {
    applyGlobalStyles();
    PointerManager.init();
    VisualizerManager.init();
    restartEngine();
}

function restartEngine() {
    // Teardown
    ModernEngine.stop();
    LegacyEngine.stop();
    AmbientEngine.stop();

    // Clear Container (Global Projector)
    let container = document.getElementById('rt-container');
    if (container) {
        container.innerHTML = '';
        container.remove();
    }

    // Start appropriate engine
    if (config.ambientMode) {
        AmbientEngine.start();
    } else if (config.legacyMode) {
        LegacyEngine.start();
    } else {
        ModernEngine.start();
    }

    // Ensure visualizer is recreated if needed
    if (config.visualizerActive) VisualizerManager.create();
}

// ----------------------------------------------------------------------
// POINTER MANAGER (Inverted Follow)
// ----------------------------------------------------------------------
const PointerManager = (() => {
    let active = false;

    function init() {
        document.addEventListener('mousemove', (e) => {
            if (!active || !config.pointerActive || !config.masterSwitch) return;
            const container = document.getElementById('rt-container');
            if (container) {
                // Calculate inverted from center
                const cx = window.innerWidth / 2;
                const cy = window.innerHeight / 2;

                // Invert factor
                const dx = (cx - e.clientX) / 50;
                const dy = (cy - e.clientY) / 50;

                container.style.transform = `translate(${dx}px, ${dy}px)`;
            }
        });
        updateState();
    }

    function updateState() {
        active = config.pointerActive;
        const container = document.getElementById('rt-container');
        if (!active && container) {
            container.style.transform = 'none'; // Reset
        }
    }

    return { init, updateState };
})();

// ----------------------------------------------------------------------
// AUDIO MANAGER (Shared Context)
// ----------------------------------------------------------------------
const AudioManager = (() => {
    let context = null;
    let analyser = null;
    let sources = new WeakMap();
    let isInitialized = false;

    function init() {
        if (!isInitialized) {
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                context = new AudioContext();
                analyser = context.createAnalyser();
                analyser.smoothingTimeConstant = 0.85;
                analyser.fftSize = 512;
                analyser.connect(context.destination);
                isInitialized = true;
            } catch (e) {
                console.error("Reflectube Audio Init Error:", e);
            }
        }
    }

    function connect(videoElement) {
        if (!videoElement) return;
        init();
        if (context && context.state === 'suspended') {
            context.resume();
        }

        if (sources.has(videoElement)) return; // Already connected

        try {
            // Check if there's already a source (some other extensions might mess with this, but we try ours)
            // Note: createMediaElementSource can only be called once per element. 
            // If it throws, it means it's already connected.
            const source = context.createMediaElementSource(videoElement);
            source.connect(analyser);
            sources.set(videoElement, source);
        } catch (e) {
            // Already connected or error
            // If already connected by us, WeakMap catches it. 
            // If connected by external, we might not get audio unless we can hook into it, but usually this throws.
            // We ignore to prevent crash.
        }
    }

    function getAnalyser() {
        return analyser;
    }

    function getAudioData(dataArray) {
        if (analyser) {
            analyser.getByteFrequencyData(dataArray);
        }
    }

    return { init, connect, getAnalyser, getAudioData };
})();

// ----------------------------------------------------------------------
// VISUALIZER MANAGER (Dynamic Color)
// ----------------------------------------------------------------------
const VisualizerManager = (() => {
    let active = false;
    let bars = [];
    let lastColorCheck = 0;

    function init() {
        updateState();
    }

    function create() {
        if (document.getElementById('rt_visualizer')) return; // Check exists

        let viz = document.createElement("div");
        viz.id = "rt_visualizer";
        // Styling matches expected flex layout
        viz.style.cssText = "position: fixed; bottom: 0; left: 0; width: 100%; height: 100px; display: flex; align-items: flex-end; justify-content: center; opacity: 0.8; pointer-events: none; z-index: 2000;";

        // Bars
        const numBars = 64;
        for (let i = 0; i < numBars; i++) {
            let bar = document.createElement("div");
            // Improved transitions for color and height/opacity
            bar.style.cssText = "flex: 1; margin: 0 1px; background: white; transition: height 0.1s ease, background-color 0.5s ease, opacity 0.5s ease, box-shadow 0.5s ease; border-radius: 2px 2px 0 0;";
            bar.style.height = "2px";
            viz.appendChild(bar);
            bars.push(bar);
        }

        document.body.appendChild(viz);

        if (!active) viz.style.display = 'none';
        applyStyles();
    }



    function applyStyles() {
        const v = document.getElementById('rt_visualizer');
        if (v) {
            // Ensure visibility matches config
            v.style.display = (active && config.masterSwitch) ? 'flex' : 'none';
        }
    }

    function updateState() {
        active = config.visualizerActive;
        const v = document.getElementById('rt_visualizer');
        if (active && !v) create();
        else applyStyles();
    }

    // Called by Engines
    function updateBars(dataArray, bufferLength) {
        if (!active || !config.masterSwitch) return;

        const step = Math.floor(bufferLength / 64);
        let totalVol = 0;

        // Calculate average volume to detect silence
        for (let i = 0; i < 64; i++) {
            totalVol += dataArray[i * step] || 0;
        }
        const avgVol = totalVol / 64;
        const isSilent = avgVol < 5; // Threshold for silence

        for (let i = 0; i < 64; i++) {
            if (bars[i]) {
                if (isSilent) {
                    // Flatten and disappear
                    bars[i].style.height = "0px";
                    bars[i].style.opacity = "0";
                } else {
                    const val = dataArray[i * step] || 0;
                    const h = (val / 255) * 50; // Max 50% height
                    bars[i].style.height = Math.max(2, h) + "%";
                    bars[i].style.opacity = "1";
                }
            }
        }
    }

    function updateColor(ctx, width, height) {
        if (!active || !config.masterSwitch) return;
        const now = Date.now();
        if (now - lastColorCheck < 200) return; // Throttle 200ms
        lastColorCheck = now;

        const sx = Math.floor(width * 0.25);
        const sy = Math.floor(height * 0.25);
        const sw = Math.floor(width * 0.5);
        const sh = Math.floor(height * 0.5);

        if (sw < 1 || sh < 1) return;

        try {
            const data = ctx.getImageData(sx, sy, sw, sh).data;
            let r = 0, g = 0, b = 0, count = 0;
            const step = 4 * 10; // Skip pixels

            for (let i = 0; i < data.length; i += step) {
                r += data[i];
                g += data[i + 1];
                b += data[i + 2];
                count++;
            }

            if (count > 0) {
                r = Math.floor(r / count);
                g = Math.floor(g / count);
                b = Math.floor(b / count);

                // Brighten
                const factor = 1.3;
                r = Math.min(255, r * factor);
                g = Math.min(255, g * factor);
                b = Math.min(255, b * factor);

                const color = `rgb(${r},${g},${b})`;
                bars.forEach(bar => {
                    bar.style.background = color;
                    bar.style.boxShadow = `0 0 10px ${color}`;
                });
            }
        } catch (e) { }
    }

    return { init, updateState, create, updateBars, updateColor };
})();

// ----------------------------------------------------------------------
// EFFECT MANAGER (Hue Loop)
// ----------------------------------------------------------------------
const EffectManager = (() => {
    let loopId = null;
    let hue = 0;
    let lastTime = 0;

    function updateState() {
        if (config.hueLoop && config.masterSwitch) {
            if (!loopId) loopId = requestAnimationFrame(loop);
        } else {
            if (loopId) cancelAnimationFrame(loopId);
            loopId = null;
            document.documentElement.style.setProperty('--rt_hue-rotate', '0deg');
        }
    }

    function loop(timestamp) {
        if (!loopId) return;
        loopId = requestAnimationFrame(loop);

        if (timestamp - lastTime < 50) return; // 20fps for color cycle is enough
        lastTime = timestamp;

        hue = (hue + 1) % 360;
        document.documentElement.style.setProperty('--rt_hue-rotate', hue + 'deg');
    }

    return { updateState };
})();

// ----------------------------------------------------------------------
// MODERN (Single Canvas) - Global
// ----------------------------------------------------------------------
const ModernEngine = (() => {
    let loopId = null;
    let canvasState = {
        canvas: null,
        ctx: null,
        lastImageData: null,
        width: 0,
        height: 0
    };
    let state = {
        activeVideo: null,
        decibels: 0
    };
    let lastTime = 0;

    function start() {
        createProjector();
        applyGlobalStyles();
        loopId = requestAnimationFrame(loop);
    }

    function stop() {
        if (loopId) cancelAnimationFrame(loopId);
        loopId = null;
        canvasState.canvas = null;
        canvasState.ctx = null;
    }

    function createProjector() {
        if (document.getElementById('rt-container')) return;
        let container = document.createElement('div');
        container.id = 'rt-container';
        if (config.cameraShake) container.classList.add('camhand');
        if (!config.masterSwitch) container.style.display = 'none';

        const app = document.querySelector('ytd-app') || document.body;
        app.insertAdjacentElement('afterbegin', container);

        let c = document.createElement('canvas');
        c.setAttribute("oncontextmenu", "return false;");
        c.style.imageRendering = 'auto';
        container.appendChild(c);

        canvasState.canvas = c;
        canvasState.ctx = c.getContext('2d', { willReadFrequently: true, alpha: false });

        if (config.visualizerActive) VisualizerManager.create();
    }

    function findActiveVideo() {
        const videos = Array.from(document.querySelectorAll('video'));
        const playingVideos = videos.filter(v => !v.paused && v.style.display !== 'none' && v.src && v.readyState > 2);
        if (playingVideos.length === 0) return null;

        const shortsVideo = playingVideos.find(v => v.closest('ytd-reel-video-renderer'));
        if (shortsVideo) return shortsVideo;

        const mainVideo = playingVideos.find(v => !v.closest('ytd-miniplayer'));
        if (mainVideo) return mainVideo;

        return playingVideos[0];
    }

    function analyzeAudio() {
        if (!config.audioEnabled && !config.visualizerActive) {
            state.decibels = 0;
            return;
        }

        const analyser = AudioManager.getAnalyser();
        if (!analyser) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        AudioManager.getAudioData(dataArray);

        VisualizerManager.updateBars(dataArray, bufferLength);

        if (config.audioEnabled) {
            let sum = 0;
            for (let i = 0; i < bufferLength / 2; i++) sum += dataArray[i];
            let average = sum / (bufferLength / 2);
            state.decibels = average * (config.sensitivity / 50);
        } else {
            state.decibels = 0;
        }
    }

    function loop(timestamp) {
        if (!loopId) return;
        loopId = requestAnimationFrame(loop);

        if (!config.masterSwitch) return;
        if (timestamp - lastTime < config.framerate) return;
        lastTime = timestamp;

        const bestVideo = findActiveVideo();
        if (bestVideo) {
            if (state.activeVideo !== bestVideo) {
                state.activeVideo = bestVideo;
                canvasState.lastImageData = null;
                // Connect Audio Shared
                if (config.audioEnabled || config.visualizerActive) AudioManager.connect(state.activeVideo);
            }
        }

        if (!state.activeVideo || state.activeVideo.paused || state.activeVideo.ended) return;

        analyzeAudio();

        const cvs = canvasState.canvas;
        const ctx = canvasState.ctx;
        if (!cvs || !ctx) return;

        const videoW = state.activeVideo.videoWidth;
        const videoH = state.activeVideo.videoHeight;
        if (videoW === 0 || videoH === 0) return;

        let targetW = config.resolution;
        let targetH = Math.floor((videoH / videoW) * targetW);
        if (targetW < 1) targetW = 1;
        if (targetH < 1) targetH = 1;

        if (cvs.width !== targetW || cvs.height !== targetH) {
            cvs.width = targetW;
            cvs.height = targetH;
            canvasState.lastImageData = null;
        }

        let scale = 110;
        if (config.audioEnabled) scale += (state.decibels / 4);
        cvs.style.minWidth = scale + "%";
        cvs.style.minHeight = scale + "%";

        const alpha = 1 - (config.smoothness / 105);
        const effectiveAlpha = Math.max(0.01, Math.min(1, alpha));

        ctx.globalAlpha = 1;
        if (canvasState.lastImageData) ctx.putImageData(canvasState.lastImageData, 0, 0);
        ctx.globalAlpha = effectiveAlpha;
        ctx.drawImage(state.activeVideo, 0, 0, targetW, targetH);
        canvasState.lastImageData = ctx.getImageData(0, 0, targetW, targetH);

        VisualizerManager.updateColor(ctx, targetW, targetH);
    }

    return { start, stop };
})();


// ----------------------------------------------------------------------
// LEGACY (OLD - Dual Canvas)
// ----------------------------------------------------------------------
const LegacyEngine = (() => {
    let active = false;
    let canvasState = { canvas0: null, canvas1: null };
    let loopId = null;

    function start() {
        active = true;
        ModernEngine.start();
    }

    function stop() {
        active = false;
        if (loopId) cancelAnimationFrame(loopId);
        ModernEngine.stop();
    }

    return { start, stop };
})();


// ----------------------------------------------------------------------
// AMBIENT ENGINE (Smart Injection)
// ----------------------------------------------------------------------
const AmbientEngine = (() => {
    let loopId = null;
    let canvas = null;
    let ctx = null;
    let lastImageData = null;
    let activeVideo = null;
    let parentContainer = null;
    let observer = null;
    let lastTime = 0;
    let isActiveState = false;

    let state = {
        decibels: 0
    };

    function isActive() { return isActiveState; }

    function start() {
        isActiveState = true;
        // Start Loop
        loopId = requestAnimationFrame(loop);

        // Start Observer to detect video changes (Miniplayer, Shorts)
        observer = new MutationObserver(() => {
            checkInjection();
        });
        observer.observe(document.body, { childList: true, subtree: true });

        checkInjection();
    }

    function stop() {
        isActiveState = false;
        if (loopId) cancelAnimationFrame(loopId);
        if (observer) observer.disconnect();
        if (canvas) canvas.remove();
        canvas = null;
        ctx = null;
        lastImageData = null;
        activeVideo = null;
    }

    function findBestContainer(video) {
        // YT Music (Specific Request)
        // Check for song-video first if we are on YTM
        const songVideo = video.closest('#song-video');
        if (songVideo) return songVideo;

        // Also check #player-page or #layout for YTM fallback
        if (location.hostname.includes('music.youtube.com')) {
            const player = video.closest('ytmusic-player');
            if (player) return player;
        }

        // Shorts
        // Target the inner container that actually holds the video dimensions
        // Usually ytd-player or html5-video-player inside the reel
        const shorts = video.closest('ytd-reel-video-renderer');
        if (shorts) {
            const innerPlayer = shorts.querySelector('#player-container') || shorts;
            return innerPlayer;
        }

        // Miniplayer
        const mini = video.closest('ytd-miniplayer');
        if (mini) return mini;

        // Preview (Rich Item / Feed)
        // Usually hovering a thumbnail
        const preview = video.closest('#inline-player-container');
        if (preview) return preview;

        const richItem = video.closest('ytd-rich-item-renderer');
        if (richItem) {
            // Try to find the thumbnail container
            return richItem.querySelector('ytd-thumbnail') || richItem;
        }

        // Default Player (Main Video)
        const player = video.closest('#player-container') || video.closest('.html5-video-player');
        if (player) return player;

        return video.parentElement;
    }

    function checkInjection() {
        const videos = Array.from(document.querySelectorAll('video'));
        const playing = videos.find(v => !v.paused && v.style.display !== 'none' && v.readyState > 2);

        // If playing video changed, or canvas is missing
        if (playing) {
            // Check if we need to re-inject
            const newContainer = findBestContainer(playing);

            // If we have a canvas but it's not in the right place or video changed
            if (!canvas || !canvas.isConnected || activeVideo !== playing || parentContainer !== newContainer) {
                activeVideo = playing;
                injectCanvas(activeVideo);
                if (config.audioEnabled || config.visualizerActive) AudioManager.connect(activeVideo);
            }
        }
    }

    function updateConfig() {
        if (canvas) {
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.transform = `translate(-50%, -50%) scale(${config.ambientScale / 100})`;
            canvas.style.filter = `blur(${config.blur}px) saturate(${config.saturation}%) brightness(${config.brightness}%) contrast(${config.contrast}%) sepia(${config.sepia}%)`;
            canvas.style.opacity = config.opacity / 100;
        }
    }

    function injectCanvas(video) {
        if (canvas) canvas.remove();

        const container = findBestContainer(video);
        if (!container) return;
        parentContainer = container;

        canvas = document.createElement('canvas');
        canvas.id = 'rt-ambient-canvas';

        // Style
        // Sizing Fix: Use 100% W/H and then scale with transform to prevent cutting off
        // also use overflow: visible on container if possible? No, might break layout.
        // We use position absolute behind.
        canvas.style.cssText = `
            position: absolute;
            top: 50%;
            left: 50%;
            width: 100%;
            height: 100%;
            object-fit: cover;
            transform: translate(-50%, -50%) scale(${config.ambientScale / 100});
            z-index: -1;
            pointer-events: none;
            filter: blur(${config.blur}px) saturate(${config.saturation}%) brightness(${config.brightness}%) contrast(${config.contrast}%) sepia(${config.sepia}%) opacity(${config.opacity / 100});
        `;

        // Ensure container can hold absolute
        const style = getComputedStyle(container);
        if (style.position === 'static') {
            container.style.position = 'relative';
        }

        // For YTM #song-video, sometimes it has a specific layout.
        // Prepend is usually safe for "behind" if z-index is -1.
        container.prepend(canvas);

        ctx = canvas.getContext('2d', { willReadFrequently: true });
        lastImageData = null;
    }

    function analyzeAudio() {
        if (!config.audioEnabled && !config.visualizerActive) {
            state.decibels = 0;
            return;
        }

        const analyser = AudioManager.getAnalyser();
        if (!analyser) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        AudioManager.getAudioData(dataArray);

        VisualizerManager.updateBars(dataArray, bufferLength);

        if (config.audioEnabled) {
            let sum = 0;
            for (let i = 0; i < bufferLength / 2; i++) sum += dataArray[i];
            let average = sum / (bufferLength / 2);
            state.decibels = average * (config.sensitivity / 50);
        } else {
            state.decibels = 0;
        }
    }

    function loop(timestamp) {
        if (!loopId) return;
        loopId = requestAnimationFrame(loop);

        if (!config.masterSwitch || !config.ambientMode) return;
        if (timestamp - lastTime < config.framerate) return;
        lastTime = timestamp;

        if (!activeVideo || activeVideo.paused || !canvas || !ctx) {
            checkInjection();
            return;
        }

        analyzeAudio();

        // Draw Logic
        // Use natural dimensions
        const videoW = activeVideo.videoWidth;
        const videoH = activeVideo.videoHeight;
        if (!videoW || !videoH) return;

        let targetW = config.resolution;
        let targetH = Math.floor((videoH / videoW) * targetW);

        if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
            lastImageData = null;
        }

        // Live Apply Style props (Scale, Opacity etc)
        // Optimization: Apply only if changed? For now, assigning to style is okay.
        // Update opacity/scale from config + audio

        let currentScale = config.ambientScale / 100;
        if (config.audioEnabled && state.decibels > 0) {
            currentScale += (state.decibels / 500); // Slight bump
        }

        // Update transforms/filters
        // Note: Filters set in inject, can update here if needed.
        // canvas.style.filter = ... (expensive to set every frame? browser should optimize if string same)
        // We set it on updateConfig and inject.
        // But for audio reactivity on SCALE, we need to update transform.
        canvas.style.transform = `translate(-50%, -50%) scale(${currentScale})`;


        // Trail / Interpolation
        const alpha = 1 - (config.smoothness / 105);
        const effectiveAlpha = Math.max(0.01, Math.min(1, alpha));

        ctx.globalAlpha = 1;
        if (lastImageData) ctx.putImageData(lastImageData, 0, 0);

        ctx.globalAlpha = effectiveAlpha;
        ctx.drawImage(activeVideo, 0, 0, targetW, targetH);

        lastImageData = ctx.getImageData(0, 0, targetW, targetH);

        // Update Visualizer Color
        if (config.visualizerActive) {
            VisualizerManager.updateColor(ctx, targetW, targetH);
        }
    }

    return { start, stop, isActive, updateConfig };
})();