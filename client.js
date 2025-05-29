const socket = io();
const urlParams = new URLSearchParams(window.location.search);
const username = urlParams.get("name");
const character = urlParams.get("character") || "player1.png";
const backgroundMusic = document.getElementById("backgroundMusic");
const soundToggle = document.getElementById("soundToggle");
let isMusicPlaying = false;

// Elementy DOM
const gameContainer = document.getElementById("game-container");
const game = document.getElementById("game");
const playerCount = document.getElementById("playerCount");
const ammoDisplay = document.getElementById("ammoDisplay");
const gameMessage = document.getElementById("gameMessage");
const fullscreenBtn = document.getElementById("fullscreen-btn");

let keys = {};
let myId = null;
let gameWidth = 1980;
let gameHeight = 1280;

function playBackgroundMusic() {
  backgroundMusic.volume = 0.5; // Ustaw głośność
  backgroundMusic.play()
    .then(() => {
      isMusicPlaying = true;
      soundToggle.textContent = "Wyłącz dźwięk";
    })
    .catch(error => {
      console.log("Autoodtwarzanie zablokowane:", error);
      // Pokazuj przycisk, jeśli autoodtwarzanie zablokowane
      soundToggle.style.display = "block";
    });
}
soundToggle.addEventListener("click", () => {
  if (isMusicPlaying) {
    backgroundMusic.pause();
    soundToggle.textContent = "Włącz dźwięk";
  } else {
    playBackgroundMusic();
  }
  isMusicPlaying = !isMusicPlaying;
});
window.addEventListener("load", () => {
  // Opóźnienie dla zgodności z zasadami autoodtwarzania
  setTimeout(playBackgroundMusic, 500);
});
// Funkcja do skalowania gry
function resizeGame() {
  const windowRatio = window.innerWidth / window.innerHeight;
  const gameRatio = gameWidth / gameHeight;
  
  if (windowRatio > gameRatio) {
    // Ekran szerszy niż gra - skalowanie wysokości
    const scale = window.innerHeight / gameHeight;
    game.style.width = `${gameWidth * scale}px`;
    game.style.height = `${gameHeight * scale}px`;
  } else {
    // Ekran węższy niż gra - skalowanie szerokości
    const scale = window.innerWidth / gameWidth;
    game.style.width = `${gameWidth * scale}px`;
    game.style.height = `${gameHeight * scale}px`;
  }
}

// Pełny ekran
fullscreenBtn.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    gameContainer.requestFullscreen().catch(err => {
      console.error(`Błąd pełnego ekranu: ${err.message}`);
    });
  } else {
    document.exitFullscreen();
  }
});

// Obsługa zmiany rozmiaru okna
window.addEventListener("resize", resizeGame);

// Inicjalizacja
resizeGame();

// Sterowanie
document.addEventListener("keydown", e => {
  keys[e.key.toLowerCase()] = true;
  if (e.key.toLowerCase() === 'r') socket.emit("reload");
});

document.addEventListener("keyup", e => {
  keys[e.key.toLowerCase()] = false;
});

game.addEventListener("mousedown", () => socket.emit("shoot"));

socket.emit("join", username, character);

socket.on("id", id => myId = id);

socket.on("update", data => {
  if (!isMusicPlaying && backgroundMusic.paused) {
    soundToggle.style.display = "block";
  }
  game.innerHTML = '';
  const { players, bullets, obstacles, leaderboard, gameWidth: gw, gameHeight: gh } = data;
  
  if (gw) gameWidth = gw;
  if (gh) gameHeight = gh;
  
  game.style.width = `${gameWidth}px`;
  game.style.height = `${gameHeight}px`;
  resizeGame();

  // Przeszkody
  obstacles.forEach(o => {
    const div = document.createElement("div");
    div.className = "obstacle";
    Object.assign(div.style, {
      left: o.x + "px", 
      top: o.y + "px",
      width: o.w + "px", 
      height: o.h + "px"
    });
    game.appendChild(div);
  });

  // Gracze
  Object.entries(players).forEach(([id, p]) => {
    const playerDiv = document.createElement("div");
    playerDiv.className = "player";
    playerDiv.style.left = p.x + "px";
    playerDiv.style.top = p.y + "px";
    
    const img = document.createElement("img");
    img.src = `images/${p.character}`; 
    img.style.width = "100%";
    img.style.height = "100%";
    img.draggable = false;
    playerDiv.appendChild(img);
    
    const health = document.createElement("div");
    health.className = "healthBar";
    health.style.width = p.health + "%";
    
    const nameTag = document.createElement("div");
    nameTag.className = "nameTag";
    nameTag.textContent = p.name;
    
    playerDiv.appendChild(health);
    playerDiv.appendChild(nameTag);
    game.appendChild(playerDiv);
  });

  // Pociski (jajka)
  bullets.forEach(b => {
    const bullet = document.createElement("div");
    bullet.style.position = "absolute";
    bullet.style.width = "20px";
    bullet.style.height = "20px";
    bullet.style.left = (b.x - 10) + "px";
    bullet.style.top = (b.y - 10) + "px";
    
    const bulletImg = document.createElement("img");
    bulletImg.src = "images/amunicja.png";
    bulletImg.style.width = "100%";
    bulletImg.style.height = "100%";
    bulletImg.draggable = false;
    bullet.appendChild(bulletImg);
    
    game.appendChild(bullet);
  });

  // Aktualizacja UI
  playerCount.textContent = `Gracze: ${Object.keys(players).length}`;
  if (players[myId]) {
    ammoDisplay.textContent = `${players[myId].ammo} / 30`;
    ammoDisplay.style.color = players[myId].reloading ? "orange" : "white";
  }
  document.getElementById("leaderboard").textContent =
    leaderboard ? `Top zabójca: ${leaderboard.name} (${leaderboard.kills})` : "Top zabójca: -";
});

socket.on("gameMessage", ({type, name}) => {
  if (type === "joined") {
    gameMessage.textContent = `${name} dołączył`;
  } else if (type === "left") {
    gameMessage.textContent = `${name} opuścił grę`;
  } else if (type === "died") {
    gameMessage.textContent = `${name} zginął`;
  }
  
  gameMessage.style.display = "block";
  setTimeout(() => gameMessage.style.display = "none", 3000);
});

setInterval(() => {
  if (myId) socket.emit("move", keys);
}, 1000 / 60);