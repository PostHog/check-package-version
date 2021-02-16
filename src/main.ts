import * as core from '@actions/core'
import packageJson from 'package-json'
import * as path from 'path'
import * as fs from 'fs'

/** An incomplete representation of package.json. */
interface PackageFile {
    name: string
    version: string
    [key: string]: any
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
    }
}

async function run(): Promise<void> {
    try {
        const packagePath = core.getInput('path') || '.'
        const packageFile = await readPackageFile(packagePath)
        core.debug(`Fetching package ${packageFile.name} information from npm…`)
        const packageNpm = await packageJson(packageFile.name, {allVersions: true})
        const isUnpublishedVersion = !Object.keys(packageNpm.versions).includes(packageFile.version)
        core.setOutput('is-unpublished-version', isUnpublishedVersion.toString())
        core.setOutput('latest-published-version', packageNpm['dist-tags'].latest)
        core.setOutput('repo-version', packageFile.version)
    } catch (error) {
        core.setFailed(error.message)
    }
}

run()
