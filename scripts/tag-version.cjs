#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
	const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
	const version = pkg.version;
	const tag = `v${version}`;

	console.log(`Creating tag: ${tag}`);
	execSync(`git tag -f ${tag}`, { stdio: 'inherit' });
	console.log(`Tag ${tag} created successfully`);
} catch (error) {
	console.error('Failed to create tag:', error.message);
	process.exit(1);
}
