import { NextResponse } from "next/server";
import { askText } from "@/lib/gemini";
export async function POST(req: Request) {
  try {
    const { question, step, title } = await req.json();
    const answer = await askText(`You are a friendly voice chef helping cook "${title}". Current step: "${step}".
Answer in at most 2 short spoken sentences: ${question}`);
    return NextResponse.json({ answer });
  } catch {
    return NextResponse.json({ answer: "Sorry, I couldn't answer that." }, { status: 500 });
  }
}