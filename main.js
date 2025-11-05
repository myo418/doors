import * as THREE from 'three';

//// 基本セットアップ ////
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(devicePixelRatio);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);

const camera = new THREE.PerspectiveCamera(75, innerWidth/innerHeight, 0.1, 1000);
camera.position.set(0, 1.7, 0);

// ライト（環境光+指向性光で立体感を出す）
const ambient = new THREE.AmbientLight(0xffffff, 0.8);
scene.add(ambient);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(3, 5, 2);
scene.add(dirLight);

// 白い正16角形シリンダーの部屋
const roomRadius = 10; // 半径
const roomHeight = 4; // 高さ
const segments = 16; // 16角形

// 床（円形）
const floor = new THREE.Mesh(
  new THREE.CircleGeometry(roomRadius, segments),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 })
);
floor.rotation.x = -Math.PI/2;
floor.position.y = 0.1;
scene.add(floor);

// 天井（円形）
const ceiling = new THREE.Mesh(
  new THREE.CircleGeometry(roomRadius, segments),
  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 })
);
ceiling.rotation.x = Math.PI/2;
ceiling.position.y = roomHeight;
scene.add(ceiling);

// 16個の壁パネルを配置
const wallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
const angleStep = (Math.PI * 2) / segments;

for (let i = 0; i < segments; i++) {
  const angle = i * angleStep;
  const nextAngle = (i + 1) * angleStep;

  // 壁の幅を計算（16角形の一辺の長さ）
  const x1 = Math.cos(angle) * roomRadius;
  const z1 = Math.sin(angle) * roomRadius;
  const x2 = Math.cos(nextAngle) * roomRadius;
  const z2 = Math.sin(nextAngle) * roomRadius;
  const wallWidth = Math.sqrt((x2-x1)**2 + (z2-z1)**2);

  // 壁パネル作成
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(wallWidth, roomHeight),
    wallMat
  );

  // 壁の中心位置
  const centerX = (x1 + x2) / 2;
  const centerZ = (z1 + z2) / 2;

  // 壁を配置して回転（部屋の内側から見えるように）
  wall.position.set(centerX, roomHeight/2, centerZ);
  wall.rotation.y = -(angle + angleStep/2) + Math.PI/2 + Math.PI;

  scene.add(wall);
}

// ロック画面を非表示
const lockDiv = document.getElementById('lock');
lockDiv.style.display = 'none';

// 移動入力
const keys = new Set();
window.addEventListener('keydown', e => keys.add(e.code));
window.addEventListener('keyup',   e => keys.delete(e.code));

// オーディオ
const listener = new THREE.AudioListener();
camera.add(listener);
const audioLoader = new THREE.AudioLoader();

// 扉生成：ヒンジ（pivot）で回す → 少し開いて戻す
const DOORS = [];
const doorGroup = new THREE.Group(); scene.add(doorGroup);

