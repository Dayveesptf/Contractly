// backend/server.js
import express from "express";
import multer from "multer";
import mammoth from "mammoth";
import dotenv from "dotenv";
import fs from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import cors from "cors";

dotenv.config();

const app = express();
const upload = multer({ dest: "uploads/" });
const PORT = process.env.PORT || 5000;

// Enable CORS
app.use(cors({
  origin: ["http://localhost:5173", "https://contractly-kappa.vercel.app"],
  credentials: true
}));

// Fix for pdf-parse
let pdfParse;
async function initializePdfParse() {
  try {
    const pdfModule = await import("pdf-parse");
    return pdfModule.default;
  } catch (error) {
    console.warn("PDF parse module warning:", error.message);
    return async () => ({ text: "" });
  }
}

async function startServer() {
  pdfParse = await initializePdfParse();

  // Gemini client
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

  // Route: Analyze contract
  app.post("/analyze", upload.single("file"), async (req, res) => {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      let text = "";

      // Extract text
      if (file.mimetype === "application/pdf") {
        const buffer = fs.readFileSync(file.path);
        const data = await pdfParse(buffer);
        text = data.text;
      } else if (
        file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        file.mimetype === "application/msword"
      ) {
        const result = await mammoth.extractRawText({ path: file.path });
        text = result.value;
      } else {
        return res.status(400).json({ error: "Unsupported file type" });
      }

      // Quick keyword check (backend filter)
      const contractKeywords = /(agreement|party|obligation|termination|confidentiality|liability|warranty|contract)/i;
      if (!contractKeywords.test(text)) {
        fs.unlink(file.path, () => {});
        return res.json({
          analysis: "⚠️ This doesn’t look like a contract. Please upload an actual contract document."
        });
      }

      // Build refined prompt
      const prompt = `
        You are a legal assistant AI.
        First, check if the document is truly a legal contract.
        - If it is NOT a contract, respond exactly with:
          "⚠️ This doesn’t look like a contract. Please upload an actual contract document."
        - If it IS a contract, then analyze and summarize with these sections:
          - Key obligations
          - Renewal dates and deadlines
          - Risks and penalties
          - Auto-renewal clauses
          - Recommendations for SMEs

        Contract (truncated if too long):
        ${text.slice(0, 4000)}
      `;

      // Gemini call
      const result = await model.generateContent(prompt);
      const analysis = result.response.text();

      fs.unlink(file.path, () => {}); // cleanup

      res.json({ analysis });
    } catch (error) {
      console.error("❌ Analysis failed:", error);
      res.status(500).json({ error: "Analysis failed" });
    }
  });

  // Start server
  app.listen(PORT, () => {
    console.log(`✅ Gemini server running on http://localhost:${PORT}`);
  });
}

startServer().catch(error => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
