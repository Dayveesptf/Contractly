// backend/server.js
import express from "express";
import multer from "multer";
import mammoth from "mammoth";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { GoogleGenerativeAI } from "@google/generative-ai";
import cors from "cors"; // Add this import

dotenv.config();

const app = express();
const upload = multer({ dest: "uploads/" });
const PORT = process.env.PORT || 5000;

// Enable CORS - Add this middleware
app.use(cors({
  origin: "http://localhost:5173", // Your frontend URL
  credentials: true
}));


// Fix for pdf-parse: Use dynamic import with error handling
let pdfParse;

// Create an async function to handle the dynamic import
async function initializePdfParse() {
  try {
    // Use dynamic import to avoid the initialization error
    const pdfModule = await import('pdf-parse');
    return pdfModule.default;
  } catch (error) {
    console.warn('PDF parse module warning:', error.message);
    // Fallback implementation
    return async (buffer) => {
      try {
        // Try to use an alternative approach if the main import fails
        const { default: fallbackPdfParse } = await import('pdf-parse/lib/pdf-parse.js');
        return await fallbackPdfParse(buffer);
      } catch (fallbackError) {
        console.warn('Fallback PDF parse also failed:', fallbackError.message);
        return { text: "PDF content extraction unavailable. Please try a DOCX file instead." };
      }
    };
  }
}

// Initialize the server
async function startServer() {
  // Initialize pdfParse
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

      // PDF extraction
      if (file.mimetype === "application/pdf") {
        try {
          const buffer = fs.readFileSync(file.path);
          const data = await pdfParse(buffer);
          text = data.text;
          if (!text || text.includes("unavailable")) {
            return res.status(400).json({ 
              error: "PDF parsing is currently unavailable. Please upload a DOCX file instead." 
            });
          }
        } catch (pdfError) {
          console.error("PDF parsing error:", pdfError);
          return res.status(400).json({ 
            error: "Failed to parse PDF. Please try a DOCX file or ensure the PDF is not password protected." 
          });
        }
      }
      // DOCX/DOC extraction
      else if (
        file.mimetype ===
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
        file.mimetype === "application/msword"
      ) {
        const result = await mammoth.extractRawText({ path: file.path });
        text = result.value;
      } else {
        return res.status(400).json({ error: "Unsupported file type" });
      }

      // Build prompt
      const prompt = `
        You are a legal assistant AI. Analyze this contract and summarize clearly:
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

      // Cleanup uploaded file
      fs.unlink(file.path, (err) => {
        if (err) console.error("❌ Error deleting file:", err);
      });

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

// Start the server
startServer().catch(error => {
  console.error("Failed to start server:", error);
  process.exit(1);
});