const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const scoreElement = document.getElementById('score');
const healthElement = document.getElementById('health');
const gameOverScreen = document.getElementById('gameOverScreen');
const finalScoreElement = document.getElementById('finalScore');
const restartButton = document.getElementById('restartButton');
const screenFlashElement = document.getElementById('screenFlash');

// --- Game Settings ---
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 2000;
const GRID_SIZE = 50;
const STAR_COUNT = 200;

const playerRadius = 15;
const playerSpeed = 3.5; // Adjust speed as needed
const playerMaxHealth = 100;
const projectileSpeed = 7;
const projectileRadius = 5;
const fireRate = 280;
const enemyRadius = 14;
const enemySpeed = 1.6;
const enemySpawnRate = 800;
const enemyDamage = 10;
const enemyBaseHealth = 30;
const enemyHealthVariance = 10;
const spawnPadding = 100;

// --- Effect Settings ---
const PARTICLE_COUNT_DEATH = 15;
const PARTICLE_LIFESPAN = 0.8;
const PARTICLE_SPEED = 80;
const HIT_FLASH_DURATION = 0.1;
const SCREEN_FLASH_DURATION = 0.15;

// --- Game State ---
let player;
let projectiles = [];
let enemies = [];
let particles = [];
let stars = [];
let keys = {}; // Keep for keyboard fallback/debug
let score = 0;
let lastFireTime = 0;
let lastSpawnTime = 0;
let gameRunning = true;
let animationFrameId;
let screenFlashTimer = 0;

// --- CAMERA ---
let camera = {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height
};

// --- Joystick State ---
const joystickContainer = document.getElementById('joystick-container');
const joystickBase = document.getElementById('joystick-base');
const joystickHandle = document.getElementById('joystick-handle');
let isDraggingJoystick = false;
let joystickTouchId = null;
let joystickBaseX = 0; // Position relative to game container
let joystickBaseY = 0;
let joystickRadius = 60; // Fixed radius of the joystick area (half of container width)
let moveVector = { x: 0, y: 0 }; // Stores the normalized movement direction [-1, 1]

// --- Helper Functions ---
function random(min, max) {
    return Math.random() * (max - min) + min;
}

function worldToCanvas(worldX, worldY) {
    return { x: worldX - camera.x, y: worldY - camera.y };
}

function isVisible(worldX, worldY, radius = 0) {
     const bounds = radius + 50;
     return worldX + bounds > camera.x && worldX - bounds < camera.x + camera.width &&
            worldY + bounds > camera.y && worldY - bounds < camera.y + camera.height;
}

function findNearestEnemy() {
    let nearestEnemy = null;
    let minDistanceSq = Infinity;
    const playerX = player.worldX;
    const playerY = player.worldY;
    enemies.forEach(enemy => {
        const dx = playerX - enemy.worldX;
        const dy = playerY - enemy.worldY;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq < minDistanceSq) {
            minDistanceSq = distanceSq;
            nearestEnemy = enemy;
        }
    });
    return nearestEnemy;
}


// --- Initialization ---
function initGame() {
    player = {
        worldX: WORLD_WIDTH / 2, worldY: WORLD_HEIGHT / 2,
        radius: playerRadius, speed: playerSpeed,
        health: playerMaxHealth, maxHealth: playerMaxHealth,
        color: 'cyan', damageTimer: 0
    };
    projectiles = [];
    enemies = [];
    particles = [];
    keys = {};
    score = 0;
    lastFireTime = 0;
    lastSpawnTime = 0;
    screenFlashTimer = 0;
    gameRunning = true;

    // Reset Joystick state
    isDraggingJoystick = false;
    joystickTouchId = null;
    moveVector = { x: 0, y: 0 };
    joystickContainer.style.display = 'none'; // Ensure hidden
    // Reset handle position visually (might not be needed if always hidden first)
    joystickHandle.style.left = '50%';
    joystickHandle.style.top = '50%';


    // Initialize Stars
    stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
        stars.push({
            x: Math.random() * WORLD_WIDTH, y: Math.random() * WORLD_HEIGHT,
            radius: Math.random() * 1.5 + 0.5
        });
    }

    updateCamera(); // Center camera

    scoreElement.textContent = score;
    healthElement.textContent = player.health;
    healthElement.style.color = '#66ff66';
    gameOverScreen.style.display = 'none';
    screenFlashElement.style.opacity = 0;

    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    gameLoop();
}

// --- Drawing Functions ---

