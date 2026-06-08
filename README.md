# 五子棋在线

手机 H5 五子棋在线版，适合部署到 GitHub Pages，并通过微信或 iPhone 浏览器打开。

## 功能

- 用户名 + 口令登录，用户名唯一
- AI 对战，登录后 AI 胜局可获得 AI 积分
- 好友搜索、好友申请、好友约战
- 真人随机匹配
- 真人落子由 Supabase 数据库函数校验
- 真人排行和 AI 排行分开
- 当前赛季 60 天，赛季总分不封顶

## 积分规则

- 真人有效完赛至少 10 手。
- 真人胜方基础 +20，按对局时长增加，单局最高 +50。
- 真人败方按对局时长获得安慰分，最高 +9。
- 真人平局双方按时长获得少量分，最高 +20。
- AI 有效局至少玩家落子 8 手。
- AI 对战只有玩家胜利才加分，基础 +20，按时长增加，单局最高 +30。
- 赛季排行分数无限累加，不设总上限。

## 部署

1. 创建 Supabase 项目。
2. 在 Supabase SQL Editor 执行 `supabase/schema.sql`。
3. 在 Supabase Authentication 设置里关闭邮箱确认。
4. 把 `app.js` 顶部的 `SUPABASE_URL` 和 `SUPABASE_ANON_KEY` 换成你的项目配置。
5. 推送到 GitHub。

线上地址：

`https://makew8660.github.io/wuziqi-ai/`

详细步骤见 `SUPABASE-SETUP.md`。
