// 历史任务导出使用的规范两行表头 Schema。
// 与前端正常导出（mode: "two-row"）使用的表头保持一致；来源见 assets/<version> 前端构建产物。
// 该模块由主进程 history.exportTask 处理器使用，用于补齐历史导出丢失的 mode/headers。

import { existsSync } from "node:fs";

// 与主进程 PGY_IMAGE_FIELDS（PYG_CHART_FIELDS 的值集合）保持一致。
const PGY_IMAGE_EXPORT_FIELDS = Object.freeze([
  "fansProvinceChart",
  "fansCityChart",
  "fansAgeChart",
  "fansGenderChart",
  "fansGenderAgeChart",
  "fansGrowthTrendChart",
  "dailyNotePerformanceChart",
  "dailyNotePicturePerformanceChart",
  "dailyNoteVideoPerformanceChart",
  "bloggerOverviewChart",
]);

// 与主进程两行导出分支的图片占位哨兵保持一致：导出时渲染为空单元格。
const PGY_IMAGE_CELL_BLANK = "__PGY_IMAGE_CELL_BLANK__";

// 蒲公英博主（pgy/blogger）
const PGY_BLOGGER_EXPORT_HEADERS = Object.freeze([
  { group: "本地信息", label: "昵称", key: "nickname" },
  { group: "本地信息", label: "主页链接", key: "url" },
  { group: "本地信息", label: "蒲公英链接", key: "pgyUrl" },
  { group: "本地信息", label: "小红书号", key: "redId" },
  { group: "本地信息", label: "健康等级", key: "currentLevel" },
  { group: "本地信息", label: "所属机构", key: "liveSign" },
  { group: "本地信息", label: "粉丝数", key: "fansCount" },
  { group: "本地信息", label: "总赞藏", key: "likeCollectCountInfo" },
  { group: "本地信息", label: "简介", key: "personalTags" },
  { group: "本地信息", label: "标签", key: "featureTags" },
  { group: "本地信息", label: "性别", key: "gender" },
  { group: "本地信息", label: "地区", key: "location" },
  { group: "近10篇表现", label: "视频占比", key: "avg10VideoRatio" },
  { group: "近10篇表现", label: "平均阅读", key: "avg10ReadNum" },
  { group: "近10篇表现", label: "平均点赞", key: "avg10LikeNum" },
  { group: "近10篇表现", label: "平均收藏", key: "avg10CollectNum" },
  { group: "报价数据", label: "图文报价", key: "picturePrice" },
  { group: "报价数据", label: "视频报价", key: "videoPrice" },
  { group: "报价数据", label: "预估阅读单价(图文)", key: "pictureReadCost" },
  { group: "报价数据", label: "预估阅读单价(视频)", key: "videoReadCost" },
  { group: "报价数据", label: "预估互动单价(图文)", key: "estimatePictureEngageCost" },
  { group: "报价数据", label: "预估互动单价(视频)", key: "estimateVideoEngageCost" },
  { group: "报价数据", label: "预估图文CPM", key: "estimatePictureCpm" },
  { group: "报价数据", label: "预估视频CPM", key: "estimateVideoCpm" },
  { group: "报价数据", label: "预估外溢单价(图文)", key: "estimatePictureCpuv" },
  { group: "报价数据", label: "预估外溢单价(视频)", key: "estimateVideoCpuv" },
  { group: "日常30天", label: "发布笔记数", key: "noteNumber30" },
  { group: "日常30天", label: "千赞比例", key: "thousandLikePercent30" },
  { group: "日常30天", label: "百赞比例", key: "hundredLikePercent30" },
  { group: "日常30天", label: "阅读中位数", key: "readMedian30" },
  { group: "日常30天", label: "互动率", key: "interactionRate30" },
  { group: "日常30天", label: "视频完播率", key: "videoFullViewRate30" },
  { group: "日常30天", label: "图文3s阅读率", key: "picture3sViewRate30" },
  { group: "日常30天", label: "互动中位数", key: "mEngagementNum30" },
  { group: "日常30天", label: "曝光中位数", key: "impMedian30" },
  { group: "日常30天", label: "中位点赞量", key: "likeMedian" },
  { group: "日常30天", label: "中位收藏量", key: "collectMedian" },
  { group: "日常30天", label: "中位评论量", key: "commentMedian" },
  { group: "日常30天", label: "中位分享量", key: "shareMedian" },
  { group: "日常90天", label: "发布笔记数", key: "noteNumber90" },
  { group: "日常90天", label: "千赞比例", key: "thousandLikePercent90" },
  { group: "日常90天", label: "百赞比例", key: "hundredLikePercent90" },
  { group: "日常90天", label: "阅读中位数", key: "readMedian90" },
  { group: "日常90天", label: "互动率", key: "interactionRate90" },
  { group: "日常90天", label: "视频完播率", key: "videoFullViewRate90" },
  { group: "日常90天", label: "图文3s阅读率", key: "picture3sViewRate90" },
  { group: "日常90天", label: "互动中位数", key: "mEngagementNum90" },
  { group: "日常90天", label: "曝光中位数", key: "impMedian90" },
  { group: "合作30天", label: "发布笔记数", key: "noteNumberBusiness30" },
  { group: "合作30天", label: "千赞比例", key: "thousandLikePercentBusiness30" },
  { group: "合作30天", label: "百赞比例", key: "hundredLikePercentBusiness30" },
  { group: "合作30天", label: "阅读中位数", key: "readMedianBusiness30" },
  { group: "合作30天", label: "互动率", key: "interactionRateBusiness30" },
  { group: "合作30天", label: "视频完播率", key: "videoFullViewRateBusiness30" },
  { group: "合作30天", label: "图文3s阅读率", key: "picture3sViewRateBusiness30" },
  { group: "合作30天", label: "互动中位数", key: "mEngagementNumBusiness30" },
  { group: "合作30天", label: "曝光中位数", key: "impMedianBusiness30" },
  { group: "合作90天", label: "发布笔记数", key: "noteNumberBusiness90" },
  { group: "合作90天", label: "千赞比例", key: "thousandLikePercentBusiness90" },
  { group: "合作90天", label: "百赞比例", key: "hundredLikePercentBusiness90" },
  { group: "合作90天", label: "阅读中位数", key: "readMedianBusiness90" },
  { group: "合作90天", label: "互动率", key: "interactionRateBusiness90" },
  { group: "合作90天", label: "视频完播率", key: "videoFullViewRateBusiness90" },
  { group: "合作90天", label: "图文3s阅读率", key: "picture3sViewRateBusiness90" },
  { group: "合作90天", label: "互动中位数", key: "mEngagementNumBusiness90" },
  { group: "合作90天", label: "曝光中位数", key: "impMedianBusiness90" },
  { group: "粉丝核心数据", label: "活跃粉丝占比", key: "activeFansRate" },
  { group: "粉丝核心数据", label: "粉丝增量", key: "fansIncreaseNum" },
  { group: "粉丝核心数据", label: "粉丝变化幅度", key: "fansGrowthRate" },
  { group: "粉丝核心数据", label: "互动粉丝占比", key: "engageFansRate" },
  { group: "粉丝性别分布", label: "女粉占比", key: "fansFemale" },
  { group: "粉丝性别分布", label: "男粉占比", key: "fansMale" },
  { group: "粉丝年龄分布", label: "<18岁", key: "fansAges0" },
  { group: "粉丝年龄分布", label: "18-24岁", key: "fansAges1" },
  { group: "粉丝年龄分布", label: "25-34岁", key: "fansAges2" },
  { group: "粉丝年龄分布", label: "35-44岁", key: "fansAges3" },
  { group: "粉丝年龄分布", label: ">44岁", key: "fansAges4" },
  { group: "粉丝年龄分布", label: "汇总", key: "maxFansAges" },
  { group: "粉丝分布", label: "省份分布", key: "fansRegions" },
  { group: "粉丝分布", label: "城市分布", key: "fansCities" },
  { group: "粉丝分布", label: "兴趣分布", key: "fansInterests" },
  { group: "粉丝分布", label: "设备分布", key: "fansDevices" },
  { group: "粉丝图表", label: "粉丝省份分布图", key: "fansProvinceChart" },
  { group: "粉丝图表", label: "粉丝城市分布图", key: "fansCityChart" },
  { group: "粉丝图表", label: "粉丝年龄分布图", key: "fansAgeChart" },
  { group: "粉丝图表", label: "粉丝性别分布图", key: "fansGenderChart" },
  { group: "粉丝图表", label: "性别分布+年龄分布", key: "fansGenderAgeChart" },
  { group: "粉丝图表", label: "粉丝增长趋势图", key: "fansGrowthTrendChart" },
  { group: "日常30天", label: "日常笔记表现图（图文+视频）", key: "dailyNotePerformanceChart" },
  { group: "日常30天", label: "日常笔记表现图（图文）", key: "dailyNotePicturePerformanceChart" },
  { group: "日常30天", label: "日常笔记表现图（视频）", key: "dailyNoteVideoPerformanceChart" },
  { group: "日常30天", label: "博主数据概览图", key: "bloggerOverviewChart" },
]);

