import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.module.js';

let scene, camera, renderer, ambientLight, directionalLight, mesh;
let audioCtx, analyser, dataArray;
let rotateAnim = true, scaleAnim = true;
let sceneConfig = {};
let selectedObjectIndex = 0;


const geomParams = ['radius', 'tube', 'tubularSegments', 'radialSegments', 'p', 'q'];
const freqBands = ['lows', 'mids', 'highs'];
const modulations = {};

init();

function init() {
  initScene();
  initDraggables();
  bindUI();

  // Automatically load the scene configuration
  fetch('presets/wire.json')
    .then(res => res.json())
    .then(config => {
      sceneConfig = config;
      loadSceneFromConfig(sceneConfig);
      setupAudio();
    })
    .catch(err => {
      console.error("Failed to load scene configuration:", err);
    });
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

  // 💾 Export to YAML
  document.getElementById('btnExportYaml').addEventListener('click', () => {
    updateSceneConfigFromUI();
    const yamlText = jsyaml.dump(sceneConfig);
    const blob = new Blob([yamlText], { type: 'text/yaml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'scene.yaml';
    a.click();
  });

  // 📝 Edit YAML - handled elsewhere (e.g., YAML editor)

  // ANIMATION - enable rotation?
  document.getElementById('enableRotation').addEventListener('change', e => {
    rotateAnim = e.target.checked;
  });

  // ANIMATION - enable scaling?
  document.getElementById('enableScale').addEventListener('change', e => {
    scaleAnim = e.target.checked;
  });

  // LIGHTING -  ambient light
  document.getElementById('ambientLight').addEventListener('input', e => {
    if (ambientLight) ambientLight.intensity = parseFloat(e.target.value);
    if (sceneConfig.lighting?.ambient) {
      sceneConfig.lighting.ambient.intensity = parseFloat(e.target.value);
    }
  });

  // LIGHTING - directional light
  document.getElementById('directionalLight').addEventListener('input', e => {
    if (directionalLight) directionalLight.intensity = parseFloat(e.target.value);
    if (sceneConfig.lighting?.directional) {
      sceneConfig.lighting.directional.intensity = parseFloat(e.target.value);
    }
  });

  // LIGHTING - background color
  document.getElementById('bgColor').addEventListener('input', e => {
    if (scene) scene.background = new THREE.Color(e.target.value);
    sceneConfig.background = e.target.value;
  });
}


function createGeometryAnimationUI() {
  const container = document.getElementById('geometryAnimations');
  if (!container) {
    console.warn("createGeometryAnimationUI: #geometryAnimations not found yet.");
    return;
  }

  container.innerHTML = "";

  if (!sceneConfig.objects || !sceneConfig.objects[0]) return;
  const obj = sceneConfig.objects[selectedObjectIndex];
  const anim = obj.animation ||= {};

  geomParams.forEach(param => {
    const anim = obj.animation ||= {};
    anim[param] ||= {
      min: parseFloat(obj.geometry[param]),
      max: parseFloat(obj.geometry[param]),
      bands: []
    };

    const group = document.createElement('div');
    group.classList.add('modulation-group');
    group.innerHTML = `
      <div class="mod-header" data-param="${param}">
        <strong class="toggle-trigger">${param}</strong>
        <span class="toggle-icon">▲</span>
      </div>
      <div class="mod-content" id="${param}ModContent" style="display: block;">
        <label class="range-values">
          <span id="${param}MinLabel">${anim[param].min}</span> →
          <span id="${param}MaxLabel">${anim[param].max}</span>
        </label>
        <div class="noui-slider-wrapper slider-round">
          <div class="noui-range" id="${param}Slider"></div>
        </div>
        <div class="mod-checkboxes">
          <label><input type="checkbox" id="${param}Lows"> Lows</label>
          <label><input type="checkbox" id="${param}Mids"> Mids</label>
          <label><input type="checkbox" id="${param}Highs"> Highs</label>
        </div>
      </div>
    `;

    container.appendChild(group);


    // Initialize noUiSlider
    const slider = document.getElementById(`${param}Slider`);
    noUiSlider.create(slider, {
      start: [anim[param].min, anim[param].max],
      connect: true,
      range: {
        min: 0,
        max: 300
      },
      step: 0.1,
      tooltips: [false, false],
      format: {
        to: v => parseFloat(v).toFixed(1),
        from: v => parseFloat(v)
      }
    });

    slider.parentElement.classList.add('slider-round');

    slider.noUiSlider.on('update', (values) => {
      anim[param].min = parseFloat(values[0]);
      anim[param].max = parseFloat(values[1]);
      document.getElementById(`${param}MinLabel`).textContent = values[0];
      document.getElementById(`${param}MaxLabel`).textContent = values[1];
    });

    // Collapse toggle
    const toggleLabel = group.querySelector('.toggle-trigger');
    const toggleIcon = group.querySelector('.toggle-icon');
    const modContent = group.querySelector('.mod-content');

    toggleLabel.addEventListener('click', () => {
      const isVisible = modContent.style.display === 'block';
      modContent.style.display = isVisible ? 'none' : 'block';
      toggleIcon.textContent = isVisible ? '▼' : '▲';
    });

    // Checkboxes
    ['Lows', 'Mids', 'Highs'].forEach(band => {
      const checkbox = document.getElementById(`${param}${band}`);
      checkbox.checked = anim[param].bands.includes(band.toLowerCase());
      checkbox.addEventListener('change', () => {
        const bands = anim[param].bands;
        const key = band.toLowerCase();
        if (checkbox.checked && !bands.includes(key)) {
          bands.push(key);
        } else {
          anim[param].bands = bands.filter(b => b !== key);
        }
      });
    });
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
  const anim = sceneConfig.objects?.[0]?.animation?.[param];
  if (!anim) return baseVal;

  const min = anim.min ?? baseVal;
  const max = anim.max ?? baseVal;
  const selectedBands = anim.bands || [];

  let modVal = 0;
  selectedBands.forEach(band => {
    modVal += bands[band] ?? 0;
  });

  return min + modVal * (max - min);
}

function rebuildGeometry() {
  const obj = sceneConfig.objects[selectedObjectIndex];

  // Remove the existing mesh
  if (mesh) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    mesh = null;
  }

  // Sync geometry inputs → config
  geomParams.forEach(p => {
    const input = document.getElementById(p);
    if (input) {
      obj.geometry[p] = parseFloat(input.value);
    }
  });

  // Create geometry and material
  const geometry = new THREE.TorusKnotGeometry(
    obj.geometry.radius,
    obj.geometry.tube,
    obj.geometry.tubularSegments,
    obj.geometry.radialSegments,
    obj.geometry.p,
    obj.geometry.q
  );

  const material = new THREE.MeshStandardMaterial({
    color: obj.material.color,
    metalness: obj.material.metalness,
    roughness: obj.material.roughness
  });

  // Create mesh and add to scene
  mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(
    obj.transform.position.x,
    obj.transform.position.y,
    obj.transform.position.z
  );
  mesh.rotation.set(
    obj.transform.rotation.x,
    obj.transform.rotation.y,
    obj.transform.rotation.z
  );
  mesh.scale.set(
    obj.transform.scale.x,
    obj.transform.scale.y,
    obj.transform.scale.z
  );

  scene.add(mesh);

  // Sync Mesh Visibility
  mesh.visible = obj.visible !== false;

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
  // ✅ Deep copy for in-memory sync
  sceneConfig = JSON.parse(JSON.stringify(config));

  // 🧹 Remove existing mesh
  if (mesh) {
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    mesh = null;
  }

  // ✅ Set scene background from config
  scene.background = new THREE.Color(sceneConfig.background);

  // ✅ Create and add lights
  ambientLight = new THREE.AmbientLight(
    sceneConfig.lighting.ambient.color,
    sceneConfig.lighting.ambient.intensity
  );
  directionalLight = new THREE.DirectionalLight(
    sceneConfig.lighting.directional.color,
    sceneConfig.lighting.directional.intensity
  );
  directionalLight.position.set(
    sceneConfig.lighting.directional.position.x,
    sceneConfig.lighting.directional.position.y,
    sceneConfig.lighting.directional.position.z
  );

  scene.add(ambientLight, directionalLight);

  // ✅ Update object selector dropdown
  populateObjectSelector();

  // ✅ Update all object-specific inputs
  updateObjectPropertiesUI();

  // ✅ Build mesh based on current object
  rebuildGeometry();
}


function populateObjectSelector() {
  const container = document.getElementById('layerList');
  container.innerHTML = "";

  sceneConfig.objects.forEach((obj, index) => {
    const div = document.createElement('div');
    div.classList.add('layer-entry');
    if (index === selectedObjectIndex) div.classList.add('active');

    // Layer name
    const nameSpan = document.createElement('span');
    nameSpan.classList.add('layer-name');
    nameSpan.textContent = obj.name || obj.id || `Object ${index}`;

    // Eye icon
    const eyeSpan = document.createElement('span');
    eyeSpan.classList.add('layer-eye');
    eyeSpan.innerHTML = obj.visible !== false ? '👁' : '🚫';

    // Click to select layer
    div.addEventListener('click', () => {
      selectedObjectIndex = index;
      updateObjectPropertiesUI();
      rebuildGeometry();
      populateObjectSelector(); // Refresh UI to show active
    });

    // Click to toggle visibility
    eyeSpan.addEventListener('click', e => {
      e.stopPropagation(); // Don't trigger parent click
      const current = sceneConfig.objects[index].visible !== false;
      sceneConfig.objects[index].visible = !current;
      eyeSpan.innerHTML = current ? '🚫' : '👁';

      // Remove or hide from scene
      if (mesh && index === selectedObjectIndex) {
        mesh.visible = !current;
      }
    });

    div.appendChild(nameSpan);
    div.appendChild(eyeSpan);
    container.appendChild(div);
  });
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
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    title.addEventListener('pointerdown', e => {
      e.preventDefault();
      isDragging = true;

      const rect = panel.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;

      title.setPointerCapture(e.pointerId);

      const onPointerMove = e => {
        if (!isDragging) return;
        panel.style.left = `${e.clientX - offsetX}px`;
        panel.style.top = `${e.clientY - offsetY}px`;
      };

      const onPointerUp = () => {
        isDragging = false;
        title.releasePointerCapture(e.pointerId);
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
      };

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    });

    title.ondragstart = () => false;
  });
}

// DRAG-AND-DROP: Implement logic to cancel the drag operation
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    // Implement logic to cancel the drag operation
    // For example, reset the panel's position or remove event listeners
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
  }
});

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

