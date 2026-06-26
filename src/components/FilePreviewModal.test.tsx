import { render, screen, waitFor } from "@testing-library/react";
import FilePreviewModal from "./FilePreviewModal";

// antd Modal 渲染到 portal(document.body),需用 document.body.querySelector 而非 container

test("PDF 预览:open=true 显示 iframe 且 src 为传入 url", async () => {
  render(<FilePreviewModal open={true} url="/x" fileName="a.pdf" onClose={() => {}} />);
  await waitFor(() => {
    const iframe = document.body.querySelector("iframe");
    expect(iframe).toBeTruthy();
    expect(iframe?.getAttribute("src")).toBe("/x");
  });
  // 不应有 img
  expect(document.body.querySelector('img[alt="a.pdf"]')).toBeNull();
});

test("docx 回退:open=true 显示回退文案+链接,无 iframe", async () => {
  render(<FilePreviewModal open={true} url="/x" fileName="a.docx" onClose={() => {}} />);
  await waitFor(() => {
    expect(screen.getByText(/暂不支持在线预览/)).toBeInTheDocument();
  });
  const link = screen.getByRole("link", { name: /在新标签页打开/ });
  expect(link).toHaveAttribute("href", "/x");
  expect(document.body.querySelector("iframe")).toBeNull();
});

test("PNG 预览:open=true 显示 img 且 src 为传入 url", async () => {
  render(<FilePreviewModal open={true} url="/x" fileName="a.png" onClose={() => {}} />);
  await waitFor(() => {
    const img = document.body.querySelector('img[alt="a.png"]');
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toBe("/x");
  });
  // 不应有 iframe
  expect(document.body.querySelector("iframe")).toBeNull();
});

test("open=false 时不渲染预览内容(destroyOnHidden)", () => {
  render(<FilePreviewModal open={false} url="/x" fileName="a.pdf" onClose={() => {}} />);
  expect(document.body.querySelector("iframe")).toBeNull();
  expect(screen.queryByText(/暂不支持在线预览/)).not.toBeInTheDocument();
});
