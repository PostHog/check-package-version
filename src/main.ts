import * as core from '@actions/core'
import packageJson from 'package-json'
import * as Path from 'path'
import * as fs from 'fs'
import * as util from 'util'

const exec = util.promisify(require('child_process').exec)

const retrivier = <T>(retrieve: () => Promise<T>): (() => Promise<T>) => {
    let retrieved: T | undefined = undefined
    return async () => {
        if (typeof retrieved !== 'undefined') {
            return retrieved
        }

        const __retrieved = await retrieve()

        retrieved = __retrieved

        return __retrieved
    }
}

;(async () => {
    try {
        const input = {
            path: core.getInput('path').trim() || '.',
            scope: core.getInput('scope').trim() || null,
            registry: core.getInput('registry').trim() || null,
            token: core.getInput('token').trim() || null,
            version: core.getInput('version').trim() || null,
            package: core.getInput('package').trim() || null,
            isLookingForTag: core.getBooleanInput('look-for-tags'),
        }

        const _package = retrivier(async () => {
            core.debug('Retrieve the package.json path')

            const path: string = await (async () => {
                const stat = await fs.promises.stat(input.path)
                if (stat.isFile()) {
                    return input.path
                }

                return Path.join(input.path, 'package.json')
            })()

            core.debug("Read the package.json's file")
            const buffer = await fs.promises.readFile(path)

            core.debug("Parse the package.json's file")
            return JSON.parse(buffer.toString())
        })
        const _commitedVersion = retrivier(async () => {
            if (!input.isLookingForTag) {
                if (input.version) {
                    return input.version
                }
            }

            core.debug("Retrieve the package.json's version")
            const __package = await _package()

            return __package.version
        })
        const _version = retrivier(async () => {
            if (input.version) {
                return input.version
            }

            if (input.isLookingForTag) {
                return 'latest'
            }

            return _commitedVersion()
        })
        const _name = retrivier(async () => {
            if (input.package) {
                return input.package
            }

            core.debug("Retrieve the package.json's name")
            const __package = await _package()

            return __package.name
        })

        const _registry = retrivier(async () => {
            if (input.registry) {
                return input.registry
            }

            core.debug('Read the package.json to retrieve the registry url')

            const __package = await _package()
            if (typeof __package.publishconfig === 'object') {
                if (typeof __package.registry === 'string') {
                    return __package.registry
                }
            }

            const __scope = await _scope()

            core.debug('Retrieve the registry url for the scope ' + __scope + ' from the npm config')
            return exec('npm config get @' + __scope + ':registry')
        })

        const _scope = retrivier(async () => {
            if (input.scope) {
                return input.scope
            }

            core.debug('Read the package name to retrieve the scope name')

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

        if (input.registry) {
            const __registry = await _registry()
            const __scope = await _scope()

            core.debug('Set the registry to ' + __registry + ' on the scope ' + __scope)
            await exec('npm config set @' + __scope + ':registry ' + __registry)
        }

        if (input.token) {
            const __registry = await _registry()
            const __scope = await _scope()
            core.debug('Set the authentification token for the registry ' + __registry + ' on the scope ' + __scope)

            const registryWithoutProtocol = __registry.replace(/(^\w+:|^)\/\//, '')

            await exec('npm config set ' + registryWithoutProtocol + '/:_authToken=' + input.token)
        }

        const __package = await _name()
        const __version = await _version()

        core.setOutput('committed-version', await _commitedVersion())

        if (input.isLookingForTag) {
            try {
                core.debug('Retrieve version of the package ' + __package + ' with the tag ' + __version)
                const result = await packageJson(__package, {
                    allVersions: true,
                })

                core.setOutput('is-published', 'true')

                const published = result['dist-tags'][__version]
                const isNewVersion = !Object.keys(result.versions).includes(__version)
                core.setOutput('is-new-version', isNewVersion ? 'true' : 'false')

                if (typeof published === 'string') {
                    core.setOutput('published-version', published)
                } else {
                    core.setOutput('published-version', 'unknown')
                }
            } catch (e) {
                if (e instanceof packageJson.PackageNotFoundError || e instanceof packageJson.VersionNotFoundError) {
                    core.setOutput('published-version', 'unknown')

                    if (e instanceof packageJson.PackageNotFoundError) {
                        core.setOutput('is-published', 'false')
                        core.setOutput('is-new-version', 'true')
                    } else {
                        core.setOutput('is-published', 'true')
                        core.setOutput('is-new-version', 'unknown')
                    }
                }
            }
        } else {
            try {
                core.debug('Retrieve the last version of the package ' + __package + ' from the version ' + __version)
                const result = await packageJson(__package, {
                    version: __version,
                })

                core.setOutput('is-published', 'true')

                const published = result['dist-tags'][__version]
                const isNewVersion = !Object.keys(result.versions).includes(__version)
                core.setOutput('is-new-version', isNewVersion ? 'true' : 'false')

                if (typeof published === 'string') {
                    core.setOutput('published-version', published)
                } else {
                    core.setOutput('published-version', 'unknown')
                }
            } catch (e) {
                if (e instanceof packageJson.PackageNotFoundError || e instanceof packageJson.VersionNotFoundError) {
                    core.setOutput('published-version', 'unknown')

                    if (e instanceof packageJson.PackageNotFoundError) {
                        core.setOutput('is-published', 'false')
                        core.setOutput('is-new-version', 'true')
                    } else {
                        core.setOutput('is-published', 'true')
                        core.setOutput('is-new-version', 'unknown')
                    }
                } else {
                    throw e
                }
            }
        }
    } catch (error) {
        if (error instanceof Error) {
            core.setFailed(error.message)
        } else {
            throw error
        }
    }
})()
