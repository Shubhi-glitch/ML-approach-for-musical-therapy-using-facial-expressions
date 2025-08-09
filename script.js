
const MODEL_URL = "https://cdn.jsdelivr.net/gh/vladmandic/face-api/model/";
const startBtn = document.getElementById('startBtn');
const status = document.getElementById('status');
const showBoxes = document.getElementById('showBoxes');

let audioCtx = null;
let oscGain = null;
let currentMood = null;
let detecting = false;

async function loadModels() {
  status.textContent = "Loading models from CDN...";
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL)
    ]);
    status.textContent = "Models loaded. Click 'Start Camera & Audio'.";
    startBtn.disabled = false;
  } catch (err) {
    console.error("Model load error:", err);
    status.textContent = "Failed to load models — check console and internet connection.";
  }
}

loadModels();

startBtn.addEventListener('click', async () => {
  startBtn.disabled = true;
  status.textContent = "Starting camera...";
  // create AudioContext on user gesture
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const video = document.getElementById('video');
    video.srcObject = stream;
    await video.play();
    status.textContent = "Camera started — detecting...";
    beginDetection(video);
  } catch (err) {
    console.error("Camera error:", err);
    status.textContent = "Could not access camera — allow camera and try again.";
    startBtn.disabled = false;
  }
});

function beginDetection(video) {
  if (detecting) return;
  detecting = true;
  const canvas = document.getElementById('overlay');
  const displaySize = { width: video.width || 480, height: video.height || 360 };
  faceapi.matchDimensions(canvas, displaySize);
  const ctx = canvas.getContext('2d');
  ctx.font = "16px sans-serif";

  setInterval(async () => {
    if (video.paused || video.ended) return;
    const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceExpressions();

    const resized = faceapi.resizeResults(detections, displaySize);
    ctx.clearRect(0,0,canvas.width,canvas.height);

    if (resized.length > 0) {
      const best = resized[0];
      const box = best.detection.box;
      if (showBoxes.checked) {
        ctx.strokeStyle = "#06d6a0";
        ctx.lineWidth = 2;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
      }
      // determine dominant expression
      const expressions = best.expressions;
      let mood = Object.keys(expressions).reduce((a,b)=> expressions[a] > expressions[b] ? a : b);
      ctx.fillStyle = "#06d6a0";
      ctx.fillText(mood, box.x + 6, box.y - 6);

      if (mood !== currentMood) {
        currentMood = mood;
        playMoodSound(mood);
        status.textContent = `Detected: ${mood}`;
      }
    } else {
      // no face
      currentMood = null;
      stopSound();
      status.textContent = "No face detected.";
    }
  }, 700);
}

// Simple WebAudio synthesis per mood
function ensureNodes() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (!oscGain) {
    oscGain = audioCtx.createGain();
    oscGain.gain.value = 0;
    oscGain.connect(audioCtx.destination);
  }
}

let activeOscs = [];

function stopSound() {
  activeOscs.forEach(o => {
    try { o.osc.stop(); } catch(e) {}
  });
  activeOscs = [];
  if (oscGain) oscGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.02);
}

// playMoodSound: simple melodic cues representing mood
function playMoodSound(mood) {
  ensureNodes();
  stopSound();

  const now = audioCtx.currentTime;
  const gain = oscGain;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(0.0, now);

  if (mood === 'happy') {
    // bright major arpeggio
    const freqs = [660, 880, 990];
    freqs.forEach((f,i) => {
      const o = audioCtx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(gain);
      o.start(now + i * 0.12);
      o.stop(now + 0.6 + i * 0.12);
      activeOscs.push({osc:o});
    });
    gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
    gain.gain.linearRampToValueAtTime(0.0, now + 1.0);
  } else if (mood === 'sad') {
    // slow low minor tone
    const o = audioCtx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 220;
    o.connect(gain);
    o.start(now);
    o.stop(now + 1.6);
    activeOscs.push({osc:o});
    gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
    gain.gain.linearRampToValueAtTime(0.0, now + 1.6);
  } else if (mood === 'angry') {
    // strong low buzzy tone
    const o = audioCtx.createOscillator();
    o.type = 'square';
    o.frequency.value = 120;
    o.connect(gain);
    o.start(now);
    o.stop(now + 0.9);
    activeOscs.push({osc:o});
    gain.gain.linearRampToValueAtTime(0.16, now + 0.02);
    gain.gain.linearRampToValueAtTime(0.0, now + 0.9);
  } else if (mood === 'surprised') {
    // quick high staccato
    const freqs = [1200, 1500, 1800];
    freqs.forEach((f,i)=>{
      const o = audioCtx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(gain);
      o.start(now + i * 0.06);
      o.stop(now + 0.18 + i * 0.06);
      activeOscs.push({osc:o});
    });
    gain.gain.linearRampToValueAtTime(0.14, now + 0.02);
    gain.gain.linearRampToValueAtTime(0.0, now + 0.8);
  } else if (mood === 'neutral') {
    // soft ambient drone
    const o = audioCtx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 330;
    const f2 = audioCtx.createOscillator();
    f2.type = 'sine';
    f2.frequency.value = 440;
    o.connect(gain); f2.connect(gain);
    o.start(now); f2.start(now);
    o.stop(now + 1.8); f2.stop(now + 1.8);
    activeOscs.push({osc:o},{osc:f2});
    gain.gain.linearRampToValueAtTime(0.06, now + 0.02);
    gain.gain.linearRampToValueAtTime(0.0, now + 1.8);
  } else if (mood === 'fearful' || mood === 'disgusted') {
    // eerie sliding tone
    const o = audioCtx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, now);
    o.frequency.exponentialRampToValueAtTime(60, now + 1.2);
    o.connect(gain);
    o.start(now);
    o.stop(now + 1.4);
    activeOscs.push({osc:o});
    gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
    gain.gain.linearRampToValueAtTime(0.0, now + 1.4);
  } else {
    // fallback: short beep
    const o = audioCtx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 440;
    o.connect(gain);
    o.start(now);
    o.stop(now + 0.18);
    activeOscs.push({osc:o});
    gain.gain.linearRampToValueAtTime(0.08, now + 0.02);
    gain.gain.linearRampToValueAtTime(0.0, now + 0.3);
  }
}
