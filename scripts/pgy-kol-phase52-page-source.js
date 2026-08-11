function pgyKolDevEnabled(){try{return window.localStorage.getItem("magiorix-pgy-kol-enabled")==="1"}catch(e){return!1}}

function pgyKolWithLocalMenu(e){if(!pgyKolDevEnabled()||!Array.isArray(e))return e;for(var i=0;i<e.length;i++){if(e[i]&&e[i].path==="/pgy-kol-search")return e}return e.concat([{name:"找博主",path:"/pgy-kol-search",component:"pages/pgy-kol-search/index.tsx",icon:"solar:magnifer-bold-duotone"}])}

function pgyKolNodeKey(n){if(n&&n.uniqueKey)return n.uniqueKey;var v=n&&n.value!==undefined?String(n.value):"",p=n&&n.fullPath?n.fullPath:n&&n.label||"";return v+":"+p}

function pgyKolFlattenLeaves(n,out){out=out||[];if(!n)return out;if(n.children&&n.children.length>0){for(var i=0;i<n.children.length;i++)pgyKolFlattenLeaves(n.children[i],out);return out}out.push(n.value||n.label||n);return out}

function pgyKolOptValue(n){return typeof n==="string"?n:(n&&n.value!==undefined?n.value:n&&n.id)||String(n)}

function pgyKolOptLabel(n){return typeof n==="string"?n:(n&&n.label)||(n&&n.fullPath)||(n&&n.value!==undefined?String(n.value):String(n))}

function pgyKolReadJson(key){try{var raw=window.localStorage.getItem(key);if(!raw)return null;return JSON.parse(raw)}catch(e){return null}}

function pgyKolWriteJson(key,val){try{window.localStorage.setItem(key,JSON.stringify(val));return true}catch(e){return false}}

function pgyKolClearJson(key){try{window.localStorage.removeItem(key)}catch(e){}}

function pgyKolDefaultFilter(){return {searchType:1,keyword:"",marketTarget:null,audienceGroup:null,brands:[],contentTag:[],personalTags:[],featureTags:[],gender:null,location:null,audience20:[],automotive:[],consumeBehavior:[],signed:null,contentSceneLabel:[],contentTheme:[],fansNumberLower:"",fansNumberUpper:"",fansAge:null,fansGender:null,fansLocation:null,fansMaritalStatus:null,fansConsumptionLevel:null,fansChildAgeInfo:[],fansDevicePrice:[],fansDeviceBrand:[],industryTag:[],accumCommonImpMedinNum30d:null,readMidNor30:null,interMidNor30:null,thousandLikePercent30:null,noteType:null,notePriceLower:"",notePriceUpper:"",videoPriceLower:"",videoPriceUpper:"",coopCredit:null,progressOrderCnt:"",firstIndustry:"",secondIndustry:"",tradeReportBrandIdSet:[],coopImpMedin:null,coopReadMid:null,coopInterMid:null,coopOverflowMid:null,estimatePicReadCost:null,estimateVideoReadCost:null,estimatePicEngageCost:null,estimateVideoEngageCost:null,estimatePictureCpm:null,estimateVideoCpm:null,overflowCost:null,liveCount30d:[],avgLiveViewer:[],avgLiveGmv:[],noteCategory:[],inStar:false,newHighQuality:false,isHighQualityFlag:false,hasBuyerCoopAuthFlag:false,filterIntention:false,activityCodes:[],excludeLowActive:false,fansNumUp:false,excludedTradeReportBrand:false,excludedTradeInviteReportBrand:false}}

function pgyKolToFilterState(f){var out={};if(f.searchType===0||f.searchType===1)out.searchType=f.searchType;if(f.keyword)out.keyword=f.keyword;if(f.marketTarget)out.marketTarget=f.marketTarget;if(f.personalTags&&f.personalTags.length)out.personalTags=f.personalTags.map(pgyKolOptValue);var featureTags=[];if(f.featureTags&&f.featureTags.length)featureTags=featureTags.concat(f.featureTags.map(pgyKolOptValue));if(f.contentSceneLabel&&f.contentSceneLabel.length)featureTags=featureTags.concat(f.contentSceneLabel.map(pgyKolOptValue));if(featureTags.length)out.featureTags=featureTags.filter(function(v,i,a){return a.indexOf(v)===i});if(f.gender)out.gender=f.gender;if(f.location)out.location=[f.location];if(f.signed)out.signed=f.signed;if(f.audience20&&f.audience20.length)out.top20CrowdsLabel=f.audience20;if(f.automotive&&f.automotive.length)out.industrySpecificCrowdsMotorDom=f.automotive;if(f.consumeBehavior&&f.consumeBehavior.length)out.kolInfoConsumBehaviorLabel=f.consumeBehavior;if(f.contentTheme&&f.contentTheme.length)out.contentThemeLabel=f.contentTheme;if(f.fansNumberLower!==""){var lo=Number(f.fansNumberLower);if(Number.isFinite(lo)&&Number.isInteger(lo)&&lo>0)out.fansNumberLower=lo}if(f.fansNumberUpper!==""){var hi=Number(f.fansNumberUpper);if(Number.isFinite(hi)&&Number.isInteger(hi)&&hi>0)out.fansNumberUpper=hi}if(f.fansAge)out.fansAge=f.fansAge;if(f.fansGender)out.fansGender=f.fansGender;if(f.fansLocation)out.fansLocation=f.fansLocation;if(f.fansMaritalStatus)out.fansMaritalStatus=f.fansMaritalStatus;if(f.fansConsumptionLevel)out.fansConsumptionLevel=f.fansConsumptionLevel;if(f.fansChildAgeInfo&&f.fansChildAgeInfo.length)out.fansChildAgeInfo=f.fansChildAgeInfo;if(f.fansDevicePrice&&f.fansDevicePrice.length)out.fansDevicePrice=f.fansDevicePrice;if(f.fansDeviceBrand&&f.fansDeviceBrand.length)out.fansDeviceBrand=f.fansDeviceBrand;if(f.accumCommonImpMedinNum30d)out.accumCommonImpMedinNum30d=f.accumCommonImpMedinNum30d.value;if(f.readMidNor30)out.readMidNor30=f.readMidNor30.value;if(f.interMidNor30)out.interMidNor30=f.interMidNor30.value;if(f.thousandLikePercent30)out.thousandLikePercent30=f.thousandLikePercent30.value;if(f.noteType)out.noteType=f.noteType;if(f.notePriceLower!==""){var npl=Number(f.notePriceLower);if(Number.isFinite(npl)&&npl>=0)out.notePriceLower=npl}if(f.notePriceUpper!==""){var npu=Number(f.notePriceUpper);if(Number.isFinite(npu)&&npu>=0)out.notePriceUpper=npu}if(f.videoPriceLower!==""){var vpl=Number(f.videoPriceLower);if(Number.isFinite(vpl)&&vpl>=0)out.videoPriceLower=vpl}if(f.videoPriceUpper!==""){var vpu=Number(f.videoPriceUpper);if(Number.isFinite(vpu)&&vpu>=0)out.videoPriceUpper=vpu}if(f.progressOrderCnt!==""){var poc=Number(f.progressOrderCnt);if(Number.isFinite(poc)&&poc>=0)out.progressOrderCnt=poc}if(f.tradeReportBrandIdSet&&f.tradeReportBrandIdSet.length)out.tradeReportBrandIdSet=f.tradeReportBrandIdSet;if(f.activityCodes&&f.activityCodes.length)out.activityCodes=f.activityCodes;if(f.excludeLowActive)out.excludeLowActive=true;if(f.fansNumUp===true)out.fansNumUp=1;var hasBrands=f.brands&&f.brands.length>0;if(hasBrands&&f.excludedTradeReportBrand)out.excludedTradeReportBrand=true;if(hasBrands&&f.excludedTradeInviteReportBrand)out.excludedTradeInviteReportBrand=true;if(f.contentTag&&f.contentTag.length){var p51ct=f.contentTag.filter(function(t){return t!=="全部"});if(p51ct.length)out.contentTag=p51ct}if(f.coopCredit)out.inviteReply48hNumRatio=f.coopCredit.value;if(f.coopImpMedin)out.accumCoopImpMedinNum30d=f.coopImpMedin.value;if(f.coopReadMid)out.readMidCoop30=f.coopReadMid.value;if(f.coopInterMid)out.interMidCoop30=f.coopInterMid.value;if(f.coopOverflowMid)out.mCpuv30d=f.coopOverflowMid.value;if(f.estimatePicReadCost)out.estimatePicReadPrice=f.estimatePicReadCost.value;if(f.estimateVideoReadCost)out.estimateVideoReadPrice=f.estimateVideoReadCost.value;if(f.estimatePicEngageCost)out.estimatePictureEngageCost=f.estimatePicEngageCost.value;if(f.estimateVideoEngageCost)out.estimateVideoEngageCost=f.estimateVideoEngageCost.value;if(f.estimatePictureCpm)out.estimatePictureCpm=f.estimatePictureCpm.value;if(f.estimateVideoCpm)out.estimateVideoCpm=f.estimateVideoCpm.value;if(f.overflowCost)out.estimateCpuv30d=f.overflowCost.value;if(f.liveCount30d&&f.liveCount30d.length)out["filterList.kliveCnt30d"]=f.liveCount30d.map(function(n){return n.value});if(f.avgLiveViewer&&f.avgLiveViewer.length)out["filterList.avgLiveViewerNum"]=f.avgLiveViewer.map(function(n){return n.value});if(f.avgLiveGmv&&f.avgLiveGmv.length)out["filterList.avgAgmv90d"]=f.avgLiveGmv.map(function(n){return n.value});if(f.noteCategory&&f.noteCategory.length)out.contentSceneLabel=f.noteCategory;if(f.inStar===true)out.inStar=1;if(f.newHighQuality===true)out.newHighQuality=1;if(f.filterIntention===true)out.filterIntention=true;if(f.isHighQualityFlag===true)out["flagList.isHighQuality"]=true;if(f.hasBuyerCoopAuthFlag===true)out["flagList.hasBuyerCoopAuth"]=true;if(f.firstIndustry)out.firstIndustry=f.firstIndustry;if(f.secondIndustry)out.secondIndustry=f.secondIndustry;return out}

var pgyKolBaseToFilterState=pgyKolToFilterState;
pgyKolToFilterState=function(f){var out=pgyKolBaseToFilterState(f);delete out.progressOrderCnt;if(f.progressOrderCnt&&Array.isArray(f.progressOrderCnt.value))out.progressOrderCnt=f.progressOrderCnt.value.slice();if(f.tradeType&&f.tradeType!=="不限")out.tradeType=f.tradeType;if(f.tradeReportBrandIdSet&&f.tradeReportBrandIdSet.length&&f.excludedTradeReportBrandId===true)out.excludedTradeReportBrandId=true;return out};

function pgyKolClone(value){if(value===undefined)return undefined;return JSON.parse(JSON.stringify(value))}

function pgyKolStableSerialize(value){if(value===null||typeof value!=="object")return JSON.stringify(value);if(Array.isArray(value))return "["+value.map(pgyKolStableSerialize).join(",")+"]";var keys=Object.keys(value).sort(),parts=[];for(var i=0;i<keys.length;i++)parts.push(JSON.stringify(keys[i])+":"+pgyKolStableSerialize(value[keys[i]]));return "{"+parts.join(",")+"}"}

function pgyKolNormalizeFilter(filter){var next=Object.assign({},pgyKolDefaultFilter(),pgyKolClone(filter||{}));next.keyword=typeof next.keyword==="string"?next.keyword.trim():"";return next}

function pgyKolCreateSearchCoordinator(options){
  options=options||{};
  var state={draftFilter:pgyKolDefaultFilter(),appliedFilter:null,appliedRequestKey:null,status:"idle",error:null,result:null};
  var appliedRequestSnapshot=null,successfulKey=null,requestEpoch=0,latestSubmittedKey=null,inFlightByKey=Object.create(null);
  function bridge(){return typeof options.bridge==="function"?options.bridge():options.bridge}
  function filterKey(filter){return pgyKolStableSerialize(pgyKolNormalizeFilter(filter))}
  function requestSnapshot(filter){return pgyKolClone(pgyKolToFilterState(pgyKolNormalizeFilter(filter)))}
  function snapshot(){return {draftFilter:pgyKolClone(state.draftFilter),appliedFilter:pgyKolClone(state.appliedFilter),isDirty:state.appliedFilter===null||filterKey(state.draftFilter)!==filterKey(state.appliedFilter),appliedRequestKey:state.appliedRequestKey,status:state.status,error:pgyKolClone(state.error),result:pgyKolClone(state.result)}}
  function emit(){var view=snapshot();if(typeof options.onState==="function")options.onState(view);return view}
  function setDraft(next){state.draftFilter=Object.assign({},pgyKolDefaultFilter(),pgyKolClone(next||{}));if(typeof options.onDraft==="function")options.onDraft(pgyKolClone(state.draftFilter));emit();return snapshot()}
  function editDraft(patch){var current=pgyKolClone(state.draftFilter),value=typeof patch==="function"?patch(current):patch;return setDraft(Object.assign({},current,value||{}))}
  function restore(filter){requestEpoch++;latestSubmittedKey=null;inFlightByKey=Object.create(null);state.draftFilter=Object.assign({},pgyKolDefaultFilter(),pgyKolClone(filter||{}));state.appliedFilter=null;state.appliedRequestKey=null;state.status="idle";state.error=null;state.result=null;appliedRequestSnapshot=null;successfulKey=null;if(typeof options.onDraft==="function")options.onDraft(pgyKolClone(state.draftFilter));emit();return snapshot()}
  function notice(message){if(typeof options.onNotice==="function")options.onNotice(message)}
  function applyAndSearch(){
    var normalized=pgyKolNormalizeFilter(state.draftFilter),request=requestSnapshot(normalized),key=pgyKolStableSerialize(request),entry=inFlightByKey[key];
    state.draftFilter=pgyKolClone(normalized);
    latestSubmittedKey=key;
    if(typeof options.onDraft==="function")options.onDraft(pgyKolClone(normalized));
    if(entry){entry.normalized=pgyKolClone(normalized);entry.request=pgyKolClone(request);state.status="loading";state.error=null;emit();return entry.promise}
    if(successfulKey===key&&state.appliedFilter!==null){state.appliedFilter=pgyKolClone(normalized);appliedRequestSnapshot=pgyKolClone(request);state.appliedRequestKey=key;state.error=null;state.status=state.result&&Array.isArray(state.result.kols)&&state.result.kols.length>0?"loaded":"empty";notice("筛选未变化");emit();return Promise.resolve({ok:true,skipped:true,data:pgyKolClone(state.result)})}
    var api=bridge();
    if(!api||typeof api.searchFirstPage!=="function"){state.status="error";state.error={code:"bridge-missing",message:"当前环境不支持蒲公英找博主"};emit();return Promise.resolve({ok:false,error:pgyKolClone(state.error)})}
    var epoch=requestEpoch;
    state.status="loading";state.error=null;emit();
    var requested;
    try{requested=api.searchFirstPage(pgyKolClone(request))}catch(err){requested=Promise.reject(err)}
    entry={key:key,epoch:epoch,promise:null,normalized:pgyKolClone(normalized),request:pgyKolClone(request)};
    var promise=Promise.resolve(requested).then(function(res){
      if(epoch!==requestEpoch||key!==latestSubmittedKey||inFlightByKey[key]!==entry)return Object.assign({},res||{},{stale:true});
      if(res&&res.ok){var appliedNormalized=entry.normalized,appliedRequest=entry.request;state.appliedFilter=pgyKolClone(appliedNormalized);appliedRequestSnapshot=pgyKolClone(appliedRequest);state.appliedRequestKey=key;successfulKey=key;state.result=pgyKolClone(res.data);state.status=res.data&&Array.isArray(res.data.kols)&&res.data.kols.length>0?"loaded":"empty";state.error=null;if(appliedNormalized.searchType===0&&appliedNormalized.keyword&&typeof options.onHistory==="function")options.onHistory(appliedNormalized.keyword);if(typeof options.onResult==="function")options.onResult(pgyKolClone(res.data));emit();return res}
      var failure=res&&res.error?res.error:{code:"unknown",message:"查询失败"};state.error=pgyKolClone(failure);state.status=failure.code==="auth-expired"?"auth-expired":"error";state.appliedRequestKey=state.appliedFilter?successfulKey:null;emit();return res;
    }).catch(function(err){
      if(epoch!==requestEpoch||key!==latestSubmittedKey||inFlightByKey[key]!==entry)return {ok:false,stale:true,error:{code:err&&err.code||"unknown",message:err&&err.message||String(err)}};
      state.error={code:err&&err.code||"unknown",message:err&&err.message||String(err)};state.status="error";state.appliedRequestKey=state.appliedFilter?successfulKey:null;emit();return {ok:false,error:pgyKolClone(state.error)};
    }).then(function(res){if(inFlightByKey[key]===entry)delete inFlightByKey[key];return res});
    entry.promise=promise;
    inFlightByKey[key]=entry;
    return promise;
  }
  function startBatch(columns){var api=bridge(),view=snapshot(),appliedKey=appliedRequestSnapshot?pgyKolStableSerialize(appliedRequestSnapshot):null;if(!state.appliedFilter||view.isDirty||!successfulKey||successfulKey!==appliedKey){notice("请先确定筛选并查询");return Promise.resolve({ok:false,blocked:true,error:{code:"filter-not-applied",message:"请先确定筛选并查询"}})}if(!api||typeof api.batchStart!=="function")return Promise.resolve({ok:false,error:{code:"bridge-missing",message:"当前环境不支持批量采集"}});return api.batchStart({filterState:pgyKolClone(appliedRequestSnapshot),columns:pgyKolClone(columns||[])})}
  return {editDraft:editDraft,applyAndSearch:applyAndSearch,startBatch:startBatch,restore:restore,getState:snapshot};
}

function pgyKolUnprovenSet(){return window.__pgyKolUnproven||{}}

function pgyKolExportColumnIds(list,selected){var byId={};for(var i=0;i<list.length;i++){byId[list[i].id]=list[i]}var out=[];for(var j=0;j<selected.length;j++){var c=byId[selected[j]];if(c&&c.responsePath&&typeof c.responsePath==="string"&&c.responsePath.indexOf("computed:")!==0&&c.evidence!=="unavailable"){out.push(selected[j])}}return out}

function PgyKolTreeNode(p){var node=p.node,level=p.level||0,selected=p.selected||[],onToggle=p.onToggle,leafOnly=p.leafOnly||false,display=p.display||function(n){return n.fullPath||n.label||String(n.value)},has=node.children&&node.children.length>0,openState=m.useState(false),open=openState[0],setOpen=openState[1],key=pgyKolNodeKey(node),isSel=selected.indexOf(key)>-1,parentOnly=leafOnly&&has;return o.jsxs(x,{sx:{pl:level*1.5},children:[o.jsxs(x,{sx:{display:"flex",alignItems:"center",minHeight:30,gap:.25},children:[has?o.jsx(te,{size:"small",sx:{p:.25},onClick:function(e){e.stopPropagation(),setOpen(!open)},children:o.jsx(B,{icon:open?"solar:alt-arrow-up-bold-duotone":"solar:alt-arrow-down-bold-duotone",width:14,height:14})}):o.jsx(x,{sx:{width:24}}),parentOnly?o.jsx(w,{variant:"body2",sx:{wordBreak:"break-all"},children:display(node)}):o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:.75,flex:1,cursor:"pointer",py:.5},onClick:function(){onToggle(node)},children:[o.jsx(x,{sx:{width:16,height:16,borderRadius:2,border:"1px solid",borderColor:isSel?"primary.main":"divider",bgcolor:isSel?"primary.main":"transparent",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0},children:isSel?"✓":null}),o.jsx(w,{variant:"body2",sx:{wordBreak:"break-all"},children:display(node)})]})]}),open&&has&&node.children.map(function(c){return o.jsx(PgyKolTreeNode,{key:pgyKolNodeKey(c),node:c,level:level+1,selected:selected,onToggle:onToggle,display:display,leafOnly:leafOnly})})]})}

function PgyKolTree(p){return o.jsx(x,{sx:{display:"flex",flexDirection:"column"},children:p.nodes.map(function(n){return o.jsx(PgyKolTreeNode,{key:pgyKolNodeKey(n),node:n,level:0,selected:p.selected,onToggle:p.onToggle,display:p.display,leafOnly:p.leafOnly})})})}

function PgyKolChips(p){var keyOf=p.keyOf||pgyKolNodeKey;return o.jsx(x,{sx:{display:"flex",flexWrap:"wrap",gap:1},children:p.options.map(function(n){var key=keyOf(n),sel=p.selected.indexOf(key)>-1;return o.jsx(f1,{key:key,size:"small",label:p.display?p.display(n):n.label||n.fullPath||String(n.value),color:sel?"primary":"default",variant:sel?"filled":"outlined",onClick:function(){p.onToggle(n)}})})})}

function pgyKolStaticOptions(values){var out=[];for(var i=0;i<values.length;i++)out.push({value:values[i],label:values[i]});return out}

function pgyKolPresetActive(p,f){return f.fansNumberLower===p.lower&&f.fansNumberUpper===p.upper}

function pgyKolCollectLeafPaths(node,prefix){prefix=prefix||[];if(!node)return[];var here=prefix.concat([String(node.label||node.value||"")]);if(node.children&&node.children.length>0){var out=[];for(var i=0;i<node.children.length;i++)out=out.concat(pgyKolCollectLeafPaths(node.children[i],here));return out}return [here.join(" ")]}

function pgyKolSchemaUnproven(fields){var m={};if(Array.isArray(fields)){fields.forEach(function(fd){if(fd&&fd.payloadProven===false&&Array.isArray(fd.uiKeys)){fd.uiKeys.forEach(function(k){m[k]=1})}})}window.__pgyKolUnproven=m;return m}

function pgyKolNoteCatFallback(){return Object.keys(pgyKolNoteCategoryTree).map(function(k){return {label:k,value:k,children:pgyKolNoteCategoryTree[k]&&pgyKolNoteCategoryTree[k].nodes?pgyKolNoteCategoryTree[k].nodes:[]}})}

function pgyKolFixedColumnIds(){return ["kolInfo","recentNotes","actions"]}

function pgyKolDefaultColumnIds(list){return list.filter(function(c){return c.defaultDisplay===true}).map(function(c){return c.id})}

function pgyKolResolveColumns(list,stored){var fixed=pgyKolFixedColumnIds(),ids=[];function valid(v){return Array.isArray(v)&&v.length>0&&v.every(function(id){return typeof id==="string"&&(fixed.indexOf(id)>=0||list.some(function(c){return c.id===id}))})}if(valid(stored)){ids=stored.slice()}else{ids=pgyKolDefaultColumnIds(list)}if(ids.length===0){ids=list.slice(0,8).map(function(c){return c.id})}return fixed.concat(ids.filter(function(id){return fixed.indexOf(id)<0}))}

function pgyKolColumnGroups(){return ["固定列","博主报价","账号数据","直播数据","日常笔记数据","合作笔记数据","其他指标"]}

function pgyKolColumnGroupOf(c){return c&&c.group||"其他指标"}

/* 官网展示指标来自同一份 registry：固定「操作」不计入指标数；Phase 4
 * 为导出保留的博主信息独立列被明确放进 Magiorix 扩展分区，绝不丢字段。 */
function pgyKolIsExtensionColumn(c){return pgyKolColumnGroupOf(c)==="博主信息"}

function pgyKolOfficialMetricColumns(list){return (list||[]).filter(function(c){return !pgyKolIsExtensionColumn(c)&&c.id!=="actions"})}

function pgyKolThousand(v){var s=String(Math.round(Number(v))),out="",cnt=0;for(var i=s.length-1;i>=0;i--){out=s[i]+out;cnt++;if(cnt%3===0&&i>0)out=","+out}return out}

function pgyKolFormatCell(v,fmt){if(v===undefined||v===null||v==="")return "-";if(fmt==="number")return pgyKolThousand(v);if(fmt==="percent"){var n=Number(v);return Number.isFinite(n)?(Math.abs(n)<=1?n*100:n).toFixed(1)+"%":String(v)}if(fmt==="money")return String(v)+"元";return String(v)}

function pgyKolCellValue(k,col){if(!col||col.evidence==="unavailable")return {unavailable:true};if(col.id==="price"){var pic=k&&k.picturePrice,vid=k&&k.videoPrice,ps=[];if(pic!==undefined&&pic!==null&&pic!=="")ps.push(String(pic)+"元");if(vid!==undefined&&vid!==null&&vid!=="")ps.push(String(vid)+"元");return {value:ps.length?ps.join(" / "):undefined}}var path=col.responsePath||col.id;if(!path||String(path).indexOf("computed:")===0)return {value:undefined};var parts=String(path).split("."),cur=k;for(var i=0;i<parts.length;i++){if(cur===undefined||cur===null)return {value:undefined};cur=cur[parts[i]]}return {value:cur}}

function pgyKolInfoCell(k){var avatar=k&&(k.avatar||k.avatarUrl)||"";return o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1,minWidth:240},children:[avatar?o.jsx(x,{component:"img",src:avatar,sx:{width:36,height:36,borderRadius:"50%",objectFit:"cover",flexShrink:0}}):o.jsx(x,{sx:{width:36,height:36,borderRadius:"50%",bgcolor:"action.hover",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0},children:"👤"}),o.jsxs(x,{sx:{minWidth:0},children:[o.jsx(w,{variant:"body2",fontWeight:600,noWrap:true,children:k&&k.nickname||"-"}),o.jsx(w,{variant:"caption",color:"text.secondary",sx:{display:"block",fontFamily:"monospace",wordBreak:"break-all"},children:k&&k.userId||"-"}),o.jsx(w,{variant:"caption",color:"text.secondary",sx:{display:"block"},children:((k&&k.location)||"-")+" · "+((k&&k.gender)||"-")})]})]})}

function pgyKolStickyColumnStyle(id,header){var ids=pgyKolFixedColumnIds(),widths=[260,120,84],index=ids.indexOf(id);if(index<0)return {};var left=0;for(var i=0;i<index;i++)left+=widths[i];return {position:"sticky",left:left,zIndex:header?4:2,bgcolor:header?"#f5f6f7":"#fff",width:widths[index],minWidth:widths[index],maxWidth:widths[index],boxShadow:index===ids.length-1?"2px 0 0 #e5e6eb":"inset -1px 0 0 #f0f1f3"}}

function PgyKolResultTable(p){var result=p.result,kols=result.kols||[],list=p.list||[],columns=p.columns||[],colOf=function(id){for(var i=0;i<list.length;i++){if(list[i].id===id)return list[i]}return null},cell=function(k,id){if(id==="kolInfo")return pgyKolInfoCell(k);if(id==="recentNotes"){var rn=k&&k.recentNotes;if(Array.isArray(rn))return o.jsx(w,{variant:"body2",children:rn.length+" 篇"});return o.jsx(w,{variant:"body2",children:rn!=null&&rn!==""?String(rn):"-"})}if(id==="actions")return o.jsx(w,{variant:"body2",children:"-"});var c=colOf(id);if(!c)return o.jsx(w,{variant:"body2",children:"-"});if(c.unavailable===true)return o.jsx(w,{variant:"body2",color:"text.secondary",children:"官网当前未返回"});var v=pgyKolCellValue(k,c);if(v.unavailable)return o.jsx(w,{variant:"body2",color:"text.secondary",children:"官网当前未返回"});if(v.value===undefined||v.value===null||v.value==="")return o.jsx(w,{variant:"body2",color:"text.secondary",children:"-"});if(c.formatter==="url")return o.jsx(w,{variant:"body2",component:"a",href:String(v.value),target:"_blank",rel:"noreferrer",sx:{color:"primary.main",wordBreak:"break-all"},children:String(v.value)});return o.jsx(w,{variant:"body2",children:pgyKolFormatCell(v.value,c.formatter)})};return o.jsx(x,{sx:{overflow:"auto",maxHeight:520,border:"1px solid",borderColor:"divider",borderRadius:1,position:"relative"},children:o.jsx(x,{component:"table",sx:{borderCollapse:"separate",borderSpacing:0,minWidth:1080,width:"100%"},children:[o.jsx(x,{component:"thead",children:o.jsx(x,{component:"tr",children:columns.map(function(id,hi){var h=id==="kolInfo"?"博主信息":id==="recentNotes"?"近期笔记":id==="actions"?"操作":(colOf(id)&&colOf(id).label)||id;return o.jsx(x,{component:"th",key:hi,sx:Object.assign({p:1,borderBottom:"1px solid",borderColor:"divider",textAlign:"left",whiteSpace:"nowrap",fontWeight:600,fontSize:12,bgcolor:"#f5f6f7"},pgyKolStickyColumnStyle(id,true)),children:h})})})}),o.jsx(x,{component:"tbody",children:kols.map(function(k,ki){return o.jsx(x,{component:"tr",key:k&&k.userId||"row-"+ki,children:columns.map(function(id,ci){return o.jsx(x,{component:"td",key:ci,sx:Object.assign({p:1,borderBottom:"1px solid",borderColor:"divider",verticalAlign:"middle",whiteSpace:"nowrap",bgcolor:"#fff"},pgyKolStickyColumnStyle(id,false)),children:cell(k,id)})})})})})]})})}

function pgyKolStatusText(s){if(s==="running")return "采集中";if(s==="paused")return "已暂停";if(s==="auth-expired")return "登录已失效";if(s==="risk-control")return "触发风控";if(s==="cancelled")return "已取消";if(s==="failed")return "采集失败";if(s==="incomplete")return "采集未完整";if(s==="completed")return "已完成";return s||"未知状态"}

