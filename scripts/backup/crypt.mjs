// Yedek şifreleme: RSA-4096 (OAEP, SHA-256) ile sarılmış rastgele AES-256-GCM anahtarı.
//   node scripts/backup/crypt.mjs keygen  <özel-anahtar.pem> <açık-anahtar.pem>
//   node scripts/backup/crypt.mjs encrypt <girdi> <çıktı.enc> <açık-anahtar.pem>
//   node scripts/backup/crypt.mjs decrypt <girdi.enc> <çıktı> <özel-anahtar.pem>
// - GitHub Actions yalnızca AÇIK anahtarı bilir: yedeği şifreleyebilir, açamaz.
// - ÖZEL anahtar yalnızca site sahibinde durur (0600). Kaybolursa yedekler açılamaz:
//   en az bir kopyası çevrimdışı/ayrı bir yerde saklanmalıdır.
// - GCM etiketi bütünlüğü doğrular: değiştirilmiş ya da bozuk dosya açılmaz.
// Dosya biçimi: "PYD1" | 2 bayt anahtar uzunluğu | sarılmış anahtar | 12 bayt IV | 16 bayt etiket | şifreli veri

import { constants, createCipheriv, createDecipheriv, generateKeyPairSync, privateDecrypt, publicEncrypt, randomBytes } from "node:crypto";
import { chmodSync, readFileSync, writeFileSync } from "node:fs";

const MAGIC = Buffer.from("PYD1");
const OAEP = { padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" };
const [command, input, output, keyFile] = process.argv.slice(2);

if (command === "keygen") {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 4096,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  writeFileSync(input, privateKey, { mode: 0o600, flag: "wx" }); // var olan anahtarın üzerine yazılmaz
  chmodSync(input, 0o600);
  writeFileSync(output, publicKey, { flag: "wx" });
  console.log("anahtar çifti üretildi (özel anahtar 0600; içeriği yazdırılmadı)");
} else if (command === "encrypt") {
  const key = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(readFileSync(input)), cipher.final()]);
  const wrapped = publicEncrypt({ key: readFileSync(keyFile), ...OAEP }, key);
  const length = Buffer.alloc(2);
  length.writeUInt16BE(wrapped.length);
  writeFileSync(output, Buffer.concat([MAGIC, length, wrapped, iv, cipher.getAuthTag(), data]));
  console.log(`şifrelendi: ${data.length} bayt`);
} else if (command === "decrypt") {
  const file = readFileSync(input);
  if (!file.subarray(0, 4).equals(MAGIC)) throw new Error("Bu bir Persona yedek dosyası değil.");
  const length = file.readUInt16BE(4);
  let offset = 6;
  const wrapped = file.subarray(offset, (offset += length));
  const iv = file.subarray(offset, (offset += 12));
  const tag = file.subarray(offset, (offset += 16));
  const key = privateDecrypt({ key: readFileSync(keyFile), ...OAEP }, wrapped);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  writeFileSync(output, Buffer.concat([decipher.update(file.subarray(offset)), decipher.final()]), { mode: 0o600 });
  console.log("çözüldü ve bütünlük doğrulandı");
} else {
  throw new Error("Kullanım: crypt.mjs keygen|encrypt|decrypt …");
}
