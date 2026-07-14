export function passwordStrength(password: string): { label: string; score: 0 | 1 | 2 | 3 } {
  if (password.length < 6) return { label: "For kort", score: 0 };
  let score = 0;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password)) score++;
  if (score <= 1) return { label: "Svakt", score: 1 };
  if (score === 2) return { label: "Middels", score: 2 };
  return { label: "Sterkt", score: 3 };
}
