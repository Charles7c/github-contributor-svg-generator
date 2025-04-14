# github-contributor-svg-generator

## 简介

生成 GitHub 组织或仓库贡献者 SVG 图，基于 GitHub 的 `/repos/{owner}/{repo}/contributors` 接口获取贡献者数据，并生成贡献者 SVG 图。

本项目 Fork 自 [ShenQingchuan/github-contributor-svg-generator](https://github.com/ShenQingchuan/github-contributor-svg-generator)。

## 和原项目区别

原项目是根据仓库 Pull Request 及其相关用户的 Commit 数量制作贡献者 SVG 图，不会统计没有提交过 Pull Request 的用户。

本项目是基于 GitHub 的 [/repos/{owner}/{repo}/contributors](https://docs.github.com/zh/rest/repos/repos?apiVersion=2022-11-28#list-repository-contributors) 接口获取贡献者数据生成贡献者 SVG 图，并且支持生成组织贡献者 SVG 图（汇总组织下所有仓库贡献者前 100 名）。

## 使用方法

```bash
# 获取 GitHub Token
略

# 克隆项目
git clone https://github.com/charles7c/github-contributor-svg-generator.git

# 安装依赖
pnpm install

# 运行1：生成 continew-org/continew-admin 仓库贡献者 SVG 图（替换下方 <GitHub Token> 为真实值）
pnpm tsx src/main.ts -t <GitHub Token> -o continew-org -r continew-admin

# 运行2：生成 continew-org 贡献者 SVG 图（替换下方 <GitHub Token> 为真实值）
pnpm tsx src/main.ts -t <GitHub Token> -o continew-org
```

**提示：** 执行完成后会在你项目的根目录创建一个 `.github-contributors` 文件夹来存放 SVG 文件。
