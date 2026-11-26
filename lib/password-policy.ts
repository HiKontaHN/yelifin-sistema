function hasDigitSequence(password: string): boolean {
  for (const digits of password.match(/[0-9]{3,}/g) ?? []) {
    for (let i = 2; i < digits.length; i++) {
      const previousStep = Number(digits[i - 1]) - Number(digits[i - 2]);
      const currentStep = Number(digits[i]) - Number(digits[i - 1]);
      if (Math.abs(previousStep) === 1 && previousStep === currentStep) return true;
    }
  }
  return false;
}

export const PASSWORD_RULES = [
  { label: "8 caracteres", test: (value: string) => value.length >= 8 },
  { label: "Una mayúscula", test: (value: string) => /[A-Z]/.test(value) },
  { label: "Una minúscula", test: (value: string) => /[a-z]/.test(value) },
  { label: "3 números", test: (value: string) => (value.match(/[0-9]/g) ?? []).length >= 3 },
  { label: "Sin secuencias (123)", test: (value: string) => value.length > 0 && !hasDigitSequence(value) },
  { label: "Carácter especial", test: (value: string) => /[^A-Za-z0-9]/.test(value) },
];

export function meetsPasswordPolicy(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password));
}
