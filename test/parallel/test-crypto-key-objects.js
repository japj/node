'use strict';

const common = require('../common');
if (!common.hasCrypto)
  common.skip('missing crypto');

const assert = require('assert');
const {
  createCipheriv,
  createDecipheriv,
  createSign,
  createVerify,
  createSecretKey,
  createPublicKey,
  createPrivateKey,
  KeyObject,
  randomBytes,
  publicEncrypt,
  privateDecrypt
} = require('crypto');

const fixtures = require('../common/fixtures');

const publicPem = fixtures.readKey('rsa_public.pem', 'ascii');
const privatePem = fixtures.readKey('rsa_private.pem', 'ascii');

const publicDsa = fixtures.readKey('dsa_public_1025.pem', 'ascii');
const privateDsa = fixtures.readKey('dsa_private_encrypted_1025.pem',
                                    'ascii');

{
  // Attempting to create an empty key should throw.
  common.expectsError(() => {
    createSecretKey(Buffer.alloc(0));
  }, {
    type: RangeError,
    code: 'ERR_OUT_OF_RANGE',
    message: 'The value of "key.byteLength" is out of range. ' +
             'It must be > 0. Received 0'
  });
}

{
  // Attempting to create a key of a wrong type should throw
  const TYPE = 'wrong_type';

  common.expectsError(() => new KeyObject(TYPE), {
    type: TypeError,
    code: 'ERR_INVALID_ARG_VALUE',
    message: `The argument 'type' is invalid. Received '${TYPE}'`
  });
}

{
  // Attempting to create a key with non-object handle should throw
  common.expectsError(() => new KeyObject('secret', ''), {
    type: TypeError,
    code: 'ERR_INVALID_ARG_TYPE',
    message:
      'The "handle" argument must be of type object. Received type string'
  });
}

{
  const keybuf = randomBytes(32);
  const key = createSecretKey(keybuf);
  assert.strictEqual(key.type, 'secret');
  assert.strictEqual(key.symmetricKeySize, 32);
  assert.strictEqual(key.asymmetricKeyType, undefined);

  const exportedKey = key.export();
  assert(keybuf.equals(exportedKey));

  const plaintext = Buffer.from('Hello world', 'utf8');

  const cipher = createCipheriv('aes-256-ecb', key, null);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext), cipher.final()
  ]);

  const decipher = createDecipheriv('aes-256-ecb', key, null);
  const deciphered = Buffer.concat([
    decipher.update(ciphertext), decipher.final()
  ]);

  assert(plaintext.equals(deciphered));
}

{
  // Passing an existing public key object to createPublicKey should throw.
  const publicKey = createPublicKey(publicPem);
  common.expectsError(() => createPublicKey(publicKey), {
    type: TypeError,
    code: 'ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE',
    message: 'Invalid key object type public, expected private.'
  });

  // Constructing a private key from a public key should be impossible, even
  // if the public key was derived from a private key.
  common.expectsError(() => createPrivateKey(createPublicKey(privatePem)), {
    type: TypeError,
    code: 'ERR_INVALID_ARG_TYPE',
    message: 'The "key" argument must be one of type string, Buffer, ' +
             'TypedArray, or DataView. Received type object'
  });

  // Similarly, passing an existing private key object to createPrivateKey
  // should throw.
  const privateKey = createPrivateKey(privatePem);
  common.expectsError(() => createPrivateKey(privateKey), {
    type: TypeError,
    code: 'ERR_INVALID_ARG_TYPE',
    message: 'The "key" argument must be one of type string, Buffer, ' +
             'TypedArray, or DataView. Received type object'
  });
}

{
  const publicKey = createPublicKey(publicPem);
  assert.strictEqual(publicKey.type, 'public');
  assert.strictEqual(publicKey.asymmetricKeyType, 'rsa');
  assert.strictEqual(publicKey.symmetricKeySize, undefined);

  const privateKey = createPrivateKey(privatePem);
  assert.strictEqual(privateKey.type, 'private');
  assert.strictEqual(privateKey.asymmetricKeyType, 'rsa');
  assert.strictEqual(privateKey.symmetricKeySize, undefined);

  // It should be possible to derive a public key from a private key.
  const derivedPublicKey = createPublicKey(privateKey);
  assert.strictEqual(derivedPublicKey.type, 'public');
  assert.strictEqual(derivedPublicKey.asymmetricKeyType, 'rsa');
  assert.strictEqual(derivedPublicKey.symmetricKeySize, undefined);

  // Test exporting with an invalid options object, this should throw.
  for (const opt of [undefined, null, 'foo', 0, NaN]) {
    common.expectsError(() => publicKey.export(opt), {
      type: TypeError,
      code: 'ERR_INVALID_ARG_TYPE',
      message: 'The "options" argument must be of type object. Received type ' +
               typeof opt
    });
  }

  const publicDER = publicKey.export({
    format: 'der',
    type: 'pkcs1'
  });

  const privateDER = privateKey.export({
    format: 'der',
    type: 'pkcs1'
  });

  assert(Buffer.isBuffer(publicDER));
  assert(Buffer.isBuffer(privateDER));

  const plaintext = Buffer.from('Hello world', 'utf8');
  const ciphertexts = [
    // Encrypt using the public key.
    publicEncrypt(publicKey, plaintext),
    publicEncrypt({ key: publicKey }, plaintext),

    // Encrypt using the private key.
    publicEncrypt(privateKey, plaintext),
    publicEncrypt({ key: privateKey }, plaintext),

    // Encrypt using a public key derived from the private key.
    publicEncrypt(derivedPublicKey, plaintext),
    publicEncrypt({ key: derivedPublicKey }, plaintext),

    // Test distinguishing PKCS#1 public and private keys based on the
    // DER-encoded data only.
    publicEncrypt({ format: 'der', type: 'pkcs1', key: publicDER }, plaintext),
    publicEncrypt({ format: 'der', type: 'pkcs1', key: privateDER }, plaintext)
  ];

  const decryptionKeys = [
    privateKey,
    { format: 'pem', key: privatePem },
    { format: 'der', type: 'pkcs1', key: privateDER }
  ];

  for (const ciphertext of ciphertexts) {
    for (const key of decryptionKeys) {
      const deciphered = privateDecrypt(key, ciphertext);
      assert(plaintext.equals(deciphered));
    }
  }
}

