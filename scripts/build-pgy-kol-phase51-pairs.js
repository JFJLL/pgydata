// 生成 pgy-kol-phase51-pairs.json：Phase 5.1 前端 from/to 替换对。
// 运行：node scripts/build-pgy-kol-phase51-pairs.js
// 输出：scripts/pgy-kol-phase51-pairs.json
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
const extracted = JSON.parse(
  fs.readFileSync(path.join(process.env.TEMP || root, "pgy51", "pairs-extracted.json"), "utf8"),
);
const newcode = require("./pgy-kol-phase51-newcode.js");

const pairs = [];
function pair(key, to, label) {
  const from = extracted[key];
  if (from === undefined) throw new Error(`missing extracted key: ${key}`);
  pairs.push({ label, from, to });
}
// 少量修复需要 from 串来自当前基线源码而非 pairs-extracted.json（提取器未覆盖），
// 此处显式内联，并确保 from 在基线中唯一（build 后由 apply 脚本的歧义守卫复核）。
function pairInline(from, to, label) {
  pairs.push({ label, from, to });
}

pair("line971", newcode.newFilterState, "pgyKolToFilterState + schema-driven unproven set");
pair("featuredOptions", newcode.newFeaturedOptions, "精选博主键修正");
pair("defaultFilterFragment", newcode.newDefaultFilterFragment, "默认筛选新键");
pair(
  "brandPopupEffect",
  `m.useEffect(function(){if(!p.open)return;setDraft(Array.isArray(p.current)?p.current.slice():[]);setKeyword("");setOptions([]);setBrandError(null)},[p.open]);`,
  "品牌弹窗打开不再发空关键词请求",
);
pair(
  "rowCoopCredit",
  `o.jsx(PgyKolField,{label:"合作信用度",children:o.jsx(pgyKolRangeChips,{options:pgyKolRangeDefs51.inviteReply,value:filter.coopCredit,onToggle:function(n){toggleRange("coopCredit",n)}})}),`,
  "合作信用度范围选项",
);
pair(
  "rowPropagation",
  `o.jsx(PgyKolField,{label:"传播规模",children:[o.jsx(PgyKolField,{label:"曝光",children:o.jsx(pgyKolRangeChips,{options:pgyKolRangeDefs51.imp50w,value:filter.coopImpMedin,onToggle:function(n){toggleRange("coopImpMedin",n)}})}),o.jsx(PgyKolField,{label:"阅读",children:o.jsx(pgyKolRangeChips,{options:pgyKolRangeDefs51.imp50w,value:filter.coopReadMid,onToggle:function(n){toggleRange("coopReadMid",n)}})}),o.jsx(PgyKolField,{label:"互动",children:o.jsx(pgyKolRangeChips,{options:pgyKolRangeDefs51.inter2000,value:filter.coopInterMid,onToggle:function(n){toggleRange("coopInterMid",n)}})}),o.jsx(PgyKolField,{label:"外溢中位",children:o.jsx(pgyKolRangeChips,{options:pgyKolRangeDefs51.overflow10000,value:filter.coopOverflowMid,onToggle:function(n){toggleRange("coopOverflowMid",n)}})})]}),`,
  "传播规模四范围字段",
);
pair(
  "rowCpm",
  `o.jsx(PgyKolField,{label:"预估CPM",children:[o.jsx(PgyKolField,{label:"图文",children:o.jsx(pgyKolRangeChips,{options:pgyKolRangeDefs51.cpmPic,value:filter.estimatePictureCpm,onToggle:function(n){toggleRange("estimatePictureCpm",n)}})}),o.jsx(PgyKolField,{label:"视频",children:o.jsx(pgyKolRangeChips,{options:pgyKolRangeDefs51.cpmVideo,value:filter.estimateVideoCpm,onToggle:function(n){toggleRange("estimateVideoCpm",n)}})})]}),`,
  "预估CPM图文/视频",
);
pair(
  "rowReadCost",
  `o.jsx(PgyKolField,{label:"阅读单价",children:[o.jsx(PgyKolField,{label:"图文",children:o.jsx(pgyKolRangeChips,{options:pgyKolRangeDefs51.picRead,value:filter.estimatePicReadCost,onToggle:function(n){toggleRange("estimatePicReadCost",n)}})}),o.jsx(PgyKolField,{label:"视频",children:o.jsx(pgyKolRangeChips,{options:pgyKolRangeDefs51.videoRead,value:filter.estimateVideoReadCost,onToggle:function(n){toggleRange("estimateVideoReadCost",n)}})})]}),`,
  "预估阅读单价图文/视频",
);
pair(
  "rowInteractCost",
  `o.jsx(PgyKolField,{label:"互动单价",children:[o.jsx(PgyKolField,{label:"图文",children:o.jsx(pgyKolRangeChips,{options:pgyKolRangeDefs51.picEngage,value:filter.estimatePicEngageCost,onToggle:function(n){toggleRange("estimatePicEngageCost",n)}})}),o.jsx(PgyKolField,{label:"视频",children:o.jsx(pgyKolRangeChips,{options:pgyKolRangeDefs51.videoEngage,value:filter.estimateVideoEngageCost,onToggle:function(n){toggleRange("estimateVideoEngageCost",n)}})})]}),`,
  "预估互动单价图文/视频",
);
pair(
  "rowOverflowCost",
  `o.jsx(PgyKolField,{label:"外溢进店单价",children:o.jsx(pgyKolRangeChips,{options:pgyKolRangeDefs51.cpuv,value:filter.overflowCost,onToggle:function(n){toggleRange("overflowCost",n)}})}` + ")]})" + ",",
  "外溢进店单价范围",
);
pair(
  "rowLive",
  `o.jsx(PgyKolField,{label:"近30天直播场次",children:o.jsx(pgyKolRangeChips,{options:pgyKolRangeDefs51.liveCount,value:filter.liveCount30d,onToggle:function(n){toggleArr("liveCount30d",n)}})}),o.jsx(PgyKolField,{label:"场均观播人数",children:o.jsx(pgyKolRangeChips,{options:pgyKolRangeDefs51.liveViewer,value:filter.avgLiveViewer,onToggle:function(n){toggleArr("avgLiveViewer",n)}})}),o.jsx(PgyKolField,{label:"场均销售额",children:o.jsx(pgyKolRangeChips,{options:pgyKolRangeDefs51.liveGmv,value:filter.avgLiveGmv,onToggle:function(n){toggleArr("avgLiveGmv",n)}})})` + "]})]})}),",
  "直播数据预设选项",
);
pair(
  "rowFeatured",
  `o.jsx(PgyKolMatrixRow,{label:"精选博主",children:[o.jsx(PgyKolChips,{options:pgyKolFeaturedOptions,keyOf:function(n){return n.value},selected:pgyKolFeaturedOptions.filter(function(n){return filter[n.key]===true}).map(function(n){return n.value}),onToggle:function(n){toggleBool(n.key)}}),o.jsx(PgyKolField,{label:"行业推荐",children:o.jsx($,{size:"small",variant:filter.firstIndustry?"contained":"outlined",color:filter.firstIndustry?"primary":"inherit",onClick:function(){setIndustryPopupOpen(true)},children:"行业推荐博主"+(filter.firstIndustry?"（"+filter.firstIndustry+(filter.secondIndustry?"-"+filter.secondIndustry:"")+"）":"")})})]}),`,
  "精选博主 + 行业推荐入口",
);
pair(
  "rowNoteCategory",
  `o.jsx(PgyKolMatrixRow,{label:"笔记类目",children:[(configs.noteCategory&&configs.noteCategory.nodes&&configs.noteCategory.nodes.length?configs.noteCategory.nodes:pgyKolNoteCatFallback()).map(function(ind){var lab=String(ind.label||ind.value||"");return o.jsx($,{key:pgyKolNodeKey(ind),size:"small",variant:filter.noteCategory.length>0?"contained":"outlined",color:filter.noteCategory.length>0?"primary":"inherit",onClick:function(){openNoteCategory(lab)},children:lab})}),o.jsx(w,{variant:"caption",color:"text.secondary",children:"已选 "+filter.noteCategory.length+" 项"})]})]})}),`,
  "笔记类目动态树",
);
pair(
  "pageTail",
  `o.jsx(PgyKolNoteCategoryPopup,{open:categoryOpen,onClose:function(){setCategoryOpen(false)},nodes:configs.noteCategory&&configs.noteCategory.nodes&&configs.noteCategory.nodes.length?configs.noteCategory.nodes:pgyKolNoteCatFallback(),industry:catIndustry,onSelectIndustry:setCatIndustry,selected:filter.noteCategory,onToggle:function(next){update({noteCategory:next})}}),o.jsx(PgyKolIndustryPopup,{open:industryPopupOpen,onClose:function(){setIndustryPopupOpen(false)},cfg:configs.industry,first:filter.firstIndustry,second:filter.secondIndustry,onFirst:function(v){update({firstIndustry:v})},onSecond:function(v){update({secondIndustry:v})}})]})})}`,
  "笔记类目/行业推荐弹层渲染",
);
pair(
  "tasksArray",
  `var tasks=[["areas",{provider:"areas"}],["automotive",{provider:"kolTagsV2",section:"automotiveIndustryTag"}],["audience20",{provider:"kolTagsV2",section:"audience20"}],["contentTheme",{provider:"kolTagsV2",section:"contentTheme"}],["consumeBehavior",{provider:"consumeBehavior"}],["noteCategory",{provider:"specialIndustryData"}],["industry",{provider:"kolTagsV2",section:"industryTags"}],["activities",{provider:"activities"}]];var schemaP=bridge.getSchemaFields?bridge.getSchemaFields():Promise.resolve({ok:false,error:{code:"unknown",message:"schema 不可用"}});schemaP.then(function(res){if(res&&res.ok&&Array.isArray(res.data))pgyKolSchemaUnproven(res.data)}).catch(function(){});`,
  "配置加载 + Schema 单一来源拉取",
);
pair(
  "summaryAnchor",
  `if(filter.coopCredit)sumAdd("coopCredit","合作信用度："+filter.coopCredit.label,function(){update({coopCredit:null})});if(filter.coopImpMedin)sumAdd("coopImpMedin","传播-曝光："+filter.coopImpMedin.label,function(){update({coopImpMedin:null})});if(filter.coopReadMid)sumAdd("coopReadMid","传播-阅读："+filter.coopReadMid.label,function(){update({coopReadMid:null})});if(filter.coopInterMid)sumAdd("coopInterMid","传播-互动："+filter.coopInterMid.label,function(){update({coopInterMid:null})});if(filter.coopOverflowMid)sumAdd("coopOverflowMid","传播-外溢中位："+filter.coopOverflowMid.label,function(){update({coopOverflowMid:null})});if(filter.estimatePicReadCost)sumAdd("estimatePicReadCost","图文阅读单价："+filter.estimatePicReadCost.label,function(){update({estimatePicReadCost:null})});if(filter.estimateVideoReadCost)sumAdd("estimateVideoReadCost","视频阅读单价："+filter.estimateVideoReadCost.label,function(){update({estimateVideoReadCost:null})});if(filter.estimatePicEngageCost)sumAdd("estimatePicEngageCost","图文互动单价："+filter.estimatePicEngageCost.label,function(){update({estimatePicEngageCost:null})});if(filter.estimateVideoEngageCost)sumAdd("estimateVideoEngageCost","视频互动单价："+filter.estimateVideoEngageCost.label,function(){update({estimateVideoEngageCost:null})});if(filter.estimatePictureCpm)sumAdd("estimatePictureCpm","图文CPM："+filter.estimatePictureCpm.label,function(){update({estimatePictureCpm:null})});if(filter.estimateVideoCpm)sumAdd("estimateVideoCpm","视频CPM："+filter.estimateVideoCpm.label,function(){update({estimateVideoCpm:null})});if(filter.overflowCost)sumAdd("overflowCost","外溢进店单价："+filter.overflowCost.label,function(){update({overflowCost:null})});if(filter.liveCount30d&&filter.liveCount30d.length)sumAdd("liveCount30d","直播场次 "+filter.liveCount30d.length+" 项",function(){update({liveCount30d:[]})});if(filter.avgLiveViewer&&filter.avgLiveViewer.length)sumAdd("avgLiveViewer","观播人数 "+filter.avgLiveViewer.length+" 项",function(){update({avgLiveViewer:[]})});if(filter.avgLiveGmv&&filter.avgLiveGmv.length)sumAdd("avgLiveGmv","场均销售额 "+filter.avgLiveGmv.length+" 项",function(){update({avgLiveGmv:[]})});if(filter.noteCategory&&filter.noteCategory.length)sumAdd("noteCategory","笔记类目 "+filter.noteCategory.length+" 项",function(){update({noteCategory:[]})});if(filter.inStar===true)sumAdd("inStar","精选博主：明星",function(){update({inStar:false})});if(filter.isHighQualityFlag===true)sumAdd("isHighQualityFlag","精选博主：优质博主",function(){update({isHighQualityFlag:false})});if(filter.newHighQuality===true)sumAdd("newHighQuality","精选博主：新锐博主",function(){update({newHighQuality:false})});if(filter.hasBuyerCoopAuthFlag===true)sumAdd("hasBuyerCoopAuthFlag","精选博主：笔记+直播均可合作",function(){update({hasBuyerCoopAuthFlag:false})});if(filter.filterIntention===true)sumAdd("filterIntention","精选博主：意向行业匹配",function(){update({filterIntention:false})});if(filter.firstIndustry)sumAdd("firstIndustry","行业推荐："+filter.firstIndustry+(filter.secondIndustry?"-"+filter.secondIndustry:""),function(){update({firstIndustry:"",secondIndustry:""})});if(filter.gender)sumAdd("gender","性别："+filter.gender,function(){update({gender:null})});`,
  "已选条件 chips 新增项",
);
pair(
  "bannerText",
  `"人群目标（按博主粉丝推荐）依赖合作品牌：当前账号未绑定品牌，官网禁用该筛选；无法实证前不参与查询与采集。"}),`,
  "未实证横幅更新",
);
pair(
  "toggleSingleAnchor",
  `toggleSingle=m.useCallback(function(key,value){setFilter(function(prev){var patch={};patch[key]=prev[key]===value?null:value;return Object.assign({},prev,patch)})},[]),toggleRange=m.useCallback(function(key,node){setFilter(function(prev){var patch={};patch[key]=pgyKolRangeEq(prev[key],node)?null:node;return Object.assign({},prev,patch)})},[]),`,
  "toggleRange 回调",
);
pair(
  "stateAnchor",
  `colOpen=m.useState(false),columnOpen=colOpen[0],setColumnOpen=colOpen[1],iop=m.useState(false),industryPopupOpen=iop[0],setIndustryPopupOpen=iop[1],catOpen=m.useState(false),categoryOpen=catOpen[0],setCategoryOpen=catOpen[1],`,
  "行业推荐弹层状态",
);
pairInline(
  `["inStar","newHighQuality","risingStar","noteLiveBoth","filterIntention","isIndustryRecommend"].forEach(function(k){if(filter[k]===true)sumAdd(k,pgyKolFeaturedLabel(k),function(){var patch={};patch[k]=false;setFilter(function(prev){return Object.assign({},prev,patch)})})});`,
  "",
  "移除旧精选博主 summary 循环（避免与新 chips 重复）",
);

