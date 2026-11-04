import { spawn } from 'child_process'
import * as fs from 'fs'
import { createServer } from 'http'
import { AddressInfo } from 'net'
import * as os from 'os'
import * as path from 'path'

async function runAction(version: string, status = 200, failOnNewPackage = false) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'check-package-version-'))
    const outputPath = path.join(root, 'output')
    const packagePath = path.join(root, 'package with spaces')
    fs.mkdirSync(packagePath)
    fs.writeFileSync(path.join(packagePath, 'package.json'), JSON.stringify({ name: 'test-package', version }))
    fs.writeFileSync(outputPath, '')
    const server = createServer((_request, response) => {
        response.writeHead(status, { 'content-type': 'application/json' })
        response.end(
            JSON.stringify({
                'dist-tags': { latest: '1.0.0' },
                versions: { '1.0.0': {}, '1.1.0-beta.1': {} },
            })
        )
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
        const { port } = server.address() as AddressInfo
        const child = spawn(process.execPath, [path.resolve(__dirname, '../dist/index.js')], {
            cwd: root,
            env: {
                ...process.env,
                INPUT_PATH: packagePath,
                'INPUT_FAIL-ON-NEW-PACKAGE': String(failOnNewPackage),
                GITHUB_OUTPUT: outputPath,
                npm_config_registry: `http://127.0.0.1:${port}/`,
            },
        })
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (data) => (stdout += data))
        child.stderr.on('data', (data) => (stderr += data))
        const code = await new Promise<number | null>((resolve, reject) => {
            child.on('error', reject)
            child.on('close', resolve)
        })
        expect(stdout + stderr).not.toMatch(/::(?:set-output|save-state)\b/)
        const lines = fs.readFileSync(outputPath, 'utf8').trim().split(/\r?\n/).filter(Boolean)
        const outputs: Record<string, string> = {}
        for (let i = 0; i < lines.length; i += 3) {
            const [name, delimiter] = lines[i].split('<<')
            expect(lines[i + 2]).toBe(delimiter)
            outputs[name] = lines[i + 1]
        }
        return { code, stdout, stderr, outputs }
    } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()))
        fs.rmSync(root, { recursive: true, force: true })
    }
}

test.each([
    ['1.0.0', 'false'],
    ['1.1.0-beta.1', 'false'],
    ['1.1.0-beta.2', 'true'],
    ['1.1.0', 'true'],
])('bundled action writes outputs for %s to GITHUB_OUTPUT', async (version, isNew) => {
    const result = await runAction(version)
    expect(result.code).toBe(0)
    expect(result.outputs).toEqual({
        'is-new-version': isNew,
        'is-new-package': 'false',
        'published-version': '1.0.0',
        'committed-version': version,
    })
})

test('bundled action writes first-publication outputs without a published version', async () => {
    const result = await runAction('0.1.0', 404)
    expect(result.code).toBe(0)
    expect(result.outputs).toEqual({
        'is-new-package': 'true',
        'is-new-version': 'true',
        'committed-version': '0.1.0',
    })
})

test('bundled action preserves fail-on-new-package', async () => {
    const result = await runAction('0.1.0', 404, true)
    expect(result.code).toBe(1)
    expect(result.outputs).toEqual({})
    expect(result.stdout).toContain('::error::Package `test-package` could not be found')
})

test('bundled action fails without publication outputs on registry authentication errors', async () => {
    const result = await runAction('1.1.0', 401)
    expect(result.code).toBe(1)
    expect(result.outputs).toEqual({})
    expect(result.stdout).toContain('::error::Response code 401')
})
