const ADMIN_PASSWORD = 'Amks04021999!';
const ADMIN_AUTH_KEY = 'amks_admin_authenticated';

export function verifyAdminPassword(inputPassword: string): boolean {
  return inputPassword === ADMIN_PASSWORD;
}

export function getIsAdminAuthenticated(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    sessionStorage.getItem(ADMIN_AUTH_KEY) === 'true' ||
    localStorage.getItem(ADMIN_AUTH_KEY) === 'true'
  );
}

export function setAdminSessionAuthenticated(remember = true): void {
  if (typeof window === 'undefined') return;
  if (remember) {
    localStorage.setItem(ADMIN_AUTH_KEY, 'true');
  } else {
    sessionStorage.setItem(ADMIN_AUTH_KEY, 'true');
  }
}

export function clearAdminSessionAuthentication(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(ADMIN_AUTH_KEY);
  localStorage.removeItem(ADMIN_AUTH_KEY);
}

// Backward compatibility aliases
export const verifyPassword = verifyAdminPassword;
export const getIsAuthenticated = getIsAdminAuthenticated;
export const setSessionAuthenticated = setAdminSessionAuthenticated;
export const clearSessionAuthentication = clearAdminSessionAuthentication;