function createDoor({ x=0, z=0, color=0x888888, openAngle=0.26, soundUrl=null, rotationY=0 }) {
  const width=0.9, height=2.2, depth=0.05;

  // 扉ルート
  const root = new THREE.Group();
  root.position.set(x, 0, z);
  root.rotation.y = rotationY;

  // Pivot（ヒンジを左端に）
  const pivot = new THREE.Group();
  pivot.position.set(0, 0, 0);
  root.add(pivot);

  // 扉板メッシュ（原点中心の板を、ヒンジ位置から半分オフセット）
  const doorGeo = new THREE.BoxGeometry(width, height, depth);
  const doorMat = new THREE.MeshStandardMaterial({ color, roughness:0.3, metalness:0.1 });
  const door = new THREE.Mesh(doorGeo, doorMat);
  door.castShadow = door.receiveShadow = true;
  door.position.set(width/2, height/2, 0); // pivotから見て右に半分、下から高さの半分
  pivot.add(door);

  // 扉のパネル装飾（縦長の凹み）
  const panelWidth = width * 0.7;
  const panelHeight = height * 0.4;
  const panelDepth = 0.02;

  // 上のパネル
  const topPanel = new THREE.Mesh(
    new THREE.BoxGeometry(panelWidth, panelHeight, panelDepth),
    new THREE.MeshStandardMaterial({ color: color, roughness:0.4 })
  );
  topPanel.position.set(width/2, height * 0.7, depth/2 + panelDepth/2);
  pivot.add(topPanel);

  // 下のパネル
  const bottomPanel = new THREE.Mesh(
    new THREE.BoxGeometry(panelWidth, panelHeight, panelDepth),
    new THREE.MeshStandardMaterial({ color: color, roughness:0.4 })
  );
  bottomPanel.position.set(width/2, height * 0.3, depth/2 + panelDepth/2);
  pivot.add(bottomPanel);

  // ドアノブ
  const knobRadius = 0.04;
  const knobGeo = new THREE.SphereGeometry(knobRadius, 16, 16);
  const knobMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness:0.2, metalness:0.8 });
  const knob = new THREE.Mesh(knobGeo, knobMat);
  knob.position.set(width * 0.85, height * 0.5, depth/2 + knobRadius);
  pivot.add(knob);

  // ドアノブの軸
  const knobBaseGeo = new THREE.CylinderGeometry(knobRadius * 0.6, knobRadius * 0.6, 0.08, 16);
  const knobBase = new THREE.Mesh(knobBaseGeo, knobMat);
  knobBase.rotation.x = Math.PI / 2;
  knobBase.position.set(width * 0.85, height * 0.5, depth/2 + 0.04);
  pivot.add(knobBase);

  // ドアフレーム（上、左、右）
  const frameThickness = 0.08;
  const frameDepth = 0.1;
  const frameMat = new THREE.MeshStandardMaterial({ color:0x444444, roughness:0.8 });

  // 上フレーム
  const topFrame = new THREE.Mesh(
    new THREE.BoxGeometry(width + frameThickness * 2, frameThickness, frameDepth),
    frameMat
  );
  topFrame.position.set(width/2, height + frameThickness/2, 0);
  root.add(topFrame);

  // 左フレーム
  const leftFrame = new THREE.Mesh(
    new THREE.BoxGeometry(frameThickness, height, frameDepth),
    frameMat
  );
  leftFrame.position.set(-frameThickness/2, height/2, 0);
  root.add(leftFrame);

  // 右フレーム
  const rightFrame = new THREE.Mesh(
    new THREE.BoxGeometry(frameThickness, height, frameDepth),
    frameMat
  );
  rightFrame.position.set(width + frameThickness/2, height/2, 0);
  root.add(rightFrame);

  // 当たり判定用の不可視ボックス（レイキャスト対象）
  const hitBox = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth*4),
    new THREE.MeshBasicMaterial({ color:0xff0000, visible:false })
  );
  hitBox.position.set(width/2, height/2, 0);
  root.add(hitBox);

  // サウンド（環境音）
  const sound = new THREE.PositionalAudio(listener);
  if (soundUrl) {
    audioLoader.load(soundUrl, buffer => {
      sound.setBuffer(buffer);
      sound.setRefDistance(2);
      sound.setVolume(0.9);
    });
  }
  door.add(sound); // 扉から鳴る

  // 開閉音
  const openSound = new THREE.PositionalAudio(listener);
  audioLoader.load('sounds/open.mp3', buffer => {
    openSound.setBuffer(buffer);
    openSound.setRefDistance(2);
    openSound.setVolume(0.7);
  });
  door.add(openSound);

  const closeSound = new THREE.PositionalAudio(listener);
  audioLoader.load('sounds/close.mp3', buffer => {
    closeSound.setBuffer(buffer);
    closeSound.setRefDistance(2);
    closeSound.setVolume(0.7);
  });
  door.add(closeSound);

  // 状態
  const state = {
    pivot, hitBox, door,
    isHolding: false, // Eキーを押し続けているか
    openAngle: openAngle,
    t: 0, // 0〜1 の開き具合
    sound,
    openSound,
    closeSound,
    wasOpening: false // 開き始めたかどうかを追跡
  };

  DOORS.push(state);
  doorGroup.add(root);
}

// 扉を16枚の壁それぞれに配置
const doorInset = 0.3; // 壁から内側へのオフセット
const doorOpenAngle = 0.26; // 固定開き角度（ラジアン）
const doorConfigs = [
  { color: 0x4cc9f0, sound: 'door-baby.mp3' },
  { color: 0xf72585, sound: 'door-birds.mp3' },
  { color: 0xb5179e, sound: 'door-wind.mp3' },
  { color: 0x7209b7, sound: 'door-cicada.mp3' },
  { color: 0x3a0ca3, sound: 'door-rain.mp3' },
  { color: 0xf72585, sound: 'door-intersection.mp3' },
  { color: 0x4cc9f0, sound: 'door-bath.mp3' },
  { color: 0x560bad, sound: 'door-market.mp3' },
  { color: 0x4cc9f0, sound: 'door-town.mp3' },
  { color: 0xb5179e, sound: 'door-river.mp3' },
  { color: 0x7209b7, sound: 'door-water.mp3' },
  { color: 0xf72585, sound: 'door-fire-works.mp3' },
  { color: 0x560bad, sound: 'door-factory.mp3' },
  { color: 0x4cc9f0, sound: 'door-noise.mp3' },
  { color: 0x7209b7, sound: 'door-higurashi.mp3' },
  { color: 0xb5179e, sound: 'door-japanese-home.mp3' }
];

for (let i = 0; i < segments; i++) {
  const angle = i * angleStep + angleStep/2; // 壁の中央の角度
  const doorRadius = roomRadius - doorInset;
  const x = Math.cos(angle) * doorRadius;
  const z = Math.sin(angle) * doorRadius;
  const config = doorConfigs[i];

  createDoor({
    x,
    z,
    color: config.color,
    soundUrl: `sounds/${config.sound}`,
    openAngle: doorOpenAngle,
    rotationY: -angle + Math.PI/2 + Math.PI // 中心を向くように
  });
}