function drawCircle(worldX, worldY, radius, fillColor, strokeColor = null, gradient = null) {
    if (!isVisible(worldX, worldY, radius)) return;
    const { x: canvasX, y: canvasY } = worldToCanvas(worldX, worldY);
    ctx.beginPath();
    ctx.arc(canvasX, canvasY, radius, 0, Math.PI * 2);
    if (gradient) {
        const grad = ctx.createRadialGradient(canvasX, canvasY, radius * 0.1, canvasX, canvasY, radius);
        gradient.colors.forEach((color, index) => grad.addColorStop(gradient.stops[index], color));
        ctx.fillStyle = grad;
    } else {
        ctx.fillStyle = fillColor;
    }
    ctx.fill();
    if (strokeColor) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = Math.max(1, Math.min(2, radius * 0.1));
        ctx.stroke();
    }
}

function drawHealthBar(entity) {
     if (!isVisible(entity.worldX, entity.worldY, entity.radius)) return;
    const barWidth = entity.radius * 1.8;
    const barHeight = 6;
    const yOffset = -entity.radius - 12;
    const { x: canvasX, y: canvasY } = worldToCanvas(entity.worldX, entity.worldY + yOffset);
    const barX = canvasX - barWidth / 2;
    const healthPercent = Math.max(0, entity.health) / entity.maxHealth;
    const currentHealthWidth = healthPercent * barWidth;
    ctx.fillStyle = 'rgba(50, 50, 50, 0.7)';
    ctx.fillRect(barX, canvasY, barWidth, barHeight);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, canvasY, barWidth, barHeight);
    const healthColor = `hsl(${healthPercent * 120}, 80%, 50%)`;
    ctx.fillStyle = healthColor;
    ctx.fillRect(barX, canvasY, currentHealthWidth, barHeight);
}

function drawBackground() {
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    stars.forEach(star => {
        if (isVisible(star.x, star.y, star.radius)) {
             const { x: canvasX, y: canvasY } = worldToCanvas(star.x, star.y);
             const alpha = random(0.5, 1.0);
             ctx.globalAlpha = alpha;
             ctx.beginPath(); ctx.arc(canvasX, canvasY, star.radius, 0, Math.PI * 2); ctx.fill();
             ctx.globalAlpha = 1.0;
        }
    });
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    const startWorldX = Math.floor(camera.x / GRID_SIZE) * GRID_SIZE;
    const endWorldX = Math.ceil((camera.x + camera.width) / GRID_SIZE) * GRID_SIZE;
    const startWorldY = Math.floor(camera.y / GRID_SIZE) * GRID_SIZE;
    const endWorldY = Math.ceil((camera.y + camera.height) / GRID_SIZE) * GRID_SIZE;
    for (let wx = startWorldX; wx <= endWorldX; wx += GRID_SIZE) {
         if (isVisible(wx, camera.y, 0)) {
             const { x: canvasX } = worldToCanvas(wx, 0);
             ctx.beginPath(); ctx.moveTo(canvasX, 0); ctx.lineTo(canvasX, canvas.height); ctx.stroke();
         }
    }
     for (let wy = startWorldY; wy <= endWorldY; wy += GRID_SIZE) {
        if (isVisible(camera.x, wy, 0)) {
            const { y: canvasY } = worldToCanvas(0, wy);
            ctx.beginPath(); ctx.moveTo(0, canvasY); ctx.lineTo(canvas.width, canvasY); ctx.stroke();
        }
    }
    ctx.strokeStyle = 'rgba(255, 100, 100, 0.3)';
    ctx.lineWidth = 4;
    const boundary = worldToCanvas(0, 0);
    if (isVisible(WORLD_WIDTH / 2, WORLD_HEIGHT / 2, WORLD_WIDTH)) { // Rough check if boundary is visible
        ctx.strokeRect(boundary.x, boundary.y, WORLD_WIDTH, WORLD_HEIGHT);
    }
}

function drawPlayer() {
    const baseColor = (player.damageTimer > 0) ? 'white' : player.color;
    const outlineColor = (player.damageTimer > 0) ? 'red' : 'rgba(255, 255, 255, 0.5)';
    const playerGradient = { colors: [baseColor, 'rgba(0, 150, 150, 0.8)', 'rgba(0, 50, 50, 0.3)'], stops: [0, 0.6, 1] };
    drawCircle(player.worldX, player.worldY, player.radius, baseColor, outlineColor, playerGradient);
    drawHealthBar(player);
}

