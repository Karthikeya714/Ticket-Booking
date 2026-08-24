import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, type SelfServeRole } from "../context/AuthContext";
import { GoogleSignInButton } from "../components/GoogleSignInButton";
import { Button, Card, ErrorBanner, Input } from "../components/ui";

export function RegisterPage() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<SelfServeRole>("customer");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Same as LoginPage: catches Google Sign-In's success too, whose callback has no direct way
  // to navigate this page itself.
  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register(email, password, name, role);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-4 sm:mt-8">
      <Card className="p-6 sm:p-8 shadow-xl shadow-violet-200/40">
        <div className="text-center mb-6">
          <div className="grid place-items-center w-14 h-14 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-2xl shadow-lg shadow-violet-500/30">
            ✨
          </div>
          <h1 className="font-display text-2xl font-extrabold text-slate-900">Create an account</h1>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3 p-1 rounded-xl bg-slate-100">
          <button
            type="button"
            onClick={() => setRole("customer")}
            className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition-all ${
              role === "customer"
                ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-500/30"
                : "text-slate-600 hover:text-violet-700"
            }`}
          >
            🎫 Customer
          </button>
          <button
            type="button"
            onClick={() => setRole("organiser")}
            className={`rounded-lg px-3 py-2.5 text-sm font-semibold transition-all ${
              role === "organiser"
                ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-500/30"
                : "text-slate-600 hover:text-violet-700"
            }`}
          >
            🎤 Organiser
          </button>
        </div>
        <p className="text-xs text-slate-500 text-center mb-5">
          {role === "customer" ? "Browse events and book seats." : "Create events, shows, and view revenue."}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input type="text" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Input
            type="password"
            placeholder="Password (min 8 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
          {error && <ErrorBanner>{error}</ErrorBanner>}
          <Button type="submit" disabled={loading} className="w-full mt-1">
            {loading ? "Creating account..." : `Register as ${role}`}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs font-semibold text-slate-400">
          <div className="flex-1 h-px bg-slate-200" />
          OR
          <div className="flex-1 h-px bg-slate-200" />
        </div>
        <div className="flex justify-center">
          <GoogleSignInButton role={role} />
        </div>

        <p className="mt-6 text-sm text-slate-600 text-center">
          Already have an account?{" "}
          <Link to="/login" className="font-semibold text-violet-600 hover:text-fuchsia-600 hover:underline">
            Log in
          </Link>
        </p>
      </Card>
    </div>
  );
}
