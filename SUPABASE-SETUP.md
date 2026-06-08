# Supabase 配置步骤

这个项目的网页仍然放在 GitHub Pages，账号、好友、真人对战和积分放在 Supabase。

## 1. 创建项目

1. 打开 `https://supabase.com/`
2. 新建一个 Project
3. 进入项目后，打开 `Project Settings` -> `API`
4. 复制 `Project URL`
5. 复制 `anon public` key

## 2. 建数据库

1. 打开 Supabase 左侧 `SQL Editor`
2. 新建查询
3. 把 `supabase/schema.sql` 全部复制进去
4. 点击 `Run`

执行成功后，会自动创建：

- 用户资料
- 好友关系
- 真人对局
- 落子记录
- 随机匹配队列
- 60 天赛季
- 真人积分和 AI 积分
- 排行榜函数

## 3. 关闭邮箱验证

为了让“用户名 + 口令”注册后能马上登录，需要关闭邮箱验证：

1. 打开 `Authentication`
2. 打开 `Providers`
3. 找到 `Email`
4. 关闭 `Confirm email`

## 4. 填入网页配置

打开 `app.js`，找到顶部这两行：

```js
const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
```

替换成你自己的 Supabase 配置。

当前项目已经填入：

```js
const SUPABASE_URL = "https://uodxphojjxkytbxsnebg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_P47o5r2GMZ98XzJCaWZk2w_10YSVaW-";
```

只放 `anon public` key，不要放 `service_role` key。

## 5. 推送上线

配置填好后提交并推送到 GitHub，原来的 GitHub Pages 地址不变：

`https://makew8660.github.io/wuziqi-ai/`

## 微信登录说明

第一版只做用户名和口令登录。正式微信登录需要认证公众号或微信开放平台应用，还要配置授权回调域名。

数据库已经预留：

- `wechat_openid`
- `wechat_unionid`

前端也保留了微信登录按钮，后面可以继续接入。
