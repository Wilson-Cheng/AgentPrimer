'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import Button from '@/components/ui/Button';
import BrandLogo from '@/components/BrandLogo';
import { Suspense } from 'react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get('from') ?? '/chat';

  // Redirect to registration if first-time setup has not been done
  useEffect(() => {
    fetch('/api/auth/setup')
      .then((r) => r.json())
      .then(({ needsSetup }) => {
        if (needsSetup) router.replace('/register');
      })
      .catch(() => {});
  }, [router]);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Login failed');
        return;
      }

      router.push(from);
    } catch {
      setError('Network error – please try again');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white flex overflow-hidden">
      {/* Left panel – blue color block with geometric decorations */}
      <div className="hidden lg:flex lg:w-1/2 bg-blue-500 relative flex-col justify-between p-12 overflow-hidden">
        {/* Geometric decorations */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full translate-x-1/3 -translate-y-1/3" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rotate-45 -translate-x-1/4 translate-y-1/4" />
        <div className="absolute top-1/2 left-1/2 w-48 h-48 bg-blue-400/30 rounded-full -translate-x-1/2 -translate-y-1/2" />

        {/* Brand */}
        <div className="relative z-10 flex items-center gap-2">
          <div className="h-10 w-10 min-w-10 rounded-full bg-white/20 flex items-center justify-center shadow-md">
            <BrandLogo variant="full" className="w-full h-full" priority />
          </div>
          <div>
            <p className="text-white font-800 text-2xl tracking-tight">AgentPrimer</p>
          </div>
        </div>

        {/* Feature highlights */}
        <div className="relative z-10 space-y-6">
          {[
            { icon: '⚡', title: 'Skills & MCP', desc: 'Install tools from GitHub instantly' },
            {
              icon: '🧠',
              title: 'Persistent Memory',
              desc: 'Agents remember across conversations',
            },
            { icon: '🤖', title: 'Multi-Agent', desc: 'Delegate tasks to specialized sub-agents' },
          ].map((f) => (
            <div key={f.title} className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-lg bg-white/15 flex items-center justify-center text-xl flex-shrink-0">
                {f.icon}
              </div>
              <div>
                <p className="text-white font-700 text-base">{f.title}</p>
                <p className="text-blue-200 text-sm">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <p className="relative z-10 text-blue-300 text-sm">
          AgentPrimer Platform · Where human meets agent. 🤝
        </p>
      </div>

      {/* Right panel – login form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center shadow-md">
              <BrandLogo variant="full" className="w-full h-full" priority />
            </div>
            <p className="font-800 text-2xl text-gray-900 tracking-tight">AgentPrimer</p>
          </div>

          <h1 className="text-3xl font-800 text-gray-900 tracking-tight mb-1">Welcome back</h1>
          <p className="text-gray-500 text-sm mb-8">Sign in to your agent workspace</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-600 text-gray-700">Username</label>
              <div className="relative">
                <User
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin"
                  autoComplete="username"
                  required
                  className="
                    w-full h-12 bg-gray-100 text-gray-900 pl-10 pr-4 rounded-lg
                    border-2 border-transparent text-sm
                    focus:outline-none focus:bg-white focus:border-blue-500
                    transition-all duration-200 placeholder:text-gray-400
                  "
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-600 text-gray-700">Password</label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                  className="
                    w-full h-12 bg-gray-100 text-gray-900 pl-10 pr-12 rounded-lg
                    border-2 border-transparent text-sm
                    focus:outline-none focus:bg-white focus:border-blue-500
                    transition-all duration-200 placeholder:text-gray-400
                  "
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600 font-medium">
                {error}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={loading}
              className="w-full mt-2"
            >
              Sign In
            </Button>
          </form>

          {/* <p className="mt-8 text-sm text-gray-400 text-center">
            Manage users in the <code className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">.password</code> file
          </p> */}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
