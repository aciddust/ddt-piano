#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
	const pkg = JSON.parse(
		fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8')
	);
	const tauri = JSON.parse(
		fs.readFileSync(path.join(__dirname, '../src-tauri/tauri.conf.json'), 'utf8')
	);

	// Update tauri.conf.json
	tauri.version = pkg.version;
	fs.writeFileSync(
		path.join(__dirname, '../src-tauri/tauri.conf.json'),
		JSON.stringify(tauri, null, '\t') + '\n'
	);

	// Update Cargo.toml
	let cargo = fs.readFileSync(path.join(__dirname, '../src-tauri/Cargo.toml'), 'utf8');
	cargo = cargo.replace(/^version = "[^"]+"/m, `version = "${pkg.version}"`);
	fs.writeFileSync(path.join(__dirname, '../src-tauri/Cargo.toml'), cargo);

	// Stage files
	execSync('git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml', {
		stdio: 'inherit'
	});

	// Amend commit with proper message
	const commitMessage = `chore: Bump ${pkg.version}`;
	execSync(`git commit --amend -m "${commitMessage}"`, { stdio: 'inherit' });

	console.log(`✓ Version synced to ${pkg.version}`);
} catch (error) {
	console.error('Failed to sync version:', error.message);
	process.exit(1);
}