{
  // This should not cause a crash: https://github.com/nodejs/node/issues/25247
  assert.throws(() => {
    createPrivateKey({ key: '' });
  }, {
    message: 'error:2007E073:BIO routines:BIO_new_mem_buf:null parameter',
    code: 'ERR_OSSL_BIO_NULL_PARAMETER',
    reason: 'null parameter',
    library: 'BIO routines',
    function: 'BIO_new_mem_buf',
  });
}

[
  { private: fixtures.readKey('ed25519_private.pem', 'ascii'),
    public: fixtures.readKey('ed25519_public.pem', 'ascii'),
    keyType: 'ed25519' },
  { private: fixtures.readKey('ed448_private.pem', 'ascii'),
    public: fixtures.readKey('ed448_public.pem', 'ascii'),
    keyType: 'ed448' },
  { private: fixtures.readKey('x25519_private.pem', 'ascii'),
    public: fixtures.readKey('x25519_public.pem', 'ascii'),
    keyType: 'x25519' },
  { private: fixtures.readKey('x448_private.pem', 'ascii'),
    public: fixtures.readKey('x448_public.pem', 'ascii'),
    keyType: 'x448' },
].forEach((info) => {
  const keyType = info.keyType;

  {
    const exportOptions = { type: 'pkcs8', format: 'pem' };
    const key = createPrivateKey(info.private);
    assert.strictEqual(key.type, 'private');
    assert.strictEqual(key.asymmetricKeyType, keyType);
    assert.strictEqual(key.symmetricKeySize, undefined);
    assert.strictEqual(key.export(exportOptions), info.private);
  }

  {
    const exportOptions = { type: 'spki', format: 'pem' };
    [info.private, info.public].forEach((pem) => {
      const key = createPublicKey(pem);
      assert.strictEqual(key.type, 'public');
      assert.strictEqual(key.asymmetricKeyType, keyType);
      assert.strictEqual(key.symmetricKeySize, undefined);
      assert.strictEqual(key.export(exportOptions), info.public);
    });
  }
});

{
  // Reading an encrypted key without a passphrase should fail.
  common.expectsError(() => createPrivateKey(privateDsa), {
    type: TypeError,
    code: 'ERR_MISSING_PASSPHRASE',
    message: 'Passphrase required for encrypted key'
  });

  // Reading an encrypted key with a passphrase that exceeds OpenSSL's buffer
  // size limit should fail with an appropriate error code.
  common.expectsError(() => createPrivateKey({
    key: privateDsa,
    format: 'pem',
    passphrase: Buffer.alloc(1025, 'a')
  }), {
    code: 'ERR_OSSL_PEM_BAD_PASSWORD_READ',
    type: Error
  });

  // The buffer has a size of 1024 bytes, so this passphrase should be permitted
  // (but will fail decryption).
  common.expectsError(() => createPrivateKey({
    key: privateDsa,
    format: 'pem',
    passphrase: Buffer.alloc(1024, 'a')
  }), {
    message: /bad decrypt/
  });

  const publicKey = createPublicKey(publicDsa);
  assert.strictEqual(publicKey.type, 'public');
  assert.strictEqual(publicKey.asymmetricKeyType, 'dsa');
  assert.strictEqual(publicKey.symmetricKeySize, undefined);

  const privateKey = createPrivateKey({
    key: privateDsa,
    format: 'pem',
    passphrase: 'secret'
  });
  assert.strictEqual(privateKey.type, 'private');
  assert.strictEqual(privateKey.asymmetricKeyType, 'dsa');
  assert.strictEqual(privateKey.symmetricKeySize, undefined);

}