// YAML EDITOR - Setup debounce and helpers

let debounceTimer;

function debounce(fn, delay = 500) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fn, delay);
}

function safeParseYaml(text) {
  try {
    const parsed = jsyaml.load(text);
    if (!parsed || typeof parsed !== 'object') throw new Error("Invalid YAML structure");
    return applyDefaultConfig(parsed);
  } catch (e) {
    yamlStatus.textContent = `YAML Error: ${e.message}`;
    return null;
  }
}

function diffConfigs(current, edited) {
  const diffs = [];
  const checkDiff = (a, b, path = "") => {
    if (typeof a !== typeof b || JSON.stringify(a) !== JSON.stringify(b)) {
      diffs.push(`${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
    }
  };

  function recurse(obj1, obj2, prefix = "") {
    const keys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);
    keys.forEach(k => {
      const val1 = obj1?.[k];
      const val2 = obj2?.[k];
      if (typeof val1 === 'object' && typeof val2 === 'object') {
        recurse(val1, val2, `${prefix}${k}.`);
      } else {
        checkDiff(val1, val2, `${prefix}${k}`);
      }
    });
  }

  recurse(current, edited);
  return diffs;
}

// YAML EDITOR -Live Preview with Debounce on YAML Input
yamlTextarea.addEventListener("input", () => {
  debounce(() => {
    const previewConfig = safeParseYaml(yamlTextarea.value);
    if (previewConfig) {
      yamlStatus.textContent = "✔ Live preview applied";
      sceneConfig = previewConfig;
      loadSceneFromConfig(sceneConfig);
      createGeometryAnimationUI();
    }
  }, 600);
});

// YAML EDITOR - "Edit Code” Button (Toggle open)
document.getElementById("btnEditYaml").addEventListener("click", () => {
  updateSceneConfigFromUI();
  yamlTextarea.value = jsyaml.dump(sceneConfig);
  yamlEditor.style.display = "block";
  yamlStatus.textContent = "YAML loaded from scene";
});


// YAML EDITOR - Validate Button
document.getElementById("btnValidateYaml").addEventListener("click", () => {
  const parsed = safeParseYaml(yamlTextarea.value);
  if (parsed) yamlStatus.textContent = "✅ Valid YAML";
});

// YAML EDITOR - Show diff button
document.getElementById("btnShowDiff").addEventListener("click", () => {
  const parsed = safeParseYaml(yamlTextarea.value);
  if (!parsed) return;
  const diffs = diffConfigs(sceneConfig, parsed);
  if (diffs.length === 0) {
    yamlStatus.textContent = "No differences from current scene.";
  } else {
    alert("Changes:\n\n" + diffs.join("\n"));
  }
});

// YAML EDITOR - Apply YAML Button
document.getElementById("btnApplyYaml").addEventListener("click", () => {
  const parsed = safeParseYaml(yamlTextarea.value);
  if (!parsed) return;
  sceneConfig = parsed;
  loadSceneFromConfig(sceneConfig);
  createGeometryAnimationUI();
  updateSceneConfigFromUI();
  yamlEditor.style.display = "none";
  yamlStatus.textContent = "";
});

// YAML EDITOR - Close Button
document.getElementById("btnCloseYaml").addEventListener("click", () => {
  yamlEditor.style.display = "none";
  yamlStatus.textContent = "";
});

editButton.addEventListener("click", () => {
  yamlEditor.style.display = "none"
  if (yamlEditor.style.display === "none") {
    try {
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


// Render Object Properties <div>
function updateObjectPropertiesUI() {
  const panel = document.getElementById('objectPropertiesPanel');
  const obj = sceneConfig.objects[selectedObjectIndex];
  const geo = obj.geometry;
  const mat = obj.material;

  const panelContent = document.createElement('div');
  panelContent.className = 'panel-content';

  panelContent.innerHTML = `
    <h4>Surface</h4>
    <label>Color <input type="color" id="objColor" value="${mat.color}"></label>
    <label>Metalness <input type="range" id="objMetal" min="0" max="1" step="0.01" value="${mat.metalness}"></label>
    <label>Roughness <input type="range" id="objRough" min="0" max="1" step="0.01" value="${mat.roughness}"></label>

    <h4>Geometry</h4>
    <div class="geometry-grid">
      ${geomParams.map(p => `
        <div class="geom-row">
          <label for="${p}">${p}</label>
          <input type="number" id="${p}" value="${geo[p]}" step="0.1">
        </div>
      `).join("")}
    </div>

    <h4>Animation</h4>
    <div class="panel-content">
     <label><input type="checkbox" id="enableRotation" checked> Animate Rotation</label>
     <label><input type="checkbox" id="enableScale" checked> Animate Scale</label>
    </div>
    <h5>Geometry</h5>
    <div id="geometryAnimations"></div>
  `;

  panel.innerHTML = '';
  panel.appendChild(panelContent);

  bindObjectUIInputs(obj);
  createGeometryAnimationUI();
}

// OBJECT PROPERTIES -  Hook Up Input Handlers
function bindObjectUIInputs(obj) {
  document.getElementById('objColor').addEventListener('input', e => {
    obj.material.color = e.target.value;
    mesh.material.color.set(e.target.value);
  });

  document.getElementById('objMetal').addEventListener('input', e => {
    obj.material.metalness = parseFloat(e.target.value);
    mesh.material.metalness = obj.material.metalness;
  });

  document.getElementById('objRough').addEventListener('input', e => {
    obj.material.roughness = parseFloat(e.target.value);
    mesh.material.roughness = obj.material.roughness;
  });

  geomParams.forEach(p => {
    document.getElementById(p).addEventListener('input', () => {
      obj.geometry[p] = parseFloat(document.getElementById(p).value);
      rebuildGeometry();
    });
  });
}

// // OBJECT SELECTION - handle layer selection
// document.getElementById('objectSelector').addEventListener('change', e => {
//   selectedObjectIndex = parseInt(e.target.value);
//   updateObjectPropertiesUI();
//   rebuildGeometry();
// });

