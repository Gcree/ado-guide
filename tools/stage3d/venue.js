// 沉浸模式的 3D 場館（設計見 docs/immersive-mode.md）
// 打包：cd tools/stage3d && npm run build → assets/stage3d.js
//
// 透視規則（避免奇怪的透視）：
// 1. 攝影機永遠不俯仰、不翻滾，只看正前方（-Z）。畫面構圖靠「鏡頭位移」（非對稱視錐）完成，直線永遠是直的。
// 2. 舞台大螢幕和視線垂直，所以網頁上的 YouTube 影片（平的 DOM）疊上去完全不會梯形變形。
// 3. 「視窗投影」：瀏覽器畫面就是螢幕那個深度的一扇窗。攝影機為了視差稍微移動時，跟著改視錐，
//    螢幕那個深度的東西永遠釘在原位（跟 DOM 影片對齊），比較近的觀眾移動得多、比較遠的移動得少。
// 4. 鏡頭焦距用畫面對角線算（約等於 35mm 鏡頭），直拿、橫拿、寬螢幕的透視強度都差不多。
import {
  WebGLRenderer, Scene, PerspectiveCamera, Color, Mesh, Group, Vector3, Quaternion,
  PlaneGeometry, BoxGeometry, CylinderGeometry, InstancedBufferGeometry, InstancedBufferAttribute,
  MeshBasicMaterial, ShaderMaterial, AdditiveBlending, DoubleSide
} from "three";

const SCREEN_W = 16;        // 舞台大螢幕寬 16 公尺（16:9）
const LENS = 0.78;          // 攝影機到畫面的距離＝畫面對角線 × LENS（像素），約 35mm 鏡頭
const GROUND = 0x05060a;    // 場館黑

// 共用：霧（指數平方），讓遠處的燈慢慢沉進黑暗
const FOG = /* glsl */`
  uniform float uFog;
  float fogK(float d) { return exp(-uFog * uFog * d * d); }
`;

