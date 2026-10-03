import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

// Tried in order. If one is overloaded or unavailable, the next is used.
const MODELS = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3-flash-preview"];

const clean = (t: string) => t.replace(/```json|```/g, "").trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function generate(contents: any, config?: any) {
  let lastErr: any;
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const r = await ai.models.generateContent({ model, contents, config });
        return r.text ?? "";
      } catch (e: any) {
        lastErr = e;
        const status = e?.status;
        console.error(`Gemini ${model} attempt ${attempt + 1} failed (${status})`);
        if (status === 503 || status === 429) await sleep(1500 * (attempt + 1)); // overloaded: wait and retry
        else break; // 404 or other: try the next model
      }
    }
  }
  throw lastErr;
}

export async function askJson(parts: any[]) {
  const text = await generate([{ role: "user", parts }], { responseMimeType: "application/json" });
  return JSON.parse(clean(text || "null"));
}

export async function askText(prompt: string) {
  return generate(prompt);
}