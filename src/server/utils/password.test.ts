import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password utility', () => {
  it('should successfully hash and verify a password', async () => {
    const password = 'my-secure-password';
    const hash = await hashPassword(password);

    expect(hash).toBeDefined();
    expect(hash).toContain(':');
    
    const [salt, key] = hash.split(':');
    expect(salt).toHaveLength(32); // Hex representation of 16 bytes
    expect(key).toHaveLength(128); // Hex representation of 64 bytes (KEY_LENGTH)

    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });

  it('should fail verification for incorrect password', async () => {
    const password = 'my-secure-password';
    const hash = await hashPassword(password);

    const isValid = await verifyPassword('wrong-password', hash);
    expect(isValid).toBe(false);
  });

  it('should return false for malformed hash formats', async () => {
    const isValid = await verifyPassword('password', 'invalidhash');
    expect(isValid).toBe(false);

    const isValid2 = await verifyPassword('password', 'salt:1234');
    expect(isValid2).toBe(false);
  });
});