function pgyKolCompletenessText(t){if(!t)return "";if(t.completeness==="complete")return "完整性已证明";if(t.completeness==="cannot-prove")return "完整性无法证明（原因："+(t.summary&&t.summary.stopReason||t.warning||"无法证明")+"）";return "完整性未证明"}

function pgyKolResumePlan(t){if(!t)return null;var reason=t.summary&&t.summary.stopReason,cur=t.budgets||{},used=Number.isFinite(t.budgetUsed)?t.budgetUsed:0;if(t.status==="incomplete"){if(reason==="budget-exhausted"){var curB=Number.isInteger(cur.queryBudget)?cur.queryBudget:400,min=Math.max(curB,used)+1;if(min>1000)return {kind:"blocked",reasonText:"已消费请求数已达预算上限（1000），无法继续增加预算"};return {kind:"budget",label:"查询预算",current:curB,used:used,min:min,max:1000,reasonText:"查询预算已耗尽，请输入更大的总预算后从原检查点继续"}}if(reason==="max-pages-reached"){var curM=Number.isInteger(cur.maxPagesPerLeaf)?cur.maxPagesPerLeaf:250;if(curM>=250)return {kind:"blocked",reasonText:"已到官方安全页数上限（250 页），无法继续同一查询"};return {kind:"maxPages",label:"单叶子最大页数",current:curM,used:used,min:curM+1,max:250,reasonText:"已达单叶子最大页数，请输入更大的页数预算后从原检查点继续"}}if(reason==="repeat-page")return {kind:"blocked",reasonText:"检测到连续重复页，分页可能复读，继续无法证明完整"};if(reason==="capped-unprovable")return {kind:"blocked",reasonText:"无安全切分维度，继续会重复抓取且无法证明完整"};if(reason==="checkpoint-desync")return {kind:"blocked",reasonText:"检查点与行数据不一致，禁止继续"};return {kind:"blocked",reasonText:"该任务无法安全继续，可导出已有数据"}}if(t.status==="completed"&&t.completeness!=="complete")return {kind:"blocked",reasonText:"该任务已完成但完整性未证明（旧版任务），无法继续，可导出已有数据"};return null}

function pgyKolBatchErrorMessage(e){if(!e)return "";if(e.code==="filter-not-applied")return "请先确定筛选并查询";if(e.code==="auth-expired")return "蒲公英登录已失效，请重新授权";if(e.code==="risk-control")return "触发风控，采集已停止";if(e.code==="failed"||e.kind==="failed")return "采集失败（错误码 "+(e.code||"unknown")+"）："+(e.message||"未知错误");return "任务操作失败（错误码 "+(e.code||"unknown")+"）："+(e.message||"未知错误")}

function pgyKolCount(t,k){return t&&t.counts&&t.counts[k]!=null?t.counts[k]:0}

function pgyKolPagesDone(t){if(!t||!Array.isArray(t.leaves))return 0;var n=0;for(var i=0;i<t.leaves.length;i++){var l=t.leaves[i];if(l&&Array.isArray(l.pagesCompleted))n+=l.pagesCompleted.length}return n}

function pgyKolAnyCapped(t){if(!t)return false;if(t.capSignal&&t.capSignal.capped)return true;if(Array.isArray(t.leaves)){for(var i=0;i<t.leaves.length;i++){if(t.leaves[i]&&t.leaves[i].capSignal&&t.leaves[i].capSignal.capped)return true}}return false}

function PgyKolBatchPanel(p){var bv=m.useState(""),budgetInput=bv[0],setBudgetInput=bv[1];var t=p.task;if(!t)return null;var counts=t.counts||{},statusText=pgyKolStatusText(t.status),completenessText=pgyKolCompletenessText(t),pages=pgyKolPagesDone(t),capped=pgyKolAnyCapped(t),subCount=t.summary&&t.summary.subqueryCount!=null?t.summary.subqueryCount:0,resumePlan=pgyKolResumePlan(t),resumeEligible=resumePlan&&(resumePlan.kind==="budget"||resumePlan.kind==="maxPages"),parsedInput=budgetInput.trim()===""?NaN:Number(budgetInput),inputValid=resumeEligible&&Number.isInteger(parsedInput)&&parsedInput>=resumePlan.min&&parsedInput<=resumePlan.max,legacyUnproven=t.status==="completed"&&t.completeness!=="complete",incompleteShown=t.status==="incomplete"||legacyUnproven;return o.jsxs(xe,{variant:"outlined",sx:{mt:2},children:[o.jsxs(We,{children:[o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1,mb:1,flexWrap:"wrap"},children:[o.jsx(w,{variant:"subtitle1",fontWeight:600,children:"任务进度"}),o.jsx(f1,{size:"small",color:t.status==="completed"&&t.completeness==="complete"?"success":incompleteShown?"warning":t.status==="failed"||t.status==="risk-control"?"error":t.status==="running"?"info":"default",label:incompleteShown?"采集未完整/需要处理":statusText}),capped&&o.jsx(f1,{size:"small",color:"warning",label:"结果可能超过 5000"})]}),o.jsx(w,{variant:"caption",color:"text.secondary",sx:{display:"block",mb:1,fontFamily:"monospace",wordBreak:"break-all"},children:"任务 ID："+t.taskId}),incompleteShown&&o.jsx(oe,{severity:"warning",sx:{mb:1},children:"采集未完整/需要处理："+(resumePlan&&resumePlan.reasonText||completenessText)}),!incompleteShown&&o.jsx(oe,{severity:completenessText.indexOf("无法证明")>=0?"warning":"success",sx:{mb:1},children:completenessText}),o.jsxs(x,{sx:{display:"flex",gap:1,flexWrap:"wrap",mb:1},children:[o.jsx(f1,{size:"small",variant:"outlined",label:"原始条数 "+(counts.raw!=null?counts.raw:0)}),o.jsx(f1,{size:"small",variant:"outlined",label:"唯一博主数 "+(counts.unique!=null?counts.unique:0)}),o.jsx(f1,{size:"small",variant:"outlined",label:"重复数 "+(counts.dup!=null?counts.dup:0)}),o.jsx(f1,{size:"small",variant:"outlined",label:"缺UID异常数 "+(counts.missingUid!=null?counts.missingUid:0)}),o.jsx(f1,{size:"small",variant:"outlined",label:"已抓页数 "+pages}),o.jsx(f1,{size:"small",variant:"outlined",label:"子查询数 "+subCount})]}),resumeEligible&&o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1,flexWrap:"wrap",mb:1},children:[o.jsx(w,{variant:"body2",color:"text.secondary",children:"当前"+resumePlan.label+"："+resumePlan.current+"；已消费请求数："+resumePlan.used+"；允许新值："+resumePlan.min+"～"+resumePlan.max}),o.jsx(ae,{size:"small",type:"number",value:budgetInput,onChange:function(e){setBudgetInput(e.target.value)},placeholder:"请输入新"+resumePlan.label,sx:{maxWidth:180}}),o.jsx($,{size:"small",variant:"contained",disabled:!inputValid,onClick:function(){var nb={};if(resumePlan.kind==="budget"){nb.queryBudget=parsedInput}else{nb.maxPagesPerLeaf=parsedInput}p.onResumeWithBudgets(nb)},children:resumePlan.kind==="maxPages"?"增加页数并继续":"增加预算并继续"})]}),resumePlan&&resumePlan.kind==="blocked"&&o.jsx(w,{variant:"body2",color:"text.secondary",sx:{display:"block",mb:1},children:resumePlan.reasonText}),o.jsxs(x,{sx:{display:"flex",gap:1,flexWrap:"wrap"},children:[t.status==="running"&&o.jsx($,{size:"small",variant:"outlined",onClick:p.onPause,children:"暂停"}),(t.status==="paused"||t.status==="auth-expired"||t.status==="interrupted"||t.status==="failed")&&o.jsx($,{size:"small",variant:"outlined",onClick:p.onResume,children:"继续"}),(t.status==="cancelled"||t.status==="failed"||t.status==="completed"||t.status==="incomplete")?null:o.jsx($,{size:"small",variant:"outlined",color:"error",onClick:p.onCancel,children:"取消"}),o.jsx($,{size:"small",variant:"outlined",onClick:p.onExport,children:"导出"})]})]})]})}

function PgyKolTaskHistory(p){return o.jsxs(xe,{variant:"outlined",sx:{mt:2},children:[o.jsxs(We,{children:[o.jsx(w,{variant:"subtitle1",fontWeight:600,sx:{mb:1},children:"任务历史"}),p.error&&o.jsx(oe,{severity:"error",sx:{mb:1},children:"任务历史加载失败（错误码 "+(p.error.code||"unknown")+"）："+(p.error.message||"未知错误")}),!p.error&&(!p.tasks||p.tasks.length===0)&&o.jsx(w,{variant:"body2",color:"text.secondary",children:"暂无采集任务"}),p.tasks&&p.tasks.map(function(t){var c=t.counts||{};return o.jsxs(x,{key:t.taskId,sx:{display:"flex",alignItems:"center",gap:1,mb:1,flexWrap:"wrap"},children:[o.jsx(w,{variant:"body2",sx:{fontFamily:"monospace",wordBreak:"break-all"},children:t.taskId}),o.jsx(f1,{size:"small",variant:"outlined",color:t.status==="completed"&&t.completeness==="complete"?"success":t.status==="incomplete"?"warning":"default",label:t.status==="incomplete"?"采集未完整":pgyKolStatusText(t.status)}),o.jsx(f1,{size:"small",variant:"outlined",label:t.completeness==="complete"?"完整性已证明":"完整性未证明"}),o.jsx(w,{variant:"caption",color:"text.secondary",children:"原始 "+(c.raw!=null?c.raw:0)+" / 唯一 "+(c.unique!=null?c.unique:0)+" / 重复 "+(c.dup!=null?c.dup:0)+" / 缺UID "+(c.missingUid!=null?c.missingUid:0)}),o.jsx(w,{variant:"caption",color:"text.secondary",children:t.updatedAt||""}),o.jsx($,{size:"small",variant:"outlined",onClick:function(){p.onSelect(t.taskId)},children:"查看"}),o.jsx($,{size:"small",variant:"outlined",onClick:function(){p.onExport(t.taskId)},children:"导出"})]})})]})]})}

function PgyKolBrandPopup(p){var kw=m.useState(""),keyword=kw[0],setKeyword=kw[1],ops=m.useState([]),options=ops[0],setOptions=ops[1],ld=m.useState(false),loading=ld[0],setLoading=ld[1],bpe=m.useState(null),brandError=bpe[0],setBrandError=bpe[1],dr=m.useState([]),draft=dr[0],setDraft=dr[1],tr=m.useRef(null);function fetchBrands(kw0){var bridge=window.bridge&&window.bridge.pgyKol;if(!bridge||!bridge.getConfig)return;setLoading(true);bridge.getConfig({provider:"brandSearch",keyword:kw0||""}).then(function(res){setLoading(false);if(res&&res.ok){var data=res.data||{},list=data.options||data.nodes||(Array.isArray(res.data)?res.data:[]);setOptions(list);setBrandError(null)}else{setBrandError(res&&res.error||{code:"unknown",message:"品牌搜索失败"})}}).catch(function(e){setLoading(false);setBrandError({code:e&&e.code||"unknown",message:e&&e.message||String(e)})})}m.useEffect(function(){if(!p.open)return;setDraft(Array.isArray(p.current)?p.current.slice():[]);setKeyword("");setOptions([]);setBrandError(null)},[p.open]);var onKeyword=function(e){var v=e.target.value;setKeyword(v);if(tr.current)window.clearTimeout(tr.current);tr.current=window.setTimeout(function(){fetchBrands(v)},300)},toggleBrand=function(n){var v=pgyKolOptValue(n);setDraft(function(prev){var i=prev.indexOf(v);return i>=0?prev.slice(0,i).concat(prev.slice(i+1)):prev.concat([v])})};return o.jsxs(ue,{open:p.open,onClose:p.onClose,maxWidth:"sm",fullWidth:true,children:[o.jsx(be,{children:o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1},children:[o.jsx(w,{variant:"subtitle1",fontWeight:600,children:p.mode==="recent"?"近期合作品牌":"合作品牌智能推荐"}),o.jsx(te,{size:"small",sx:{ml:"auto"},onClick:p.onClose,children:o.jsx(B,{icon:"mdi:close",width:18,height:18})})]})}),o.jsxs(pe,{children:[o.jsx(ae,{size:"small",fullWidth:true,placeholder:"搜索品牌关键词",value:keyword,onChange:onKeyword,sx:{mb:1}}),brandError&&o.jsx(oe,{severity:"error",sx:{mb:1},children:"品牌搜索失败（错误码 "+(brandError.code||"unknown")+"）："+(brandError.message||"未知错误")}),loading&&o.jsx(Q1,{sx:{mb:1}}),options.length>0?o.jsxs(x,{sx:{display:"flex",flexWrap:"wrap",gap:.5,maxHeight:260,overflowY:"auto"},children:[options.map(function(n){var v=pgyKolOptValue(n),sel=draft.indexOf(v)>=0;return o.jsx(f1,{key:String(v),size:"small",label:pgyKolOptLabel(n),color:sel?"primary":"default",variant:sel?"filled":"outlined",onClick:function(){toggleBrand(n)}})}),o.jsx(w,{variant:"caption",color:"text.secondary",sx:{width:"100%"},children:"已选 "+draft.length+" 个品牌"})]}):!loading&&o.jsx(w,{variant:"body2",color:"text.secondary",children:"输入关键词搜索品牌"})]}),o.jsxs(_e,{children:[o.jsx($,{onClick:p.onClose,children:"取消"}),draft.length===0&&o.jsx(w,{variant:"caption",color:"text.secondary",children:"请选择您的合作品牌"}),o.jsx($,{variant:"contained",disabled:draft.length===0,onClick:function(){p.onApply(draft.slice());p.onClose()},children:"确定"})]})]})}

function PgyKolNoteCatNode(p){var node=p.node,level=p.level||0,prefix=p.prefix||[],sel=p.selected||[],onToggle=p.onToggle,has=node.children&&node.children.length>0,os=m.useState(false),open=os[0],setOpen=os[1],here=prefix.concat([String(node.label||node.value||"")]);function pathOf(n,acc){var h2=acc.concat([String(n.label||n.value||"")]);if(n.children&&n.children.length>0){var out=[];for(var i=0;i<n.children.length;i++)out=out.concat(pathOf(n.children[i],h2));return out}return [h2.join(" ")]}var paths=has?[]:pathOf(node,prefix),isSel=!has&&paths.length===1&&sel.indexOf(paths[0])>=0;return o.jsxs(x,{sx:{pl:level*1.5},children:[o.jsxs(x,{sx:{display:"flex",alignItems:"center",minHeight:30,gap:.25},children:[has?o.jsx(te,{size:"small",sx:{p:.25},onClick:function(e){e.stopPropagation();setOpen(!open)},children:o.jsx(B,{icon:open?"solar:alt-arrow-up-bold-duotone":"solar:alt-arrow-down-bold-duotone",width:14,height:14})}):o.jsx(x,{sx:{width:24}}),o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:.75,flex:1,cursor:has?"default":"pointer",py:.5},onClick:function(){if(!has&&paths.length===1)onToggle(paths[0])},children:[o.jsx(x,{sx:{width:16,height:16,borderRadius:2,border:"1px solid",borderColor:isSel?"primary.main":"divider",bgcolor:isSel?"primary.main":"transparent",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,flexShrink:0},children:isSel?"✓":null}),o.jsx(w,{variant:"body2",sx:{wordBreak:"break-all"},children:String(node.label||node.value||"")})]})]}),open&&has&&node.children.map(function(c){return o.jsx(PgyKolNoteCatNode,{key:String(c.label||c.value||"")+"|"+level,node:c,level:level+1,prefix:here,selected:sel,onToggle:onToggle})})]})}

function PgyKolNoteCategoryPopup(p){var inds=p.nodes&&p.nodes.length?p.nodes:pgyKolNoteCatFallback();var ind=inds.find(function(n){return String(n.label||n.value)===p.industry})||inds[0]||null;var nodes=ind&&ind.children?ind.children:[];var sel=p.selected||[];function toggleLeaf(path){var i=sel.indexOf(path),next=i>=0?sel.slice(0,i).concat(sel.slice(i+1)):sel.concat([path]);p.onToggle(next)}var tree=nodes.length>0?o.jsxs(x,{sx:{maxHeight:360,overflowY:"auto",border:"1px solid",borderColor:"divider",borderRadius:1,p:.5},children:nodes.map(function(n){return o.jsx(PgyKolNoteCatNode,{key:String(n.label||n.value||""),node:n,level:0,prefix:[String(ind&&(ind.label||ind.value||""))].filter(Boolean),selected:sel,onToggle:toggleLeaf})})}):o.jsx(w,{variant:"body2",color:"text.secondary",children:"该行业暂无子类目"});var countLine=o.jsx(w,{variant:"caption",color:"text.secondary",sx:{display:"block",mt:1},children:"已选 "+sel.length+" 项"});return o.jsx(PgyKolPop,{open:p.open,anchor:p.anchor,onClose:p.onClose,width:340,preferredHeight:440,children:o.jsxs(x,{sx:{display:"flex",flexDirection:"column",minHeight:0,flex:1},children:[o.jsx(PgyKolPopHeader,{title:String(ind&&(ind.label||ind.value||""))||"笔记类目",onClose:p.onClose}),o.jsxs(x,{sx:{p:1,display:"flex",flexDirection:"column",minHeight:0,flexGrow:1},children:[tree,countLine]})]})})}

function PgyKolIndustryPopup(p){var firsts=p.cfg&&p.cfg.nodes&&p.cfg.nodes.length?p.cfg.nodes:[];var firstSel=firsts.find(function(n){return String(n.label||n.value)===p.first})||null;var seconds=firstSel&&firstSel.children?firstSel.children:[];var closeBtn=o.jsx(te,{size:"small",sx:{ml:"auto"},onClick:p.onClose,children:o.jsx(B,{icon:"mdi:close",width:18,height:18})});var header=o.jsx(be,{children:o.jsxs(x,{sx:{display:"flex",alignItems:"center",gap:1},children:[o.jsx(w,{variant:"subtitle1",fontWeight:600,children:"行业推荐博主"}),closeBtn]})});var tip=o.jsx(w,{variant:"caption",color:"text.secondary",children:"选择行业后，平台优先展示该行业下内容更匹配、数据更优质的博主"});var emptyTip=firsts.length===0?o.jsx(w,{variant:"body2",color:"text.secondary",children:"行业列表加载中…"}):null;var firstRow=firsts.length>0?o.jsxs(x,{children:[o.jsx(w,{variant:"caption",color:"text.secondary",children:"一级行业"}),o.jsx(PgyKolChips,{options:firsts,keyOf:function(n){return pgyKolNodeKey(n)},selected:p.first?[firsts.find(function(n){return String(n.label||n.value)===p.first})].filter(Boolean):[],onToggle:function(n){p.onFirst(String(n.label||n.value));p.onSecond("")}})]}):null;var secondRow=seconds.length>0?o.jsxs(x,{children:[o.jsx(w,{variant:"caption",color:"text.secondary",children:"二级行业"}),o.jsx(PgyKolChips,{options:seconds,keyOf:function(n){return pgyKolNodeKey(n)},selected:p.second?[seconds.find(function(n){return String(n.label||n.value)===p.second})].filter(Boolean):[],onToggle:function(n){p.onSecond(String(n.label||n.value))}})]}):null;return o.jsxs(ue,{open:p.open,onClose:p.onClose,maxWidth:"sm",fullWidth:true,children:[header,o.jsxs(pe,{children:[tip,emptyTip,firstRow,secondRow]})]})}

var pgyKolCategoryCommon=["全部","美妆","护肤","个人护理","母婴","时尚","美食","家居家装","影视综资讯","运动健身","宠物","文化艺术","兴趣爱好","生活记录","教育","职场"];
var pgyKolCategoryFull=["全部","美妆","护肤","个人护理","母婴","时尚","美食","家居家装","影视综资讯","运动健身","宠物","文化艺术","兴趣爱好","生活记录","教育","职场","情感","摄影","游戏","科技数码","出行旅游","音乐","搞笑","健康养生","汽车","婚嫁","商业财经","素材","其他"];
/* 博主类目二级树回退：官网 distributors-tags content_category 实测（2026-08-10），
 * 职场/汽车二级按官网 hover 面板实测补充（2026-08-11：职场干货/职场行业/职业考试/职场其他；
 * 用车攻略/汽车评测/汽车其他）。
 * 运行时优先使用 contentTagTree 配置（含 LKG），此表仅作两者都不可用时的兜底；
 * 无二级类目的一级项（音乐/搞笑/健康养生/商业财经/素材/其他）返回空数组。 */
var pgyKolCategoryTreeFallback=[["美妆",["整体妆容","唇妆","眼妆","美甲","底妆","美妆合集","香水","美妆其他"]],["护肤",["面部保养","面部清洁","护肤合集","护肤其他"]],["个人护理",["头发产品","身体护理","口腔护理","护理其他"]],["母婴",["母婴日常","早教","婴童用品","婴童洗护","婴童食品","婴童时尚","孕期穿搭","孕产经验","产后恢复","育儿经验","宝宝才艺","宝宝写真","母婴其他"]],["时尚",["穿搭","配饰","发型","箱包","鞋靴","时尚其他"]],["美食",["美食教程","美食探店","美食展示","美食测评","吃播","美食其他"]],["家居家装",["装修","家居用品","家居装饰","家具","家电","室内设计","居家经验","家居家装其他"]],["影视综资讯",["动漫","电影","电视","娱乐资讯","影视","民生资讯","综艺","影视综其他"]],["运动健身",["健身减肥","健身塑形","滑雪","滑板","水上活动","运动其他","足球","篮球","跑步","游泳"]],["宠物",["猫","狗","动物其他"]],["文化艺术",["社科","文化","艺术","文化艺术其他"]],["兴趣爱好",["绘画","手工","阅读","文具手账","舞蹈","益智玩具","潮流玩具","兴趣爱好其他"]],["生活记录",["接地气生活","日常片段","中外生活","品质生活","校园生活"]],["教育",["大学教育","k12教育","家庭教育","学习日常","职场教育","教育其他"]],["职场",["职场干货","职场行业","职业考试","职场其他"]],["情感",["情感知识","情感日常","情感其他"]],["摄影",["人文风光摄影","摄影技巧","胶片摄影","人像摄影","摄影其他"]],["游戏",["手机游戏","主机游戏","游戏其他","线下游戏"]],["科技数码",["数码","玩机攻略","数码科技其他"]],["出行旅游",["城市出行","户外","旅行"]],["汽车",["用车攻略","汽车评测","汽车其他"]],["婚嫁",["婚礼造型","婚礼记录","婚礼经验","婚礼用品"]]];
function pgyKolCategoryTreeNodes(cfg){var live=cfg&&cfg.nodes&&cfg.nodes.length?cfg.nodes:null;if(!live)return pgyKolCategoryTreeFallback.map(function(pair){return{value:pair[0],label:pair[0],children:pair[1].map(function(s){return{value:s,label:s,children:[]}})}});var fb={};for(var i=0;i<pgyKolCategoryTreeFallback.length;i++)fb[pgyKolCategoryTreeFallback[i][0]]=pgyKolCategoryTreeFallback[i][1];return live.map(function(n){var kids=n&&Array.isArray(n.children)&&n.children.length?n.children:null;if(!kids){var fk=fb[n.value]||fb[n.label]||[];kids=fk.map(function(s){return{value:s,label:s,children:[]}})}return{value:n.value,label:n.label||n.value,children:kids||[]}})}
function pgyKolCategoryNodeKids(nodes,value){if(!Array.isArray(nodes))return[];for(var i=0;i<nodes.length;i++)if(nodes[i]&&nodes[i].value===value)return nodes[i].children||[];return[]}
var pgyKolMarketOptions=pgyKolStaticOptions(["曝光","种草","转化"]);
var pgyKolGenderOptions=pgyKolStaticOptions(["不限","男","女"]);
var pgyKolSignedOptions=pgyKolStaticOptions(["不限","个人博主","机构博主"]);
var pgyKolNoteTypeOptions=[{label:"不限",value:null},{label:"图文笔记为主",value:1},{label:"视频笔记为主",value:2}];
var pgyKolRecentIndustryOptions=pgyKolStaticOptions(["不限","美妆个护","食品饮料","母婴","3c及电器","日用百货","服装配饰","互联网","生活服务","家居建材","汽车"]);
var pgyKolFansAgeOptions=pgyKolStaticOptions(["18岁以下","18-24","25-34","35-44","45岁以上"]);
var pgyKolFansGenderOptions=pgyKolStaticOptions(["不限","男","女"]);
var pgyKolMaritalOptions=pgyKolStaticOptions(["不限","未婚","已婚","恋爱中"]);
var pgyKolConsumptionOptions=pgyKolStaticOptions(["不限","低","中","高","极高"]);
var pgyKolChildAgeOptions=pgyKolStaticOptions(["备孕","0-6月","7-12月","1-3岁","4-6岁","7-12岁","孕早期","孕晚期"]);
var pgyKolDevicePriceOptions=pgyKolStaticOptions(["2000元以下","2000-4000元","4000-6000元","6000元以上"]);
var pgyKolDeviceBrandOptions=pgyKolStaticOptions(["苹果","华为","OPPO","VIVO","荣耀","小米","一加","魅族","中兴","联想"]);
var pgyKolRangeOptions50w=[{label:"5万以上",value:[50000,-1]},{label:"1万～5万",value:[10000,50000]},{label:"0.5万～1万",value:[5000,10000]},{label:"0.1万～0.5万",value:[1000,5000]}];
var pgyKolRangeOptions2000=[{label:"2000以上",value:[2000,-1]},{label:"1000～2000",value:[1000,2000]},{label:"500～1000",value:[500,1000]},{label:"200～500",value:[200,500]},{label:"100～200",value:[100,200]}];
var pgyKolRangeOptionsPercent=[{label:"40%以上",value:[40,null]},{label:"30%～40%",value:[30,40]},{label:"20%～30%",value:[20,30]},{label:"10%～20%",value:[10,20]},{label:"10%以下",value:[null,10]}];
/* 2026-08-11 官网实测：家庭身份/职业身份/特色背景/擅长内容均为「组→子项」级联结构。 */
var pgyKolFamilyTree={nodes:[{label:"家庭角色",children:pgyKolStaticOptions(["妈妈","萌娃","爸爸","奶奶"])},{label:"出镜人关系",children:pgyKolStaticOptions(["情侣","夫妻","家庭","闺蜜","兄弟"])},{label:"母婴阶段",children:pgyKolStaticOptions(["备孕中","孕期中","0-6个月","6-12个月","1-3岁","3-6岁","6-12岁","12岁以上"])}]};
var pgyKolCareerTree={nodes:[{label:"传统行业",children:pgyKolStaticOptions(["工程师","销售","HR"])},{label:"互联网",children:pgyKolStaticOptions(["主播","运营","产品经理","程序员"])},{label:"教育科研",children:pgyKolStaticOptions(["学生"])},{label:"金融法律",children:pgyKolStaticOptions(["金融从业者"])},{label:"企业创业",children:pgyKolStaticOptions(["创业者","品牌创始人","公益人"])},{label:"时尚美妆",children:pgyKolStaticOptions(["模特","化妆师","造型师","服装设计师","珠宝设计师","发型设计师"])},{label:"食品饮料",children:pgyKolStaticOptions(["甜点师","厨师","咖啡师","调酒师"])},{label:"文化传媒",children:pgyKolStaticOptions(["编辑","记者","翻译","作家","娱评人","影评人","乐评人"])},{label:"医疗健康",children:pgyKolStaticOptions(["营养师","医生","康复师"])},{label:"艺术设计",children:pgyKolStaticOptions(["摄影师","插画师","室内设计师","画家","平面设计师","建筑设计师","非遗传承人","涂鸦艺术家","数字艺术家"])},{label:"影视娱乐",children:pgyKolStaticOptions(["主持人","导演","制片人","编剧","经纪人","真人秀嘉宾","虚拟偶像","rapper"])},{label:"运动健身",children:pgyKolStaticOptions(["教练","运动员","舞蹈老师"])},{label:"专业服务",children:pgyKolStaticOptions(["空乘","花艺师","整理师","民宿主","育婴师"])}]};
var pgyKolFeatureTree={nodes:[{label:"生活背景",children:pgyKolStaticOptions(["留学背景","海外华人","铲屎官","孕妈","独居人群","外国人","混血儿"])},{label:"备考经验",children:pgyKolStaticOptions(["考公过来人","考研过来人","法考过来人","注会过来人"])},{label:"兴趣爱好",children:pgyKolStaticOptions(["户外爱好者","数码爱好者","手账爱好者","二次元人群","汉服爱好者","手办爱好者","模型爱好者","街舞爱好者","骑行爱好者","飞盘爱好者","书法爱好者"])}]};
var pgyKolSceneTree={nodes:[{label:"形式",children:pgyKolStaticOptions(["vlog","探店","测评","ootd","合集","plog","开箱","教程","成分解析","彩妆试色","仿妆","沉浸式"])},{label:"风格",children:pgyKolStaticOptions(["韩系","日系","欧美风","氛围感","纯欲","甜酷","复古","高级感","校园风","中性风"])},{label:"生活方式",children:pgyKolStaticOptions(["职场生活","自律生活","露营徒步","极简主义","低脂低卡"])},{label:"肤质肤色",children:pgyKolStaticOptions(["油皮","干皮","混合肌","敏感肌","痘痘肌","瑕疵皮","白皮","黄皮"])},{label:"皮肤养护",children:pgyKolStaticOptions(["保湿补水","美白","淡斑","祛黄","抗氧化","抗老","祛皱","抗炎","修复","祛痘祛闭口","隔离防晒","控油","眼部护理"])}]};
/* 2026-08-11 官网实测：博主地域/粉丝地域为国家平铺单选。 */
var pgyKolCountryOptions=pgyKolStaticOptions(["全部","中国","美国","日本","澳大利亚","英国","加拿大","韩国","法国","德国","新加坡","其他"]);
/* 中国省/市/区 fallback（2026-08-11 官网实测 34 省级；areas 接口不可用时保证「中国」可逐级展开）。
 * 结构：省（直辖市到区县）→ 地级市；节点 path 为「中国 广东 广州」式空格路径，与接口 deriveSpacePaths 契约一致。 */
