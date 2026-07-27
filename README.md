# Markdown Reference Preview

为 VS Code 内置 Markdown 预览增加可点击的文件引用、文件类型图标、行号跳转和源码内嵌预览。

文件图标会复用当前 `workbench.iconTheme` 的文件名、扩展名和语言映射，与资源管理器保持一致；SVG/PNG 和字体型 File Icon Theme 均受支持。主题无法读取或没有对应定义时才回退到 Codicon。

引用在预览中显示为紧凑的 outline 标签：常态使用 VS Code 的淡蓝链接色，hover 时提高边框和背景对比并显示链接下划线。符号引用不会继续显示文件图标，而是异步读取 `DocumentSymbol.kind`，使用与 Outline 视图一致的字段、方法、类等 Symbol Codicon；语言服务返回后预览会自动刷新。

## 引用格式

```markdown
src/example.ts
`src/example.ts`
`src/example.ts:300-330`
`src/example.ts:300-330?preview=true`
`src/example.ts#User.email`
```

- `path/to/file`：显示带文件图标的链接，点击后在 VS Code 中打开文件。
- `path/to/file:300-330`：打开文件并定位到第 300 至 330 行；单行可写成 `:300`。
- `path/to/file:300-330?preview=true`：在当前位置直接显示这段源码，标题仍可点击跳转。
- `path/to/file#User.email`：通过 VS Code 的文档符号提供器跳转到类、方法或字段；嵌套符号使用点路径。

符号引用的预览标签只显示文件名与符号，例如 `src/main/java/A.java#testFunction` 会显示为 `A.java#testFunction`；完整路径仍用于跳转并保留在悬浮提示中。

普通文本和 Markdown 行内代码中的引用都会被识别。只有实际存在的文件或目录会被转换，因此普通的斜杠文本不会产生无效链接。相对路径会先基于当前 Markdown 文件解析，再尝试工作区根目录；以 `/` 开头的路径基于工作区根目录解析。

符号跳转优先使用目标语言的 VS Code 文档符号提供器。语言服务未提供符号结果时，插件会按最后一级标识符进行文本定位；仍未找到时会打开文件并显示提示。

内嵌预览仅读取本地 UTF-8 文本文件。未指定范围时最多显示前 200 行，超过 1 MiB 的文件和二进制文件不会直接展开。

## 开发

```shell
bun install
bun run compile
bun run test
```

在 VS Code 中运行 `Run Extension (sample)` 调试配置，然后打开 `sample/README.md` 的 Markdown 预览即可查看完整 demo。
