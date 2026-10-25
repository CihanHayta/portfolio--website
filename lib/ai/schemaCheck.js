// Yapay zekâdan gelen JSON'u beklenen şemaya (Gemini/OpenAPI biçimi) göre denetler.
// Zorunlu alan, tip ve enum hataları listelenir; geçersiz yanıt başarılı sayılmaz.

const typeOf = (value) => (Array.isArray(value) ? "ARRAY" : value === null ? "NULL" : typeof value === "number" ? (Number.isInteger(value) ? "INTEGER" : "NUMBER") : typeof value === "boolean" ? "BOOLEAN" : typeof value === "string" ? "STRING" : "OBJECT");

export function checkSchema(value, schema, path = "$", errors = [], limit = 10) {
  if (!schema || errors.length >= limit) return errors;
  const expected = String(schema.type ?? "").toUpperCase();
  const actual = typeOf(value);
  if (value === null || value === undefined) {
    if (!schema.nullable) errors.push(`${path}: değer yok`);
    return errors;
  }
  const ok = expected === actual || (expected === "NUMBER" && actual === "INTEGER");
  if (expected && !ok) {
    errors.push(`${path}: ${expected} bekleniyordu, ${actual} geldi`);
    return errors;
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: izin verilmeyen değer`);
  if (expected === "OBJECT") {
    for (const key of schema.required ?? []) {
      if (value[key] === undefined || value[key] === null || value[key] === "") errors.push(`${path}.${key}: zorunlu alan eksik`);
    }
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (value[key] !== undefined && value[key] !== null) checkSchema(value[key], sub, `${path}.${key}`, errors, limit);
    }
  }
  if (expected === "ARRAY" && schema.items) {
    value.slice(0, 50).forEach((item, index) => checkSchema(item, schema.items, `${path}[${index}]`, errors, limit));
  }
  return errors;
}
