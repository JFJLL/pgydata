// magiorix 蒲公英确定性分页规划器（第一阶段）
//
// 职责：在“触顶后完整性处理必须是确定性规则、禁止模型参与”的前提下，
// 提供互斥切分、维度准入校验、页序列重复信号与覆盖率报告的纯确定性计算。
//
// 互斥切分只允许已证明安全的维度：整数粉丝数区间 [L,U] → [L,M] / [M+1,U]，
// M = Math.floor((L+U)/2)，保证无重叠、无空隙、边界值只进一个子区间。
// 多值字段、报价字段（lossy）、未证明覆盖的枚举（如 gender）一律禁止用于完整性切分。
//
// 本模块不含模型调用、不含随机逻辑、不使用“固定 200 条窗口”作为规则。

export class PgyPaginationPlanner {
  constructor({ schema }) {
    if (!schema || typeof schema.getField !== "function") {
      throw new TypeError("PgyPaginationPlanner 需要 schema.getField(payloadField)");
    }
    this._schema = schema;
  }

  splitIntegerRange({ lower, upper }) {
    if (!Number.isInteger(lower) || !Number.isInteger(upper)) {
      throw new TypeError("splitIntegerRange 的 lower/upper 必须是整数");
    }
    if (lower >= upper) {
      return { canSplit: false, subRanges: [], reason: "range-too-small" };
    }
    const mid = Math.floor((lower + upper) / 2);
    // lower < upper 时恒有 mid < upper，两个子区间都非空、无重叠、无空隙。
    return { canSplit: true, subRanges: [[lower, mid], [mid + 1, upper]] };
  }

  planSplit({ filterState } = {}) {
    const state = filterState !== null && typeof filterState === "object" ? filterState : {};
    const lower = state.fansNumberLower;
    const upper = state.fansNumberUpper;
    // 与 payload builder 口径一致：空串/纯空白视为“未提供”。
    const isBlank = (value) => typeof value === "string" && value.trim() === "";
    const hasLower = lower !== undefined && lower !== null && !isBlank(lower);
    const hasUpper = upper !== undefined && upper !== null && !isBlank(upper);

    if (hasLower && hasUpper) {
      const toFiniteInt = (value) => {
        if (typeof value === "boolean") {
          return NaN;
        }
        if (typeof value === "string" && value.trim() === "") {
          return NaN;
        }
        if (typeof value === "string" && !/^-?\d+$/.test(value.trim())) {
          return NaN;
        }
        const num = Number(value);
        return Number.isInteger(num) ? num : NaN;
      };
      const lowerNum = toFiniteInt(lower);
      const upperNum = toFiniteInt(upper);
      if (!Number.isInteger(lowerNum) || !Number.isInteger(upperNum)) {
        return { canSplit: false, dimension: "fansNumber", subRanges: [], reason: "invalid-range" };
      }
      if (lowerNum >= upperNum) {
        return { canSplit: false, dimension: "fansNumber", subRanges: [], reason: "range-too-small" };
      }
      return {
        canSplit: true,
        dimension: "fansNumber",
        subRanges: this.splitIntegerRange({ lower: lowerNum, upper: upperNum }).subRanges,
      };
    }

    if (hasLower !== hasUpper) {
      return { canSplit: false, dimension: null, subRanges: [], reason: "unbounded-range" };
    }

    return {
      canSplit: false,
      dimension: null,
      subRanges: [],
      reason: "no-safe-dimension",
      note: "Phase 1 暂无已证明覆盖完整性的互斥维度（多值/报价/lossy 与未证明枚举均不可用于完整性切分）",
    };
  }

  validateSplitDimension(payloadField) {
    const field = this._schema.getField(payloadField);
    if (field === undefined || field === null) {
      return { allowed: false, reason: "unknown-field" };
    }
    if (field.exclusive === true) {
      return { allowed: true, reason: "exclusive" };
    }
    if (field.exclusive === false) {
      if (field.reason === "lossy") {
        return { allowed: false, reason: "lossy" };
      }
      return { allowed: false, reason: "multi-value" };
    }
    if (field.exclusive === "unproven") {
      return { allowed: false, reason: "unproven-coverage" };
    }
    // 注册表存在但未声明互斥属性：视为覆盖未证明，禁止用于完整性切分。
    return { allowed: false, reason: "unproven-coverage" };
  }

  analyzePageSequence({ pages, repeatThresholdPages = 2 } = {}) {
    const threshold =
      Number.isInteger(repeatThresholdPages) && repeatThresholdPages >= 1 ? repeatThresholdPages : 2;
    const sequence = Array.isArray(pages) ? pages : [];
    const repeatAtPages = [];
    let zeroRun = [];
    for (const page of sequence) {
      if (page !== null && typeof page === "object" && page.newUidCount === 0) {
        zeroRun.push(page.pageNum);
      } else {
        if (zeroRun.length >= threshold) {
          repeatAtPages.push(...zeroRun);
        }
        zeroRun = [];
      }
    }
    if (zeroRun.length >= threshold) {
      repeatAtPages.push(...zeroRun);
    }
    return {
      repeatSignal: repeatAtPages.length > 0,
      repeatAtPages,
      note: "连续重复页判定基于 newUidCount===0 的连续页数；不以固定 200 条作为触顶规则。",
    };
  }

  buildCoverageReport({ leaves, mergedDupCount = 0, failureCount = 0 } = {}) {
    const leafList = Array.isArray(leaves) ? leaves : [];
    let uniqueUidCount = 0;
    const cappedLeaves = [];
    const splitDimensions = new Set();
    for (const leaf of leafList) {
      if (leaf !== null && typeof leaf === "object") {
        if (Number.isFinite(leaf.uniqueUidCount)) {
          uniqueUidCount += leaf.uniqueUidCount;
        }
        if (leaf.capped === true) {
          cappedLeaves.push(leaf);
        }
        if (leaf.splitDimension !== undefined && leaf.splitDimension !== null) {
          splitDimensions.add(leaf.splitDimension);
        }
      }
    }
    const splitDimension = splitDimensions.size === 1 ? Array.from(splitDimensions)[0] : null;
    // 存在 capped 叶子即意味着当前结果集触碰窗口上限，完整性在切分完成前一律视为无法证明。
    const completeness =
      leafList.length === 0
        ? "not-started"
        : cappedLeaves.length > 0 || failureCount > 0
          ? "cannot-prove"
          : "complete";
    const warnings = [];
    if (cappedLeaves.length > 0) {
      warnings.push("当前接口下无法证明完整：存在 capped 叶子，且触顶不等于总数恰好 5000");
    }
    if (failureCount > 0) {
      warnings.push(`存在 ${failureCount} 个失败子查询，结果集不完整`);
    }
    return {
      uniqueUidCount,
      subqueryCount: leafList.length,
      mergedDupCount,
      failureCount,
      cappedLeaves,
      splitDimension,
      completeness,
      warnings,
    };
  }
}