// 蒲公英笔记（pgy/notebook）
const PGY_NOTEBOOK_EXPORT_HEADERS = Object.freeze([
  { group: "博主信息", label: "博主昵称", key: "nickname" },
  { group: "博主信息", label: "博主UID", key: "userId" },
  { group: "博主信息", label: "粉丝数", key: "fansNum" },
  { group: "笔记内容", label: "笔记链接", key: "noteLink" },
  { group: "笔记内容", label: "笔记ID", key: "noteId" },
  { group: "笔记内容", label: "笔记标题", key: "title" },
  { group: "笔记内容", label: "笔记内容", key: "content" },
  { group: "数据指标", label: "阅读中位数", key: "clickMidNum" },
  { group: "数据指标", label: "互动中位数", key: "mEngagementNum" },
  { group: "数据指标", label: "曝光量", key: "impNum" },
  { group: "数据指标", label: "阅读量", key: "readNum" },
  { group: "数据指标", label: "点赞数", key: "likeNum" },
  { group: "数据指标", label: "收藏量", key: "favNum" },
  { group: "数据指标", label: "评论量", key: "cmtNum" },
  { group: "数据指标", label: "分享量", key: "shareNum" },
  { group: "数据指标", label: "关注量", key: "followCnt" },
  { group: "报价 & 时间", label: "图文报价", key: "picturePrice" },
  { group: "报价 & 时间", label: "视频报价", key: "videoPrice" },
  { group: "报价 & 时间", label: "笔记发布时间", key: "createTime" },
]);