pairInline(
  `function PgyKolNoteCategoryPopup(p){var industries=pgyKolNoteCategoryIndustries,tree=pgyKolNoteCategoryTree[p.industry]||{nodes:[]};return o.jsxs(ue,{open:p.open,onClose:p.onClose,maxWidth:"md",fullWidth:true,children:[o.jsx(be,{children:o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1},children:[o.jsx(w,{variant:"subtitle1",fontWeight:600,children:"笔记类目"}),o.jsx(te,{size:"small",sx:{ml:"auto"},onClick:p.onClose,children:o.jsx(B,{icon:"mdi:close",width:18,height:18})})]})}),o.jsxs(pe,{children:[o.jsxs(x,{sx:{display:"flex",gap:2},children:[o.jsxs(x,{sx:{width:120,flexShrink:0},children:[industries.map(function(ind){return o.jsx($,{key:ind.value,size:"small",variant:p.industry===ind.value?"contained":"outlined",fullWidth:true,sx:{mb:.5,justifyContent:"flex-start"},onClick:function(){p.onSelectIndustry(ind.value)},children:ind.label})})]}),o.jsx(x,{sx:{flexGrow:1,minWidth:0},children:o.jsx(PgyKolTree,{nodes:tree.nodes,selected:p.selected.map(function(n){return pgyKolNodeKey(n)}),onToggle:p.onToggle,display:function(n){return n.fullPath||n.label||String(n.value)}})})]}),p.selected.length>0&&o.jsxs(x,{sx:{mt:1,display:"flex",flexWrap:"wrap",gap:.5},children:[p.selected.map(function(n){return o.jsx(f1,{key:pgyKolNodeKey(n),size:"small",label:n.fullPath||n.label,onDelete:function(){p.onToggle(n)}})}),o.jsx(w,{variant:"caption",color:"text.secondary",sx:{width:"100%"},children:"已选 "+p.selected.length+" 项"})]})]}),o.jsxs(_e,{children:[o.jsx($,{onClick:p.onClose,children:"取消"}),o.jsx($,{variant:"contained",onClick:function(){p.onClose()},children:"确定"})]})]})}`,
  "",
  "移除旧笔记类目弹窗（helpers 提供新实现；避免 ES module 下 function 重复声明）",
);