function drawProjectiles() {
    projectiles.forEach(p => {
        ctx.shadowColor = p.color; ctx.shadowBlur = 8;
        drawCircle(p.worldX, p.worldY, p.radius, p.color);
        ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
    });
}

function drawEnemies() {
    enemies.forEach(e => {
        const baseColor = (e.hitTimer > 0) ? 'white' : e.color;
        const outlineColor = (e.hitTimer > 0) ? '#FF8888' : 'rgba(0, 0, 0, 0.5)';
        const enemyGradient = { colors: [baseColor, e.color, 'rgba(0,0,0,0.5)'], stops: [0, 0.7, 1] };
        drawCircle(e.worldX, e.worldY, e.radius, baseColor, outlineColor, enemyGradient);
        if (!e.hitTimer || e.hitTimer <= 0) {
            const angleToPlayer = Math.atan2(player.worldY - e.worldY, player.worldX - e.worldX);
            const eyeOffsetX = Math.cos(angleToPlayer) * e.radius * 0.4;
            const eyeOffsetY = Math.sin(angleToPlayer) * e.radius * 0.4;
            drawCircle(e.worldX + eyeOffsetX, e.worldY + eyeOffsetY, e.radius * 0.25, 'rgba(0,0,0,0.8)');
        }
        drawHealthBar(e);
    });
}

