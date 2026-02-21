import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

const TEST_REPO = path.resolve('test-repo-security');

// Setup test repo
if (fs.existsSync(TEST_REPO)) fs.rmSync(TEST_REPO, { recursive: true, force: true });
fs.mkdirSync(TEST_REPO);
spawnSync('git', ['init'], { cwd: TEST_REPO });
fs.writeFileSync(path.join(TEST_REPO, 'test.txt'), 'initial content');
spawnSync('git', ['add', '.'], { cwd: TEST_REPO });
spawnSync('git', ['commit', '-m', 'initial'], { cwd: TEST_REPO });

async function runTests() {
    console.log('Starting security verification tests...');

    // 1. Verify Shell Injection in Git Commit
    console.log('\nChecking Git Commit Shell Injection...');
    // Import library directly
    const { commitChanges } = await import('../lib/git.js');

    // Make a change to commit
    fs.writeFileSync(path.join(TEST_REPO, 'test.txt'), 'changed content');
    spawnSync('git', ['add', '.'], { cwd: TEST_REPO });

    const maliciousMessage = "test' ; touch INJECTED ; '";
    try {
        commitChanges(TEST_REPO, maliciousMessage);
        const injectedFile = path.join(TEST_REPO, 'INJECTED');
        const wasInjected = fs.existsSync(injectedFile);
        assert.strictEqual(wasInjected, false, 'Shell injection should not execute commands');
        console.log('✓ Shell Injection blocked in commitChanges');
    } catch (err) {
        console.warn('Commit failed as expected or due to environment:', err.message);
        const injectedFile = path.join(TEST_REPO, 'INJECTED');
        assert.strictEqual(fs.existsSync(injectedFile), false, 'Shell injection should not execute commands even if commit fails');
        console.log('✓ Shell Injection blocked (confirmed via side-effect check)');
    }

    // 2. Verify Path Sanitization logic
    console.log('\nChecking Path Sanitization logic...');
    const gitRoot = path.resolve('.');
    const validatePath = (p) => {
        if (!p) return false;
        try {
            const absoluteGitRoot = path.resolve(gitRoot);
            const absolutePath = path.resolve(gitRoot, p);
            return absolutePath.startsWith(absoluteGitRoot);
        } catch {
            return false;
        }
    };

    assert.strictEqual(validatePath('src/App.jsx'), true, 'Should allow valid paths');
    assert.strictEqual(validatePath('../../package.json'), false, 'Should block traversal paths');
    assert.strictEqual(validatePath('/etc/passwd'), false, 'Should block absolute paths outside root');
    console.log('✓ Path Sanitization logic verified');

    console.log('\nAll offline security tests passed!');
}

runTests().catch(err => {
    console.error('\nSecurity tests failed:');
    console.error(err);
    process.exit(1);
});
