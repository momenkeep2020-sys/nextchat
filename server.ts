import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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
      // Simple extraction of JSON if model returns markdown
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
    app.get("*all", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`NextChat Server running on http://localhost:${PORT}`);
  });
}

startServer();
