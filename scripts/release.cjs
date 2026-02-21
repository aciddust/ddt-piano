#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const versionType = args[0] || 'patch'; // patch, minor, major

if (!['patch', 'minor', 'major'].includes(versionType)) {
	console.error('Invalid version type. Use: patch, minor, or major');
	process.exit(1);
}

try {
	// Read package.json
	const pkgPath = path.join(__dirname, '../package.json');
	const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

	// Parse current version
	const [major, minor, patch] = pkg.version.split('.').map(Number);

	// Calculate new version
	let newVersion;
	switch (versionType) {
		case 'patch':
			newVersion = `${major}.${minor}.${patch + 1}`;
			break;
		case 'minor':
			newVersion = `${major}.${minor + 1}.0`;
			break;
		case 'major':
			newVersion = `${major + 1}.0.0`;
			break;
	}

	console.log(`Bumping version: ${pkg.version} → ${newVersion}`);

	// Update package.json
	pkg.version = newVersion;
	fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, '\t') + '\n');
	console.log('Updated package.json');

	// Update tauri.conf.json
	const tauriPath = path.join(__dirname, '../src-tauri/tauri.conf.json');
	const tauri = JSON.parse(fs.readFileSync(tauriPath, 'utf8'));
	tauri.version = newVersion;
	fs.writeFileSync(tauriPath, JSON.stringify(tauri, null, '\t') + '\n');
	console.log('Updated tauri.conf.json');

	// Update Cargo.toml
	const cargoPath = path.join(__dirname, '../src-tauri/Cargo.toml');
	let cargo = fs.readFileSync(cargoPath, 'utf8');
	cargo = cargo.replace(/^version = "[^"]+"/m, `version = "${newVersion}"`);
	fs.writeFileSync(cargoPath, cargo);
	console.log('Updated Cargo.toml');

    // Update Cargo.lock 존재하는경우만
	// Cargo.toml 변경하면 자동으로 버전이 바뀌긴하는데 타이밍 문제가 있어서 명시적으로 수정함)
	const cargoLockPath = path.join(__dirname, '../src-tauri/Cargo.lock');
	if (fs.existsSync(cargoLockPath)) {
		let cargoLock = fs.readFileSync(cargoLockPath, 'utf8');
		// ddt-piano 패키지 섹션의 version만 변경
		cargoLock = cargoLock.replace(
			/(name = "ddt-piano"\nversion = )"[^"]+"/,
			`$1"${newVersion}"`
		);
		fs.writeFileSync(cargoLockPath, cargoLock);
		console.log('Updated Cargo.lock');
	}
	// Stage all files
	console.log('\nCreating commit...');
	execSync('git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock', {
		stdio: 'inherit'
	});

	// Create commit
	const commitMessage = `chore: Bump ${newVersion}`;
	execSync(`git commit -m "${commitMessage}"`, { stdio: 'inherit' });

	// Create tag
	console.log('\nCreating tag...');
	const tag = `v${newVersion}`;
	execSync(`git tag ${tag}`, { stdio: 'inherit' });

	// Push
	console.log('\nPushing to remote...');
	execSync('git push', { stdio: 'inherit' });
	execSync('git push --tags', { stdio: 'inherit' });

	console.log(`\nSuccessfully released v${newVersion}!`);
} catch (error) {
	console.error('\nError:', error.message);
	process.exit(1);
}