function drawParticles() {
    particles.forEach(p => {
        if (!isVisible(p.worldX, p.worldY, p.radius)) return;
        const { x: canvasX, y: canvasY } = worldToCanvas(p.worldX, p.worldY);
        ctx.globalAlpha = p.life / p.initialLife;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(canvasX, canvasY, p.radius, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1.0;
    });
}

// --- Update Functions ---

function updatePlayer(deltaTime) {
    if (player.damageTimer > 0) {
        player.damageTimer -= deltaTime;
    }

    // --- MOVEMENT ---
    let moveX = 0;
    let moveY = 0;

    // Use joystick input if active
    if (isDraggingJoystick) {
        moveX = moveVector.x;
        moveY = moveVector.y;
    }
    // Optional: Fallback to keyboard if joystick not active (for testing)
    else {
         if (keys['w'] || keys['ArrowUp']) moveY -= 1;
         if (keys['s'] || keys['ArrowDown']) moveY += 1;
         if (keys['a'] || keys['ArrowLeft']) moveX -= 1;
         if (keys['d'] || keys['ArrowRight']) moveX += 1;

         // Normalize keyboard input if needed (only if both axes are pressed)
         const lenSq = moveX * moveX + moveY * moveY;
         if (lenSq > 1) { // Check if magnitude is > 1 (diagonal)
             const len = Math.sqrt(lenSq);
             moveX /= len;
             moveY /= len;
         }
    }

    // Apply movement based on speed and deltaTime
    player.worldX += moveX * player.speed * 60 * deltaTime; // Assuming speed is pixels per tick at 60fps
    player.worldY += moveY * player.speed * 60 * deltaTime;


    // World bounds collision
    player.worldX = Math.max(player.radius, Math.min(WORLD_WIDTH - player.radius, player.worldX));
    player.worldY = Math.max(player.radius, Math.min(WORLD_HEIGHT - player.radius, player.worldY));


    // --- Auto-fire ---
    const now = Date.now();
    if (now - lastFireTime > fireRate && enemies.length > 0) {
        const targetEnemy = findNearestEnemy();
        if (targetEnemy) {
            const angle = Math.atan2(targetEnemy.worldY - player.worldY, targetEnemy.worldX - player.worldX);
            const velocityX = Math.cos(angle) * projectileSpeed;
            const velocityY = Math.sin(angle) * projectileSpeed;
            projectiles.push({
                worldX: player.worldX, worldY: player.worldY, radius: projectileRadius,
                color: 'yellow', velocityX: velocityX, velocityY: velocityY
            });
            lastFireTime = now;
        }
    }
}

function updateProjectiles(deltaTime) {
     const speedMultiplier = 60 * deltaTime;
    projectiles = projectiles.filter(p => {
        p.worldX += p.velocityX * speedMultiplier;
        p.worldY += p.velocityY * speedMultiplier;
        const buffer = 50;
        return p.worldX > -buffer && p.worldX < WORLD_WIDTH + buffer &&
               p.worldY > -buffer && p.worldY < WORLD_HEIGHT + buffer;
    });
}

function spawnEnemy() {
    const now = Date.now();
    if (now - lastSpawnTime > enemySpawnRate) {
        let spawnX, spawnY;
        const spawnEdge = Math.random() * (camera.width + camera.height) * 2;
        if (spawnEdge < camera.width) { // Top
            spawnX = camera.x + spawnEdge; spawnY = camera.y - spawnPadding - enemyRadius;
        } else if (spawnEdge < camera.width + camera.height) { // Right
            spawnX = camera.x + camera.width + spawnPadding + enemyRadius; spawnY = camera.y + (spawnEdge - camera.width);
        } else if (spawnEdge < camera.width * 2 + camera.height) { // Bottom
            spawnX = camera.x + (spawnEdge - (camera.width + camera.height)); spawnY = camera.y + camera.height + spawnPadding + enemyRadius;
        } else { // Left
            spawnX = camera.x - spawnPadding - enemyRadius; spawnY = camera.y + (spawnEdge - (camera.width * 2 + camera.height));
        }
        spawnX = Math.max(enemyRadius, Math.min(WORLD_WIDTH - enemyRadius, spawnX));
        spawnY = Math.max(enemyRadius, Math.min(WORLD_HEIGHT - enemyRadius, spawnY));
        const health = enemyBaseHealth + random(-enemyHealthVariance, enemyHealthVariance);
        enemies.push({
            worldX: spawnX, worldY: spawnY, radius: enemyRadius, speed: enemySpeed + random(-0.3, 0.3),
            health: health, maxHealth: health,
            color: `hsl(${random(0, 60)}, ${random(80, 100)}%, ${random(50, 60)}%)`, hitTimer: 0
        });
        lastSpawnTime = now;
    }
}

function updateEnemies(deltaTime) {
    const speedMultiplier = 60 * deltaTime;
    enemies.forEach(enemy => {
        if (enemy.hitTimer > 0) enemy.hitTimer -= deltaTime;
        const angle = Math.atan2(player.worldY - enemy.worldY, player.worldX - enemy.worldX);
        enemy.worldX += Math.cos(angle) * enemy.speed * speedMultiplier;
        enemy.worldY += Math.sin(angle) * enemy.speed * speedMultiplier;
        enemies.forEach(other => {
            if (enemy === other) return;
            const dx = other.worldX - enemy.worldX; const dy = other.worldY - enemy.worldY;
            const distSq = dx * dx + dy * dy;
            const minDist = enemy.radius + other.radius + 2;
            if (distSq < minDist * minDist && distSq > 0) {
                const dist = Math.sqrt(distSq);
                const overlap = (minDist - dist) / 2;
                const pushX = (dx / dist) * overlap * 0.8;
                const pushY = (dy / dist) * overlap * 0.8;
                enemy.worldX -= pushX; enemy.worldY -= pushY;
                enemy.worldX = Math.max(enemy.radius, Math.min(WORLD_WIDTH - enemy.radius, enemy.worldX));
                enemy.worldY = Math.max(enemy.radius, Math.min(WORLD_HEIGHT - enemy.radius, enemy.worldY));
            }
        });
    });
}

function updateParticles(deltaTime) {
     const speedMultiplier = PARTICLE_SPEED * deltaTime; // Use defined particle speed
    particles = particles.filter(p => {
        p.worldX += p.velocityX * deltaTime; // Apply velocity directly based on speed * direction
        p.worldY += p.velocityY * deltaTime;
        p.life -= deltaTime;
        p.radius *= (1 - 0.8 * deltaTime); // Shrink particles faster
        return p.life > 0 && p.radius > 0.3; // Remove when dead or very small
    });
}

function spawnParticles(x, y, color) {
    for (let i = 0; i < PARTICLE_COUNT_DEATH; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = PARTICLE_SPEED * (0.5 + Math.random() * 0.8);
        particles.push({
            worldX: x + random(-5, 5), worldY: y + random(-5, 5),
            velocityX: Math.cos(angle) * speed, // Store actual velocity components
            velocityY: Math.sin(angle) * speed,
            radius: random(1.5, 4.5), // Slightly larger particles
            color: color,
            life: PARTICLE_LIFESPAN * (0.7 + Math.random() * 0.6),
            initialLife: PARTICLE_LIFESPAN
        });
    }
}

function updateCamera() {
    const lerpFactor = 0.1;
    const targetCamX = player.worldX - camera.width / 2;
    const targetCamY = player.worldY - camera.height / 2;
    camera.x += (targetCamX - camera.x) * lerpFactor;
    camera.y += (targetCamY - camera.y) * lerpFactor;
    camera.x = Math.max(0, Math.min(WORLD_WIDTH - camera.width, camera.x));
    camera.y = Math.max(0, Math.min(WORLD_HEIGHT - camera.height, camera.y));
}

// --- Collision Detection ---
function checkCollisions() {
    // Projectile vs Enemy
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const proj = projectiles[i];
        let projectileHit = false;
        for (let j = enemies.length - 1; j >= 0; j--) {
            const enemy = enemies[j];
            const dx = proj.worldX - enemy.worldX; const dy = proj.worldY - enemy.worldY;
            const distanceSq = dx * dx + dy * dy; const radiiSum = proj.radius + enemy.radius;
            if (distanceSq < radiiSum * radiiSum) {
                enemy.health -= 10; enemy.hitTimer = HIT_FLASH_DURATION; projectileHit = true;
                if (enemy.health <= 0) {
                    spawnParticles(enemy.worldX, enemy.worldY, enemy.color); enemies.splice(j, 1);
                    score += 10; scoreElement.textContent = score;
                } break;
            }
        } if (projectileHit) projectiles.splice(i, 1);
    }
    // Enemy vs Player
    for (let k = enemies.length - 1; k >= 0; k--) {
        const enemy = enemies[k];
        if (player.damageTimer > 0) continue;
        const dx = player.worldX - enemy.worldX; const dy = player.worldY - enemy.worldY;
        const distanceSq = dx * dx + dy * dy; const radiiSum = player.radius + enemy.radius;
        if (distanceSq < radiiSum * radiiSum) {
            player.health -= enemyDamage; player.damageTimer = HIT_FLASH_DURATION + 0.4; // Longer iframe
            screenFlashTimer = SCREEN_FLASH_DURATION;
            const healthPercent = Math.max(0, player.health) / player.maxHealth;
            healthElement.textContent = Math.max(0, player.health);
            healthElement.style.color = `hsl(${healthPercent * 120}, 90%, 60%)`;
            const angle = Math.atan2(dy, dx); const knockbackDist = 25; // Stronger knockback
            enemy.worldX += Math.cos(angle) * knockbackDist; enemy.worldY += Math.sin(angle) * knockbackDist;
            enemy.worldX = Math.max(enemy.radius, Math.min(WORLD_WIDTH - enemy.radius, enemy.worldX));
            enemy.worldY = Math.max(enemy.radius, Math.min(WORLD_HEIGHT - enemy.radius, enemy.worldY));
            if (player.health <= 0) { gameOver(); return; }
            break; // Player hit once per frame check
        }
    }
}

