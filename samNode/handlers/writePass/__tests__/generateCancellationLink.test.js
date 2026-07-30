describe('generateCancellationLink', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      PUBLIC_FRONTEND: 'https://dayuse.example.ca',
      PASS_CANCELLATION_ROUTE: '/cancel',
    };
  });

  afterAll(() => {
    process.env = OLD_ENV;
  });

  function build(email) {
    const { generateCancellationLink } = require('../index');
    return generateCancellationLink('REG123', email, '0007', '2026-07-30', 'DAY');
  }

  // Ref bcgov/parks-reso-public#426 — encodeURI() leaves '+' alone, and '+' in a
  // query string decodes to a space, so the cancellation link carried a
  // different address than the one on the pass and the lookup failed.
  it('escapes a "+" in the email so it survives query-string parsing', () => {
    const link = build('user+tag@gmail.com');

    expect(link).toContain('email=user%2Btag%40gmail.com');
    expect(new URL(link).searchParams.get('email')).toBe('user+tag@gmail.com');
  });

  it('round-trips other reserved characters in the email', () => {
    const link = build("o'brien&co=1@example.com");

    expect(new URL(link).searchParams.get('email')).toBe("o'brien&co=1@example.com");
  });

  it('round-trips a plain email and keeps the other parameters intact', () => {
    const link = build('plain@example.com');
    const params = new URL(link).searchParams;

    expect(link.startsWith('https://dayuse.example.ca/cancel?')).toBe(true);
    expect(params.get('email')).toBe('plain@example.com');
    expect(params.get('passId')).toBe('REG123');
    expect(params.get('park')).toBe('0007');
    expect(params.get('date')).toBe('2026-07-30');
    expect(params.get('type')).toBe('DAY');
  });
});
