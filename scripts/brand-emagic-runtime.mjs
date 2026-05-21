import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appName = "易美数据抓取";
const logoPath = path.join(repoRoot, "user-images-keep", "icon-C5uRQp1m.png");
const asarPath = path.join(repoRoot, "runtime", "@zsdesktop", "resources", "app.asar");
const asarModulePath = path.join(
  repoRoot,
  "analysis",
  "asar-tool",
  "node_modules",
  "@electron",
  "asar",
  "lib",
  "asar.js",
);

const asar = await import(pathToFileURL(asarModulePath).href);
const workDir = path.join(
  process.env.TEMP || process.env.TMP || repoRoot,
  `pgydata-asar-brand-${Date.now()}`,
);
const nextAsarPath = path.join(
  process.env.TEMP || process.env.TMP || repoRoot,
  `app-brand-${Date.now()}.asar`,
);

function replaceBrandText(text) {
  return text
    .split("PYGdata Desktop")
    .join(`${appName} Desktop`)
    .split("PYGdata")
    .join(appName)
    .split("紫薯通告 Desktop")
    .join(`${appName} Desktop`)
    .split("紫薯通告")
    .join(appName);
}

function patchRuntimeStartup(main) {
  const oldDomainExpression = '"https://api." + "red-magic.cn"';
  const normalizeRemoteData = `const c = JSON.parse(r);
            if (c && c.data && typeof c.data.downloadUrl == "string") {
              const u = ${oldDomainExpression};
              c.data.downloadUrl.startsWith(u) && (K.warn("远程资源地址仍是旧域名，已切换到新域名"), c.data.downloadUrl = c.data.downloadUrl.replace(u, lo));
            }
            c.code === 200 && c.data ?`;

  main = main.replace(
    `const c = JSON.parse(r);
            c.code === 200 && c.data ?`,
    normalizeRemoteData,
  );

  main = main.replace(
    `async function Wi() {
  jt("正在检查版本..."), zt(10);
  try {
    const a = await Ae.getRemoteVersion();
    Ee.info("远程版本:", a.version), jt(\`正在下载 \${a.version}...\`), zt(30);
    const e = await Ae.downloadAssets(a, (t) => {
      zt(30 + t * 0.5), jt(\`正在下载... \${Math.round(t)}%\`);
    });
    jt("正在解压资源包..."), zt(85), await Ae.applyAssets(e, a.version), jt("更新完成"), zt(100), Yr(), Ga(Ae.getCurrentAssetsPath());
  } catch (a) {
    Ee.error("资源获取失败:", a), Xr(a instanceof Error ? a.message : "资源下载失败");
  }
}`,
    `async function Wi() {
  jt("正在检查版本..."), zt(10);
  const a = Ae.getCurrentAssetsPath(), e = kt(Oe(a, "index.html")), t = Oe(ec, "../dist"), n = kt(Oe(t, "index.html"));
  try {
    const s = Ae.getLocalVersion(), i = await Ae.getRemoteVersion();
    if (Ee.info("远程版本:", i.version), s && s === i.version && e) {
      Ee.info("本地资源版本已是最新，跳过下载"), jt("正在启动..."), zt(100), Yr(), Ga(a);
      return;
    }
    Ee.info("远程资源地址:", i.downloadUrl), jt(\`正在下载 \${i.version}...\`), zt(30);
    const o = await Ae.downloadAssets(i, (r) => {
      zt(30 + r * 0.5), jt(\`正在下载... \${Math.round(r)}%\`);
    });
    jt("正在解压资源包..."), zt(85), await Ae.applyAssets(o, i.version), jt("更新完成"), zt(100), Yr(), Ga(Ae.getCurrentAssetsPath());
  } catch (s) {
    Ee.error("资源获取失败，尝试使用本地资源继续启动:", s);
    const i = e ? a : n ? t : null;
    if (i) {
      jt("正在启动..."), zt(100), Yr(), Ga(i);
      return;
    }
    Xr(s instanceof Error ? s.message : "资源下载失败");
  }
}`,
  );

  return main;
}

try {
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.mkdirSync(workDir, { recursive: true });
  asar.extractAll(asarPath, workDir);

  for (const relativePath of [
    "dist-electron/static/logo.png",
    "electron-main/static/logo.png",
  ]) {
    const target = path.join(workDir, relativePath);
    if (fs.existsSync(path.dirname(target))) {
      fs.copyFileSync(logoPath, target);
    }
  }

  for (const relativePath of [
    "dist-electron/static/splash.html",
    "electron-main/static/splash.html",
  ]) {
    const target = path.join(workDir, relativePath);
    if (fs.existsSync(target)) {
      fs.writeFileSync(target, replaceBrandText(fs.readFileSync(target, "utf8")), "utf8");
    }
  }

  const packagePath = path.join(workDir, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  packageJson.productName = appName;
  packageJson.description = "易美数据抓取桌面客户端";
  fs.writeFileSync(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`, "utf8");

  const mainPath = path.join(workDir, "dist-electron", "index.js");
  let main = fs.readFileSync(mainPath, "utf8");
  if (!main.includes(`ye.setName("${appName}")`)) {
    main = main.replace(
      'import * as Da from "node-cron";\nconst Fe =',
      `import * as Da from "node-cron";\nye.setName("${appName}");\nconst Fe =`,
    );
  }
  main = main.replace(
    "new Dt({\n      width: 500,",
    `new Dt({\n      title: "${appName}",\n      icon: Oe(Gr, "static/logo.png"),\n      width: 500,`,
  );
  main = main.replace(
    "new Dt({\n    width: e.width,",
    `new Dt({\n    title: "${appName}",\n    icon: Oe(Gr, "static/logo.png"),\n    width: e.width,`,
  );
  main = patchRuntimeStartup(main);
  fs.writeFileSync(mainPath, main, "utf8");

  await asar.createPackage(workDir, nextAsarPath);
  fs.copyFileSync(nextAsarPath, asarPath);
  console.log(`Updated ${asarPath}`);
} finally {
  fs.rmSync(workDir, { recursive: true, force: true });
  fs.rmSync(nextAsarPath, { force: true });
}
