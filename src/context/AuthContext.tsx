import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleProvider, isFirebaseConfigured } from '../lib/firebase';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signInError: string;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Starts false (not true) when Firebase isn't configured — there's no auth
  // state to wait for, so callers shouldn't see a permanent loading spinner.
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [signInError, setSignInError] = useState('');

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setLoading(false);
    });
  }, []);

  const signInWithGoogle = async () => {
    if (!isFirebaseConfigured) return;
    setSignInError('');
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setSignInError(err instanceof Error ? err.message : '登入失敗');
    }
  };

  const signOutUser = async () => {
    if (!isFirebaseConfigured) return;
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signInError, signInWithGoogle, signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
