import { NextResponse } from "next/server";
import { askJson } from "@/lib/gemini";
export async function POST(req: Request) {
  try {
    const { image, mime } = await req.json();
    const items = await askJson([
      { inlineData: { mimeType: mime || "image/jpeg", data: image } },
      { text: `List the food items in this fridge photo or receipt. Return ONLY a JSON array of
{"name":string,"qty":number,"unit":string,"category":"produce"|"dairy"|"meat"|"grain"|"pantry"|"other","estShelfDays":number,"estWeightKg":number}.
estShelfDays = estimated days until it spoils from today.` },
    ]);
    return NextResponse.json({ items });
    } catch (e) {
    console.error("SCAN ERROR:", e);
    return NextResponse.json({ items: [], error: String(e) }, { status: 500 });
  }
}