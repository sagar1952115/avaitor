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
    methods: ["GET", "POST"],
  },
});

let multiplier = 0; // Start from 0
let isCrashed = false;
let interval = null;
let activeBets = {};
let nextRoundBets = {};
let nextRoundIn = 10;
let isBetWindowOpen = true;

function startGameLoop() {
  multiplier = 0; // Reset multiplier to 0
  isCrashed = false;
  isBetWindowOpen = false;
  activeBets = { ...nextRoundBets };
  nextRoundBets = {};
  
  console.log("🎮 New round started...");
  io.emit("new_round", { nextRoundIn: 0 });

  interval = setInterval(() => {
    if (isCrashed) {
      clearInterval(interval);
      return;
    }

    multiplier = parseFloat((multiplier + 0.05).toFixed(2)); // Increment from 0
    io.emit("game_update", { multiplier });

    if (Math.random() < 0.02 * multiplier) {
      isCrashed = true;
      io.emit("game_crash", { crashPoint: multiplier });
      console.log(`💥 Game crashed at ${multiplier}x`);
      activeBets = {};

      let countdown = nextRoundIn;
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
  }, 200);
}

io.on("connection", (socket) => {
  console.log(`✅ User connected: ${socket.id}`);

  if (isCrashed) {
    socket.emit("game_crash", { crashPoint: multiplier });
    socket.emit("next_round_timer", { timeLeft: nextRoundIn });
  } else {
    socket.emit("game_update", { multiplier });
  }

  socket.on("place_bet", ({ amount }) => {
    if (!isBetWindowOpen) {
      nextRoundBets[socket.id] = amount;
      socket.emit("bet_placed", { success: true, nextRound: true });
      console.log(`💰 User ${socket.id} placed a bet of $${amount} (next round)`);
    } else {
      nextRoundBets[socket.id] = amount;
      socket.emit("bet_placed", { success: true, nextRound: false });
      console.log(`💰 User ${socket.id} placed a bet of $${amount}`);
    }
  });

  socket.on("remove_bet", () => {
    if (nextRoundBets[socket.id]) {
      delete nextRoundBets[socket.id];
      console.log(`🚫 User ${socket.id} removed their bet`);
      socket.emit("bet_removed", { success: true });
    } else {
      socket.emit("bet_remove_failed", { error: "No bet found to remove." });
    }
  });

  socket.on("cash_out", () => {
    if (isCrashed) {
      socket.emit("cash_out_failed", { error: "Game has already crashed!" });
      return;
    }
    if (activeBets[socket.id]) {
      let earnings = activeBets[socket.id] * multiplier;
      console.log(`💵 User ${socket.id} cashed out at ${multiplier}x`);
      socket.emit("cash_out_success", { multiplier, earnings });
      delete activeBets[socket.id];
    }
  });

  socket.on("disconnect", () => {
    console.log(`❌ User disconnected: ${socket.id}`);
    delete activeBets[socket.id];
    delete nextRoundBets[socket.id];
  });
});

startGameLoop();

server.listen(3001, () => {
  console.log("🚀 Server running on port 3001");
});























// const express = require("express");
// const http = require("http");
// const { Server } = require("socket.io");
// const cors = require("cors");

// const app = express();
// app.use(cors());

// const server = http.createServer(app);
// const io = new Server(server, {
//   cors: {
//     origin: "http://localhost:3000",
//     methods: ["GET", "POST"],
//   },
// });

// let multiplier = 1.0;
// let isCrashed = false;
// let interval = null;
// let activeBets = {};
// let nextRoundIn = 10; // 10 seconds delay before new round

// function startGameLoop() {
//   multiplier = 1.0;
//   isCrashed = false;
//   console.log("🎮 New round started...");
//   io.emit("new_round", { nextRoundIn: 0 }); // Notify users

//   interval = setInterval(() => {
//     if (isCrashed) {
//       clearInterval(interval);
//       return;
//     }

//     multiplier = parseFloat((multiplier + 0.05).toFixed(2));
//     io.emit("game_update", { multiplier });

//     if (Math.random() < 0.02 * multiplier) {
//       isCrashed = true;
//       io.emit("game_crash", { crashPoint: multiplier });
//       console.log(`💥 Game crashed at ${multiplier}x`);
//       activeBets = {};

//       // Delay next round by 10 seconds
//       let countdown = nextRoundIn;
//       const countdownInterval = setInterval(() => {
//         io.emit("next_round_timer", { timeLeft: countdown });
//         countdown--;
//         if (countdown < 0) {
//           clearInterval(countdownInterval);
//           startGameLoop(); // Start next round after 10s
//         }
//       }, 1000);
//     }
//   }, 200);
// }

// io.on("connection", (socket) => {
//   console.log(`✅ User connected: ${socket.id}`);

//   if (isCrashed) {
//     socket.emit("game_crash", { crashPoint: multiplier });
//     socket.emit("next_round_timer", { timeLeft: nextRoundIn });
//   } else {
//     socket.emit("game_update", { multiplier });
//   }

//   socket.on("place_bet", ({ amount }) => {
//     if (isCrashed) {
//       socket.emit("bet_failed", { error: "Game has already crashed!" });
//       return;
//     }
//     activeBets[socket.id] = amount;
//     console.log(`💰 User ${socket.id} placed a bet of $${amount}`);
//     socket.emit("bet_confirmed", { success: true });
//   });

//   socket.on("cash_out", () => {
//     if (isCrashed) {
//       socket.emit("cash_out_failed", { error: "Game has already crashed!" });
//       return;
//     }
//     if (activeBets[socket.id]) {
//       let earnings = activeBets[socket.id] * multiplier;
//       console.log(`💵 User ${socket.id} cashed out at ${multiplier}x`);
//       socket.emit("cash_out_success", { multiplier, earnings });
//       delete activeBets[socket.id];
//     }
//   });

//   socket.on("disconnect", () => {
//     console.log(`❌ User disconnected: ${socket.id}`);
//     delete activeBets[socket.id];
//   });
// });

// // Start game loop when server starts
// startGameLoop();

// server.listen(3001, () => {
//   console.log("🚀 Server running on port 3001");
// });


