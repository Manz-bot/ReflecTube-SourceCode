// Default Configuration
let config = {
    masterSwitch: true,
    opacity: 100,
    blur: 20,
    saturation: 100,
    brightness: 75,
    contrast: 100,
    sepia: 0,
    invert: 0,
    hueLoop: false,
    sharpness: 0,
    highlights: 100,
    shadows: 100,
    sensitivity: 50,
    audioEnabled: true,
    cameraShake: false,
    cameraIntensity: 50,
    framerate: 30,    // Time in ms between checks
    smoothness: 60,   // 0-100, controls the fade factor
    resolution: 100,   // Pixel width of the internal canvas
    pointerActive: false, // Inverted pointer follow
    visualizerActive: false, // Dynamic visualizer
    visualizerType: 'bars', // Visualizer style: bars, soundwave, ocean
    ambientMode: false, // Smart Ambient Mode
    ambientScale: 110, // Scale %
    musicOnly: true // Only activate audio reactivity on music videos
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
        const oldAmbient = config.ambientMode;
        config = { ...config, ...request.payload };

        applyGlobalStyles();

        // Handle Master Switch Toggle
        const container = document.getElementById('rt-container');
        if (container) {
            // But basic visibility:
            container.style.display = config.masterSwitch ? 'flex' : 'none';
        }

        // Pointer Update
        PointerManager.updateState();

        // Visualizer Update
        VisualizerManager.updateState();

        // Ensure Audio is Ready if newly enabled
        if (isAudioActive() || config.visualizerActive) {
            AudioManager.resume();
        }

        // Handle Mode Switch or Re-init
        if (config.ambientMode !== oldAmbient) {
            restartEngine();
        } else {
            // Live update for active engine if needed
            if (config.ambientMode && AmbientEngine.isActive()) {
                AmbientEngine.updateConfig();
            }
        }
    }

    if (request.type === 'GET_FPS') {
        sendResponse({ fps: ModernEngine.getFps ? ModernEngine.getFps() : 0 });
        return true;
    }
});

// ----------------------------------------------------------------------
// MUSIC VIDEO DETECTION
// ----------------------------------------------------------------------
function isMusicVideo() {
    // 1. YouTube Music domain — always music
    if (location.hostname.includes('music.youtube.com')) return true;

    // 2. Check ytmusic-player element (YTM embedded)
    if (document.querySelector('ytmusic-player')) return true;

    // 3. Check LD+JSON microformat (updates on SPA navigation, unlike meta tags)
    try {
        const microformatScript = document.querySelector('#microformat script[type="application/ld+json"]');
        if (microformatScript) {
            const data = JSON.parse(microformatScript.textContent);
            if (data.genre && data.genre.toLowerCase().includes('music')) return true;
        }
    } catch (e) { /* JSON parse error, skip */ }

    // 4. Check ytInitialPlayerResponse (fallback for genre detection)
    try {
        const playerResponse = window.ytInitialPlayerResponse;
        if (playerResponse?.microformat?.playerMicroformatRenderer?.category) {
            const category = playerResponse.microformat.playerMicroformatRenderer.category.toLowerCase();
            if (category.includes('music')) return true;
        }
    } catch (e) { /* skip */ }

    // 5. Check for YouTube music badge in the player
    if (document.querySelector('span.ytp-music-badge')) return true;

    // 6. Check for "Music" in the video category info
    const categoryEl = document.querySelector('#info-rows yt-formatted-string a[href*="/channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ"]');
    if (categoryEl) return true; // Links to YouTube Music category channel

    return false;
}

// Returns true if audio effects should be active right now
// Combines audioEnabled toggle + musicOnly filter (evaluated per-frame for instant response)
function isAudioActive() {
    if (!config.audioEnabled) return false;
    if (config.musicOnly && !isMusicVideo()) return false;
    return true;
}

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

    // New filter variables
    root.style.setProperty('--rt_sharpness', (config.sharpness || 0));
    root.style.setProperty('--rt_highlights', (config.highlights || 100) + '%');
    root.style.setProperty('--rt_shadows', (config.shadows || 100) + '%');

    if (!config.hueLoop) {
        root.style.setProperty('--rt_hue-rotate', '0deg');
    }

    // Camera Intensity
    const factor = config.cameraIntensity / 50;
    root.style.setProperty('--fuerza', factor.toFixed(2));

    // Apply SVG filters to container based on sharpness/highlights/shadows
    if (container) {
        updateContainerFilters(container);
    }

    // Effect Update
    EffectManager.updateState();
}