//// 扉との距離判定（上下角度を無視） ////
const hint = document.getElementById('hint');

function getFocusedDoor(maxDist=3.5) {
  // カメラの水平方向の向きを取得
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0; // 上下成分を無視
  forward.normalize();

  const cameraPos = camera.position.clone();
  cameraPos.y = 0; // 高さを無視

  // 各扉との距離と方向をチェック
  let closestDoor = null;
  let minDistance = maxDist;

  for (const d of DOORS) {
    // hitBoxのワールド座標を取得
    const doorWorldPos = new THREE.Vector3();
    d.hitBox.getWorldPosition(doorWorldPos);
    doorWorldPos.y = 0; // 高さを無視

    const toDoor = doorWorldPos.clone().sub(cameraPos);
    const distance = toDoor.length();

    if (distance > maxDist) continue;

    toDoor.normalize();
    const angle = Math.acos(Math.max(-1, Math.min(1, forward.dot(toDoor))));

    // 正面90度以内で、最も近い扉を選択
    if (angle < Math.PI / 2 && distance < minDistance) {
      minDistance = distance;
      closestDoor = d;
    }
  }

  return closestDoor;
}

// Eキーの状態を追跡
let currentFocusedDoor = null;

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyE' && !e.repeat) {
    const d = getFocusedDoor();
    if (d) {
      currentFocusedDoor = d;
      d.isHolding = true;
    }
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'KeyE') {
    if (currentFocusedDoor) {
      currentFocusedDoor.isHolding = false;
      currentFocusedDoor = null;
    }
  }
});

//// カメラ回転と移動（カーソルキーのみ） ////
const MOVE_SPEED = 7.0;
const TURN_SPEED = 2.0; // ラジアン/秒

function updateMovement(dt) {
  // カーソルキー左右で視点回転
  if (keys.has('ArrowLeft')) {
    camera.rotation.y += TURN_SPEED * dt;
  }
  if (keys.has('ArrowRight')) {
    camera.rotation.y -= TURN_SPEED * dt;
  }

  // カーソルキー上下で前後移動
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  forward.y = 0; forward.normalize();

  let v = new THREE.Vector3();
  if (keys.has('ArrowUp')) {
    v.add(forward);
  }
  if (keys.has('ArrowDown')) {
    v.sub(forward);
  }

  if (v.lengthSq()>0) {
    v.normalize().multiplyScalar(MOVE_SPEED*dt);

    // 新しい位置を計算
    const newPos = camera.position.clone().add(v);

    // 壁との衝突判定（部屋の中心からの距離を制限）
    const distFromCenter = Math.sqrt(newPos.x * newPos.x + newPos.z * newPos.z);
    const maxDist = roomRadius - 0.5; // 壁から0.5m内側まで

    if (distFromCenter < maxDist) {
      camera.position.copy(newPos);
    } else {
      // 壁に近すぎる場合は、最大距離に制限
      const angle = Math.atan2(newPos.z, newPos.x);
      camera.position.x = Math.cos(angle) * maxDist;
      camera.position.z = Math.sin(angle) * maxDist;
    }
  }
}

// 扉アニメ（Eキー押し続けで開く）
function updateDoors(dt) {
  const openSpeed = 3.0;  // 開く速度（1秒で完全に開く = 1/speed秒）
  const closeSpeed = 4.0; // 閉じる速度

  // ヒント更新
  const focus = getFocusedDoor();
  hint.textContent = focus ? 'E 長押しで扉を開く' : '';

  for (const d of DOORS) {
    const prevT = d.t;

    // Eキーを押している間は開く
    if (d.isHolding) {
      d.t += openSpeed * dt;
      if (d.t > 1) d.t = 1;

      // 開き始めたら開く音を再生
      if (!d.wasOpening && d.t > 0) {
        d.wasOpening = true;
        if (d.openSound && !d.openSound.isPlaying) {
          d.openSound.play();
        }
      }

      // 環境音を再生（まだ再生されていなければ）
      if (d.sound && !d.sound.isPlaying) {
        d.sound.play();
      }
    } else {
      // Eキーを離したら閉じる
      if (d.t > 0) {
        // 閉じ始めたら閉じる音を再生
        if (d.wasOpening && prevT > 0) {
          d.wasOpening = false;
          if (d.closeSound && !d.closeSound.isPlaying) {
            d.closeSound.play();
          }
        }

        d.t -= closeSpeed * dt;
        if (d.t < 0) d.t = 0;

        // 完全に閉じたら環境音を停止
        if (d.t === 0 && d.sound && d.sound.isPlaying) {
          d.sound.stop();
        }
      }
    }

    // イージング（スムーズステップ）
    const e = d.t * d.t * (3 - 2 * d.t);
    d.pivot.rotation.y = -e * d.openAngle; // マイナスで手前に開く
  }
}

//// ループ ////
let last = performance.now();
function loop(now=performance.now()) {
  const dt = Math.min(0.033, (now - last)/1000); last = now;
  updateMovement(dt);
  updateDoors(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();

//// リサイズ ////
addEventListener('resize', ()=>{
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
