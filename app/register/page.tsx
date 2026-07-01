'use client';

import { useState, FormEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';

export default function RegisterPage() {
  const router = useRouter();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  // If setup is already done, redirect to login
  useEffect(() => {
    fetch('/api/auth/setup')
      .then((r) => r.json())
      .then(({ needsSetup }) => {
        if (!needsSetup) router.replace('/login');
        else setChecking(false);
      })
      .catch(() => setChecking(false));
  }, [router]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Registration failed');
        return;
      }
      router.push('/setup');
    } catch {
      setError('Network error – please try again');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex overflow-hidden">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-blue-500 relative flex-col justify-between p-12 overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full translate-x-1/3 -translate-y-1/3" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/5 rounded-full -translate-x-1/3 translate-y-1/3" />

        <div className="relative z-10 flex items-center gap-2">
          <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center shadow-md">
            <BrandLogo variant="full" className="w-full h-full" priority />
          </div>
          <p className="font-800 text-2xl text-white tracking-tight">AgentPrimer</p>
        </div>

        <div className="relative z-10">
          <h2 className="text-4xl font-800 text-white tracking-tight leading-tight mb-4">
            Welcome to AgentPrimer
          </h2>
          <p className="text-blue-200 text-base">
            Create your admin account to get started with your AI agent workspace.
          </p>
        </div>

        <p className="relative z-10 text-blue-300 text-sm">
          AgentPrimer Platform · Where human meets agent. 🤝
        </p>
      </div>

      {/* Right panel – registration form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          {/* Mobile brand */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="h-10 w-10 rounded-full bg-blue-500 flex items-center justify-center shadow-md">
              <BrandLogo variant="full" className="w-full h-full" priority />
            </div>
            <p className="font-800 text-2xl text-gray-900 tracking-tight">AgentPrimer</p>
          </div>

          <h1 className="text-3xl font-800 text-gray-900 tracking-tight mb-1">Create account</h1>
          <p className="text-gray-500 text-sm mb-8">
            <span className="hidden lg:inline">Set up your admin credentials to continue</span>
            <span className="lg:hidden">
              Create your admin account to get started with your AI agent workspace.
            </span>
          </p>

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
                  autoComplete="new-password"
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

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-600 text-gray-700">Confirm password</label>
              <div className="relative">
                <Lock
                  size={16}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
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

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="
                w-full h-12 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300
                text-white font-600 rounded-lg text-sm
                transition-all duration-200
                flex items-center justify-center gap-2
              "
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                'Create account'
              )}
            </button>
          </form>

          {/* <p className="text-gray-400 text-sm text-center mt-8">
            The first account is stored in{' '}
            <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-600">data/.users</code>{' '}
            with bcrypt password hashing.
          </p> */}
        </div>
      </div>
    </div>
  );
}
