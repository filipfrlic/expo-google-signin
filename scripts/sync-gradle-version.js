#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const version = process.env.npm_package_version || require('../package.json').version;
const gradlePath = path.join(__dirname, '..', 'android', 'build.gradle');
const original = fs.readFileSync(gradlePath, 'utf8');
const updated = original.replace(/^version = '[^']*'$/m, `version = '${version}'`);

if (original === updated) {
  console.error(`sync-gradle-version: no version line matched in ${gradlePath}`);
  process.exit(1);
}

fs.writeFileSync(gradlePath, updated);
console.log(`sync-gradle-version: android/build.gradle -> ${version}`);