pairInline(
  `if(filter.estimateCpuv30dLower!==""||filter.estimateCpuv30dUpper!=="")sumAdd("cpuv","预估CPM："+(filter.estimateCpuv30dLower||"0")+"～"+(filter.estimateCpuv30dUpper||"不限"),function(){update({estimateCpuv30dLower:"",estimateCpuv30dUpper:""})});if(filter.estimateReadCost!=="")sumAdd("estRead","阅读单价 ≥"+filter.estimateReadCost,function(){update({estimateReadCost:""})});if(filter.estimateInteractCost!=="")sumAdd("estInteract","互动单价 ≥"+filter.estimateInteractCost,function(){update({estimateInteractCost:""})});if(filter.overflowCost!=="")sumAdd("overflow","外溢进店单价 ≥"+filter.overflowCost,function(){update({overflowCost:""})});if(filter.liveCount30d!=="")sumAdd("liveCount","直播场次 ≥"+filter.liveCount30d,function(){update({liveCount30d:""})});if(filter.avgLiveViewer!=="")sumAdd("avgViewer","场均观播 ≥"+filter.avgLiveViewer,function(){update({avgLiveViewer:""})});if(filter.avgLiveGmv!=="")sumAdd("avgGmv","场均销售额 ≥"+filter.avgLiveGmv,function(){update({avgLiveGmv:""})});`,
  "",
  "移除旧键摘要 chips（新默认筛选不含旧键，undefined!==\"\" 恒真导致清空后仍显示）",
);

