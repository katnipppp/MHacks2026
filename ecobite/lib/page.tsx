"use client";

import { useEffect, useRef, useState } from "react";

// ---------- Types ----------

type ItemStatus = "pending" | "used" | "shared" | "wasted";

type ScanItem = {
  name: string;
  qty?: number;
  unit?: string;
  category?: string;
  estShelfDays?: number;
  estWeightKg?: number;
  status: ItemStatus;
  id: string;
};

type Recipe = {
  title: string;
  uses: string[];
  steps: string[];
};

type Profile = {
  name: string;
  email: string;
  photoDataUrl: string | null;
  swatch: string;
  notifPush: boolean;
  notifWeekly: boolean;
  diet: string;
};

// ---------- Placeholders (flagged per the handoff notes — replace before demoing) ----------

// TODO: replace with a cited emissions-factor dataset before presenting.
const PLACEHOLDER_CO2E_FACTOR_KG_PER_KG = 2.5;
// TODO: replace with a real grocery-price estimate.
const PLACEHOLDER_DOLLAR_PER_KG = 5;

const SWATCHES = ["#e6d7bd", "#b8dce4", "#dcebed", "#c9d7c0", "#e8c8c3"];

// ---------- Helpers ----------

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function emojiForCategory(category?: string) {
  const c = (category || "").toLowerCase();
  if (c.includes("leaf") || c.includes("green") || c.includes("veg")) return "🥬";
  if (c.includes("fruit") || c.includes("berry")) return "🍓";
  if (c.includes("dairy") || c.includes("milk") || c.includes("cheese")) return "🧀";
  if (c.includes("meat") || c.includes("poultry") || c.includes("chicken") || c.includes("fish")) return "🍗";
  if (c.includes("grain") || c.includes("bread") || c.includes("pasta")) return "🍞";
  return "🥡";
}

function fileToBase64(file: File): Promise<{ base64: string; mime: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] || "";
      resolve({ base64, mime: file.type || "image/jpeg" });
    };
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.readAsDataURL(file);
  });
}

function resizeImageSquare(dataUrl: string, size = 160): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ---------- Component ----------

