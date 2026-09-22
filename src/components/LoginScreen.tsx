import { useState, useRef, useEffect } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, AlertCircle, ArrowRight } from 'lucide-react';
import { verifyPassword, setSessionAuthenticated } from '@/lib/auth';

interface LoginScreenProps {
  onUnlock: () => void;
}

export function LoginScreen({ onUnlock }: LoginScreenProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      setError('Please enter the access password.');
      inputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    setError(null);

    setTimeout(() => {
      if (verifyPassword(password)) {
        setSessionAuthenticated(remember);
        onUnlock();
      } else {
        setError('Incorrect password. Please try again.');
        setPassword('');
        inputRef.current?.focus();
      }
      setIsSubmitting(false);
    }, 150);
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background subtle radial gradient */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(37,99,235,0.12),transparent_70%)] pointer-events-none" />

      <div className="relative w-full max-w-md">
        {/* Header Logo & Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600/10 border border-blue-500/20 text-blue-400 mb-4 shadow-lg shadow-blue-500/5">
            <Lock size={30} className="stroke-[2.2]" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white">AMKS</h1>
          <p className="text-xs uppercase tracking-widest text-slate-400 mt-1 font-medium">
            AMKAS International • POS Terminal
          </p>
        </div>

        {/* Card */}
        <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-2xl p-7 shadow-2xl space-y-6">
          <div className="text-center">
            <h2 className="text-lg font-bold text-slate-100">System Protected</h2>
            <p className="text-xs text-slate-400 mt-1">
              Please enter the master password to access the POS system
            </p>
          </div>

          <form onSubmit={handleUnlock} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl text-xs animate-shake">
                <AlertCircle size={16} className="flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock size={18} />
                </div>
                <input
                  ref={inputRef}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="Enter system password..."
                  className="w-full pl-10 pr-11 py-3 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-all"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
                  tabIndex={-1}
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-slate-400 hover:text-slate-300">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
                />
                <span>Remember on this terminal</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors shadow-lg shadow-blue-600/25 flex items-center justify-center gap-2 group disabled:opacity-50"
            >
              <ShieldCheck size={18} />
              <span>{isSubmitting ? 'Verifying...' : 'Unlock System'}</span>
              <ArrowRight
                size={16}
                className="group-hover:translate-x-0.5 transition-transform"
              />
            </button>
          </form>
        </div>

        {/* Footer info */}
        <div className="text-center mt-6 text-[11px] text-slate-500">
          AMKS Retail POS System • Secure Access
        </div>
      </div>
    </div>
  );
}
