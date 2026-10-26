/* Мини-игра на странице сервиса. Без библиотек и внешних ресурсов. */
(() => {
  const game = document.querySelector('.runner-game');
  if (!game) return;

  const canvas = game.querySelector('canvas');
  const context = canvas.getContext('2d');
  const overlay = game.querySelector('.runner-overlay');
  const title = game.querySelector('.runner-title');
  const startButton = game.querySelector('.runner-start');
  const pauseButton = game.querySelector('.runner-pause');
  const status = game.querySelector('.runner-status');
  const scoreLabel = document.getElementById('runner-score');
  const bestLabel = document.getElementById('runner-best');
  const controls = document.querySelector('.runner-controls');
  const jumpButton = controls.querySelector('.runner-jump');
  const duckButton = controls.querySelector('.runner-duck');

  const STEP = 1 / 120;
  const GRAVITY = 1800;
  const JUMP_SPEED = 620;
  const DINO_HEIGHT = 52;
  const RECORD_KEY = 'arcticle-run-best';
  let width = 0;
  let height = 0;
  let ground = 0;
  let state = 'ready';
  let distance = 0;
  let elapsed = 0;
  let jumpHeight = 0;
  let velocity = 0;
  let obstacles = [];
  let nextObstacle = 1.5;
  let frameId = 0;
  let lastTime = 0;
  let accumulator = 0;
  let best = 0;
  let keyboardDuck = false;
  let duckPointer = null;
  let lastBirdAt = 0;

  // Блокировка хранилища браузером не мешает самой игре.
  try {
    best = Math.max(0, Number(localStorage.getItem(RECORD_KEY)) || 0);
  } catch {}

  const score = () => Math.floor(distance / 12);
  const playerX = () => Math.min(84, width * 0.12);
  const difficulty = () => Math.min(elapsed / 60, 1);
  const speed = () => Math.min(300, width * 0.52) * (1 + difficulty());
  const isDucking = () => keyboardDuck || duckPointer !== null;
  const crouched = () => isDucking() && jumpHeight === 0;
  const format = value => String(value).padStart(5, '0');

  function updateLabels() {
    scoreLabel.textContent = format(score());
    bestLabel.textContent = format(best);
    duckButton.setAttribute('aria-pressed', String(isDucking()));
  }

  function setState(value) {
    state = value;
    game.dataset.state = value;
    overlay.hidden = value === 'running';
    pauseButton.hidden = value !== 'running';
    if (value !== 'running') {
      keyboardDuck = false;
      duckPointer = null;
      duckButton.setAttribute('aria-pressed', 'false');
      cancelAnimationFrame(frameId);
      frameId = 0;
    }
  }

  function start() {
    distance = 0;
    elapsed = 0;
    jumpHeight = 0;
    velocity = 0;
    obstacles = [];
    nextObstacle = 1.5;
    accumulator = 0;
    lastBirdAt = 0;
    setState('running');
    status.textContent = 'Игра началась. Пробел или стрелка вверх — прыжок. Удерживайте стрелку вниз, чтобы пригнуться.';
    updateLabels();
    lastTime = performance.now();
    frameId = requestAnimationFrame(frame);
  }

  function pause() {
    if (state !== 'running') return;
    setState('paused');
    title.textContent = 'Пауза';
    startButton.textContent = 'Продолжить';
    status.textContent = 'Игра на паузе.';
    draw();
  }

  function resume() {
    setState('running');
    accumulator = 0;
    lastTime = performance.now();
    status.textContent = 'Игра продолжается.';
    frameId = requestAnimationFrame(frame);
  }

  function finish() {
    setState('over');
    best = Math.max(best, score());
    try { localStorage.setItem(RECORD_KEY, String(best)); } catch {}
    title.textContent = `Игра окончена · ${score()}`;
    startButton.textContent = 'Ещё раз';
    status.textContent = `Столкновение. Счёт ${score()}. Можно начать заново.`;
    updateLabels();
  }

  function jump() {
    // Повторное нажатие в воздухе не даёт второго прыжка.
    if (jumpHeight === 0 && !isDucking()) velocity = JUMP_SPEED;
  }

  function act() {
    game.focus({ preventScroll: true });
    if (state === 'paused') {
      resume();
    } else if (state !== 'running') {
      start();
    } else {
      jump();
    }
  }

  function update(dt) {
    elapsed += dt;
    const movement = speed() * dt;
    distance += movement;
    jumpHeight = Math.max(0, jumpHeight + velocity * dt);
    // В воздухе ↓ ускоряет падение, чтобы успеть приземлиться перед птицей.
    velocity -= GRAVITY * (isDucking() ? 2.8 : 1) * dt;
    if (jumpHeight === 0) velocity = 0;

    nextObstacle -= dt;
    if (nextObstacle <= 0) {
      spawnObstacle();
      // Даже на максимальной скорости между препятствиями остаётся время
      // на полный прыжок и смену действия: прыжок → пригибание.
      nextObstacle = 1.65 - difficulty() * 0.6 + Math.random() * 0.5;
    }

    const player = crouched()
      ? { x: playerX() + 5, y: ground - 24, width: 48, height: 22 }
      : { x: playerX() + 10, y: ground - DINO_HEIGHT - jumpHeight + 4, width: 28, height: 46 };
    for (const obstacle of obstacles) {
      obstacle.x -= movement;
      const top = ground - obstacle.altitude - obstacle.height;
      if (player.x < obstacle.x + obstacle.width - 3 &&
          player.x + player.width > obstacle.x + 3 &&
          player.y + player.height > top + 3 &&
          player.y < top + obstacle.height - 3) {
        finish();
        break;
      }
    }
    obstacles = obstacles.filter(obstacle => obstacle.x + obstacle.width > 0);
  }

  function spawnObstacle() {
    // Сначала кактусы; затем птицы, разные высоты полёта и большие группы.
    if (elapsed >= 10 && (elapsed - lastBirdAt > 7 || Math.random() < 0.3)) {
      const roll = Math.random();
      const altitude = elapsed > 35 && roll < 0.2 ? 88 : elapsed > 25 && roll > 0.8 ? 8 : 40;
      obstacles.push({ type: 'bird', x: width + 24, width: 46, height: 24, altitude });
      lastBirdAt = elapsed;
    } else {
      const count = elapsed > 18 ? 1 + Math.floor(Math.random() * 3) : Math.random() > 0.7 ? 2 : 1;
      const size = elapsed > 18 ? [34, 46, 54][Math.floor(Math.random() * 3)] : 46;
      // Длинные группы ниже одиночных: их можно перелететь и на телефоне.
      const h = Math.min(size, count > 1 ? 40 : 54);
      obstacles.push({ type: 'cactus', x: width + 24, width: 24 + (count - 1) * 20, height: h, altitude: 0, count });
    }
  }

  // Собственный пиксельный динозаврик: туловище, хвост, голова и две фазы бега.
  function drawDino() {
    const x = Math.round(playerX());
    const y = Math.round(ground - (crouched() ? 28 : DINO_HEIGHT) - jumpHeight);
    const leg = state === 'running' && jumpHeight === 0 ? Math.floor(distance / 28) % 2 : 0;
    context.save();
    context.translate(x, y);
    context.scale(2, 2);
    context.fillStyle = game.dataset.night === 'true' ? '#e4edff' : '#1e1e1e';
    const pixel = (left, top, w, h) => context.fillRect(left, top, w, h);
    if (crouched()) {
      pixel(0, 4, 2, 4);
      pixel(2, 6, 5, 4);
      pixel(5, 5, 14, 6);
      pixel(16, 4, 5, 6);
      pixel(18, 1, 11, 6);
      pixel(18, 7, 8, 2);
      pixel(6, 10, 3, leg ? 2 : 4);
      pixel(6, leg ? 11 : 12, 5, 2);
      pixel(15, 10, 3, leg ? 4 : 2);
      pixel(15, leg ? 12 : 11, 5, 2);
      context.fillStyle = game.dataset.night === 'true' ? '#1e1e1e' : '#fff';
      pixel(20, 2, 2, 2);
      context.restore();
      return;
    }
    pixel(11, 0, 11, 1);
    pixel(10, 1, 13, 6);
    pixel(11, 7, 7, 2);
    pixel(11, 8, 5, 6);
    pixel(7, 11, 9, 9);
    pixel(5, 13, 3, 5);
    pixel(0, 9, 2, 5);
    pixel(2, 12, 3, 4);
    pixel(4, 14, 3, 4);
    pixel(15, 12, 4, 2);
    pixel(18, 13, 1, 3);
    pixel(8, 19, 6, 3);
    pixel(7, 21, 3, leg ? 2 : 4);
    pixel(7, leg ? 22 : 24, 5, 2);
    pixel(12, 21, 3, leg ? 4 : 2);
    pixel(12, leg ? 24 : 22, 5, 2);
    context.fillStyle = game.dataset.night === 'true' ? '#1e1e1e' : '#fff';
    pixel(13, 2, 2, 2);
    pixel(17, 6, 6, 1);
    if (state === 'over') {
      context.fillStyle = '#f0b2ff';
      pixel(13, 2, 2, 2);
    }
    context.restore();
  }

  function drawCactus(x, h) {
    const y = ground - h;
    context.fillStyle = '#f0b2ff';
    context.fillRect(x - 3, y - 4, 28, h + 4);
    context.fillStyle = '#1e1e1e';
    context.fillRect(x + 9, y, 7, h);
    context.fillRect(x, y + 11, 5, 14);
    context.fillRect(x + 4, y + 21, 6, 5);
    context.fillRect(x + 19, y + 6, 5, 13);
    context.fillRect(x + 15, y + 15, 8, 5);
  }

  function drawBird(obstacle) {
    const x = Math.round(obstacle.x);
    const y = ground - obstacle.altitude - obstacle.height;
    context.fillStyle = game.dataset.night === 'true' ? '#e4edff' : '#1e1e1e';
    context.fillRect(x, y + 3, 12, 7);
    context.fillRect(x - 6, y + 7, 7, 3);
    context.fillRect(x + 10, y + 8, 8, 6);
    context.fillRect(x + 18, y + 7, 18, 9);
    context.fillRect(x + 35, y + 9, 13, 3);
    if (Math.floor(distance / 45) % 2) {
      context.fillRect(x + 21, y - 8, 6, 18);
      context.fillRect(x + 25, y - 16, 4, 10);
      context.fillRect(x + 29, y - 20, 4, 6);
    } else {
      context.fillRect(x + 21, y + 10, 7, 12);
      context.fillRect(x + 27, y + 18, 4, 7);
      context.fillRect(x + 31, y + 24, 4, 5);
    }
    context.fillStyle = '#f0b2ff';
    context.fillRect(x + 3, y + 4, 2, 2);
  }

  function drawLandscape() {
    const cycle = elapsed % 60;
    const night = Math.max(0, Math.min(1, (cycle - 25) / 3, (57 - cycle) / 3));
    const biome = Math.floor(elapsed / 18) % 3;
    game.dataset.night = String(night > 0.5);
    game.dataset.biome = ['plains', 'desert', 'mountains'][biome];
    context.fillStyle = `rgba(20, 26, 46, ${night * 0.96})`;
    context.fillRect(0, 0, width, height);

    // Два слоя рельефа движутся медленнее земли: дальний и ближний.
    for (const layer of [0, 1]) {
      const offset = distance * (layer ? 0.14 : 0.05) % 300;
      const peak = [32, 22, 68][biome] + layer * 14;
      const colors = [['#e5edfc', '#d8e5fb'], ['#f2e7f5', '#e8d9f0'], ['#e1e8fa', '#c9d8f2']];
      context.fillStyle = night > 0.5 ? (layer ? '#333d5b' : '#29334e') : colors[biome][layer];
      context.globalAlpha = night > 0.5 ? 0.75 : 0.65;
      for (let x = -300 - offset; x < width; x += 300) {
        context.beginPath();
        context.moveTo(x, ground);
        context.lineTo(x + 45, ground - peak * 0.45);
        context.lineTo(x + 110, ground - peak);
        context.lineTo(x + 165, ground - peak * 0.55);
        context.lineTo(x + 225, ground - peak * 0.75);
        context.lineTo(x + 300, ground);
        context.closePath();
        context.fill();
        if (biome === 2) {
          context.fillStyle = night > 0.5 ? '#6d7898' : '#f4f7ff';
          context.beginPath();
          context.moveTo(x + 89, ground - peak + 15);
          context.lineTo(x + 110, ground - peak);
          context.lineTo(x + 131, ground - peak + 18);
          context.closePath();
          context.fill();
          context.fillStyle = night > 0.5 ? (layer ? '#333d5b' : '#29334e') : colors[biome][layer];
        }
      }
    }
    if (biome === 1) {
      context.fillStyle = night > 0.5 ? '#59627f' : '#d6bee6';
      for (let x = 120 - distance * 0.18 % 330; x < width; x += 330) {
        context.fillRect(x + 8, ground - 43, 5, 26);
        context.fillRect(x, ground - 37, 4, 12);
        context.fillRect(x + 3, ground - 29, 8, 4);
        context.fillRect(x + 16, ground - 40, 4, 11);
        context.fillRect(x + 12, ground - 32, 8, 4);
      }
    }
    context.globalAlpha = 1;

    // Облака, солнце и ночные звёзды остаются на заднем плане.
    context.fillStyle = `rgba(160, 187, 231, ${0.45 * (1 - night)})`;
    for (let i = 0; i < Math.ceil(width / 260) + 1; i++) {
      const x = Math.round(i * 260 - distance * 0.08 % 260 - 60);
      const y = 72 + i % 3 * 16;
      context.fillRect(x + 10, y, 34, 4);
      context.fillRect(x, y + 4, 62, 4);
      context.fillRect(x + 4, y + 8, 54, 3);
    }
    context.globalAlpha = night;
    context.fillStyle = '#ccdefc';
    for (let i = 0; i < width / 70; i++) {
      const x = (i * 137 + 35) % width;
      const y = 62 + i * 37 % Math.max(20, ground - 145);
      context.fillRect(x, y, 2, 2);
      if (i % 3 === 0) context.fillRect(x - 2, y + 2, 6, 2);
    }
    context.globalAlpha = 1;
    context.fillStyle = night > 0.5 ? '#dce6ff' : '#e6c0ef';
    const sun = width - 76;
    context.fillRect(sun + 4, 67, 12, 4);
    context.fillRect(sun, 71, night > 0.5 ? 8 : 20, 16);
    context.fillRect(sun + 4, 87, 12, 4);

    // Неровности здесь декоративные: коллизии всегда считаются по линии земли.
    context.fillStyle = night > 0.5 ? '#6d7898' : '#b5c9eb';
    const offset = distance % 83;
    for (let i = -1; i < width / 83 + 1; i++) {
      const x = Math.round(i * 83 - offset);
      const y = ground + 10 + Math.abs(i * 7 % 15);
      context.fillRect(x, y, biome === 1 ? 8 : 12, 2);
      context.fillRect(x + 20, y + 4, 3, 2);
      if (biome === 0) context.fillRect(x + 42, y - 2, 2, 5);
    }
  }

  function draw() {
    context.clearRect(0, 0, width, height);
    drawLandscape();
    context.strokeStyle = '#f0b2ff';
    context.lineWidth = 2;
    context.setLineDash([12, 10]);
    context.lineDashOffset = distance % 22;
    context.beginPath();
    context.moveTo(0, ground + 1);
    context.lineTo(width, ground + 1);
    context.stroke();
    context.setLineDash([]);
    for (const obstacle of obstacles) {
      if (obstacle.type === 'bird') {
        drawBird(obstacle);
      } else {
        for (let i = 0; i < obstacle.count; i++) {
          drawCactus(Math.round(obstacle.x + i * 20), obstacle.height - i % 2 * 8);
        }
      }
    }
    drawDino();
  }

  function frame(time) {
    if (state !== 'running') return;
    accumulator += Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;
    // Постоянный шаг физики: одинаковые прыжки при разной частоте экрана.
    while (accumulator >= STEP && state === 'running') {
      update(STEP);
      accumulator -= STEP;
    }
    updateLabels();
    draw();
    if (state === 'running') frameId = requestAnimationFrame(frame);
  }

  function resize() {
    const bounds = game.getBoundingClientRect();
    const previousWidth = width;
    width = bounds.width;
    height = bounds.height;
    ground = height - 36;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.imageSmoothingEnabled = false;
    // При повороте телефона препятствия сохраняют расстояние до игрока.
    if (previousWidth) {
      const shift = Math.min(84, width * 0.12) - Math.min(84, previousWidth * 0.12);
      obstacles.forEach(obstacle => { obstacle.x += shift; });
    }
    draw();
  }

  startButton.addEventListener('click', act);
  pauseButton.addEventListener('click', pause);
  jumpButton.addEventListener('click', act);
  duckButton.addEventListener('pointerdown', event => {
    if (event.button !== 0 || duckPointer !== null) return;
    event.preventDefault();
    game.focus({ preventScroll: true });
    if (state === 'paused') resume();
    else if (state !== 'running') start();
    duckPointer = event.pointerId;
    duckButton.setPointerCapture(event.pointerId);
    updateLabels();
  });
  function releaseDuck(event) {
    if (event.pointerId !== duckPointer) return;
    duckPointer = null;
    updateLabels();
  }
  duckButton.addEventListener('pointerup', releaseDuck);
  duckButton.addEventListener('pointercancel', releaseDuck);
  duckButton.addEventListener('lostpointercapture', releaseDuck);
  // При управлении кнопкой с клавиатуры удержание работает так же, как касание.
  duckButton.addEventListener('keydown', event => {
    if (event.code !== 'Space' && event.code !== 'Enter') return;
    event.preventDefault();
    if (state === 'running') keyboardDuck = true;
    updateLabels();
  });
  duckButton.addEventListener('keyup', event => {
    if (event.code !== 'Space' && event.code !== 'Enter') return;
    event.preventDefault();
    keyboardDuck = false;
    updateLabels();
  });
  duckButton.addEventListener('click', event => {
    // Активация экранным диктором работает как переключатель.
    if (event.detail !== 0) return;
    game.focus({ preventScroll: true });
    if (state === 'paused') resume();
    else if (state !== 'running') start();
    keyboardDuck = !keyboardDuck;
    updateLabels();
  });
  game.addEventListener('pointerdown', event => {
    if (event.target.closest('button')) return;
    act();
  });
  function handleKeyDown(event) {
    if (event.code === 'ArrowDown' || event.code === 'KeyS') {
      event.preventDefault();
      if (state === 'running') keyboardDuck = true;
      updateLabels();
      return;
    }
    if (event.target.closest('button')) return;
    if (event.code === 'Space' || event.code === 'ArrowUp' || event.code === 'Enter') {
      event.preventDefault();
      if (!event.repeat) act();
    } else if (event.code === 'Escape') {
      event.preventDefault();
      pause();
    }
  }
  function handleFocusOut(event) {
    if (!game.contains(event.relatedTarget) && !controls.contains(event.relatedTarget)) pause();
  }
  game.addEventListener('keydown', handleKeyDown);
  controls.addEventListener('keydown', handleKeyDown);
  game.addEventListener('focusout', handleFocusOut);
  controls.addEventListener('focusout', handleFocusOut);
  window.addEventListener('keyup', event => {
    if (event.code !== 'ArrowDown' && event.code !== 'KeyS') return;
    keyboardDuck = false;
    updateLabels();
  });
  window.addEventListener('blur', pause);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause();
  });
  new ResizeObserver(resize).observe(game);
  updateLabels();
  resize();
})();
