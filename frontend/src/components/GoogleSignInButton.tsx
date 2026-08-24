import { useEffect, useRef, useState } from "react";
import { useAuth, type SelfServeRole } from "../context/AuthContext";

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (resp: { credential: string }) => void }) => void;
          renderButton: (parent: HTMLElement, options: { theme: string; size: string; width?: number }) => void;
        };
      };
    };
  }
}

function loadGsiScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Identity Services"));
    document.head.appendChild(script);
  });
}

// Renders nothing (not even an error) when VITE_GOOGLE_CLIENT_ID isn't set — email+password
// login always works regardless, per the backend's same fallback behavior.
//
// `role` only matters if this Google Sign-In ends up creating a brand-new account (ignored
// when linking to or logging into one that already exists — same rule as the backend). It's
// read from a ref rather than closed over directly: on the Register page this component stays
// mounted while the user toggles the Customer/Organiser picker, and re-running the Google SDK
// initialize()/renderButton() calls on every toggle would re-render the button unnecessarily.
export function GoogleSignInButton({ role = "customer" }: { role?: SelfServeRole }) {
  const { loginWithGoogle } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const roleRef = useRef(role);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    roleRef.current = role;
  }, [role]);

  useEffect(() => {
    if (!CLIENT_ID || !containerRef.current) return;

    let cancelled = false;
    loadGsiScript()
      .then(() => {
        if (cancelled || !window.google || !containerRef.current) return;
        window.google.accounts.id.initialize({
          client_id: CLIENT_ID,
          callback: (resp) => {
            loginWithGoogle(resp.credential, roleRef.current).catch((err) => {
              setError(err instanceof Error ? err.message : "Google sign-in failed");
            });
          },
        });
        window.google.accounts.id.renderButton(containerRef.current, { theme: "outline", size: "large", width: 320 });
      })
      .catch((err) => setError(err.message));

    return () => {
      cancelled = true;
    };
  }, [loginWithGoogle]);

  if (!CLIENT_ID) return null;

  return (
    <div>
      <div ref={containerRef} />
      {error && <p className="text-sm text-rose-600 mt-2 font-medium">{error}</p>}
    </div>
  );
}
