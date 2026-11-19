import { PropertyForm } from "@/components/property-form";
import { createPropertyAction } from "../actions";

export default function NewPropertyPage() {
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Thêm căn mới</h1>
      <PropertyForm action={createPropertyAction} submitLabel="Tạo căn" />
    </div>
  );
}