function updateContainerFilters(container) {
    // Build filter string with SVG filter references when applicable
    let filters = [];

    // Base CSS filters
    filters.push(`blur(var(--rt_blur))`);
    filters.push(`contrast(var(--rt_contrast))`);
    filters.push(`grayscale(var(--rt_grayscale))`);
    filters.push(`hue-rotate(var(--rt_hue-rotate))`);
    filters.push(`invert(var(--rt_invert))`);
    filters.push(`opacity(var(--rt_opacity))`);
    filters.push(`saturate(var(--rt_saturate))`);
    filters.push(`sepia(var(--rt_sepia))`);
    filters.push(`brightness(var(--rt_brightness))`);

    // Add sharpen if sharpness > 0
    if (config.sharpness > 0) {
        filters.push(`url(#sharpen-${Math.round(config.sharpness)})`);
    }

    // Add color adjustment if highlights or shadows differ from 100
    if (config.highlights !== 100 || config.shadows !== 100) {
        updateColorAdjustFilter(); // Update the filter values dynamically
        filters.push(`url(#color-adjust)`);
    }

    container.style.filter = filters.join(' ');
}

function init() {
    applyGlobalStyles();
    injectVideoQualityFilters(); // Inject SVG filters for video enhancement
    PointerManager.init();
    VisualizerManager.init();
    restartEngine();
}

