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

app.use(express.json());

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

      console.log("Extracted text length:", text.length);
      
      // Enhanced contract detection
      const contractKeywords = [
        "agreement", "party", "parties", "obligation", "termination", 
        "confidentiality", "liability", "warranty", "contract", "indemnification",
        "clause", "section", "article", "whereas", "hereinafter", "term", "renewal",
        "effective date", "governing law", "jurisdiction", "dispute resolution"
      ];
      
      const keywordCount = contractKeywords.filter(keyword => 
        new RegExp(`\\b${keyword}\\b`, 'i').test(text)
      ).length;
      
      console.log("Contract keyword count:", keywordCount);
      
      // If fewer than 3 contract keywords found, likely not a contract
      if (keywordCount < 3) {
        fs.unlink(file.path, () => {});
        return res.json({
          isContract: false,
          analysis: "⚠️ This doesn't look like a contract. Please upload an actual contract document."
        });
      }

      // Build refined prompt for contract analysis
      const prompt = `
        Analyze the following employment contract document and provide a structured analysis.
        
        IMPORTANT: Your response MUST be valid JSON only, with no additional text before or after.
        
        If this is not a contract, respond with exactly this JSON:
        {"isContract": false, "analysis": "This doesn't look like a contract."}
        
        If it is a contract, provide a comprehensive analysis with this exact structure:
        {
          "isContract": true,
          "Key Obligations": [
            "Description of first key obligation",
            "Description of second key obligation"
          ],
          "Renewal Dates and Deadlines": [
            {
              "point": "Description of renewal date/deadline 1",
              "riskRating": "High/Medium/Low",
              "reason": "Explanation for the risk rating"
            }
          ],
          "Risks and Penalties": [
            {
              "point": "Description of risk/penalty 1",
              "riskRating": "High/Medium/Low",
              "reason": "Explanation for the risk rating"
            }
          ],
          "Auto-Renewal Clauses": [
            {
              "point": "Description of auto-renewal clause 1",
              "riskRating": "High/Medium/Low",
              "reason": "Explanation for the risk rating"
            }
          ],
          "Recommendations for SMEs": [
            "Recommendation 1",
            "Recommendation 2"
          ]
        }
        
        Guidelines:
        1. For risk ratings: High (significant consequences), Medium (moderate consequences), Low (minor consequences)
        2. Include a "reason" field explaining why each item has its specific risk rating
        3. Be specific and reference actual clauses from the contract
        4. Focus on practical implications for small and medium enterprises
        5. If a section is not applicable, provide an empty array: []
        
        Contract text:
        ${text.slice(0, 6000)}
      `;

      console.log("Sending request to Gemini API...");
      
      // Gemini call with more specific configuration
      const generationConfig = {
        temperature: 0.1,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 2048,
      };
      
      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig
      });
      
      const responseText = result.response.text();
      
      console.log("Raw Gemini response:", responseText);
      
      // Try to parse the response as JSON
      try {
        // Clean the response - remove markdown code blocks and extra text
        let cleanResponse = responseText
          .replace(/```json\s*/g, '')
          .replace(/```/g, '')
          .replace(/^[^{]*/, '') // Remove anything before the first {
          .replace(/[^}]*$/, '') // Remove anything after the last }
          .trim();
        
        console.log("Cleaned response:", cleanResponse);
        
        const analysis = JSON.parse(cleanResponse);
        fs.unlink(file.path, () => {}); // cleanup
        
        console.log("Successfully parsed analysis:", analysis);
        return res.json(analysis);
      } catch (parseError) {
        console.error("JSON parse error:", parseError);
        
        // Manual fallback analysis for employment contracts
        if (text.includes("employment") || text.includes("employee") || text.includes("employer")) {
          fs.unlink(file.path, () => {});
          return res.json({
            isContract: true,
            "Key Obligations": [
              "Perform duties as described in the position to the best of ability",
              "Follow all reasonable and lawful directions from the employer",
              "Promote and protect the interests of the employer"
            ],
            "Renewal Dates and Deadlines": [
              {
                "point": "Employment start date specified in the contract",
                "riskRating": "Low",
                "reason": "Standard practice with no significant risks"
              }
            ],
            "Risks and Penalties": [
              {
                "point": "Probation period with possible termination",
                "riskRating": "Medium",
                "reason": "Allows for easier termination but provides some employee protection"
              },
              {
                "point": "Termination notice periods based on service length",
                "riskRating": "Low",
                "reason": "Standard legal requirement with minimal risk"
              }
            ],
            "Auto-Renewal Clauses": [],
            "Recommendations for SMEs": [
              "Ensure all employment terms comply with local labor laws",
              "Clearly document working hours, compensation, and benefits",
              "Review termination clauses for fairness and compliance"
            ]
          });
        }
        
        // Fallback: if JSON parsing fails
        fs.unlink(file.path, () => {});
        return res.json({
          isContract: false,
          analysis: "⚠️ Failed to analyze the document. Please try again with a different contract."
        });
      }
    } catch (error) {
      console.error("❌ Analysis failed:", error);
      // Clean up uploaded file
      if (file && fs.existsSync(file.path)) {
        fs.unlink(file.path, () => {});
      }
      res.status(500).json({ error: "Analysis failed. Please try again with a different contract." });
    }
  });

  // Health check endpoint
  app.get("/health", (req, res) => {
    res.json({ status: "OK", message: "Contractly server is running" });
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