pairInline(
  `if(filter.industryTag&&filter.industryTag.length)sumAdd("industryTag","笔记类目 "+filter.industryTag.length+" 项",function(){update({industryTag:[]})});`,
  "",
  "移除旧 industryTag 摘要 chip（noteCategory 已取代）",
);

pairInline(
  `if(filter.coopCredit)sumAdd("coopCredit","合作信用度："+filter.coopCredit,function(){update({coopCredit:null})});`,
  "",
  "移除旧 coopCredit 摘要 chip（与新 chip 重复且对象字符串化）",
);

pairInline(
  `if(filter.firstIndustry)sumAdd("firstIndustry","合作行业："+filter.firstIndustry+(filter.secondIndustry?"/"+filter.secondIndustry:""),function(){update({firstIndustry:null,secondIndustry:null})});`,
  "",
  "移除旧 合作行业 摘要 chip（与新 行业推荐 chip 同键重复）",
);

pairInline(
  `if(filter.propagationScale)sumAdd("propagationScale","传播规模："+filter.propagationScale,function(){update({propagationScale:null})});`,
  "",
  "移除旧 propagationScale 摘要 chip（键已废弃）",
);

pairInline(
  `var pgyKolNoteCategoryTree={"汽车":{nodes:[{label:"汽车保养"},{label:"汽车评测"},{label:"新能源汽车"},{label:"驾考驾照"},{label:"二手车"},{label:"汽车用品"},{label:"自驾游"}]},"游戏":{nodes:[{label:"手游"},{label:"端游"},{label:"主机游戏"},{label:"电竞"},{label:"游戏攻略"},{label:"游戏周边"}]},"母婴":{nodes:[{label:"孕期"},{label:"育儿"},{label:"母婴好物"},{label:"辅食"},{label:"早教"},{label:"亲子出行"}]},"美妆":{nodes:[{label:"护肤"},{label:"彩妆"},{label:"香水"},{label:"美甲"},{label:"美发"},{label:"医美"}]}};`,
  `var pgyKolNoteCategoryTree={"汽车":{"nodes":[{"label":"理性决策","children":[{"label":"选车攻略","children":[{"label":"政策"},{"label":"购车顾虑"},{"label":"配置"},{"label":"能源类型优势对比"},{"label":"攻略"}]},{"label":"新车测评"},{"label":"探店试驾"},{"label":"车主心得"}]},{"label":"用车场景","children":[{"label":"远行近游","children":[{"label":"近郊探索"},{"label":"长途自驾"},{"label":"硬核越野"}]},{"label":"提车/交付场景","children":[{"label":"场地布置与礼遇"},{"label":"仪式感记录"}]},{"label":"商务用车","children":[{"label":"移动头等舱"},{"label":"商务接待"}]},{"label":"亲子家庭","children":[{"label":"家庭采购日"},{"label":"接送孩子"},{"label":"三代同堂"},{"label":"周末溜娃"},{"label":"车内学习室"},{"label":"车内育婴室"}]},{"label":"朋友社交","children":[{"label":"后备箱经济"},{"label":"移动娱乐屋"}]},{"label":"礼赠场景","children":[{"label":"毕业礼物"},{"label":"送给父母"},{"label":"适合送男友"},{"label":"适合送女友"}]},{"label":"户外兴趣","children":[{"label":"钓鱼/野营"},{"label":"骑行"},{"label":"徒步"},{"label":"硬核竞速"}]},{"label":"宠物出行","children":[{"label":"大型宠物"},{"label":"短途出行"},{"label":"小型宠物"},{"label":"长途出行"}]},{"label":"城市通勤","children":[{"label":"车内小憩"},{"label":"健身储物"},{"label":"日常通勤"},{"label":"生活圈代步"},{"label":"移动美容舱"}]}]},{"label":"个性化美化","children":[{"label":"个性改装"},{"label":"储物收纳"},{"label":"车内装饰"},{"label":"车外装饰"},{"label":"车衣保护"},{"label":"汽车用品"}]},{"label":"车型品类","children":[{"label":"轿车"},{"label":"SUV"},{"label":"MPV"},{"label":"跑车"},{"label":"微型车"},{"label":"微面"},{"label":"房车"},{"label":"越野车"},{"label":"旅行车"}]},{"label":"圈层属性","children":[{"label":"改装圈层"},{"label":"痛车圈层"},{"label":"跑山圈层"}]},{"label":"品牌倾向","children":[{"label":"自主"},{"label":"豪华"},{"label":"集团"},{"label":"新势力"}]},{"label":"能源类型","children":[{"label":"纯电车"},{"label":"新能源"},{"label":"油车"}]},{"label":"人生阶段","children":[{"label":"单身"},{"label":"多娃&大家庭阶段"},{"label":"银发退休阶段"}]}]},"游戏":{"nodes":[{"label":"游戏品类","children":[{"label":"网页游戏"},{"label":"电脑游戏"},{"label":"手机游戏"}]},{"label":"游戏类型","children":[{"label":"动作格斗游戏","children":[{"label":"永劫无间"}]},{"label":"即时制二次元游戏","children":[{"label":"境界刀鸣"},{"label":"黑色信标"},{"label":"物华弥新"},{"label":"无期迷途"},{"label":"新月同行"},{"label":"绝区零"}]},{"label":"即时制角色扮演","children":[{"label":"诛仙2"},{"label":"诛仙"},{"label":"明日之后"},{"label":"超自然行动组"},{"label":"永恒之塔2"}]},{"label":"回合制二次元游戏","children":[{"label":"未定事件簿"},{"label":"雷索纳斯"},{"label":"浮生忆玲珑"},{"label":"重返未来1999"}]},{"label":"回合制角色扮演","children":[{"label":"梦幻西游手游"},{"label":"龙魂旅人"},{"label":"最终幻想14"}]},{"label":"塔防游戏","children":[{"label":"保卫向日葵"},{"label":"全境守卫"},{"label":"向僵尸开炮"}]},{"label":"开放世界角色扮演","children":[{"label":"燕云十六声"},{"label":"王者荣耀世界"}]},{"label":"恋爱游戏","children":[{"label":"如鸢"},{"label":"银与绯"},{"label":"时空中的绘旅人"},{"label":"光与夜之恋"},{"label":"恋与深空"},{"label":"恋与制作人"}]},{"label":"战略游戏","children":[{"label":"率土之滨"},{"label":"群星纪元"},{"label":"阿瓦隆之王"},{"label":"快来当领主"},{"label":"冒险之星"},{"label":"无尽的拉格朗日"}]},{"label":"放置类二次元游戏","children":[{"label":"花花与幕间剧"}]},{"label":"放置类角色扮演","children":[{"label":"发条总动员"},{"label":"遮天凡尘一叶"}]},{"label":"模拟养成","children":[{"label":"美人传"},{"label":"盲盒派对"},{"label":"闪耀暖暖"},{"label":"以闪亮之名"},{"label":"无限暖暖"}]},{"label":"模拟家园建造","children":[{"label":"江南百景图"},{"label":"动物森友会"},{"label":"星露谷物语"}]},{"label":"模拟经营","children":[{"label":"暴吵萌厨"},{"label":"肥鹅健身房"}]},{"label":"模拟职业","children":[{"label":"杜拉拉升职记"}]},{"label":"消除游戏","children":[{"label":"四季合合"}]},{"label":"生存沙盒游戏","children":[{"label":"无尽冬日"}]},{"label":"聚会游戏","children":[{"label":"蛋仔派对"},{"label":"代号砰砰"}]},{"label":"解谜游戏","children":[{"label":"晴空之下"}]},{"label":"抓宠类游戏","children":[{"label":"洛克王国手游"}]},{"label":"射击游戏","children":[{"label":"三角洲行动"},{"label":"codm（使命召唤）"}]}]}]},"母婴":{"nodes":[{"label":"婴童洗护","children":[{"label":"安全防晒"},{"label":"浴后护理"},{"label":"敏感修护"},{"label":"屏障树立"},{"label":"泳后护理"},{"label":"口周干裂"},{"label":"分区清洁"},{"label":"头皮问题"},{"label":"驱虫驱蚊"},{"label":"洁面清洁"},{"label":"红屁股"},{"label":"湿疹皮炎"},{"label":"痱子热疹"},{"label":"抚触链接"},{"label":"趣味洗护"}]},{"label":"母婴纸品","children":[{"label":"精算育儿"},{"label":"颜值派"},{"label":"汗宝宝"},{"label":"囤货党"},{"label":"敏感肌"},{"label":"肉腿娃"},{"label":"功课党"},{"label":"好动宝"},{"label":"安睡整夜"},{"label":"出行便携"},{"label":"贵妇体验"},{"label":"红屁屁"}]},{"label":"母婴小家电","children":[{"label":"空间收纳"},{"label":"滋补养生"},{"label":"温度把控"},{"label":"夜奶操作"},{"label":"新手喂养"},{"label":"材质挑选"},{"label":"三代同育"},{"label":"户外喂养"},{"label":"通乳攻略"},{"label":"洁癖爸妈"},{"label":"精准喂养"},{"label":"职场妈妈"}]},{"label":"婴童辅食","children":[{"label":"吞咽能力"},{"label":"多元辅食"},{"label":"零食分享"},{"label":"健康零食"},{"label":"放学加餐"},{"label":"出牙磨牙"},{"label":"居家囤货"},{"label":"节日礼包"},{"label":"零食训练"},{"label":"宝宝挑食"},{"label":"户外零食"},{"label":"低敏辅食"},{"label":"入园社交"},{"label":"居家辅食"},{"label":"入园准备"},{"label":"敏敏零食"},{"label":"抓握训练"},{"label":"外出口粮"},{"label":"营养均衡"},{"label":"自主进食"},{"label":"第一口辅食"}]},{"label":"母婴营养品","children":[{"label":"开胃因子"},{"label":"视力保护"},{"label":"营养补充"},{"label":"防护因子"},{"label":"高钙因子"},{"label":"自护构建"},{"label":"发育表现"},{"label":"助眠安睡"}]},{"label":"婴童奶粉","children":[{"label":"丝滑转奶"},{"label":"益生组合"},{"label":"眼脑体发育"},{"label":"选奶功课"},{"label":"防敏脱敏"},{"label":"助力聪明脑"},{"label":"乳铁自护"},{"label":"黄金长高"},{"label":"内修外护"},{"label":"肚肚吸收"},{"label":"断奶攻略"},{"label":"混合喂养"},{"label":"母源黄金HMO"},{"label":"长肉多肉"}]},{"label":"哺乳喂养工具","children":[{"label":"萌娃穿搭"},{"label":"安全材质"},{"label":"奶瓶喂养"},{"label":"颜值发育"},{"label":"哄娃安抚"},{"label":"餐具选购"},{"label":"学饮指南"},{"label":"换季保温"}]},{"label":"母婴孕产","children":[{"label":"职场孕妇"},{"label":"产后复工"},{"label":"顺产"},{"label":"孕期变化"},{"label":"孕期学习"},{"label":"剖腹产"}]},{"label":"母婴家居","children":[{"label":"护脊深睡"},{"label":"安全翻滚"},{"label":"进食习惯"},{"label":"早教启蒙"},{"label":"学习角落"},{"label":"自主入睡"},{"label":"爬行探索"},{"label":"防惊跳"}]},{"label":"母婴出行&用品","children":[{"label":"长线旅途"},{"label":"户外探索"},{"label":"二胎/双胎"},{"label":"新贵消费"},{"label":"备产研究"},{"label":"短途旅行"},{"label":"高频出行"},{"label":"新生出行"},{"label":"务实精算"},{"label":"遛娃必备"}]}]},"美妆":{"nodes":[]}};`,
  "笔记类目 fallback 树替换为官网真实树（实证路径可查询；旧假路径返回 0 结果）",
);

