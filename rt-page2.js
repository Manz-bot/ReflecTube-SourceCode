let currentVideo = {
  element: document.querySelectorAll('video')[0], link: 'https://www.youtube.com/', decibels: 0
}



function draw(refresh, canvas0, canvas1, on) {
  function order(x) {
    if ((typeof x != 'boolean')) return;
    if (!canvas0 || !canvas1) return;
    if (currentVideo.element.src == '') { canvas0.style.opacity = 0; canvas1.style.opacity = 0; }
    if (document.hidden || currentVideo.element.paused || currentVideo.element.ended || !on) return setTimeout(function () { order(x) }, refresh);
    let canvas = x ? canvas0 : canvas1;
    canvas.width = currentVideo.element.style.width.replace('px', '');
    canvas.height = currentVideo.element.style.height.replace('px', '');
    canvas.style.minWidth = (110 + currentVideo.decibels) + "%"; canvas.style.minHeight = (110 + currentVideo.decibels) + "%"; /*console.log((currentVideo.decibels/10).toFixed(2));*/
    setTimeout(function () {
      let cnv = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
      cnv.filter = 'opacity(' + ((currentVideo.decibels / 10) + 0.125).toFixed(1) + ') blur(5px) saturate(1.35)'; cnv.drawImage(currentVideo.element, 0, 0, canvas.width, canvas.height); captureFrameColor(cnv, canvas);
      canvas.style.opacity = 1; (x ? canvas1 : canvas0).style.opacity = 0; order(!x)
    }, refresh)
  };
  order(true);
}

function loadVisualizer() {
  let contextAudio = new AudioContext();
  let currentVideoElement = currentVideo.element;
  var video1 = contextAudio.createMediaElementSource(currentVideoElement); //document.querySelector("#movie_player > div.html5-video-container > video")
  analyser = contextAudio.createAnalyser(); //we create an analyser
  analyser.smoothingTimeConstant = 0.9;
  analyser.fftSize = 512; //the total samples are half the fft size.
  video1.connect(analyser);
  analyser.connect(contextAudio.destination);

  var startTime = Date.now();
  (function loop() {
    if (currentVideoElement !== currentVideo.element) { loadVisualizer(); return window.cancelAnimationFrame(loop); }
    var time = Date.now();
    if (time - startTime > 20) {
      if (!currentVideo.element.paused && !document.hidden) {
        var array = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(array);

        var average = 0;
        var max = 0;
        for (i = 0; i < array.length; i++) {
          a = Math.abs(array[i] - 128);
          average += a;
          max = Math.max(max, a);
        }
        average /= array.length;
        let finalMax = (max / 10) / (document.querySelectorAll('.ytp-volume-panel')[0] ? Number(document.querySelectorAll('.ytp-volume-panel')[0].ariaValueNow) : 100) * 100;
        currentVideo.decibels = finalMax;
        startTime = time;
      }
    }
    window.requestAnimationFrame(loop);
  })();
}

function loadProjector() {
  if (getComputedStyle(document.body).getPropertyValue('--yt-spec-base-background').trim() === "#0f0f0f") {
    let time = 20; //Default: 20 ; Alternatives: 20, 25, 30, 40, 50, 75, 100
    let toggle = true; //Default: true; Alternatives: true, false

    let yvmContainer = document.createElement('div');
    yvmContainer.id = 'rt-container';
    document.querySelectorAll('ytd-app')[0].insertAdjacentElement('afterbegin', yvmContainer);

    let yvmMirror0 = document.createElement('canvas');
    yvmMirror0.setAttribute("oncontextmenu", "return false;")
    yvmContainer.appendChild(yvmMirror0);

    let yvmMirror1 = document.createElement('canvas');
    yvmMirror1.setAttribute("oncontextmenu", "return false;")
    yvmContainer.appendChild(yvmMirror1);
    draw(time, yvmMirror0, yvmMirror1, toggle);
  }
}

function newVideo(x) {
  return new Promise(resolve => {
    let videos = document.querySelectorAll('video'), video1src = videos[0]?.src, video2src = videos[1]?.src, miniplayer = Boolean(document.querySelectorAll('.miniplayer .ytd-miniplayer ytd-player')[0]);
    if (!x) {
      if (video1src && (video1src != '') && !videos[0]?.paused) {
        return resolve(videos[0]);
      } else if (video2src && (video2src != '') && !videos[1]?.paused) {
        return resolve(videos[1]);
      }
    }
    let observer = new MutationObserver(() => {
      let videosCurrent = document.querySelectorAll('video'), video1 = videosCurrent[0], video2 = videosCurrent[1], miniplayerCurrent = Boolean(document.querySelectorAll('.miniplayer .ytd-miniplayer ytd-player')[0]);
      if (video1?.src && !video1?.paused) {
        if (video1?.src == (video1src || '')) return;
        resolve(video1)
        observer.disconnect(); observer = null
      } else if (video2?.src && !video2?.paused) {
        if (video2?.src == (video2src || '')) return;
        resolve(video2)
        observer.disconnect(); observer = null
      } else if (miniplayer !== miniplayerCurrent) {
        if (video1?.src !== (video1src)) return;
        resolve(video1)
        observer.disconnect(); observer = null
      }
    });
    observer.observe(document.querySelectorAll('ytd-app')[0], { childList: true, subtree: true });
  });
}

async function loadReflectube(x) {
  let video = await newVideo(x);
  currentVideo.element = video;
  if (!x) { loadProjector(); loadVisualizer(); }
  loadReflectube(true);
}

loadReflectube(false);

function captureFrameColor(ctx, canvas) {
  var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  var data = new Uint8Array(imageData.data.buffer); // Usar TypedArray para acceder a los datos

  // Objeto para contar la ocurrencia de cada color
  var colorCount = {};

  // Iterar sobre los píxeles y contar la ocurrencia de cada color
  for (var i = 0; i < data.length; i += 4) {
    var r = data[i];
    var g = data[i + 1];
    var b = data[i + 2];
    var color = 'rgb(' + r + ',' + g + ',' + b + ')';
    if (colorCount[color]) {
      colorCount[color]++;
    } else {
      colorCount[color] = 1;
    }
  }

  // Encontrar el color predominante
  var predominantColor = null;
  var maxCount = 0;
  for (var color in colorCount) {
    if (colorCount[color] > maxCount) {
      maxCount = colorCount[color];
      predominantColor = color;
    }
  }
  function hacerColorClaro(r, g, b, factor) {
    // Aumenta los valores de los componentes RGB multiplicándolos por el factor
    r = Math.min(Math.round(r * factor), 255);
    g = Math.min(Math.round(g * factor), 255);
    b = Math.min(Math.round(b * factor), 255);
    // Devuelve el nuevo color en formato RGB
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  var factorClaridad = 1.5; // Puedes ajustar este factor según tus necesidades, un valor mayor hará que el color sea más claro

  // Obtén los valores RGB del color original
  var match = predominantColor.match(/(\d+),\s*(\d+),\s*(\d+)/);
  var r = parseInt(match[1]);
  var g = parseInt(match[2]);
  var b = parseInt(match[3]);
  // Predominant color now contains the most frequent color in the frame
  document.documentElement.style.setProperty('--color-video', hacerColorClaro(r, g, b, factorClaridad)); /*document.querySelectorAll("#ytd-player")[0].style.border="3px solid "+hacerColorClaro(r, g, b, factorClaridad);*/
}


/*

// Set initial background color from storage
chrome.storage.sync.get(['bgColor'], (result) => {
    if (result.bgColor) {
        document.body.style.backgroundColor = result.bgColor;
    }
});
*/