export default function Page() {
  const [tab, setTab] = useState<"camera" | "recipes" | "impact">("camera");

  // --- Scan ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [items, setItems] = useState<ScanItem[]>([]);

  // --- Recipes ---
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [recipesError, setRecipesError] = useState("");

  // --- Cook mode ---
  const [cooking, setCooking] = useState<Recipe | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [speaking, setSpeaking] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // --- Ask the chef ---
  const [question, setQuestion] = useState("");
  const [chefAnswer, setChefAnswer] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const recognitionRef = useRef<any>(null);

  // --- Impact ---
  const [mealsMade, setMealsMade] = useState(0);

  // --- Settings (plain React state — no backend, no persistence, per current architecture) ---
  const [profile, setProfile] = useState<Profile>({
    name: "Emma Castillo",
    email: "[email protected]",
    photoDataUrl: null,
    swatch: SWATCHES[0],
    notifPush: true,
    notifWeekly: true,
    diet: "No restrictions",
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(text: string, error = false) {
    setToast({ text, error });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2400);
  }

  // ---------- Speech recognition setup (Chrome only; everything else falls back to typing) ----------

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setVoiceSupported(false);
      return;
    }
    setVoiceSupported(true);
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (e: any) => {
      const transcript = e.results?.[0]?.[0]?.transcript || "";
      setQuestion(transcript);
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);
    recognitionRef.current = recognition;
  }, []);

  function startListening() {
    if (!recognitionRef.current) {
      showToast("Voice input isn't supported in this browser — type your question instead.", true);
      return;
    }
    setListening(true);
    try {
      recognitionRef.current.start();
    } catch {
      setListening(false);
    }
  }

  // ---------- Scan ----------

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanning(true);
    setScanError("");

    try {
      const { base64, mime } = await fileToBase64(file);
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mime }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error) {
        throw new Error(data.error || `Scan failed (status ${res.status})`);
      }

      const scanned: ScanItem[] = (data.items || []).map((it: any) => ({
        name: it.name ?? "Unknown item",
        qty: it.qty,
        unit: it.unit,
        category: it.category,
        estShelfDays: it.estShelfDays,
        estWeightKg: it.estWeightKg,
        status: "pending" as ItemStatus,
        id: uid(),
      }));

      if (!scanned.length) {
        setScanError("No items were recognized in that photo — try a clearer shot.");
      } else {
        setItems((prev) => [...scanned, ...prev]);
        showToast(`Added ${scanned.length} item${scanned.length === 1 ? "" : "s"}`);
      }
    } catch (err: any) {
      setScanError(String(err?.message || err));
    } finally {
      setScanning(false);
      e.target.value = "";
    }
  }

  // ---------- Recipes ----------

  async function findRecipes() {
    const pending = items.filter((i) => i.status === "pending");
    if (!pending.length) {
      setRecipesError("Scan some food first — there's nothing to cook with yet.");
      setTab("recipes");
      return;
    }

    setRecipesLoading(true);
    setRecipesError("");

    try {
      const res = await fetch("/api/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: pending }),
      });
      const data = await res.json().catch(() => ({}));

      if (data.error) {
        setRecipesError(`Recipes failed: ${String(data.error).slice(0, 200)} (try again in a few seconds)`);
        setRecipes([]);
      } else {
        setRecipes(data.recipes || []);
      }
    } catch (err: any) {
      setRecipesError(`Recipes failed: ${String(err?.message || err)}`);
    } finally {
      setRecipesLoading(false);
      setTab("recipes");
    }
  }

  // ---------- Voice playback ----------

  async function speak(text: string) {
    try {
      setSpeaking(true);
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Voice failed (status ${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      if (audioRef.current) {
        audioRef.current.src = url;
        await audioRef.current.play();
      }
    } catch (err) {
      console.error("VOICE ERROR:", err);
      showToast("Voice playback failed — check ELEVENLABS_API_KEY and restart the dev server.", true);
    } finally {
      setSpeaking(false);
    }
  }

  // ---------- Cook mode ----------

  function startCooking(recipe: Recipe) {
    setCooking(recipe);
    setStepIndex(0);
    setChefAnswer("");
    setQuestion("");
    if (recipe.steps[0]) speak(recipe.steps[0]);
  }

  function repeatStep() {
    if (!cooking) return;
    speak(cooking.steps[stepIndex]);
  }

  function nextStep() {
    if (!cooking) return;
    const next = stepIndex + 1;

    if (next >= cooking.steps.length) {
      setMealsMade((m) => m + 1);
      setItems((prev) =>
        prev.map((it) =>
          cooking.uses.includes(it.name) && it.status === "pending" ? { ...it, status: "used" } : it
        )
      );
      showToast("Nice — meal logged and ingredients marked used.");
      setCooking(null);
      return;
    }

    setStepIndex(next);
    setChefAnswer("");
    speak(cooking.steps[next]);
  }

  function exitCooking() {
    setCooking(null);
    setChefAnswer("");
    setQuestion("");
  }

  async function askChef() {
    if (!cooking || !question.trim()) return;
    const q = question.trim();
    setQuestion("");
    setChefAnswer("Thinking…");

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, step: cooking.steps[stepIndex], title: cooking.title }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || data.error) {
        throw new Error(data.error || `Ask failed (status ${res.status})`);
      }

      setChefAnswer(data.answer || "");
      if (data.answer) speak(data.answer);
    } catch (err: any) {
      setChefAnswer(`Couldn't reach the chef: ${String(err?.message || err)}`);
    }
  }

  // ---------- Item status actions ----------

  function setItemStatus(id: string, status: ItemStatus) {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, status } : it)));
  }

  // ---------- Settings / avatar ----------

  async function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const { base64, mime } = await fileToBase64(file);
    const resized = await resizeImageSquare(`data:${mime};base64,${base64}`);
    setProfile((p) => ({ ...p, photoDataUrl: resized }));
    showToast("Photo updated");
  }

  function removePhoto() {
    setProfile((p) => ({ ...p, photoDataUrl: null }));
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  // ---------- Derived impact numbers (placeholders — see TODOs above) ----------

  const rescued = items.filter((i) => i.status === "used" || i.status === "shared");
  const totalWeightKg = rescued.reduce((sum, i) => sum + (i.estWeightKg || 0), 0);
  const co2eAvoidedKg = totalWeightKg * PLACEHOLDER_CO2E_FACTOR_KG_PER_KG;
  const dollarsSaved = totalWeightKg * PLACEHOLDER_DOLLAR_PER_KG;

  const avatarInitial = (profile.name.trim()[0] || "E").toUpperCase();
  const pendingItems = items.filter((i) => i.status === "pending");

  return (
    <div className="app">
      <audio ref={audioRef} style={{ display: "none" }} />

      {/* HEADER */}
      <header className="header">
        <div className="logo">
          <img className="logo-mark" src="/icon.svg" alt="" />
          EcoBite
        </div>

        <button
          className="profile"
          onClick={() => setSettingsOpen(true)}
          aria-label="Open profile and settings"
          title="Settings"
        >
          <span className="profile-inner" style={{ background: profile.photoDataUrl ? "transparent" : profile.swatch }}>
            {profile.photoDataUrl ? <img src={profile.photoDataUrl} alt="Profile photo" /> : avatarInitial}
          </span>
          <span className="profile-badge" aria-hidden="true">⚙</span>
        </button>
      </header>

      {/* TABS */}
      <div className="tabs">
        <button className={`tab ${tab === "camera" ? "active" : ""}`} onClick={() => setTab("camera")}>
          Scan Food
        </button>
        <button className={`tab ${tab === "recipes" ? "active" : ""}`} onClick={() => setTab("recipes")}>
          Recipes
        </button>
      </div>

      {/* CAMERA PAGE */}
      {tab === "camera" && (
        <main className="page active">
          <div className="intro">
            <h1>What's in your kitchen?</h1>
            <p>Scan a receipt or snap a photo of your fridge. We'll help you use what you already have before it goes to waste.</p>
          </div>

          <div className="camera-card">
            <div className="camera-circle">📷</div>
            <h2>{scanning ? "Scanning…" : "Scan your groceries"}</h2>
            <p>Take a photo of your receipt or food shelf</p>
            <button
              className="scan-button"
              disabled={scanning}
              onClick={() => fileInputRef.current?.click()}
            >
              {scanning ? "Scanning…" : "Open Camera"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={handlePhotoChange}
            />
          </div>

          {scanError && <div className="error-banner">{scanError}</div>}

          <div className="section-title">
            <h2>Use soon</h2>
            <span>{items.length} item{items.length === 1 ? "" : "s"}</span>
          </div>

          {items.length === 0 ? (
            <p className="empty-hint">Nothing scanned yet — your items will show up here.</p>
          ) : (
            <div className="food-list">
              {items.map((item) => (
                <div className={`food-card ${item.status !== "pending" ? "food-card-done" : ""}`} key={item.id}>
                  <div className="food-card-top">
                    <div className="food-icon">{emojiForCategory(item.category)}</div>
                    <div>
                      <div className="food-name">{item.name}</div>
                      <div className="food-expiry">
                        {typeof item.estShelfDays === "number"
                          ? item.estShelfDays <= 0
                            ? "Use today"
                            : `${item.estShelfDays} day${item.estShelfDays === 1 ? "" : "s"} left`
                          : "Shelf life unknown"}
                      </div>
                    </div>
                  </div>

                  {item.status === "pending" ? (
                    <div className="food-actions">
                      <button onClick={() => setItemStatus(item.id, "used")}>Used</button>
                      <button onClick={() => setItemStatus(item.id, "shared")}>Shared</button>
                      <button onClick={() => setItemStatus(item.id, "wasted")}>Wasted</button>
                    </div>
                  ) : (
                    <div className="food-status-tag">{item.status}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {pendingItems.length > 0 && (
            <button className="recipe-cta" onClick={findRecipes} disabled={recipesLoading}>
              {recipesLoading ? "Finding recipes…" : "Find rescue recipes →"}
            </button>
          )}
        </main>
      )}

      {/* RECIPES PAGE */}
      {tab === "recipes" && (
        <main className="page active">
          <div className="recipe-heading">
            <h1>Recipes to rescue</h1>
            <p>Meals built around the food you need to use first.</p>
          </div>

          {recipesError && <div className="error-banner">{recipesError}</div>}

          {!recipesError && pendingItems.length > 0 && (
            <div className="rescue-banner">
              <div className="rescue-icon">⚠️</div>
              <div>
                <strong>{pendingItems.length} ingredient{pendingItems.length === 1 ? "" : "s"} need attention</strong>
                <span>These recipes prioritize your most perishable food.</span>
              </div>
            </div>
          )}

          {recipesLoading && <p className="empty-hint">Asking the chef for ideas…</p>}

          {!recipesLoading && recipes.length === 0 && !recipesError && (
            <p className="empty-hint">No recipes yet — scan some food, then tap "Find rescue recipes."</p>
          )}

          {recipes.map((recipe, i) => (
            <div className="recipe-card" key={i}>
              <div className="recipe-image">🍲</div>
              <div className="recipe-content">
                <span className="recipe-tag">USES {recipe.uses.length} INGREDIENT{recipe.uses.length === 1 ? "" : "S"}</span>
                <h2>{recipe.title}</h2>
                <div className="ingredients">
                  {recipe.uses.map((u, j) => (
                    <span className="ingredient" key={j}>{u}</span>
                  ))}
                </div>
                <button className="recipe-button" onClick={() => startCooking(recipe)}>
                  Start Cooking →
                </button>
              </div>
            </div>
          ))}
        </main>
      )}

      {/* IMPACT PAGE */}
      {tab === "impact" && (
        <main className="page active">
          <div className="impact-heading">
            <h1>Your impact</h1>
            <p>A running total of what you've rescued so far.</p>
          </div>

          <div className="impact-card">
            <h2>🌱 This session</h2>
            <div className="impact-stats">
              <div className="stat">
                <strong>{totalWeightKg.toFixed(1)} kg</strong>
                <span>food rescued</span>
              </div>
              <div className="stat">
                <strong>${dollarsSaved.toFixed(0)}</strong>
                <span>saved*</span>
              </div>
              <div className="stat">
                <strong>{mealsMade}</strong>
                <span>meals made</span>
              </div>
            </div>
          </div>

          <div className="impact-card">
            <h2>CO₂e avoided</h2>
            <div className="impact-stats">
              <div className="stat" style={{ flex: 1 }}>
                <strong>{co2eAvoidedKg.toFixed(1)} kg CO₂e*</strong>
                <span>estimated</span>
              </div>
            </div>
          </div>

          <p className="placeholder-note">
            * Estimates use placeholder factors ({PLACEHOLDER_CO2E_FACTOR_KG_PER_KG} kg CO₂e/kg,
            ${PLACEHOLDER_DOLLAR_PER_KG}/kg) — swap in a cited dataset before presenting.
          </p>
        </main>
      )}

      {/* BOTTOM NAV */}
      <nav className="bottom-nav">
        <button className={`nav-item ${tab === "camera" ? "active" : ""}`} onClick={() => setTab("camera")}>
          <span>📷</span>
          Scan
        </button>
        <button className={`nav-item ${tab === "recipes" ? "active" : ""}`} onClick={() => setTab("recipes")}>
          <span>🍽️</span>
          Recipes
        </button>
        <button className={`nav-item ${tab === "impact" ? "active" : ""}`} onClick={() => setTab("impact")}>
          <span>🌱</span>
          Impact
        </button>
      </nav>

      {/* COOK MODE OVERLAY */}
      {cooking && (
        <div className="cook-overlay">
          <div className="cook-panel">
            <div className="cook-head">
              <h2>{cooking.title}</h2>
              <button className="settings-close" onClick={exitCooking} aria-label="Exit cook mode">✕</button>
            </div>

            <div className="cook-step-count">
              Step {stepIndex + 1} of {cooking.steps.length}
            </div>

            <p className="cook-step-text">{cooking.steps[stepIndex]}</p>

            <div className="cook-buttons">
              <button onClick={repeatStep} disabled={speaking}>🔁 Repeat</button>
              <button onClick={nextStep} className="cook-next">
                {stepIndex + 1 >= cooking.steps.length ? "Finish →" : "Next step →"}
              </button>
            </div>

            <div className="chef-box">
              <div className="chef-row">
                <input
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask the chef a question…"
                  onKeyDown={(e) => e.key === "Enter" && askChef()}
                />
                {voiceSupported && (
                  <button
                    className={`mic-button ${listening ? "listening" : ""}`}
                    onClick={startListening}
                    aria-label="Ask by voice"
                  >
                    🎤
                  </button>
                )}
                <button onClick={askChef} disabled={!question.trim()}>Ask</button>
              </div>
              {chefAnswer && <p className="chef-answer">{chefAnswer}</p>}
            </div>
          </div>
        </div>
      )}

      {/* SETTINGS OVERLAY */}
      {settingsOpen && (
        <div className="settings-overlay open" onClick={() => setSettingsOpen(false)}>
          <div className="settings-panel" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="settings-grip" />
            <div className="settings-head">
              <h1>Profile &amp; settings</h1>
              <button className="settings-close" onClick={() => setSettingsOpen(false)} aria-label="Close settings">✕</button>
            </div>

            <div className="avatar-section">
              <div className="avatar-big" style={{ background: profile.photoDataUrl ? "transparent" : profile.swatch }}>
                {profile.photoDataUrl ? <img src={profile.photoDataUrl} alt="Profile" /> : avatarInitial}
              </div>
              <div className="avatar-controls">
                <h2>Profile photo</h2>
                <div className="avatar-buttons">
                  <button onClick={() => photoInputRef.current?.click()}>Upload photo</button>
                  <button onClick={removePhoto}>Remove</button>
                </div>
                <input ref={photoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handlePhotoUpload} />
                <div className="avatar-swatches">
                  {SWATCHES.map((color) => (
                    <div
                      key={color}
                      className={`swatch ${profile.swatch === color ? "selected" : ""}`}
                      style={{ background: color }}
                      onClick={() => setProfile((p) => ({ ...p, swatch: color, photoDataUrl: null }))}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="settings-section">
              <h3>Account</h3>
              <div className="field">
                <label>Display name</label>
                <input value={profile.name} onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div className="field">
                <label>Email</label>
                <input value={profile.email} onChange={(e) => setProfile((p) => ({ ...p, email: e.target.value }))} />
              </div>
            </div>

            <div className="settings-section">
              <h3>Preferences</h3>
              <div className="toggle-row">
                <div className="toggle-text">
                  <strong>Push notifications</strong>
                  <span>Alerts when food is about to expire</span>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={profile.notifPush}
                    onChange={(e) => setProfile((p) => ({ ...p, notifPush: e.target.checked }))}
                  />
                  <span className="switch-track" />
                </label>
              </div>
              <div className="toggle-row">
                <div className="toggle-text">
                  <strong>Weekly impact email</strong>
                  <span>A summary of what you rescued</span>
                </div>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={profile.notifWeekly}
                    onChange={(e) => setProfile((p) => ({ ...p, notifWeekly: e.target.checked }))}
                  />
                  <span className="switch-track" />
                </label>
              </div>
              <div className="field" style={{ marginTop: 14 }}>
                <label>Dietary preference</label>
                <select value={profile.diet} onChange={(e) => setProfile((p) => ({ ...p, diet: e.target.value }))}>
                  <option>No restrictions</option>
                  <option>Vegetarian</option>
                  <option>Vegan</option>
                  <option>Gluten-free</option>
                </select>
              </div>
            </div>

            <div className="save-row">
              <button className="save-button" onClick={() => { setSettingsOpen(false); showToast("Settings saved"); }}>
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={`toast show ${toast.error ? "error" : ""}`}>{toast.text}</div>}

      <style jsx global>{`
        :root {
          --cream: #fdfbf6;
          --cream-dim: #f7f4ec;
          --ink: #263746;
          --ink-soft: #29495c;
          --teal: #3e7085;
          --teal-pale: #dceef1;
          --teal-paler: #eaf5f6;
          --sand: #e6d7bd;
          --sand-pale: #f3eee3;
          --sand-paler: #f5f1e8;
          --muted: #8299a2;
          --muted-dim: #91a0a5;
          --line: #ece8df;
          --danger: #b85c4a;
        }
        html, body { background: var(--cream-dim); color: var(--ink); font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif; }
        button, input, select { font-family: inherit; }
        button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--teal); outline-offset: 2px; }

        .app { max-width: 430px; min-height: 100vh; margin: 0 auto; background: var(--cream); position: relative; padding-bottom: 100px; }
        .header { padding: 28px 24px 18px; display: flex; justify-content: space-between; align-items: center; }
        .logo { display: flex; align-items: center; gap: 9px; font-size: 22px; font-weight: 750; color: var(--ink-soft); }
        .logo-mark { width: 44px; height: 44px; border-radius: 13px; display: block; flex: none; box-shadow: 0 1px 2px rgba(38, 55, 70, 0.08), 0 0 0 1px rgba(38, 55, 70, 0.08); }

        .profile { width: 40px; height: 40px; border-radius: 50%; background: transparent; display: flex; align-items: center; justify-content: center; cursor: pointer; border: none; padding: 0; position: relative; }
        .profile-inner { width: 100%; height: 100%; border-radius: 50%; color: #53616a; font-weight: 700; font-size: 14px; overflow: hidden; display: flex; align-items: center; justify-content: center; box-shadow: 0 0 0 2px var(--cream); }
        .profile-inner img { width: 100%; height: 100%; object-fit: cover; }
        .profile-badge { position: absolute; bottom: -2px; right: -2px; width: 18px; height: 18px; border-radius: 50%; background: var(--teal); color: #fff; font-size: 9px; display: flex; align-items: center; justify-content: center; border: 2px solid var(--cream); }

        .tabs { display: flex; gap: 8px; padding: 0 24px; margin-bottom: 24px; }
        .tab { border: none; padding: 11px 19px; border-radius: 24px; background: transparent; color: var(--muted-dim); font-size: 14px; font-weight: 650; cursor: pointer; }
        .tab.active { background: var(--teal-pale); color: #31566a; }

        .page { padding: 0 24px; }
        .intro h1, .recipe-heading h1, .impact-heading h1 { font-size: 29px; line-height: 1.15; color: var(--ink-soft); margin-bottom: 8px; letter-spacing: -0.7px; }
        .intro p, .recipe-heading p, .impact-heading p { font-size: 14px; line-height: 1.55; color: var(--muted-dim); max-width: 330px; }

        .camera-card { margin-top: 22px; padding: 28px 20px; border-radius: 28px; background: var(--teal-paler); border: 1.5px dashed #a8ccd3; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
        .camera-circle { width: 76px; height: 76px; border-radius: 50%; background: #c8e5e9; display: flex; align-items: center; justify-content: center; font-size: 32px; margin-bottom: 18px; }
        .camera-card h2 { font-size: 18px; color: #385b6c; margin-bottom: 7px; }
        .camera-card p { font-size: 13px; color: var(--muted); margin-bottom: 20px; }
        .scan-button { border: none; background: var(--teal); color: #fff; padding: 13px 24px; border-radius: 22px; font-weight: 650; cursor: pointer; }
        .scan-button:disabled { opacity: 0.7; cursor: wait; }

        .error-banner { margin-top: 16px; padding: 14px 16px; border-radius: 16px; background: #fbeae6; color: var(--danger); font-size: 13px; line-height: 1.5; }
        .empty-hint { font-size: 13px; color: var(--muted-dim); margin-top: 10px; }
        .placeholder-note { font-size: 11px; color: var(--muted-dim); margin-top: 10px; line-height: 1.5; }

        .section-title { display: flex; justify-content: space-between; align-items: center; margin: 28px 0 13px; }
        .section-title h2 { font-size: 17px; color: #385463; }
        .section-title span { font-size: 12px; color: var(--muted-dim); }

        .food-list { display: flex; flex-direction: column; gap: 10px; }
        .food-card { padding: 14px; border-radius: 18px; background: var(--sand-pale); }
        .food-card-done { opacity: 0.6; }
        .food-card-top { display: flex; gap: 12px; align-items: center; }
        .food-icon { font-size: 25px; }
        .food-name { font-size: 13px; font-weight: 700; color: #465862; }
        .food-expiry { font-size: 11px; color: #a27f63; }
        .food-actions { display: flex; gap: 6px; margin-top: 10px; }
        .food-actions button { flex: 1; border: 1px solid var(--line); background: #fff; padding: 7px 0; border-radius: 10px; font-size: 11px; font-weight: 650; color: var(--ink-soft); cursor: pointer; }
        .food-actions button:hover { background: var(--teal-pale); }
        .food-status-tag { margin-top: 8px; font-size: 11px; text-transform: capitalize; color: var(--muted-dim); }

        .recipe-cta { width: 100%; margin-top: 20px; border: none; padding: 14px; border-radius: 16px; background: var(--teal); color: #fff; font-weight: 650; cursor: pointer; }
        .recipe-cta:disabled { opacity: 0.7; cursor: wait; }

        .rescue-banner { background: var(--teal-pale); border-radius: 20px; padding: 17px; margin-bottom: 20px; display: flex; gap: 12px; align-items: center; }
        .rescue-icon { font-size: 26px; }
        .rescue-banner strong { display: block; color: #35596b; font-size: 14px; margin-bottom: 3px; }
        .rescue-banner span { color: #708993; font-size: 12px; }

        .recipe-card { background: #fff; border-radius: 25px; overflow: hidden; margin-bottom: 18px; box-shadow: 0 8px 25px rgba(54,76,86,0.07); border: 1px solid var(--line); }
        .recipe-image { height: 120px; background: linear-gradient(135deg, #dcebed, #efe5d2); display: flex; align-items: center; justify-content: center; font-size: 56px; }
        .recipe-content { padding: 18px; }
        .recipe-tag { display: inline-block; background: #edf4e8; color: #69815d; padding: 5px 9px; border-radius: 12px; font-size: 10px; font-weight: 700; margin-bottom: 9px; }
        .recipe-content h2 { font-size: 19px; color: #354e5b; margin-bottom: 10px; }
        .ingredients { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 15px; }
        .ingredient { background: var(--sand-paler); padding: 6px 9px; border-radius: 10px; font-size: 11px; color: #66736f; }
        .recipe-button { width: 100%; border: none; padding: 12px; border-radius: 15px; background: var(--teal); color: #fff; font-weight: 650; cursor: pointer; }

        .impact-card { background: var(--sand-pale); border-radius: 23px; padding: 20px; margin-bottom: 18px; }
        .impact-card h2 { font-size: 16px; color: #4a5f62; margin-bottom: 14px; }
        .impact-stats { display: flex; justify-content: space-between; text-align: center; }
        .stat strong { display: block; font-size: 21px; color: var(--ink-soft); margin-bottom: 3px; }
        .stat span { font-size: 10px; color: #87938f; }

        .bottom-nav { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 430px; height: 76px; background: rgba(253,251,246,0.96); border-top: 1px solid var(--line); display: flex; justify-content: space-around; align-items: center; backdrop-filter: blur(10px); }
        .nav-item { border: none; background: transparent; color: #9aa5a7; font-size: 11px; cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 5px; }
        .nav-item span { font-size: 21px; }
        .nav-item.active { color: var(--teal); font-weight: 700; }

        .settings-overlay, .cook-overlay { position: fixed; inset: 0; background: rgba(38,55,70,0.32); display: flex; align-items: flex-end; justify-content: center; z-index: 50; }
        .settings-panel, .cook-panel { width: 100%; max-width: 430px; max-height: 86vh; background: var(--cream); border-radius: 28px 28px 0 0; padding: 10px 24px 28px; overflow-y: auto; }
        .settings-grip { width: 40px; height: 4px; border-radius: 3px; background: var(--line); margin: 10px auto 18px; }
        .settings-head, .cook-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
        .settings-head h1, .cook-head h2 { font-size: 22px; color: var(--ink-soft); letter-spacing: -0.4px; }
        .settings-close { width: 32px; height: 32px; border-radius: 50%; border: none; background: var(--sand-pale); color: var(--ink-soft); cursor: pointer; font-size: 15px; }

        .avatar-section { display: flex; align-items: center; gap: 16px; margin-bottom: 26px; }
        .avatar-big { width: 72px; height: 72px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 26px; font-weight: 700; color: #53616a; overflow: hidden; flex-shrink: 0; }
        .avatar-big img { width: 100%; height: 100%; object-fit: cover; }
        .avatar-controls h2 { font-size: 15px; color: #385463; margin-bottom: 8px; }
        .avatar-buttons { display: flex; gap: 8px; }
        .avatar-buttons button { border: 1px solid var(--line); background: #fff; color: var(--ink-soft); font-size: 12px; font-weight: 650; padding: 8px 12px; border-radius: 14px; cursor: pointer; }
        .avatar-swatches { display: flex; gap: 8px; margin-top: 10px; }
        .swatch { width: 22px; height: 22px; border-radius: 50%; cursor: pointer; border: 2px solid transparent; }
        .swatch.selected { border-color: var(--ink-soft); }

        .settings-section { margin-bottom: 24px; }
        .settings-section h3 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; color: var(--muted-dim); margin-bottom: 10px; font-weight: 700; }
        .field { margin-bottom: 12px; }
        .field label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; font-weight: 650; }
        .field input, .field select { width: 100%; padding: 12px 14px; border-radius: 14px; border: 1px solid var(--line); background: #fff; font-size: 14px; color: var(--ink); outline: none; }

        .toggle-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--line); }
        .toggle-row:last-child { border-bottom: none; }
        .toggle-text strong { display: block; font-size: 13.5px; color: var(--ink-soft); }
        .toggle-text span { font-size: 11.5px; color: var(--muted-dim); }
        .switch { position: relative; width: 42px; height: 24px; flex-shrink: 0; }
        .switch input { opacity: 0; width: 0; height: 0; }
        .switch-track { position: absolute; inset: 0; background: #dfe3df; border-radius: 14px; cursor: pointer; }
        .switch-track::before { content: ""; position: absolute; width: 18px; height: 18px; left: 3px; top: 3px; background: #fff; border-radius: 50%; transition: transform .2s ease; box-shadow: 0 1px 3px rgba(0,0,0,.2); }
        .switch input:checked + .switch-track { background: var(--teal); }
        .switch input:checked + .switch-track::before { transform: translateX(18px); }

        .save-row { margin-top: 6px; }
        .save-button { width: 100%; border: none; padding: 14px; border-radius: 16px; background: var(--teal); color: #fff; font-weight: 650; cursor: pointer; font-size: 14px; }

        .cook-step-count { font-size: 12px; color: var(--muted-dim); margin-bottom: 8px; }
        .cook-step-text { font-size: 18px; line-height: 1.5; color: var(--ink-soft); margin-bottom: 18px; }
        .cook-buttons { display: flex; gap: 10px; margin-bottom: 20px; }
        .cook-buttons button { flex: 1; border: 1px solid var(--line); background: #fff; padding: 12px; border-radius: 14px; font-weight: 650; cursor: pointer; color: var(--ink-soft); }
        .cook-buttons .cook-next { background: var(--teal); color: #fff; border: none; }

        .chef-box { background: var(--sand-pale); border-radius: 18px; padding: 14px; }
        .chef-row { display: flex; gap: 6px; }
        .chef-row input { flex: 1; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--line); font-size: 13px; }
        .chef-row button { border: none; background: var(--teal); color: #fff; padding: 0 14px; border-radius: 12px; font-size: 13px; font-weight: 650; cursor: pointer; }
        .mic-button { background: #fff !important; color: var(--ink-soft) !important; border: 1px solid var(--line) !important; }
        .mic-button.listening { background: #fbeae6 !important; }
        .chef-answer { margin-top: 10px; font-size: 13px; color: #465862; line-height: 1.5; }

        .toast { position: fixed; left: 50%; bottom: 100px; transform: translateX(-50%); background: var(--ink-soft); color: #fff; padding: 12px 20px; border-radius: 20px; font-size: 13px; font-weight: 600; z-index: 70; white-space: nowrap; }
        .toast.error { background: var(--danger); }

        @media (min-width: 600px) {
          body { padding: 30px 0; }
          .app { border-radius: 32px; box-shadow: 0 15px 50px rgba(50,70,80,0.12); min-height: 850px; }
          .bottom-nav { position: absolute; border-radius: 0 0 32px 32px; }
          .settings-overlay, .cook-overlay { align-items: center; }
          .settings-panel, .cook-panel { border-radius: 28px; max-height: 80vh; }
        }
      `}</style>
    </div>
  );
}
