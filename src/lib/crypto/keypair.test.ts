import { describe, it, expect } from "vitest";
import { deriveKey, generateSalt, encryptVariable, decryptVariable } from "./encryption";
import {
  generateUserKeypair,
  exportPublicKey,
  importPublicKey,
  wrapPrivateKey,
  unwrapPrivateKey,
  rewrapPrivateKey,
  generateDek,
  wrapDekForPublicKey,
  unwrapDekWithPrivateKey,
} from "./keypair";

describe("envelope encryption (team sharing)", () => {
  it("wraps and unwraps a private key with the master key", async () => {
    const master = await deriveKey("pw-123", generateSalt());
    const kp = await generateUserKeypair();
    const wrapped = await wrapPrivateKey(kp.privateKey, master);
    const priv = await unwrapPrivateKey(wrapped.wrapped, wrapped.iv, master);
    expect(priv).toBeTruthy();
  });

  it("lets a member unwrap a DEK grant and decrypt a variable", async () => {
    const kp = await generateUserKeypair();
    const pub = await importPublicKey(await exportPublicKey(kp.publicKey));
    const dek = await generateDek();
    const grant = await wrapDekForPublicKey(dek, pub);
    const enc = await encryptVariable("API_KEY", "secret-value", dek);

    const recovered = await unwrapDekWithPrivateKey(grant, kp.privateKey);
    const dec = await decryptVariable(
      enc.keyEncrypted,
      enc.valueEncrypted,
      enc.ivKey,
      enc.ivValue,
      recovered
    );
    expect(dec).toEqual({ key: "API_KEY", value: "secret-value" });
  });

  it("re-wraps the private key on master-password change; the old key no longer opens it", async () => {
    const oldMaster = await deriveKey("old-pw", generateSalt());
    const newMaster = await deriveKey("new-pw", generateSalt());
    const kp = await generateUserKeypair();
    const w1 = await wrapPrivateKey(kp.privateKey, oldMaster);
    const w2 = await rewrapPrivateKey(w1.wrapped, w1.iv, oldMaster, newMaster);

    await expect(unwrapPrivateKey(w2.wrapped, w2.iv, newMaster)).resolves.toBeTruthy();
    await expect(unwrapPrivateKey(w2.wrapped, w2.iv, oldMaster)).rejects.toBeDefined();
  });

  it("DEK rotation: a holder of the OLD DEK cannot read post-rotation ciphertext", async () => {
    const dekOld = await generateDek();
    const dekNew = await generateDek();
    // Variable re-encrypted under the rotated DEK.
    const enc = await encryptVariable("TOKEN", "post-rotation", dekNew);

    // The revoked member still holds only the old DEK → cannot decrypt.
    await expect(
      decryptVariable(enc.keyEncrypted, enc.valueEncrypted, enc.ivKey, enc.ivValue, dekOld)
    ).rejects.toBeDefined();

    // A current grantee with the new DEK can.
    const dec = await decryptVariable(
      enc.keyEncrypted,
      enc.valueEncrypted,
      enc.ivKey,
      enc.ivValue,
      dekNew
    );
    expect(dec.value).toBe("post-rotation");
  });
});
