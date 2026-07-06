import { useEffect, useMemo, useState } from "react";
import {
  Table, Button, Input, Space, Tag, Modal, Form, message,
  Select, List, Upload, Progress, Typography, Spin, Dropdown,
} from "antd";
import type { ColumnsType } from "antd/es/table";
import type { MenuProps } from "antd";
import {
  PlusOutlined, UploadOutlined, SendOutlined, DeleteOutlined, InboxOutlined,
  SearchOutlined, MoreOutlined,
} from "@ant-design/icons";
import {
  listTasks, createTask, uploadReport, matchReportType, REPORT_TYPE_NAMES, listReviewers,
  distributeTask, recallTask, deleteTask, getTask, isDeletable,
  type Task, type TaskDetail, type Reviewer,
} from "../../api/tasks";
import { listStandardDocs, type StandardDoc } from "../../api/standardDocs";

const STATUS_TAG: Record<string, { t: string; c: string }> = {
  created: { t: "待分发", c: "default" },
  distributed: { t: "已分发", c: "blue" },
  reviewing: { t: "审查中", c: "gold" },
  done: { t: "已完成", c: "green" },
};

export default function TaskManagePage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reviewers, setReviewers] = useState<Reviewer[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // 创建（含报告）弹窗
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [creating, setCreating] = useState(false);
  const [staged, setStaged] = useState<File[]>([]);
  const [ruleDocs, setRuleDocs] = useState<StandardDoc[]>([]);
  const [selRules, setSelRules] = useState<number[]>([]);

  // 管理报告弹窗（补传/重传）
  const [uploadTaskId, setUploadTaskId] = useState<number | null>(null);
  const [uploadDetail, setUploadDetail] = useState<TaskDetail | null>(null);

  // 分发弹窗
  const [distTask, setDistTask] = useState<Task | null>(null);
  const [distReviewer, setDistReviewer] = useState<number | undefined>();
  const [distributing, setDistributing] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [t, r, rd] = await Promise.all([listTasks(), listReviewers(), listStandardDocs()]);
      setTasks(t);
      setReviewers(r);
      setRuleDocs(rd);
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter(
      (t) => t.task_no.toLowerCase().includes(q) || t.task_name.toLowerCase().includes(q),
    );
  }, [tasks, search]);

  // ---- 创建任务（必须带报告，不能建空任务）----
  function openCreate() {
    setStaged([]);
    setSelRules([]);
    createForm.resetFields();
    setCreateOpen(true);
  }
  async function onCreate(v: { task_name: string; task_no?: string }) {
    if (staged.length === 0) {
      message.error("请至少上传一份报告，不能创建空任务");
      return;
    }
    if (selRules.length === 0) {
      message.error("请从规则库选择至少一条审核规则");
      return;
    }
    const typed = staged.map((f) => ({ f, type: matchReportType(f.name) }));
    const bad = typed.filter((t) => !t.type);
    if (bad.length) {
      message.error(`以下文件名无法识别报告类型：${bad.map((b) => b.f.name).join("、")}`);
      return;
    }
    setCreating(true);
    try {
      const task = await createTask(v.task_name.trim(), v.task_no?.trim() || undefined, selRules);
      for (const { f, type } of typed) {
        await uploadReport(task.id, type as string, f);
      }
      message.success("任务已创建并上传报告");
      setCreateOpen(false);
      setStaged([]);
      setSelRules([]);
      createForm.resetFields();
      load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  // ---- 管理报告（补传/重传）----
  async function openUpload(id: number) {
    setUploadTaskId(id);
    setUploadDetail(null);
    try {
      setUploadDetail(await getTask(id));
    } catch (e) {
      message.error(e instanceof Error ? e.message : "加载失败");
    }
  }
  async function refreshUpload() {
    if (uploadTaskId == null) return;
    setUploadDetail(await getTask(uploadTaskId));
    load();
  }

  // ---- 分发 ----
  function openDistribute(t: Task) {
    setDistTask(t);
    setDistReviewer(t.assignee_id ?? undefined);
  }
  async function onDistribute() {
    if (!distTask || !distReviewer) {
      message.warning("请选择评审专家");
      return;
    }
    setDistributing(true);
    try {
      await distributeTask(distTask.id, distReviewer);
      message.success("分发成功");
      setDistTask(null);
      load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "分发失败");
    } finally {
      setDistributing(false);
    }
  }

  async function onRecall(id: number) {
    try {
      await recallTask(id);
      message.success("已撤回");
      load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "撤回失败");
    }
  }
  async function onDelete(id: number) {
    try {
      await deleteTask(id);
      message.success("已删除");
      load();
    } catch (e) {
      message.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  // ---- 操作列「更多」菜单 ----
  function moreItems(t: Task): MenuProps["items"] {
    const items: MenuProps["items"] = [
      { key: "upload", label: "管理报告", icon: <UploadOutlined /> },
    ];
    if (t.status === "distributed") items.push({ key: "recall", label: "撤回", danger: true });
    items.push({
      key: "delete",
      label: "删除",
      icon: <DeleteOutlined />,
      danger: true,
      disabled: !isDeletable(t.status),
    });
    return items;
  }
  function onMore(t: Task, key: string) {
    if (key === "upload") openUpload(t.id);
    else if (key === "recall")
      Modal.confirm({
        title: "撤回该任务？",
        content: "撤回后回到待分发，可重新分发或删除。",
        okText: "撤回",
        okButtonProps: { danger: true },
        onOk: () => onRecall(t.id),
      });
    else if (key === "delete")
      Modal.confirm({
        title: "确认删除该任务？",
        content: "将删除其报告文件；若已分发，评审专家侧任务也会一并移除。",
        okText: "删除",
        okButtonProps: { danger: true },
        onOk: () => onDelete(t.id),
      });
  }

  const cols: ColumnsType<Task> = [
    { title: "编号", dataIndex: "task_no", width: 110 },
    { title: "任务名称", dataIndex: "task_name" },
    {
      title: "报告",
      width: 140,
      render: (_, t) => (
        <Progress
          percent={Math.round((t.report_uploaded / t.report_total) * 100)}
          size="small"
          format={() => `${t.report_uploaded}/${t.report_total}`}
          style={{ width: 120 }}
        />
      ),
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 90,
      render: (s: string) => {
        const m = STATUS_TAG[s] ?? { t: s, c: "default" };
        return <Tag color={m.c}>{m.t}</Tag>;
      },
    },
    { title: "受理人", dataIndex: "assignee_name", width: 110, render: (n: string | null) => n || "—" },
    {
      title: "操作",
      width: 170,
      render: (_, t) => (
        <Space>
          <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => openDistribute(t)}>
            {t.assignee_id ? "改派" : "分发"}
          </Button>
          <Dropdown menu={{ items: moreItems(t), onClick: ({ key }) => onMore(t, key) }} trigger={["click"]}>
            <Button size="small" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          任务管理
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          创建任务
        </Button>
      </div>
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder="搜索任务编号或名称"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        style={{ width: 320, marginBottom: 16 }}
      />
      <Table rowKey="id" loading={loading} columns={cols} dataSource={filtered} />

      {/* 创建任务（含报告）弹窗 */}
      <Modal
        title="创建任务"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={creating}
        okText="创建"
        width={640}
      >
        <Form form={createForm} layout="vertical" onFinish={onCreate}>
          <Form.Item name="task_name" label="任务名称" rules={[{ required: true, message: "请输入任务名称" }]}>
            <Input placeholder="如：某型装备立项论证" />
          </Form.Item>
          <Form.Item name="task_no" label="任务编号（可选，留空自动生成）">
            <Input placeholder="留空自动生成 RTxxxxx" />
          </Form.Item>
          <Form.Item label="审核规则（从规则库选择，必选）" required>
            <Select
              mode="multiple"
              placeholder="选择用于审核本任务的规则"
              value={selRules}
              onChange={setSelRules}
              showSearch
              optionFilterProp="label"
              options={ruleDocs.map((d) => ({ value: d.id, label: d.title }))}
              notFoundContent="规则库暂无规则，请先到「规则库」上传"
            />
          </Form.Item>
          <Form.Item label="上传报告（必填，不能创建空任务）" required>
            <Upload.Dragger
              multiple
              showUploadList={false}
              beforeUpload={(file) => {
                setStaged((prev) => [...prev, file]);
                return false; // 暂存，创建时再上传
              }}
            >
              <p className="ant-upload-drag-icon">
                <InboxOutlined />
              </p>
              <p className="ant-upload-text">拖入 1+4 份报告，按文件名自动归类</p>
              <p className="ant-upload-hint">文件名需含：综合论证 / 经济性 / 技术体质 / 体系贡献率 / 通用质量特性</p>
            </Upload.Dragger>
            {staged.length > 0 && (
              <List
                size="small"
                style={{ marginTop: 12 }}
                dataSource={staged}
                renderItem={(f, i) => {
                  const type = matchReportType(f.name);
                  return (
                    <List.Item
                      actions={[
                        <a key="rm" onClick={() => setStaged((prev) => prev.filter((_, idx) => idx !== i))}>
                          移除
                        </a>,
                      ]}
                    >
                      <Space>
                        {f.name}
                        {type ? (
                          <Tag color="green">{REPORT_TYPE_NAMES[type]}</Tag>
                        ) : (
                          <Tag color="red">无法识别</Tag>
                        )}
                      </Space>
                    </List.Item>
                  );
                }}
              />
            )}
          </Form.Item>
        </Form>
      </Modal>

      {/* 管理报告弹窗 */}
      <Modal
        title={uploadDetail ? `管理报告 · ${uploadDetail.task_no} ${uploadDetail.task_name}` : "管理报告"}
        open={uploadTaskId != null}
        onCancel={() => {
          setUploadTaskId(null);
          setUploadDetail(null);
        }}
        footer={null}
        width={640}
      >
        {!uploadDetail ? (
          <div style={{ textAlign: "center", padding: 32 }}>
            <Spin />
          </div>
        ) : (
          <List
            dataSource={uploadDetail.reports}
            renderItem={(r) => (
              <List.Item
                actions={[
                  <Upload
                    key="u"
                    showUploadList={false}
                    customRequest={async ({ file, onSuccess, onError }) => {
                      try {
                        await uploadReport(uploadDetail.id, r.report_type, file as File);
                        message.success(`已上传：${r.report_name}`);
                        onSuccess?.({});
                        refreshUpload();
                      } catch (e) {
                        message.error(e instanceof Error ? e.message : "上传失败");
                        onError?.(e as Error);
                      }
                    }}
                  >
                    <Button size="small" icon={<UploadOutlined />}>
                      {r.uploaded ? "重新上传" : "上传"}
                    </Button>
                  </Upload>,
                ]}
              >
                <List.Item.Meta
                  title={
                    <Space>
                      {r.report_name}
                      {r.uploaded ? <Tag color="green">已上传</Tag> : <Tag>未上传</Tag>}
                    </Space>
                  }
                  description={r.file_name || "尚未上传文件"}
                />
              </List.Item>
            )}
          />
        )}
      </Modal>

      {/* 分发弹窗 */}
      <Modal
        title={`分发任务 · ${distTask?.task_no ?? ""}`}
        open={!!distTask}
        onCancel={() => setDistTask(null)}
        onOk={onDistribute}
        confirmLoading={distributing}
        okText="确认分发"
      >
        <p style={{ marginTop: 0 }}>请选择评审专家：</p>
        <Select
          style={{ width: "100%" }}
          placeholder="选择评审专家"
          value={distReviewer}
          onChange={setDistReviewer}
          showSearch
          optionFilterProp="label"
          options={reviewers.map((r) => ({ value: r.id, label: r.display_name || r.username }))}
        />
      </Modal>
    </div>
  );
}
