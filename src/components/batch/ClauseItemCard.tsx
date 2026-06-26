import { useState } from "react";
import { Button, Form, Input, Modal, Popconfirm } from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { updateClause, deleteClause, type Clause } from "../../api/standardDocs";

export function clauseProvenance(c: Clause): string {
  const loc = c.locator ?? {};
  const raw = loc["block_index"] ?? loc["para_index"];
  const segPart = typeof raw === "number" ? `第${raw + 1}段` : "";
  if (c.page_no != null) return `第${c.page_no}页${segPart}`;
  return segPart || "—";
}

interface Props {
  clause: Clause;
  docId: number;
}

export default function ClauseItemCard({ clause, docId }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form] = Form.useForm();

  const updateMut = useMutation({
    mutationFn: (v: { clause_no: string; clause_text: string | null }) =>
      updateClause(docId, clause.id, v),
    onSuccess: () => {
      toast.success("已保存");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["clauses", docId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteClause(docId, clause.id),
    onSuccess: () => {
      toast.success("已删除");
      qc.invalidateQueries({ queryKey: ["clauses", docId] });
      qc.invalidateQueries({ queryKey: ["rules", docId] }); // 条款删除可能连带删规则
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  function openEdit() {
    setEditing(true);
    form.setFieldsValue({
      clause_no: clause.clause_no,
      clause_text: clause.clause_text ?? "",
    });
  }

  return (
    <>
      <div
        style={{
          background: "#fff",
          border: "1px solid #f0f0f0",
          borderRadius: 10,
          padding: "14px 18px",
          marginBottom: 10,
          boxShadow: "0 1px 4px rgba(0,0,0,.06)",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600 }}>{clause.clause_no}</div>
        {clause.clause_text && (
          <div style={{ color: "#595959", fontSize: 13.5, marginTop: 8, lineHeight: 1.6 }}>
            {clause.clause_text}
          </div>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 10,
          }}
        >
          <div style={{ color: "#8c8c8c", fontSize: 12.5 }}>
            📍 出处：{clauseProvenance(clause)}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            <Button type="link" size="small" onClick={openEdit}>
              编辑
            </Button>
            <Popconfirm
              title="确认删除该条款?"
              okText="确定"
              cancelText="取消"
              onConfirm={() => deleteMut.mutate()}
            >
              <Button type="link" size="small" danger>
                删除
              </Button>
            </Popconfirm>
          </div>
        </div>
      </div>

      <Modal
        title="编辑条款"
        open={editing}
        okText="保存"
        cancelText="取消"
        confirmLoading={updateMut.isPending}
        onOk={() => form.submit()}
        onCancel={() => setEditing(false)}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={(v) =>
            updateMut.mutate({
              clause_no: v.clause_no,
              clause_text: v.clause_text || null,
            })
          }
        >
          <Form.Item
            name="clause_no"
            label="条号"
            rules={[{ required: true, message: "条号必填" }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="clause_text" label="条文">
            <Input.TextArea rows={4} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
