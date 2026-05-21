const fs = require("fs");
const path = require("path");

const rendererPath = path.resolve(__dirname, "..", "assets", "1.1.1", "assets", "index-B09sHfUO.js");
let renderer = fs.readFileSync(rendererPath, "utf8");

function replaceOnce(from, to, label) {
  if (!renderer.includes(from)) {
    if (renderer.includes(to)) return;
    throw new Error(`Missing marker for ${label}`);
  }
  renderer = renderer.replace(from, to);
}

replaceOnce(
  '{field:"fansRegions",headerName:"粉丝省份分布",width:300},{field:"fansCities",headerName:"粉丝城市分布",width:300},{field:"fansInterests",headerName:"粉丝兴趣分布",width:300},{field:"fansDevices",headerName:"粉丝设备分布",width:300}]',
  '{field:"fansRegions",headerName:"粉丝省份分布",width:300},{field:"fansCities",headerName:"粉丝城市分布",width:300},{field:"fansInterests",headerName:"粉丝兴趣分布",width:300},{field:"fansDevices",headerName:"粉丝设备分布",width:300},{field:"fansProvinceChart",headerName:"粉丝省份分布图",width:320},{field:"fansCityChart",headerName:"粉丝城市分布图",width:320},{field:"fansAgeChart",headerName:"粉丝年龄分布图",width:320},{field:"fansGenderChart",headerName:"粉丝性别分布图",width:320},{field:"fansGrowthTrendChart",headerName:"粉丝增长趋势图",width:320}]',
  "table columns"
);

replaceOnce(
  '{group:"粉丝分布",label:"省份分布",key:"fansRegions"},{group:"粉丝分布",label:"城市分布",key:"fansCities"},{group:"粉丝分布",label:"兴趣分布",key:"fansInterests"},{group:"粉丝分布",label:"设备分布",key:"fansDevices"}]',
  '{group:"粉丝分布",label:"省份分布",key:"fansRegions"},{group:"粉丝分布",label:"城市分布",key:"fansCities"},{group:"粉丝分布",label:"兴趣分布",key:"fansInterests"},{group:"粉丝分布",label:"设备分布",key:"fansDevices"},{group:"粉丝图表",label:"粉丝省份分布图",key:"fansProvinceChart"},{group:"粉丝图表",label:"粉丝城市分布图",key:"fansCityChart"},{group:"粉丝图表",label:"粉丝年龄分布图",key:"fansAgeChart"},{group:"粉丝图表",label:"粉丝性别分布图",key:"fansGenderChart"},{group:"粉丝图表",label:"粉丝增长趋势图",key:"fansGrowthTrendChart"}]',
  "export headers"
);

replaceOnce(
  '{key:"fansRegions",label:"省份分布",defaultSelected:!0},{key:"fansCities",label:"城市分布"},{key:"fansInterests",label:"兴趣分布"},{key:"fansDevices",label:"设备分布"}]}]}',
  '{key:"fansRegions",label:"省份分布",defaultSelected:!0},{key:"fansCities",label:"城市分布"},{key:"fansInterests",label:"兴趣分布"},{key:"fansDevices",label:"设备分布"}]},{groupKey:"fans-charts",groupLabel:"粉丝图表",description:"生成并导出本地 PNG 图片路径",fields:[{key:"fansProvinceChart",label:"粉丝省份分布图"},{key:"fansCityChart",label:"粉丝城市分布图"},{key:"fansAgeChart",label:"粉丝年龄分布图"},{key:"fansGenderChart",label:"粉丝性别分布图"},{key:"fansGrowthTrendChart",label:"粉丝增长趋势图"}]}]}',
  "selection schema"
);

fs.writeFileSync(rendererPath, renderer, "utf8");
console.log("Renderer PGY chart fields patched.");
