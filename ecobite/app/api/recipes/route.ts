import { NextResponse } from "next/server";
import { askJson } from "@/lib/gemini";
export async function POST(req: Request) {
  try {
    const { items } = await req.json();
    const recipes = await askJson([{ text: `Ingredients (days until spoiled): ${JSON.stringify(items)}.
Suggest 3 simple recipes that use the soonest-expiring items first. Return ONLY JSON:
[{"title":string,"uses":string[],"steps":string[]}]. Each step is ONE short sentence, easy to hear aloud.` }]);
    return NextResponse.json({ recipes });
  } catch (e) {
    return NextResponse.json({ recipes: [], error: String(e) }, { status: 500 });
  }
}