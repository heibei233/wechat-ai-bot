// 企业微信 message encryption/decryption
// Based on WeCom official tech docs: AES-256-CBC + PKCS7 + SHA1 signature
import crypto from 'node:crypto';

function pkcs7Pad(buf, blockSize = 32) {
  const padLen = blockSize - (buf.length % blockSize);
  const pad = Buffer.alloc(padLen, padLen);
  return Buffer.concat([buf, pad]);
}

function pkcs7Unpad(buf, blockSize = 32) {
  if (buf.length === 0) throw new Error('Empty buffer');
  const padLen = buf[buf.length - 1];
  if (padLen < 1 || padLen > blockSize) throw new Error(`Invalid pad length: ${padLen}`);
  return buf.subarray(0, buf.length - padLen);
}

export class WeComCrypto {
  constructor(token, encodingAESKey, corpId) {
    this.token = token;
    this.corpId = corpId;
    // EncodingAESKey is 43 chars; add "=" for standard Base64 → 32 bytes
    this.aesKey = Buffer.from(encodingAESKey + '=', 'base64');
    if (this.aesKey.length !== 32) {
      throw new Error(`Invalid EncodingAESKey: decoded length=${this.aesKey.length}, expected 32`);
    }
  }

  /** SHA1(sort(token, timestamp, nonce, encrypt)) */
  signature(timestamp, nonce, encrypted) {
    const arr = [this.token, timestamp, nonce, encrypted].sort();
    return crypto.createHash('sha1').update(arr.join(''), 'utf8').digest('hex');
  }

  /**
   * Decrypt a message from WeCom
   * @returns {{ message: string, corpId: string }}
   */
  decrypt(encrypted) {
    const cipherBuf = Buffer.from(encrypted, 'base64');
    const decipher = crypto.createDecipheriv(
      'aes-256-cbc',
      this.aesKey,
      this.aesKey.subarray(0, 16) // IV = first 16 bytes of key
    );
    decipher.setAutoPadding(false);
    let decrypted = Buffer.concat([decipher.update(cipherBuf), decipher.final()]);
    decrypted = pkcs7Unpad(decrypted);

    // Structure: random16 + msgLen4 + message + corpId
    const msgLen = decrypted.readUInt32BE(16);
    const message = decrypted.subarray(20, 20 + msgLen).toString('utf8');
    const corpId = decrypted.subarray(20 + msgLen).toString('utf8');

    return { message, corpId };
  }

  /**
   * Encrypt a reply for WeCom
   * @returns {string} base64-encoded encrypted message
   */
  encrypt(text) {
    const random = crypto.randomBytes(16);
    const msgBuf = Buffer.from(text, 'utf8');
    const msgLen = Buffer.alloc(4);
    msgLen.writeUInt32BE(msgBuf.length, 0);
    const corpIdBuf = Buffer.from(this.corpId, 'utf8');

    let plain = Buffer.concat([random, msgLen, msgBuf, corpIdBuf]);
    plain = pkcs7Pad(plain);

    const cipher = crypto.createCipheriv(
      'aes-256-cbc',
      this.aesKey,
      this.aesKey.subarray(0, 16)
    );
    cipher.setAutoPadding(false);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    return encrypted.toString('base64');
  }

  /**
   * Verify GET request signature and decrypt echostr (URL verification)
   */
  verifyURL(msgSignature, timestamp, nonce, echostr) {
    const sig = this.signature(timestamp, nonce, echostr);
    if (sig !== msgSignature) return null;
    return this.decrypt(echostr).message;
  }
}
