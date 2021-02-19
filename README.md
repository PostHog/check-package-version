# Check Package Version

[![build-test status](https://github.com/PostHog/check-package-version/workflows/build-test/badge.svg)](https://github.com/actions/typescript-action/actions)
[![MIT License](https://img.shields.io/badge/License-MIT-red.svg)](https://opensource.org/licenses/MIT)

GitHub action to compare `package.json` version between the current repo state and [npm](https://npmjs.com). Publish new versions of your npm packages hands-free!

By [PostHog](https://posthog.com).

## Usage

```yml
- name: Check out repository
  uses: actions/checkout@v2

- name: Check package version
  id: cpv
  uses: PostHog/check-package-version@v2

- name: Echo output
  run: |
      echo "Committed version: ${{ steps.cpv.outputs.committed-version }}"
      echo "Published version: ${{ steps.cpv.outputs.published-version }}"
      echo "Is new version: ${{ steps.cpv.outputs.is-new-version }}"
```

### Action inputs

All inputs are **optional**. If not set, sensible defaults will be used.

| Name   | Description             | Default |
| ------ | ----------------------- | ------- |
| `path` | Path to the npm package | `.`     |

### Action outputs

The following outputs can be used by subsequent workflow steps.

| Name                | Description                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `committed-version` | Version now commited to the repo                                                          |
| `published-version` | Latest version published to npm, based on `dist-tags`                                     |
| `is-new-version`    | Whether repo version is new to npm (has not been published before), `'true'` or `'false'` |

### Workflow example

Here's a simple example of a GitHub Actions workflow running `npm publish` automatically when `package.json` version is bumped in the default branch:

```yml
name: 'Autopublish'

on:
    push:
        branches:
            - main
            - master

jobs:
    autopublish:
        name: Publish release if package.json version was bumped
        runs-on: ubuntu-20.04
        steps:
            - name: Check out repository
              uses: actions/checkout@v2

            - name: Check package version
              id: cpv
              uses: PostHog/check-package-version@v2

            - name: Echo versions
              run: |
                  echo "Committed version: ${{ steps.cpv.outputs.committed-version }}"
                  echo "Published version: ${{ steps.cpv.outputs.published-version }}"

            - name: Install dependencies
              if: steps.cpv.outputs.is-new-version == 'true'
              run: npm ci

            - name: Publish new version
              if: steps.cpv.outputs.is-new-version == 'true'
              run: npm publish
```

## Questions?

### [Join the PostHog Slack community.](posthog.com/slack)
