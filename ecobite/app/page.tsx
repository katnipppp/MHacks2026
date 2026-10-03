"use client";
import { useState, useRef } from "react";

type Item = { id: number; name: string; qty: number; unit: string; category: string; expiresAt: number; kg: number; done?: string };
type Recipe = { title: string; uses: string[]; steps: string[] };
// PLACEHOLDER estimates (kg CO2e per kg food). Replace with a cited dataset before presenting.
const CO2: Record<string, number> = { produce: 2, dairy: 10, meat: 30, grain: 2, pantry: 3, other: 3 };
const daysLeft = (t: number) => (t - Date.now()) / 864e5;

export default function Home() {
  const [items, setItems] = useState<Item[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [cook, setCook] = useState<{ r: Recipe; i: number } | null>(null);
  const [busy, setBusy] = useState("");
  const [heard, setHeard] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);

  async function speak(text: string) {
    try {
      const res = await fetch("/api/voice", { method: "POST", body: JSON.stringify({ text }) });
      if (!res.ok) return;
      audio.current?.pause();
      audio.current = new Audio(URL.createObjectURL(await res.blob()));
      audio.current.play();
    } catch {}
  }
  async function scan(file: File) {
    setBusy("Reading your fridge...");
    const b64: string = await new Promise((ok) => {
      const fr = new FileReader();
      fr.onload = () => ok(String(fr.result).split(",")[1]);
      fr.readAsDataURL(file);
    });
    const { items: found } = await (await fetch("/api/scan", { method: "POST", body: JSON.stringify({ image: b64, mime: file.type }) })).json();
    setItems((p) => [...p, ...(found || []).map((x: any, n: number) => ({
      id: Date.now() + n, name: x.name, qty: x.qty, unit: x.unit, category: x.category,
      expiresAt: Date.now() + x.estShelfDays * 864e5, kg: x.estWeightKg || 0.2 }))]);
    setBusy("");
  }
  async function getRecipes() {
    setBusy("Finding recipes that use your soonest-expiring food...");
    const live = items.filter((i) => !i.done).sort((a, b) => a.expiresAt - b.expiresAt)
      .map((i) => ({ name: i.name, daysLeft: Math.round(daysLeft(i.expiresAt) * 10) / 10 }));
    const { recipes: r } = await (await fetch("/api/recipes", { method: "POST", body: JSON.stringify({ items: live }) })).json();
    setRecipes(r || []); setBusy("");
  }
  function go(r: Recipe, i: number) { setCook({ r, i }); speak(r.steps[i]); }
  function ask() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR || !cook) return setHeard("Voice input isn't supported in this browser. Use Chrome.");
    const rec = new SR();
    rec.onresult = async (e: any) => {
      const q = e.results[0][0].transcript; setHeard(q);
      const { answer } = await (await fetch("/api/ask", { method: "POST", body: JSON.stringify({ question: q, step: cook.r.steps[cook.i], title: cook.r.title }) })).json();
      speak(answer);
    };
    rec.start();
  }
  const mark = (id: number, done: string) => setItems((p) => p.map((i) => (i.id === id ? { ...i, done } : i)));
  const saved = items.filter((i) => i.done === "used" || i.done === "shared");
  const co2 = saved.reduce((s, i) => s + i.kg * (CO2[i.category] ?? 3), 0);

  return (
    <main className="min-h-screen bg-[#1b2316] text-[#eef0e4] p-5 max-w-3xl mx-auto font-serif">
      <h1 className="text-4xl font-bold">EcoBite</h1>
      <p className="text-[#b8c4a0] mb-6">Cook what's about to go bad.</p>

      <label className="block rounded-2xl border-2 border-dashed border-[#5a6b43] p-6 text-center cursor-pointer hover:bg-[#26311f]">
        Add a photo of your fridge or receipt
        <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && scan(e.target.files[0])} />
      </label>
      {busy && <p className="mt-3 text-[#e8b04a]">{busy}</p>}

      {items.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xl mb-2">Your food</h2>
          <ul className="space-y-2">
            {[...items].sort((a, b) => a.expiresAt - b.expiresAt).map((i) => {
              const d = daysLeft(i.expiresAt);
              return (
                <li key={i.id} className={`flex items-center justify-between gap-2 rounded-xl bg-[#26311f] p-3 ${i.done ? "opacity-40" : ""}`}>
                  <span>{i.name} <span className="text-[#b8c4a0]">({i.qty} {i.unit})</span></span>
                  <span className={d < 1 ? "text-[#ff7a59] font-bold" : "text-[#b8c4a0]"}>
                    {i.done ? i.done : d < 1 ? `${Math.max(0, Math.round(d * 24))}h left` : `${Math.round(d)}d left`}
                  </span>
                  {!i.done && <span className="space-x-2 text-sm">
                    <button className="underline" onClick={() => mark(i.id, "used")}>used</button>
                    <button className="underline" onClick={() => mark(i.id, "shared")}>shared</button>
                    <button className="underline" onClick={() => mark(i.id, "wasted")}>wasted</button>
                  </span>}
                </li>
              );
            })}
          </ul>
          <button onClick={getRecipes} className="mt-4 rounded-full bg-[#e8b04a] text-[#1b2316] font-bold px-5 py-2">Find rescue recipes</button>
          <p className="mt-4 text-[#b8c4a0]">Waste avoided: {co2.toFixed(1)} kg CO₂e (estimate, placeholder factors)</p>
        </section>
      )}

      {recipes.length > 0 && !cook && (
        <section className="mt-6 space-y-3">
          {recipes.map((r) => (
            <div key={r.title} className="rounded-xl bg-[#26311f] p-4">
              <h3 className="font-bold">{r.title}</h3>
              <p className="text-sm text-[#b8c4a0]">Uses {r.uses.join(", ")}</p>
              <button onClick={() => go(r, 0)} className="mt-2 rounded-full bg-[#e8b04a] text-[#1b2316] px-4 py-1 font-bold">Start cooking</button>
            </div>
          ))}
        </section>
      )}

      {cook && (
        <section className="mt-6 rounded-2xl bg-[#26311f] p-6">
          <p className="text-sm text-[#b8c4a0]">{cook.r.title}: step {cook.i + 1} of {cook.r.steps.length}</p>
          <p className="text-2xl my-4">{cook.r.steps[cook.i]}</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => speak(cook.r.steps[cook.i])} className="rounded-full border px-4 py-2">Repeat</button>
            <button onClick={ask} className="rounded-full border px-4 py-2">Ask the chef</button>
            {cook.i < cook.r.steps.length - 1
              ? <button onClick={() => go(cook.r, cook.i + 1)} className="rounded-full bg-[#e8b04a] text-[#1b2316] font-bold px-6 py-2">Next step</button>
              : <button onClick={() => setCook(null)} className="rounded-full bg-[#e8b04a] text-[#1b2316] font-bold px-6 py-2">Finish</button>}
          </div>
          {heard && <p className="mt-3 text-sm text-[#b8c4a0]">You asked: {heard}</p>}
        </section>
      )}
    </main>
  );
}
