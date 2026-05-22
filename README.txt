magiorix 项目工作目录

当前目录是实际项目主目录：
- assets\1.1.1：客户端前端资源目录
- runtime\magiorix-desktop：重新打包 exe 所需的 Electron 运行时和 app.asar
- red-magic-api：服务器后端和管理后台
- scripts：补丁脚本和安装包打包脚本

客户端资源会同步到实际软件加载位置：
- C:\Users\liuhao_PC\AppData\Roaming\magiorix-desktop\assets\1.1.1

打包：
- 运行 scripts\build-magiorix-windows-installer.ps1
- 输入依赖只来自当前项目目录下的 runtime\magiorix-desktop 和 assets\1.1.1
- 安装包输出到 desktop-versions\windows\1.1.1\magiorix-desktop-1.1.1-windows.exe
- 当前主安装器使用 NSIS，需要本机已有 makensis.exe（默认检查 C:\Program Files (x86)\NSIS\makensis.exe）
- 安装日志写入 %TEMP%\magiorix-install.log
- 打包时会生成 assets\1.1.1\integrity-manifest.json，并重新生成 magiorix-desktop-1.1.1-assets.zip

本地 Cookie：
- 推荐放在 D:\download\pic-vec\pgydata\pgy-cookie.txt
- 内容可以是整行 Cookie、JSON 对象 Cookie/cookie 字段，或 [{name,value}] Cookie 数组

当前改动：
- 客户端服务器地址改为 https://xhs.red-magic.cn
- 手机号注册/登录不再依赖验证码
- 登录后默认进入蒲公英博主采集页面
- 后端提供 /admin 管理后台，可给用户加积分
- 采集扣费后余额显示做了容错，避免 balanceAfter 缺失导致白屏
- 启动时会校验前端资源 integrity-manifest.json；校验失败会提示“资源被修改或损坏”并禁止进入主界面
- 当前防拆只是提高普通拆包和篡改成本，不承诺绝对防逆向
