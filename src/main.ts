import * as core from '@actions/core'
import packageJson from 'package-json'
import * as path from 'path'
import * as fs from 'fs'

/** An _incomplete_ representation of package.json. */
interface PackageFile {
    name: string
    version: string
    [key: string]: any // eslint-disable-line @typescript-eslint/no-explicit-any
}

export async function readPackageFile(packagePath: string): Promise<PackageFile> {
    return await new Promise((resolve, reject) => {
        const packageFilePath = path.join(packagePath, 'package.json')
        core.debug(`Reading ${packageFilePath}…`)
        try {
            fs.readFile(packageFilePath, (err, data) => {
                if (err) reject(err)
                resolve(JSON.parse(data.toString()))
            })
        } catch (err) {
            reject(err)
        }
    })
}

async function run(): Promise<void> {
    try {
        const packagePath = core.getInput('path') || '.'
        const packageFile = await readPackageFile(packagePath)
        core.debug(`Fetching package ${packageFile.name} information from npm…`)
        const packageNpm = await packageJson(packageFile.name, { allVersions: true })
        const isNewVersion = !Object.keys(packageNpm.versions).includes(packageFile.version)
        core.setOutput('is-new-version', isNewVersion.toString())
        core.setOutput('published-version', packageNpm['dist-tags'].latest)
        core.setOutput('committed-version', packageFile.version)
    } catch (error) {
        core.setFailed(error.message)
    }
}

run()
