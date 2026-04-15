# 构建操作手册（npm / yarn）

本项目支持用 npm 或 yarn 构建，二选一即可。以下是每种方式的完整操作步骤。

---

## 一、前置要求

| 依赖 | 版本 | 检查命令 |
|------|------|----------|
| Node.js | ≥ 20 | `node -v` |
| npm | 随 Node 自带 | `npm -v` |
| yarn（可选） | v1.22+ | `yarn -v`，没装用 `npm i -g yarn` |

---

## 二、使用 npm 构建

### 步骤 1：安装依赖

```bash
npm install
```
生成/更新 `node_modules/` 和 `package-lock.json`。首次执行或 `package.json` 变动后执行。

### 步骤 2：执行构建

```bash
npm run build
```
内部依次执行：
1. `tsc -b tsconfig.app.json tsconfig.node.json` —— 业务代码类型检查
2. `vite build` —— 打包输出到 `dist/`

### 步骤 3：查看产物

```bash
ls dist/
```
包含 `index.html`、`assets/*.js`、`assets/*.css`。

### 步骤 4（可选）：本地预览产物

```bash
npm run preview
```
启动本地静态服务器，浏览器打开终端显示的地址。

---

## 三、使用 yarn 构建

### 步骤 1：安装依赖

```bash
yarn install
```
或简写 `yarn`。生成/更新 `node_modules/` 和 `yarn.lock`。

### 步骤 2：执行构建

```bash
yarn build
```
内部依次执行：
1. `tsc -b tsconfig.app.json tsconfig.node.json` —— 业务代码类型检查
2. `vite build` —— 打包输出到 `dist/`

### 步骤 3：查看产物

```bash
ls dist/
```

### 步骤 4（可选）：本地预览产物

```bash
yarn preview
```

---

## 四、一键构建（推荐）

常规的 `build` 只做类型检查 + 打包。如果希望**一条命令走完"代码检查 + 测试 + 构建"全流程**，用下面的组合命令。

### 可用命令

| 场景 | npm | yarn | 执行内容 |
|------|-----|------|----------|
| 完整流程（发版 / 提 PR 前） | `npm run build:all` | `yarn build:all` | lint → test → tsc → vite build |
| 快速流程（跳过测试） | `npm run build:quick` | `yarn build:quick` | lint → tsc → vite build |

> `build:all` 和 `build:quick` 内部直接调用 `eslint`/`vitest`/`tsc`/`vite`，**不绑定 npm 或 yarn**，两种方式执行完全等价。

### 执行细节

`build:all` 内部顺序（任一步失败立即中断）：
1. `eslint . --max-warnings 0` —— 代码检查（严格模式，0 warning）
2. `vitest run` —— 单次运行全部测试
3. `tsc -b tsconfig.app.json tsconfig.node.json` —— 业务代码类型检查
4. `vite build` —— 打包产物到 `dist/`

`build:quick` 跳过第 2 步测试，其他相同。

### 使用建议

- **发版前**：`npm run build:all` / `yarn build:all`
- **日常临时出包**：`npm run build:quick` / `yarn build:quick`
- **纯打包验证（最快）**：`npm run build:fast` / `yarn build:fast`
- **依赖变更时**：先 `npm install` 或 `yarn install`，再跑上面命令（依赖安装未包含在一键命令里，避免 npm/yarn 混用）

---

## 五、测试代码是否参与构建？

**不参与。** 无论用 npm 还是 yarn，`build` 命令默认都跳过测试代码的类型检查与打包。

### 原因

1. **类型检查阶段（`tsc -b`）**
   - `build` 只传入 [tsconfig.app.json](../tsconfig.app.json) 和 [tsconfig.node.json](../tsconfig.node.json)
   - app config 的 `exclude` 已排除 `*.test.ts(x)`、`*.spec.ts(x)` 和 [src/test/](../src/test/)
   - [tsconfig.test.json](../tsconfig.test.json) 不在 `build` 命令里，只有手动跑 `typecheck:test` 才会检查

2. **打包阶段（`vite build`）**
   - Vite 从入口 [src/main.tsx](../src/main.tsx) 顺着 `import` 依赖图走
   - 测试文件没有被业务代码 import，自然不会进入产物

### 各命令的行为对照

| 命令 | 业务代码类型检查 | 测试类型检查 | 测试打包 |
|------|:---:|:---:|:---:|
| `npm run build` / `yarn build` | ✅ | ❌ | ❌ |
| `npm run build:fast` / `yarn build:fast` | ❌ | ❌ | ❌ |
| `npm run typecheck:test` / `yarn typecheck:test` | ❌ | ✅ | ❌ |

### 测试类型检查如何做

测试代码的类型检查是**独立流程**，不会被构建自动触发。需要时手动执行：

```bash
npm run typecheck:test     # 或 yarn typecheck:test
```

建议把该命令接入 lint-staged 或 CI，保证测试代码也有类型保障。

---

## 六、其他构建相关命令

| 目的 | npm | yarn |
|------|-----|------|
| 跳过类型检查，仅打包（应急） | `npm run build:fast` | `yarn build:fast` |
| 只做测试类型检查 | `npm run typecheck:test` | `yarn typecheck:test` |
| 启动开发服务器 | `npm run dev` | `yarn dev` |
| 运行测试 | `npm run test:run` | `yarn test:run` |
| 代码检查 | `npm run lint` | `yarn lint` |
| 清理构建缓存 | `rm -rf dist node_modules/.tmp` | 同左 |

---

## 七、构建失败速查

| 报错特征 | 处理方式 |
|----------|----------|
| `error TS6133` / `TS2322` 等 TS 开头 | 类型错误，按报错文件:行号修代码 |
| `[plugin:vite:xxx]` / `Transform failed` | Vite 打包错误，检查 import 路径、环境变量 |
| `Cannot find module xxx` | 依赖缺失，重装：`npm install` 或 `yarn install` |
| 需紧急出包、无暇修类型 | `npm run build:fast` 或 `yarn build:fast` 跳过 tsc |
| 构建缓存异常 | `rm -rf dist node_modules/.tmp` 后重试 |

---

## 八、注意事项

1. **不要同时使用 npm 和 yarn**：选定一个后只保留对应 lockfile（`package-lock.json` 或 `yarn.lock`），避免依赖版本漂移。
2. **CI 与本地保持一致**：本地用 npm，CI 也用 npm；yarn 同理。
3. **构建前确保 git 工作区干净**：避免把未提交改动打进产物。
