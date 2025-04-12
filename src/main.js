import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';

let scene, camera, renderer, ambientLight, directionalLight, mesh;
let audioCtx, analyser, dataArray;
let rotateAnim = true, scaleAnim = true;
let sceneConfig = {};

const geomParams = ['radius', 'tube', 'tubularSegments', 'radialSegments', 'p', 'q'];
const freqBands = ['lows', 'mids', 'highs'];
const modulations = {};

init();

function init() {
  initScene();
  initDraggables();
  bindUI();
  createGeometryAnimationUI();
}

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

function bindUI() {
  document.getElementById('btnLoadScene').addEventListener('click', () => {
    fetch('sceneConfig.json')
      .then(res => res.json())
      .then(config => {
        sceneConfig = config;
        loadSceneFromConfig(config);
        setupAudio();
      });
  });

  document.getElementById('btnExportYaml').addEventListener('click', () => {
    updateSceneConfigFromUI();
    const yamlText = jsyaml.dump(sceneConfig);
    const blob = new Blob([yamlText], { type: 'text/yaml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'scene.yaml';
    a.click();
  });

  document.getElementById('btnImportYaml').addEventListener('click', () => {
    const yamlText = prompt("Paste YAML configuration:");
    try {
      sceneConfig = jsyaml.load(yamlText);
      loadSceneFromConfig(sceneConfig);
    } catch (e) {
      alert("Invalid YAML");
    }
  });

  document.getElementById('enableRotation').addEventListener('change', e => rotateAnim = e.target.checked);
  document.getElementById('enableScale').addEventListener('change', e => scaleAnim = e.target.checked);

  document.getElementById('ambientLight').addEventListener('input', e => ambientLight.intensity = parseFloat(e.target.value));
  document.getElementById('directionalLight').addEventListener('input', e => directionalLight.intensity = parseFloat(e.target.value));
  document.getElementById('bgColor').addEventListener('input', e => scene.background = new THREE.Color(e.target.value));
  document.getElementById('objColor').addEventListener('input', e => mesh.material.color.set(e.target.value));
  document.getElementById('objMetal').addEventListener('input', e => mesh.material.metalness = parseFloat(e.target.value));
  document.getElementById('objRough').addEventListener('input', e => mesh.material.roughness = parseFloat(e.target.value));

  geomParams.forEach(param => {
    document.getElementById(param).addEventListener('input', () => rebuildGeometry());
  });
}

function createGeometryAnimationUI() {
  const container = document.getElementById('geometryAnimations');
  geomParams.forEach(param => {
    const div = document.createElement('div');
    div.classList.add('modulation-group');
    div.innerHTML = `
      <strong>${param}</strong>
      <label>Min <input type="number" id="${param}Min" value="${document.getElementById(param).value}" step="0.1"></label>
      <label>Max <input type="number" id="${param}Max" value="${document.getElementById(param).value}" step="0.1"></label>
      <label><input type="checkbox" id="${param}Lows"> Lows</label>
      <label><input type="checkbox" id="${param}Mids"> Mids</label>
      <label><input type="checkbox" id="${param}Highs"> Highs</label>
    `;
    container.appendChild(div);
  });
}

function getBandAverage(start, end) {
  const slice = dataArray.slice(start, end);
  return slice.reduce((a, b) => a + b, 0) / slice.length / 255;
}

function getAudioBands() {
  return {
    lows: getBandAverage(0, dataArray.length / 3),
    mids: getBandAverage(dataArray.length / 3, 2 * dataArray.length / 3),
    highs: getBandAverage(2 * dataArray.length / 3, dataArray.length)
  };
}

function getAnimatedValue(param, baseVal, bands) {
  const min = parseFloat(document.getElementById(`${param}Min`).value);
  const max = parseFloat(document.getElementById(`${param}Max`).value);
  let modVal = 0;
  if (document.getElementById(`${param}Lows`).checked) modVal += bands.lows;
  if (document.getElementById(`${param}Mids`).checked) modVal += bands.mids;
  if (document.getElementById(`${param}Highs`).checked) modVal += bands.highs;
  return min + modVal * (max - min);
}

function rebuildGeometry() {
  if (mesh) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }

  const values = {};
  geomParams.forEach(p => values[p] = parseFloat(document.getElementById(p).value));

  const geometry = new THREE.TorusKnotGeometry(values.radius, values.tube, values.tubularSegments, values.radialSegments, values.p, values.q);
  const material = new THREE.MeshStandardMaterial({
    color: document.getElementById('objColor').value,
    metalness: parseFloat(document.getElementById('objMetal').value),
    roughness: parseFloat(document.getElementById('objRough').value)
  });

  mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(0, 0, 0);
  scene.add(mesh);
}

function animate() {
  requestAnimationFrame(animate);

  if (analyser && mesh) {
    analyser.getByteFrequencyData(dataArray);
    const bands = getAudioBands();

    // Geometry animation
    const values = {};
    geomParams.forEach(p => {
      values[p] = getAnimatedValue(p, parseFloat(document.getElementById(p).value), bands);
    });
    const newGeo = new THREE.TorusKnotGeometry(values.radius, values.tube, values.tubularSegments, values.radialSegments, values.p, values.q);
    mesh.geometry.dispose();
    mesh.geometry = newGeo;

    // Rotation and scale
    if (rotateAnim) {
      mesh.rotation.y += 0.01 + bands.mids * 0.05;
      mesh.rotation.x += 0.005 + bands.lows * 0.05;
    }
    if (scaleAnim) {
      const scale = 1 + bands.highs;
      mesh.scale.set(scale, scale, scale);
    }
  }

  renderer.render(scene, camera);
}

function loadSceneFromConfig(config) {
  sceneConfig = JSON.parse(JSON.stringify(config)); // Deep copy for internal use

  if (mesh) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }

  scene.background = new THREE.Color(config.background);

  ambientLight = new THREE.AmbientLight(config.lighting.ambient.color, config.lighting.ambient.intensity);
  directionalLight = new THREE.DirectionalLight(config.lighting.directional.color, config.lighting.directional.intensity);
  directionalLight.position.set(
    config.lighting.directional.position.x,
    config.lighting.directional.position.y,
    config.lighting.directional.position.z
  );

  scene.add(ambientLight, directionalLight);
  rebuildGeometry();
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

function initDraggables() {
  document.querySelectorAll('.floating-panel').forEach(panel => {
    const title = panel.querySelector('.title-bar');
    title.onmousedown = e => {
      const shiftX = e.clientX - panel.getBoundingClientRect().left;
      const shiftY = e.clientY - panel.getBoundingClientRect().top;

      function moveAt(pageX, pageY) {
        panel.style.left = pageX - shiftX + 'px';
        panel.style.top = pageY - shiftY + 'px';
      }

      function onMouseMove(e) {
        moveAt(e.pageX, e.pageY);
      }

      document.addEventListener('mousemove', onMouseMove);
      title.onmouseup = () => {
        document.removeEventListener('mousemove', onMouseMove);
        title.onmouseup = null;
      };
    };
    title.ondragstart = () => false;
  });
}

function updateSceneConfigFromUI() {
  if (!sceneConfig.objects || !sceneConfig.objects[0]) return;
  const obj = sceneConfig.objects[0];
  obj.material.color = document.getElementById('objColor').value;
  obj.material.metalness = parseFloat(document.getElementById('objMetal').value);
  obj.material.roughness = parseFloat(document.getElementById('objRough').value);
  sceneConfig.background = document.getElementById('bgColor').value;
  sceneConfig.lighting.ambient.intensity = parseFloat(document.getElementById('ambientLight').value);
  sceneConfig.lighting.directional.intensity = parseFloat(document.getElementById('directionalLight').value);
}

// YAML Live Editor Toggle
const yamlEditor = document.getElementById("yamlEditor");
const yamlTextarea = document.getElementById("yamlTextarea");
const editButton = document.getElementById("btnEditYaml");

function applyDefaultConfig(config) {
  return {
    background: config.background || "#ff00ff",
    lighting: {
      ambient: {
        color: config.lighting?.ambient?.color || "#ffffff",
        intensity: config.lighting?.ambient?.intensity ?? 0.5
      },
      directional: {
        color: config.lighting?.directional?.color || "#ffffff",
        intensity: config.lighting?.directional?.intensity ?? 1.0,
        position: {
          x: config.lighting?.directional?.position?.x ?? 10,
          y: config.lighting?.directional?.position?.y ?? 20,
          z: config.lighting?.directional?.position?.z ?? 30
        }
      }
    },
    objects: config.objects?.length ? config.objects : [
      {
        id: "obj-1",
        name: "TorusKnot",
        visible: true,
        type: "torusKnot",
        transform: {
          position: { x: 0, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
          scale: { x: 1, y: 1, z: 1 }
        },
        geometry: {
          radius: 10,
          tube: 3,
          tubularSegments: 100,
          radialSegments: 16,
          p: 2,
          q: 3
        },
        material: {
          type: "standard",
          color: "#ff00ff",
          metalness: 1,
          roughness: 0
        },
        animation: {}
      }
    ]
  };
}

editButton.addEventListener("click", () => {
  yamlEditor.style.display = "none"
  if (yamlEditor.style.display === "none") {
    try {
      alert("filling text area")
      updateSceneConfigFromUI();
      yamlTextarea.value = jsyaml.dump(sceneConfig);
      yamlEditor.style.display = "block";
    } catch (err) {
      alert("Could not dump sceneConfig: " + err.message);
    }
  } else {
    try {
      try {
      const newConfig = jsyaml.load(yamlTextarea.value);
      } catch {
	 alert("filling text area")
	 updateSceneConfigFromUI();
	 yamlTextarea.value = jsyaml.dump(sceneConfig);
         const newConfig = jsyaml.load(yamlTextarea.value);
      }
      if (!newConfig) { alert("no newConfig!") }
      if (!newConfig || !newConfig.background || !newConfig.objects || !newConfig.lighting) {
        throw new Error("Missing required keys: background, lighting, or objects");
      }
      sceneConfig = newConfig;
      loadSceneFromConfig(sceneConfig);
      yamlEditor.style.display = "none";
    } catch (err) {
      alert("YAML Error: " + err.message);
    }
  }
});

Object.defineProperty(window, 'sceneConfig', {
  get: () => sceneConfig
});
