const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

/** Game Configuration */
const GAME_INTERVAL_MS = 200;
const CRASH_PROBABILITY_FACTOR = 0.02;
const MULTIPLIER_INCREMENT = 0.05;
const NEXT_ROUND_WAIT_TIME = 10;

let multiplier = 0;
let isCrashed = false;
let isBetWindowOpen = true;
let activeBets = {}; // { socketId: [{ amount, time }] }
let nextRoundBets = {}; // { socketId: [{ amount, time }] }
let interval = null;

/**
 * Starts the game loop and manages betting logic.
 */
function startGameLoop() {
  multiplier = 0;
  isCrashed = false;
  isBetWindowOpen = false;

  // Move all pending bets to active bets
  activeBets = { ...nextRoundBets };
  nextRoundBets = {};

  console.log("🎮 New round started...");
  io.emit("new_round", { nextRoundIn: 0 });

  interval = setInterval(() => {
    if (isCrashed) {
      clearInterval(interval);
      return;
    }

    multiplier = parseFloat((multiplier * 1.05 + 0.05).toFixed(2)); // Increment from 0
    io.emit("game_update", { multiplier });

    if (Math.random() < CRASH_PROBABILITY_FACTOR * multiplier) {
      isCrashed = true;
      io.emit("game_crash", { crashPoint: multiplier });
      console.log(`💥 Game crashed at ${multiplier}x`);
      activeBets = {};

      let countdown = NEXT_ROUND_WAIT_TIME;
      isBetWindowOpen = true;

      const countdownInterval = setInterval(() => {
        io.emit("next_round_timer", { timeLeft: countdown });
        countdown--;
        if (countdown < 0) {
          clearInterval(countdownInterval);
          startGameLoop();
        }
      }, 1000);
    }
  }, GAME_INTERVAL_MS);
}

io.on("connection", (socket) => {
  console.log(`✅ User connected: ${socket.id}`);

  if (isCrashed) {
    socket.emit("game_crash", { crashPoint: multiplier });
    socket.emit("next_round_timer", { timeLeft: NEXT_ROUND_WAIT_TIME });
  } else {
    socket.emit("game_update", { multiplier });
  }

  socket.emit("new_round", { nextRoundIn: 0 });

  /**
   * Handles user bet placement.
   */
  socket.on("place_bet", ({ amount }) => {
    if (!amount || amount <= 0) {
      socket.emit("bet_failed", { error: "Invalid bet amount!" });
      return;
    }

    if (!nextRoundBets[socket.id]) {
      nextRoundBets[socket.id] = [];
    }

    nextRoundBets[socket.id].push({ amount, time: Date.now() });

    socket.emit("bet_placed", { success: true, nextRound: !isBetWindowOpen });
    console.log(`💰 User ${socket.id} placed a bet of $${amount}`);
  });

  /**
   * Handles bet removal before the game starts.
   */
  socket.on("remove_bet", () => {
    if (!nextRoundBets[socket.id] || nextRoundBets[socket.id].length === 0) {
      socket.emit("bet_remove_failed", { error: "No bet found to remove." });
      return;
    }

    delete nextRoundBets[socket.id];
    console.log(`🚫 User ${socket.id} removed their bet`);
    socket.emit("bet_removed", { success: true });
  });

  /**
   * Handles cashing out before the game crashes.
   */
  socket.on("cash_out", () => {
    if (isCrashed) {
      socket.emit("cash_out_failed", { error: "Game has already crashed!" });
      return;
    }

    if (!activeBets[socket.id] || activeBets[socket.id].length === 0) {
      socket.emit("cash_out_failed", { error: "No active bet to cash out." });
      return;
    }

    let totalEarnings = activeBets[socket.id].reduce(
      (sum, bet) => sum + bet.amount * multiplier,
      0
    );
    console.log(
      `💵 User ${socket.id} cashed out at ${multiplier}x for $${totalEarnings}`
    );

    socket.emit("cash_out_success", { multiplier, earnings: totalEarnings });
    delete activeBets[socket.id]; // Remove user from active bets after cashing out
  });

  /**
   * Handles user disconnection.
   */
  socket.on("disconnect", () => {
    console.log(`❌ User disconnected: ${socket.id}`);
    delete nextRoundBets[socket.id]; // Keep active bets in case they reconnect
  });
});

startGameLoop();

server.listen(3001, () => {
  console.log("🚀 Server running on port 3001");
});
