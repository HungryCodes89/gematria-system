"use client";

import { useState } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.href = "/";
      } else {
        toast.error("Invalid password");
        setShake(true);
        setTimeout(() => setShake(false), 500);
        setPassword("");
      }
    } catch {
      toast.error("Connection failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div
        className={`card max-w-sm w-full mx-4 text-center ${
          shake ? "animate-[shake_0.5s_ease-in-out]" : ""
        }`}
      >
        <div className="mb-6">
          <h1 className="text-2xl font-bold tracking-[0.3em] uppercase text-accent mb-1">
            GEMATRIA
          </h1>
          <p className="text-xs text-muted tracking-wider uppercase">
            Cipher Betting System
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <KeyRound
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              autoFocus
              className="w-full bg-bg border border-border rounded-lg pl-10 pr-4 py-3 text-sm text-text placeholder:text-muted/50 focus:outline-none focus:border-accent/50 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !password}
            className="w-full bg-accent/20 hover:bg-accent/30 border border-accent/30 text-accent font-medium text-sm py-3 rounded-lg transition-colors disabled:opacity-40"
          >
            {loading ? "Checking..." : "Enter"}
          </button>
        </form>
      </div>
    </div>
  );
}
