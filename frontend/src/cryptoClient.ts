// Clave simétrica de 256 bits para desencriptar en memoria
const KEY_HEX = '8f4a9b2c1d3e5f7a0b2c4d6e8f1a3b5c7d9e1f3a5b7c9d1e3f5a7b9c1d3e5f7a';

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function decryptResponse(jsonResponse: any): Promise<any> {
  // Si no viene cifrado (fallback), devolver tal cual
  if (!jsonResponse || !jsonResponse.secure_payload || !jsonResponse.iv) {
    return jsonResponse;
  }

  const rawKey = hexToUint8Array(KEY_HEX);
  const cryptoKey = await window.crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-CBC' },
    false,
    ['decrypt']
  );

  const iv = hexToUint8Array(jsonResponse.iv);
  const encryptedBytes = base64ToUint8Array(jsonResponse.secure_payload);

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-CBC', iv: iv as any },
    cryptoKey,
    encryptedBytes
  );

  const decryptedText = new TextDecoder().decode(decryptedBuffer);
  return JSON.parse(decryptedText);
}
