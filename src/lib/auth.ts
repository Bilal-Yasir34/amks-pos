const SYSTEM_PASSWORD = 'amksamks000';
const AUTH_KEY = 'amks_pos_authenticated';

export function verifyPassword(inputPassword: string): boolean {
  return inputPassword === SYSTEM_PASSWORD;
}

export function getIsAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    sessionStorage.getItem(AUTH_KEY) === 'true' ||
    localStorage.getItem(AUTH_KEY) === 'true'
  );
}

export function setSessionAuthenticated(remember = true): void {
  if (typeof window === 'undefined') return;
  if (remember) {
    localStorage.setItem(AUTH_KEY, 'true');
  } else {
    sessionStorage.setItem(AUTH_KEY, 'true');
  }
}

export function clearSessionAuthentication(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(AUTH_KEY);
}
