import { Form, Input, Modal } from "antd";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { createBatch, type BatchCreate } from "../../api/batches";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function CreateBatchModal({ open, onClose }: Props) {
  const [form] = Form.useForm();
  const qc = useQueryClient();

  const mut = useMutation({
    mutationFn: (body: BatchCreate) => createBatch(body),
    onSuccess: () => {
      toast.success("批次已创建");
      qc.invalidateQueries({ queryKey: ["batches"] });
      onClose();
      form.resetFields();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  function handleOk() {
    form.submit();
  }

  function handleCancel() {
    form.resetFields();
    onClose();
  }

  return (
    <Modal
      title="新建批次"
      open={open}
      okText="创建"
      cancelText="取消"
      confirmLoading={mut.isPending}
      onOk={handleOk}
      onCancel={handleCancel}
      destroyOnHidden
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(v) =>
          mut.mutate({
            batch_no: v.batch_no as string,
            declare_period: (v.declare_period as string) || null,
          })
        }
      >
        <Form.Item
          name="batch_no"
          label="批次号"
          rules={[{ required: true, message: "批次号必填" }]}
        >
          <Input placeholder="如 B-2026-01" />
        </Form.Item>
        <Form.Item name="declare_period" label="申报期">
          <Input placeholder="2026.03 – 2026.05" />
        </Form.Item>
      </Form>
    </Modal>
  );
}