// --- Game Over ---
function gameOver() {
    gameRunning = false;
    finalScoreElement.textContent = score;
    gameOverScreen.style.display = 'flex';
    // Hide joystick if game over
    isDraggingJoystick = false;
    joystickTouchId = null;
    joystickContainer.style.display = 'none';
    moveVector = { x: 0, y: 0 };
}

// --- Game Loop ---
let lastTimestamp = 0;
function gameLoop(timestamp = 0) {
    const currentTimestamp = timestamp || performance.now();
    const deltaTime = Math.min(0.05, (currentTimestamp - lastTimestamp) / 1000);
    lastTimestamp = currentTimestamp;

    if (screenFlashTimer > 0) {
        screenFlashTimer -= deltaTime;
        const flashOpacity = Math.sin((screenFlashTimer / SCREEN_FLASH_DURATION) * Math.PI) * 0.5;
        screenFlashElement.style.opacity = Math.max(0, flashOpacity);
    } else if (screenFlashElement.style.opacity !== '0') {
        screenFlashElement.style.opacity = 0;
    }

    if (gameRunning) {
        updatePlayer(deltaTime);
        spawnEnemy();
        updateEnemies(deltaTime);
        updateProjectiles(deltaTime);
        updateParticles(deltaTime);
        updateCamera();
        checkCollisions();
    } else {
         // If game over, might still want to update particles for fade out effect
         updateParticles(deltaTime);
    }

    // --- Drawing ---
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    drawParticles();
    drawEnemies();
    drawProjectiles();
    // Only draw player if alive
    if (player.health > 0 || !gameOverScreen.style.display || gameOverScreen.style.display === 'none') {
         drawPlayer();
    }

    animationFrameId = requestAnimationFrame(gameLoop);
}

// --- Event Listeners ---

// Keyboard (optional fallback/debug)
window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

// --- Joystick Touch Listeners (Attach to the *canvas*) ---

