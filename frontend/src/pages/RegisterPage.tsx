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
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-center mb-6">Create an account</h1>

        <div className="grid grid-cols-2 gap-2 mb-4">
          <button
            type="button"
            onClick={() => setRole("customer")}
            className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
              role === "customer"
                ? "bg-indigo-600 border-indigo-600 text-white"
                : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            🎫 Customer
          </button>
          <button
            type="button"
            onClick={() => setRole("organiser")}
            className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
              role === "organiser"
                ? "bg-indigo-600 border-indigo-600 text-white"
                : "bg-white border-gray-300 text-gray-600 hover:bg-gray-50"
            }`}
          >
            🎤 Organiser
          </button>
        </div>
        <p className="text-xs text-gray-400 text-center mb-5">
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

        <div className="my-5 flex items-center gap-3 text-xs text-gray-400">
          <div className="flex-1 h-px bg-gray-200" />
          OR
          <div className="flex-1 h-px bg-gray-200" />
        </div>
        <div className="flex justify-center">
          <GoogleSignInButton role={role} />
        </div>

        <p className="mt-6 text-sm text-gray-600 text-center">
          Already have an account?{" "}
          <Link to="/login" className="text-indigo-600 font-medium hover:underline">
            Log in
          </Link>
        </p>
      </Card>
    </div>
  );
}
