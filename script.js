const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// UI Elements
const scoreElement = document.getElementById('score');
const healthElement = document.getElementById('health');
const gameOverScreen = document.getElementById('gameOverScreen');
const finalScoreElement = document.getElementById('finalScore');
const restartButton = document.getElementById('restartButton');
const screenFlashElement = document.getElementById('screenFlash'); // Get flash element

// --- Game Settings ---
const WORLD_WIDTH = 2000;
const WORLD_HEIGHT = 2000;
const GRID_SIZE = 50;
const STAR_COUNT = 200; // Number of stars in the background

const playerRadius = 15;
const playerSpeed = 3.5;
const playerMaxHealth = 100;
const projectileSpeed = 7;
const projectileRadius = 5; // Slightly larger projectiles
const fireRate = 280;
const enemyRadius = 14;
const enemySpeed = 1.6;
const enemySpawnRate = 800;
const enemyDamage = 10;
const enemyBaseHealth = 30; // Base health
const enemyHealthVariance = 10; // +/- variance
const spawnPadding = 100;

// --- Effect Settings ---
const PARTICLE_COUNT_DEATH = 15;
const PARTICLE_LIFESPAN = 0.8; // In seconds
const PARTICLE_SPEED = 80; // Pixels per second
const HIT_FLASH_DURATION = 0.1; // In seconds
const SCREEN_FLASH_DURATION = 0.15; // In seconds

// --- Game State ---
let player;
let projectiles = [];
let enemies = [];
let particles = []; // For death effects
let stars = []; // Store star positions
let keys = {};
let score = 0;
let lastFireTime = 0;
let lastSpawnTime = 0;
let gameRunning = true;
let animationFrameId;
let screenFlashTimer = 0; // Timer for player damage flash

// --- CAMERA ---
let camera = {
    x: 0,
    y: 0,
    width: canvas.width,
    height: canvas.height
};

// --- Helper Functions ---
function random(min, max) {
    return Math.random() * (max - min) + min;
}

// Convert world to canvas coordinates
function worldToCanvas(worldX, worldY) {
    return { x: worldX - camera.x, y: worldY - camera.y };
}

// Check if world coordinates are roughly visible
function isVisible(worldX, worldY, radius = 0) {
     const bounds = radius + 50; // Add padding
     return worldX + bounds > camera.x && worldX - bounds < camera.x + camera.width &&
            worldY + bounds > camera.y && worldY - bounds < camera.y + camera.height;
}

// --- ADDED FUNCTION ---
// Function to find the nearest enemy to the player
function findNearestEnemy() {
    let nearestEnemy = null;
    let minDistanceSq = Infinity; // Use squared distance for efficiency

    // Use player's current world coordinates directly
    const playerX = player.worldX;
    const playerY = player.worldY;

    enemies.forEach(enemy => {
        // Use enemy's world coordinates
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
// --- END ADDED FUNCTION ---


// --- Initialization ---
function initGame() {
    player = {
        worldX: WORLD_WIDTH / 2,
        worldY: WORLD_HEIGHT / 2,
        radius: playerRadius,
        speed: playerSpeed,
        health: playerMaxHealth,
        maxHealth: playerMaxHealth, // Store max health
        color: 'cyan',
        damageTimer: 0 // For hit flash effect
    };
    projectiles = [];
    enemies = [];
    particles = []; // Clear particles
    keys = {};
    score = 0;
    lastFireTime = 0;
    lastSpawnTime = 0;
    screenFlashTimer = 0;
    gameRunning = true;

    // Initialize Stars
    stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
        stars.push({
            x: Math.random() * WORLD_WIDTH,
            y: Math.random() * WORLD_HEIGHT,
            radius: Math.random() * 1.5 + 0.5 // Varying star size
        });
    }

    updateCamera(); // Center camera

    scoreElement.textContent = score;
    healthElement.textContent = player.health;
    healthElement.style.color = '#66ff66'; // Reset health color
    gameOverScreen.style.display = 'none';
    screenFlashElement.style.opacity = 0; // Ensure flash is hidden

    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }
    gameLoop();
}

// --- Drawing Functions ---

// Refined drawCircle with optional outline and gradient
function drawCircle(worldX, worldY, radius, fillColor, strokeColor = null, gradient = null) {
    if (!isVisible(worldX, worldY, radius)) return; // Culling

    const { x: canvasX, y: canvasY } = worldToCanvas(worldX, worldY);

    ctx.beginPath();
    ctx.arc(canvasX, canvasY, radius, 0, Math.PI * 2);

    if (gradient) {
        const grad = ctx.createRadialGradient(canvasX, canvasY, radius * 0.1, canvasX, canvasY, radius);
        gradient.colors.forEach((color, index) => {
            grad.addColorStop(gradient.stops[index], color);
        });
        ctx.fillStyle = grad;
    } else {
        ctx.fillStyle = fillColor;
    }
    ctx.fill();

    if (strokeColor) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = Math.max(1, Math.min(2, radius * 0.1)); // Adjust line width based on radius
        ctx.stroke();
    }
}