// Get canvas offset relative to viewport
let canvasRect = canvas.getBoundingClientRect();
window.addEventListener('resize', () => {
     canvasRect = canvas.getBoundingClientRect();
     // Recalculate joystickRadius if it's dynamic based on size
     // joystickRadius = joystickContainer.offsetWidth / 2; // If using offsetWidth
});


canvas.addEventListener('touchstart', (e) => {
    if (!gameRunning) return; // Don't start joystick if game over
    // Allow starting joystick even if already dragging (handles multi-touch issues)
    // if (isDraggingJoystick) return;

    e.preventDefault();
    const touch = e.changedTouches[0];

    // Check if touch is within joystick activation area (e.g., bottom half of screen)
    // This prevents accidental joystick activation when tapping elsewhere
    const touchYRelative = touch.clientY - canvasRect.top;
    if (touchYRelative < canvas.height / 2) { // Example: Only allow in bottom half
       // console.log("Touch too high for joystick");
        return;
    }


    // Store the ID of the touch controlling the joystick
    joystickTouchId = touch.identifier;

    // Calculate joystick base center position relative to the canvas top-left
    const touchXRelative = touch.clientX - canvasRect.left;
    // const touchYRelative = touch.clientY - canvasRect.top; // Already calculated

    // Set base position for internal calculations (relative to canvas)
    joystickBaseX = touchXRelative;
    joystickBaseY = touchYRelative;

    // Position the container visually (CSS left/top are relative to parent #game-container)
    joystickContainer.style.left = `${joystickBaseX}px`;
    joystickContainer.style.top = `${joystickBaseY}px`;

    // Reset handle position and show joystick
    joystickHandle.style.left = '50%';
    joystickHandle.style.top = '50%';
    joystickContainer.style.display = 'block';

    isDraggingJoystick = true;
    moveVector = { x: 0, y: 0 }; // Start with no movement

}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    if (!gameRunning || !isDraggingJoystick) return;
    e.preventDefault();

    let controllingTouch = null;
    for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joystickTouchId) {
            controllingTouch = e.changedTouches[i];
            break;
        }
    }
    if (!controllingTouch) return;

    // Calculate current touch position relative to canvas top-left
    const currentXRelative = controllingTouch.clientX - canvasRect.left;
    const currentYRelative = controllingTouch.clientY - canvasRect.top;

    // Calculate vector from joystick base to current touch
    const deltaX = currentXRelative - joystickBaseX;
    const deltaY = currentYRelative - joystickBaseY;

    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
    const angle = Math.atan2(deltaY, deltaX);

    // Clamp the distance to the joystick radius
    const clampedDistance = Math.min(distance, joystickRadius);

    // Calculate the handle's position relative to the base center (0,0)
    const handleX = Math.cos(angle) * clampedDistance;
    const handleY = Math.sin(angle) * clampedDistance;

    // Update the visual handle position (relative to the container center)
    // CSS % is relative to container size, px offset from that center
    joystickHandle.style.left = `calc(50% + ${handleX}px)`;
    joystickHandle.style.top = `calc(50% + ${handleY}px)`;

    // Update the movement vector (normalized)
    const deadZone = 5; // Pixels
    if (distance > deadZone) {
        // Normalize the clamped vector for consistent speed
        moveVector.x = handleX / joystickRadius; // Use clamped position for magnitude
        moveVector.y = handleY / joystickRadius;
    } else {
        moveVector.x = 0;
        moveVector.y = 0;
    }

}, { passive: false });

// Function to handle end/cancel for joystick touch
const handleJoystickEnd = (e) => {
    if (!isDraggingJoystick) return;

    let isJoystickTouchEnded = false;
    for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === joystickTouchId) {
            isJoystickTouchEnded = true;
            break;
        }
    }

    if (isJoystickTouchEnded) {
        isDraggingJoystick = false;
        joystickTouchId = null;
        joystickContainer.style.display = 'none'; // Hide joystick
        moveVector = { x: 0, y: 0 }; // Stop movement
         // Optional: Animate handle back to center? CSS transition can handle this partly.
        joystickHandle.style.left = '50%';
        joystickHandle.style.top = '50%';
    }
}

canvas.addEventListener('touchend', handleJoystickEnd, { passive: false });
canvas.addEventListener('touchcancel', handleJoystickEnd, { passive: false });


// Prevent context menu on long press (mobile)
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Restart Button Listeners
restartButton.addEventListener('click', initGame);
restartButton.addEventListener('touchend', (e) => {
    e.preventDefault(); // Prevent potential double action with click
    initGame();
});

// --- Start Game ---
initGame(); // Initialize and start the game loop
