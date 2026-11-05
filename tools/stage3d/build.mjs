// 把 venue.js 和用到的 three.js 打包、壓縮成 assets/stage3d.js（網站直接載入，不需要建置工具）
// 用法：cd tools/stage3d && npm install && npm run build
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
await build({
  entryPoints: [path.join(here, "venue.js")],
  outfile: path.join(here, "../../assets/stage3d.js"),
  bundle: true,
  minify: true,
  format: "esm",
  target: "es2020",
  legalComments: "eof",
  logLevel: "info"
});
