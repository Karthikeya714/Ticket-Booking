import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { Button, Card, ErrorBanner, Input } from "../components/ui";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Covers every way `user` can become set here — email/password (handled below too, so this
  // is instant rather than waiting a tick) and Google Sign-In, whose callback lives inside
  // GoogleSignInButton and has no direct way to navigate this page itself.
  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-4 sm:mt-8">
      <Card className="p-6 sm:p-8 shadow-xl shadow-violet-200/40">
        <div className="text-center mb-6">
          <div className="grid place-items-center w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 shadow-lg shadow-violet-500/30">
            <svg viewBox="0 0 24 24" className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth="2">
              <path
                d="M4 8.5V7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v1.5a2.5 2.5 0 0 0 0 5V17a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3.5a2.5 2.5 0 0 0 0-5Z"
                strokeLinejoin="round"
              />
              <path d="M14 6.5v11" strokeLinecap="round" strokeDasharray="2 2.5" />
            </svg>
          </div>
          <h1 className="font-display text-2xl font-extrabold text-slate-900">Welcome back</h1>
          <p className="text-sm text-slate-500 mt-1">Log in to book your seats.</p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <ErrorBanner>{error}</ErrorBanner>}
          <Button type="submit" disabled={loading} className="w-full mt-1">
            {loading ? "Logging in..." : "Log in"}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs font-semibold text-slate-400">
          <div className="flex-1 h-px bg-slate-200" />
          OR
          <div className="flex-1 h-px bg-slate-200" />
        </div>
        <div className="flex justify-center">
          <GoogleSignInButton />
        </div>

        <p className="mt-6 text-sm text-slate-600 text-center">
          No account?{" "}
          <Link to="/register" className="font-semibold text-violet-600 hover:text-fuchsia-600 hover:underline">
            Register
          </Link>
        </p>
      </Card>
    </div>
  );
}