function drawHealthBar(entity) {
     if (!isVisible(entity.worldX, entity.worldY, entity.radius)) return;

    const barWidth = entity.radius * 1.8;
    const barHeight = 6;
    const yOffset = -entity.radius - 12; // Position above entity

    const { x: canvasX, y: canvasY } = worldToCanvas(entity.worldX, entity.worldY + yOffset);
    const barX = canvasX - barWidth / 2;

    const healthPercent = Math.max(0, entity.health) / entity.maxHealth;
    const currentHealthWidth = healthPercent * barWidth;

    // Background of health bar
    ctx.fillStyle = 'rgba(50, 50, 50, 0.7)';
    ctx.fillRect(barX, canvasY, barWidth, barHeight);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, canvasY, barWidth, barHeight);


    // Foreground (current health)
    // Gradient from green to yellow to red based on health
    const healthColor = `hsl(${healthPercent * 120}, 80%, 50%)`; // Hue from 0 (red) to 120 (green)
    ctx.fillStyle = healthColor;
    ctx.fillRect(barX, canvasY, currentHealthWidth, barHeight);
}

function drawBackground() {
    // Solid dark background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Stars
    ctx.fillStyle = '#ffffff';
    stars.forEach(star => {
        if (isVisible(star.x, star.y, star.radius)) {
             const { x: canvasX, y: canvasY } = worldToCanvas(star.x, star.y);
             // Twinkle effect (optional, can impact performance)
             const alpha = random(0.5, 1.0);
             ctx.globalAlpha = alpha;
             ctx.beginPath();
             ctx.arc(canvasX, canvasY, star.radius, 0, Math.PI * 2);
             ctx.fill();
             ctx.globalAlpha = 1.0; // Reset alpha
        }
    });

    // Draw Grid (subtler)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)'; // Very faint grid
    ctx.lineWidth = 1;

    const startWorldX = Math.floor(camera.x / GRID_SIZE) * GRID_SIZE;
    const endWorldX = Math.ceil((camera.x + camera.width) / GRID_SIZE) * GRID_SIZE;
    const startWorldY = Math.floor(camera.y / GRID_SIZE) * GRID_SIZE;
    const endWorldY = Math.ceil((camera.y + camera.height) / GRID_SIZE) * GRID_SIZE;

    for (let wx = startWorldX; wx <= endWorldX; wx += GRID_SIZE) {
         if (isVisible(wx, camera.y, 0)) { // Check if line is visible
             const { x: canvasX } = worldToCanvas(wx, 0);
             ctx.beginPath();
             ctx.moveTo(canvasX, 0);
             ctx.lineTo(canvasX, canvas.height);
             ctx.stroke();
         }
    }
     for (let wy = startWorldY; wy <= endWorldY; wy += GRID_SIZE) {
        if (isVisible(camera.x, wy, 0)) {
            const { y: canvasY } = worldToCanvas(0, wy);
            ctx.beginPath();
            ctx.moveTo(0, canvasY);
            ctx.lineTo(canvas.width, canvasY);
            ctx.stroke();
        }
    }

    // Draw World Boundaries (subtler)
    ctx.strokeStyle = 'rgba(255, 100, 100, 0.3)'; // Faint red boundary
    ctx.lineWidth = 4;
    const boundary = worldToCanvas(0, 0);
    ctx.strokeRect(boundary.x, boundary.y, WORLD_WIDTH, WORLD_HEIGHT);
}

