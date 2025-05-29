const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const path = require("path");

// Konfiguracja gry
const GAME_WIDTH = 1980;
const GAME_HEIGHT = 1280;
const PLAYER_SIZE = 50;
const PLAYER_SPEED = 6;
const BULLET_SPEED = 10;

// Przeszkody
const obstacles = [
  { x: 300, y: 200, w: 100, h: 100 },
  { x: 600, y: 400, w: 120, h: 120 },
  { x: 450, y: 100, w: 80, h: 200 }
];

const players = {};
const bullets = [];

// Funkcje kolizji
function collideWithObstacle(x, y, width, height) {
  return obstacles.some(o => 
    x + width > o.x && 
    x < o.x + o.w && 
    y + height > o.y && 
    y < o.y + o.h
  );
}

function collideWithPlayers(x, y, width, height, ignoreId) {
  return Object.entries(players).some(([id, p]) => 
    id !== ignoreId &&
    x + width > p.x && 
    x < p.x + PLAYER_SIZE && 
    y + height > p.y && 
    y < p.y + PLAYER_SIZE
  );
}

function isOutsideGameArea(x, y) {
  return x < 0 || 
         y < 0 || 
         x + PLAYER_SIZE > GAME_WIDTH || 
         y + PLAYER_SIZE > GAME_HEIGHT;
}

// Socket.io events
io.on("connection", socket => {
  socket.on("join", (name, character) => {
    // Generuj pozycję startową bez kolizji
    let spawnX, spawnY;
    let attempts = 0;
    do {
      spawnX = 100 + Math.random() * (GAME_WIDTH - 200);
      spawnY = 100 + Math.random() * (GAME_HEIGHT - 200);
      attempts++;
    } while (
      (collideWithObstacle(spawnX, spawnY, PLAYER_SIZE, PLAYER_SIZE) || 
      collideWithPlayers(spawnX, spawnY, PLAYER_SIZE, PLAYER_SIZE, null)) &&
      attempts < 100
    );

    players[socket.id] = {
      x: spawnX,
      y: spawnY,
      name,
      character,
      ammo: 30,
      reloading: false,
      health: 100,
      dir: { x: 1, y: 0 },
      kills: 0
    };
    io.emit("gameMessage", { type: "joined", name });
    socket.emit("id", socket.id);
  });

  socket.on("move", keys => {
    const p = players[socket.id];
    if (!p) return;

    const oldX = p.x, oldY = p.y;
    
    if (keys['w']) p.y -= PLAYER_SPEED;
    if (keys['s']) p.y += PLAYER_SPEED;
    if (keys['a']) {
      p.x -= PLAYER_SPEED;
      p.dir = { x: -1, y: 0 };
    }
    if (keys['d']) {
      p.x += PLAYER_SPEED;
      p.dir = { x: 1, y: 0 };
    }

    // Sprawdzanie kolizji
    if (
      isOutsideGameArea(p.x, p.y) ||
      collideWithObstacle(p.x, p.y, PLAYER_SIZE, PLAYER_SIZE) ||
      collideWithPlayers(p.x, p.y, PLAYER_SIZE, PLAYER_SIZE, socket.id)
    ) {
      p.x = oldX;
      p.y = oldY;
    }
  });

  socket.on("shoot", () => {
    const p = players[socket.id];
    if (!p || p.ammo <= 0 || p.reloading) return;
    
    p.ammo--;
    bullets.push({
      x: p.x + PLAYER_SIZE/2 - 3,
      y: p.y + PLAYER_SIZE/2 - 3,
      dx: p.dir.x * BULLET_SPEED,
      dy: p.dir.y * BULLET_SPEED,
      owner: socket.id
    });
  });

  socket.on("reload", () => {
    const p = players[socket.id];
    if (!p || p.reloading) return;
    p.reloading = true;
    setTimeout(() => {
      p.ammo = 30;
      p.reloading = false;
    }, 1000);
  });

  socket.on("disconnect", () => {
  const player = players[socket.id];
  if (player) {
    const playerName = player.name;
    delete players[socket.id];
    
    io.emit("gameMessage", { type: "left", name: playerName });
    
    io.emit("update", { 
      players, 
      bullets, 
      obstacles, 
      leaderboard: getCurrentLeaderboard(),
      gameWidth: GAME_WIDTH,
      gameHeight: GAME_HEIGHT
    });
  }
});
});
function getCurrentLeaderboard() {
  const playersArray = Object.values(players);
  if (playersArray.length === 0) return null;
  return playersArray.sort((a, b) => b.kills - a.kills)[0];
}

// Game loop
setInterval(() => {
  // Aktualizacja pocisków
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    b.x += b.dx;
    b.y += b.dy;

    // Kolizja pocisku z przeszkodą
    if (collideWithObstacle(b.x, b.y, 6, 6)) {
      bullets.splice(i, 1);
      continue;
    }

    // Kolizja pocisku z graczem
    let hitPlayer = false;
    for (let id in players) {
      const p = players[id];
      if (b.owner !== id &&
          b.x + 3 >= p.x && b.x <= p.x + PLAYER_SIZE &&
          b.y + 3 >= p.y && b.y <= p.y + PLAYER_SIZE) {
        p.health -= 25;
        
        if (p.health <= 0) {
          // Respawn bez kolizji
          let spawnX, spawnY;
          let attempts = 0;
          do {
            spawnX = 100 + Math.random() * (GAME_WIDTH - 200);
            spawnY = 100 + Math.random() * (GAME_HEIGHT - 200);
            attempts++;
          } while (
            (collideWithObstacle(spawnX, spawnY, PLAYER_SIZE, PLAYER_SIZE) || 
            collideWithPlayers(spawnX, spawnY, PLAYER_SIZE, PLAYER_SIZE, id)) &&
            attempts < 100
          );

          p.x = spawnX;
          p.y = spawnY;
          p.health = 100;
          if (players[b.owner]) players[b.owner].kills++;
          io.emit("gameMessage", { type: "died", name: p.name });
        }
        
        hitPlayer = true;
        break;
      }
    }

    // Usuwanie pocisków po trafieniu lub poza ekranem
    if (hitPlayer || b.x < -10 || b.y < -10 || b.x > GAME_WIDTH + 10 || b.y > GAME_HEIGHT + 10) {
      bullets.splice(i, 1);
    }
  }

  const leaderboard = Object.values(players).sort((a, b) => b.kills - a.kills)[0];
  io.emit("update", { 
    players, 
    bullets, 
    obstacles, 
    leaderboard,
    gameWidth: GAME_WIDTH,
    gameHeight: GAME_HEIGHT
  });
}, 1000 / 60);

// Serwowanie plików statycznych
app.use(express.static(__dirname));
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/gra.html", (req, res) => res.sendFile(path.join(__dirname, "gra.html")));

http.listen(3000, () => console.log("SERWER DZIALA EZZZ"));