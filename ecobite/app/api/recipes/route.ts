import { NextResponse } from "next/server";
import { askJson } from "@/lib/gemini";

export async function POST(req: Request) {
  try {
    const { items } = await req.json();

    const raw = await askJson([
      {
        text: `Ingredients (days until spoiled): ${JSON.stringify(items)}.
Suggest 3 simple recipes that use the soonest-expiring items first. Return ONLY a JSON array:
[{"title":string,"uses":string[],"steps":string[]}]. Each step is ONE short sentence, easy to hear aloud.`,
      },
    ]);

    // Gemini sometimes wraps the array as { recipes: [...] } instead of
    // returning a bare array — normalize either shape.
    const list = Array.isArray(raw) ? raw : raw?.recipes ?? [];

    const recipes = list
      .filter((r: any) => r && r.title && Array.isArray(r.steps) && r.steps.length)
      .map((r: any) => ({
        title: String(r.title),
        uses: Array.isArray(r.uses) ? r.uses : [],
        steps: r.steps.map(String),
      }));

    if (!recipes.length) {
      throw new Error("Model returned no usable recipes: " + JSON.stringify(raw).slice(0, 200));
    }

    return NextResponse.json({ recipes });
  } catch (e) {
    console.error("RECIPES ERROR:", e);
    return NextResponse.json({ recipes: [], error: String(e) }, { status: 500 });
  }
}