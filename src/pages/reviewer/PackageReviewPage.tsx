import { useEffect, useState } from "react";
import { Select, Typography, Space, Empty, Button, message } from "antd";
import { listMaterialPackages, type MaterialPackage } from "../../api/materials";
import ReviewWorkbench from "../../components/review/ReviewWorkbench";
import { useRouteStore } from "../../store/useRouteStore";

// 审查报告界面：复用申报包子系统的 ReviewWorkbench（结论 + 逐条发现/依据 + 导出报告）。
// A 方案：顶部申报包下拉，选中即展示该包的审查报告；供任务报告页「查看审查报告」跳转过来。
export default function PackageReviewPage({ packageId }: { packageId?: number }) {
  const navigate = useRouteStore((s) => s.navigate);
  const [packages, setPackages] = useState<MaterialPackage[]>([]);
  const [selected, setSelected] = useState<number | undefined>(packageId);

  useEffect(() => {
    listMaterialPackages()
      .then((ps) => {
        setPackages(ps);
        setSelected((cur) => cur ?? ps[0]?.package_id);
      })
      .catch((e) => message.error(e instanceof Error ? e.message : "加载申报包失败"));
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <Button type="link" style={{ paddingLeft: 0 }} onClick={() => navigate({ name: "report-gen" })}>
        ← 返回审查报告生成
      </Button>
      <Typography.Title level={4} style={{ marginTop: 8 }}>
        审查报告
      </Typography.Title>
      <Space style={{ marginBottom: 16 }}>
        <span>选择申报包：</span>
        <Select
          style={{ width: 320 }}
          placeholder="选择申报包"
          value={selected}
          onChange={setSelected}
          options={packages.map((p) => ({
            value: p.package_id,
            label: `申报包 #${p.package_id}（${p.file_count} 个文件）`,
          }))}
        />
      </Space>
      {selected == null ? (
        <Empty description="暂无申报包" />
      ) : (
        <ReviewWorkbench packageId={selected} />
      )}
    </div>
  );
}
