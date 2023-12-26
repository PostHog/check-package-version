import * as core from '@actions/core'
import * as Path from 'path'
import * as fs from 'fs'
import * as util from 'util'
import semver from 'semver'
import fetch from 'node-fetch'
const getAuthToken = require('registry-auth-token')
const getRegistryUrl = require('registry-auth-token/registry-url')

const exec = util.promisify(require('child_process').exec)

const retrivier = <T>(title: string, retrieve: () => Promise<T>, hidden = false): (() => Promise<T>) => {
    let retrieved: T | undefined = undefined
    return async () => {
        if (typeof retrieved !== 'undefined') {
            return retrieved
        }

        core.info(title)

        const __retrieved = await retrieve()

        if (hidden) {
            core.info('|=> Resulted <**HIDDEN**>')
        } else {
            core.info('|=> Resulted ' + __retrieved)
        }

        retrieved = __retrieved

        return __retrieved
    }
}

;(async () => {
    try {
        const input = {
            operator: core.getInput('operator').trim() || '.',
            path: core.getInput('path').trim() || '.',
            scope: core.getInput('scope').trim() || null,
            registry: core.getInput('registry').trim() || null,
            token: core.getInput('token').trim() || null,
            version: core.getInput('version').trim() || null,
            package: core.getInput('package').trim() || null,
        }

        const _token = retrivier('Retrieve the registry token', async () => {
            if (input.token){
                return input.token;
            }

            const __registry = await _registry();

            const token = getAuthToken(__registry);

            if (typeof token === "undefined"){
                return null;
            }
            if (token.type !== "Bearer"){
                return null;
            }

            return token.token;
        })
        
        const _path = retrivier('Retrieve the package.json path', async () => {
            const stat = await fs.promises.stat(input.path)
            if (stat.isFile()) {
                return input.path
            }

            return Path.join(input.path, 'package.json')
        })

        const _package = retrivier('Retrieve the package.json content', async () => {
            const __path = await _path()
            const buffer = await fs.promises.readFile(__path)
            return JSON.parse(buffer.toString())
        })
        const _commitedVersion = retrivier('Retrieve the committed version', async () => {
            if (input.version && semver.valid(input.version)) {
                return input.version
            }

            const __package = await _package()

            return __package.version
        })
        const _operator = retrivier('Retrieve the operator', async () => {
            if (input.operator) {
                return input.operator
            }

            return '>'
        })
        const _version = retrivier('Retrieve the expectd version', async () => {
            if (input.version) {
                return input.version
            }

            return 'latest'
        })
        const _name = retrivier('Retrieve the package name', async () => {
            if (input.package) {
                return input.package
            }

            const __package = await _package()

            return __package.name
        })

        const _registry = retrivier('Retrieve the registry', async () => {
            if (input.registry) {
                return input.registry
            }

            const __package = await _package()
            if (typeof __package.publishconfig === 'object') {
                if (typeof __package.registry === 'string') {
                    return __package.registry
                }
            }

            const __scope = await _scope()
            console.log(__scope);
            if (__scope){
                return getRegistryUrl("@"+__scope);
            }

            return "https://registry.npmjs.org"
        })

        const _scope = retrivier('Retrieve the scope', async () => {
            if (input.scope) {
                return input.scope
            }

            const __name = await _name()
            if (!__name.startsWith('@')) {
                return null
            }
            const splitted = __name.split('/')

            if (splitted.length <= 1) {
                return null
            }

            return splitted[0].slice(1)
        })

        const __name = await _name()
        const __version = await _version()
        const __registry = await _registry()
        const __scope = await _scope()
        const __token = await _token()
        const __commitedVersion = await _commitedVersion();
        const __operator = await _operator();

        const options = {
            version: 'latest',
        };
        const headers: Record<string,string> = {
            accept: 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
        };
        if (__token){
            headers.authorization = `Bearer ${__token}`;
        }
        const packageUrl = new URL(encodeURIComponent(__name).replace(/^%40/, '@'), __registry);

        const response = await fetch(packageUrl,{
            headers: headers
        });
        const data = await response.json() as Record<string,any>;

        const output = (() => {
            if (__version in data['dist-tags']){
                return data['dist-tags'][__version];
            }

            return semver.maxSatisfying(Object.keys(data.versions), __version);
        })()
        const result = (() => {
            if (__operator === "=" || __operator === "==" || __operator === "==="){
                return semver.eq(output,__commitedVersion);
            }
            if (__operator === "!=" || __operator === "!=" || __operator === "!==" || __operator === "<>"){
                return !semver.eq(output,__commitedVersion);
            }
            if (__operator === ">"){
                return semver.gt(output,__commitedVersion);
            }
            if (__operator === ">="){
                return semver.gte(output,__commitedVersion);
            }
            if (__operator === "<"){
                return semver.lt(output,__commitedVersion);
            }
            if (__operator === "<="){
                return semver.lte(output,__commitedVersion);
            }

            throw new Error("The operator "+_operator+" cannot be proceed");
        })()

        core.setOutput('is-published', 'true')
        core.setOutput('committed-version', __commitedVersion);
        core.setOutput('retrieved-version', output);
        core.setOutput('is-committed-version-free', Object.keys(data.versions).includes(__commitedVersion) ? "true" : "false");
        core.setOutput('result', __operator ? "true" : "false");
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message)
        } else {
            throw error
        }
    }
})()
