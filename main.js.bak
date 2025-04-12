import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';

let scene, camera, renderer;
let ambientLight, directionalLight;
let mesh = null;

let audioCtx, analyser, dataArray;
let rotateAnim = true;
let scaleAnim = true;

initScene();

document.getElementById('btnLoadScene').addEventListener('click', () => {
  fetch('sceneConfig.json')
    .then(res => res.json())
    .then(config => {
      loadSceneFromConfig(config);
      setupAudio();
    });
});

function initScene() {
  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 50;

  renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('sceneCanvas'), antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  animate();
}

function loadSceneFromConfig(config) {
  // Remove previous mesh if it exists
  if (mesh) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    mesh = null;
  }

  scene.background = new THREE.Color(config.background);
  document.getElementById('bgColor').value = config.background;

  ambientLight = new THREE.AmbientLight(config.lighting.ambient.color, config.lighting.ambient.intensity);
  directionalLight = new THREE.DirectionalLight(config.lighting.directional.color, config.lighting.directional.intensity);
  directionalLight.position.set(
    config.lighting.directional.position.x,
    config.lighting.directional.position.y,
    config.lighting.directional.position.z
  );
  scene.add(ambientLight);
  scene.add(directionalLight);

  const obj = config.objects[0];
  const geometry = new THREE.TorusKnotGeometry(
    obj.geometry.radius, obj.geometry.tube,
    obj.geometry.tubularSegments, obj.geometry.radialSegments,
    obj.geometry.p, obj.geometry.q
  );

  const material = new THREE.MeshStandardMaterial({
    color: obj.material.color,
    metalness: obj.material.metalness,
    roughness: obj.material.roughness
  });

  mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(obj.transform.position.x, obj.transform.position.y, obj.transform.position.z);
  mesh.rotation.set(obj.transform.rotation.x, obj.transform.rotation.y, obj.transform.rotation.z);
  mesh.scale.set(obj.transform.scale.x, obj.transform.scale.y, obj.transform.scale.z);
  scene.add(mesh);

  document.getElementById('ambientLight').value = ambientLight.intensity;
  document.getElementById('directionalLight').value = directionalLight.intensity;
  document.getElementById('objColor').value = obj.material.color;
  document.getElementById('objMetal').value = obj.material.metalness;
  document.getElementById('objRough').value = obj.material.roughness;
}

function setupAudio() {
  const url = document.getElementById('audioUrl').value;

  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  dataArray = new Uint8Array(analyser.frequencyBinCount);

  if (url) {
    const audio = new Audio(url);
    audio.crossOrigin = "anonymous";
    audio.loop = true;
    audio.autoplay = true;
    const source = audioCtx.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(audioCtx.destination);
  } else {
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser);
    });
  }
}

function animate() {
  requestAnimationFrame(animate);

  if (analyser && mesh) {
    analyser.getByteFrequencyData(dataArray);
    const amp = dataArray.reduce((a, b) => a + b, 0) / dataArray.length / 255;

    if (rotateAnim) {
      mesh.rotation.y += 0.01 + amp * 0.05;
      mesh.rotation.x += 0.005 + amp * 0.05;
    }

    if (scaleAnim) {
      const scale = 1 + amp;
      mesh.scale.set(scale, scale, scale);
    }
  }

  renderer.render(scene, camera);
}

// UI controls for animation
document.getElementById('enableRotation').addEventListener('change', e => rotateAnim = e.target.checked);
document.getElementById('enableScale').addEventListener('change', e => scaleAnim = e.target.checked);

// UI controls for lighting and materials
document.getElementById('ambientLight').addEventListener('input', (e) => {
  if (ambientLight) ambientLight.intensity = parseFloat(e.target.value);
});

document.getElementById('directionalLight').addEventListener('input', (e) => {
  if (directionalLight) directionalLight.intensity = parseFloat(e.target.value);
});

document.getElementById('bgColor').addEventListener('input', (e) => {
  if (scene) scene.background = new THREE.Color(e.target.value);
});

document.getElementById('objColor').addEventListener('input', (e) => {
  if (mesh) mesh.material.color.set(e.target.value);
});

document.getElementById('objMetal').addEventListener('input', (e) => {
  if (mesh) mesh.material.metalness = parseFloat(e.target.value);
});

document.getElementById('objRough').addEventListener('input', (e) => {
  if (mesh) mesh.material.roughness = parseFloat(e.target.value);
});

