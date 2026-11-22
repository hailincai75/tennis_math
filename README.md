# Tennis Math

Elsa 的网球比赛统计 app。这是一个 PWA 网页应用，装到 iPhone 主屏幕后可以离线使用，所有数据只存在手机本地。

开发规划见 [docs/PLAN.md](docs/PLAN.md)。

## 本地开发

```powershell
npm install
npm run dev        # 开发服务器
npm test           # 单元测试
npm run build      # 生产构建到 dist/
npm run preview    # 预览构建结果（http://localhost:4173）
npm run icons      # 重新生成 public/ 下的图标
```

## 部署到 GitHub Pages（只需要做一次）

1. 在 GitHub 上新建一个仓库（比如 `tennis_math`），把代码推上去。
2. 打开仓库的 **Settings → Pages**，把 **Source** 选成 **GitHub Actions**。
3. 以后每次推送到 `main` 分支，都会自动构建并发布到 `https://<你的用户名>.github.io/<仓库名>/`。

公开仓库可以免费使用 Pages。这里托管的只是程序本身，比赛数据只存在手机上。

## 安装到 iPhone

1. 用 **Safari** 打开上面的网址。
2. 点 **分享** → **添加到主屏幕**。
3. 以后**都从主屏图标打开**。主屏 app 和 Safari 标签页的数据是分开存的。
4. 测试离线：打开飞行模式，再从主屏图标启动 app，应该能正常打开。

app 有新版本时，首页会出现“有新版本可用”的提示，点“更新”就行。
