from zipfile import ZipFile
import os

project_files = {
    "index.html": """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Visualizer Loader</title>
  <style>
    body { margin: 0; overflow: hidden; background: #111; color: white; font-family: sans-serif; }
    canvas { display: block; }
    #loadBtn { position: fixed; top: 10px; left: 10px; z-index: 10; background: #222; color: #fff; border: none; padding: 10px; cursor: pointer; }
  </style>
</head>
<body>
  <button id="loadBtn">Load Scene</button>
  <script type="module" src="main.js"></script>
</body>
</html>
""",
    "main.js": """
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 50;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let objects = [];

document.getElementById('loadBtn').addEventListener('click', () => {
  fetch('sceneConfig.json')
    .then(res => res.json())
    .then(config => {
      objects.forEach(obj => scene.remove(obj));
      objects = loadSceneFromConfig(config, scene);
    });
});

function loadSceneFromConfig(config, scene) {
  scene.background = new THREE.Color(config.background);

  const ambient = new THREE.AmbientLight(config.lighting.ambient.color, config.lighting.ambient.intensity);
  const directional = new THREE.DirectionalLight(config.lighting.directional.color, config.lighting.directional.intensity);
  directional.position.set(...Object.values(config.lighting.directional.position));
  scene.add(ambient);
  scene.add(directional);

  return config.objects.map(objConfig => {
    const mesh = buildObjectFromConfig(objConfig);
    scene.add(mesh);
    return mesh;
  });
}

function buildObjectFromConfig(obj) {
  let geometry;
  if (obj.type === 'torusKnot') {
    geometry = new THREE.TorusKnotGeometry(
      obj.geometry.radius, obj.geometry.tube,
      obj.geometry.tubularSegments, obj.geometry.radialSegments,
      obj.geometry.p, obj.geometry.q
    );
  }

  const material = new THREE.MeshStandardMaterial({
    color: obj.material.color,
    metalness: obj.material.metalness,
    roughness: obj.material.roughness
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...Object.values(obj.transform.position));
  mesh.rotation.set(...Object.values(obj.transform.rotation));
  mesh.scale.set(...Object.values(obj.transform.scale));

  return mesh;
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

animate();
""",
    "sceneConfig.json": """
{
  "sceneId": "demo-001",
  "background": "#111111",
  "lighting": {
    "ambient": { "color": "#ffffff", "intensity": 0.3 },
    "directional": {
      "color": "#ffffff",
      "intensity": 0.8,
      "position": { "x": 10, "y": 20, "z": 30 }
    }
  },
  "objects": [
    {
      "id": "obj-1",
      "name": "TorusKnot",
      "visible": true,
      "type": "torusKnot",
      "transform": {
        "position": { "x": 0, "y": 0, "z": 0 },
        "rotation": { "x": 0, "y": 0, "z": 0 },
        "scale": { "x": 1, "y": 1, "z": 1 }
      },
      "geometry": {
        "radius": 10,
        "tube": 3,
        "tubularSegments": 100,
        "radialSegments": 16,
        "p": 2,
        "q": 3
      },
      "material": {
        "type": "standard",
        "color": "#ff00ff",
        "metalness": 1,
        "roughness": 0
      },
      "animation": {}
    }
  ]
}
"""
}


# Update project to include UI panels in the HTML and JS
project_files_with_ui = {
    "index.html": """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Visualizer Loader with UI</title>
  <style>
    body { margin: 0; overflow: hidden; background: #111; color: white; font-family: sans-serif; }
    canvas { display: block; }

    #topBar {
      position: fixed;
      top: 0;
      width: 100%;
      background: rgba(0, 0, 0, 0.85);
      display: flex;
      justify-content: center;
      gap: 15px;
      padding: 10px;
      z-index: 1000;
    }

    #topBar button {
      background: #333;
      color: #fff;
      border: 1px solid #888;
      padding: 6px 12px;
      border-radius: 4px;
      cursor: pointer;
    }

    .floating-panel {
      position: absolute;
      background: rgba(0, 0, 0, 0.6);
      padding: 10px;
      border-radius: 8px;
      max-width: 320px;
      z-index: 10;
      box-shadow: 0 0 10px rgba(255, 255, 255, 0.1);
    }

    .title-bar {
      cursor: move;
      font-weight: bold;
      margin-bottom: 10px;
      background: rgba(255, 255, 255, 0.1);
      padding: 6px;
      border-radius: 4px;
    }

    .panel-content label {
      display: block;
      margin: 8px 0 4px;
    }

    .panel-content input[type="range"],
    .panel-content input[type="color"] {
      width: 100%;
    }

    ul.layer-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }

    ul.layer-list li {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px;
      background: #2a2a2a;
      border-bottom: 1px solid #444;
    }
  </style>
</head>
<body>

  <!-- Top Bar -->
  <div id="topBar">
    <button id="btnLoadScene">Load Scene</button>
  </div>

  <!-- Scene Canvas -->
  <canvas id="sceneCanvas"></canvas>

  <!-- Lighting Panel -->
  <div class="floating-panel" style="top: 70px; left: 10px;">
    <div class="title-bar">💡 Lighting</div>
    <div class="panel-content">
      <label>Ambient Light</label>
      <input type="range" id="ambientLight" min="0" max="2" step="0.1" value="0.5">
      <label>Directional Light</label>
      <input type="range" id="directionalLight" min="0" max="3" step="0.1" value="1.0">
      <label>Background Color</label>
      <input type="color" id="bgColor" value="#111111">
    </div>
  </div>

  <!-- Object Properties Panel -->
  <div class="floating-panel" style="top: 70px; right: 10px;">
    <div class="title-bar">📦 Object Properties</div>
    <div class="panel-content">
      <label>Color</label>
      <input type="color" id="objColor" value="#ff00ff">
      <label>Metalness</label>
      <input type="range" id="objMetal" min="0" max="1" step="0.01" value="1">
      <label>Roughness</label>
      <input type="range" id="objRough" min="0" max="1" step="0.01" value="0">
    </div>
  </div>

  <!-- Layer Manager Panel -->
  <div class="floating-panel" style="bottom: 20px; left: 10px;">
    <div class="title-bar">🧱 Layers</div>
    <ul class="layer-list" id="layerList">
      <li><span>🔲 TorusKnot</span> <span>👁️ 🗑️</span></li>
    </ul>
  </div>

  <script type="module" src="main.js"></script>
</body>
</html>
""",
    "main.js": project_files["main.js"],
    "sceneConfig.json": project_files["sceneConfig.json"]
}

# Save and zip updated project
zip_path_with_ui = "threejs_visualizer_loader_with_ui.zip"
with ZipFile(zip_path_with_ui, 'w') as zipf:
    for filename, content in project_files_with_ui.items():
        filepath = f"{filename}"
        with open(filepath, "w") as f:
            f.write(content.strip())
        zipf.write(filepath, arcname=filename)

zip_path_with_ui

