# Markdown Reference Preview Demo

普通文件引用会显示文件类型图标，并且可以点击打开：

src/example.ts

也支持使用行内代码来避免路径和周围文字混在一起：`src/example.ts`

行范围会跳转并选中对应代码：

`src/example.ts:12-20`

符号引用通过 VS Code 的语言服务定位。字段可以使用完整的嵌套路径，也可以只写字段名：

- `src/example.ts#User.email`
- `src/example.ts#email`
- `src/example.ts#findUser`

加上 `preview=true` 后，引用位置会直接展开源码：

`src/example.ts:12-20?preview=true`

配置文件和 Markdown 文件会使用不同的文件图标：

- `config/settings.json#preview`
- `notes/design.md`
