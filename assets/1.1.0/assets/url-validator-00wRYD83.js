import{r as u,j as t,D as V,a3 as q,n as Y,B as W,K as i,T as a,q as P,o as k,l as Z,ab as O,a5 as J}from"./mui-vendor-COdRvU8K.js";import{B as $,I as x}from"./index-B09sHfUO.js";const K="useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";let at=(e=21)=>{let o="",s=crypto.getRandomValues(new Uint8Array(e|=0));for(;e--;)o+=K[s[e]&63];return o};const Q={pgy:{blogger:2.3,notebook:1.5},starmap:{blogger:23},douyin:{blogger:6}},rt=new Set(["fansProvinceChart","fansCityChart","fansAgeChart","fansGenderChart","fansGrowthTrendChart"]);function it(e,o,s){const d=Array.isArray(s)?s:[],r=d.length===0?rt.size:d.filter(n=>rt.has(n)).length,l=d.length===0||d.includes("fansGrowthTrendChart");if(e==="pgy"&&o==="blogger")return 2.3+(r>0?.4:0)+(l?.1:0);return((Q[e]??{})[o])??2}function tt(e){if(e<60)return`${Math.round(e)}秒`;const o=Math.floor(e/60),s=Math.round(e%60);return s===0?`${o}分钟`:`${o}分${s}秒`}function et(){try{const e=localStorage.getItem("taskBallPosition");if(e)return JSON.parse(e)}catch{}return{right:48,bottom:80}}function lt({open:e,onClose:o,onConfirm:s,fileName:d,totalRows:r,validCount:n,invalidUrls:l=[],pluginId:h,taskType:g,extraFields:T,selectedFields:Ct}){var U;const m=u.useRef(null),[X,R]=u.useState(!1),[y,S]=u.useState(null),[b,G]=u.useState(!1),H=it(h,g,Ct),_=n*H,F=tt(_),D=l.length;u.useEffect(()=>()=>{y&&y.remove()},[y]);const M=u.useCallback(()=>{if(!m.current||n===0){n>0&&s();return}const p=m.current.getBoundingClientRect(),w=p.left+p.width/2,N=p.top+p.height/2,A=et(),B=window.innerWidth-A.right-$/2,C=window.innerHeight-A.bottom-$/2,c=document.createElement("div");c.style.cssText=`
      position: fixed;
      left: ${w}px;
      top: ${N}px;
      width: 50px;
      height: 50px;
      z-index: 9999;
      pointer-events: none;
      transform: translate(-50%, -50%) scale(1) rotate(0deg);
      transition: left 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                  top 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                  transform 0.7s cubic-bezier(0.25, 0.46, 0.45, 0.94),
                  opacity 0.7s ease;
    `,c.innerHTML=`
      <svg viewBox="0 0 50 60" style="width: 100%; height: 100%; filter: drop-shadow(0 4px 12px rgba(41, 182, 246, 0.5));">
        <defs>
          <linearGradient id="dropGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#4fc3f7" stop-opacity="0.9"/>
            <stop offset="50%" stop-color="#29b6f6" stop-opacity="0.95"/>
            <stop offset="100%" stop-color="#0288d1" stop-opacity="1"/>
          </linearGradient>
          <linearGradient id="dropHighlight" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="0.8"/>
            <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <!-- 水滴主体 -->
        <path d="M25 5 C25 5 5 30 5 40 C5 50 13 55 25 55 C37 55 45 50 45 40 C45 30 25 5 25 5 Z"
              fill="url(#dropGradient)"/>
        <!-- 高光 -->
        <ellipse cx="18" cy="35" rx="6" ry="8" fill="url(#dropHighlight)"/>
      </svg>
      <div style="
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -30%);
        color: white;
        font-weight: bold;
        font-size: 14px;
        text-shadow: 0 1px 3px rgba(0,0,0,0.3);
      ">${n}</div>
    `,document.body.appendChild(c),S(c),R(!0),o(),requestAnimationFrame(()=>{requestAnimationFrame(()=>{c.style.left=`${B}px`,c.style.top=`${C}px`,c.style.transform="translate(-50%, -50%) scale(0.4) rotate(15deg)"})}),setTimeout(()=>{c.style.transition="all 0.25s cubic-bezier(0.4, 0, 1, 1)",c.style.transform="translate(-50%, -50%) scale(0.1) rotate(30deg)",c.style.opacity="0"},500),setTimeout(()=>{const j=document.createElement("div");j.style.cssText=`
        position: fixed;
        left: ${B}px;
        top: ${C}px;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(79, 195, 247, 0.6) 0%, rgba(41, 182, 246, 0) 70%);
        transform: translate(-50%, -50%) scale(1);
        pointer-events: none;
        z-index: 9998;
        animation: rippleExpand 0.5s ease-out forwards;
      `;const v=document.createElement("style");v.textContent=`
        @keyframes rippleExpand {
          0% { transform: translate(-50%, -50%) scale(1); opacity: 0.8; }
          100% { transform: translate(-50%, -50%) scale(4); opacity: 0; }
        }
      `,document.head.appendChild(v),document.body.appendChild(j),setTimeout(()=>{j.remove(),v.remove()},500)},550),setTimeout(()=>{c.remove(),S(null),R(!1),s()},800)},[o,s,n]);return t.jsxs(V,{open:e&&!X,onClose:o,maxWidth:"xs",fullWidth:!0,PaperProps:{ref:m,sx:{borderRadius:3,overflow:"hidden"}},children:[t.jsx(q,{sx:{pb:1},children:"确认开始采集"}),t.jsx(Y,{children:t.jsxs(W,{sx:{py:1},children:[t.jsxs(i,{direction:"row",alignItems:"center",spacing:1,sx:{mb:2},children:[t.jsx(x,{icon:"solar:file-text-bold-duotone",width:18,color:"var(--mui-palette-text-secondary)"}),t.jsx(a,{variant:"body2",color:"text.secondary",noWrap:!0,sx:{maxWidth:280},children:d})]}),t.jsx(P,{sx:{my:2}}),t.jsxs(i,{spacing:2,children:[t.jsxs(i,{direction:"row",justifyContent:"space-between",alignItems:"center",children:[t.jsxs(i,{direction:"row",alignItems:"center",spacing:1,children:[t.jsx(x,{icon:"solar:document-bold-duotone",width:20,color:"var(--mui-palette-info-main)"}),t.jsx(a,{variant:"body2",color:"text.secondary",children:d&&d.startsWith("手动输入")?"输入总行数":"Excel 总行数"})]}),t.jsxs(a,{variant:"body1",fontWeight:600,children:[r," 行"]})]}),t.jsxs(i,{direction:"row",justifyContent:"space-between",alignItems:"center",children:[t.jsxs(i,{direction:"row",alignItems:"center",spacing:1,children:[t.jsx(x,{icon:"solar:link-round-bold-duotone",width:20,color:"var(--mui-palette-success-main)"}),t.jsx(a,{variant:"body2",color:"text.secondary",children:"有效链接数量"})]}),t.jsxs(a,{variant:"body1",fontWeight:600,color:"success.main",children:[n," 条"]})]}),D>0&&t.jsxs(i,{direction:"row",justifyContent:"space-between",alignItems:"center",children:[t.jsxs(i,{direction:"row",alignItems:"center",spacing:1,children:[t.jsx(x,{icon:"solar:link-broken-bold-duotone",width:20,color:"var(--mui-palette-error-main)"}),t.jsx(a,{variant:"body2",color:"text.secondary",children:"无效链接"})]}),t.jsxs(i,{direction:"row",alignItems:"center",spacing:.5,children:[t.jsxs(a,{variant:"body1",fontWeight:600,color:"error.main",children:[D," 条"]}),t.jsx(k,{size:"small",onClick:()=>G(!b),sx:{minWidth:"auto",p:.5},children:t.jsx(x,{icon:b?"solar:alt-arrow-up-linear":"solar:alt-arrow-down-linear",width:16})})]})]}),t.jsx(Z,{in:b,children:t.jsxs(W,{sx:{maxHeight:150,overflow:"auto",bgcolor:"grey.50",borderRadius:1.5,p:1.5},children:[l.slice(0,10).map((p,w)=>t.jsxs(i,{spacing:.25,sx:{mb:1,"&:last-child":{mb:0}},children:[t.jsx(a,{variant:"caption",color:"text.secondary",noWrap:!0,sx:{maxWidth:"100%",fontFamily:"monospace"},children:p.url.length>50?p.url.substring(0,50)+"...":p.url}),t.jsx(a,{variant:"caption",color:"error.main",children:p.reason})]},w)),l.length>10&&t.jsxs(a,{variant:"caption",color:"text.secondary",children:["... 还有 ",l.length-10," 条无效链接"]})]})}),t.jsxs(i,{direction:"row",justifyContent:"space-between",alignItems:"center",children:[t.jsxs(i,{direction:"row",alignItems:"center",spacing:1,children:[t.jsx(x,{icon:"solar:clock-circle-bold-duotone",width:20,color:"var(--mui-palette-warning-main)"}),t.jsx(a,{variant:"body2",color:"text.secondary",children:"预计采集时间"})]}),t.jsx(a,{variant:"body1",fontWeight:600,color:"warning.main",children:n>0?F:"-"})]})]}),T&&t.jsxs(t.Fragment,{children:[t.jsx(P,{sx:{my:2}}),T]}),n===0&&t.jsx(O,{severity:"error",sx:{mt:2},children:"没有检测到有效链接，请检查 Excel 文件内容是否正确。"})]})}),t.jsxs(J,{sx:{px:3,pb:2.5},children:[t.jsx(k,{onClick:o,color:"inherit",sx:{borderRadius:2},children:"取消"}),t.jsx(k,{variant:"contained",onClick:M,disabled:n===0,startIcon:t.jsx(x,{icon:"solar:play-bold",width:18}),sx:{borderRadius:2,px:3},children:"开始采集"})]})]})}const f={blogger:/(xiaohongshu\.com\/user\/profile\/[a-f0-9]{24}|pgy\.xiaohongshu\.com\/solar\/pre-trade\/blogger-detail\/[a-f0-9]{24}|^[a-f0-9]{24}$)/i,notebook:/xiaohongshu\.com\/(explore|discovery\/item)\/[a-f0-9]{24}/i,shortLink:/xhslink\.com/i},I={blogger:/douyin\.com\/user\/[A-Za-z0-9_-]+/i,shortLink:/v\.douyin\.com/i,starmapBlogger:/xingtu\.cn\/ad\/creator\/author-homepage\/[^/?#]+\/\d{8,30}/i};function E(e){const o=e.match(/https?:\/\/[^\s,;'"<>]+/i);return(o==null?void 0:o[0])??e.trim()}function L(e){return f.blogger.test(e)||f.shortLink.test(e)}function ot(e){return f.notebook.test(e)||f.shortLink.test(e)}function nt(e){return I.blogger.test(e)||I.shortLink.test(e)||I.starmapBlogger.test(e)}function z(e){return/douyin/i.test(e)||/v\.douyin\.com/i.test(e)||/xingtu/i.test(e)}function st(e){return/xiaohongshu/i.test(e)||/xhslink/i.test(e)||/pgy\.xiaohongshu/i.test(e)||/^[a-f0-9]{24}$/i.test(e)}function ct(e,o){const s=[],d=[],r=o==="blogger"?L:ot,n=o==="blogger"?"博主主页链接":"笔记链接";for(const l of e){const h=E(l);if(r(h))s.push(h);else{let g=`不是有效的小红书${n}`;z(h)?g="这是抖音链接，请到星图采集页面使用":!h.includes("xiaohongshu")&&!h.includes("xhslink")&&(g="不是小红书链接"),d.push({url:l,valid:!1,reason:g})}}return{totalRows:e.length,validUrls:s,invalidUrls:d}}function dt(e){const o=[],s=[];for(const d of e){const r=E(d);if(L(r))o.push(r);else{let n="不是有效的小红书主页链接";z(r)?n="这是抖音链接，请到抖音采集页面使用":!r.includes("xiaohongshu")&&!r.includes("xhslink")&&(n="不是小红书链接"),s.push({url:d,valid:!1,reason:n})}}return{totalRows:e.length,validUrls:o,invalidUrls:s}}function pt(e,o){const s=[],d=[];for(const r of e){const n=E(r);if(nt(n))s.push(n);else{let l="不是有效的星图或抖音达人链接";st(n)?l="这是小红书链接，请到蒲公英采集页面使用":/douyin|xingtu/i.test(n)||(l="不是星图或抖音链接"),d.push({url:r,valid:!1,reason:l})}}return{totalRows:e.length,validUrls:s,invalidUrls:d}}export{lt as T,ct as a,dt as b,at as n,pt as v};