var pgyKolChinaAreaMap={"北京":["东城区","西城区","朝阳区","丰台区","石景山区","海淀区","门头沟区","房山区","通州区","顺义区","昌平区","大兴区","怀柔区","平谷区","密云区","延庆区"],"天津":["和平区","河东区","河西区","南开区","河北区","红桥区","东丽区","西青区","津南区","北辰区","武清区","宝坻区","滨海新区","宁河区","静海区","蓟州区"],"上海":["黄浦区","徐汇区","长宁区","静安区","普陀区","虹口区","杨浦区","闵行区","宝山区","嘉定区","浦东新区","金山区","松江区","青浦区","奉贤区","崇明区"],"重庆":["渝中区","大渡口区","江北区","沙坪坝区","九龙坡区","南岸区","北碚区","渝北区","巴南区","涪陵区","长寿区","江津区","合川区","永川区","南川区","綦江区","大足区","璧山区","铜梁区","潼南区","荣昌区","开州区","梁平区","武隆区","万州区","黔江区","城口县","丰都县","垫江县","忠县","云阳县","奉节县","巫山县","巫溪县","石柱土家族自治县","秀山土家族苗族自治县","酉阳土家族苗族自治县","彭水苗族土家族自治县"],"河北":["石家庄市","唐山市","秦皇岛市","邯郸市","邢台市","保定市","张家口市","承德市","沧州市","廊坊市","衡水市"],"山西":["太原市","大同市","阳泉市","长治市","晋城市","朔州市","晋中市","运城市","忻州市","临汾市","吕梁市"],"内蒙古":["呼和浩特市","包头市","乌海市","赤峰市","通辽市","鄂尔多斯市","呼伦贝尔市","巴彦淖尔市","乌兰察布市","兴安盟","锡林郭勒盟","阿拉善盟"],"辽宁":["沈阳市","大连市","鞍山市","抚顺市","本溪市","丹东市","锦州市","营口市","阜新市","辽阳市","盘锦市","铁岭市","朝阳市","葫芦岛市"],"吉林":["长春市","吉林市","四平市","辽源市","通化市","白山市","松原市","白城市","延边朝鲜族自治州"],"黑龙江":["哈尔滨市","齐齐哈尔市","鸡西市","鹤岗市","双鸭山市","大庆市","伊春市","佳木斯市","七台河市","牡丹江市","黑河市","绥化市","大兴安岭地区"],"江苏":["南京市","无锡市","徐州市","常州市","苏州市","南通市","连云港市","淮安市","盐城市","扬州市","镇江市","泰州市","宿迁市"],"浙江":["杭州市","宁波市","温州市","嘉兴市","湖州市","绍兴市","金华市","衢州市","舟山市","台州市","丽水市"],"安徽":["合肥市","芜湖市","蚌埠市","淮南市","马鞍山市","淮北市","铜陵市","安庆市","黄山市","滁州市","阜阳市","宿州市","六安市","亳州市","池州市","宣城市"],"福建":["福州市","厦门市","莆田市","三明市","泉州市","漳州市","南平市","龙岩市","宁德市"],"江西":["南昌市","景德镇市","萍乡市","九江市","新余市","鹰潭市","赣州市","吉安市","宜春市","抚州市","上饶市"],"山东":["济南市","青岛市","淄博市","枣庄市","东营市","烟台市","潍坊市","济宁市","泰安市","威海市","日照市","临沂市","德州市","聊城市","滨州市","菏泽市"],"河南":["郑州市","开封市","洛阳市","平顶山市","安阳市","鹤壁市","新乡市","焦作市","濮阳市","许昌市","漯河市","三门峡市","南阳市","商丘市","信阳市","周口市","驻马店市","济源市"],"湖北":["武汉市","黄石市","十堰市","宜昌市","襄阳市","鄂州市","荆门市","孝感市","荆州市","黄冈市","咸宁市","随州市","恩施土家族苗族自治州","仙桃市","潜江市","天门市","神农架林区"],"湖南":["长沙市","株洲市","湘潭市","衡阳市","邵阳市","岳阳市","常德市","张家界市","益阳市","郴州市","永州市","怀化市","娄底市","湘西土家族苗族自治州"],"广东":["广州市","韶关市","深圳市","珠海市","汕头市","佛山市","江门市","湛江市","茂名市","肇庆市","惠州市","梅州市","汕尾市","河源市","阳江市","清远市","东莞市","中山市","潮州市","揭阳市","云浮市"],"广西":["南宁市","柳州市","桂林市","梧州市","北海市","防城港市","钦州市","贵港市","玉林市","百色市","贺州市","河池市","来宾市","崇左市"],"海南":["海口市","三亚市","三沙市","儋州市"],"四川":["成都市","自贡市","攀枝花市","泸州市","德阳市","绵阳市","广元市","遂宁市","内江市","乐山市","南充市","眉山市","宜宾市","广安市","达州市","雅安市","巴中市","资阳市","阿坝藏族羌族自治州","甘孜藏族自治州","凉山彝族自治州"],"贵州":["贵阳市","六盘水市","遵义市","安顺市","毕节市","铜仁市","黔西南布依族苗族自治州","黔东南苗族侗族自治州","黔南布依族苗族自治州"],"云南":["昆明市","曲靖市","玉溪市","保山市","昭通市","丽江市","普洱市","临沧市","楚雄彝族自治州","红河哈尼族彝族自治州","文山壮族苗族自治州","西双版纳傣族自治州","大理白族自治州","德宏傣族景颇族自治州","怒江傈僳族自治州","迪庆藏族自治州"],"西藏":["拉萨市","日喀则市","昌都市","林芝市","山南市","那曲市","阿里地区"],"陕西":["西安市","铜川市","宝鸡市","咸阳市","渭南市","延安市","汉中市","榆林市","安康市","商洛市"],"甘肃":["兰州市","嘉峪关市","金昌市","白银市","天水市","武威市","张掖市","平凉市","酒泉市","庆阳市","定西市","陇南市","临夏回族自治州","甘南藏族自治州"],"青海":["西宁市","海东市","海北藏族自治州","黄南藏族自治州","海南藏族自治州","果洛藏族自治州","玉树藏族自治州","海西蒙古族藏族自治州"],"宁夏":["银川市","石嘴山市","吴忠市","固原市","中卫市"],"新疆":["乌鲁木齐市","克拉玛依市","吐鲁番市","哈密市","昌吉回族自治州","博尔塔拉蒙古自治州","巴音郭楞蒙古自治州","阿克苏地区","克孜勒苏柯尔克孜自治州","喀什地区","和田地区","伊犁哈萨克自治州","塔城地区","阿勒泰地区"],"香港":["香港岛","九龙","新界"],"澳门":["澳门半岛","氹仔","路环"],"台湾":["台北市","新北市","桃园市","台中市","台南市","高雄市","基隆市","新竹市","嘉义市"]};
function pgyKolChinaAreasFallback(){function build(list,path){return list.map(function(name){var p=path.concat([name]);return {value:name,label:name,path:p.join(" "),fullPath:p.join(" "),children:[]}})}var provinces=[];for(var prov in pgyKolChinaAreaMap){if(Object.prototype.hasOwnProperty.call(pgyKolChinaAreaMap,prov)){provinces.push({value:prov,label:prov,path:"中国 "+prov,fullPath:"中国 "+prov,children:build(pgyKolChinaAreaMap[prov],["中国",prov])})}}return [{value:"中国",label:"中国",path:"中国",fullPath:"中国",children:provinces}]}
var pgyKolCreditOptions=pgyKolStaticOptions(["高","中","低"]); /* Phase5 预留键 coopCredit */
var pgyKolPropagationOptions=pgyKolStaticOptions(["小","中","大","超大"]); /* Phase5 预留键 propagationScale */
 /* Phase5 待实证 */
var pgyKolSecondIndustryOptions=pgyKolStaticOptions(["新品推广","常规种草","促销节点","品牌活动","形象代言"]); /* Phase5 待实证 */
var pgyKolAudienceFallback=pgyKolStaticOptions(["母婴人群","美妆人群","时尚人群","美食人群","数码人群","游戏人群","汽车人群","家居人群"]); /* Phase5 候选 */
var pgyKolFansPresets=[{label:"1万以下",lower:"",upper:"10000"},{label:"1万-5万",lower:"10000",upper:"50000"},{label:"5万-10万",lower:"50000",upper:"100000"},{label:"10万-50万",lower:"100000",upper:"500000"},{label:"50万-100万",lower:"500000",upper:"1000000"},{label:"100万以上",lower:"1000000",upper:""}];
var pgyKolFeaturedOptions=[{key:"inStar",value:"明星",label:"明星"},{key:"isHighQualityFlag",value:"优质博主",label:"优质博主"},{key:"newHighQuality",value:"新锐博主",label:"新锐博主"},{key:"hasBuyerCoopAuthFlag",value:"笔记+直播均可合作",label:"笔记+直播均可合作"},{key:"filterIntention",value:"意向行业匹配",label:"意向行业匹配"}];
function pgyKolFeaturedLabel(key){for(var i=0;i<pgyKolFeaturedOptions.length;i++){if(pgyKolFeaturedOptions[i].key===key)return pgyKolFeaturedOptions[i].label}return key}
var pgyKolNoteCategoryIndustries=pgyKolStaticOptions(["汽车","游戏","母婴","美妆"]);
var pgyKolNoteCategoryTree={"汽车":{"nodes":[{"label":"理性决策","children":[{"label":"选车攻略","children":[{"label":"政策"},{"label":"购车顾虑"},{"label":"配置"},{"label":"能源类型优势对比"},{"label":"攻略"}]},{"label":"新车测评"},{"label":"探店试驾"},{"label":"车主心得"}]},{"label":"用车场景","children":[{"label":"远行近游","children":[{"label":"近郊探索"},{"label":"长途自驾"},{"label":"硬核越野"}]},{"label":"提车/交付场景","children":[{"label":"场地布置与礼遇"},{"label":"仪式感记录"}]},{"label":"商务用车","children":[{"label":"移动头等舱"},{"label":"商务接待"}]},{"label":"亲子家庭","children":[{"label":"家庭采购日"},{"label":"接送孩子"},{"label":"三代同堂"},{"label":"周末溜娃"},{"label":"车内学习室"},{"label":"车内育婴室"}]},{"label":"朋友社交","children":[{"label":"后备箱经济"},{"label":"移动娱乐屋"}]},{"label":"礼赠场景","children":[{"label":"毕业礼物"},{"label":"送给父母"},{"label":"适合送男友"},{"label":"适合送女友"}]},{"label":"户外兴趣","children":[{"label":"钓鱼/野营"},{"label":"骑行"},{"label":"徒步"},{"label":"硬核竞速"}]},{"label":"宠物出行","children":[{"label":"大型宠物"},{"label":"短途出行"},{"label":"小型宠物"},{"label":"长途出行"}]},{"label":"城市通勤","children":[{"label":"车内小憩"},{"label":"健身储物"},{"label":"日常通勤"},{"label":"生活圈代步"},{"label":"移动美容舱"}]}]},{"label":"个性化美化","children":[{"label":"个性改装"},{"label":"储物收纳"},{"label":"车内装饰"},{"label":"车外装饰"},{"label":"车衣保护"},{"label":"汽车用品"}]},{"label":"车型品类","children":[{"label":"轿车"},{"label":"SUV"},{"label":"MPV"},{"label":"跑车"},{"label":"微型车"},{"label":"微面"},{"label":"房车"},{"label":"越野车"},{"label":"旅行车"}]},{"label":"圈层属性","children":[{"label":"改装圈层"},{"label":"痛车圈层"},{"label":"跑山圈层"}]},{"label":"品牌倾向","children":[{"label":"自主"},{"label":"豪华"},{"label":"集团"},{"label":"新势力"}]},{"label":"能源类型","children":[{"label":"纯电车"},{"label":"新能源"},{"label":"油车"}]},{"label":"人生阶段","children":[{"label":"单身"},{"label":"多娃&大家庭阶段"},{"label":"银发退休阶段"}]}]},"游戏":{"nodes":[{"label":"游戏品类","children":[{"label":"网页游戏"},{"label":"电脑游戏"},{"label":"手机游戏"}]},{"label":"游戏类型","children":[{"label":"动作格斗游戏","children":[{"label":"永劫无间"}]},{"label":"即时制二次元游戏","children":[{"label":"境界刀鸣"},{"label":"黑色信标"},{"label":"物华弥新"},{"label":"无期迷途"},{"label":"新月同行"},{"label":"绝区零"}]},{"label":"即时制角色扮演","children":[{"label":"诛仙2"},{"label":"诛仙"},{"label":"明日之后"},{"label":"超自然行动组"},{"label":"永恒之塔2"}]},{"label":"回合制二次元游戏","children":[{"label":"未定事件簿"},{"label":"雷索纳斯"},{"label":"浮生忆玲珑"},{"label":"重返未来1999"}]},{"label":"回合制角色扮演","children":[{"label":"梦幻西游手游"},{"label":"龙魂旅人"},{"label":"最终幻想14"}]},{"label":"塔防游戏","children":[{"label":"保卫向日葵"},{"label":"全境守卫"},{"label":"向僵尸开炮"}]},{"label":"开放世界角色扮演","children":[{"label":"燕云十六声"},{"label":"王者荣耀世界"}]},{"label":"恋爱游戏","children":[{"label":"如鸢"},{"label":"银与绯"},{"label":"时空中的绘旅人"},{"label":"光与夜之恋"},{"label":"恋与深空"},{"label":"恋与制作人"}]},{"label":"战略游戏","children":[{"label":"率土之滨"},{"label":"群星纪元"},{"label":"阿瓦隆之王"},{"label":"快来当领主"},{"label":"冒险之星"},{"label":"无尽的拉格朗日"}]},{"label":"放置类二次元游戏","children":[{"label":"花花与幕间剧"}]},{"label":"放置类角色扮演","children":[{"label":"发条总动员"},{"label":"遮天凡尘一叶"}]},{"label":"模拟养成","children":[{"label":"美人传"},{"label":"盲盒派对"},{"label":"闪耀暖暖"},{"label":"以闪亮之名"},{"label":"无限暖暖"}]},{"label":"模拟家园建造","children":[{"label":"江南百景图"},{"label":"动物森友会"},{"label":"星露谷物语"}]},{"label":"模拟经营","children":[{"label":"暴吵萌厨"},{"label":"肥鹅健身房"}]},{"label":"模拟职业","children":[{"label":"杜拉拉升职记"}]},{"label":"消除游戏","children":[{"label":"四季合合"}]},{"label":"生存沙盒游戏","children":[{"label":"无尽冬日"}]},{"label":"聚会游戏","children":[{"label":"蛋仔派对"},{"label":"代号砰砰"}]},{"label":"解谜游戏","children":[{"label":"晴空之下"}]},{"label":"抓宠类游戏","children":[{"label":"洛克王国手游"}]},{"label":"射击游戏","children":[{"label":"三角洲行动"},{"label":"codm（使命召唤）"}]}]}]},"母婴":{"nodes":[{"label":"婴童洗护","children":[{"label":"安全防晒"},{"label":"浴后护理"},{"label":"敏感修护"},{"label":"屏障树立"},{"label":"泳后护理"},{"label":"口周干裂"},{"label":"分区清洁"},{"label":"头皮问题"},{"label":"驱虫驱蚊"},{"label":"洁面清洁"},{"label":"红屁股"},{"label":"湿疹皮炎"},{"label":"痱子热疹"},{"label":"抚触链接"},{"label":"趣味洗护"}]},{"label":"母婴纸品","children":[{"label":"精算育儿"},{"label":"颜值派"},{"label":"汗宝宝"},{"label":"囤货党"},{"label":"敏感肌"},{"label":"肉腿娃"},{"label":"功课党"},{"label":"好动宝"},{"label":"安睡整夜"},{"label":"出行便携"},{"label":"贵妇体验"},{"label":"红屁屁"}]},{"label":"母婴小家电","children":[{"label":"空间收纳"},{"label":"滋补养生"},{"label":"温度把控"},{"label":"夜奶操作"},{"label":"新手喂养"},{"label":"材质挑选"},{"label":"三代同育"},{"label":"户外喂养"},{"label":"通乳攻略"},{"label":"洁癖爸妈"},{"label":"精准喂养"},{"label":"职场妈妈"}]},{"label":"婴童辅食","children":[{"label":"吞咽能力"},{"label":"多元辅食"},{"label":"零食分享"},{"label":"健康零食"},{"label":"放学加餐"},{"label":"出牙磨牙"},{"label":"居家囤货"},{"label":"节日礼包"},{"label":"零食训练"},{"label":"宝宝挑食"},{"label":"户外零食"},{"label":"低敏辅食"},{"label":"入园社交"},{"label":"居家辅食"},{"label":"入园准备"},{"label":"敏敏零食"},{"label":"抓握训练"},{"label":"外出口粮"},{"label":"营养均衡"},{"label":"自主进食"},{"label":"第一口辅食"}]},{"label":"母婴营养品","children":[{"label":"开胃因子"},{"label":"视力保护"},{"label":"营养补充"},{"label":"防护因子"},{"label":"高钙因子"},{"label":"自护构建"},{"label":"发育表现"},{"label":"助眠安睡"}]},{"label":"婴童奶粉","children":[{"label":"丝滑转奶"},{"label":"益生组合"},{"label":"眼脑体发育"},{"label":"选奶功课"},{"label":"防敏脱敏"},{"label":"助力聪明脑"},{"label":"乳铁自护"},{"label":"黄金长高"},{"label":"内修外护"},{"label":"肚肚吸收"},{"label":"断奶攻略"},{"label":"混合喂养"},{"label":"母源黄金HMO"},{"label":"长肉多肉"}]},{"label":"哺乳喂养工具","children":[{"label":"萌娃穿搭"},{"label":"安全材质"},{"label":"奶瓶喂养"},{"label":"颜值发育"},{"label":"哄娃安抚"},{"label":"餐具选购"},{"label":"学饮指南"},{"label":"换季保温"}]},{"label":"母婴孕产","children":[{"label":"职场孕妇"},{"label":"产后复工"},{"label":"顺产"},{"label":"孕期变化"},{"label":"孕期学习"},{"label":"剖腹产"}]},{"label":"母婴家居","children":[{"label":"护脊深睡"},{"label":"安全翻滚"},{"label":"进食习惯"},{"label":"早教启蒙"},{"label":"学习角落"},{"label":"自主入睡"},{"label":"爬行探索"},{"label":"防惊跳"}]},{"label":"母婴出行&用品","children":[{"label":"长线旅途"},{"label":"户外探索"},{"label":"二胎/双胎"},{"label":"新贵消费"},{"label":"备产研究"},{"label":"短途旅行"},{"label":"高频出行"},{"label":"新生出行"},{"label":"务实精算"},{"label":"遛娃必备"}]}]},"美妆":{"nodes":[]}}

var pgyKolRangeDefs={inviteReply:[{label:"95%以上",value:[95,-1]},{label:"90%～95%",value:[90,95]},{label:"80%～90%",value:[80,90]},{label:"70%～80%",value:[70,80]},{label:"80%以下",value:[0,80]}],imp50w:[{label:"5万以上",value:[50000,-1]},{label:"1万～5万",value:[10000,50000]},{label:"0.5万～1万",value:[5000,10000]},{label:"0.1万～0.5万",value:[1000,5000]}],inter2000:[{label:"2000以上",value:[2000,-1]},{label:"1000～2000",value:[1000,2000]},{label:"500～1000",value:[500,1000]},{label:"200～500",value:[200,500]},{label:"100～200",value:[100,200]}],overflow10000:[{label:"10000以上",value:[10000,-1]},{label:"5000～10000",value:[5000,10000]},{label:"2000～5000",value:[2000,5000]},{label:"1000～2000",value:[1000,2000]},{label:"500～1000",value:[500,1000]}],cpuv:[{label:"0.5以下",value:[0,.5]},{label:"0.5～1.0",value:[.5,1]},{label:"1.0～1.5",value:[1,1.5]},{label:"1.5～2.5",value:[1.5,2.5]},{label:"2.5～4.0",value:[2.5,4]}],picRead:[{label:"0.5以下",value:[0,.5]},{label:"0.5～1.0",value:[.5,1]},{label:"1.0～1.5",value:[1,1.5]},{label:"1.5～2.0",value:[1.5,2]},{label:"2.0以上",value:[2,-1]}],videoRead:[{label:"1.5以下",value:[0,1.5]},{label:"1.5～2.0",value:[1.5,2]},{label:"2.0～2.5",value:[2,2.5]},{label:"2.5～3.0",value:[2.5,3]},{label:"3.0以上",value:[3,-1]}],picEngage:[{label:"0.5以下",value:[0,.5]},{label:"0.5～1.0",value:[.5,1]},{label:"1.0～2.0",value:[1,2]},{label:"2.0～3.0",value:[2,3]},{label:"3.0以上",value:[3,-1]}],videoEngage:[{label:"1.0以下",value:[0,1]},{label:"1.0～2.0",value:[1,2]},{label:"2.0～3.0",value:[2,3]},{label:"3.0～4.0",value:[3,4]},{label:"4.0以上",value:[4,-1]}],cpmPic:[{label:"10以下",value:[0,10]},{label:"10～20",value:[10,20]},{label:"20～30",value:[20,30]},{label:"30～50",value:[30,50]},{label:"50以上",value:[50,-1]}],cpmVideo:[{label:"10以下",value:[0,10]},{label:"10～30",value:[10,30]},{label:"30～50",value:[30,50]},{label:"50～70",value:[50,70]},{label:"70以上",value:[70,-1]}],liveCount:[{label:"0次",value:[0,0]},{label:"1～5次",value:[1,5]},{label:"6～10次",value:[6,10]},{label:"10次以上",value:[10,-1]}],liveViewer:[{label:"0~5k",value:[0,5000]},{label:"5k~1w",value:[5000,10000]},{label:"1w~10w",value:[10000,100000]},{label:"10w~50w",value:[100000,500000]},{label:"50w以上",value:[500000,-1]}],liveGmv:[{label:"5千以下",value:[0,5000]},{label:"5千～1万",value:[5000,10000]},{label:"1万～10万",value:[10000,100000]},{label:"10万～50万",value:[100000,500000]},{label:"50万～100万",value:[500000,1000000]},{label:"100万～200万",value:[1000000,2000000]},{label:"200万～500万",value:[2000000,5000000]},{label:"500万以上",value:[5000000,-1]}]}
pgyKolRangeDefs.quote=[{label:"5万及以上",value:[50000,-1]},{label:"1万～5万",value:[10000,50000]},{label:"0.5万～1万",value:[5000,10000]},{label:"0.1万～0.5万",value:[1000,5000]},{label:"0.1万以下",value:[0,1000]}];

function pgyKolRangeEq(a,b){if(a===b)return true;if(!a||!b)return false;return JSON.stringify(a.value)===JSON.stringify(b.value)}

/* ============ Phase 5.2：搜索历史（搜昵称） ============ */
function pgyKolNickHistory() {
  try {
    var raw = window.localStorage.getItem("magiorix-pgy-kol-nick-history");
    if (!raw) return [];
    var arr = JSON.parse(raw);
    return Array.isArray(arr)
      ? arr.filter(function (s) { return typeof s === "string" && s.trim() !== ""; }).slice(0, 10)
      : [];
  } catch (e) {
    return [];
  }
}
function pgyKolNickHistoryAdd(kw) {
  try {
    var cur = pgyKolNickHistory();
    var next = cur.filter(function (s) { return s !== kw; });
    next.unshift(kw);
    next = next.slice(0, 10);
    window.localStorage.setItem("magiorix-pgy-kol-nick-history", JSON.stringify(next));
    return next;
  } catch (e) {
    return cur;
  }
}
function pgyKolNickHistoryClear() {
  try {
    window.localStorage.removeItem("magiorix-pgy-kol-nick-history");
  } catch (e) {}
}

/* 按唯一键在选项树中查找节点（Popover 草稿 key 还原为节点）。 */
function pgyKolFindNode(nodes, key) {
  if (!Array.isArray(nodes)) return null;
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (n && pgyKolNodeKey(n) === key) return n;
    if (n && n.children && n.children.length) {
      var f = pgyKolFindNode(n.children, key);
      if (f) return f;
    }
  }
  return null;
}

/* 热门活动「种收联动」徽标（真实响应 rawVersion.activityLabel）。 */
function pgyKolActivityLabel(n) {
  if (!n) return "";
  return (n.rawVersion && n.rawVersion.activityLabel) || n.activityLabel || "";
}

/* 千赞笔记比例范围（40% 分档，Phase 5.1 实证口径）。 */
var pgyKolRangeDefsPercent40 = [
  { label: "40%以上", value: [40, null] },
  { label: "30%～40%", value: [30, 40] },
  { label: "20%～30%", value: [20, 30] },
  { label: "10%～20%", value: [10, 20] },
  { label: "10%以下", value: [null, 10] },
];

/* ============ Phase 5.2：紧凑触发器（28px / 14px / 红色选中） ============ */
function PgyKolTrigger(p) {
  var sel = !!p.selected, dis = !!p.disabled, dim = !!p.dim, cnt = p.count || 0, badge = p.badge || "";
  var textColor = dis || dim ? "rgba(0,0,0,.25)" : sel ? "#ff2442" : "rgba(0,0,0,.7)";
  var arrowIcon = p.arrowUp ? "solar:alt-arrow-up-bold-duotone" : "solar:alt-arrow-down-bold-duotone";
  return o.jsxs(x, {
    component: "button",
    type: "button",
    disabled: dis,
    onClick: function (e) {
      if (!dis && !dim) p.onOpen(e);
    },
    onMouseEnter: p.onMouseEnter,
    onMouseLeave: p.onMouseLeave,
    sx: {
      display: "inline-flex",
      alignItems: "center",
      gap: 0.5,
      height: 28,
      px: 0.75,
      fontSize: 14,
      lineHeight: "28px",
      color: textColor,
      bgcolor: sel ? "rgba(255,36,66,.08)" : "transparent",
      border: 0,
      borderRadius: 0.375,
      cursor: dis ? "not-allowed" : "pointer",
      fontFamily: "inherit",
      whiteSpace: "nowrap",
      flexShrink: 0,
      boxSizing: "border-box",
      verticalAlign: "middle",
      userSelect: "none",
    },
    children: [
      o.jsx(w, { component: "span", sx: { fontSize: 14, lineHeight: "28px", color: "inherit" }, children: p.label }),
      p.help ? o.jsx(B, { icon: "mdi:help-circle-outline", width: 13, height: 13, style: { color: "rgba(0,0,0,.4)", flexShrink: 0 } }) : null,
      badge ? o.jsx(x, {
        sx: {
          height: 14,
          minWidth: 14,
          px: 0.4,
          fontSize: 10,
          lineHeight: "14px",
          color: "#fff",
          bgcolor: "#ff2442",
          borderRadius: 0.25,
          textAlign: "center",
          flexShrink: 0,
        },
        children: badge,
      }) : null,
      cnt > 0 ? o.jsx(w, { component: "span", sx: { fontSize: 12, lineHeight: "28px", color: sel ? "#ff2442" : "rgba(0,0,0,.45)" }, children: "（" + cnt + "）" }) : null,
      p.arrow === false ? null : o.jsx(B, { icon: arrowIcon, width: 12, height: 12, style: { color: dis ? "rgba(0,0,0,.2)" : "rgba(0,0,0,.45)", flexShrink: 0 } }),
    ],
  });
}

