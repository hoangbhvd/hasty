"use client";

import dynamic from "next/dynamic";

// GrapesJS chỉ chạy trên trình duyệt; tách riêng để không nặng các trang khác.
const TemplateEditor = dynamic(() => import("@/components/TemplateEditor"), {
  ssr: false,
  loading: () => <p className="text-sm text-slate-500">Đang tải trình soạn thảo...</p>,
});

export default TemplateEditor;
