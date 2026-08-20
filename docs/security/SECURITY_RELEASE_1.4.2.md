# SECURITY RELEASE 1.4.2

| 项目 | 状态 | 证据或说明 |
|---|---|---|
| 1. 目标版本 | 已锁定 | `1.4.2` |
| 2. 工作树 | 已隔离 | `pgydata-security-1.4.2` |
| 3. 分支 | 已隔离 | `codex/security-hardening-1.4.2` |
| 4. 推送策略 | 禁止 | 公共仓库仅本地提交 |
| 5. 发布状态文件 | 未修改 | 未改 `latest.json` |
| 6. 已发布产物 | 未修改 | 未重建 1.4.1 |
| 7. Electron Fuses | 已验证 | 安全回归测试通过 |
| 8. ASAR 完整性 | 已验证 | 块级 SHA-256 元数据测试通过 |
| 9. IPC 门禁 | 保持 | 既有 sender 验证注入保持 |
| 10. Ticket 算法 | 已对齐 | Ed25519、canonical JSON、hex 签名 |
| 11. Ticket 绑定 | 已实施 | 用户、设备、任务摘要、数量、版本 |
| 12. Ticket 重放 | 已实施 | native core 会话内 jti 拒绝 |
| 13. 策略算法 | 已实施 | RFC 9180 HPKE X25519/HKDF-SHA256/AES-256-GCM |
| 14. 策略签名 | 已实施 | 独立 Ed25519 policy key id |
| 15. 策略绑定 | 已实施 | 授权、Ticket、设备、摘要、版本、release key id |
| 16. 策略时效 | 已实施 | RFC3339 issued/expires 验证 |
| 17. 策略内存边界 | 已实施 | 解密后解析并 zeroize，仅返回派生决策 |
| 18. 设备加密身份 | 已实施 | X25519 私钥 DPAPI CurrentUser 保护 |
| 19. required Ticket | 已实施 | native `ticket.verify` 成功后才继续 |
| 20. required 策略 | 已实施 | native `strategy.decrypt` 成功后才 start |
| 21. 失败关闭 | 已验证 | 策略失败取消待启动授权 |
| 22. JS 回退 | 禁止 | required 路径跳过 JS Ticket 信任 |
| 23. 核心哈希 | 已验证 | 侧车文件 SHA-256 单测通过 |
| 24. 生产构建门禁 | 已验证 | off/shadow 直接失败 |
| 25. 公钥隔离 | 已要求 | Ticket 与 policy 两个独立公开信任根 |
| 26. 秘密管理 | 未发现提交 | 不提交私钥、PFX、Token、`.env` |
| 27. Candidate 结论 | 有条件通过 | 需受控环境提供两个公开密钥 JSON、签名、Windows 构建和安装包验收 |

> 本地代码验证完成不等同于正式发布授权。不得创建 GitHub Release、修改 `latest.json` 或推广正式版本。