// 星图达人（starmap/*）
const STARMAP_EXPORT_HEADERS = Object.freeze([
  { group: "主页链接", label: "主页链接", key: "主页链接" },
  { group: "星图链接", label: "星图链接", key: "星图链接" },
  { group: "星图ID", label: "星图ID", key: "星图ID" },
  { group: "昵称", label: "昵称", key: "昵称" },
  { group: "抖音号", label: "抖音号", key: "抖音号" },
  { group: "粉丝数", label: "粉丝数", key: "粉丝数" },
  { group: "获赞数", label: "获赞数", key: "获赞数" },
  { group: "所属机构", label: "所属机构", key: "所属机构" },
  { group: "年龄", label: "年龄", key: "年龄" },
  { group: "发布视频数", label: "发布视频数", key: "发布视频数" },
  { group: "描述", label: "描述", key: "描述" },
  { group: "性别", label: "性别", key: "性别" },
  { group: "地区", label: "地区", key: "地区" },
  { group: "IP归属地", label: "IP归属地", key: "IP归属地" },
  { group: "博主分类", label: "博主分类", key: "博主分类" },
  { group: "博主服务报价", label: "1-20s视频", key: "1-20s视频" },
  { group: "博主服务报价", label: "21-60s视频", key: "21-60s视频" },
  { group: "博主服务报价", label: "60s以上视频", key: "60s以上视频" },
  { group: "博主服务报价", label: "千次自然播放单价", key: "千次自然播放单价" },
  { group: "博主服务报价", label: "千次自然播放总价下限", key: "千次自然播放总价下限" },
  { group: "博主服务报价", label: "千次自然播放总价上限", key: "千次自然播放总价上限" },
  { group: "博主服务报价", label: "抖音短视频合集任务", key: "抖音短视频合集任务" },
  { group: "博主服务报价", label: "抖音短视频共创-参与博主", key: "抖音短视频共创-参与博主" },
  { group: "博主服务报价", label: "抖音图文", key: "抖音图文" },
  { group: "博主服务报价", label: "单视频推送广告平台", key: "单视频推送广告平台" },
  { group: "博主服务报价", label: "多视频推送广告平台", key: "多视频推送广告平台" },
  { group: "博主服务报价", label: "下载", key: "下载" },
  { group: "商业能力", label: "星图指数", key: "星图指数" },
  { group: "商业能力", label: "传播指数", key: "传播指数" },
  { group: "商业能力", label: "传播指数行业中位数", key: "传播指数行业中位数" },
  { group: "商业能力", label: "种草指数", key: "种草指数" },
  { group: "商业能力", label: "种草指数行业中位数", key: "种草指数行业中位数" },
  { group: "商业能力", label: "转化指数", key: "转化指数" },
  { group: "商业能力", label: "转化指数行业中位数", key: "转化指数行业中位数" },
  { group: "商业能力", label: "性价比指数", key: "性价比指数" },
  { group: "商业能力", label: "性价比指数行业中位数", key: "性价比指数行业中位数" },
  { group: "商业能力", label: "合作指数", key: "合作指数" },
  { group: "商业能力", label: "合作指数行业中位数", key: "合作指数行业中位数" },
  { group: "个人视频传播表现--近30日", label: "完播率", key: "个人视频传播_完播率" },
  { group: "个人视频传播表现--近30日", label: "互动率", key: "个人视频传播_互动率" },
  { group: "个人视频传播表现--近30日", label: "播放量中位数", key: "个人视频传播_播放量中位数" },
  { group: "个人视频传播表现--近30日", label: "发布作品数", key: "个人视频传播_发布作品数" },
  { group: "个人视频传播表现--近30日", label: "平均时长", key: "个人视频传播_平均时长" },
  { group: "个人视频传播表现--近30日", label: "平均点赞", key: "个人视频传播_平均点赞" },
  { group: "个人视频传播表现--近30日", label: "平均评论", key: "个人视频传播_平均评论" },
  { group: "个人视频传播表现--近30日", label: "平均转发", key: "个人视频传播_平均转发" },
  { group: "星图视频传播表现--近30日", label: "完播率", key: "星图视频传播_完播率" },
  { group: "星图视频传播表现--近30日", label: "互动率", key: "星图视频传播_互动率" },
  { group: "星图视频传播表现--近30日", label: "播放量中位数", key: "星图视频传播_播放量中位数" },
  { group: "星图视频传播表现--近30日", label: "发布作品数", key: "星图视频传播_发布作品数" },
  { group: "星图视频传播表现--近30日", label: "平均时长", key: "星图视频传播_平均时长" },
  { group: "星图视频传播表现--近30日", label: "平均点赞", key: "星图视频传播_平均点赞" },
  { group: "星图视频传播表现--近30日", label: "平均评论", key: "星图视频传播_平均评论" },
  { group: "星图视频传播表现--近30日", label: "平均转发", key: "星图视频传播_平均转发" },
  { group: "个人视频最新15个视频表现", label: "最低播放量", key: "个人视频15个_最低播放量" },
  { group: "个人视频最新15个视频表现", label: "最高播放量", key: "个人视频15个_最高播放量" },
  { group: "个人视频最新15个视频表现", label: "爆量视频百分比", key: "个人视频15个_爆量视频百分比" },
  { group: "个人视频最新15个视频表现", label: "播放量均值", key: "个人视频15个_播放量均值" },
  { group: "个人视频最新15个视频表现", label: "最低点赞量", key: "个人视频15个_最低点赞量" },
  { group: "个人视频最新15个视频表现", label: "最高点赞量", key: "个人视频15个_最高点赞量" },
  { group: "个人视频最新15个视频表现", label: "点赞量均值", key: "个人视频15个_点赞量均值" },
  { group: "个人视频最新15个视频表现", label: "最低评论量", key: "个人视频15个_最低评论量" },
  { group: "个人视频最新15个视频表现", label: "最高评论量", key: "个人视频15个_最高评论量" },
  { group: "个人视频最新15个视频表现", label: "评论量均值", key: "个人视频15个_评论量均值" },
  { group: "个人视频最新15个视频表现", label: "最低转发量", key: "个人视频15个_最低转发量" },
  { group: "个人视频最新15个视频表现", label: "最高转发量", key: "个人视频15个_最高转发量" },
  { group: "个人视频最新15个视频表现", label: "转发量均值", key: "个人视频15个_转发量均值" },
  { group: "星图视频最新15个视频表现", label: "最低播放量", key: "星图视频15个_最低播放量" },
  { group: "星图视频最新15个视频表现", label: "最高播放量", key: "星图视频15个_最高播放量" },
  { group: "星图视频最新15个视频表现", label: "爆量视频百分比", key: "星图视频15个_爆量视频百分比" },
  { group: "星图视频最新15个视频表现", label: "播放量均值", key: "星图视频15个_播放量均值" },
  { group: "星图视频最新15个视频表现", label: "最低点赞量", key: "星图视频15个_最低点赞量" },
  { group: "星图视频最新15个视频表现", label: "最高点赞量", key: "星图视频15个_最高点赞量" },
  { group: "星图视频最新15个视频表现", label: "点赞量均值", key: "星图视频15个_点赞量均值" },
  { group: "星图视频最新15个视频表现", label: "最低评论量", key: "星图视频15个_最低评论量" },
  { group: "星图视频最新15个视频表现", label: "最高评论量", key: "星图视频15个_最高评论量" },
  { group: "星图视频最新15个视频表现", label: "评论量均值", key: "星图视频15个_评论量均值" },
  { group: "星图视频最新15个视频表现", label: "最低转发量", key: "星图视频15个_最低转发量" },
  { group: "星图视频最新15个视频表现", label: "最高转发量", key: "星图视频15个_最高转发量" },
  { group: "星图视频最新15个视频表现", label: "转发量均值", key: "星图视频15个_转发量均值" },
  { group: "内容类型分析", label: "内容类型分析", key: "内容类型分析" },
  { group: "连接用户分布", label: "月连接用户数", key: "月连接用户数" },
  { group: "连接用户分布", label: "月深度用户数", key: "月深度用户数" },
  { group: "连接用户分布", label: "了解", key: "了解" },
  { group: "连接用户分布", label: "兴趣", key: "兴趣" },
  { group: "连接用户分布", label: "喜欢", key: "喜欢" },
  { group: "连接用户分布", label: "追随", key: "追随" },
  { group: "转化能力分析(近30天, 仅展示星图视频数据)", label: "相关视频数", key: "相关视频数" },
  { group: "转化能力分析(近30天, 仅展示星图视频数据)", label: "播放中位数", key: "播放中位数" },
  { group: "转化能力分析(近30天, 仅展示星图视频数据)", label: "组件点击量", key: "组件点击量" },
  { group: "转化能力分析(近30天, 仅展示星图视频数据)", label: "组件点击率", key: "组件点击率" },
  { group: "转化能力分析(近30天, 仅展示星图视频数据)", label: "相关CPC", key: "相关CPC" },
  { group: "转化能力分析(近30天, 仅展示星图视频数据)", label: "带货商品数", key: "带货商品数" },
  { group: "转化能力分析(近30天, 仅展示星图视频数据)", label: "平均销售额区间", key: "平均销售额区间" },
  { group: "转化能力分析(近30天, 仅展示星图视频数据)", label: "带货商品价格", key: "带货商品价格" },
  { group: "转化能力分析(近30天, 仅展示星图视频数据)", label: "GPM", key: "GPM" },
  { group: "预期cpe", label: "1-20s", key: "预期cpe_1-20s" },
  { group: "预期cpe", label: "20-60s", key: "预期cpe_20-60s" },
  { group: "预期cpe", label: "60s以上", key: "预期cpe_60s以上" },
  { group: "预期cpm", label: "1-20s", key: "预期cpm_1-20s" },
  { group: "预期cpm", label: "20-60s", key: "预期cpm_20-60s" },
  { group: "预期cpm", label: "60s以上", key: "预期cpm_60s以上" },
  { group: "粉丝画像", label: "观众画像男性占比", key: "观众画像男性占比" },
  { group: "粉丝画像", label: "观众画像女性占比", key: "观众画像女性占比" },
  { group: "粉丝画像-年龄分布", label: "18-23", key: "18-23" },
  { group: "粉丝画像-年龄分布", label: "24-30", key: "24-30" },
  { group: "粉丝画像-年龄分布", label: "31-40", key: "31-40" },
  { group: "粉丝画像-年龄分布", label: "41-50", key: "41-50" },
  { group: "粉丝画像-年龄分布", label: "50+", key: "50+" },
  { group: "粉丝画像-年龄分布", label: "其他", key: "其他" },
  { group: "粉丝画像-年龄分布", label: "汇总", key: "汇总" },
  { group: "粉丝画像-年龄分布汇总", label: "粉丝画像-年龄分布", key: "粉丝画像-年龄分布" },
  { group: "粉丝画像-地域占比 TOP10", label: "粉丝画像-地域占比 TOP10", key: "粉丝画像-地域占比 TOP10" },
  { group: "粉丝画像-城市等级分布", label: "粉丝画像-城市等级分布", key: "粉丝画像-城市等级分布" },
  { group: "粉丝画像-兴趣分布", label: "粉丝画像-兴趣分布", key: "粉丝画像-兴趣分布" },
  { group: "粉丝画像-八大人群占比", label: "粉丝画像-八大人群占比", key: "粉丝画像-八大人群占比" },
  { group: "粉丝画像-设备分布", label: "粉丝画像-设备分布", key: "粉丝画像-设备分布" },
]);

