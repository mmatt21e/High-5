"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import styles from "./InstallGame.module.css";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallState = {
  visible: boolean;
  prompting: boolean;
  install: () => void;
};

const InstallContext = createContext<InstallState | null>(null);

// Keep the browser's one-use prompt across navigation from the collection into
// the game. A button mounted only on the game page could miss the event.
export function InstallGameProvider({ children }: { children: ReactNode }) {
  const deferredPrompt = useRef<InstallPromptEvent | null>(null);
  const promptInFlight = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [ready, setReady] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const [platform, setPlatform] = useState<"ios" | "android" | "desktop">("desktop");
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const displayModes = ["standalone", "fullscreen", "minimal-ui"].map((mode) =>
      window.matchMedia(`(display-mode: ${mode})`),
    );
    const updateDisplayMode = () => {
      const inApp = displayModes.some((mode) => mode.matches) ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      setStandalone(inApp);
      if (inApp) dialog.current?.close();
    };
    const onPrompt = (event: Event) => {
      event.preventDefault();
      deferredPrompt.current = event as InstallPromptEvent;
      setInstalled(false);
    };
    const onInstalled = () => {
      deferredPrompt.current = null;
      setInstalled(true);
      dialog.current?.close();
    };

    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    displayModes.forEach((mode) => mode.addEventListener("change", updateDisplayMode));
    updateDisplayMode();
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    setPlatform(ios ? "ios" : /Android/i.test(navigator.userAgent) ? "android" : "desktop");
    setReady(true);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      displayModes.forEach((mode) => mode.removeEventListener("change", updateDisplayMode));
    };
  }, []);

  async function install() {
    if (promptInFlight.current || installed || standalone) return;
    const prompt = deferredPrompt.current;
    if (!prompt) {
      dialog.current?.showModal();
      return;
    }

    // Invoke prompt directly from the tap, before any asynchronous work, and
    // consume this event even if the player dismisses or the browser rejects it.
    deferredPrompt.current = null;
    promptInFlight.current = true;
    setPrompting(true);
    dialog.current?.close();
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
    } catch {
      dialog.current?.showModal();
    } finally {
      promptInFlight.current = false;
      setPrompting(false);
    }
  }

  return (
    <InstallContext.Provider value={{ visible: ready && !standalone && !installed, prompting, install }}>
      {children}
      <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId} aria-describedby={descriptionId}>
        <div className={styles.heading}>
          <h2 id={titleId}>Install Five-O</h2>
          <button type="button" className={styles.close} aria-label="Close install instructions" onClick={() => dialog.current?.close()}>
            ×
          </button>
        </div>
        <p id={descriptionId}>Add Five-O to your home screen to open the game lobby with one tap.</p>
        {platform === "ios" ? (
          <>
            <ol>
              <li>Open this game page in <strong>Safari</strong>.</li>
              <li>Tap <strong>Share</strong> (the square with an up arrow). You may need to tap <strong>More (…)</strong> first.</li>
              <li>Choose <strong>Add to Home Screen</strong>.</li>
              <li>Leave <strong>Open as Web App</strong> on if shown, then tap <strong>Add</strong>.</li>
            </ol>
            <p className={styles.note}>If Add to Home Screen is missing, scroll down in the Share menu and tap Edit Actions to add it.</p>
          </>
        ) : platform === "android" ? (
          <>
            <ol>
              <li>Open this game page in <strong>Chrome</strong>.</li>
              <li>Open the browser menu <strong>(⋮)</strong>.</li>
              <li>Choose <strong>Install app</strong> or <strong>Add to Home screen</strong>, then confirm.</li>
            </ol>
            <p className={styles.note}>If you opened the game inside another app, open it in Chrome first. If Five-O is already installed, look for its icon on your phone.</p>
          </>
        ) : (
          <>
            <p>In Chrome or Edge, look for the install icon in the address bar or the browser menu. On a Mac using Safari, choose <strong>File → Add to Dock</strong>.</p>
            <p className={styles.note}>If installation is unavailable, bookmark this game page or open it in Safari on an iPhone or Chrome on an Android phone.</p>
          </>
        )}
        <p className={styles.note}>An internet connection is needed to play.</p>
        <button type="button" className="btn-primary w-full" onClick={() => dialog.current?.close()}>Got it</button>
      </dialog>
    </InstallContext.Provider>
  );
}

export function InstallGameButton({ className = "" }: { className?: string }) {
  const install = useContext(InstallContext);
  if (!install?.visible) return null;

  return (
    <button type="button" className={`btn-outline ${styles.button} ${className}`} onClick={install.install} disabled={install.prompting}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4" />
      </svg>
      {install.prompting ? "Installing…" : "Install Five-O"}
    </button>
  );
}