// ----------------------------------------------------------------------
// VIDEO QUALITY SVG FILTERS
// ----------------------------------------------------------------------
function injectVideoQualityFilters() {
    if (document.getElementById('vq-svg-filters')) return; // Already injected

    // Generate sharpness filters for different intensity levels (0-100 in steps of 10)
    let sharpenFilters = '';
    for (let i = 10; i <= 100; i += 10) {
        // kernelMatrix intensity scales with sharpness value
        const intensity = 0.1 + (i / 100) * 0.9; // 0.1 to 1.0
        const center = 1 + (intensity * 3); // 1 to 4
        const edge = -intensity; // 0 to -1
        sharpenFilters += `
            <filter id="sharpen-${i}">
                <feConvolveMatrix order="3" preserveAlpha="true"
                    kernelMatrix="0 ${edge.toFixed(2)} 0
                                 ${edge.toFixed(2)} ${center.toFixed(2)} ${edge.toFixed(2)}
                                  0 ${edge.toFixed(2)} 0"/>
            </filter>`;
    }

    const svgContainer = document.createElement('div');
    svgContainer.id = 'vq-svg-filters';
    svgContainer.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden;">
            <defs>
                ${sharpenFilters}
                
                <!-- Color Adjustment Filter: Dynamic Highlights/Shadows -->
                <filter id="color-adjust">
                    <feComponentTransfer>
                        <feFuncR type="gamma" amplitude="1" exponent="1" offset="0"/>
                        <feFuncG type="gamma" amplitude="1" exponent="1" offset="0"/>
                        <feFuncB type="gamma" amplitude="1" exponent="1" offset="0"/>
                    </feComponentTransfer>
                </filter>
            </defs>
        </svg>
    `;
    document.body.insertAdjacentElement('afterbegin', svgContainer);
}

// Update the color-adjust filter dynamically based on highlights/shadows
function updateColorAdjustFilter() {
    const filter = document.getElementById('color-adjust');
    if (!filter) return;

    // Convert 50-150 range to amplitude/exponent adjustments
    // highlights > 100 = brighter highlights, shadows > 100 = brighter shadows
    const highlightsVal = (config.highlights || 100) / 100; // 0.5 to 1.5
    const shadowsVal = (config.shadows || 100) / 100;

    // Gamma exponent: < 1 brightens shadows, > 1 darkens shadows
    // Amplitude affects overall brightness
    const exponent = 1 / highlightsVal; // Inverse for highlights control
    const amplitude = shadowsVal;

    filter.innerHTML = `
        <feComponentTransfer>
            <feFuncR type="gamma" amplitude="${amplitude.toFixed(3)}" exponent="${exponent.toFixed(3)}" offset="0"/>
            <feFuncG type="gamma" amplitude="${amplitude.toFixed(3)}" exponent="${exponent.toFixed(3)}" offset="0"/>
            <feFuncB type="gamma" amplitude="${amplitude.toFixed(3)}" exponent="${exponent.toFixed(3)}" offset="0"/>
        </feComponentTransfer>
    `;
}

function restartEngine() {
    // Teardown
    ModernEngine.stop();
    AmbientEngine.stop();
    if (typeof WebGLEngine !== 'undefined') WebGLEngine.stop();

    // Clear Container (Global Projector)
    let container = document.getElementById('rt-container');
    if (container) {
        container.innerHTML = '';
        container.remove();
    }

    // Start appropriate engine
    if (config.ambientMode) {
        AmbientEngine.start();
    } else if (config.webglActive && typeof WebGLEngine !== 'undefined') {
        WebGLEngine.init();
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

                // Auto-resume on user interaction
                const resumeHandler = () => {
                    if (context && context.state === 'suspended') {
                        context.resume().then(() => {
                            // Remove listeners once resumed? 
                            // Keep them just in case browser suspends it again (unlikely but possible)
                        });
                    }
                };

                document.addEventListener('click', resumeHandler);
                document.addEventListener('keydown', resumeHandler);

            } catch (e) {
                console.error("Reflectube Audio Init Error:", e);
            }
        }
    }

    function resume() {
        if (context && context.state === 'suspended') {
            context.resume();
        }
    }

    function connect(videoElement) {
        if (!videoElement) return;
        init();

        // Try to resume immediately
        resume();

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

    return { init, connect, resume, getAnalyser, getAudioData };
})();

// ----------------------------------------------------------------------
// VISUALIZER MANAGER (Canvas Logic)
// ----------------------------------------------------------------------
const VisualizerManager = (() => {
    let active = false;
    let canvas = null;
    let ctx = null;
    let lastColorCheck = 0;

    // Smooth color transition
    let targetColor = { r: 255, g: 255, b: 255 };
    let currentColorRGB = { r: 255, g: 255, b: 255 };
    const colorLerpSpeed = 0.05; // Slower = smoother transitions

    // For Ocean wave effect
    let waveOffset = 0;

    // For Bubbles effect
    let bubbles = [];

    function init() {
        updateState();
    }

    function create() {
        if (document.getElementById('rt_visualizer_canvas')) return;

        canvas = document.createElement("canvas");
        canvas.id = "rt_visualizer_canvas";
        canvas.style.cssText = "position: fixed; bottom: 0; left: 0; width: 100%; height: 120px; opacity: 0.85; pointer-events: none; z-index: 99;";

        // Logical resolution for crisp rendering
        canvas.width = window.innerWidth;
        canvas.height = 120;

        document.body.appendChild(canvas);
        ctx = canvas.getContext('2d', { alpha: true });

        // Handle resize
        window.addEventListener('resize', () => {
            if (canvas) canvas.width = window.innerWidth;
        });

        if (!active) canvas.style.display = 'none';
        applyStyles();
    }

    function applyStyles() {
        if (canvas) {
            canvas.style.display = (active && config.masterSwitch) ? 'block' : 'none';
        }
    }

    function updateState() {
        active = config.visualizerActive;
        const v = document.getElementById('rt_visualizer_canvas');
        if (active && !v) create();
        else applyStyles();
    }

    // Smooth color interpolation
    function lerpColor() {
        currentColorRGB.r += (targetColor.r - currentColorRGB.r) * colorLerpSpeed;
        currentColorRGB.g += (targetColor.g - currentColorRGB.g) * colorLerpSpeed;
        currentColorRGB.b += (targetColor.b - currentColorRGB.b) * colorLerpSpeed;
    }

    function getCurrentColor() {
        return `rgb(${Math.round(currentColorRGB.r)},${Math.round(currentColorRGB.g)},${Math.round(currentColorRGB.b)})`;
    }

    // Called by Engines - Main render dispatcher
    function updateBars(dataArray, bufferLength) {
        if (!active || !config.masterSwitch || !ctx || !canvas) return;

        // Smooth color transition each frame
        lerpColor();

        const type = config.visualizerType || 'bars';

        switch (type) {
            case 'soundwave':
                renderSoundwave(dataArray, bufferLength);
                break;
            case 'ocean':
                renderOcean(dataArray, bufferLength);
                break;
            case 'bubbles':
                renderBubbles(dataArray, bufferLength);
                break;
            case 'bars':
            default:
                renderBars(dataArray, bufferLength);
                break;
        }
    }

    // ========== BARS VISUALIZER ==========
    function renderBars(dataArray, bufferLength) {
        const width = canvas.width;
        const height = canvas.height;
        const barCount = 64;
        const barWidth = width / barCount;
        const step = Math.floor(bufferLength / barCount);

        ctx.clearRect(0, 0, width, height);

        const color = getCurrentColor();
        ctx.fillStyle = color;
        ctx.shadowBlur = 15;
        ctx.shadowColor = color;

        let x = 0;
        for (let i = 0; i < barCount; i++) {
            const val = dataArray[i * step] || 0;
            const barHeight = (val / 255) * height * 0.85;

            if (barHeight > 2) {
                // Gradient bar from bottom to top
                const gradient = ctx.createLinearGradient(x, height, x, height - barHeight);
                gradient.addColorStop(0, color);
                gradient.addColorStop(1, `rgba(${Math.round(currentColorRGB.r)},${Math.round(currentColorRGB.g)},${Math.round(currentColorRGB.b)},0.3)`);
                ctx.fillStyle = gradient;

                // Rounded bars
                const radius = Math.min(barWidth / 4, 3);
                ctx.beginPath();
                ctx.roundRect(x + 1, height - barHeight, barWidth - 3, barHeight, [radius, radius, 0, 0]);
                ctx.fill();
            }
            x += barWidth;
        }
    }

    // ========== SOUNDWAVE VISUALIZER ==========
    function renderSoundwave(dataArray, bufferLength) {
        const width = canvas.width;
        const height = canvas.height;
        const centerY = height / 2;

        ctx.clearRect(0, 0, width, height);

        const color = getCurrentColor();
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 20;
        ctx.shadowColor = color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Main wave
        ctx.beginPath();
        const sliceWidth = width / bufferLength;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const val = dataArray[i] / 255;
            const y = centerY + (val - 0.12) * height * 0.8;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            x += sliceWidth;
        }
        if (dataArray.every(val => val === 0)) {
            ctx.strokeStyle = "rgba(255, 255, 255, 0)";
        }
        ctx.stroke();
        // Mirror wave (reflected, more transparent)
        ctx.globalAlpha = 1;
        ctx.beginPath();
        x = 0;
        for (let i = 0; i < bufferLength; i++) {
            const val = dataArray[i] / 255;
            const y = centerY - (val - 0.82) * height * 0.6;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
            x += sliceWidth;
        }
        ctx.stroke();
        ctx.globalAlpha = 0.3;
    }

    // ========== OCEAN WAVE VISUALIZER ==========
    function renderOcean(dataArray, bufferLength) {
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);

        const color = getCurrentColor();

        // Calculate average amplitude for wave intensity
        let avgAmplitude = 0;
        for (let i = 0; i < bufferLength; i++) {
            avgAmplitude += dataArray[i];
        }
        avgAmplitude = (avgAmplitude / bufferLength) / 255;

        // Animate wave offset - faster when louder
        waveOffset += 0.02 + avgAmplitude * 0.08;

        // Dynamic base Y position - waves stay at bottom when quiet, rise when loud
        const baseY = height * (0.7 + (1 - avgAmplitude) * 0.25); // 70% to 95% from top

        // Draw multiple layered waves
        for (let layer = 0; layer < 3; layer++) {
            const layerAlpha = (0.4 + avgAmplitude * 0.3) - layer * 0.1;
            // Amplitude scales dramatically with audio
            const layerAmplitude = (5 + avgAmplitude * 35) * (1 - layer * 0.25);
            const layerFrequency = 0.006 + layer * 0.002;
            const layerOffset = waveOffset * (1 + layer * 0.4);
            const layerY = baseY + layer * 8;

            ctx.beginPath();
            ctx.moveTo(0, height);

            for (let x = 0; x <= width; x += 2) {
                // Combine multiple sine waves for organic look
                const y = layerY +
                    Math.sin(x * layerFrequency + layerOffset) * layerAmplitude +
                    Math.sin(x * layerFrequency * 2.5 + layerOffset * 1.3) * (layerAmplitude * 0.5) +
                    Math.sin(x * layerFrequency * 0.7 + layerOffset * 0.6) * (layerAmplitude * 0.3);
                ctx.lineTo(x, y);
            }

            ctx.lineTo(width, height);
            ctx.closePath();

            // Gradient fill
            const gradient = ctx.createLinearGradient(0, layerY - layerAmplitude, 0, height);
            gradient.addColorStop(0, `rgba(${Math.round(currentColorRGB.r)},${Math.round(currentColorRGB.g)},${Math.round(currentColorRGB.b)},${layerAlpha})`);
            gradient.addColorStop(1, `rgba(${Math.round(currentColorRGB.r)},${Math.round(currentColorRGB.g)},${Math.round(currentColorRGB.b)},0.05)`);

            ctx.fillStyle = gradient;
            ctx.shadowBlur = 8;
            ctx.shadowColor = color;
            ctx.fill();
        }
    }

    // ========== BUBBLES VISUALIZER ==========
    function renderBubbles(dataArray, bufferLength) {
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);

        const color = getCurrentColor();

        // Calculate average amplitude
        let avgAmplitude = 0;
        for (let i = 0; i < bufferLength; i++) {
            avgAmplitude += dataArray[i];
        }
        avgAmplitude = (avgAmplitude / bufferLength) / 255;

        // Spawn new bubbles based on audio intensity
        const spawnRate = Math.floor(avgAmplitude * 5) + 1; // 1-6 bubbles per frame
        for (let i = 0; i < spawnRate; i++) {
            if (bubbles.length < 100 && Math.random() < avgAmplitude + 0.1) {
                bubbles.push({
                    x: Math.random() * width,
                    y: height + 20,
                    baseSize: 3 + Math.random() * 12,
                    speed: 0.5 + Math.random() * 2 + avgAmplitude * 2,
                    wobble: Math.random() * Math.PI * 2,
                    wobbleSpeed: 0.02 + Math.random() * 0.03,
                    opacity: 0.6 + Math.random() * 0.4
                });
            }
        }

        // Update and draw bubbles
        ctx.shadowBlur = 15;
        ctx.shadowColor = color;

        for (let i = bubbles.length - 1; i >= 0; i--) {
            const b = bubbles[i];

            // Move upward
            b.y -= b.speed;
            b.wobble += b.wobbleSpeed;

            // Horizontal wobble
            const wobbleX = Math.sin(b.wobble) * 2;

            // Fade out as it rises
            b.opacity -= 0.003;

            // Size reacts to current audio
            const sizeMultiplier = 0.6 + avgAmplitude * 1.2;
            const currentSize = b.baseSize * sizeMultiplier;

            // Remove if off screen or faded
            if (b.y < -currentSize || b.opacity <= 0) {
                bubbles.splice(i, 1);
                continue;
            }

            // Draw bubble
            ctx.beginPath();
            ctx.arc(b.x + wobbleX, b.y, currentSize, 0, Math.PI * 2);

            // Gradient for 3D effect
            const gradient = ctx.createRadialGradient(
                b.x + wobbleX - currentSize * 0.3, b.y - currentSize * 0.3, 0,
                b.x + wobbleX, b.y, currentSize
            );
            gradient.addColorStop(0, `rgba(255,255,255,${b.opacity * 0.5})`);
            gradient.addColorStop(0.4, `rgba(${Math.round(currentColorRGB.r)},${Math.round(currentColorRGB.g)},${Math.round(currentColorRGB.b)},${b.opacity * 0.7})`);
            gradient.addColorStop(1, `rgba(${Math.round(currentColorRGB.r)},${Math.round(currentColorRGB.g)},${Math.round(currentColorRGB.b)},${b.opacity * 0.2})`);

            ctx.fillStyle = gradient;
            ctx.fill();

            // Bubble outline
            ctx.strokeStyle = `rgba(255,255,255,${b.opacity * 0.3})`;
            ctx.lineWidth = 1;
            ctx.stroke();
        }
    }

    function updateColor(ctxSource, width, height) {
        if (!active || !config.masterSwitch) return;
        const now = Date.now();
        if (now - lastColorCheck < 300) return; // Throttle 300ms
        lastColorCheck = now;

        // Sample center 50% of the screen
        const sx = Math.floor(width * 0.25);
        const sy = Math.floor(height * 0.25);
        const sw = Math.floor(width * 0.5);
        const sh = Math.floor(height * 0.5);

        if (sw < 1 || sh < 1) return;

        try {
            const data = ctxSource.getImageData(sx, sy, sw, sh).data;
            let totalScore = 0;
            let totalR = 0;
            let totalG = 0;
            let totalB = 0;

            // Optimization: Skip pixels (step 20 = examine ~5% of pixels)
            const step = 4 * 20;

            for (let i = 0; i < data.length; i += step) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];

                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                const range = max - min;

                const score = (range * range) * max;

                if (score > 1000) {
                    totalR += r * score;
                    totalG += g * score;
                    totalB += b * score;
                    totalScore += score;
                }
            }

            if (totalScore > 0) {
                let finalR = Math.floor(totalR / totalScore);
                let finalG = Math.floor(totalG / totalScore);
                let finalB = Math.floor(totalB / totalScore);

                const boost = 1.2;
                finalR = Math.min(255, finalR * boost);
                finalG = Math.min(255, finalG * boost);
                finalB = Math.min(255, finalB * boost);

                // Set target color for smooth interpolation
                targetColor = { r: finalR, g: finalG, b: finalB };
            } else {
                targetColor = { r: 200, g: 200, b: 200 };
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
// VIDEO MANAGER (Optimization)
// ----------------------------------------------------------------------
const VideoManager = (() => {
    let videos = new Set();
    let observer = null;

    function init() {
        updateList();
        if (!observer) {
            observer = new MutationObserver((mutations) => {
                // Optimization: Debounce or just check type?
                updateList();
            });
            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    function updateList() {
        const nodelist = document.querySelectorAll('video');
        videos = new Set(nodelist);
    }

    function findActive() {
        // Efficient search through cached Set
        for (let v of videos) {
            // Check src to avoid empty video placeholders
            if (!v.paused && v.style.display !== 'none' && v.readyState > 2 && v.src && v.src !== '') {
                // Prioritize Shorts/Main
                if (v.closest('ytd-reel-video-renderer')) return v;
                if (!v.closest('ytd-miniplayer')) return v; // Main player preference
                return v; // Fallback
            }
        }
        return null; // No valid active video found
    }

    return { init, findActive };
})();



// ----------------------------------------------------------------------
// THUMBNAIL MANAGER (Fallback for Audio Mode)
// ----------------------------------------------------------------------
const ThumbnailManager = (() => {
    let currentId = null;
    let currentImage = null;
    let isLoading = false;

    function getVideoId() {
        // Try URL param first (most reliable for YT/YTM)
        const urlParams = new URLSearchParams(window.location.search);
        const v = urlParams.get('v');
        if (v) return v;
        return null;
    }

    function getThumbnail(id) {
        if (!id) return null;

        if (currentId === id) {
            return currentImage; // Return image only if loaded
        }

        // New ID, fetch
        currentId = id;
        currentImage = null; // Reset
        isLoading = true;

        loadBestThumbnail(id).then(img => {
            if (currentId === id) {
                currentImage = img;
                isLoading = false;
            }
        });

        return null; // Not ready yet
    }

    async function loadBestThumbnail(id) {
        // Try qualities in order
        const qualities = [
            `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
            `https://i.ytimg.com/vi/${id}/hq720.jpg`,
            `https://i.ytimg.com/vi/${id}/sddefault.jpg`,
            `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
        ];

        for (let src of qualities) {
            try {
                const img = await loadImage(src);
                return img;
            } catch (e) {
                // Try next
                continue;
            }
        }
        return null;
    }

    function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = "Anonymous"; // Crucial for canvas
            img.onload = () => {
                if (img.width <= 120) {
                    reject('Too small');
                } else {
                    resolve(img);
                }
            };
            img.onerror = reject;
            img.src = src;
        });
    }

    return { getThumbnail, getVideoId };
})();


// ----------------------------------------------------------------------
// WEBGL ENGINE (GPU)
// ----------------------------------------------------------------------
const WebGLEngine = (() => {
    let canvas, gl, program;
    let texture;
    let animationId;
    let startTime = 0;

    // SHADERS (Liquid Distortion + Chromatic Aberration)
    const vsSource = `
        attribute vec2 a_position;
        attribute vec2 a_texCoord;
        varying vec2 v_texCoord;
        void main() {
            gl_Position = vec4(a_position, 0.0, 1.0);
            v_texCoord = a_texCoord;
        }
    `;

    const fsSource = `
        precision mediump float;
        uniform sampler2D u_image;
        uniform float u_time;
        uniform float u_bass; // Audio reactivity (0.0 to 1.0)
        varying vec2 v_texCoord;
        
        void main() {
            vec2 uv = v_texCoord;
            
            // Liquid Distortion
            // Uses bass to amplify the wave effect
            float wave = sin(uv.y * 10.0 + u_time * 2.0) * 0.02 * u_bass;
            uv.x += wave;
            
            // Simple Chromatic Aberration
            float shift = 0.01 * u_bass;
            float r = texture2D(u_image, uv + vec2(shift, 0.0)).r;
            float g = texture2D(u_image, uv).g;
            float b = texture2D(u_image, uv - vec2(shift, 0.0)).b;
            
            // Alpha handling (using green channel as alpha proxy if needed, but video is opaque)
            gl_FragColor = vec4(r, g, b, 1.0);
        }
    `;

    function init() {
        if (document.getElementById('rt-webgl-container')) return;

        const container = document.createElement('div');
        container.id = 'rt-webgl-container';
        // Reuse camhand class if shake is enabled
        if (config.cameraShake) container.classList.add('camhand');

        // Insert into DOM
        const app = document.querySelector('ytd-app') || document.body;
        app.insertAdjacentElement('afterbegin', container);

        canvas = document.createElement('canvas');
        // Initial size based on config
        canvas.width = config.resolution || 480;
        canvas.height = Math.floor(canvas.width * (9 / 16)); // Default 16:9
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        container.appendChild(canvas);

        gl = canvas.getContext('webgl', { alpha: false });
        if (!gl) {
            console.error("Reflectube: WebGL not supported");
            return;
        }

        // Compile Shaders
        const vert = compileShader(gl, gl.VERTEX_SHADER, vsSource);
        const frag = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
        program = createProgram(gl, vert, frag);

        // Define Quad
        // Positions (Clip Space -1 to 1)
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,
            1, -1,
            -1, 1,
            -1, 1,
            1, -1,
            1, 1,
        ]), gl.STATIC_DRAW);

        // UVs (Texture Space 0 to 1)
        // Flip Y if needed? WebGL 0,0 is bottom-left, images top-left usually.
        // Let's try standard UVs first.
        const texCoordBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            0, 1,
            1, 1,
            0, 0,
            0, 0,
            1, 1,
            1, 0,
        ]), gl.STATIC_DRAW);

        // Link Attributes
        const positionLocation = gl.getAttribLocation(program, "a_position");
        const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");

        gl.enableVertexAttribArray(positionLocation);
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

        gl.enableVertexAttribArray(texCoordLocation);
        gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
        gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 0, 0);

        // Create Texture
        texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        // Parameters for non-power-of-2 textures
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        startTime = Date.now();
        start();
    }

    function start() {
        if (!animationId) loop();
    }

    function stop() {
        if (animationId) cancelAnimationFrame(animationId);
        animationId = null;
        const c = document.getElementById('rt-webgl-container');
        if (c) c.remove();
        canvas = null;
        gl = null;
    }

    function loop() {
        animationId = requestAnimationFrame(loop);

        if (!config.masterSwitch || !config.webglActive) return;

        const video = VideoManager.findActive();
        if (!video || video.paused || video.readyState < 2) return;

        // Resize Canvas if configuration changed or video aspect ratio differs
        // Logic similar to ModernEngine
        let targetW = config.resolution;
        if (targetW < 10) targetW = 10;
        let targetH = Math.floor((video.videoHeight / video.videoWidth) * targetW);

        // Safety check for invalid dimensions
        if (targetW < 1) targetW = 1;
        if (targetH < 1) targetH = 1;

        if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
            gl.viewport(0, 0, canvas.width, canvas.height);
        }

        // --- AUDIO ANALYSIS ---
        // (Copied from ModernEngine logic)
        let bass = 0.0;
        if (isAudioActive()) {
            AudioManager.connect(video); // Ensure connected
            const analyser = AudioManager.getAnalyser();
            if (analyser) {
                const data = new Uint8Array(analyser.frequencyBinCount);
                analyser.getByteFrequencyData(data);
                // Average first few bins for Bass
                let sum = 0;
                // Use first 5 bins
                for (let i = 0; i < 5; i++) sum += data[i];
                bass = (sum / 5) / 255.0; // Normalized 0-1
                bass *= (config.sensitivity / 50); // Apply sensitivity
            }
        }

        gl.useProgram(program);

        // Uniforms
        const uTime = gl.getUniformLocation(program, "u_time");
        const uBass = gl.getUniformLocation(program, "u_bass");

        const time = (Date.now() - startTime) * 0.001;
        gl.uniform1f(uTime, time);
        gl.uniform1f(uBass, bass);

        // Texture Update
        gl.bindTexture(gl.TEXTURE_2D, texture);
        try {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        } catch (e) {
            // Video might be tainted or not ready
            console.warn("WebGL Texture Error:", e);
            return;
        }

        // Draw
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    function compileShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error(gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    function createProgram(gl, vs, fs) {
        const p = gl.createProgram();
        gl.attachShader(p, vs);
        gl.attachShader(p, fs);
        gl.linkProgram(p);
        return p;
    }

    return { init, stop };
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
    let fpsFrameCount = 0;
    let fpsLastTime = 0;
    let currentFps = 0;

    function start() {
        VideoManager.init(); // Ensure observer is running
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
        c.style.width = '100%';
        c.style.height = '100%';
        container.appendChild(c);

        canvasState.canvas = c;
        canvasState.ctx = c.getContext('2d', { willReadFrequently: true, alpha: false });

        if (config.visualizerActive) VisualizerManager.create();
    }

    function analyzeAudio() {
        if (!isAudioActive() && !config.visualizerActive) {
            state.decibels = 0;
            return;
        }

        const analyser = AudioManager.getAnalyser();
        if (!analyser) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        AudioManager.getAudioData(dataArray);

        VisualizerManager.updateBars(dataArray, bufferLength);

        if (isAudioActive()) {
            let sum = 0;
            for (let i = 0; i < bufferLength / 2; i++) sum += dataArray[i];
            let average = sum / (bufferLength / 2);
            state.decibels = average * (config.sensitivity / 50);
        } else {
            state.decibels = 0;
        }
    }

    function loop(timestamp) {
        /* eliminar el requestAnimationFrame y borrar el rt-container si no es chrome */;
        if (!chrome.runtime?.id) return clearInterval(loopId) & document.getElementById('rt-container')?.remove() & document.getElementById('rt_visualizer_canvas')?.remove() & stop();
        if (!loopId) return;
        loopId = requestAnimationFrame(loop);

        // FPS tracking
        fpsFrameCount++;
        if (timestamp - fpsLastTime >= 1000) {
            currentFps = fpsFrameCount;
            fpsFrameCount = 0;
            fpsLastTime = timestamp;
        }

        if (!config.masterSwitch) return;
        if (timestamp - lastTime < config.framerate) return;
        lastTime = timestamp;

        // Use Optimized Video Manager
        const bestVideo = VideoManager.findActive();

        // --- CHECK STATE ---
        let renderSource = null;
        let isVideo = false;

        if (bestVideo && !bestVideo.paused && bestVideo.readyState > 2 && bestVideo.src && bestVideo.videoWidth > 10) {
            renderSource = bestVideo;
            isVideo = true;

            if (state.activeVideo !== bestVideo) {
                state.activeVideo = bestVideo;
                canvasState.lastImageData = null;
                if (isAudioActive() || config.visualizerActive) AudioManager.connect(state.activeVideo);
            }
        } else {
            // Fallback to Thumbnail
            const vId = ThumbnailManager.getVideoId();
            if (vId) {
                const thumb = ThumbnailManager.getThumbnail(vId);
                if (thumb) {
                    renderSource = thumb;
                    isVideo = false;
                }
            }

            // Critical: Connect to any playing media for audio when in thumbnail mode
            if (isAudioActive() || config.visualizerActive) {
                const media = document.querySelectorAll('video, audio');
                for (let m of media) {
                    if (!m.paused && m.readyState > 2) {
                        AudioManager.connect(m);
                        break;
                    }
                }
            }
        }

        const container = document.getElementById('rt-container');
        // If nothing to render, return
        if (!renderSource) return;

        analyzeAudio();

        const cvs = canvasState.canvas;
        const ctx = canvasState.ctx;
        if (!cvs || !ctx) return;

        let sourceW, sourceH;
        if (isVideo) {
            sourceW = renderSource.videoWidth;
            sourceH = renderSource.videoHeight;
        } else {
            sourceW = renderSource.width;
            sourceH = renderSource.height;
        }

        if (sourceW === 0 || sourceH === 0) return;

        let targetW = config.resolution;
        let targetH = Math.floor((sourceH / sourceW) * targetW);
        if (targetW < 1) targetW = 1;
        if (targetH < 1) targetH = 1;

        if (cvs.width !== targetW || cvs.height !== targetH) {
            cvs.width = targetW;
            cvs.height = targetH;
            canvasState.lastImageData = null;
        }

        let scale = 110;
        if (isAudioActive()) {
            // Amplify the reaction for static thumbnails
            const reaction = isVideo ? (state.decibels / 4) : (state.decibels / 2);
            scale += reaction;
        }
        cvs.style.minWidth = scale + "%";
        cvs.style.minHeight = scale + "%";

        const alpha = 1 - (config.smoothness / 105);
        const effectiveAlpha = Math.max(0.01, Math.min(1, alpha));

        ctx.globalAlpha = 1;
        if (canvasState.lastImageData) ctx.putImageData(canvasState.lastImageData, 0, 0);
        ctx.globalAlpha = effectiveAlpha;
        try {
            ctx.drawImage(renderSource, 0, 0, targetW, targetH);
        } catch (e) {
            // video might be not ready or tainted
        }
        canvasState.lastImageData = ctx.getImageData(0, 0, targetW, targetH);

        VisualizerManager.updateColor(ctx, targetW, targetH);
    }

    function getFps() { return currentFps; }

    return { start, stop, getFps };
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
                if (isAudioActive() || config.visualizerActive) AudioManager.connect(activeVideo);
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
        if (!isAudioActive() && !config.visualizerActive) {
            state.decibels = 0;
            return;
        }

        const analyser = AudioManager.getAnalyser();
        if (!analyser) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        AudioManager.getAudioData(dataArray);

        VisualizerManager.updateBars(dataArray, bufferLength);

        if (isAudioActive()) {
            let sum = 0;
            for (let i = 0; i < bufferLength / 2; i++) sum += dataArray[i];
            let average = sum / (bufferLength / 2);
            state.decibels = average * (config.sensitivity / 50);
        } else {
            state.decibels = 0;
        }
    }

    function loop(timestamp) {
        /* eliminar el requestAnimationFrame y borrar el rt-container si no es chrome */
        if (!chrome.runtime?.id) return clearInterval(loopId) & document.getElementById('rt-ambient-canvas')?.remove() & document.getElementById('rt_visualizer_canvas')?.remove() & stop();
        if (!loopId) return;
        loopId = requestAnimationFrame(loop);

        if (!config.masterSwitch || !config.ambientMode) {
            if (canvas) canvas.style.display = 'none';
            return;
        }

        if (canvas && canvas.style.display === 'none') canvas.style.display = 'block';

        if (timestamp - lastTime < config.framerate) return;
        lastTime = timestamp;

        // --- CHECK STATE ---
        let renderSource = null; // Video or Image
        let isVideo = false;

        // 1. Try Active Video (MUST have dimensions to be a real video)
        if (activeVideo && !activeVideo.paused && activeVideo.readyState > 2 && activeVideo.videoWidth > 10) {
            renderSource = activeVideo;
            isVideo = true;
        } else {
            // 2. Try Thumbnail (Fallback for Paused/Audio Mode)
            const vId = ThumbnailManager.getVideoId();
            if (vId) {
                const thumb = ThumbnailManager.getThumbnail(vId);
                if (thumb) {
                    renderSource = thumb;
                    isVideo = false;
                }
            }

            // Critical: If we are in Audio Mode (Thumbnail), ensure Audio is connected!
            // activeVideo might be null, paused, or have no video track, but music is playing.
            if (isAudioActive() || config.visualizerActive) {
                const media = document.querySelectorAll('video, audio');
                for (let m of media) {
                    if (!m.paused && m.readyState > 2) {
                        AudioManager.connect(m);
                        break;
                    }
                }
            }
        }

        // If no source at all, ensure we check injection (maybe video changed) and return
        if (!renderSource) {
            if (!activeVideo || activeVideo.paused) checkInjection();
            return;
        }

        // Ensure canvas exists
        if (!canvas || !ctx) {
            if (activeVideo) injectCanvas(activeVideo); // Try re-injecting on known video
            return;
        }

        analyzeAudio();

        // Draw Logic
        let sourceW, sourceH;

        if (isVideo) {
            sourceW = renderSource.videoWidth;
            sourceH = renderSource.videoHeight;
        } else {
            sourceW = renderSource.width;
            sourceH = renderSource.height;
        }

        if (!sourceW || !sourceH) return;

        let targetW = config.resolution;
        let targetH = Math.floor((sourceH / sourceW) * targetW);

        if (canvas.width !== targetW || canvas.height !== targetH) {
            canvas.width = targetW;
            canvas.height = targetH;
            lastImageData = null;
        }

        let currentScale = config.ambientScale / 100;
        if (isAudioActive() && state.decibels > 0) {
            // Amplify the reaction for static thumbnails to make it more visible
            const reaction = isVideo ? (state.decibels / 500) : (state.decibels / 200);
            currentScale += reaction;
        }

        canvas.style.transform = `translate(-50%, -50%) scale(${currentScale})`;

        // Trail / Interpolation
        const alpha = 1 - (config.smoothness / 105);
        const effectiveAlpha = Math.max(0.01, Math.min(1, alpha));

        ctx.globalAlpha = 1;
        if (lastImageData) ctx.putImageData(lastImageData, 0, 0);

        ctx.globalAlpha = effectiveAlpha;
        try {
            ctx.drawImage(renderSource, 0, 0, targetW, targetH);
        } catch (e) { }

        lastImageData = ctx.getImageData(0, 0, targetW, targetH);

        // Update Visualizer Color
        if (config.visualizerActive) {
            VisualizerManager.updateColor(ctx, targetW, targetH);
        }
    }

    return { start, stop, isActive, updateConfig };
})();