// 抖音直采（douyin/*）
const DOUYIN_EXPORT_HEADERS = Object.freeze([
  { group: "主页链接", label: "主页链接", key: "主页链接" },
  { group: "昵称", label: "昵称", key: "昵称" },
  { group: "抖音号", label: "抖音号", key: "抖音号" },
  { group: "个人简介", label: "个人简介", key: "个人简介" },
  { group: "核心数据", label: "粉丝数", key: "粉丝数" },
  { group: "核心数据", label: "关注数", key: "关注数" },
  { group: "核心数据", label: "获赞数", key: "获赞数" },
  { group: "核心数据", label: "发布作品数", key: "发布作品数" },
  { group: "认证信息", label: "认证类型", key: "认证类型" },
  { group: "认证信息", label: "认证描述", key: "认证描述" },
  { group: "地理信息", label: "性别", key: "性别" },
  { group: "地理信息", label: "省份", key: "省份" },
  { group: "地理信息", label: "城市", key: "城市" },
  { group: "地理信息", label: "IP属地", key: "IP属地" },
  { group: "商业信息", label: "商品橱窗", key: "商品橱窗" },
  { group: "商业信息", label: "橱窗商品数", key: "橱窗商品数" },
  { group: "视频统计", label: "视频样本数", key: "视频样本数" },
  { group: "视频统计", label: "最低播放量", key: "最低播放量" },
  { group: "视频统计", label: "最高播放量", key: "最高播放量" },
  { group: "视频统计", label: "平均播放量", key: "平均播放量" },
  { group: "视频统计", label: "最低点赞量", key: "最低点赞量" },
  { group: "视频统计", label: "最高点赞量", key: "最高点赞量" },
  { group: "视频统计", label: "平均点赞量", key: "平均点赞量" },
  { group: "视频统计", label: "最低评论量", key: "最低评论量" },
  { group: "视频统计", label: "最高评论量", key: "最高评论量" },
  { group: "视频统计", label: "平均评论量", key: "平均评论量" },
  { group: "视频统计", label: "最低分享量", key: "最低分享量" },
  { group: "视频统计", label: "最高分享量", key: "最高分享量" },
  { group: "视频统计", label: "平均分享量", key: "平均分享量" },
  { group: "视频统计", label: "最低收藏量", key: "最低收藏量" },
  { group: "视频统计", label: "最高收藏量", key: "最高收藏量" },
  { group: "视频统计", label: "平均收藏量", key: "平均收藏量" },
  { group: "备注", label: "备注", key: "备注" },
]);

