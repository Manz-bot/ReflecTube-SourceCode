// Default Configuration
let config = {
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
    framerate: 30,    // Time in ms between checks
    smoothness: 60,   // 0-100, controls the fade factor
    resolution: 80,   // Pixel width of the internal canvas
    legacyMode: false, // Switch between Modern (One Canvas) and Legacy (Dual Canvas)
    pointerActive: false, // Inverted pointer follow
    visualizerActive: false // Dynamic visualizer
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
        if (config.legacyMode !== oldLegacy) {
            restartEngine();
        } else {
            // Optional: Live update logic
            // LegacyEngine handles its own config updates in loop usually
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

    // Camera Intensity
    const factor = config.cameraIntensity / 50;
    root.style.setProperty('--fuerza', factor.toFixed(2));
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

    // Clear Container
    let container = document.getElementById('rt-container');
    if (container) {
        container.innerHTML = '';
        container.remove();
    }

    if (config.legacyMode) {
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

                // Invert factor (adjust sensitivity here, e.g. -20px max)
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
        const container = document.getElementById('rt-container'); // Need parent?
        // Actually usually visualizers are overlaid or underlaid.
        // Let's create it in body or rt-container?
        // User's provided code puts it in `container`.

        let viz = document.createElement("div");
        viz.id = "rt_visualizer";
        // Styling matches expected flex layout
        viz.style.cssText = "position: fixed; bottom: 0; left: 0; width: 100%; height: 100px; display: flex; align-items: flex-end; justify-content: center; opacity: 0.8; pointer-events: none; z-index: 10;";

        // Bars
        const numBars = 64;
        for (let i = 0; i < numBars; i++) {
            let bar = document.createElement("div");
            bar.style.cssText = "flex: 1; margin: 0 1px; background: white; transition: height 0.05s ease; border-radius: 2px 2px 0 0;";
            bar.style.height = "2px";
            viz.appendChild(bar);
            bars.push(bar);
        }

        //container.appendChild(viz);
        document.body.appendChild(viz);

        if (!active) viz.style.display = 'none';
    }

    function updateState() {
        active = config.visualizerActive;
        const v = document.getElementById('rt_visualizer');
        if (v) v.style.display = (active && config.masterSwitch) ? 'flex' : 'none';
        if (active && !v) create();
    }

    function tick(audioAnalysers, canvasCtx) {
        if (!active || !config.masterSwitch || !document.getElementById('rt_visualizer')) return;

        // Get frequency data
        // Audio might be in ModernEngine.audioState or LegacyEngine.audioState
        // This is tricky as engines are separate.
        // We will assume engines expose data or we tap into the active one.
        // Current implementation keeps audio state inside Engine closures.
        // We should probably rely on Engines passing data TO us OR we make AudioState global.
        // For now, I'll modify Engines (in `analyzeAudio`) to update Visualizer IF they have data.
    }

    // Called by Engines
    function updateBars(dataArray, bufferLength) {
        if (!active || !config.masterSwitch) return;

        // Sample bars
        const step = Math.floor(bufferLength / 64);

        for (let i = 0; i < 64; i++) {
            if (bars[i]) {
                const val = dataArray[i * step] || 0;
                const h = (val / 255) * 50; // Max 50% height
                bars[i].style.height = Math.max(2, h) + "%";
            }
        }
    }

    function updateColor(ctx, width, height) {
        if (!active || !config.masterSwitch) return;
        const now = Date.now();
        if (now - lastColorCheck < 200) return; // Throttle 200ms
        lastColorCheck = now;

        // Optimized Color Extraction (Center Sample + Skip)
        // Sample center 50%
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

                // Keep bars white-ish or colored? User said "Dynamic Colors".
                // Let's set the bar background.
                document.getElementById('rt_visualizer').style.setProperty('--viz-color', color);

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
// MODERN (Single Canvas)
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
    let audioState = {
        context: null,
        analyser: null,
        source: null,
        isInitialized: false,
        currentMediaElement: null
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

        // Re-create Viz if needed
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

    function initAudio(videoElement) {
        if (audioState.isInitialized && audioState.currentMediaElement === videoElement) return;
        try {
            if (!audioState.context) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                audioState.context = new AudioContext();
                audioState.analyser = audioState.context.createAnalyser();
                audioState.analyser.connect(audioState.context.destination);
                audioState.analyser.smoothingTimeConstant = 0.85;
                audioState.analyser.fftSize = 512;
            }
            if (!videoElement._rt_source) {
                audioState.source = audioState.context.createMediaElementSource(videoElement);
                videoElement._rt_source = audioState.source;
                videoElement._rt_source.connect(audioState.analyser);
            }
            audioState.currentMediaElement = videoElement;
            audioState.isInitialized = true;
            if (audioState.context.state === 'suspended') audioState.context.resume();
        } catch (e) { }
    }

    function analyzeAudio() {
        if (!audioState.isInitialized || (!config.audioEnabled && !config.visualizerActive)) {
            state.decibels = 0;
            return;
        }
        const bufferLength = audioState.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        audioState.analyser.getByteFrequencyData(dataArray);

        // Feed Visualizer
        VisualizerManager.updateBars(dataArray, bufferLength);

        let sum = 0;
        for (let i = 0; i < bufferLength / 2; i++) sum += dataArray[i];
        let average = sum / (bufferLength / 2);
        if (config.audioEnabled) {
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
                if (config.audioEnabled || config.visualizerActive) initAudio(state.activeVideo);
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

        // Visualizer Color Update (using low res canvas)
        VisualizerManager.updateColor(ctx, targetW, targetH);
    }

    return { start, stop };
})();


// ----------------------------------------------------------------------
// LEGACY (OLD - Dual Canvas)
// ----------------------------------------------------------------------
const LegacyEngine = (() => {
    let active = false;
    let canvasState = {
        canvas0: null,
        canvas1: null,
    };
    let state = {
        activeVideo: null,
        decibels: 0,
        isShorts: false
    };
    let audioState = {
        context: null,
        analyser: null,
        source: null,
        isInitialized: false,
        currentMediaElement: null
    };

    let toggle = false;
    let lastTime = 0;
    let loopId = null;

    function start() {
        active = true;
        createProjector();
        loop();
    }

    function stop() {
        active = false;
        if (loopId) cancelAnimationFrame(loopId);
        loopId = null;
        canvasState.canvas0 = null;
        canvasState.canvas1 = null;
    }

    function createProjector() {
        if (document.getElementById('rt-container')) return;

        let container = document.createElement('div');
        container.id = 'rt-container';

        if (config.cameraShake) container.classList.add('camhand');
        if (!config.masterSwitch) container.style.display = 'none';

        const app = document.querySelector('ytd-app') || document.body;
        app.insertAdjacentElement('afterbegin', container);

        let c0 = document.createElement('canvas');
        let c1 = document.createElement('canvas');

        c0.setAttribute("oncontextmenu", "return false;");
        c1.setAttribute("oncontextmenu", "return false;");

        container.appendChild(c0);
        container.appendChild(c1);

        canvasState.canvas0 = c0;
        canvasState.canvas1 = c1;

        // Re-create Viz if needed
        if (config.visualizerActive) VisualizerManager.create();
    }

    function findActiveVideo() {
        const videos = Array.from(document.querySelectorAll('video'));
        const playingVideos = videos.filter(v =>
            !v.paused &&
            v.style.display !== 'none' &&
            v.src &&
            v.readyState > 2
        );

        if (playingVideos.length === 0) return null;

        const shortsVideo = playingVideos.find(v => v.closest('ytd-reel-video-renderer'));
        if (shortsVideo) return { element: shortsVideo, isShorts: true };

        const mainVideo = playingVideos.find(v => !v.closest('ytd-miniplayer'));
        if (mainVideo) return { element: mainVideo, isShorts: false };

        return { element: playingVideos[0], isShorts: false };
    }

    function initAudio(videoElement) {
        if (audioState.isInitialized && audioState.currentMediaElement === videoElement) return;

        try {
            if (!audioState.context) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                audioState.context = new AudioContext();
                audioState.analyser = audioState.context.createAnalyser();
                audioState.analyser.connect(audioState.context.destination);
                audioState.analyser.smoothingTimeConstant = 0.85;
                audioState.analyser.fftSize = 512;
            }

            if (!videoElement._rt_source) {
                audioState.source = audioState.context.createMediaElementSource(videoElement);
                videoElement._rt_source = audioState.source;
                videoElement._rt_source.connect(audioState.analyser);
            }

            audioState.currentMediaElement = videoElement;
            audioState.isInitialized = true;

            if (audioState.context.state === 'suspended') {
                audioState.context.resume();
            }

        } catch (e) { }
    }

    function analyzeAudio() {
        if (!audioState.isInitialized || (!config.audioEnabled && !config.visualizerActive)) {
            state.decibels = 0;
            return;
        }

        const bufferLength = audioState.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        audioState.analyser.getByteFrequencyData(dataArray);

        // Feed Visualizer
        VisualizerManager.updateBars(dataArray, bufferLength);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        let average = sum / bufferLength;

        const factor = config.sensitivity / 50;
        if (config.audioEnabled) {
            state.decibels = average * factor;
        } else {
            state.decibels = 0;
        }
    }

    function loop(timestamp) {
        if (!active) return;
        loopId = requestAnimationFrame(loop);

        if (!config.masterSwitch) return;

        // Throttle 
        if (timestamp - lastTime < config.framerate) return;
        lastTime = timestamp;

        const bestVideo = findActiveVideo();

        if (bestVideo) {
            if (state.activeVideo !== bestVideo.element) {
                state.activeVideo = bestVideo.element;
                state.isShorts = bestVideo.isShorts;
                if (config.audioEnabled || config.visualizerActive) initAudio(state.activeVideo);
            }
        }

        if (!state.activeVideo || state.activeVideo.paused || state.activeVideo.ended) {
            return;
        }

        analyzeAudio();

        const targetCanvas = toggle ? canvasState.canvas1 : canvasState.canvas0;
        const hiddenCanvas = toggle ? canvasState.canvas0 : canvasState.canvas1;

        if (!targetCanvas || !hiddenCanvas) return;

        // Size Sync - Legacy uses full video resolution for quality
        if (state.activeVideo.videoWidth > 0 && state.activeVideo.videoHeight > 0) {
            // Note: Use videoWidth/Height instead of style unless style is key. 
            // In OLD code it used style if present. Safer to use videoWidth.
            if (targetCanvas.width !== state.activeVideo.videoWidth || targetCanvas.height !== state.activeVideo.videoHeight) {
                targetCanvas.width = state.activeVideo.videoWidth;
                targetCanvas.height = state.activeVideo.videoHeight;
            }
        }

        // Audio Reactivity
        let scale = 110;
        if (config.audioEnabled) {
            scale += (state.decibels / 4);
        }
        targetCanvas.style.minWidth = scale + "%";
        targetCanvas.style.minHeight = scale + "%";

        const ctx = targetCanvas.getContext('2d', { alpha: false, willReadFrequently: true });

        // Filter Mapping
        ctx.filter = `blur(${config.blur}px) saturate(${config.saturation}%) brightness(${config.brightness}%) contrast(${config.contrast}%) sepia(${config.sepia}%)`;

        ctx.drawImage(state.activeVideo, 0, 0, targetCanvas.width, targetCanvas.height);

        targetCanvas.style.opacity = 1;
        hiddenCanvas.style.opacity = 0;

        // Visualizer Color
        VisualizerManager.updateColor(ctx, targetCanvas.width, targetCanvas.height);

        toggle = !toggle;
    }

    return { start, stop };
})();