/* ============ Phase 5.2：固定定位 Popover 外壳 ============ */
function PgyKolPop(p) {
  var posState = m.useState(0), posVersion = posState[0], setPosVersion = posState[1];
  var anchor = p.anchor;
  m.useEffect(function () {
    function reposition() { setPosVersion(function (v) { return v + 1; }); }
    reposition();
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return function () {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [anchor, p.open]);
  if (!p.open) return null;
  var rect = anchor && typeof anchor.getBoundingClientRect === "function" ? anchor.getBoundingClientRect() : null;
  var w = p.width || 260;
  var gap = 6;
  var preferredH = p.preferredHeight || 168;
  var left = rect ? rect.left : 0;
  var below = rect ? window.innerHeight - rect.bottom : 0;
  var above = rect ? rect.top : 0;
  /* 官网行为（2026-08-10 实测）：弹层优先在触发项正下方打开，按可用空间收短并内部滚动；
   * 仅当下方空间不足以显示最少内容时翻转到上方，且弹层底部与触发项顶部对齐，
   * 绝不把弹层钉在视口顶端（修复「近期合作行业筛选项飞到页面顶部」）。 */
  var minVisible = Math.min(96, preferredH);
  var placeBelow = !rect || below >= minVisible;
  var top = rect && placeBelow ? rect.bottom + gap : "auto";
  var bottom = rect && !placeBelow ? Math.max(8, window.innerHeight - rect.top + gap) : "auto";
  if (rect && left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - w - 8);
  var availableH = rect ? (placeBelow ? below - gap - 8 : above - gap - 8) : window.innerHeight - 16;
  var maxH = Math.max(0, Math.min(p.maxHeight || 360, window.innerHeight - 16, availableH));
  return o.jsxs(x, {
    children: [
      p.noBackdrop ? null : o.jsx(x, { sx: { position: "fixed", left: 0, top: 0, right: 0, bottom: 0, zIndex: 1399 }, onClick: p.onClose }),
      o.jsxs(x, {
        onMouseEnter: p.onMouseEnter,
        onMouseLeave: p.onMouseLeave,
        sx: {
          position: "fixed",
          left: left,
          top: top,
          bottom: bottom,
          zIndex: 1400,
          width: w,
          maxWidth: Math.max(240, window.innerWidth - 16),
          maxHeight: maxH,
          overflow: p.overflow || "hidden",
          bgcolor: "#fff",
          border: "1px solid #e5e6eb",
          borderRadius: 0.5,
          boxShadow: "0 4px 16px rgba(0,0,0,.12)",
          p: 1,
          display: "flex",
          flexDirection: "column",
        },
        children: p.children,
      }),
    ],
  });
}

function PgyKolPopHeader(p) {
  return o.jsxs(x, {
    sx: { display: "flex", alignItems: "center", gap: 1, mb: 0.75, pb: 0.5, borderBottom: "1px solid #f0f1f3", flexShrink: 0 },
    children: [
      o.jsx(w, { sx: { fontSize: 14, fontWeight: 600, color: "rgba(0,0,0,.85)" }, children: p.title }),
      o.jsx(te, { size: "small", sx: { ml: "auto", p: 0.25 }, onClick: p.onClose, children: o.jsx(B, { icon: "mdi:close", width: 14, height: 14 }) }),
    ],
  });
}

/* ============ Phase 5.2：选项列表 Popover（单选即时关闭 / 多选草稿确定） ============ */
function PgyKolOptionPop(p) {
  var opts = p.options || [];
  var ds = m.useState(null), draftState = ds[0], setDraftState = ds[1];
  var base = Array.isArray(p.selectedKeys) ? p.selectedKeys : [];
  var draft = draftState !== null ? draftState : base;
  m.useEffect(function () {
    if (p.open) setDraftState(null);
  }, [p.open]);
  function keyOf(n) {
    return p.keyOf ? p.keyOf(n) : pgyKolNodeKey(n);
  }
  function toggle(n) {
    var key = keyOf(n);
    if (p.closeOnSelect) {
      p.onToggle(n);
      p.onClose();
      return;
    }
    var i = draft.indexOf(key);
    setDraftState(i >= 0 ? draft.slice(0, i).concat(draft.slice(i + 1)) : draft.concat([key]));
  }
  function clear() { setDraftState([]); }
  function apply() { p.onApply(draft.slice()); p.onClose(); }
  var single = !p.multi;
  return o.jsx(PgyKolPop, {
    open: p.open,
    anchor: p.anchor,
    onClose: p.onClose,
    width: p.width || 220,
    children: o.jsxs(x, {
      sx: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 },
      children: [
        o.jsx(PgyKolPopHeader, { title: p.title, onClose: p.onClose }),
        opts.length === 0
          ? o.jsx(w, { sx: { fontSize: 13, color: "rgba(0,0,0,.45)", py: 1 }, children: "暂无选项" })
          : single
            ? o.jsx(x, {
                sx: { display: "flex", flexDirection: "column", gap: 0.25, pt: 0.25 },
                children: opts.map(function (n) {
                  var key = keyOf(n), sel = draft.indexOf(key) >= 0;
                  return o.jsx(x, {
                    key: key,
                    onClick: function () { toggle(n); },
                    sx: {
                      display: "flex",
                      alignItems: "center",
                      gap: 0.5,
                      height: 28,
                      px: 1,
                      fontSize: 14,
                      color: sel ? "#ff2442" : "rgba(0,0,0,.7)",
                      bgcolor: sel ? "rgba(255,36,66,.08)" : "transparent",
                      borderRadius: 0.375,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    },
                    children: [
                      o.jsx(w, { sx: { flexGrow: 1, fontSize: 14, color: "inherit" }, children: p.display ? p.display(n) : pgyKolOptLabel(n) }),
                      sel ? o.jsx(B, { icon: "mdi:check", width: 16, height: 16, style: { color: "#ff2442", flexShrink: 0 } }) : null,
                    ],
                  });
                }),
              })
            : o.jsx(x, {
                sx: { display: "flex", flexWrap: "wrap", gap: 0.5, pt: 0.25 },
                children: opts.map(function (n) {
                  var key = keyOf(n), sel = draft.indexOf(key) >= 0;
                  return o.jsx(f1, {
                    key: key,
                    size: "small",
                    label: p.display ? p.display(n) : pgyKolOptLabel(n),
                    color: sel ? "primary" : "default",
                    variant: sel ? "filled" : "outlined",
                    onClick: function () { toggle(n); },
                  });
                }),
              }),
        p.multi
          ? o.jsxs(x, {
              sx: { display: "flex", alignItems: "center", gap: 1, mt: 1, pt: 0.5, borderTop: "1px solid #f0f1f3" },
              children: [
                o.jsx(w, { sx: { fontSize: 12, color: "rgba(0,0,0,.45)", mr: "auto" }, children: "已选 " + draft.length + " 项" }),
                o.jsx($, { size: "small", variant: "outlined", onClick: clear, children: "清空" }),
                o.jsx($, { size: "small", variant: "contained", onClick: apply, children: "确定" }),
              ],
            })
          : null,
      ],
    }),
  });
}

/* ============ Phase 5.2：单选范围 Popover（点击即选即关，再点清除） ============ */
function PgyKolRangePop(p) {
  var opts = p.options || [];
  function pick(n) {
    p.onToggle(pgyKolRangeEq(p.value, n) ? null : n);
    p.onClose();
  }
  return o.jsx(PgyKolPop, {
    open: p.open,
    anchor: p.anchor,
    onClose: p.onClose,
    width: p.width || 220,
    children: o.jsxs(x, {
      children: [
        o.jsx(PgyKolPopHeader, { title: p.title, onClose: p.onClose }),
        o.jsx(x, {
          sx: { display: "flex", flexDirection: "column", gap: 0.25, pt: 0.25 },
          children: opts.map(function (n) {
            var sel = pgyKolRangeEq(p.value, n);
            return o.jsx(x, {
              key: n.label,
              onClick: function () { pick(n); },
              sx: {
                display: "flex",
                alignItems: "center",
                height: 28,
                px: 1,
                fontSize: 14,
                color: sel ? "#ff2442" : "rgba(0,0,0,.7)",
                bgcolor: sel ? "rgba(255,36,66,.08)" : "transparent",
                borderRadius: 0.375,
                cursor: "pointer",
                whiteSpace: "nowrap",
              },
              children: n.label,
            });
          }),
        }),
      ],
    }),
  });
}

/* ============ 官网数据表现控件：228px 单列范围 / 408px 组合 / 420px 品牌 ============ */
function pgyKolOfficialRangeNode(lower, upper) {
  var lo = lower === "" ? 0 : Number(lower), hi = upper === "" ? -1 : Number(upper);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < 0 || (hi >= 0 && hi < lo)) return null;
  return { label: String(lo) + "～" + (hi < 0 ? "不限" : String(hi)), value: [lo, hi] };
}

function pgyKolOfficialBoundsNode(lower, upper) {
  if (lower === "" && upper === "") return null;
  return pgyKolOfficialRangeNode(lower, upper);
}

function pgyKolNoteTypeLabel(value) {
  for (var i = 0; i < pgyKolNoteTypeOptions.length; i++) if (pgyKolNoteTypeOptions[i].value === value) return pgyKolNoteTypeOptions[i].label;
  return "不限";
}

function pgyKolOfficialRangeLabel(value) {
  return value && value.label ? value.label : "";
}

function PgyKolOfficialFooter(p) {
  return o.jsxs(x, {
    sx: { display: "flex", alignItems: "center", gap: 1, mt: 1, pt: 1, borderTop: "1px solid #f0f1f3" },
    children: [
      o.jsx($, { size: "small", variant: "text", sx: { color: "rgba(0,0,0,.65)", mr: "auto" }, onClick: p.onReset, children: "重置" }),
      o.jsx($, { size: "small", variant: "contained", disabled: !!p.disabled, onClick: p.onConfirm, children: "确定" }),
    ],
  });
}

function PgyKolOfficialRangeList(p) {
  var options = p.options || [];
  return o.jsx(x, {
    sx: { display: "flex", flexDirection: "column" },
    children: [{ label: "不限", value: null }].concat(options).map(function (n) {
      var selected = n.value === null ? p.value === null : pgyKolRangeEq(p.value, n);
      return o.jsxs(x, {
        key: n.label,
        onClick: function () { p.onSelect(n.value === null ? null : n); },
        sx: { display: "flex", alignItems: "center", minHeight: 36, px: 1.5, bgcolor: selected ? "#f5f5f5" : "transparent", cursor: "pointer", fontSize: 14, color: "rgba(0,0,0,.78)" },
        children: [
          o.jsx(x, { sx: { width: 18, flexShrink: 0 }, children: selected ? o.jsx(B, { icon: "mdi:check", width: 16, height: 16, style: { color: "rgba(0,0,0,.65)" } }) : null }),
          o.jsx(w, { sx: { fontSize: 14, color: "inherit" }, children: n.label }),
        ],
      });
    }),
  });
}

function PgyKolOfficialCustomRange(p) {
  return o.jsxs(x, {
    sx: { display: "flex", alignItems: "center", gap: p.suffix ? 0.25 : 0.5, p: 1, bgcolor: "#fafafa" },
    children: [
      o.jsx(ae, { size: "small", type: "number", placeholder: p.minPlaceholder || "0", value: p.lower, onChange: function (e) { p.onLower(e.target.value); }, inputProps: { min: 0 }, sx: { width: p.suffix ? 76 : 90, flexShrink: 0, "& .MuiInputBase-root": { height: 32, bgcolor: "#f5f5f5" }, "& input": { px: 0.75, fontSize: 12 } } }),
      p.suffix ? o.jsx(w, { sx: { fontSize: 12, color: "rgba(0,0,0,.45)", ml: -0.5 }, children: p.suffix }) : null,
      o.jsx(w, { sx: { fontSize: 13, color: "rgba(0,0,0,.45)" }, children: "～" }),
      o.jsx(ae, { size: "small", type: "number", placeholder: p.maxPlaceholder || "9,999,999", value: p.upper, onChange: function (e) { p.onUpper(e.target.value); }, inputProps: { min: 0 }, sx: { width: p.suffix ? 76 : 90, flexShrink: 0, "& .MuiInputBase-root": { height: 32, bgcolor: "#f5f5f5" }, "& input": { px: 0.75, fontSize: 12 } } }),
      p.suffix ? o.jsx(w, { sx: { fontSize: 12, color: "rgba(0,0,0,.45)", ml: -0.5 }, children: p.suffix }) : null,
    ],
  });
}

function PgyKolOfficialRangePop(p) {
  var ds = m.useState(p.value || null), draft = ds[0], setDraft = ds[1];
  var ls = m.useState(""), lower = ls[0], setLower = ls[1];
  var us = m.useState(""), upper = us[0], setUpper = us[1];
  m.useEffect(function () { if (p.open) { setDraft(p.value || null); setLower(""); setUpper(""); } }, [p.open]);
  function reset() { setDraft(null); setLower(""); setUpper(""); }
  function confirm() {
    var custom = lower !== "" || upper !== "" ? pgyKolOfficialRangeNode(lower, upper) : null;
    p.onApply(custom || draft || null);
    p.onClose();
  }
  return o.jsx(PgyKolPop, {
    open: p.open,
    anchor: p.anchor,
    onClose: p.onClose,
    width: 228,
    preferredHeight: Math.min(360, 112 + ((p.options || []).length + 1) * 36),
    children: o.jsxs(x, {
      children: [
        o.jsx(PgyKolOfficialRangeList, { options: p.options, value: draft, onSelect: function (n) { setDraft(n); setLower(""); setUpper(""); } }),
        o.jsx(PgyKolOfficialCustomRange, { lower: lower, upper: upper, onLower: setLower, onUpper: setUpper, minPlaceholder: p.minPlaceholder, maxPlaceholder: p.maxPlaceholder, suffix: p.suffix }),
        o.jsx(PgyKolOfficialFooter, { onReset: reset, onConfirm: confirm }),
      ],
    }),
  });
}

function PgyKolOfficialSimpleMenu(p) {
  return o.jsx(PgyKolPop, {
    open: p.open,
    anchor: p.anchor,
    onClose: p.onClose,
    width: 228,
    /* 官网规格（2026-08-10 实测）：最高 261px，内容超出时内部滚动。 */
    preferredHeight: 261,
    maxHeight: 261,
    overflow: "auto",
    children: o.jsx(x, {
      sx: { display: "flex", flexDirection: "column" },
      children: (p.options || []).map(function (n) {
        var selected = p.value === n.value || (n.value === null && (p.value === null || p.value === undefined));
        return o.jsxs(x, {
          key: String(n.label),
          onClick: function () { p.onSelect(n.value); p.onClose(); },
          sx: { display: "flex", alignItems: "center", minHeight: 36, px: 1.5, bgcolor: selected ? "#f5f5f5" : "transparent", cursor: "pointer" },
          children: [o.jsx(x, { sx: { width: 18 }, children: selected ? o.jsx(B, { icon: "mdi:check", width: 16, height: 16 }) : null }), o.jsx(w, { sx: { fontSize: 14 }, children: n.label })],
        });
      }),
    }),
  });
}

function PgyKolOfficialNestedRange(p) {
  var ls = m.useState(""), lower = ls[0], setLower = ls[1];
  var us = m.useState(""), upper = us[0], setUpper = us[1];
  return o.jsxs(x, {
    sx: { position: "absolute", top: p.openUp ? "auto" : 64, bottom: p.openUp ? 64 : "auto", left: p.left || 0, zIndex: 3, width: 228, bgcolor: "#fff", border: "1px solid #e5e6eb", boxShadow: "0 4px 16px rgba(0,0,0,.14)", borderRadius: 0.5, p: 1 },
    children: [
      o.jsx(PgyKolOfficialRangeList, { options: p.options, value: p.value, onSelect: p.onSelect }),
      o.jsx(PgyKolOfficialCustomRange, { lower: lower, upper: upper, onLower: setLower, onUpper: setUpper, minPlaceholder: "0", maxPlaceholder: "9,999,999" }),
      o.jsx(PgyKolOfficialFooter, { onReset: function () { setLower(""); setUpper(""); p.onSelect(null); }, onConfirm: function () { var n = pgyKolOfficialRangeNode(lower, upper); if (n) p.onSelect(n); } }),
    ],
  });
}

function PgyKolOfficialGroupPop(p) {
  var groups = p.groups || [];
  var anchorRect = p.anchor && p.anchor.getBoundingClientRect ? p.anchor.getBoundingClientRect() : null;
  var nestedOpenUp = !!(anchorRect && anchorRect.top > window.innerHeight / 2);
  var initial = {};
  groups.forEach(function (g) { initial[g.key] = g.value || null; });
  var ds = m.useState(initial), draft = ds[0], setDraft = ds[1];
  var as = m.useState(null), active = as[0], setActive = as[1];
  m.useEffect(function () { if (p.open) { var next = {}; groups.forEach(function (g) { next[g.key] = g.value || null; }); setDraft(next); setActive(null); } }, [p.open]);
  function reset() { var next = {}; groups.forEach(function (g) { next[g.key] = null; }); setDraft(next); setActive(null); }
  function choose(key, value) { setDraft(Object.assign({}, draft, (function () { var out = {}; out[key] = value; return out; })())); setActive(null); }
  return o.jsx(PgyKolPop, {
    open: p.open,
    anchor: p.anchor,
    onClose: p.onClose,
    width: 408,
    overflow: "visible",
    preferredHeight: groups.length > 2 ? 200 : 124,
    children: o.jsxs(x, {
      sx: { position: "relative" },
      children: [
        o.jsx(x, {
          sx: { display: "grid", gridTemplateColumns: groups.length === 1 ? "1fr" : "1fr 1fr", gap: 1.5 },
          children: groups.map(function (g, index) {
            return o.jsxs(x, {
              key: g.key,
              sx: { position: "relative", minWidth: 0 },
              children: [
                o.jsx(w, { sx: { fontSize: 13, color: "rgba(0,0,0,.72)", mb: 0.5 }, children: g.label }),
                o.jsx(ae, { size: "small", fullWidth: true, placeholder: "请选择", value: pgyKolOfficialRangeLabel(draft[g.key]), onChange: function () {}, onClick: function () { setActive(active === g.key ? null : g.key); }, InputProps: { readOnly: true, endAdornment: o.jsx(B, { icon: active === g.key ? "solar:alt-arrow-up-bold-duotone" : "solar:alt-arrow-down-bold-duotone", width: 14, height: 14 }) }, sx: { "& .MuiInputBase-root": { height: 32, bgcolor: "#fafafa" } } }),
                active === g.key ? o.jsx(PgyKolOfficialNestedRange, { openUp: nestedOpenUp, left: index % 2 === 0 ? 0 : -24, options: g.options, value: draft[g.key], onSelect: function (n) { choose(g.key, n); } }) : null,
              ],
            });
          }),
        }),
        o.jsx(PgyKolOfficialFooter, { onReset: reset, onConfirm: function () { p.onApply(pgyKolClone(draft)); p.onClose(); } }),
      ],
    }),
  });
}

function PgyKolOfficialMultiPop(p) {
  var base = Array.isArray(p.selectedKeys) ? p.selectedKeys : [];
  var ds = m.useState(base), draft = ds[0], setDraft = ds[1];
  m.useEffect(function () { if (p.open) setDraft(base.slice()); }, [p.open]);
  function toggle(n) { var key = pgyKolNodeKey(n), i = draft.indexOf(key); setDraft(i >= 0 ? draft.slice(0, i).concat(draft.slice(i + 1)) : draft.concat([key])); }
  return o.jsx(PgyKolPop, {
    open: p.open,
    anchor: p.anchor,
    onClose: p.onClose,
    width: 228,
    preferredHeight: Math.min(360, 64 + (p.options || []).length * 36),
    children: o.jsxs(x, {
      children: [
        o.jsx(x, { sx: { display: "flex", flexDirection: "column" }, children: (p.options || []).map(function (n) { var key = pgyKolNodeKey(n); return o.jsx(PgyKolCheck, { key: key, label: n.label, checked: draft.indexOf(key) >= 0, onToggle: function () { toggle(n); } }); }) }),
        o.jsx(PgyKolOfficialFooter, { onReset: function () { setDraft([]); }, onConfirm: function () { p.onApply(draft.slice()); p.onClose(); } }),
      ],
    }),
  });
}

function PgyKolOfficialBrandPop(p) {
  var ks = m.useState(""), keyword = ks[0], setKeyword = ks[1];
  var os = m.useState([]), options = os[0], setOptions = os[1];
  var ds = m.useState(Array.isArray(p.current) ? p.current.slice() : []), draft = ds[0], setDraft = ds[1];
  var es = m.useState(!!p.excluded), excluded = es[0], setExcluded = es[1];
  var timer = m.useRef(null);
  m.useEffect(function () { if (p.open) { setKeyword(""); setOptions([]); setDraft(Array.isArray(p.current) ? p.current.slice() : []); setExcluded(!!p.excluded); } }, [p.open]);
  function search(value) { var bridge = window.bridge && window.bridge.pgyKol; if (!bridge || !bridge.getConfig) return; bridge.getConfig({ provider: "brandSearch", keyword: value }).then(function (res) { if (res && res.ok) { var data = res.data || {}, list = data.options || data.nodes || (Array.isArray(res.data) ? res.data : []); setOptions(list); } }); }
  function onKeyword(e) { var value = e.target.value; setKeyword(value); if (timer.current) window.clearTimeout(timer.current); timer.current = window.setTimeout(function () { search(value); }, 300); }
  function toggle(n) { var value = pgyKolOptValue(n), i = draft.indexOf(value); setDraft(i >= 0 ? draft.slice(0, i).concat(draft.slice(i + 1)) : draft.concat([value])); }
  return o.jsx(PgyKolPop, {
    open: p.open,
    anchor: p.anchor,
    onClose: p.onClose,
    width: 420,
    preferredHeight: 188,
    children: o.jsxs(x, {
      children: [
        o.jsx(w, { sx: { fontSize: 12, color: "rgba(0,0,0,.45)", mb: 0.75 }, children: "请至少选择3个品牌" }),
        o.jsx(ae, { size: "small", fullWidth: true, placeholder: "请输入品牌名称", value: keyword, onChange: onKeyword, sx: { "& .MuiInputBase-root": { height: 32, bgcolor: "#fafafa" } } }),
        options.length ? o.jsx(x, { sx: { display: "flex", flexWrap: "wrap", gap: 0.5, maxHeight: 120, overflowY: "auto", mt: 0.75 }, children: options.map(function (n) { var value = pgyKolOptValue(n), selected = draft.indexOf(value) >= 0; return o.jsx(f1, { key: String(value), size: "small", label: pgyKolOptLabel(n), color: selected ? "primary" : "default", variant: selected ? "filled" : "outlined", onClick: function () { toggle(n); } }); }) }) : null,
        o.jsx(PgyKolCheck, { label: "剔除上述品牌已合作博主", checked: excluded, onToggle: function () { setExcluded(!excluded); } }),
        o.jsx(PgyKolOfficialFooter, { disabled: draft.length < 3, onReset: function () { setDraft([]); setExcluded(false); }, onConfirm: function () { p.onApply(draft.slice(), excluded); p.onClose(); } }),
      ],
    }),
  });
}

/* ============ Phase 5.2：多组单选范围 Popover（合作表现/传播规模/CPM/单价） ============ */
function PgyKolRangeGroupsPop(p) {
  var groups = p.groups || [];
  return o.jsx(PgyKolPop, {
    open: p.open,
    anchor: p.anchor,
    onClose: p.onClose,
    width: p.width || 300,
    children: o.jsxs(x, {
      children: [
        o.jsx(PgyKolPopHeader, { title: p.title, onClose: p.onClose }),
        groups.map(function (g) {
          return o.jsxs(x, {
            key: g.key,
            sx: { mb: 0.75 },
            children: [
              o.jsx(w, { sx: { fontSize: 12, color: "rgba(0,0,0,.45)", mb: 0.25 }, children: g.label }),
              o.jsx(x, {
                sx: { display: "flex", flexWrap: "wrap", gap: 0.5 },
                children: g.options.map(function (n) {
                  var sel = pgyKolRangeEq(g.value, n);
                  return o.jsx(f1, {
                    key: n.label,
                    size: "small",
                    label: n.label,
                    color: sel ? "primary" : "default",
                    variant: sel ? "filled" : "outlined",
                    onClick: function () { g.onToggle(n); },
                  });
                }),
              }),
            ],
          });
        }),
      ],
    }),
  });
}

/* ============ Phase 5.2：树形多选 Popover（二十大人群等，草稿 + 确定/清空） ============ */
function PgyKolTreePop(p) {
  var cfg = p.cfg;
  var ds = m.useState(null), draftState = ds[0], setDraftState = ds[1];
  var base = Array.isArray(p.selectedKeys) ? p.selectedKeys : [];
  var draft = draftState !== null ? draftState : base;
  m.useEffect(function () {
    if (p.open) setDraftState(null);
  }, [p.open]);
  function toggle(n) {
    var key = pgyKolNodeKey(n), i = draft.indexOf(key);
    setDraftState(i >= 0 ? draft.slice(0, i).concat(draft.slice(i + 1)) : draft.concat([key]));
  }
  function clear() { setDraftState([]); }
  function apply() { p.onApply(draft.slice()); p.onClose(); }
  return o.jsx(PgyKolPop, {
    open: p.open,
    anchor: p.anchor,
    onClose: p.onClose,
    width: p.width || 300,
    preferredHeight: 360,
    children: o.jsxs(x, {
      sx: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0 },
      children: [
        o.jsx(PgyKolPopHeader, { title: p.title, onClose: p.onClose }),
        cfg && cfg.error
          ? o.jsx(oe, { severity: "error", children: "加载失败（错误码 " + (cfg.error.code || "unknown") + "）：" + (cfg.error.message || "未知错误") })
          : cfg
            ? o.jsxs(x, {
                sx: { display: "flex", flexDirection: "column", minHeight: 0, flexGrow: 1, overflow: "hidden" },
                children: [
                  o.jsx(x, { sx: { minHeight: 0, flexGrow: 1, overflowY: "auto", pr: 0.25 }, children: o.jsx(PgyKolTree, {
                    leafOnly: p.leafOnly,
                    nodes: cfg.nodes || [],
                    selected: draft,
                    onToggle: toggle,
                    display: p.display || function (n) { return n.fullPath || n.label || String(n.value); },
                  }) }),
                  p.hint ? o.jsx(w, { sx: { fontSize: 12, color: "rgba(0,0,0,.45)", display: "block", mt: 0.5, flexShrink: 0 }, children: p.hint }) : null,
                  o.jsxs(x, {
                    sx: { display: "flex", alignItems: "center", gap: 1, mt: 1, pt: 0.5, borderTop: "1px solid #f0f1f3", flexShrink: 0, position: "sticky", bottom: 0, bgcolor: "#fff" },
                    children: [
                      o.jsx(w, { sx: { fontSize: 12, color: "rgba(0,0,0,.45)", mr: "auto" }, children: "已选 " + draft.length + " 项" }),
                      o.jsx($, { size: "small", variant: "outlined", onClick: clear, children: "清空" }),
                      o.jsx($, { size: "small", variant: "contained", onClick: apply, children: "确定" }),
                    ],
                  }),
                ],
              })
            : o.jsx(de, { size: 24 }),
      ],
    }),
  });
}