pairInline(
  `o.jsx(PgyKolField,{label:"近期合作行业",children:[o.jsx(PgyKolDropdown,{label:"一级行业",options:pgyKolFirstIndustryOptions,selected:filter.firstIndustry?[filter.firstIndustry]:[],onToggle:function(n){var v=pgyKolOptValue(n);update({firstIndustry:filter.firstIndustry===v?null:v,secondIndustry:null})}}),o.jsx(PgyKolDropdown,{label:"二级行业",options:pgyKolSecondIndustryOptions,selected:filter.secondIndustry?[filter.secondIndustry]:[],onToggle:function(n){toggleSingle("secondIndustry",pgyKolOptValue(n))}})]}),`,
  "",
  "移除旧「近期合作行业」静态下拉（与官网行业推荐共享 firstIndustry/secondIndustry state，静态值未实证）",
);

pairInline(
  `var pgyKolFirstIndustryOptions=pgyKolStaticOptions(["美妆","护肤","食品饮料","母婴","时尚服饰","数码3C","汽车","家居家装","游戏","医疗健康","其他"]);`,
  "",
  "移除已废弃的静态行业选项（旧下拉已删）",
);

pairInline(
  `applyBrands=function(ids){if(brandPopupMode==="recent"){update({tradeReportBrandIdSet:ids})}else{update({brands:ids})}}`,
  `applyBrands=function(ids){if(brandPopupMode==="recent"){update({tradeReportBrandIdSet:ids,audienceGroup:null})}else{update({brands:ids,audienceGroup:null})}}`,
  "品牌变更/清空时同步清空品牌依赖的 audienceGroup",
);

