"use client";

import { createContext, useContext, useLayoutEffect, useState, type ReactNode } from "react";

export type MotionPreference = "full" | "reduced" | "off";
const STORAGE_KEY = "fiveo-motion-v1";
const valid = (value: string | null): MotionPreference => value === "off" || value === "reduced" ? value : "full";
const MotionContext = createContext<{ preference: MotionPreference; effective: MotionPreference; setPreference: (value: MotionPreference) => void }>({ preference: "full", effective: "off", setPreference: () => {} });

export function MotionProvider({ children }: { children: ReactNode }) {
  const [preference, setValue] = useState<MotionPreference>("full");
  const [systemReduced, setSystemReduced] = useState(true);
  const [ready, setReady] = useState(false);
  const effective = !ready ? "off" : preference === "full" && systemReduced ? "reduced" : preference;

  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const read = () => {
      try { setValue(valid(localStorage.getItem(STORAGE_KEY))); } catch { /* Device storage is optional. */ }
    };
    const changed = () => setSystemReduced(media.matches);
    const synchronize = (event: StorageEvent) => { if (event.key === STORAGE_KEY || event.key === null) read(); };
    read(); changed(); setReady(true);
    media.addEventListener("change", changed);
    window.addEventListener("storage", synchronize);
    return () => { media.removeEventListener("change", changed); window.removeEventListener("storage", synchronize); };
  }, []);

  useLayoutEffect(() => { document.documentElement.dataset.motion = effective; }, [effective]);
  const setPreference = (value: MotionPreference) => {
    setValue(value);
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* Keep the preference for this visit. */ }
  };
  return <MotionContext.Provider value={{ preference, effective, setPreference }}>{children}</MotionContext.Provider>;
}

export function useMotionPreference() { return useContext(MotionContext); }

export function MotionSettings() {
  const { preference, effective, setPreference } = useMotionPreference();
  return <div className="motion-settings">
    <label className="form-label mb-1 block text-xs font-bold" htmlFor="game-motion">Animations</label>
    <select id="game-motion" className="field py-2" value={preference} onChange={event => setPreference(valid(event.target.value))}>
      <option value="full">Full</option><option value="reduced">Reduced</option><option value="off">Off</option>
    </select>
    <p className="supporting-text mt-1 text-xs">{preference === "full" && effective === "reduced" ? "Your device requests reduced motion. Using gentle fades." : "Saved on this device. Reduced uses gentle fades; Off shows changes immediately."}</p>
  </div>;
}