/* ============ Phase 5.2：地域三级级联 Popover（省/市/区县） ============ */
function PgyKolCascadePop(p) {
  var rawNodes = p.cfg && p.cfg.nodes ? p.cfg.nodes : [];
  // 官网地域为「国家→省→市→区县」多级：国家列同时包含中国（可继续展开）
  // 与外国（无子级，直接选中）；中国节点来自 areas 配置，其余国家按官方列表补充。
  var chinaNode = null;
  for (var ci = 0; ci < rawNodes.length; ci++) {
    if (rawNodes[ci].children && rawNodes[ci].children.length &&
      (String(rawNodes[ci].label || "") === "中国" || String(rawNodes[ci].value || "") === "中国")) {
      chinaNode = rawNodes[ci];
      break;
    }
  }
  var countryNodes = [{ value: "全部", label: "全部" }];
  if (chinaNode) {
    countryNodes.push(chinaNode);
  } else {
    countryNodes.push({ value: "中国", label: "中国" });
  }
  (pgyKolCountryOptions || []).forEach(function (c) {
    if (c.value !== "全部" && c.value !== "中国") {
      countryNodes.push({ value: c.value, label: c.label });
    }
  });
  var st0 = m.useState(null), country0 = st0[0], setCountry0 = st0[1];
  var st1 = m.useState(null), level1 = st1[0], setLevel1 = st1[1];
  var st2 = m.useState(null), level2 = st2[0], setLevel2 = st2[1];
  var st3 = m.useState(null), level3 = st3[0], setLevel3 = st3[1];
  m.useEffect(function () {
    if (p.open) {
      setCountry0(null);
      setLevel1(null);
      setLevel2(null);
      setLevel3(null);
    }
  }, [p.open]);
  var l1Children = country0 && country0.children && country0.children.length ? country0.children : [];
  var l2Children = level1 && level1.children ? level1.children : [];
  var l3Children = level2 && level2.children ? level2.children : [];
  function finish(n) {
    p.onSelect(n);
    p.onClose();
  }
  function pick0(n) {
    setCountry0(n);
    setLevel1(null);
    setLevel2(null);
    setLevel3(null);
    if (String(n.value || n.label || "") === "全部") {
      p.onClear();
      p.onClose();
      return;
    }
    if (!n.children || !n.children.length) finish(n);
  }
  function pick1(n) {
    setLevel1(n);
    setLevel2(null);
    setLevel3(null);
    if (!n.children || !n.children.length) finish(n);
  }
  function pick2(n) {
    setLevel2(n);
    setLevel3(null);
    if (!n.children || !n.children.length) finish(n);
  }
  function pick3(n) {
    setLevel3(n);
    finish(n);
  }
  function col(title, opts, selKey, pick) {
    return o.jsxs(x, {
      sx: { flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" },
      children: [
        o.jsx(w, { sx: { fontSize: 12, color: "rgba(0,0,0,.45)", mb: 0.25 }, children: title }),
        o.jsx(x, {
          sx: { minHeight: 0, flexGrow: 1, overflowY: "auto" },
          children: opts.map(function (n) {
            var k = pgyKolNodeKey(n), sel = k === selKey;
            return o.jsx(x, {
              key: k,
              onClick: function () { pick(n); },
              sx: {
                display: "flex",
                alignItems: "center",
                minHeight: 26,
                px: 0.75,
                fontSize: 13,
                color: sel ? "#ff2442" : "rgba(0,0,0,.7)",
                bgcolor: sel ? "rgba(255,36,66,.08)" : "transparent",
                borderRadius: 0.375,
                cursor: "pointer",
                whiteSpace: "nowrap",
              },
              children: n.label || String(n.value),
            });
          }),
        }),
      ],
    });
  }
  return o.jsx(PgyKolPop, {
    open: p.open,
    anchor: p.anchor,
    onClose: p.onClose,
    width: 420,
    preferredHeight: 320,
    children: o.jsxs(x, {
      sx: { display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" },
      children: [
        o.jsx(PgyKolPopHeader, { title: p.title, onClose: p.onClose }),
        countryNodes.length === 0
          ? o.jsx(w, { sx: { fontSize: 13, color: "rgba(0,0,0,.45)", py: 1 }, children: "地域数据加载中…" })
          : o.jsxs(x, {
              sx: { display: "flex", gap: 1, flexGrow: 1, minHeight: 0, overflow: "hidden" },
              children: [
                col("国家/地区", countryNodes, country0 ? pgyKolNodeKey(country0) : null, pick0),
                l1Children.length > 0 ? col("省份", l1Children, level1 ? pgyKolNodeKey(level1) : null, pick1) : null,
                l2Children.length > 0 ? col("城市", l2Children, level2 ? pgyKolNodeKey(level2) : null, pick2) : null,
                l3Children.length > 0 ? col("区县", l3Children, level3 ? pgyKolNodeKey(level3) : null, pick3) : null,
              ],
            }),
        o.jsxs(x, {
          sx: { display: "flex", alignItems: "center", gap: 1, mt: 1, pt: 0.5, borderTop: "1px solid #f0f1f3", flexShrink: 0, position: "sticky", bottom: 0, bgcolor: "#fff" },
          children: [
            o.jsx(w, {
              sx: { fontSize: 12, color: "rgba(0,0,0,.45)", mr: "auto", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
              children: "已选：" + ((level3 || level2 || level1 || country0) ? pgyKolOptLabel(level3 || level2 || level1 || country0) : "未选择"),
            }),
            o.jsx($, { size: "small", variant: "outlined", onClick: function () { p.onClear(); p.onClose(); }, children: "清空" }),
            o.jsx($, { size: "small", variant: "contained", disabled: !level1 && !country0, onClick: function () { finish(level3 || level2 || level1 || country0); }, children: "确定" }),
          ],
        }),
      ],
    }),
  });
}

/* ============ Phase 5.2：粉丝量 Popover（预设 + 自定义上下限） ============ */
function PgyKolFansNumPop(p) {
  return o.jsx(PgyKolPop, {
    open: p.open,
    anchor: p.anchor,
    onClose: p.onClose,
    width: 280,
    children: o.jsxs(x, {
      children: [
        o.jsx(PgyKolPopHeader, { title: "粉丝量", onClose: p.onClose }),
        o.jsx(x, {
          sx: { display: "flex", flexWrap: "wrap", gap: 0.5 },
          children: pgyKolFansPresets.map(function (n) {
            var sel = p.lower === n.lower && p.upper === n.upper;
            return o.jsx(f1, {
              key: n.label,
              size: "small",
              label: n.label,
              color: sel ? "primary" : "default",
              variant: sel ? "filled" : "outlined",
              onClick: function () { p.onApply(n.lower, n.upper); p.onClose(); },
            });
          }),
        }),
        o.jsxs(x, {
          sx: { display: "flex", alignItems: "center", gap: 0.5, mt: 1, pt: 0.5, borderTop: "1px solid #f0f1f3" },
          children: [
            o.jsx(ae, { size: "small", type: "number", placeholder: "下限", value: p.lower, onChange: function (e) { p.onLower(e.target.value); }, sx: { maxWidth: 100 } }),
            o.jsx(w, { sx: { fontSize: 13, color: "rgba(0,0,0,.45)" }, children: "～" }),
            o.jsx(ae, { size: "small", type: "number", placeholder: "上限", value: p.upper, onChange: function (e) { p.onUpper(e.target.value); }, sx: { maxWidth: 100 } }),
            o.jsx($, { size: "small", variant: "contained", onClick: function () { p.onApply(p.lower, p.upper); p.onClose(); }, children: "确定" }),
          ],
        }),
      ],
    }),
  });
}

/* ============ Phase 5.2：合作报价 Popover（图文/视频报价上下限） ============ */
function PgyKolQuotePop(p) {
  return o.jsx(PgyKolPop, {
    open: p.open,
    anchor: p.anchor,
    onClose: p.onClose,
    width: 300,
    children: o.jsxs(x, {
      children: [
        o.jsx(PgyKolPopHeader, { title: "合作报价", onClose: p.onClose }),
        o.jsx(PgyKolField, {
          label: "图文报价",
          children: [
            o.jsx(ae, { size: "small", type: "number", placeholder: "下限", value: p.noteLower, onChange: function (e) { p.onNoteLower(e.target.value); }, sx: { maxWidth: 100 } }),
            o.jsx(w, { sx: { fontSize: 13, color: "rgba(0,0,0,.45)" }, children: "～" }),
            o.jsx(ae, { size: "small", type: "number", placeholder: "上限", value: p.noteUpper, onChange: function (e) { p.onNoteUpper(e.target.value); }, sx: { maxWidth: 100 } }),
          ],
        }),
        o.jsx(PgyKolField, {
          label: "视频报价",
          children: [
            o.jsx(ae, { size: "small", type: "number", placeholder: "下限", value: p.videoLower, onChange: function (e) { p.onVideoLower(e.target.value); }, sx: { maxWidth: 100 } }),
            o.jsx(w, { sx: { fontSize: 13, color: "rgba(0,0,0,.45)" }, children: "～" }),
            o.jsx(ae, { size: "small", type: "number", placeholder: "上限", value: p.videoUpper, onChange: function (e) { p.onVideoUpper(e.target.value); }, sx: { maxWidth: 100 } }),
          ],
        }),
      ],
    }),
  });
}

/* ============ Phase 5.2：合作订单数 Popover ============ */
function PgyKolOrderPop(p) {
  return o.jsx(PgyKolPop, {
    open: p.open,
    anchor: p.anchor,
    onClose: p.onClose,
    width: 240,
    children: o.jsxs(x, {
      children: [
        o.jsx(PgyKolPopHeader, { title: "合作订单数", onClose: p.onClose }),
        o.jsxs(x, {
          sx: { display: "flex", alignItems: "center", gap: 0.5 },
          children: [
            o.jsx(w, { sx: { fontSize: 13, color: "rgba(0,0,0,.7)" }, children: "≥" }),
            o.jsx(ae, { size: "small", type: "number", placeholder: "订单数", value: p.value, onChange: function (e) { p.onChange(e.target.value); }, sx: { maxWidth: 120 } }),
            o.jsx($, { size: "small", variant: "contained", onClick: p.onClose, children: "确定" }),
          ],
        }),
      ],
    }),
  });
}

/* ============ Phase 5.2：官网式紧凑 checkbox 行 ============ */
function PgyKolCheck(p) {
  var dis = !!p.disabled;
  return o.jsxs(x, {
    sx: {
      display: "inline-flex",
      alignItems: "center",
      gap: 0.5,
      height: 28,
      cursor: dis ? "not-allowed" : "pointer",
      opacity: dis ? 0.38 : 1,
      userSelect: "none",
    },
    onClick: function () {
      if (!dis) p.onToggle();
    },
    children: [
      o.jsx(x, {
        sx: {
          width: 14,
          height: 14,
          borderRadius: 0.25,
          border: "1px solid",
          borderColor: p.checked ? "#ff2442" : "#c9cdd4",
          bgcolor: p.checked ? "#ff2442" : "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 10,
          color: "#fff",
          flexShrink: 0,
        },
        children: p.checked ? "✓" : null,
      }),
      o.jsx(w, { sx: { fontSize: 14, color: dis ? "rgba(0,0,0,.25)" : "rgba(0,0,0,.7)", lineHeight: "28px" }, children: p.label }),
    ],
  });
}

/* ============ Phase 5.2：行内选项（营销目标/博主类目/精选博主/热门活动） ============ */
function PgyKolInlineOptions(p) {
  var keyOf = p.keyOf || pgyKolNodeKey;
  var selected = p.selected || [];
  return o.jsx(x, {
    sx: { display: "flex", flexWrap: "wrap", gap: 0.5 },
    children: p.options.map(function (n) {
      var key = keyOf(n), sel = selected.indexOf(key) >= 0;
      return o.jsx(PgyKolTrigger, {
        key: key,
        label: p.display ? p.display(n) : pgyKolOptLabel(n),
        selected: sel,
        arrow: false,
        onOpen: function () { p.onToggle(n); },
      });
    }),
  });
}

/* ============ Phase 5.2：博主类目两级悬停选择（官网 2026-08-10 实测） ============ */
function PgyKolCategoryChips(p) {
  var hs = m.useState(null), hover = hs[0], setHover = hs[1];
  var leaveTimer = m.useRef(null);
  function cancelLeave() {
    if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
  }
  function scheduleLeave() {
    cancelLeave();
    leaveTimer.current = window.setTimeout(function () { setHover(null); }, 180);
  }
  function enter(node, e) {
    cancelLeave();
    setHover({ node: node, anchor: e && e.currentTarget ? e.currentTarget : null });
  }
  var selected = p.selected || [];
  return o.jsxs(x, {
    sx: { display: "flex", flexWrap: "wrap", gap: 0.5, alignItems: "center" },
    children: [
      p.options.map(function (n) {
        var isAll = n.value === "全部";
        var active = isAll ? selected.indexOf("全部") >= 0 : p.isActive(n);
        return o.jsx(PgyKolTrigger, {
          key: n.value,
          label: n.label,
          arrow: false,
          selected: active,
          onOpen: function () { if (isAll) p.onToggleAll(); else p.onToggleWhole(n); },
          onMouseEnter: function (e) { if (!isAll) enter(n, e); },
          onMouseLeave: scheduleLeave,
        });
      }),
      hover && hover.node && hover.node.children && hover.node.children.length
        ? o.jsx(PgyKolCategoryPop, {
            open: true,
            anchor: hover.anchor,
            node: hover.node,
            selected: selected,
            onToggleLeaf: function (leaf) { p.onToggleLeaf(hover.node, leaf); },
            onClose: function () { setHover(null); },
            onMouseEnter: cancelLeave,
            onMouseLeave: scheduleLeave,
          })
        : null,
    ],
  });
}

function PgyKolCategoryPop(p) {
  var leaves = p.node && p.node.children ? p.node.children : [];
  var per = 6;
  var cols = [];
  for (var i = 0; i < leaves.length; i += per) cols.push(leaves.slice(i, i + per));
  var selected = p.selected || [];
  var whole = selected.indexOf(p.node.value) >= 0;
  return o.jsx(PgyKolPop, {
    open: p.open,
    anchor: p.anchor,
    onClose: p.onClose,
    noBackdrop: true,
    width: 280,
    preferredHeight: 232,
    maxHeight: 232,
    overflow: "auto",
    onMouseEnter: p.onMouseEnter,
    onMouseLeave: p.onMouseLeave,
    children: cols.length === 0
      ? o.jsx(w, { sx: { fontSize: 13, color: "rgba(0,0,0,.45)", py: 1 }, children: "暂无二级类目" })
      : o.jsx(x, {
          sx: { display: "flex", gap: 0.75 },
          children: cols.map(function (col, ci) {
            return o.jsx(x, {
              key: ci,
              sx: { display: "flex", flexDirection: "column", gap: 0.25, flex: 1, minWidth: 0 },
              children: col.map(function (c) {
                var sel = whole || selected.indexOf(c.value) >= 0;
                return o.jsx(PgyKolTrigger, {
                  key: c.value,
                  label: c.label,
                  arrow: false,
                  selected: sel,
                  onOpen: function () { p.onToggleLeaf(c); },
                });
              }),
            });
          }),
        }),
  });
}

/* ============ Phase 5.2：搜索历史面板（搜昵称） ============ */
function PgyKolHistoryPanel(p) {
  var list = p.history || [];
  if (list.length === 0) return null;
  return o.jsxs(x, {
    sx: { border: "1px solid #e5e6eb", borderRadius: 0.5, p: 1, mb: 0.75, bgcolor: "#fff" },
    children: [
      o.jsxs(x, {
        sx: { display: "flex", alignItems: "center", mb: 0.5 },
        children: [
          o.jsx(w, { sx: { fontSize: 13, fontWeight: 600, color: "rgba(0,0,0,.85)", mr: "auto" }, children: "搜索历史" }),
          o.jsx($, { size: "small", variant: "text", color: "error", onClick: p.onClear, children: "清空历史" }),
        ],
      }),
      o.jsx(x, {
        sx: { display: "flex", flexWrap: "wrap", gap: 0.5 },
        children: list.map(function (kw) {
          return o.jsx(f1, { key: kw, size: "small", variant: "outlined", label: kw, onClick: function () { p.onPick(kw); } });
        }),
      }),
    ],
  });
}

/* ============ Phase 5.2：矩阵分区与行（左侧窄列 + 右侧内容） ============ */
function PgyKolMatrixSection(p) {
  return o.jsxs(x, {
    sx: { display: "flex", borderBottom: "1px solid #f0f1f3" },
    children: [
      o.jsx(w, {
        sx: { width: 96, flexShrink: 0, pt: 1.5, fontSize: 14, fontWeight: 600, color: "rgba(0,0,0,.85)" },
        children: p.title,
      }),
      o.jsx(x, {
        sx: { flexGrow: 1, minWidth: 0, py: 1 },
        children: p.children,
      }),
    ],
  });
}

function PgyKolMatrixRow(p) {
  return o.jsxs(x, {
    sx: { display: "flex", alignItems: "center", minHeight: 36, gap: 1, py: 0.25 },
    children: [
      p.label
        ? o.jsx(w, {
            sx: { width: 88, flexShrink: 0, fontSize: 13, color: "rgba(0,0,0,.45)", textAlign: "right", lineHeight: "28px" },
            children: p.label,
          })
        : null,
      o.jsxs(x, {
        sx: { flexGrow: 1, minWidth: 0, display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.5 },
        children: p.children,
      }),
    ],
  });
}

/* 紧凑字段（弹层内 label + 控件） */
function PgyKolField(p) {
  return o.jsxs(x, {
    sx: { display: "flex", alignItems: "center", gap: 0.5, py: 0.25 },
    children: [
      o.jsx(w, { sx: { flexShrink: 0, fontSize: 13, color: "rgba(0,0,0,.45)", minWidth: p.minWidth || 56 }, children: p.label }),
      p.children,
    ],
  });
}

/* ============ Phase 5.2：展示指标弹窗（官网两栏式：可添加列 / 已添加） ============ */
function PgyKolCollectDialog(p) {
  var list = p.columns || [], fixedIds = pgyKolFixedColumnIds();
  var exportable = list.filter(function (c) {
    if (fixedIds.indexOf(c.id) >= 0) return false;
    if (c.evidence === "unavailable") return false;
    if (c.responsePath && String(c.responsePath).indexOf("computed:") === 0) return false;
    return true;
  });
  var groupNames = pgyKolColumnGroups().filter(function (g) {
    return exportable.some(function (c) { return pgyKolColumnGroupOf(c) === g; });
  }).concat(exportable.some(pgyKolIsExtensionColumn) ? ["博主信息"] : []);
  var ds = m.useState(null), draftState = ds[0], setDraftState = ds[1];
  var effective = draftState !== null ? draftState : (p.selected || []);
  m.useEffect(function () { if (p.open) setDraftState(null); }, [p.open]);
  function toggle(id) {
    setDraftState(function (prev) {
      var cur = (prev !== null ? prev : (p.selected || [])).slice(), i = cur.indexOf(id);
      if (i >= 0) return cur.slice(0, i).concat(cur.slice(i + 1));
      return cur.concat([id]);
    });
  }
  function groupAll(g) {
    var ids = exportable.filter(function (c) { return pgyKolColumnGroupOf(c) === g; }).map(function (c) { return c.id; });
    return ids.length > 0 && ids.every(function (id) { return effective.indexOf(id) >= 0; });
  }
  function toggleGroup(g) {
    var ids = exportable.filter(function (c) { return pgyKolColumnGroupOf(c) === g; }).map(function (c) { return c.id; });
    setDraftState(function (prev) {
      var cur = (prev !== null ? prev : (p.selected || [])).slice(), all = ids.every(function (id) { return cur.indexOf(id) >= 0; });
      var next = all ? cur.filter(function (id) { return ids.indexOf(id) < 0; }) : cur.slice();
      if (!all) {
        ids.forEach(function (id) { if (next.indexOf(id) < 0) next.push(id); });
      }
      return next;
    });
  }
  function check(id, label) {
    var sel = effective.indexOf(id) >= 0;
    return o.jsxs(x, {
      key: id, onClick: function () { toggle(id); },
      sx: { display: "flex", alignItems: "center", gap: 0.5, minHeight: 26, cursor: "pointer", px: 0.25 },
      children: [
        o.jsx(x, { sx: { width: 14, height: 14, borderRadius: 2, border: "1px solid", borderColor: sel ? "#ff2442" : "#c9cdd4", bgcolor: sel ? "#ff2442" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", flexShrink: 0 }, children: sel ? "✓" : null }),
        o.jsx(w, { sx: { fontSize: 13, color: "rgba(0,0,0,.7)" }, children: label }),
      ],
    });
  }
  var closeBtn = o.jsx(te, { size: "small", sx: { ml: "auto", p: 0.25 }, onClick: p.onClose, children: o.jsx(B, { icon: "mdi:close", width: 18, height: 18 }) });
  return o.jsxs(ue, {
    open: p.open, onClose: p.onClose, maxWidth: "sm", fullWidth: true,
    children: [
      o.jsx(be, { children: o.jsxs(x, { sx: { display: "flex", alignItems: "center", gap: 1 }, children: [o.jsx(w, { variant: "subtitle1", fontWeight: 600, children: "选择采集字段" }), closeBtn] }) }),
      o.jsxs(pe, {
        children: [
          o.jsx(oe, { severity: "info", sx: { mb: 1 }, children: "勾选字段过多会增加采集时间，可能触发平台风控，建议按需勾选。" }),
          o.jsx(x, { sx: { maxHeight: 440, overflowY: "auto" }, children: groupNames.map(function (g) {
            var cols = exportable.filter(function (c) { return pgyKolColumnGroupOf(c) === g; });
            return o.jsxs(x, { key: g, sx: { mb: 1 }, children: [
              o.jsxs(x, { onClick: function () { toggleGroup(g); }, sx: { display: "flex", alignItems: "center", gap: 0.5, cursor: "pointer", mb: 0.25 }, children: [
                o.jsx(x, { sx: { width: 14, height: 14, borderRadius: 2, border: "1px solid", borderColor: groupAll(g) ? "#ff2442" : "#c9cdd4", bgcolor: groupAll(g) ? "#ff2442" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", flexShrink: 0 }, children: groupAll(g) ? "✓" : null }),
                o.jsx(w, { sx: { fontSize: 13, fontWeight: 600, color: "rgba(0,0,0,.85)" }, children: g }),
                o.jsx(w, { sx: { fontSize: 12, color: "rgba(0,0,0,.35)" }, children: "全选" }),
              ] }),
              o.jsxs(x, { sx: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0.25 }, children: cols.map(function (c) { return check(c.id, c.label || c.id); }) }),
            ] });
          }) }),
o.jsx(w, { sx: { fontSize: 12, color: "rgba(0,0,0,.45)", display: "block", mt: 1 }, children: "已选 " + effective.length + " 项" }),
        ],
      }),
      o.jsxs(_e, {
        children: [
          o.jsx($, { onClick: p.onClose, children: "取消" }),
          o.jsx($, { variant: "contained", disabled: effective.length === 0, onClick: function () { p.onApply(effective.slice()); p.onClose(); }, children: "提交" }),
        ],
      }),
    ],
  });
}

function PgyKolColumnDialog(p) {
  var fixedIds = pgyKolFixedColumnIds(), list = p.columns || [], hideFixed = !!p.hideFixed, title = p.title || "自定义列";
  var officialColumns = pgyKolOfficialMetricColumns(list);
  var extensionColumns = list.filter(pgyKolIsExtensionColumn);
  var groups = [];
  officialColumns.forEach(function (c) {
    var g = pgyKolColumnGroupOf(c);
    if (g !== "固定列" && groups.indexOf(g) < 0) groups.push(g);
  });
  var ds = m.useState(null), draftState = ds[0], setDraftState = ds[1];
  var ss = m.useState(""), search = ss[0], setSearch = ss[1];
  var effective = draftState !== null ? draftState : (p.selected || []);
  var filtered = list.filter(function (c) { return search === "" || (c.label || "").indexOf(search) >= 0; });
  var officialCount = officialColumns.length; /* 官网主列表：41 项（固定「操作」不计指标）。 */
  function fixedLabel(id) {
    if (id === "kolInfo") return "博主信息";
    if (id === "recentNotes") return "近期笔记";
    if (id === "actions") return "操作";
    return id;
  }
  function colOf(id) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }
  function toggleDraft(id) {
    if (fixedIds.indexOf(id) >= 0) return;
    setDraftState(function (prev) {
      var cur = (prev !== null ? prev : (p.selected || [])).slice(), i = cur.indexOf(id);
      if (i >= 0) return cur.slice(0, i).concat(cur.slice(i + 1));
      if (id === "price" || id === "picturePrice" || id === "videoPrice") {
        cur = cur.filter(function (c) { return c !== "price" && c !== "picturePrice" && c !== "videoPrice"; });
      }
      return cur.concat([id]);
    });
  }
  function clearDraft() {
    setDraftState(hideFixed ? [] : fixedIds.slice());
  }
  function moveDraft(id, dir) {
    setDraftState(function (prev) {
      var cur = (prev !== null ? prev : (p.selected || [])).slice(), i = cur.indexOf(id);
      if (i < 0) return cur;
      var j = i + dir;
      if (j < 0 || j >= cur.length) return cur;
      var tmp = cur[i];
      cur[i] = cur[j];
      cur[j] = tmp;
      return cur;
    });
  }
  function apply() {
    p.onApply(effective.slice());
    setDraftState(null);
    setSearch("");
    p.onClose();
  }
  function cancel() {
    setDraftState(null);
    setSearch("");
    p.onClose();
  }
  function checkBox(c) {
    var sel = effective.indexOf(c.id) >= 0;
    var radio = c.id === "price" || c.id === "picturePrice" || c.id === "videoPrice";
    return o.jsxs(x, {
      key: c.id,
      onClick: function () { toggleDraft(c.id); },
      sx: { display: "flex", alignItems: "center", gap: 0.5, minHeight: 28, cursor: c.fixed ? "default" : "pointer", px: 0.25 },
      children: [
        o.jsx(x, {
          sx: {
            width: 14,
            height: 14,
            borderRadius: radio ? 7 : 2,
            border: "1px solid",
            borderColor: sel ? "#ff2442" : "#c9cdd4",
            bgcolor: sel ? "#ff2442" : "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 10,
            color: "#fff",
            flexShrink: 0,
          },
          children: radio ? (sel ? "●" : null) : (sel ? "✓" : null),
        }),
        o.jsx(w, { sx: { fontSize: 13, color: c.fixed ? "rgba(0,0,0,.45)" : "rgba(0,0,0,.7)" }, children: c.label || c.id }),
      ],
    });
  }
  function rightRow(id) {
    var c = colOf(id), label = c ? c.label : fixedLabel(id);
    var fixed = fixedIds.indexOf(id) >= 0;
    var idx = effective.indexOf(id), first = idx === 0, last = idx === effective.length - 1;
    return o.jsxs(x, {
      key: id,
      sx: { display: "flex", alignItems: "center", gap: 0.5, minHeight: 30 },
      children: [
        fixed
          ? o.jsx(B, { icon: "solar:lock-bold", width: 13, height: 13, style: { color: "rgba(0,0,0,.35)", flexShrink: 0 } })
          : o.jsx(B, { icon: "mdi:drag-vertical", width: 14, height: 14, style: { color: "rgba(0,0,0,.25)", flexShrink: 0 } }),
        o.jsx(w, { sx: { fontSize: 13, color: "rgba(0,0,0,.7)", flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: label }),
        fixed
          ? null
          : o.jsx($, { size: "small", sx: { minWidth: 26, p: 0 }, disabled: first, onClick: function () { moveDraft(id, -1); }, children: "↑" }),
        fixed
          ? null
          : o.jsx($, { size: "small", sx: { minWidth: 26, p: 0 }, disabled: last, onClick: function () { moveDraft(id, 1); }, children: "↓" }),
        fixed
          ? null
          : o.jsx(te, { size: "small", sx: { p: 0.25 }, onClick: function () { toggleDraft(id); }, children: o.jsx(B, { icon: "mdi:close", width: 14, height: 14 }) }),
      ],
    });
  }
  return o.jsxs(ue, {
    open: p.open,
    onClose: cancel,
    maxWidth: "md",
    fullWidth: true,
    children: [
      o.jsx(be, {
        children: o.jsxs(x, {
          sx: { display: "flex", alignItems: "center", gap: 1 },
          children: [
            o.jsx(w, { variant: "subtitle1", fontWeight: 600, children: title }),
            o.jsx(te, { size: "small", sx: { ml: "auto", p: 0.25 }, onClick: cancel, children: o.jsx(B, { icon: "mdi:close", width: 18, height: 18 }) }),
          ],
        }),
      }),
      o.jsxs(pe, {
        sx: { display: "flex", gap: 2, minHeight: 420 },
        children: [
          /* 左：可添加列 */
          o.jsxs(x, {
            sx: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column" },
            children: [
              o.jsx(w, { sx: { fontSize: 13, fontWeight: 600, color: "rgba(0,0,0,.85)", mb: 0.5 }, children: "官网展示指标（" + officialCount + "）" }),
              o.jsx(ae, { size: "small", fullWidth: true, placeholder: "请输入筛选条件", value: search, onChange: function (e) { setSearch(e.target.value); }, sx: { mb: 1 } }),
              p.error ? o.jsx(oe, { severity: "error", sx: { mb: 1 }, children: "字段加载失败（错误码 " + (p.error.code || "unknown") + "）：" + (p.error.message || "未知错误") }) : null,
              o.jsx(x, {
                sx: { flex: 1, overflowY: "auto", maxHeight: 360 },
                children: [
                  hideFixed ? null : o.jsxs(x, {
                    key: "fixed-columns",
                    sx: { mb: 1 },
                    children: [
                      o.jsx(w, { sx: { fontSize: 12, fontWeight: 600, color: "rgba(0,0,0,.6)", mb: 0.25 }, children: "固定列" }),
                      fixedIds.map(function (id) {
                        var c = colOf(id);
                        return checkBox({ id: id, label: c && c.label || fixedLabel(id), group: "固定列", fixed: true });
                      }),
                    ],
                  }),
                ].concat(groups.map(function (g) {
                  var cols;
                  cols = filtered.filter(function (c) { return !pgyKolIsExtensionColumn(c) && c.id !== "actions" && pgyKolColumnGroupOf(c) === g; });
                  if (cols.length === 0) return null;
                  return o.jsxs(x, {
                    key: g,
                    sx: { mb: 1 },
                    children: [
                      o.jsx(w, { sx: { fontSize: 12, fontWeight: 600, color: "rgba(0,0,0,.6)", mb: 0.25 }, children: g }),
                      cols.map(checkBox),
                    ],
                  });
                })).concat(extensionColumns.filter(function (c) { return search === "" || (c.label || "").indexOf(search) >= 0; }).length ? [o.jsxs(x, {
                  key: "magiorix-extension-columns",
                  sx: { mt: 1, pt: 0.75, borderTop: "1px solid #f0f1f3" },
                  children: [
                    o.jsx(w, { sx: { fontSize: 12, fontWeight: 600, color: "rgba(0,0,0,.6)", mb: 0.25 }, children: "Magiorix 扩展字段（" + extensionColumns.length + "）" }),
                    extensionColumns.filter(function (c) { return search === "" || (c.label || "").indexOf(search) >= 0; }).map(checkBox),
                  ],
                })] : []),
              }),
            ],
          }),
          /* 右：已添加 */
          o.jsxs(x, {
            sx: { width: 264, flexShrink: 0, borderLeft: "1px solid #f0f1f3", pl: 1.5, display: "flex", flexDirection: "column" },
            children: [
              o.jsxs(x, {
                sx: { display: "flex", alignItems: "center", gap: 1, mb: 0.5 },
                children: [
                  o.jsx(w, { sx: { fontSize: 13, fontWeight: 600, color: "rgba(0,0,0,.85)", mr: "auto" }, children: "已添加 " + effective.length + " 项" }),
                  o.jsx($, { size: "small", variant: "text", onClick: clearDraft, children: "清空" }),
                ],
              }),
              o.jsx(x, {
                sx: { overflowY: "auto", maxHeight: 360 },
                children: [
                  hideFixed ? null : fixedIds.map(rightRow),
                  hideFixed ? null : o.jsx(w, { sx: { fontSize: 11, color: "rgba(0,0,0,.35)", display: "block", py: 0.5, borderBottom: "1px solid #f0f1f3", mb: 0.5 }, children: "以上为横向固定列" }),
                  effective.filter(function (id) { return fixedIds.indexOf(id) < 0; }).map(rightRow),
                ],
              }),
            ],
          }),
        ],
      }),
      o.jsxs(_e, {
        children: [
          o.jsx($, { onClick: cancel, children: "取消" }),
          o.jsx($, { variant: "contained", disabled: hideFixed && effective.length === 0, onClick: apply, children: "确定" }),
        ],
      }),
    ],
  });
}


/* ============ Phase 5.2：找博主页面 ============ */
function PgyKolSearchPage() {
  var st = m.useState("idle"), status = st[0], setStatus = st[1];
  var er = m.useState(null), error = er[0], setError = er[1];
  var cf = m.useState({}), configs = cf[0], setConfigs = cf[1];
  var fs0 = m.useState(pgyKolDefaultFilter()), filter = fs0[0], setFilterState = fs0[1];
  var pv = m.useState(""), preview = pv[0], setPreview = pv[1];
  var rs = m.useState(null), result = rs[0], setResult = rs[1];
  var cl = m.useState(null), columnList = cl[0], setColumnList = cl[1];
  var ce2 = m.useState(null), columnError = ce2[0], setColumnError = ce2[1];
  var sc2 = m.useState([]), selectedColumns = sc2[0], setSelectedColumns = sc2[1];
  var colOpen = m.useState(false), columnOpen = colOpen[0], setColumnOpen = colOpen[1];
  var iop = m.useState(false), industryPopupOpen = iop[0], setIndustryPopupOpen = iop[1];
  var catOpen = m.useState(false), categoryOpen = catOpen[0], setCategoryOpen = catOpen[1];
  var catInd = m.useState("汽车"), catIndustry = catInd[0], setCatIndustry = catInd[1];
  var catAnchorState = m.useState(null), noteAnchor = catAnchorState[0], setNoteAnchor = catAnchorState[1];
  var coOpen = m.useState(false), collectOpen = coOpen[0], setCollectOpen = coOpen[1];
  var coCols = m.useState([]), collectColumns = coCols[0], setCollectColumns = coCols[1];
  var brandPopup = m.useState(null), brandPopupMode = brandPopup[0], setBrandPopupMode = brandPopup[1];
  var showAllCat = m.useState(true), showAllCategory = showAllCat[0], setShowAllCategory = showAllCat[1];
  var restored = m.useState(false), restoredNotice = restored[0], setRestoredNotice = restored[1];
  var hist = m.useState(pgyKolNickHistory()), history = hist[0], setHistory = hist[1];
  var mopen = m.useState(true), matrixOpen = mopen[0], setMatrixOpen = mopen[1];
  var adv = m.useState(false), advancedOpen = adv[0], setAdvancedOpen = adv[1]; /* 高级信息默认收起 */
  var popst = m.useState({ id: null, anchor: null }), pop = popst[0], setPop = popst[1];
  var khint = m.useState(false), keywordHint = khint[0], setKeywordHint = khint[1];
  var tid2 = m.useState(null), currentTaskId = tid2[0], setCurrentTaskId = tid2[1];
  var ct2 = m.useState(null), currentTask = ct2[0], setCurrentTask = ct2[1];
  var tl2 = m.useState([]), taskList = tl2[0], setTaskList = tl2[1];
  var tle = m.useState(null), taskListError = tle[0], setTaskListError = tle[1];
  var tl3 = m.useState(false), taskLoading = tl3[0], setTaskLoading = tl3[1];
  var bzy = m.useState(false), batchBusy = bzy[0], setBatchBusy = bzy[1];
  var ber = m.useState(null), batchError = ber[0], setBatchError = ber[1];
  var bnt = m.useState(null), batchNotice = bnt[0], setBatchNotice = bnt[1];
  var snt = m.useState(null), searchNotice = snt[0], setSearchNotice = snt[1];
  var cvw = m.useState({ appliedFilter: null, appliedRequestKey: null, isDirty: true }), coordinatorView = cvw[0], setCoordinatorView = cvw[1];
  var coordinatorRef = m.useRef(null);
  var taskDetailRef = m.useRef(null);
  if (!coordinatorRef.current) {
    coordinatorRef.current = pgyKolCreateSearchCoordinator({
      bridge: function () { return window.bridge && window.bridge.pgyKol; },
      onDraft: function (next) { setFilterState(next); },
      onState: function (next) {
        setCoordinatorView(next);
        setStatus(next.status);
        setError(next.error);
        setResult(next.result);
      },
      onHistory: function (keyword) { setHistory(pgyKolNickHistoryAdd(keyword)); },
      onNotice: function (message) {
        if (message === "请先确定筛选并查询") setBatchError({ code: "filter-not-applied", message: message });
        else setSearchNotice(message);
      },
    });
  }
  var searchCoordinator = coordinatorRef.current;
  function setFilter(next) { return searchCoordinator.editDraft(next); }

  /* 路由级宽内容标记：只在找博主页存在时由外层收起重复二级导航，
   * 全局平台主导航不在本组件的职责范围内。 */
  m.useEffect(function () {
    document.documentElement.classList.add("magiorix-pgy-kol-wide");
    /* 二级导航没有稳定的 class（构建时会 hash），只按它同时拥有的两条
     * 蒲公英采集入口定位。最左侧平台主导航不含这两个入口，因此不会被隐藏。 */
    var hidden = null;
    function closestCollectorNav() {
      var blogger = null, note = null;
      var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      var textNode;
      while ((textNode = walker.nextNode())) {
        var text = (textNode.nodeValue || "").trim();
        if (text === "蒲公英博主采集") blogger = textNode.parentElement;
        if (text === "蒲公英笔记采集") note = textNode.parentElement;
      }
      if (!blogger || !note) return null;
      var common = null;
      for (var el = blogger.parentElement; el && el !== document.body; el = el.parentElement) {
        if (el.contains(note)) { common = el; break; }
      }
      if (!common) return null;
      var widthOwner = null;
      for (var cur = common; cur && cur !== document.body; cur = cur.parentElement) {
        var inlineWidth = cur.style && cur.style.width ? parseFloat(cur.style.width) : NaN;
        var rectWidth = typeof cur.getBoundingClientRect === "function" ? Number(cur.getBoundingClientRect().width) : NaN;
        var computedWidth = NaN;
        if (window.getComputedStyle) {
          var computed = window.getComputedStyle(cur);
          computedWidth = computed ? parseFloat(computed.width) : NaN;
        }
        var width = Number.isFinite(inlineWidth) ? inlineWidth : Number.isFinite(rectWidth) && rectWidth > 0 ? rectWidth : computedWidth;
        if (Number.isFinite(width) && width >= 140 && width <= 280) widthOwner = cur;
        if (widthOwner && Number.isFinite(width) && width > 360) break;
      }
      return widthOwner || common;
    }
    function applyWideLayout() {
      var nav = closestCollectorNav();
      if (!nav || hidden && nav === hidden.node) return;
      if (hidden && hidden.node) {
        hidden.node.style.display = hidden.display;
        if (hidden.attribute === null) hidden.node.removeAttribute("data-magiorix-pgy-kol-secondary-nav");
        else hidden.node.setAttribute("data-magiorix-pgy-kol-secondary-nav", hidden.attribute);
      }
      hidden = { node: nav, display: nav.style.display || "", attribute: nav.getAttribute ? nav.getAttribute("data-magiorix-pgy-kol-secondary-nav") : null };
      nav.setAttribute("data-magiorix-pgy-kol-secondary-nav", "hidden");
      nav.style.display = "none";
    }
    var first = window.setTimeout(applyWideLayout, 0);
    var second = window.setTimeout(applyWideLayout, 160);
    var observer = window.MutationObserver ? new window.MutationObserver(applyWideLayout) : null;
    if (observer && document.body) observer.observe(document.body, { childList: true, subtree: true });
    return function () {
      window.clearTimeout(first); window.clearTimeout(second);
      if (observer) observer.disconnect();
      if (hidden && hidden.node) {
        hidden.node.style.display = hidden.display;
        if (hidden.attribute === null) hidden.node.removeAttribute("data-magiorix-pgy-kol-secondary-nav");
        else hidden.node.setAttribute("data-magiorix-pgy-kol-secondary-nav", hidden.attribute);
      }
      document.documentElement.classList.remove("magiorix-pgy-kol-wide");
    };
  }, []);

  /* 配置加载：地域/行业特色画像/二十大人群/内容题材/预估消费行为/笔记类目/行业/热门活动，
   * 以及 Schema 字段（未实证集合唯一来源）。 */
  m.useEffect(function () {
    var bridge = window.bridge && window.bridge.pgyKol;
    if (!bridge) return;
    var tasks = [
      ["areas", { provider: "areas" }],
      ["automotive", { provider: "kolTagsV2", section: "automotiveIndustryTag" }],
      ["audience20", { provider: "kolTagsV2", section: "audience20" }],
      ["contentTheme", { provider: "kolTagsV2", section: "contentTheme" }],
      ["consumeBehavior", { provider: "consumeBehavior" }],
      ["noteCategory", { provider: "specialIndustryData" }],
      ["industry", { provider: "kolTagsV2", section: "industryTags" }],
      ["contentTag", { provider: "contentTagTree" }],
      ["activities", { provider: "activities" }],
    ];
    var schemaP = bridge.getSchemaFields ? bridge.getSchemaFields() : Promise.resolve({ ok: false, error: { code: "unknown", message: "schema 不可用" } });
    schemaP.then(function (res) {
      if (res && res.ok && Array.isArray(res.data)) pgyKolSchemaUnproven(res.data);
    }).catch(function () {});
    tasks.forEach(function (t) {
      bridge.getConfig(t[1]).then(function (res) {
        setConfigs(function (prev) {
          var next = Object.assign({}, prev);
          if (res && res.ok) {
            next[t[0]] = { source: res.data && res.data.source || "live", warning: res.data && res.data.warning, nodes: res.data && res.data.nodes || [], options: res.data && res.data.options || [] };
          } else {
            next[t[0]] = { error: res && res.error ? res.error : { code: "unknown", message: "配置加载失败" } };
          }
          return next;
        });
      }).catch(function (e) {
        setConfigs(function (prev) {
          var next = Object.assign({}, prev);
          next[t[0]] = { error: { code: e && e.code || "unknown", message: e && e.message || String(e) } };
          return next;
        });
      });
    });
  }, []);

  /* 重启恢复上次筛选。 */
  m.useEffect(function () {
    var saved = pgyKolReadJson("magiorix-pgy-kol-filters");
    if (saved && typeof saved === "object" && saved.filter && typeof saved.filter === "object") {
      var next = Object.assign({}, pgyKolDefaultFilter(), saved.filter);
      if (saved.searchType === 0 || saved.searchType === 1) next.searchType = saved.searchType;
      if (typeof saved.keyword === "string") next.keyword = saved.keyword;
      searchCoordinator.restore(next);
      setRestoredNotice(true);
    }
  }, []);

  /* 展示指标（column registry 单一来源）。 */
  m.useEffect(function () {
    var bridge = window.bridge && window.bridge.pgyKol;
    if (!bridge || !bridge.getColumns) return;
    bridge.getColumns().then(function (res) {
      if (res && res.ok && Array.isArray(res.data)) {
        setColumnList(res.data);
        var saved = pgyKolReadJson("magiorix-pgy-kol-filters"), stored = Array.isArray(saved && saved.selectedColumns) ? saved.selectedColumns : null;
        if (!stored) {
          var cols = pgyKolReadJson("magiorix-pgy-kol-columns");
          if (Array.isArray(cols)) stored = cols;
        }
        setSelectedColumns(pgyKolResolveColumns(res.data, stored));
        setColumnError(null);
      } else {
        setColumnError(res && res.error || { code: "unknown", message: "字段列表加载失败" });
      }
    }).catch(function (e) {
      setColumnError({ code: e && e.code || "unknown", message: e && e.message || String(e) });
    });
  }, []);

  m.useEffect(function () { refreshTaskList(); }, []);
  m.useEffect(function () {
    var bridge = window.bridge && window.bridge.pgyKol;
    if (!bridge || !bridge.onBatchEvent) return;
    var dispose = bridge.onBatchEvent(function (ev) {
      if (currentTaskId) loadTask(currentTaskId);
      refreshTaskList();
    });
    return function () { if (dispose && typeof dispose === "function") dispose(); };
  }, [currentTaskId]);
  m.useEffect(function () {
    if (!currentTaskId || !currentTask || currentTask.taskId !== currentTaskId) return;
    var frame = window.requestAnimationFrame ? window.requestAnimationFrame(function () {
      var node = taskDetailRef.current;
      if (node && typeof node.scrollIntoView === "function") node.scrollIntoView({ behavior: "smooth", block: "start" });
    }) : null;
    return function () { if (frame !== null && window.cancelAnimationFrame) window.cancelAnimationFrame(frame); };
  }, [currentTaskId, currentTask && currentTask.taskId]);

  /* Payload 预览（未实证字段仅预览，真实搜索/采集被 IPC 门控）。 */
  m.useEffect(function () {
    var bridge = window.bridge && window.bridge.pgyKol;
    if (!bridge) {
      setPreview("");
      return;
    }
    var timer = window.setTimeout(function () {
      bridge.previewPayload(pgyKolToFilterState(filter)).then(function (res) {
        if (res && res.ok) {
          setPreview(typeof res.data === "string" ? res.data : JSON.stringify(res.data, null, 2));
        } else {
          setPreview("预览不可用：" + ((res && res.error && res.error.message) || "未知错误"));
        }
      }).catch(function (e) {
        setPreview("预览不可用：" + ((e && e.message) || String(e)));
      });
    }, 300);
    return function () { window.clearTimeout(timer); };
  }, [filter]);

  /* 筛选与展示指标持久化。 */
  m.useEffect(function () {
    var timer = window.setTimeout(function () {
      pgyKolWriteJson("magiorix-pgy-kol-filters", { searchType: filter.searchType, keyword: filter.keyword, filter: filter, selectedColumns: selectedColumns });
    }, 400);
    return function () { window.clearTimeout(timer); };
  }, [filter, selectedColumns]);

  var update = m.useCallback(function (patch) {
    setFilter(function (prev) { return Object.assign({}, prev, patch); });
  }, []);
  var toggleArr = m.useCallback(function (key, node) {
    setFilter(function (prev) {
      var cur = prev[key] || [], found = -1;
      for (var i = 0; i < cur.length; i++) {
        if (pgyKolNodeKey(cur[i]) === pgyKolNodeKey(node)) { found = i; break; }
      }
      var next = found >= 0 ? cur.slice(0, found).concat(cur.slice(found + 1)) : cur.concat([node]);
      var patch = {};
      patch[key] = next;
      return Object.assign({}, prev, patch);
    });
  }, []);
  var toggleSingle = m.useCallback(function (key, value) {
    setFilter(function (prev) {
      var patch = {};
      patch[key] = prev[key] === value ? null : value;
      return Object.assign({}, prev, patch);
    });
  }, []);
  var toggleRange = m.useCallback(function (key, node) {
    setFilter(function (prev) {
      var patch = {};
      patch[key] = pgyKolRangeEq(prev[key], node) ? null : node;
      return Object.assign({}, prev, patch);
    });
  }, []);
  var toggleWithNone = m.useCallback(function (key, value) {
    setFilter(function (prev) {
      var patch = {};
      patch[key] = value === "不限" ? null : (prev[key] === value ? null : value);
      return Object.assign({}, prev, patch);
    });
  }, []);
  var toggleBool = m.useCallback(function (key) {
    setFilter(function (prev) {
      var patch = {};
      patch[key] = !prev[key];
      return Object.assign({}, prev, patch);
    });
  }, []);
  /* 博主类目官网语义（2026-08-10 实测）：
   * - 悬停一级 chip 弹出二级面板；点二级只选该项，contentTag 存二级名；
   * - 点一级整类全选，contentTag 存一级名；整类时点二级无效；
   * - 再点一级清除整类；「全部」清空全部类目。
   * contentTag 数组同时承载一级名（整类）与二级名（单项）。 */
  var categoryNodes = pgyKolCategoryTreeNodes(configs.contentTag);
  function categoryIsWhole(node) { return filter.contentTag.indexOf(node.value) >= 0; }
  function categoryHasLeaf(node) {
    var kids = node.children || [];
    for (var i = 0; i < kids.length; i++) if (filter.contentTag.indexOf(kids[i].value) >= 0) return true;
    return false;
  }
  function categoryIsActive(node) { return categoryIsWhole(node) || categoryHasLeaf(node); }
  var toggleCategoryWhole = m.useCallback(function (node) {
    setFilter(function (prev) {
      var cur = (prev.contentTag || []).slice();
      var wi = cur.indexOf("全部");
      if (wi >= 0) cur = cur.slice(0, wi).concat(cur.slice(wi + 1));
      var i = cur.indexOf(node.value);
      if (i >= 0) {
        cur = cur.slice(0, i).concat(cur.slice(i + 1));
      } else {
        var kidVals = (node.children || []).map(function (c) { return c.value; });
        cur = cur.filter(function (v) { return kidVals.indexOf(v) < 0; });
        cur.push(node.value);
      }
      var patch = {};
      patch.contentTag = cur;
      return Object.assign({}, prev, patch);
    });
  }, []);
  var toggleCategoryLeaf = m.useCallback(function (node, leaf) {
    setFilter(function (prev) {
      var cur = (prev.contentTag || []).slice();
      if (cur.indexOf(node.value) >= 0) return prev;
      var leafValue = typeof leaf === "string" ? leaf : (leaf && leaf.value);
      if (leafValue === undefined || leafValue === null) return prev;
      var wi = cur.indexOf("全部");
      if (wi >= 0) cur = cur.slice(0, wi).concat(cur.slice(wi + 1));
      var j = cur.indexOf(leafValue);
      var patch = {};
      patch.contentTag = j >= 0 ? cur.slice(0, j).concat(cur.slice(j + 1)) : cur.concat([leafValue]);
      return Object.assign({}, prev, patch);
    });
  }, []);
  var toggleCategoryAll = m.useCallback(function () {
    setFilter(function (prev) {
      var patch = {};
      patch.contentTag = (prev.contentTag || []).indexOf("全部") >= 0 ? [] : ["全部"];
      return Object.assign({}, prev, patch);
    });
  }, []);
  var openPop = function (id, e) {
    setPop({ id: id, anchor: e && e.currentTarget ? e.currentTarget : null });
  };
  var closePop = function () {
    setPop({ id: null, anchor: null });
  };

  /* 顶部搜索、Enter 与底部全局确定复用唯一正式查询入口。 */
  var applyAndSearch = function () {
    setKeywordHint(false);
    setSearchNotice(null);
    return searchCoordinator.applyAndSearch().then(function (res) {
      if (res && res.ok) setBatchError(null);
      return res;
    });
  };

  var loadTask = function (tid) {
    var bridge = window.bridge && window.bridge.pgyKol;
    if (!bridge || !bridge.batchGet || !tid) return;
    setTaskLoading(true);
    bridge.batchGet({ taskId: tid }).then(function (res) {
      setTaskLoading(false);
      if (res && res.ok) {
        setCurrentTask(res.data);
        setBatchError(null);
      } else {
        setBatchError(res && res.error || { code: "unknown", message: "任务详情加载失败" });
      }
    }).catch(function (e) {
      setTaskLoading(false);
      setBatchError({ code: e && e.code || "unknown", message: e && e.message || String(e) });
    });
  };
  var refreshTaskList = function () {
    var bridge = window.bridge && window.bridge.pgyKol;
    if (!bridge || !bridge.batchList) return;
    bridge.batchList().then(function (res) {
      if (res && res.ok && Array.isArray(res.data)) {
        setTaskList(res.data);
        setTaskListError(null);
      } else {
        setTaskListError(res && res.error || { code: "unknown", message: "任务历史加载失败" });
      }
    }).catch(function (e) {
      setTaskListError({ code: e && e.code || "unknown", message: e && e.message || String(e) });
    });
  };
  var startBatch = function () {
    if (batchBusy) return;
    var exportColumns = pgyKolExportColumnIds(columnList, selectedColumns);
    if (exportColumns.length === 0) {
      setBatchError({ code: "invalid-input", message: "请至少选择一个可导出的展示字段" });
      return;
    }
    if (!coordinatorView.appliedFilter || coordinatorView.isDirty) {
      setBatchError({ code: "filter-not-applied", message: "请先确定筛选并查询" });
      return;
    }
    setCollectColumns(exportColumns);
    setCollectOpen(true);
  };
  var startBatchWithColumns = function (ids) {
    if (batchBusy || !ids || !ids.length) return;
    setBatchBusy(true);
    setBatchError(null);
    searchCoordinator.startBatch(ids).then(function (res) {
      setBatchBusy(false);
      if (res && res.ok) {
        var tid = res.data && res.data.taskId;
        if (tid) {
          setCurrentTaskId(tid);
          loadTask(tid);
        }
        refreshTaskList();
      } else {
        setBatchError(res && res.error || { code: "unknown", message: "采集启动失败" });
      }
    }).catch(function (e) {
      setBatchBusy(false);
      setBatchError({ code: e && e.code || "unknown", message: e && e.message || String(e) });
    });
  };
  var pauseBatch = function () {
    var bridge = window.bridge && window.bridge.pgyKol, tid = currentTaskId;
    if (!bridge || !tid) return;
    setBatchBusy(true);
    setBatchError(null);
    bridge.batchPause({ taskId: tid }).then(function (res) {
      setBatchBusy(false);
      if (res && res.ok) {
        loadTask(tid);
        refreshTaskList();
      } else {
        setBatchError(res && res.error || { code: "unknown", message: "任务操作失败" });
      }
    }).catch(function (e) {
      setBatchBusy(false);
      setBatchError({ code: e && e.code || "unknown", message: e && e.message || String(e) });
    });
  };
  var resumeBatch = function (budgets) {
    var bridge = window.bridge && window.bridge.pgyKol, tid = currentTaskId;
    if (!bridge || !tid) return;
    setBatchBusy(true);
    setBatchError(null);
    bridge.batchResume(budgets ? { taskId: tid, budgets: budgets } : { taskId: tid }).then(function (res) {
      setBatchBusy(false);
      if (res && res.ok) {
        loadTask(tid);
        refreshTaskList();
      } else {
        setBatchError(res && res.error || { code: "unknown", message: "任务操作失败" });
      }
    }).catch(function (e) {
      setBatchBusy(false);
      setBatchError({ code: e && e.code || "unknown", message: e && e.message || String(e) });
    });
  };
  var cancelBatch = function () {
    var bridge = window.bridge && window.bridge.pgyKol, tid = currentTaskId;
    if (!bridge || !tid) return;
    setBatchBusy(true);
    setBatchError(null);
    bridge.batchCancel({ taskId: tid }).then(function (res) {
      setBatchBusy(false);
      if (res && res.ok) {
        loadTask(tid);
        refreshTaskList();
      } else {
        setBatchError(res && res.error || { code: "unknown", message: "任务操作失败" });
      }
    }).catch(function (e) {
      setBatchBusy(false);
      setBatchError({ code: e && e.code || "unknown", message: e && e.message || String(e) });
    });
  };
  var exportTask = function (tid) {
    var bridge = window.bridge && window.bridge.pgyKol;
    if (!bridge || !bridge.batchExport || !tid) return;
    setBatchBusy(true);
    setBatchError(null);
    setBatchNotice(null);
    bridge.batchExport({ taskId: tid }).then(function (res) {
      setBatchBusy(false);
      if (res && res.ok) {
        setBatchNotice("导出已提交：" + tid + "（完整数据以导出文件为准）");
      } else {
        setBatchError(res && res.error || { code: "unknown", message: "导出失败" });
      }
    }).catch(function (e) {
      setBatchBusy(false);
      setBatchError({ code: e && e.code || "unknown", message: e && e.message || String(e) });
    });
  };
  var selectTask = function (tid) {
    setCurrentTaskId(tid);
    loadTask(tid);
  };
  var applyBrands = function (ids) {
    if (brandPopupMode === "recent") {
      update({ tradeReportBrandIdSet: ids, audienceGroup: null });
    } else {
      update({ brands: ids, audienceGroup: null });
    }
  };
  var clearAll = function () {
    setFilter(pgyKolDefaultFilter());
    pgyKolClearJson("magiorix-pgy-kol-filters");
    setRestoredNotice(false);
    setShowAllCategory(false);
    setKeywordHint(false);
  };
  var openNoteCategory = function (ind, e) {
    setCatIndustry(ind);
    setNoteAnchor(e && e.currentTarget ? e.currentTarget : null);
    setCategoryOpen(true);
  };
  var applyLocation = function (node) {
    update({ location: node });
  };
  var clearLocation = function () {
    update({ location: null });
  };
  var applyFansLocation = function (node) {
    update({ fansLocation: node });
  };
  var clearFansLocation = function () {
    update({ fansLocation: null });
  };
  var setFansNumber = function (lo, hi) {
    update({ fansNumberLower: lo, fansNumberUpper: hi });
  };
  var toggleActivity = function (n) {
    var v = pgyKolOptValue(n);
    setFilter(function (prev) {
      var cur = prev.activityCodes || [], i = cur.indexOf(v), next = i >= 0 ? cur.slice(0, i).concat(cur.slice(i + 1)) : cur.concat([v]);
      var patch = {};
      patch.activityCodes = next;
      return Object.assign({}, prev, patch);
    });
  };
  var togglePreset = function (n) {
    if (pgyKolPresetActive(n, filter)) {
      setFansNumber("", "");
    } else {
      setFansNumber(n.lower, n.upper);
    }
  };
  var oneClickExclude = function () {
    update({ excludeLowActive: true, fansNumUp: true, excludedTradeReportBrand: !!hasBrands, excludedTradeInviteReportBrand: !!hasBrands });
  };

  if (!pgyKolDevEnabled()) {
    return o.jsx(x, { sx: { p: 4 }, children: o.jsx(oe, { severity: "warning", children: "功能未开启" }) });
  }

  var bridgeOk = !!(window.bridge && window.bridge.pgyKol);
  var areasCfg = configs.areas && configs.areas.nodes && configs.areas.nodes.length
    ? configs.areas
    : { source: "china-fallback", warning: configs.areas && configs.areas.error ? "地域接口不可用，已使用内置省市数据" : null, nodes: pgyKolChinaAreasFallback() };
  var autoCfg = configs.automotive || null;
  var audCfg = configs.audience20 || null;
  var themeCfg = configs.contentTheme || null;
  var consumeCfg = configs.consumeBehavior || null;
  var audGroupCfg = configs.audienceGroup || null;
  var actCfg = configs.activities || null;
  var autoLeaves = [];
  var batchRunning = currentTask && currentTask.status === "running";
  var hasBrands = filter.brands && filter.brands.length > 0;
  var catOptions = showAllCategory ? pgyKolCategoryFull : pgyKolCategoryCommon;
  filter.automotive.forEach(function (n) { pgyKolFlattenLeaves(n, autoLeaves); });

  /* 已选条件摘要（含 Schema 驱动的【待实证】后缀）。 */
  var summary = [], unprovenKeys = pgyKolUnprovenSet();
  var hasUnprovenSel = Object.keys(filter).some(function (k) {
    var v = filter[k];
    if (!unprovenKeys[k] || v === undefined || v === null || v === "") return false;
    return !Array.isArray(v) || v.length > 0;
  });
  function sumAdd(key, label, onDelete) { summary.push({ key: key, label: label, onDelete: onDelete }); }
  if (filter.searchType === 0) sumAdd("searchType", "搜昵称", function () { update({ searchType: 1 }); });
  if (filter.keyword) sumAdd("keyword", "关键词：" + filter.keyword, function () { update({ keyword: "" }); });
  if (filter.marketTarget) sumAdd("marketTarget", "营销目标：" + filter.marketTarget, function () { update({ marketTarget: null }); });
  if (filter.audienceGroup) sumAdd("audienceGroup", "人群目标：" + filter.audienceGroup, function () { update({ audienceGroup: null }); });
  if (filter.brands && filter.brands.length) sumAdd("brands", "合作品牌 " + filter.brands.length + " 个", function () { update({ brands: [] }); });
  if (filter.contentTag && filter.contentTag.length) sumAdd("contentTag", "类目：" + filter.contentTag.join("、"), function () { update({ contentTag: [] }); });
  if (filter.personalTags && filter.personalTags.length) sumAdd("personalTags", "家庭身份 " + filter.personalTags.length + " 项", function () { update({ personalTags: [] }); });
  if (filter.featureTags && filter.featureTags.length) sumAdd("featureTags", "职业/特色 " + filter.featureTags.length + " 项", function () { update({ featureTags: [] }); });
  if (filter.coopCredit) sumAdd("coopCredit", "合作信用度：" + filter.coopCredit.label, function () { update({ coopCredit: null }); });
  if (filter.coopImpMedin) sumAdd("coopImpMedin", "传播-曝光：" + filter.coopImpMedin.label, function () { update({ coopImpMedin: null }); });
  if (filter.coopReadMid) sumAdd("coopReadMid", "传播-阅读：" + filter.coopReadMid.label, function () { update({ coopReadMid: null }); });
  if (filter.coopInterMid) sumAdd("coopInterMid", "传播-互动：" + filter.coopInterMid.label, function () { update({ coopInterMid: null }); });
  if (filter.coopOverflowMid) sumAdd("coopOverflowMid", "传播-外溢中位：" + filter.coopOverflowMid.label, function () { update({ coopOverflowMid: null }); });
  if (filter.estimatePicReadCost) sumAdd("estimatePicReadCost", "图文阅读单价：" + filter.estimatePicReadCost.label, function () { update({ estimatePicReadCost: null }); });
  if (filter.estimateVideoReadCost) sumAdd("estimateVideoReadCost", "视频阅读单价：" + filter.estimateVideoReadCost.label, function () { update({ estimateVideoReadCost: null }); });
  if (filter.estimatePicEngageCost) sumAdd("estimatePicEngageCost", "图文互动单价：" + filter.estimatePicEngageCost.label, function () { update({ estimatePicEngageCost: null }); });
  if (filter.estimateVideoEngageCost) sumAdd("estimateVideoEngageCost", "视频互动单价：" + filter.estimateVideoEngageCost.label, function () { update({ estimateVideoEngageCost: null }); });
  if (filter.estimatePictureCpm) sumAdd("estimatePictureCpm", "图文CPM：" + filter.estimatePictureCpm.label, function () { update({ estimatePictureCpm: null }); });
  if (filter.estimateVideoCpm) sumAdd("estimateVideoCpm", "视频CPM：" + filter.estimateVideoCpm.label, function () { update({ estimateVideoCpm: null }); });
  if (filter.overflowCost) sumAdd("overflowCost", "外溢进店单价：" + filter.overflowCost.label, function () { update({ overflowCost: null }); });
  if (filter.liveCount30d && filter.liveCount30d.length) sumAdd("liveCount30d", "直播场次 " + filter.liveCount30d.length + " 项", function () { update({ liveCount30d: [] }); });
  if (filter.avgLiveViewer && filter.avgLiveViewer.length) sumAdd("avgLiveViewer", "观播人数 " + filter.avgLiveViewer.length + " 项", function () { update({ avgLiveViewer: [] }); });
  if (filter.avgLiveGmv && filter.avgLiveGmv.length) sumAdd("avgLiveGmv", "场均销售额 " + filter.avgLiveGmv.length + " 项", function () { update({ avgLiveGmv: [] }); });
  if (filter.noteCategory && filter.noteCategory.length) sumAdd("noteCategory", "笔记类目 " + filter.noteCategory.length + " 项", function () { update({ noteCategory: [] }); });
  if (filter.inStar === true) sumAdd("inStar", "精选博主：明星", function () { update({ inStar: false }); });
  if (filter.isHighQualityFlag === true) sumAdd("isHighQualityFlag", "精选博主：优质博主", function () { update({ isHighQualityFlag: false }); });
  if (filter.newHighQuality === true) sumAdd("newHighQuality", "精选博主：新锐博主", function () { update({ newHighQuality: false }); });
  if (filter.hasBuyerCoopAuthFlag === true) sumAdd("hasBuyerCoopAuthFlag", "精选博主：笔记+直播均可合作", function () { update({ hasBuyerCoopAuthFlag: false }); });
  if (filter.filterIntention === true) sumAdd("filterIntention", "精选博主：意向行业匹配", function () { update({ filterIntention: false }); });
  if (filter.firstIndustry) sumAdd("firstIndustry", "行业推荐：" + filter.firstIndustry + (filter.secondIndustry ? "-" + filter.secondIndustry : ""), function () { update({ firstIndustry: "", secondIndustry: "" }); });
  if (filter.gender) sumAdd("gender", "性别：" + filter.gender, function () { update({ gender: null }); });
  if (filter.location) sumAdd("location", "地域：" + pgyKolOptLabel(filter.location), function () { update({ location: null }); });
  if (filter.audience20 && filter.audience20.length) sumAdd("audience20", "二十大人群 " + filter.audience20.length + " 项", function () { update({ audience20: [] }); });
  if (filter.automotive && filter.automotive.length) sumAdd("automotive", "行业特色画像 " + filter.automotive.length + " 项", function () { update({ automotive: [] }); });
  if (filter.consumeBehavior && filter.consumeBehavior.length) sumAdd("consumeBehavior", "消费行为 " + filter.consumeBehavior.length + " 项", function () { update({ consumeBehavior: [] }); });
  if (filter.signed) sumAdd("signed", "签约：" + filter.signed, function () { update({ signed: null }); });
  if (filter.contentSceneLabel && filter.contentSceneLabel.length) sumAdd("contentSceneLabel", "擅长内容 " + filter.contentSceneLabel.length + " 项", function () { update({ contentSceneLabel: [] }); });
  if (filter.contentTheme && filter.contentTheme.length) sumAdd("contentTheme", "内容题材 " + filter.contentTheme.length + " 项", function () { update({ contentTheme: [] }); });
  if (filter.fansNumberLower !== "" || filter.fansNumberUpper !== "") sumAdd("fansNum", "粉丝量：" + (filter.fansNumberLower || "0") + "～" + (filter.fansNumberUpper || "不限"), function () { setFansNumber("", ""); });
  if (filter.fansAge) sumAdd("fansAge", "粉丝年龄：" + filter.fansAge, function () { update({ fansAge: null }); });
  if (filter.fansGender) sumAdd("fansGender", "粉丝性别：" + filter.fansGender, function () { update({ fansGender: null }); });
  if (filter.fansLocation) sumAdd("fansLocation", "粉丝地域：" + pgyKolOptLabel(filter.fansLocation), function () { update({ fansLocation: null }); });
  if (filter.fansMaritalStatus) sumAdd("fansMaritalStatus", "婚恋状态：" + filter.fansMaritalStatus, function () { update({ fansMaritalStatus: null }); });
  if (filter.fansConsumptionLevel) sumAdd("fansConsumptionLevel", "消费水平：" + filter.fansConsumptionLevel, function () { update({ fansConsumptionLevel: null }); });
  if (filter.fansChildAgeInfo && filter.fansChildAgeInfo.length) sumAdd("fansChildAgeInfo", "母婴阶段 " + filter.fansChildAgeInfo.length + " 项", function () { update({ fansChildAgeInfo: [] }); });
  if (filter.fansDevicePrice && filter.fansDevicePrice.length) sumAdd("fansDevicePrice", "手机价格 " + filter.fansDevicePrice.length + " 项", function () { update({ fansDevicePrice: [] }); });
  if (filter.fansDeviceBrand && filter.fansDeviceBrand.length) sumAdd("fansDeviceBrand", "手机品牌 " + filter.fansDeviceBrand.length + " 项", function () { update({ fansDeviceBrand: [] }); });
  if (filter.accumCommonImpMedinNum30d) sumAdd("impMed", "曝光中位数：" + filter.accumCommonImpMedinNum30d.label, function () { update({ accumCommonImpMedinNum30d: null }); });
  if (filter.readMidNor30) sumAdd("readMid", "阅读中位数：" + filter.readMidNor30.label, function () { update({ readMidNor30: null }); });
  if (filter.interMidNor30) sumAdd("interMid", "互动中位数：" + filter.interMidNor30.label, function () { update({ interMidNor30: null }); });
  if (filter.thousandLikePercent30) sumAdd("thousand", "千赞笔记比例：" + filter.thousandLikePercent30.label, function () { update({ thousandLikePercent30: null }); });
  if (filter.noteType) sumAdd("noteType", "笔记类型：" + pgyKolNoteTypeLabel(filter.noteType), function () { update({ noteType: null }); });
  if (filter.notePriceLower !== "" || filter.notePriceUpper !== "") sumAdd("notePrice", "图文报价：" + (filter.notePriceLower || "0") + "～" + (filter.notePriceUpper || "不限"), function () { update({ notePriceLower: "", notePriceUpper: "" }); });
  if (filter.videoPriceLower !== "" || filter.videoPriceUpper !== "") sumAdd("videoPrice", "视频报价：" + (filter.videoPriceLower || "0") + "～" + (filter.videoPriceUpper || "不限"), function () { update({ videoPriceLower: "", videoPriceUpper: "" }); });
  if (filter.progressOrderCnt) sumAdd("progressOrderCnt", "合作订单数：" + filter.progressOrderCnt.label, function () { update({ progressOrderCnt: null }); });
  if (filter.tradeType && filter.tradeType !== "不限") sumAdd("tradeType", "近期合作行业：" + filter.tradeType, function () { update({ tradeType: null }); });
  if (filter.tradeReportBrandIdSet && filter.tradeReportBrandIdSet.length) sumAdd("tradeBrand", "近期合作品牌 " + filter.tradeReportBrandIdSet.length + " 个", function () { update({ tradeReportBrandIdSet: [] }); });
  if (filter.activityCodes && filter.activityCodes.length) sumAdd("activityCodes", "热门活动 " + filter.activityCodes.length + " 项", function () { update({ activityCodes: [] }); });
  if (filter.excludeLowActive) sumAdd("excludeLowActive", "剔除低活博主", function () { update({ excludeLowActive: false }); });
  if (filter.fansNumUp) sumAdd("fansNumUp", "剔除掉粉博主", function () { update({ fansNumUp: false }); });
  if (filter.excludedTradeReportBrand) sumAdd("excludedTradeReportBrand", "剔除已合作博主", function () { update({ excludedTradeReportBrand: false }); });
  if (filter.excludedTradeInviteReportBrand) sumAdd("excludedTradeInviteReportBrand", "剔除已邀约博主", function () { update({ excludedTradeInviteReportBrand: false }); });


  var allExcludeOn = filter.excludeLowActive && filter.fansNumUp && (!hasBrands || (filter.excludedTradeReportBrand && filter.excludedTradeInviteReportBrand));
  var coopCount = (filter.coopImpMedin ? 1 : 0) + (filter.coopReadMid ? 1 : 0) + (filter.coopInterMid ? 1 : 0) + (filter.coopOverflowMid ? 1 : 0);
  var industryCount = filter.firstIndustry ? (filter.secondIndustry ? 2 : 1) : 0;
  var noteCats = configs.noteCategory && configs.noteCategory.nodes && configs.noteCategory.nodes.length ? configs.noteCategory.nodes : pgyKolNoteCatFallback();
  var actList = actCfg && actCfg.nodes && actCfg.nodes.length ? actCfg.nodes : actCfg && actCfg.options && actCfg.options.length ? actCfg.options : [];
  var exportableColumns = columnList ? columnList.filter(function (c) {
    if (pgyKolFixedColumnIds().indexOf(c.id) >= 0) return false;
    if (c.evidence === "unavailable") return false;
    if (c.responsePath && String(c.responsePath).indexOf("computed:") === 0) return false;
    return true;
  }) : [];
  var leavesOf = function (nodes) {
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.children && n.children.length) out = out.concat(leavesOf(n.children));
      else out.push(n);
    }
    return out;
  };
  var keysToNodes = function (list, keys) {
    return keys.map(function (k) { return pgyKolFindNode(list, k); }).filter(Boolean);
  };
  var selectedOptionKeys = function (list, nodes) {
    var allowed = {};
    leavesOf(list).forEach(function (node) { allowed[pgyKolNodeKey(node)] = true; });
    return (nodes || []).map(function (node) { return pgyKolNodeKey(node); }).filter(function (key) { return allowed[key]; });
  };
  var replaceOptionGroup = function (current, list, keys) {
    var own = {};
    leavesOf(list).forEach(function (node) { own[pgyKolNodeKey(node)] = true; });
    var merged = (current || []).filter(function (node) { return !own[pgyKolNodeKey(node)]; }).concat(keysToNodes(list, keys));
    var order = {};
    leavesOf(pgyKolCareerTree.nodes).concat(leavesOf(pgyKolFeatureTree.nodes)).forEach(function (node, index) { order[pgyKolNodeKey(node)] = index; });
    return merged.map(function (node, index) { return { node: node, index: index }; }).sort(function (a, b) {
      var ak = pgyKolNodeKey(a.node), bk = pgyKolNodeKey(b.node), ai = Object.prototype.hasOwnProperty.call(order, ak) ? order[ak] : 10000 + a.index, bi = Object.prototype.hasOwnProperty.call(order, bk) ? order[bk] : 10000 + b.index;
      return ai - bi;
    }).map(function (entry) { return entry.node; });
  };

  return o.jsx(x, {
    sx: { p: 2, bgcolor: "#f5f6f7", minHeight: "100vh" },
    children: o.jsxs(x, {
      sx: { width: "100%", maxWidth: "none", margin: "0 auto", bgcolor: "#fff", border: "1px solid #ebedf0", borderRadius: 1, p: 2 },
      children: [
        /* 页面头部 */
        o.jsxs(x, {
          sx: { display: "flex", alignItems: "center", gap: 1.5, mb: 1.5 },
          children: [
            o.jsx(x, {
              sx: { width: 28, height: 28, borderRadius: 0.5, background: "linear-gradient(135deg,#FF6C40,#FF3030)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 },
              children: o.jsx(B, { icon: "solar:magnifer-bold-duotone", width: 18, height: 18 }),
            }),
            o.jsx(w, { variant: "h4", fontWeight: "bold", children: "找博主" }),
            o.jsx(w, { sx: { fontSize: 13, color: "rgba(0,0,0,.45)", ml: 1 }, children: "蒲公英博主原生筛选。开发开关开启后显示菜单与路由，关闭时页面不可达。" }),
          ],
        }),
        !bridgeOk ? o.jsx(oe, { severity: "error", sx: { mb: 1.5 }, children: "当前环境不支持蒲公英找博主（bridge 缺失）" }) : null,
        restoredNotice ? o.jsx(oe, { severity: "info", sx: { mb: 1.5 }, onClose: function () { setRestoredNotice(false); }, children: "已恢复筛选，请点击确定后查询" }) : null,
        searchNotice ? o.jsx(oe, { severity: "info", sx: { mb: 1 }, onClose: function () { setSearchNotice(null); }, children: searchNotice }) : null,

        /* 顶部搜索区：搜笔记/搜昵称切换 + 关键词 + 搜索按钮 + 合作品牌 */
        o.jsxs(x, {
          sx: { display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 0.75 },
          children: [
            o.jsxs(x, {
              sx: { display: "inline-flex", alignItems: "center", gap: 0.25, p: 0.25, borderRadius: 0.5, bgcolor: "transparent" },
              children: [
                o.jsx($, { size: "small", variant: "text", sx: { borderRadius: 0.375, minHeight: 28, px: 1, bgcolor: filter.searchType === 1 ? "rgba(255,36,66,.08)" : "transparent", color: filter.searchType === 1 ? "#ff2442" : "rgba(0,0,0,.7)", minWidth: 64 }, onClick: function () { update({ searchType: 1 }); }, children: "搜笔记" }),
                o.jsx($, { size: "small", variant: "text", sx: { borderRadius: 0.375, minHeight: 28, px: 1, bgcolor: filter.searchType === 0 ? "rgba(255,36,66,.08)" : "transparent", color: filter.searchType === 0 ? "#ff2442" : "rgba(0,0,0,.7)", minWidth: 64 }, onClick: function () { update({ searchType: 0 }); }, children: "搜昵称" }),
              ],
            }),
            o.jsx(ae, {
              size: "small",
              value: filter.keyword,
              placeholder: filter.searchType === 1 ? "按笔记关键词找博主，试试搜" : "按博主昵称/小红书号找博主",
              onChange: function (e) { update({ keyword: e.target.value }); setKeywordHint(false); },
              onKeyDown: function (e) { if (e.key === "Enter") { if (e.preventDefault) e.preventDefault(); applyAndSearch(); } },
              sx: { minWidth: 320, maxWidth: 520, flexGrow: 1 },
            }),
            o.jsx($, {
              variant: "contained",
              size: "medium",
              onClick: applyAndSearch,
              sx: { bgcolor: "#ff2442", color: "#fff", minWidth: 72 },
              startIcon: status === "loading" ? o.jsx(de, { size: 18, color: "inherit" }) : o.jsx(B, { icon: "solar:magnifer-bold-duotone", width: 18, height: 18 }),
              children: status === "loading" ? "搜索中..." : "搜索",
            }),
            o.jsxs(x, {
              children: [
                o.jsx($, {
                  size: "small",
                  variant: hasBrands ? "contained" : "outlined",
                  color: hasBrands ? "primary" : "inherit",
                  onClick: function () { setBrandPopupMode("recommend"); },
                  children: "合作品牌智能推荐" + (hasBrands ? "（" + filter.brands.length + "）" : ""),
                }),
                !hasBrands ? o.jsx(w, { sx: { fontSize: 12, color: "rgba(0,0,0,.35)", display: "block", mt: 0.25 }, children: "请选择您的合作品牌" }) : null,
              ],
            }),
          ],
        }),

        /* 搜昵称：搜索历史 + 清空历史 */
        filter.searchType === 0 ? o.jsx(PgyKolHistoryPanel, {
          history: history,
          onPick: function (kw) { update({ keyword: kw }); },
          onClear: function () { pgyKolNickHistoryClear(); setHistory([]); },
        }) : null,
        keywordHint ? o.jsx(w, { sx: { fontSize: 13, color: "#ff2442", display: "block", mb: 0.5 }, children: "请输入搜索关键词后再搜索" }) : null,

        /* 未实证（人群目标）提示 */
        hasUnprovenSel ? o.jsx(oe, { severity: "info", sx: { mb: 1 }, children: "人群目标（按博主粉丝推荐）依赖合作品牌：当前账号未绑定品牌，官网禁用该筛选；无法实证前不参与查询与采集。" }) : null,

        /* 已选条件 + 收起筛选 + 一键清空 */
        o.jsxs(x, {
          sx: { display: "flex", alignItems: "center", gap: 1, mb: 1 },
          children: [
            o.jsx(w, { sx: { flexShrink: 0, fontSize: 14, fontWeight: 600, color: "rgba(0,0,0,.85)" }, children: "已选条件" }),
            o.jsx(x, {
              sx: { flexGrow: 1, display: "flex", alignItems: "center", gap: 0.5, overflowX: "auto", py: 0.25 },
              children: summary.length === 0
                ? o.jsx(w, { sx: { fontSize: 13, color: "rgba(0,0,0,.45)" }, children: "暂无筛选条件" })
                : summary.map(function (s) {
                    return o.jsx(f1, { key: s.key, size: "small", variant: "outlined", label: (pgyKolUnprovenSet()[s.key] ? "【待实证】" : "") + s.label, onDelete: s.onDelete });
                  }),
            }),
            o.jsx($, { size: "small", variant: "outlined", onClick: function () { setMatrixOpen(!matrixOpen); }, children: matrixOpen ? "收起筛选" : "展开筛选" }),
            o.jsx($, { size: "small", variant: "outlined", color: "error", onClick: clearAll, children: "一键清空" }),
          ],
        }),

        /* 官网矩阵：合作目标 / 匹配度 / 数据表现 / 平台推荐 / 常规剔除 */
        matrixOpen ? o.jsxs(x, {
          sx: { border: "1px solid #ebedf0", borderRadius: 1, mb: 1.5, overflow: "hidden" },
          children: [
            o.jsx(PgyKolMatrixSection, {
              title: "合作目标",
              children: o.jsxs(x, {
                children: [
                  o.jsx(PgyKolMatrixRow, {
                    label: "营销目标",
                    children: o.jsx(PgyKolInlineOptions, {
                      options: pgyKolMarketOptions,
                      keyOf: function (n) { return n.value; },
                      selected: filter.marketTarget ? [filter.marketTarget] : [],
                      onToggle: function (n) { update({ marketTarget: filter.marketTarget === n.value ? null : n.value }); },
                    }),
                  }),
                  o.jsx(PgyKolMatrixRow, {
                    label: "人群目标",
                    children: [
                      o.jsx(PgyKolTrigger, { label: "按博主粉丝推荐", selected: !!filter.audienceGroup, disabled: !hasBrands, onOpen: function (e) { openPop("audGroup", e); } }),
                      !hasBrands ? o.jsx(w, { sx: { fontSize: 12, color: "rgba(0,0,0,.35)" }, children: "未选择合作品牌时不可用" }) : null,
                    ],
                  }),
                ],
              }),
            }),
            o.jsx(PgyKolMatrixSection, {
              title: "匹配度",
              children: o.jsxs(x, {
                children: [
                  o.jsx(PgyKolMatrixRow, {
                    label: "博主类目",
                    children: [
                      o.jsx(PgyKolCategoryChips, {
                        options: catOptions.map(function (v) { return { value: v, label: v, children: pgyKolCategoryNodeKids(categoryNodes, v) }; }),
                        selected: filter.contentTag.slice(),
                        isActive: function (n) { return categoryIsActive(n); },
                        onToggleWhole: function (n) { toggleCategoryWhole(n); },
                        onToggleLeaf: function (n, leaf) { toggleCategoryLeaf(n, leaf); },
                        onToggleAll: toggleCategoryAll,
                      }),
                      o.jsx(w, { sx: { fontSize: 14, color: "rgba(0,0,0,.7)", cursor: "pointer", lineHeight: "28px", userSelect: "none", whiteSpace: "nowrap" }, onClick: function () { setShowAllCategory(!showAllCategory); }, children: showAllCategory ? "收起" : "展开" }),
                    ],
                  }),
                  o.jsx(PgyKolMatrixRow, {
                    label: "博主人设",
                    children: [
                      o.jsx(PgyKolTrigger, { label: "家庭身份", count: filter.personalTags.length, onOpen: function (e) { openPop("family", e); } }),
                      o.jsx(PgyKolTrigger, { label: "职业身份", count: selectedOptionKeys(pgyKolCareerTree.nodes, filter.featureTags).length, onOpen: function (e) { openPop("career", e); } }),
                      o.jsx(PgyKolTrigger, { label: "特色背景", count: selectedOptionKeys(pgyKolFeatureTree.nodes, filter.featureTags).length, onOpen: function (e) { openPop("feature", e); } }),
                    ],
                  }),
                  o.jsx(PgyKolMatrixRow, {
                    label: "博主画像",
                    children: [
                      o.jsx(PgyKolTrigger, { label: "性别", count: filter.gender ? 1 : 0, onOpen: function (e) { openPop("gender", e); } }),
                      o.jsx(PgyKolTrigger, { label: "地域", count: filter.location ? 1 : 0, onOpen: function (e) { openPop("location", e); } }),
                      o.jsx(PgyKolTrigger, { label: "二十大人群", badge: "新", count: filter.audience20.length, onOpen: function (e) { openPop("audience20", e); } }),
                      o.jsx(PgyKolTrigger, { label: "行业特色画像", badge: "新", count: filter.automotive.length, onOpen: function (e) { openPop("automotive", e); } }),
                      o.jsx(PgyKolTrigger, { label: "预估消费行为", badge: "新", count: filter.consumeBehavior.length, onOpen: function (e) { openPop("consume", e); } }),
                      o.jsx(PgyKolTrigger, { label: "签约情况", count: filter.signed ? 1 : 0, onOpen: function (e) { openPop("signed", e); } }),
                      o.jsx(PgyKolTrigger, { label: "擅长内容", count: filter.contentSceneLabel.length, onOpen: function (e) { openPop("scene", e); } }),
                      o.jsx(PgyKolTrigger, { label: "内容题材", badge: "新", count: filter.contentTheme.length, onOpen: function (e) { openPop("theme", e); } }),
                    ],
                  }),
                  o.jsx(PgyKolMatrixRow, {
                    label: "粉丝画像",
                    children: [
                      o.jsx(PgyKolTrigger, { label: "粉丝量", count: filter.fansNumberLower !== "" || filter.fansNumberUpper !== "" ? 1 : 0, onOpen: function (e) { openPop("fansNum", e); } }),
                      o.jsx(PgyKolTrigger, { label: "粉丝年龄", count: filter.fansAge ? 1 : 0, onOpen: function (e) { openPop("fansAge", e); } }),
                      o.jsx(PgyKolTrigger, { label: "粉丝性别", count: filter.fansGender ? 1 : 0, onOpen: function (e) { openPop("fansGender", e); } }),
                      o.jsx(PgyKolTrigger, { label: "粉丝地域", count: filter.fansLocation ? 1 : 0, onOpen: function (e) { openPop("fansLocation", e); } }),
                      o.jsx(PgyKolTrigger, { label: "婚恋状态", count: filter.fansMaritalStatus ? 1 : 0, onOpen: function (e) { openPop("marital", e); } }),
                      o.jsx(PgyKolTrigger, { label: "消费水平", count: filter.fansConsumptionLevel ? 1 : 0, onOpen: function (e) { openPop("consumption", e); } }),
                      o.jsx(PgyKolTrigger, { label: "母婴阶段", count: filter.fansChildAgeInfo.length, onOpen: function (e) { openPop("childAge", e); } }),
                      o.jsx(PgyKolTrigger, { label: "手机价格", count: filter.fansDevicePrice.length, onOpen: function (e) { openPop("devicePrice", e); } }),
                      o.jsx(PgyKolTrigger, { label: "手机品牌", count: filter.fansDeviceBrand.length, onOpen: function (e) { openPop("deviceBrand", e); } }),
                    ],
                  }),
                  o.jsx(PgyKolMatrixRow, {
                    label: "笔记类目",
                    children: [
                      noteCats.map(function (ind) {
                        var lab = String(ind.label || ind.value || "");
                        var hasKids = !!(ind.children && ind.children.length);
                        return o.jsx(PgyKolTrigger, { key: pgyKolNodeKey(ind), label: lab, arrow: false, badge: hasKids ? "新" : null, dim: !hasKids, onOpen: function (e) { openNoteCategory(lab, e); } });
                      }),
                      o.jsx(w, { sx: { fontSize: 12, color: "rgba(0,0,0,.45)" }, children: "已选 " + filter.noteCategory.length + " 项" }),
                    ],
                  }),
                ],
              }),
            }),
            o.jsx(PgyKolMatrixSection, {
              title: "数据表现",
              children: o.jsxs(x, {
                children: [
                  o.jsx(PgyKolMatrixRow, {
                    label: "日常笔记",
                    children: [
                      o.jsx(PgyKolTrigger, { label: "曝光中位数", help: true, arrowUp: pop && pop.id === "impMed", count: filter.accumCommonImpMedinNum30d ? 1 : 0, onOpen: function (e) { openPop("impMed", e); } }),
                      o.jsx(PgyKolTrigger, { label: "阅读中位数", help: true, arrowUp: pop && pop.id === "readMid", count: filter.readMidNor30 ? 1 : 0, onOpen: function (e) { openPop("readMid", e); } }),
                      o.jsx(PgyKolTrigger, { label: "互动中位数", help: true, arrowUp: pop && pop.id === "interMid", count: filter.interMidNor30 ? 1 : 0, onOpen: function (e) { openPop("interMid", e); } }),
                      o.jsx(PgyKolTrigger, { label: "千赞笔记比例", help: true, arrowUp: pop && pop.id === "thousand", count: filter.thousandLikePercent30 ? 1 : 0, onOpen: function (e) { openPop("thousand", e); } }),
                      o.jsx(PgyKolTrigger, { label: "笔记类型", arrowUp: pop && pop.id === "noteType", count: filter.noteType ? 1 : 0, onOpen: function (e) { openPop("noteType", e); } }),
                    ],
                  }),
                  o.jsx(PgyKolMatrixRow, {
                    label: "合作笔记",
                    children: [
                      o.jsx(w, { sx: { width: 80, flexShrink: 0, fontSize: 13, color: "rgba(0,0,0,.35)", textAlign: "right", mr: 0.5 }, children: "合作表现" }),
                      o.jsx(PgyKolTrigger, { label: "合作报价", arrowUp: pop && pop.id === "coopQuote", count: (filter.notePriceLower !== "" || filter.notePriceUpper !== "" ? 1 : 0) + (filter.videoPriceLower !== "" || filter.videoPriceUpper !== "" ? 1 : 0), onOpen: function (e) { openPop("coopQuote", e); } }),
                      o.jsx(PgyKolTrigger, { label: "合作信用度", arrowUp: pop && pop.id === "coopCredit", count: filter.coopCredit ? 1 : 0, onOpen: function (e) { openPop("coopCredit", e); } }),
                      o.jsx(PgyKolTrigger, { label: "合作订单数", help: true, arrowUp: pop && pop.id === "coopOrder", count: filter.progressOrderCnt ? 1 : 0, onOpen: function (e) { openPop("coopOrder", e); } }),
                      o.jsx(PgyKolTrigger, { label: "近期合作行业", arrowUp: pop && pop.id === "recentIndustry", count: filter.tradeType && filter.tradeType !== "不限" ? 1 : 0, onOpen: function (e) { openPop("recentIndustry", e); } }),
                      o.jsx(PgyKolTrigger, { label: "近期合作品牌", help: true, arrowUp: pop && pop.id === "recentBrand", count: filter.tradeReportBrandIdSet.length, onOpen: function (e) { openPop("recentBrand", e); } }),
                    ],
                  }),
                  o.jsx(PgyKolMatrixRow, {
                    label: "数据表现",
                    children: [
                      o.jsx(PgyKolTrigger, { label: "传播规模", arrowUp: pop && pop.id === "spread", count: coopCount, onOpen: function (e) { openPop("spread", e); } }),
                      o.jsx(PgyKolTrigger, { label: "预估CPM", arrowUp: pop && pop.id === "cpm", count: (filter.estimatePictureCpm ? 1 : 0) + (filter.estimateVideoCpm ? 1 : 0), onOpen: function (e) { openPop("cpm", e); } }),
                      o.jsx(PgyKolTrigger, { label: "预估阅读单价", arrowUp: pop && pop.id === "readPrice", count: (filter.estimatePicReadCost ? 1 : 0) + (filter.estimateVideoReadCost ? 1 : 0), onOpen: function (e) { openPop("readPrice", e); } }),
                      o.jsx(PgyKolTrigger, { label: "预估互动单价", arrowUp: pop && pop.id === "engagePrice", count: (filter.estimatePicEngageCost ? 1 : 0) + (filter.estimateVideoEngageCost ? 1 : 0), onOpen: function (e) { openPop("engagePrice", e); } }),
                      o.jsx(PgyKolTrigger, { label: "外溢进店单价", help: true, arrowUp: pop && pop.id === "overflow", count: filter.overflowCost ? 1 : 0, onOpen: function (e) { openPop("overflow", e); } }),
                    ],
                  }),
                  o.jsx(PgyKolMatrixRow, {
                    label: "直播数据",
                    children: [
                      o.jsx(PgyKolTrigger, { label: "近30天直播场次", arrowUp: pop && pop.id === "liveCount", count: filter.liveCount30d.length, onOpen: function (e) { openPop("liveCount", e); } }),
                      o.jsx(PgyKolTrigger, { label: "场均观播人数", arrowUp: pop && pop.id === "liveViewer", count: filter.avgLiveViewer.length, onOpen: function (e) { openPop("liveViewer", e); } }),
                      o.jsx(PgyKolTrigger, { label: "场均销售额", arrowUp: pop && pop.id === "liveGmv", count: filter.avgLiveGmv.length, onOpen: function (e) { openPop("liveGmv", e); } }),
                    ],
                  }),
                ],
              }),
            }),
            o.jsx(PgyKolMatrixSection, {
              title: "平台推荐",
              children: o.jsxs(x, {
                children: [
                  o.jsx(PgyKolMatrixRow, {
                    label: "精选博主",
                    children: [
                      pgyKolFeaturedOptions.map(function (n) {
                        return o.jsx(PgyKolCheck, { key: n.key, label: n.value, checked: filter[n.key] === true, onToggle: function () { toggleBool(n.key); } });
                      }),
                      o.jsx(PgyKolCheck, { label: "行业推荐博主", checked: !!filter.firstIndustry, onToggle: function () { setIndustryPopupOpen(true); } }),
                    ],
                  }),
                  o.jsx(PgyKolMatrixRow, {
                    label: "热门活动",
                    children: [
                      actCfg && actCfg.error ? o.jsx(oe, { severity: "warning", sx: { py: 0.25, my: 0 }, children: "热门活动加载失败，不影响其它筛选：" + (actCfg.error.message || "未知错误") }) : null,
                      actList.map(function (n) {
                        var v = pgyKolOptValue(n), sel = filter.activityCodes.indexOf(v) >= 0, lab = pgyKolActivityLabel(n);
                        return o.jsx(PgyKolCheck, { key: String(v), label: (lab ? lab + " " : "") + pgyKolOptLabel(n), checked: sel, onToggle: function () { toggleActivity(n); } });
                      }),
                    ],
                  }),
                ],
              }),
            }),
            o.jsx(PgyKolMatrixSection, {
              title: "常规剔除",
              children: o.jsxs(x, {
                sx: { display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", minHeight: 36 },
                children: [
                  o.jsx(w, { sx: { fontSize: 14, color: allExcludeOn ? "#ff2442" : "rgba(0,0,0,.7)", cursor: "pointer", lineHeight: "28px", userSelect: "none" }, onClick: oneClickExclude, children: "一键剔除" }),
                  o.jsx(PgyKolCheck, { label: "剔除低活博主", checked: filter.excludeLowActive, onToggle: function () { toggleBool("excludeLowActive"); } }),
                  o.jsx(PgyKolCheck, { label: "剔除掉粉博主", checked: filter.fansNumUp, onToggle: function () { toggleBool("fansNumUp"); } }),
                  o.jsx(PgyKolCheck, { label: "剔除已合作博主", checked: filter.excludedTradeReportBrand, disabled: !hasBrands, onToggle: function () { toggleBool("excludedTradeReportBrand"); } }),
                  o.jsx(PgyKolCheck, { label: "剔除已邀约博主", checked: filter.excludedTradeInviteReportBrand, disabled: !hasBrands, onToggle: function () { toggleBool("excludedTradeInviteReportBrand"); } }),
                ],
              }),
            }),
          ],
        }) : null,

        /* 全局确定操作栏：此前所有控件只编辑草稿，到这里才正式搜索。 */
        o.jsxs(x, {
          sx: { display: "flex", alignItems: "center", gap: 1, justifyContent: "flex-end", borderTop: "1px solid #ebedf0", pt: 1.25, mb: 1.5, flexWrap: "wrap" },
          children: [
            o.jsx(w, { sx: { fontSize: 13, color: coordinatorView.isDirty ? "#ff2442" : "rgba(0,0,0,.45)", mr: "auto" }, children: coordinatorView.appliedFilter ? coordinatorView.isDirty ? "筛选已修改，点击确定后更新结果" : "当前筛选已确定" : "请点击确定筛选后查询" }),
            o.jsx($, { size: "small", variant: "outlined", onClick: function () { setMatrixOpen(!matrixOpen); }, children: matrixOpen ? "收起筛选" : "展开筛选" }),
            o.jsx($, { variant: "contained", size: "medium", onClick: applyAndSearch, sx: { bgcolor: "#ff2442", color: "#fff", minWidth: 112 }, startIcon: status === "loading" ? o.jsx(de, { size: 18, color: "inherit" }) : null, children: status === "loading" ? "查询中..." : "确定筛选" }),
          ],
        }),

        status === "loading" ? o.jsx(Q1, { sx: { mt: 1 } }) : null,
        status === "auth-expired" ? o.jsx(oe, { severity: "error", sx: { mt: 1 }, children: "蒲公英登录已失效，请重新授权" }) : null,
        status === "error" && error ? o.jsx(oe, { severity: "error", sx: { mt: 1 }, children: "查询失败（错误码 " + (error.code || "unknown") + "）：" + (error.message || "未知错误") }) : null,

        /* 结果区 */
        result ? o.jsxs(x, {
          sx: { mt: 2 },
          children: [
            coordinatorView.isDirty ? o.jsx(oe, { severity: "warning", sx: { mb: 1 }, children: "筛选条件已修改，当前结果仍基于上一次确定的条件。" }) : null,
            o.jsxs(x, {
              sx: { display: "flex", alignItems: "center", gap: 1, mb: 1, flexWrap: "wrap" },
              children: [
                o.jsx(w, { variant: "h6", children: "共 " + (result.total != null ? result.total : "?") + " 位博主" }),
                o.jsx(f1, { size: "small", label: "当前展示 " + (result.kols ? result.kols.length : 0) + " 条" }),
                o.jsx(f1, { size: "small", variant: "outlined", label: "预览 " + (result.kols ? result.kols.length : 0) + " 条 / 已持久化 " + pgyKolCount(currentTask, "raw") + " 条（完整数据以导出为准）" }),
                result.capSignal && result.capSignal.capped ? o.jsx(f1, { size: "small", color: "warning", label: "结果可能超过 5000" }) : null,
                result.quarantinedFields && result.quarantinedFields.length > 0 ? o.jsx(f1, { size: "small", variant: "outlined", label: "未知字段 " + result.quarantinedFields.length + " 个已隔离" }) : null,
              ],
            }),
            result.capSignal && result.capSignal.capped ? o.jsx(oe, { severity: "warning", sx: { mb: 1 }, children: "结果可能超过 5000，完整性未证明" }) : null,
            o.jsx(PgyKolResultTable, { result: result, columns: selectedColumns, list: columnList }),
          ],
        }) : null,

        /* 批量采集与任务历史属于结果工具：放在官网结果工具栏和表格之后。 */
        o.jsxs(x, {
          sx: { display: "flex", alignItems: "center", gap: 1.5, mt: result ? 2 : 1, mb: 1, flexWrap: "wrap" },
          children: [
            o.jsx($, { variant: "outlined", size: "medium", onClick: function () { setColumnOpen(true); }, children: "选择展示指标" }),
            o.jsx($, { variant: "contained", color: "secondary", size: "medium", onClick: startBatch, disabled: batchBusy || batchRunning, startIcon: batchBusy ? o.jsx(de, { size: 18, color: "inherit" }) : null, children: batchBusy ? "启动中..." : "开始采集" }),
            status === "empty" ? o.jsx(w, { sx: { fontSize: 13, color: "rgba(0,0,0,.45)" }, children: "没有匹配的博主" }) : null,
          ],
        }),
        batchError ? o.jsx(oe, { severity: "error", sx: { mt: 1 }, children: pgyKolBatchErrorMessage(batchError) }) : null,
        batchNotice ? o.jsx(oe, { severity: "success", sx: { mt: 1 }, children: batchNotice }) : null,
        o.jsx(x, { ref: taskDetailRef, children: o.jsx(PgyKolBatchPanel, { task: currentTask, onPause: pauseBatch, onResume: resumeBatch, onResumeWithBudgets: function (budgets) { resumeBatch(budgets); }, onCancel: cancelBatch, onExport: function () { exportTask(currentTaskId); } }) }),
        taskLoading ? o.jsx(Q1, { sx: { mt: 1 } }) : null,
        o.jsx(PgyKolTaskHistory, { tasks: taskList, error: taskListError, onSelect: selectTask, onExport: exportTask }),

        /* 高级信息不占据官网主流程；默认折叠，仍保留原始 Payload 供排查。 */
        o.jsxs(xe, {
          variant: "outlined",
          sx: { mt: 2 },
          children: [
            o.jsxs(We, {
              sx: { pb: advancedOpen ? 1 : "12px!important", "&:last-child": { pb: advancedOpen ? 1 : "12px!important" } },
              children: [
                o.jsxs(x, {
                  component: "button",
                  type: "button",
                  onClick: function () { setAdvancedOpen(!advancedOpen); },
                  sx: { display: "flex", alignItems: "center", width: "100%", p: 0, border: 0, bgcolor: "transparent", cursor: "pointer", color: "rgba(0,0,0,.7)", textAlign: "left" },
                  children: [
                    o.jsx(w, { variant: "subtitle2", fontWeight: 600, children: "高级信息" }),
                    o.jsx(w, { sx: { ml: 0.75, fontSize: 12, color: "rgba(0,0,0,.45)" }, children: "待确认条件的本地 Payload 预览" }),
                    o.jsx(B, { icon: advancedOpen ? "solar:alt-arrow-up-bold-duotone" : "solar:alt-arrow-down-bold-duotone", width: 14, height: 14, style: { marginLeft: "auto", color: "rgba(0,0,0,.45)" } }),
                  ],
                }),
                advancedOpen ? o.jsxs(x, { children: [
                  o.jsx(w, { sx: { mt: 1, fontSize: 12, color: "rgba(0,0,0,.45)" }, children: "这是待确认条件的本地 Payload 预览，不会请求蒲公英接口。" }),
                  o.jsx(x, {
                    component: "pre",
                    sx: { mt: 0.5, mb: 0, maxHeight: 160, overflow: "auto", p: 1, bgcolor: "#fafafa", borderRadius: 0.5, fontSize: 11, fontFamily: "monospace", whiteSpace: "pre-wrap", wordBreak: "break-all" },
                    children: preview || "（未配置筛选条件）",
                  }),
                ] }) : null,
              ],
            }),
          ],
        }),

        /* 弹窗 */
        o.jsx(PgyKolColumnDialog, { open: columnOpen, onClose: function () { setColumnOpen(false); }, columns: columnList, error: columnError, selected: selectedColumns, onApply: function (ids) { setSelectedColumns(ids); pgyKolWriteJson("magiorix-pgy-kol-columns", ids); } }),
        o.jsx(PgyKolCollectDialog, { open: collectOpen, onClose: function () { setCollectOpen(false); }, columns: exportableColumns, selected: collectColumns, onApply: function (ids) { setCollectOpen(false); startBatchWithColumns(ids); } }),
        o.jsx(PgyKolBrandPopup, { open: brandPopupMode != null, onClose: function () { setBrandPopupMode(null); }, mode: brandPopupMode, current: brandPopupMode === "recent" ? filter.tradeReportBrandIdSet : filter.brands, onApply: applyBrands }),
        o.jsx(PgyKolNoteCategoryPopup, { open: categoryOpen, anchor: noteAnchor, onClose: function () { setCategoryOpen(false); }, nodes: noteCats, industry: catIndustry, onSelectIndustry: setCatIndustry, selected: filter.noteCategory, onToggle: function (next) { update({ noteCategory: next }); } }),
        o.jsx(PgyKolIndustryPopup, { open: industryPopupOpen, onClose: function () { setIndustryPopupOpen(false); }, cfg: configs.industry, first: filter.firstIndustry, second: filter.secondIndustry, onFirst: function (v) { update({ firstIndustry: v }); }, onSecond: function (v) { update({ secondIndustry: v }); } }),

        /* Popover：人群目标 */
        pop.id === "audGroup" ? o.jsx(PgyKolOptionPop, {
          open: true,
          anchor: pop.anchor,
          onClose: closePop,
          title: "人群目标",
          options: audGroupCfg && audGroupCfg.options && audGroupCfg.options.length ? audGroupCfg.options : audGroupCfg && audGroupCfg.nodes && audGroupCfg.nodes.length ? audGroupCfg.nodes : pgyKolAudienceFallback,
          keyOf: function (n) { return pgyKolOptValue(n); },
          selectedKeys: filter.audienceGroup ? [filter.audienceGroup] : [],
          closeOnSelect: true,
          onToggle: function (n) { toggleSingle("audienceGroup", pgyKolOptValue(n)); },
        }) : null,
        /* Popover：博主人设（官网为「组→子项」级联，leafOnly 选叶子） */
        pop.id === "family" ? o.jsx(PgyKolTreePop, {
          open: true, anchor: pop.anchor, onClose: closePop, title: "家庭身份", leafOnly: true,
          cfg: pgyKolFamilyTree, selectedKeys: filter.personalTags.map(function (n) { return pgyKolNodeKey(n); }),
          onApply: function (keys) { update({ personalTags: keysToNodes(pgyKolFamilyTree.nodes, keys) }); },
        }) : null,
        pop.id === "career" ? o.jsx(PgyKolTreePop, {
          open: true, anchor: pop.anchor, onClose: closePop, title: "职业身份", leafOnly: true,
          cfg: pgyKolCareerTree, selectedKeys: selectedOptionKeys(pgyKolCareerTree.nodes, filter.featureTags),
          onApply: function (keys) { update({ featureTags: replaceOptionGroup(filter.featureTags, pgyKolCareerTree.nodes, keys) }); },
        }) : null,
        pop.id === "feature" ? o.jsx(PgyKolTreePop, {
          open: true, anchor: pop.anchor, onClose: closePop, title: "特色背景", leafOnly: true,
          cfg: pgyKolFeatureTree, selectedKeys: selectedOptionKeys(pgyKolFeatureTree.nodes, filter.featureTags),
          onApply: function (keys) { update({ featureTags: replaceOptionGroup(filter.featureTags, pgyKolFeatureTree.nodes, keys) }); },
        }) : null,
        /* Popover：博主画像 */
        pop.id === "gender" ? o.jsx(PgyKolOptionPop, {
          open: true, anchor: pop.anchor, onClose: closePop, title: "性别",
          options: pgyKolGenderOptions, keyOf: function (n) { return n.value; }, selectedKeys: filter.gender ? [filter.gender] : [], closeOnSelect: true,
          onToggle: function (n) { toggleWithNone("gender", n.value); },
        }) : null,
        pop.id === "location" ? o.jsx(PgyKolCascadePop, {
          open: true, anchor: pop.anchor, onClose: closePop, title: "地域", cfg: areasCfg,
          onSelect: applyLocation, onClear: clearLocation,
        }) : null,
        pop.id === "audience20" ? o.jsx(PgyKolTreePop, {
          open: true, anchor: pop.anchor, onClose: closePop, title: "二十大人群", cfg: audCfg, leafOnly: true,
          selectedKeys: filter.audience20.map(function (n) { return pgyKolNodeKey(n); }),
          onApply: function (keys) { update({ audience20: keysToNodes(audCfg ? audCfg.nodes : [], keys) }); },
          display: function (n) { return n.fullPath || n.label || String(n.value); },
        }) : null,
        pop.id === "automotive" ? o.jsx(PgyKolTreePop, {
          open: true, anchor: pop.anchor, onClose: closePop, title: "行业特色画像", cfg: autoCfg,
          selectedKeys: filter.automotive.map(function (n) { return pgyKolNodeKey(n); }),
          onApply: function (keys) { update({ automotive: keysToNodes(autoCfg ? autoCfg.nodes : [], keys) }); },
          hint: filter.automotive.length > 0 ? "选中父节点时展开叶子 ID：" + autoLeaves.join("、") : null,
        }) : null,
        pop.id === "consume" ? o.jsx(PgyKolTreePop, {
          open: true, anchor: pop.anchor, onClose: closePop, title: "预估消费行为", cfg: consumeCfg,
          selectedKeys: filter.consumeBehavior.map(function (n) { return pgyKolNodeKey(n); }),
          onApply: function (keys) { update({ consumeBehavior: keysToNodes(consumeCfg ? consumeCfg.nodes : [], keys) }); },
        }) : null,
        pop.id === "signed" ? o.jsx(PgyKolOptionPop, {
          open: true, anchor: pop.anchor, onClose: closePop, title: "签约情况",
          options: pgyKolSignedOptions, keyOf: function (n) { return n.value; }, selectedKeys: filter.signed ? [filter.signed] : [], closeOnSelect: true,
          onToggle: function (n) { toggleWithNone("signed", n.value); },
        }) : null,
        pop.id === "scene" ? o.jsx(PgyKolTreePop, {
          open: true, anchor: pop.anchor, onClose: closePop, title: "擅长内容", leafOnly: true,
          cfg: pgyKolSceneTree, selectedKeys: filter.contentSceneLabel.map(function (n) { return pgyKolNodeKey(n); }),
          onApply: function (keys) { update({ contentSceneLabel: keysToNodes(pgyKolSceneTree.nodes, keys) }); },
        }) : null,
        pop.id === "theme" ? o.jsx(PgyKolTreePop, {
          open: true, anchor: pop.anchor, onClose: closePop, title: "内容题材", cfg: themeCfg,
          selectedKeys: filter.contentTheme.map(function (n) { return pgyKolNodeKey(n); }),
          onApply: function (keys) { update({ contentTheme: keysToNodes(themeCfg ? themeCfg.nodes : [], keys) }); },
        }) : null,
        /* Popover：粉丝画像 */
        pop.id === "fansNum" ? o.jsx(PgyKolFansNumPop, {
          open: true, anchor: pop.anchor, onClose: closePop,
          lower: filter.fansNumberLower, upper: filter.fansNumberUpper,
          onLower: function (v) { update({ fansNumberLower: v }); },
          onUpper: function (v) { update({ fansNumberUpper: v }); },
          onApply: setFansNumber,
        }) : null,
        pop.id === "fansAge" ? o.jsx(PgyKolOptionPop, {
          open: true, anchor: pop.anchor, onClose: closePop, title: "粉丝年龄",
          options: pgyKolFansAgeOptions, keyOf: function (n) { return n.value; }, selectedKeys: filter.fansAge ? [filter.fansAge] : [], closeOnSelect: true,
          onToggle: function (n) { toggleSingle("fansAge", n.value); },
        }) : null,
        pop.id === "fansGender" ? o.jsx(PgyKolOptionPop, {
          open: true, anchor: pop.anchor, onClose: closePop, title: "粉丝性别",
          options: pgyKolFansGenderOptions, keyOf: function (n) { return n.value; }, selectedKeys: filter.fansGender ? [filter.fansGender] : [], closeOnSelect: true,
          onToggle: function (n) { toggleWithNone("fansGender", n.value); },
        }) : null,
        pop.id === "fansLocation" ? o.jsx(PgyKolCascadePop, {
          open: true, anchor: pop.anchor, onClose: closePop, title: "粉丝地域", cfg: areasCfg,
          onSelect: applyFansLocation, onClear: clearFansLocation,
        }) : null,
        pop.id === "marital" ? o.jsx(PgyKolOptionPop, {
          open: true, anchor: pop.anchor, onClose: closePop, title: "婚恋状态",
          options: pgyKolMaritalOptions, keyOf: function (n) { return n.value; }, selectedKeys: filter.fansMaritalStatus ? [filter.fansMaritalStatus] : [], closeOnSelect: true,
          onToggle: function (n) { toggleWithNone("fansMaritalStatus", n.value); },
        }) : null,
        pop.id === "consumption" ? o.jsx(PgyKolOptionPop, {
          open: true, anchor: pop.anchor, onClose: closePop, title: "消费水平",
          options: pgyKolConsumptionOptions, keyOf: function (n) { return n.value; }, selectedKeys: filter.fansConsumptionLevel ? [filter.fansConsumptionLevel] : [], closeOnSelect: true,
          onToggle: function (n) { toggleWithNone("fansConsumptionLevel", n.value); },
        }) : null,
        pop.id === "childAge" ? o.jsx(PgyKolOptionPop, {
          open: true, anchor: pop.anchor, onClose: closePop, title: "母婴阶段", multi: true,
          options: pgyKolChildAgeOptions, selectedKeys: filter.fansChildAgeInfo.map(function (n) { return pgyKolNodeKey(n); }),
          onApply: function (keys) { update({ fansChildAgeInfo: keysToNodes(pgyKolChildAgeOptions, keys) }); },
        }) : null,
        pop.id === "devicePrice" ? o.jsx(PgyKolOptionPop, {
          open: true, anchor: pop.anchor, onClose: closePop, title: "手机价格", multi: true,
          options: pgyKolDevicePriceOptions, selectedKeys: filter.fansDevicePrice.map(function (n) { return pgyKolNodeKey(n); }),
          onApply: function (keys) { update({ fansDevicePrice: keysToNodes(pgyKolDevicePriceOptions, keys) }); },
        }) : null,
        pop.id === "deviceBrand" ? o.jsx(PgyKolOptionPop, {
          open: true, anchor: pop.anchor, onClose: closePop, title: "手机品牌", multi: true,
          options: pgyKolDeviceBrandOptions, selectedKeys: filter.fansDeviceBrand.map(function (n) { return pgyKolNodeKey(n); }),
          onApply: function (keys) { update({ fansDeviceBrand: keysToNodes(pgyKolDeviceBrandOptions, keys) }); },
        }) : null,
        /* Popover：日常笔记 */
        pop.id === "impMed" ? o.jsx(PgyKolOfficialRangePop, {
          open: true, anchor: pop.anchor, onClose: closePop,
          options: pgyKolRangeDefs.imp50w, value: filter.accumCommonImpMedinNum30d,
          minPlaceholder: "0", maxPlaceholder: "9,999,999",
          onApply: function (n) { update({ accumCommonImpMedinNum30d: n }); },
        }) : null,
        pop.id === "readMid" ? o.jsx(PgyKolOfficialRangePop, {
          open: true, anchor: pop.anchor, onClose: closePop,
          options: pgyKolRangeDefs.imp50w, value: filter.readMidNor30,
          minPlaceholder: "0", maxPlaceholder: "9,999,999",
          onApply: function (n) { update({ readMidNor30: n }); },
        }) : null,
        pop.id === "interMid" ? o.jsx(PgyKolOfficialRangePop, {
          open: true, anchor: pop.anchor, onClose: closePop,
          options: pgyKolRangeDefs.inter2000, value: filter.interMidNor30,
          minPlaceholder: "0", maxPlaceholder: "9,999,999",
          onApply: function (n) { update({ interMidNor30: n }); },
        }) : null,
        pop.id === "thousand" ? o.jsx(PgyKolOfficialRangePop, {
          open: true, anchor: pop.anchor, onClose: closePop,
          options: pgyKolRangeDefsPercent40, value: filter.thousandLikePercent30,
          minPlaceholder: "0", maxPlaceholder: "100", suffix: "%",
          onApply: function (n) { update({ thousandLikePercent30: n }); },
        }) : null,
        pop.id === "noteType" ? o.jsx(PgyKolOfficialSimpleMenu, {
          open: true, anchor: pop.anchor, onClose: closePop,
          options: pgyKolNoteTypeOptions, value: filter.noteType,
          onSelect: function (value) { update({ noteType: value }); },
        }) : null,
        /* Popover：合作笔记 */
        pop.id === "coopQuote" ? o.jsx(PgyKolOfficialGroupPop, {
          open: true, anchor: pop.anchor, onClose: closePop,
          groups: [
            { key: "pic", label: "图文笔记", options: pgyKolRangeDefs.quote, value: pgyKolOfficialBoundsNode(filter.notePriceLower, filter.notePriceUpper) },
            { key: "video", label: "视频笔记", options: pgyKolRangeDefs.quote, value: pgyKolOfficialBoundsNode(filter.videoPriceLower, filter.videoPriceUpper) },
          ],
          onApply: function (draft) {
            var pic = draft.pic, video = draft.video;
            update({
              notePriceLower: pic ? String(pic.value[0]) : "",
              notePriceUpper: pic && pic.value[1] >= 0 ? String(pic.value[1]) : "",
              videoPriceLower: video ? String(video.value[0]) : "",
              videoPriceUpper: video && video.value[1] >= 0 ? String(video.value[1]) : "",
            });
          },
        }) : null,
        pop.id === "coopCredit" ? o.jsx(PgyKolOfficialGroupPop, {
          open: true, anchor: pop.anchor, onClose: closePop,
          groups: [{ key: "invite", label: "邀约48h回复率", options: pgyKolRangeDefs.inviteReply, value: filter.coopCredit }],
          onApply: function (draft) { update({ coopCredit: draft.invite || null }); },
        }) : null,
        pop.id === "coopOrder" ? o.jsx(PgyKolOfficialRangePop, {
          open: true, anchor: pop.anchor, onClose: closePop,
          options: [],
          value: filter.progressOrderCnt,
          minPlaceholder: "0", maxPlaceholder: "99999",
          onApply: function (n) { update({ progressOrderCnt: n }); },
        }) : null,
        pop.id === "recentIndustry" ? o.jsx(PgyKolOfficialSimpleMenu, {
          open: true, anchor: pop.anchor, onClose: closePop,
          options: pgyKolRecentIndustryOptions, value: filter.tradeType || "不限",
          onSelect: function (value) { update({ tradeType: value === "不限" ? null : value }); },
        }) : null,
        pop.id === "recentBrand" ? o.jsx(PgyKolOfficialBrandPop, {
          open: true, anchor: pop.anchor, onClose: closePop,
          current: filter.tradeReportBrandIdSet,
          excluded: filter.excludedTradeReportBrandId === true,
          onApply: function (ids, excluded) { update({ tradeReportBrandIdSet: ids, excludedTradeReportBrandId: excluded }); },
        }) : null,
        /* Popover：数据表现 */
        pop.id === "spread" ? o.jsx(PgyKolOfficialGroupPop, {
          open: true, anchor: pop.anchor, onClose: closePop,
          groups: [
            { key: "imp", label: "曝光中位数", options: pgyKolRangeDefs.imp50w, value: filter.coopImpMedin },
            { key: "read", label: "阅读中位数", options: pgyKolRangeDefs.imp50w, value: filter.coopReadMid },
            { key: "inter", label: "互动中位数", options: pgyKolRangeDefs.inter2000, value: filter.coopInterMid },
            { key: "overflow", label: "外溢进店中位数", options: pgyKolRangeDefs.overflow10000, value: filter.coopOverflowMid },
          ],
          onApply: function (draft) { update({ coopImpMedin: draft.imp || null, coopReadMid: draft.read || null, coopInterMid: draft.inter || null, coopOverflowMid: draft.overflow || null }); },
        }) : null,
        pop.id === "cpm" ? o.jsx(PgyKolOfficialGroupPop, {
          open: true, anchor: pop.anchor, onClose: closePop,
          groups: [
            { key: "pic", label: "预估图文CPM", options: pgyKolRangeDefs.cpmPic, value: filter.estimatePictureCpm },
            { key: "video", label: "预估视频CPM", options: pgyKolRangeDefs.cpmVideo, value: filter.estimateVideoCpm },
          ],
          onApply: function (draft) { update({ estimatePictureCpm: draft.pic || null, estimateVideoCpm: draft.video || null }); },
        }) : null,
        pop.id === "readPrice" ? o.jsx(PgyKolOfficialGroupPop, {
          open: true, anchor: pop.anchor, onClose: closePop,
          groups: [
            { key: "pic", label: "图文笔记阅读单价", options: pgyKolRangeDefs.picRead, value: filter.estimatePicReadCost },
            { key: "video", label: "视频笔记阅读单价", options: pgyKolRangeDefs.videoRead, value: filter.estimateVideoReadCost },
          ],
          onApply: function (draft) { update({ estimatePicReadCost: draft.pic || null, estimateVideoReadCost: draft.video || null }); },
        }) : null,
        pop.id === "engagePrice" ? o.jsx(PgyKolOfficialGroupPop, {
          open: true, anchor: pop.anchor, onClose: closePop,
          groups: [
            { key: "pic", label: "预估图文互动单价", options: pgyKolRangeDefs.picEngage, value: filter.estimatePicEngageCost },
            { key: "video", label: "预估视频互动单价", options: pgyKolRangeDefs.videoEngage, value: filter.estimateVideoEngageCost },
          ],
          onApply: function (draft) { update({ estimatePicEngageCost: draft.pic || null, estimateVideoEngageCost: draft.video || null }); },
        }) : null,
        pop.id === "overflow" ? o.jsx(PgyKolOfficialRangePop, {
          open: true, anchor: pop.anchor, onClose: closePop,
          options: pgyKolRangeDefs.cpuv, value: filter.overflowCost,
          minPlaceholder: "0", maxPlaceholder: "9,999,999",
          onApply: function (n) { update({ overflowCost: n }); },
        }) : null,
        /* Popover：直播数据（多选） */
        pop.id === "liveCount" ? o.jsx(PgyKolOfficialMultiPop, {
          open: true, anchor: pop.anchor, onClose: closePop,
          options: pgyKolRangeDefs.liveCount, selectedKeys: filter.liveCount30d.map(function (n) { return pgyKolNodeKey(n); }),
          onApply: function (keys) { update({ liveCount30d: keysToNodes(pgyKolRangeDefs.liveCount, keys) }); },
        }) : null,
        pop.id === "liveViewer" ? o.jsx(PgyKolOfficialMultiPop, {
          open: true, anchor: pop.anchor, onClose: closePop,
          options: pgyKolRangeDefs.liveViewer, selectedKeys: filter.avgLiveViewer.map(function (n) { return pgyKolNodeKey(n); }),
          onApply: function (keys) { update({ avgLiveViewer: keysToNodes(pgyKolRangeDefs.liveViewer, keys) }); },
        }) : null,
        pop.id === "liveGmv" ? o.jsx(PgyKolOfficialMultiPop, {
          open: true, anchor: pop.anchor, onClose: closePop,
          options: pgyKolRangeDefs.liveGmv, selectedKeys: filter.avgLiveGmv.map(function (n) { return pgyKolNodeKey(n); }),
          onApply: function (keys) { update({ avgLiveGmv: keysToNodes(pgyKolRangeDefs.liveGmv, keys) }); },
        }) : null,
      ],
    }),
  });
}

/* ============================================================
 * Phase 5.2 官网高保真复刻页面源码（注入 bundle 的单一权威来源）。
 * 结构：紧凑矩阵（一级分区左侧窄列 + 右侧行）；复杂筛选项 = 28px 触发器 +
 * 贴近触发器的 Popover；选中红色小面积；禁用低透明度；未实证字段由
 * window.__pgyKolUnproven（Schema 单一来源）驱动【待实证】标注。
 * 注意：本文件会被原样注入浏览器 bundle，必须以 pgyKolDevEnabled 开头
 * （bundle 内容守卫锚点），禁止反引号与模板插值；末尾不得有换行，
 * 否则注入分隔符会产生双换行破坏内容守卫的幂等哈希。
 * ============================================================ */
