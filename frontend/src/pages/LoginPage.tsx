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
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-center mb-6">Welcome back</h1>
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

        <div className="my-5 flex items-center gap-3 text-xs text-gray-400">
          <div className="flex-1 h-px bg-gray-200" />
          OR
          <div className="flex-1 h-px bg-gray-200" />
        </div>
        <div className="flex justify-center">
          <GoogleSignInButton />
        </div>

        <p className="mt-6 text-sm text-gray-600 text-center">
          No account?{" "}
          <Link to="/register" className="text-indigo-600 font-medium hover:underline">
            Register
          </Link>
        </p>
      </Card>
    </div>
  );
}
