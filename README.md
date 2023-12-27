# Check Package Version

[![build-test status](https://github.com/PostHog/check-package-version/workflows/build-test/badge.svg)](https://github.com/actions/typescript-action/actions)
[![MIT License](https://img.shields.io/badge/License-MIT-red.svg)](https://opensource.org/licenses/MIT)

Automate version comparison between the package.json version in your repository and the latest version on npm. This GitHub Action facilitates the seamless publishing of new versions for your npm packages, allowing you to streamline your release process effortlessly.

By [PostHog](https://posthog.com) & dupasj (https://github.com/dupasj).

## Usage

```yml
- name: Check out repository
  uses: actions/checkout@v2

- name: Check patched package version
  id: patch
  uses: PostHog/check-package-version@v2
  with:
      version: ^

- name: Check minor package version
  id: minor
  uses: PostHog/check-package-version@v2
  with:
      version: ~

- name: Check minor package version
  id: latest
  uses: PostHog/check-package-version@v2

- name: Echo Patch package version
  run: |
      echo "Committed version: ${{ steps.patch.outputs.committed-version }}"
      echo "Retrieved version: ${{ steps.patch.outputs.retrieved-version }}"
      echo "Has been published: ${{ steps.patch.outputs.is-published }}"
      echo "Is commited version free: ${{ steps.patch.outputs.is-committed-version-free }}"
      echo "Is your version greater: ${{ steps.patch.outputs.result }}"

- name: Echo Minor package version
  run: |
      echo "Committed version: ${{ steps.minor.outputs.committed-version }}"
      echo "Retrieved version: ${{ steps.minor.outputs.retrieved-version }}"
      echo "Has been published: ${{ steps.minor.outputs.is-published }}"
      echo "Is commited version free: ${{ steps.minor.outputs.is-committed-version-free }}"
      echo "Is your version greater: ${{ steps.minor.outputs.result }}"

- name: Echo Latest package version
  run: |
      echo "Committed version: ${{ steps.latest.outputs.committed-version }}"
      echo "Retrieved version: ${{ steps.latest.outputs.retrieved-version }}"
      echo "Has been published: ${{ steps.latest.outputs.is-published }}"
      echo "Is commited version free: ${{ steps.latest.outputs.is-committed-version-free }}"
      echo "Is your version greater: ${{ steps.latest.outputs.result }}"
```

### Action inputs

All inputs are **optional**. If not specified, sensible defaults will be used.

| Name       | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Default  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `operator` | The operator used for version comparison between the retrieved version and the committed version. The left side represents the retrieved version, and the right side represents the committed version. The default value is `>` meaning the action's 'result' output is true if RETRIEVED_VERSION > COMMITTED_VERSION. If no version data could be retrieved, the action result is 'UNKNOWN'.                                                                                  | `>`      |
| `path`     | The path to the `package.json` file or the directory containing the `package.json` file.                                                                                                                                                                                                                                                                                                                                                                                       | `.`      |
| `scope`    | The scope used to retrieve version information. If not defined, the action will determine the scope from your package's name.                                                                                                                                                                                                                                                                                                                                                  |          |
| `registry` | The registry URL for the npm package. If not defined, the action will determine the registry from the package's publish registry in `package.json` or from the configured registry related to your scope. If no registry is found, the default value is "https://registry.npmjs.org".                                                                                                                                                                                          |          |
| `token`    | The Bearer authentication token for accessing your npm registry. If not defined, the action will attempt to fetch the token from your `.npmrc` configuration.                                                                                                                                                                                                                                                                                                                  |          |
| `version`  | The expected version/tags of the package to retrieve. The value can be a SemVer value or a tag. The action will attempt to find the version from the tags; otherwise, the retrieved version will be the maximum version available based on your given SemVer value. You can also provide the value '~' to retrieve the latest patched version of your committed version and '^' to retrieve the latest minor version of your committed version. The default value is "latest". | `latest` |
| `package`  | The name of the npm package. If provided, it overrides the package name retrieved from your `package.json`.                                                                                                                                                                                                                                                                                                                                                                    |          |

### Action outputs

The following outputs can be used by subsequent workflow steps.

| Name                | Description                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `committed-version` | Version now commited to the repo                                                          |
| `published-version` | Latest version published to npm, based on `dist-tags`                                     |
| `is-new-version`    | Whether repo version is new to npm (has not been published before), `'true'` or `'false'` |

### Workflow example

Here's a simple example of a GitHub Actions workflow running `npm publish` automatically when `package.json` version is avialable in the default branch:

```yml
name: 'Autopublish'

on:
    push:
        branches:
            - main
            - master

jobs:
    autopublish:
        runs-on: ubuntu-latest
        permissions:
            contents: read
            packages: write
        steps:
            - uses: actions/checkout@v3
            - name: Setup NodeJS
              uses: actions/setup-node@v3
              with:
                  node-version: 16
                  registry-url: https://npm.pkg.github.com/
            - name: Check package version
              id: cpv
              uses: dupy-ts/check-package-version@main
              env:
                  NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
            - name: Echo output
              run: |
                  echo "Committed version: ${{ steps.cpv.outputs.committed-version }}"
                  echo "Retrieved version: ${{ steps.cpv.outputs.retrieved-version }}"
                  echo "Has been published: ${{ steps.cpv.outputs.is-published }}"
                  echo "Is commited version free: ${{ steps.cpv.outputs.is-committed-version-free }}"
                  echo "Result: ${{ steps.cpv.outputs.result }}"
            - name: Install dependencies
              if: steps.cpv.outputs.is-committed-version-free == 'true'
              run: npm ci
              env:
                  NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
            - name: Update package's registry
              if: steps.cpv.outputs.is-committed-version-free == 'true'
              run: echo "$(jq '.publishConfig.registry = "https://npm.pkg.github.com"' package.json)" > package.json
            - name: Publish package
              if: steps.cpv.outputs.is-committed-version-free == 'true'
              run: npm publish --@dupy-ts:registry=https://npm.pkg.github.com
              env:
                  NODE_AUTH_TOKEN: ${{secrets.GITHUB_TOKEN}}
```

Here is an updated version that I personnaly use to run Typescript & Eslint check first:

```
name: 'Autopublish'

on:
    push:
        branches:
            - main
            - master

jobs:
  check_typescript:
    name: Check TypeScript
    runs-on: ubuntu-latest
    steps:
      - name: Setup NodeJS
        uses: actions/setup-node@v3
        with:
          node-version: 16
          registry-url: https://npm.pkg.github.com/
      - uses: actions/checkout@v3
      - name: Install dependencies
        run: npm ci
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      - name: Check TypeScript
        run: npx tsc --noEmit
  check_eslint:
    name: Check Eslint
    runs-on: ubuntu-latest
    steps:
      - name: Setup NodeJS
        uses: actions/setup-node@v3
        with:
          node-version: 16
          registry-url: https://npm.pkg.github.com/
      - uses: actions/checkout@v3
      - name: Install dependencies
        run: npm ci
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      - name: Check EsLint
        run: npx eslint ./src/** --quiet --ext .js,.jsx,.ts,.tsx -c ./.eslintrc.js
        env:
          NODE_AUTH_TOKEN: ${{secrets.GITHUB_TOKEN}}
  publish:
    needs: [check_typescript,check_eslint]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
    steps:
      - uses: actions/checkout@v3
      - name: Setup NodeJS
        uses: actions/setup-node@v3
        with:
          node-version: 16
          registry-url: https://npm.pkg.github.com/
      - name: Check package version
        id: cpv
        uses: dupy-ts/check-package-version@main
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      - name: Echo output
        run: |
            echo "Committed version: ${{ steps.cpv.outputs.committed-version }}"
            echo "Retrieved version: ${{ steps.cpv.outputs.retrieved-version }}"
            echo "Has been published: ${{ steps.cpv.outputs.is-published }}"
            echo "Is commited version free: ${{ steps.cpv.outputs.is-committed-version-free }}"
            echo "Result: ${{ steps.cpv.outputs.result }}"
      - name: Install dependencies
        if: steps.cpv.outputs.is-committed-version-free == 'true'
        run: npm ci
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      - name: Update package's registry
        if: steps.cpv.outputs.is-committed-version-free == 'true'
        run: echo "$(jq '.publishConfig.registry = "https://npm.pkg.github.com"' package.json)" > package.json
      - name: Publish package
        if: steps.cpv.outputs.is-committed-version-free == 'true'
        run: npm publish --@dupy-ts:registry=https://npm.pkg.github.com
        env:
          NODE_AUTH_TOKEN: ${{secrets.GITHUB_TOKEN}}
```

## Questions?

### [Join the PostHog Slack community.](posthog.com/slack)
