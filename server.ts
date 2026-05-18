import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import { createServer } from "http";
import { Server } from "socket.io";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Game State Management
interface Player {
  id: string;
  x: number;
  y: number;
  score: number;
  side: 'left' | 'right';
  ready: boolean;
}

interface GameState {
  ball: { x: number, y: number, vx: number, vy: number };
  players: Record<string, Player>;
  status: 'waiting' | 'ready' | 'playing';
}

const games: Record<string, GameState> = {};

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*" }
  });

  const PORT = 3000;

  app.use(express.json());

  // ... (Existing AI endpoints preserved below)
  
  // AI Smart Reply Endpoint
  app.post("/api/ai/smart-reply", async (req, res) => {
    try {
      const { text, lang } = req.body;
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
      
      const prompt = `
        You are a smart chat assistant. Provide 3 short, helpful, and natural reply suggestions for the following message.
        Language: ${lang === "ar" ? "Arabic" : "English"}
        Message: "${text}"
        Format: Return a JSON array of strings only.
      `;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      const jsonStr = responseText.substring(responseText.indexOf("["), responseText.lastIndexOf("]") + 1);
      const replies = JSON.parse(jsonStr);

      res.json({ replies });
    } catch (error) {
      console.error("AI Error:", error);
      res.status(500).json({ error: "Failed to generate replies" });
    }
  });

  // AI Summarization Endpoint
  app.post("/api/ai/summarize", async (req, res) => {
    try {
      const { messages, lang } = req.body;
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
      
      const chatHistory = messages.map((m: any) => `${m.senderId}: ${m.text}`).join("\n");
      const prompt = `
        Summarize the following chat conversation into a brief, high-level overview.
        Language: ${lang === "ar" ? "Arabic" : "English"}
        Conversation:
        ${chatHistory}
      `;

      const result = await model.generateContent(prompt);
      res.json({ summary: result.response.text() });
    } catch (error) {
      console.error("AI Error:", error);
      res.status(500).json({ error: "Failed to summarize" });
    }
  });

  // Socket.io Game Logic
  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("join-game", (roomId: string) => {
      socket.join(roomId);
      
      if (!games[roomId]) {
        games[roomId] = {
          ball: { x: 400, y: 300, vx: 0, vy: 0 },
          players: {},
          status: 'waiting'
        };
      }

      const game = games[roomId];
      const side = Object.keys(game.players).length === 0 ? 'left' : 'right';
      
      game.players[socket.id] = {
        id: socket.id,
        x: side === 'left' ? 100 : 700,
        y: 300,
        score: 0,
        side,
        ready: false
      };

      io.to(roomId).emit("game-state", game);
    });

    socket.on("player-ready", (roomId: string) => {
      const game = games[roomId];
      if (game && game.players[socket.id]) {
        game.players[socket.id].ready = true;
        
        const allReady = Object.values(game.players).length === 2 && 
                         Object.values(game.players).every(p => p.ready);
        
        if (allReady) {
          game.status = 'playing';
          // Initialize ball with slight random movement
          game.ball.vx = (Math.random() > 0.5 ? 5 : -5);
          game.ball.vy = (Math.random() - 0.5) * 5;
        } else {
          game.status = 'ready';
        }
        
        io.to(roomId).emit("game-state", game);
      }
    });

    socket.on("move-player", ({ roomId, x, y }) => {
      const game = games[roomId];
      if (game && game.players[socket.id] && game.status === 'playing') {
        game.players[socket.id].x = x;
        game.players[socket.id].y = y;
        
        // Basic Collision (Improved)
        const dx = game.ball.x - x;
        const dy = game.ball.y - y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 35) { // Adjusted hit boxes
          const force = 12;
          game.ball.vx = (dx / dist) * force;
          game.ball.vy = (dy / dist) * force;
        }

        io.to(roomId).emit("player-moved", { id: socket.id, x, y, ball: game.ball });
      }
    });

    socket.on("disconnect", () => {
      // Cleanup
      for (const roomId in games) {
        if (games[roomId].players[socket.id]) {
          delete games[roomId].players[socket.id];
          io.to(roomId).emit("player-left", socket.id);
        }
      }
    });
  });

  // Physics Loop (simplified server-side physics)
  setInterval(() => {
    for (const roomId in games) {
      const game = games[roomId];
      game.ball.x += game.ball.vx;
      game.ball.y += game.ball.vy;

      // Friction
      game.ball.vx *= 0.98;
      game.ball.vy *= 0.98;

      // Wall bounce
      if (game.ball.y < 0 || game.ball.y > 600) game.ball.vy *= -1;
      
      // Goal detection
      if (game.ball.x < 0) {
         game.ball = { x: 400, y: 300, vx: 0, vy: 0 };
         // Find right player and increment score
         Object.values(game.players).forEach(p => { if(p.side === 'right') p.score++; });
         io.to(roomId).emit("goal", { scorer: 'right', state: game });
      }
      if (game.ball.x > 800) {
         game.ball = { x: 400, y: 300, vx: 0, vy: 0 };
         Object.values(game.players).forEach(p => { if(p.side === 'left') p.score++; });
         io.to(roomId).emit("goal", { scorer: 'left', state: game });
      }

      if (Math.abs(game.ball.vx) > 0.1 || Math.abs(game.ball.vy) > 0.1) {
        io.to(roomId).emit("ball-update", game.ball);
      }
    }
  }, 1000 / 30); // 30fps physics

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
