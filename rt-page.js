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
    sensitivity: 50,
    audioEnabled: true,
    cameraShake: false,
    cameraIntensity: 50,
    framerate: 30,    // Time in ms between checks
    smoothness: 60,   // 0-100, controls the fade factor
    resolution: 100,   // Pixel width of the internal canvas
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
// VISUALIZER MANAGER (Canvas Logic)
// ----------------------------------------------------------------------
const VisualizerManager = (() => {
    let active = false;
    let canvas = null;
    let ctx = null;
    let lastColorCheck = 0;
    let currentColor = 'rgb(255, 255, 255)';

    function init() {
        updateState();
    }

    function create() {
        if (document.getElementById('rt_visualizer_canvas')) return;

        canvas = document.createElement("canvas");
        canvas.id = "rt_visualizer_canvas";
        canvas.style.cssText = "position: fixed; bottom: 0; left: 0; width: 100%; height: 100px; opacity: 0.8; pointer-events: none; z-index: 2000;";

        // Logical resolution for crisp rendering
        canvas.width = window.innerWidth;
        canvas.height = 100;

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

    // Called by Engines
    function updateBars(dataArray, bufferLength) {
        if (!active || !config.masterSwitch || !ctx || !canvas) return;

        const width = canvas.width;
        const height = canvas.height;
        const barWidth = (width / 64);
        const step = Math.floor(bufferLength / 64);

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = currentColor;
        ctx.shadowBlur = 10;
        ctx.shadowColor = currentColor;

        let x = 0;

        // Calculate silence for optimization?
        // Not strictly needed for canvas, unlilke DOM where we want to hide elems.

        for (let i = 0; i < 64; i++) {
            const val = dataArray[i * step] || 0;
            // Scale val (0-255) to height (0-100)
            const barHeight = (val / 255) * height * 0.8;

            if (barHeight > 2) {
                // Draw rounded top bar? Simple rect for performance first.
                // ctx.roundRect (new API) or just rect
                ctx.fillRect(x, height - barHeight, barWidth - 2, barHeight);
            }
            x += barWidth;
        }
    }

    function updateColor(ctxSource, width, height) {
        if (!active || !config.masterSwitch) return;
        const now = Date.now();
        if (now - lastColorCheck < 200) return; // Throttle 200ms
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

            // Optimization: Skip pixels (step 20 = examine ~5% of pixels, sufficient for ambient)
            const step = 4 * 20;

            for (let i = 0; i < data.length; i += step) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];

                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                const range = max - min; // Proxy for saturation/chroma

                // Score = Chroma^2 * Brightness
                // Squaring chroma heavily favors colorful pixels over gray ones.
                const score = (range * range) * max;

                if (score > 1000) { // Threshold to ignore dark/muddy pixels
                    totalR += r * score;
                    totalG += g * score;
                    totalB += b * score;
                    totalScore += score;
                }
            }

            if (totalScore > 0) {
                // Weighted Average
                let finalR = Math.floor(totalR / totalScore);
                let finalG = Math.floor(totalG / totalScore);
                let finalB = Math.floor(totalB / totalScore);

                // Final Boost to ensure pop
                const boost = 1.2;
                finalR = Math.min(255, finalR * boost);
                finalG = Math.min(255, finalG * boost);
                finalB = Math.min(255, finalB * boost);

                currentColor = `rgb(${finalR},${finalG},${finalB})`;
            } else {
                // Fallback if scene is completely black/gray
                currentColor = 'rgb(200, 200, 200)';
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
        // Initial size, will be updated in loop
        canvas.width = 480;
        canvas.height = 270;
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
        if (config.audioEnabled) {
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
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

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
        container.appendChild(c);

        canvasState.canvas = c;
        canvasState.ctx = c.getContext('2d', { willReadFrequently: true, alpha: false });

        if (config.visualizerActive) VisualizerManager.create();
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

        // Use Optimized Video Manager
        const bestVideo = VideoManager.findActive();

        if (bestVideo) {
            if (state.activeVideo !== bestVideo) {
                state.activeVideo = bestVideo;
                canvasState.lastImageData = null;
                // Connect Audio Shared
                if (config.audioEnabled || config.visualizerActive) AudioManager.connect(state.activeVideo);
            }
        }

        const container = document.getElementById('rt-container');
        // Check if we have a valid source to display
        const hasSource = bestVideo && bestVideo.src && bestVideo.src !== '';

        if (!hasSource || !state.activeVideo || state.activeVideo.paused || state.activeVideo.ended) return;

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
        try {
            ctx.drawImage(state.activeVideo, 0, 0, targetW, targetH);
        } catch (e) {
            // video might be not ready or tainted
        }
        canvasState.lastImageData = ctx.getImageData(0, 0, targetW, targetH);

        VisualizerManager.updateColor(ctx, targetW, targetH);
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

        if (!config.masterSwitch || !config.ambientMode) {
            if (canvas) canvas.style.display = 'none';
            return;
        }

        if (canvas && canvas.style.display === 'none') canvas.style.display = 'block';

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