{
  // Test RSA-PSS.
  {
    // This key pair does not restrict the message digest algorithm or salt
    // length.
    const publicPem = fixtures.readKey('rsa_pss_public_2048.pem');
    const privatePem = fixtures.readKey('rsa_pss_private_2048.pem');

    const publicKey = createPublicKey(publicPem);
    const privateKey = createPrivateKey(privatePem);

    assert.strictEqual(publicKey.type, 'public');
    assert.strictEqual(publicKey.asymmetricKeyType, 'rsa-pss');

    assert.strictEqual(privateKey.type, 'private');
    assert.strictEqual(privateKey.asymmetricKeyType, 'rsa-pss');

    for (const key of [privatePem, privateKey]) {
      // Any algorithm should work.
      for (const algo of ['sha1', 'sha256']) {
        // Any salt length should work.
        for (const saltLength of [undefined, 8, 10, 12, 16, 18, 20]) {
          const signature = createSign(algo)
                            .update('foo')
                            .sign({ key, saltLength });

          for (const pkey of [key, publicKey, publicPem]) {
            const okay = createVerify(algo)
                         .update('foo')
                         .verify({ key: pkey, saltLength }, signature);

            assert.ok(okay);
          }
        }
      }
    }

    // Exporting the key using PKCS#1 should not work since this would discard
    // any algorithm restrictions.
    common.expectsError(() => {
      publicKey.export({ format: 'pem', type: 'pkcs1' });
    }, {
      code: 'ERR_CRYPTO_INCOMPATIBLE_KEY_OPTIONS'
    });
  }

  {
    // This key pair enforces sha256 as the message digest and the MGF1
    // message digest and a salt length of at least 16 bytes.
    const publicPem =
      fixtures.readKey('rsa_pss_public_2048_sha256_sha256_16.pem');
    const privatePem =
      fixtures.readKey('rsa_pss_private_2048_sha256_sha256_16.pem');

    const publicKey = createPublicKey(publicPem);
    const privateKey = createPrivateKey(privatePem);

    assert.strictEqual(publicKey.type, 'public');
    assert.strictEqual(publicKey.asymmetricKeyType, 'rsa-pss');

    assert.strictEqual(privateKey.type, 'private');
    assert.strictEqual(privateKey.asymmetricKeyType, 'rsa-pss');

    for (const key of [privatePem, privateKey]) {
      // Signing with anything other than sha256 should fail.
      assert.throws(() => {
        createSign('sha1').sign(key);
      }, /digest not allowed/);

      // Signing with salt lengths less than 16 bytes should fail.
      for (const saltLength of [8, 10, 12]) {
        assert.throws(() => {
          createSign('sha1').sign({ key, saltLength });
        }, /pss saltlen too small/);
      }

      // Signing with sha256 and appropriate salt lengths should work.
      for (const saltLength of [undefined, 16, 18, 20]) {
        const signature = createSign('sha256')
                          .update('foo')
                          .sign({ key, saltLength });

        for (const pkey of [key, publicKey, publicPem]) {
          const okay = createVerify('sha256')
                       .update('foo')
                       .verify({ key: pkey, saltLength }, signature);

          assert.ok(okay);
        }
      }
    }
  }

  {
    // This key enforces sha512 as the message digest and sha256 as the MGF1
    // message digest.
    const publicPem =
      fixtures.readKey('rsa_pss_public_2048_sha512_sha256_20.pem');
    const privatePem =
      fixtures.readKey('rsa_pss_private_2048_sha512_sha256_20.pem');

    const publicKey = createPublicKey(publicPem);
    const privateKey = createPrivateKey(privatePem);

    assert.strictEqual(publicKey.type, 'public');
    assert.strictEqual(publicKey.asymmetricKeyType, 'rsa-pss');

    assert.strictEqual(privateKey.type, 'private');
    assert.strictEqual(privateKey.asymmetricKeyType, 'rsa-pss');

    // Node.js usually uses the same hash function for the message and for MGF1.
    // However, when a different MGF1 message digest algorithm has been
    // specified as part of the key, it should automatically switch to that.
    // This behavior is required by sections 3.1 and 3.3 of RFC4055.
    for (const key of [privatePem, privateKey]) {
      // sha256 matches the MGF1 hash function and should be used internally,
      // but it should not be permitted as the main message digest algorithm.
      for (const algo of ['sha1', 'sha256']) {
        assert.throws(() => {
          createSign(algo).sign(key);
        }, /digest not allowed/);
      }

      // sha512 should produce a valid signature.
      const signature = createSign('sha512')
                        .update('foo')
                        .sign(key);

      for (const pkey of [key, publicKey, publicPem]) {
        const okay = createVerify('sha512')
                     .update('foo')
                     .verify(pkey, signature);

        assert.ok(okay);
      }
    }
  }
}

{
  // Exporting an encrypted private key requires a cipher
  const privateKey = createPrivateKey(privatePem);
  common.expectsError(() => {
    privateKey.export({
      format: 'pem', type: 'pkcs8', passphrase: 'super-secret'
    });
  }, {
    type: TypeError,
    code: 'ERR_INVALID_OPT_VALUE',
    message: 'The value "undefined" is invalid for option "cipher"'
  });
}
