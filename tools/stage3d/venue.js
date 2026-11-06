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
    uClap: { value: 0 }, uClapPulse: { value: 0 }, uJump: { value: 0 },
    // 火柱：uFireT 噴火後經過幾秒（沒噴是負的），uFireK 火光照亮場館的程度 0–1
    uFireT: { value: -99 }, uFireK: { value: 0 }, uCen: { value: [0, 0] }
  };

  // ── 舞台硬體：深色、不受光的材質（場館裡只看得到輪廓） ──
  // 參考 Ado 的現場（日產體育場、埼玉超級競技場、K-Arena 橫濱）：上下兩層舞台（Ado 在上層、樂團在下層兩側），
  // 主螢幕兩側是一片片高低錯落的 LED 板，上層平台前緣一排燈頭往上打交叉光束，高潮時舞台頂上噴火柱
  const dark = new MeshBasicMaterial({ color: 0x0a0c13 });
  const darker = new MeshBasicMaterial({ color: 0x06070c });
  const stage = new Group();
  scene.add(stage);
  const box = (w, h, d, m) => { const o = new Mesh(new BoxGeometry(w, h, d), m); stage.add(o); return o; };
  const deck = box(34, 1, 6, dark);                       // 下層主舞台（樂團）
  const riser = box(SCREEN_W + 3, 1, 2.6, darker);        // 上層平台：Ado 站的地方，就在螢幕正下方
  const bands = [-1, 1].map(() => box(6, .6, 3, darker)); // 下層兩側的樂團平台
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
  const lip = box(34, .09, .06, lipMat);                  // 下層舞台前緣
  const lip2 = box(SCREEN_W + 3, .07, .06, lipMat);       // 上層平台前緣
  const truss = box(38, .45, .45, darker);                // 螢幕上方的燈架
  const bezel = [0, 1, 2, 3].map(() => box(1, 1, .25, darker)); // 螢幕外框

  // 上層平台正面的一排圓形 LED 燈（像日產體育場舞台前那排），每拍單雙號輪流亮
  const parN = mobile ? 6 : 8;
  const parMat = new ShaderMaterial({
    uniforms: { ...U, uN: { value: parN }, uSize: { value: [SCREEN_W + 3, .9] } },
    transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; uniform vec3 uC1, uC2; uniform float uN, uSwing, uHit, uRaise, uFireK; uniform vec2 uSize;
      void main() {
        float x = vUv.x * uN, seg = floor(x);
        vec2 p = vec2((fract(x) - .5) * uSize.x / uN, (vUv.y - .5) * uSize.y);
        float r = length(p);
        vec2 h = fract(p / .055) - .5;                       // 燈面上一顆顆的 LED
        float dots = smoothstep(.5, .2, length(h));
        float disc = smoothstep(.3, .27, r);
        float on = mod(seg + floor(uSwing), 2.0);            // 每拍單雙號輪流
        float k = .22 + uHit * on * 1.1 + uRaise * .35 + uFireK * .6;
        vec3 c = mix(mod(seg, 2.0) < 1.0 ? uC1 : uC2, vec3(1.0), .25);
        float a = (disc * (.35 + .65 * dots) + exp(-r * r * 30.0) * .35) * k;
        gl_FragColor = vec4(c, a);
      }`
  });
  const pars = new Mesh(new PlaneGeometry(1, 1), parMat);
  stage.add(pars);

  // 主螢幕兩側的 LED 板：高低、寬窄、前後都錯開（埼玉那種一片一片的直立板），整面牆共用一個畫面
  // 畫面三種輪流慢慢換：流動的色帶、從螢幕中心往外擴的光圈（日出）、往上捲的橫條
  const wallMat = new ShaderMaterial({
    uniforms: U,
    vertexShader: /* glsl */`
      varying vec3 vW; varying vec2 vUv;
      void main() { vUv = uv; vW = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vW, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec3 vW; varying vec2 vUv;
      uniform vec3 uC1, uC2, uC3; uniform float uTime, uHit, uRaise, uFireK; uniform vec2 uCen;
      void main() {
        vec2 p = vW.xy - uCen;
        float led = smoothstep(.48, .22, length(fract(vW.xy / .13) - .5));
        float ph = uTime * .04 * 6.2832;
        float w1 = .5 + .5 * sin(ph), w2 = .5 + .5 * sin(ph + 2.094), w3 = .5 + .5 * sin(ph + 4.189);
        float m1 = .5 + .5 * sin(p.x * .32 - uTime * .9 + sin(p.y * .25 + uTime * .35) * 1.6);
        float m2 = .5 + .5 * sin(length(p * vec2(1.0, 1.25)) * .55 - uTime * 1.6);
        float m3 = smoothstep(.3, .7, fract(p.y * .22 - uTime * .35));
        float m = (m1 * w1 + m2 * w2 + m3 * w3) / (w1 + w2 + w3);
        vec3 c = mix(uC1, uC2, m);
        c = mix(c, uC3, smoothstep(.7, 1.0, m) * .5);
        c = mix(c, vec3(1.0, .96, .9), uRaise * .3);
        c = mix(c, vec3(1.0, .42, .1), uFireK * .55);
        float edge = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
        float k = (.07 + m * .1 + uHit * .28 + uRaise * .28 + uFireK * .35) * (.25 + .75 * led) * smoothstep(0.0, .015, edge);
        gl_FragColor = vec4(c * k, 1.0);
      }`
  });
  // 每邊 5 片：[寬, 高出螢幕頂多少, 往後退多少]
  const PANELS = [[1.6, 1.2, 0], [2.6, 3.2, .5], [1.1, .4, .2], [3.2, 2.2, .8], [2.0, 4.2, .4]];
  const walls = [-1, 1].flatMap(side => PANELS.map((p, j) => { const m = new Mesh(new PlaneGeometry(1, 1), wallMat); m.userData = { side, j }; stage.add(m); return m; }));

  // 舞台上的橫向光暈（K-Arena 那條橫過整個舞台的光）
  const flareMat = new ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: /* glsl */`varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vP; uniform vec3 uC1; uniform float uHit, uRaise, uFireK;
      void main() {
        float core = exp(-abs(vP.y) * 45.0) * exp(-abs(vP.x) * .07);
        float a = (exp(-abs(vP.y) * 8.0) * exp(-abs(vP.x) * .045) * .55 + core) * (.12 + uHit * .4 + uRaise * .2 + uFireK * .3);
        gl_FragColor = vec4(mix(uC1, vec3(1.0), .55 + core * .45), a);
      }`
  });
  const flare = new Mesh(new PlaneGeometry(90, 3), flareMat);
  stage.add(flare);

  // 火柱：副歌高潮時從 LED 板頂上和上層平台兩端一起往上噴（日產體育場那種），fire() 觸發
  const flameGeo = new PlaneGeometry(1, 1); flameGeo.translate(0, .5, 0);
  const flames = Array.from({ length: 6 }, (_, i) => {
    const m = new Mesh(flameGeo, new ShaderMaterial({
      uniforms: { ...U, uS: { value: i } }, transparent: true, depthWrite: false, blending: AdditiveBlending,
      vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */`
        varying vec2 vUv; uniform float uFireT, uTime, uS;
        void main() {
          float life = uFireT - mod(uS, 3.0) * .07;               // 每支錯開一點點噴
          if (life < 0.0 || life > 2.2) discard;
          float h = smoothstep(0.0, .15, life) * (1.0 - smoothstep(1.0, 1.9, life));
          float y = vUv.y / max(h, .01);
          if (y > 1.0) discard;
          float n = sin(y * 11.0 - uTime * 18.0 + uS * 3.0) * .06 + sin(y * 27.0 - uTime * 29.0 + uS) * .03;
          float x = abs(vUv.x - .5 + n * y);
          float w = mix(.3, .03, pow(y, .8));
          float a = smoothstep(w, w * .25, x) * pow(1.0 - y, .5) * smoothstep(1.9, 1.2, life + y * .3);
          vec3 c = mix(vec3(1.0, .93, .72), vec3(1.0, .42, .08), smoothstep(.05, .55, y));
          c = mix(c, vec3(.75, .12, .02), smoothstep(.6, 1.0, y));
          gl_FragColor = vec4(c, a * .9);
        }`
    }));
    m.renderOrder = 3; stage.add(m); return m;
  });
  let fireAt = -99, lastT = 0;

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

  // ── 燈光：圓錐＋邊緣淡出的著色器（不需要後製）。四種：
  //   truss 燈架上的燈往觀眾席掃；mh 上層平台前緣的燈頭往上打、一左一右交叉成 X；
  //   up 下層舞台前緣往上打的射燈；follow 場館兩側高處打向舞台的追蹤燈
  const beamGeo = (len, r0, r1) => { const g = new CylinderGeometry(r0, r1, len, 28, 1, true); g.translate(0, -len / 2, 0); return g; };
  const GEO = { truss: beamGeo(24, .1, 2.2), mh: beamGeo(30, .04, .55), up: beamGeo(22, .05, .9), follow: beamGeo(40, .12, 1.3) };
  const LEN = { truss: 24, mh: 30, up: 22, follow: 40 }, STRENGTH = { truss: .3, mh: .4, up: .24, follow: .32 };
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
    // 燈頭：燈本身的亮點，朝向觀眾時最亮（追蹤燈太遠不畫）
    if (kind !== "follow") {
      const lens = new Mesh(lensGeo, new ShaderMaterial({
        uniforms: { uCol: mat.uniforms.uCol, uI: { value: 0 } },
        transparent: true, depthWrite: false, blending: AdditiveBlending,
        vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: /* glsl */`
          varying vec2 vUv; uniform vec3 uCol; uniform float uI;
          void main() {
            float r = length(vUv - .5) * 2.0;
            float core = smoothstep(.42, .28, r), halo = exp(-r * r * 7.0);
            gl_FragColor = vec4(mix(uCol, vec3(1.0), core * .65), (core * .8 + halo * .45) * uI);
          }`
      }));
      lens.scale.setScalar(LENS_SIZE[kind]); lens.renderOrder = 3;
      stage.add(lens); m.userData.lens = lens;
    }
    return m;
  };
  const lensGeo = new PlaneGeometry(1, 1), LENS_SIZE = { truss: .55, mh: .6, up: .4 };
  const NT = mobile ? 6 : 10, NM = mobile ? 6 : 10, NU = mobile ? 4 : 8;
  const beams = [
    ...Array.from({ length: NT }, (_, i) => makeBeam("truss", i, { n: NT })),
    ...Array.from({ length: NM }, (_, i) => makeBeam("mh", i, { n: NM })),
    ...Array.from({ length: NU }, (_, i) => makeBeam("up", i, { n: NU })),
    ...[0, 1].map(i => makeBeam("follow", i, { n: 2 }))
  ];
  const WARM = new Color("#fff3df"), COOL = new Color("#eef2ff");
  const target = new Vector3();
  const DOWN = new Vector3(0, -1, 0), dir = new Vector3(), q = new Quaternion();

  // ── 觀眾：一人一個頭肩剪影＋一支手燈，全部用 instancing（一次畫完） ──
  const N = mobile ? 1200 : 2400;
  const quad = new PlaneGeometry(1, 1);
  const crowdGeo = (extra, count = N) => {
    const g = new InstancedBufferGeometry();
    g.index = quad.index; g.setAttribute("position", quad.getAttribute("position")); g.setAttribute("uv", quad.getAttribute("uv"));
    g.instanceCount = 0;
    Object.entries(extra).forEach(([k, n]) => g.setAttribute(k, new InstancedBufferAttribute(new Float32Array(count * n), n)));
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
        w.y += bounce(aSeed.x);
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
  // 手燈：以手為支點「前後」擺（往舞台倒、再往回），跟著拍子；拍手時放到胸前，跟著拍子平順地一開一合，合起來那下亮一點
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
        // 拍手：手在胸前一開一合（uClapPulse 1 = 兩手合起來），握燈的那隻手往中間靠、棒子跟著往內斜一點
        float side = aSeed.x > .5 ? 1.0 : -1.0;
        float open = uClap * (1.0 - uClapPulse);
        float r = side * open * .28;
        vec3 axis = vec3(sin(r), cos(a) * cos(r), -sin(a));
        vec3 w = aBase + vec3(m.x * aSeed.w, 0.0, 0.0) + axis * (m.y * aSeed.w);
        w.x += side * open * .07 * aSeed.w;
        w.y += uRaise * (.3 + aSeed.z * .25) + uClap * (.1 + open * .02) + bounce(aSeed.x);
        vec4 mv = modelViewMatrix * vec4(w, 1.0);
        float d = -mv.z;
        gl_Position = projectionMatrix * mv;
        vCol = palAt(uColIdx + aSeed.y);
        vA = mix(.3, 1.0, fogK(d)) * mix(.35, 1.0, smoothstep(9.0, 16.0, d)) * (.55 + aSeed.z * .45) * uBright * (1.0 + pow(uClapPulse, 6.0) * uClap * .7);
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

  // 身邊的手燈：離鏡頭幾公尺、對不到焦，糊成一團團圓圓的光斑（現場影片拍觀眾席時前景那種），只在畫面下緣兩側
  const NB = mobile ? 12 : 22;
  const bokehGeo = crowdGeo({ aBase: 3, aSeed: 4 }, NB);
  const bokehMat = new ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec3 aBase; attribute vec4 aSeed;
      uniform float uAmp, uRaise;
      varying vec2 vUv; varying vec3 vCol;
      ${CROWD}
      void main() {
        vUv = uv;
        vec3 w = aBase + vec3(position.xy * aSeed.w, 0.0);
        w.x += sin(uSwing * 3.14159265 + aSeed.x * 6.0) * uAmp * .5 * (1.0 - uClap);
        w.y += uRaise * .35 + bounce(aSeed.x) - uClap * .15;
        vCol = palAt(uColIdx + aSeed.y);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; varying vec3 vCol;
      uniform float uBright, uRaise, uHit;
      void main() {
        float r = length(vUv - .5) * 2.0;
        float disc = smoothstep(1.0, .86, r), rim = smoothstep(.6, .92, r) * disc;
        float a = (disc * .55 + rim * .45) * .09 * uBright * (1.0 + uRaise * .5 + uHit * .3);
        if (a < .003) discard;
        gl_FragColor = vec4(vCol, a);
      }`
  });
  const bokeh = new Mesh(bokehGeo, bokehMat);
  bokeh.frustumCulled = false; bokeh.renderOrder = 4;
  scene.add(bokeh);

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
    // stageTop 上層平台（Ado）、deckTop 下層主舞台（樂團）、floor 觀眾席地板
    const stageTop = bottom - .45, deckTop = stageTop - .9, floor = deckTop - 1.3;
    L = { vw, vh, k, D, Dpx, Xs, Ys, Hs, top, bottom, stageTop, deckTop, floor, z: -D };
    cam.x = Xs; cam.y = Ys;                                  // 攝影機正對螢幕中心、眼睛在螢幕中間的高度（地平線落在螢幕中段）
    U.uCen.value = [Xs, Ys];

    // 舞台：上層平台在螢幕正下方（往前 2.6 公尺），下層主舞台再往觀眾那邊伸出到 6 公尺
    const RW = SCREEN_W + 3;
    deck.scale.set(1, deckTop - floor, 1); deck.position.set(Xs, (deckTop + floor) / 2, -D + 3);
    riser.scale.set(1, stageTop - deckTop, 1); riser.position.set(Xs, (stageTop + deckTop) / 2, -D + 1.3);
    bands.forEach((b, i) => b.position.set(Xs + (i ? 1 : -1) * (RW / 2 + 3.4), deckTop + .3, -D + 2.2));
    lip.position.set(Xs, deckTop, -D + 6);
    lip2.position.set(Xs, stageTop, -D + 2.6);
    pars.scale.set(RW, .9, 1); pars.position.set(Xs, (stageTop + deckTop) / 2, -D + 2.62);
    truss.position.set(Xs, top + 2.4, -D + 2);
    const bw = .35, z = -D - .02;
    bezel[0].scale.set(SCREEN_W + bw * 2, bw, 1); bezel[0].position.set(Xs, top + bw / 2, z);
    bezel[1].scale.set(SCREEN_W + bw * 2, bw, 1); bezel[1].position.set(Xs, bottom - bw / 2, z);
    bezel[2].scale.set(bw, Hs, 1); bezel[2].position.set(Xs - SCREEN_W / 2 - bw / 2, Ys, z);
    bezel[3].scale.set(bw, Hs, 1); bezel[3].position.set(Xs + SCREEN_W / 2 + bw / 2, Ys, z);
    glow.position.set(Xs, Ys, -D - .3); glowMat.uniforms.uHalf.value = [SCREEN_W / 2, Hs / 2];
    wash.position.set(Xs, stageTop + 5, -D - .2);
    flare.position.set(Xs, stageTop + .08, -D + 2.4);
    // LED 板：從螢幕外框往外排，片和片之間留 30 公分縫；板子底部藏在上層平台後面
    walls.forEach(m => {
      const { side, j } = m.userData;
      let x = SCREEN_W / 2 + bw + .5;
      for (let q = 0; q < j; q++) x += PANELS[q][0] + .3;
      const [w, up, back] = PANELS[j], y0 = deckTop, y1 = top + up;
      m.scale.set(w, y1 - y0, 1);
      m.position.set(Xs + side * (x + w / 2), (y0 + y1) / 2, -D - .5 - back);
    });
    // 火柱：兩側樂團平台的兩端（每邊兩支，要在畫面裡看得到）＋上層平台兩端
    const bx = RW / 2 + 3.4;
    const spots = [[-bx - 2.4, 0], [-bx + 2.4, 0], [bx - 2.4, 0], [bx + 2.4, 0], [-RW / 2 + .6, 1], [RW / 2 - .6, 1]];
    flames.forEach((f, i) => {
      const [x, up] = spots[i];
      f.position.set(Xs + x, up ? stageTop : deckTop + .6, -D + (up ? 2.2 : 3.4));
      f.scale.set(up ? 1.2 : 1.6, up ? 5 : 7, 1);
    });
    beams.forEach(b => {
      const { kind, i, n } = b.userData;
      if (kind === "truss") b.position.set(Xs + (i - (n - 1) / 2) * (34 / n), top + 2.2, -D + 2);
      else if (kind === "mh") b.position.set(Xs + (i - (n - 1) / 2) * ((RW - 1.2) / (n - 1)), stageTop + .25, -D + 2.3);
      else if (kind === "up") b.position.set(Xs + (i - (n - 1) / 2) * (31 / n), deckTop + .1, -D + 5.7);
      else b.position.set(Xs + (i ? 1 : -1) * 30, top + 7, -D * .25);
      if (b.userData.lens) b.userData.lens.position.copy(b.position).add(new Vector3(0, kind === "truss" ? -.3 : 0, .3));
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
    // 光斑：離鏡頭 3–6 公尺，貼著畫面下緣、偏左右兩邊（中間留給字幕）
    const bb = bokehGeo.attributes.aBase.array, bs = bokehGeo.attributes.aSeed.array, vhalf = vh / 2 / Dpx;
    for (let j = 0; j < NB; j++) {
      const d = 3 + rnd() * 3, side = j % 2 ? 1 : -1, hw = d * half;
      const x = Xs + side * hw * (.42 + rnd() * .62), y = Ys - d * vhalf * (.8 + rnd() * .3);
      bb.set([x, y, -d], j * 3); bs.set([rnd(), j, rnd(), .2 + rnd() * .22], j * 4);
    }
    bokehGeo.instanceCount = NB;
    [headGeo, stickGeo, bokehGeo].forEach(g => { g.attributes.aBase.needsUpdate = true; g.attributes.aSeed.needsUpdate = true; });
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
    beams.forEach(b => {
      const { kind, i, col } = b.userData, u = b.material.uniforms.uCol.value;
      if (kind === "follow") u.copy(WARM);
      else if (kind === "mh" && i % 3 !== 1) u.copy(COOL);   // 交叉光束大多是白光（K-Arena、埼玉那種），夾幾支手燈色
      else u.set(c[col % c.length]);
    });
  }

  // 副歌高潮噴一次火柱（跟網站的彩帶同時）
  function fire() { fireAt = lastT; }

  // s：{ t 秒, swing 拍子（小數）, amp 擺幅, hit 重拍 0–1, raise 大合唱 0–1, px/py 游標 -1–1, still 減少動態,
  //      colIdx PenlightSync 現在的顏色順位, bright 亮度（安靜聽 0.5）, clap 拍手 0–1, clapPulse 拍手那一下 0–1, jump 跳躍高度（公尺） }
  function render(s) {
    if (!L) return;
    U.uTime.value = s.t; U.uSwing.value = s.swing; U.uAmp.value = s.amp; U.uHit.value = s.hit; U.uRaise.value = s.raise;
    U.uColIdx.value = s.colIdx || 0; U.uBright.value = s.bright == null ? 1 : s.bright;
    U.uClap.value = s.clap || 0; U.uClapPulse.value = s.clapPulse || 0; U.uJump.value = s.jump || 0;
    lastT = s.t;
    const life = s.t - fireAt, fk = life >= 0 && life < 2.4 ? Math.min(1, life * 6) * (1 - Math.min(1, Math.max(0, (life - 1) / 1.3))) : 0;
    U.uFireT.value = life; U.uFireK.value = fk;
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
      } else if (kind === "mh") {
        // 上層平台的燈頭：單雙號往反方向倒，交叉成一排 X；兩兩一組慢慢開合，大合唱時整排往觀眾倒
        const x = (i - (n - 1) / 2) / ((n - 1) / 2), alt = i % 2 ? 1 : -1;
        const open = .5 + .5 * Math.sin(s.t * .45 + Math.floor(i / 2) * .7);
        const fan = alt * (.16 + .34 * open) + x * .12 + Math.sin(s.swing * Math.PI + i) * .04;
        const lean = .08 + .14 * (.5 + .5 * Math.sin(s.t * .3 + ph)) + s.raise * .45;
        dir.set(Math.sin(fan), Math.cos(fan) * Math.cos(lean), Math.sin(lean)).normalize();
        b.scale.set(1, 1, 1);
        b.material.uniforms.uI.value = .35 + s.hit * 1.0 + s.raise * .45 + fk * .3;
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
      // 燈頭亮點：燈口越朝向觀眾越亮
      if (b.userData.lens) b.userData.lens.material.uniforms.uI.value = b.material.uniforms.uI.value * (.3 + .7 * Math.max(0, dir.z));
    });
    flames.forEach(f => { f.visible = life >= 0 && life < 2.4; });
    project(L.Xs + cam.tx, L.Ys + cam.ty);
    renderer.render(scene, camera);
  }

  function dispose() {
    renderer.dispose();
    scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  }

  return { layout, render, setPen, fire, dispose, debug: { scene, camera, beams, get L() { return L; } } };
}