export function resolveCollectionExportHeaders(pluginId, taskType) {
  const plugin = String(pluginId || "");
  const type = String(taskType || "");
  if (plugin === "pgy" && type === "blogger") return PGY_BLOGGER_EXPORT_HEADERS;
  if (plugin === "pgy" && type === "notebook") return PGY_NOTEBOOK_EXPORT_HEADERS;
  if (plugin === "starmap") return STARMAP_EXPORT_HEADERS;
  if (plugin === "douyin") return DOUYIN_EXPORT_HEADERS;
  return null;
}

function normalizeFieldKey(field) {
  if (typeof field === "string") return field;
  if (field && typeof field === "object") return String(field.key || "");
  return "";
}

export function filterCollectionExportHeaders(headers, fields, rows) {
  const source = Array.isArray(headers) ? headers : [];
  const selected = new Set((Array.isArray(fields) ? fields : []).map(normalizeFieldKey).filter(Boolean));
  // 任务明确保存了 fields：规范表头按 schema 顺序保留所有已选字段，
  // 某字段在本批全部为空也保留（缺失值由单元格渲染为空白/“-”），
  // 绝不因“没有任何行出现该键”而静默删除列。
  if (selected.size > 0) {
    return source.filter((header) => header && selected.has(header.key));
  }
  // 只有没有 fields 的 legacy 历史任务，才允许按“实际出现字段”推断表头。
  const present = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== "object") continue;
    for (const key of Object.keys(row)) present.add(key);
  }
  return source.filter((header) => (
    header &&
    (selected.size === 0 || selected.has(header.key)) &&
    present.has(header.key)
  ));
}