pairInline(
  `var pgyKolRangeOptions=pgyKolStaticOptions(["1万以下","1万-5万","5万-20万","20万以上"]);`,
  `var pgyKolRangeOptions50w=[{label:"5万以上",value:[50000,-1]},{label:"1万～5万",value:[10000,50000]},{label:"0.5万～1万",value:[5000,10000]},{label:"0.1万～0.5万",value:[1000,5000]}];
var pgyKolRangeOptions2000=[{label:"2000以上",value:[2000,-1]},{label:"1000～2000",value:[1000,2000]},{label:"500～1000",value:[500,1000]},{label:"200～500",value:[200,500]},{label:"100～200",value:[100,200]}];
var pgyKolRangeOptionsPercent=[{label:"40%以上",value:[40,null]},{label:"30%～40%",value:[30,40]},{label:"20%～30%",value:[20,30]},{label:"10%～20%",value:[10,20]},{label:"10%以下",value:[null,10]}];`,
  "日常笔记范围选项替换为官网实证范围数组（曝光/阅读 50w、互动 2000、千赞百分比）",
);

pairInline(
  `o.jsx(PgyKolField,{label:"曝光中位数",children:o.jsx(PgyKolChips,{options:pgyKolRangeOptions,keyOf:function(n){return n.value},selected:filter.accumCommonImpMedinNum30d?[filter.accumCommonImpMedinNum30d]:[],onToggle:function(n){toggleSingle("accumCommonImpMedinNum30d",n.value)}})}),`,
  `o.jsx(PgyKolField,{label:"曝光中位数",children:o.jsx(pgyKolRangeChips,{options:pgyKolRangeOptions50w,value:filter.accumCommonImpMedinNum30d,onToggle:function(n){toggleRange("accumCommonImpMedinNum30d",n)}})}),`,
  "accumCommonImpMedinNum30d 行改为范围 chips（与注册表 range-option 契约一致）",
);

