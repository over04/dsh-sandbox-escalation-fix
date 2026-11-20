# dsh-sandbox-escalation-fix

English | [简体中文](README.zh.md)

A DeepSeek Harness plugin that reduces failed tool calls caused by invalid sandbox escalation requests.

## What it does

The plugin shows the model only the escalation options available in the current session. With full access or approvals disabled, it hides `sandbox_permissions` and `justification`. This applies to `bash`, `pwsh`, `write`, and `edit` in both Native and PTC modes, as well as the outer PTC `run_code` tool. DSH still enforces the sandbox and handles approvals.

## Installation

```sh
dsh plugin --profile web add github:over04/dsh-sandbox-escalation-fix#main
```

If you use a different profile, replace `web` with its name. To pin a version, replace `main` with a commit SHA. Restart DSH after installing; no plugin configuration is required.

To install a local checkout, build it using the commands below and pass the repository's absolute path in place of the `github:` spec.

To uninstall:

```sh
dsh plugin --profile web remove dsh-sandbox-escalation-fix
```

## Compatibility

Requires Node.js `^22.19.0` or `>=24.0.0`. Keep the DSH packages in the profile on the same version. The outer `run_code` fix was tested with DSH `0.2.2-rc.5`.

## Development

```sh
npm ci
npm test
npm run build
```

To run the PTC integration test after building, set `DSH_INSTALL_DIR` to the absolute path of the DSH npm installation and run `npm run test:ptc`.

## License

[MIT](LICENSE)
