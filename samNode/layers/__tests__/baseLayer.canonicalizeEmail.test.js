const { canonicalizeEmail } = require('/opt/baseLayer');

describe('canonicalizeEmail', () => {
  test('lowercases and trims', () => {
    expect(canonicalizeEmail('  USER@EXAMPLE.COM  ')).toBe('user@example.com');
  });

  test('strips +tag from local-part for any domain', () => {
    expect(canonicalizeEmail('user+anything@example.com')).toBe('user@example.com');
    expect(canonicalizeEmail('user+foo+bar@example.com')).toBe('user@example.com');
  });

  test('removes dots from local-part for gmail.com only', () => {
    expect(canonicalizeEmail('a.b.c@gmail.com')).toBe('abc@gmail.com');
    expect(canonicalizeEmail('a.b.c.d.e.f@gmail.com')).toBe('abcdef@gmail.com');
    expect(canonicalizeEmail('a.b.c@googlemail.com')).toBe('abc@googlemail.com');
  });

  test('preserves dots in non-Gmail local-parts', () => {
    expect(canonicalizeEmail('first.last@outlook.com')).toBe('first.last@outlook.com');
    expect(canonicalizeEmail('a.b@example.com')).toBe('a.b@example.com');
  });

  test('combines + and . rules for gmail', () => {
    expect(canonicalizeEmail('a.b.c+tag@gmail.com')).toBe('abc@gmail.com');
  });

  test('returns empty string for empty/invalid input', () => {
    expect(canonicalizeEmail('')).toBe('');
    expect(canonicalizeEmail(null)).toBe('');
    expect(canonicalizeEmail(undefined)).toBe('');
    expect(canonicalizeEmail(12345)).toBe('');
  });

  test('handles missing @ or trailing @ gracefully', () => {
    expect(canonicalizeEmail('noat')).toBe('noat');
    expect(canonicalizeEmail('trailing@')).toBe('trailing@');
    expect(canonicalizeEmail('@leading.com')).toBe('@leading.com');
  });

  test('uses the LAST @ to split (defensive for unusual local-parts)', () => {
    expect(canonicalizeEmail('weird@local@gmail.com')).toBe('weird@local@gmail.com');
  });
});