function drawPlayer() {
    // Hit flash effect
    const baseColor = (player.damageTimer > 0) ? 'white' : player.color;
    const outlineColor = (player.damageTimer > 0) ? 'red' : 'rgba(255, 255, 255, 0.5)';

    const playerGradient = {
        colors: [baseColor, 'rgba(0, 150, 150, 0.8)', 'rgba(0, 50, 50, 0.3)'], // Center, mid, edge
        stops: [0, 0.6, 1]
    };

    drawCircle(player.worldX, player.worldY, player.radius, baseColor, outlineColor, playerGradient);
    drawHealthBar(player);
}

function drawProjectiles() {
    projectiles.forEach(p => {
        // Glowing effect using shadow
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        drawCircle(p.worldX, p.worldY, p.radius, p.color);
        // Reset shadow
        ctx.shadowBlur = 0;
        ctx.shadowColor = 'transparent';
    });
}

function drawEnemies() {
    enemies.forEach(e => {
        const baseColor = (e.hitTimer > 0) ? 'white' : e.color; // Hit flash
        const outlineColor = (e.hitTimer > 0) ? '#FF8888' : 'rgba(0, 0, 0, 0.5)'; // Reddish flash outline

        const enemyGradient = {
            colors: [baseColor, e.color, 'rgba(0,0,0,0.5)'],
            stops: [0, 0.7, 1]
        }
        drawCircle(e.worldX, e.worldY, e.radius, baseColor, outlineColor, enemyGradient);

        // Simple "eye" - draw a smaller dark circle offset towards player
         if (!e.hitTimer || e.hitTimer <= 0) { // Don't draw eye during hit flash
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

        ctx.globalAlpha = p.life / p.initialLife; // Fade out
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(canvasX, canvasY, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0; // Reset alpha
    });
}

// --- Update Functions ---

function updatePlayer(deltaTime) {
    // Decrement damage timer
    if (player.damageTimer > 0) {
        player.damageTimer -= deltaTime;
    }

    // Movement (normalized)
    let dx = 0;
    let dy = 0;
    if (keys['w'] || keys['ArrowUp']) dy -= 1;
    if (keys['s'] || keys['ArrowDown']) dy += 1;
    if (keys['a'] || keys['ArrowLeft']) dx -= 1;
    if (keys['d'] || keys['ArrowRight']) dx += 1;

    const len = Math.sqrt(dx * dx + dy * dy);
    if (len > 0) {
        dx = (dx / len) * player.speed;
        dy = (dy / len) * player.speed;
    } else {
        dx = 0;
        dy = 0;
    }

    player.worldX += dx * 60 * deltaTime; // Multiply by 60 for pixels/second feel
    player.worldY += dy * 60 * deltaTime;

    // World bounds collision
    player.worldX = Math.max(player.radius, Math.min(WORLD_WIDTH - player.radius, player.worldX));
    player.worldY = Math.max(player.radius, Math.min(WORLD_HEIGHT - player.radius, player.worldY));

    // Auto-fire
    const now = Date.now();
    if (now - lastFireTime > fireRate && enemies.length > 0) {
        // THIS IS WHERE findNearestEnemy() IS USED
        const targetEnemy = findNearestEnemy();
        if (targetEnemy) {
            const angle = Math.atan2(targetEnemy.worldY - player.worldY, targetEnemy.worldX - player.worldX);
            const velocityX = Math.cos(angle) * projectileSpeed;
            const velocityY = Math.sin(angle) * projectileSpeed;

            projectiles.push({
                worldX: player.worldX, worldY: player.worldY,
                radius: projectileRadius, color: 'yellow',
                velocityX: velocityX, velocityY: velocityY
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

        const buffer = 50; // Smaller buffer now that culling is better
        return p.worldX > -buffer && p.worldX < WORLD_WIDTH + buffer &&
               p.worldY > -buffer && p.worldY < WORLD_HEIGHT + buffer;
    });
}

function spawnEnemy() {
    const now = Date.now();
    if (now - lastSpawnTime > enemySpawnRate) {
        let spawnX, spawnY;
        const spawnEdge = Math.random() * (camera.width + camera.height) * 2;

        if (spawnEdge < camera.width) {
            spawnX = camera.x + spawnEdge; spawnY = camera.y - spawnPadding - enemyRadius;
        } else if (spawnEdge < camera.width + camera.height) {
            spawnX = camera.x + camera.width + spawnPadding + enemyRadius; spawnY = camera.y + (spawnEdge - camera.width);
        } else if (spawnEdge < camera.width * 2 + camera.height) {
            spawnX = camera.x + (spawnEdge - (camera.width + camera.height)); spawnY = camera.y + camera.height + spawnPadding + enemyRadius;
        } else {
            spawnX = camera.x - spawnPadding - enemyRadius; spawnY = camera.y + (spawnEdge - (camera.width * 2 + camera.height));
        }

        spawnX = Math.max(enemyRadius, Math.min(WORLD_WIDTH - enemyRadius, spawnX));
        spawnY = Math.max(enemyRadius, Math.min(WORLD_HEIGHT - enemyRadius, spawnY));

        const health = enemyBaseHealth + random(-enemyHealthVariance, enemyHealthVariance);

        enemies.push({
            worldX: spawnX, worldY: spawnY,
            radius: enemyRadius,
            speed: enemySpeed + random(-0.3, 0.3),
            health: health,
            maxHealth: health, // Store max health
            // More vibrant colors using HSL (hue: 0-60 red-yellow, saturation: 80-100, lightness: 50-60)
            color: `hsl(${random(0, 60)}, ${random(80, 100)}%, ${random(50, 60)}%)`,
            hitTimer: 0 // Initialize hit timer
        });
        lastSpawnTime = now;
    }
}

function updateEnemies(deltaTime) {
    const speedMultiplier = 60 * deltaTime;
    enemies.forEach(enemy => {
        // Decrement hit timer
        if (enemy.hitTimer > 0) {
            enemy.hitTimer -= deltaTime;
        }

        // Movement towards player
        const angle = Math.atan2(player.worldY - enemy.worldY, player.worldX - enemy.worldX);
        enemy.worldX += Math.cos(angle) * enemy.speed * speedMultiplier;
        enemy.worldY += Math.sin(angle) * enemy.speed * speedMultiplier;

        // Enemy separation
        enemies.forEach(other => {
            if (enemy === other) return;
            const dx = other.worldX - enemy.worldX;
            const dy = other.worldY - enemy.worldY;
            const distSq = dx * dx + dy * dy;
            const minDist = enemy.radius + other.radius + 2; // Add small buffer

            if (distSq < minDist * minDist && distSq > 0) {
                const dist = Math.sqrt(distSq);
                const overlap = (minDist - dist) / 2;
                const pushX = (dx / dist) * overlap * 0.8; // Apply slightly less force
                const pushY = (dy / dist) * overlap * 0.8;

                enemy.worldX -= pushX;
                enemy.worldY -= pushY;
                // Ensure they don't get pushed out of bounds by separation
                enemy.worldX = Math.max(enemy.radius, Math.min(WORLD_WIDTH - enemy.radius, enemy.worldX));
                enemy.worldY = Math.max(enemy.radius, Math.min(WORLD_HEIGHT - enemy.radius, enemy.worldY));
            }
        });
    });
}

function updateParticles(deltaTime) {
     const speedMultiplier = deltaTime; // Particle speed is already per second
    particles = particles.filter(p => {
        p.worldX += p.velocityX * speedMultiplier;
        p.worldY += p.velocityY * speedMultiplier;
        p.life -= deltaTime;
        p.radius *= (1 - 0.5 * deltaTime); // Shrink particles slightly

        return p.life > 0 && p.radius > 0.5; // Remove when dead or too small
    });
}


function spawnParticles(x, y, color) {
    for (let i = 0; i < PARTICLE_COUNT_DEATH; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = PARTICLE_SPEED * (0.5 + Math.random() * 0.8); // Vary speed
        particles.push({
            worldX: x + random(-5, 5), // Start slightly offset
            worldY: y + random(-5, 5),
            velocityX: Math.cos(angle) * speed,
            velocityY: Math.sin(angle) * speed,
            radius: random(1, 4), // Vary size
            color: color,
            life: PARTICLE_LIFESPAN * (0.7 + Math.random() * 0.6), // Vary lifespan
            initialLife: PARTICLE_LIFESPAN // Store for alpha calculation
        });
    }
}


function updateCamera() {
    // Smooth camera follow (lerp) - Optional, adds a nice feel but slightly more complex
    const lerpFactor = 0.1; // Adjust for smoother/tighter follow (0 to 1)
    const targetCamX = player.worldX - camera.width / 2;
    const targetCamY = player.worldY - camera.height / 2;

    camera.x += (targetCamX - camera.x) * lerpFactor;
    camera.y += (targetCamY - camera.y) * lerpFactor;


    // Clamp camera to world boundaries
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
            const dx = proj.worldX - enemy.worldX;
            const dy = proj.worldY - enemy.worldY;
            const distanceSq = dx * dx + dy * dy;
            const radiiSum = proj.radius + enemy.radius;

            if (distanceSq < radiiSum * radiiSum) { // Circle collision
                enemy.health -= 10; // Damage
                enemy.hitTimer = HIT_FLASH_DURATION; // Start hit flash
                projectileHit = true;

                if (enemy.health <= 0) {
                    spawnParticles(enemy.worldX, enemy.worldY, enemy.color); // Spawn death particles
                    enemies.splice(j, 1);
                    score += 10;
                    scoreElement.textContent = score;
                }
                break; // Projectile hits one enemy
            }
        }
        if (projectileHit) {
            projectiles.splice(i, 1);
        }
    }

    // Enemy vs Player
    for (let k = enemies.length - 1; k >= 0; k--) {
        const enemy = enemies[k];
        if (player.damageTimer > 0) continue; // Invincibility frames after being hit

        const dx = player.worldX - enemy.worldX;
        const dy = player.worldY - enemy.worldY;
        const distanceSq = dx * dx + dy * dy;
        const radiiSum = player.radius + enemy.radius;

        if (distanceSq < radiiSum * radiiSum) { // Circle collision
            player.health -= enemyDamage;
            player.damageTimer = HIT_FLASH_DURATION + 0.3; // Longer iframe for player
            screenFlashTimer = SCREEN_FLASH_DURATION; // Trigger screen flash

            // Update health UI and color
            const healthPercent = Math.max(0, player.health) / player.maxHealth;
            healthElement.textContent = Math.max(0, player.health);
            healthElement.style.color = `hsl(${healthPercent * 120}, 90%, 60%)`;


            // Simple knockback (push enemy away slightly)
            const angle = Math.atan2(dy, dx);
            const knockbackDist = 20;
             enemy.worldX += Math.cos(angle) * knockbackDist;
             enemy.worldY += Math.sin(angle) * knockbackDist;
             // Clamp enemy pos after knockback
             enemy.worldX = Math.max(enemy.radius, Math.min(WORLD_WIDTH - enemy.radius, enemy.worldX));
             enemy.worldY = Math.max(enemy.radius, Math.min(WORLD_HEIGHT - enemy.radius, enemy.worldY));


            // Don't remove enemy, just apply damage & effects
            // enemies.splice(k, 1);

            if (player.health <= 0) {
                gameOver();
                return; // Exit collision check early if game over
            }
            // Since player was hit, break this inner loop (player can only be hit once per frame by this check)
             break;
        }
    }
}

// --- Game Over ---
function gameOver() {
    gameRunning = false;
    // Keep animationFrameId running for screen flash fade out etc.
    // cancelAnimationFrame(animationFrameId); // Don't cancel immediately
    finalScoreElement.textContent = score;
    gameOverScreen.style.display = 'flex'; // Use flex now
}

// --- Game Loop ---
let lastTimestamp = 0;
function gameLoop(timestamp = 0) {
    // Use timestamp from requestAnimationFrame if available, otherwise use performance.now()
    const currentTimestamp = timestamp || performance.now();
    const deltaTime = Math.min(0.05, (currentTimestamp - lastTimestamp) / 1000); // Delta time in seconds, capped
    lastTimestamp = currentTimestamp;

    // Update Screen Flash Effect (runs even if gameRunning is false)
    if (screenFlashTimer > 0) {
        screenFlashTimer -= deltaTime;
        const flashOpacity = Math.sin((screenFlashTimer / SCREEN_FLASH_DURATION) * Math.PI) * 0.5; // Pulsing opacity
        screenFlashElement.style.opacity = Math.max(0, flashOpacity);
    } else if (screenFlashElement.style.opacity !== '0') { // Only update if not already 0
        screenFlashElement.style.opacity = 0; // Ensure it's hidden
    }


    // Only run game logic updates if game is running
    if (gameRunning) {
        // --- Updates ---
        updatePlayer(deltaTime);
        spawnEnemy();
        updateEnemies(deltaTime);
        updateProjectiles(deltaTime);
        updateParticles(deltaTime);
        updateCamera(); // Update camera after player movement

        // --- Collisions ---
        checkCollisions(); // Check collisions after all positions are updated
    }


    // --- Drawing (Always run drawing logic to show game over screen, particles fade, etc.) ---
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    drawParticles(); // Draw particles behind enemies/player
    drawEnemies();
    drawProjectiles();
    drawPlayer(); // Draw player last within game elements


    // --- Next Frame ---
    // Continue requesting frames even if game over to handle fade effects / UI
    animationFrameId = requestAnimationFrame(gameLoop);

}

// --- Event Listeners ---
window.addEventListener('keydown', (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

// Basic Touch Controls
let touchStartX = null, touchStartY = null, currentTouchX = null, currentTouchY = null;
canvas.addEventListener('touchstart', (e) => {
    if (!gameRunning) return; e.preventDefault(); const touch = e.touches[0];
    touchStartX = currentTouchX = touch.clientX; touchStartY = currentTouchY = touch.clientY;
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
    if (!gameRunning || touchStartX === null) return; e.preventDefault(); const touch = e.touches[0];
    currentTouchX = touch.clientX; currentTouchY = touch.clientY;
    const moveX = currentTouchX - touchStartX; const moveY = currentTouchY - touchStartY;
    const dist = Math.sqrt(moveX*moveX + moveY*moveY);
    keys['w'] = keys['a'] = keys['s'] = keys['d'] = false; // Reset keys
    if (dist > 10) { // Deadzone
         // Simple 8-way mapping (allow diagonals)
         if (Math.abs(moveX) > dist * 0.3) { // Horizontal component is significant
             if (moveX > 0) keys['d'] = true; else keys['a'] = true;
         }
         if (Math.abs(moveY) > dist * 0.3) { // Vertical component is significant
             if (moveY > 0) keys['s'] = true; else keys['w'] = true;
         }
    }
}, { passive: false });
canvas.addEventListener('touchend', (e) => {
    // No check for !gameRunning here, allow stopping movement even if game over screen is up
    touchStartX = touchStartY = currentTouchX = currentTouchY = null;
    keys['w'] = keys['a'] = keys['s'] = keys['d'] = false;
}, { passive: false }); // Keep passive false if preventDefault might be needed elsewhere

canvas.addEventListener('contextmenu', (e) => e.preventDefault()); // Prevent right-click menu

restartButton.addEventListener('click', initGame);
restartButton.addEventListener('touchend', (e) => { e.preventDefault(); initGame(); }); // Ensure touch works too

// --- Start Game ---
initGame(); // Initialize and start the game loop