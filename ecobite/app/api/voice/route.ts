const cache = new Map<string, ArrayBuffer>();
const VOICE = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
export async function POST(req: Request) {
  const { text } = await req.json();
  if (!cache.has(text)) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE}`, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY!, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
    });
    if (!r.ok) return new Response("voice error", { status: 500 });
    cache.set(text, await r.arrayBuffer());
  }
  return new Response(cache.get(text)!, { headers: { "Content-Type": "audio/mpeg" } });
}