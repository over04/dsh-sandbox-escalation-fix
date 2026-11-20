# dsh-sandbox-escalation-fix

[English](README.md) | 简体中文

DeepSeek Harness 插件，用于减少因无效沙箱提权请求而失败的工具调用。

## 功能

插件只向模型展示当前会话可用的提权选项。会话已有全权限或关闭审批时，隐藏 `sandbox_permissions` 和 `justification`。原生模式和 PTC 模式中的 `bash`、`pwsh`、`write`、`edit`，以及 PTC 外层的 `run_code` 都适用。沙箱限制和审批仍由 DSH 处理。

## 安装

```sh
dsh plugin --profile web add github:over04/dsh-sandbox-escalation-fix#main
```

如果使用其他 Profile，把 `web` 换成对应名称。要固定版本，可以把 `main` 换成提交 SHA。安装后重启 DSH，无需额外配置。

如果要从本地安装，按下方命令完成构建，再用仓库的绝对路径替换安装命令中的 `github:` 参数。

卸载：

```sh
dsh plugin --profile web remove dsh-sandbox-escalation-fix
```

## 支持范围

需要 Node.js `^22.19.0` 或 `>=24.0.0`。同一 Profile 内的 DSH 软件包应保持版本一致。外层 `run_code` 修复已在 DSH `0.2.2-rc.5` 验证。

## 开发

```sh
npm ci
npm test
npm run build
```

构建后，将 `DSH_INSTALL_DIR` 设置为 DSH 的 npm 安装目录绝对路径，再运行 `npm run test:ptc`，即可执行 PTC 集成测试。

## 许可证

[MIT](LICENSE)
