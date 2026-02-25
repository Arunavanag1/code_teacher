#!/usr/bin/env node

/**
 * code-teacher CLI entry point
 * Analyzes codebases to surface teachable sections, high-impact sections,
 * and data structure decisions.
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const require = createRequire(import.meta.url);
const pkg = require(join(__dirname, '..', '..', 'package.json')) as { version: string };

console.log(`code-teacher v${pkg.version}`);
