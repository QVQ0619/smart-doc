import { useEffect, useState } from "react";
import { Button, Checkbox, Modal, Spin } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { listStandardDocs } from "../../api/standardDocs";
import { bindRuleDocs } from "../../api/batches";

interface Props {
  open: boolean;
  onClose: () => void;
  batchId: number;
  boundDocIds: number[];
}

export default function BindRuleDocsModal({ open, onClose, batchId, boundDocIds }: Props) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<number[]>(boundDocIds);

  // 每次弹窗打开时重置为当前已绑定集合
  useEffect(() => {
    if (open) setSelected([...boundDocIds]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data: docs, isLoading } = useQuery({
    queryKey: ["standard-docs"],
    queryFn: listStandardDocs,
  });

  const mut = useMutation({
    mutationFn: (ids: number[]) => bindRuleDocs(batchId, ids),
    onSuccess: () => {
      toast.success("绑定成功");
      qc.invalidateQueries({ queryKey: ["batch-detail", batchId] });
      qc.invalidateQueries({ queryKey: ["batches"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  return (
    <Modal
      title="绑定规则集"
      open={open}
      onCancel={onClose}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={onClose}>
          取消
        </Button>,
        <Button
          key="save"
          type="primary"
          loading={mut.isPending}
          onClick={() => mut.mutate(selected)}
        >
          保存
        </Button>,
      ]}
    >
      <p style={{ marginBottom: 12, color: "#595959" }}>
        一个批次可绑多份规则文件，规则库 = 并集
      </p>
      {isLoading ? (
        <Spin />
      ) : (
        <Checkbox.Group
          value={selected}
          onChange={(vals) => setSelected(vals as number[])}
          style={{ display: "flex", flexDirection: "column", gap: 8 }}
        >
          {(docs ?? []).map((doc) => (
            <Checkbox key={doc.id} value={doc.id}>
              {doc.title}
            </Checkbox>
          ))}
        </Checkbox.Group>
      )}
    </Modal>
  );
}
