import { Typography, Steps, Divider, Tag } from "antd";
import PageScaffold from "../../components/PageScaffold";

const { Paragraph, Text } = Typography;

export default function AboutPage() {
  return (
    <PageScaffold title="关于流程" subtitle="装备研制立项 AI 辅助审查评估 —— 全流程说明">
      <div style={{ maxWidth: 820 }}>
        <Paragraph type="secondary">
          本系统围绕「管理员布置任务 → 评审专家审查 → 报告会签归档」的闭环组织，覆盖立项论证审查的完整过程。
        </Paragraph>

        <Divider orientation="left">
          <Tag color="blue">管理员</Tag> 任务布置与监管
        </Divider>
        <Steps
          direction="vertical"
          size="small"
          current={-1}
          items={[
            { title: "任务创建", description: "建立一个立项论证审查任务，自动生成任务编号。" },
            {
              title: "报告上传（1+4）",
              description:
                "为任务上传 5 份报告：综合论证报告 + 经济性 / 技术体质 / 体系贡献率 / 通用质量特性 四项专项报告。文件名需含对应关键词，可批量拖入自动归类。",
            },
            {
              title: "受理分发",
              description: "把任务分发给评审专家（分发即受理）。专家尚未开始时可撤回、改派；未分发或已完成的任务可删除。",
            },
            { title: "审查台账", description: "总览全部任务的状态、分发受理人与报告进度。" },
          ]}
        />

        <Divider orientation="left">
          <Tag color="green">评审专家</Tag>（管理员亦可审查未分发项目）审查与出具报告
        </Divider>
        <Steps
          direction="vertical"
          size="small"
          current={-1}
          items={[
            {
              title: "立项论证审查",
              description:
                "对分发到的项目逐项审查：综合论证报告审查、经济性审查、技术体质审查、体系贡献率审查、通用质量特性审查，并可查看原始报告。",
            },
            { title: "指标专项检验", description: "对项目关键指标进行专项检验。" },
            { title: "审查意见研判", description: "汇总并研判各审查项的意见。" },
            {
              title: "审查报告生成",
              description: "每个审查项：报告生成 → 会签；待整个任务全部审查完成后，统一终签归档。",
            },
          ]}
        />

        <Divider />
        <Paragraph type="secondary" style={{ fontSize: 13 }}>
          <Text strong>审查权约定：</Text>
          同一项目同一时刻只有一个人拥有审查权——未分发的由管理员审查，已分发的由该评审专家审查；管理员对已分发项目仅可查看，如需自行审查请先撤回。
        </Paragraph>
      </div>
    </PageScaffold>
  );
}