export function createVenue(canvas, { mobile = false } = {}) {
  const renderer = new WebGLRenderer({ canvas, antialias: !mobile, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(GROUND, 1);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.25 : 1.75));
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 1, .3, 400);

  // 所有材質共用的數值，每一幀改這裡就好
  const U = {
    uTime: { value: 0 }, uSwing: { value: 0 }, uAmp: { value: .08 }, uHit: { value: 0 }, uRaise: { value: 0 },
    uFog: { value: .018 }, uC1: { value: new Color("#02b4f5") }, uC2: { value: new Color("#f8fafc") }, uC3: { value: new Color("#02b4f5") },
    // 觀眾手燈：跟網站送給 PenlightSync 的一樣（手燈色清單、現在輪到第幾色、亮度），拍手／跳躍動作
    uPal: { value: Array.from({ length: 8 }, () => new Color("#5d9dfe")) }, uNCol: { value: 1 }, uColIdx: { value: 0 }, uBright: { value: 1 },
    uClap: { value: 0 }, uClapPulse: { value: 0 }, uJump: { value: 0 }
  };

  // ── 舞台硬體：深色、不受光的材質（場館裡只看得到輪廓） ──
  const dark = new MeshBasicMaterial({ color: 0x0a0c13 });
  const darker = new MeshBasicMaterial({ color: 0x06070c });
  const stage = new Group();
  scene.add(stage);
  const box = (w, h, d, m) => { const o = new Mesh(new BoxGeometry(w, h, d), m); stage.add(o); return o; };
  const deck = box(34, 1, 5, dark);                       // 舞台
  // 舞台前緣 LED 燈條：一格一格 50 公分的燈，顏色沿著燈條流動循環（這首的手燈色；單色手燈的歌改成彩虹），重拍時整條亮一下
  const lipMat = new ShaderMaterial({
    uniforms: { ...U, uMono: { value: 0 } },
    vertexShader: /* glsl */`varying float vX; void main() { vX = position.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying float vX; uniform vec3 uC1, uC2, uC3; uniform float uTime, uHit, uRaise, uMono;
      vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
      void main() {
        float seg = floor(vX / .5), f = fract(vX / .5);
        float ph = fract(seg * .035 - uTime * .22);
        vec3 pen = ph < .3333 ? mix(uC1, uC2, ph * 3.0) : ph < .6667 ? mix(uC2, uC3, ph * 3.0 - 1.0) : mix(uC3, uC1, ph * 3.0 - 2.0);
        vec3 c = mix(pen, hue(fract(seg * .025 - uTime * .1)), uMono);
        float gap = smoothstep(.0, .08, f) * smoothstep(1.0, .92, f);
        float chase = .55 + .45 * pow(.5 + .5 * sin(seg * .55 - uTime * 3.2), 6.0);
        gl_FragColor = vec4(c * gap * chase * (.45 + uHit * .55 + uRaise * .3), 1.0);
      }`
  });
  const lip = box(34, .09, .06, lipMat);
  const truss = box(38, .45, .45, darker);                // 螢幕上方的燈架
  const bezel = [0, 1, 2, 3].map(() => box(1, 1, .25, darker)); // 螢幕外框
  const speakers = [-1, 1].map(() => box(1.3, 7.5, 1.3, darker)); // 兩側吊掛喇叭

  // 螢幕背後透出的光（加法混色，顏色跟手燈）
  const glowMat = new ShaderMaterial({
    uniforms: { ...U, uHalf: { value: [8, 4.5] } },
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: /* glsl */`
      varying vec2 vP;
      uniform vec2 uHalf;
      void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vP;
      uniform vec2 uHalf; uniform vec3 uC1, uC2; uniform float uHit, uRaise;
      void main() {
        vec2 q = max(abs(vP) - uHalf, 0.0);
        float d = length(q);
        float g = exp(-d * .5) * (.2 + uHit * .22) * (1.0 - uRaise * .55);
        vec3 c = mix(uC1, uC2, smoothstep(-uHalf.x, uHalf.x, vP.x) * .5);
        gl_FragColor = vec4(c, g);
      }`
  });
  const glow = new Mesh(new PlaneGeometry(60, 40), glowMat);
  stage.add(glow);

  // 舞台上方的光霧：從舞台往上淡掉的一層光
  const washMat = new ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; uniform vec3 uC1, uC2; uniform float uHit, uRaise;
      void main() {
        float a = pow(1.0 - vUv.y, 2.2) * (1.0 - pow(abs(vUv.x - .5) * 2.0, 3.0)) * (.07 + uHit * .06 + uRaise * .05);
        gl_FragColor = vec4(mix(uC1, uC2, vUv.x), a);
      }`
  });
  const wash = new Mesh(new PlaneGeometry(44, 10), washMat);
  stage.add(wash);

  // 兩側 LED 柱：慢慢流動的色帶＋LED 顆粒，重拍和大合唱時變亮
  const ledMat = new ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; uniform vec3 uC1, uC2; uniform float uTime, uHit, uRaise;
      void main() {
        float band = .5 + .5 * sin(vUv.y * 9.0 - uTime * 1.3 + vUv.x * 2.0);
        vec3 c = mix(uC1, uC2, band);
        vec2 cell = fract(vUv * vec2(10.0, 46.0));
        float led = smoothstep(.5, .32, length(cell - .5));
        float k = (.09 + uHit * .35 + uRaise * .3) * (.3 + .7 * led);
        gl_FragColor = vec4(c * k, 1.0);
      }`
  });
  const leds = [-2, -1, 1, 2].map(i => { const m = new Mesh(new PlaneGeometry(1.8, 11), ledMat); m.userData.i = i; stage.add(m); return m; });

  // ── 燈光：圓錐＋邊緣淡出的著色器（不需要後製）。三種：
  //   truss 燈架上的燈往觀眾席掃；up 舞台前緣往上打的射燈；follow 場館兩側高處打向舞台的追蹤燈
  const beamGeo = (len, r0, r1) => { const g = new CylinderGeometry(r0, r1, len, 28, 1, true); g.translate(0, -len / 2, 0); return g; };
  const GEO = { truss: beamGeo(24, .1, 2.2), up: beamGeo(22, .05, 1.1), follow: beamGeo(40, .12, 1.3) };
  const LEN = { truss: 24, up: 22, follow: 40 }, STRENGTH = { truss: .3, up: .26, follow: .32 };
  const makeBeam = (kind, i, extra) => {
    const mat = new ShaderMaterial({
      uniforms: { ...U, uCol: { value: new Color() }, uI: { value: .5 }, uLen: { value: LEN[kind] }, uK: { value: STRENGTH[kind] } },
      transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
      vertexShader: /* glsl */`
        uniform float uLen;
        varying float vT; varying vec3 vN; varying vec3 vV; varying float vD;
        void main() {
          vT = -position.y / uLen;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vD = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        varying float vT; varying vec3 vN; varying vec3 vV; varying float vD;
        uniform vec3 uCol; uniform float uI, uK;
        ${FOG}
        void main() {
          float f = pow(abs(dot(vN, vV)), 1.8);
          float a = uI * uK * f * pow(1.0 - vT, 1.3) * smoothstep(0.0, .03, vT) * mix(.45, 1.0, fogK(vD));
          gl_FragColor = vec4(uCol, a);
        }`
    });
    const m = new Mesh(GEO[kind], mat);
    m.userData = { kind, i, side: i % 2 ? 1 : -1, ph: i * 1.7, col: i % 3, ...extra };
    stage.add(m);
    return m;
  };
  const NT = mobile ? 6 : 10, NU = mobile ? 6 : 12;
  const beams = [
    ...Array.from({ length: NT }, (_, i) => makeBeam("truss", i, { n: NT })),
    ...Array.from({ length: NU }, (_, i) => makeBeam("up", i, { n: NU })),
    ...[0, 1].map(i => makeBeam("follow", i, { n: 2 }))
  ];
  const WARM = new Color("#fff3df");
  const target = new Vector3();
  const DOWN = new Vector3(0, -1, 0), dir = new Vector3(), q = new Quaternion();

  // ── 觀眾：一人一個頭肩剪影＋一支手燈，全部用 instancing（一次畫完） ──
  const N = mobile ? 1200 : 2400;
  const quad = new PlaneGeometry(1, 1);
  const crowdGeo = (extra) => {
    const g = new InstancedBufferGeometry();
    g.index = quad.index; g.setAttribute("position", quad.getAttribute("position")); g.setAttribute("uv", quad.getAttribute("uv"));
    g.instanceCount = 0;
    Object.entries(extra).forEach(([k, n]) => g.setAttribute(k, new InstancedBufferAttribute(new Float32Array(N * n), n)));
    return g;
  };
  // aSeed：x 每個人的小偏差、y 顏色順位（鄰座交錯）、z 亮度偏差、w 身材
  const headGeo = crowdGeo({ aBase: 3, aSeed: 4 });
  const stickGeo = crowdGeo({ aBase: 3, aSeed: 4 });

  // 共用：手燈現在的顏色（PenlightSync 的第 uColIdx 色，再依座位錯開）；跳躍時全場一起彈
  const CROWD = /* glsl */`
    uniform vec3 uPal[8];
    uniform float uNCol, uColIdx, uSwing, uJump, uClap, uClapPulse;
    vec3 palAt(float i) {
      int k = int(mod(i + .5, uNCol));
      vec3 c = uPal[0];
      for (int j = 1; j < 8; j++) if (j == k) c = uPal[j];
      return c;
    }
    float bounce(float ph) { return uJump * abs(sin((uSwing + ph * .12) * 3.14159265)); }
  `;

  // 剪影：頭＋肩；頭頂和肩膀上緣被自己手燈的顏色勾一條邊
  const headMat = new ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */`
      attribute vec3 aBase; attribute vec4 aSeed;
      varying vec2 vP; varying float vD; varying vec3 vCol;
      ${CROWD}
      void main() {
        vec3 w = aBase + vec3(position.x * .62, position.y * .78 + .39, 0.0) * aSeed.w;
        w.y += bounce(aSeed.x) + uClapPulse * uClap * .025;
        vP = vec2(position.x * .62, position.y * .78 + .39);
        vCol = palAt(uColIdx + aSeed.y);
        vec4 mv = modelViewMatrix * vec4(w, 1.0); vD = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vP; varying float vD; varying vec3 vCol;
      uniform float uRaise, uHit, uBright;
      ${FOG}
      float sdE(vec2 p, vec2 r) { return (length(p / r) - 1.0) * min(r.x, r.y); }
      void main() {
        float head = sdE(vP - vec2(0.0, .56), vec2(.105, .13));
        float body = sdE(vP - vec2(0.0, .12), vec2(.27, .2));
        float d = min(head, body);
        if (d > 0.0) discard;
        float rim = smoothstep(-.03, 0.0, d) * smoothstep(.5, .7, vP.y);
        vec3 lit = vCol * rim * (.16 + uRaise * .3 + uHit * .1) * uBright * fogK(vD);
        gl_FragColor = vec4(vec3(.012, .014, .022) + lit, 1.0);
      }`
  });
  // 手燈：以手為支點「前後」擺（往舞台倒、再往回），跟著拍子；拍手時直直舉高、每拍往下一頓再亮一下
  // 離鏡頭太近的淡掉（像相機的淺景深）
  const stickMat = new ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec3 aBase; attribute vec4 aSeed;
      uniform float uAmp, uRaise, uBright;
      varying vec2 vM; varying vec3 vCol; varying float vA;
      const vec2 SIZE = vec2(.3, .36);
      ${FOG}
      ${CROWD}
      void main() {
        vec2 m = vec2(position.x, position.y + .5) * SIZE;
        vM = m;
        float free = 1.0 - uClap;
        float a = (uAmp * sin(uSwing * 3.14159265 + aSeed.x * .5) + .16 + (aSeed.x - .5) * .2) * free;
        vec3 axis = vec3(0.0, cos(a), -sin(a));
        vec3 w = aBase + vec3(m.x * aSeed.w, 0.0, 0.0) + axis * (m.y * aSeed.w);
        w.y += uRaise * (.3 + aSeed.z * .25) + uClap * (.22 - uClapPulse * .12) + bounce(aSeed.x);
        vec4 mv = modelViewMatrix * vec4(w, 1.0);
        float d = -mv.z;
        gl_Position = projectionMatrix * mv;
        vCol = palAt(uColIdx + aSeed.y);
        vA = mix(.3, 1.0, fogK(d)) * mix(.35, 1.0, smoothstep(9.0, 16.0, d)) * (.55 + aSeed.z * .45) * uBright * (1.0 + uClapPulse * uClap * .9);
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vM; varying vec3 vCol; varying float vA;
      uniform float uRaise, uHit;
      void main() {
        // 棒子：從看台看過去只剩一小截發光的棒子＋一團圓圓的光
        vec2 q = vec2(abs(vM.x), max(0.0, max(.07 - vM.y, vM.y - .23)));
        float d = length(q);
        float core = smoothstep(.026, .014, d);
        float r = length(vM - vec2(0.0, .16));
        float halo = exp(-r * r * 110.0) * .5 + exp(-d * d * 500.0) * .35;
        float a = (core * .9 + halo) * vA * (.4 + uRaise * .25 + uHit * .2);
        if (a < .004) discard;
        gl_FragColor = vec4(mix(vCol, vec3(1.0), core * .45), a);
      }`
  });
  const heads = new Mesh(headGeo, headMat), sticks = new Mesh(stickGeo, stickMat);
  heads.frustumCulled = sticks.frustumCulled = false;
  sticks.renderOrder = 2;
  scene.add(heads, sticks);

  // ── 版面：從 DOM 上影片的位置推回 3D 世界 ──
  let L = null;                       // 目前的版面
  const cam = { x: 0, y: 0, tx: 0, ty: 0 };
  function layout(rect, vw, vh) {
    if (!rect || !rect.width || !vw || !vh) return;
    renderer.setSize(vw, vh, false);
    const k = SCREEN_W / rect.width;                         // 螢幕那個深度，每個 CSS 像素幾公尺
    const Dpx = Math.hypot(vw, vh) * LENS, D = Dpx * k;       // 攝影機到螢幕的距離
    const Xs = (rect.left + rect.width / 2 - vw / 2) * k;     // 世界座標：畫面中心在 (0, 0, -D)
    const Ys = (vh / 2 - rect.top - rect.height / 2) * k;
    const Hs = rect.height * k, top = Ys + Hs / 2, bottom = Ys - Hs / 2;
    const stageTop = bottom - .45, floor = stageTop - 1.6;
    L = { vw, vh, k, D, Dpx, Xs, Ys, Hs, top, bottom, stageTop, floor, z: -D };
    cam.x = Xs; cam.y = Ys;                                  // 攝影機正對螢幕中心、眼睛在螢幕中間的高度（地平線落在螢幕中段）

    // 舞台：螢幕底下，往觀眾那邊伸出 5 公尺
    deck.scale.set(1, stageTop - floor, 1); deck.position.set(Xs, (stageTop + floor) / 2, -D + 2.5);
    lip.position.set(Xs, stageTop, -D + 5);
    truss.position.set(Xs, top + 2.4, -D + 2);
    const bw = .35, z = -D - .02;
    bezel[0].scale.set(SCREEN_W + bw * 2, bw, 1); bezel[0].position.set(Xs, top + bw / 2, z);
    bezel[1].scale.set(SCREEN_W + bw * 2, bw, 1); bezel[1].position.set(Xs, bottom - bw / 2, z);
    bezel[2].scale.set(bw, Hs, 1); bezel[2].position.set(Xs - SCREEN_W / 2 - bw / 2, Ys, z);
    bezel[3].scale.set(bw, Hs, 1); bezel[3].position.set(Xs + SCREEN_W / 2 + bw / 2, Ys, z);
    speakers.forEach((s, i) => s.position.set(Xs + (i ? 1 : -1) * 15.2, top - 1.4, -D + 1.2));
    glow.position.set(Xs, Ys, -D - .3); glowMat.uniforms.uHalf.value = [SCREEN_W / 2, Hs / 2];
    wash.position.set(Xs, stageTop + 5, -D - .2);
    leds.forEach(m => { const i = m.userData.i; m.position.set(Xs + Math.sign(i) * (SCREEN_W / 2 + .8 + (Math.abs(i) - .5) * 3.1), stageTop + 5.6, -D - .4); });
    beams.forEach(b => {
      const { kind, i, n } = b.userData;
      if (kind === "truss") b.position.set(Xs + (i - (n - 1) / 2) * (34 / n), top + 2.2, -D + 2);
      else if (kind === "up") b.position.set(Xs + (i - (n - 1) / 2) * (31 / n), stageTop + .1, -D + 4.6);
      else b.position.set(Xs + (i ? 1 : -1) * 30, top + 7, -D * .25);
    });
    U.uFog.value = 1.5 / D;                                   // 霧跟距離成比例，不同裝置看起來一樣深

    // 觀眾：一排一排站好（排距 62 公分、座位 50 公分，隔排錯開半個位子），每排寬度剛好蓋滿看得到的範圍（再多一點給視差）
    // 你坐在看台：最近的觀眾也在 1/3 距離外（太近的手燈會變成一條條大光棒）
    // 顏色順位＝排＋座位：兩色時像棋盤一樣鄰座交錯，三色以上斜斜地輪
    const zFar = -(D - 6), zNear = -Math.max(8, D * .32), half = vw / 2 / Dpx, ROW = .62, SEAT = .5;
    const hb = headGeo.attributes.aBase.array, hs = headGeo.attributes.aSeed.array;
    const sb = stickGeo.attributes.aBase.array, ss = stickGeo.attributes.aSeed.array;
    let seed = 7, i = 0;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let row = 0, z = zNear; z >= zFar && i < N; row++, z -= ROW) {
      const hw = -z * half + 2.2, seats = Math.floor(hw * 2 / SEAT), x0 = Xs - hw + (row % 2) * SEAT / 2;
      for (let seat = 0; seat < seats && i < N; seat++, i++) {
        const x = x0 + seat * SEAT + (rnd() - .5) * .12, zz = z + (rnd() - .5) * .16, size = .9 + rnd() * .22, ph = rnd();
        const fl = floor + (rnd() - .5) * .08, order = row + seat;
        hb.set([x, fl + 1.05 * size, zz], i * 3); hs.set([ph, order, rnd(), size], i * 4);
        sb.set([x + (seat % 2 ? -.2 : .2) * size, fl + (1.72 + rnd() * .2) * size, zz + .05], i * 3); ss.set([ph, order, rnd(), .7 + rnd() * .2], i * 4);
      }
    }
    headGeo.instanceCount = stickGeo.instanceCount = i;
    [headGeo, stickGeo].forEach(g => { g.attributes.aBase.needsUpdate = true; g.attributes.aSeed.needsUpdate = true; });
  }

  // 非對稱視錐：螢幕那個深度永遠對到瀏覽器畫面同一個位置（攝影機移動也一樣）
  function project(cx, cy) {
    const { vw, vh, k, D } = L, n = camera.near;
    const l = (-vw / 2 * k - cx) * n / D, r = (vw / 2 * k - cx) * n / D;
    const t = (vh / 2 * k - cy) * n / D, b = (-vh / 2 * k - cy) * n / D;
    camera.position.set(cx, cy, 0);
    camera.quaternion.identity();
    camera.projectionMatrix.makePerspective(l, r, t, b, n, camera.far);
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }

  function setPen(cols) {
    const c = cols && cols.length ? cols : ["#02b4f5", "#f8fafc"];
    U.uC1.value.set(c[0]); U.uC2.value.set(c[1] || c[0]); U.uC3.value.set(c[2] || c[0]);
    U.uPal.value.forEach((col, i) => col.set(c[i % c.length])); U.uNCol.value = Math.min(8, c.length);
    lipMat.uniforms.uMono.value = new Set(c.map(x => x.toLowerCase())).size < 2 ? 1 : 0;
    beams.forEach(b => b.userData.kind === "follow" ? b.material.uniforms.uCol.value.copy(WARM) : b.material.uniforms.uCol.value.set(c[b.userData.col % c.length]));
  }

  // s：{ t 秒, swing 拍子（小數）, amp 擺幅, hit 重拍 0–1, raise 大合唱 0–1, px/py 游標 -1–1, still 減少動態,
  //      colIdx PenlightSync 現在的顏色順位, bright 亮度（安靜聽 0.5）, clap 拍手 0–1, clapPulse 拍手那一下 0–1, jump 跳躍高度（公尺） }
  function render(s) {
    if (!L) return;
    U.uTime.value = s.t; U.uSwing.value = s.swing; U.uAmp.value = s.amp; U.uHit.value = s.hit; U.uRaise.value = s.raise;
    U.uColIdx.value = s.colIdx || 0; U.uBright.value = s.bright == null ? 1 : s.bright;
    U.uClap.value = s.clap || 0; U.uClapPulse.value = s.clapPulse || 0; U.uJump.value = s.jump || 0;
    // 視差：游標＋很慢的晃動，最多左右 0.9、上下 0.4 公尺；不俯仰、不轉
    const tx = s.still ? 0 : s.px * .9 + Math.sin(s.t * .11) * .35, ty = s.still ? 0 : -s.py * .4 + Math.sin(s.t * .07 + 1) * .15;
    cam.tx += (tx - cam.tx) * .04; cam.ty += (ty - cam.ty) * .04;
    // 燈光束：從燈架往觀眾席掃；大合唱時整排轉向觀眾、變亮
    beams.forEach(b => {
      const { kind, side, ph, i, n } = b.userData;
      if (kind === "truss") {
        // 燈架的燈打到觀眾席地上（不會穿過鏡頭）：pitch 是離垂直的角度，長度剛好到地板
        const yaw = side * (.15 + .25 * Math.sin(s.t * .31 + ph)) + Math.sin(s.swing * Math.PI * .5 + ph) * .06;
        const pitch = .35 + .35 * (.5 + .5 * Math.sin(s.t * .23 + ph * 1.3)) + s.raise * .2;
        dir.set(Math.sin(yaw) * Math.sin(pitch), -Math.cos(pitch), Math.cos(yaw) * Math.sin(pitch)).normalize();
        b.scale.set(1, Math.min(1.4, (b.position.y - L.floor) / -dir.y / LEN.truss), 1);
        b.material.uniforms.uI.value = .55 + s.hit * .6 + s.raise * .5;
      } else if (kind === "up") {
        // 舞台前緣的射燈：往上打成扇形，跟著拍子左右擺；大合唱時往觀眾那邊倒
        const x = (i - (n - 1) / 2) / ((n - 1) / 2);            // -1（最左）到 1（最右）
        const fan = x * (.32 + .18 * Math.sin(s.t * .4)) + Math.sin(s.swing * Math.PI + i * .4) * .1;
        const lean = .12 + s.raise * .4 + .06 * Math.sin(s.t * .5 + ph);
        dir.set(Math.sin(fan), Math.cos(fan) * Math.cos(lean), Math.sin(lean)).normalize();
        b.scale.set(1, 1, 1);
        b.material.uniforms.uI.value = .45 + s.hit * .9 + s.raise * .4;
      } else {
        // 追蹤燈：從場館兩側高處打向舞台中間，慢慢游移
        target.set(L.Xs + Math.sin(s.t * .21 + ph) * 3, L.stageTop + 1.6, -L.D + 3 + Math.sin(s.t * .17 + ph) * .8);
        dir.subVectors(target, b.position);
        const len = dir.length(); dir.normalize();
        b.scale.set(1, len / LEN.follow, 1);
        b.material.uniforms.uI.value = .7 + s.raise * .3;
      }
      q.setFromUnitVectors(DOWN, dir); b.quaternion.copy(q);
    });
    project(L.Xs + cam.tx, L.Ys + cam.ty);
    renderer.render(scene, camera);
  }

  function dispose() {
    renderer.dispose();
    scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }

  return { layout, render, setPen, dispose, debug: { scene, camera, beams, get L() { return L; } } };
}
