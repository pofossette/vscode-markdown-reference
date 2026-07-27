# Markdown Reference Preview

为 VS Code 内置 Markdown 预览增加可点击的文件引用、文件类型图标、行号跳转和源码内嵌预览。

文件图标会复用当前 `workbench.iconTheme` 的文件名、扩展名和语言映射，与资源管理器保持一致；SVG/PNG 和字体型 File Icon Theme 均受支持。主题无法读取或没有对应定义时才回退到 Codicon。

源码预览会读取当前 `workbench.colorTheme` 的 TextMate `tokenColors` 和 `semanticTokenColors`，将关键字、字符串、注释、函数、类型、属性等 Highlight.js token 映射为与 VS Code 编辑器一致的颜色和字体样式；切换颜色主题后 Markdown 预览会自动刷新。

引用在预览中显示为紧凑的 outline 标签：常态继承 Markdown 正文颜色，hover 时切换为 VS Code 链接色并提高边框和背景对比，不显示下划线。符号引用不会继续显示文件图标，而是异步读取 `DocumentSymbol.kind`，并优先复用当前 `workbench.productIconTheme` 中与 Outline 视图一致的 `symbol-field`、`symbol-method`、`symbol-class` 等图标；当前主题未提供定义时才回退到默认 Codicon。

## 引用格式

```markdown
src/example.ts
`src/example.ts`
`src/example.ts:300-330`
`src/example.ts:300-330?preview=true`
`src/example.ts#User.email`
`src/example.ts#findUser?preview=true`
`src/example.ts:1-40?preview=true&highlight=1,5-10,30-35`
`src/example.ts#findUser?preview=true&focus=1,5-10`
```

- `path/to/file`：显示带文件图标的链接，点击后在 VS Code 中打开文件。
- `path/to/file:300-330`：打开文件并定位到第 300 至 330 行；单行可写成 `:300`。
- `path/to/file:300-330?preview=true`：在当前位置直接显示这段源码，标题仍可点击跳转。
- `path/to/file#User.email`：通过 VS Code 的文档符号提供器跳转到类、方法或字段；嵌套符号使用点路径。
- `path/to/file#findUser?preview=true`：读取文档符号的完整范围，只内嵌显示对应方法、字段或类的源码。
- `...?preview=true&highlight=1,5-10`：为预览片段的第 1、5 至 10 行增加高亮背景。
- `...?preview=true&focus=1,5-10`：聚焦指定行，其余行会模糊并降低透明度；hover 预览块时恢复全部代码。

`highlight` 与 `focus` 的行号都相对于当前展示的代码片段，从 `1` 开始；两者可以同时使用，也适用于 symbol preview。

符号引用的预览标签只显示文件名与符号，例如 `src/main/java/A.java#testFunction` 会显示为 `A.java#testFunction`；完整路径仍用于跳转并保留在悬浮提示中。

普通文本和 Markdown 行内代码中的引用都会被识别。只有实际存在的文件或目录会被转换，因此普通的斜杠文本不会产生无效链接。相对路径会先基于当前 Markdown 文件解析，再尝试工作区根目录；以 `/` 开头的路径基于工作区根目录解析。

符号跳转优先使用目标语言的 VS Code 文档符号提供器。语言服务未提供符号结果时，插件会按最后一级标识符进行文本定位；仍未找到时会打开文件并显示提示。

对于尚未在编辑器中打开的目标文件，插件会在后台加载文档、激活对应语言扩展，并等待文档符号提供器完成初始化。Kotlin 等依赖 LSP 的 symbol preview 不需要预先手动打开源码文件。

内嵌预览仅读取本地 UTF-8 文本文件。未指定范围时最多显示前 200 行，超过 1 MiB 的文件和二进制文件不会直接展开。
预览块标题只显示文件名（符号预览会显示为 `A.kt#hello`），以纯文本链接呈现；hover 时才切换为链接色。Symbol preview 会依据目标源码文件的 `editor.tabSize` 自动移除公共缩进，使方法或类型的最外层代码从第 0 列开始，同时保留内部相对缩进。

## 配置

- `markdownReference.fontSize`：文件和符号引用的字号（像素），默认 `13`，可在用户或工作区设置中配置。

## 开发

```shell
bun install
bun run compile
bun run test
```

在 VS Code 中运行 `Run Extension (sample)` 调试配置，然后打开 `sample/README.md` 的 Markdown 预览即可查看完整 demo。
