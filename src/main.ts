import * as core from '@actions/core'
import * as Path from 'path'
import * as fs from 'fs'
import * as util from 'util'
import * as semver from 'semver'
import fetch from 'node-fetch'
import { URL } from 'url'
const getAuthToken = require('registry-auth-token')
const getRegistryUrl = require('registry-auth-token/registry-url')

const exec = util.promisify(require('child_process').exec)

const retrieve = <T>(title: string, retrieve: () => Promise<T>, hidden = false): (() => Promise<T>) => {
    let retrieved: T | undefined = undefined
    return async () => {
        if (typeof retrieved !== 'undefined') {
            return retrieved
        }

        const __retrieved = await retrieve()

        if (hidden) {
            core.debug(title + ' => <**HIDDEN**>')
        } else {
            core.debug(title + ' => ' + __retrieved)
        }

        retrieved = __retrieved

        return __retrieved
    }
}

;(async () => {
    try {
        const input = {
            operator: core.getInput('operator').trim() || '>',
            path: core.getInput('path').trim() || '.',
            scope: core.getInput('scope').trim() || null,
            registry: core.getInput('registry').trim() || null,
            token: core.getInput('token').trim() || null,
            version: core.getInput('version').trim() || null,
            package: core.getInput('package').trim() || null,
        }

        const _token = retrieve('Retrieve the registry token', async () => {
            if (input.token) {
                return input.token
            }

            const __registry = await _registry()

            const token = getAuthToken(__registry)

            if (typeof token === 'undefined') {
                return null
            }
            if (token.type !== 'Bearer') {
                return null
            }

            return token.token
        })

        const _path = retrieve('Retrieve the package.json path', async () => {
            const stat = await fs.promises.stat(input.path)
            if (stat.isFile()) {
                return input.path
            }

            return Path.join(input.path, 'package.json')
        })

        const _package = retrieve('Retrieve the package.json content', async () => {
            const __path = await _path()
            const buffer = await fs.promises.readFile(__path)
            return JSON.parse(buffer.toString())
        })
        const _commitedVersion = retrieve('Retrieve the committed version', async () => {
            if (input.version && semver.valid(input.version)) {
                return input.version
            }

            const __package = await _package()

            return __package.version
        })
        const _operator = retrieve('Retrieve the operator', async () => {
            if (input.operator) {
                return input.operator
            }

            return '>'
        })
        const _version = retrieve('Retrieve the expectd version', async () => {
            if (input.version) {
                if (input.version === '~' || input.version === '^') {
                    const __commitedVersion = await _commitedVersion()

                    return input.version + __commitedVersion
                }
                return input.version
            }

            return 'latest'
        })
        const _name = retrieve('Retrieve the package name', async () => {
            if (input.package) {
                return input.package
            }

            const __package = await _package()

            return __package.name
        })

        const _registry = retrieve('Retrieve the registry', async () => {
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
            if (__scope) {
                return getRegistryUrl('@' + __scope)
            }

            return 'https://registry.npmjs.org'
        })

        const _scope = retrieve('Retrieve the scope', async () => {
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
        const __token = await _token()
        const __commitedVersion = await _commitedVersion()
        const __operator = await _operator()

        const options = {
            version: 'latest',
        }
        const headers: Record<string, string> = {
            accept: 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
        }
        if (__token) {
            headers.authorization = `Bearer ${__token}`
        }
        const packageUrl = new URL(encodeURIComponent(__name).replace(/^%40/, '@'), __registry)

        const response = await fetch(packageUrl, {
            headers: headers,
        })

        if (response.status === 404) {
            core.debug(
                'No package has been found (results an 404 http status) related this URL: ' +
                    packageUrl.toString() +
                    '. BODY => ' +
                    (await response.text())
            )

            core.setOutput('is-published', 'false')
            core.setOutput('committed-version', __commitedVersion)
            core.setOutput('retrieved-version', 'NOT_FOUND')
            core.setOutput('is-committed-version-free', 'true')
            core.setOutput('result', 'UNKNOWN')
            return
        }

        const data = (await response.json()) as Record<string, unknown>
        core.debug(
            'The request resulted an ' +
                response.status +
                ' http status with the following body: ' +
                JSON.stringify(data)
        )

        if ('error' in data) {
            const error = data['error']

            if (typeof error === 'string') {
                core.setFailed(error)
                return
            }
        }

        const versions: string[] | null = (() => {
            if (typeof data === 'object' && data !== null) {
                const versions = data['versions']
                if (typeof versions === 'object' && versions !== null) {
                    return Object.keys(versions)
                }
            }

            return null
        })()
        const tags = (() => {
            if (typeof data === 'object' && data !== null) {
                const dist = data['dist-tags']
                if (typeof dist === 'object' && dist !== null) {
                    return dist
                }
            }

            return null
        })()

        if (versions !== null) {
            core.debug('The versions who has been published are: ' + versions.join(','))
        } else {
            core.debug('No versions data has been found')
        }
        if (tags !== null) {
            core.debug(
                'The retrieved version tags are: ' +
                    Object.entries(tags)
                        .map((entry) => entry.join(' => '))
                        .join(',')
            )
        } else {
            core.debug('No versions tags data has been found')
        }

        const output = (() => {
            if (tags !== null) {
                if (__version in tags) {
                    const output = (tags as { [key: typeof __version]: unknown })[__version]

                    if (typeof output === 'string') {
                        return output
                    }
                }
            }

            if (versions !== null) {
                return semver.maxSatisfying(versions, __version)
            }

            return null
        })()
        const result = (() => {
            if (output === null) {
                return 'UNKNOWN'
            }

            if (__operator === '=' || __operator === '==' || __operator === '===') {
                return semver.eq(output, __commitedVersion)
            }
            if (__operator === '!=' || __operator === '!=' || __operator === '!==' || __operator === '<>') {
                return !semver.eq(output, __commitedVersion)
            }
            if (__operator === '>') {
                return semver.gt(output, __commitedVersion)
            }
            if (__operator === '>=') {
                return semver.gte(output, __commitedVersion)
            }
            if (__operator === '<') {
                return semver.lt(output, __commitedVersion)
            }
            if (__operator === '<=') {
                return semver.lte(output, __commitedVersion)
            }

            throw new Error('The operator ' + __operator + ' cannot be proceed')
        })()

        if (versions !== null) {
            core.setOutput('is-committed-version-free', versions.includes(__commitedVersion) ? 'false' : 'true')
        } else {
            core.setOutput('is-committed-version-free', 'UNKNOWN')
        }

        core.setOutput('is-published', 'true')
        core.setOutput('committed-version', __commitedVersion)
        core.setOutput('retrieved-version', output === null ? 'NOT_FOUND' : output)
        core.setOutput('result', result ? 'true' : 'false')
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message)
        } else {
            throw error
        }
    }
})()
