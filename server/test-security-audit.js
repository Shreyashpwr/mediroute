import jwt from 'jsonwebtoken';
import { generateToken, verifyToken } from './src/utils/token.js';
import { cleanAndParseJsonResponse } from './src/services/geminiService.js';
import { validateEnv } from './src/config/env.js';

console.log('=== RUNNING SECURITY REFACTORING TESTS ===\n');

let passCount = 0;
let failCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✓ PASS: ${message}`);
    passCount++;
  } else {
    console.error(`✗ FAIL: ${message}`);
    failCount++;
  }
}

// 1. JWT Security & Algorithm Enforcement
try {
  const token = generateToken('user_test_123');
  assert(typeof token === 'string' && token.length > 20, 'generateToken produces valid token string');

  const decoded = verifyToken(token);
  assert(decoded.id === 'user_test_123', 'verifyToken correctly decodes token id');

  // Verify header has alg: HS256
  const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64').toString());
  assert(header.alg === 'HS256', 'Token header explicitly specifies HS256 algorithm');

  // Attempting none algorithm attack should fail
  const noneToken = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64') + '.' +
    Buffer.from(JSON.stringify({ id: 'attacker' })).toString('base64') + '.';
  let nonePassed = false;
  try {
    verifyToken(noneToken);
    nonePassed = true;
  } catch (err) {
    nonePassed = false;
  }
  assert(!nonePassed, 'verifyToken rejects alg:none signature bypass attempt');
} catch (e) {
  assert(false, `JWT test error: ${e.message}`);
}

// 2. Gemini JSON Cleaner & Parser
try {
  const markdownJson = '```json\n{"triage": "URGENT", "score": 8}\n```';
  const parsed = cleanAndParseJsonResponse(markdownJson);
  assert(parsed.triage === 'URGENT' && parsed.score === 8, 'cleanAndParseJsonResponse handles markdown code fences');

  const messyJson = 'Operational response text: {"status": "success", "eta": 12} additional notes';
  const parsed2 = cleanAndParseJsonResponse(messyJson);
  assert(parsed2.status === 'success' && parsed2.eta === 12, 'cleanAndParseJsonResponse extracts embedded JSON bounded by braces');
} catch (e) {
  assert(false, `Gemini JSON parser test error: ${e.message}`);
}

// 3. Environment Redaction
try {
  const summary = validateEnv();
  const summaryStr = JSON.stringify(summary);
  assert(!summaryStr.includes('mongodb+srv://'), 'validateEnv never prints actual mongoUri in summary');
  assert(!summaryStr.includes('AIza'), 'validateEnv never prints actual geminiApiKey in summary');
  assert(summaryStr.includes('[REDACTED]'), 'validateEnv masks credentials with [REDACTED]');
} catch (e) {
  assert(false, `validateEnv test error: ${e.message}`);
}

console.log(`\nTests completed: ${passCount} Passed, ${failCount} Failed.`);
if (failCount > 0) process.exit(1);