pairInline(
  `o.jsx(PgyKolField,{label:"阅读中位数",children:o.jsx(PgyKolChips,{options:pgyKolRangeOptions,keyOf:function(n){return n.value},selected:filter.readMidNor30?[filter.readMidNor30]:[],onToggle:function(n){toggleSingle("readMidNor30",n.value)}})}),`,
  `o.jsx(PgyKolField,{label:"阅读中位数",children:o.jsx(pgyKolRangeChips,{options:pgyKolRangeOptions50w,value:filter.readMidNor30,onToggle:function(n){toggleRange("readMidNor30",n)}})}),`,
  "readMidNor30 行改为范围 chips（与注册表 range-option 契约一致）",
);

pairInline(
  `o.jsx(PgyKolField,{label:"互动中位数",children:o.jsx(PgyKolChips,{options:pgyKolRangeOptions,keyOf:function(n){return n.value},selected:filter.interMidNor30?[filter.interMidNor30]:[],onToggle:function(n){toggleSingle("interMidNor30",n.value)}})}),`,
  `o.jsx(PgyKolField,{label:"互动中位数",children:o.jsx(pgyKolRangeChips,{options:pgyKolRangeOptions2000,value:filter.interMidNor30,onToggle:function(n){toggleRange("interMidNor30",n)}})}),`,
  "interMidNor30 行改为范围 chips（与注册表 range-option 契约一致）",
);

