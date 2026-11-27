import { createSessionToken, digestToken, hashPassword, verifyPassword } from './password';

describe('password and session tokens', () => {
  it('hashes passwords with a salt and verifies them', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('wrong password', hash)).toBe(false);
    expect(await hashPassword('correct horse battery staple')).not.toBe(hash);
  });

  it('rejects malformed stored hashes', async () => {
    expect(await verifyPassword('x', 'plain')).toBe(false);
    expect(await verifyPassword('x', 'scrypt$only-one-part')).toBe(false);
  });

  it('creates random tokens and stable digests', () => {
    const first = createSessionToken();
    const second = createSessionToken();
    expect(first).not.toBe(second);
    expect(first.length).toBeGreaterThanOrEqual(32);
    expect(digestToken(first)).toBe(digestToken(first));
    expect(digestToken(first)).not.toBe(digestToken(second));
  });
});