export function buildCollectionHistoryExportPayload(task, rows) {
  const taskId = task ? task.taskId : void 0;
  const fileName = (task && task.fileName) || `${taskId}.xlsx`;
  const data = Array.isArray(rows) ? rows : [];
  const schema = resolveCollectionExportHeaders(task && task.pluginId, task && task.taskType);
  if (schema) {
    const headers = filterCollectionExportHeaders(schema, task && task.fields, data);
    if (headers.length > 0) {
      return {
        taskId,
        fileName,
        mode: "two-row",
        headers: headers.map((header) => ({ ...header })),
        data: blankMissingImageCells(data),
      };
    }
  }
  // 无规范 Schema（legacy 迁移任务等）或行数据不含任何规范字段时，保持单行兼容导出。
  return { taskId, fileName, data };
}

// 历史任务保存的图表图片可能已被清理；文件不存在时单元格置空，不导出本地路径文本。
function blankMissingImageCells(rows) {
  return rows.map((row) => {
    if (!row || typeof row !== "object") return row;
    let changed = false;
    const next = { ...row };
    for (const key of PGY_IMAGE_EXPORT_FIELDS) {
      const value = next[key];
      if (typeof value === "string" && value && value !== PGY_IMAGE_CELL_BLANK && !existsSync(value)) {
        next[key] = PGY_IMAGE_CELL_BLANK;
        changed = true;
      }
    }
    return changed ? next : row;
  });
}