pairInline(
  `o.jsx(PgyKolField,{label:"千赞笔记比例",children:o.jsx(PgyKolChips,{options:pgyKolRangeOptions,keyOf:function(n){return n.value},selected:filter.thousandLikePercent30?[filter.thousandLikePercent30]:[],onToggle:function(n){toggleSingle("thousandLikePercent30",n.value)}})}),`,
  `o.jsx(PgyKolField,{label:"千赞笔记比例",children:o.jsx(pgyKolRangeChips,{options:pgyKolRangeOptionsPercent,value:filter.thousandLikePercent30,onToggle:function(n){toggleRange("thousandLikePercent30",n)}})}),`,
  "thousandLikePercent30 行改为范围 chips（与注册表 range-option 契约一致）",
);

pairInline(
  `sumAdd("impMed","曝光中位数："+filter.accumCommonImpMedinNum30d,function(){update({accumCommonImpMedinNum30d:null})});`,
  `sumAdd("impMed","曝光中位数："+filter.accumCommonImpMedinNum30d.label,function(){update({accumCommonImpMedinNum30d:null})});`,
  "accumCommonImpMedinNum30d 摘要 chip 显示范围 label",
);

pairInline(
  `sumAdd("readMid","阅读中位数："+filter.readMidNor30,function(){update({readMidNor30:null})});`,
  `sumAdd("readMid","阅读中位数："+filter.readMidNor30.label,function(){update({readMidNor30:null})});`,
  "readMidNor30 摘要 chip 显示范围 label",
);

pairInline(
  `sumAdd("interMid","互动中位数："+filter.interMidNor30,function(){update({interMidNor30:null})});`,
  `sumAdd("interMid","互动中位数："+filter.interMidNor30.label,function(){update({interMidNor30:null})});`,
  "interMidNor30 摘要 chip 显示范围 label",
);

pairInline(
  `sumAdd("thousand","千赞笔记比例："+filter.thousandLikePercent30,function(){update({thousandLikePercent30:null})});`,
  `sumAdd("thousand","千赞笔记比例："+filter.thousandLikePercent30.label,function(){update({thousandLikePercent30:null})});`,
  "thousandLikePercent30 摘要 chip 显示范围 label",
);

// 追加 helpers（注入块末尾；后声明的同名函数覆盖旧实现）
const helpers = newcode.helpers;

fs.writeFileSync(
  path.join(root, "scripts", "pgy-kol-phase51-pairs.json"),
  JSON.stringify({ pairs, helpers }, null, 2),
  "utf8",
);
console.log(`wrote ${pairs.length} pairs + helpers to scripts/pgy-kol-phase51-pairs.json`);
